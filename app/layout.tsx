// app/layout.tsx
export const metadata = {
  title: "iCon V2V Assistant",
  description: "A lightweight WebRTC voice assistant powered by OpenAI Realtime.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
