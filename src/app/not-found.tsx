import Link from "next/link";

/** Branded 404 — the App Router default is an unstyled crash page. */
export default function NotFound() {
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
          <p style={{ fontSize: 40, margin: "0 0 4px", fontWeight: 800, color: "#241C15" }}>
            404
          </p>
          <h1 style={{ fontSize: 18, margin: "0 0 6px", color: "#241C15" }}>
            Page not found
          </h1>
          <p style={{ fontSize: 13, color: "#6B6257", margin: "0 0 20px", lineHeight: 1.5 }}>
            The page you are looking for doesn&apos;t exist or has moved. Head back
            to the portal to find routines, notices and attendance.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "#2D4F35",
              color: "#fff",
              borderRadius: 10,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Back to UniversityHub
          </Link>
        </div>
      </body>
    </html>
  );
}
