-- PauseLearn v137 (1/10/2026): i report della Sfida in classe salvati nel cloud, con l'etichetta della classe.
-- Edoardo: "perché non c'è un database dietro ai report? ... voglio anche poter mettere un label tipo Polimi lun/mer".
-- La sfida resta un canale Realtime senza tabelle; a fine partita (e ogni tanto durante) il computer dell'insegnante
-- salva qui un'istantanea: domande, giocatori, chi ha risposto cosa. Solo l'insegnante la legge (RLS sul proprietario).
-- L'etichetta è una CLASSE (la stessa dei compiti): così sfide e compiti della stessa classe stanno insieme.

create table if not exists public.chal_reports (
  id uuid primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  title text not null default '' check (char_length(title) <= 200),
  pin text not null default '',
  play text not null default 'tp',
  players int not null default 0,
  ended boolean not null default false,
  report jsonb not null default '{}'::jsonb check (octet_length(report::text) < 600000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chal_reports_owner_idx on public.chal_reports (owner, created_at desc);
create index if not exists chal_reports_class_idx on public.chal_reports (class_id);

alter table public.chal_reports enable row level security;

drop policy if exists chal_reports_owner on public.chal_reports;
create policy chal_reports_owner on public.chal_reports for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and (class_id is null or exists (select 1 from public.classes c where c.id = class_id and c.owner = auth.uid())));

revoke all on public.chal_reports from anon;
grant select, insert, update, delete on public.chal_reports to authenticated;
grant all on public.chal_reports to service_role;
