# Backup atual

`database/backups/caderno-schema-current.sql` contém a estrutura atual do PostgreSQL, sem dados. As migrações 041–045 acompanham as alterações de autenticação, assinaturas, perfis e administração geral.

O backup integral desta operação está em `outputs/backups/caderno-full-2026-09-29.sql`, ignorado pelo Git e com permissão de leitura restrita ao proprietário. Ele contém dados sensíveis: guarde uma cópia privada e não publique. Copiar o repositório não transfere esse backup.

Os arquivos SQL antigos em `database/backups` são históricos e não representam o banco atual. Não restaurá-los sobre a base em uso. Para recuperar o banco completo, use o backup privado em uma base vazia e valide antes de substituir qualquer serviço.

Segredos de `.env`, inclusive CPF_HASH_SECRET, devem ser transferidos separadamente por um meio privado. Não estão no backup SQL nem no Git.
