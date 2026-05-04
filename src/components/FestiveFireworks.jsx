import { useEffect, useRef, useState } from 'react';

// ─── CNY VERIFIED LUNAR DATES ──────────────────────────────────────────────
const CNY_DATES = {
  2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13',
  2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31',
  2034: '02-19', 2035: '02-08',
};

// ─── HELPERS ───────────────────────────────────────────────────────────────
const rand    = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick    = arr   => arr[randInt(0, arr.length - 1)];

// ─── THEME CONFIGS ─────────────────────────────────────────────────────────
const THEMES = {
  'new-year': {
    darkHues:    [48, 52, 56, 200, 215, 225, 240, 245, 250],
    lightHues:   [48, 52, 56, 200, 215, 225, 240, 245, 250],
    trailDark:   'hsl(215,85%,78%)',
    trailLight:  'hsl(48,90%,32%)',
    burstMin:    220,
    burstMax:    400,
    burstTypes:  ['radial', 'willow', 'ring'],
  },
  'cny': {
    darkHues:    [0, 5, 10, 15, 22, 30, 45, 50, 55],
    lightHues:   [0, 5, 10, 15, 22, 30, 45, 50, 55],
    trailDark:   'hsl(15,95%,62%)',
    trailLight:  'hsl(5,95%,28%)',
    burstMin:    150,
    burstMax:    300,
    burstTypes:  ['chrysanthemum', 'peony', 'gold-shimmer'],
  },
};

// ─── PARTICLE FACTORY ──────────────────────────────────────────────────────
function makeParticle(x, y, hue, isDark, overrides = {}) {
  const angle  = rand(0, Math.PI * 2);
  const speed  = rand(1.5, 6.5);
  const lit    = isDark ? rand(55, 78) : rand(22, 48);
  const sat    = isDark ? rand(85, 100) : rand(82, 98);
  return {
    x, y, px: x, py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue, sat, lit,
    alpha:   1,
    decay:   rand(0.010, 0.024),
    size:    rand(1.6, 3.4),
    drag:    rand(0.97, 0.99),
    gravity: rand(0.04, 0.09),
    isStar:  Math.random() < 0.18,
    strobePhase: rand(0, Math.PI * 2),
    strobeSpeed: rand(0.12, 0.28),
    isEmber: Math.random() < 0.10,
    children: [],
    ...overrides,
  };
}

// ─── BURST BUILDERS ────────────────────────────────────────────────────────
function buildBurst(type, x, y, themeKey, isDark) {
  const cfg    = THEMES[themeKey];
  const hues   = isDark ? cfg.darkHues : cfg.lightHues;
  const lit    = isDark ? rand(55, 78) : rand(22, 48);
  const sat    = isDark ? rand(85, 100) : rand(82, 98);
  const particles = [];

  const base = (count, speedMin, speedMax, hue, extra = {}) => {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.08, 0.08);
      const speed = rand(speedMin, speedMax);
      particles.push(makeParticle(x, y, hue, isDark, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ...extra,
      }));
    }
  };

  const scatter = (count, speedMin, speedMax, hue, extra = {}) => {
    for (let i = 0; i < count; i++) {
      particles.push(makeParticle(x, y, hue, isDark, {
        vx: rand(-speedMax, speedMax),
        vy: rand(-speedMax, speedMax),
        ...extra,
      }));
    }
  };

  if (themeKey === 'new-year') {
    switch (type) {
      case 'radial': {
        const hue = pick(hues);
        for (let i = 0; i < 100; i++) {
          particles.push(makeParticle(x, y, hue, isDark));
        }
        break;
      }
      case 'willow': {
        const hue = pick(hues);
        for (let i = 0; i < 85; i++) {
          const angle = rand(0, Math.PI * 2);
          const speed = rand(1.8, 5.5);
          particles.push(makeParticle(x, y, hue, isDark, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: rand(0.09, 0.14),   // willow droop
            decay:   rand(0.006, 0.016), // slow decay
            drag:    rand(0.96, 0.98),
          }));
        }
        break;
      }
      case 'ring': {
        const hue = pick(hues);
        base(40, 4.5, 6.0, hue);               // precise ring
        scatter(65, 1.0, 4.5, hue);             // scattered interior
        break;
      }
    }
  }

  if (themeKey === 'cny') {
    switch (type) {
      case 'chrysanthemum': {
        const hue = pick(hues);
        for (let i = 0; i < 130; i++) {
          const angle = rand(0, Math.PI * 2);
          const speed = rand(2.0, 6.0);
          particles.push(makeParticle(x, y, hue, isDark, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            decay:   rand(0.005, 0.012),  // very slow
            gravity: rand(0.03, 0.07),
          }));
        }
        break;
      }
      case 'peony': {
        const hue1 = pick(hues);
        const hue2 = pick(hues.filter(h => Math.abs(h - hue1) > 10));
        base(55, 1.5, 3.0, hue1);              // inner ring
        base(75, 3.5, 6.5, hue2 ?? hue1);     // outer ring
        break;
      }
      case 'gold-shimmer': {
        const goldHue = pick([45, 50, 55]);
        for (let i = 0; i < 145; i++) {
          const hue = Math.random() < 0.60 ? goldHue : pick([0, 5, 10]);
          particles.push(makeParticle(x, y, hue, isDark, {
            isStar: true,
            decay:  rand(0.008, 0.018),
          }));
        }
        break;
      }
    }
  }

  return particles;
}

