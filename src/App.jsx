import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, signInWithEntra, signOut, api, loadProfile } from "./lib/supabase.js";
import { getProgram, pathOf, buildStatus, fmtDate } from "./data/curriculum.js";
import Quiz from "./components/Quiz.jsx";
import Trainer from "./components/Trainer.jsx";
import SlideViewer from "./components/SlideViewer.jsx";

const emptyProgress = () => ({ modules: {}, sessions: {} });

export default function App() {
  const [booted, setBooted] = useState(false);
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState(emptyProgress());
  const [programs, setPrograms] = useState([]);
  const [view, setView] = useState({ name: "home" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, progs] = await Promise.all([api.myProgress(), api.myPrograms()]);
      setProgress({ modules: p.modules || {}, sessions: p.sessions || {} });
      setPrograms(progs || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data && data.session) {
        const pr = await loadProfile();
        if (!active) return;
        setProfile(pr);
        await refresh();
      }
      if (active) setBooted(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (session) {
        setProfile(await loadProfile());
        await refresh();
      } else {
        setProfile(null);
        setProgress(emptyProgress());
        setPrograms([]);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const setRead = async (moduleId, value) => {
    setBusy(true);
    setError("");
    try {
      await api.confirmRead(moduleId, value);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const activeProgram = view.program ? getProgram(view.program) : null;
  const status = useMemo(
    () => (activeProgram ? buildStatus(activeProgram, progress) : {}),
    [activeProgram, progress]
  );

  if (!booted) {
    return (
      <div className="tm-root">
        <div className="tm-boot">Wird geladen …</div>
      </div>
    );
  }

  const openItem = (item) =>
    setView(
      item.kind === "module"
        ? { name: "module", program: view.program, id: item.id }
        : { name: "session", program: view.program, id: item.id }
    );

  return (
    <div className="tm-root">
      <header className="tm-header">
        <button className="tm-brand tm-brand-btn" onClick={() => setView({ name: "home" })}>
          <span className="tm-brand-mark">TMM</span>
          <span className="tm-brand-word">COLLEGE</span>
          {activeProgram && <span className="tm-brand-sub">{activeProgram.title}</span>}
        </button>
        <div className="tm-header-right">
          {profile && (
            <>
              <span className="tm-learner">{profile.display_name}</span>
              {profile.is_trainer && (
                <button className="tm-link" onClick={() => setView({ name: "trainer" })}>Trainer</button>
              )}
              <button className="tm-link" onClick={signOut}>Abmelden</button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="tm-banner">
          {error}
          <button className="tm-link" onClick={() => setError("")}>schließen</button>
        </div>
      )}

      {!profile ? (
        <Login />
      ) : view.name === "trainer" ? (
        <Trainer onClose={() => setView({ name: "home" })} />
      ) : view.name === "module" ? (
        <ModuleView
          module={activeProgram.modules.find((m) => m.id === view.id)}
          state={progress.modules[view.id] || {}}
          busy={busy}
          onRead={setRead}
          onQuiz={() => setView({ ...view, name: "quiz" })}
          onBack={() => setView({ name: "program", program: view.program })}
        />
      ) : view.name === "quiz" ? (
        <Quiz
          module={activeProgram.modules.find((m) => m.id === view.id)}
          onRefresh={refresh}
          onBack={() => setView({ ...view, name: "module" })}
          onDashboard={() => setView({ name: "program", program: view.program })}
        />
      ) : view.name === "session" ? (
        <SessionView
          session={activeProgram.sessions.find((s) => s.id === view.id)}
          state={progress.sessions[view.id] || {}}
          onRefresh={refresh}
          onBack={() => setView({ name: "program", program: view.program })}
        />
      ) : view.name === "certificate" ? (
        <Certificate
          profile={profile}
          program={activeProgram}
          progress={progress}
          onBack={() => setView({ name: "program", program: view.program })}
        />
      ) : view.name === "program" && activeProgram ? (
        <ProgramView
          program={activeProgram}
          status={status}
          progress={progress}
          onOpen={openItem}
          onCertificate={() => setView({ ...view, name: "certificate" })}
          onHome={() => setView({ name: "home" })}
        />
      ) : (
        <Home
          profile={profile}
          programs={programs}
          onOpen={(id) => setView({ name: "program", program: id })}
        />
      )}

      <footer className="tm-footer">TMM AG · TMM College</footer>
    </div>
  );
}

/* ---------- Anmeldung (programmneutral) ---------- */
function Login() {
  return (
    <main className="tm-main tm-login">
      <div className="tm-login-card">
        <p className="tm-eyebrow">Anmeldung</p>
        <h1 className="tm-h1">Weiterbildung im eigenen Tempo.</h1>
        <p className="tm-lead">
          Ihre zugewiesenen Schulungen und Zertifizierungen an einem Ort. Der Lernstand wird nach
          jedem Schritt gespeichert — Sie können jederzeit pausieren und auf jedem Gerät genau dort
          weitermachen.
        </p>
        <button className="tm-btn tm-btn-primary" onClick={signInWithEntra}>
          Mit TMM-Konto anmelden
        </button>
        <p className="tm-note">
          Die Anmeldung läuft über Ihr Microsoft-365-Konto. Ein separates Passwort gibt es nicht.
        </p>
      </div>
    </main>
  );
}

/* ---------- Startseite: alle zugewiesenen Programme ---------- */
function Home({ profile, programs, onOpen }) {
  const open = programs.filter((p) => p.total === 0 || p.done < p.total);
  const done = programs.filter((p) => p.total > 0 && p.done >= p.total);
  const firstName = (profile.display_name || "").split(" ")[0];

  return (
    <main className="tm-main">
      <section className="tm-hero">
        <p className="tm-eyebrow">Ihre Weiterbildung</p>
        <h1 className="tm-h1">Willkommen zurück{firstName ? ", " + firstName : ""}.</h1>
        <p className="tm-lead">
          {programs.length === 0
            ? "Ihnen ist derzeit keine Schulung zugewiesen. Ihr Trainer schaltet sie frei, sobald es losgeht."
            : open.length > 0
            ? "Hier stehen Ihre offenen Aufgaben und was Sie bereits abgeschlossen haben."
            : "Sie haben alle zugewiesenen Programme abgeschlossen."}
        </p>
      </section>

      {open.length > 0 && (
        <>
          <h3 className="tm-h3">Offen</h3>
          <div className="tm-programs">
            {open.map((p) => (
              <ProgramCard key={p.id} p={p} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <h3 className="tm-h3">Abgeschlossen</h3>
          <div className="tm-programs">
            {done.map((p) => (
              <ProgramCard key={p.id} p={p} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function ProgramCard({ p, onOpen }) {
  const empty = p.total === 0;
  const complete = !empty && p.done >= p.total;
  const pct = empty ? 0 : Math.round((p.done / p.total) * 100);
  return (
    <button
      className={"tm-program" + (complete ? " is-complete" : "") + (empty ? " is-empty" : "")}
      onClick={() => !empty && onOpen(p.id)}
      disabled={empty}
      style={{ borderTopColor: p.accent }}
    >
      <span className="tm-program-head">
        <span className="tm-program-title">{p.title}</span>
        <span className="tm-program-sub">{p.subtitle}</span>
      </span>
      {empty ? (
        <span className="tm-program-state">Inhalte in Vorbereitung</span>
      ) : (
        <>
          <span className="tm-program-bar">
            <span style={{ width: pct + "%", background: p.accent }} />
          </span>
          <span className="tm-program-state">
            {complete ? "Abgeschlossen" : p.done + " von " + p.total + " Etappen · " + pct + " %"}
          </span>
        </>
      )}
    </button>
  );
}

/* ---------- Lernpfad-Schiene ---------- */
function PathRail({ program, status, onOpen }) {
  const items = pathOf(program);
  return (
    <div className="tm-rail-wrap">
      <div className="tm-rail" role="list">
        {items.map((item, i) => {
          const st = status[item.id];
          const isSession = item.kind === "session";
          return (
            <div className="tm-rail-item" key={item.id} role="listitem">
              {i > 0 && <span className={"tm-rail-line " + (st === "locked" ? "is-locked" : "is-open")} />}
              <button
                className={"tm-node " + (isSession ? "tm-node-session " : "tm-node-module ") + "is-" + st}
                style={st === "done" && !isSession ? { background: item.color, borderColor: item.color } : undefined}
                onClick={() => st !== "locked" && onOpen(item)}
                disabled={st === "locked"}
                title={isSession ? item.title : "Modul " + item.nr + " — " + item.title}
              >
                {isSession ? item.id : st === "done" ? "✓" : item.nr}
              </button>
              <span className={"tm-node-cap is-" + st}>{isSession ? "Session" : "M" + item.nr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Programmansicht ---------- */
function ProgramView({ program, status, progress, onOpen, onCertificate, onHome }) {
  const items = pathOf(program);
  const doneCount = items.filter((i) => status[i.id] === "done").length;
  const nextItem = items.find((i) => status[i.id] === "active") || null;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const complete = items.length > 0 && doneCount === items.length;

  return (
    <main className="tm-main">
      <button className="tm-back" onClick={onHome}>← Alle Schulungen</button>

      <section className="tm-panel tm-panel-path">
        <div className="tm-panel-head">
          <p className="tm-eyebrow">{program.title}</p>
          <span className="tm-count">{doneCount} von {items.length} Etappen · {pct} %</span>
        </div>
        <PathRail program={program} status={status} onOpen={onOpen} />
      </section>

      {complete ? (
        <section className="tm-next tm-next-done">
          <p className="tm-eyebrow">Geschafft</p>
          <h2 className="tm-h2">Alle Module und Sessions abgeschlossen</h2>
          <p className="tm-lead">Ihr Zertifikat steht bereit.</p>
          <button className="tm-btn tm-btn-primary" onClick={onCertificate}>Zertifikat ansehen</button>
        </section>
      ) : nextItem ? (
        <section className="tm-next">
          <p className="tm-eyebrow">Nächstes Etappenziel</p>
          <h2 className="tm-h2">
            {nextItem.kind === "module" ? "Modul " + nextItem.nr + " — " + nextItem.title : nextItem.title}
          </h2>
          <p className="tm-lead">
            {nextItem.kind === "module"
              ? progress.modules[nextItem.id] && progress.modules[nextItem.id].read
                ? "Unterlagen sind durchgearbeitet. Es fehlt die Lernabfrage: 8 von 8 Fragen richtig."
                : nextItem.lead
              : nextItem.focus + " · " + nextItem.minutes + " Minuten. Freigabe nach bestätigter Teilnahme."}
          </p>
          <button className="tm-btn tm-btn-primary" onClick={() => onOpen(nextItem)}>
            {nextItem.kind === "module"
              ? progress.modules[nextItem.id] && progress.modules[nextItem.id].read
                ? "Zur Lernabfrage"
                : "Modul öffnen"
              : "Session ansehen"}
          </button>
        </section>
      ) : null}

      <section className="tm-list">
        {items.map((item) => {
          const st = status[item.id];
          if (item.kind === "session") {
            return (
              <button
                key={item.id}
                className={"tm-card tm-card-session is-" + st}
                onClick={() => st !== "locked" && onOpen(item)}
                disabled={st === "locked"}
              >
                <span className="tm-card-badge tm-badge-session">{item.id}</span>
                <span className="tm-card-body">
                  <span className="tm-card-title">{item.title}</span>
                  <span className="tm-card-lead">{item.focus} · {item.minutes} Min. · Präsenz erforderlich</span>
                </span>
                <StatusTag st={st} kind="session" />
              </button>
            );
          }
          const m = progress.modules[item.id] || {};
          return (
            <button
              key={item.id}
              className={"tm-card is-" + st}
              onClick={() => st !== "locked" && onOpen(item)}
              disabled={st === "locked"}
            >
              <span className="tm-card-badge" style={{ background: st === "locked" ? "#C9D2DF" : item.color }}>
                {item.nr}
              </span>
              <span className="tm-card-body">
                <span className="tm-card-title">{item.title}</span>
                <span className="tm-card-lead">
                  {item.slides} Folien · 8 Fragen
                  {m.read && !m.passed ? " · Unterlagen durchgearbeitet" : ""}
                  {m.attempts ? " · " + m.attempts + " Versuch" + (m.attempts > 1 ? "e" : "") : ""}
                </span>
              </span>
              <StatusTag st={st} kind="module" />
            </button>
          );
        })}
      </section>
    </main>
  );
}

function StatusTag({ st, kind }) {
  const text =
    st === "done" ? "Abgeschlossen" : st === "active" ? (kind === "session" ? "Steht an" : "Dran") : "Gesperrt";
  return <span className={"tm-tag is-" + st}>{text}</span>;
}

/* ---------- Modulansicht ---------- */
function ModuleView({ module: m, state, busy, onRead, onQuiz, onBack }) {
  return (
    <main className="tm-main">
      <button className="tm-back" onClick={onBack}>← Lernpfad</button>
      <section className="tm-panel">
        <p className="tm-eyebrow" style={{ color: m.color }}>Modul {m.nr} · Selbststudium</p>
        <h1 className="tm-h1">{m.title}</h1>
        <p className="tm-lead">{m.lead}</p>

        <div className="tm-meta">
          <span>{m.slides} Folien</span>
          <span>8 Fragen · 8/8 zum Bestehen</span>
          <span>unbegrenzte Wiederholung</span>
        </div>

        <h3 className="tm-h3">Inhalte</h3>
        <ol className="tm-topics">
          {m.topics.map((t, i) => (
            <li key={i}>
              <span className="tm-topic-nr" style={{ color: m.color }}>{String(i + 1).padStart(2, "0")}</span>
              {t}
            </li>
          ))}
        </ol>

        <div className="tm-step">
          <p className="tm-step-label">Schritt 1 — Unterlagen</p>
          <SlideViewer module={m} alreadyRead={!!state.read} onAllSeen={() => onRead(m.id, true)} />
          {state.read ? (
            <div className="tm-done-box">
              Durchgearbeitet{state.readAt ? " am " + fmtDate(state.readAt) : ""}. Die Lernabfrage ist freigegeben.
            </div>
          ) : (
            <label className="tm-check">
              <input type="checkbox" checked={false} disabled={busy} onChange={(e) => onRead(m.id, e.target.checked)} />
              <span>
                Die Bestätigung setzt sich automatisch, sobald Sie alle Folien gesehen haben.
                Hier können Sie sie auch von Hand setzen.
              </span>
            </label>
          )}
        </div>

        <div className="tm-step">
          <p className="tm-step-label">Schritt 2 — Lernabfrage</p>
          {state.passed ? (
            <div className="tm-done-box">
              Bestanden am {fmtDate(state.passedAt)} · {state.attempts} Versuch{state.attempts > 1 ? "e" : ""}.
              Das nächste Etappenziel ist freigeschaltet.
            </div>
          ) : (
            <>
              <p className="tm-lead">
                Acht Fragen, eine richtige Antwort je Frage. Zum Bestehen brauchen Sie alle acht.
                Wiederholen können Sie so oft Sie möchten.
              </p>
              <button className="tm-btn tm-btn-primary" onClick={onQuiz} disabled={!state.read}>
                Lernabfrage starten
              </button>
              {!state.read && (
                <p className="tm-note">Bestätigen Sie zuerst, dass Sie die Unterlagen durchgearbeitet haben.</p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

/* ---------- Live-Session ---------- */
function SessionView({ session, state, onRefresh, onBack }) {
  return (
    <main className="tm-main">
      <button className="tm-back" onClick={onBack}>← Lernpfad</button>
      <section className="tm-panel tm-session">
        <p className="tm-eyebrow tm-eyebrow-yellow">Etappenziel · Live-Session</p>
        <h1 className="tm-h1">{session.title}</h1>
        <p className="tm-lead">{session.focus} · {session.minutes} Minuten via MS Teams.</p>
        {state.done ? (
          <div className="tm-done-box">
            Teilnahme bestätigt am {fmtDate(state.doneAt)}. Der Lernpfad ist freigeschaltet.
          </div>
        ) : (
          <>
            <p className="tm-lead">
              Diese Etappe schaltet nicht automatisch frei. Nehmen Sie an der Session teil —
              der Trainer bestätigt Ihre Teilnahme anschließend, danach geht es weiter.
            </p>
            <button className="tm-btn tm-btn-ghost" onClick={onRefresh}>Status aktualisieren</button>
          </>
        )}
      </section>
    </main>
  );
}

/* ---------- Zertifikat ---------- */

/* Unterschriften. Links der Trainer des Programms — der Name steht beim Programm
   in src/data/curriculum.js. Rechts die Gegenzeichnung durch das Unternehmen: ob das
   die Geschäftsführung oder HR ist, ist noch nicht entschieden. Zum Ändern genügt
   diese eine Zeile, unterschrieben wird auf dem Ausdruck von Hand. */
const CERT_COUNTERSIGN = { name: "", role: "Geschäftsführung TMM AG" };

const CERT_PLACE = "Böblingen";

/* Normative Bezüge. "In Anlehnung an" ist bewusst gewählt und darf nicht zu einer
   Konformitäts- oder Zertifizierungsaussage verschärft werden — dafür bräuchte es
   eine akkreditierte Stelle. Die Formulierung beschreibt die Gestaltung der Inhalte. */
const CERT_NORMS = "DIN EN ISO 19650 und der Richtlinienreihe VDI 2552";

/* Zertifikatsnummer aus Programm, Ausstellungsjahr und Konto-Kennung.
   Dieselbe Person und dasselbe Programm ergeben immer dieselbe Nummer, auch beim
   zweiten Ausdruck. Bewusst keine fortlaufende Nummer — dafür bräuchte es eine
   Registertabelle in der Datenbank (CLAUDE.md, offener Punkt 2). */
function certificateNumber(programId, userId, issuedAt) {
  let h = 0x811c9dc5;
  const seed = programId + ":" + userId;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const code = (h % 2176782336).toString(36).toUpperCase().padStart(6, "0"); // 36^6, immer 6 Stellen
  return "TMM-" + programId + "-" + new Date(issuedAt).getFullYear() + "-" + code;
}

function Certificate({ profile, program, progress, onBack }) {
  const lastSession = program.sessions.length
    ? progress.sessions[program.sessions[program.sessions.length - 1].id]
    : null;
  const issuedAt = (lastSession && lastSession.doneAt) || new Date().toISOString();
  const certNr = certificateNumber(program.id, profile.id, issuedAt);
  const signers = [{ name: program.trainer || "", role: "Trainer" }, CERT_COUNTERSIGN];

  return (
    <main className="tm-main">
      <button className="tm-back tm-no-print" onClick={onBack}>← Lernpfad</button>

      {/* Blatt 1 — das Zertifikat */}
      <section className="tm-cert">
        <header className="tm-cert-head">
          <p className="tm-cert-eyebrow">TMM COLLEGE</p>
          <p className="tm-cert-nr">
            <span>Zertifikat-Nr.</span>
            {certNr}
          </p>
        </header>

        <h1 className="tm-cert-title">Zertifikat</h1>
        <p className="tm-cert-sub">{program.title}</p>

        <p className="tm-cert-intro">Hiermit wird bestätigt, dass</p>
        <p className="tm-cert-name">{profile.display_name}</p>
        <p className="tm-cert-text">
          das Weiterbildungsprogramm {program.title} der TMM AG vollständig durchlaufen hat:
          {" " + program.modules.length} Module im Selbststudium, ebenso viele bestandene
          Lernabfragen und {program.sessions.length} Live-Sessions.
        </p>
        <p className="tm-cert-norms">
          Die Lerninhalte sind in Anlehnung an {CERT_NORMS} gestaltet.
          Die Lernschwerpunkte sind auf Blatt 2 aufgeführt.
        </p>

        <p className="tm-cert-date">{CERT_PLACE}, {fmtDate(issuedAt)}</p>

        <div className="tm-cert-signs">
          {signers.map((s) => (
            <div className="tm-cert-sign" key={s.role}>
              <span className="tm-cert-sign-line" />
              <span className="tm-cert-sign-name">{s.name || "\u00A0"}</span>
              <span className="tm-cert-sign-role">{s.role}</span>
            </div>
          ))}
        </div>

        <p className="tm-cert-foot">
          TMM AG · Interne Weiterbildung · Ausgestellt über die Lernplattform TMM College.
          Rückfragen zu dieser Zertifikat-Nr. an die Programmleitung.
        </p>
      </section>

      {/* Blatt 2 — Lernschwerpunkte, gedacht als Beilage bei Referenzen */}
      <section className="tm-cert tm-cert-annex">
        <header className="tm-cert-annex-head">
          <p className="tm-cert-eyebrow">Lernschwerpunkte</p>
          <p className="tm-cert-annex-ref">
            {profile.display_name}
            <span>{certNr}</span>
          </p>
        </header>

        <ol className="tm-cert-modules">
          {program.modules.map((m) => (
            <li key={m.id}>
              <span className="tm-cert-mod-nr">{m.nr}</span>
              <span className="tm-cert-mod-body">
                <span className="tm-cert-mod-title">{m.title}</span>
                <span className="tm-cert-mod-lead">{m.lead}</span>
              </span>
            </li>
          ))}
        </ol>

        {program.sessions.length > 0 && (
          <p className="tm-cert-annex-sessions">
            Dazu {program.sessions.length} betreute Live-Sessions:{" "}
            {program.sessions.map((s) => s.focus).join(" · ")}
          </p>
        )}

        <p className="tm-cert-foot">
          Die Lerninhalte sind in Anlehnung an {CERT_NORMS} gestaltet. Die Reihenfolge der Module ist
          verbindlich; jedes Modul wurde mit einer Lernabfrage abgeschlossen, die vollständig richtig
          beantwortet werden musste. Die Teilnahme an den Live-Sessions wurde vom Trainer bestätigt.
        </p>
      </section>

      <div className="tm-row tm-no-print" style={{ justifyContent: "center", marginTop: 16 }}>
        <button className="tm-btn tm-btn-ghost" onClick={() => window.print()}>Als PDF speichern</button>
      </div>
    </main>
  );
}
