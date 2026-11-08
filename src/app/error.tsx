"use client";

/**
 * Route-level error boundary — a thrown render error used to show
 * Next's default unstyled crash page inside the branded PWA. This keeps
 * the app's shell, offers a real retry, and never loses the user.
 */

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF7F0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            background: "#fff",
            border: "1px solid #E7E1D5",
            borderRadius: 16,
            padding: 32,
            textAlign: "center",
            boxShadow: "0 8px 30px rgba(36,28,21,0.08)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              margin: "0 auto 14px",
              borderRadius: 12,
              background: "#FBE9E7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
            aria-hidden
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: 18, margin: "0 0 6px", color: "#241C15" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: "#6B6257", margin: "0 0 20px", lineHeight: 1.5 }}>
            The page hit an unexpected error. Your data is safe — retrying usually
            fixes it. If it keeps happening, please report it to your department admin.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-block",
              background: "#2D4F35",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error?.digest ? (
            <p style={{ fontSize: 11, color: "#9B9385", marginTop: 16 }}>
              Error ID: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
