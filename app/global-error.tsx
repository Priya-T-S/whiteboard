"use client";

/** Catches failures in the root layout itself, where `app/error.tsx` cannot
 *  render because there is no layout left to render into. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0b0d12",
          color: "#e7e9ee",
          fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif",
          padding: "64px 24px",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Whiteboard failed to start</h1>
        <p style={{ marginTop: 12, color: "#8b93a7", fontSize: 14, maxWidth: 560 }}>
          Check the server log for the real error{error.digest ? ` (digest ${error.digest})` : ""}.
          If this is a deployment, the usual cause is missing TURSO_DATABASE_URL and
          TURSO_AUTH_TOKEN environment variables.
        </p>
      </body>
    </html>
  );
}