// ─── ROCKET FACTORY ────────────────────────────────────────────────────────
function makeRocket(W, H, themeKey, isDark) {
  const xStart = rand(W * 0.1, W * 0.9);
  const xDrift = rand(-1.2, 1.2);
  const targetY = rand(H * 0.08, H * 0.40);
  return {
    x: xStart, y: H,
    px: xStart, py: H,
    vx: xDrift, vy: rand(-14, -10),
    targetY,
    themeKey,
    isDark,
    exploded: false,
  };
}

// ─── DRAW ──────────────────────────────────────────────────────────────────
function drawRocket(ctx, r, trailColor) {
  const grad = ctx.createLinearGradient(r.px, r.py, r.x, r.y);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, trailColor);
  ctx.beginPath();
  ctx.moveTo(r.px, r.py);
  ctx.lineTo(r.x, r.y);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  // Head glow
  ctx.beginPath();
  ctx.arc(r.x, r.y, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = trailColor;
  ctx.fill();
}

function drawParticle(ctx, p, isDark) {
  p.strobePhase += p.strobeSpeed;
  let alpha = p.alpha;
  if (p.isStar) alpha *= 0.5 + 0.5 * Math.abs(Math.sin(p.strobePhase));

  const color = `hsla(${p.hue},${p.sat}%,${p.lit}%,${alpha})`;
  const grad  = ctx.createLinearGradient(p.px, p.py, p.x, p.y);
  grad.addColorStop(0, `hsla(${p.hue},${p.sat}%,${p.lit}%,0)`);
  grad.addColorStop(1, color);

  ctx.beginPath();
  ctx.moveTo(p.px, p.py);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(0.4, p.size * alpha);
  ctx.lineCap = 'round';

  if (isDark) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.stroke();
    // Readable dark edge
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.lit - 12}%,${alpha * 0.45})`;
    ctx.lineWidth = Math.max(0.2, p.size * alpha * 0.5);
    ctx.stroke();
  }

  // Glow halo
  if (alpha > 0.3) {
    if (isDark) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.5 * alpha, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lit}%,${alpha * 0.18})`;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.shadowBlur  = 10;
      ctx.shadowColor = `hsl(${p.hue},${p.sat}%,${p.lit}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// ─── COMPONENT ─────────────────────────────────────────────────────────────
function FestiveFireworks({
  theme,
  colorScheme = 'auto',
  isVisible,
  durationMs = 6000,
  onComplete,
}) {
  const canvasRef    = useRef(null);
  const stateRef     = useRef({
    rockets:   [],
    particles: [],
    done:      false,
    isDark:    false,
    animId:    null,
    launchTimer:   null,
    durationTimer: null,
  });
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const st  = stateRef.current;
    const cfg = THEMES[theme] ?? THEMES['new-year'];

    // ── DPR-aware canvas sizing ──
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const setupCanvas = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setupCanvas();

    // ── Dark mode detection ──
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    st.isDark = colorScheme === 'auto' ? mq.matches : colorScheme === 'dark';
    const themeHandler = e => { st.isDark = colorScheme === 'auto' ? e.matches : st.isDark; };
    mq.addEventListener('change', themeHandler);

    const handleResize = () => setupCanvas();
    window.addEventListener('resize', handleResize);

    // ── Reset state ──
    st.rockets   = [];
    st.particles = [];
    st.done      = false;

    // ── Launch helpers ──
    const launchRocket = () => {
      st.rockets.push(makeRocket(W, H, theme, st.isDark));
    };

    const scheduleRocket = () => {
      if (st.done) return;
      const delay = rand(cfg.burstMin, cfg.burstMax);
      st.launchTimer = setTimeout(() => {
        launchRocket();
        scheduleRocket();
      }, delay);
    };

    // Fire 3 immediately, staggered
    launchRocket();
    setTimeout(launchRocket, 160);
    setTimeout(launchRocket, 280);
    scheduleRocket();

    // ── Duration timer ──
    st.durationTimer = setTimeout(() => { st.done = true; }, durationMs);

    // ── Animation loop ──
    const loop = () => {
      // Frame fade
      ctx.fillStyle = st.isDark
        ? 'rgba(0,0,0,0.17)'
        : 'rgba(248,248,248,0.20)';
      ctx.fillRect(0, 0, W, H);

      const trailColor = st.isDark ? cfg.trailDark : cfg.trailLight;
      const burstTypes = cfg.burstTypes;

      // Update + draw rockets
      for (let i = st.rockets.length - 1; i >= 0; i--) {
        const r = st.rockets[i];
        r.px = r.x; r.py = r.y;
        r.vy += 0.20;
        r.x  += r.vx;
        r.y  += r.vy;

        if (!r.exploded && (r.vy >= -0.5 || r.y <= r.targetY)) {
          r.exploded = true;
          const type = pick(burstTypes);
          const burst = buildBurst(type, r.x, r.y, theme, st.isDark);
          st.particles.push(...burst);

          // CNY gold-shimmer secondary burst
          if (type === 'gold-shimmer') {
            const bx = r.x; const by = r.y;
            setTimeout(() => {
              if (!st.done || st.particles.length > 0) {
                const secondary = buildBurst('chrysanthemum', bx, by, theme, st.isDark);
                // Override to crimson, smaller
                secondary.forEach(p => {
                  p.hue  = pick([0, 5, 10]);
                  p.vx  *= 0.55;
                  p.vy  *= 0.55;
                  p.decay = rand(0.018, 0.030);
                });
                st.particles.push(...secondary.slice(0, 50));
              }
            }, 12 * (1000 / 60));
          }

          st.rockets.splice(i, 1);
          continue;
        }

        if (!r.exploded) drawRocket(ctx, r, trailColor);
      }

      // Pool cap
      if (st.particles.length >= 700) {
        st.particles.splice(0, st.particles.length - 700);
      }

      // Update + draw particles
      const emberQueue = [];
      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i];
        p.px = p.x; p.py = p.y;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += p.gravity;
        p.x  += p.vx;
        p.y  += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          st.particles.splice(i, 1);
          continue;
        }

        drawParticle(ctx, p, st.isDark);

        // Ember children
        if (p.isEmber && p.alpha > 0.4 && Math.random() < 0.04) {
          const child = makeParticle(p.x, p.y, p.hue, st.isDark, {
            vx:    p.vx * 0.4 + rand(-0.5, 0.5),
            vy:    p.vy * 0.4 + rand(-0.5, 0.5),
            size:  p.size * 0.5,
            decay: p.decay * 2.5,
            isEmber: false,
          });
          emberQueue.push(child);
        }
      }
      st.particles.push(...emberQueue);

      // Completion check
      if (st.done && st.rockets.length === 0 && st.particles.length < 8) {
        cancelAnimationFrame(st.animId);
        onComplete?.();
        return;
      }

      st.animId = requestAnimationFrame(loop);
    };

    st.animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(st.animId);
      clearTimeout(st.launchTimer);
      clearTimeout(st.durationTimer);
      window.removeEventListener('resize', handleResize);
      mq.removeEventListener('change', themeHandler);
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [isVisible, theme, colorScheme, durationMs, onComplete]);

  if (!isVisible) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:      'fixed',
        top:           0,
        left:          0,
        width:         '100vw',
        height:        '100vh',
        zIndex:        9999,
        pointerEvents: 'none',
        background:    'transparent',
      }}
    />
  );
}

// ─── detectFestiveTheme ────────────────────────────────────────────────────
export function detectFestiveTheme() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;  // 1-based
  const day   = now.getDate();

  // New Year's Day
  if (month === 1 && day === 1) return 'new-year';

  // Chinese New Year lookup
  const cnyStr = CNY_DATES[year];
  if (cnyStr) {
    const [cm, cd] = cnyStr.split('-').map(Number);
    if (month === cm && day === cd) return 'cny';
  }

  return null;
}

export default FestiveFireworks;
