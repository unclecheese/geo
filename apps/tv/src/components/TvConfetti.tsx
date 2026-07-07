import { useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Canvas, Rect, Group } from "@shopify/react-native-skia";
import { onConfetti } from "../fx-tv";
import { BOX_COLORS } from "@geobean/core";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
}

const GRAVITY = 900; // px/s²
const LIFETIME = 1600; // ms
const COUNT = 90;

/**
 * One-shot celebratory burst — the tvOS answer to web's Confetti canvas, drawn
 * with Skia (already a tvOS-proven dependency; see TvFrame). Mounted once in App,
 * it listens on the fx-tv confetti bus that the FxPort's confetti() rings and
 * runs a JS-driven physics loop for ~1.6s, then clears. Non-interactive and
 * pointerEvents-transparent so it never steals focus from the quiz beneath it.
 *
 * A plain requestAnimationFrame loop over ~90 rects is cheap and keeps the whole
 * thing in JS (no Skia value/clock wiring), which matters on the constrained
 * tvOS device — the burst is short and infrequent (correct answers / milestones).
 */
export function TvConfetti() {
  const { width, height } = useWindowDimensions();
  const [particles, setParticles] = useState<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    const stop = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };

    const spawn = () => {
      const originX = width / 2;
      const originY = height * 0.4;
      const seed: Particle[] = Array.from({ length: COUNT }, () => {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // upward fan
        const speed = 400 + Math.random() * 500;
        return {
          x: originX + (Math.random() - 0.5) * 120,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 12,
          size: 10 + Math.random() * 10,
          color: BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)],
        };
      });
      startRef.current = Date.now();
      let last = startRef.current;

      const tick = () => {
        const now = Date.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const elapsed = now - startRef.current;
        if (elapsed >= LIFETIME) {
          setParticles([]);
          rafRef.current = null;
          return;
        }
        seed.forEach((p) => {
          p.vy += GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        });
        setParticles([...seed]);
        rafRef.current = requestAnimationFrame(tick);
      };
      stop();
      rafRef.current = requestAnimationFrame(tick);
    };

    const unsub = onConfetti(spawn);
    return () => {
      unsub();
      stop();
    };
  }, [width, height]);

  if (particles.length === 0) return null;

  const elapsed = Date.now() - startRef.current;
  const fade = Math.max(0, 1 - elapsed / LIFETIME);

  return (
    <Canvas
      style={{ position: "absolute", left: 0, top: 0, width, height, zIndex: 200 }}
      pointerEvents="none"
    >
      {particles.map((p, i) => (
        <Group key={i} origin={{ x: p.x + p.size / 2, y: p.y + p.size / 2 }} transform={[{ rotate: p.rot }]}>
          <Rect x={p.x} y={p.y} width={p.size} height={p.size * 0.6} color={p.color} opacity={fade} />
        </Group>
      ))}
    </Canvas>
  );
}
