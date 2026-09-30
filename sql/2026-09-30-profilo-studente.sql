-- PauseLearn v132 (30/9/2026): profilo STUDENTE ("I miei compiti").
-- Lo studente può (non deve) entrare con la sua email (codice): i suoi risultati prendono results.user_id = auth.uid()
-- e li ritrova da qualunque dispositivo. I tentativi fatti prima di entrare, su quel dispositivo, si collegano con
-- claim_results (gli id sono uuid casuali generati dal suo browser: chi non li ha non può rivendicarli).
alter table public.results add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists results_user_idx on public.results (user_id);

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
  insert into public.results as r (id, assignment_id, student_name, detail, score, total, finished, updated_at, user_id)
  values (p_id, a_id, left(trim(p_name), 80), p_detail, greatest(p_score, 0), greatest(p_total, 0), coalesce(p_finished, false), now(), auth.uid())
  on conflict (id) do update
    set student_name = excluded.student_name, detail = excluded.detail, score = excluded.score, total = excluded.total,
        finished = r.finished or excluded.finished, updated_at = now(), user_id = coalesce(r.user_id, excluded.user_id)
    where r.assignment_id = excluded.assignment_id;
  return true;
end;
$$;

-- I compiti dello studente collegato, con la lezione (per rivedere errori e soluzioni).
create or replace function public.my_results()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'finished', r.finished, 'score', r.score, 'total', r.total, 'detail', r.detail,
           'started_at', r.started_at, 'updated_at', r.updated_at, 'student_name', r.student_name,
           'code', a.code, 'title', a.title, 'kind', a.kind, 'open', a.open, 'className', c.name, 'lesson', a.lesson)
         order by r.updated_at desc), '[]'::jsonb)
  from public.results r
  join public.assignments a on a.id = r.assignment_id
  join public.classes c on c.id = a.class_id
  where auth.uid() is not null and r.user_id = auth.uid();
$$;

-- Collega al profilo i tentativi fatti su questo dispositivo prima di entrare.
create or replace function public.claim_results(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  update public.results set user_id = auth.uid() where id = any(p_ids) and user_id is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.my_results() from public;
revoke all on function public.claim_results(uuid[]) from public;
grant execute on function public.my_results() to authenticated;
grant execute on function public.claim_results(uuid[]) to authenticated;
grant execute on function public.submit_result(text, uuid, text, jsonb, int, int, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
