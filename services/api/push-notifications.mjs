import { z } from 'zod';
import { pool } from './db.mjs';
import { errorFields, log } from './observability.mjs';

// Aviso de nota nova no celular do aluno pelo serviço de push do Expo
// (gratuito, sem conta paga). A mensagem leva só o nome da avaliação: a nota
// aparece no aplicativo, depois de entrar, e não na tela bloqueada.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_DEVICES_PER_USER = 10;

const deviceSchema = z
  .object({
    token: z
      .string()
      .max(200)
      .regex(
        /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/,
        'Token de aviso inválido.',
      ),
    platform: z.enum(['ios', 'android']),
  })
  .strict();
const removeSchema = z.object({ token: z.string().max(200) }).strict();

const studentOnly = (identity) => {
  if (identity.role !== 'student')
    throw Object.assign(new Error('Avisos de nota são para contas de aluno.'), {
      statusCode: 403,
    });
};

export async function registerPushDevice(identity, input) {
  studentOnly(identity);
  const { token, platform } = deviceSchema.parse(input);
  await pool.query(
    `INSERT INTO push_devices(token,user_id,platform) VALUES($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,updated_at=now()`,
    [token, identity.userId, platform],
  );
  // Aparelhos trocados deixam tokens antigos; fica só o uso mais recente.
  await pool.query(
    `DELETE FROM push_devices WHERE user_id=$1 AND token NOT IN
       (SELECT token FROM push_devices WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2)`,
    [identity.userId, MAX_DEVICES_PER_USER],
  );
  return { registered: true };
}

export async function removePushDevice(identity, input) {
  const { token } = removeSchema.parse(input);
  await pool.query('DELETE FROM push_devices WHERE token=$1 AND user_id=$2', [
    token,
    identity.userId,
  ]);
  return { removed: true };
}

export async function sendExpoPush(
  messages,
  { fetchImpl = fetch, accessToken = process.env.EXPO_ACCESS_TOKEN } = {},
) {
  const invalid = [];
  for (let start = 0; start < messages.length; start += 100) {
    const chunk = messages.slice(start, start + 100);
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Expo push respondeu ${response.status}`);
    const tickets = (await response.json())?.data ?? [];
    tickets.forEach((ticket, index) => {
      if (
        ticket?.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      )
        invalid.push(chunk[index].to);
    });
  }
  return { invalid };
}

// Avisa os alunos das publicações recém-autorizadas. Cada publicação é
// marcada antes do envio, então uma autorização repetida não avisa de novo.
// Falhas só vão para o log: nunca desfazem a autorização do professor.
export async function notifyPublishedResults(
  resultIds,
  { send = sendExpoPush } = {},
) {
  if (!resultIds.length || process.env.PUSH_NOTIFICATIONS === 'off')
    return { sent: 0 };
  const claimed = (
    await pool.query(
      `UPDATE assessment_result_publications SET notified_at=now()
       WHERE result_id=ANY($1::uuid[]) AND superseded_at IS NULL AND notified_at IS NULL
       RETURNING result_id`,
      [resultIds],
    )
  ).rows.map((row) => row.result_id);
  if (!claimed.length) return { sent: 0 };
  // Mesmas condições de myActivities: só quem vê a nota no aplicativo recebe o aviso.
  const rows = (
    await pool.query(
      `SELECT DISTINCT d.token,ar.id result_id,a.title,a.subject
       FROM assessment_results ar
       JOIN application_students ast ON ast.id=ar.application_student_id
       JOIN assessment_applications aa ON aa.id=ast.application_id AND aa.status!='cancelled'
       JOIN assessments a ON a.id=aa.assessment_id
       JOIN student_account_links l ON l.student_id=ast.student_id AND l.institution_id=aa.institution_id
       JOIN students s ON s.id=l.student_id AND s.active
       JOIN class_join_requests jr ON jr.user_id=l.user_id AND jr.student_id=l.student_id AND jr.status='approved' AND jr.class_id=aa.class_id
       JOIN class_enrollments ce ON ce.student_id=l.student_id AND ce.class_id=aa.class_id
       JOIN push_devices d ON d.user_id=l.user_id
       WHERE ar.id=ANY($1::uuid[])`,
      [claimed],
    )
  ).rows;
  if (!rows.length) return { sent: 0 };
  const messages = rows.map((row) => ({
    to: row.token,
    title: 'Nova nota publicada',
    body: row.subject ? `${row.subject}: ${row.title}` : row.title,
    data: { type: 'result', resultId: row.result_id },
    sound: 'default',
    channelId: 'grades',
  }));
  const { invalid } = await send(messages);
  if (invalid.length)
    await pool.query('DELETE FROM push_devices WHERE token=ANY($1::text[])', [
      invalid,
    ]);
  return { sent: messages.length, removed: invalid.length };
}

export function notifyInBackground(resultIds) {
  notifyPublishedResults(resultIds).catch((error) =>
    log('error', 'push.notify_failed', errorFields(error)),
  );
}
