"use client";
import { useState, useRef } from "react";

// simple sine wave visualizer
function drawWaves(analyser: AnalyserNode, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const buffer = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    analyser.getByteTimeDomainData(buffer);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    const mid = canvas.height / 2;
    for (let i = 0; i < buffer.length; i++) {
      const x = (i / buffer.length) * canvas.width;
      const y = mid + (buffer[i] - 128) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(0,255,255,0.6)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#00ffff";
    ctx.stroke();
    requestAnimationFrame(loop);
  };
  loop();
}

export default function Home() {
  const [status, setStatus] = useState("Tap the mic to start");
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  async function getToken() {
    const r = await fetch("/api/ephemeral", { method: "POST" });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Token failed: ${r.status} ${t}`);
    }
    const { value } = await r.json(); // ek_...
    if (!value) throw new Error("No ek token in response");
    return value;
  }

  async function start() {
    if (connecting) return;
    setConnecting(true);
    setStatus("Connecting…");
    try {
      // mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // audio context for waves
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      src.connect(analyser);
      drawWaves(analyser, canvasRef.current!);
      audioCtxRef.current = ctx;

      // mint ephemeral token
      const ek = await getToken();

      // WebRTC to OpenAI Realtime
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // send mic
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // receive assistant audio
      const audio = document.createElement("audio");
      audio.autoplay = true;
      pc.ontrack = (evt) => {
        audio.srcObject = evt.streams[0];
      };

      // optional data channel (events, logs)
      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (e) => console.log("assistant:", e.data);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(
        "https://api.openai.com/v1/realtime?protocol=webrtc",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ek}`, // ephemeral client secret
            "Content-Type": "application/sdp",
          },
          body: offer.sdp!,
        }
      );

      if (!sdpRes.ok) {
        const t = await sdpRes.text();
        throw new Error(`Realtime SDP failed: ${sdpRes.status} ${t}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("Connected — listening");
      setListening(true);
    } catch (err) {
      console.error(err);
      setStatus("Connection error");
    } finally {
      setConnecting(false);
    }
  }

  function stop() {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      audioCtxRef.current?.close();
      audioCtxRef.current = null;

      pcRef.current?.close();
      pcRef.current = null;
    } finally {
      setListening(false);
      setStatus("Stopped");
    }
  }

  return (
    <div
      style={{
        background: "radial-gradient(circle at center,#00112b,#00081a)",
        color: "#e0faff",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        fontFamily: "Inter, system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontWeight: 500 }}>{status}</h2>

      <canvas
        ref={canvasRef}
        width={300}
        height={100}
        style={{
          width: 300,
          height: 100,
          background: "transparent",
        }}
      />

      <div style={{ display: "flex", gap: "2rem" }}>
        {/* Mic On */}
        <button
          onClick={start}
          disabled={connecting || listening}
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: "none",
            background: listening
              ? "linear-gradient(145deg,#00bfff,#0099ff)"
              : "linear-gradient(145deg,#00ffff,#0088ff)",
            boxShadow: "0 0 20px rgba(0,255,255,0.5)",
            cursor: "pointer",
            color: "#00112b",
            fontSize: 24,
          }}
          title="Start"
        >
          🎙️
        </button>

        {/* Stop */}
        <button
          onClick={stop}
          disabled={!listening}
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: "none",
            background: "linear-gradient(145deg,#ff3b3b,#b30000)",
            boxShadow: "0 0 15px rgba(255,0,0,0.5)",
            cursor: "pointer",
            color: "#fff",
            fontSize: 24,
          }}
          title="Stop"
        >
          ⏹️
        </button>
      </div>
    </div>
  );
}
