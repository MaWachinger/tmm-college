-- ============================================================
-- TMM College — Migration 02: Mehrere Programme
-- Fuehrt eine Ebene ueber den Modulen ein: Programme, ihre
-- Reihenfolge und die Zuweisung an Teilnehmende.
-- Bestehende Lernstaende bleiben erhalten.
-- Einmalig im Supabase SQL Editor ausfuehren.
-- ============================================================

-- ---------- Programme ----------
create table if not exists public.programs (
  id        text primary key,
  title     text not null,
  subtitle  text,
  accent    text,
  position  integer not null default 1,
  is_active boolean not null default true
);

insert into public.programs (id, title, subtitle, accent, position, is_active) values
  ('BIM',  'BIM-Zertifizierung',  'Neun Module, drei Live-Sessions', '#00A4E8', 1, true),
  ('LEAN', 'LEAN-Zertifizierung', 'In Vorbereitung',                 '#028090', 2, true)
on conflict (id) do update
  set title = excluded.title, subtitle = excluded.subtitle, accent = excluded.accent;

-- ---------- Reihenfolge der Etappen ----------
create table if not exists public.curriculum_steps (
  id         bigserial primary key,
  program_id text not null references public.programs on delete cascade,
  position   integer not null,
  kind       text not null check (kind in ('module', 'session')),
  ref_id     text not null,
  unique (program_id, position),
  unique (ref_id)
);

insert into public.curriculum_steps (program_id, position, kind, ref_id) values
  ('BIM',  1, 'module',  'M01'),
  ('BIM',  2, 'module',  'M02'),
  ('BIM',  3, 'module',  'M03'),
  ('BIM',  4, 'module',  'M04'),
  ('BIM',  5, 'session', 'GRL'),
  ('BIM',  6, 'module',  'M05'),
  ('BIM',  7, 'module',  'M06'),
  ('BIM',  8, 'module',  'M07'),
  ('BIM',  9, 'session', 'WKZ'),
  ('BIM', 10, 'module',  'M08'),
  ('BIM', 11, 'module',  'M09'),
  ('BIM', 12, 'session', 'ZERT')
on conflict (ref_id) do nothing;

-- ---------- Zuweisung ----------
create table if not exists public.program_assignments (
  user_id     uuid not null references auth.users on delete cascade,
  program_id  text not null references public.programs on delete cascade,
  assigned_by uuid references auth.users,
  assigned_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

-- ---------- Alte Beschraenkungen loesen ----------
-- Kennungen sind jetzt programmweit vergeben (M01…, spaeter L01…).
alter table public.module_progress    drop constraint if exists module_progress_module_id_check;
alter table public.quiz_questions     drop constraint if exists quiz_questions_module_id_check;
alter table public.session_attendance drop constraint if exists session_attendance_session_id_check;

-- ---------- Freischaltlogik, jetzt programmbasiert ----------
-- Der Parameter heisst nicht mehr p_module, deshalb muss die alte
-- Fassung zuerst entfernt werden.
drop function if exists public.is_unlocked(uuid, text);

create function public.is_unlocked(p_user uuid, p_ref text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_program text;
  v_pos     integer;
  r         record;
begin
  select program_id, position into v_program, v_pos
  from public.curriculum_steps where ref_id = p_ref;
  if v_program is null then return false; end if;

  -- Ohne Zuweisung kein Zugriff auf das Programm
  if not exists (
    select 1 from public.program_assignments
    where user_id = p_user and program_id = v_program
  ) then
    return false;
  end if;

  for r in
    select kind, ref_id from public.curriculum_steps
    where program_id = v_program and position < v_pos
  loop
    if r.kind = 'module' then
      if not exists (
        select 1 from public.module_progress
        where user_id = p_user and module_id = r.ref_id and passed
      ) then return false; end if;
    else
      if not exists (
        select 1 from public.session_attendance
        where user_id = p_user and session_id = r.ref_id
      ) then return false; end if;
    end if;
  end loop;

  return true;
end $$;

-- ---------- Programmuebersicht fuer die Startseite ----------
create or replace function public.my_programs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v jsonb;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;

  select coalesce(jsonb_agg(rec order by rec->>'position'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'subtitle', p.subtitle,
      'accent', p.accent,
      'position', p.position,
      'assigned_at', pa.assigned_at,
      'total', (select count(*) from public.curriculum_steps cs where cs.program_id = p.id),
      'done', (
        select count(*) from public.curriculum_steps cs
        where cs.program_id = p.id
          and (
            (cs.kind = 'module' and exists (
              select 1 from public.module_progress mp
              where mp.user_id = v_uid and mp.module_id = cs.ref_id and mp.passed))
            or
            (cs.kind = 'session' and exists (
              select 1 from public.session_attendance sa
              where sa.user_id = v_uid and sa.session_id = cs.ref_id))
          )
      )
    ) as rec
    from public.programs p
    join public.program_assignments pa on pa.program_id = p.id and pa.user_id = v_uid
    where p.is_active
  ) t;

  return v;
end $$;

-- ---------- Zuweisen (nur Trainer) ----------
create or replace function public.assign_program(p_user uuid, p_program text, p_value boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then raise exception 'Nur Trainer duerfen Programme zuweisen'; end if;

  if p_value then
    insert into public.program_assignments (user_id, program_id, assigned_by)
    values (p_user, p_program, auth.uid())
    on conflict (user_id, program_id) do nothing;
  else
    delete from public.program_assignments where user_id = p_user and program_id = p_program;
  end if;
end $$;

-- ---------- Trainer-Auswertung inkl. Zuweisungen ----------
create or replace function public.trainer_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_trainer() then raise exception 'Kein Zugriff'; end if;

  select coalesce(jsonb_agg(rec order by rec->>'display_name'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'display_name', p.display_name,
      'email', p.email,
      'is_trainer', p.is_trainer,
      'programs', (
        select coalesce(jsonb_agg(pa.program_id), '[]'::jsonb)
        from public.program_assignments pa where pa.user_id = p.id
      ),
      'modules', (
        select coalesce(jsonb_object_agg(mp.module_id, jsonb_build_object(
          'read', mp.read_confirmed, 'read_at', mp.read_at,
          'passed', mp.passed, 'passed_at', mp.passed_at,
          'attempts', mp.attempts, 'best_score', mp.best_score
        )), '{}'::jsonb)
        from public.module_progress mp where mp.user_id = p.id
      ),
      'sessions', (
        select coalesce(jsonb_object_agg(sa.session_id, jsonb_build_object(
          'done', true, 'doneAt', sa.confirmed_at
        )), '{}'::jsonb)
        from public.session_attendance sa where sa.user_id = p.id
      ),
      'last_activity', (
        select max(qa.created_at) from public.quiz_attempts qa where qa.user_id = p.id
      )
    ) as rec
    from public.profiles p
  ) t;

  return v;
end $$;

-- ---------- Row Level Security ----------
alter table public.programs            enable row level security;
alter table public.curriculum_steps    enable row level security;
alter table public.program_assignments enable row level security;

drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs
  for select to authenticated using (true);

drop policy if exists steps_select on public.curriculum_steps;
create policy steps_select on public.curriculum_steps
  for select to authenticated using (true);

drop policy if exists assignments_select on public.program_assignments;
create policy assignments_select on public.program_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.is_trainer());

-- ---------- Bestehende Teilnehmende auf BIM setzen ----------
-- Damit niemand nach der Migration vor einer leeren Startseite steht.
insert into public.program_assignments (user_id, program_id)
select id, 'BIM' from public.profiles
on conflict (user_id, program_id) do nothing;
