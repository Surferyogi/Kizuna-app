import { useEffect, useRef, useState } from 'react';

// ─── CNY VERIFIED LUNAR DATES ──────────────────────────────────────────────
const CNY_DATES = {
  2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13',
  2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31',
  2034: '02-19', 2035: '02-08',
};

// Deepavali (Singapore official dates)
const DEEPAVALI_DATES = {
  2026: '10-20', 2027: '11-08', 2028: '10-27', 2029: '10-17',
  2030: '11-05', 2031: '10-25', 2032: '10-13', 2033: '11-01',
  2034: '10-21', 2035: '10-10',
};

const rand    = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick    = arr   => arr[randInt(0, arr.length - 1)];

const THEMES = {
  // ── New Year's Eve (Dec 31) ────────────────────────────────────────────
  'nye': {
    darkHues:   [48,52,56,200,215,225,240,245,250],
    lightHues:  [48,52,56,200,215,225,240,245,250],
    trailDark:  'hsl(215,85%,78%)', trailLight: 'hsl(48,90%,32%)',
    burstMin: 180, burstMax: 340,
    burstTypes: ['radial','willow','ring'],
    label:      '🎉 Countdown to New Year!',
    stopGrad:   ['#1A1A2E','#0D0D1A'], stopBorder: '#4A4AEE',
    stopGlow:   '#6666FF', stopText: '#B8D4FF',
  },
  // ── New Year's Day (Jan 1) ────────────────────────────────────────────
  'new-year': {
    darkHues:   [48,52,56,200,215,225,240,245,250],
    lightHues:  [48,52,56,200,215,225,240,245,250],
    trailDark:  'hsl(215,85%,78%)', trailLight: 'hsl(48,90%,32%)',
    burstMin: 220, burstMax: 400,
    burstTypes: ['radial','willow','ring'],
    label:      '🥂 Happy New Year!',
    stopGrad:   ['#1A1A2E','#0D0D1A'], stopBorder: '#4A4AEE',
    stopGlow:   '#6666FF', stopText: '#B8D4FF',
  },
  // ── Chinese New Year ─────────────────────────────────────────────────
  'cny': {
    darkHues:   [0,5,10,15,22,30,45,50,55],
    lightHues:  [0,5,10,15,22,30,45,50,55],
    trailDark:  'hsl(15,95%,62%)', trailLight: 'hsl(5,95%,28%)',
    burstMin: 150, burstMax: 300,
    burstTypes: ['chrysanthemum','peony','gold-shimmer'],
    label:      '🧧 新年快乐！Happy CNY!',
    stopGrad:   ['#2E0A0A','#1A0505'], stopBorder: '#CC3333',
    stopGlow:   '#FF4444', stopText: '#FFD0D0',
  },
  // ── Singapore National Day (Aug 9) ───────────────────────────────────
  'national-day': {
    darkHues:   [0,355,350,210,220,230,0,0,0],  // red + blue + white
    lightHues:  [0,355,350,210,220,230,0,0,0],
    trailDark:  'hsl(0,90%,65%)', trailLight: 'hsl(220,80%,35%)',
    burstMin: 200, burstMax: 380,
    burstTypes: ['radial','ring','willow'],
    label:      '🇸🇬 Happy National Day!',
    stopGrad:   ['#2E0808','#0A0A1E'], stopBorder: '#DD2222',
    stopGlow:   '#FF4444', stopText: '#FFD0D0',
  },
  // ── Deepavali ────────────────────────────────────────────────────────
  'deepavali': {
    darkHues:   [280,290,300,38,45,52,18,25,32],  // purple + gold + orange
    lightHues:  [280,290,300,38,45,52,18,25,32],
    trailDark:  'hsl(45,95%,65%)', trailLight: 'hsl(280,80%,35%)',
    burstMin: 180, burstMax: 350,
    burstTypes: ['chrysanthemum','ring','radial'],
    label:      '🪔 Happy Deepavali!',
    stopGrad:   ['#1E0A2E','#0A0510'], stopBorder: '#9933CC',
    stopGlow:   '#CC66FF', stopText: '#E8D0FF',
  },
  // ── Christmas (Dec 25) ───────────────────────────────────────────────
  'christmas': {
    darkHues:   [0,5,355,120,130,140,0,0,0],  // red + green + white
    lightHues:  [0,5,355,120,130,140,0,0,0],
    trailDark:  'hsl(5,90%,65%)', trailLight: 'hsl(120,70%,28%)',
    burstMin: 240, burstMax: 420,
    burstTypes: ['willow','radial','ring'],
    label:      '🎄 Merry Christmas!',
    stopGrad:   ['#1E0808','#081E08'], stopBorder: '#CC2222',
    stopGlow:   '#FF4444', stopText: '#FFD0D0',
  },
};

