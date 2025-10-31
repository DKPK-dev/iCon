# iCon V2V Assistant

Minimal Next.js + OpenAI Realtime (WebRTC) voice agent.
UI is lightweight (no Tailwind), great for WebViews.

## Dev
- `npm i`
- `npm run dev`

## Deploy (Firebase App Hosting)
1. Connect repo to App Hosting (Live branch = `main`, App root = `/`).
2. App Hosting → **Secrets** → Add:
   - `OPENAI_API_KEY = sk-...`
3. Push to `main` to trigger build.

## Embed in FlutterFlow
Use a WebView pointing to your App Hosting URL.
Enable JavaScript + media; request RECORD_AUDIO on Android.
