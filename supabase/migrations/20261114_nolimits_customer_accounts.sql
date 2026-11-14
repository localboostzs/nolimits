-- NoLimits customer accounts - deploy to a dedicated NoLimits Supabase project.
-- This file MUST NOT be applied to the existing LocalBoost System project.
-- Use Supabase Dashboard SQL editor or a managed Supabase migration in the new project.
-- Table Data API exposure must be explicitly enabled if the project uses the 2026 secure API defaults.

create table if not exists public.nl_customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check(char_length(full_name)<=80),
  phone text not null default '' check(char_length(phone)<=30),
  address text not null default '' check(char_length(address)<=160),
  last_service_key text check(char_length(last_service_key)<=80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nl_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.nl_customer_profiles enable row level security;
alter table public.nl_staff enable row level security;
revoke all on public.nl_customer_profiles, public.nl_staff from anon, authenticated;
grant select, insert, update on public.nl_customer_profiles to authenticated;
grant select on public.nl_staff to authenticated;

drop policy if exists "nl_customer_profile_own_select" on public.nl_customer_profiles;
create policy "nl_customer_profile_own_select" on public.nl_customer_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "nl_customer_profile_own_insert" on public.nl_customer_profiles;
create policy "nl_customer_profile_own_insert" on public.nl_customer_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "nl_customer_profile_own_update" on public.nl_customer_profiles;
create policy "nl_customer_profile_own_update" on public.nl_customer_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "nl_staff_own_select" on public.nl_staff;
create policy "nl_staff_own_select" on public.nl_staff
  for select to authenticated using ((select auth.uid()) = user_id);

-- Neither anonymous users nor signed-in users have INSERT/UPDATE/DELETE rights on staff.
-- Once Isen has registered and confirmed his email, get his UID from Auth > Users,
-- then run ONE manual admin-only SQL statement:
-- INSERT INTO public.nl_staff(user_id, role, active)
-- VALUES ('<ISEN_AUTH_USER_UUID>', 'owner', true);
-- Never assign administrator rights based on a client-supplied email or metadata.


-- Existing Wix contacts remain separate from Supabase-authenticated customer profiles.
-- They are imported ONLY after the shop owner explicitly approves data transfer.
create table if not exists public.nl_legacy_contacts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'wix',
  external_id text not null unique check(char_length(external_id)<=180),
  name text not null default '' check(char_length(name)<=100),
  email text not null default '' check(char_length(email)<=120),
  phone text not null default '' check(char_length(phone)<=30),
  imported_at timestamptz not null default now()
);
alter table public.nl_legacy_contacts enable row level security;
revoke all on public.nl_legacy_contacts from anon, authenticated;
grant select, insert, update on public.nl_legacy_contacts to authenticated;

drop policy if exists "nl_staff_read_legacy_contacts" on public.nl_legacy_contacts;
create policy "nl_staff_read_legacy_contacts" on public.nl_legacy_contacts
  for select to authenticated
  using (
    exists (select 1 from public.nl_staff s
      where s.user_id=(select auth.uid()) and s.active=true)
  );
drop policy if exists "nl_staff_insert_legacy_contacts" on public.nl_legacy_contacts;
create policy "nl_staff_insert_legacy_contacts" on public.nl_legacy_contacts
  for insert to authenticated
  with check (
    exists (select 1 from public.nl_staff s
      where s.user_id=(select auth.uid()) and s.active=true)
  );
drop policy if exists "nl_staff_update_legacy_contacts" on public.nl_legacy_contacts;
create policy "nl_staff_update_legacy_contacts" on public.nl_legacy_contacts
  for update to authenticated
  using (
    exists (select 1 from public.nl_staff s
      where s.user_id=(select auth.uid()) and s.active=true)
  )
  with check (
    exists (select 1 from public.nl_staff s
      where s.user_id=(select auth.uid()) and s.active=true)
  );
