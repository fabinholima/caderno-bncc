import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.mjs';
import { storeRenderArtifact } from './render-artifact-storage.mjs';
import { reescreverQuestoesComIA } from './adapted-exam-ai.mjs';
import { gerarImagemComGemini } from './adapted-exam-image.mjs';
import { montarPdfsAdaptados } from './adapted-exam-pdf.mjs';
import {
  montarSnapshotAdaptado,
  questoesParaReescrita,
  validarQuestoesReescritas,
} from '../../lib/prova-adaptada.mjs';

export function limiteDeImagens(env = process.env) {
  const valor = Number(env.ADAPTED_EXAM_MAX_IMAGES);
  return Number.isInteger(valor) && valor >= 0 && valor <= 30 ? valor : 5;
}

export function tamanhoDoLote(env = process.env) {
  const valor = Number(env.ADAPTED_EXAM_BATCH_SIZE);
  return Number.isInteger(valor) && valor >= 1 && valor <= 50 ? valor : 10;
}

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
    `UPDATE render_jobs
     SET status='running', error_message=NULL, started_at=now(), attempts=attempts+1
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

    // Lotes pequenos: uma falha de resposta afeta só um lote, e o pedido cabe no tempo limite.
    const tamanhoLote = tamanhoDoLote(env);
    const contexto = {
      serie: base.assessment?.grade ?? '',
      disciplina: base.assessment?.subject ?? '',
    };
    const lotes = [];
    for (let i = 0; i < originais.length; i += tamanhoLote)
      lotes.push(originais.slice(i, i + tamanhoLote));
    const respostas = [];
    const usos = [];
    for (const lote of lotes) {
      const ia = await reescreverQuestoesComIA({
        contexto,
        questions: lote.map((questao) => ({
          sourceNumber: questao.number,
          statement: textoDoEnunciado(questao.statement),
          alternatives: questao.alternatives.map((alt) =>
            textoDaAlternativa(alt.content),
          ),
        })),
        fetchImpl,
        env,
      });
      respostas.push(...ia.questions);
      usos.push({
        responseId: ia.responseId,
        model: ia.model,
        usage: ia.usage,
      });
    }
    const ia = {
      model: usos[0]?.model,
      responseId: usos.map((u) => u.responseId).join(','),
      usage: usos.map((u) => u.usage),
      lotes: lotes.length,
    };
    const { validas, descartadas } = validarQuestoesReescritas(
      { questions: respostas },
      originais,
    );
    if (!validas.length)
      throw new Error(
        'A IA não devolveu nenhuma questão válida para a prova adaptada.',
      );

    // Imagens geradas pela IA: uma por questão que pediu figura, até o limite configurado.
    // Falha de imagem não derruba a prova: a questão sai só com texto e o motivo fica no manifesto.
    const imagens = new Map();
    const imagensFalharam = [];
    const limiteImagens = limiteDeImagens(env);
    for (const item of validas
      .filter((v) => v.imagePrompt)
      .slice(0, limiteImagens)) {
      try {
        const imagem = await gerarImagemComGemini({
          descricao: item.imagePrompt,
          fetchImpl,
          env,
        });
        imagens.set(item.sourceNumber, imagem.dataUrl);
      } catch (error) {
        imagensFalharam.push({
          sourceNumber: item.sourceNumber,
          motivo: error.message,
        });
      }
    }
    const snapshot = montarSnapshotAdaptado(
      base,
      validas,
      originais,
      {},
      imagens,
    );
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
            imagens: { geradas: imagens.size, falharam: imagensFalharam },
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

export const PRAZO_GERACAO_MINUTOS = 15;
export const TENTATIVAS_MAXIMAS = 3;
export const INTERVALO_RECUPERACAO_MS = 5 * 60 * 1000;

/**
 * Recupera jobs `ia-adaptada` interrompidos (reinício do servidor) e reenfileira
 * os que ficaram parados na fila. Um job que já falhou tentativas demais vira
 * `failed` com motivo. As consultas são atômicas: vários servidores não executam
 * o mesmo job duas vezes.
 * @returns {Promise<{reenfileirados: string[], falhados: string[], agendados: string[]}>}
 */
export async function recuperarProvasAdaptadasPendentes({
  db = pool,
  agendar = agendarProvaAdaptada,
  limite = 10,
} = {}) {
  const parados = `renderer='ia-adaptada' AND status='running'
    AND started_at < now() - make_interval(mins => $1)`;
  const reenfileirados = await db.query(
    `UPDATE render_jobs
     SET status='queued', error_message='Reenfileirada após interrupção do servidor.', started_at=NULL
     WHERE ${parados} AND attempts < $2
     RETURNING id`,
    [PRAZO_GERACAO_MINUTOS, TENTATIVAS_MAXIMAS],
  );
  const falhados = await db.query(
    `UPDATE render_jobs
     SET status='failed', completed_at=now(),
         error_message='A geração foi interrompida em todas as tentativas.'
     WHERE ${parados} AND attempts >= $2
     RETURNING id`,
    [PRAZO_GERACAO_MINUTOS, TENTATIVAS_MAXIMAS],
  );
  const filaSemExecucao = await db.query(
    `SELECT id FROM render_jobs
     WHERE renderer='ia-adaptada' AND status='queued'
     ORDER BY created_at LIMIT $1`,
    [limite],
  );
  const agendados = filaSemExecucao.rows.map((row) => row.id);
  for (const id of agendados) agendar(id);
  return {
    reenfileirados: reenfileirados.rows.map((row) => row.id),
    falhados: falhados.rows.map((row) => row.id),
    agendados,
  };
}

/**
 * Liga a recuperação ao boot do servidor e a repete periodicamente.
 * Retorna uma função que cancela o intervalo.
 */
export function iniciarRecuperacaoProvasAdaptadas(options = {}) {
  const executar = () =>
    recuperarProvasAdaptadasPendentes(options).catch((error) =>
      console.error('Falha ao recuperar provas adaptadas', error?.message),
    );
  void executar();
  const temporizador = setInterval(executar, INTERVALO_RECUPERACAO_MS);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
