#!/usr/bin/env bash
# Atualiza o UfaProva no VPS da Hostinger (deploy/vps/docker-compose.yml).
# Ordem: código da main -> backup do banco -> build -> API (aplica as migrações
# ao iniciar) -> /health -> workers e portal. Veja docs/atualizacao-producao.md.
#
# Uso: deploy/atualizar-producao.sh [--dry-run]
# Variáveis (padrões entre parênteses):
#   COMPOSE_FILE        arquivo compose de produção (deploy/vps/docker-compose.yml)
#   API_SERVICE         serviço da API (api)
#   OTHER_SERVICES      reiniciados depois da API (renderer imports omr frontend)
#   DB_SERVICE          serviço do PostgreSQL no compose (postgres)
#   DB_USER, DB_NAME    usuário e banco (caderno)
#   BACKUP_DATABASE_URL use quando o banco não está no compose; ignora DB_SERVICE
#   PG_IMAGE            imagem com pg_dump para BACKUP_DATABASE_URL (postgres:18-alpine)
#   BACKUP_DIR          onde guardar os backups (backups/ ao lado do COMPOSE_FILE)
#   HEALTH_URL          (https://api.ufaprova.com.br/health)
#   HEALTH_TIMEOUT      segundos de espera pela API (300)
#   BRANCH              (main)
set -euo pipefail

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  '') ;;
  *) echo "Uso: $0 [--dry-run]" >&2; exit 2 ;;
esac

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_SERVICE="${API_SERVICE:-api}"
OTHER_SERVICES="${OTHER_SERVICES:-renderer imports omr frontend}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/deploy/vps/docker-compose.yml}"
DB_SERVICE="${DB_SERVICE:-postgres}"
DB_USER="${DB_USER:-caderno}"
DB_NAME="${DB_NAME:-caderno}"
PG_IMAGE="${PG_IMAGE:-postgres:18-alpine}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$COMPOSE_FILE")/backups}"
HEALTH_URL="${HEALTH_URL:-https://api.ufaprova.com.br/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"
BRANCH="${BRANCH:-main}"

compose_args=(-f "$COMPOSE_FILE")
compose() { docker compose "${compose_args[@]}" "$@"; }

step() { printf '\n== %s\n' "$*"; }
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
run() {
  printf '+ %s\n' "${*/#compose/docker compose}"
  [[ $DRY_RUN -eq 1 ]] || "$@"
}

# Comandos do PostgreSQL pelo serviço do compose ou, com BACKUP_DATABASE_URL,
# por um contêiner descartável na rede do host.
pg() {
  local tool="$1"; shift
  if [[ -n "${BACKUP_DATABASE_URL:-}" ]]; then
    docker run -i --rm --network host "$PG_IMAGE" "$tool" "$@"
  else
    compose exec -T "$DB_SERVICE" "$tool" -U "$DB_USER" "$@"
  fi
}
pg_target() {
  if [[ -n "${BACKUP_DATABASE_URL:-}" ]]; then printf '%s' "$BACKUP_DATABASE_URL"; else printf '%s' "$DB_NAME"; fi
}

PREVIOUS_COMMIT=''
BACKUP_FILE=''
on_exit() {
  local status=$?
  [[ $status -eq 0 || -z "$PREVIOUS_COMMIT" ]] && return
  printf '\nA atualização parou (código %s).\n' "$status" >&2
  if [[ $DRY_RUN -eq 0 ]] && compose ps --services 2>/dev/null | grep -qx "$API_SERVICE"; then
    echo "-- últimas linhas da API:" >&2
    compose logs --tail 60 "$API_SERVICE" >&2 || true
  fi
  if [[ $DRY_RUN -eq 0 ]]; then
    cat >&2 <<EOF

Para voltar ao código anterior:
  git -C "$REPO_DIR" checkout $PREVIOUS_COMMIT
  docker compose ${compose_args[*]} up -d --build --no-deps $API_SERVICE ${others[*]}
As migrações rodam numa transação: se a API falhou ao migrar, o banco não mudou.
EOF
  fi
  if [[ -n "$BACKUP_FILE" ]]; then
    echo "Backup feito antes da atualização: $BACKUP_FILE (restaure com pg_restore só se necessário)." >&2
  fi
}
trap on_exit EXIT

