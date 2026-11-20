#!/usr/bin/env bash
# NoLimits: server-side backup template. NOT deployed or scheduled.
# Requires a private root-owned EnvironmentFile on the Home Server, never GitHub.
# Streams logical PostgreSQL backup straight into encrypted restic; no plaintext SQL file.
set -euo pipefail
umask 077

PROJECT_REF="jcctdjjunxmxaphjkrsz"
BACKUP_TAG="nolimits-supabase"
for cmd in pg_dump restic stat; do
  command -v "$cmd" >/dev/null || { echo "Missing required program: $cmd" >&2; exit 2; }
done
for name in PGHOST PGPORT PGUSER PGDATABASE PGPASSFILE PGSSLMODE RESTIC_REPOSITORY RESTIC_PASSWORD_FILE; do
  test -n "${!name:-}" || { echo "Required private setting missing: $name" >&2; exit 2; }
done
test -z "${PGPASSWORD:-}" || { echo "Use PGPASSFILE rather than PGPASSWORD." >&2; exit 2; }
case "$PGHOST" in
  "db.${PROJECT_REF}.supabase.co")
    test "$PGUSER" = postgres || { echo "Wrong direct connection user." >&2; exit 2; };;
  *.pooler.supabase.com)
    test "$PGUSER" = "postgres.${PROJECT_REF}" || {
      echo "Wrong session pooler user for NoLimits project." >&2; exit 2; };;
  *) echo "Refusing unknown PostgreSQL host." >&2; exit 2;;
esac
test "$PGPORT" = 5432 || { echo "Only direct/session-pooler port 5432 allowed." >&2; exit 2; }
test "$PGDATABASE" = postgres || { echo "Expected database postgres." >&2; exit 2; }
test "$PGSSLMODE" = verify-full || { echo "Require TLS verification." >&2; exit 2; }
for file in "$PGPASSFILE" "$RESTIC_PASSWORD_FILE"; do
  test -r "$file" && test "$(stat -c %a "$file")" = 600 || {
    echo "Missing/unreadable or non-private credentials file." >&2; exit 2;
  }
done
pg_major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
test "$pg_major" -ge 17 || { echo "pg_dump 17+ required." >&2; exit 2; }
# Repository must already be initialised and readable; no hidden paid add-ons.
restic snapshots --last >/dev/null

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="NoLimits_SupabaseLogical_${timestamp}.dump"
echo "Starting protected NoLimits Supabase logical backup."
# Full DB logical archive: includes auth/public/storage metadata, but NOT
# files in Supabase Storage or external app credentials/configuration.
# No plaintext SQL file is written; pg_dump is read-only.
pg_dump --format=custom --no-owner --no-privileges --compress=6 |
  restic backup --stdin --stdin-filename "$archive" --tag "$BACKUP_TAG" --quiet
echo "PASS: Encrypted backup committed; restore test to isolated DB still mandatory."
