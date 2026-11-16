-- NoLimits Customer CRM improvements, 2026-11-16
-- Apply ONLY to the isolated NoLimits Supabase project jcctdjjunxmxaphjkrsz.
-- Customer emails are synced from auth.users in a secured database trigger.
alter table public.nl_customer_profiles
  add column if not exists email text not null default '';
alter table public.nl_customer_profiles
  drop constraint if exists nl_customer_profiles_email_length;
alter table public.nl_customer_profiles
  add constraint nl_customer_profiles_email_length check (char_length(email)<=120);
create or replace function public.nl_customer_profile_auth_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.nl_customer_profiles(user_id,email)
  values (new.id, lower(coalesce(new.email,'')))
  on conflict(user_id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function public.nl_customer_profile_auth_sync() from public, anon, authenticated;
drop trigger if exists nl_customer_auth_sync on auth.users;
create trigger nl_customer_auth_sync after insert or update of email on auth.users
for each row execute function public.nl_customer_profile_auth_sync();
-- An initial backfill never overwrites customer-entered profile fields.
insert into public.nl_customer_profiles(user_id,email)
  select id, lower(coalesce(email,'')) from auth.users
  on conflict(user_id) do update set email=excluded.email;
-- Do not allow authenticated visitors to forge the email of their account
-- through direct REST updates; email is always synced from auth.users.
create or replace function public.nl_customer_profile_email_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select lower(coalesce(u.email,'')) into new.email
  from auth.users u where u.id=new.user_id;
  if new.email is null then raise exception 'Cannot verify profile email'; end if;
  return new;
end;
$$;
revoke all on function public.nl_customer_profile_email_guard() from public, anon, authenticated;
drop trigger if exists nl_customer_profile_guard on public.nl_customer_profiles;
create trigger nl_customer_profile_guard before insert or update on public.nl_customer_profiles
for each row execute function public.nl_customer_profile_email_guard();
-- Active staff may read profiles to provide customer history, ordinary
-- customers may still only read and update their own profile under RLS.
drop policy if exists nl_active_staff_read_customer_profiles on public.nl_customer_profiles;
create policy nl_active_staff_read_customer_profiles
  on public.nl_customer_profiles for select to authenticated
  using (exists(
    select 1 from public.nl_staff s
    where s.user_id=(select auth.uid()) and s.active=true
      and s.role in ('owner','staff')
  ));
-- Intentionally no staff modification/delete policies for customer profiles.
