-- ---------- Migration 04: Einladungen ----------
-- Zuweisen ging bisher erst, nachdem sich jemand angemeldet hatte:
-- program_assignments.user_id verweist auf auth.users, und vor der ersten
-- Anmeldung gibt es das Konto nicht. Eingeladene landeten deshalb zwangslaeufig
-- auf einer leeren Startseite.
--
-- Diese Migration fuehrt Einladungen auf E-Mail-Basis ein. Der Trainer laedt
-- eine Adresse zu einem Programm ein; beim ersten Anmelden wandelt der Trigger
-- die offenen Einladungen in echte Zuweisungen um. Die Person sieht ihr
-- Programm damit ab der ersten Sekunde.
--
-- Konten legt weiterhin Entra an -- die Plattform kann keine erzeugen. Wer
-- eingeladen wird, muss in Entra Zugang zur App haben, sonst fuehrt die
-- Einladung vor eine verschlossene Tuer.
--
-- Diese Datei ist eigenstaendig: sie laeuft auch ohne migration_03. Falls 03
-- schon eingespielt wurde, bleibt dessen is_default-Einstellung unangetastet.
-- Reihenfolge: dieses Skript im SQL Editor ausfuehren, danach das Frontend
-- ausrollen (die Trainer-Ansicht ruft die neuen Funktionen auf).

-- Wird von handle_new_user() mitgelesen. Aus migration_03; hier nur angelegt,
-- damit die Funktion unten in jedem Fall darauf zugreifen kann. Bewusst kein
-- update: eine vorhandene Einstellung soll nicht ueberschrieben werden.
alter table public.programs
  add column if not exists is_default boolean not null default false;

-- ---------- Tabelle ----------
create table if not exists public.program_invitations (
  email       text not null,
  program_id  text not null references public.programs on delete cascade,
  invited_by  uuid references auth.users,
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users,
  primary key (email, program_id)
);

-- Wie module_progress und session_attendance: keine Schreib-Policies.
-- Jeder Zugriff laeuft ueber die security-definer-Funktionen weiter unten.
alter table public.program_invitations enable row level security;

create index if not exists program_invitations_offen
  on public.program_invitations (email)
  where accepted_at is null;

-- ---------- Einladen (nur Trainer) ----------
-- Ist die Adresse schon angemeldet, wird direkt zugewiesen statt eingeladen --
-- fuer den Trainer ist das derselbe Handgriff, das Ergebnis soll gleich sein.
create or replace function public.invite_person(p_email text, p_program text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid   uuid;
begin
  if not public.is_trainer() then
    raise exception 'Nur Trainer duerfen einladen';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Keine gueltige E-Mail-Adresse';
  end if;
  if not exists (select 1 from public.programs where id = p_program and is_active) then
    raise exception 'Unbekanntes oder inaktives Programm';
  end if;

  select id into v_uid from public.profiles where lower(email) = v_email;

  if v_uid is not null then
    insert into public.program_assignments (user_id, program_id, assigned_by)
    values (v_uid, p_program, auth.uid())
    on conflict do nothing;

    insert into public.program_invitations (email, program_id, invited_by, accepted_at, accepted_by)
    values (v_email, p_program, auth.uid(), now(), v_uid)
    on conflict (email, program_id) do update
      set accepted_at = coalesce(program_invitations.accepted_at, now()),
          accepted_by = coalesce(program_invitations.accepted_by, v_uid);

    return jsonb_build_object('status', 'zugewiesen', 'email', v_email);
  end if;

  insert into public.program_invitations (email, program_id, invited_by)
  values (v_email, p_program, auth.uid())
  on conflict (email, program_id) do update
    set invited_by = excluded.invited_by,
        invited_at = now();

  return jsonb_build_object('status', 'eingeladen', 'email', v_email);
end $$;

-- ---------- Einladung zuruecknehmen (nur Trainer) ----------
-- Nur solange sie offen ist. Eine angenommene Einladung ist eine Zuweisung und
-- wird ueber assign_program zurueckgenommen, nicht hier.
create or replace function public.revoke_invitation(p_email text, p_program text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then
    raise exception 'Nur Trainer duerfen Einladungen zuruecknehmen';
  end if;
  delete from public.program_invitations
  where email = lower(trim(p_email))
    and program_id = p_program
    and accepted_at is null;
end $$;

-- ---------- Offene Einladungen (nur Trainer) ----------
create or replace function public.open_invitations()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.is_trainer() then
    raise exception 'Kein Zugriff';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'email',      i.email,
      'program_id', i.program_id,
      'invited_at', i.invited_at,
      'invited_by', pb.display_name
    ) order by i.invited_at desc
  ), '[]'::jsonb)
  into v
  from public.program_invitations i
  left join public.profiles pb on pb.id = i.invited_by
  where i.accepted_at is null;

  return v;
end $$;

-- ---------- Trigger: Einladungen beim ersten Anmelden einloesen ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(new.email));
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

  -- Offene Einladungen werden zu Zuweisungen. assigned_by bleibt der Trainer,
  -- der eingeladen hat -- die Entscheidung war seine, nicht die des Systems.
  insert into public.program_assignments (user_id, program_id, assigned_by)
  select new.id, i.program_id, i.invited_by
  from public.program_invitations i
  where i.email = v_email and i.accepted_at is null
  on conflict do nothing;

  update public.program_invitations
     set accepted_at = now(),
         accepted_by = new.id
   where email = v_email and accepted_at is null;

  -- Standardprogramme aus migration_03. Ist dort nichts gesetzt, passiert nichts.
  insert into public.program_assignments (user_id, program_id)
  select new.id, p.id
  from public.programs p
  where p.is_active and p.is_default
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Kontrolle ----------
-- Offene Einladungen:
-- select email, program_id, invited_at from public.program_invitations
-- where accepted_at is null order by invited_at desc;
--
-- Wer hat was:
-- select pr.email, coalesce(string_agg(pa.program_id, ', '), '(keins)') as programme
-- from public.profiles pr
-- left join public.program_assignments pa on pa.user_id = pr.id
-- group by pr.email order by pr.email;
