/* Curriculum — Programme, Module, Live-Sessions.
   Die Reihenfolge und die Freischaltlogik werden zusaetzlich serverseitig
   geprueft (Tabelle curriculum_steps). Aenderungen hier muessen dort
   nachgezogen werden. */

const BIM_MODULES = [
  { id: "M01", nr: "01", title: "BIM-Methode", color: "#00A4E8", slides: 12,
    file: "Modul01_BIM-Methode_v3.pptx",
    lead: "Grundbegriffe, ISO 19650, Reifegrade und Rollen. Der Einstieg in die Methodik.",
    topics: ["Was ist BIM?", "Das BIM-Modell — drei Ebenen", "BIM als Paradigmenwechsel", "BIM-Scheitern ist kein Technologieproblem", "Systeminteroperabilität & TMM-Software-Ökosystem", "ISO 19650 — Der normative Rahmen", "BIM-Reifegrade — wo steht die Branche?", "BIM-Rollen & Verantwortlichkeiten"] },
  { id: "M02", nr: "02", title: "Modellarten & CDE-Workflow", color: "#028090", slides: 14,
    file: "Modul02_Modellarten_v3.pptx",
    lead: "Welche Modelle im Projekt entstehen, wie sie zusammenspielen und wie das CDE sie steuert.",
    topics: ["Welche Modelle entstehen in einem BIM-Projekt?", "Zusammenspiel der Modellarten", "Modellhierarchie, Modell- & Datenrelationen", "Das Koordinationsmodell", "Dreistufige Qualitätssicherung", "Nicht-geometrische Datenmodelle", "As-Built-Modell & FM-Übergabe", "Das CDE-Ökosystem", "Modell- und Planbezeichnungen", "Statuswerte im CDE — Freigabeprozess"] },
  { id: "M03", nr: "03", title: "Digitale Projektabwicklung", color: "#3A7D44", slides: 12,
    file: "Modul03_Projektabwicklung.pptx",
    lead: "Vom Vorgehensmodell über Data-Drops bis zum Berechtigungskonzept im CDE.",
    topics: ["Das TMM-Vorgehensmodell", "Anwendungsfälle (AWF) im Projekt", "AWF-Logik in der Projektabwicklung", "Data-Drops — bewusster Entwicklungsprozess", "Koordination am Projektreifegrad ausrichten", "BCF — BIM Collaboration Format", "Georeferenzierung & Lagekoordination", "Berechtigungskonzept im CDE"] },
  { id: "M04", nr: "04", title: "Anwendungsfälle (AWF)", color: "#2E5A8E", slides: 13,
    file: "Modul04_Anwendungsfaelle.pptx",
    lead: "AWF lesen, beschreiben und einsetzen. Bezeichnungsschablone, RACI und der Katalog.",
    topics: ["AWF — Vertiefung der Definition", "Die Bezeichnungsschablone", "Standardisierung vs. Spezifizierung", "Die 7 Elemente einer AWF-Beschreibung", "RACI — Verantwortlichkeiten im AWF", "Der AWF-Katalog — 4 Disziplinen", "Disziplinübergreifende AWF-Abhängigkeiten", "Praxisbeispiel — AWF-Kette durch ein Projekt", "AWF im Projekt einsetzen"] },
  { id: "M05", nr: "05", title: "Projektspezifische Softwaretopologie", color: "#6C3483", slides: 12,
    file: "Modul05_Softwaretopologie.pptx",
    lead: "Systemkategorien, Schnittstellen und Datenflüsse eines Projekts lesen und konfigurieren.",
    topics: ["Was ist eine Softwaretopologie?", "Systemkategorien im BIM-Projekt", "Autorensysteme je Disziplin", "Schnittstellen & Datenaustauschformate", "Datenfluss in der Softwaretopologie", "TMM-Softwarelandschaft — Überblick", "Topologie projektspezifisch konfigurieren", "AWF und Systeme verknüpfen"] },
  { id: "M06", nr: "06", title: "Interne Softwarearchitektur", color: "#1A5276", slides: 12,
    file: "Modul06_Softwarearchitektur.pptx",
    lead: "Wie BIM-Werkzeuge in die Unternehmens-IT eingebettet sind: Lizenzen, Sicherheit, Backup.",
    topics: ["Interne Architektur vs. Projekttopologie", "BIM in der IT-Landschaft — drei Systemebenen", "Cloud vs. On-Premise — Entscheidungsrahmen", "Lizenzmanagement — Zugang und Planung", "ERP/AVA-Anbindung", "Datensicherheit & Zugriffsrechte", "Backup & Revisionssicherheit für Modelldaten", "IT-Onboarding"] },
  { id: "M07", nr: "07", title: "Modellbasierte Koordinierung", color: "#943126", slides: 12,
    file: "Modul07_Koordinierung.pptx",
    lead: "Der operative Kern: drei Prüfbereiche, BCF-Workflow und Koordinationsrunden.",
    topics: ["Modellbasierte Koordinierung — der operative Kern", "Modellbereitstellung & Upload-Rhythmus", "Drei Prüfbereiche: geometrisch, semantisch, funktional", "BCF-Issues erstellen und zuweisen", "BCF-Lebenszyklus — von Open bis Closed", "Koordinationsrunden — Struktur und Ablauf", "Koordinationsmodell führen, pflegen, archivieren", "Dokumentation & Reporting"] },
  { id: "M08", nr: "08", title: "AIA — Das digitale Lastenheft", color: "#1A7A4A", slides: 13,
    file: "Modul08_AIA.pptx",
    lead: "Die AIA als Aufgabenstellung des AG. Kapitelstruktur K1–K4 und die drei Säulen.",
    topics: ["Das BIM-Versprechen — und die ehrliche Realität", "Warum die AIA zum Monster wurde", "Was ist eine gute AIA — und was nicht?", "Der Lösungsansatz — 3 Säulen", "Aufbau der schlanken AIA", "AIA-Kapitelstruktur K1–K4", "AWF-Anforderungen — Kern der Aufgabenstellung", "AIA → BAP — Aufgabenstellung und AN-Konzept", "BIM kennen vs. BIM verstehen"] },
  { id: "M09", nr: "09", title: "BAP & Modellierungsrichtlinie", color: "#7E077D", slides: 13,
    file: "Modul09_BAP.pptx",
    lead: "Der BAP als verbindliche AN-Antwort. Kapitelstruktur, Namenskonvention, Anlagen.",
    topics: ["Was ist der BAP — und warum gibt es ihn?", "Kapitelstruktur nach Muster-BAP", "Namenskonvention — stabiler Dateiname", "Modellierungsrichtlinie — Anlage 2", "BAP im Projektverlauf — Fortschreibung & Freigabe", "AIA & BAP im Zusammenspiel", "QS-Prozess im BAP", "Alle 9 Module im Überblick"] },
];

