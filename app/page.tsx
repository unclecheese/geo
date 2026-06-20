import { MODES } from "@/lib/modes";

// Placeholder menu — the real menu UI lands in Phase 3. This exists so the
// Next app boots and the pure layer is wired in. The five quiz modes plus the
// builder come straight from the ported MODES table.
export default function MenuPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 48, letterSpacing: "-0.03em", margin: 0 }}>
        Atlas<span style={{ color: "var(--accent-2)" }}>.</span>
      </h1>
      <p style={{ color: "var(--ink-dim)", fontSize: 18, maxWidth: "48ch" }}>
        Geography trainer — migrating to Next.js. The pure logic layer is
        ported and under test; screens land next.
      </p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {Object.values(MODES).map((m) => (
          <li
            key={m.id}
            style={{
              border: "1px solid var(--stroke)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              background: "var(--panel)",
            }}
          >
            <strong>{m.label}</strong>{" "}
            <span style={{ color: "var(--ink-faint)", fontFamily: "monospace", fontSize: 12 }}>
              {m.group}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
