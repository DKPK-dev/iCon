// app/api/ephemeral/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache

export async function POST(req: NextRequest) {
  try {
    const { model = "gpt-realtime", voice = "marin" } =
      (await req.json().catch(() => ({}))) || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    // GA Realtime endpoint: client secrets
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          audio: { output: { voice } }, // pick your default voice
        },
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("Ephemeral session error:", r.status, text);
      return NextResponse.json({ error: "Ephemeral session failed" }, { status: r.status });
    }

    // GA returns { client_secret: { value, expires_at, ... } }
    const json = JSON.parse(text);
    const clientSecret = json?.client_secret ?? json;

    if (!clientSecret?.value) {
      console.error("Unexpected client_secret payload:", json);
      return NextResponse.json({ error: "Bad client secret response" }, { status: 502 });
    }

    return NextResponse.json({
      value: clientSecret.value,
      expires_at: clientSecret.expires_at,
    });
  } catch (err) {
    console.error("Ephemeral token error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Optional: GET for quick manual checks
export async function GET() {
  return NextResponse.json({ ok: true });
}
