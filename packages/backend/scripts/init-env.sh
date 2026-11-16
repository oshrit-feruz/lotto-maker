#!/usr/bin/env bash
# Creates packages/backend/.env from .env.development.example with fresh random secrets.
# Never overwrites an existing .env.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo "packages/backend/.env already exists; not touching it. Delete it first to start over." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

secret() { openssl rand -hex 32; }      # 64 chars
key32() { openssl rand -base64 32; }    # 32 bytes, base64 (may contain "/", hence sed's "|" delimiter)

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cp .env.development.example "$tmp"

fill() {
  local name="$1" value="$2"
  sed -i.bak "s|^${name}=__GENERATE__\$|${name}=${value}|" "$tmp" && rm -f "$tmp.bak"
}
fill JWT_SECRET "$(secret)"
fill JWT_REFRESH_SECRET "$(secret)"
fill PAYMENT_WEBHOOK_SECRET "$(secret)"
fill ID_ENCRYPTION_KEY "$(key32)"
fill ID_HASH_KEY "$(key32)"

if grep -q '__GENERATE__' "$tmp"; then
  echo "init-env: some placeholders were not filled" >&2
  exit 1
fi

# ln fails if .env already exists, so a concurrent run can never replace it.
if ! ln "$tmp" .env 2>/dev/null; then
  echo "init-env: packages/backend/.env already exists; not overwriting" >&2
  exit 1
fi
rm -f "$tmp"
trap - EXIT
chmod 600 .env
echo "Created packages/backend/.env. Check DATABASE_URL and set SEED_ADMIN_PHONE before seeding."
