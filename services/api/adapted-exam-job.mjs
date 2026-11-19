import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.mjs';
import { storeRenderArtifact } from './render-artifact-storage.mjs';
import { reescreverQuestoesComIA } from './adapted-exam-ai.mjs';
import { montarPdfsAdaptados } from './adapted-exam-pdf.mjs';
import {
  montarSnapshotAdaptado,
  questoesParaReescrita,
  validarQuestoesReescritas,
} from '../../lib/prova-adaptada.mjs';

const RENDER_OUTPUT_DIR = process.env.RENDER_OUTPUT_DIR || 'outputs/renders';

const textoDoEnunciado = (nos = []) =>
  nos
    .filter((no) => no.type === 'paragraph')
    .map((no) => no.text)
    .join(' ');

const textoDaAlternativa = (nos = []) =>
  nos.map((no) => no.text ?? '').join(' ');

/**
 * Gera a prova adaptada e o gabarito de um render job `ia-adaptada`.
 * Estados: queued -> running -> completed | failed. Nada é gravado parcialmente:
 * o snapshot e os PDFs só são salvos depois que a IA e a validação passam.
 */
export async function executarProvaAdaptada(
  jobId,
  { fetchImpl = fetch, env = process.env, outputRoot = RENDER_OUTPUT_DIR } = {},
) {
  const claimed = await pool.query(
    `UPDATE render_jobs SET status='running', error_message=NULL
     WHERE id=$1 AND status='queued' AND renderer='ia-adaptada'
     RETURNING assessment_version_id`,
    [jobId],
  );
  if (!claimed.rowCount) return { status: 'skipped' };
  const versionId = claimed.rows[0].assessment_version_id;

  try {
    const version = await pool.query(
      'SELECT snapshot, seed FROM assessment_versions WHERE id=$1',
      [versionId],
    );
    const base = version.rows[0].snapshot;
    const originais = questoesParaReescrita(base);
    if (!originais.length)
      throw new Error(
        'Nenhuma questão atende ao perfil simples da prova adaptada.',
      );

    const ia = await reescreverQuestoesComIA({
      questions: originais.map((questao) => ({
        sourceNumber: questao.number,
        statement: textoDoEnunciado(questao.statement),
        alternatives: questao.alternatives.map((alt) =>
          textoDaAlternativa(alt.content),
        ),
      })),
      fetchImpl,
      env,
    });
    const { validas, descartadas } = validarQuestoesReescritas(
      { questions: ia.questions },
      originais,
    );
    if (!validas.length)
      throw new Error(
        'A IA não devolveu nenhuma questão válida para a prova adaptada.',
      );

    const snapshot = montarSnapshotAdaptado(base, validas, originais);
    const finalSnapshot = {
      ...snapshot,
      version: { ...base.version, id: versionId, code: 'ADAPTADA' },
    };
    const answerKey = finalSnapshot.questions.map((question) => ({
      number: question.number,
      type: question.type,
      correctStableKeys: question.answer.correctStableKeys,
      manualReview: false,
    }));
    const pdfs = await montarPdfsAdaptados(finalSnapshot);

    const diretorio = path.join(outputRoot, jobId);
    await mkdir(diretorio, { recursive: true });
    const gravar = async (nome, conteudo, contentType) => {
      const arquivo = path.join(diretorio, nome);
      await writeFile(arquivo, conteudo);
      return storeRenderArtifact({
        key: `renders/${jobId}/${nome}`,
        file: arquivo,
        contentType,
        legacyRelative: path.join(jobId, nome),
        environment: env,
      });
    };
    const studentPdf = await gravar(
      'prova-adaptada.pdf',
      pdfs.studentPdf,
      'application/pdf',
    );
    const answerKeyPdf = await gravar(
      'gabarito-adaptado.pdf',
      pdfs.answerKeyPdf,
      'application/pdf',
    );

    await pool.query(
      'UPDATE assessment_versions SET snapshot=$2::jsonb, answer_key=$3::jsonb WHERE id=$1',
      [versionId, JSON.stringify(finalSnapshot), JSON.stringify(answerKey)],
    );
    await pool.query(
      `UPDATE render_jobs SET status='completed', completed_at=now(), output_manifest=$2::jsonb
       WHERE id=$1`,
      [
        jobId,
        JSON.stringify({
          studentPdf,
          answerKeyPdf,
          ia: {
            model: ia.model,
            responseId: ia.responseId,
            usage: ia.usage,
            questoesAdaptadas: validas.length,
            descartadas,
          },
        }),
      ],
    );
    return { status: 'completed', questions: validas.length };
  } catch (error) {
    await pool.query(
      `UPDATE render_jobs SET status='failed', completed_at=now(), error_message=$2 WHERE id=$1`,
      [jobId, String(error?.message ?? error).slice(0, 1000)],
    );
    return { status: 'failed', error: error.message };
  }
}

/** Agenda a geração depois da transação da aplicação; falhas ficam no próprio job. */
export function agendarProvaAdaptada(jobId, options) {
  setImmediate(() => {
    executarProvaAdaptada(jobId, options).catch((error) =>
      console.error('Falha ao gerar prova adaptada', jobId, error?.message),
    );
  });
}