function makeParticle(x, y, hue, isDark, overrides = {}) {
  const angle = rand(0, Math.PI * 2);
  const speed = rand(1.5, 6.5);
  return {
    x, y, px: x, py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue,
    sat:         isDark ? rand(85,100) : rand(82,98),
    lit:         isDark ? rand(55,78)  : rand(22,48),
    alpha:       1,
    decay:       rand(0.010, 0.024),
    size:        rand(1.6, 3.4),
    drag:        rand(0.97, 0.99),
    gravity:     rand(0.04, 0.09),
    isStar:      Math.random() < 0.18,
    strobePhase: rand(0, Math.PI * 2),
    strobeSpeed: rand(0.12, 0.28),
    isEmber:     Math.random() < 0.10,
    ...overrides,
  };
}

function buildBurst(type, x, y, themeKey, isDark) {
  const cfg = THEMES[themeKey] ?? THEMES['new-year'];
  const hues = isDark ? cfg.darkHues : cfg.lightHues;
  const particles = [];

  // NYE, National Day and Christmas use the same radial/willow/ring builder as New Year
  // Deepavali uses the same chrysanthemum/peony/gold-shimmer builder as CNY
  const builderKey = (themeKey === 'cny' || themeKey === 'deepavali') ? 'cny' : 'new-year';

  const ringBurst = (count, sMin, sMax, hue, extra = {}) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.08, 0.08);
      const s = rand(sMin, sMax);
      particles.push(makeParticle(x, y, hue, isDark,
        { vx: Math.cos(a)*s, vy: Math.sin(a)*s, ...extra }));
    }
  };

  if (builderKey === 'new-year') {
    const hue = pick(hues);
    if (type === 'radial') {
      for (let i = 0; i < 100; i++) particles.push(makeParticle(x, y, hue, isDark));
    } else if (type === 'willow') {
      for (let i = 0; i < 85; i++) {
        const a = rand(0, Math.PI * 2), s = rand(1.8, 5.5);
        particles.push(makeParticle(x, y, hue, isDark, {
          vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          gravity: rand(0.09,0.14), decay: rand(0.006,0.016), drag: rand(0.96,0.98),
        }));
      }
    } else { // ring
      ringBurst(40, 4.5, 6.0, hue);
      for (let i = 0; i < 65; i++) particles.push(makeParticle(x, y, hue, isDark));
    }
  }

  if (builderKey === 'cny') {
    if (type === 'chrysanthemum') {
      const hue = pick(hues);
      for (let i = 0; i < 130; i++) {
        const a = rand(0, Math.PI * 2), s = rand(2.0, 6.0);
        particles.push(makeParticle(x, y, hue, isDark, {
          vx: Math.cos(a)*s, vy: Math.sin(a)*s,
          decay: rand(0.005,0.012), gravity: rand(0.03,0.07),
        }));
      }
    } else if (type === 'peony') {
      const h1 = pick(hues), h2 = pick(hues.filter(h => Math.abs(h-h1)>10)) ?? h1;
      ringBurst(55, 1.5, 3.0, h1);
      ringBurst(75, 3.5, 6.5, h2);
    } else if (type === 'ring') {
      const hue = pick(hues);
      ringBurst(40, 4.5, 6.0, hue);
      for (let i = 0; i < 65; i++) particles.push(makeParticle(x, y, hue, isDark));
    } else if (type === 'radial') {
      const hue = pick(hues);
      for (let i = 0; i < 100; i++) particles.push(makeParticle(x, y, hue, isDark));
    } else { // gold-shimmer
      const goldHues = hues.filter(h => h >= 38 && h <= 55);
      const gold = goldHues.length > 0 ? pick(goldHues) : pick(hues);
      for (let i = 0; i < 145; i++)
        particles.push(makeParticle(x, y,
          Math.random() < 0.6 ? gold : pick(hues), isDark,
          { isStar: true, decay: rand(0.008,0.018) }));
    }
  }
  return particles;
}

function makeRocket(W, H, themeKey, isDark) {
  const x = rand(W * 0.06, W * 0.94);
  return {
    x, y: H, px: x, py: H,
    vx: rand(-1.8, 1.8), vy: rand(-18, -12),
    targetY: rand(H * 0.05, H * 0.65),
    themeKey, isDark, exploded: false,
  };
}

