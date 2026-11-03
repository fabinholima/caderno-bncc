#!/usr/bin/env bash
# Comando forçado da chave SSH de deploy (GitHub Actions, "Deploy produção").
# Em ~/.ssh/authorized_keys do VPS, a chave só pode rodar este arquivo:
#   command="/opt/ufaprova/deploy/deploy-remoto.sh",restrict ssh-ed25519 AAAA... deploy-github
# O pedido chega em SSH_ORIGINAL_COMMAND e só vale "dry-run" ou "atualizar".
# Veja docs/atualizacao-producao.md.
set -euo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/atualizar-producao.sh"

case "${SSH_ORIGINAL_COMMAND:-}" in
  dry-run) args=(--dry-run) ;;
  atualizar) args=() ;;
  *) echo "Pedido não aceito: use 'dry-run' ou 'atualizar'." >&2; exit 2 ;;
esac

# Uma atualização por vez, mesmo que alguém rode o script à mão ao mesmo tempo.
exec 9>"${TMPDIR:-/tmp}/ufaprova-deploy.lock"
if ! flock -n 9; then
  echo "Já existe uma atualização em andamento no servidor." >&2
  exit 75
fi

"$SCRIPT" "${args[@]}"
