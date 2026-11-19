-- NoLimits Alias-Buchungen (STAGING; not applied automatically) 2026-11-19
-- Target ONLY Supabase project: jcctdjjunxmxaphjkrsz (NoLimits Barbershop).
-- Do not apply to LocalBoost System database.
begin;
create table if not exists public.nl_booking_email_aliases (
  alias_email text primary key,
  customer_email text not null,
  event_type_id integer not null,
  booking_uid text,
  created_at timestamptz not null default now(),
  constraint nl_alias_email_format check (length(alias_email) <= 120 and alias_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$'),
  constraint nl_alias_customer_email_format check (length(customer_email) <= 120 and customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$'),
  constraint nl_alias_uid_length check (booking_uid is null or length(booking_uid) between 12 and 120)
);
create unique index if not exists nl_booking_alias_booking_uid_unique
  on public.nl_booking_email_aliases (booking_uid) where booking_uid is not null;
create index if not exists nl_booking_alias_created_at_idx
  on public.nl_booking_email_aliases (created_at);
alter table public.nl_booking_email_aliases enable row level security;
revoke all on table public.nl_booking_email_aliases from public, anon, authenticated;
grant select, insert, update on public.nl_booking_email_aliases to service_role;
-- Deliberately no RLS policies for anon/authenticated.
-- Only a server-side Supabase secret key in Cloudflare Workers may access rows.
commit;
