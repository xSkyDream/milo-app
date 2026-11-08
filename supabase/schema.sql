-- Milo : données synchronisées par compte (une ligne par utilisateur)
-- À exécuter une fois dans Supabase > SQL Editor.
create table if not exists public.milo_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Chaque utilisateur ne voit et ne modifie QUE sa propre ligne.
alter table public.milo_state enable row level security;

drop policy if exists "milo lecture perso" on public.milo_state;
drop policy if exists "milo ajout perso" on public.milo_state;
drop policy if exists "milo maj perso" on public.milo_state;
drop policy if exists "milo suppression perso" on public.milo_state;

create policy "milo lecture perso" on public.milo_state
  for select using (auth.uid() = user_id);
create policy "milo ajout perso" on public.milo_state
  for insert with check (auth.uid() = user_id);
create policy "milo maj perso" on public.milo_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "milo suppression perso" on public.milo_state
  for delete using (auth.uid() = user_id);
