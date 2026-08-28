import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/supabase.js";
import { MODULES, SESSIONS, PATH, buildStatus, fmtDate, fmtDateTime } from "../data/curriculum.js";

export default function Trainer({ onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await api.trainerOverview());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSession = async (userId, sessionId, value) => {
    try {
      await api.confirmSession(userId, sessionId, value);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const exportCsv = () => {
    const head = ["Name", "E-Mail", "Etappen abgeschlossen", ...MODULES.map((m) => m.id + " Status"),
      ...MODULES.map((m) => m.id + " Versuche"), ...SESSIONS.map((s) => s.id), "Letzte Aktivität"];
    const lines = [head.join(";")];
    (rows || []).forEach((r) => {
      const progress = { modules: r.modules || {}, sessions: r.sessions || {} };
      const st = buildStatus(normalize(progress));
      const done = PATH.filter((i) => st[i.id] === "done").length;
      const cells = [
        r.display_name || "",
        r.email || "",
        done + "/" + PATH.length,
        ...MODULES.map((m) => ((r.modules || {})[m.id] || {}).passed ? "bestanden" : ((r.modules || {})[m.id] || {}).read ? "in Arbeit" : "offen"),
        ...MODULES.map((m) => String(((r.modules || {})[m.id] || {}).attempts || 0)),
        ...SESSIONS.map((s) => ((r.sessions || {})[s.id] ? fmtDate((r.sessions || {})[s.id].doneAt) : "")),
        r.last_activity ? fmtDateTime(r.last_activity) : "",
      ];
      lines.push(cells.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(";"));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "TMM_College_Lernstand_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="tm-main">
      <button className="tm-back" onClick={onClose}>← Zurück</button>
      <section className="tm-panel">
        <div className="tm-panel-head">
          <div>
            <p className="tm-eyebrow">Trainer-Ansicht</p>
            <h1 className="tm-h1">Lernstand aller Teilnehmenden</h1>
          </div>
          <div className="tm-row">
            <button className="tm-btn tm-btn-ghost" onClick={load}>Aktualisieren</button>
            <button className="tm-btn tm-btn-ghost" onClick={exportCsv} disabled={!rows}>CSV exportieren</button>
          </div>
        </div>

        {error && <p className="tm-error">{error}</p>}
        {!rows ? (
          <div className="tm-boot">Daten werden geladen …</div>
        ) : rows.length === 0 ? (
          <div className="tm-empty">Noch niemand angemeldet.</div>
        ) : (
          <table className="tm-table">
            <thead>
              <tr>
                <th>Teilnehmer</th>
                <th>Fortschritt</th>
                <th>Aktuelle Etappe</th>
                <th>Versuche gesamt</th>
                <th>Letzte Aktivität</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const progress = normalize({ modules: r.modules || {}, sessions: r.sessions || {} });
                const st = buildStatus(progress);
                const done = PATH.filter((i) => st[i.id] === "done").length;
                const active = PATH.find((i) => st[i.id] === "active");
                const attempts = MODULES.reduce((a, m) => a + (((r.modules || {})[m.id] || {}).attempts || 0), 0);
                return (
                  <tr key={r.user_id}>
                    <td>
                      <strong>{r.display_name}</strong>
                      <br />
                      <span className="tm-muted">{r.email}</span>
                    </td>
                    <td>
                      <div className="tm-mini-bar">
                        <span style={{ width: Math.round((done / PATH.length) * 100) + "%" }} />
                      </div>
                      {done}/{PATH.length}
                    </td>
                    <td>{active ? (active.kind === "module" ? "M" + active.nr : active.id) : "abgeschlossen"}</td>
                    <td>{attempts}</td>
                    <td>{r.last_activity ? fmtDateTime(r.last_activity) : "—"}</td>
                    <td>
                      <button className="tm-link tm-link-dark" onClick={() => setOpen(open === r.user_id ? null : r.user_id)}>
                        {open === r.user_id ? "schließen" : "Details"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {open && rows && (
          <Detail
            row={rows.find((r) => r.user_id === open)}
            onToggleSession={toggleSession}
          />
        )}

        <p className="tm-note">
          Diese Auswertung ist personenbezogen. Zugriff haben ausschließlich Konten mit Trainer-Rolle.
        </p>
      </section>
    </main>
  );
}

function normalize(p) {
  const mods = {};
  Object.keys(p.modules || {}).forEach((k) => {
    const m = p.modules[k];
    mods[k] = { read: m.read, readAt: m.read_at, passed: m.passed, passedAt: m.passed_at, attempts: m.attempts };
  });
  return { modules: mods, sessions: p.sessions || {} };
}

function Detail({ row, onToggleSession }) {
  if (!row) return null;
  const mods = row.modules || {};
  const sess = row.sessions || {};
  return (
    <div className="tm-detail">
      <h3 className="tm-h3">{row.display_name} — Einzelnachweis</h3>
      <table className="tm-table">
        <thead>
          <tr><th>Modul</th><th>Unterlagen</th><th>Lernabfrage</th><th>Versuche</th><th>Bestes Ergebnis</th></tr>
        </thead>
        <tbody>
          {MODULES.map((m) => {
            const s = mods[m.id] || {};
            return (
              <tr key={m.id}>
                <td>M{m.nr} {m.title}</td>
                <td>{s.read ? fmtDate(s.read_at) : "—"}</td>
                <td>{s.passed ? fmtDate(s.passed_at) : "offen"}</td>
                <td>{s.attempts || 0}</td>
                <td>{s.best_score != null ? s.best_score + "/8" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="tm-h3">Teilnahme an den Live-Sessions</h3>
      <div className="tm-codes">
        {SESSIONS.map((s) => {
          const done = !!sess[s.id];
          return (
            <div key={s.id} className="tm-code-row">
              <span className="tm-badge-session tm-card-badge">{s.id}</span>
              <span className="tm-code-title">
                {s.title}
                {done && <span className="tm-muted"> · bestätigt am {fmtDate(sess[s.id].doneAt)}</span>}
              </span>
              <button
                className={"tm-btn " + (done ? "tm-btn-ghost" : "tm-btn-primary")}
                onClick={() => onToggleSession(row.user_id, s.id, !done)}
              >
                {done ? "Bestätigung zurücknehmen" : "Teilnahme bestätigen"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
