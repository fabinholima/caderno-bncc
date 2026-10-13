# Situação editorial das questões

Migração 078 adiciona `needs_adjustments` (Precisa de ajustes). O acervo oferece atualização de situação e histórico com autor, data, revisão, situação anterior, nova situação e motivo/observação.

Fluxo: Rascunho → Em revisão → Aprovada. O administrador geral pode devolver uma questão Em revisão para Precisa de ajustes, informando obrigatoriamente o motivo. Após corrigir, o autor envia novamente para revisão. Também é possível reabrir como rascunho ou arquivar. Aprovação, devolução e arquivamento são exclusivos do administrador geral; autores podem gerenciar suas questões nas etapas de elaboração/revisão. O endpoint valida a transição e a revisão conferida, além da origem da requisição.

Qualquer nova revisão do conteúdo devolve a questão ao estado Rascunho e registra a retirada da situação anterior. O salvamento automático do editor é independente da situação editorial.

A montagem de novas avaliações mostra somente Aprovadas. A API também exige aprovação de todas as questões, independentemente da seleção enviada pelo cliente. Um bloqueio compartilhado das questões durante a transação impede que a aprovação seja retirada durante a captura da revisão. Avaliações já congeladas conservam seus snapshots.

Não se aprovam automaticamente questões existentes. A aprovação deve passar pela revisão humana.

Validação: `node --test services/api/question-workflow.test.mjs services/api/questions.test.mjs services/api/assessments.test.mjs`. Integração: `QUESTION_WORKFLOW_TEST_DATABASE_URL=... node --test services/api/question-workflow.integration.test.mjs`, usando banco de testes com schema descartável.

## Correção da consulta do histórico

O identificador em `audit_log.entity_id` é texto, conforme a migração 019; o identificador em `questions.id` é UUID. A consulta do histórico converte o parâmetro explicitamente para cada tipo, evitando o erro PostgreSQL `uuid = text`. O teste de integração reproduz essa diferença de tipos e verifica histórico vazio, histórico de alterações e isolamento entre instituições.