const BIM_SESSIONS = [
  { id: "GRL", after: "M04", title: "Live-Session Grundlagen", focus: "Vertiefung M01–M04", minutes: 60 },
  { id: "WKZ", after: "M07", title: "Live-Session Werkzeuge", focus: "Vertiefung M05–M07", minutes: 60 },
  { id: "ZERT", after: "M09", title: "Live-Session BIM-Nutzen", focus: "Vertiefung M08–M09 · Zertifikatsübergabe", minutes: 60 },
];

export const PROGRAMS = [
  {
    id: "BIM",
    title: "BIM-Zertifizierung",
    subtitle: "Neun Module, drei Live-Sessions",
    lead: "Von der Methodik über Anwendungsfälle und Werkzeuge bis zu AIA und BAP.",
    accent: "#00A4E8",
    modules: BIM_MODULES,
    sessions: BIM_SESSIONS,
  },
  {
    id: "LEAN",
    title: "LEAN-Zertifizierung",
    subtitle: "In Vorbereitung",
    lead: "Lean Construction in der Projektabwicklung. Die Inhalte entstehen gerade.",
    accent: "#028090",
    modules: [],
    sessions: [],
  },
];

export const getProgram = (id) => PROGRAMS.find((p) => p.id === id) || null;

/* Reihenfolge eines Programms: Module, dazwischen die Live-Sessions */
export function pathOf(program) {
  if (!program) return [];
  const items = [];
  program.modules.forEach((m) => {
    items.push({ kind: "module", ...m });
    const s = program.sessions.find((x) => x.after === m.id);
    if (s) items.push({ kind: "session", ...s });
  });
  return items;
}

/* Status je Etappe: done / active / locked */
export function buildStatus(program, progress) {
  const map = {};
  let blocked = false;
  pathOf(program).forEach((item) => {
    const done =
      item.kind === "module"
        ? !!(progress.modules[item.id] && progress.modules[item.id].read && progress.modules[item.id].passed)
        : !!(progress.sessions[item.id] && progress.sessions[item.id].done);
    if (done && !blocked) map[item.id] = "done";
    else if (!blocked) { map[item.id] = "active"; blocked = true; }
    else map[item.id] = "locked";
  });
  return map;
}

export const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return "";
  }
};

export const fmtDateTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
};
