"use client";

import Link from "next/link";

export default function MapPlaceholderPage() {
  return (
    <section className="screen-quiz">
      <div className="menu-card" style={{ textAlign: "center" }}>
        <h2 style={{ marginTop: 0 }}>Map quizzes</h2>
        <p style={{ color: "var(--ink-dim)" }}>Coming in a later migration phase.</p>
        <Link className="btn" href="/" style={{ display: "inline-block", textDecoration: "none" }}>
          ← Back to menu
        </Link>
      </div>
    </section>
  );
}
