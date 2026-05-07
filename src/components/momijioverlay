import { useEffect, useRef } from 'react';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const INTENSITY_MAP = { light: 35, medium: 60, heavy: 90 };

// ─── PRNG (seeded, deterministic per template) ────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── DRAW ONE BOTANICALLY ACCURATE MOMIJI LEAF ───────────────────────────────
// lobes: 5 or 7. Size is the radius of the outermost lobe tips.
function drawMomijiLeaf(ctx, lobes, radius, hue, sat, lit, isGreenToRed) {
  const cx = radius + 4, cy = radius * 1.1 + 4; // centre with padding
  const W = (radius + 4) * 2, H = (radius * 1.1 + 4) * 2;
  ctx.clearRect(0, 0, W, H);

  // Radial gradient per leaf
  let grad;
  if (isGreenToRed) {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `hsl(10,75%,40%)`);
    grad.addColorStop(0.5, `hsl(38,80%,52%)`);
    grad.addColorStop(1, `hsl(90,60%,38%)`);
  } else {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `hsl(${hue},${sat}%,${lit - 10}%)`);
    grad.addColorStop(0.6, `hsl(${hue},${sat}%,${lit}%)`);
    grad.addColorStop(1, `hsl(${Math.min(hue + 15, 55)},${sat - 5}%,${lit + 12}%)`);
  }

  // Build the leaf path — botanical momiji silhouette
  // Lobes are distributed from –90° (straight up) with gaps (sinuses) between them
  ctx.beginPath();
  const totalSpan = lobes === 7 ? 200 : 170; // degrees total arc
  const lobeSpacing = totalSpan / (lobes - 1);
  const startAngle = -90 - totalSpan / 2; // centred on top

  // Petiole (stem) base
  const petioleX = cx, petioleY = cy + radius * 0.45;
  ctx.moveTo(petioleX, petioleY);

  for (let i = 0; i < lobes; i++) {
    const ang = (startAngle + i * lobeSpacing) * (Math.PI / 180);

    // Lobe tip position
    const tipX = cx + Math.cos(ang) * radius;
    const tipY = cy + Math.sin(ang) * radius;

    // Sinus depth — deeper cut between lobes (characteristic of momiji)
    const sinusR = radius * (lobes === 7 ? 0.38 : 0.42);
    const sinusAng = ang - (lobeSpacing * 0.5 * Math.PI / 180);
    const sinusX = cx + Math.cos(sinusAng) * sinusR;
    const sinusY = cy + Math.sin(sinusAng) * sinusR;

    // Each lobe: approach from sinus, flare out to tip, back to next sinus
    // Using bezierCurveTo for the characteristic sharp-tipped, concave silhouette
    const lobeWidth = radius * 0.22;

    // Left side of lobe
    const leftAng = ang - 0.22;
    const cp1x = cx + Math.cos(leftAng) * radius * 0.72;
    const cp1y = cy + Math.sin(leftAng) * radius * 0.72;

    // Right side of lobe
    const rightAng = ang + 0.22;
    const cp2x = cx + Math.cos(rightAng) * radius * 0.72;
    const cp2y = cy + Math.sin(rightAng) * radius * 0.72;

    if (i === 0) {
      // First lobe — draw from petiole
      ctx.bezierCurveTo(
        petioleX + Math.cos(sinusAng) * sinusR * 0.6,
        petioleY + Math.sin(sinusAng) * sinusR * 0.6,
        cp1x, cp1y, tipX, tipY
      );
    } else {
      // Sinus (concave cut between lobes)
      ctx.bezierCurveTo(cp2x, cp2y, sinusX, sinusY, sinusX, sinusY);
      // Rise to this lobe tip
      ctx.bezierCurveTo(
        sinusX + (cp1x - sinusX) * 0.8,
        sinusY + (cp1y - sinusY) * 0.8,
        cp1x, cp1y, tipX, tipY
      );
    }
  }

  // Close back to petiole via right side
  const lastAng = (startAngle + (lobes - 1) * lobeSpacing + lobeSpacing * 0.5) * (Math.PI / 180);
  const lastSinusX = cx + Math.cos(lastAng) * sinusR;
  const lastSinusY = cy + Math.sin(lastAng) * sinusR;
  ctx.bezierCurveTo(
    cx + Math.cos((startAngle + (lobes - 1) * lobeSpacing + 0.22) * Math.PI / 180) * radius * 0.72,
    cy + Math.sin((startAngle + (lobes - 1) * lobeSpacing + 0.22) * Math.PI / 180) * radius * 0.72,
    lastSinusX, lastSinusY, lastSinusX, lastSinusY
  );
  ctx.bezierCurveTo(
    lastSinusX * 0.8 + petioleX * 0.2,
    lastSinusY * 0.8 + petioleY * 0.2,
    petioleX, petioleY - 2, petioleX, petioleY
  );
  ctx.closePath();

  // Fill with gradient
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle dark edge stroke
  ctx.strokeStyle = `hsla(${hue - 5},${sat}%,${lit - 20}%,0.5)`;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Veins — radiating from petiole to each lobe tip
  const veinColor = 'rgba(255,248,220,0.55)';
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = veinColor;

  for (let i = 0; i < lobes; i++) {
    const ang = (startAngle + i * lobeSpacing) * (Math.PI / 180);
    const tipX = cx + Math.cos(ang) * radius * 0.88;
    const tipY = cy + Math.sin(ang) * radius * 0.88;
    // Central vein from petiole
    const midX = cx + Math.cos(ang) * radius * 0.48;
    const midY = cy + Math.sin(ang) * radius * 0.48;
    ctx.beginPath();
    ctx.moveTo(petioleX, petioleY - 2);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();
    // Secondary veins (fine branches off main vein)
    if (radius > 38) {
      ctx.lineWidth = 0.35;
      ctx.strokeStyle = 'rgba(255,248,220,0.35)';
      const branchAt = 0.55;
      const bx = petioleX + (tipX - petioleX) * branchAt;
      const by = petioleY + (tipY - petioleY) * branchAt;
      const side = (i % 2 === 0 ? 1 : -1) * 8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + side, by - 6);
      ctx.stroke();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = veinColor;
    }
  }

  // Petiole (stem)
  ctx.beginPath();
  ctx.moveTo(petioleX, petioleY);
  ctx.lineTo(petioleX, petioleY + radius * 0.28);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = `hsla(${hue},40%,${lit - 15}%,0.7)`;
  ctx.stroke();
}

