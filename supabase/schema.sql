-- Expenses app: one row per expense, private to each user (row-level security).
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

-- server-side timestamp so devices with wrong clocks still sync correctly
create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$ begin new.synced_at = clock_timestamp(); return new; end $$;
drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before insert or update on public.expenses
  for each row execute function public.touch_synced_at();
