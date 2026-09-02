# Caderno — Avaliações BNCC

Primeira fatia funcional do portal: banco de questões, cadastro estruturado e fundação de dados/renderização.

## Princípio central

A questão é uma unidade reutilizável e versionada. Enunciado, alternativas, resposta, explicação, pontos e vínculos curriculares ficam no PostgreSQL. A avaliação congela um snapshot JSON. ConTeXt/LuaMetaTeX, opcionalmente com `t-basicexam`, apenas apresenta esse snapshot como prova do aluno, versão do professor ou folha de respostas.

## Estrutura inicial

- `app/`: interface do banco e cadastro de questões;
- `database/001_initial.sql`: modelo PostgreSQL multi-instituição;
- `lib/assessment-contract.ts`: contrato estável entre aplicação e renderizador;
- `samples/assessment-snapshot.json`: exemplo completo do contrato;
- `renderer/context/`: primeiro adaptador ConTeXt/t-basicexam;
- `docker-compose.yml`: PostgreSQL de desenvolvimento.

## Decisões herdadas da filosofia do t-basicexam

- questões são ambientes/unidades independentes;
- pontuação, resposta e explicação pertencem à questão;
- conteúdo pode ser composto em modos aluno e professor;
- numeração e layout pertencem ao documento final;
- o mesmo conteúdo pode ser incorporado em avaliações diferentes.

Não copiamos o módulo para o domínio. Isso permite outro renderizador no futuro sem migrar o banco.
