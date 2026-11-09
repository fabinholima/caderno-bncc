# Backup atual

`database/backups/caderno-schema-current.sql` contém a estrutura do PostgreSQL, sem dados, gerada em 09/11/2026 a partir de uma base vazia com todas as migrações até `109`. Para regenerar: rode `node services/api/migrate.mjs` numa base vazia e `pg_dump --schema-only --no-owner --no-privileges`.

O backup integral mais recente está em `outputs/backups/caderno-full-20260930-092950.sql`, incluído explicitamente no repositório privado por solicitação do proprietário. Contém dados sensíveis: não publique o repositório nem compartilhe o arquivo publicamente. Os backups anteriores foram preservados. A cópia local tem permissão restrita ao proprietário; essa permissão deve ser reaplicada após clonar o repositório.

Os arquivos SQL antigos em `database/backups` são históricos e não representam o banco atual. Não restaurá-los sobre a base em uso. Para recuperar o banco completo, use o backup privado em uma base vazia e valide antes de substituir qualquer serviço.

Segredos de `.env`, inclusive CPF_HASH_SECRET, devem ser transferidos separadamente por um meio privado. Não estão no backup SQL nem no Git.
