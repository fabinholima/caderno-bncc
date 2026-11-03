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

## Gravação das versões (fase 2)

`services/api/result-versions.mjs` grava versões provisórias dentro da mesma
transação da correção. Nunca publica.

| Origem | Quando | Observação |
| --- | --- | --- |
| `omr` | O worker identifica o aluno pelo QR. | Com leitura duvidosa, a versão fica em `needs_review`. |
| `manual_review` | `POST /api/card-scans/:id/confirm` | Respostas conferidas pelo professor; ausência de marcação conta como branco. Registra as alterações em `assessment_result_changes`. |
| `manual_review` | `POST /api/submissions/:id/manual-review` | Notas das discursivas de correções vindas de cartão. |

- Reprocessar o mesmo cartão ou repetir uma confirmação idêntica não cria versão nova.
- Uma versão nova de um resultado publicado muda `publication_status` para `republish_required`. O aluno continua vendo a versão publicada.
- **Duplicidade:** se já existe outro cartão lido ou em revisão do mesmo aluno na mesma aplicação, o worker deixa o novo cartão em `review` com `result.duplicateOfScanId` e não altera o resultado. A confirmação do professor decide qual leitura vale.
- **Respostas da API (aditivas):**
  - `GET /api/card-scans` inclui `duplicateOfScanId`, `resultProcessingStatus` e `publicationStatus`.
  - `GET /api/card-scans/:id` inclui também `otherScans` e `resultId`.
  - A confirmação devolve `resultId`, `resultVersion`, `publicationStatus` e `publishable`.
- **Assinatura:** `POST /api/card-scans` (somente envios novos) e `POST /api/card-scans/:id/retry` respondem 402 com a assinatura da instituição inativa. Repetir um envio já recebido continua respondendo normalmente. O aplicativo mantém a foto na fila e retoma o envio depois da regularização.

## Revisão e autorização (fase 3)

Todas as rotas exigem sessão de professor, coordenador ou administrador. Elas
filtram pela instituição da sessão: um ID de outra instituição responde 404.
Mutações seguem a verificação de origem existente: no navegador, a origem
precisa ser autorizada; o aplicativo envia `x-client: mobile` e Bearer.

### `GET /api/assessment-applications/:id/results`

Devolve `{ application, students }`.

- `application`: título, disciplina (`subject`), turma, `questionCounts`, `settings` e `minExpectedPercent` efetivo.
- `students[]`, um item por aluno da aplicação:
  - identificação: `applicationStudentId`, `studentName`, `registration`, `number`, `resultId`;
  - estados: `processingStatus` (`not_scanned` quando não há leitura) e `publicationStatus`;
  - versão atual: `currentVersionId`, `currentVersion`, `source`;
  - resultado: `counts` (questions, valid, correct, incorrect, blank, invalid, annulled, reviewPending, manualPending), `percent`, `score`, `maxScore`;
  - cartões: `cardScanId` e `scansInReview` (outro cartão aguardando decisão);
  - publicação: `publishable` e `published` (`version`, `authorizedAt`, `authorizerName`, `legacy`);
  - acompanhamento: `belowExpected` e `followupStatus`.

### `GET /api/assessment-results/:id`

Devolve o resultado com:

- `versions[]`: itens por questão, regra, contagens, autor e data de cada versão;
- `changes[]`: alterações manuais, questão a questão;
- `publications[]`: quem autorizou, quando, qual versão e se foi substituída;
- `scans[]`: cartões do aluno nessa aplicação. A foto continua em `GET /api/card-scans/:id/image`, com a mesma verificação de instituição.

### `POST /api/assessment-results/authorize`

```json
{ "applicationId": "uuid", "clientMutationId": "uuid opcional",
  "items": [{ "resultId": "uuid", "versionId": "uuid" }] }
```

Aceita de 1 a 500 itens e processa todos numa transação. `versionId` é a
versão que o professor conferiu. A resposta é
`{ batchId, published, items: [{ resultId, versionId, outcome }] }`, com
`outcome` igual a:

