#!/usr/bin/env sh
# Backup diário do PostgreSQL do VPS.
# 1. pg_dump em deploy/vps/backups (14 dias de cópias locais);
# 2. criptografa com age para a chave pública BACKUP_AGE_RECIPIENT do .env;
# 3. envia a cópia criptografada ao bucket S3 (BACKUP_BUCKET ou o dos arquivos).
# A chave privada do age fica FORA do servidor: quem invade o VPS não lê as
# cópias externas. Sem BACKUP_AGE_RECIPIENT ou se o envio falhar, o script sai
# com erro (o cron registra no log), mas a cópia local já terá sido gravada.
# Agende com: crontab -e  →  30 3 * * * /opt/ufaprova/deploy/vps/backup-postgres.sh >> /var/log/ufaprova-backup.log 2>&1
# Requer o age no host: sudo apt install age. Veja docs/backup-producao.md.
set -eu
cd "$(dirname "$0")"
stamp=$(date +%Y-%m-%d_%H%M)
dump="backups/ufaprova-$stamp.dump"
mkdir -p backups
docker compose exec -T postgres pg_dump -U caderno -d caderno -Fc -f "/backups/ufaprova-$stamp.dump"
[ -s "$dump" ] || { echo "ERRO: backup vazio: $dump" >&2; exit 1; }
docker compose exec -T postgres pg_restore --list "/backups/ufaprova-$stamp.dump" >/dev/null
find backups -name 'ufaprova-*.dump' -mtime +14 -delete
echo "Backup local: $dump"

recipient=$(sed -n 's/^BACKUP_AGE_RECIPIENT=//p' .env 2>/dev/null | tail -1)
[ -n "$recipient" ] || { echo "ERRO: defina BACKUP_AGE_RECIPIENT no .env para a cópia externa." >&2; exit 1; }
command -v age >/dev/null || { echo "ERRO: instale o age (sudo apt install age)." >&2; exit 1; }
age -r "$recipient" -o "$dump.age" "$dump"
trap 'rm -f "$dump.age"' EXIT
docker compose run --rm --no-deps -T -v "$PWD/backups:/backups:ro" api \
  node upload-backup.mjs "/backups/ufaprova-$stamp.dump.age"
