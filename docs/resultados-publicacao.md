# Resultados provisórios e publicação autorizada

Migração `103_result_publication.sql` (aditiva). Base dos módulos Professor e
Aluno do aplicativo: a correção gera um resultado provisório, e o aluno só vê
o que o professor autorizou.

## Estados separados

| Onde | Campo | Significado |
| --- | --- | --- |
| `card_scans` | `status` | Leitura da imagem: `queued`, `processing`, `review`, `completed`, `failed`. Sem mudança. |
| `assessment_results` | `processing_status` | `processing`, `needs_review` (leitura duvidosa ou discursiva sem nota), `ready`, `failed`. |
| `assessment_results` | `publication_status` | `unpublished`, `published`, `republish_required` (existe versão mais nova que a publicada). |

Uma imagem processada não significa resultado autorizado. O aluno vê apenas
`assessment_results.published_version_id`.

## Tabelas

- `assessment_results`: um por aluno em cada aplicação (`application_student_id` único). Reenvios e novas leituras criam versões, nunca outra nota.
- `assessment_result_versions`: versões imutáveis com origem (`omr`, `manual_review`, `recalculation`, `legacy`), cartão, correção, versão da avaliação, hash do gabarito (`answer_key_sha256`, sempre calculado no PostgreSQL com `encode(sha256(convert_to(answer_key::text,'UTF8')),'hex')`), regra de pontuação e contagens.
- `assessment_result_publications`: autorizações (quem, nome no momento, quando, lote, versão). Uma por versão; uma ativa por resultado. Um gatilho recusa publicar versão com pendências ou de outro resultado.
- `assessment_result_changes`: cada alteração manual de resposta, com valores anterior e novo.
- `application_result_settings`: por aplicação, percentual mínimo esperado, política de liberação ao aluno (`summary`, `answers`, `answers_and_key`) e questões anuladas. Anulação exige `annulled_policy` (`exclude` ou `award_full`).
- `performance_thresholds`: percentual mínimo padrão da instituição, escola e/ou disciplina.
- `performance_followups`: acompanhamento de baixo rendimento, só acréscimo. Motivos e ações vêm de listas fechadas e são escolhidos pelo professor. `internal_note` nunca vai ao aluno; `student_guidance` só com `student_guidance_published=true`.

## Contagens

Só questões objetivas entram nas contagens, e elas fecham por restrição:

```
correct + incorrect + blank + invalid + review_pending = valid_count
valid_count = objetivas - anuladas
```

- `invalid`: mais de uma marcação numa questão de resposta única. Não entra em `incorrect`.
- `review_pending`: leitura `uncertain`, ausente ou questão sem gabarito. Nunca é convertida em resposta.
- `manual_pending_count`: discursivas sem nota.
- `percent`: acertos ÷ válidas. Fica nulo enquanto houver leitura pendente.
- `score`: soma dos pontos do snapshot (regra existente `points_sum`). Fica nula enquanto houver qualquer pendência.

O cálculo está em `services/api/assessment-results.mjs` (`summarizeResult`).
O percentual mínimo segue a ordem aplicação → disciplina na escola → escola →
disciplina → instituição (`minimumExpectedPercent`). Sem configuração, não há
alerta de baixo rendimento.

## Resultados anteriores

A migração transforma em versão 1, publicada como legado
(`legacy=true`, autor "Publicado antes da autorização no aplicativo"), cada
último cartão concluído sem revisão manual pendente, ou seja, exatamente o que
o aluno já via. Correções com revisão pendente continuam sem publicação.
Reaplicar o arquivo não duplica registros.

## Aplicação e testes

Faça backup antes. A API aplica a migração no `preDeployCommand`
(`node migrate.mjs`). Para testar em banco descartável:

```
RESULT_PUBLICATION_TEST_DATABASE_URL=postgres://... node --test services/api/result-publication.integration.test.mjs
node --test services/api/assessment-results.test.mjs
```

O teste aplica as migrações reais 001–102, cria um resultado visível e outro em
revisão, aplica a 103 duas vezes e confere legado, unicidade, bloqueio de
publicação com pendências, fechamento das contagens e regras de acompanhamento.

## Próximas fases

O worker OMR e a confirmação manual ainda gravam apenas em `card_scans` e
`assessment_submissions`, e `GET /api/student/activities` ainda lê essas
tabelas. A fase 2 passa a gravar versões provisórias. A fase 3 cria as rotas de
autorização e muda a consulta do aluno para a versão publicada.

Publique a 103 em produção junto com a fase 3. Se ela for aplicada antes, os
cartões corrigidos nesse intervalo não viram legado; a fase 3 repete a mesma
conversão para esses casos antes de mudar a consulta do aluno.
