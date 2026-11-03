# Atualização da produção (VPS Hostinger com Docker Compose)

A produção roda num VPS da Hostinger. A API e o worker OMR são serviços do Docker Compose, e o Caddy atende `https://api.ufaprova.com.br`. O merge na `main` não publica nada: a atualização é feita no servidor com `deploy/atualizar-producao.sh`.

## O que o script faz

1. Confere o Docker, o Compose, os nomes dos serviços e se o repositório está limpo na `main`.
2. Traz a `main` com `git merge --ff-only`. Se houve commit local divergente, para sem mexer.
3. Lista as migrações que ainda não estão em `schema_migrations`.
4. Faz o backup do banco com `pg_dump -Fc` em `backups/` e confere o arquivo com `pg_restore --list`. Sem backup válido, não segue.
5. Gera as imagens da API e do worker.
6. Reinicia a API. Ela aplica as migrações ao iniciar, numa única transação.
7. Espera `/health` responder `"status":"ok"` e confere se todas as migrações foram aplicadas.
8. Só então reinicia o worker OMR. Ao iniciar, ele converte em "publicado (legado)" os resultados que a versão anterior concluiu durante a troca.

O banco não é reiniciado (`--no-deps`). Se algo falhar, o script mostra as últimas linhas da API, o commit anterior e o caminho do backup.

## Como usar

No servidor, pelo SSH do painel da Hostinger, dentro do repositório:

```bash
deploy/atualizar-producao.sh --dry-run
deploy/atualizar-producao.sh
```

O `--dry-run` mostra os commits novos, as migrações pendentes e os comandos, sem alterar nada. Ele precisa ler `schema_migrations`, então o banco precisa estar acessível.

Os padrões são: serviços `api`, `omr` e `postgres`, usuário e banco `caderno`, e `https://api.ufaprova.com.br/health`. Se o compose do servidor usar outros nomes, informe por variável:

```bash
COMPOSE_FILE=/caminho/docker-compose.prod.yml API_SERVICE=caderno-api OMR_SERVICE=caderno-omr DB_SERVICE=db deploy/atualizar-producao.sh
```

Se o nome estiver errado, o script lista os serviços que existem. As outras variáveis estão no início do script.

Se o banco não estiver no compose, por exemplo num banco gerenciado, use `BACKUP_DATABASE_URL`. O backup então roda num contêiner `postgres:17-alpine` descartável. A versão do `pg_dump` (`PG_IMAGE`) precisa ser igual ou mais nova que a do servidor.

O compose precisa construir as imagens a partir do repositório (`build:`). Se os serviços usarem uma imagem de registro (`image:` sem `build:`), o build não muda nada e a API reinicia com o código antigo.

## Backups

Os arquivos ficam em `backups/caderno-AAAAMMDD-HHMMSS-<commit>.dump`. A pasta não é apagada pelo script: remova os antigos manualmente e mantenha cópia fora do VPS (por exemplo, o backup do painel da Hostinger).

Restaurar substitui os dados atuais. Use só depois de conferir o problema:

```bash
docker compose exec -T postgres pg_restore -U caderno -d caderno --clean --if-exists < backups/ARQUIVO.dump
```

## Voltar à versão anterior

O script imprime o commit anterior ao falhar. Para voltar o código:

```bash
git checkout COMMIT_ANTERIOR
docker compose up -d --build --no-deps api omr
git checkout main
```

O último `checkout main` só volta o repositório para a próxima atualização; os contêineres seguem com o código anterior até lá.

Se a API falhou ao migrar, a transação foi desfeita e o banco ficou como estava. A migração 103 só acrescenta tabelas e colunas, mas a volta do código com ela já aplicada não foi testada. Só restaure o backup se os dados estiverem errados.
