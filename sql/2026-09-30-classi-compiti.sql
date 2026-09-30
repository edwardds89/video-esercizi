-- PauseLearn v125 (30/9/2026): classi, compiti e risultati degli studenti.
-- L'insegnante (utente autenticato) crea classi e assegna una lezione a una classe (= compito con un codice).
-- Lo studente NON ha account: apre pauselearn.com/#a=CODICE, scrive nome e cognome, e i suoi risultati arrivano
-- con due funzioni SECURITY DEFINER (get_assignment, submit_result). Gli anonimi NON hanno accesso diretto alle
-- tabelle: leggono solo il compito di cui conoscono il codice, e scrivono solo nei compiti aperti.
-- GRANT espliciti (Supabase dal 30/10/2026 non li dà più in automatico alle tabelle nuove).

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_id text not null,
  title text not null default '',
  kind text not null default 'homework' check (kind in ('homework', 'live')),
  lesson jsonb not null,
  open boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists assignments_class_idx on public.assignments (class_id);

create table if not exists public.results (
  id uuid primary key,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_name text not null check (char_length(student_name) between 2 and 80),
  detail jsonb not null default '{}'::jsonb,
  score int not null default 0,
  total int not null default 0,
  finished boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists results_assignment_idx on public.results (assignment_id);

alter table public.classes enable row level security;
alter table public.assignments enable row level security;
alter table public.results enable row level security;

drop policy if exists classes_owner on public.classes;
create policy classes_owner on public.classes for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists assignments_owner on public.assignments;
create policy assignments_owner on public.assignments for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner = auth.uid()));

drop policy if exists results_owner_read on public.results;
create policy results_owner_read on public.results for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and a.owner = auth.uid()));
drop policy if exists results_owner_delete on public.results;
create policy results_owner_delete on public.results for delete to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and a.owner = auth.uid()));

revoke all on public.classes, public.assignments, public.results from anon;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, delete on public.results to authenticated;
grant all on public.classes, public.assignments, public.results to service_role;

-- Studente: legge il compito dal codice (anche se chiuso, per poter dire "chiuso").
create or replace function public.get_assignment(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('code', a.code, 'title', a.title, 'kind', a.kind, 'open', a.open,
                            'className', c.name, 'lesson', case when a.open then a.lesson else null end)
  from public.assignments a join public.classes c on c.id = a.class_id
  where a.code = upper(trim(p_code));
$$;

-- Studente: salva (o aggiorna) il suo tentativo. Un tentativo = un id generato dal browser dello studente.
-- Si scrive solo nei compiti aperti, e un id già usato non può essere spostato su un altro compito.
create or replace function public.submit_result(p_code text, p_id uuid, p_name text, p_detail jsonb,
                                                p_score int, p_total int, p_finished boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
begin
  select id into a_id from public.assignments where code = upper(trim(p_code)) and open;
  if a_id is null then return false; end if;
  if p_detail is null or octet_length(p_detail::text) > 200000 then raise exception 'dettaglio troppo grande'; end if;
  insert into public.results as r (id, assignment_id, student_name, detail, score, total, finished, updated_at)
  values (p_id, a_id, left(trim(p_name), 80), p_detail, greatest(p_score, 0), greatest(p_total, 0), coalesce(p_finished, false), now())
  on conflict (id) do update
    set student_name = excluded.student_name, detail = excluded.detail, score = excluded.score, total = excluded.total,
        finished = r.finished or excluded.finished, updated_at = now()
    where r.assignment_id = excluded.assignment_id;
  return true;
end;
$$;

revoke all on function public.get_assignment(text) from public;
revoke all on function public.submit_result(text, uuid, text, jsonb, int, int, boolean) from public;
grant execute on function public.get_assignment(text) to anon, authenticated;
grant execute on function public.submit_result(text, uuid, text, jsonb, int, int, boolean) to anon, authenticated;
