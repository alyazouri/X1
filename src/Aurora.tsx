// ════════════════════════════════════════════════════════════════
// ALYAZOURI 2026 — INTERACTIVE LUMINOUS RIBBONS (Astra-style background)
//
// Reproduces the look described in OpenAI's GPT-6 Astra showcase: 9 luminous
// strands whose motion is independent, calm when idle, and follows the pointer
// when the user moves — drawn on inline canvas at half resolution, upscaled
// + blurred for that continuous glow.
//
// Interactions:
//   • pointer move  → ribbons bend toward the cursor (the nearest point on each
//                     strand attracts, the rest trail behind)
//   • pointer speed → flow energy rises (amplitude, brightness, blur spread)
//   • hover a control (button/chip/card/input) → ribbons brighten and tint toward
//                     that element's accent
//   • click         → a ripple ring + the ribbons get pushed away
//   • scroll        → palette + vertical drift follow the page
//   • tilt (phone)  → parallax
//   • reduced motion→ one calm static frame
//
// Each ribbon is a single continuous Bézier-style curve through N sampled
// control points. The curve's curvature changes from segment to segment and
// from moment to moment via low-frequency sine drift, producing the kind of
// fluid, alive motion Astra is known for.
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

interface Ribbon {
  /** vertical anchor, normalized 0..1 */
  y: number;
  /** wave amplitude in y direction (normalized) */
  amp: number;
  /** wave frequencies */
  freqA: number;
  freqB: number;
  /** phases drift independently */
  phA: number;
  phB: number;
  /** flow speed */
  speed: number;
  /** parallax depth: 0 = fixed, ± = opposing motion */
  depth: number;
  /** color (HSL) */
  hue: number; sat: number; light: number; alpha: number;
  /** second layer hue for the inner glow */
  hue2: number;
}

const PALETTE: Pick<Ribbon, "hue" | "sat" | "light" | "alpha" | "hue2">[] = [
  { hue: 44,  sat: 96, light: 60, alpha: 0.90, hue2: 28 },   // warm gold
  { hue: 30,  sat: 92, light: 55, alpha: 0.78, hue2: 12 },   // amber
  { hue: 18,  sat: 88, light: 52, alpha: 0.72, hue2: 360 },  // ember
  { hue: 268, sat: 80, light: 60, alpha: 0.55, hue2: 282 },  // violet
  { hue: 252, sat: 78, light: 60, alpha: 0.50, hue2: 268 },  // indigo
  { hue: 192, sat: 84, light: 56, alpha: 0.62, hue2: 178 },  // teal
  { hue: 210, sat: 82, light: 58, alpha: 0.55, hue2: 222 },  // sky
  { hue: 160, sat: 72, light: 56, alpha: 0.42, hue2: 168 },  // mint
  { hue: 288, sat: 70, light: 58, alpha: 0.40, hue2: 304 },  // magenta
];

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, summary, [role='button'], .chip, .card, .kbd";

/** Low-frequency, smooth vertical drift for one ribbon at a given u ∈ [0,1] + t (s). */
function ribbonY(u: number, t: number, rb: Ribbon): number {
  const a = Math.sin(u * rb.freqA * Math.PI + t * rb.speed + rb.phA) * 0.6;
  const b = Math.sin(u * rb.freqB * Math.PI * 0.83 + t * rb.speed * 0.7 + rb.phB) * 0.4;
  return a + b;
}

