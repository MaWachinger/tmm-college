-- ============================================================
-- TMM College — BIM-Zertifizierung
-- Supabase Schema: Tabellen, RLS, Freischaltlogik, Bewertung
-- Ausfuehren im Supabase SQL Editor (einmalig), danach
-- seed_questions.sql einspielen.
-- ============================================================

-- ---------- Profile ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  is_trainer   boolean not null default false,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Optional: Zugang auf die eigene Domain begrenzen.
  -- if new.email not ilike '%@tmm-ag.de' then
  --   raise exception 'Zugang nur mit TMM-Konto';
  -- end if;
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Lernstand ----------
create table if not exists public.module_progress (
  user_id        uuid not null references auth.users on delete cascade,
  module_id      text not null check (module_id ~ '^M0[1-9]$'),
  read_confirmed boolean not null default false,
  read_at        timestamptz,
  passed         boolean not null default false,
  passed_at      timestamptz,
  attempts       integer not null default 0,
  best_score     integer not null default 0,
  primary key (user_id, module_id)
);

create table if not exists public.quiz_attempts (
  id         bigserial primary key,
  user_id    uuid not null references auth.users on delete cascade,
  module_id  text not null,
  score      integer not null,
  passed     boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, module_id, created_at desc);

create table if not exists public.session_attendance (
  user_id      uuid not null references auth.users on delete cascade,
  session_id   text not null check (session_id in ('GRL', 'WKZ', 'ZERT')),
  confirmed_by uuid references auth.users,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

-- ---------- Fragenkatalog ----------
create table if not exists public.quiz_questions (
  id        bigserial primary key,
  module_id text not null check (module_id ~ '^M0[1-9]$'),
  position  integer not null,
  prompt    text not null,
  unique (module_id, position)
);

create table if not exists public.quiz_options (
  id          bigserial primary key,
  question_id bigint not null references public.quiz_questions on delete cascade,
  position    integer not null,
  body        text not null,
  is_correct  boolean not null default false
);
create index if not exists quiz_options_question_idx on public.quiz_options (question_id);

-- ---------- Rollen-Helfer ----------
create or replace function public.is_trainer(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_trainer from public.profiles where id = p_user), false);
$$;

-- ---------- Freischaltlogik (serverseitig verbindlich) ----------
-- Ein Modul ist frei, wenn alle vorherigen Module bestanden sind
-- und die davorliegenden Live-Sessions bestaetigt wurden.
create or replace function public.is_unlocked(p_user uuid, p_module text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_idx int := (regexp_replace(p_module, '\D', '', 'g'))::int;
  i int;
begin
  for i in 1 .. (v_idx - 1) loop
    if not exists (
      select 1 from public.module_progress
      where user_id = p_user and module_id = 'M0' || i and passed
    ) then
      return false;
    end if;
  end loop;

  if v_idx >= 5 and not exists (
    select 1 from public.session_attendance where user_id = p_user and session_id = 'GRL'
  ) then
    return false;
  end if;

  if v_idx >= 8 and not exists (
    select 1 from public.session_attendance where user_id = p_user and session_id = 'WKZ'
  ) then
    return false;
  end if;

  return true;
end $$;

-- ---------- Unterlagen bestaetigen ----------
create or replace function public.confirm_read(p_module text, p_value boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if not public.is_unlocked(v_uid, p_module) then raise exception 'Dieses Modul ist noch gesperrt'; end if;

  insert into public.module_progress (user_id, module_id, read_confirmed, read_at)
  values (v_uid, p_module, p_value, case when p_value then now() end)
  on conflict (user_id, module_id) do update
    set read_confirmed = excluded.read_confirmed,
        read_at        = case when excluded.read_confirmed then now() else null end;
end $$;

-- ---------- Fragen ausliefern (ohne Loesungen) ----------
create or replace function public.get_quiz(p_module text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v jsonb;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if not public.is_unlocked(v_uid, p_module) then raise exception 'Dieses Modul ist noch gesperrt'; end if;
  if not exists (
    select 1 from public.module_progress
    where user_id = v_uid and module_id = p_module and read_confirmed
  ) then
    raise exception 'Bitte zuerst die Unterlagen bestaetigen';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'position', q.position,
      'prompt', q.prompt,
      'options', (
        select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body) order by random())
        from public.quiz_options o where o.question_id = q.id
      )
    ) order by q.position
  ), '[]'::jsonb)
  into v
  from public.quiz_questions q
  where q.module_id = p_module;

  return v;
end $$;