step "Verificações"
command -v docker >/dev/null || fail "docker não encontrado."
command -v curl >/dev/null || fail "curl não encontrado."
docker compose version >/dev/null || fail "o plugin docker compose não está instalado."
[[ -f "$COMPOSE_FILE" ]] || fail "arquivo compose não encontrado: $COMPOSE_FILE"
services="$(compose config --services)" || fail "não foi possível ler o arquivo compose."
required=("$API_SERVICE")
[[ -z "${BACKUP_DATABASE_URL:-}" ]] && required+=("$DB_SERVICE")
for service in "${required[@]}"; do
  grep -qx "$service" <<<"$services" || fail "serviço '$service' não existe no compose. Serviços: $(tr '\n' ' ' <<<"$services")"
done
# Os demais serviços são opcionais: só entram os que existem no compose.
others=()
for service in $OTHER_SERVICES; do
  if grep -qx "$service" <<<"$services"; then others+=("$service"); else echo "Aviso: serviço '$service' não existe no compose; ignorado."; fi
done
[[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]] || fail "há alterações locais no repositório. Guarde ou descarte antes de atualizar."
current_branch="$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" == "$BRANCH" ]] || fail "o repositório está em '$current_branch', esperado '$BRANCH'."
[[ $DRY_RUN -eq 1 ]] && echo "Modo --dry-run: nada será alterado."

step "Código"
PREVIOUS_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"
git -C "$REPO_DIR" fetch -q origin "$BRANCH"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "Commits que serão aplicados:"
  git -C "$REPO_DIR" log --oneline "HEAD..origin/$BRANCH"
else
  git -C "$REPO_DIR" merge --ff-only "origin/$BRANCH"
  echo "Antes: $PREVIOUS_COMMIT"
  echo "Agora: $(git -C "$REPO_DIR" rev-parse HEAD)"
fi

step "Migrações pendentes"
known="$(cd "$REPO_DIR/database" && ls | grep -E '^[0-9]{3}_.*\.sql$' | sort)"
[[ $DRY_RUN -eq 1 ]] && known="$(git -C "$REPO_DIR" ls-tree --name-only "origin/$BRANCH" database/ | sed 's|^database/||' | grep -E '^[0-9]{3}_.*\.sql$' | sort)"
applied="$(pg psql -d "$(pg_target)" -Atc 'SELECT filename FROM schema_migrations ORDER BY 1')" || fail "não foi possível consultar schema_migrations."
pending="$(comm -23 <(printf '%s\n' "$known") <(printf '%s\n' "$applied" | sort))"
if [[ -n "$pending" ]]; then printf '%s\n' "$pending"; else echo "Nenhuma."; fi

step "Backup do banco"
BACKUP_FILE="$BACKUP_DIR/caderno-$(date +%Y%m%d-%H%M%S)-${PREVIOUS_COMMIT:0:7}.dump"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "+ pg_dump -Fc > $BACKUP_FILE"
  BACKUP_FILE=''
else
  mkdir -p "$BACKUP_DIR"
  pg pg_dump -d "$(pg_target)" -Fc >"$BACKUP_FILE"
  [[ -s "$BACKUP_FILE" ]] || fail "o backup ficou vazio."
  pg pg_restore --list <"$BACKUP_FILE" >/dev/null || fail "o backup não pôde ser lido pelo pg_restore."
  echo "$BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
fi

step "Build"
run compose build "$API_SERVICE" "${others[@]}"

step "API"
run compose up -d --no-deps "$API_SERVICE"
if [[ $DRY_RUN -eq 0 ]]; then
  deadline=$((SECONDS + HEALTH_TIMEOUT))
  until body="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null)" && grep -q '"status":"ok"' <<<"$body"; do
    (( SECONDS < deadline )) || fail "a API não respondeu \"status\":\"ok\" em $HEALTH_URL após ${HEALTH_TIMEOUT}s."
    sleep 5
  done
  echo "$body"
  applied="$(pg psql -d "$(pg_target)" -Atc 'SELECT filename FROM schema_migrations ORDER BY 1')"
  missing="$(comm -23 <(printf '%s\n' "$known") <(printf '%s\n' "$applied" | sort))"
  [[ -z "$missing" ]] || fail "migrações ainda não aplicadas: $(tr '\n' ' ' <<<"$missing")"
  echo "Todas as migrações aplicadas."
fi

step "Workers e portal"
if [[ ${#others[@]} -gt 0 ]]; then run compose up -d --no-deps "${others[@]}"; else echo "Nenhum."; fi

step "Concluído"
[[ $DRY_RUN -eq 1 ]] || compose ps "$API_SERVICE" "${others[@]}"
[[ -n "$BACKUP_FILE" ]] && echo "Backup: $BACKUP_FILE"
exit 0
