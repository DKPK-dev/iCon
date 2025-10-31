"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

type RTSession = RealtimeSession<any> & {
  // best-effort “internal” handles (SDKs may differ; we guard with `any`)
  transport?: any;
};

export default function Home() {
  const sessionRef = useRef<RTSession | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<"idle" | "thinking" | "speaking">("idle");
  const [error, setError] = useState<string | null>(null);

  // --- helpers -------------------------------------------------------------

  function label() {
    if (!connected) return "Start conversation";
    if (status === "thinking") return "iCon Assistant thinking…";
    if (status === "speaking") return "iCon Assistant speaking…";
    return "Start conversation";
    }

  function findLocalAudioTrack(s: any): MediaStreamTrack | null {
    // Try to discover the outgoing audio track from the peer connection
    const pc: RTCPeerConnection | undefined =
      s?.transport?.pc || s?.transport?.peerConnection || undefined;

    if (pc && typeof pc.getSenders === "function") {
      const sender = pc.getSenders().find((x: RTCRtpSender) => x.track && x.track.kind === "audio");
      return sender?.track ?? null;
    }
    // Some SDKs expose the captured stream directly:
    const ms: MediaStream | undefined = s?.transport?.localStream;
    if (ms) {
      const track = ms.getAudioTracks()[0];
      if (track) return track;
    }
    return null;
  }

  function findRemoteAudioElement(s: any): HTMLAudioElement | null {
    // Many realtime/browser transports surface an <audio> they manage
    return s?.transport?.audioElement ?? null;
  }

  // --- lifecycle -----------------------------------------------------------

  async function start() {
    setError(null);
    setBusy(true);
    setStatus("thinking");
    try {
      // 1) get ephemeral token
      const res = await fetch("/api/ephemeral", { method: "POST" });
      if (!res.ok) throw new Error("Failed to get ephemeral token");
      const token = await res.json();

      // 2) make agent
      const agent = new RealtimeAgent({
        name: "iCon Assistant",
        instructions:
          "You are a concise hotel concierge. Detect the user's language and reply in that language (Greek or English).",
      });

      // 3) connect
      const session = new RealtimeSession(agent) as RTSession;
      await session.connect({
        apiKey:
          token?.client_secret?.value ||
          token?.client_secret ||
          token?.apiKey,
      });

      // Try to capture handles we can control
      localTrackRef.current = findLocalAudioTrack(session);
      remoteAudioRef.current = findRemoteAudioElement(session);

      // Listen to remote audio element to flip “speaking/thinking” states
      if (remoteAudioRef.current) {
        const el = remoteAudioRef.current;
        const onPlay = () => setStatus("speaking");
        const onWaiting = () => setStatus("thinking");
        const onEnded = () => setStatus("thinking");

        el.addEventListener("play", onPlay);
        el.addEventListener("playing", onPlay);
        el.addEventListener("waiting", onWaiting);
        el.addEventListener("ended", onEnded);

        // store cleanup on the session itself
        (session as any).__waveListeners = { onPlay, onWaiting, onEnded };
      }

      sessionRef.current = session;
      setConnected(true);
      setMuted(false);
      setStatus("thinking"); // until we actually hear audio
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to start session");
      setStatus("idle");
    } finally {
      setBusy(false);
    }
  }

  function stopAudioOnly() {
    // Best effort: pause/flush the remote audio without killing the session
    const el = remoteAudioRef.current;
    if (el) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {}
    }
    // Also hint UI back to thinking (agent may continue, but audio is halted)
    setStatus("thinking");
  }

  function toggleMute() {
    // Preferred: toggle the local outgoing track
    const t = localTrackRef.current;
    if (t) {
      t.enabled = !t.enabled;
      setMuted(!t.enabled ? true : false);
      return;
    }
    // Fallback: if we can't find a track, we’ll just reflect state visually
    setMuted((m) => !m);
  }

  function end() {
    try {
      const s = sessionRef.current as any;
      if (s?.__waveListeners && remoteAudioRef.current) {
        const el = remoteAudioRef.current;
        const { onPlay, onWaiting, onEnded } = s.__waveListeners;
        el.removeEventListener("play", onPlay);
        el.removeEventListener("playing", onPlay);
        el.removeEventListener("waiting", onWaiting);
        el.removeEventListener("ended", onEnded);
      }
      sessionRef.current?.close();
    } catch (err) {
      console.warn("close error:", err);
    } finally {
      sessionRef.current = null;
      localTrackRef.current = null;
      remoteAudioRef.current = null;
      setConnected(false);
      setMuted(false);
      setStatus("idle");
    }
  }

  // Clean up if user navigates away
  useEffect(() => {
    return () => end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- UI ------------------------------------------------------------------

  const micActive = connected && !muted;
  const wavesActiveMic = micActive && status !== "speaking";
  const wavesActiveSpeaking = connected && status === "speaking";

  return (
    <main className="wrap">
      <div className="panel">
        <div className="head">
          <div className="brand">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2l2.2 5.6L20 9l-5.1 3.9L16.4 19 12 15.9 7.6 19l1.5-6.1L4 9l5.8-1.4L12 2z" fill="currentColor" />
            </svg>
          </div>
          <div className="title">iCon Assistant</div>
        </div>

        {/* Status line */}
        <p className="statusLine">
          {label()}
        </p>

        {/* Sound waves */}
        <div className="waves">
          <Wave className={wavesActiveMic ? "on" : ""} />
          <Wave className={wavesActiveSpeaking ? "on speaking" : ""} delay={0.1} />
          <Wave className={wavesActiveSpeaking ? "on speaking" : ""} delay={0.2} />
          <Wave className={wavesActiveSpeaking ? "on speaking" : ""} delay={0.3} />
          <Wave className={wavesActiveMic ? "on" : ""} delay={0.4} />
        </div>

        {/* Controls */}
        <div className="controls">
          {!connected ? (
            <button className={`btn mic ${busy ? "loading" : ""}`} onClick={start} disabled={busy}>
              <MicIcon />
              {busy ? "Connecting…" : "Mic On"}
            </button>
          ) : (
            <>
              <button className={`iconBtn ${micActive ? "active" : "muted"}`} onClick={toggleMute} aria-label={micActive ? "Mute mic" : "Unmute mic"}>
                {micActive ? <MicIcon /> : <MicMuteIcon />}
              </button>

              <button className="iconBtn stop" onClick={stopAudioOnly} aria-label="Stop AI audio">
                <StopIcon />
              </button>

              <button className="iconBtn hang" onClick={end} aria-label="End session">
                <HangIcon />
              </button>
            </>
          )}
        </div>

        {error && <div className="err">Error: {error}</div>}
      </div>

      <style jsx>{`
        :root{
          --navy:#0a1020;
          --navy2:#0e1428;
          --ring:rgba(255,255,255,.12);
          --soft:rgba(255,255,255,.08);
          --text:rgba(255,255,255,.92);
          --muted:rgba(255,255,255,.65);
          --brand:#6b7cff;
          --accent:#7cd3ff;
          --danger:#ef4444;
          --ok:#22c55e;
        }
        *{box-sizing:border-box}
        html,body,.wrap{height:100%}
        body{margin:0;background:linear-gradient(180deg,var(--navy),var(--navy2));color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif}

        .wrap{display:grid;place-items:center;padding:16px}

        .panel{
          width:380px;max-width:94vw;border-radius:18px;
          background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));
          border:1px solid var(--ring);backdrop-filter:blur(10px);
          box-shadow:0 10px 30px rgba(0,0,0,.35);
          padding:16px 14px 14px;
        }

        .head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
        .brand{
          width:28px;height:28px;border-radius:10px;display:grid;place-items:center;
          background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;
          box-shadow:0 6px 18px rgba(123,140,255,.35);
        }
        .title{font-weight:700;letter-spacing:.2px}

        .statusLine{
          margin:6px 2px 12px;color:var(--muted);font-size:13px;min-height:18px;
        }

        /* Waves */
        .waves{height:66px;display:flex;align-items:end;justify-content:space-between;gap:8px;margin:10px 0 14px}
        .bar{
          width:6px;border-radius:4px;background:rgba(255,255,255,.14);
          height:16px;transform-origin:50% 100%;
        }
        .bar.on{background:linear-gradient(180deg,var(--accent),var(--brand))}
        .bar.on{animation:wave 1.1s ease-in-out infinite}
        .bar.on.speaking{animation:talk 0.7s ease-in-out infinite}
        @keyframes wave{
          0%,100%{height:16px}
          50%{height:44px}
        }
        @keyframes talk{
          0%,100%{height:24px}
          50%{height:64px}
        }

        .controls{display:flex;align-items:center;justify-content:center;gap:10px}

        .btn.mic{
          display:inline-flex;align-items:center;gap:10px;
          height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--soft);
          background:linear-gradient(135deg,var(--brand),var(--accent));color:#fff;font-weight:700;
          box-shadow:0 8px 22px rgba(107,124,255,.35);
        }
        .btn.mic.loading{opacity:.9;cursor:wait}

        .iconBtn{
          width:44px;height:44px;border-radius:12px;border:1px solid var(--soft);
          background:rgba(255,255,255,.08);display:grid;place-items:center;color:#fff;
        }
        .iconBtn.active{outline:2px solid rgba(34,197,94,.35)}
        .iconBtn.muted{opacity:.75}
        .iconBtn.stop{background:linear-gradient(135deg,#ff9b9b,var(--danger))}
        .iconBtn.hang{background:linear-gradient(135deg,#1e293b,#0f172a)}

        .err{
          margin-top:10px;font-size:12px;color:#ffd2d2;
          background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.35);
          padding:8px 10px;border-radius:10px;
        }
      `}</style>
    </main>
  );
}

/* === Decorative/semantic icons (tiny inline SVGs) === */
function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3Zm-7-3a1 1 0 112 0 5 5 0 0010 0 1 1 0 112 0 7 7 0 01-6 6.93V21h3a1 1 0 110 2H10a1 1 0 110-2h3v-3.07A7 7 0 015 11Z"/>
    </svg>
  );
}
function MicMuteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M15 11V6a3 3 0 10-6 0v2.586L15 11Zm2 0a1 1 0 112 0 7 7 0 01-7 6.93V21h3a1 1 0 110 2H10a1 1 0 110-2h3v-3.07a6.96 6.96 0 01-3.437-1.182l7.845 7.845a1 1 0 01-1.416 1.414l-14-14A1 1 0 112.414 7.1l2.586 2.586V11a5 5 0 0010 0Z"/>
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}
function HangIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M4 15c4.418-4 11.582-4 16 0l-2 2c-3.313-2.667-8.687-2.667-12 0l-2-2Z"/>
    </svg>
  );
}

/* === Wave bar component (scales height via CSS keyframes) === */
function Wave({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  return (
    <span
      className={`bar ${className}`}
      style={{ animationDelay: className.includes("on") ? `${delay}s` : undefined }}
    />
  );
}
