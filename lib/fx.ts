// Browser-only sound + confetti, ported verbatim from the single-file Audio2 /
// Confetti modules. No DOM/React — call these from client code only. Sound is
// gated on the persisted `sound` setting, read lazily to avoid an import cycle.
import { useAtlasStore } from "@/store/atlas-store";

const soundOn = (): boolean => {
  try {
    return useAtlasStore.getState().settings.sound;
  } catch {
    return false;
  }
};

interface AudioCtxWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export const Audio2 = {
  ctx: null as AudioContext | null,
  ensure() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as AudioCtxWindow).webkitAudioContext;
        this.ctx = Ctor ? new Ctor() : null;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  blip(freqs: number[], dur = 0.12, type: OscillatorType = "sine") {
    if (!soundOn()) return;
    this.ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.06 + dur);
      osc.connect(g).connect(this.ctx!.destination);
      osc.start(t0 + i * 0.06);
      osc.stop(t0 + i * 0.06 + dur + 0.02);
    });
  },
  correct() {
    this.blip([523, 784], 0.16, "triangle");
  },
  wrong() {
    this.blip([220, 160], 0.2, "sawtooth");
  },
  milestone() {
    this.blip([523, 659, 784, 1046], 0.18, "triangle");
  },
};

interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  size: number;
  col: string;
  rot: number;
  vr: number;
}

export const Confetti = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  parts: [] as Part[],
  raf: null as number | null,

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this._resize();
    window.addEventListener("resize", () => this._resize());
  },
  _resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
  },
  burst(x?: number, y?: number, count = 90) {
    if (!this.canvas || !this.ctx) return;
    const cols = ["#6ee7ff", "#a78bfa", "#fb7185", "#34d399", "#fbbf24"];
    const px = (x == null ? this.canvas.clientWidth / 2 : x) * devicePixelRatio;
    const py = (y == null ? this.canvas.clientHeight / 2 : y) * devicePixelRatio;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 8) * devicePixelRatio;
      this.parts.push({
        x: px,
        y: py,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 4 * devicePixelRatio,
        g: 0.22 * devicePixelRatio,
        life: 1,
        size: (4 + Math.random() * 5) * devicePixelRatio,
        col: cols[i % cols.length],
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
      });
    }
    if (!this.raf) this._loop();
  },
  _loop() {
    const c = this.ctx;
    if (!c || !this.canvas) return;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.012;
      p.rot += p.vr;
      c.save();
      c.globalAlpha = Math.max(0, p.life);
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.col;
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      c.restore();
    }
    if (this.parts.length) this.raf = requestAnimationFrame(() => this._loop());
    else {
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.raf = null;
    }
  },
};
