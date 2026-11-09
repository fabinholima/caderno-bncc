# Backup atual

`database/backups/caderno-schema-current.sql` contém a estrutura do PostgreSQL, sem dados, gerada em 09/11/2026 a partir de uma base vazia com todas as migrações até `109`. Para regenerar: rode `node services/api/migrate.mjs` numa base vazia e `pg_dump --schema-only --no-owner --no-privileges`.

Backups integrais do banco não ficam no Git: contêm usuários, sessões, tokens e dados de alunos. Os dumps que chegaram a ser versionados (`outputs/backups/caderno-full-*.sql` e `database/backups/caderno-current.sql`) foram removidos de todo o histórico em 09/11/2026, e o `.gitignore` impede que voltem. Guarde backups integrais fora do repositório, em local privado e com permissão restrita ao proprietário.

Os arquivos SQL antigos em `database/backups` são históricos e não representam o banco atual. Não restaurá-los sobre a base em uso. Para recuperar o banco completo, use o backup privado em uma base vazia e valide antes de substituir qualquer serviço.

Segredos de `.env`, inclusive CPF_HASH_SECRET, devem ser transferidos separadamente por um meio privado. Não estão no backup SQL nem no Git.
