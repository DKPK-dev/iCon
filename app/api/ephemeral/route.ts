// app/api/ephemeral/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { model = "gpt-realtime", voice = "verse" } = await req.json().catch(() => ({}));
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    // Create ephemeral session token for WebRTC
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, voice }),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("Ephemeral session error:", text);
      return NextResponse.json({ error: "Ephemeral session failed" }, { status: r.status });
    }

    const data = await r.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
