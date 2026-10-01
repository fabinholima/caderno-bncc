# Backups do PostgreSQL

Esta pasta guarda snapshots versionados da base de demonstração do Caderno BNCC.

## Snapshot atual

- `caderno-demo-2026-09-15.sql`
- PostgreSQL 17
- Conteúdo: uma instituição de demonstração, um professor, duas questões e uma avaliação.
- Estrutura atualizada pelas migrações `001` a `036`.

## Restaurar localmente

Com o serviço `postgres` iniciado pelo Docker Compose, execute na raiz do projeto:

```sh
docker compose exec -T postgres psql -U caderno -d caderno < database/backups/caderno-demo-2026-09-15.sql
```

O arquivo foi gerado com `--clean --if-exists`, portanto a restauração substitui a estrutura e os dados existentes no banco de destino. Faça um backup da base de destino antes de restaurá-lo.

## Importação incremental no Render

Para acrescentar objetos de conhecimento, disciplinas, tópicos, habilidades e questões sem apagar usuários ou configurações do banco de produção, abra o Web Shell da API e execute:

```sh
node seed-from-backup.mjs
```

O importador usa `ON CONFLICT DO NOTHING`, registra linhas incompatíveis como ignoradas e informa ao final quantos registros foram inseridos.

Não adicione snapshots de produção a esta pasta. Eles podem conter dados pessoais, segredos ou respostas de alunos.
