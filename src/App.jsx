import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, signInWithEntra, signOut, api, loadProfile } from "./lib/supabase.js";
import { MODULES, SESSIONS, PATH, buildStatus, fmtDate } from "./data/curriculum.js";
import Quiz from "./components/Quiz.jsx";
import Trainer from "./components/Trainer.jsx";
import SlideViewer from "./components/SlideViewer.jsx";

const MODULE_BASE_URL = import.meta.env.VITE_MODULE_BASE_URL || "";
const emptyProgress = () => ({ modules: {}, sessions: {} });

export default function App() {
  const [booted, setBooted] = useState(false);
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState(emptyProgress());
  const [view, setView] = useState({ name: "dashboard" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const p = await api.myProgress();
      setProgress({ modules: p.modules || {}, sessions: p.sessions || {} });
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
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const status = useMemo(() => buildStatus(progress), [progress]);
  const doneCount = PATH.filter((i) => status[i.id] === "done").length;
  const nextItem = PATH.find((i) => status[i.id] === "active") || null;

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

  if (!booted) {
    return (
      <div className="tm-root">
        <div className="tm-boot">Lernstand wird geladen …</div>
      </div>
    );
  }

  return (
    <div className="tm-root">
      <header className="tm-header">
        <div className="tm-brand">
          <span className="tm-brand-mark">TMM</span>
          <span className="tm-brand-word">COLLEGE</span>
          <span className="tm-brand-sub">BIM-Zertifizierung</span>
        </div>
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
        <Trainer onClose={() => setView({ name: "dashboard" })} />
      ) : view.name === "module" ? (
        <ModuleView
          module={MODULES.find((m) => m.id === view.id)}
          state={progress.modules[view.id] || {}}
          busy={busy}
          onRead={setRead}
          onQuiz={() => setView({ name: "quiz", id: view.id })}
          onBack={() => setView({ name: "dashboard" })}
        />
      ) : view.name === "quiz" ? (
        <Quiz
          module={MODULES.find((m) => m.id === view.id)}
          onRefresh={refresh}
          onBack={() => setView({ name: "module", id: view.id })}
          onDashboard={() => setView({ name: "dashboard" })}
        />
      ) : view.name === "session" ? (
        <SessionView
          session={SESSIONS.find((s) => s.id === view.id)}
          state={progress.sessions[view.id] || {}}
          onRefresh={refresh}
          onBack={() => setView({ name: "dashboard" })}
        />
      ) : view.name === "certificate" ? (
        <Certificate profile={profile} progress={progress} onBack={() => setView({ name: "dashboard" })} />
      ) : (
        <Dashboard
          status={status}
          progress={progress}
          nextItem={nextItem}
          doneCount={doneCount}
          onOpen={(item) =>
            setView(item.kind === "module" ? { name: "module", id: item.id } : { name: "session", id: item.id })
          }
          onCertificate={() => setView({ name: "certificate" })}
        />
      )}

      <footer className="tm-footer">TMM AG · TMM College BIM-Zertifizierung</footer>
    </div>
  );
}

/* ---------- Anmeldung ---------- */
function Login() {
  return (
    <main className="tm-main tm-login">
      <div className="tm-login-card">
        <p className="tm-eyebrow">Anmeldung</p>
        <h1 className="tm-h1">Neun Module. Drei Live-Sessions. Ein Zertifikat.</h1>
        <p className="tm-lead">
          Sie arbeiten in Ihrem eigenen Tempo. Der Lernstand wird nach jedem Schritt gespeichert —
          Sie können jederzeit pausieren und auf jedem Gerät genau dort weitermachen.
        </p>
        <button className="tm-btn tm-btn-primary" onClick={signInWithEntra}>
          Mit TMM-Konto anmelden
        </button>
        <p className="tm-note">Die Anmeldung läuft über Ihr Microsoft-365-Konto. Ein separates Passwort gibt es nicht.</p>
      </div>
    </main>
  );
}

/* ---------- Lernpfad-Schiene ---------- */
function PathRail({ status, onOpen }) {
  return (
    <div className="tm-rail-wrap">
      <div className="tm-rail" role="list">
        {PATH.map((item, i) => {
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

/* ---------- Dashboard ---------- */
function Dashboard({ status, progress, nextItem, doneCount, onOpen, onCertificate }) {
  const pct = Math.round((doneCount / PATH.length) * 100);
  const complete = doneCount === PATH.length;
  return (
    <main className="tm-main">
      <section className="tm-panel tm-panel-path">
        <div className="tm-panel-head">
          <p className="tm-eyebrow">Ihr Lernpfad</p>
          <span className="tm-count">{doneCount} von {PATH.length} Etappen · {pct} %</span>
        </div>
        <PathRail status={status} onOpen={onOpen} />
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
        {PATH.map((item) => {
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
  const url = MODULE_BASE_URL || "";
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
          <SlideViewer
            module={m}
            alreadyRead={!!state.read}
            onAllSeen={() => onRead(m.id, true)}
          />
          {state.read ? (
            <div className="tm-done-box">
              Durchgearbeitet{state.readAt ? " am " + fmtDate(state.readAt) : ""}. Die Lernabfrage ist freigegeben.
            </div>
          ) : (
            <label className="tm-check">
              <input
                type="checkbox"
                checked={false}
                disabled={busy}
                onChange={(e) => onRead(m.id, e.target.checked)}
              />
              <span>
                Die Bestätigung setzt sich automatisch, sobald Sie alle Folien gesehen haben.
                Hier können Sie sie auch von Hand setzen.
              </span>
            </label>
          )}
          {url && (
            <p className="tm-note">
              <a href={url} target="_blank" rel="noreferrer">Originaldatei in SharePoint öffnen</a>
            </p>
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
function Certificate({ profile, progress, onBack }) {
  const last = progress.sessions.ZERT && progress.sessions.ZERT.doneAt;
  return (
    <main className="tm-main">
      <button className="tm-back tm-no-print" onClick={onBack}>← Lernpfad</button>
      <section className="tm-cert">
        <p className="tm-cert-eyebrow">TMM COLLEGE</p>
        <h1 className="tm-cert-title">Zertifikat</h1>
        <p className="tm-cert-sub">BIM-Zertifizierung</p>
        <p className="tm-cert-name">{profile.display_name}</p>
        <p className="tm-cert-text">
          hat das Weiterbildungsprogramm TMM College BIM-Zertifizierung vollständig durchlaufen:
          neun Module im Selbststudium, neun bestandene Lernabfragen und drei Live-Sessions.
        </p>
        <p className="tm-cert-date">Böblingen, {fmtDate(last || new Date().toISOString())}</p>
      </section>
      <div className="tm-row tm-no-print" style={{ justifyContent: "center", marginTop: 16 }}>
        <button className="tm-btn tm-btn-ghost" onClick={() => window.print()}>Als PDF speichern</button>
      </div>
    </main>
  );
}
