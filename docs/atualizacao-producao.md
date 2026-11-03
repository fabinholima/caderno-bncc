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

## Pelo GitHub, com um clique

O workflow `Deploy produção` (`.github/workflows/deploy-producao.yml`) roda o mesmo script pelo SSH. Ele não dispara sozinho: em **Actions > Deploy produção > Run workflow**, escolha `dry-run` (só mostra o que mudaria) ou `atualizar` (publica). Só aceita a branch `main`, e uma execução espera a outra terminar.

A chave do GitHub só consegue rodar `deploy/deploy-remoto.sh`, que aceita apenas `dry-run` ou `atualizar` e impede duas atualizações ao mesmo tempo. Ela não abre terminal nem túnel.

### Configuração (uma vez)

1. **No seu computador**, crie uma chave só para o deploy, sem senha:

   ```bash
   ssh-keygen -t ed25519 -N "" -C deploy-github -f ~/.ssh/ufaprova-deploy
   ```

2. **No VPS**, com o mesmo usuário que roda `deploy/atualizar-producao.sh` (ele precisa usar o Docker e o `git` sem `sudo`), acrescente uma linha a `~/.ssh/authorized_keys`, com o conteúdo de `~/.ssh/ufaprova-deploy.pub` no lugar de `ssh-ed25519 AAAA...`:

   ```
   command="/opt/ufaprova/deploy/deploy-remoto.sh",restrict ssh-ed25519 AAAA... deploy-github
   ```

   O `deploy/deploy-remoto.sh` precisa já estar no servidor: rode `deploy/atualizar-producao.sh` uma vez à mão depois deste commit.

3. **No seu computador**, pegue a impressão do servidor (confira que o IP é o do VPS):

   ```bash
   ssh-keyscan -t ed25519 api.ufaprova.com.br
   ```

4. **No GitHub**, em Settings > Secrets and variables > Actions > New repository secret, crie:

   | Segredo | Valor |
   |---|---|
   | `VPS_HOST` | `api.ufaprova.com.br` |
   | `VPS_USER` | o usuário do passo 2 |
   | `VPS_SSH_KEY` | o conteúdo de `~/.ssh/ufaprova-deploy` (a chave privada) |
   | `VPS_KNOWN_HOSTS` | a linha do passo 3 |

5. Rode o workflow com `dry-run` para testar. Depois apague a chave privada do seu computador: o GitHub guarda a cópia.

Para revogar, apague a linha `deploy-github` de `~/.ssh/authorized_keys` no VPS.

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
