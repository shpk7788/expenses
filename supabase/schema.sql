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
