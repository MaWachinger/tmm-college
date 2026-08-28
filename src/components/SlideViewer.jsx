import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";

const BUCKET = "module-slides";
const SIGNED_URL_TTL = 60 * 60 * 4; // 4 Stunden

export default function SlideViewer({ module: m, onAllSeen, alreadyRead }) {
  const [urls, setUrls] = useState(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [maxSeen, setMaxSeen] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [nativeFs, setNativeFs] = useState(false);
  const reported = useRef(false);
  const stageRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setError("");
      setUrls(null);
      try {
        const { data: files, error: listError } = await supabase.storage.from(BUCKET).list(m.id, {
          limit: 200,
          sortBy: { column: "name", order: "asc" },
        });
        if (listError) throw new Error(listError.message);
        const images = (files || []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
        if (images.length === 0) throw new Error("Für dieses Modul sind noch keine Folien hinterlegt.");

        const paths = images.map((f) => m.id + "/" + f.name);
        const { data: signed, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL);
        if (signError) throw new Error(signError.message);
        if (!active) return;
        setUrls(signed.map((s) => s.signedUrl));
      } catch (e) {
        if (active) setError(e.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [m.id]);

  const total = urls ? urls.length : 0;

  const go = useCallback(
    (next) => {
      if (!total) return;
      const clamped = Math.max(0, Math.min(total - 1, next));
      setIndex(clamped);
      setMaxSeen((prev) => Math.max(prev, clamped + 1));
    },
    [total]
  );

  useEffect(() => {
    if (total > 0) setMaxSeen((prev) => Math.max(prev, 1));
  }, [total]);

  // Alle Folien gesehen -> Bestätigung automatisch setzen
  useEffect(() => {
    if (total > 0 && maxSeen >= total && !reported.current && !alreadyRead) {
      reported.current = true;
      onAllSeen();
    }
  }, [maxSeen, total, onAllSeen, alreadyRead]);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (e) { /* egal */ }
      return;
    }
    if (el && el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch (e) {
        // Browser verweigert Vollbild -> Overlay als Rueckfall
      }
    }
    setFullscreen((v) => !v);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const active = !!document.fullscreenElement;
      setNativeFs(active);
      setFullscreen(active);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(total - 1);
      } else if (e.key === "Escape" && fullscreen && !document.fullscreenElement) {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total, go, fullscreen]);

  if (error) {
    return <div className="tm-empty">{error}</div>;
  }
  if (!urls) {
    return <div className="tm-slide-loading">Folien werden geladen …</div>;
  }

  const pct = Math.round((maxSeen / total) * 100);

  return (
    <div className={"tm-viewer" + (fullscreen ? " is-fullscreen" : "") + (nativeFs ? " is-native" : "")} ref={stageRef}>
      <div className="tm-slide-stage">
        <button
          className="tm-slide-nav tm-slide-prev"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Vorherige Folie"
        >
          ‹
        </button>
        <img
          className="tm-slide-img"
          src={urls[index]}
          alt={"Modul " + m.nr + ", Folie " + (index + 1)}
          onClick={() => go(index + 1)}
        />
        <button
          className="tm-slide-nav tm-slide-next"
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
          aria-label="Nächste Folie"
        >
          ›
        </button>
      </div>

      <div className="tm-slide-bar">
        <span className="tm-slide-count">Folie {index + 1} von {total}</span>
        <div className="tm-slide-progress" title={maxSeen + " von " + total + " Folien gesehen"}>
          <span style={{ width: pct + "%", background: m.color }} />
        </div>
        <span className="tm-slide-seen">{pct} % gesehen</span>
        <button className="tm-slide-fs" onClick={toggleFullscreen}>
          {fullscreen ? "Vollbild beenden" : "Vollbild"}
        </button>
      </div>

      <div className="tm-thumbs">
        {urls.map((u, i) => (
          <button
            key={i}
            className={"tm-thumb " + (i === index ? "is-current " : "") + (i < maxSeen ? "is-seen" : "")}
            onClick={() => go(i)}
            aria-label={"Zu Folie " + (i + 1)}
          >
            <img src={u} alt="" loading="lazy" />
            <span>{i + 1}</span>
          </button>
        ))}
      </div>

      <p className="tm-note">
        Blättern mit den Pfeiltasten, per Klick auf die Folie oder über die Miniaturansicht.
      </p>
    </div>
  );
}
