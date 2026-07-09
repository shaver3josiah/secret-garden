(function () {
  "use strict";

  const cv = document.getElementById("scene");
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, U = 0, DPR = 1, horizonY = 0, T = 0, lastTs = 0;

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
    customVerses: store.customVerses || [],
    sail: Object.assign({ on: false, stops: [], speed: 5 }, store.sail || {}),
    settings: Object.assign({ autoRotate: true, motion: true, skyMode: "real" }, store.settings || {}),
    weather: store.weather || { code: 0, temp: null, cloud: 22, wind: 6, windDir: 240, isDay: 1, precip: 0 },
    hourly: store.hourly || null,
    sun: store.sun || { sunrise: 390, sunset: 1200 },
    aqi: store.aqi != null ? store.aqi : null,
    iss: null,
    rv: null,
    curVerse: null,
    versePaused: false,
    cycleStart: 0,
    cycleBase: 0,
    boatP: 0.18
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
    save({ loc: state.loc, themeId: state.themeId, custom: state.custom, customVerses: state.customVerses, sail: { on: state.sail.on, stops: state.sail.stops, speed: state.sail.speed }, settings: state.settings, weather: state.weather, hourly: state.hourly, sun: state.sun, aqi: state.aqi });
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

  function realNowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function nowMin() {
    if (state.settings.skyMode === "cycle" && state.cycleStart) {
      return (state.cycleBase + ((Date.now() - state.cycleStart) / 150000) * 1440) % 1440;
    }
    return realNowMin();
  }
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
    const g = { farRidge: [], midRidge: [], trees: [], bushes: [], grasses: [], flowers: [], pond: null, stars: [] };

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
    g.farRidge = ridge(U * 0.2, U * 0.016, 0.05, 3);
    g.midRidge = ridge(U * 0.11, U * 0.024, 0.04, 9);

    const wk = clamp(W / 900, 0.45, 1.6);
    const treeN = clamp(Math.round((7 + th.density * 8) * wk), 5, 18);
    for (let i = 0; i < treeN; i++) {
      g.trees.push({ x: (i / treeN + (r() - 0.5) * 0.05) * W, w: U * (0.05 + r() * 0.05), h: U * (0.1 + r() * 0.08), ph: r() * 6.28 });
    }

    const bushN = clamp(Math.round((5 + th.density * 8) * wk), 4, 16);
    for (let i = 0; i < bushN; i++) {
      g.bushes.push({ x: (r()) * W, y: horizonY + (H - horizonY) * (0.12 + r() * 0.34), w: U * (0.09 + r() * 0.1), h: U * (0.05 + r() * 0.055), ph: r() * 6.28, c: r() });
    }
    g.bushes.sort((a, b) => a.y - b.y);

    const grassN = Math.round((70 + th.density * 220) * wk);
    for (let i = 0; i < grassN; i++) {
      g.grasses.push({ x: r() * W * 1.02, base: horizonY + (H - horizonY) * (0.4 + r() * 0.62), len: U * (0.05 + r() * 0.12), w: 1 + r() * 2.2, ph: r() * 6.28, lean: (r() - 0.5) * 0.5 });
    }
    g.grasses.sort((a, b) => a.base - b.base);

    const flowerN = clamp(Math.round((12 + th.density * 34) * wk), 8, 60);
    for (let i = 0; i < flowerN; i++) {
      g.flowers.push({ x: r() * W, base: horizonY + (H - horizonY) * (0.42 + r() * 0.56), h: U * (0.08 + r() * 0.15), ph: r() * 6.28, br: U * (0.012 + r() * 0.014), col: Math.floor(r() * th.bloom.length), petals: 5 + Math.floor(r() * 3), lean: (r() - 0.5) * 0.4 });
    }
    g.flowers.sort((a, b) => a.base - b.base);

    if (th.water) {
      const py = horizonY + (H - horizonY) * 0.3;
      g.pond = { cx: W * (0.5 + (r() - 0.5) * 0.2), cy: py, rx: Math.min(W * 0.3, U * 0.36), ry: (H - horizonY) * 0.12 };
    }

    const starN = clamp(Math.round(90 * wk), 55, 140);
    for (let i = 0; i < starN; i++) g.stars.push({ x: r() * W, y: r() * horizonY * 0.92, r: 0.5 + r() * 1.2, ph: r() * 6.28 });

    geo = g;
    initParticles();
    layoutVerse();
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
    const scale = clamp(W / 1100, 0.4, 1.2), k = wxKind(), th = activeTheme();
    const heavy = motionOn() ? 1 : 0.25;
    rain = []; snow = []; petals = []; pollen = []; flies = []; clouds = [];
    const cloudN = clamp(Math.round(2 + state.weather.cloud / 16), 2, 9);
    for (let i = 0; i < cloudN; i++) clouds.push({ x: Math.random() * W * 1.2 - W * 0.1, y: (0.08 + Math.random() * 0.45) * horizonY, s: (0.6 + Math.random() * 1.1) * clamp(U / 700, 0.55, 1.25), sp: 0.004 + Math.random() * 0.01, op: 0.35 + Math.random() * 0.4 });
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
  }

  function drawGround() {
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

  function celestialX(frac) { return W * (0.14 + 0.72 * frac); }

  function drawCelestial() {
    const alt = sunAltitude();
    const sunA = clamp(alt / 0.12, 0, 1);
    const moonA = clamp(1 - alt / 0.14, 0, 1) * 0.92;
    if (moonA > 0.02) {
      const nf = nightFrac();
      const mx = celestialX(nf), my = horizonY - Math.sin(Math.PI * nf) * horizonY * 0.7 + 12;
      drawMoon(mx, my, Math.max(14, U * 0.05), moonA);
    }
    if (sunA > 0.02) {
      const df = dayFrac();
      const sx = celestialX(df), sy = horizonY - Math.sin(Math.PI * df) * horizonY * 0.74 + 8;
      drawSun(sx, sy, Math.max(16, U * 0.055), sunA);
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
  function drawTreeline(bankOnly) {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 3, 0, 1);
    for (const tr of geo.trees) {
      if (bankOnly && tr.x > W * 0.2 && tr.x < W * 0.8) continue;
      const sx = motionOn() ? Math.sin(T * 0.0004 + tr.ph) * 4 * windAmp() : 0;
      const c = shade(hexToRgb(th.foliage[0]), -0.12 * nf);
      blob(tr.x + sx, horizonY + 4, tr.w, tr.h, rgb(c));
    }
  }

  function drawPond() {
    if (!geo.pond) return;
    const p = geo.pond, s = skyColors();
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

  function drawWater() {
    const s = skyColors(), alt = sunAltitude();
    const nightK = clamp(1 - alt * 3, 0, 1);
    const top = mix(mix(s.hor, [110, 138, 148], 0.42), [56, 74, 96], nightK * 0.5);
    const bot = mix([44, 66, 70], [22, 32, 44], nightK * 0.7);
    const g = ctx.createLinearGradient(0, horizonY, 0, H);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    const frac = isNight() ? nightFrac() : dayFrac();
    const gx = celestialX(frac);
    const glow = isNight() ? "rgba(244,240,214," : "rgba(255,242,200,";
    const ga = isNight() ? 0.16 : 0.13 * clamp(alt / 0.25, 0, 1) + twilight() * 0.14;
    if (ga > 0.02) {
      const gl = ctx.createRadialGradient(gx, horizonY + (H - horizonY) * 0.32, 0, gx, horizonY + (H - horizonY) * 0.32, (H - horizonY) * 0.85);
      gl.addColorStop(0, glow + ga + ")");
      gl.addColorStop(1, glow + "0)");
      ctx.fillStyle = gl;
      ctx.fillRect(gx - U * 0.3, horizonY, U * 0.6, H - horizonY);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const yy = horizonY + (i + 0.6) / 10.5 * (H - horizonY);
      const off = motionOn() ? Math.sin(T * 0.0012 + i * 1.7) * (6 + i) : 0;
      ctx.globalAlpha = 0.32 - i * 0.02;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(W * 0.5 + off, yy + 2, W, yy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBanks() {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 2.6, 0, 1);
    const deep = shade(hexToRgb(th.foliage[0]), -0.18 - 0.14 * nf);
    const mid = shade(hexToRgb(th.foliage[1]), -0.08 - 0.12 * nf);
    const gL = ctx.createLinearGradient(0, horizonY, 0, H);
    gL.addColorStop(0, rgb(mid)); gL.addColorStop(1, rgb(deep));
    ctx.fillStyle = gL;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + 1);
    ctx.lineTo(W * 0.2, horizonY + 1);
    ctx.quadraticCurveTo(W * 0.12, H * 0.75, W * 0.07, H);
    ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, horizonY + 1);
    ctx.lineTo(W * 0.8, horizonY + 1);
    ctx.quadraticCurveTo(W * 0.88, H * 0.75, W * 0.93, H);
    ctx.lineTo(W, H);
    ctx.closePath(); ctx.fill();
    for (const b of geo.bushes) {
      const onLeft = b.x < W * 0.2, onRight = b.x > W * 0.8;
      if (!onLeft && !onRight) continue;
      const c = shade(hexToRgb(th.foliage[b.c < 0.5 ? 1 : 0]), -0.14 * nf);
      blob(b.x, b.y, b.w * 0.8, b.h * 0.8, rgb(c));
    }
  }

  function drawBoat() {
    if (motionOn() && !document.hidden) state.boatP = (state.boatP + (T - lastTs) * (0.9 + windAmp() * 0.5) / 90000) % 1;
    const bx = W * (-0.14 + 1.28 * state.boatP);
    const L = U * 0.16;
    const bob = motionOn() ? Math.sin(T * 0.0014) * U * 0.006 : 0;
    const by = horizonY + (H - horizonY) * 0.24 + bob;
    const heel = (motionOn() ? Math.sin(T * 0.0008) * 0.028 : 0) + windAmp() * 0.045;
    const nightK = clamp(1 - sunAltitude() * 3, 0, 1);
    const sailC = mix([247, 243, 232], [214, 218, 228], nightK);
    const hullC = mix([62, 47, 35], [34, 30, 34], nightK * 0.6);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#0d1620";
    ctx.beginPath(); ctx.ellipse(bx, by + L * 0.16, L * 0.62, L * 0.09, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(bx - L * 0.6, by + L * 0.12); ctx.quadraticCurveTo(bx - L * 1.5, by + L * 0.2, bx - L * 2.3, by + L * 0.14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - L * 0.55, by + L * 0.2); ctx.quadraticCurveTo(bx - L * 1.3, by + L * 0.3, bx - L * 1.9, by + L * 0.26); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.translate(bx, by);
    ctx.rotate(heel);
    ctx.fillStyle = rgb(hullC);
    ctx.beginPath();
    ctx.moveTo(-L * 0.62, 0);
    ctx.quadraticCurveTo(-L * 0.5, L * 0.22, 0, L * 0.24);
    ctx.quadraticCurveTo(L * 0.52, L * 0.2, L * 0.66, -L * 0.02);
    ctx.lineTo(-L * 0.62, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(216,178,106,0.85)";
    ctx.lineWidth = Math.max(1.2, L * 0.03);
    ctx.beginPath(); ctx.moveTo(-L * 0.6, L * 0.015); ctx.lineTo(L * 0.62, -L * 0.005); ctx.stroke();
    ctx.strokeStyle = rgb(mix([61, 75, 54], [30, 36, 40], nightK * 0.5));
    ctx.lineWidth = Math.max(1.6, L * 0.035);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * 1.18); ctx.stroke();
    ctx.fillStyle = "rgba(" + sailC[0] + "," + sailC[1] + "," + sailC[2] + ",0.96)";
    ctx.beginPath();
    ctx.moveTo(-L * 0.02, -L * 1.12);
    ctx.quadraticCurveTo(-L * 0.5, -L * 0.7, -L * 0.56, -L * 0.16);
    ctx.lineTo(-L * 0.02, -L * 0.16);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(L * 0.02, -L * 1.04);
    ctx.quadraticCurveTo(L * 0.42, -L * 0.62, L * 0.58, -L * 0.1);
    ctx.lineTo(L * 0.05, -L * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#B4894D";
    ctx.beginPath();
    ctx.moveTo(0, -L * 1.18);
    ctx.lineTo(L * 0.14, -L * 1.13);
    ctx.lineTo(0, -L * 1.08);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawAmbient() {
    const th = activeTheme(), nf = clamp(1 - sunAltitude() * 3, 0, 1);
    if (state.sail.on) {
      if (th.ambient === "fireflies" && nf > 0.25) {
        for (const fl of flies) {
          if (fl.x > W * 0.24 && fl.x < W * 0.76) continue;
          const glow = (0.4 + 0.6 * Math.abs(Math.sin(T * 0.003 + fl.ph))) * nf;
          ctx.globalAlpha = glow;
          const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 7);
          g.addColorStop(0, "rgba(250,240,150,1)"); g.addColorStop(1, "rgba(250,240,150,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fl.x, fl.y, 7, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      return;
    }
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
    const sx = celestialX(df);
    const g = ctx.createRadialGradient(sx, horizonY * 0.2, 0, sx, horizonY * 0.2, H * 0.9);
    g.addColorStop(0, "rgba(255,246,214," + (0.1 * smooth(alt / 0.4)) + ")");
    g.addColorStop(1, "rgba(255,246,214,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  const sky = { lines: [], ref: "", fs: 24, lh: 32, tw: 0, prog: 0, y: 160 };
  function verseFont(px) { return "italic 500 " + px + "px 'Playfair Display', Georgia, serif"; }
  function layoutVerse() {
    if (!state.curVerse) return;
    const v = state.curVerse;
    sky.fs = clamp(Math.round(U * 0.052), 17, 34);
    sky.lh = Math.round(sky.fs * 1.38);
    const maxW = Math.min(W * 0.84, 640);
    ctx.save();
    ctx.font = verseFont(sky.fs);
    const words = ("“" + v.text + "”").split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    sky.lines = lines;
    sky.ref = v.ref;
    sky.tw = 0;
    for (const l of lines) sky.tw = Math.max(sky.tw, ctx.measureText(l).width);
    ctx.restore();
    const block = lines.length * sky.lh + sky.fs;
    sky.y = clamp(horizonY * 0.4, 120, Math.max(130, horizonY - block * 0.5 - U * 0.06));
  }
  function driftActive() { return state.settings.autoRotate && motionOn(); }
  function drawSkyVerse() {
    if (!state.curVerse || !sky.lines.length) return;
    const dt = clamp(T - lastTs, 0, 80);
    if (driftActive() && !state.versePaused && !document.hidden) {
      sky.prog += dt / 42000;
      if (sky.prog >= 1) { setVerse(pickVerse()); sky.prog = 0; return; }
    }
    if (!driftActive()) sky.prog = 0.5;
    const p = sky.prog;
    const cxp = (W + sky.tw) * (1 - p) - sky.tw / 2;
    const bob = motionOn() ? Math.sin(T * 0.0006) * U * 0.012 : 0;
    const yTop = sky.y + bob;
    const a = clamp(Math.min(p / 0.1, (1 - p) / 0.1, 1), 0, 1);
    if (a <= 0.01) return;
    const alt = sunAltitude();
    const nightMode = alt <= 0.09;
    const s = sky.fs / 22;
    puff(cxp - sky.tw * 0.28, yTop + sky.lh * (sky.lines.length - 1) * 0.5, s * 1.7, 0.13 * a);
    puff(cxp + sky.tw * 0.3, yTop + sky.lh * 0.3, s * 1.4, 0.11 * a);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = verseFont(sky.fs);
    ctx.shadowColor = nightMode ? "rgba(8,14,26,0.75)" : "rgba(255,255,255,0.9)";
    ctx.shadowBlur = sky.fs * 0.55;
    ctx.fillStyle = nightMode ? "#F5EFDC" : "#243420";
    for (let i = 0; i < sky.lines.length; i++) {
      ctx.fillText(sky.lines[i], cxp, yTop + i * sky.lh);
    }
    ctx.shadowBlur = sky.fs * 0.3;
    ctx.font = "600 " + Math.max(11, Math.round(sky.fs * 0.44)) + "px 'DM Sans', sans-serif";
    ctx.fillStyle = nightMode ? "#D8B26A" : "#9A7636";
    ctx.fillText(sky.ref.toUpperCase(), cxp, yTop + (sky.lines.length - 1) * sky.lh + sky.fs * 1.25);
    ctx.restore();
  }

  function frame(ts) {
    lastTs = T;
    T = ts || 0;
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawStars();
    drawCelestial();
    drawClouds();
    if (state.sail.on) {
      drawRidges();
      drawWater();
      drawBanks();
      drawTreeline(true);
      daylightWash();
      drawBoat();
    } else {
      drawGround();
      drawRidges();
      drawTreeline(false);
      daylightWash();
      drawPond();
      drawBushes();
      drawGrassesFlowers();
    }
    drawSkyVerse();
    drawAmbient();
    drawWeather();
    drawFog();
    requestAnimationFrame(frame);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    U = Math.min(W, H);
    horizonY = H * (H > W ? 0.52 : 0.6);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildScene();
  }

  const el = id => document.getElementById(id);

  function allVerses() { return VERSES.concat(state.customVerses); }
  function currentMood() {
    const c = state.weather.code, k = wxKind();
    if (c >= 95) return "storm";
    if (k === "rain") return "rain";
    if (k === "snow") return "snow";
    if (state.sail.on && Math.random() < 0.6) return ["sea", "sailing", "journey", "water"][Math.floor(Math.random() * 4)];
    if (state.weather.wind >= 16) return "wind";
    const m = nowMin(), sr = state.sun.sunrise, ss = state.sun.sunset;
    if (m >= sr - 40 && m <= sr + 75) return "dawn";
    if (m >= ss - 75 && m <= ss + 40) return "dusk";
    if (isNight()) return ["night", "stars", "peace", "light"][Math.floor(Math.random() * 4)];
    if (sunAltitude() > 0.3) return ["day", "growth", "wonder", "season"][Math.floor(Math.random() * 4)];
    return "peace";
  }
  function pickVerse() {
    const cur = state.curVerse;
    const hers = state.customVerses.filter(v => !cur || v.text !== cur.text);
    if (hers.length && Math.random() < 0.35) return hers[Math.floor(Math.random() * hers.length)];
    const mood = currentMood();
    let pool = VERSES.filter(v => v.moods.indexOf(mood) >= 0 && (!cur || v.ref !== cur.ref));
    if (!pool.length) pool = allVerses().filter(v => !cur || v.text !== cur.text);
    if (!pool.length) pool = allVerses();
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function setVerse(v) {
    state.curVerse = v;
    el("verse-live").textContent = v.text + " " + v.ref;
    layoutVerse();
    sky.prog = 0;
  }

  function wxLabel(code) {
    if (code === 0) return ["Clear", "☀️"];
    if (code <= 2) return ["Fair", "⛅"];
    if (code === 3) return ["Overcast", "☁️"];
    if (code === 45 || code === 48) return ["Fog", "🌫️"];
    if (code >= 51 && code <= 57) return ["Drizzle", "🌦️"];
    if (code >= 61 && code <= 67 || code >= 80 && code <= 82) return ["Rain", "🌧️"];
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return ["Snow", "❄️"];
    if (code >= 95) return ["Storm", "⛈️"];
    return ["Sky", "☁️"];
  }
  function updateConditions() {
    el("cond-place").textContent = state.loc.place;
    const w = wxLabel(state.weather.code);
    el("cond-wx-glyph").textContent = w[1];
    el("cond-wx-text").innerHTML = (state.weather.temp != null ? "<b>" + state.weather.temp + "°</b> " : "") + w[0];
    el("temp-link").href = "https://www.google.com/search?q=" + encodeURIComponent("weather " + state.loc.place);
    const issEl = el("cond-iss");
    if (state.iss) { issEl.style.display = ""; el("cond-iss-text").innerHTML = "ISS <b>" + state.iss.dist.toLocaleString() + " km</b>"; }
    else issEl.style.display = "none";
    const aqiEl = el("cond-aqi");
    if (state.aqi != null) { aqiEl.style.display = ""; el("cond-aqi-text").innerHTML = "Air <b>" + state.aqi + "</b>"; }
    else aqiEl.style.display = "none";
    updateHoursBar();
  }
  function updateHoursBar() {
    const h = state.hourly;
    if (!h || !h.t.length) return;
    el("hb-rain").textContent = h.pp[0] + "%";
    el("hb-wind").textContent = Math.round(h.ws[0]) + " mph";
    el("hb-cloud").textContent = h.cc[0] + "%";
  }

  async function fetchWeather() {
    try {
      const { lat, lon } = state.loc;
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day,precipitation&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=2";
      const r = await fetch(url); if (!r.ok) throw 0;
      const j = await r.json(), c = j.current;
      state.weather = { code: c.weather_code, temp: Math.round(c.temperature_2m), cloud: c.cloud_cover, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, isDay: c.is_day, precip: c.precipitation };
      if (j.daily && j.daily.sunrise) state.sun = { sunrise: minutesOf(j.daily.sunrise[0]), sunset: minutesOf(j.daily.sunset[0]) };
      if (j.hourly && j.hourly.time) {
        const hh = j.hourly;
        let i0 = hh.time.indexOf(c.time.slice(0, 13) + ":00");
        if (i0 < 0) i0 = 0;
        const take = (arr) => arr.slice(i0, i0 + 24);
        state.hourly = { t: take(hh.time), tp: take(hh.temperature_2m), pp: take(hh.precipitation_probability), pr: take(hh.precipitation), code: take(hh.weather_code), cc: take(hh.cloud_cover), ws: take(hh.wind_speed_10m), wd: take(hh.wind_direction_10m), wg: take(hh.wind_gusts_10m) };
      }
      persist(); updateConditions(); initParticles(); renderHours();
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
  async function fetchRadar() {
    try {
      const r = await fetch("https://api.rainviewer.com/public/weather-maps.json"); if (!r.ok) return;
      const j = await r.json();
      if (j.radar && j.radar.past && j.radar.past.length) {
        state.rv = { host: j.host, path: j.radar.past[j.radar.past.length - 1].path };
        updateSat();
      }
    } catch (e) {}
  }
  async function geocode(q) {
    try {
      const parts = q.split(",").map(s => s.trim()).filter(Boolean);
      const name = parts[0], region = (parts[1] || "").toUpperCase();
      const url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=10&language=en&format=json";
      const r = await fetch(url); if (!r.ok) return null;
      const j = await r.json();
      if (!j.results || !j.results.length) return null;
      let g = j.results[0];
      if (region) {
        const hit = j.results.find(x => {
          const a1 = (x.admin1 || "").toUpperCase();
          const initials = a1.split(" ").map(w => w[0] || "").join("");
          return a1 === region || a1.startsWith(region) || initials === region;
        });
        if (hit) g = hit;
      }
      return { lat: +g.latitude.toFixed(4), lon: +g.longitude.toFixed(4), place: g.name + (g.admin1 ? ", " + g.admin1 : "") };
    } catch (e) { return null; }
  }
  function refreshData() { fetchWeather(); fetchAqi(); fetchIss(); fetchRadar(); }

  function tileXY(lat, lon, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lon + 180) / 360 * n);
    const rad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
    return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
  }
  function gibsTime(hoursBack) {
    const d = new Date(Date.now() - 25 * 60000 - hoursBack * 3600000);
    if (hoursBack > 0) d.setUTCMinutes(0, 0, 0);
    else d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0);
    return d.toISOString().slice(0, 19) + "Z";
  }
  let satFellBack = false;
  function updateSat() {
    const z = 6, t = tileXY(state.loc.lat, state.loc.lon, z);
    const hb = -(+el("sat-scrub").value);
    const time = gibsTime(hb);
    satFellBack = false;
    el("sat-img").src = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/" + time + "/GoogleMapsCompatible_Level7/" + z + "/" + t.y + "/" + t.x + ".png";
    el("sat-time").textContent = hb === 0 ? "Latest view" : hb + "h ago";
    if (state.rv) el("sat-radar").src = state.rv.host + state.rv.path + "/256/" + z + "/" + t.x + "/" + t.y + "/2/1_1.png";
  }
  function satError() {
    if (satFellBack) return;
    satFellBack = true;
    const z = 6, t = tileXY(state.loc.lat, state.loc.lon, z);
    el("sat-img").src = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level7/" + z + "/" + t.y + "/" + t.x + ".png";
  }

  function hourLabel(t, i) { return i === 0 ? "Now" : t.slice(11, 16); }
  function renderHours() {
    const h = state.hourly;
    if (!h || !h.t.length) return;
    const rainEl = el("hours-rain"), windEl = el("hours-wind"), cloudEl = el("hours-cloud");
    let rh = "", wh = "", ch = "";
    const n = Math.min(12, h.t.length);
    for (let i = 0; i < n; i++) {
      rh += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar'><i style='width:" + clamp(h.pp[i], 2, 100) + "%'></i></span><span class='hval'>" + h.pp[i] + "% <small>" + (+h.pr[i]).toFixed(2) + " in</small></span></div>";
      wh += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar wind'><i style='width:" + clamp(h.ws[i] / 32 * 100, 3, 100) + "%'></i></span><span class='hval'><span class='harrow' style='transform:rotate(" + ((h.wd[i] + 180) % 360) + "deg)'>&#8593;</span> " + Math.round(h.ws[i]) + " <small>g " + Math.round(h.wg[i]) + " mph</small></span></div>";
    }
    for (let i = 0; i < Math.min(8, h.t.length); i++) {
      ch += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar cloud'><i style='width:" + clamp(h.cc[i], 2, 100) + "%'></i></span><span class='hval'>" + h.cc[i] + "% <small>" + Math.round(h.tp[i]) + "°</small></span></div>";
    }
    rainEl.innerHTML = rh;
    windEl.innerHTML = wh;
    cloudEl.innerHTML = ch;
    updateHoursBar();
  }

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
    document.querySelectorAll("#skymode-seg button").forEach(b => b.classList.toggle("on", b.dataset.v === state.settings.skyMode));
    openSheet("about");
  }

  function renderCvList() {
    const wrap = el("cv-list");
    if (!state.customVerses.length) { wrap.innerHTML = "<p class='empty-note'>Nothing saved yet. Anything you add will drift through the sky with the scriptures.</p>"; return; }
    wrap.innerHTML = "";
    state.customVerses.forEach((v, i) => {
      const row = document.createElement("div");
      row.className = "cv-row";
      const main = document.createElement("div");
      main.className = "cv-main";
      const p = document.createElement("p");
      p.textContent = "“" + v.text + "”";
      const s = document.createElement("small");
      s.textContent = v.ref;
      main.appendChild(p); main.appendChild(s);
      const del = document.createElement("button");
      del.className = "del";
      del.setAttribute("aria-label", "Remove");
      del.textContent = "×";
      del.onclick = () => { state.customVerses.splice(i, 1); persist(); renderCvList(); };
      row.appendChild(main); row.appendChild(del);
      wrap.appendChild(row);
    });
  }
  function saveCustomVerse() {
    const text = (el("cv-text").value || "").trim().replace(/^["“]+|["”]+$/g, "");
    if (!text) { toast("Write something first"); return; }
    const ref = (el("cv-ref").value || "").trim() || "Hers";
    const v = { text: text, ref: ref, moods: ["hers"] };
    state.customVerses.push(v);
    persist(); renderCvList();
    el("cv-text").value = ""; el("cv-ref").value = "";
    setVerse(v);
    toast("Added to the sky");
  }

  function nm(km) { return km * 0.539957; }
  function bearingDeg(la1, lo1, la2, lo2) {
    const r = Math.PI / 180;
    const y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
    const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function compassPt(d) { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8]; }
  function fmtDur(hours) {
    const total = Math.round(hours * 60);
    const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + (m < 10 ? "0" : "") + m + "m";
    return m + "m";
  }
  let openStopId = null;
  async function fetchStopWx(stop) {
    try {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + stop.lat + "&longitude=" + stop.lon + "&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2";
      const r = await fetch(url); if (!r.ok) return;
      const j = await r.json();
      stop.temp = Math.round(j.current.temperature_2m);
      stop.wind = Math.round(j.current.wind_speed_10m);
      stop.code = j.current.weather_code;
      if (j.hourly && j.hourly.time) {
        let i0 = j.hourly.time.indexOf(j.current.time.slice(0, 13) + ":00");
        if (i0 < 0) i0 = 0;
        const take = (a) => a.slice(i0, i0 + 12);
        stop.hourly = { t: take(j.hourly.time), tp: take(j.hourly.temperature_2m), ws: take(j.hourly.wind_speed_10m), wg: take(j.hourly.wind_gusts_10m), pp: take(j.hourly.precipitation_probability) };
      }
      stop.fetchedAt = Date.now();
      persist(); renderRoute();
    } catch (e) {}
  }
  function drawStopChart(c, stop) {
    const h = stop.hourly; if (!h || !h.t.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth || 300, chh = 132;
    c.width = Math.round(cw * dpr); c.height = Math.round(chh * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, chh);
    const padL = 30, padR = 10, padT = 16, windH = 38, gap = 14;
    const plotW = cw - padL - padR, tempH = chh - padT - windH - gap - 16;
    const n = h.t.length;
    const xs = (i) => padL + (n === 1 ? 0 : i / (n - 1) * plotW);
    let tMin = Math.min.apply(null, h.tp), tMax = Math.max.apply(null, h.tp);
    if (tMax - tMin < 4) { tMax += 2; tMin -= 2; }
    const ty = (v) => padT + (1 - (v - tMin) / (tMax - tMin)) * tempH;
    const wMax = Math.max(10, Math.max.apply(null, h.wg));
    const wTop = padT + tempH + gap, wBase = wTop + windH;
    g.font = "600 9px 'DM Sans', sans-serif";
    g.fillStyle = "#6C7A62";
    g.textAlign = "center";
    for (let i = 0; i < n; i += 3) g.fillText(i === 0 ? "now" : h.t[i].slice(11, 13), xs(i), chh - 4);
    g.strokeStyle = "rgba(40,60,30,0.12)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, wBase); g.lineTo(cw - padR, wBase); g.stroke();
    for (let i = 0; i < n; i++) {
      const bw = Math.max(4, plotW / n * 0.5);
      const bh = clamp(h.ws[i] / wMax, 0.04, 1) * windH;
      g.fillStyle = "rgba(78,114,134,0.78)";
      g.fillRect(xs(i) - bw / 2, wBase - bh, bw, bh);
      const gh = clamp(h.wg[i] / wMax, 0, 1) * windH;
      g.strokeStyle = "rgba(78,114,134,0.45)";
      g.beginPath(); g.moveTo(xs(i) - bw / 2, wBase - gh); g.lineTo(xs(i) + bw / 2, wBase - gh); g.stroke();
    }
    g.strokeStyle = "#B4894D";
    g.lineWidth = 2;
    g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) { const x = xs(i), y = ty(h.tp[i]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.fillStyle = "#B4894D";
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(xs(i), ty(h.tp[i]), 2.2, 0, 6.2832); g.fill(); }
    g.textAlign = "left";
    g.fillStyle = "#3D4B36";
    g.font = "700 10px 'DM Sans', sans-serif";
    g.fillText(Math.round(tMax) + "°", 3, ty(tMax) + 4);
    g.fillText(Math.round(tMin) + "°", 3, ty(tMin) + 4);
    g.fillStyle = "#4E7286";
    g.font = "600 9px 'DM Sans', sans-serif";
    g.fillText("wind mph, tick is gust", padL + 2, wTop + 2);
  }
  function renderRoute() {
    const wrap = el("stop-list");
    const stops = state.sail.stops;
    const kn = state.sail.speed || 5;
    document.querySelectorAll("#speed-seg button").forEach(b => b.classList.toggle("on", +b.dataset.v === kn));
    if (!stops.length) { wrap.innerHTML = "<p class='empty-note'>Add harbors and towns along her way. Each stop carries its own hourly temperature and wind chart, plus course and sail time for every leg.</p>"; el("route-total").textContent = ""; return; }
    wrap.innerHTML = "";
    let total = 0;
    const curIdx = stops.findIndex(s => s.name === state.loc.place);
    let legA = null, legB = null;
    if (curIdx >= 0 && curIdx < stops.length - 1) { legA = stops[curIdx]; legB = stops[curIdx + 1]; }
    else if (curIdx < 0 && stops.length > 1) { legA = stops[0]; legB = stops[1]; }
    if (legA && legB) {
      const d = nm(haversine(legA.lat, legA.lon, legB.lat, legB.lon));
      const brg = bearingDeg(legA.lat, legA.lon, legB.lat, legB.lon);
      const nl = document.createElement("div");
      nl.className = "nextleg";
      nl.innerHTML = "Next leg <b>" + legA.name.split(",")[0] + " to " + legB.name.split(",")[0] + "</b> · " + d.toFixed(1) + " nm · course " + Math.round(brg) + "° " + compassPt(brg) + " · about <b>" + fmtDur(d / kn) + "</b> at " + kn + " kn" + (legB.temp != null ? " · " + legB.temp + "° and " + legB.wind + " mph waiting there" : "");
      wrap.appendChild(nl);
    }
    stops.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "stop-row";
      const mv = document.createElement("div");
      mv.className = "mvcol";
      const up = document.createElement("button"); up.className = "mv"; up.textContent = "▴"; up.disabled = i === 0;
      up.onclick = () => { const t = stops[i - 1]; stops[i - 1] = stops[i]; stops[i] = t; persist(); renderRoute(); };
      const dn = document.createElement("button"); dn.className = "mv"; dn.textContent = "▾"; dn.disabled = i === stops.length - 1;
      dn.onclick = () => { const t = stops[i + 1]; stops[i + 1] = stops[i]; stops[i] = t; persist(); renderRoute(); };
      mv.appendChild(up); mv.appendChild(dn);
      const main = document.createElement("div");
      main.className = "stop-main";
      const b = document.createElement("b");
      b.textContent = (i + 1) + ". " + s.name;
      const sm = document.createElement("small");
      let leg = "";
      if (i > 0) {
        const p = stops[i - 1];
        const d = nm(haversine(p.lat, p.lon, s.lat, s.lon));
        total += d;
        const brg = bearingDeg(p.lat, p.lon, s.lat, s.lon);
        leg = d.toFixed(1) + " nm · " + Math.round(brg) + "° " + compassPt(brg) + " · " + fmtDur(d / kn) + " · ";
      }
      sm.textContent = leg + (s.temp != null ? s.temp + "° · wind " + s.wind + " mph" : "fetching sky...");
      main.appendChild(b); main.appendChild(sm);
      const exp = document.createElement("button");
      exp.className = "mini";
      exp.textContent = openStopId === s.id ? "Hide" : "Hours";
      exp.onclick = () => { openStopId = openStopId === s.id ? null : s.id; if (openStopId === s.id && (!s.hourly || !s.fetchedAt || Date.now() - s.fetchedAt > 1800000)) fetchStopWx(s); renderRoute(); };
      const go = document.createElement("button");
      go.className = "mini" + (state.loc.place === s.name ? " here" : "");
      go.textContent = state.loc.place === s.name ? "Here" : "Sail here";
      go.onclick = () => { state.loc = { lat: s.lat, lon: s.lon, place: s.name }; persist(); refreshData(); renderRoute(); toast("Sailing to " + s.name.split(",")[0]); };
      const del = document.createElement("button");
      del.className = "del";
      del.setAttribute("aria-label", "Remove stop");
      del.textContent = "×";
      del.onclick = () => { if (openStopId === s.id) openStopId = null; state.sail.stops.splice(i, 1); persist(); renderRoute(); };
      row.appendChild(mv); row.appendChild(main); row.appendChild(exp); row.appendChild(go); row.appendChild(del);
      wrap.appendChild(row);
      if (openStopId === s.id) {
        const ex = document.createElement("div");
        ex.className = "stop-expand";
        const c = document.createElement("canvas");
        ex.appendChild(c);
        const rl = document.createElement("div");
        rl.className = "rowline";
        const lab = document.createElement("span");
        lab.textContent = s.hourly ? "Next 12 hours at " + s.name.split(",")[0] : "Fetching the sky over " + s.name.split(",")[0] + "...";
        const full = document.createElement("button");
        full.className = "mini";
        full.textContent = "Full hourly sky";
        full.onclick = () => { state.loc = { lat: s.lat, lon: s.lon, place: s.name }; persist(); refreshData(); closeSheet(); renderHours(); updateSat(); openSheet("hours"); };
        rl.appendChild(lab); rl.appendChild(full);
        ex.appendChild(rl);
        wrap.appendChild(ex);
        requestAnimationFrame(() => drawStopChart(c, s));
      }
    });
    el("route-total").textContent = stops.length > 1 ? "About " + total.toFixed(1) + " nautical miles end to end, roughly " + fmtDur(total / kn) + " under sail at " + kn + " kn." : "";
  }
  async function addStop() {
    const q = (el("stop-input").value || "").trim(); if (!q) return;
    toast("Searching");
    const g = await geocode(q);
    if (!g) { toast("Place not found"); return; }
    const stop = { id: "s" + Date.now().toString(36), name: g.place, lat: g.lat, lon: g.lon, temp: null, wind: null, code: null };
    state.sail.stops.push(stop);
    el("stop-input").value = "";
    persist(); renderRoute();
    fetchStopWx(stop);
  }
  function setSailing(on) {
    state.sail.on = on;
    el("sail-toggle").setAttribute("aria-pressed", on ? "true" : "false");
    el("open-route").style.display = on ? "" : "none";
    persist(); initParticles();
    toast(on ? "Sailing mode. Fair winds." : "Back to the garden.");
    if (on && !state.sail.stops.length) { renderRoute(); openSheet("route"); }
  }

  function wire() {
    el("verse-next").onclick = () => setVerse(pickVerse());
    const pause = el("verse-pause");
    pause.onclick = () => { state.versePaused = !state.versePaused; pause.setAttribute("aria-pressed", state.versePaused ? "true" : "false"); pause.textContent = state.versePaused ? "▶" : "❚❚"; };
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
    document.querySelectorAll("#skymode-seg button").forEach(b => b.onclick = () => {
      state.settings.skyMode = b.dataset.v;
      if (b.dataset.v === "cycle") { state.cycleStart = Date.now(); state.cycleBase = realNowMin(); toast("Playing the whole day"); }
      else toast("Following the real sky");
      document.querySelectorAll("#skymode-seg button").forEach(x => x.classList.toggle("on", x === b));
      persist(); initParticles();
    });
    el("open-hours").onclick = () => { renderHours(); updateSat(); openSheet("hours"); };
    document.querySelectorAll("#hours-tabs button").forEach(b => b.onclick = () => {
      document.querySelectorAll("#hours-tabs button").forEach(x => x.classList.toggle("on", x === b));
      el("hours-rain").style.display = b.dataset.t === "rain" ? "" : "none";
      el("hours-wind").style.display = b.dataset.t === "wind" ? "" : "none";
      el("hours-sky").style.display = b.dataset.t === "sky" ? "" : "none";
      if (b.dataset.t === "sky") updateSat();
    });
    el("sat-scrub").oninput = updateSat;
    el("sat-img").onerror = satError;
    el("radar-toggle").onclick = () => {
      const r = el("sat-radar");
      r.classList.toggle("on");
      el("radar-toggle").textContent = r.classList.contains("on") ? "Rain radar on" : "Rain radar off";
    };
    el("open-verses").onclick = () => { renderCvList(); openSheet("verses"); };
    el("cv-save").onclick = saveCustomVerse;
    el("sail-toggle").onclick = () => setSailing(!state.sail.on);
    el("open-route").onclick = () => { renderRoute(); openSheet("route"); };
    el("stop-add").onclick = addStop;
    el("stop-input").addEventListener("keydown", e => { if (e.key === "Enter") addStop(); });
    document.querySelectorAll("#speed-seg button").forEach(b => b.onclick = () => { state.sail.speed = +b.dataset.v; persist(); renderRoute(); });
    document.querySelector(".stage").addEventListener("click", e => {
      if (e.target !== e.currentTarget) return;
      if (e.clientY < horizonY) setVerse(pickVerse());
    });
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
    if (state.sail.on) { el("sail-toggle").setAttribute("aria-pressed", "true"); el("open-route").style.display = ""; }
    setVerse(pickVerse());
    updateConditions();
    renderHours();
    refreshData();
    setInterval(fetchWeather, 600000);
    setInterval(fetchAqi, 900000);
    setInterval(fetchIss, 12000);
    setInterval(fetchRadar, 600000);
    registerSW();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutVerse);
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
