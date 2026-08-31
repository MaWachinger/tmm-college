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
bewusst keinen Link dorthin, damit Lernende nicht an die Quelldateien kommen. Das gilt auch
für die Folien selbst: in Modul 01 stand der SharePoint-Pfad einmal als Text auf der
Titelfolie und wäre so mitgerendert worden. Vor dem Rendern also kurz prüfen.

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

Wenn sich eine PPTX ändert. Zwei naheliegende Wege sind ausdrücklich **nicht** gemeint:

- **PowerPoints JPEG-Export** liefert 96 dpi. Bei 25,4 cm Folienbreite sind das 960 px,
  also weniger als die 1100 px, die ohnehin schon zu weich waren. Höher nur über einen
  Registry-Eintrag.
- **LibreOffice** zeichnet die Folien mit eigener Engine neu. Bei Fließtext unauffällig,
  bei SmartArt, positionierten Beschriftungen und der TMM-Schrift nicht. Die Verschiebungen
  fallen erst im Betrieb auf, dann aber in allen Modulen gleichzeitig.

Gerendert wird von PowerPoint selbst, ferngesteuert. Alle PPTX in einen Ordner, dann:

```bash
pip install pywin32 pillow                                   # einmalig
python tools/pptx_rendern.py "<ordner>" --breite 1900 --qualitaet 80
```

Ergebnis liegt in `<ordner>/render/M01/01.jpg` … — genau die Struktur des Buckets. Das
Skript erkennt die Modulnummer am Dateinamen, rechnet die Höhe aus dem Seitenverhältnis
der Folie (720 × 405 pt, also 16:9) und legt die Zwischenbilder im Temp-Ordner ab, nicht
in SharePoint. Der Umweg über PNG ist nötig, weil PowerPoint beim JPG-Export keine
Qualitätsstufe hergibt.

**Wenn das Skript hängt**, blockiert ein modaler Dialog die Fernsteuerung. Beobachtet:
ein PowerPoint-Add-In greift beim Öffnen auf `ActivePresentation` zu, und weil das Skript
die Dateien bewusst ohne Fenster öffnet, gibt es keine — Laufzeitfehler `80048240`,
„There is no active presentation". Tritt nicht zuverlässig auf; neun Module liefen durch,
der Fehler kam erst beim nächsten Aufruf.

Aufräumen in dieser Reihenfolge, sonst bleibt die PPTX gesperrt und lässt sich nicht
einmal mehr lesen:

1. Im Dialog **„Beenden"** klicken. Das stoppt nur das Makro — PowerPoint läuft weiter,
   fensterlos, und hält die Datei immer noch.
2. Die Instanz über die Schnittstelle schließen: `Presentations` durchgehen, `Close()`,
   dann `Quit()`. Erst danach ist die Datei frei. Das Skript prüft beim Start, ob schon
   ein PowerPoint läuft, und bricht mit einem Hinweis ab, statt sich an eine kaputte
   Instanz zu hängen.

Als Ausweichweg liegt `tools/folien_rendern.py`
daneben: rendert aus PDFs, die man in PowerPoint von Hand über *Datei → Exportieren →
PDF/XPS* erzeugt (Qualität **Standard**, nicht „Minimale Größe"), braucht nur
`pip install pymupdf` und kommt ohne PowerPoint-Automatisierung aus.

Beim Hochladen im Bucket `module-slides` **erst den alten Ordnerinhalt löschen**. Der
Betrachter listet alles, was in `MXX/` liegt, sortiert nach Namen — liegengebliebene
Dateien erscheinen als zusätzliche Folien mitten im Modul.

Ändert sich dabei die Folienzahl, muss `slides:` beim Modul in `src/data/curriculum.js`
nachgezogen werden. Die Zahl ist reine Anzeige, gezählt wird im Betrachter selbst.

## Rollen

- **Lernende:** sehen nur eigene Daten, brauchen eine Programmzuweisung
- **Trainer:** `profiles.is_trainer = true`, sieht alle Teilnehmenden, weist Programme zu,
  bestätigt Session-Teilnahmen
- **Zugang zur App:** über Entra, Unternehmens-Apps → TMM College → Benutzer und Gruppen

## Offene Punkte

1. **Zertifikat im Betrieb ansehen** — Blatt 1 und 2 sind bisher nur als statische Vorschau
   geprüft, nie in der laufenden App mit echten Daten. Dafür braucht es ein vollständig
   abgeschlossenes Programm; als Trainer lässt sich das an einem Testkonto herstellen.
2. **Zertifikat** — Nummer, zwei Unterschriftsfelder und Blatt 2 mit den Lernschwerpunkten
   stehen. Offen: wer gegenzeichnet, Geschäftsführung oder HR — das ist die eine Zeile
   `CERT_COUNTERSIGN` in `src/App.jsx`. Und die Nummer wird im Browser aus Programm und
   Konto-Kennung abgeleitet: stabil und eindeutig, aber aus keinem Register. Prüfbar wäre
   sie erst mit einer Tabelle `certificates` und einer `security definer`-Funktion, die
   beim Abschluss eine laufende Nummer zieht.
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
