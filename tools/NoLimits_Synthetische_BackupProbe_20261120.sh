#!/usr/bin/env bash
# NoLimits: an entirely synthetic PostgreSQL alias-table backup and restore drill.
# NEVER connects to Supabase. NEVER captures or stores real customer data.
set -euo pipefail
test -f supabase/migrations/NoLimits_AliasMapping_20261119.sql || {
  echo "Run this script from the NoLimits repository root." >&2
  exit 2
}
command -v docker >/dev/null || { echo "Docker required." >&2; exit 2; }

name="nolimits-synthetic-backup-$$"
backup="${TMPDIR:-/tmp}/NoLimits_AliasTestBackup_20261120_$$.dump"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -f "$backup"
}
trap cleanup EXIT INT TERM

docker run -d --rm --name "$name" \
  -e POSTGRES_PASSWORD=synthetic_test_only \
  -e POSTGRES_DB=nolimits_restore \
  postgres:17 >/dev/null
ready=0
for attempt in $(seq 1 40); do
  if docker exec "$name" pg_isready -U postgres -d nolimits_restore >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
test "$ready" -eq 1 || { echo "Synthetic Postgres did not start"; exit 1; }
docker exec -i "$name" psql -U postgres -d nolimits_restore -v ON_ERROR_STOP=1 <<'ROLES'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
ROLES

docker exec -i "$name" psql -U postgres -d nolimits_restore -v ON_ERROR_STOP=1 \
  < supabase/migrations/NoLimits_AliasMapping_20261119.sql >/dev/null
docker exec -i "$name" psql -U postgres -d nolimits_restore -v ON_ERROR_STOP=1 <<'SYNTHETIC'
INSERT INTO public.nl_booking_email_aliases
  (alias_email,customer_email,event_type_id,booking_uid)
VALUES
  ('info+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@localboost-zs.ch',
   'fake-customer@example.invalid',7982460,'NoLimitsBackupTestUID12345');
SYNTHETIC

docker exec "$name" pg_dump -U postgres -d nolimits_restore \
  --format=custom --table=public.nl_booking_email_aliases > "$backup"
test -s "$backup"
docker exec -i "$name" pg_restore --list < "$backup" \
  | grep -q 'TABLE DATA public nl_booking_email_aliases'

# A completely removed table is rebuilt from the local synthetic dump.
docker exec "$name" psql -U postgres -d nolimits_restore \
  -v ON_ERROR_STOP=1 -c 'DROP TABLE public.nl_booking_email_aliases CASCADE;' >/dev/null
docker exec -i "$name" pg_restore -U postgres -d nolimits_restore \
  --exit-on-error --no-owner < "$backup"

value=$(docker exec "$name" psql -U postgres -d nolimits_restore -tAX \
  -v ON_ERROR_STOP=1 -c "
SELECT
 (SELECT count(*) FROM public.nl_booking_email_aliases)=1
 AND (SELECT bool_and(event_type_id=7982460 AND
     customer_email='fake-customer@example.invalid'
     AND booking_uid='NoLimitsBackupTestUID12345')
     FROM public.nl_booking_email_aliases)
 AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.nl_booking_email_aliases'::regclass)
 AND has_table_privilege('service_role','public.nl_booking_email_aliases','SELECT')
 AND has_table_privilege('service_role','public.nl_booking_email_aliases','INSERT')
 AND has_table_privilege('service_role','public.nl_booking_email_aliases','UPDATE')
 AND has_table_privilege('service_role','public.nl_booking_email_aliases','DELETE')
 AND NOT has_table_privilege('authenticated','public.nl_booking_email_aliases','SELECT')
 AND NOT has_table_privilege('anon','public.nl_booking_email_aliases','SELECT');")
test "$value" = "t" || {
  echo "FAIL: synthetic restore lost rows, server privileges or RLS controls." >&2
  exit 1
}
echo "PASS: completely removed synthetic alias table restored with one fictional booking, RLS and restricted service_role CRUD. No real data accessed."