// ─── TEMPLATE FACTORY ─────────────────────────────────────────────────────────
function buildTemplates() {
  const templates = [];
  const rand = mulberry32(0xdeadbeef);

  // 14 templates: varied lobe count, size, colour
  for (let i = 0; i < 14; i++) {
    const lobes    = i % 3 === 0 ? 7 : 5;
    const size     = 28 + Math.floor(rand() * 44); // 28–72
    const radius   = size / 2;
    const isGreen  = rand() < 0.15;

    // Colour: cycle through crimson / burnt-orange / amber / burgundy
    const palette = [
      [rand() * 16, 75 + rand() * 15, 38 + rand() * 12],       // crimson 0–15
      [20 + rand() * 15, 70 + rand() * 20, 42 + rand() * 15],  // burnt orange
      [38 + rand() * 12, 65 + rand() * 20, 48 + rand() * 17],  // amber-gold
      [5  + rand() * 8,  72 + rand() * 18, 35 + rand() * 14],  // deep burgundy
    ];
    const [hue, sat, lit] = palette[i % 4];

    const W = (radius + 4) * 2;
    const H = (radius * 1.1 + 4) * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width  = Math.ceil(W);
    offscreen.height = Math.ceil(H);
    const ctx = offscreen.getContext('2d');

    drawMomijiLeaf(ctx, lobes, radius, hue, sat, lit, isGreen);
    templates.push({ canvas: offscreen, size, W, H, cx: radius + 4, cy: radius * 1.1 + 4 });
  }
  return templates;
}

