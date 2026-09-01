-- ---------- Migration 03: Standardprogramme ----------
-- Bis hierher bekam ein neu angemeldetes Konto kein Programm. Die Person sah
-- "Ihnen ist derzeit keine Schulung zugewiesen" und wartete darauf, dass der
-- Trainer es merkt. Wer sich ueberhaupt anmelden darf, steuert ohnehin schon
-- Entra (Unternehmens-Apps -> TMM College -> Benutzer und Gruppen). Die zweite
-- Huerde in der Datenbank bringt also keinen Zugewinn an Kontrolle, nur Reibung.
--
-- Deshalb: Programme lassen sich als Standard markieren und werden beim ersten
-- Anmelden automatisch zugewiesen. Wer das nicht will, setzt is_default auf
-- false -- dann bleibt es wie vorher bei der Zuweisung von Hand.
--
-- Reihenfolge: dieses Skript im Supabase SQL Editor ausfuehren. Am Frontend
-- aendert sich nichts, es ist kein Deploy noetig.

alter table public.programs
  add column if not exists is_default boolean not null default false;

comment on column public.programs.is_default is
  'Wird beim ersten Anmelden automatisch zugewiesen (siehe handle_new_user).';

-- BIM ist das Standardprogramm. LEAN bleibt bewusst aus, solange es leer ist.
update public.programs set is_default = true  where id = 'BIM';
update public.programs set is_default = false where id <> 'BIM';

-- ---------- Trigger erweitern ----------
-- Legt weiterhin das Profil an und weist zusaetzlich die Standardprogramme zu.
-- assigned_by bleibt null: das kennzeichnet die automatische Zuweisung und
-- unterscheidet sie von der bewussten Entscheidung eines Trainers.
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

  insert into public.program_assignments (user_id, program_id)
  select new.id, p.id
  from public.programs p
  where p.is_active and p.is_default
  on conflict do nothing;

  return new;
end $$;

-- Trigger unveraendert, nur zur Sicherheit noch einmal gesetzt.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Bereits angemeldete Personen nachtragen ----------
-- Der Trigger greift nur bei neuen Konten. Wer sich schon angemeldet hat,
-- braucht die Zuweisung einmalig von Hand.
insert into public.program_assignments (user_id, program_id)
select pr.id, p.id
from public.profiles pr
cross join public.programs p
where p.is_active and p.is_default
on conflict do nothing;

-- ---------- Kontrolle ----------
-- select pr.email, pr.display_name,
--        coalesce(string_agg(pa.program_id, ', '), '(keins)') as programme
-- from public.profiles pr
-- left join public.program_assignments pa on pa.user_id = pr.id
-- group by pr.email, pr.display_name
-- order by pr.email;
