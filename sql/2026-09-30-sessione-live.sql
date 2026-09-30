-- PauseLearn v131 (30/9/2026): sessione DAL VIVO di un'esercitazione (sala d'attesa → via → fine).
-- assignments.live = { state: 'lobby'|'run'|'end', shuffle, secs, started_at, ends_at } (null = compito a casa).
-- Lo studente anonimo legge lo stato con get_live(code) (leggera: niente lezione) e l'ora del server per il timer.
alter table public.assignments add column if not exists live jsonb;

create or replace function public.get_assignment(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('code', a.code, 'title', a.title, 'kind', a.kind, 'open', a.open,
                            'className', c.name, 'lesson', case when a.open then a.lesson else null end,
                            'live', a.live, 'now', now())
  from public.assignments a join public.classes c on c.id = a.class_id
  where a.code = upper(trim(p_code));
$$;

create or replace function public.get_live(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('open', a.open, 'live', a.live, 'now', now())
  from public.assignments a
  where a.code = upper(trim(p_code));
$$;

revoke all on function public.get_live(text) from public;
grant execute on function public.get_live(text) to anon, authenticated;
grant execute on function public.get_assignment(text) to anon, authenticated;

notify pgrst, 'reload schema';
