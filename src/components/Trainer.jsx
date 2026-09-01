import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/supabase.js";
import { PROGRAMS, getProgram, pathOf, buildStatus, fmtDate, fmtDateTime } from "../data/curriculum.js";

export default function Trainer({ onClose }) {
  const [rows, setRows] = useState(null);
  const [invites, setInvites] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    setError("");
    try {
      const [uebersicht, offen] = await Promise.all([
        api.trainerOverview(),
        api.openInvitations(),
      ]);
      setRows(uebersicht);
      setInvites(offen || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const shown = (rows || []).filter(
    (r) => filter === "ALL" || (r.programs || []).includes(filter)
  );

  const exportCsv = () => {
    const head = ["Name", "E-Mail", "Programm", "Fortschritt", "Aktuelle Etappe", "Versuche gesamt", "Letzte Aktivität"];
    const lines = [head.join(";")];
    (rows || []).forEach((r) => {
      (r.programs || []).forEach((pid) => {
        const program = getProgram(pid);
        if (!program) return;
        const st = buildStatus(program, normalize(r));
        const items = pathOf(program);
        const done = items.filter((i) => st[i.id] === "done").length;
        const active = items.find((i) => st[i.id] === "active");
        const attempts = program.modules.reduce(
          (a, m) => a + (((r.modules || {})[m.id] || {}).attempts || 0), 0
        );
        lines.push(
          [
            r.display_name || "",
            r.email || "",
            program.title,
            done + "/" + items.length,
            active ? (active.kind === "module" ? "M" + active.nr : active.id) : "abgeschlossen",
            attempts,
            r.last_activity ? fmtDateTime(r.last_activity) : "",
          ]
            .map((c) => '"' + String(c).replace(/"/g, '""') + '"')
            .join(";")
        );
      });
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

      <Einladen invites={invites} onDone={load} />

      <section className="tm-panel">
        <div className="tm-panel-head">
          <div>
            <p className="tm-eyebrow">Trainer-Ansicht</p>
            <h1 className="tm-h1">Teilnehmende und Zuweisungen</h1>
          </div>
          <div className="tm-row">
            <button className="tm-btn tm-btn-ghost" onClick={load}>Aktualisieren</button>
            <button className="tm-btn tm-btn-ghost" onClick={exportCsv} disabled={!rows}>CSV exportieren</button>
          </div>
        </div>

        <div className="tm-filter">
          <button className={"tm-chip" + (filter === "ALL" ? " is-on" : "")} onClick={() => setFilter("ALL")}>
            Alle
          </button>
          {PROGRAMS.map((p) => (
            <button
              key={p.id}
              className={"tm-chip" + (filter === p.id ? " is-on" : "")}
              onClick={() => setFilter(p.id)}
            >
              {p.title}
            </button>
          ))}
        </div>

        {error && <p className="tm-error">{error}</p>}
        {!rows ? (
          <div className="tm-boot">Daten werden geladen …</div>
        ) : shown.length === 0 ? (
          <div className="tm-empty">Keine Teilnehmenden in dieser Auswahl.</div>
        ) : (
          <table className="tm-table">
            <thead>
              <tr>
                <th>Teilnehmer</th>
                <th>Zugewiesene Programme</th>
                <th>Fortschritt</th>
                <th>Letzte Aktivität</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const assigned = r.programs || [];
                return (
                  <tr key={r.user_id}>
                    <td>
                      <strong>{r.display_name}</strong>
                      <br />
                      <span className="tm-muted">{r.email}</span>
                    </td>
                    <td>
                      {assigned.length === 0 ? (
                        <span className="tm-muted">keine</span>
                      ) : (
                        assigned.map((pid) => {
                          const p = getProgram(pid);
                          return (
                            <span key={pid} className="tm-pill" style={{ background: p ? p.accent : "#8898AE" }}>
                              {p ? p.title : pid}
                            </span>
                          );
                        })
                      )}
                    </td>
                    <td>
                      {assigned.length === 0 ? (
                        "—"
                      ) : (
                        assigned.map((pid) => {
                          const program = getProgram(pid);
                          if (!program) return null;
                          const items = pathOf(program);
                          if (items.length === 0) return null;
                          const st = buildStatus(program, normalize(r));
                          const done = items.filter((i) => st[i.id] === "done").length;
                          return (
                            <div key={pid} className="tm-prog-line">
                              <div className="tm-mini-bar">
                                <span
                                  style={{
                                    width: Math.round((done / items.length) * 100) + "%",
                                    background: program.accent,
                                  }}
                                />
                              </div>
                              <span className="tm-muted">{done}/{items.length}</span>
                            </div>
                          );
                        })
                      )}
                    </td>
                    <td>{r.last_activity ? fmtDateTime(r.last_activity) : "—"}</td>
                    <td>
                      <button
                        className="tm-link tm-link-dark"
                        onClick={() => setOpen(open === r.user_id ? null : r.user_id)}
                      >
                        {open === r.user_id ? "schließen" : "Verwalten"}
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
            onAssign={(pid, val) => act(() => api.assignProgram(open, pid, val))}
            onToggleSession={(sid, val) => act(() => api.confirmSession(open, sid, val))}
          />
        )}

        <p className="tm-note">
          Diese Auswertung ist personenbezogen. Zugriff haben ausschließlich Konten mit Trainer-Rolle.
          Wird eine Zuweisung entfernt, bleibt der Lernstand erhalten und lebt bei erneuter Zuweisung wieder auf.
        </p>
      </section>
    </main>
  );
}

function normalize(row) {
  const mods = {};
  Object.keys(row.modules || {}).forEach((k) => {
    const m = row.modules[k];
    mods[k] = {
      read: m.read,
      readAt: m.read_at,
      passed: m.passed,
      passedAt: m.passed_at,
      attempts: m.attempts,
      bestScore: m.best_score,
    };
  });
  return { modules: mods, sessions: row.sessions || {} };
}

function Detail({ row, onAssign, onToggleSession }) {
  if (!row) return null;
  const assigned = row.programs || [];
  const mods = row.modules || {};
  const sess = row.sessions || {};

  return (
    <div className="tm-detail">
      <h3 className="tm-h3">{row.display_name} — Programme zuweisen</h3>
      <div className="tm-codes">
        {PROGRAMS.map((p) => {
          const on = assigned.includes(p.id);
          return (
            <div key={p.id} className="tm-code-row">
              <span className="tm-pill" style={{ background: p.accent }}>{p.id}</span>
              <span className="tm-code-title">
                {p.title}
                <span className="tm-muted"> · {p.subtitle}</span>
              </span>
              <button
                className={"tm-btn " + (on ? "tm-btn-ghost" : "tm-btn-primary")}
                onClick={() => onAssign(p.id, !on)}
              >
                {on ? "Zuweisung entfernen" : "Zuweisen"}
              </button>
            </div>
          );
        })}
      </div>

      {assigned.map((pid) => {
        const program = getProgram(pid);
        if (!program || program.modules.length === 0) return null;
        return (
          <div key={pid}>
            <h3 className="tm-h3">{program.title} — Einzelnachweis</h3>
            <table className="tm-table">
              <thead>
                <tr>
                  <th>Modul</th><th>Unterlagen</th><th>Lernabfrage</th><th>Versuche</th><th>Bestes Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {program.modules.map((m) => {
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

            <div className="tm-codes">
              {program.sessions.map((s) => {
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
                      onClick={() => onToggleSession(s.id, !done)}
                    >
                      {done ? "Bestätigung zurücknehmen" : "Teilnahme bestätigen"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Einladen ----------
   Konten legt Entra an, nicht die Plattform. Eine Einladung ist deshalb ein
   Vermerk auf einer E-Mail-Adresse: meldet sich die Person zum ersten Mal an,
   macht der Trigger daraus eine Zuweisung. Die Mail schreibt der Trainer
   vorerst selbst -- der Knopf legt ihm den Text in die Zwischenablage. */
function Einladen({ invites, onDone }) {
  const [email, setEmail] = useState("");
  const [programId, setProgramId] = useState(PROGRAMS[0] ? PROGRAMS[0].id : "");
  const [busy, setBusy] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const [kopiert, setKopiert] = useState("");
  // eigener Fehlerzustand: eine Meldung weiter unten im anderen Panel wird uebersehen
  const [fehler, setFehler] = useState("");

  const adresse = window.location.origin + import.meta.env.BASE_URL;

  const mailtext = (pid) => {
    const p = getProgram(pid);
    const titel = p ? p.title : pid;
    return (
      "Betreff: TMM College — " + titel + "\n\n" +
      "Hallo,\n\n" +
      "für Sie ist im TMM College das Programm „" + titel + "“ freigeschaltet.\n\n" +
      "Sie melden sich mit Ihrem TMM-Konto an, ein eigenes Passwort brauchen Sie nicht:\n" +
      adresse + "\n\n" +
      "Nach der Anmeldung sehen Sie Ihren Lernpfad. Die Module bearbeiten Sie im " +
      "Selbststudium, die Termine der Live-Sessions stimmen wir gesondert ab.\n\n" +
      "Bei Fragen melden Sie sich gern.\n\nViele Grüße"
    );
  };

  const kopieren = async (pid) => {
    try {
      await navigator.clipboard.writeText(mailtext(pid));
      setKopiert(pid);
      setTimeout(() => setKopiert(""), 2500);
    } catch (e) {
      setFehler("Kopieren nicht möglich: " + e.message);
    }
  };

  const einladen = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setHinweis("");
    setFehler("");
    try {
      const r = await api.invitePerson(email, programId);
      setHinweis(
        r && r.status === "zugewiesen"
          ? r.email + " ist bereits angemeldet — das Programm wurde direkt zugewiesen."
          : "Einladung für " + (r ? r.email : email) + " vermerkt. Jetzt die Mail verschicken."
      );
      setEmail("");
      await onDone();
    } catch (err) {
      setFehler(err.message);
    } finally {
      setBusy(false);
    }
  };

  const zuruecknehmen = async (inv) => {
    setFehler("");
    try {
      await api.revokeInvitation(inv.email, inv.program_id);
      await onDone();
    } catch (err) {
      setFehler(err.message);
    }
  };

  return (
    <section className="tm-panel">
      <p className="tm-eyebrow">Zugang</p>
      <h2 className="tm-h2">Person einladen</h2>
      <p className="tm-lead">
        Die Einladung merkt sich die Adresse. Sobald sich die Person zum ersten Mal mit ihrem
        TMM-Konto anmeldet, ist das Programm da — sie landet nicht mehr auf einer leeren Startseite.
        Den Zugang zur App selbst vergibt weiterhin Entra.
      </p>

      <form className="tm-row" onSubmit={einladen}>
        <input
          className="tm-input"
          type="email"
          placeholder="vorname.nachname@tmm-ag.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <select
          className="tm-input"
          style={{ flex: "0 0 auto", minWidth: 200 }}
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          disabled={busy}
        >
          {PROGRAMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {p.modules.length === 0 ? " (noch ohne Inhalte)" : ""}
            </option>
          ))}
        </select>
        <button className="tm-btn tm-btn-primary" type="submit" disabled={busy || !email.trim()}>
          {busy ? "…" : "Einladen"}
        </button>
        <button
          className="tm-btn tm-btn-ghost"
          type="button"
          onClick={() => kopieren(programId)}
        >
          {kopiert === programId ? "Text kopiert" : "Einladungstext kopieren"}
        </button>
      </form>
      {fehler && <p className="tm-error">{fehler}</p>}
      {hinweis && <p className="tm-note">{hinweis}</p>}

      <h3 className="tm-h3">Offene Einladungen</h3>
      {!invites ? (
        <div className="tm-empty">wird geladen …</div>
      ) : invites.length === 0 ? (
        <div className="tm-empty">
          Keine offenen Einladungen. Angenommene Einladungen stehen unten als Zuweisung.
        </div>
      ) : (
        <table className="tm-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Programm</th>
              <th>Eingeladen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => {
              const p = getProgram(inv.program_id);
              return (
                <tr key={inv.email + inv.program_id}>
                  <td>{inv.email}</td>
                  <td>
                    <span className="tm-pill" style={{ background: p ? p.accent : "#8898AE" }}>
                      {p ? p.title : inv.program_id}
                    </span>
                  </td>
                  <td className="tm-muted">
                    {fmtDate(inv.invited_at)}
                    {inv.invited_by ? " · " + inv.invited_by : ""}
                  </td>
                  <td>
                    <button className="tm-link tm-link-dark" onClick={() => zuruecknehmen(inv)}>
                      zurücknehmen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
