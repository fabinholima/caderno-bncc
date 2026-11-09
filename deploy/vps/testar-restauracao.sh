#!/usr/bin/env sh
# Restaura o backup local mais recente (ou o informado) num banco descartável
# e compara com o banco em uso. Não toca no banco "caderno".
# Uso: deploy/vps/testar-restauracao.sh [backups/ufaprova-AAAA-MM-DD_HHMM.dump]
# Agende uma vez por semana: 0 5 * * 0 /opt/ufaprova/deploy/vps/testar-restauracao.sh >> /var/log/ufaprova-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
dump=${1:-$(ls -1t backups/ufaprova-*.dump 2>/dev/null | head -1)}
[ -n "$dump" ] && [ -s "$dump" ] || { echo "ERRO: nenhum backup encontrado em backups/." >&2; exit 1; }
check=caderno_restauracao_teste
psql() { docker compose exec -T postgres psql -U caderno -v ON_ERROR_STOP=1 -Atq "$@"; }
counts="SELECT (SELECT count(*) FROM schema_migrations)||' migrações, '||(SELECT count(*) FROM users)||' usuários, '||(SELECT count(*) FROM questions)||' questões, '||(SELECT count(*) FROM assessment_results)||' resultados'"

trap 'psql -d postgres -c "DROP DATABASE IF EXISTS $check" >/dev/null 2>&1 || true' EXIT
psql -d postgres -c "DROP DATABASE IF EXISTS $check" -c "CREATE DATABASE $check"
docker compose exec -T postgres pg_restore -U caderno -d "$check" --no-owner --no-acl --exit-on-error "/backups/$(basename "$dump")"
restored=$(psql -d "$check" -c "$counts")
current=$(psql -d caderno -c "$counts")
echo "Backup $dump restaurado: $restored"
echo "Banco em uso:            $current"
migrations() { printf '%s' "$1" | cut -d' ' -f1; }
[ "$(migrations "$restored")" = "$(migrations "$current")" ] || {
  echo "AVISO: o backup tem outro número de migrações (o banco mudou depois do backup?)." >&2
}
echo "Restauração verificada."
