# Caderno — Avaliações BNCC

[![CI](https://github.com/fabinholima/caderno-bncc/actions/workflows/ci.yml/badge.svg)](https://github.com/fabinholima/caderno-bncc/actions/workflows/ci.yml)

Fatia funcional do portal: banco de questões, cadastro estruturado, API PostgreSQL e fila de renderização ConTeXt.

## Princípio central

A questão é uma unidade reutilizável e versionada. Enunciado, alternativas, resposta, explicação, pontos e vínculos curriculares ficam no PostgreSQL. A avaliação congela um snapshot JSON. ConTeXt/LuaMetaTeX, opcionalmente com `t-basicexam`, apenas apresenta esse snapshot como prova do aluno, versão do professor ou folha de respostas.

## Estrutura inicial

- `app/`: interface do banco e cadastro de questões;
- `services/api/`: API HTTP validada para consultar e cadastrar questões;
- `services/renderer/`: worker da fila que transforma snapshots em ConTeXt e PDF;
- `database/`: modelo PostgreSQL multi-instituição e dados mínimos de desenvolvimento;
- `docs/api.md`: contrato das rotas do MVP e exemplos de correção;
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

`GET /api/render-templates` lista os layouts de impressão permitidos. A escolha é salva no snapshot e em `render_jobs.template_version`, garantindo que uma prova antiga continue associada à versão tipográfica usada em sua criação. O guia em `renderer/context/templates/README.md` descreve como acrescentar futuramente um layout próprio sem alterar o banco de questões.

## Classificação curricular e gabarito

O cadastro percorre `curriculum_subjects → knowledge_objects → curriculum_skills`. A questão aponta para a habilidade por `question_skills`; a habilidade aponta para seu objeto de conhecimento. Assim, nomes e descrições curriculares não são repetidos em cada questão e podem ser atualizados ou versionados centralmente.

A área **Planejamento** permite manter essa hierarquia pelo portal. A API expõe:

- `POST /api/curriculum/subjects` para disciplinas e etapas;
- `POST /api/curriculum/knowledge-objects` para objetos e anos/séries;
- `POST /api/curriculum/skills` para códigos e descrições das habilidades;
- `GET /api/curriculum` para entregar a árvore usada no cadastro das questões.

Cada alternativa pertence a `(question_id, revision)` e guarda uma `stable_key` imutável e `is_correct`. A letra A/B/C/D é apenas apresentação: quando alternativas são embaralhadas, o sistema mantém a resposta pela chave estável e calcula a nova letra somente no snapshot da avaliação.

Cada questão também mantém seis dimensões de catalogação: disciplina, instituição proprietária, instituição ou banca de origem, ano da prova, dificuldade e classificação curricular. A instituição proprietária vem da identidade autenticada; banca, ano e dificuldade pertencem à revisão, para preservar a procedência mesmo quando a questão for atualizada.

O tipo da questão controla a regra de resposta: `single_choice` exige exatamente uma alternativa correta, `multiple_choice` exige duas ou mais e `essay` não possui alternativas, mas exige uma orientação de correção. O `t-basicexam` permanece responsável apenas pela composição e numeração no documento.

O enunciado também pode conter um bloco MetaPost. O código é validado antes de ser gravado e novamente antes da renderização; comandos de leitura de arquivos, execução externa e injeção de TeX são bloqueados. O worker executa o ConTeXt com limite de tempo configurável por `RENDER_TIMEOUT_MS`.

## Geração dos PDFs

Cada item de `render_jobs` produz dois documentos pelo ConTeXt/LuaMetaTeX: `prova.pdf`, sem respostas, e `gabarito.pdf`, com respostas e explicações. O manifesto gravado no PostgreSQL guarda os caminhos dos dois arquivos e de seus fontes `.tex`.

O frontend acompanha cada versão por `GET /api/render-jobs/:id`. Enquanto o trabalho estiver na fila ou em composição, os botões permanecem bloqueados. Ao terminar, os downloads autenticados são liberados por `GET /api/render-jobs/:id/prova` e `GET /api/render-jobs/:id/gabarito`. A API confirma que o trabalho pertence à instituição antes de transmitir o arquivo e não aceita caminhos enviados pelo navegador.

Antes de marcar um trabalho como concluído, o worker confirma que os dois arquivos existem, têm conteúdo e começam com a assinatura `%PDF-`. Falhas ficam registradas no trabalho e são apresentadas na interface sem liberar um arquivo incompleto.

Enquanto a API externa ainda não está ligada ao portal público, a tela de avaliações oferece um PDF demonstrativo de duas páginas, contendo a prova e o gabarito comentado.

Os testes de contrato e validação rodam com `pnpm test:services`; o portal completo é verificado com `pnpm build`.

A API também mantém revisões imutáveis de questões, consulta avaliações e registra respostas. A correção objetiva compara as letras com o gabarito da versão congelada; respostas discursivas são sinalizadas para revisão manual. O contrato completo está em `docs/api.md`.

## Decisões herdadas da filosofia do t-basicexam

- questões são ambientes/unidades independentes;
- pontuação, resposta e explicação pertencem à questão;
- conteúdo pode ser composto em modos aluno e professor;
- numeração e layout pertencem ao documento final;
- o mesmo conteúdo pode ser incorporado em avaliações diferentes.

Não copiamos o módulo para o domínio. Isso permite outro renderizador no futuro sem migrar o banco.
