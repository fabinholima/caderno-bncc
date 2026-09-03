# Caderno — Avaliações BNCC

Fatia funcional do portal: banco de questões, cadastro estruturado, API PostgreSQL e fila de renderização ConTeXt.

## Princípio central

A questão é uma unidade reutilizável e versionada. Enunciado, alternativas, resposta, explicação, pontos e vínculos curriculares ficam no PostgreSQL. A avaliação congela um snapshot JSON. ConTeXt/LuaMetaTeX, opcionalmente com `t-basicexam`, apenas apresenta esse snapshot como prova do aluno, versão do professor ou folha de respostas.

## Estrutura inicial

- `app/`: interface do banco e cadastro de questões;
- `services/api/`: API HTTP validada para consultar e cadastrar questões;
- `services/renderer/`: worker da fila que transforma snapshots em ConTeXt e PDF;
- `database/`: modelo PostgreSQL multi-instituição e dados mínimos de desenvolvimento;
- `lib/assessment-contract.ts`: contrato estável entre aplicação e renderizador;
- `samples/assessment-snapshot.json`: exemplo completo do contrato;
- `renderer/context/`: primeiro adaptador ConTeXt/t-basicexam;
- `docker-compose.yml`: PostgreSQL de desenvolvimento.

## Execução local

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm --filter @caderno/api start
```

Em outro terminal, inicie o portal com `NEXT_PUBLIC_API_URL=http://localhost:8788 pnpm dev`. Para consumir a fila de PDFs, execute `pnpm --filter @caderno/renderer start` em um ambiente com ConTeXt/LuaMetaTeX e `t-basicexam` instalados.

Em produção, configure `API_TOKEN`; a API passa a exigir `Authorization: Bearer ...`. O token deve ser injetado por um proxy/BFF confiável, nunca gravado no JavaScript público. `DEMO_INSTITUTION_ID` e `DEMO_USER_ID` delimitam a instituição e a autoria nesta fase; a evolução prevista é resolver esses valores pela identidade autenticada e pela tabela `memberships`.

`POST /api/assessments` congela a avaliação, cria entre uma e seis versões determinísticas, embaralha questões e alternativas por semente, preserva o gabarito pelas chaves estáveis e enfileira um PDF por versão.

## Classificação curricular e gabarito

O cadastro percorre `curriculum_subjects → knowledge_objects → curriculum_skills`. A questão aponta para a habilidade por `question_skills`; a habilidade aponta para seu objeto de conhecimento. Assim, nomes e descrições curriculares não são repetidos em cada questão e podem ser atualizados ou versionados centralmente.

Cada alternativa pertence a `(question_id, revision)` e guarda uma `stable_key` imutável e `is_correct`. A letra A/B/C/D é apenas apresentação: quando alternativas são embaralhadas, o sistema mantém a resposta pela chave estável e calcula a nova letra somente no snapshot da avaliação.

Os testes de contrato e validação rodam com `pnpm test:services`; o portal completo é verificado com `pnpm build`.

## Decisões herdadas da filosofia do t-basicexam

- questões são ambientes/unidades independentes;
- pontuação, resposta e explicação pertencem à questão;
- conteúdo pode ser composto em modos aluno e professor;
- numeração e layout pertencem ao documento final;
- o mesmo conteúdo pode ser incorporado em avaliações diferentes.

Não copiamos o módulo para o domínio. Isso permite outro renderizador no futuro sem migrar o banco.
