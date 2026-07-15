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
    "zen-garden": { name: "Zen Garden", foliage: ["#3E5A3A", "#6E8F5E", "#AEC29A"], bloom: ["#D8B26A", "#E6D3A0"], ambient: "none", water: true, density: 0.36, warmBias: -0.08 },
    "catskills": { name: "Catskill Evening", foliage: ["#33503F", "#5C8261", "#9AB894"], bloom: ["#CBD6E6", "#E7A9C0", "#F0E0A0"], ambient: "fireflies", water: true, density: 0.55, warmBias: -0.12, mountains: true }
  };
  const PRESET_ORDER = ["secret-garden", "cottage-border", "wildflower-meadow", "moonlit-garden", "zen-garden", "catskills"];

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    loc: store.loc || Object.assign({}, DEFAULT_LOC),
    themeId: store.themeId || "secret-garden",
    custom: store.custom || [],
    customVerses: store.customVerses || [],
    sail: Object.assign({ on: false, stops: [], speed: 5 }, store.sail || {}),
    settings: Object.assign({ autoRotate: true, motion: true, skyMode: "real", backdrop: "hills", tourSeen: false }, store.settings || {}),
    weather: store.weather || { code: 0, temp: null, cloud: 22, wind: 6, windDir: 240, isDay: 1, precip: 0 },
    hourly: store.hourly || null,
    daily: store.daily || null,
    sun: store.sun || { sunrise: 390, sunset: 1200 },
    aqi: store.aqi != null ? store.aqi : null,
    trip: Object.assign({ from: "Norwich, NY", to: "Kingston, NY", plan: null }, store.trip || {}),
    favs: store.favs || [],
    loc2: store.loc2 || null,
    hourly2: store.hourly2 || null,
    rv: null,
    curVerse: null,
    versePaused: false,
    paused: false,          // the pause button freezes the whole scene (session only, not saved)
    cycleStart: 0,
    cycleBase: 0,
    boatP: 0.18
  };

  // long-press shortcuts: press and hold a part of the scene to open a tool, remappable in settings
  const BIND_TARGETS = [
    { k: "sky", label: "The open sky" },
    { k: "cloud", label: "A passing cloud" },
    { k: "pond", label: "The pond" },
    { k: "tree", label: "A tree" },
    { k: "flower", label: "A flower" },
    { k: "ground", label: "The grass" }
  ];
  const BIND_ACTIONS = [
    { k: "radar", label: "Rain radar" },
    { k: "daily", label: "10-day forecast" },
    { k: "hours", label: "Hourly sky" },
    { k: "scenes", label: "Gardens & scenes" },
    { k: "compass", label: "Compass & stars" },
    { k: "verses", label: "Her verses" },
    { k: "sky", label: "Sun & moon" },
    { k: "route", label: "Routes" },
    { k: "tour", label: "The tour" },
    { k: "none", label: "Nothing" }
  ];
  const DEFAULT_BINDS = { sky: "radar", cloud: "daily", pond: "hours", tree: "scenes", flower: "verses", ground: "compass" };
  state.settings.binds = Object.assign({}, DEFAULT_BINDS, state.settings.binds || {});

  function motionOn() { return state.settings.motion && !prefersReduced && !state.paused; }
  function activeTheme() {
    if (state.themeId.indexOf("custom:") === 0) {
      const id = state.themeId.slice(7);
      return state.custom.find(c => c.id === id) || THEMES["secret-garden"];
    }
    return THEMES[state.themeId] || THEMES["secret-garden"];
  }

  function persist() {
    save({ loc: state.loc, themeId: state.themeId, custom: state.custom, customVerses: state.customVerses, sail: { on: state.sail.on, stops: state.sail.stops, speed: state.sail.speed }, settings: state.settings, weather: state.weather, hourly: state.hourly, daily: state.daily, sun: state.sun, aqi: state.aqi, trip: state.trip, favs: state.favs, loc2: state.loc2, hourly2: state.hourly2 });
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

  function realNowMin() {
    if (state.sun.off != null) { let m = (Date.now() / 60000 + state.sun.off / 60) % 1440; if (m < 0) m += 1440; return m; }
    const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }
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

  function moonPhaseAt(ms) {
    const syn = 29.53058867, ref = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;
    const jd = ms / 86400000;
    let p = ((jd - ref) / syn) % 1; if (p < 0) p += 1; return p;
  }
  function moonPhase() { return moonPhaseAt(Date.now()); }
  function moonGlyph(p) {
    // eight-phase emoji, new -> waxing -> full -> waning
    return ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][Math.floor(((p % 1) + 1 / 16) % 1 * 8) % 8];
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

  const CATSKILL_LAYERS = [
    // Layer 0 (farthest) — Slide Mountain massif / Burroughs Range: long gentle dome of Slide (4180 ft,
    // highest Catskill) with Cornell (3860) and Wittenberg (3780) trailing east — old, rounded, unhurried.
    {
      name: 'farthest — Slide massif (Slide–Cornell–Wittenberg)',
      pts: [
        [0.00, 0.66], [0.05, 0.63], [0.10, 0.60], [0.16, 0.575], [0.22, 0.56],
        [0.28, 0.545], [0.34, 0.52], [0.40, 0.48], [0.46, 0.44], [0.52, 0.405],
        [0.57, 0.385], [0.62, 0.38], [0.66, 0.39], [0.70, 0.425], [0.74, 0.41],
        [0.77, 0.425], [0.81, 0.445], [0.85, 0.43], [0.89, 0.465], [0.94, 0.53],
        [0.97, 0.58], [1.00, 0.62]
      ]
    },
    // Layer 1 — Blackhead Range "rooster comb": Thomas Cole (3940), Black Dome (3980, center, tallest),
    // shallow col between them, deeper Lockwood Gap, then the steeper cone of Blackhead (3940).
    {
      name: 'Blackhead Range (Thomas Cole – Black Dome – Blackhead)',
      pts: [
        [0.00, 0.62], [0.05, 0.56], [0.09, 0.48], [0.13, 0.38], [0.15, 0.335],
        [0.165, 0.32], [0.185, 0.33], [0.205, 0.365], [0.245, 0.37], [0.265, 0.325],
        [0.29, 0.305], [0.315, 0.32], [0.335, 0.35], [0.36, 0.425], [0.40, 0.43],
        [0.425, 0.35], [0.45, 0.318], [0.468, 0.315], [0.487, 0.34], [0.51, 0.40],
        [0.54, 0.47], [0.58, 0.54], [0.64, 0.58], [0.72, 0.60], [0.80, 0.615],
        [0.88, 0.60], [0.94, 0.615], [1.00, 0.63]
      ]
    },
    // Layer 2 — Hunter Mountain (4040 ft): broad summit dome with the SW Hunter shoulder (3740) on its
    // left and the Colonel's Chair spur stepping down on the right; Stony Clove Notch cuts deep to its west.
    {
      name: 'Hunter Mountain (broad dome + SW shoulder, Stony Clove Notch)',
      pts: [
        [0.00, 0.58], [0.06, 0.56], [0.12, 0.565], [0.18, 0.55], [0.24, 0.565],
        [0.30, 0.60], [0.35, 0.635], [0.40, 0.50], [0.45, 0.38], [0.475, 0.325],
        [0.50, 0.315], [0.52, 0.325], [0.55, 0.30], [0.58, 0.26], [0.61, 0.235],
        [0.645, 0.225], [0.68, 0.228], [0.71, 0.245], [0.74, 0.28], [0.77, 0.33],
        [0.80, 0.385], [0.83, 0.40], [0.86, 0.43], [0.90, 0.51], [0.94, 0.57],
        [1.00, 0.62]
      ]
    },
    // Layer 3 (nearest) — Devil's Path eastern sawtooth, west→east: Plateau (3850, long flat top),
    // deep Mink Hollow notch, Sugarloaf (3810), Pecoy Notch, Twin (3650, double summit),
    // Jimmy Dolan Notch, Indian Head (3573), falling away to Platte Clove.
    {
      name: 'nearest — Devil\'s Path (Plateau – Sugarloaf – Twin – Indian Head)',
      pts: [
        [0.00, 0.56], [0.03, 0.47], [0.06, 0.32], [0.085, 0.21], [0.11, 0.19],
        [0.15, 0.185], [0.19, 0.19], [0.215, 0.24], [0.245, 0.38], [0.275, 0.52],
        [0.30, 0.40], [0.33, 0.27], [0.352, 0.212], [0.368, 0.20], [0.384, 0.225],
        [0.42, 0.37], [0.45, 0.46], [0.48, 0.35], [0.51, 0.27], [0.535, 0.245],
        [0.56, 0.28], [0.585, 0.26], [0.615, 0.35], [0.645, 0.44], [0.675, 0.35],
        [0.705, 0.295], [0.73, 0.28], [0.755, 0.30], [0.79, 0.41], [0.85, 0.56],
        [0.90, 0.64], [0.95, 0.70], [1.00, 0.73]
      ]
    }
  ];

  let geo = null, L = null;
  const GE = window.GardenElements;
  // continuous time-of-day palette: blend the library's dawn/day/dusk/night by real sun position
  function gePalette() {
    const pal = GE.palettes, alt = sunAltitude(), tw = twilight();
    const m = nowMin(), sr = state.sun.sunrise, ss = state.sun.sunset;
    const dawnish = Math.abs(m - sr) < Math.abs(m - ss);
    const twP = dawnish ? pal.dawn : pal.dusk;
    let A, Bp, k;
    if (alt <= 0.02) { A = pal.night; Bp = twP; k = tw; }
    else { A = twP; Bp = pal.day; k = smooth(alt / 0.35); }
    const mF = f => GE.mixHex(A[f], Bp[f], k);
    const th = activeTheme();
    GE.FOL[0] = th.foliage[0]; GE.FOL[1] = th.foliage[1]; GE.FOL[2] = th.foliage[2];
    const P = {
      key: "blend", night: isNight(),
      skyTop: mF("skyTop"), skyMid: mF("skyMid"), skyBot: mF("skyBot"),
      fol: GE.mixHex(A.fol, Bp.fol, k), folK: lerp(A.folK, Bp.folK, k),
      bloom: GE.mixHex(A.bloom || "#FFFFFF", Bp.bloom || "#FFFFFF", k), bloomK: lerp(A.bloomK, Bp.bloomK, k),
      waterHi: mF("waterHi"), waterLo: mF("waterLo")
    };
    if (th.warmBias) {
      P.bloom = GE.mixHex(P.bloom, th.warmBias > 0 ? "#F4CAA8" : "#CBD6E6", Math.abs(th.warmBias) * 0.5);
      P.bloomK = Math.max(P.bloomK, Math.abs(th.warmBias) * 0.3);
    }
    return P;
  }
  function buildScene() {
    const th = activeTheme();
    const r = rng(1337 + Math.round(th.density * 1000));
    const g = { farRidge: [], midRidge: [], trees: [], bushes: [], grasses: [], flowers: [], pond: null, stars: [] };

    function ridge(base, amp, step, seedShift) {
      const rr = rng(base * 100 + seedShift);
      const pts = []; let y = horizonY - base;
      for (let x = -0.4; x <= 1.41; x += step) {
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
      g.trees.push({ x: ((i / treeN) * 1.7 - 0.35 + (r() - 0.5) * 0.05) * W, w: U * (0.05 + r() * 0.05), h: U * (0.1 + r() * 0.08), ph: r() * 6.28 });
    }

    // bushes only dress the river banks in sailing mode now
    const bushN = clamp(Math.round((5 + th.density * 8) * wk), 4, 16);
    for (let i = 0; i < bushN; i++) {
      g.bushes.push({ x: (r() * 1.7 - 0.35) * W, y: horizonY + (H - horizonY) * (0.12 + r() * 0.34), w: U * (0.09 + r() * 0.1), h: U * (0.05 + r() * 0.055), ph: r() * 6.28, c: r() });
    }
    g.bushes.sort((a, b) => a.y - b.y);

    // the garden itself comes from the Claude Design element library
    let seedN = 0; for (let i = 0; i < state.themeId.length; i++) seedN += state.themeId.charCodeAt(i);
    L = GE.layout.generate({
      W: Math.round(W * 1.7), H: H, horizon: horizonY,
      seed: 13 + seedN + Math.round(th.density * 97),
      density: 0.85 + th.density * 1.4,    // wide world: keep the meadow lush across the pan range
      pond: !!th.water, koi: 3
    });
    const shift = W * 0.35;
    for (const tr of L.trees) tr.x -= shift;
    for (const f of L.flowers) f.x -= shift;
    for (const g2 of L.grass) g2.x -= shift;
    if (L.pond) L.pond.cx -= shift;
    const designed = th.slate === "blank" || (th.placed && th.placed.length) || th.pondAt;
    if (designed) {
      const G = H - horizonY;
      if (th.slate === "blank") { L.trees = []; L.flowers = []; L.pond = null; L.lilyPads = []; L.koi = []; }
      if (th.pondAt) {
        const d = th.pondAt.ny;
        const rx = Math.min(W * (0.1 + 0.24 * d), 230);
        L.pond = { cx: (-0.35 + th.pondAt.nx * 1.7) * W, cy: horizonY + d * G, rx: rx, ry: Math.min(rx * 0.42, G * 0.16) };
        L.lilyPads = GE.pond.makeLilyPads(L.pond, 7, 4 + Math.round(d * 6));
        L.koi = GE.pond.makeKoi(7, 3);
      }
      if (th.placed) for (const p of th.placed) {
        const px = (-0.35 + p.nx * 1.7) * W, py = horizonY + p.ny * G;
        const sc = 0.42 + 0.78 * p.ny;
        if (p.t === "tree") L.trees.push({ kind: p.kind, x: px, y: py, h: G * 0.95 * sc * (p.size || 1), seed: p.seed });
        else if (p.t === "bush") L.flowers.push({ kind: "bush", x: px, y: py, h: G * 0.2 * sc, seed: p.seed });
        else L.flowers.push({ kind: p.kind, x: px, y: py, h: G * 0.26 * sc, seed: p.seed });
      }
    } else if (L.trees.length && !L.trees.some(t => t.kind === "willow")) {
      L.trees[0].kind = "willow";
    }
    L.willow = L.trees.find(t => t.kind === "willow") || null;
    // flatten the pond into a perspective ellipse (library default is near-circular on narrow screens)
    if (L.pond) {
      L.pond.rx = Math.min(W * 0.24, 190); L.pond.ry = Math.min((H - horizonY) * 0.13, L.pond.rx * 0.55);
      const inP = (x, y, m) => { const dx = (x - L.pond.cx) / (L.pond.rx + m), dy = (y - L.pond.cy) / (L.pond.ry + m * 0.6); return dx * dx + dy * dy < 1; };
      L.flowers = L.flowers.filter(f => !inP(f.x, f.y, 26));
      L.grass = L.grass.filter(g => !inP(g.x, g.base, 12));
    }

    const starN = clamp(Math.round(90 * wk), 55, 140);
    for (let i = 0; i < starN; i++) g.stars.push({ x: (r() * 1.7 - 0.35) * W, y: r() * horizonY * 0.92, r: 0.5 + r() * 1.2, ph: r() * 6.28 });

    geo = g;
    initParticles();
    layoutVerse();
  }

  // ---------- bounded caches: build expensive art once, blit it every frame ----------
  const SPRITES = new Map();          // LRU, hard 6 MB pixel budget
  let spriteBytes = 0;
  function sprite(key, w, h, painter) {
    let c = SPRITES.get(key);
    if (c) { SPRITES.delete(key); SPRITES.set(key, c); return c; }
    c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    painter(c.getContext("2d"), c.width, c.height);
    spriteBytes += c.width * c.height * 4;
    SPRITES.set(key, c);
    while (spriteBytes > 8388608 && SPRITES.size > 1) {
      const e = SPRITES.entries().next().value;
      SPRITES.delete(e[0]); spriteBytes -= e[1].width * e[1].height * 4;
    }
    return c;
  }
  const GRADS = new Map();            // CanvasGradients keyed by colors+geometry
  function cachedGrad(key, make) {
    let g = GRADS.get(key);
    if (!g) { if (GRADS.size > 96) GRADS.clear(); g = make(); GRADS.set(key, g); }
    return g;
  }
  function clearArtCaches() { SPRITES.clear(); spriteBytes = 0; GRADS.clear(); floraHaze = null; }
  let floraHaze = null;

  let rain = [], snow = [], petals = [], pollen = [], flies = [], clouds = [];
  function wxKind() {
    const c = state.weather.code;
    if (c >= 71 && c <= 77 || c === 85 || c === 86) return "snow";
    if (c >= 51 && c <= 67 || c >= 80 && c <= 82 || c >= 95) return "rain";
    if (c === 45 || c === 48) return "fog";
    return "clear";
  }
  function initParticles() {
    const calm = state.settings.skyMode === "cycle";   // day cycle: nice weather, always
    const scale = clamp(W / 1100, 0.4, 1.2), k = calm ? "clear" : wxKind(), th = activeTheme();
    const heavy = (motionOn() ? 1 : 0.25) * (perfTier ? 0.55 : 1);
    rain = []; snow = []; petals = []; pollen = []; flies = []; clouds = [];
    const cloudN = state.weather.cloud <= 0 ? 0 : clamp(Math.round(2 + state.weather.cloud / 16), 2, 9);
    for (let i = 0; i < cloudN; i++) clouds.push({ x: Math.random() * W * 1.2 - W * 0.1, y: (0.08 + Math.random() * 0.45) * horizonY, s: (0.6 + Math.random() * 1.1) * clamp(U / 700, 0.55, 1.25), sp: 0.004 + Math.random() * 0.01, op: 0.35 + Math.random() * 0.4 });
    buildZenithField();
    if (k === "rain") { const n = Math.round((state.weather.code >= 80 || state.weather.code >= 63 ? 240 : 150) * scale * heavy); for (let i = 0; i < n; i++) rain.push({ x: Math.random() * W, y: Math.random() * H, len: 9 + Math.random() * 14, sp: 7 + Math.random() * 6 }); }
    if (k === "snow") { const n = Math.round(130 * scale * heavy); for (let i = 0; i < n; i++) snow.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.4, sp: 0.6 + Math.random() * 1.1, ph: Math.random() * 6.28 }); }
    if (!calm && k === "clear") {
      // a chance of rain becomes a chance of raindrops: sparse above 30%, +12 drops per 10 points
      const pp = state.hourly && state.hourly.pp && state.hourly.pp.length ? state.hourly.pp[0] : 0;
      if (pp > 30) {
        const n = Math.round(((pp - 30) / 10) * 12 * scale * heavy);
        for (let i = 0; i < n; i++) rain.push({ x: Math.random() * W, y: Math.random() * H, len: 7 + Math.random() * 9, sp: 6 + Math.random() * 5 });
      }
    }
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
    const tc = rgb(s.top), hc = rgb(s.hor);
    const g = cachedGrad("sky:" + tc + hc, () => {
      const gg = ctx.createLinearGradient(0, 0, 0, horizonY);
      gg.addColorStop(0, tc); gg.addColorStop(1, hc);
      return gg;
    });
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.4, 0, W * 1.8, horizonY);
  }

  function drawGround() {
    const alt = sunAltitude();
    const groundNear = rgb(mix(hexToRgb("#36442a"), hexToRgb("#70895a"), smooth(alt / 0.3)));
    const groundFar = rgb(mix(hexToRgb("#647d4b"), hexToRgb("#b2c79e"), smooth(alt / 0.3)));
    const gg = cachedGrad("gnd:" + groundFar + groundNear, () => {
      const g2 = ctx.createLinearGradient(0, horizonY, 0, H);
      g2.addColorStop(0, groundFar); g2.addColorStop(1, groundNear);
      return g2;
    });
    ctx.fillStyle = gg;
    ctx.fillRect(-W * 0.4, horizonY, W * 1.8, H - horizonY);
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
    const R = Math.round(r);
    const spr = sprite("sun:" + R, R * 6.6, R * 6.6, (g2, w2) => {
      const c = w2 / 2;
      const g = g2.createRadialGradient(c, c, R * 0.2, c, c, R * 3.2);
      g.addColorStop(0, "rgba(255,244,206,0.85)");
      g.addColorStop(0.25, "rgba(250,222,150,0.4)");
      g.addColorStop(1, "rgba(250,222,150,0)");
      g2.fillStyle = g; g2.beginPath(); g2.arc(c, c, R * 3.2, 0, 6.2832); g2.fill();
      const d = g2.createRadialGradient(c - R * 0.2, c - R * 0.2, R * 0.1, c, c, R);
      d.addColorStop(0, "#FFF7DC"); d.addColorStop(1, "#F6CD6B");
      g2.fillStyle = d; g2.beginPath(); g2.arc(c, c, R, 0, 6.2832); g2.fill();
    });
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, cx - spr.width / 2, cy - spr.height / 2);
    ctx.globalAlpha = 1;
  }

  function drawMoon(cx, cy, r, alpha) {
    const p = moonPhase(), R = Math.round(r), pb = Math.round(p * 60);
    const spr = sprite("moon:" + R + ":" + pb, R * 5.4, R * 5.4, (g2, w2) => {
      const c = w2 / 2;
      const g = g2.createRadialGradient(c, c, R * 0.5, c, c, R * 2.6);
      g.addColorStop(0, "rgba(238,238,220,0.45)"); g.addColorStop(1, "rgba(238,238,220,0)");
      g2.fillStyle = g; g2.beginPath(); g2.arc(c, c, R * 2.6, 0, 6.2832); g2.fill();
      g2.translate(c, c);
      g2.beginPath(); g2.arc(0, 0, R, 0, 6.2832); g2.fillStyle = "rgba(120,132,156,0.5)"; g2.fill();
      const a = p * 2 * Math.PI, cosA = Math.cos(a);
      g2.beginPath();
      g2.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, p >= 0.5);
      g2.ellipse(0, 0, Math.max(0.001, R * Math.abs(cosA)), R, 0, Math.PI / 2, Math.PI * 1.5, cosA <= 0);
      g2.closePath();
      g2.fillStyle = "#F7F2E0"; g2.fill();
    });
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, cx - spr.width / 2, cy - spr.height / 2);
    ctx.globalAlpha = 1;
  }

  function celestialX(frac) { return W * (0.14 + 0.72 * frac); }

  function sunScreenPos() {
    const df = dayFrac();
    return {
      x: celestialX(df),
      y: horizonY - Math.sin(Math.PI * df) * horizonY * 0.74 + 8 - H * 0.02 * smooth(Math.sin(Math.PI * df) * 2),
      a: clamp(sunAltitude() / 0.12, 0, 1)
    };
  }
  function drawRays() {
    const cov = state.weather.cloud, sp = sunScreenPos();
    if (sp.a < 0.25 || cov < 25 || cov > 88) return;
    const k = clamp(1 - Math.abs(cov - 56) / 34, 0.2, 1);   // strongest at broken cover
    const base = 0.1 * sp.a * k * (1 - smooth(cam * 1.4));
    if (base < 0.01) return;
    // fan baked once at half resolution; per frame: one rotated blit
    const maxLen = H * 0.69;
    const spr = sprite("rays:" + Math.round(maxLen), maxLen * 1.6, maxLen * 1.05, (g2, w2) => {
      g2.scale(0.5, 0.5);
      const ox = w2, oy = 8;
      for (let i = 0; i < 7; i++) {
        const a = (-0.5 + i / 6) * 1.5 + Math.PI / 2;
        const len = H * (0.45 + (i % 3) * 0.12) * 2;
        const wHalf = (14 + (i % 2) * 10) * 2;
        const g = g2.createLinearGradient(ox, oy, ox + Math.cos(a) * len, oy + Math.sin(a) * len);
        g.addColorStop(0, "rgba(255,240,200," + (0.8 + (i % 2) * 0.2).toFixed(2) + ")");
        g.addColorStop(1, "rgba(255,240,200,0)");
        g2.fillStyle = g;
        g2.beginPath();
        g2.moveTo(ox, oy);
        g2.lineTo(ox + Math.cos(a) * len - Math.sin(a) * wHalf, oy + Math.sin(a) * len + Math.cos(a) * wHalf);
        g2.lineTo(ox + Math.cos(a) * len + Math.sin(a) * wHalf, oy + Math.sin(a) * len - Math.cos(a) * wHalf);
        g2.closePath(); g2.fill();
      }
    });
    const rot = motionOn() ? Math.sin(T * 0.00006) * 0.15 : 0;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(rot);
    ctx.globalAlpha = base;
    ctx.drawImage(spr, -spr.width / 2, -8);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  let sunHit = null, moonHit = null;   // tap targets, in scene coords, set when the disc is drawn
  function drawCelestial() {
    const alt = sunAltitude();
    const lookUp = 1 - smooth(cam * 1.4);           // sun and moon bow out as you look overhead
    const sunA = clamp(alt / 0.12, 0, 1) * lookUp;
    const moonA = clamp(1 - alt / 0.14, 0, 1) * 0.92 * lookUp;
    sunHit = moonHit = null;
    if (moonA > 0.02) {
      const nf = nightFrac();
      const mx = celestialX(nf), my = horizonY - Math.sin(Math.PI * nf) * horizonY * 0.7 + 12 - H * 0.02 * smooth(Math.sin(Math.PI * nf) * 2);
      const mr = Math.max(14, U * 0.05);
      drawMoon(mx, my, mr, moonA);
      moonHit = { x: mx, y: my, r: Math.max(40, mr * 1.8) };
    }
    if (sunA > 0.02) {
      const df = dayFrac();
      const sx = celestialX(df), sy = horizonY - Math.sin(Math.PI * df) * horizonY * 0.74 + 8 - H * 0.02 * smooth(Math.sin(Math.PI * df) * 2);
      const sr = Math.max(16, U * 0.055);
      drawSun(sx, sy, sr, sunA);
      sunHit = { x: sx, y: sy, r: Math.max(44, sr * 1.8) };
    }
  }

  function puff(x, y, s, op) {
    // one baked puff, drawn scaled — no per-frame gradients
    const spr = sprite("puff", 200, 152, (g2) => {
      const px = 100, py = 82, S = 1.6;
      for (const o of [[0, 0, 1], [-0.7, 0.15, 0.75], [0.7, 0.15, 0.75], [-0.35, -0.25, 0.7], [0.35, -0.2, 0.7]]) {
        const rr = 26 * S * o[2];
        const bx = px + o[0] * 30 * S, by = py + o[1] * 22 * S;
        const g = g2.createRadialGradient(bx, by, rr * 0.3, bx, by, rr);
        g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(1, "rgba(236,240,236,0)");
        g2.fillStyle = g; g2.beginPath(); g2.arc(bx, by, rr, 0, 6.2832); g2.fill();
      }
    });
    const k = s / 1.6;
    ctx.globalAlpha = clamp(op, 0, 1);
    ctx.drawImage(spr, x - 100 * k, y - 82 * k, 200 * k, 152 * k);
    ctx.globalAlpha = 1;
  }
  // ponytail: clouds part for 90s after a double-tap, then drift back
  let clearK = 0, clearUntil = 0;
  function cloudFade() {
    const target = Date.now() < clearUntil ? 1 : 0;
    clearK += (target - clearK) * 0.03;
    if (clearK < 0.002) clearK = 0;
    return 1 - clearK;
  }
  function partShift(x) {
    // clouds part like a curtain: slide away from center, barely fading
    if (clearK < 0.01) return 0;
    const side = x < W / 2 ? -1 : 1;
    return side * clearK * (W * 0.62 + Math.abs(x - W / 2) * 0.4);
  }
  function drawClouds() {
    cloudFade();
    for (const c of clouds) {
      if (motionOn()) { c.x += c.sp * (1 + state.weather.wind / 30); if (c.x - 80 * c.s > W) c.x = -90 * c.s; }
      const px = c.x + partShift(c.x);
      if (px > -140 * c.s && px < W + 140 * c.s) puff(px, c.y + 30, c.s, c.op * (1 - clearK * 0.25));
    }
  }
  function partClouds() {
    if (Date.now() < clearUntil) {    // already parted — a second double-tap draws them back
      clearUntil = 0;
      toast("The clouds return");
      return;
    }
    clearUntil = Date.now() + 90000;
    let pool = VERSES.filter(v => v.moods.indexOf("power") >= 0);
    if (!pool.length) pool = VERSES.filter(v => v.moods.indexOf("storm") >= 0 || v.moods.indexOf("wind") >= 0);
    if (pool.length) setVerse(pool[Math.floor(Math.random() * pool.length)]);
    toast("A reminder of His power over the skies");
  }

  // ---------- long-press shortcuts: what did she press, and what should it open ----------
  function sceneTargetAt(x, y) {
    if (cam >= 0.3) return null;                 // only from the garden view
    const xw = x + panX;
    if (y < horizonY) {
      for (const c of clouds) {                  // a cloud drifting by?
        if (Math.abs(xw - (c.x + partShift(c.x))) < 95 * c.s && Math.abs(y - (c.y + 30)) < 64 * c.s) return "cloud";
      }
      return "sky";
    }
    if (L && L.pond) {
      const dx = (xw - L.pond.cx) / (L.pond.rx + 20), dy = (y - L.pond.cy) / (L.pond.ry + 14);
      if (dx * dx + dy * dy < 1) return "pond";
    }
    if (L && L.trees) for (const t of L.trees) {
      if (xw > t.x - t.h * 0.28 && xw < t.x + t.h * 0.28 && y > t.y - t.h && y < t.y + 6) return "tree";
    }
    if (L && L.flowers) for (const f of L.flowers) {
      if (Math.abs(xw - f.x) < Math.max(22, f.h * 0.55) && y > f.y - f.h * 1.1 && y < f.y + 8) return "flower";
    }
    return "ground";
  }
  function runBind(a) {
    switch (a) {
      case "radar": { const v = el("map-view"); if (v && v.__resetZoom) v.__resetZoom(); openRadar(); return true; }
      case "daily": renderDaily(); if (!state.daily) fetchDaily(); openSheet("daily"); return true;
      case "hours": renderHours(); openSheet("hours"); return true;
      case "scenes": buildThemeChips(); document.querySelectorAll("#backdrop-seg button").forEach(b => b.classList.toggle("on", b.dataset.v === state.settings.backdrop)); openSheet("scenes"); return true;
      case "compass": openCompass(); return true;
      case "verses": renderCvList(); openSheet("verses"); return true;
      case "sky": openSky(isNight() ? "moon" : "sun"); return true;
      case "route": renderRoute(); renderTrip(); renderFavs(); openSheet("route"); return true;
      case "tour": openTour(); return true;
      default: return false;
    }
  }
  function doLongPress(x, y) {
    if (placing || cam >= 0.3) return;
    const target = sceneTargetAt(x, y);
    if (!target) return;
    const action = (state.settings.binds || DEFAULT_BINDS)[target];
    if (!action || action === "none") return;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    runBind(action);
  }

  // ---------- look-up camera: pull the sky down over the garden ----------
  let cam = 0, camTarget = 0, camVel = 0, dragY = null, dragMoved = false, camAt = 0;
  let panX = 0, panTarget = 0, panAt = 0, dragX0 = 0, dragAxis = null;   // side-to-side peek: one screen-third each way
  let zfield = [];

  // ---------- pinch to zoom the scene up to 2x, then it eases back on its own ----------
  const pointers = new Map();
  let pinching = false, pinchStartDist = 0, pinchStartScale = 1, pinchOx = 0, pinchOy = 0;
  let zoomScale = 1, zoomTimer = null;
  function applyZoom(scale, ox, oy) {
    zoomScale = scale;
    if (ox != null) cv.style.transformOrigin = ox + "px " + oy + "px";
    cv.style.transform = scale > 1.001 ? "scale(" + scale.toFixed(3) + ")" : "";
  }
  function resetZoom() {
    if (zoomTimer) { clearTimeout(zoomTimer); zoomTimer = null; }
    cv.style.transition = "transform 0.8s cubic-bezier(0.22,1,0.36,1)";
    applyZoom(1);
    setTimeout(() => { cv.style.transition = ""; }, 850);
  }
  function scheduleZoomReset() {          // ten seconds after the last pinch, drift back out
    if (zoomTimer) clearTimeout(zoomTimer);
    zoomTimer = setTimeout(resetZoom, 10000);
  }

  function buildZenithField() {
    const r = rng(4242 + Math.round(state.weather.cloud));
    const cov = state.weather.cloud;
    zfield = [];
    if (cov <= 0) return;   // forecast says clear: look up and there is nothing but blue sky
    const n = Math.round(4 + cov / 5);
    const bandT = H * 0.28, bandB = H * 0.62;
    const heavy = cov >= 85;
    // at heavy cover, an unbroken deck of big flat cumuli owns the sky first
    if (heavy) {
      for (let row = 0; row < 3; row++) {
        const ry = H * (0.12 + row * 0.38);
        for (let cxx = -0.1; cxx <= 1.1; cxx += 0.24) {
          zfield.push({ x: W * (cxx + (r() - 0.5) * 0.08), y: (ry + (r() - 0.5) * H * 0.1) / 1.12, s: (1.7 + r() * 0.9) * clamp(U / 700, 0.6, 1.3), op: 0.85 + r() * 0.15, sd: Math.floor(r() * 9999), deck: true });
        }
      }
    }
    const stormy = state.weather.code >= 95 || state.weather.code >= 80;
    for (let i = 0; i < n; i++) {
      const big = i % 3 === 0;
      const s = (big ? 1.3 + r() * 1.3 : 0.35 + r() * 0.7) * clamp(U / 700, 0.6, 1.3);
      let y = r() * H * 1.35 - H * 0.2;
      if (!heavy && y * 1.12 > bandT && y * 1.12 < bandB) y = (r() > 0.5 ? bandB + r() * H * 0.3 : bandT - H * 0.16 - r() * H * 0.3) / 1.12;
      // a real sky is never one cloud: wisps of cirrus above, cumulus below, a storm tower when it storms
      let type = "cum";
      if (!heavy && (cov < 45 ? r() < 0.55 : r() < 0.25)) type = "cirrus";
      if (stormy && i === 1) type = "cb";
      zfield.push({ x: r() * W, y: y, s: s, op: (heavy ? 0.75 : 0.55) + r() * 0.35, sd: Math.floor(r() * 9999), type: type });
    }
  }
  // cumulus from overlapping circles only: uniform winding, no fill-rule bites
  function cumulusLobes(cx, cy, w, h, seed) {
    const r = rng(seed);
    const lobes = [];
    const n = 5 + Math.floor(r() * 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const rr = h * (0.4 + r() * 0.34) * (1 - Math.abs(t - 0.5) * 0.2);
      lobes.push({ x: cx - w * 0.5 + t * w, y: cy + Math.sin(t * Math.PI) * h * 0.12 - rr * 0.1 + (r() - 0.5) * h * 0.1, r: rr });
    }
    lobes.push({ x: cx - w * (0.1 + r() * 0.14), y: cy - h * (0.42 + r() * 0.14), r: h * (0.44 + r() * 0.14) });
    lobes.push({ x: cx + w * (0.16 + r() * 0.12), y: cy - h * (0.32 + r() * 0.14), r: h * (0.38 + r() * 0.12) });
    lobes.push({ x: cx + w * (0.3 + r() * 0.05), y: cy - h * (0.22 + r() * 0.08), r: h * (0.4 + r() * 0.1) });
    lobes.push({ x: cx + w * 0.04, y: cy - h * (0.34 + r() * 0.1), r: h * (0.42 + r() * 0.1) });
    if (r() > 0.45) lobes.push({ x: cx - w * (0.3 + r() * 0.04), y: cy - h * (0.24 + r() * 0.1), r: h * (0.36 + r() * 0.1) });
    return lobes;
  }
  function traceLobes(g2, lobes) {
    g2.beginPath();
    for (const d of lobes) { g2.moveTo(d.x + d.r, d.y); g2.arc(d.x, d.y, d.r, 0, 6.2832); }
  }
  function paintCumulus(g2, cx, cy, w, h, seed, night) {
    const lobes = cumulusLobes(cx, cy, w, h, seed);
    g2.save();
    g2.fillStyle = night ? "rgba(228,233,243,0.97)" : "rgba(253,254,252,0.97)";
    traceLobes(g2, lobes); g2.fill();
    traceLobes(g2, lobes); g2.clip();
    const g = g2.createLinearGradient(0, cy - h * 0.7, 0, cy + h * 0.52);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    g.addColorStop(1, night ? "rgba(118,132,158,0.5)" : "rgba(191,202,209,0.55)");
    g2.fillStyle = g;
    g2.fillRect(cx - w, cy - h * 1.4, w * 2, h * 2.4);
    const hl = g2.createRadialGradient(cx - w * 0.18, cy - h * 0.5, 4, cx - w * 0.18, cy - h * 0.5, w * 0.4);
    hl.addColorStop(0, night ? "rgba(246,248,254,0.5)" : "rgba(255,252,240,0.65)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = hl;
    g2.fillRect(cx - w, cy - h * 1.4, w * 2, h * 2.4);
    g2.restore();
  }
  // res 1 = full (verse hero), 0.5 = zenith field
  function drawCumulus(cx, cy, w, h, seed, alpha, night, res) {
    const q = res || 1;
    const wb = Math.round(w / 8) * 8, hb = Math.round(h / 8) * 8;
    const padX = wb * 0.5 + hb * 0.85, padTop = hb * 1.05, padBot = hb * 0.7;
    const spr = sprite("cum:" + seed + ":" + wb + ":" + hb + ":" + (night ? 1 : 0) + ":" + q,
      (wb + padX * 2) * q, (padTop + padBot) * q, (g2) => {
        g2.scale(q, q);
        paintCumulus(g2, wb / 2 + padX, padTop, wb, hb, seed, night);
      });
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(spr, cx - (wb / 2 + padX), cy - padTop, wb + padX * 2, padTop + padBot);
    ctx.globalAlpha = 1;
  }
  // the verse rides a real cumulus: a run of overlapping puffs sits tight to the text so it reads
  // clearly, with a soft uneven top AND underside — no rectangular white slab, no wide margins.
  function paintVerseCloud(g2, cx, cy, coverW, coverH, seed, night) {
    const r = rng(seed);
    const R = coverH * 0.6;                        // body puff radius — covers the line height
    const span = coverW + coverH * 0.56;           // rounded ends just past the last letters
    const spacing = coverH * 0.52;
    const nBody = Math.max(2, Math.round(span / spacing));
    g2.save();
    g2.beginPath();
    for (let i = 0; i <= nBody; i++) {             // body: overlapping puffs, soft top and underside
      const t = i / nBody;
      const rr = R * (0.92 + r() * 0.16) * (1 - Math.abs(t - 0.5) * 0.28);
      const bx = cx - span / 2 + t * span, by = cy + (r() - 0.5) * coverH * 0.1;
      g2.moveTo(bx + rr, by); g2.arc(bx, by, rr, 0, 6.2832);
    }
    const nTop = Math.max(2, Math.round(span / coverH));   // a few taller crowns for cumulus character
    for (let i = 0; i < nTop; i++) {
      const rr = R * (0.5 + r() * 0.32);
      const bx = cx - span / 2 + (i + 0.5) / nTop * span + (r() - 0.5) * spacing * 0.4;
      const by = cy - coverH * 0.3 - rr * 0.45;
      g2.moveTo(bx + rr, by); g2.arc(bx, by, rr, 0, 6.2832);
    }
    g2.fillStyle = night ? "rgba(233,238,247,0.96)" : "rgba(253,254,252,0.96)";
    g2.fill();
    g2.clip();
    const gTop = cy - R - coverH * 0.5, gh = (cy + R + coverH * 0.25) - gTop;
    const g = g2.createLinearGradient(0, gTop, 0, gTop + gh);
    g.addColorStop(0, "rgba(255,255,255,0.78)");
    g.addColorStop(0.62, "rgba(255,255,255,0)");
    g.addColorStop(1, night ? "rgba(120,134,160,0.28)" : "rgba(196,206,214,0.32)");
    g2.fillStyle = g; g2.fillRect(cx - span, gTop, span * 2, gh);
    const hl = g2.createRadialGradient(cx - span * 0.22, cy - coverH * 0.15, 3, cx - span * 0.22, cy - coverH * 0.15, span * 0.42);
    hl.addColorStop(0, night ? "rgba(246,248,254,0.34)" : "rgba(255,252,240,0.48)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = hl; g2.fillRect(cx - span, gTop, span * 2, gh);
    g2.restore();
  }
  function drawVerseCloud(cx, cy, coverW, coverH, seed, alpha, night) {
    const cw = Math.round(coverW / 8) * 8, ch = Math.round(coverH / 8) * 8;
    const padX = ch * 1.05, padY = ch * 0.9;            // sprite margin for the puffs + soft edge
    const spr = sprite("verse:" + seed + ":" + cw + ":" + ch + ":" + (night ? 1 : 0),
      cw + padX * 2, ch + padY * 2, (g2) => {
        paintVerseCloud(g2, cw / 2 + padX, ch / 2 + padY, cw, ch, seed, night);
      });
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(spr, cx - (cw / 2 + padX), cy - (ch / 2 + padY));
    ctx.globalAlpha = 1;
  }
  function drawCirrus(cx, cy, sc, seed, alpha) {
    // mare's tails: swept wisps, each combed into fine bright fibers with an upturned hook
    const wpx = Math.round(420 * sc / 8) * 8;
    const spr = sprite("cir:" + seed + ":" + wpx, wpx, wpx * 0.36, (g2, w2, h2) => {
      const r = rng(seed + 5);
      g2.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        const yy = h2 * (0.14 + i * 0.115) + (r() - 0.5) * h2 * 0.05;
        const x0 = w2 * (0.02 + r() * 0.08), x1 = w2 * (0.7 + r() * 0.28);
        const bow = (r() - 0.4) * h2 * 0.32;
        const hook = h2 * (0.1 + r() * 0.18);
        for (let f = 0; f < 3; f++) {
          const off = (f - 1) * h2 * (0.018 + r() * 0.015);
          const al = (0.72 - f * 0.18) * (0.8 + r() * 0.35);
          const g = g2.createLinearGradient(x0, 0, x1, 0);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(0.16, "rgba(255,255,255," + al.toFixed(2) + ")");
          g.addColorStop(0.72, "rgba(246,250,255," + (al * 0.72).toFixed(2) + ")");
          g.addColorStop(1, "rgba(255,255,255,0)");
          g2.strokeStyle = g;
          g2.lineWidth = Math.max(1, h2 * (0.024 + f * 0.014));
          g2.beginPath();
          g2.moveTo(x0, yy + off + hook);
          g2.quadraticCurveTo(x0 + (x1 - x0) * 0.28, yy + off + bow * 0.35, (x0 + x1) / 2, yy + off + bow);
          g2.quadraticCurveTo(x1 - (x1 - x0) * 0.18, yy + off + bow * 0.7, x1, yy + off - h2 * 0.07);
          g2.stroke();
        }
      }
    });
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(spr, cx - wpx / 2, cy - wpx * 0.18);
    ctx.globalAlpha = 1;
  }
  function drawCumulonimbus(cx, cy, sc, seed, alpha, night) {
    const wb = Math.round(170 * sc / 8) * 8, hb = Math.round(64 * sc / 8) * 8;
    const spr = sprite("cb:" + seed + ":" + wb + ":" + (night ? 1 : 0), wb * 2.4, hb * 4.6, (g2, w2, h2) => {
      const cxx = w2 / 2;
      // anvil crown, tower, and a heavy base — stacked cumuli
      g2.fillStyle = night ? "rgba(214,220,234,0.9)" : "rgba(250,252,254,0.92)";
      g2.beginPath(); g2.ellipse(cxx, hb * 0.7, wb * 0.95, hb * 0.42, 0, 0, 6.2832); g2.fill();
      paintCumulus(g2, cxx - wb * 0.06, hb * 2.1, wb * 0.72, hb * 0.95, seed + 3, night);
      paintCumulus(g2, cxx, hb * 3.5, wb, hb, seed, night);
      const g = g2.createLinearGradient(0, hb * 3.1, 0, hb * 4.4);
      g.addColorStop(0, "rgba(120,132,150,0)");
      g.addColorStop(1, night ? "rgba(70,82,104,0.55)" : "rgba(126,138,152,0.5)");
      g2.fillStyle = g;
      g2.beginPath(); g2.ellipse(cxx, hb * 3.7, wb * 0.9, hb * 0.7, 0, 0, 6.2832); g2.fill();
    });
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(spr, cx - spr.width / 2, cy - spr.height * 0.5);
    ctx.globalAlpha = 1;
  }
  function camOffset() { return smooth(cam) * H * 1.04; }
  function drawZenith(oy) {
    if (oy <= 0) return;
    const s = skyColors(), night = isNight();
    const g = ctx.createLinearGradient(0, 0, 0, oy);
    g.addColorStop(0, rgb(mix(s.top, night ? [24, 34, 64] : [96, 156, 200], 0.55)));
    g.addColorStop(1, rgb(s.top));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, oy);
    const sa = clamp(1 - sunAltitude() * 4.5, 0, 1) * 0.6;
    if (sa > 0.03) {
      ctx.fillStyle = "#FBFAF2";
      for (const st of geo.stars) { ctx.globalAlpha = smooth(cam) * sa; ctx.beginPath(); ctx.arc(st.x, (st.y / (horizonY || 1)) * H, st.r, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    cloudFade();
    const cm = smooth(cam);
    for (const c of zfield) {
      const cy = c.y * 1.12 - (1 - cm) * H * 0.9;
      if (cy < -160 || cy > oy + 160) continue;
      const px = c.x + partShift(c.x);
      if (px < -260 * c.s || px > W + 260 * c.s) continue;
      const za = Math.min(1, c.op + 0.25) * smooth(cm * 2) * (1 - clearK * 0.2);
      if (c.type === "cirrus") drawCirrus(px, cy, Math.max(0.9, c.s), 40 + (c.sd % 5), za);
      else if (c.type === "cb") drawCumulonimbus(px, cy, c.s, 77, za, night);
      else drawCumulus(px, cy, 150 * c.s, 56 * c.s, 100 + (c.sd % 6), za, night, 0.8);
    }
  }
  function drawSkyHud() {
    const a = smooth((cam - 0.25) / 0.5);
    const night = isNight();
    if (a > 0.02) {
      ctx.save(); ctx.globalAlpha = a;
      const parted = Date.now() < clearUntil;
      const label = "L O O K I N G   U P   ·   C L O U D S   " + state.weather.cloud + "%" + (parted ? "  ·  P A R T E D" : "");
      ctx.font = "600 11px 'DM Sans', sans-serif";
      const tw = ctx.measureText(label).width + 34;
      const px = W / 2 - tw / 2, py = 44;
      ctx.fillStyle = night ? "rgba(20,28,48,0.55)" : "rgba(255,255,255,0.65)";
      ctx.beginPath(); ctx.roundRect(px, py, tw, 30, 15); ctx.fill();
      ctx.strokeStyle = night ? "rgba(255,255,255,0.25)" : "rgba(40,60,30,0.14)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = night ? "#E9F0E2" : "#3D4B36";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, W / 2, py + 16);
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    }
    const b = (1 - smooth(cam * 3)) * (0.5 + 0.25 * Math.sin(T * 0.003));
    if (b > 0.03 && !state.sail.on) {
      ctx.save(); ctx.globalAlpha = b;
      ctx.strokeStyle = isNight() ? "rgba(233,240,226,0.9)" : "rgba(61,75,54,0.75)";
      ctx.lineWidth = 3; ctx.lineCap = "round";
      const y0 = 10 + Math.sin(T * 0.0024) * 2.5;
      ctx.beginPath(); ctx.moveTo(W / 2 - 13, y0); ctx.lineTo(W / 2, y0 + 6); ctx.lineTo(W / 2 + 13, y0);
      ctx.stroke(); ctx.restore();
    }
  }

  function ridgePath(pts, colorTop, colorBot) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const xc = (pts[i][0] + pts[i - 1][0]) / 2, yc = (pts[i][1] + pts[i - 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], xc, yc);
    }
    ctx.lineTo(W * 1.4, H); ctx.lineTo(-W * 0.4, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, pts[0][1] - 40, 0, H);
    g.addColorStop(0, colorTop); g.addColorStop(1, colorBot);
    ctx.fillStyle = g; ctx.fill();
  }
  function drawCatskills() {
    // real Catskill profiles, far to near: Slide massif, Blackhead Range, Hunter, Devil's Path
    const blues = [[143, 163, 194], [111, 132, 168], [81, 100, 142], [60, 76, 116]];
    const nf = clamp(1 - sunAltitude() * 3, 0, 1);
    const lift = [0.1, 0.065, 0.032, 0];
    const hgt = [0.34, 0.3, 0.27, 0.24];
    for (let i = 0; i < CATSKILL_LAYERS.length; i++) {
      const lay = CATSKILL_LAYERS[i];
      const baseY = horizonY - U * lift[i] + 1;
      const hh = U * hgt[i];
      const col = mix(blues[i], [24, 32, 54], nf * 0.55);
      const g = ctx.createLinearGradient(0, baseY - hh, 0, baseY);
      g.addColorStop(0, rgb(col));
      g.addColorStop(1, rgb(mix(col, [214, 224, 236], 0.28 * (1 - nf))));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-W * 0.4, baseY);
      for (const p of lay.pts) ctx.lineTo((-0.35 + p[0] * 1.7) * W, baseY - (1 - p[1]) * hh);
      ctx.lineTo(W * 1.4, baseY);
      ctx.lineTo(W * 1.4, horizonY + 3); ctx.lineTo(-W * 0.4, horizonY + 3);
      ctx.closePath(); ctx.fill();
      // atmospheric haze settling at each layer's feet
      const hz = ctx.createLinearGradient(0, baseY - hh * 0.25, 0, baseY);
      hz.addColorStop(0, "rgba(222,232,242,0)");
      hz.addColorStop(1, "rgba(222,232,242," + (0.2 * (1 - nf) * (1 - i * 0.22)) + ")");
      ctx.fillStyle = hz;
      ctx.fillRect(-W * 0.4, baseY - hh * 0.25, W * 1.8, hh * 0.25);
    }
    if (state.settings.peakLabels) {
      const names = ["Slide Mtn", "Blackhead Range", "Hunter Mtn", "Devil's Path"];
      ctx.save();
      ctx.font = "600 11px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < CATSKILL_LAYERS.length && i < names.length; i++) {
        const lay = CATSKILL_LAYERS[i];
        let peak = lay.pts[0];
        for (const p of lay.pts) if (p[1] < peak[1]) peak = p;
        const px = (-0.35 + peak[0] * 1.7) * W;
        const py = horizonY - U * lift[i] + 1 - (1 - peak[1]) * U * hgt[i] - 7;
        ctx.fillStyle = "rgba(20,28,44,0.35)";
        ctx.fillText(names[i], px + 1, py + 1);
        ctx.fillStyle = "rgba(238,244,250,0.82)";
        ctx.fillText(names[i], px, py);
      }
      ctx.restore();
    }
  }
  function drawRidges() {
    if (activeTheme().mountains || state.settings.backdrop === "mountains") { drawCatskills(); return; }
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
      if (bankOnly && tr.x + tr.w > W * 0.2 - 4 && tr.x - tr.w < W * 0.8 + 4) continue;
      const sx = motionOn() ? Math.sin(T * 0.0004 + tr.ph) * 4 * windAmp() : 0;
      const c = shade(hexToRgb(th.foliage[0]), -0.12 * nf);
      blob(tr.x + sx, horizonY + 4, tr.w, tr.h, rgb(c));
    }
  }

  function windAmp() { return motionOn() ? clamp(state.weather.wind / 20, 0.2, 1.5) : 0; }
  function drawBushItem(g2, x, y, h, seed, P) {
    const r = rng(seed);
    const c0 = GE.hexA(GE.mixHex(GE.FOL[0], P.fol, P.folK), 0.96);
    const c1 = GE.hexA(GE.mixHex(GE.FOL[1], P.fol, P.folK), 0.95);
    const c2 = GE.hexA(GE.mixHex(GE.FOL[2], P.fol, P.folK * 0.8), 0.55);
    g2.fillStyle = "rgba(34,51,27,0.14)";
    g2.beginPath(); g2.ellipse(x, y + 2, h * 1.15, h * 0.18, 0, 0, 6.2832); g2.fill();
    for (const o of [[-0.7, 0.86, c0], [0.72, 0.8, c0], [0, 1.14, c1]]) {
      g2.fillStyle = o[2];
      g2.beginPath();
      g2.ellipse(x + o[0] * h * (0.8 + r() * 0.2), y - h * o[1] * 0.42, h * (0.62 + r() * 0.16), h * o[1] * 0.5, 0, 0, 6.2832);
      g2.fill();
    }
    g2.fillStyle = c2;
    g2.beginPath(); g2.ellipse(x - h * 0.2, y - h * 0.62, h * 0.5, h * 0.3, -0.3, 0, 6.2832); g2.fill();
  }
  function glowSprite() {
    return sprite("glow", 16, 16, (g2) => {
      const g = g2.createRadialGradient(8, 8, 0, 8, 8, 7);
      g.addColorStop(0, "rgba(250,240,150,1)"); g.addColorStop(1, "rgba(250,240,150,0)");
      g2.fillStyle = g; g2.beginPath(); g2.arc(8, 8, 7, 0, 6.2832); g2.fill();
    });
  }

  // ---------- the garden, painted by the Claude Design element library ----------
  // ponytail: flora (pond, trees, flowers, grass) renders to an offscreen layer every
  // OTHER frame — sway sines are slow, 30fps is invisible. The robin, butterflies and
  // sit figure are cheap and animate at full rate on top; sky and verse never drop.
  const gcv = document.createElement("canvas");
  const gctx = gcv.getContext("2d");
  let gFrame = 0;
  // ponytail: two quality tiers, switched by measured frame time — no settings, no drama
  let ftAvg = 16, floraEvery = 2, perfTier = 0, tierCheck = 0;
  function drawGardenScene() {
    if (!L) return;
    const P = gePalette(), t = motionOn() ? T * 0.001 : 0, wind = windAmp() || 0.35;
    if (motionOn()) robinFreezeT = T * 0.001;   // hold the robin's current pose when the scene is paused
    gFrame++;
    const FDPR = Math.min(DPR, 1.5);   // flora is soft art; 1.5x is indistinguishable and 44% lighter
    const bw = Math.round(W * 1.8 * FDPR), bh = Math.round(H * FDPR);
    if (gcv.width !== bw || gcv.height !== bh) {
      gcv.width = bw; gcv.height = bh;
      gFrame = 0;
    }
    if (gFrame % floraEvery === 0 || gFrame === 1) {
      gctx.setTransform(FDPR, 0, 0, FDPR, W * 0.4 * FDPR, 0);
      gctx.clearRect(-W * 0.4, 0, W * 1.8, H);
      paintFlora(gctx, P, t, wind);
    }
    ctx.drawImage(gcv, -W * 0.4, 0, W * 1.8, H);
    drawRobinVignette(P, motionOn() ? T * 0.001 : (robinFreezeT || 0));
    drawButterflies(P, t);
  }
  function paintFlora(g2, P, t, wind) {
    if (L.pond) {
      GE.pond.drawBase(g2, L.pond, t, P);
      for (const k of L.koi) GE.pond.drawKoi(g2, L.pond, k, t, P);
      for (const p of L.lilyPads) GE.pond.drawLilyPad(g2, L.pond, p, t, P);
      GE.pond.drawRipples(g2, L.pond, t, P, L.seed);
    }
    for (const gr of L.grass) GE.drawGrass(g2, { x: gr.x, base: gr.base, len: gr.len, w: gr.w, ph: gr.ph, lean: gr.lean, t: t, P: P, wind: wind });
    // aerial haze sits on the ground and grass; trees and flowers stand clear of it
    const G = H - horizonY;
    if (!floraHaze) {
      floraHaze = g2.createLinearGradient(0, horizonY, 0, horizonY + G * 0.5);
      floraHaze.addColorStop(0, "rgba(214,224,229,0.26)");
      floraHaze.addColorStop(1, "rgba(214,224,229,0)");
    }
    g2.fillStyle = floraHaze;
    g2.fillRect(-W * 0.4, horizonY, W * 1.8, G * 0.5);
    const items = [];
    for (const tr of L.trees) items.push({ y: tr.y, d: () => GE.trees[tr.kind].draw(g2, { x: tr.x, baseY: tr.y, h: tr.h, seed: tr.seed, t: t, P: P, wind: wind }) });
    for (const f of L.flowers) {
      items.push({ y: f.y - 0.01, d: () => {
        const rr = GE.rng(f.seed + 3);
        for (let b = 0; b < 3; b++) GE.drawGrass(g2, { x: f.x + (rr() - 0.5) * f.h * 0.34, base: f.y + 2, len: f.h * (0.2 + rr() * 0.16), w: 1 + rr() * 1.3, ph: rr() * 6.28, lean: (rr() - 0.5) * 0.8, t: t, P: P, wind: wind });
        g2.fillStyle = GE.hexA(GE.mixHex(GE.FOL[1], GE.FOL[2], 0.45), 0.9);
        const lw = f.h * 0.1;
        g2.beginPath(); g2.ellipse(f.x - lw * 0.8, f.y - lw * 0.25, lw, lw * 0.4, -0.7, 0, 6.2832); g2.fill();
        g2.beginPath(); g2.ellipse(f.x + lw * 0.8, f.y - lw * 0.2, lw * 0.9, lw * 0.36, 0.7, 0, 6.2832); g2.fill();
      } });
      items.push({ y: f.y, d: () => {
        if (f.kind === "bush") drawBushItem(g2, f.x, f.y, f.h, f.seed, P);
        else GE.flowers[f.kind].draw(g2, { x: f.x, baseY: f.y, h: f.h, seed: f.seed, t: t, P: P, wind: wind });
      } });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.d();
  }

  // robin and nest live in the willow: fly in, feed the chicks, keep watch, fly off (40s loop)
  function drawRobinVignette(P, t) {
    const w = L.willow; if (!w) return;
    const s = Math.max(0.7, w.h / 220);
    const nest = { x: w.x + w.h * 0.24, y: w.y - w.h * 0.52 };
    nestHit = { x: nest.x, y: nest.y, r: Math.max(34, s * 18) };   // tap the nest to open the tour
    GE.drawNest(ctx, nest.x, nest.y, s * 10, 21, P);
    const tl = t % 40;
    const feeding = tl >= 15.5 && tl < 24;
    const doze = (tl < 8 || tl >= 31) ? 1 : 0;
    const cyc = feeding ? Math.floor((tl - 15.5) / 2.83) : 0;
    const u = feeding ? ((tl - 15.5) / 2.83) % 1 : 0;
    const beg = tl >= 13 && tl < 15.5 ? 0.5 : 0;
    const g0 = feeding ? (cyc % 2 === 0 ? 1 : 0.3) * (u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.3)) : beg;
    const g1 = feeding ? (cyc % 2 === 1 ? 1 : 0.3) * (u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.3)) : beg;
    GE.drawChick(ctx, nest.x - s * 4, nest.y - s * 3, s * 0.6, 1, g0, doze, P);
    GE.drawChick(ctx, nest.x + s * 3.2, nest.y - s * 2.6, s * 0.55, -1, g1, doze, P);
    let pose = null;
    const edge = { x: nest.x + s * 12, y: nest.y - s * 7 };
    if (tl >= 8 && tl < 13) {
      const k = smooth((tl - 8) / 5);
      const x0 = -30, y0 = horizonY * 0.4;
      pose = { x: lerp(x0, edge.x, k), y: lerp(y0, edge.y, k) - Math.sin(k * Math.PI) * w.h * 0.5, dir: 1, fly: true, flap: k > 0.85 ? 0.5 : Math.sin(t * 15) * 0.8, pitch: k > 0.85 ? -0.2 : 0.05 };
    } else if (tl >= 13 && tl < 15.5) {
      pose = { x: edge.x, y: edge.y - Math.abs(Math.sin((tl - 13) * 4)) * 2 * Math.max(0, 14 - tl), dir: -1, legs: true };
    } else if (feeding) {
      let pitch = 0;
      if (u < 0.25) pitch = smooth(u / 0.25) * 0.85;
      else if (u < 0.5) pitch = 0.85;
      else if (u < 0.7) pitch = (1 - smooth((u - 0.5) / 0.2)) * 0.85;
      pose = { x: edge.x, y: edge.y + pitch * 3 * s, dir: -1, pitch: pitch, legs: true, gape: pitch > 0.5 ? 0.7 : 0 };
    } else if (tl >= 24 && tl < 28) {
      pose = { x: edge.x, y: edge.y, dir: -1, pitch: -0.04, legs: true, headTurn: Math.sin((tl - 24) * 1.9) * 0.9 };
    } else if (tl >= 28 && tl < 31) {
      const k = smooth((tl - 28) / 3);
      pose = { x: lerp(edge.x, W + 40, k), y: lerp(edge.y, horizonY * 0.15, smooth(k)), dir: 1, fly: true, flap: Math.sin(t * 15) * 0.8, pitch: -0.15 };
    }
    if (pose) { pose.s = s * 0.62; pose.P = P; pose.blue = Math.floor(t / 40) % 2 === 1; GE.drawRobin(ctx, pose); }
  }

  // butterflies fly a real path from bloom to bloom, rest on each a moment, then move on
  let bflies = [];
  function initButterflies() {
    const n = perfTier ? 2 : 3, G = H - horizonY;
    bflies = [];
    for (let i = 0; i < n; i++) bflies.push({ sd: 3 + i * 5, x: W * (0.3 + i * 0.3), y: horizonY + G * (0.45 + i * 0.1), tx: 0, ty: 0, phase: "seek", timer: 0, flit: Math.random() * 6.28, spd: 0.5 + Math.random() * 0.3 });
  }
  function butterflyTarget() {
    if (!L || !L.flowers || !L.flowers.length) return null;
    const blooms = L.flowers.filter(f => f.kind !== "bush");
    if (!blooms.length) return null;
    const inView = blooms.filter(f => f.x > panX - 40 && f.x < panX + W + 40);
    const pool = inView.length ? inView : blooms;
    let best = null;                                   // sample a few, favor the front (lowest) bloom
    for (let k = 0; k < 5; k++) { const f = pool[Math.floor(Math.random() * pool.length)]; if (!best || f.y > best.y) best = f; }
    return best;
  }
  function drawButterflies(P, t) {
    if (isNight() || !motionOn()) return;
    if (!bflies.length) initButterflies();
    const dt = clamp((T - lastTs) / 16.7, 0, 3);
    for (const b of bflies) {
      b.flit += 0.03 * dt;                                          // an unhurried wingbeat — about a quarter the old rate
      if (b.phase === "seek") {
        const f = butterflyTarget();
        if (f) { b.tx = f.x + (Math.random() - 0.5) * f.h * 0.22; b.ty = f.y - f.h * 0.6; }
        else { b.tx = clamp(b.x + (Math.random() - 0.5) * W * 0.4, panX, panX + W); b.ty = clamp(b.y + (Math.random() - 0.5) * 90, horizonY + 20, H - 16); }
        b.phase = "fly";
      }
      const dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.hypot(dx, dy) || 1;
      let visiting = false;
      if (b.phase === "fly") {
        const step = Math.min(dist, b.spd * 1.7 * dt);
        b.x += dx / dist * step + Math.cos(b.flit * 2) * 0.5 * dt;   // ease in with a fluttering wobble
        b.y += dy / dist * step + Math.sin(b.flit * 3) * 0.36 * dt;
        if (dist < 6) { b.phase = "visit"; b.timer = 220 + Math.random() * 320; }   // settle a good long while
      } else {
        visiting = true;                                            // settled on the bloom: barely a sway, wings near-closed
        b.x += Math.sin(b.flit * 0.6) * 0.07 * dt;
        b.y += Math.sin(b.flit * 0.9) * 0.05 * dt;
        b.timer -= dt;
        if (b.timer <= 0) b.phase = "seek";
      }
      const flap = visiting ? 0.12 + (Math.sin(b.flit * 0.7) * 0.5 + 0.5) * 0.16 : 0.5 + Math.sin(b.flit * 6) * 0.5;
      const tilt = visiting ? 0.12 + Math.sin(b.flit * 0.5) * 0.05 : Math.sin(b.flit) * 0.24;
      GE.drawButterfly(ctx, { x: b.x, y: b.y, s: U * 0.045, seed: b.sd, t: t, P: P, tilt: tilt, flap: flap });
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
    ctx.fillRect(-W * 0.4, horizonY, W * 1.8, H - horizonY);
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
    const G = H - horizonY;
    // perspective ripple lines: compressed and faint near the horizon, opening into bigger swells at her feet
    ctx.lineWidth = 1;
    const nLines = perfTier ? 11 : 15;
    for (let i = 0; i < nLines; i++) {
      const p = i / (nLines - 1), depth = p * p;                 // quadratic spacing = real perspective
      const yy = horizonY + G * (0.03 + depth * 0.95);
      const amp = 2 + depth * 15;                                // waves grow toward the viewer
      const spd = motionOn() ? T * 0.0011 * (0.6 + depth) : i;
      const o1 = Math.sin(spd + i * 1.7) * amp, o2 = Math.cos(spd * 0.8 + i * 2.3) * amp * 0.5;
      ctx.strokeStyle = "rgba(255,255,255," + (0.05 + depth * 0.22).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(-W * 0.4, yy);
      ctx.bezierCurveTo(W * 0.2 + o1, yy + amp * 0.16, W * 0.72 + o2, yy - amp * 0.12, W * 1.4, yy);
      ctx.stroke();
    }
    // short wavelets scattered over the surface, drifting downstream toward her — the "chop" of the river
    const nW = perfTier ? 14 : 22;
    const flow = motionOn() ? (T * 0.00004) % 1 : 0.35;
    for (let i = 0; i < nW; i++) {
      const pp = ((i * 0.293 + flow * (0.4 + (i % 3) * 0.28)) % 1);
      const yy = horizonY + G * (0.08 + pp * 0.88);
      const xx = ((i * 0.618) % 1) * W * 1.2 - W * 0.1 + Math.sin(i * 2.1) * 22;
      const len = 3 + pp * 15, edge = 1 - Math.abs(pp - 0.5) * 0.5;
      ctx.globalAlpha = (0.05 + pp * 0.2) * edge;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.7, pp * 1.6);
      ctx.beginPath();
      ctx.moveTo(xx - len, yy);
      ctx.quadraticCurveTo(xx, yy + pp * 3.5, xx + len, yy);
      ctx.stroke();
    }
    // a few slow specular glints twinkling on the surface
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 6; i++) {
      const gy = horizonY + G * (0.3 + (i * 0.13) % 0.66);
      const gx = ((i * 0.37 + (motionOn() ? T * 0.00002 * (1 + i % 3) : 0)) % 1) * W * 1.3 - W * 0.15;
      const tw = motionOn() ? Math.max(0, Math.sin(T * 0.003 + i * 1.9)) : 0.35;
      ctx.globalAlpha = 0.4 * tw;
      ctx.fillRect(gx, gy, 2 + (gy - horizonY) / G * 5, 1.3);
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
    ctx.moveTo(-W * 0.4, horizonY + 1);
    ctx.lineTo(W * 0.2, horizonY + 1);
    ctx.quadraticCurveTo(W * 0.12, H * 0.75, W * 0.07, H);
    ctx.lineTo(-W * 0.4, H);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W * 1.4, horizonY + 1);
    ctx.lineTo(W * 0.8, horizonY + 1);
    ctx.quadraticCurveTo(W * 0.88, H * 0.75, W * 0.93, H);
    ctx.lineTo(W * 1.4, H);
    ctx.closePath(); ctx.fill();
    for (const b of geo.bushes) {
      const onLeft = b.x + b.w * 0.9 < W * 0.2, onRight = b.x - b.w * 0.9 > W * 0.8;
      if (!onLeft && !onRight) continue;
      const c = shade(hexToRgb(th.foliage[b.c < 0.5 ? 1 : 0]), -0.14 * nf);
      blob(b.x, b.y, b.w * 0.8, b.h * 0.8, rgb(c));
    }
  }

  let boatDir = 1, boatModel = 0, boatHit = null, nestHit = null, robinFreezeT = 0;
  function drawBoat() {
    if (motionOn() && !document.hidden) {
      state.boatP += boatDir * (T - lastTs) * (0.9 + windAmp() * 0.5) / 90000;
      if (state.boatP >= 1) { state.boatP = 1; boatDir = -1; boatModel = 1 - boatModel; }
      else if (state.boatP <= 0) { state.boatP = 0; boatDir = 1; boatModel = 1 - boatModel; }
    }
    const bx = W * (0.27 + 0.46 * state.boatP);
    const by = horizonY + (H - horizonY) * 0.24;
    boatHit = { x: bx, y: by };
    const s = U * 0.3;
    const wl = by + s * 0.12;            // the water surface; the hull bobs against this fixed line
    // draw the sloop CLIPPED to above the waterline, so its bottom is genuinely under the water —
    // no shadow, no bowl, the river simply hides the submerged part of the hull
    ctx.save();
    ctx.beginPath(); ctx.rect(bx - s * 1.7, 0, s * 3.4, wl); ctx.clip();
    ctx.translate(bx, by);
    ctx.scale(boatDir, 1);
    GE.drawSailboat(ctx, { x: 0, y: 0, s: s, seed: boatModel ? 4 : 11, t: motionOn() ? T * 0.001 : 0, P: gePalette() });
    ctx.restore();
    boatWaterline(bx, s, wl);            // a soft foam line + a couple of small ripples hugging the hull
  }
  function boatWaterline(bx, s, wl) {
    const hw = s * 0.5, t = motionOn() ? T * 0.002 : 0;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.42)"; ctx.lineWidth = Math.max(1, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(bx - hw * 0.96, wl);
    ctx.quadraticCurveTo(bx, wl + s * 0.014, bx + hw * 0.96, wl);   // gentle smile of foam at the hull's waterline
    ctx.stroke();
    for (let i = 1; i <= 2; i++) {                                   // small ripples right at the hull, no wide fans
      ctx.globalAlpha = 0.14 - i * 0.035;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(0.8, s * 0.008);
      const rr = hw * (1.0 + i * 0.16), wob = motionOn() ? Math.sin(t + i) * s * 0.006 : 0;
      ctx.beginPath(); ctx.ellipse(bx, wl + s * 0.02 + wob, rr, s * (0.02 + i * 0.006), 0, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  // seagulls: a small flock crosses or loops through the far sky every ~20 seconds
  let gulls = [], gullTimer = 4000;
  function updateGulls(dt) {
    if (!state.sail.on) { if (gulls.length) gulls = []; return; }
    if (!motionOn()) return;
    gullTimer -= dt;
    if (gullTimer <= 0) {
      gullTimer = 18000 + Math.random() * 9000;
      const n = 1 + Math.floor(Math.random() * 3), dir = Math.random() < 0.5 ? 1 : -1;
      const baseY = horizonY * (0.16 + Math.random() * 0.4), loop = Math.random() < 0.35, size = U * (0.02 + Math.random() * 0.012);
      for (let i = 0; i < n; i++) gulls.push({ x: dir > 0 ? -30 - i * 34 : W + 30 + i * 34, y: baseY + i * 13 + (Math.random() - 0.5) * 18, dir: dir, spd: 0.3 + Math.random() * 0.22, ph: Math.random() * 6.28, size: size, loop: loop });
    }
    for (const g of gulls) { g.x += g.dir * g.spd * dt * 0.05; if (g.loop) g.y += Math.sin(g.x * 0.012 + g.ph) * 0.28; }
    gulls = gulls.filter(g => g.x > -50 && g.x < W + 50);
  }
  function drawGulls() {
    if (!gulls.length) return;
    ctx.save();
    ctx.strokeStyle = isNight() ? "rgba(150,160,180,0.42)" : "rgba(46,56,68,0.5)";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const g of gulls) {
      const s = g.size, flap = motionOn() ? (Math.sin(T * 0.009 + g.ph) * 0.5 + 0.5) : 0.5, up = s * (0.25 + flap * 0.55);
      ctx.lineWidth = Math.max(1, s * 0.14);
      ctx.beginPath();
      ctx.moveTo(g.x - s, g.y - up * 0.28);
      ctx.quadraticCurveTo(g.x - s * 0.4, g.y - up, g.x, g.y);
      ctx.quadraticCurveTo(g.x + s * 0.4, g.y - up, g.x + s, g.y - up * 0.28);
      ctx.stroke();
    }
    ctx.restore();
  }
  // a little lighthouse further upstream, on the far bank, with a slow blinking beam
  function drawLighthouse() {
    const g = H - horizonY, bx = W * 0.82, base = horizonY + g * 0.13, h = g * 0.17, w = h * 0.26;
    const night = isNight(), nf = clamp(1 - sunAltitude() * 3, 0, 1);
    const white = night ? "rgb(120,128,140)" : "rgb(236,231,220)";
    const red = night ? "rgb(112,66,62)" : "rgb(188,92,84)";
    const dark = night ? "rgb(52,60,70)" : "rgb(64,78,86)";
    const rockD = night ? "rgb(46,54,58)" : "rgb(96,102,100)";
    const rockL = night ? "rgb(66,76,80)" : "rgb(142,148,142)";
    ctx.save();
    // rocks around the base — a little clump the tower stands on
    const rk = (cx, cy, rw, rh) => {
      ctx.fillStyle = rockD;
      ctx.beginPath();
      ctx.moveTo(cx - rw, cy);
      ctx.bezierCurveTo(cx - rw, cy - rh, cx - rw * 0.35, cy - rh * 1.25, cx - rw * 0.05, cy - rh * 1.02);
      ctx.bezierCurveTo(cx + rw * 0.4, cy - rh * 1.2, cx + rw, cy - rh, cx + rw, cy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = rockL;
      ctx.beginPath(); ctx.ellipse(cx - rw * 0.16, cy - rh * 0.7, rw * 0.42, rh * 0.28, -0.35, 0, 6.2832); ctx.fill();
    };
    rk(bx - w * 1.0, base + h * 0.02, w * 0.7, h * 0.13);
    rk(bx + w * 1.05, base + h * 0.01, w * 0.75, h * 0.15);
    rk(bx - w * 0.35, base + h * 0.05, w * 0.6, h * 0.1);
    rk(bx + w * 0.42, base + h * 0.05, w * 0.55, h * 0.09);
    rk(bx, base + h * 0.07, w * 0.95, h * 0.12);
    // foundation plinth
    ctx.fillStyle = dark;
    ctx.fillRect(bx - w * 0.62, base - h * 0.06, w * 1.24, h * 0.09);
    // tapered shaft
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.moveTo(bx - w * 0.55, base - h * 0.05); ctx.lineTo(bx - w * 0.32, base - h);
    ctx.lineTo(bx + w * 0.32, base - h); ctx.lineTo(bx + w * 0.55, base - h * 0.05);
    ctx.closePath(); ctx.fill();
    // two red bands, narrowing with the taper
    const band = (yy, hh) => { const t0 = (base - yy) / h, hwB = w * (0.55 - 0.23 * t0); ctx.fillStyle = red; ctx.fillRect(bx - hwB, yy, hwB * 2, hh); };
    band(base - h * 0.34, h * 0.1);
    band(base - h * 0.66, h * 0.09);
    // soft shading down the right flank for volume
    ctx.fillStyle = night ? "rgba(0,0,0,0.12)" : "rgba(40,50,60,0.1)";
    ctx.beginPath();
    ctx.moveTo(bx + w * 0.1, base - h); ctx.lineTo(bx + w * 0.32, base - h); ctx.lineTo(bx + w * 0.55, base - h * 0.05); ctx.lineTo(bx + w * 0.3, base - h * 0.05);
    ctx.closePath(); ctx.fill();
    // gallery platform, then the lantern room
    ctx.fillStyle = dark;
    ctx.fillRect(bx - w * 0.42, base - h - h * 0.04, w * 0.84, h * 0.05);
    const lrw = w * 0.5, lrh = h * 0.16, lry = base - h - h * 0.04, cy = lry - lrh * 0.5;
    ctx.fillStyle = dark;
    ctx.fillRect(bx - lrw / 2, lry - lrh, lrw, lrh);
    // dome roof + finial
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(bx - lrw * 0.62, lry - lrh);
    ctx.quadraticCurveTo(bx, lry - lrh - h * 0.16, bx + lrw * 0.62, lry - lrh);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, lry - lrh - h * 0.15, w * 0.05, 0, 6.2832); ctx.fill();
    // the lantern glows and the beam sweeps left over the water
    const blink = motionOn() ? Math.pow(0.5 + 0.5 * Math.sin(T * 0.0021), 4) : 0.3;
    const winA = night ? (0.35 + 0.65 * blink) : (0.42 + 0.5 * blink);
    ctx.fillStyle = "rgba(255,242,196," + winA.toFixed(2) + ")";
    ctx.fillRect(bx - lrw * 0.32, cy - lrh * 0.3, lrw * 0.64, lrh * 0.6);
    if (blink > 0.04) {
      const lr = h * 0.65, a = (night ? 0.95 : 0.45 + nf * 0.25) * blink;
      const gl = ctx.createRadialGradient(bx, cy, 0, bx, cy, lr);
      gl.addColorStop(0, "rgba(255,240,190," + a.toFixed(2) + ")"); gl.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = gl; ctx.fillRect(bx - lr, cy - lr, lr * 2, lr * 2);
      ctx.globalAlpha = a * 0.45; ctx.fillStyle = "rgba(255,240,190,0.6)";
      ctx.beginPath(); ctx.moveTo(bx, cy); ctx.lineTo(bx - lr * 2.6, cy - lr * 0.5); ctx.lineTo(bx - lr * 2.6, cy + lr * 0.22); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
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
          ctx.drawImage(glowSprite(), fl.x - 8, fl.y - 8);
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
        ctx.drawImage(glowSprite(), fl.x - 8, fl.y - 8);
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
    const haze = k === "fog" ? 0.5 : clamp(Math.round(((state.aqi || 0) - 80) / 120 * 50) / 50, 0, 0.4);
    if (haze > 0.02) {
      const g = cachedGrad("fog:" + haze, () => {
        const gg = ctx.createLinearGradient(0, horizonY - H * 0.2, 0, H);
        gg.addColorStop(0, "rgba(226,230,228,0)");
        gg.addColorStop(0.5, "rgba(226,230,228," + (haze * 0.7) + ")");
        gg.addColorStop(1, "rgba(214,220,216," + haze + ")");
        return gg;
      });
      ctx.fillStyle = g; ctx.fillRect(-W * 0.4, horizonY - H * 0.2, W * 1.8, H - horizonY + H * 0.2);
    }
    if (state.weather.code >= 95 && motionOn() && state.settings.skyMode !== "cycle") {
      if (Math.random() < 0.004) flashT = 1;
      if (flashT > 0) { ctx.fillStyle = "rgba(255,255,255," + (flashT * 0.35) + ")"; ctx.fillRect(0, 0, W, horizonY); flashT -= 0.08; }
    }
  }

  function daylightWash() {
    const alt = sunAltitude();
    if (alt < 0.05) return;
    const df = dayFrac();
    const sx = Math.round(celestialX(df) / 12) * 12;             // bucket so the gradient caches
    const a = Math.round(0.1 * smooth(alt / 0.4) * 100) / 100;
    const g = cachedGrad("wash:" + sx + ":" + a, () => {
      const gg = ctx.createRadialGradient(sx, horizonY * 0.2, 0, sx, horizonY * 0.2, H * 0.9);
      gg.addColorStop(0, "rgba(255,246,214," + a + ")");
      gg.addColorStop(1, "rgba(255,246,214,0)");
      return gg;
    });
    ctx.fillStyle = g; ctx.fillRect(-W * 0.4, 0, W * 1.8, H);
  }

  const sky = { lines: [], ref: "", fs: 24, lh: 32, tw: 0, prog: 0, y: 160 };
  function verseFont(px) { return "italic 500 " + px + "px 'Playfair Display', Georgia, serif"; }
  function layoutVerse() {
    if (!state.curVerse) return;
    const v = state.curVerse;
    sky.fs = clamp(Math.round(U * 0.043), 15, 27);
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
  let verseGapUntil = 0;
  function driftActive() { return state.settings.autoRotate && motionOn(); }
  function drawSkyVerse() {
    if (!state.curVerse || !sky.lines.length) return;
    if (verseGapUntil) {
      if (Date.now() < verseGapUntil) return;   // seven quiet seconds of open sky
      verseGapUntil = 0;
      setVerse(pickVerse());
      return;
    }
    const dt = clamp(T - lastTs, 0, 80);
    if (driftActive() && !state.versePaused && !document.hidden) {
      sky.prog += dt / 42000;
      if (sky.prog >= 0.9) { verseGapUntil = Date.now() + 7000; return; }   // alpha hits zero by 0.9
    }
    if (!driftActive()) sky.prog = 0.5;
    const p = sky.prog;
    // quick entrance, slow crossing, quick exit
    const pe = 0.26 * p + 0.74 * (0.5 + 4 * Math.pow(p - 0.5, 3));
    const cxp = (W + sky.tw) * (1 - pe) - sky.tw / 2;
    const bob = motionOn() ? Math.sin(T * 0.0006) * U * 0.012 : 0;
    const yTop = sky.y + bob;
    const a = clamp(Math.min(p / 0.1, (1 - p) / 0.1, 1), 0, 1);
    if (a <= 0.01) return;
    const nightMode = sunAltitude() <= 0.09;
    // the verse rides one opaque cloud, sized so every line and the reference sit on solid white.
    // font math: text runs from the first line's caps down past the gold reference line.
    const nL = sky.lines.length;
    const boxTop = yTop - sky.fs * 0.78;
    const boxBot = yTop + (nL - 1) * sky.lh + sky.fs * 1.5;
    const coverW = sky.tw + sky.fs * 0.4;
    const coverH = boxBot - boxTop;
    drawVerseCloud(cxp, (boxTop + boxBot) / 2, coverW, coverH, sky.cseed || 7, a, nightMode);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = verseFont(sky.fs);
    ctx.shadowColor = "rgba(40,60,30,0.16)";
    ctx.shadowBlur = sky.fs * 0.16;
    ctx.fillStyle = nightMode ? "#2B3440" : "#243420";
    for (let i = 0; i < sky.lines.length; i++) {
      ctx.fillText(sky.lines[i], cxp, yTop + i * sky.lh);
    }
    ctx.shadowBlur = 0;
    ctx.font = "600 " + Math.max(11, Math.round(sky.fs * 0.44)) + "px 'DM Sans', sans-serif";
    ctx.fillStyle = "#9A7636";
    ctx.fillText(sky.ref.toUpperCase(), cxp, yTop + (sky.lines.length - 1) * sky.lh + sky.fs * 1.25);
    ctx.restore();
  }

  const perfNow = () => (window.performance && performance.now) ? performance.now() : (T || 0);
  function frame(ts) {
    requestAnimationFrame(frame);
    const now = ts || 0;
    if (document.hidden) return;                    // the browser pauses rAF when hidden; guard anyway
    // battery: cap the frame rate. The scene is atmospheric — 40fps while she interacts, 26 while it
    // breathes on its own, a trickle when everything is still. A capped loop draws far less than 60fps.
    const active = dragY !== null || cam > 0.001 || camTarget > 0.001 || Math.abs(panX - panTarget) > 0.5 || pinching || zoomScale > 1.01;
    const fps = active ? 40 : (motionOn() ? 26 : 6);
    if (now - T < 1000 / fps - 1.5) return;
    lastTs = T; T = now;
    const t0 = perfNow();

    if (dragY === null && (cam > 0.0005 || camTarget > 0)) {
      camVel += (camTarget - cam) * 0.026;          // soft spring, settles ~600ms
      camVel *= 0.86;
      cam = clamp(cam + camVel, 0, 1);
      if (Math.abs(cam - camTarget) < 0.001 && Math.abs(camVel) < 0.0005) { cam = camTarget; camVel = 0; }
    }
    if (dragAxis !== "h") panX += (panTarget - panX) * 0.12;
    ctx.clearRect(0, 0, W, H);
    const oy = camOffset();
    drawZenith(oy);
    // parallax: far layers slide less than the foreground as she pans, for real depth.
    // the sun still travels a little (0.5), just not as far as the garden (1.0).
    const lay = (f, fn) => { ctx.save(); ctx.translate(-panX * f, oy); fn(); ctx.restore(); };
    lay(0, drawSky);
    lay(0.1, drawStars);
    lay(0.5, drawRays);
    lay(0.6, drawClouds);
    lay(0.5, drawCelestial);
    if (state.sail.on) { updateGulls(T - lastTs); lay(0.55, drawGulls); }   // seagulls cross the far sky
    lay(0.35, drawRidges);          // distant mountains drift slowly
    ctx.save();
    ctx.translate(-panX, oy);        // foreground: the garden moves fully with her
    if (state.sail.on) {
      drawWater(); drawBanks(); drawLighthouse(); drawTreeline(true); daylightWash(); drawBoat();
    } else {
      drawGround(); drawTreeline(false); daylightWash(); drawGardenScene();
    }
    ctx.restore();
    drawAmbient();
    drawWeather();
    drawFog();
    ctx.save();
    ctx.translate(0, oy * 0.35);                    // verse cloud rides mid-parallax
    drawSkyVerse();
    ctx.restore();
    drawSkyHud();
    document.body.classList.toggle("skyview", cam > 0.25);   // chrome bows out while looking up

    const drawMs = perfNow() - t0;                  // tier off ACTUAL draw cost, not the capped interval
    if (drawMs >= 0 && drawMs < 400) ftAvg += (drawMs - ftAvg) * 0.05;
    if (++tierCheck >= 120) {
      tierCheck = 0;
      if (perfTier === 0 && ftAvg > 24) { perfTier = 1; floraEvery = 3; initParticles(); }
      else if (perfTier === 1 && ftAvg < 12) { perfTier = 0; floraEvery = 2; initParticles(); }
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    U = Math.min(W, H);
    horizonY = H * (H > W ? 0.52 : 0.6);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    clearArtCaches();
    buildScene();
  }

  const el = id => document.getElementById(id);

  function allVerses() { return VERSES.concat(state.customVerses); }
  function currentMood() {
    if (cam > 0.5) return "power";        // looking up into the sky calls for verses of His power
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
    verseGapUntil = 0;
    let hsh = 0; for (let i = 0; i < v.ref.length; i++) hsh = (hsh * 31 + v.ref.charCodeAt(i)) >>> 0;
    sky.cseed = 7 + (hsh % 9973);
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
    const gq = (q) => "https://www.google.com/search?q=" + encodeURIComponent(q + " " + state.loc.place);
    el("temp-link").href = gq("weather");
    el("hb-rain-link").href = gq("hourly rain forecast");
    el("hb-wind-link").href = gq("wind forecast");
    el("hb-cloud-link").href = gq("cloud cover forecast");
    const aqiEl = el("cond-aqi");
    aqiEl.href = gq("air quality");
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
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day,precipitation&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=2";
      const r = await fetch(url); if (!r.ok) throw 0;
      const j = await r.json(), c = j.current;
      state.weather = { code: c.weather_code, temp: Math.round(c.temperature_2m), cloud: c.cloud_cover, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, isDay: c.is_day, precip: c.precipitation };
      if (j.daily && j.daily.sunrise) state.sun = { sunrise: minutesOf(j.daily.sunrise[0]), sunset: minutesOf(j.daily.sunset[0]), off: j.utc_offset_seconds != null ? j.utc_offset_seconds : null };
      if (j.hourly && j.hourly.time) {
        const hh = j.hourly;
        let i0 = hh.time.indexOf(c.time.slice(0, 13) + ":00");
        if (i0 < 0) i0 = 0;
        const take = (arr) => arr.slice(i0, i0 + 24);
        state.hourly = { t: take(hh.time), tp: take(hh.temperature_2m), at: take(hh.apparent_temperature), pp: take(hh.precipitation_probability), pr: take(hh.precipitation), code: take(hh.weather_code), cc: take(hh.cloud_cover), ws: take(hh.wind_speed_10m), wd: take(hh.wind_direction_10m), wg: take(hh.wind_gusts_10m) };
      }
      persist(); updateConditions(); initParticles(); renderHours();
      if (state.loc2) fetchHourly2();
    } catch (e) { updateConditions(); }
  }
  async function fetchHourly2() {
    if (!state.loc2) return;
    try {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + state.loc2.lat + "&longitude=" + state.loc2.lon + "&current=temperature_2m&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=2";
      const r = await fetch(url); if (!r.ok) return;
      const j = await r.json(), hh = j.hourly;
      if (!hh || !hh.time) return;
      let i0 = j.current && j.current.time ? hh.time.indexOf(j.current.time.slice(0, 13) + ":00") : 0;
      if (i0 < 0) i0 = 0;
      const take = (arr) => arr.slice(i0, i0 + 24);
      state.hourly2 = { t: take(hh.time), tp: take(hh.temperature_2m), at: take(hh.apparent_temperature), pp: take(hh.precipitation_probability), pr: take(hh.precipitation), code: take(hh.weather_code), cc: take(hh.cloud_cover), ws: take(hh.wind_speed_10m), wd: take(hh.wind_direction_10m), wg: take(hh.wind_gusts_10m) };
      persist(); renderHours();
    } catch (e) {}
  }
  async function fetchDaily() {
    try {
      const { lat, lon } = state.loc;
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant" +
        "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=10";
      const r = await fetch(url); if (!r.ok) { dailyFail(); return; }
      const j = await r.json(), d = j.daily;
      if (!d || !d.time) { dailyFail(); return; }
      state.daily = {
        time: d.time, code: d.weather_code, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min,
        atmax: d.apparent_temperature_max, atmin: d.apparent_temperature_min, sunrise: d.sunrise, sunset: d.sunset,
        uv: d.uv_index_max, psum: d.precipitation_sum, pop: d.precipitation_probability_max,
        wmax: d.wind_speed_10m_max, wgust: d.wind_gusts_10m_max, wdir: d.wind_direction_10m_dominant,
        off: j.utc_offset_seconds != null ? j.utc_offset_seconds : null
      };
      persist(); renderDaily();
    } catch (e) { dailyFail(); }
  }
  function dailyFail() {
    // keep any cached forecast on screen; only offer a retry when we have nothing to show
    if (state.daily) return;
    const w = el("daily-list"); if (!w) return;
    w.innerHTML = "<p class='empty-note'>The ten‑day sky is out of reach just now. Tap to try again.</p>";
    w.onclick = () => { w.innerHTML = "<p class='empty-note'>Gathering the ten‑day sky…</p>"; fetchDaily(); };
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
  async function fetchRadar() {
    try {
      const r = await fetch("https://api.rainviewer.com/public/weather-maps.json"); if (!r.ok) return;
      const j = await r.json();
      if (j.radar && j.radar.past && j.radar.past.length) {
        state.rv = { host: j.host, frames: j.radar.past.slice(-19) };   // up to ~3 hours of frames
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
  function refreshData() { fetchWeather(); fetchDaily(); fetchAqi(); }   // radar loads only when she opens it

  function openRadar() {
    const v = el("map-view"); if (v) v.__centered = false;
    renderHours();        // the cloud-cover strip in the radar sheet
    updateSat();          // build the map and show whatever frames are cached
    openSheet("radar");
    fetchRadar();         // pull fresh frames from the network — tiles load only now, not in the background
  }

  // radar over an OpenStreetMap 2x2 tile grid centered on her location, with a pin
  function mercXY(lat, lon, z) {
    const n = Math.pow(2, z);
    const xf = (lon + 180) / 360 * n;
    const rad = lat * Math.PI / 180;
    const yf = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
    return { xf: xf, yf: yf, n: n };
  }
  function fmtLocalTime(unixSec) {
    // times in HER timezone (the garden's location), friendly 12-hour clock
    const off = state.sun.off != null ? state.sun.off : -new Date().getTimezoneOffset() * 60;
    const d = new Date((unixSec + off) * 1000);
    let hh = d.getUTCHours();
    const ap = hh >= 12 ? "PM" : "AM";
    hh = hh % 12 || 12;
    const mm = d.getUTCMinutes();
    return hh + ":" + (mm < 10 ? "0" : "") + mm + " " + ap;
  }
  // the whole continental US at zoom 7; tiles load lazily as she scrolls
  const US = { z: 7, x0: 18, x1: 39, y0: 43, y1: 53 };
  let radarImgs = [];
  // On Android/web a service worker cached radar tiles, so a frame's 242 tiles resolved instantly
  // and in step. iOS file:// can't run the SW, so updateSat() preloads a whole frame off-DOM and
  // commits every tile at once (below); this Map lets repeat frames in a session skip the network.
  // It holds URL strings only (not Image objects) so memory stays tiny — decoded bitmaps are the
  // browser's to keep or evict.
  const radarTileCache = new Map();
  let satGen = 0;
  function buildUsMap() {
    const grid = el("map-grid");
    const cols = US.x1 - US.x0 + 1, rows = US.y1 - US.y0 + 1;
    grid.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
    grid.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
    const wrap = grid.parentElement;
    wrap.style.width = (cols * 100 / 3) + "%";
    wrap.style.aspectRatio = cols + " / " + rows;
    grid.innerHTML = ""; radarImgs = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
      const base = document.createElement("img");
      base.alt = ""; base.loading = "lazy"; base.decoding = "async";
      base.src = "https://tile.openstreetmap.org/" + US.z + "/" + (US.x0 + gx) + "/" + (US.y0 + gy) + ".png";
      base.style.gridArea = (gy + 1) + " / " + (gx + 1);
      grid.appendChild(base);
      const rad = document.createElement("img");
      rad.alt = ""; rad.loading = "lazy"; rad.decoding = "async"; rad.className = "radar-tile";
      rad.style.gridArea = (gy + 1) + " / " + (gx + 1);
      rad.__tx = US.x0 + gx; rad.__ty = US.y0 + gy;
      // a failed tile (a rate-limit hiccup) retries with backoff, then goes transparent — never a broken box
      rad.onerror = () => {
        rad.__err = (rad.__err || 0) + 1;
        const want = rad.__want;
        if (rad.__err <= 3 && want) setTimeout(() => { if (rad.__want === want) { rad.removeAttribute("src"); rad.src = want; } }, 500 * rad.__err);
        else rad.removeAttribute("src");
      };
      grid.appendChild(rad);
      radarImgs.push(rad);
    }
    grid.dataset.built = "us";
  }
  // radar map: two fingers pinch to grow the map up to ~5x the view; one finger still pans it
  function setupRadarZoom() {
    const view = el("map-view"), wrap = el("map-wrap"); if (!view || !wrap) return;
    const pts = new Map();
    let startDist = 0, startZoom = 1, mz = 1;
    function setZoom(z, midX, midY) {
      z = clamp(z, 1, 3);                      // 165% base × 3 ≈ 5x the view
      const prev = mz; mz = z;
      wrap.style.width = (165 * mz).toFixed(1) + "%";
      if (midX != null && prev > 0) {          // hold the pinched point steady while it grows
        const rect = view.getBoundingClientRect(), lx = midX - rect.left, ly = midY - rect.top;
        view.scrollLeft = (view.scrollLeft + lx) * (mz / prev) - lx;
        view.scrollTop = (view.scrollTop + ly) * (mz / prev) - ly;
      }
      el("map-zoom-reset").style.display = mz > 1.02 ? "" : "none";
    }
    view.addEventListener("pointerdown", e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const p = [...pts.values()]; startDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1; startZoom = mz; }
    });
    view.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const p = [...pts.values()], dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        setZoom(startZoom * dist / startDist, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        e.preventDefault();
      }
    });
    const end = e => pts.delete(e.pointerId);
    view.addEventListener("pointerup", end);
    view.addEventListener("pointercancel", end);
    el("map-zoom-reset").onclick = () => setZoom(1);
    view.__resetZoom = () => setZoom(1);
  }
  // Fill a radar frame progressively: her location's tiles first (nearest), then the rest of the US
  // fanning outward, throttled. Loading all ~240 cross-origin tiles at once overwhelmed a phone and
  // tore the frame into squares; this keeps her area instant and is gentle on the tile server.
  // `jobs` must be pre-sorted nearest-first.
  function loadRadarFrame(jobs, gen) {
    const CONC = 6;      // concurrent fetches — instant near her, still easy on the server
    const BURST = 18;    // her immediate area: no pacing delay
    const PACE = 120;    // ms between later tiles -> the whole US fills over ~25-30s
    let i = 0, inflight = 0;
    (function pump() {
      if (gen !== satGen) return;                       // frame changed (scrub) -> abandon this fill
      while (inflight < CONC && i < jobs.length) {
        const job = jobs[i], paced = i >= BURST; i++; inflight++;
        loadRadarTile(job, gen, () => {
          inflight--;
          if (gen !== satGen) return;
          if (paced) setTimeout(pump, PACE); else pump();
        });
      }
    })();
  }
  // Commit a tile's image only AFTER it has actually decoded, so the visible <img> paints from cache
  // rather than kicking off its own late network load (that late, out-of-order load was the tearing).
  // A straggler lets the scheduler advance but still commits itself if/when it arrives on the current frame.
  function loadRadarTile(job, gen, done) {
    const rad = job.rad, url = job.url;
    const show = () => { if (gen === satGen) { rad.__want = url; rad.__err = 0; if (rad.src !== url) rad.src = url; } };
    if (radarTileCache.has(url)) { show(); done(); return; }   // already fetched this session -> instant
    const im = new Image(); let moved = false;
    const move = () => { if (!moved) { moved = true; done(); } };   // advance the scheduler once
    im.onload = () => { radarTileCache.set(url, true); show(); move(); };
    im.onerror = move;                                              // skip; the visible tile's onerror retry covers real failures
    setTimeout(move, 8000);                                         // don't let one straggler stall the fan-out
    im.src = url;
  }
  function updateSat() {
    const grid = el("map-grid"); if (!grid) return;
    if (grid.dataset.built !== "us") buildUsMap();
    const m = mercXY(state.loc.lat, state.loc.lon, US.z);
    const frames = state.rv && state.rv.frames || [];
    el("sat-scrub").min = -(Math.max(1, frames.length) - 1);
    const idx = frames.length ? clamp(frames.length - 1 + (+el("sat-scrub").value), 0, frames.length - 1) : -1;
    const fr = idx >= 0 ? frames[idx] : null;
    const gen = ++satGen;                            // a newer scrub abandons this frame's fill
    if (!fr) {
      for (const rad of radarImgs) { rad.__want = null; rad.removeAttribute("src"); }
    } else {
      // Order tiles by distance from her location, then fill outward (see loadRadarFrame): her area
      // is instant and coherent, the rest of the US trickles in over ~30s without a request storm.
      const jobs = radarImgs.map(rad => {
        const dx = rad.__tx + 0.5 - m.xf, dy = rad.__ty + 0.5 - m.yf;
        return {
          rad,
          url: state.rv.host + fr.path + "/256/" + US.z + "/" + rad.__tx + "/" + rad.__ty + "/2/1_1.png",
          d: dx * dx + dy * dy,
        };
      }).sort((a, b) => a.d - b.d);
      loadRadarFrame(jobs, gen);
    }
    grid.classList.toggle("radar-off", el("radar-toggle").textContent.indexOf("off") >= 0);
    const cols = US.x1 - US.x0 + 1, rows = US.y1 - US.y0 + 1;
    const pin = document.querySelector(".map-pin");
    if (pin) {
      pin.style.left = ((m.xf - US.x0) / cols * 100) + "%";
      pin.style.top = ((m.yf - US.y0) / rows * 100) + "%";
    }
    el("sat-time").textContent = fr
      ? fmtLocalTime(fr.time) + " \u00b7 " + Math.max(0, Math.round((Date.now() / 1000 - fr.time) / 60)) + " min ago"
      : "Radar loading";
    const view = el("map-view");
    if (view && !view.__centered) {
      view.__centered = true;
      requestAnimationFrame(() => {
        view.scrollLeft = view.scrollWidth * ((m.xf - US.x0) / cols) - view.clientWidth / 2;
        view.scrollTop = view.scrollHeight * ((m.yf - US.y0) / rows) - view.clientHeight / 2;
      });
    }
  }

  function hourLabel(t, i) {
    if (i === 0) return "Now";
    const h = +t.slice(11, 13);
    return (h % 12 || 12) + " " + (h >= 12 ? "PM" : "AM");
  }
  let hoursView = 0;   // 0 = her town, 1 = the second place
  function renderHours() {
    if (hoursView === 1 && !state.loc2) hoursView = 0;
    const h = hoursView === 1 ? state.hourly2 : state.hourly;
    const lb = el("hloc-1");
    if (lb) lb.textContent = state.loc2 ? state.loc2.place.split(",")[0] : "+ Add a place";
    document.querySelectorAll("#hours-loc button").forEach(b => b.classList.toggle("on", +b.dataset.l === hoursView));
    const l2row = el("loc2-row");
    if (l2row) l2row.style.display = hoursView === 1 || (!state.loc2 && hoursView === 0) ? (hoursView === 1 ? "" : "none") : "none";
    if (!h || !h.t.length) {
      if (hoursView === 1) el("hours-temp").innerHTML = el("hours-rain").innerHTML = el("hours-wind").innerHTML = "<p class='empty-note'>Fetching the sky over " + state.loc2.place.split(",")[0] + "...</p>";
      return;
    }
    const rainEl = el("hours-rain"), windEl = el("hours-wind"), tempEl = el("hours-temp"), cloudEl = el("hours-cloud");
    let rh = "", wh = "", th = "", ch = "";
    const n = Math.min(12, h.t.length);
    let tMin = 999, tMax = -999;
    for (let i = 0; i < n; i++) { if (h.tp[i] < tMin) tMin = h.tp[i]; if (h.tp[i] > tMax) tMax = h.tp[i]; }
    if (tMax - tMin < 6) { tMax += 3; tMin -= 3; }
    for (let i = 0; i < n; i++) {
      rh += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar'><i style='width:" + clamp(h.pp[i], 2, 100) + "%'></i></span><span class='hval'>" + h.pp[i] + "% <small>" + (+h.pr[i]).toFixed(2) + " in</small></span></div>";
      wh += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar wind'><i style='width:" + clamp(h.ws[i] / 32 * 100, 3, 100) + "%'></i></span><span class='hval'><span class='harrow' style='transform:rotate(" + ((h.wd[i] + 180) % 360) + "deg)'>&#8593;</span> " + Math.round(h.ws[i]) + " <small>g " + Math.round(h.wg[i]) + " mph</small></span></div>";
      const fl = h.at && h.at[i] != null ? Math.round(h.at[i]) : null;
      th += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar temp'><i style='width:" + clamp((h.tp[i] - tMin) / (tMax - tMin) * 100, 4, 100) + "%'></i></span><span class='hval'>" + Math.round(h.tp[i]) + "&deg; air" + (fl != null ? " <small>feels " + fl + "&deg;</small>" : "") + "</span></div>";
    }
    for (let i = 0; i < Math.min(8, h.t.length); i++) {
      ch += "<div class='hour-row'><span class='hlab'>" + hourLabel(h.t[i], i) + "</span><span class='hbar cloud'><i style='width:" + clamp(h.cc[i], 2, 100) + "%'></i></span><span class='hval'>" + h.cc[i] + "% <small>" + Math.round(h.tp[i]) + "&deg;</small></span></div>";
    }
    rainEl.innerHTML = rh;
    windEl.innerHTML = wh;
    if (tempEl) tempEl.innerHTML = th;
    cloudEl.innerHTML = ch;
    updateHoursBar();
  }

  function uvText(uv) {
    if (uv == null) return "";
    if (uv < 3) return "Low"; if (uv < 6) return "Moderate"; if (uv < 8) return "High"; if (uv < 11) return "Very high"; return "Extreme";
  }
  const COMPASS16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  function windDirText(deg) { return COMPASS16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }
  function fmtClock(iso) {
    const t = (iso || "").split("T")[1]; if (!t) return "";
    let hh = +t.slice(0, 2); const mm = t.slice(3, 5);
    const ap = hh >= 12 ? "PM" : "AM"; hh = hh % 12 || 12;
    return hh + ":" + mm + " " + ap;
  }
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayName(iso, i) {
    if (i === 0) return "Today";
    const d = new Date(iso + "T00:00:00Z");
    return isNaN(d) ? iso : DOW[d.getUTCDay()];
  }
  function shortDate(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return isNaN(d) ? "" : MON[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function renderDaily() {
    const wrap = el("daily-list"); if (!wrap) return;
    wrap.onclick = null;   // drop any retry-tap handler left by dailyFail()
    const d = state.daily;
    el("daily-place").textContent = state.loc.place + " · next ten days";
    el("daily-google").href = "https://www.google.com/search?q=" + encodeURIComponent("10 day weather forecast " + state.loc.place);
    if (!d || !d.time || !d.time.length) {
      wrap.innerHTML = "<p class='empty-note'>Gathering the ten‑day sky…</p>";
      return;
    }
    const n = Math.min(10, d.time.length);
    let lo = 999, hi = -999;
    for (let i = 0; i < n; i++) { if (d.tmin[i] < lo) lo = d.tmin[i]; if (d.tmax[i] > hi) hi = d.tmax[i]; }
    const span = Math.max(1, hi - lo);
    let html = "";
    for (let i = 0; i < n; i++) {
      const w = wxLabel(d.code[i]);
      const l = clamp((d.tmin[i] - lo) / span * 100, 0, 100);
      const rr = clamp((d.tmax[i] - lo) / span * 100, 0, 100);
      const width = Math.max(rr - l, 6);
      // anchor the fill's gradient to the whole track so hue tracks the week's actual min–max,
      // not just each bar's own length — a cold day reads cool, a hot day reads warm
      const bgSize = (10000 / width).toFixed(1);
      const bgPos = (width < 100 ? l / (100 - width) * 100 : 0).toFixed(1);
      const pop = d.pop && d.pop[i] != null ? d.pop[i] : 0;
      const popCell = pop >= 5 ? "<span class='glyph'>&#128167;</span>" + pop + "%" : "";
      const dir = d.wdir && d.wdir[i] != null ? d.wdir[i] : 0;
      const rain = d.psum && d.psum[i] != null ? +d.psum[i] : 0;
      const uv = d.uv && d.uv[i] != null ? Math.round(d.uv[i]) : null;
      const flo = Math.round(d.atmin && d.atmin[i] != null ? d.atmin[i] : d.tmin[i]);
      const fhi = Math.round(d.atmax && d.atmax[i] != null ? d.atmax[i] : d.tmax[i]);
      const gust = Math.round(d.wgust && d.wgust[i] != null ? d.wgust[i] : d.wmax[i]);
      const mp = moonPhaseAt(Date.parse(d.time[i] + "T12:00:00Z"));
      html +=
        "<div class='day'>" +
          "<button class='day-row' aria-expanded='false' aria-controls='dd-" + i + "'>" +
            "<span class='day-name'><b>" + dayName(d.time[i], i) + "</b><small>" + shortDate(d.time[i]) + "</small></span>" +
            "<span class='day-glyph' title='" + w[0] + "'>" + w[1] + "</span>" +
            "<span class='day-pop'>" + popCell + "</span>" +
            "<span class='day-range'><i class='lo'>" + Math.round(d.tmin[i]) + "&deg;</i>" +
              "<span class='track'><span class='fill' style='left:" + l.toFixed(1) + "%;width:" + width.toFixed(1) + "%;background-size:" + bgSize + "% 100%;background-position:" + bgPos + "% 0'></span></span>" +
              "<i class='hi'>" + Math.round(d.tmax[i]) + "&deg;</i></span>" +
            "<span class='day-caret' aria-hidden='true'><svg width='14' height='14' viewBox='0 0 16 16' fill='none'><path d='M4 6l4 4 4-4' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg></span>" +
          "</button>" +
          "<div class='day-detail' id='dd-" + i + "' hidden>" +
            "<div class='dd-grid'>" +
              "<div><span class='dd-k'>" + w[0] + "</span><span class='dd-v'>feels " + flo + "&deg; to " + fhi + "&deg;</span></div>" +
              "<div><span class='dd-k'>Wind</span><span class='dd-v'><span class='harrow' style='transform:rotate(" + ((dir + 180) % 360) + "deg)'>&#8593;</span> " + Math.round(d.wmax[i]) + " <small>gust " + gust + " mph " + windDirText(dir) + "</small></span></div>" +
              "<div><span class='dd-k'>Rain</span><span class='dd-v'>" + (pop >= 5 ? pop + "% chance" : "none likely") + (rain > 0.004 ? " <small>" + rain.toFixed(2) + " in</small>" : "") + "</span></div>" +
              (uv != null ? "<div><span class='dd-k'>UV index</span><span class='dd-v'>" + uv + " <small>" + uvText(uv) + "</small></span></div>" : "") +
              "<div><span class='dd-k'>Sunrise</span><span class='dd-v'>" + fmtClock(d.sunrise[i]) + "</span></div>" +
              "<div><span class='dd-k'>Sunset</span><span class='dd-v'>" + fmtClock(d.sunset[i]) + "</span></div>" +
              "<div><span class='dd-k'>Moon</span><span class='dd-v'>" + moonGlyph(mp) + " " + moonName(mp) + "</span></div>" +
            "</div>" +
          "</div>" +
        "</div>";
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll(".day-row").forEach(btn => {
      btn.onclick = () => {
        const det = btn.nextElementSibling;
        const open = det.hasAttribute("hidden");
        wrap.querySelectorAll(".day-detail").forEach(x => x.setAttribute("hidden", ""));
        wrap.querySelectorAll(".day-row").forEach(x => x.setAttribute("aria-expanded", "false"));
        if (open) { det.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
      };
    });
  }

  function fmtMin(min) {
    let h = Math.floor((((min % 1440) + 1440) % 1440) / 60), m = Math.round(min % 60);
    const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return h + ":" + (m < 10 ? "0" : "") + m + " " + ap;
  }
  function openSky(which) {
    const body = el("sky-body"), hero = el("sky-hero"), note = el("sky-note");
    const cell = (k, v) => "<div><span class='dd-k'>" + k + "</span><span class='dd-v'>" + v + "</span></div>";
    if (which === "sun") {
      el("sky-title").innerHTML = "The <span class='em'>sun</span>";
      hero.textContent = "☀️";
      const sr = state.sun.sunrise, ss = state.sun.sunset;
      const dl = (ss > sr ? ss - sr : (1440 - sr) + ss) / 60;
      const uv = state.daily && state.daily.uv && state.daily.uv[0] != null ? Math.round(state.daily.uv[0]) : null;
      const alt = sunAltitude();
      let h = cell("Sunrise", fmtMin(sr)) + cell("Sunset", fmtMin(ss)) + cell("Daylight", fmtDur(dl));
      if (uv != null) h += cell("UV index today", uv + " <small>" + uvText(uv) + "</small>");
      h += cell("Right now", alt <= 0.02 ? "below the horizon" : alt > 0.55 ? "high overhead" : alt > 0.2 ? "climbing the sky" : "low in the sky");
      body.innerHTML = h;
      note.textContent = "Sunrise and sunset are the real times over " + state.loc.place + " today.";
    } else {
      el("sky-title").innerHTML = "The <span class='em'>moon</span>";
      const p = moonPhase();
      hero.textContent = moonGlyph(p);
      const illum = Math.round((1 - Math.cos(p * 2 * Math.PI)) / 2 * 100);
      const toFull = (((0.5 - p) % 1) + 1) % 1, toNew = (((1 - p) % 1) + 1) % 1;
      body.innerHTML = cell("Phase", moonName(p)) + cell("Illuminated", illum + "%") +
        cell("Trend", p < 0.5 ? "waxing — growing" : "waning — shrinking") +
        cell("Next full moon", Math.max(0, Math.round(toFull * 29.53)) + " days") +
        cell("Next new moon", Math.max(0, Math.round(toNew * 29.53)) + " days");
      note.textContent = "The moon phase is computed on the device and works offline.";
    }
    openSheet("sky");
  }

  let toastTimer = null;
  function toast(msg) {
    const t = el("toast"); t.textContent = msg; t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function themeList() {
    return PRESET_ORDER.map(id => ({ id: id, name: THEMES[id].name, th: THEMES[id] }))
      .concat(state.custom.map(c => ({ id: "custom:" + c.id, name: c.name, th: c })));
  }
  function buildThemeChips() {
    // one Scenes button in the dock; the gardens live in their own sheet
    const cur = themeList().find(t => t.id === state.themeId);
    el("scenes-label").textContent = cur ? cur.name : "Scenes";
    const wrap = el("scenes-list"); wrap.innerHTML = "";
    for (const t of themeList()) {
      const row = document.createElement("button");
      row.className = "scene-row" + (t.id === state.themeId ? " active" : "");
      const dot = document.createElement("span");
      dot.className = "sw-dot";
      dot.style.background = "linear-gradient(135deg," + t.th.foliage[1] + " 0 55%," + t.th.bloom[0] + " 55%)";
      const name = document.createElement("b");
      name.textContent = t.name;
      const mark = document.createElement("span");
      mark.className = "scene-check";
      mark.innerHTML = t.id === state.themeId ? "<svg width='16' height='16' viewBox='0 0 16 16' fill='none'><path d='M2.5 8.5l3.4 3.4L13.5 4.3' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>" : "";
      row.appendChild(dot); row.appendChild(name); row.appendChild(mark);
      row.onclick = () => { setTheme(t.id); closeSheet(); toast(t.name); };
      if (t.id.indexOf("custom:") === 0) {
        const pencil = document.createElement("span");
        pencil.className = "scene-design";
        pencil.setAttribute("role", "button");
        pencil.setAttribute("aria-label", "Place plants in " + t.name);
        pencil.innerHTML = "<svg width='17' height='17' viewBox='0 0 17 17' fill='none'><path d='M2.5 14.5l1-3.6 8-8a1.6 1.6 0 0 1 2.3 0l.3.3a1.6 1.6 0 0 1 0 2.3l-8 8-3.6 1Z' stroke='currentColor' stroke-width='1.5' stroke-linejoin='round'/></svg>";
        pencil.onclick = (ev) => { ev.stopPropagation(); startPlacing(t.id.slice(7)); };
        row.appendChild(pencil);
      }
      wrap.appendChild(row);
    }
    const add = document.createElement("button");
    add.className = "scene-row ghost";
    add.innerHTML = "<span class='sw-dot plus-dot'>+</span><b>Create a garden</b>";
    add.onclick = () => { closeSheet(); openCreator(); };
    wrap.appendChild(add);
  }
  function setTheme(id) { state.themeId = id; persist(); buildThemeChips(); buildScene(); }

  const CREATOR = { foliage: 1, bloom: 0, density: 0.7, ambient: "petals", water: true, warmBias: 0, slate: "template" };
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
    THEMES["__preview__"] = { name: "Preview", foliage: FOLIAGE_SETS[CREATOR.foliage], bloom: BLOOM_SETS[CREATOR.bloom], ambient: CREATOR.ambient, water: CREATOR.water && CREATOR.slate !== "blank", density: CREATOR.density, warmBias: CREATOR.warmBias, slate: CREATOR.slate };
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
    CREATOR.slate = "template";
    document.querySelectorAll("#slate-seg button").forEach(x => x.classList.toggle("on", x.dataset.v === "template"));
    openSheet("creator");
    previewCreator();
  }
  function saveCreator() {
    const name = (el("theme-name").value || "").trim() || "My Garden";
    const id = "c" + Date.now().toString(36);
    const th = { id: id, name: name, foliage: FOLIAGE_SETS[CREATOR.foliage], bloom: BLOOM_SETS[CREATOR.bloom], ambient: CREATOR.ambient, water: CREATOR.water && CREATOR.slate !== "blank", density: CREATOR.density, warmBias: CREATOR.warmBias, slate: CREATOR.slate, placed: [], pondAt: null };
    state.custom.push(th);
    state.themeId = "custom:" + id;
    delete THEMES["__preview__"];
    persist(); buildThemeChips(); buildScene();
    closeSheet(); toast("Saved " + name);
    return id;
  }

  // an interactive walk: each step spotlights a real control in place, or teaches a gesture
  const TOUR = [
    { sel: null, title: "Her Secret Garden", body: "Everything here is alive — the sky, the light, and the weather all follow the real sky over the town at the top. Here is a quick walk through it." },
    { sel: "#loc-chip", title: "Where she is", body: "Tap the town name to move the whole garden anywhere. Everything refreshes to that place's real sky." },
    { sel: "#temp-link", title: "Today's sky", body: "The live temperature and conditions right now. Tap it to open the forecast on Google." },
    { sel: null, title: "Scripture on the clouds", body: "A verse drifts across the sky on its own white cloud. Tap anywhere in the sky for a new one — or pause and step it with the buttons up there." },
    { sel: "#open-hours", title: "Hourly sky", body: "The weather book: rain, temperature, and wind hour by hour — for her town and one more place she picks." },
    { sel: "#open-daily", title: "Ten-day forecast", body: "New. The whole week ahead and more. Tap any day for feels-like, wind, UV, sunrise, sunset, and that night's moon." },
    { sel: "#open-radar", title: "Rain radar", body: "A live rain map centered on her town, a little pin where she is. Drag it to look around the region." },
    { sel: "#open-scenes", title: "Gardens & scenes", body: "Five gardens, a Catskill evening, and a maker for her own. While planting, tuck the tray away with its chevron to plant right up at the front." },
    { sel: "#sail-toggle", title: "The river", body: "Turn the garden into a river with a sailing sloop. In sailing mode a Routes planner appears — plan a voyage, or a road trip that names every town and its sky." },
    { sel: "#open-compass", title: "Compass & stars", body: "The rose follows the phone in her hand. Switch to the star finder to see which constellations are overhead right now." },
    { sel: "#open-verses", title: "Her own verses", body: "Write any words, or a verse of her own, and they join the ones drifting through the sky." },
    { sel: "#open-about", title: "Settings & this tour", body: "Location, sky time, and preferences live here — and the “Show the tour” button brings this walk back any time." },
    { sel: null, title: "Look up", body: "Pull the garden down gently, like a curtain, to look straight up into today's real clouds. On a clear forecast it is nothing but blue sky. Double-tap up there to part the clouds." },
    { sel: null, title: "Lean in", body: "Pinch with two fingers to zoom up to 2× and study the scene. It drifts gently back out on its own after a few seconds." },
    { sel: null, title: "The robin's nest", body: "See the robin's nest up in the willow? Tap it any time to walk this tour again. Enjoy the garden." }
  ];
  let tourIdx = 0, coachTimer = 0;
  function coachTarget(step) { return step.sel ? document.querySelector(step.sel) : null; }
  function positionCoach(step, tries) {
    clearTimeout(coachTimer);
    const spot = el("coach-spot"), card = el("coach-card"), t = coachTarget(step);
    card.classList.remove("above", "below", "mid");
    if (t) {
      const r = t.getBoundingClientRect();
      if ((r.width < 4 || r.height < 4) && (tries || 0) < 24) {   // control still animating open — wait for layout
        coachTimer = setTimeout(() => positionCoach(step, (tries || 0) + 1), 40);
        return;
      }
      const p = 8;
      spot.classList.remove("bare");
      spot.style.left = (r.left - p) + "px"; spot.style.top = (r.top - p) + "px";
      spot.style.width = (r.width + p * 2) + "px"; spot.style.height = (r.height + p * 2) + "px";
      if (r.top < window.innerHeight * 0.5) { card.classList.add("below"); card.style.top = (r.bottom + 14) + "px"; card.style.bottom = "auto"; }
      else { card.classList.add("above"); card.style.bottom = (window.innerHeight - r.top + 14) + "px"; card.style.top = "auto"; }
    } else {
      spot.classList.add("bare");
      spot.style.left = "50%"; spot.style.top = "50%"; spot.style.width = "0px"; spot.style.height = "0px";
      card.classList.add("mid"); card.style.top = "50%"; card.style.bottom = "auto";
    }
  }
  function renderTour() {
    const step = TOUR[tourIdx];
    closeSheet();                                   // clear any open sheet so the real control shows
    el("drawer").classList.remove("closed");        // and the drawer is open where its buttons live
    el("drawer-handle").setAttribute("aria-expanded", "true");
    camTarget = 0;                                  // come back down from any look-up
    el("coach-count").textContent = (tourIdx + 1) + " of " + TOUR.length;
    el("coach-title").textContent = step.title;
    el("coach-body").textContent = step.body;
    el("coach-back").style.visibility = tourIdx === 0 ? "hidden" : "visible";
    el("coach-next").textContent = tourIdx === TOUR.length - 1 ? "Done" : "Next";
    const dots = el("coach-dots"); dots.innerHTML = "";
    TOUR.forEach((_, i) => { const d = document.createElement("span"); d.className = "tdot" + (i === tourIdx ? " on" : ""); dots.appendChild(d); });
    positionCoach(step);
  }
  let coachOpen = false;
  function openTour() {
    tourIdx = 0; coachOpen = true;
    const c = el("coach");
    c.hidden = false;
    renderTour();
    void c.offsetWidth;                 // reflow so the fade-in transition runs (no rAF dependency)
    c.classList.add("show");
  }
  function closeTour() {
    coachOpen = false;
    clearTimeout(coachTimer);
    const c = el("coach");
    c.classList.remove("show");
    setTimeout(() => { if (!coachOpen) c.hidden = true; }, 260);   // guard against a quick re-open
  }
  function tourStep(d) { const n = tourIdx + d; if (n < 0) return; if (n >= TOUR.length) { closeTour(); return; } tourIdx = n; renderTour(); }

  // ---------- garden designer: tap to plant ----------
  const PLACE_KINDS = [
    { k: "willow", t: "tree", n: "Willow" }, { k: "cherry", t: "tree", n: "Cherry" }, { k: "oak", t: "tree", n: "Oak" },
    { k: "birch", t: "tree", n: "Birch" }, { k: "conifer", t: "tree", n: "Pine" },
    { k: "daisy", t: "flower", n: "Daisy" }, { k: "tulip", t: "flower", n: "Tulip" }, { k: "rose", t: "flower", n: "Rose" },
    { k: "lavender", t: "flower", n: "Lavender" }, { k: "foxglove", t: "flower", n: "Foxglove" },
    { k: "bush", t: "bush", n: "Bush" }, { k: "pond", t: "pond", n: "Pond" }
  ];
  const PLACE_GROUPS = [["Trees", "tree"], ["Flowers", "flower"], ["Features", "bush", "pond"]];
  let placing = null;
  function placingTheme() {
    if (!placing) return null;
    return state.custom.find(c => c.id === placing.themeId) || null;
  }
  function buildPlaceBar() {
    const wrap = el("place-kinds"); wrap.innerHTML = "";
    for (const grp of PLACE_GROUPS) {
      const row = document.createElement("div");
      row.className = "place-group";
      const lab = document.createElement("span");
      lab.className = "place-label";
      lab.textContent = grp[0];
      row.appendChild(lab);
      for (const pk of PLACE_KINDS) {
        if (grp.indexOf(pk.t) < 1) continue;
        const b = document.createElement("button");
        b.className = "chip" + (placing && placing.kind === pk.k ? " active" : "");
        b.textContent = pk.n;
        b.onclick = () => { placing.kind = pk.k; buildPlaceBar(); };
        row.appendChild(b);
      }
      wrap.appendChild(row);
    }
    const pk = placing && PLACE_KINDS.find(p => p.k === placing.kind);
    if (pk && pk.t === "tree") {                 // trees can be planted small, medium, or large
      const row = document.createElement("div");
      row.className = "place-group";
      const lab = document.createElement("span"); lab.className = "place-label"; lab.textContent = "Size"; row.appendChild(lab);
      [["Small", 0.68], ["Medium", 1], ["Large", 1.38]].forEach(sz => {
        const b = document.createElement("button");
        b.className = "chip" + (Math.abs((placing.size || 1) - sz[1]) < 0.01 ? " active" : "");
        b.textContent = sz[0];
        b.onclick = () => { placing.size = sz[1]; buildPlaceBar(); };
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    const th = placingTheme();
    el("place-count").textContent = th && th.placed ? th.placed.length + " / 100" : "";
    el("place-active").textContent = pk ? pk.n + (pk.t === "tree" ? " · " + (placing.size === 0.68 ? "small" : placing.size === 1.38 ? "large" : "medium") : "") : "";
  }
  function startPlacing(themeId) {
    state.themeId = "custom:" + themeId;
    persist(); buildThemeChips(); buildScene();
    placing = { themeId: themeId, kind: "daisy", size: 1 };
    buildPlaceBar();
    el("placebar").style.display = "";
    el("placebar").classList.remove("min");
    el("place-min").setAttribute("aria-expanded", "true");
    el("drawer").classList.add("closed");
    closeSheet();
    toast("Tap the garden to plant. Higher up sits farther away — tuck the tray to reach the front.");
  }
  function stopPlacing() {
    placing = null;
    el("placebar").style.display = "none";
    el("drawer").classList.remove("closed");
    persist();
    toast("Her garden, kept");
  }
  function placeAt(x, y) {
    const th = placingTheme(); if (!th) return;
    if (y < horizonY + 4 || y > H - 8) { toast("Plant on the ground, below the hills"); return; }
    const nx = clamp(((x + panX) / W + 0.35) / 1.7, 0, 1);
    const ny = clamp((y - horizonY) / (H - horizonY), 0.02, 1);
    const pk = PLACE_KINDS.find(p => p.k === placing.kind);
    if (pk.t === "pond") {
      th.pondAt = { nx: nx, ny: ny };
      toast(ny > 0.55 ? "A wide pond, right at her feet" : "A pond, off toward the hills");
    } else {
      th.placed = th.placed || [];
      if (th.placed.length >= 100) { toast("The garden is full \u2014 one hundred plantings"); return; }
      th.placed.push({ kind: pk.k, t: pk.t, nx: nx, ny: ny, seed: Math.floor(Math.random() * 9999), size: pk.t === "tree" ? (placing.size || 1) : 1 });
      el("place-count").textContent = th.placed.length + " / 100";
    }
    persist(); buildScene();
  }

  function openSheet(which) {
    el("sheet-" + which).classList.add("open");
    el("sheet-backdrop").classList.add("open");
  }
  function closeSheet() {
    document.body.classList.remove("starfield");
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
    renderBinds();
    openSheet("about");
  }
  function renderBinds() {
    const wrap = el("binds-list"); if (!wrap) return;
    wrap.innerHTML = "";
    for (const t of BIND_TARGETS) {
      const row = document.createElement("div");
      row.className = "bind-row";
      const lab = document.createElement("span");
      lab.className = "bind-target";
      lab.textContent = t.label;
      const sel = document.createElement("select");
      sel.className = "bind-select";
      sel.setAttribute("aria-label", t.label + " opens");
      for (const a of BIND_ACTIONS) {
        const o = document.createElement("option");
        o.value = a.k; o.textContent = a.label;
        if ((state.settings.binds[t.k] || "none") === a.k) o.selected = true;
        sel.appendChild(o);
      }
      sel.onchange = () => { state.settings.binds[t.k] = sel.value; persist(); };
      row.appendChild(lab); row.appendChild(sel);
      wrap.appendChild(row);
    }
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

  let compassSeen = false, starMode = false, lastHeading = 0;
  // sensor headings arrive jumpy and late — a critically-damped spring glides the rose between them
  let roseCur = 0, roseVel = 0, roseRaf = 0;
  function roseLoop() {
    const sheetOpen = el("sheet-compass").classList.contains("open");
    const delta = ((lastHeading - roseCur + 540) % 360) - 180;  // shortest arc, wraps 359->0 cleanly
    roseVel += delta * 0.018;
    roseVel *= 0.88;
    roseCur = (roseCur + roseVel + 360) % 360;
    el("compass-rose").style.transform = "rotate(" + (-roseCur) + "deg)";
    if (sheetOpen || Math.abs(delta) > 0.2 || Math.abs(roseVel) > 0.05) roseRaf = requestAnimationFrame(roseLoop);
    else roseRaf = 0;
  }
  function startRose() { if (!roseRaf) roseRaf = requestAnimationFrame(roseLoop); }
  function compassNote() {
    if (starMode) {
      const alt = Math.round(Math.abs(state.loc.lat));
      return "Face north, then look up about " + alt + "° — roughly halfway between the horizon and straight overhead. That still, steady point is the North Star. The Big Dipper's two outer bowl stars point straight at it.";
    }
    return compassSeen ? "You are facing " + compassPt(lastHeading) + " (" + Math.round(lastHeading) + "°). The gold star marks north — Polaris lives there." : "Hold the phone flat and turn — the rose follows the real sky.";
  }
  function onHeading(e) {
    if (!el("sheet-compass").classList.contains("open")) return;
    let h = null;
    if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;
    else if (e.alpha != null && (e.absolute || e.type === "deviceorientationabsolute")) h = 360 - e.alpha;
    if (h == null) return;
    compassSeen = true;
    const prevH = lastHeading;
    lastHeading = ((h % 360) + 360) % 360;
    startRose();
    el("compass-note").textContent = compassNote();
    if (Math.abs(((lastHeading - prevH + 540) % 360) - 180) > 4) drawConstPreview();
  }
  let skyList = [], skyAt = 0, moonSky = null;
  function moonEquatorial(date) {
    // low-precision lunar position (a few degrees off at worst; plenty for a dial glyph)
    const d = (date.getTime() / 86400000) - 10957.5;
    const rad = Math.PI / 180;
    const L = (218.316 + 13.176396 * d) * rad;
    const M = (134.963 + 13.064993 * d) * rad;
    const F = (93.272 + 13.229350 * d) * rad;
    const lon = L + 6.289 * rad * Math.sin(M);
    const lat = 5.128 * rad * Math.sin(F);
    const e = 23.439 * rad;
    const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
    const dec = Math.asin(Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon));
    return { ra: ((ra / rad / 15) + 24) % 24, dec: dec / rad };
  }
  function refreshSkyList() {
    if (!window.Constellations) return;
    const now = new Date();
    skyList = Constellations.list(state.loc.lat, state.loc.lon, now);
    const me = moonEquatorial(now);
    const aa = Constellations.altAz(me.ra, me.dec, state.loc.lat, state.loc.lon, now);
    moonSky = { az: aa.az, alt: aa.alt, up: aa.alt > 2, phase: moonPhase() };
    skyAt = Date.now();
    drawRoseGlyphs();
  }
  function drawRoseGlyphs() {
    const c = el("rose-canvas"); if (!c || !skyList.length) return;
    const cs = Math.round(c.parentElement.getBoundingClientRect().width) || 190;
    if (c.width !== cs * 2) { c.width = cs * 2; c.height = cs * 2; }
    const g = c.getContext("2d");
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, cs, cs);
    const cx = cs / 2, cy = cs / 2, rad = cs * 0.335;
    for (const sc of skyList) {
      if (!sc.up) continue;
      const a = (sc.az - 90) * Math.PI / 180;   // dial frame: 0 deg = N = top of the rose
      const gx = cx + Math.cos(a) * rad, gy = cy + Math.sin(a) * rad;
      const box = Math.max(20, cs * 0.13);
      g.strokeStyle = "rgba(154,118,54,0.75)";
      g.fillStyle = "rgba(154,118,54,0.9)";
      g.lineWidth = 1;
      for (const ln of sc.preview.lines) {
        const p1 = sc.preview.pts[ln[0]], p2 = sc.preview.pts[ln[1]];
        g.beginPath();
        g.moveTo(gx - box / 2 + p1[0] * box, gy - box / 2 + p1[1] * box);
        g.lineTo(gx - box / 2 + p2[0] * box, gy - box / 2 + p2[1] * box);
        g.stroke();
      }
      for (const p of sc.preview.pts) {
        g.beginPath(); g.arc(gx - box / 2 + p[0] * box, gy - box / 2 + p[1] * box, 1.1, 0, 6.2832); g.fill();
      }
      g.font = "600 " + Math.max(7, Math.round(cs * 0.042)) + "px 'DM Sans', sans-serif";
      g.textAlign = "center";
      g.fillStyle = "rgba(61,75,54,0.85)";
      g.fillText(sc.name.slice(0, 3).toUpperCase(), gx, gy + box / 2 + 8);
    }
    if (moonSky && moonSky.up) {
      const a = (moonSky.az - 90) * Math.PI / 180;
      const gx = cx + Math.cos(a) * rad, gy = cy + Math.sin(a) * rad;
      const mr = Math.max(5, cs * 0.032), pph = moonSky.phase;
      g.fillStyle = "rgba(140,150,172,0.55)";
      g.beginPath(); g.arc(gx, gy, mr, 0, 6.2832); g.fill();
      const cosA = Math.cos(pph * 2 * Math.PI);
      g.fillStyle = "#EDE7D8";
      g.beginPath();
      g.arc(gx, gy, mr, -Math.PI / 2, Math.PI / 2, pph >= 0.5);
      g.ellipse(gx, gy, Math.max(0.001, mr * Math.abs(cosA)), mr, 0, Math.PI / 2, Math.PI * 1.5, cosA <= 0);
      g.closePath(); g.fill();
      g.font = "600 " + Math.max(7, Math.round(cs * 0.042)) + "px 'DM Sans', sans-serif";
      g.textAlign = "center";
      g.fillStyle = "rgba(154,118,54,0.9)";
      g.fillText("MOON", gx, gy + mr + 9);
    }
  }
  function drawConstPreview() {
    const c = el("const-canvas"); if (!c || !window.Constellations) return;
    if (!skyList.length || Date.now() - skyAt > 60000) refreshSkyList();
    const near = Constellations.nearest(skyList, lastHeading);
    const g = c.getContext("2d");
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 260, 110);
    if (!near) { el("const-note").textContent = "No bright constellation is up that way just now."; return; }
    const box = 84, gx = 130 - box / 2, gy = 55 - box / 2 + 4;
    g.strokeStyle = "#9A7636"; g.lineWidth = 1.6; g.lineCap = "round";
    for (const ln of near.preview.lines) {
      const p1 = near.preview.pts[ln[0]], p2 = near.preview.pts[ln[1]];
      g.beginPath(); g.moveTo(gx + p1[0] * box, gy + p1[1] * box); g.lineTo(gx + p2[0] * box, gy + p2[1] * box); g.stroke();
    }
    g.fillStyle = "#B4894D";
    for (const p of near.preview.pts) { g.beginPath(); g.arc(gx + p[0] * box, gy + p[1] * box, 2.4, 0, 6.2832); g.fill(); }
    const alt = near.alt < 25 ? "low" : near.alt < 55 ? "midway up" : "high overhead";
    let noteText = near.name + " \u2014 " + alt + " toward the " + compassPt(near.az);
    if (moonSky) {
      noteText += moonSky.up
        ? " \u00b7 " + moonName(moonSky.phase).toLowerCase() + " toward the " + compassPt(moonSky.az)
        : " \u00b7 the moon is below the horizon";
    }
    el("const-note").textContent = noteText;
  }
  function openCompass() {
    openSheet("compass");
    if (starMode) document.body.classList.add("starfield");
    refreshSkyList();
    drawConstPreview();
    startRose();
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {});
    el("compass-note").textContent = compassNote();
    setTimeout(() => {
      if (!compassSeen && el("sheet-compass").classList.contains("open") && !starMode) {
        el("compass-note").textContent = "No compass sensor here. Near sunset the sun sits west; face away from it at dawn and you look west too.";
      }
    }, 1500);
  }

  async function planTrip() {
    const fromQ = (el("trip-from").value || "").trim() || state.trip.from;
    const toQ = (el("trip-to").value || "").trim() || state.trip.to;
    el("trip-list").innerHTML = "<p class='empty-note'>Charting the road...</p>";
    try {
      const A = await geocode(fromQ), B = await geocode(toQ);
      if (!A || !B) { el("trip-list").innerHTML = "<p class='empty-note'>Couldn't find those places. Try town, state.</p>"; return; }
      const r = await fetch("https://router.project-osrm.org/route/v1/driving/" + A.lon + "," + A.lat + ";" + B.lon + "," + B.lat + "?overview=full&geometries=geojson&annotations=duration");
      if (!r.ok) throw 0;
      const j = await r.json();
      const route = j.routes && j.routes[0]; if (!route) throw 0;
      const coords = route.geometry.coordinates;
      const durs = route.legs[0].annotation.duration;
      const total = route.duration;
      // ponytail: one sample per 30 driving minutes, stretched on very long trips to cap API load at ~15 points
      const stepS = Math.max(1800, total / 14);
      const samples = [{ lat: A.lat, lon: A.lon, sec: 0, name: A.place.split(",")[0] }];
      let acc = 0, next = stepS;
      for (let i = 0; i < durs.length; i++) {
        acc += durs[i];
        if (acc >= next && i + 1 < coords.length) { const c = coords[i + 1]; samples.push({ lat: c[1], lon: c[0], sec: acc, name: null }); next += stepS; }
      }
      samples.push({ lat: B.lat, lon: B.lon, sec: total, name: B.place.split(",")[0] });
      await Promise.all(samples.map(async s => {
        if (s.name) return;
        try {
          const rr = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" + s.lat + "&longitude=" + s.lon + "&localityLanguage=en");
          const g = await rr.json();
          s.name = String(g.locality || g.city || "On the road").replace(/^(Town|Village|City) of /, "").replace(/[<>&]/g, "");
        } catch (e) { s.name = "On the road"; }
      }));
      const lats = samples.map(s => s.lat.toFixed(3)).join(","), lons = samples.map(s => s.lon.toFixed(3)).join(",");
      const wr = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lats + "&longitude=" + lons + "&current=weather_code&hourly=precipitation_probability,weather_code&forecast_days=2&timezone=auto");
      const wj = await wr.json();
      const arr = Array.isArray(wj) ? wj : [wj];
      const rows = [];
      let prevName = "";
      samples.forEach((s, i) => {
        if (s.name === prevName && i !== samples.length - 1) return;
        prevName = s.name;
        let pp = null, code = null;
        const w = arr[i];
        if (w && w.hourly && w.hourly.time) {
          const cur = w.current && w.current.time ? w.hourly.time.indexOf(w.current.time.slice(0, 13) + ":00") : 0;
          const idx = clamp((cur < 0 ? 0 : cur) + Math.round(s.sec / 3600), 0, w.hourly.time.length - 1);
          pp = w.hourly.precipitation_probability[idx];
          code = w.hourly.weather_code[idx];
        }
        rows.push({ name: s.name, min: Math.round(s.sec / 60), pp: pp, code: code });
      });
      state.trip = { from: A.place, to: B.place, plan: { at: Date.now(), totalMin: Math.round(total / 60), rows: rows } };
      persist(); renderTrip();
    } catch (e) {
      el("trip-list").innerHTML = "<p class='empty-note'>The road service is out of reach right now. Try again in a moment.</p>";
    }
  }
  function renderTrip() {
    el("trip-from").value = state.trip.from;
    el("trip-to").value = state.trip.to;
    const wrap = el("trip-list"), plan = state.trip.plan;
    if (!plan) { wrap.innerHTML = "<p class='empty-note'>Plan the drive and every half hour of road gets its town and its sky.</p>"; el("trip-total").textContent = ""; return; }
    wrap.innerHTML = "";
    plan.rows.forEach(rw => {
      const d = document.createElement("div");
      d.className = "trip-row";
      const rainy = rw.pp != null && (rw.pp >= 40 || (rw.code >= 51 && rw.code < 80));
      // arrival clock is straight from the real driving time the map service returned
      d.innerHTML = "<span class='hlab'>" + (rw.min === 0 ? "leave now" : "~" + clockFromNow(rw.min / 60)) + "</span><b>" + rw.name + "</b><span class='hval'>" + (rw.code != null ? wxLabel(rw.code)[1] + " " : "") + (rw.pp != null ? rw.pp + "%" + (rainy ? " rain" : "") : "") + "</span>";
      wrap.appendChild(d);
    });
    el("trip-total").textContent = "About " + fmtDur(plan.totalMin / 60) + " of real road time. Each town's sky is its forecast for the hour you actually reach it.";
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
  function clockFromNow(hours) {   // wall-clock time this many hours from now (her device time)
    const dt = new Date(Date.now() + hours * 3600000);
    let hh = dt.getHours(); const mm = dt.getMinutes();
    const ap = hh >= 12 ? "PM" : "AM"; hh = hh % 12 || 12;
    const day = hours >= 24 ? " " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] : "";
    return hh + ":" + (mm < 10 ? "0" : "") + mm + " " + ap + day;
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
    for (let i = 0; i < n; i += 3) { const hr = +h.t[i].slice(11, 13); g.fillText(i === 0 ? "now" : (hr % 12 || 12) + (hr >= 12 ? "p" : "a"), xs(i), chh - 4); }
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
  function favKey(o) { return o.name; }
  function isFav(name) { return state.favs.some(f => f.name === name); }
  function toggleFav(stop) {
    const i = state.favs.findIndex(f => f.name === stop.name);
    if (i >= 0) state.favs.splice(i, 1);
    else state.favs.push({ name: stop.name, lat: stop.lat, lon: stop.lon });
    persist(); renderFavs(); renderRoute();
  }
  function renderFavs() {
    const field = el("fav-field"), wrap = el("fav-list");
    if (!field) return;
    field.style.display = state.favs.length ? "" : "none";
    wrap.innerHTML = "";
    state.favs.forEach(f => {
      const c = document.createElement("button");
      c.className = "chip fav-chip";
      c.innerHTML = "<span class='fav-star'>★</span>" + f.name.split(",")[0];
      c.title = "Add " + f.name + " as a stop";
      c.onclick = () => {
        if (state.sail.stops.some(st => st.name === f.name)) { toast("Already on the route"); return; }
        const stop = { id: "s" + Date.now().toString(36), name: f.name, lat: f.lat, lon: f.lon, temp: null, wind: null, code: null };
        state.sail.stops.push(stop);
        persist(); renderRoute(); fetchStopWx(stop);
        toast("Added " + f.name.split(",")[0]);
      };
      wrap.appendChild(c);
    });
  }
  function renderRoute() {
    const wrap = el("stop-list");
    const stops = state.sail.stops;
    const kn = state.sail.speed || 5;
    document.querySelectorAll("#speed-seg button").forEach(b => b.classList.toggle("on", +b.dataset.v === kn));
    if (!stops.length) { wrap.innerHTML = "<p class='empty-note'>Add harbors and towns along her way. Each stop carries its own hourly temperature and wind chart, plus course and sail time for every leg.</p>"; el("route-total").textContent = ""; return; }
    wrap.innerHTML = "";
    let total = 0, cumNm = 0;
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
        total += d; cumNm += d;
        const brg = bearingDeg(p.lat, p.lon, s.lat, s.lon);
        leg = d.toFixed(1) + " nm · " + Math.round(brg) + "° " + compassPt(brg) + " · " + fmtDur(d / kn) + " · arrive ~" + clockFromNow(cumNm / kn) + " · ";
      }
      sm.textContent = leg + (s.temp != null ? s.temp + "° · wind " + s.wind + " mph" : "fetching sky...");
      main.appendChild(b); main.appendChild(sm);
      const fav = document.createElement("button");
      fav.className = "mini fav" + (isFav(s.name) ? " on" : "");
      fav.setAttribute("aria-label", isFav(s.name) ? "Remove favorite" : "Save favorite");
      fav.textContent = isFav(s.name) ? "★" : "☆";
      fav.onclick = () => toggleFav(s);
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
      row.appendChild(mv); row.appendChild(main); row.appendChild(fav); row.appendChild(exp); row.appendChild(go); row.appendChild(del);
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
    el("route-total").textContent = stops.length > 1 ? "About " + total.toFixed(1) + " nautical miles end to end, roughly " + fmtDur(total / kn) + " under sail at " + kn + " kn — arriving about " + clockFromNow(total / kn) + "." : "";
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
    el("open-route").classList.toggle("gold", on);
    el("open-hours").classList.toggle("gold", !on);
    el("mode-boat").style.display = on ? "none" : "";
    el("mode-garden").style.display = on ? "" : "none";
    persist(); initParticles();
    toast(on ? "Sailing mode. Fair winds." : "Back to the garden.");
    if (on && !state.sail.stops.length) { renderRoute(); openSheet("route"); }
  }

  function wire() {
    el("verse-next").onclick = () => setVerse(pickVerse());
    const pause = el("verse-pause");
    pause.onclick = () => {
      state.paused = !state.paused;                       // freeze the whole scene, not just the verse
      pause.setAttribute("aria-pressed", state.paused ? "true" : "false");
      pause.setAttribute("aria-label", state.paused ? "Resume the scene" : "Pause the scene");
      pause.textContent = state.paused ? "▶" : "❚❚";
      toast(state.paused ? "The garden holds still" : "The garden stirs again");
    };
    el("open-about").onclick = openAbout;
    el("sheet-backdrop").onclick = closeSheet;
    document.querySelectorAll(".sheet-close").forEach(b => b.onclick = closeSheet);
    el("save-theme").onclick = saveCreator;
    el("design-theme").onclick = () => { const id = saveCreator(); startPlacing(id); };
    document.querySelectorAll("#slate-seg button").forEach(b => b.onclick = () => {
      CREATOR.slate = b.dataset.v;
      document.querySelectorAll("#slate-seg button").forEach(x => x.classList.toggle("on", x === b));
      previewCreator();
    });
    el("place-done").onclick = stopPlacing;
    el("place-min").onclick = () => {
      const min = el("placebar").classList.toggle("min");
      el("place-min").setAttribute("aria-expanded", min ? "false" : "true");
      el("place-min").setAttribute("aria-label", min ? "Open the planting tray" : "Minimize the planting tray");
      if (min) toast("Tray tucked away — plant right up front");
    };
    el("place-undo").onclick = () => {
      const th = placingTheme(); if (!th) return;
      if (th.placed && th.placed.length) th.placed.pop();
      else th.pondAt = null;
      persist(); buildScene();
    };
    el("place-clear").onclick = () => {
      const th = placingTheme(); if (!th) return;
      th.placed = []; th.pondAt = null;
      persist(); buildScene();
      toast("A fresh start");
    };
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
    el("open-hours").onclick = () => { renderHours(); openSheet("hours"); };
    el("open-daily").onclick = () => { renderDaily(); openSheet("daily"); if (!state.daily) fetchDaily(); };
    document.querySelectorAll("#hours-loc button").forEach(b => b.onclick = () => {
      const v = +b.dataset.l;
      if (v === 1 && !state.loc2) { el("loc2-row").style.display = ""; el("loc2-input").focus(); return; }
      hoursView = v;
      renderHours();
    });
    const setLoc2 = async () => {
      const q = (el("loc2-input").value || "").trim(); if (!q) return;
      toast("Searching");
      const g = await geocode(q);
      if (!g) { toast("Place not found"); return; }
      state.loc2 = g;
      el("loc2-input").value = "";
      hoursView = 1;
      persist(); renderHours();
      await fetchHourly2();
      toast("Watching the sky over " + g.place.split(",")[0]);
    };
    el("loc2-go").onclick = setLoc2;
    el("loc2-input").addEventListener("keydown", e => { if (e.key === "Enter") setLoc2(); });
    el("open-radar").onclick = () => { const v = el("map-view"); if (v && v.__resetZoom) v.__resetZoom(); openRadar(); };
    document.querySelectorAll("#hours-tabs button").forEach(b => b.onclick = () => {
      document.querySelectorAll("#hours-tabs button").forEach(x => x.classList.toggle("on", x === b));
      el("hours-rain").style.display = b.dataset.t === "rain" ? "" : "none";
      el("hours-wind").style.display = b.dataset.t === "wind" ? "" : "none";
      el("hours-temp").style.display = b.dataset.t === "temp" ? "" : "none";
    });
    let satThrottle = 0;
    el("sat-scrub").oninput = () => {   // throttle while dragging so we don't flood the tile server
      const now = Date.now();
      if (now - satThrottle >= 130) { satThrottle = now; updateSat(); }
    };
    el("sat-scrub").addEventListener("change", updateSat);   // and always render the frame she lands on
    el("radar-toggle").onclick = () => {
      const r = el("sat-radar");
      r.classList.toggle("on");
      el("radar-toggle").textContent = r.classList.contains("on") ? "Rain radar on" : "Rain radar off";
    };
    setupRadarZoom();
    el("open-verses").onclick = () => { renderCvList(); openSheet("verses"); };
    el("cv-save").onclick = saveCustomVerse;
    el("sail-toggle").onclick = () => setSailing(!state.sail.on);
    el("open-route").onclick = () => { renderRoute(); renderTrip(); renderFavs(); openSheet("route"); };
    el("loc-chip").onclick = openAbout;
    el("drawer-handle").onclick = () => {
      const closed = el("drawer").classList.toggle("closed");
      el("drawer-handle").setAttribute("aria-expanded", closed ? "false" : "true");
    };
    el("stop-add").onclick = addStop;
    el("stop-input").addEventListener("keydown", e => { if (e.key === "Enter") addStop(); });
    el("open-scenes").onclick = () => {
      buildThemeChips();
      document.querySelectorAll("#backdrop-seg button").forEach(b => b.classList.toggle("on", b.dataset.v === state.settings.backdrop));
      openSheet("scenes");
    };
    document.querySelectorAll("#backdrop-seg button").forEach(b => b.onclick = () => {
      state.settings.backdrop = b.dataset.v;
      document.querySelectorAll("#backdrop-seg button").forEach(x => x.classList.toggle("on", x === b));
      persist();
      toast(b.dataset.v === "mountains" ? "The Catskills rise beyond the garden" : "Rolling hills beyond the garden");
    });
    el("open-tour").onclick = () => { closeSheet(); openTour(); };
    el("binds-reset").onclick = () => { state.settings.binds = Object.assign({}, DEFAULT_BINDS); persist(); renderBinds(); toast("Shortcuts reset"); };
    el("coach-next").onclick = () => tourStep(1);
    el("coach-back").onclick = () => tourStep(-1);
    el("coach-skip").onclick = closeTour;
    window.addEventListener("resize", () => { if (!el("coach").hidden) positionCoach(TOUR[tourIdx]); });
    el("open-compass").onclick = openCompass;
    window.addEventListener("deviceorientationabsolute", onHeading);
    window.addEventListener("deviceorientation", onHeading);
    document.querySelectorAll("#compass-mode button").forEach(b => b.onclick = () => {
      starMode = b.dataset.v === "star";
      document.body.classList.toggle("starfield", starMode);
      document.querySelectorAll("#compass-mode button").forEach(x => x.classList.toggle("on", x === b));
      el("compass-note").textContent = compassNote();
      drawConstPreview();
    });
    el("trip-go").onclick = planTrip;
    el("trip-from").addEventListener("keydown", e => { if (e.key === "Enter") planTrip(); });
    el("trip-to").addEventListener("keydown", e => { if (e.key === "Enter") planTrip(); });
    document.querySelectorAll("#speed-seg button").forEach(b => b.onclick = () => { state.sail.speed = +b.dataset.v; persist(); renderRoute(); });
    const stage = document.querySelector(".stage");
    let tapTimer = null, lastTap = 0, longPressTimer = null, longPressed = false;
    stage.addEventListener("pointerdown", e => {
      if (e.target !== stage) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        dragY = null; dragMoved = false; dragAxis = null;   // a second finger means pinch, not drag
        clearTimeout(longPressTimer); longPressTimer = null;
        const p = [...pointers.values()];
        pinchStartDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        pinchStartScale = zoomScale;
        pinchOx = (p[0].x + p[1].x) / 2; pinchOy = (p[0].y + p[1].y) / 2;
        cv.style.transition = ""; pinching = true;
        if (zoomTimer) { clearTimeout(zoomTimer); zoomTimer = null; }
        return;
      }
      if (pointers.size > 2) return;
      dragY = e.clientY; dragX0 = e.clientX; dragMoved = false; dragAxis = null;
      camAt = cam; panAt = panX;
      stage.setPointerCapture(e.pointerId);        // keep the drag even when the finger wanders
      longPressed = false;                          // press and hold ~0.5s to open a scene shortcut
      clearTimeout(longPressTimer);
      const lpx = e.clientX, lpy = e.clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (dragMoved || dragAxis || pinching || placing) return;
        longPressed = true;
        if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
        doLongPress(lpx, lpy);
      }, 480);
    });
    stage.addEventListener("pointermove", e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching && pointers.size >= 2) {
        const p = [...pointers.values()];
        const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        applyZoom(clamp(pinchStartScale * (dist / pinchStartDist), 1, 2), pinchOx, pinchOy);
        return;
      }
      if (dragY === null) return;
      const dy = e.clientY - dragY, dx = e.clientX - dragX0;
      if (!dragAxis && (Math.abs(dy) > 10 || Math.abs(dx) > 10)) {
        dragAxis = Math.abs(dy) >= Math.abs(dx) ? "v" : "h";
        dragMoved = true;
        clearTimeout(longPressTimer); longPressTimer = null;   // moving means a drag, not a long-press
      }
      if (dragAxis === "v") cam = clamp(camAt + dy / (H * 0.55), 0, 1);
      else if (dragAxis === "h" && cam < 0.3) panX = clamp(panAt - dx, -W * 0.35, W * 0.35);
    });
    stage.addEventListener("pointerup", e => {
      const wasPinching = pinching;
      pointers.delete(e.pointerId);
      if (wasPinching) {
        if (pointers.size < 2) { pinching = false; if (zoomScale > 1.01) scheduleZoomReset(); else resetZoom(); }
        dragY = null;
        return;               // don't treat the pinch as a tap
      }
      clearTimeout(longPressTimer); longPressTimer = null;
      if (longPressed) { longPressed = false; dragY = null; dragMoved = false; dragAxis = null; return; }   // the hold already fired
      if (dragY === null) return;
      const wasDrag = dragMoved, axis = dragAxis;
      dragY = null; dragMoved = false; dragAxis = null;
      if (wasDrag) {
        if (axis === "v") { camTarget = cam > 0.42 ? 1 : 0; camVel = 0; }
        else {
          // three gentle detents: left peek, home, right peek
          const d = W * 0.35;
          panTarget = panX < -d * 0.45 ? -d : panX > d * 0.45 ? d : 0;
        }
        return;
      }
      if (placing) { placeAt(e.clientX, e.clientY); return; }
      const now = Date.now();
      if (now - lastTap < 320) {
        lastTap = 0;
        if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
        const mountainsOn = activeTheme().mountains || state.settings.backdrop === "mountains";
        if (mountainsOn && cam < 0.3 && e.clientY > horizonY - U * 0.42 && e.clientY < horizonY + 6) {
          state.settings.peakLabels = !state.settings.peakLabels;
          persist();
          toast(state.settings.peakLabels ? "Naming the mountains" : "Letting the mountains be");
          return;
        }
        partClouds();
        return;
      }
      lastTap = now;
      const x = e.clientX, y = e.clientY;
      tapTimer = setTimeout(() => {
        tapTimer = null;
        if (y < 40 && Math.abs(x - W / 2) < 46 && cam < 0.3) { camTarget = 1; camVel = 0; return; }
        if (camTarget > 0.5 || cam > 0.5) { camTarget = 0; camVel = 0; return; }
        if (state.sail.on && boatHit && Math.abs(x + panX - boatHit.x) < U * 0.2 && Math.abs(y - boatHit.y) < U * 0.2) {
          renderRoute(); renderTrip(); renderFavs(); openSheet("route");
          return;
        }
        if (!state.sail.on && nestHit && cam < 0.3 && Math.hypot((x + panX) - nestHit.x, y - nestHit.y) < nestHit.r) {
          openTour();   // tap the robin's nest to walk the tour again
          return;
        }
        if (cam < 0.3) {
          const sxp = x + panX;
          if (sunHit && Math.hypot(sxp - sunHit.x, y - sunHit.y) < sunHit.r) { openSky("sun"); return; }
          if (moonHit && Math.hypot(sxp - moonHit.x, y - moonHit.y) < moonHit.r) { openSky("moon"); return; }
        }
        if (y < horizonY) {
          const xw = x + panX;
          for (let ci = clouds.length - 1; ci >= 0; ci--) {
            const c = clouds[ci];
            if (Math.abs(xw - (c.x + partShift(c.x))) < 95 * c.s && Math.abs(y - (c.y + 30)) < 64 * c.s) {
              clouds.splice(ci, 1);   // one soft pop; the sky refills on the next weather breath
              return;
            }
          }
          setVerse(pickVerse());
        }
      }, 300);
    });
    stage.addEventListener("pointercancel", e => {
      pointers.delete(e.pointerId);
      if (pinching && pointers.size < 2) { pinching = false; if (zoomScale > 1.01) scheduleZoomReset(); else resetZoom(); }
      clearTimeout(longPressTimer); longPressTimer = null;
      dragY = null; dragMoved = false; dragAxis = null;
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
    if (state.sail.on) { el("sail-toggle").setAttribute("aria-pressed", "true"); el("open-route").style.display = ""; el("open-route").classList.add("gold"); el("open-hours").classList.remove("gold"); el("mode-boat").style.display = "none"; el("mode-garden").style.display = ""; }
    setVerse(pickVerse());
    updateConditions();
    renderHours();
    refreshData();
    // ponytail: one 5-min pulse, silent while hidden — the app never works in the background
    setInterval(() => { if (!document.hidden) refreshData(); }, 300000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshData(); });
    registerSW();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutVerse);
    if (!state.settings.tourSeen) { state.settings.tourSeen = true; persist(); setTimeout(openTour, 1200); }
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
