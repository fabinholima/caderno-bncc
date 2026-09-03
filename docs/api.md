# API do Caderno BNCC

A API HTTP é institucional: todas as consultas são limitadas por `DEMO_INSTITUTION_ID` nesta fase. Quando `API_TOKEN` estiver configurado, envie `Authorization: Bearer <token>`. O portal público não deve armazenar esse token; em produção, use um proxy autenticado.

Respostas de sucesso usam `{ "data": ... }`. Erros usam `{ "error": "..." }`; falhas de validação também incluem `issues`.

## Currículo

- `GET /api/curriculum?subject=Química`: árvore de disciplinas, objetos de conhecimento e habilidades.
- `POST /api/curriculum/subjects`: cadastra ou reutiliza disciplina e etapa.
- `POST /api/curriculum/knowledge-objects`: cadastra ou atualiza um objeto.
- `POST /api/curriculum/skills`: cadastra ou atualiza uma habilidade BNCC.

## Questões

- `GET /api/questions?q=termo&subject=Química`: consulta o banco da instituição.
- `GET /api/questions/:id`: entrega a revisão atual completa, incluindo alternativas e gabarito.
- `POST /api/questions`: cria a questão e sua revisão 1.
- `POST /api/questions/:id/revisions`: cria uma revisão imutável e passa a apontar a questão para ela.
- `PATCH /api/questions/:id/status`: altera o fluxo editorial entre `draft`, `review`, `approved` e `archived`.

Criar uma nova revisão usa o mesmo corpo de `POST /api/questions`. Avaliações já congeladas preservam o conteúdo anterior em seu snapshot.

## Avaliações e PDF

- `GET /api/render-templates`: layouts ConTeXt permitidos.
- `GET /api/assessments`: avaliações, quantidades de versões, PDFs e correções.
- `GET /api/assessments/:id`: detalhes, snapshots e estado da composição de cada versão.
- `POST /api/assessments`: congela as questões, gera versões e enfileira os PDFs.
- `GET /api/render-jobs/:id`: acompanha a composição.
- `GET /api/render-jobs/:id/prova`: baixa a prova concluída.
- `GET /api/render-jobs/:id/gabarito`: baixa o gabarito concluído.

## Correção automática

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
psql "$DATABASE_URL" -f database/006_assessment_submissions.sql
```

Uma base nova criada pelo `docker compose` recebe todas as migrações automaticamente.
