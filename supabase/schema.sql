-- ============ Expenses table (run once) ============
create table if not exists public.expenses (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  updated bigint not null,
  synced_at timestamptz not null default now()
);
create index if not exists expenses_user_synced on public.expenses (user_id, synced_at);
alter table public.expenses enable row level security;
drop policy if exists "own rows" on public.expenses;
create policy "own rows" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$ begin new.synced_at = clock_timestamp(); return new; end $$;
drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before insert or update on public.expenses
  for each row execute function public.touch_synced_at();

-- ============ Receipt photos (private storage bucket) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "receipts: read own" on storage.objects;
drop policy if exists "receipts: add own" on storage.objects;
drop policy if exists "receipts: update own" on storage.objects;
drop policy if exists "receipts: delete own" on storage.objects;
create policy "receipts: read own" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts: update own" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);


-- Palli: automatic bank alerts (run once in Supabase → SQL editor)
create table if not exists public.sms_inbox (id bigserial primary key, user_id uuid not null references auth.users on delete cascade, msg text not null, received timestamptz not null default now());
create table if not exists public.sms_tokens (user_id uuid primary key references auth.users on delete cascade, token text not null unique, created timestamptz not null default now());
alter table public.sms_inbox enable row level security;
alter table public.sms_tokens enable row level security;
drop policy if exists "own inbox" on public.sms_inbox;
create policy "own inbox" on public.sms_inbox for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own token" on public.sms_tokens;
create policy "own token" on public.sms_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.ingest_sms(token text, msg text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select t.user_id into uid from public.sms_tokens t where t.token = ingest_sms.token;
  if uid is null then raise exception 'unknown token'; end if;
  if coalesce(length(trim(msg)), 0) = 0 then return 'empty'; end if;
  insert into public.sms_inbox (user_id, msg) values (uid, left(msg, 1000));
  delete from public.sms_inbox where user_id = uid and id not in (select id from public.sms_inbox where user_id = uid order by id desc limit 300);
  return 'ok';
end $$;
revoke all on function public.ingest_sms(text, text) from public;
grant execute on function public.ingest_sms(text, text) to anon, authenticated;