| `outcome` | Significado |
| --- | --- |
| `published` | Versão publicada agora. |
| `already_published` | A mesma versão já estava publicada; nada muda. |
| `stale` | Surgiu outra versão depois da conferência. Nada é publicado sem nova revisão. |
| `pending_review` | Há leitura duvidosa, discursiva sem nota ou outro cartão do aluno aguardando decisão. |
| `not_found` | Resultado inexistente nesta aplicação ou instituição. |

Repetir o mesmo `clientMutationId` devolve a resposta original. Publicar
substitui a publicação ativa anterior, que fica no histórico. O lançamento é
registrado em `audit_log` (`result.authorize`). Não há módulo de notas
separado no projeto: a versão publicada é o lançamento.

### `GET` e `PUT /api/assessment-applications/:id/result-settings`

```json
{ "minExpectedPercent": 60, "releasePolicy": "summary|answers|answers_and_key",
  "annulledQuestions": [3], "annulledPolicy": "exclude|award_full" }
```

- O `GET` inclui `effectiveMinExpectedPercent`, já considerando os padrões de escola e disciplina.
- Anular questões sem `annulledPolicy`, ou com um número inexistente em alguma versão da aplicação, responde 422.
- Mudar a anulação recalcula todos os resultados da aplicação (origem `recalculation`). As alterações ficam registradas, e os resultados publicados passam a `republish_required`. A resposta inclui `recalculated`.

### Aluno: `GET /api/student/activities`

Lê somente a versão publicada. Campos novos:

- `subject`, `resultId`;
- `resultStatus`: `published`, `in_correction` ou `not_corrected`;
- `percent`, `validCount`, `correctCount`, `incorrectCount`, `blankCount`, `invalidCount`, `annulledCount`;
- `publishedAt`.

Sem publicação, `score`, `maxScore` e as contagens vêm nulos e
`requiresManualReview` vem `true`, o que mantém compatíveis as versões
anteriores do app e do portal. A consulta não verifica a assinatura: o
histórico publicado continua visível com a assinatura inativa.

### Aluno: `GET /api/student/results/:resultId`

A rota é exclusiva de contas de aluno e responde 403 para outros perfis. O
resultado precisa estar publicado e pertencer ao próprio cadastro, pela mesma
verificação de `/api/student/activities`. Caso contrário, responde 404.

A resposta traz os campos da atividade e mais:

- `releasePolicy` e `questions[]`, conforme a política:
  - `summary`: lista vazia;
  - `answers`: `status`, `selectedLabels` e pontos de cada questão;
  - `answers_and_key`: o mesmo, mais `correctLabels`.
- `skills[]`: `code`, `description` (do catálogo `curriculum_skills`), `questions`, `correct`, `percent` e `sufficientEvidence`. Usa apenas as habilidades gravadas nas questões e conta somente objetivas corrigidas; anuladas e pendentes ficam de fora. Abaixo de `minSkillEvidence` (3 questões), o indicador é marcado como evidência insuficiente.
- `guidance`: orientação publicada na entrada mais recente de acompanhamento, ou `null`. Motivos, ações e observações internas não são enviados.

### Aluno: `GET /api/student/skill-performance`

Devolve `[{ subject, assessments, minSkillEvidence, skills[] }]`, somando as
versões publicadas de cada disciplina.

As rotas de aluno e de resultados respondem com `cache-control: no-store`.

## Implantação

1. Faça backup do banco.
2. Publique API e worker OMR juntos. O `preDeployCommand` aplica a 103, que converte em legado o que o aluno já via.
3. Depois que o worker antigo parar, execute uma vez `node services/api/backfill-legacy-results.mjs`, com o `DATABASE_URL` de produção. Ele converte os cartões concluídos pelo worker antigo durante a troca e é idempotente.
4. A partir daí, novos resultados só chegam ao aluno pela autorização.

## Limitações conhecidas

- O acesso segue o modelo atual: a instituição da sessão e o papel de professor, coordenador ou administrador. A tabela `class_memberships` existe, mas ainda não é aplicada nas rotas da API. Restringir por turma depende de populá-la para as turmas existentes.
