# UfaProva no VPS da Hostinger (KVM 2)

Guia para colocar o UfaProva num único servidor (2 vCPU, 8 GB, 100 GB) e migrar
os dados do Render **copiando** o banco — o Render não é alterado e fica como
plano de volta até você decidir desligá-lo.

**O VPS é o único caminho oficial de produção.** O `render.yaml` saiu do
repositório: os serviços que ainda existirem no painel do Render não recebem
mais atualizações automáticas e devem ser desligados lá depois da migração.

Arquivos usados: `deploy/vps/` (docker-compose, Caddyfile, .env.example,
frontend.Dockerfile, backup-postgres.sh).

---

## 1. Preparar o servidor (uma vez)

No painel da Hostinger: sistema **Debian 12** ou **Ubuntu 24.04** puro (sem
painel), anote o **IP** e entre por SSH (`ssh root@IP`).

```sh
# Atualizações e firewall (só SSH, HTTP e HTTPS)
apt update && apt -y upgrade
apt -y install git ufw unattended-upgrades
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable

# Memória de troca de 4 GB: evita travar no build e na geração de PDFs
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sh
```

## 2. Baixar o projeto

O repositório é privado. Crie uma **Deploy key** (somente leitura):

```sh
ssh-keygen -t ed25519 -f ~/.ssh/ufaprova -N ''
cat ~/.ssh/ufaprova.pub   # copie este texto
```

No GitHub: repositório → **Settings → Deploy keys → Add deploy key** (sem
permissão de escrita). Depois:

```sh
printf 'Host github.com\n  IdentityFile ~/.ssh/ufaprova\n' >> ~/.ssh/config
git clone git@github.com:fabinholima/caderno-bncc.git /opt/ufaprova
cd /opt/ufaprova/deploy/vps
cp .env.example .env
nano .env
```

Preencha o `.env`. Os itens **COPIAR DO RENDER** estão no painel do Render, em
cada serviço → **Environment**. Atenção especial:

- `CPF_HASH_SECRET` **idêntico** ao do Render (senão os CPFs não batem).
- `QR_SIGNING_SECRET` idêntico ao do Render (ou em branco, se lá não existir).
- `POSTGRES_PASSWORD`: gere um novo com `openssl rand -hex 24`.
- Para o teste (passo 4), use domínios temporários:
  `SITE_DOMAIN=novo.ufaprova.com.br` e `API_DOMAIN=api-novo.ufaprova.com.br`.

## 3. Copiar o banco do Render (somente leitura)

No Render: **ufaprova-postgres → Connect → External Database URL**. Esse
endereço é usado **apenas para ler** (pg_dump não altera nada no Render).

```sh
cd /opt/ufaprova/deploy/vps
docker compose up -d postgres            # só o banco novo, vazio
mkdir -p backups

# Cópia de leitura do banco do Render → arquivo local
docker compose exec -T postgres pg_dump "COLE_AQUI_A_EXTERNAL_DATABASE_URL" \
  --no-owner --no-acl -Fc -f /backups/render-inicial.dump

# Restaura no banco NOVO deste servidor
docker compose exec -T postgres pg_restore -U caderno -d caderno \
  --no-owner --no-acl /backups/render-inicial.dump
```

> Nunca rode `pg_restore`, `psql < arquivo.sql` ou scripts de seed usando o
> endereço do Render: eles escreveriam no banco de produção.

## 4. Subir tudo e testar (sem mexer no domínio principal)

No seu provedor de DNS (Registro.br ou onde o domínio está), crie registros
**A** apontando para o IP do VPS:

| Nome       | Tipo | Valor     |
| ---------- | ---- | --------- |
| `novo`     | A    | IP do VPS |
| `api-novo` | A    | IP do VPS |

```sh
cd /opt/ufaprova/deploy/vps
docker compose up -d --build     # o primeiro build leva de 15 a 30 minutos
docker compose ps                # todos devem ficar "running"/"healthy"
docker compose logs -f api       # Ctrl+C para sair
```

Abra `https://novo.ufaprova.com.br`, faça login, confira questões, turmas e
gere um PDF de teste.

> Não cadastre nada de verdade no servidor novo durante o teste: o passo 5
> apaga o banco do VPS e copia o do Render de novo. Cadastros reais continuam
> no portal do Render até a troca.

## 5. Trocar para o endereço definitivo

1. Avise os usuários (alguns minutos de pausa).
2. No Render, **suspenda** (não apague) `ufaprova-frontend`, `ufaprova-api` e os
   workers, para ninguém gravar dados durante a troca.