-- ---------- Auswertung (Loesungen verlassen die Datenbank nicht) ----------
-- p_answers: [{"question_id": 12, "option_id": 47}, ...]
create or replace function public.submit_quiz(p_module text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_total  int;
  v_score  int;
  v_wrong  jsonb;
  v_passed boolean;
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  if not public.is_unlocked(v_uid, p_module) then raise exception 'Dieses Modul ist noch gesperrt'; end if;
  if not exists (
    select 1 from public.module_progress
    where user_id = v_uid and module_id = p_module and read_confirmed
  ) then
    raise exception 'Bitte zuerst die Unterlagen bestaetigen';
  end if;

  select count(*) into v_total from public.quiz_questions where module_id = p_module;

  with ans as (
    select (a->>'question_id')::bigint as qid, (a->>'option_id')::bigint as oid
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
  ),
  graded as (
    select q.position,
           coalesce((
             select o.is_correct
             from public.quiz_options o
             join ans on ans.oid = o.id and ans.qid = q.id
             where o.question_id = q.id
             limit 1
           ), false) as ok
    from public.quiz_questions q
    where q.module_id = p_module
  )
  select count(*) filter (where ok),
         coalesce(jsonb_agg(position order by position) filter (where not ok), '[]'::jsonb)
  into v_score, v_wrong
  from graded;

  v_passed := (v_total > 0 and v_score = v_total);

  insert into public.quiz_attempts (user_id, module_id, score, passed)
  values (v_uid, p_module, v_score, v_passed);

  insert into public.module_progress (user_id, module_id, read_confirmed, attempts, best_score, passed, passed_at)
  values (v_uid, p_module, true, 1, v_score, v_passed, case when v_passed then now() end)
  on conflict (user_id, module_id) do update
    set attempts   = module_progress.attempts + 1,
        best_score = greatest(module_progress.best_score, excluded.best_score),
        passed     = module_progress.passed or excluded.passed,
        passed_at  = coalesce(module_progress.passed_at, excluded.passed_at);

  return jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'passed', v_passed,
    'wrong_positions', v_wrong
  );
end $$;

-- ---------- Live-Session bestaetigen (nur Trainer) ----------
create or replace function public.confirm_session(p_user uuid, p_session text, p_value boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then raise exception 'Nur Trainer duerfen Teilnahmen bestaetigen'; end if;

  if p_value then
    insert into public.session_attendance (user_id, session_id, confirmed_by)
    values (p_user, p_session, auth.uid())
    on conflict (user_id, session_id) do update
      set confirmed_by = auth.uid(), confirmed_at = now();
  else
    delete from public.session_attendance where user_id = p_user and session_id = p_session;
  end if;
end $$;

-- ---------- Trainer-Auswertung ----------
create or replace function public.trainer_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_trainer() then raise exception 'Kein Zugriff'; end if;

  select coalesce(jsonb_agg(rec order by rec->>'display_name'), '[]'::jsonb)
  into v
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'display_name', p.display_name,
      'email', p.email,
      'is_trainer', p.is_trainer,
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

-- ---------- Eigener Lernstand ----------
create or replace function public.my_progress()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Nicht angemeldet'; end if;
  return jsonb_build_object(
    'modules', (
      select coalesce(jsonb_object_agg(module_id, jsonb_build_object(
        'read', read_confirmed, 'readAt', read_at,
        'passed', passed, 'passedAt', passed_at,
        'attempts', attempts, 'bestScore', best_score
      )), '{}'::jsonb)
      from public.module_progress where user_id = v_uid
    ),
    'sessions', (
      select coalesce(jsonb_object_agg(session_id, jsonb_build_object(
        'done', true, 'doneAt', confirmed_at
      )), '{}'::jsonb)
      from public.session_attendance where user_id = v_uid
    )
  );
end $$;

-- ============================================================
-- Row Level Security
-- Direkte Schreibzugriffe sind gesperrt. Alle Aenderungen
-- laufen ueber die Funktionen oben, damit niemand sich selbst
-- auf "bestanden" setzen kann.
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.module_progress   enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.session_attendance enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_options      enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_trainer());

drop policy if exists progress_select on public.module_progress;
create policy progress_select on public.module_progress
  for select to authenticated
  using (user_id = auth.uid() or public.is_trainer());

drop policy if exists attempts_select on public.quiz_attempts;
create policy attempts_select on public.quiz_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.is_trainer());

drop policy if exists attendance_select on public.session_attendance;
create policy attendance_select on public.session_attendance
  for select to authenticated
  using (user_id = auth.uid() or public.is_trainer());

-- Fragen und Optionen sind fuer Clients komplett gesperrt.
-- Der Zugriff laeuft ausschliesslich ueber get_quiz() / submit_quiz().
revoke all on public.quiz_questions from anon, authenticated;
revoke all on public.quiz_options   from anon, authenticated;

-- ---------- Trainer ernennen ----------
-- Nach der ersten Anmeldung einmalig ausfuehren:
-- update public.profiles set is_trainer = true where email = 'vorname.nachname@tmm-ag.de';

-- ============================================================
-- Folienbetrachter: Speicher fuer die gerenderten Folien
-- ============================================================
insert into storage.buckets (id, name, public)
values ('module-slides', 'module-slides', false)
on conflict (id) do nothing;

-- Nur angemeldete Nutzer duerfen die Folien sehen.
-- Die Dateien selbst werden ueber kurzlebige signierte Links ausgeliefert.
drop policy if exists "slides readable by authenticated" on storage.objects;
create policy "slides readable by authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'module-slides');
