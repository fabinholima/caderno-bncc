#!/usr/bin/env sh
# Backup diário do PostgreSQL do VPS. Guarda 14 dias em deploy/vps/backups.
# Agende com: crontab -e  →  30 3 * * * /opt/ufaprova/deploy/vps/backup-postgres.sh
# Copie de tempos em tempos a pasta backups/ para fora do servidor (ex.: seu computador).
set -eu
cd "$(dirname "$0")"
stamp=$(date +%Y-%m-%d_%H%M)
mkdir -p backups
docker compose exec -T postgres pg_dump -U caderno -d caderno -Fc -f "/backups/ufaprova-$stamp.dump"
find backups -name 'ufaprova-*.dump' -mtime +14 -delete
echo "Backup salvo: backups/ufaprova-$stamp.dump"
