# Atualização da produção (VPS Hostinger com Docker Compose)

A produção roda num VPS da Hostinger com `deploy/vps/docker-compose.yml` (instalação em `docs/deploy-hostinger.md`). O merge na `main` não publica nada: a atualização é feita no servidor com `deploy/atualizar-producao.sh`.

## O que o script faz

1. Confere o Docker, o Compose, os serviços e se o repositório está limpo na `main`.
2. Traz a `main` com `git merge --ff-only`. Se houver commit local divergente, para sem mexer.
3. Lista as migrações que ainda não estão em `schema_migrations`.
4. Faz o backup do banco com `pg_dump -Fc` em `deploy/vps/backups/` e confere o arquivo com `pg_restore --list`. Sem backup válido, não segue.
5. Gera as imagens da API, do gerador de PDFs (`renderer`), da importação (`imports`), da correção (`omr`) e do portal (`frontend`).
6. Reinicia a API. Ela aplica as migrações ao iniciar, numa única transação.
7. Espera `/health` responder `"status":"ok"` e confere se todas as migrações foram aplicadas.
8. Só então reinicia os workers e o portal. Ao iniciar, o worker OMR converte em "publicado (legado)" os resultados que a versão anterior concluiu durante a troca.

O banco e o Caddy não são reiniciados (`--no-deps`). Se algo falhar, o script mostra as últimas linhas da API, o commit anterior e o caminho do backup.

## Como usar

No servidor, pelo SSH, na raiz do repositório (`/opt/ufaprova`):

```bash
deploy/atualizar-producao.sh --dry-run
deploy/atualizar-producao.sh
```

O `--dry-run` mostra os commits novos, as migrações pendentes e os comandos, sem alterar nada. Ele precisa ler `schema_migrations`, então o banco precisa estar no ar.

Os padrões seguem `deploy/vps/docker-compose.yml`: API `api`, banco `postgres` (usuário e banco `caderno`), demais serviços `renderer imports omr frontend` e `https://api.ufaprova.com.br/health`. Um serviço da lista que não exista no compose é ignorado, com aviso. Para mudar, use as variáveis do início do script, por exemplo:

```bash
OTHER_SERVICES="omr imports" deploy/atualizar-producao.sh
```

Se o banco não estiver no compose, use `BACKUP_DATABASE_URL`. O backup então roda num contêiner `postgres:18-alpine` descartável (`PG_IMAGE`), cuja versão precisa ser igual ou mais nova que a do servidor.

## Backups

Os arquivos ficam em `deploy/vps/backups/caderno-AAAAMMDD-HHMMSS-<commit>.dump`, a mesma pasta do backup diário (`backup-postgres.sh`), que o git ignora. O script não apaga backups: remova os antigos manualmente e mantenha cópia fora do VPS.

Restaurar substitui os dados atuais. Use só depois de conferir o problema, dentro de `deploy/vps`:

```bash
docker compose exec -T postgres pg_restore -U caderno -d caderno --clean --if-exists < backups/ARQUIVO.dump
```

## Voltar à versão anterior

O script imprime o commit anterior ao falhar. Para voltar o código, dentro de `deploy/vps`:

```bash
git checkout COMMIT_ANTERIOR
docker compose up -d --build --no-deps api renderer imports omr frontend
git checkout main
```

O último `checkout main` só volta o repositório para a próxima atualização; os contêineres seguem com o código anterior até lá.

Se a API falhou ao migrar, a transação foi desfeita e o banco ficou como estava. A migração 103 só acrescenta tabelas e colunas, mas a volta do código com ela já aplicada não foi testada. Só restaure o backup se os dados estiverem errados.
