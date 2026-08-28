import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/supabase.js";

export default function Quiz({ module: m, onRefresh, onBack, onDashboard }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [cursor, setCursor] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setResult(null);
    setAnswers({});
    setCursor(0);
    setQuestions(null);
    try {
      // Die Optionen kommen bei jedem Aufruf neu gemischt aus der Datenbank.
      setQuestions(await api.getQuiz(m.id));
    } catch (e) {
      setError(e.message);
    }
  }, [m.id]);

  useEffect(() => {
    load();
  }, [load]);

  const evaluate = async () => {
    setSending(true);
    setError("");
    try {
      const payload = questions.map((q, i) => ({
        question_id: q.id,
        option_id: answers[i] != null ? answers[i] : null,
      }));
      const res = await api.submitQuiz(m.id, payload);
      setResult(res);
      await onRefresh();
    } catch (e) {
      setError(e.message);
    }
    setSending(false);
  };

  if (error) {
    return (
      <main className="tm-main">
        <button className="tm-back" onClick={onBack}>← Zurück zum Modul</button>
        <section className="tm-panel">
          <h1 className="tm-h1">Die Lernabfrage lässt sich nicht öffnen</h1>
          <p className="tm-lead">{error}</p>
          <button className="tm-btn tm-btn-ghost" onClick={load}>Erneut laden</button>
        </section>
      </main>
    );
  }

  if (!questions) {
    return (
      <main className="tm-main">
        <div className="tm-boot">Fragen werden geladen …</div>
      </main>
    );
  }

  if (result) {
    return (
      <main className="tm-main">
        <section className={"tm-panel tm-result " + (result.passed ? "is-pass" : "is-fail")}>
          <p className="tm-eyebrow" style={{ color: m.color }}>Modul {m.nr} · Lernabfrage</p>
          <h1 className="tm-h1">
            {result.passed ? "Bestanden" : result.score + " von " + result.total + " richtig"}
          </h1>
          {result.passed ? (
            <>
              <p className="tm-lead">Alle Fragen richtig. Das nächste Etappenziel ist freigeschaltet.</p>
              <button className="tm-btn tm-btn-primary" onClick={onDashboard}>Zum Lernpfad</button>
            </>
          ) : (
            <>
              <p className="tm-lead">
                Zum Bestehen brauchen Sie alle acht. Diese Fragen waren noch nicht richtig —
                die Lösungen finden Sie in den Modulunterlagen:
              </p>
              <ul className="tm-wrong">
                {(result.wrong_positions || []).map((pos) => {
                  const q = questions.find((x) => x.position === pos);
                  return (
                    <li key={pos}>
                      <span className="tm-wrong-nr">Frage {pos}</span>
                      {q ? q.prompt : ""}
                    </li>
                  );
                })}
              </ul>
              <div className="tm-row">
                <button className="tm-btn tm-btn-primary" onClick={load}>Erneut versuchen</button>
                <button className="tm-btn tm-btn-ghost" onClick={onBack}>Zurück zum Modul</button>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  const q = questions[cursor];
  const selected = answers[cursor];
  const answeredAll = questions.every((_, i) => answers[i] != null);

  return (
    <main className="tm-main">
      <button className="tm-back" onClick={onBack}>← Abbrechen</button>
      <section className="tm-panel">
        <div className="tm-quiz-head">
          <p className="tm-eyebrow" style={{ color: m.color }}>Modul {m.nr} · Lernabfrage</p>
          <span className="tm-count">Frage {cursor + 1} von {questions.length}</span>
        </div>
        <div className="tm-dots">
          {questions.map((_, i) => (
            <button
              key={i}
              className={"tm-dot " + (i === cursor ? "is-current " : "") + (answers[i] != null ? "is-set" : "")}
              onClick={() => setCursor(i)}
              aria-label={"Frage " + (i + 1)}
            />
          ))}
        </div>

        <h2 className="tm-h2 tm-question">{q.prompt}</h2>
        <div className="tm-options">
          {q.options.map((o, i) => (
            <button
              key={o.id}
              className={"tm-option " + (selected === o.id ? "is-selected" : "")}
              onClick={() => setAnswers({ ...answers, [cursor]: o.id })}
            >
              <span className="tm-option-key">{String.fromCharCode(65 + i)}</span>
              <span>{o.body}</span>
            </button>
          ))}
        </div>

        <div className="tm-row tm-quiz-nav">
          <button
            className="tm-btn tm-btn-ghost"
            onClick={() => setCursor(Math.max(0, cursor - 1))}
            disabled={cursor === 0}
          >
            Zurück
          </button>
          {cursor < questions.length - 1 ? (
            <button
              className="tm-btn tm-btn-primary"
              onClick={() => setCursor(cursor + 1)}
              disabled={selected == null}
            >
              Weiter
            </button>
          ) : (
            <button className="tm-btn tm-btn-primary" onClick={evaluate} disabled={!answeredAll || sending}>
              {sending ? "Wird ausgewertet …" : "Auswerten"}
            </button>
          )}
        </div>
        {!answeredAll && cursor === questions.length - 1 && (
          <p className="tm-note">
            Es sind noch nicht alle Fragen beantwortet. Über die Punkte oben springen Sie direkt hin.
          </p>
        )}
      </section>
    </main>
  );
}
