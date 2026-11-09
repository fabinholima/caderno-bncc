# Backup de produção (VPS)

O banco é copiado todo dia em três camadas:

1. **Cópia local** em `deploy/vps/backups/ufaprova-AAAA-MM-DD_HHMM.dump`
   (`pg_dump -Fc`, conferida com `pg_restore --list`, 14 dias).
2. **Cópia externa criptografada** no S3: o dump é criptografado com
   [age](https://age-encryption.org) para uma chave pública e enviado como
   `backups/postgres/ufaprova-….dump.age`. A chave privada não fica no VPS.
3. **Teste semanal de restauração** num banco descartável.

O backup semanal da Hostinger continua como camada extra.

## Configuração (uma vez)

No **seu computador** (não no VPS), gere o par de chaves e guarde a privada em
local seguro (gerenciador de senhas, cofre). Sem ela, as cópias externas não
podem ser lidas:

```sh
age-keygen -o ufaprova-backup.key
# a linha "public key: age1..." é a chave pública
```

No VPS:

```sh
sudo apt install age
cd /opt/ufaprova/deploy/vps
# no .env: BACKUP_AGE_RECIPIENT=age1...  (e, de preferência, BACKUP_BUCKET=)
./backup-postgres.sh          # primeira execução, manual
./testar-restauracao.sh       # restaura o backup num banco descartável
crontab -e
```

```cron
30 3 * * * /opt/ufaprova/deploy/vps/backup-postgres.sh >> /var/log/ufaprova-backup.log 2>&1
0 5 * * 0 /opt/ufaprova/deploy/vps/testar-restauracao.sh >> /var/log/ufaprova-backup.log 2>&1
```

Recomendações para o bucket de backups: credencial só com permissão de
gravação (sem apagar), versionamento ou bloqueio de objetos ligado e regra de
retenção (por exemplo, 90 dias). Assim, quem invadir o VPS não consegue apagar
as cópias externas.

Confira o log de tempos em tempos: `tail -50 /var/log/ufaprova-backup.log`.
O script sai com erro quando falta `BACKUP_AGE_RECIPIENT` ou quando o envio
falha; a cópia local já terá sido gravada.

## Restaurar a partir da cópia externa

Baixe o arquivo `.dump.age` do bucket e, no computador que tem a chave privada:

```sh
age -d -i ufaprova-backup.key -o ufaprova.dump ufaprova-AAAA-MM-DD_HHMM.dump.age
```

Copie `ufaprova.dump` para `deploy/vps/backups/` no servidor e confira primeiro
com `./testar-restauracao.sh backups/ufaprova.dump`. Restaurar sobre o banco em
uso substitui os dados atuais; veja `docs/atualizacao-producao.md`.
