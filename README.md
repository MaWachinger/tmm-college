# TMM College — BIM-Zertifizierung

Lernplattform für die interne Weiterbildung der TMM AG.
Mehrere Programme (BIM, LEAN, …), je aus Modulen im Selbststudium mit Lernabfrage und
Live-Sessions als Etappenzielen. Teilnehmende sehen auf der Startseite ihre zugewiesenen
Programme mit Fortschritt.

**Stack:** React + Vite · Supabase (Postgres, Auth) · GitHub Pages
**Anmeldung:** Microsoft 365 / Entra ID
**Bewertung:** läuft in der Datenbank, die Lösungen verlassen den Server nicht

---

## 1. Supabase einrichten

1. Projekt anlegen auf [supabase.com](https://supabase.com), **Region Frankfurt (eu-central-1)**.
2. Im SQL Editor nacheinander ausführen:
   - `supabase/schema.sql` — Tabellen, RLS, Freischaltlogik, Bewertungsfunktionen
   - `supabase/migration_02_programme.sql` — Programme, Reihenfolge, Zuweisungen
   - `supabase/migration_03_standardprogramm.sql` — BIM wird neuen Konten automatisch zugewiesen
   - `seed_questions.sql` — die 72 Fragen

> **Hinweis:** `seed_questions.sql` ist bewusst nicht Teil dieses Repos, weil es die
> richtigen Antworten enthält und das Repo öffentlich ist. Die Datei liegt intern bei TMM
> und wird von Hand im SQL Editor eingespielt. `.gitignore` verhindert ein versehentliches
> Einchecken.
3. Projekt-URL und `anon`-Key notieren (Settings → API).

Der `anon`-Key darf öffentlich sein. Er allein gibt keinen Datenzugriff — jede Zeile ist über
Row Level Security an das angemeldete Konto gebunden, und Schreibzugriffe laufen ausschließlich
über geprüfte Datenbankfunktionen.

## 2. Entra ID als Anmeldung

**In Azure (Entra Admin Center → App-Registrierungen):**

1. Neue Registrierung, Kontotyp **nur eigenes Verzeichnis** (single tenant) — damit können sich
   ausschließlich TMM-Konten anmelden.
2. Redirect-URI (Typ Web): `https://<projekt-ref>.supabase.co/auth/v1/callback`
3. Unter *Zertifikate & Geheimnisse* ein Client-Secret erzeugen.
4. Application (client) ID, Secret und Directory (tenant) ID notieren.

**In Supabase (Authentication → Providers → Azure):**

- Provider aktivieren, Client ID und Secret eintragen
- Azure Tenant URL: `https://login.microsoftonline.com/<tenant-id>`
- Unter *URL Configuration* die Site-URL und die Redirect-URL der GitHub-Pages-Adresse eintragen:
  `https://<organisation>.github.io/tmm-college/`

## 3. Trainer freischalten

Nach der ersten eigenen Anmeldung einmalig im SQL Editor:

```sql
update public.profiles set is_trainer = true where email = 'vorname.nachname@tmm-ag.de';
```

## 4. Modulunterlagen bereitstellen

Die Lernenden sehen die Folien im eingebauten Betrachter, nicht die PPTX. Dafür werden die
Präsentationen zu Bildern gerendert und in den Supabase-Speicher gelegt:

- Bucket `module-slides` (wird von `schema.sql` angelegt, nicht öffentlich)
- Struktur `M01/01.jpg`, `M01/02.jpg`, … bis `M09`
- Auslieferung über kurzlebige signierte Links, nur für angemeldete Nutzer

Die Original-PPTX bleiben in SharePoint als Redaktionsablage. Die Lernenden brauchen dort
keinen Zugriff und bekommen aus der Plattform heraus auch keinen Link dorthin.

## 5. GitHub Pages

1. Repository anlegen (Name bestimmt den Pfad, Standard hier: `tmm-college`).
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions, drei Secrets anlegen:

   | Secret | Wert |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<projekt-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon-Key aus Supabase |

4. Push auf `main` — der Workflow baut und veröffentlicht automatisch.

**Wichtig:** Eine GitHub-Pages-Seite ist öffentlich erreichbar. Sichtbar ist ohne Anmeldung nur
der Anmeldebildschirm; sämtliche Inhalte, Fragen und Lernstände liegen hinter Entra ID und RLS.
Wer die Seite gar nicht erst öffentlich haben will, braucht GitHub Enterprise Cloud oder ein
anderes Hosting.

## 6. Lokal entwickeln

```bash
npm install
cp .env.example .env      # Werte eintragen
npm run dev
```

Für lokale Anmeldung die Adresse `http://localhost:5173/tmm-college/` in Supabase unter
*Authentication → URL Configuration → Redirect URLs* ergänzen.

---

## Aufbau

```
src/
  App.jsx                 Anmeldung, Lernpfad, Modulansicht, Session, Zertifikat
  components/Quiz.jsx     Lernabfrage (Fragen aus der Datenbank)
  components/Trainer.jsx  Auswertung, Teilnahmebestätigung, CSV-Export
  data/curriculum.js      Module, Sessions, Reihenfolge, Statuslogik
  lib/supabase.js         Client und API-Aufrufe
  styles.css              TMM-CI
supabase/
  schema.sql              Tabellen, RLS, Funktionen
  seed_questions.sql      72 Fragen
```

### Wie die Freischaltung funktioniert

Die Reihenfolge steht nicht nur im Frontend, sondern wird bei jedem Aufruf serverseitig geprüft
(`is_unlocked`). Ein Modul öffnet erst, wenn alle vorherigen Module bestanden sind und die
davorliegenden Live-Sessions bestätigt wurden. Wer die Oberfläche umgeht, kommt keinen Schritt weiter.

### Programme und Curriculum ändern

Die Anzeige (Titel, Farben, Folienzahlen, Inhaltsverzeichnisse) steht in `src/data/curriculum.js`,
die verbindliche Reihenfolge in der Tabelle `curriculum_steps`. **Beides muss zusammenpassen** —
eine Etappe, die nur im Code steht, bleibt serverseitig gesperrt.

Neues Programm anlegen:
1. Zeile in `programs` einfügen
2. Etappen in `curriculum_steps` eintragen (Kennungen programmweit eindeutig, z. B. `L01`)
3. Passenden Eintrag in `PROGRAMS` in `src/data/curriculum.js` ergänzen
4. Fragen in `quiz_questions`/`quiz_options`, Folien in den Bucket `module-slides`
5. Teilnehmende in der Trainer-Ansicht zuweisen
Fragen ändert man in der Datenbank (`quiz_questions` / `quiz_options`) oder über eine neue
Fassung von `seed_questions.sql` — die liegt intern und gehört nicht in dieses Repo.

---

## Datenschutz

Die Plattform speichert personenbezogen: Name, E-Mail, Bearbeitungsstand je Modul, jeden einzelnen
Versuch mit Zeitstempel und Punktzahl sowie die bestätigten Session-Teilnahmen. Trainer sehen diese
Daten für alle Teilnehmenden. Das ist eine Leistungsauswertung und vor dem Pilotlauf mit dem
Betriebsrat abzustimmen. Für Supabase wird ein AVV benötigt, die Datenhaltung ist auf die Region
Frankfurt zu legen.

Soll die Auswertung entschärft werden, genügt eine Änderung an `trainer_overview()`:
Versuche weglassen und nur bestanden/offen zurückgeben.
