import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRAZO_GERACAO_MINUTOS,
  TENTATIVAS_MAXIMAS,
  recuperarProvasAdaptadasPendentes,
} from './adapted-exam-job.mjs';

// Banco falso: devolve as linhas conforme a consulta feita.
function fakeDb({ reenfileirados = [], falhados = [], fila = [] } = {}) {
  const chamadas = [];
  return {
    chamadas,
    async query(text, values = []) {
      chamadas.push({ text, values });
      if (text.startsWith('UPDATE') && text.includes("status='queued'"))
        return { rows: reenfileirados.map((id) => ({ id })) };
      if (text.startsWith('UPDATE') && text.includes("status='failed'"))
        return { rows: falhados.map((id) => ({ id })) };
      if (text.startsWith('SELECT id FROM render_jobs'))
        return { rows: fila.map((id) => ({ id })) };
      throw new Error(`Consulta inesperada: ${text}`);
    },
  };
}

test('reenfileira jobs parados abaixo do limite de tentativas', async () => {
  const db = fakeDb({ reenfileirados: ['job-1'] });
  const resultado = await recuperarProvasAdaptadasPendentes({
    db,
    agendar: () => {},
  });
  assert.deepEqual(resultado.reenfileirados, ['job-1']);
  const reenfileirar = db.chamadas[0];
  assert.match(reenfileirar.text, /attempts < \$2/);
  assert.deepEqual(reenfileirar.values, [
    PRAZO_GERACAO_MINUTOS,
    TENTATIVAS_MAXIMAS,
  ]);
});

test('falha jobs que já esgotaram as tentativas, com motivo', async () => {
  const db = fakeDb({ falhados: ['job-2'] });
  const resultado = await recuperarProvasAdaptadasPendentes({
    db,
    agendar: () => {},
  });
  assert.deepEqual(resultado.falhados, ['job-2']);
  const falhar = db.chamadas[1];
  assert.match(falhar.text, /attempts >= \$2/);
  assert.match(falhar.text, /interrompida em todas as tentativas/);
});

test('agenda a fila pendente, respeitando o limite', async () => {
  const agendados = [];
  const db = fakeDb({ fila: ['job-3', 'job-4'] });
  const resultado = await recuperarProvasAdaptadasPendentes({
    db,
    agendar: (id) => agendados.push(id),
    limite: 5,
  });
  assert.deepEqual(agendados, ['job-3', 'job-4']);
  assert.deepEqual(resultado.agendados, ['job-3', 'job-4']);
  assert.equal(db.chamadas[2].values[0], 5);
});

test('sem jobs pendentes não agenda nada', async () => {
  const agendados = [];
  const resultado = await recuperarProvasAdaptadasPendentes({
    db: fakeDb(),
    agendar: (id) => agendados.push(id),
  });
  assert.deepEqual(resultado, {
    reenfileirados: [],
    falhados: [],
    agendados: [],
  });
  assert.deepEqual(agendados, []);
});