3. Repita o passo 3 com uma cópia nova (`render-final.dump`), recriando o banco:
   ```sh
   docker compose stop api renderer imports omr frontend
   docker compose exec -T postgres psql -U caderno -d postgres -c "DROP DATABASE caderno WITH (FORCE);" -c "CREATE DATABASE caderno OWNER caderno;"
   docker compose exec -T postgres pg_dump "EXTERNAL_DATABASE_URL" --no-owner --no-acl -Fc -f /backups/render-final.dump
   docker compose exec -T postgres pg_restore -U caderno -d caderno --no-owner --no-acl /backups/render-final.dump
   ```
4. No `.env`, troque para `SITE_DOMAIN=ufaprova.com.br` e
   `API_DOMAIN=api.ufaprova.com.br`.
5. No DNS: `@` (ufaprova.com.br), `www` e `api` → registros **A** com o IP do VPS.
6. `docker compose up -d --build`
7. Atualize os serviços externos:
   - **Google Cloud Console** → credencial OAuth → URI de redirecionamento:
     `https://api.ufaprova.com.br/api/auth/google/callback`
   - **Mercado Pago** → webhook: `https://api.ufaprova.com.br/api/billing/webhook`
8. Teste login, geração de PDF, importação e correção.

Se depois faltar algum cadastro, veja `docs/recuperar-questoes.md`.

Mantenha o Render **suspenso por 1–2 semanas**. Se algo der errado, basta voltar
o DNS e reativar os serviços de lá.

## 6. Rotina

- **Atualizar o sistema** (após um merge na `main`):
  ```sh
  cd /opt/ufaprova && deploy/atualizar-producao.sh
  ```
  Ou pelo GitHub: Actions > Deploy produção > Run workflow (configuração em
  `docs/atualizacao-producao.md`).
  O script faz o backup do banco antes, reinicia a API (que aplica as
  migrações), confere `/health` e só então os workers e o portal. Veja
  `docs/atualizacao-producao.md`. Nunca faça commit no servidor: a chave é
  somente leitura e a `main` local deixaria de acompanhar o GitHub.
- **Backup diário** (03h30):
  ```sh
  crontab -e
  # acrescente a linha:
  30 3 * * * /opt/ufaprova/deploy/vps/backup-postgres.sh >> /var/log/ufaprova-backup.log 2>&1
  ```
  O script grava a cópia local e envia uma cópia criptografada (age) ao S3.
  Configure `BACKUP_AGE_RECIPIENT` e o teste semanal de restauração conforme
  `docs/backup-producao.md`. O backup semanal da Hostinger é uma camada extra.
- **Espaço em disco**: `docker system prune -f` remove imagens antigas.
- **Logs**: `docker compose logs --tail 100 NOME` (api, renderer, imports, omr,
  frontend, monitor, caddy, postgres). A API grava uma linha JSON por
  requisição (`requestId`, método, caminho sem query string, status, duração).
  Toda resposta leva o cabeçalho `x-request-id`, e o erro 500 devolve o mesmo
  `requestId` no corpo: para achar o erro relatado por um usuário,
  `docker compose logs api | grep ID`.
- **Alertas**: preencha `ALERT_EMAIL_TO` no `.env` (e-mails separados por
  vírgula; usa o mesmo Resend do login). Chega um e-mail quando a API responde
  5 erros 5xx em 5 minutos (no máximo um a cada 30 minutos) e quando o serviço
  `monitor` vê a API ou o portal falharem 3 checagens seguidas (outro quando
  voltam). Sem `ALERT_EMAIL_TO`, os alertas ficam só no log.
- **Disco**: o serviço `monitor` também manda e-mail quando o disco passa de 80%
  (`DISK_ALERT_PERCENT` no `.env`) e quando volta a ficar abaixo de 75%.
- **Imagens dos cartões fora do banco**: com `FILE_STORAGE_PROVIDER=s3`, os
  cartões novos e as imagens de revisão vão para o S3, e o banco guarda só a
  referência. Para mover as imagens antigas (uma vez; pode repetir):
  ```sh
  docker compose run --rm --no-deps api node move-scan-images.mjs
  ```
  O espaço só volta ao disco depois de um `VACUUM FULL card_scans` (bloqueia a
  tabela; rode fora do horário de aula).
- **Usuário dos containers**: API, workers e portal rodam como o usuário `node`
  (uid 1000), não como root. O serviço `volume-permissions` ajusta o dono dos
  volumes de dados antes de a API subir; o script de atualização também o executa.

## Uso de memória no KVM 2

O gerador de PDFs roda um por vez (`PREVIEW_CONCURRENCY=1`) e a memória de troca
de 4 GB absorve os picos. Se os PDFs ficarem lentos com muitos professores ao
mesmo tempo, suba para o KVM 4 pelo painel da Hostinger — não é preciso migrar.