function drawRocket(ctx, r, color) {
  const g = ctx.createLinearGradient(r.px, r.py, r.x, r.y);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.beginPath();
  ctx.moveTo(r.px, r.py);
  ctx.lineTo(r.x, r.y);
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r.x, r.y, 2.8, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawParticle(ctx, p, isDark) {
  p.strobePhase += p.strobeSpeed;
  let alpha = p.alpha;
  if (p.isStar) alpha *= 0.5 + 0.5 * Math.abs(Math.sin(p.strobePhase));

  const color = `hsla(${p.hue},${p.sat}%,${p.lit}%,${alpha})`;
  const g = ctx.createLinearGradient(p.px, p.py, p.x, p.y);
  g.addColorStop(0, `hsla(${p.hue},${p.sat}%,${p.lit}%,0)`);
  g.addColorStop(1, color);

  ctx.beginPath();
  ctx.moveTo(p.px, p.py);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(0.4, p.size * alpha);
  ctx.lineCap = 'round';

  if (isDark) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.stroke();
    ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${Math.max(0,p.lit-12)}%,${alpha*0.45})`;
    ctx.lineWidth = Math.max(0.2, p.size * alpha * 0.5);
    ctx.stroke();
  }

  if (alpha > 0.3) {
    if (isDark) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size*1.5*alpha, 0, Math.PI*2);
      ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lit}%,${alpha*0.18})`;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.shadowBlur = 10;
      ctx.shadowColor = `hsl(${p.hue},${p.sat}%,${p.lit}%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size*alpha, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// ─── COMPONENT ─────────────────────────────────────────────────────────────
function FestiveFireworks({ theme, colorScheme = 'auto', isVisible, onComplete }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({
    rockets: [], particles: [], isDark: false, animId: null, launchTimer: null,
  });
  const [pulse, setPulse] = useState(false);

  // Pulse stop button to draw attention
  useEffect(() => {
    if (!isVisible) return;
    const id = setInterval(() => setPulse(v => !v), 1400);
    return () => clearInterval(id);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const st  = stateRef.current;
    const cfg = THEMES[theme] ?? THEMES['new-year'];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;

    const getSize = () => {
      // Use innerWidth/innerHeight — reliable in both PWA and browser
      // screen.width/height can differ from CSS viewport on retina
      W = window.innerWidth  || document.documentElement.clientWidth;
      H = window.innerHeight || document.documentElement.clientHeight;
    };

    const setupCanvas = () => {
      getSize();
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      // Explicit 100vw/100vh — overrides any parent constraint on iOS PWA
      canvas.style.width  = '100vw';
      canvas.style.height = '100vh';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setupCanvas();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    st.isDark = colorScheme === 'auto' ? mq.matches : colorScheme === 'dark';
    const themeHandler = e => { if (colorScheme === 'auto') st.isDark = e.matches; };
    mq.addEventListener('change', themeHandler);

    const handleResize = () => setupCanvas();
    window.addEventListener('resize', handleResize);

    st.rockets = []; st.particles = [];

    const launchRocket = () => st.rockets.push(makeRocket(W, H, theme, st.isDark));
    const scheduleRocket = () => {
      st.launchTimer = setTimeout(() => {
        launchRocket();
        scheduleRocket();
      }, rand(cfg.burstMin, cfg.burstMax));
    };

    launchRocket();
    setTimeout(launchRocket, 160);
    setTimeout(launchRocket, 280);
    scheduleRocket();

    const loop = () => {
      ctx.fillStyle = st.isDark ? 'rgba(0,0,0,0.17)' : 'rgba(248,248,248,0.20)';
      ctx.fillRect(0, 0, W, H);

      const trailColor = st.isDark ? cfg.trailDark : cfg.trailLight;

      for (let i = st.rockets.length - 1; i >= 0; i--) {
        const r = st.rockets[i];
        r.px = r.x; r.py = r.y;
        r.vy += 0.20; r.x += r.vx; r.y += r.vy;
        if (!r.exploded && (r.vy >= -0.5 || r.y <= r.targetY)) {
          r.exploded = true;
          const type = pick(cfg.burstTypes);
          st.particles.push(...buildBurst(type, r.x, r.y, theme, st.isDark));
          if (type === 'gold-shimmer') {
            const bx = r.x, by = r.y;
            setTimeout(() => {
              const sec = buildBurst('chrysanthemum', bx, by, theme, st.isDark);
              sec.forEach(p => { p.hue = pick([0,5,10]); p.vx *= 0.55; p.vy *= 0.55; p.decay = rand(0.018,0.030); });
              st.particles.push(...sec.slice(0, 50));
            }, 200);
          }
          st.rockets.splice(i, 1);
          continue;
        }
        if (!r.exploded) drawRocket(ctx, r, trailColor);
      }

      if (st.particles.length >= 700)
        st.particles.splice(0, st.particles.length - 700);

      const embers = [];
      for (let i = st.particles.length - 1; i >= 0; i--) {
        const p = st.particles[i];
        p.px = p.x; p.py = p.y;
        p.vx *= p.drag; p.vy *= p.drag; p.vy += p.gravity;
        p.x += p.vx; p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) { st.particles.splice(i, 1); continue; }
        drawParticle(ctx, p, st.isDark);
        if (p.isEmber && p.alpha > 0.4 && Math.random() < 0.04)
          embers.push(makeParticle(p.x, p.y, p.hue, st.isDark, {
            vx: p.vx*0.4 + rand(-0.5,0.5), vy: p.vy*0.4 + rand(-0.5,0.5),
            size: p.size*0.5, decay: p.decay*2.5, isEmber: false,
          }));
      }
      st.particles.push(...embers);
      st.animId = requestAnimationFrame(loop);
    };

    st.animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(st.animId);
      clearTimeout(st.launchTimer);
      window.removeEventListener('resize', handleResize);
      mq.removeEventListener('change', themeHandler);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [isVisible, theme, colorScheme]);

  if (!isVisible) return null;

  const cfg = THEMES[theme] ?? THEMES['new-year'];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0,
      width: '100vw', height: '100vh',
      zIndex: 9999, pointerEvents: 'none',
    }}>
      {/* Canvas fills full visible viewport */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100vw', height: '100vh',
          display: 'block', background: 'transparent',
        }}
      />

      {/* Greeting */}
      <div style={{
        position: 'absolute', top: '10%', left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 'clamp(20px,5.5vw,30px)',
        fontWeight: 800, letterSpacing: '0.04em',
        color: '#FFE870',
        textShadow: '0 0 24px #FFD70099, 0 2px 8px rgba(0,0,0,0.9)',
        whiteSpace: 'nowrap',
        fontFamily: "'Georgia',serif",
        pointerEvents: 'none',
      }}>
        {cfg.label}
      </div>

      {/* ── Creative pulsing stop button ── */}
      <button
        onClick={onComplete}
        style={{
          position: 'absolute',
          bottom: 52,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'all',
          cursor: 'pointer',
          padding: '14px 38px',
          borderRadius: 50,
          background: `linear-gradient(135deg,${cfg.stopGrad[0]},${cfg.stopGrad[1]})`,
          border: `2px solid ${cfg.stopBorder}`,
          color: cfg.stopText,
          fontFamily: "'Georgia',serif",
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
          boxShadow: pulse
            ? `0 0 0 7px ${cfg.stopGlow}44, 0 0 28px ${cfg.stopGlow}88, 0 4px 16px rgba(0,0,0,0.7)`
            : `0 0 0 2px ${cfg.stopBorder}44, 0 0 10px ${cfg.stopGlow}33, 0 4px 12px rgba(0,0,0,0.6)`,
          transition: 'box-shadow 0.7s ease-in-out',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        Shush 🤫 the Sky
      </button>
    </div>
  );
}

export function detectFestiveTheme() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const day   = now.getDate();

  // New Year's Eve
  if (month === 12 && day === 31) return 'nye';
  // New Year's Day
  if (month === 1  && day === 1)  return 'new-year';
  // Christmas
  if (month === 12 && day === 25) return 'christmas';
  // Singapore National Day
  if (month === 8  && day === 9)  return 'national-day';

  // Chinese New Year (verified lunar dates)
  const cnyStr = CNY_DATES[year];
  if (cnyStr) {
    const [cm, cd] = cnyStr.split('-').map(Number);
    if (month === cm && day === cd) return 'cny';
  }

  // Deepavali (Singapore official dates)
  const deeStr = DEEPAVALI_DATES[year];
  if (deeStr) {
    const [dm, dd] = deeStr.split('-').map(Number);
    if (month === dm && day === dd) return 'deepavali';
  }

  return null;
}

export default FestiveFireworks;
