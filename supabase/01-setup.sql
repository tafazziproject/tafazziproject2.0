-- TAFAZZI - setup Supabase
-- Esegui questo file una sola volta nel SQL Editor di Supabase.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.audios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  safe boolean not null default true,
  shortcut text null check (shortcut is null or char_length(shortcut) = 1),
  storage_path text not null unique,
  original_filename text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

alter table public.audios enable row level security;

grant select on table public.audios to anon, authenticated;
grant insert, update, delete on table public.audios to authenticated;

drop policy if exists "Public can read audios" on public.audios;
create policy "Public can read audios"
on public.audios
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert audios" on public.audios;
create policy "Admins can insert audios"
on public.audios
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update audios" on public.audios;
create policy "Admins can update audios"
on public.audios
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete audios" on public.audios;
create policy "Admins can delete audios"
on public.audios
for delete
to authenticated
using (public.is_admin());

-- Bucket pubblico: gli utenti del frontend devono poter ascoltare i file senza login.
insert into storage.buckets (id, name, public, file_size_limit)
values ('audio', 'audio', true, 31457280)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- La lettura è pubblica. Upload/cancellazione richiedono un account presente in public.admins.
drop policy if exists "Public can read audio files" on storage.objects;
create policy "Public can read audio files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'audio');

drop policy if exists "Admins can upload audio files" on storage.objects;
create policy "Admins can upload audio files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'audio' and public.is_admin());

drop policy if exists "Admins can delete audio files" on storage.objects;
create policy "Admins can delete audio files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'audio' and public.is_admin());
