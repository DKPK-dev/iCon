// app/api/ephemeral/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shared function for creating ephemeral tokens
async function createEphemeralSession(model = "gpt-realtime", voice = "verse") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Ephemeral session error:", text);
      return NextResponse.json({ error: "Ephemeral session failed" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Ephemeral token error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Handle GET requests (default path)
export async function GET() {
  return createEphemeralSession();
}

// Handle POST requests (same logic)
export async function POST(req: NextRequest) {
  const { model = "gpt-realtime", voice = "verse" } = await req.json().catch(() => ({}));
  return createEphemeralSession(model, voice);
}