// ─── LEAF SPAWNER ─────────────────────────────────────────────────────────────
function spawnLeaf(W, H, templates, fromSide = false) {
  const tmpl = templates[Math.floor(Math.random() * templates.length)];

  // Depth layer
  const r = Math.random();
  let layer, alpha, speedMult;
  if (r < 0.30) {
    layer = 'fg'; alpha = 0.88 + Math.random() * 0.12; speedMult = 1.0;
  } else if (r < 0.70) {
    layer = 'mg'; alpha = 0.65 + Math.random() * 0.17; speedMult = 0.65;
  } else {
    layer = 'bg'; alpha = 0.30 + Math.random() * 0.20; speedMult = 0.35;
  }

  const baseGravity = 0.012 + (Math.random() * 0.033);
  const gravity     = baseGravity * (1 + (1 - speedMult) * 0.4);

  let x, y, vx;
  if (fromSide) {
    const fromLeft = Math.random() < 0.5;
    x  = fromLeft ? -tmpl.W : W + tmpl.W;
    y  = Math.random() * H * 0.7;
    vx = fromLeft ? (0.4 + Math.random() * 1.2) : -(0.4 + Math.random() * 1.2);
  } else {
    x  = -tmpl.W + Math.random() * (W + tmpl.W * 2);
    y  = -(tmpl.H + Math.random() * 60);
    vx = (Math.random() - 0.5) * 0.8;
  }

  return {
    tmpl,
    x, y, vx,
    vy:         0.1 + Math.random() * 0.4 * speedMult,
    gravity:    gravity * speedMult,
    rotation:   Math.random() * Math.PI * 2,
    rotSpeed:   (Math.random() - 0.5) * 0.035,
    tiltAngle:  Math.random() * Math.PI * 2,
    tiltSpeed:  (0.012 + Math.random() * 0.030) * (Math.random() < 0.5 ? 1 : -1),
    swayPhase:  Math.random() * Math.PI * 2,
    swayFreq:   0.018 + Math.random() * 0.022,
    swayAmp:    0.012 + Math.random() * 0.020,
    speedMult,
    layer,
    alpha,
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
function MomijiOverlay({ isVisible = true, intensity = 'medium', onComplete }) {
  const fgRef  = useRef(null); // foreground + midground
  const bgRef  = useRef(null); // background (blurred)
  const state  = useRef(null);

  useEffect(() => {
    if (!isVisible) return;

    const fgCanvas = fgRef.current;
    const bgCanvas = bgRef.current;
    if (!fgCanvas || !bgCanvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let VW = window.innerWidth, VH = window.innerHeight;

    const setupCanvas = (c) => {
      c.width  = Math.round(VW * dpr);
      c.height = Math.round(VH * dpr);
      c.style.width  = VW + 'px';
      c.style.height = VH + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };

    let fgCtx = setupCanvas(fgCanvas);
    let bgCtx = setupCanvas(bgCanvas);

    const handleResize = () => {
      VW = window.innerWidth; VH = window.innerHeight;
      fgCtx = setupCanvas(fgCanvas);
      bgCtx = setupCanvas(bgCanvas);
    };
    window.addEventListener('resize', handleResize);

    // Build offscreen leaf templates (once on mount)
    const templates = buildTemplates();

    // Leaf pool
    const targetCount = INTENSITY_MAP[intensity] ?? 60;
    const leaves = [];
    for (let i = 0; i < targetCount; i++) {
      // Stagger initial y positions so they don't all appear at once
      const l = spawnLeaf(VW, VH, templates);
      l.y = -l.tmpl.H + Math.random() * (VH + l.tmpl.H); // scattered initial
      leaves.push(l);
    }

    // Wind state
    let t = 0;
    let windX    = 0;
    let windGust = 0;
    let gustTimer = 3000 + Math.random() * 3000;
    let lastNow   = performance.now();

    let animId;

    const loop = (now) => {
      const dt = Math.min(now - lastNow, 50);
      lastNow = now;
      t += dt;

      // Wind: slow global oscillation + occasional gusts
      windX = 0.6 * Math.sin(t * 0.0003) + windGust;
      gustTimer -= dt;
      if (gustTimer <= 0) {
        windGust = (Math.random() - 0.5) * 3.0;
        gustTimer = 3000 + Math.random() * 3000;
        // Decay gust gradually (handled by blending each frame)
      }
      windGust *= 0.992; // gust decays smoothly

      fgCtx.clearRect(0, 0, VW, VH);
      bgCtx.clearRect(0, 0, VW, VH);

      for (let i = 0; i < leaves.length; i++) {
        const l = leaves[i];

        // Physics
        l.vy         += l.gravity;
        l.swayPhase  += l.swayFreq;
        l.vx         += Math.sin(l.swayPhase) * l.swayAmp;
        l.vx         += windX * l.speedMult * 0.018;
        l.vx         *= 0.98; // drag
        l.vy         *= 0.998;
        l.x          += l.vx;
        l.y          += l.vy;
        l.rotation   += l.rotSpeed;
        l.tiltAngle  += l.tiltSpeed;

        // Respawn if out of bounds
        if (l.y > VH + l.tmpl.H + 20
         || l.x < -VW * 0.4
         || l.x > VW * 1.4) {
          const fromSide = Math.abs(windX + windGust) > 1.2 && Math.random() < 0.25;
          leaves[i] = spawnLeaf(VW, VH, templates, fromSide);
          continue;
        }

        // Select ctx by layer
        const ctx = l.layer === 'bg' ? bgCtx : fgCtx;

        ctx.save();
        ctx.globalAlpha = l.alpha;
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rotation);

        // 3D tilt: scaleX by cos(tiltAngle) — edge-on when cos≈0
        const cosT = Math.cos(l.tiltAngle);
        ctx.scale(cosT, 1);

        // Stamp pre-rendered template
        ctx.drawImage(
          l.tmpl.canvas,
          -l.tmpl.cx,
          -l.tmpl.cy
        );
        ctx.restore();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    state.current = { animId };

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isVisible, intensity]);

  if (!isVisible) return null;

  const canvasStyle = {
    position: 'fixed',
    top: 0, left: 0,
    width: '100vw', height: '100vh',
    zIndex: 9999,
    pointerEvents: 'none',
  };

  return (
    <>
      {/* Background layer (blurred leaves) */}
      <canvas
        ref={bgRef}
        style={{ ...canvasStyle, filter: 'blur(1.5px)', opacity: 0.85 }}
      />
      {/* Foreground + midground leaves (sharp) */}
      <canvas
        ref={fgRef}
        style={{ ...canvasStyle }}
      />
    </>
  );
}

export default MomijiOverlay;
