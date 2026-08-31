# TMM College — Projektkontext für Claude Code

Interne Weiterbildungsplattform der TMM AG. Diese Datei hält fest, was sich aus dem
Code allein nicht erschließt: getroffene Entscheidungen, Fallstricke und offene Punkte.

## Was das ist

Mehrere Weiterbildungsprogramme (aktuell BIM aktiv, LEAN als Platzhalter). Ein Programm
besteht aus Modulen im Selbststudium und Live-Sessions als Etappenzielen. Pro Modul:
Folien durchblättern, dann acht Fragen — alle acht richtig zum Bestehen, unbegrenzte
Wiederholung. Live-Sessions schaltet der Trainer nach Teilnahme frei. Am Ende ein Zertifikat.

**Stack:** Vite + React, Supabase (Postgres, Auth, Storage), GitHub Pages
**Anmeldung:** Microsoft Entra ID, Single-Tenant
**Live:** https://mawachinger.github.io/tmm-college/

## Architekturentscheidungen und ihre Gründe

**Bewertung läuft in der Datenbank, nicht im Browser.** Das Repo ist öffentlich und die
Seite ebenso. Stünden die Fragen im ausgelieferten JavaScript, wären die Lösungen lesbar.
Deshalb liefert `get_quiz()` Fragen ohne Lösungen aus und `submit_quiz()` bewertet serverseitig.
Diese Trennung bitte nicht aufweichen.

**`supabase/seed_questions.sql` liegt bewusst nicht im Repo** (steht in `.gitignore`), weil
es die richtigen Antworten enthält. Die Datei liegt intern bei TMM und wird von Hand im
Supabase SQL Editor eingespielt.

**Schreibzugriffe laufen ausschließlich über Datenbankfunktionen.** `module_progress` und
`session_attendance` haben keine INSERT/UPDATE-Policies. Sonst könnte sich jeder selbst auf
„bestanden" setzen. Neue Schreibpfade also als `security definer`-Funktion anlegen, nicht
als Tabellen-Policy.

**Die Reihenfolge steht an zwei Stellen.** Anzeige in `src/data/curriculum.js`, verbindlich
in der Tabelle `curriculum_steps`. `is_unlocked()` prüft ausschließlich die Tabelle. Eine
Etappe, die nur im Code steht, bleibt gesperrt — beides muss zusammen geändert werden.

**Folien liegen als Bilder im Supabase-Bucket `module-slides`** (nicht öffentlich, Pfade
`M01/01.jpg` …). Ausgeliefert über signierte Links mit vier Stunden Gültigkeit. Die
Original-PPTX liegen in SharePoint als Redaktionsablage; aus der Plattform heraus gibt es
bewusst keinen Link dorthin, damit Lernende nicht an die Quelldateien kommen.

**Die Lesebestätigung setzt sich automatisch**, sobald jemand die letzte Folie erreicht hat.
Die Handbestätigung bleibt als Notausgang, falls Bilder fehlen.

## Fallstricke

- Kein `localStorage` — Lernstand gehört in die Datenbank, sonst ist er gerätegebunden.
- Bei `on conflict do update` in Postgres darf die Zieltabelle **nicht** schemaqualifiziert
  referenziert werden (`module_progress.attempts`, nicht `public.module_progress.attempts`).
- Parameternamen bestehender Funktionen lassen sich nicht per `create or replace` ändern —
  vorher `drop function`.
- Der Repo-Ordner liegt unter OneDrive. Bei Dateisperren hilft ein Umzug nach `C:\Repos\`.
- `VITE_BASE` kommt im Workflow aus dem Repository-Namen. Bei eigener Domain muss der
  Basispfad auf `/` und eine CNAME-Datei ins Repo.

## Folien neu rendern

Wenn sich eine PPTX ändert:

```bash
libreoffice --headless --convert-to pdf ModulXX.pptx
pdftoppm -jpeg -r 190 -jpegopt quality=80 ModulXX.pdf s
# Dateien zu 01.jpg, 02.jpg … umbenennen, in module-slides/MXX hochladen
```

## Rollen

- **Lernende:** sehen nur eigene Daten, brauchen eine Programmzuweisung
- **Trainer:** `profiles.is_trainer = true`, sieht alle Teilnehmenden, weist Programme zu,
  bestätigt Session-Teilnahmen
- **Zugang zur App:** über Entra, Unternehmens-Apps → TMM College → Benutzer und Gruppen

## Offene Punkte

1. **HD-Folien hochladen** — 1900px-Fassung ersetzt die erste 1100px-Fassung im Bucket
2. **Zertifikat gestalten** — aktuell ein Entwurf ohne Unterschriften und Zertifikatsnummer
3. **Adresse entpersonalisieren** — eigene Domain oder GitHub-Organisation; letztere hätte
   den Vorteil, dass das Repo TMM gehört statt einem privaten Konto
4. **Betriebsrat** — die Trainer-Auswertung protokolliert jeden Fehlversuch mit Zeitstempel.
   Das ist eine Leistungsauswertung und vor dem Pilotlauf abzustimmen. Zum Entschärfen genügt
   eine Änderung an `trainer_overview()`.
5. **LEAN-Inhalte** — Programm existiert, Module fehlen. Reihenfolge: Etappen in
   `curriculum_steps`, dann Eintrag in `PROGRAMS`, dann Fragen und Folien.

## Arbeitsweise

Martin ist BIM-Fachmann, kein Entwickler. Erklär Schritte konkret und benenne, wo geklickt
wird. Änderungen an Datenbank und Code gehören zusammen — wenn eine Migration nötig ist,
sag es dazu und nenne die Reihenfolge (Datenbank zuerst, dann Code).
