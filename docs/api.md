# API do Caderno BNCC

A API usa sessão HTTP-only e resolve usuário, papel e instituição em cada requisição. As rotas de dados recusam chamadas sem sessão e todas as consultas permanecem limitadas à instituição autenticada.

Autenticação: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password` e `POST /api/auth/reset-password`. Administração: `POST /api/invitations`, `POST /api/invitations/accept` e `GET /api/subscription`.

Respostas de sucesso usam `{ "data": ... }`. Erros usam `{ "error": "..." }`; falhas de validação também incluem `issues`.

## Currículo

### Matrizes e descritores do SAEB — Ensino Fundamental

- `GET /api/curriculum/saeb/matrices`
  - filtros opcionais: `subject`, `gradeRange`
- `GET /api/curriculum/saeb/descriptors`
  - filtros opcionais: `matrixId`, `subject`, `gradeRange`

Os descritores do SAEB são armazenados em catálogo próprio e não são tratados
como habilidades curriculares da BNCC. A carga oficial de Língua Portuguesa e
Matemática (5º e 9º anos) pode ser refeita com `pnpm --filter @caderno/api
import:saeb` após disponibilizar os PDFs do Inep em `work/saeb`.

- `GET /api/curriculum?subject=Matemática`: árvore de disciplinas, objetos de conhecimento e habilidades. Uma habilidade pode aparecer sob mais de um objeto, conforme a relação oficial da BNCC.
- `GET /api/curriculum/high-school?area=em-area-cnt`: área, competências específicas e habilidades do Ensino Médio. Ciências da Natureza possui 3 competências e 26 habilidades oficiais, sem seriação e sem objetos de conhecimento artificiais.
- `GET /api/curriculum/pedagogical-disciplines`: lista as disciplinas pedagógicas da instituição e suas habilidades selecionadas.
- `GET /api/curriculum/pedagogical-topics?disciplineId=:id`: lista objetos e subtópicos pedagógicos em árvore. Em Química, o catálogo inicial inclui Termoquímica e Eletroquímica com seus respectivos subtópicos.
- `POST /api/curriculum/pedagogical-disciplines`: ativa uma disciplina, por exemplo `{ "name": "Química", "areaSourceKey": "em-area-cnt" }`.
- `PUT /api/curriculum/pedagogical-disciplines/:id/skills`: substitui de forma atômica a seleção de habilidades com `{ "skillIds": ["uuid", "uuid"] }`. A API rejeita habilidades externas à área oficial vinculada.
- `POST /api/curriculum/subjects`: cadastra ou reutiliza disciplina e etapa.
- `POST /api/curriculum/knowledge-objects`: cadastra ou atualiza um objeto.
- `POST /api/curriculum/skills`: cadastra ou atualiza uma habilidade BNCC.

O importador do Ensino Médio confere o catálogo contra a estrutura do PDF oficial:
Linguagens (7 competências, 82 habilidades incluindo `EM13LGG` e `EM13LP`),
Matemática (5 e 43), Ciências da Natureza (3 e 26) e Ciências Humanas e
Sociais Aplicadas (6 e 32). A importação é recusada se os 21 registros de
competências ou os 183 códigos únicos de habilidades estiverem incompletos.

## Questões

- `GET /api/questions`: consulta o banco da instituição. Aceita filtros
  combináveis `q`, `subject`, `knowledgeObjectId`, `sourceInstitution`,
  `sourceYear` e `difficulty` (`easy`, `medium` ou `hard`).
- `GET /api/question-filters`: lista instituições/bancas, anos e níveis
  existentes no acervo da instituição.
- `GET /api/questions/:id`: entrega a revisão atual completa, incluindo alternativas e gabarito.
- `POST /api/questions`: cria a questão e sua revisão 1.
- `POST /api/questions/:id/revisions`: cria uma revisão imutável e passa a apontar a questão para ela.
- `PATCH /api/questions/:id/status`: altera o fluxo editorial entre `draft`, `review`, `approved` e `archived`.
- `DELETE /api/questions/:id`: retira a questão do acervo por arquivamento, preservando revisões já congeladas em provas.
- `POST /api/questions/preview`: compila uma prévia PDF temporária pelo ConTeXt sem gravar a questão.

A prévia permite uma compilação ativa por usuário e respeita o limite global
`PREVIEW_CONCURRENCY` (padrão 2). Quando o limite é alcançado, a API responde
`429` com `Retry-After`, protegendo o servidor contra picos de LuaMetaTeX.

Criar uma nova revisão usa o mesmo corpo de `POST /api/questions`. Avaliações já congeladas preservam o conteúdo anterior em seu snapshot.

## Turmas, alunos e aplicações

- `GET /api/classes` e `POST /api/classes`: lista e cria turmas da instituição.
- `POST /api/students`: cadastra um aluno por matrícula institucional.
- `POST /api/classes/:id/enrollments`: matricula o aluno na turma.
- `POST /api/assessment-applications`: agenda uma avaliação para uma turma.
- `GET /api/assessment-applications/:id`: detalha alunos, versões, estado e downloads individuais.
- `POST /api/assessment-applications/:id/retry`: recoloca somente PDFs com falha na fila.
- `POST /api/assessment-applications/:id/cancel`: cancela uma aplicação ainda agendada e sem cartões enviados.
- `GET /api/assessment-applications/:id/pdf`: reúne, em ordem de chamada, todas as provas individualizadas concluídas em um único PDF para impressão.

Cada versão nova recebe um identificador assinado por `QR_SIGNING_SECRET`. O QR aparece na prova e no cartão-resposta A–E anexado ao PDF, sem expor o nome do aluno.

## Avaliações e PDF

- `GET /api/render-templates`: layouts ConTeXt permitidos.
- `GET /api/assessment-presets`: favoritos do professor autenticado.
- `POST /api/assessment-presets`: cria ou atualiza um favorito pelo nome.
- `DELETE /api/assessment-presets/:id`: exclui um favorito do professor.
- `GET /api/assessments`: avaliações, quantidades de versões, PDFs e correções.
- `GET /api/assessments/:id`: detalhes, snapshots e estado da composição de cada versão.
- `POST /api/assessments`: congela as questões, gera versões e enfileira os PDFs.
- `GET /api/render-jobs/:id`: acompanha a composição.
- `GET /api/render-jobs/:id/prova`: baixa a prova concluída.
- `GET /api/render-jobs/:id/gabarito`: baixa o gabarito concluído.

O corpo de `POST /api/assessments` pode incluir um cabeçalho congelado junto
com a avaliação. O logotipo deve ser PNG ou JPEG, codificado como data URL, e
ter no máximo 400 KB:

```json
{
  "header": {
    "institutionName": "Escola Municipal Paulo Freire",
    "teacherName": "Ana Souza",
    "className": "7º A",
    "term": "2º bimestre",
    "date": "15/09/2026",
    "logoDataUrl": "data:image/png;base64,..."
  }
}
```

A composição aceita somente `plex` (padrão), `heros`, `bonum`, `schola` e
`libertinus`. `fontSize` deve ser um número inteiro entre 10 e 16. Esses valores
também ficam congelados no snapshot e são aplicados como
`\\setupbodyfont[fonte,tamanhopt]`.

## Correção automática

`POST /api/card-scans` recebe `imageDataUrl` PNG/JPEG ou PDF de até 6 MB e coloca o arquivo na fila OMR. Todas as páginas de um PDF são processadas de forma independente, permitindo um cartão por página. O frontend também seleciona até 20 arquivos simultaneamente e cria um envio para cada arquivo. `GET /api/card-scans` lista cada página, o aluno identificado pelo QR e as marcações que exigem conferência.

`GET /api/card-scans/:id` abre os dados de revisão e os possíveis alunos. `GET /api/card-scans/:id/image` entrega a página normalizada para conferência. `POST /api/card-scans/:id/retry` repete o OMR e `POST /api/card-scans/:id/confirm` grava o aluno e as respostas confirmadas, recalcula a nota e atualiza os relatórios.

Quando todas as marcações são inequívocas, o worker cria automaticamente uma submissão corrigida contra o gabarito imutável da versão individual. A listagem do cartão passa a informar `submissionId`, `score` e `maxScore`; cartões em revisão não geram nota até a confirmação humana.

`GET /api/assessment-applications/:id/report` consolida a aplicação por aluno, habilidade e competência BNCC. O resumo informa quantidade corrigida, pendente, em revisão e média percentual da turma.

Questões do Ensino Médio podem informar `pedagogicalTopicId`. A API valida se o subtópico pertence à disciplina e à instituição autenticada e também congela o caminho legível em `knowledgeTopic`, por exemplo `Termoquímica > Lei de Hess`. Esse catálogo permanece separado das competências e habilidades oficiais da BNCC e pode ser usado no filtro `knowledgeTopic` de `GET /api/questions`.

Envie as letras exatamente como aparecem na versão impressa:

```json
POST /api/assessment-versions/:versionId/submissions
{
  "candidate": {
    "name": "Ana Souza",
    "class": "3º A",
    "number": "12"
  },
  "responses": [
    { "questionNumber": 1, "selectedLabels": ["B"] },
    { "questionNumber": 2, "selectedLabels": ["A", "C"] },
    { "questionNumber": 3, "text": "Resposta discursiva" }
  ]
}
```

Questões objetivas recebem pontuação integral apenas quando o conjunto marcado coincide com o gabarito da versão. Discursivas ficam como `pending_manual_review`. Consulte uma correção com `GET /api/submissions/:id` ou liste a turma com `GET /api/assessment-versions/:versionId/submissions`.

## Banco local

Em uma base já criada, aplique as migrações novas em ordem. Para esta etapa:

```bash
psql "$DATABASE_URL" -f database/007_assessment_presets.sql
psql "$DATABASE_URL" -f database/008_bncc_catalog.sql
psql "$DATABASE_URL" -f database/009_high_school_curriculum.sql
psql "$DATABASE_URL" -f database/010_pedagogical_disciplines.sql
psql "$DATABASE_URL" -f database/011_academic_roster.sql
psql "$DATABASE_URL" -f database/012_individual_assessment_applications.sql
psql "$DATABASE_URL" -f database/013_card_scans.sql
psql "$DATABASE_URL" -f database/014_pdf_card_scans.sql
psql "$DATABASE_URL" -f database/015_scan_submissions.sql
psql "$DATABASE_URL" -f database/016_multipage_card_scans.sql
psql "$DATABASE_URL" -f database/017_question_knowledge_topics.sql
psql "$DATABASE_URL" -f database/020_pedagogical_topics.sql
psql "$DATABASE_URL" -f database/012_individual_assessment_applications.sql
```

Uma base nova criada pelo `docker compose` recebe todas as migrações automaticamente.