export function Aurora() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Build 9 ribbons at distinct vertical anchors and opposing depths.
    const ribbons: Ribbon[] = PALETTE.map((p, i) => ({
      y: 0.08 + (i / PALETTE.length) * 0.84 + ((i % 2 ? -1 : 1) * 0.012),
      amp: 0.06 + (i % 3) * 0.012,
      freqA: 0.8 + (i * 0.13) % 1.4,
      freqB: 1.4 + (i * 0.17) % 1.6,
      phA: i * 1.37,
      phB: i * 2.11 + 0.6,
      speed: 0.16 + (i * 0.011) % 0.07,
      depth: (i % 2 === 0 ? 1 : -1) * (0.7 + (i * 0.07) % 0.5),
      ...p,
    }));

    let width = 0; let height = 0;
    let raf = 0;
    let running = true;

    // Pointer (eased)
    const pointer = { x: 0.5, y: 0.42, tx: 0.5, ty: 0.42, lastX: 0.5, lastY: 0.42, speed: 0 };
    let energy = 0; let energyTarget = 0;
    let hueBias = 0; let hueBiasTarget = 0;
    let scrollNorm = 0;
    const tilt = { x: 0, y: 0 };
    const ripples: { x: number; y: number; t: number }[] = [];

    const RESOLUTION = 0.5;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(2, Math.round(rect.width * dpr * RESOLUTION));
      height = Math.max(2, Math.round(rect.height * dpr * RESOLUTION));
      canvas.width = width;
      canvas.height = height;
    };
    resize();

    const onPointerMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      pointer.tx = nx; pointer.ty = ny;
      const dx = nx - pointer.lastX; const dy = ny - pointer.lastY;
      pointer.speed = Math.min(1, Math.hypot(dx, dy) * 9);
      pointer.lastX = nx; pointer.lastY = ny;
    };
    const onOver = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(INTERACTIVE_SELECTOR) as HTMLElement | null;
      if (el) {
        energyTarget = 1;
        const accent = el.getAttribute("data-aurora-hue");
        hueBiasTarget = accent ? Number(accent) : 26;
      } else {
        energyTarget = 0;
        hueBiasTarget = 0;
      }
    };
    const onDown = (e: PointerEvent) => {
      ripples.push({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight, t: 0 });
      if (ripples.length > 5) ripples.shift();
      energyTarget = Math.max(energyTarget, 1);
    };
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollNorm = window.scrollY / max;
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt.x = Math.max(-1, Math.min(1, e.gamma / 45));
      tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
    };
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    if (typeof DeviceOrientationEvent !== "undefined") {
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    onScroll();

    const SAMPLES = 28;                       // points per ribbon — smooth & light
    const frame = () => {
      if (!running) return;
      const t = performance.now() / 1000;

      const EASE = 0.075;
      pointer.x += (pointer.tx - pointer.x) * EASE;
      pointer.y += (pointer.ty - pointer.y) * EASE;
      pointer.speed *= 0.9;
      energy += (energyTarget - energy) * 0.06;
      hueBias += (hueBiasTarget - hueBias) * 0.05;
      const boost = energy + pointer.speed * 0.6;
      const w = width; const h = height;

      // ── base: near-black with a faint warm floor ──
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#04030a";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      // ── ribbons ──
      for (const rb of ribbons) {
        // parallax Y only — horizontal motion is expressed by bendOffset + localBend
        const py = (pointer.y - 0.5) * rb.depth * 0.16 + tilt.y * rb.depth * 0.05;
        const sy = (scrollNorm - 0.5) * 0.22 * (rb.depth > 0 ? 1 : -0.6);

        const hue = rb.hue + hueBias * (rb.hue >= 20 && rb.hue <= 60 ? 0.4 : -0.3);
        const hueIn = rb.hue2 + hueBias * (rb.hue2 >= 20 && rb.hue2 <= 60 ? 0.4 : -0.3);
        const alpha = Math.min(0.95, rb.alpha * (1 + boost * 0.55));

        // Pointer attraction: the nearest point on the curve to the cursor bends toward it.
        const cursorX = pointer.x * w;
        const anchorY = (rb.y + py + sy) * h;
        const bendOffset = (cursorX - w * 0.5) * 0.12 * (1 + boost * 0.5) * (0.35 + Math.abs(rb.depth) * 0.65);
        const cursorY = pointer.y * h;
        const yBend = (cursorY - anchorY) * 0.08 * (1 + boost * 0.5);
        void cursorX;

        // ripples push the ribbon away
        let rippleBend = 0;
        for (const rp of ripples) {
          const life = rp.t / 1.2;
          if (life >= 1) continue;
          const d = Math.abs(rp.x - pointer.x);
          const influence = Math.max(0, 1 - d * 3.2) * (1 - life) * 0.15;
          rippleBend += influence * (rp.y - rb.y > 0 ? -1 : 1);
        }

        // Build the sampled curve points
        const pts: [number, number][] = [];
        for (let i = 0; i <= SAMPLES; i += 1) {
          const u = i / SAMPLES;
          const x = u * w * 1.18 - w * 0.09;       // slight over-scan

          const yWave = ribbonY(u, t, rb) * rb.amp
            + ribbonY(u, t * 1.6, rb) * rb.amp * 0.35;

          // pointer bend weighted by a smooth bell so the cursor pulls only locally
          const dx = u - pointer.x;
          const localBend = Math.exp(-(dx * dx) * 24) * (1 + boost * 0.8);

          const y = (rb.y + py + sy) * h
            + yWave * h * (0.8 + boost * 0.6)
            + bendOffset * localBend * 0.3
            + yBend * localBend
            + rippleBend * h;

          pts.push([x, y]);
        }

        // glow halo — wide, soft
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) {
          const [px2, py2] = pts[i];
          const [px1, py1] = pts[i - 1];
          const cx = (px1 + px2) / 2; const cy = (py1 + py2) / 2;
          ctx.quadraticCurveTo(px1, py1, cx, cy);
        }
        ctx.lineWidth = Math.max(2, h * 0.014) * (1 + boost * 0.35);
        ctx.strokeStyle = `hsla(${hue}, ${rb.sat}%, ${rb.light + 6}%, ${alpha * 0.18})`;
        ctx.lineCap = "round";
        ctx.stroke();

        // inner glow — sharper
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) {
          const [px2, py2] = pts[i];
          const [px1, py1] = pts[i - 1];
          const cx = (px1 + px2) / 2; const cy = (py1 + py2) / 2;
          ctx.quadraticCurveTo(px1, py1, cx, cy);
        }
        ctx.lineWidth = Math.max(1.2, h * 0.0055) * (1 + boost * 0.4);
        ctx.strokeStyle = `hsla(${hue}, ${Math.min(100, rb.sat + 4)}%, ${Math.min(82, rb.light + 14 + boost * 6)}%, ${alpha * 0.85})`;
        ctx.stroke();

        // bright core — very thin
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i += 1) {
          const [px2, py2] = pts[i];
          const [px1, py1] = pts[i - 1];
          const cx = (px1 + px2) / 2; const cy = (py1 + py2) / 2;
          ctx.quadraticCurveTo(px1, py1, cx, cy);
        }
        ctx.lineWidth = Math.max(0.8, h * 0.0022);
        ctx.strokeStyle = `hsla(${hueIn}, 100%, 92%, ${Math.min(0.95, alpha * 0.7)})`;
        ctx.stroke();
      }

      // ── pointer lens: a soft circular bloom following the cursor ──
      const lx = pointer.x * w;
      const ly = pointer.y * h;
      const lr = Math.min(w, h) * (0.22 + boost * 0.18);
      const lens = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lens.addColorStop(0, `hsla(${44 + hueBias * 0.45}, 96%, ${66 + boost * 8}%, ${0.22 + boost * 0.32})`);
      lens.addColorStop(0.45, `hsla(${32 + hueBias * 0.3}, 92%, 54%, ${0.10 + boost * 0.18})`);
      lens.addColorStop(1, "hsla(0, 0%, 0%, 0)");
      ctx.fillStyle = lens;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();

      // ── click ripples ──
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const rp = ripples[i];
        rp.t += 1 / 60;
        const life = rp.t / 1.2;
        if (life >= 1) { ripples.splice(i, 1); continue; }
        const rr = Math.min(w, h) * (0.05 + life * 0.62);
        const a = (1 - life) * (1 - life) * 0.42;
        ctx.strokeStyle = `hsla(${46 + hueBias * 0.5}, 96%, 70%, ${a})`;
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.004 * (1 - life));
        ctx.beginPath();
        ctx.arc(rp.x * w, rp.y * h, rr, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── vignette so copy stays readable ──
      ctx.globalCompositeOperation = "source-over";
      const vig = ctx.createRadialGradient(
        w / 2, h * 0.5, Math.min(w, h) * 0.22,
        w / 2, h * 0.5, Math.max(w, h) * 0.78,
      );
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(2,1,6,0.85)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Publish live energy/hue so the UI glows with the background.
      document.documentElement.style.setProperty("--aurora-energy", boost.toFixed(3));
      document.documentElement.style.setProperty("--aurora-hue", (44 + hueBias * 0.5).toFixed(1));

      if (reduced) { running = false; return; }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      if (typeof DeviceOrientationEvent !== "undefined") {
        window.removeEventListener("deviceorientation", onTilt);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="aurora-canvas" />;
}
