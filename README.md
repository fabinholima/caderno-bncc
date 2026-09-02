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

Os testes de contrato e validação rodam com `pnpm test:services`; o portal completo é verificado com `pnpm build`.

## Decisões herdadas da filosofia do t-basicexam

- questões são ambientes/unidades independentes;
- pontuação, resposta e explicação pertencem à questão;
- conteúdo pode ser composto em modos aluno e professor;
- numeração e layout pertencem ao documento final;
- o mesmo conteúdo pode ser incorporado em avaliações diferentes.

Não copiamos o módulo para o domínio. Isso permite outro renderizador no futuro sem migrar o banco.
