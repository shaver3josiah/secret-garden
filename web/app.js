(function () {
  "use strict";

  const cv = document.getElementById("scene");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, horizonY = 0, T = 0;

  const KEY = "secret-garden-state";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  const store = load();

  const DEFAULT_LOC = { lat: 40.6952, lon: -80.3092, place: "Beaver, PA" };

  const THEMES = {
    "secret-garden": { name: "Secret Garden", foliage: ["#2F5233", "#4E8C4A", "#8FBE86"], bloom: ["#E7A9C0", "#F2C36B", "#EBC7DA"], ambient: "petals", water: true, density: 0.72, warmBias: 0.12 },
    "cottage-border": { name: "Cottage Border", foliage: ["#3A5A2A", "#6D9A3E", "#A9C46E"], bloom: ["#E88AA0", "#EAB94C", "#D98AB0", "#F0E0A0"], ambient: "petals", water: false, density: 0.86, warmBias: 0.34 },
    "wildflower-meadow": { name: "Wildflower Meadow", foliage: ["#4A6B2E", "#7DA43C", "#B7CE77"], bloom: ["#F2C14E", "#E8899B", "#B79CD8", "#F0E68C"], ambient: "pollen", water: false, density: 0.94, warmBias: 0.2 },
    "moonlit-garden": { name: "Moonlit Garden", foliage: ["#2C4A3C", "#4E7E6A", "#8FB6A2"], bloom: ["#CBD6E6", "#DCE4EC", "#B8C9D8"], ambient: "fireflies", water: true, density: 0.6, warmBias: -0.32 },
    "zen-garden": { name: "Zen Garden", foliage: ["#3E5A3A", "#6E8F5E", "#AEC29A"], bloom: ["#D8B26A", "#E6D3A0"], ambient: "none", water: true, density: 0.36, warmBias: -0.08 }
  };
  const PRESET_ORDER = ["secret-garden", "cottage-border", "wildflower-meadow", "moonlit-garden", "zen-garden"];

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    loc: store.loc || Object.assign({}, DEFAULT_LOC),
    themeId: store.themeId || "secret-garden",
    custom: store.custom || [],
    settings: Object.assign({ autoRotate: true, motion: true }, store.settings || {}),
    weather: store.weather || { code: 0, temp: null, cloud: 22, wind: 6, isDay: 1, precip: 0 },
    sun: store.sun || { sunrise: 390, sunset: 1200 },
    aqi: store.aqi != null ? store.aqi : null,
    iss: null,
    mood: "peace",
    verseIdx: 0,
    versePaused: false
  };

  function motionOn() { return state.settings.motion && !prefersReduced; }
  function activeTheme() {
    if (state.themeId.indexOf("custom:") === 0) {
      const id = state.themeId.slice(7);
      return state.custom.find(c => c.id === id) || THEMES["secret-garden"];
    }
    return THEMES[state.themeId] || THEMES["secret-garden"];
  }

  function persist() {
    save({ loc: state.loc, themeId: state.themeId, custom: state.custom, settings: state.settings, weather: state.weather, sun: state.sun, aqi: state.aqi });
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function mix(c1, c2, t) { return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))]; }
  function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function hexToRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function shade(c, f) { return f < 0 ? [Math.round(c[0] * (1 + f)), Math.round(c[1] * (1 + f)), Math.round(c[2] * (1 + f))] : [Math.round(lerp(c[0], 255, f)), Math.round(lerp(c[1], 255, f)), Math.round(lerp(c[2], 255, f))]; }

  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function haversine(la1, lo1, la2, lo2) {
    const R = 6371, r = Math.PI / 180;
    const dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
    const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function minutesOf(iso) { const t = iso.split("T")[1]; const p = t.split(":"); return (+p[0]) * 60 + (+p[1]); }

  function sunAltitude() {
    const m = nowMin(), sr = state.sun.sunrise, ss = state.sun.sunset;
    if (ss <= sr) return 0.5;
    if (m < sr || m > ss) return 0;
    return Math.sin(Math.PI * (m - sr) / (ss - sr));
  }
  function twilight() {
    const m = nowMin(), sr = state.sun.sunrise, ss = state.sun.sunset, win = 58;
    const dr = Math.abs(m - sr), dd = Math.abs(m - ss);
    return clamp(1 - Math.min(dr, dd) / win, 0, 1);
  }
  function dayFrac() { const m = nowMin(), sr = state.sun.sunrise, ss = state.sun.sunset; return clamp((m - sr) / Math.max(1, ss - sr), 0, 1); }
  function nightFrac() {
    const m = nowMin(), sr = state.sun.sunrise, ss = state.sun.sunset;
    const span = (1440 - ss) + sr;
    if (m > ss) return clamp((m - ss) / span, 0, 1);
    if (m < sr) return clamp(((1440 - ss) + m) / span, 0, 1);
    return 0.5;
  }
  function isNight() { return sunAltitude() <= 0.02; }

  function moonPhase() {
    const syn = 29.53058867, ref = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;
    const jd = Date.now() / 86400000;
    let p = ((jd - ref) / syn) % 1; if (p < 0) p += 1; return p;
  }
  function moonName(p) {
    if (p < 0.03 || p > 0.97) return "New moon";
    if (p < 0.22) return "Waxing crescent";
    if (p < 0.28) return "First quarter";
    if (p < 0.47) return "Waxing gibbous";
    if (p < 0.53) return "Full moon";
    if (p < 0.72) return "Waning gibbous";
    if (p < 0.78) return "Last quarter";
    return "Waning crescent";
  }

  let geo = null;
  function buildScene() {
    const th = activeTheme();
    const r = rng(1337 + Math.round(th.density * 1000));
    horizonY = H * 0.6;
    const g = { farRidge: [], midRidge: [], trees: [], bushes: [], grasses: [], flowers: [], pond: null, stars: [], clouds: [] };

    function ridge(base, amp, step, seedShift) {
      const rr = rng(base * 100 + seedShift);
      const pts = []; let y = horizonY - base;
      for (let x = -0.05; x <= 1.06; x += step) {
        y += (rr() - 0.5) * amp;
        y = clamp(y, horizonY - base - amp * 3, horizonY - base + amp * 2);
        pts.push([x * W, y]);
      }
      return pts;
    }
    g.farRidge = ridge(H * 0.16, 14, 0.05, 3);
    g.midRidge = ridge(H * 0.09, 22, 0.04, 9);

    const treeN = Math.round(8 + th.density * 8);
    for (let i = 0; i < treeN; i++) {
      g.trees.push({ x: (i / treeN + (r() - 0.5) * 0.05) * W, w: H * (0.05 + r() * 0.05), h: H * (0.09 + r() * 0.08), ph: r() * 6.28 });
    }

    const bushN = Math.round(6 + th.density * 9);
    for (let i = 0; i < bushN; i++) {
      g.bushes.push({ x: (r()) * W, y: horizonY + (H - horizonY) * (0.12 + r() * 0.34), w: H * (0.09 + r() * 0.11), h: H * (0.05 + r() * 0.06), ph: r() * 6.28, c: r() });
    }
    g.bushes.sort((a, b) => a.y - b.y);

    const grassN = Math.round((70 + th.density * 220) * (Math.min(W, 1200) / 1200));
    for (let i = 0; i < grassN; i++) {
      g.grasses.push({ x: r() * W * 1.02, base: horizonY + (H - horizonY) * (0.4 + r() * 0.62), len: H * (0.05 + r() * 0.14), w: 1 + r() * 2.2, ph: r() * 6.28, lean: (r() - 0.5) * 0.5 });
    }
    g.grasses.sort((a, b) => a.base - b.base);

    const flowerN = Math.round((10 + th.density * 34) * (Math.min(W, 1200) / 1200));
    for (let i = 0; i < flowerN; i++) {
      g.flowers.push({ x: r() * W, base: horizonY + (H - horizonY) * (0.42 + r() * 0.56), h: H * (0.08 + r() * 0.17), ph: r() * 6.28, br: H * (0.012 + r() * 0.016), col: Math.floor(r() * th.bloom.length), petals: 5 + Math.floor(r() * 3), lean: (r() - 0.5) * 0.4 });
    }
    g.flowers.sort((a, b) => a.base - b.base);

    if (th.water) {
      const py = horizonY + (H - horizonY) * 0.3;
      g.pond = { cx: W * (0.5 + (r() - 0.5) * 0.2), cy: py, rx: W * (0.26 + r() * 0.12), ry: (H - horizonY) * 0.12 };
    }

    const starN = 90;
    for (let i = 0; i < starN; i++) g.stars.push({ x: r() * W, y: r() * horizonY * 0.92, r: 0.5 + r() * 1.2, ph: r() * 6.28 });

    geo = g;
    initParticles();
  }

  let rain = [], snow = [], petals = [], pollen = [], flies = [], clouds = [];
  function wxKind() {
    const c = state.weather.code;
    if (c >= 71 && c <= 77 || c === 85 || c === 86) return "snow";
    if (c >= 51 && c <= 67 || c >= 80 && c <= 82 || c >= 95) return "rain";
    if (c === 45 || c === 48) return "fog";
    return "clear";
  }
  function initParticles() {
    const scale = Math.min(W, 1200) / 1200, k = wxKind(), th = activeTheme();
    const heavy = motionOn() ? 1 : 0.25;
    rain = []; snow = []; petals = []; pollen = []; flies = []; clouds = [];
    const cloudN = clamp(Math.round(2 + state.weather.cloud / 16), 2, 9);
    for (let i = 0; i < cloudN; i++) clouds.push({ x: Math.random() * W * 1.2 - W * 0.1, y: Math.random() * horizonY * 0.5, s: 0.6 + Math.random() * 1.1, sp: 0.004 + Math.random() * 0.01, op: 0.35 + Math.random() * 0.4 });
    if (k === "rain") { const n = Math.round((state.weather.code >= 80 || state.weather.code >= 63 ? 240 : 150) * scale * heavy); for (let i = 0; i < n; i++) rain.push({ x: Math.random() * W, y: Math.random() * H, len: 9 + Math.random() * 14, sp: 7 + Math.random() * 6 }); }
    if (k === "snow") { const n = Math.round(130 * scale * heavy); for (let i = 0; i < n; i++) snow.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.4, sp: 0.6 + Math.random() * 1.1, ph: Math.random() * 6.28 }); }
    if (th.ambient === "petals") { const n = Math.round(20 * scale * heavy); for (let i = 0; i < n; i++) petals.push({ x: Math.random() * W, y: Math.random() * H, r: 3 + Math.random() * 4, sp: 0.5 + Math.random() * 0.9, drift: (Math.random() - 0.5) * 0.6, rot: Math.random() * 6.28, rs: (Math.random() - 0.5) * 0.05, col: th.bloom[Math.floor(Math.random() * th.bloom.length)] }); }
    if (th.ambient === "pollen") { const n = Math.round(34 * scale * heavy); for (let i = 0; i < n; i++) pollen.push({ x: Math.random() * W, y: horizonY + Math.random() * (H - horizonY), r: 1 + Math.random() * 2, ph: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.35 }); }
    if (th.ambient === "fireflies") { const n = Math.round(24 * scale * heavy); for (let i = 0; i < n; i++) flies.push({ x: Math.random() * W, y: horizonY * 0.7 + Math.random() * (H - horizonY * 0.7), ph: Math.random() * 6.28, dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3 }); }
  }

  function skyColors() {
    const alt = sunAltitude(), tw = twilight(), th = activeTheme();
    const night = { top: [43, 58, 99], hor: [78, 98, 140] };
    const day = { top: [143, 190, 221], hor: [223, 236, 242] };
    const t = smooth(alt / 0.32);
    let top = mix(night.top, day.top, t);
    let hor = mix(night.hor, day.hor, t);
    const warm = [244, 202, 168];
    hor = mix(hor, warm, tw * 0.72);
    top = mix(top, [128, 128, 178], tw * 0.22);
    const overcast = clamp((state.weather.cloud - 55) / 45, 0, 1) * (alt > 0.05 ? 0.4 : 0.15);
    top = mix(top, [176, 184, 190], overcast);
    hor = mix(hor, [206, 212, 214], overcast);
    if (th.warmBias > 0) hor = mix(hor, [242, 222, 206], th.warmBias * 0.22);
    if (th.warmBias < 0) top = mix(top, [150, 182, 212], -th.warmBias * 0.2);
    return { top: top, hor: hor };
  }

  function drawSky() {
    const s = skyColors();
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, rgb(s.top));
    g.addColorStop(1, rgb(s.hor));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY);
    const alt = sunAltitude();
    const groundNear = mix(hexToRgb("#3b4a2c"), hexToRgb("#7a935f"), smooth(alt / 0.3));
    const groundFar = mix(hexToRgb("#6f8a55"), hexToRgb("#c3d5b0"), smooth(alt / 0.3));
    const gg = ctx.createLinearGradient(0, horizonY, 0, H);
    gg.addColorStop(0, rgb(groundFar));
    gg.addColorStop(1, rgb(groundNear));
    ctx.fillStyle = gg;
    ctx.fillRect(0, horizonY, W, H - horizonY);
  }

  function drawStars() {
    const a = clamp(1 - sunAltitude() * 4.5, 0, 1) * 0.55;
    if (a < 0.02) return;
    for (const st of geo.stars) {
      const tw = motionOn() ? 0.55 + 0.45 * Math.sin(T * 0.002 + st.ph) : 0.8;
      ctx.globalAlpha = a * tw;
      ctx.fillStyle = "#FBFAF2";
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSun(cx, cy, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 3.2);
    g.addColorStop(0, "rgba(255,244,206,0.85)");
    g.addColorStop(0.25, "rgba(250,222,150,0.4)");
    g.addColorStop(1, "rgba(250,222,150,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 3.2, 0, 6.2832); ctx.fill();
    const d = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
    d.addColorStop(0, "#FFF7DC"); d.addColorStop(1, "#F6CD6B");
    ctx.fillStyle = d; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawMoon(cx, cy, r, alpha) {
    const p = moonPhase();
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.6);
    g.addColorStop(0, "rgba(238,238,220,0.45)"); g.addColorStop(1, "rgba(238,238,220,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, 6.2832); ctx.fill();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fillStyle = "rgba(120,132,156,0.5)"; ctx.fill();
    const a = p * 2 * Math.PI, cosA = Math.cos(a);
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, p >= 0.5);
    ctx.ellipse(0, 0, Math.max(0.001, r * Math.abs(cosA)), r, 0, Math.PI / 2, Math.PI * 1.5, cosA <= 0);
    ctx.closePath();
    ctx.fillStyle = "#F7F2E0"; ctx.fill();
    ctx.restore();
  }

  function drawCelestial() {
    const alt = sunAltitude();
    const sunA = clamp(alt / 0.12, 0, 1);
    const moonA = clamp(1 - alt / 0.14, 0, 1) * 0.92;
    if (moonA > 0.02) {
      const nf = nightFrac();
      const mx = W * (0.14 + 0.72 * nf), my = horizonY - Math.sin(Math.PI * nf) * horizonY * 0.7 + 12;
      drawMoon(mx, my, Math.max(16, H * 0.045), moonA);
    }
    if (sunA > 0.02) {
      const df = dayFrac();
      const sx = W * (0.14 + 0.72 * df), sy = horizonY - Math.sin(Math.PI * df) * horizonY * 0.74 + 8;
      drawSun(sx, sy, Math.max(18, H * 0.05), sunA);
    }
  }

  function puff(x, y, s, op) {
    ctx.save();
    ctx.globalAlpha = op;
    for (const o of [[0, 0, 1], [-0.7, 0.15, 0.75], [0.7, 0.15, 0.75], [-0.35, -0.25, 0.7], [0.35, -0.2, 0.7]]) {
      const rr = 26 * s * o[2];
      const g = ctx.createRadialGradient(x + o[0] * 30 * s, y + o[1] * 22 * s, rr * 0.3, x + o[0] * 30 * s, y + o[1] * 22 * s, rr);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(236,240,236,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + o[0] * 30 * s, y + o[1] * 22 * s, rr, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
  function drawClouds() {
    for (const c of clouds) {
      if (motionOn()) { c.x += c.sp * (1 + state.weather.wind / 30); if (c.x - 80 * c.s > W) c.x = -90 * c.s; }
      puff(c.x, c.y + 30, c.s, c.op);
    }
  }

  function ridgePath(pts, colorTop, colorBot) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const xc = (pts[i][0] + pts[i - 1][0]) / 2, yc = (pts[i][1] + pts[i - 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], xc, yc);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, pts[0][1] - 40, 0, H);
    g.addColorStop(0, colorTop); g.addColorStop(1, colorBot);
    ctx.fillStyle = g; ctx.fill();
  }
  function drawRidges() {
    const th = activeTheme(), alt = sunAltitude();
    const hazeK = smooth(alt / 0.3);
    const far = shade(mix(hexToRgb(th.foliage[1]), hexToRgb("#cdd8d0"), 0.55), 0);
    ridgePath(geo.farRidge, rgb(mix(far, [210, 220, 214], 0.4 * (1 - hazeK) + 0.2)), rgb(shade(hexToRgb(th.foliage[0]), 0.15)));
    ridgePath(geo.midRidge, rgb(mix(hexToRgb(th.foliage[1]), [190, 205, 196], 0.28)), rgb(shade(hexToRgb(th.foliage[0]), 0.02)));
  }

  function blob(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.bezierCurveTo(x - w, y - h, x - w * 0.4, y - h * 1.15, x, y - h * 1.05);
    ctx.bezierCurveTo(x + w * 0.4, y - h * 1.15, x + w, y - h, x + w, y);
    ctx.closePath();
    ctx.fill();
  }
  function drawTreeline() {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 3, 0, 1);
    for (const tr of geo.trees) {
      const sx = motionOn() ? Math.sin(T * 0.0004 + tr.ph) * 4 * windAmp() : 0;
      const c = shade(hexToRgb(th.foliage[0]), -0.12 * nf);
      blob(tr.x + sx, horizonY + 4, tr.w, tr.h, rgb(c));
    }
  }

  let archGeo = null;
  function buildArch() {
    const r = rng(4201);
    const top1 = horizonY - 0.30 * H, top2 = horizonY - 0.27 * H, base = horizonY + 0.05 * H;
    const x0 = -0.02 * W, x1 = 0.085 * W, x2 = 0.115 * W, x3 = 0.16 * W;
    const mossSpots = [
      { x: (x0 + x1) / 2, y: base, s: 1 },
      { x: (x2 + x3) / 2, y: base, s: 0.9 },
      { x: (x0 + x1) / 2, y: top1 + 0.05 * H, s: 0.6 },
      { x: (x2 + x3) / 2, y: top2 + 0.05 * H, s: 0.6 }
    ];
    const moss = [];
    for (let i = 0; i < mossSpots.length; i++) {
      const m = mossSpots[i];
      moss.push({ x: m.x + (r() - 0.5) * W * 0.02, y: m.y, w: W * (0.02 + r() * 0.012) * m.s, h: H * (0.014 + r() * 0.008) * m.s, a: 0.5 + r() * 0.2 });
    }
    const ivyN = 16;
    const ivy = [];
    for (let i = 0; i < ivyN; i++) {
      let cx, cy;
      if (i < 7) { cx = lerp(x0, x1, 0.3 + r() * 0.6); cy = lerp(base, top1, i / 7 + r() * 0.08); }
      else if (i < 14) { cx = lerp(x2, x3, 0.3 + r() * 0.6); cy = lerp(base, top2, (i - 7) / 7 + r() * 0.08); }
      else { cx = lerp(x1, x2, r()); cy = lerp(top1, top2, r()) - H * (0.02 + r() * 0.02); }
      ivy.push({ x: cx, y: cy, s: W * (0.008 + r() * 0.006), rot: r() * 6.28, set: r() < 0.5 ? 0 : 1, n: r() < 0.5 ? 2 : 3 });
    }
    const tendN = 5;
    const tendrils = [];
    for (let i = 0; i < tendN; i++) {
      tendrils.push({ x: x2, y: lerp(base, top2, (i + 0.5) / tendN), ph: r() * 6.28, len: W * (0.015 + r() * 0.015) });
    }
    return { x0: x0, x1: x1, x2: x2, x3: x3, top1: top1, top2: top2, base: base, moss: moss, ivy: ivy, tendrils: tendrils, w: W, h: H };
  }

  function drawArch() {
    if (!archGeo || archGeo.w !== W || archGeo.h !== H) archGeo = buildArch();
    const g = archGeo, th = activeTheme();
    const nf = clamp(1 - sunAltitude() * 2.6, 0, 1);
    const wet = wxKind() === "rain";
    const stoneBase = shade(hexToRgb("#B8AF98"), -0.12 * nf - (wet ? 0.06 : 0));
    const stoneShadow = shade(hexToRgb("#6E6552"), -0.1 * nf);
    function pillar(xOuter, xInner, top, taperInner) {
      const grad = ctx.createLinearGradient(xOuter, 0, xInner, 0);
      grad.addColorStop(0, rgb(stoneBase));
      grad.addColorStop(1, rgb(stoneShadow));
      ctx.fillStyle = grad;
      const innerTopX = xInner > xOuter ? xInner - taperInner : xInner + taperInner;
      ctx.beginPath();
      ctx.moveTo(xOuter, top);
      ctx.lineTo(innerTopX, top);
      ctx.lineTo(xInner, g.base);
      ctx.lineTo(xOuter, g.base);
      ctx.closePath();
      ctx.fill();
    }
    pillar(g.x0, g.x1, g.top1, W * 0.012);
    pillar(g.x3, g.x2, g.top2, W * 0.012);
    const ltx = (g.x0 + g.x1) / 2, lty = g.top1, rtx = (g.x2 + g.x3) / 2, rty = g.top2;
    const mcx = (ltx + rtx) / 2, mcy = Math.min(lty, rty) - 0.05 * H;
    const lg = ctx.createLinearGradient(0, mcy, 0, Math.max(lty, rty));
    lg.addColorStop(0, rgb(stoneBase));
    lg.addColorStop(1, rgb(stoneShadow));
    ctx.strokeStyle = lg;
    ctx.lineWidth = H * 0.045;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ltx, lty);
    ctx.quadraticCurveTo(mcx, mcy, rtx, rty);
    ctx.stroke();
    if (wet) {
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const sx = lerp(g.x0, g.x1, i / 4);
        ctx.beginPath();
        ctx.moveTo(sx, g.top1);
        ctx.lineTo(sx + W * 0.01, g.base);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const mossCol = rgb(shade(hexToRgb("#4A5642"), -0.1 * nf));
    for (const m of g.moss) {
      ctx.globalAlpha = m.a;
      blob(m.x, m.y, m.w, m.h, mossCol);
    }
    ctx.globalAlpha = 1;
    for (const iv of g.ivy) {
      const col = shade(hexToRgb(iv.set === 0 ? th.foliage[0] : th.foliage[1]), -0.12 * nf);
      ctx.fillStyle = rgb(col);
      for (let k = 0; k < iv.n; k++) {
        const ang = iv.rot + k * 2.1;
        const ex = iv.x + Math.cos(ang) * iv.s * 0.6;
        const ey = iv.y + Math.sin(ang) * iv.s * 0.6;
        ctx.beginPath();
        ctx.ellipse(ex, ey, iv.s, iv.s * 0.55, ang, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.strokeStyle = rgb(shade(hexToRgb(th.foliage[0]), -0.12 * nf));
    ctx.lineWidth = 1.4;
    for (const t of g.tendrils) {
      const sway = motionOn() ? Math.sin(T * 0.0006 + t.ph) * windAmp() * H * 0.012 : 0;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.bezierCurveTo(t.x - t.len * 0.4, t.y - t.len * 0.3 + sway, t.x - t.len * 0.75, t.y + t.len * 0.2 + sway, t.x - t.len, t.y + t.len * 0.4 + sway);
      ctx.stroke();
    }
  }

  function drawPond() {
    if (!geo.pond) return;
    const p = geo.pond, s = skyColors(), alt = sunAltitude();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, 6.2832);
    ctx.clip();
    const g = ctx.createLinearGradient(0, p.cy - p.ry, 0, p.cy + p.ry);
    g.addColorStop(0, rgb(mix(s.hor, [255, 255, 255], 0.15)));
    g.addColorStop(1, rgb(mix(s.top, [40, 60, 40], 0.25)));
    ctx.fillStyle = g;
    ctx.fillRect(p.cx - p.rx, p.cy - p.ry, p.rx * 2, p.ry * 2);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const yy = p.cy - p.ry + (i + 0.5) / 5 * p.ry * 2;
      const off = motionOn() ? Math.sin(T * 0.0016 + i) * 5 : 0;
      ctx.beginPath();
      ctx.moveTo(p.cx - p.rx, yy);
      ctx.quadraticCurveTo(p.cx + off, yy + 2, p.cx + p.rx, yy);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = rgb(shade(hexToRgb(activeTheme().foliage[0]), 0.1));
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawBushes() {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 2.6, 0, 1);
    for (const b of geo.bushes) {
      const sx = motionOn() ? Math.sin(T * 0.0005 + b.ph) * 3 * windAmp() : 0;
      const base = b.c < 0.5 ? th.foliage[1] : th.foliage[0];
      const c = shade(hexToRgb(base), -0.1 * nf);
      blob(b.x + sx, b.y, b.w, b.h, rgb(c));
      const hl = shade(hexToRgb(th.foliage[2]), -0.15 * nf);
      ctx.globalAlpha = 0.35 * (1 - nf * 0.7);
      blob(b.x + sx - b.w * 0.15, b.y - b.h * 0.15, b.w * 0.7, b.h * 0.75, rgb(hl));
      ctx.globalAlpha = 1;
    }
  }

  function windAmp() { return motionOn() ? clamp(state.weather.wind / 20, 0.2, 1.5) : 0; }

  function drawGrassesFlowers() {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 2.4, 0, 1);
    ctx.lineCap = "round";
    for (const gr of geo.grasses) {
      const sway = (motionOn() ? Math.sin(T * 0.0011 + gr.ph) * gr.len * 0.16 * windAmp() : 0) + gr.lean * gr.len * 0.4;
      const c = shade(hexToRgb(th.foliage[1]), -0.14 * nf);
      ctx.strokeStyle = rgb(c);
      ctx.lineWidth = gr.w;
      ctx.beginPath();
      ctx.moveTo(gr.x, gr.base);
      ctx.quadraticCurveTo(gr.x + sway * 0.5, gr.base - gr.len * 0.6, gr.x + sway, gr.base - gr.len);
      ctx.stroke();
    }
    for (const f of geo.flowers) {
      const sway = (motionOn() ? Math.sin(T * 0.0012 + f.ph) * f.h * 0.14 * windAmp() : 0) + f.lean * f.h * 0.4;
      const tipx = f.x + sway, tipy = f.base - f.h;
      ctx.strokeStyle = rgb(shade(hexToRgb(th.foliage[0]), -0.1 * nf));
      ctx.lineWidth = Math.max(1.4, f.br * 0.35);
      ctx.beginPath();
      ctx.moveTo(f.x, f.base);
      ctx.quadraticCurveTo(f.x + sway * 0.5, f.base - f.h * 0.6, tipx, tipy);
      ctx.stroke();
      const col = shade(hexToRgb(th.bloom[f.col]), -0.25 * nf);
      ctx.fillStyle = rgb(col);
      for (let i = 0; i < f.petals; i++) {
        const ang = (i / f.petals) * 6.2832;
        ctx.beginPath();
        ctx.ellipse(tipx + Math.cos(ang) * f.br, tipy + Math.sin(ang) * f.br, f.br * 0.7, f.br * 0.42, ang, 0, 6.2832);
        ctx.fill();
      }
      ctx.fillStyle = rgb(shade([246, 224, 150], -0.35 * nf));
      ctx.beginPath(); ctx.arc(tipx, tipy, f.br * 0.55, 0, 6.2832); ctx.fill();
    }
  }

  function drawAmbient() {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 3, 0, 1);
    if (th.ambient === "petals") {
      for (const p of petals) {
        if (motionOn()) { p.y += p.sp; p.x += Math.sin(T * 0.001 + p.y * 0.01) * 0.5 + p.drift; p.rot += p.rs; if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; } }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = 0.85;
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (th.ambient === "pollen") {
      for (const p of pollen) {
        if (motionOn()) { p.y -= p.sp; p.x += Math.sin(T * 0.0012 + p.ph) * 0.4; if (p.y < horizonY * 0.4) { p.y = H; p.x = Math.random() * W; } }
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(T * 0.002 + p.ph);
        ctx.fillStyle = "rgba(246,226,150,0.9)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (th.ambient === "fireflies" && nf > 0.25) {
      for (const fl of flies) {
        if (motionOn()) { fl.x += fl.dx; fl.y += fl.dy; if (Math.random() < 0.02) { fl.dx = (Math.random() - 0.5) * 0.5; fl.dy = (Math.random() - 0.5) * 0.5; } if (fl.x < 0 || fl.x > W) fl.dx *= -1; if (fl.y < horizonY * 0.6 || fl.y > H) fl.dy *= -1; }
        const glow = (0.4 + 0.6 * Math.abs(Math.sin(T * 0.003 + fl.ph))) * nf;
        ctx.globalAlpha = glow;
        const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 7);
        g.addColorStop(0, "rgba(250,240,150,1)"); g.addColorStop(1, "rgba(250,240,150,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fl.x, fl.y, 7, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  let wisteriaGeo = null;
  function buildWisteriaSide(edgeX, dir, seed) {
    const r = rng(seed);
    const scale = Math.min(W, 1200) / 1200;
    const n = Math.max(2, Math.round(5 * scale));
    const vine = [];
    let vx = edgeX + dir * W * (0.015 + r() * 0.015), vy = 0;
    for (let i = 0; i < 3; i++) {
      const nx = edgeX + dir * W * (0.02 + r() * 0.06);
      const ny = H * (0.16 + i * 0.025 + r() * 0.015);
      const cx = edgeX + dir * W * (0.01 + r() * 0.04);
      const cy = (vy + ny) / 2;
      vine.push({ x1: vx, y1: vy, cx: cx, cy: cy, x2: nx, y2: ny });
      vx = nx; vy = ny;
    }
    const branches = [];
    const racemes = [];
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const seg = vine[Math.min(vine.length - 1, Math.floor(t * vine.length))];
      const ax = lerp(seg.x1, seg.x2, 0.3 + r() * 0.4);
      const ay = lerp(seg.y1, seg.y2, 0.3 + r() * 0.4);
      const bx = edgeX + dir * W * (0.025 + t * 0.08 + r() * 0.012);
      const by = ay + H * (0.01 + r() * 0.02);
      branches.push({ x1: ax, y1: ay, cx: (ax + bx) / 2, cy: (ay + by) / 2, x2: bx, y2: by });
      const outerness = 1 - t;
      racemes.push({ x: bx, y: by, len: H * (0.05 + outerness * 0.035 + r() * 0.005), ph: r() * 6.28 });
    }
    return { vine: vine, branches: branches, racemes: racemes };
  }
  function buildWisteria() {
    return { left: buildWisteriaSide(0, 1, 5501), right: buildWisteriaSide(W, -1, 6607), w: W, h: H };
  }

  function drawWisteria() {
    if (!wisteriaGeo || wisteriaGeo.w !== W || wisteriaGeo.h !== H) wisteriaGeo = buildWisteria();
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 3, 0, 1), tw = twilight();
    const wet = wxKind() === "rain", snowy = wxKind() === "snow";
    const swayK = (wet ? 0.5 : 1) * 0.4;
    const vineCol = rgb(shade(hexToRgb(th.foliage[0]), -0.12 * nf));
    let base = shade(hexToRgb("#9B87B5"), -0.25 * nf);
    let hi = shade(hexToRgb("#C9BEDD"), -0.25 * nf);
    if (tw > 0) { base = mix(base, hexToRgb("#D8B26A"), tw * 0.15); hi = mix(hi, hexToRgb("#D8B26A"), tw * 0.15); }
    const baseCol = rgb(base), hiCol = rgb(hi);
    for (const side of [wisteriaGeo.left, wisteriaGeo.right]) {
      ctx.strokeStyle = vineCol;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, W * 0.006);
      ctx.beginPath();
      ctx.moveTo(side.vine[0].x1, side.vine[0].y1);
      for (const v of side.vine) ctx.quadraticCurveTo(v.cx, v.cy, v.x2, v.y2);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.8, W * 0.0035);
      for (const b of side.branches) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.quadraticCurveTo(b.cx, b.cy, b.x2, b.y2);
        ctx.stroke();
      }
      const active = motionOn() ? side.racemes : side.racemes.slice(0, Math.max(1, Math.ceil(side.racemes.length / 2)));
      for (const rc of active) {
        const sway = motionOn() ? Math.sin(T * 0.0009 + rc.ph) * windAmp() * swayK * W * 0.02 : 0;
        const droop = wet ? 1.15 : 1;
        const tipx = rc.x + sway, tipy = rc.y + rc.len * droop;
        ctx.fillStyle = baseCol;
        for (let i = 0; i < 5; i++) {
          const pt = (i + 1) / 5;
          const wob = Math.sin(pt * Math.PI) * W * 0.005;
          const px = lerp(rc.x, tipx, pt) + (i % 2 === 0 ? wob : -wob);
          const py = lerp(rc.y, tipy, pt);
          ctx.beginPath();
          ctx.ellipse(px, py, W * 0.006, W * 0.003, pt, 0, 6.2832);
          ctx.fill();
        }
        ctx.fillStyle = hiCol;
        for (let i = 0; i < 2; i++) {
          const pt = 0.14 + i * 0.16;
          const wob = Math.sin(pt * Math.PI) * W * 0.005;
          const px = lerp(rc.x, tipx, pt) + (i % 2 === 0 ? wob : -wob);
          const py = lerp(rc.y, tipy, pt);
          ctx.beginPath();
          ctx.ellipse(px, py, W * 0.005, W * 0.0025, pt, 0, 6.2832);
          ctx.fill();
        }
        if (snowy && motionOn()) {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(rc.x, rc.y);
          ctx.lineTo(tipx, tipy);
          ctx.stroke();
        }
      }
    }
  }

  let lanternGeo = null;
  function buildLanterns() {
    const r = rng(8123);
    const spec = [
      { x: 0.03, group: 0 },
      { x: 0.07, group: 0 },
      { x: 0.12, group: 0 },
      { x: 0.90, group: 1 },
      { x: 0.95, group: 1 }
    ];
    const list = [];
    for (let i = 0; i < spec.length; i++) {
      const s = spec[i];
      const ax = s.x * W;
      const ay = s.group === 0 ? horizonY - 0.28 * H : H * (0.10 + (i - 3) * 0.06);
      const drop = H * (0.05 + r() * 0.03);
      list.push({ ax: ax, ay: ay, drop: drop, ph: r() * 6.28 });
    }
    return { list: list, w: W, h: H };
  }

  function drawLanterns() {
    if (!lanternGeo || lanternGeo.w !== W || lanternGeo.h !== H) lanternGeo = buildLanterns();
    const nf = clamp(1 - sunAltitude() * 3, 0, 1);
    if (nf <= 0.25) return;
    const wet = wxKind() === "rain";
    const fog = wxKind() === "fog";
    let alpha = smooth((nf - 0.25) / 0.75);
    if (wet) alpha *= 0.8;
    if (Math.abs(moonPhase() - 0.5) < 0.05) alpha *= 0.9;
    const swayAmp = windAmp() * (wet ? 1.4 : 1);
    const core = hexToRgb("#F6C878");
    for (const l of lanternGeo.list) {
      const sway = motionOn() ? Math.sin(T * 0.0007 + l.ph) * swayAmp * W * 0.02 : 0;
      const bx = l.ax + sway, by = l.ay + l.drop;
      ctx.strokeStyle = "rgba(108,122,98,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l.ax, l.ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const bw = W * 0.018, bh = H * 0.026;
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, bw * 0.6);
      bg.addColorStop(0, "rgba(" + core[0] + "," + core[1] + "," + core[2] + "," + alpha + ")");
      bg.addColorStop(1, "rgba(" + core[0] + "," + core[1] + "," + core[2] + ",0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = k / 6 * 6.2832 - Math.PI / 2;
        const px = bx + Math.cos(ang) * bw * 0.5;
        const py = by + Math.sin(ang) * bh * 0.5;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#9A7636";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(bx, by + bh * 0.4, bw * 0.32, bh * 0.12, 0, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (motionOn()) {
        const haloR = W * 0.035 * (fog ? 1.3 : 1);
        const hg = ctx.createRadialGradient(bx, by, 0, bx, by, haloR);
        hg.addColorStop(0, "rgba(" + core[0] + "," + core[1] + "," + core[2] + "," + (alpha * 0.5) + ")");
        hg.addColorStop(1, "rgba(" + core[0] + "," + core[1] + "," + core[2] + ",0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(bx, by, haloR, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  function drawWeather() {
    const k = wxKind();
    if (k === "rain") {
      ctx.strokeStyle = "rgba(174,196,214,0.55)"; ctx.lineWidth = 1.2;
      const wx = state.weather.wind / 8;
      for (const d of rain) {
        if (motionOn()) { d.y += d.sp; d.x += wx; if (d.y > H) { d.y = -10; d.x = Math.random() * W; } }
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - wx, d.y + d.len); ctx.stroke();
      }
    } else if (k === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const s of snow) {
        if (motionOn()) { s.y += s.sp; s.x += Math.sin(T * 0.001 + s.ph) * 0.6; if (s.y > H) { s.y = -6; s.x = Math.random() * W; } }
        ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  let flashT = 0;
  function drawFog() {
    const k = wxKind();
    const haze = k === "fog" ? 0.5 : clamp(((state.aqi || 0) - 80) / 120, 0, 0.4);
    if (haze > 0.02) {
      const g = ctx.createLinearGradient(0, horizonY - H * 0.2, 0, H);
      g.addColorStop(0, "rgba(226,230,228,0)");
      g.addColorStop(0.5, "rgba(226,230,228," + (haze * 0.7) + ")");
      g.addColorStop(1, "rgba(214,220,216," + haze + ")");
      ctx.fillStyle = g; ctx.fillRect(0, horizonY - H * 0.2, W, H - horizonY + H * 0.2);
    }
    if (state.weather.code >= 95 && motionOn()) {
      if (Math.random() < 0.004) flashT = 1;
      if (flashT > 0) { ctx.fillStyle = "rgba(255,255,255," + (flashT * 0.35) + ")"; ctx.fillRect(0, 0, W, horizonY); flashT -= 0.08; }
    }
  }

  function daylightWash() {
    const alt = sunAltitude();
    if (alt < 0.05) return;
    const df = dayFrac();
    const sx = W * (0.14 + 0.72 * df);
    const g = ctx.createRadialGradient(sx, horizonY * 0.2, 0, sx, horizonY * 0.2, H * 0.9);
    g.addColorStop(0, "rgba(255,246,214," + (0.1 * smooth(alt / 0.4)) + ")");
    g.addColorStop(1, "rgba(255,246,214,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function frame(ts) {
    T = ts || 0;
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawStars();
    drawCelestial();
    drawClouds();
    drawRidges();
    drawTreeline();
    drawArch();
    daylightWash();
    drawPond();
    drawBushes();
    drawGrassesFlowers();
    drawAmbient();
    drawWisteria();
    drawLanterns();
    drawWeather();
    drawFog();
    requestAnimationFrame(frame);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildScene();
  }

  const el = id => document.getElementById(id);

  function currentMood() {
    const k = wxKind();
    if (k === "rain") return "rain";
    if (k === "snow") return "renewal";
    if (isNight()) { return ["night", "peace", "light", "wonder"][Math.floor(Math.random() * 4)]; }
    if (twilight() > 0.4 && nowMin() < state.sun.sunrise + 90) return "dawn";
    if (sunAltitude() > 0.3) return ["growth", "wonder", "day", "season"][Math.floor(Math.random() * 4)];
    return "peace";
  }
  function pickVerse() {
    const mood = currentMood();
    let pool = VERSES.map((v, i) => ({ v: v, i: i })).filter(o => o.v.moods.indexOf(mood) >= 0 && o.i !== state.verseIdx);
    if (!pool.length) pool = VERSES.map((v, i) => ({ v: v, i: i })).filter(o => o.i !== state.verseIdx);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick.i;
  }
  function renderVerse(idx) {
    const v = VERSES[idx];
    el("verse-text").textContent = "\u201C" + v.text + "\u201D";
    el("verse-ref").textContent = v.ref;
  }
  function showVerse(idx) {
    const box = el("scripture");
    box.classList.add("fading");
    setTimeout(() => { state.verseIdx = idx; renderVerse(idx); box.classList.remove("fading"); }, 500);
  }
  let rotateTimer = null;
  function scheduleRotate() {
    if (rotateTimer) clearInterval(rotateTimer);
    rotateTimer = setInterval(() => { if (state.settings.autoRotate && !state.versePaused) showVerse(pickVerse()); }, 45000);
  }

  function wxLabel(code) {
    if (code === 0) return ["Clear", "\u2600\uFE0F"];
    if (code <= 2) return ["Fair", "\u26C5"];
    if (code === 3) return ["Overcast", "\u2601\uFE0F"];
    if (code === 45 || code === 48) return ["Fog", "\uD83C\uDF2B\uFE0F"];
    if (code >= 51 && code <= 57) return ["Drizzle", "\uD83C\uDF26\uFE0F"];
    if (code >= 61 && code <= 67 || code >= 80 && code <= 82) return ["Rain", "\uD83C\uDF27\uFE0F"];
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return ["Snow", "\u2744\uFE0F"];
    if (code >= 95) return ["Storm", "\u26C8\uFE0F"];
    return ["Sky", "\u2601\uFE0F"];
  }
  function updateConditions() {
    el("cond-place").textContent = state.loc.place;
    const w = wxLabel(state.weather.code);
    el("cond-wx-glyph").textContent = w[1];
    el("cond-wx-text").innerHTML = (state.weather.temp != null ? "<b>" + state.weather.temp + "\u00B0</b> " : "") + w[0];
    const issEl = el("cond-iss");
    if (state.iss) { issEl.style.display = ""; el("cond-iss-text").innerHTML = "ISS <b>" + state.iss.dist.toLocaleString() + " km</b>"; }
    else issEl.style.display = "none";
    const aqiEl = el("cond-aqi");
    if (state.aqi != null) { aqiEl.style.display = ""; el("cond-aqi-text").innerHTML = "Air <b>" + state.aqi + "</b>"; }
    else aqiEl.style.display = "none";
  }

  async function fetchWeather() {
    try {
      const { lat, lon } = state.loc;
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,is_day,precipitation&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1";
      const r = await fetch(url); if (!r.ok) throw 0;
      const j = await r.json(), c = j.current;
      state.weather = { code: c.weather_code, temp: Math.round(c.temperature_2m), cloud: c.cloud_cover, wind: c.wind_speed_10m, isDay: c.is_day, precip: c.precipitation };
      if (j.daily && j.daily.sunrise) state.sun = { sunrise: minutesOf(j.daily.sunrise[0]), sunset: minutesOf(j.daily.sunset[0]) };
      persist(); updateConditions(); initParticles();
    } catch (e) { updateConditions(); }
  }
  async function fetchAqi() {
    try {
      const { lat, lon } = state.loc;
      const url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + lat + "&longitude=" + lon + "&current=us_aqi&timezone=auto";
      const r = await fetch(url); if (!r.ok) return;
      const j = await r.json();
      state.aqi = j.current && j.current.us_aqi != null ? Math.round(j.current.us_aqi) : null;
      persist(); updateConditions();
    } catch (e) {}
  }
  async function fetchIss() {
    try {
      const r = await fetch("https://api.wheretheiss.at/v1/satellites/25544"); if (!r.ok) return;
      const j = await r.json();
      const d = haversine(state.loc.lat, state.loc.lon, j.latitude, j.longitude);
      state.iss = { lat: j.latitude, lon: j.longitude, dist: Math.round(d), near: d < 1600 };
      updateConditions();
    } catch (e) {}
  }
  async function geocode(q) {
    try {
      const url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(q) + "&count=1&language=en&format=json";
      const r = await fetch(url); if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      const g = j.results[0];
      return { lat: +g.latitude.toFixed(4), lon: +g.longitude.toFixed(4), place: g.name + (g.admin1 ? ", " + g.admin1 : "") };
    } catch (e) { return null; }
  }
  function refreshData() { fetchWeather(); fetchAqi(); fetchIss(); }

  let toastTimer = null;
  function toast(msg) {
    const t = el("toast"); t.textContent = msg; t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function buildThemeChips() {
    const wrap = el("theme-chips"); wrap.innerHTML = "";
    const all = PRESET_ORDER.map(id => ({ id: id, name: THEMES[id].name })).concat(state.custom.map(c => ({ id: "custom:" + c.id, name: c.name })));
    for (const t of all) {
      const b = document.createElement("button");
      b.className = "chip" + (t.id === state.themeId ? " active" : "");
      b.textContent = t.name;
      b.onclick = () => setTheme(t.id);
      wrap.appendChild(b);
    }
    const add = document.createElement("button");
    add.className = "chip ghost";
    add.innerHTML = "<span class='plus'>+</span>Create";
    add.onclick = openCreator;
    wrap.appendChild(add);
  }
  function setTheme(id) { state.themeId = id; persist(); buildThemeChips(); buildScene(); }

  const CREATOR = { foliage: 1, bloom: 0, density: 0.7, ambient: "petals", water: true, warmBias: 0 };
  const FOLIAGE_SETS = [["#2F5233", "#4E8C4A", "#8FBE86"], ["#3A5A2A", "#6D9A3E", "#A9C46E"], ["#2C4A3C", "#4E7E6A", "#8FB6A2"], ["#4A6B2E", "#7DA43C", "#B7CE77"], ["#4B5D2E", "#87A24E", "#C2CE8E"]];
  const BLOOM_SETS = [["#E7A9C0", "#F2C36B", "#EBC7DA"], ["#E88AA0", "#EAB94C", "#D98AB0"], ["#F2C14E", "#E8899B", "#B79CD8"], ["#CBD6E6", "#DCE4EC", "#B8C9D8"], ["#D8B26A", "#E6D3A0"]];
  function paintSwatches(container, sets, key) {
    container.innerHTML = "";
    sets.forEach((set, i) => {
      const s = document.createElement("button");
      s.className = "swatch" + (CREATOR[key] === i ? " sel" : "");
      s.style.background = "linear-gradient(135deg," + set[0] + "," + set[1] + "," + (set[2] || set[1]) + ")";
      s.onclick = () => { CREATOR[key] = i; paintSwatches(container, sets, key); previewCreator(); };
      container.appendChild(s);
    });
  }
  function previewCreator() {
    state.themeId = "__preview__";
    THEMES["__preview__"] = { name: "Preview", foliage: FOLIAGE_SETS[CREATOR.foliage], bloom: BLOOM_SETS[CREATOR.bloom], ambient: CREATOR.ambient, water: CREATOR.water, density: CREATOR.density, warmBias: CREATOR.warmBias };
    buildScene();
  }
  function openCreator() {
    paintSwatches(el("foliage-swatches"), FOLIAGE_SETS, "foliage");
    paintSwatches(el("bloom-swatches"), BLOOM_SETS, "bloom");
    el("density-range").value = Math.round(CREATOR.density * 100);
    el("warm-range").value = Math.round((CREATOR.warmBias + 1) * 50);
    document.querySelectorAll("#ambient-seg button").forEach(b => b.classList.toggle("on", b.dataset.v === CREATOR.ambient));
    document.querySelectorAll("#water-seg button").forEach(b => b.classList.toggle("on", (b.dataset.v === "on") === CREATOR.water));
    el("theme-name").value = "";
    openSheet("creator");
    previewCreator();
  }
  function saveCreator() {
    const name = (el("theme-name").value || "").trim() || "My Garden";
    const id = "c" + Date.now().toString(36);
    const th = { id: id, name: name, foliage: FOLIAGE_SETS[CREATOR.foliage], bloom: BLOOM_SETS[CREATOR.bloom], ambient: CREATOR.ambient, water: CREATOR.water, density: CREATOR.density, warmBias: CREATOR.warmBias };
    state.custom.push(th);
    state.themeId = "custom:" + id;
    delete THEMES["__preview__"];
    persist(); buildThemeChips(); buildScene();
    closeSheet(); toast("Saved " + name);
  }

  function openSheet(which) {
    el("sheet-" + which).classList.add("open");
    el("sheet-backdrop").classList.add("open");
  }
  function closeSheet() {
    document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
    el("sheet-backdrop").classList.remove("open");
    if (THEMES["__preview__"] && state.themeId === "__preview__") { state.themeId = store.themeId || "secret-garden"; if (state.themeId === "__preview__") state.themeId = "secret-garden"; delete THEMES["__preview__"]; buildThemeChips(); buildScene(); }
  }

  function openAbout() {
    el("about-moon").textContent = moonName(moonPhase());
    el("about-loc").textContent = state.loc.place;
    el("motion-toggle").classList.toggle("on", state.settings.motion);
    el("rotate-toggle").classList.toggle("on", state.settings.autoRotate);
    openSheet("about");
  }

  function wire() {
    el("verse-next").onclick = () => showVerse(pickVerse());
    const pause = el("verse-pause");
    pause.onclick = () => { state.versePaused = !state.versePaused; pause.setAttribute("aria-pressed", state.versePaused ? "true" : "false"); pause.textContent = state.versePaused ? "\u25B6" : "\u275A\u275A"; };
    el("open-about").onclick = openAbout;
    el("sheet-backdrop").onclick = closeSheet;
    document.querySelectorAll(".sheet-close").forEach(b => b.onclick = closeSheet);
    el("save-theme").onclick = saveCreator;
    el("density-range").oninput = e => { CREATOR.density = +e.target.value / 100; previewCreator(); };
    el("warm-range").oninput = e => { CREATOR.warmBias = +e.target.value / 50 - 1; previewCreator(); };
    document.querySelectorAll("#ambient-seg button").forEach(b => b.onclick = () => { CREATOR.ambient = b.dataset.v; document.querySelectorAll("#ambient-seg button").forEach(x => x.classList.toggle("on", x === b)); previewCreator(); });
    document.querySelectorAll("#water-seg button").forEach(b => b.onclick = () => { CREATOR.water = b.dataset.v === "on"; document.querySelectorAll("#water-seg button").forEach(x => x.classList.toggle("on", x === b)); previewCreator(); });
    el("use-location").onclick = () => {
      if (!navigator.geolocation) { toast("Location not available here"); return; }
      toast("Finding your location");
      navigator.geolocation.getCurrentPosition(
        p => { state.loc = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), place: "Your location" }; persist(); refreshData(); el("about-loc").textContent = state.loc.place; toast("Location set"); },
        () => toast("Location permission denied"),
        { timeout: 9000, maximumAge: 600000 }
      );
    };
    el("city-go").onclick = async () => {
      const q = (el("city-input").value || "").trim(); if (!q) return;
      toast("Searching");
      const g = await geocode(q);
      if (!g) { toast("Place not found"); return; }
      state.loc = g; persist(); refreshData(); el("about-loc").textContent = g.place; el("city-input").value = ""; toast("Set to " + g.place);
    };
    el("city-input").addEventListener("keydown", e => { if (e.key === "Enter") el("city-go").click(); });
    el("motion-toggle").onclick = () => { state.settings.motion = !state.settings.motion; el("motion-toggle").classList.toggle("on", state.settings.motion); persist(); initParticles(); };
    el("rotate-toggle").onclick = () => { state.settings.autoRotate = !state.settings.autoRotate; el("rotate-toggle").classList.toggle("on", state.settings.autoRotate); persist(); };
  }

  function registerSW() {
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  function init() {
    resize();
    window.addEventListener("resize", () => { clearTimeout(window.__rt); window.__rt = setTimeout(resize, 180); });
    buildThemeChips();
    wire();
    renderVerse(state.verseIdx = pickVerse());
    updateConditions();
    refreshData();
    scheduleRotate();
    setInterval(fetchWeather, 600000);
    setInterval(fetchAqi, 900000);
    setInterval(fetchIss, 12000);
    registerSW();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
