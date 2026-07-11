/*
  Secret Garden — element library (handoff for the scene build)
  ---------------------------------------------------------------
  window.GardenElements = {
    rng(seed)                              seeded PRNG (mulberry32) -> fn () => [0,1)
    palettes: { dawn, day, dusk, night }   time-of-day palettes (sky, foliage tint, water, bloom desat)
    mixHex(a,b,k) / hexA(hex,a)            color helpers
    drawBackdrop(ctx,W,H,t,P,groundFrac,seed)   sky + stars/sun/moon + ground band (specimen cards)
    trees:   { willow, cherry, oak, birch, conifer }  each .draw(ctx,{x,baseY,h,seed,t,P,wind})
    flowers: { tulip, daisy, foxglove, lavender, rose } same signature (h = plant height)
    drawGrass(ctx,{x,base,len,w,ph,lean,t,P,wind})
    pond: {
      drawBase(ctx,pond,t,P)               water, sky reflection streaks
      makeLilyPads(pond,seed,n)            dart-thrown pads, some flowering
      drawLilyPad(ctx,pond,pad,t,P)        pad (notched) + optional lily flower, gentle bob
      makeKoi(seed,n) / drawKoi(ctx,pond,k,t,P)   soft shadows under the surface
      drawRipples(ctx,pond,t,P,seed)       expanding rings from seeded points
    }
    drawRobin(ctx,o)                       the bird itself (flap/pitch/legs/gape/headTurn)
    robinScene: { LOOP, draw(ctx,{W,H,t,P,wind}), phaseAt(t) }   full 40s nest-feeding loop
    drawSailboat(ctx,{x,y,s,seed,t,P})     paper-cutout sloop bobbing on its waterline (y), s = hull length
    drawButterfly(ctx,{x,y,s,seed,t,P,tilt,flap})  scalloped cutout butterfly in DS bloom colors
    layout: { generate({W,H,seed,density,pond}), drawScene(ctx,L,{t,P,wind}) }
      Spacing algorithm: perspective-scaled Poisson-disc rejection with per-species
      footprints and elliptical clearances (screen-y is foreshortened, so vertical
      distance counts ~1.8x); flowers plant as species CLUSTERS whose members infill
      on a golden-angle spiral; the pond keeps a wet exclusion margin.
    pond/palette values come from the Secret Garden token set — do not restyle.
*/
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  // ---------- seeded random ----------
  function rng(seed) {
    var a = (Math.floor(seed * 1000003) ^ 0x9E3779B9) >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- color ----------
  function hx(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function pad2(n) { return ('0' + n.toString(16)).slice(-2); }
  function mixHex(a, b, k) {
    var A = hx(a), B = hx(b);
    return '#' + pad2(Math.round(A[0] + (B[0] - A[0]) * k)) + pad2(Math.round(A[1] + (B[1] - A[1]) * k)) + pad2(Math.round(A[2] + (B[2] - A[2]) * k));
  }
  function hexA(c, a) { var A = hx(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }

  // ---------- palettes (Secret Garden tokens) ----------
  var PALETTES = {
    dawn:  { key: 'dawn',  skyTop: '#4E628C', skyMid: '#9C8FA4', skyBot: '#F4CAA8', fol: '#9A7636', folK: 0.14, bloom: '#F4CAA8', bloomK: 0.12, waterHi: '#EBD5BE', waterLo: '#6F7FA6', night: false, sun: { x: 0.24, y: 0.86, r: 0.10, c: '#F4CAA8' } },
    day:   { key: 'day',   skyTop: '#8FBEDD', skyMid: '#BFD9EA', skyBot: '#DFECF2', fol: '#2F5233', folK: 0,    bloom: '#FFFFFF', bloomK: 0,   waterHi: '#DFECF2', waterLo: '#8FB4CC', night: false, sun: { x: 0.80, y: 0.20, r: 0.075, c: '#FFF3D6' } },
    dusk:  { key: 'dusk',  skyTop: '#2B3A63', skyMid: '#8A7594', skyBot: '#F4CAA8', fol: '#2B3A63', folK: 0.26, bloom: '#B79CD8', bloomK: 0.18, waterHi: '#EFC9A4', waterLo: '#4E5C86', night: false, sun: { x: 0.30, y: 0.90, r: 0.11, c: '#F6C9A0' } },
    night: { key: 'night', skyTop: '#222E4F', skyMid: '#2B3A63', skyBot: '#4E628C', fol: '#2C4A3C', folK: 0.42, bloom: '#CBD6E6', bloomK: 0.45, waterHi: '#93A6C9', waterLo: '#3C4C74', night: true, moon: true }
  };
  var FOL = ['#2F5233', '#4E8C4A', '#8FBE86'];
  function F(c, P) { return P.folK ? mixHex(c, P.fol, P.folK) : c; }       // foliage tint
  function B(c, P) { return P.bloomK ? mixHex(c, P.bloom, P.bloomK) : c; } // bloom tint
  function TR(P) { return mixHex('#6B5136', P.fol, P.folK * 0.7); }        // trunk tint

  function E(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), rot || 0, 0, TAU); }
  function qp(x0, y0, cx, cy, x1, y1, u) {
    var v = 1 - u;
    return { x: v * v * x0 + 2 * v * u * cx + u * u * x1, y: v * v * y0 + 2 * v * u * cy + u * u * y1 };
  }
  function cubic(p0, p1, p2, p3, u) {
    var v = 1 - u;
    return {
      x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
      y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y
    };
  }
  function ease(k) { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // ---------- backdrop (specimen cards + scene sky) ----------
  function drawBackdrop(ctx, W, H, t, P, groundFrac, seed) {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, P.skyTop); sky.addColorStop(0.55, P.skyMid); sky.addColorStop(1, P.skyBot);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    var r = rng((seed || 7) + 31);
    if (P.night) {
      for (var i = 0; i < 26; i++) {
        var sx = r() * W, sy = r() * H * (1 - groundFrac) * 0.9, tw = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.3 + i * 1.7));
        ctx.fillStyle = 'rgba(237,231,216,' + tw.toFixed(2) + ')';
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      var mx = W * 0.78, my = H * 0.18, mr = Math.min(W, H) * 0.07;
      ctx.fillStyle = hexA('#EDE7D8', 0.16); E(ctx, mx, my, mr * 2.2, mr * 2.2); ctx.fill();
      ctx.fillStyle = '#EDE7D8'; E(ctx, mx, my, mr, mr); ctx.fill();
      ctx.fillStyle = P.skyTop; E(ctx, mx - mr * 0.42, my - mr * 0.18, mr * 0.82, mr * 0.82); ctx.fill();
    } else if (P.sun) {
      var su = P.sun, sxx = W * su.x, syy = H * (1 - groundFrac) * su.y, sr = Math.min(W, H) * su.r;
      ctx.fillStyle = hexA(su.c, 0.28); E(ctx, sxx, syy, sr * 2.6, sr * 2.6); ctx.fill();
      ctx.fillStyle = hexA(su.c, 0.9); E(ctx, sxx, syy, sr, sr); ctx.fill();
    }
    if (groundFrac > 0) {
      var gy = H * (1 - groundFrac);
      var gr = ctx.createLinearGradient(0, gy, 0, H);
      gr.addColorStop(0, F(FOL[2], P)); gr.addColorStop(1, F(FOL[0], P));
      ctx.fillStyle = gr; ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = F(FOL[1], P); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(0, gy);
      for (var x = 0; x <= W; x += 24) ctx.lineTo(x, gy - 6 - Math.sin(x * 0.02 + (seed || 0)) * 5);
      ctx.lineTo(W, gy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function groundShadow(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(34,51,27,0.16)';
    E(ctx, x, y + 2, w, w * 0.14); ctx.fill();
  }

  // ============================================================ TREES
  var trees = {};

  // Weeping willow — a soft luminous dome with a dense curtain of fine hanging
  // strands (drawn in a back pass and a lighter front pass) that fall almost to
  // the ground, longest at the middle, all of it breathing gently in the wind.
  trees.willow = { footprint: 0.42, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var lean = (r() - 0.5) * 0.1;
    var cx = x + lean * h, cy = y - h * 0.60;
    var domeR = h * (0.32 + r() * 0.1);   // per-tree variation
    var spread = 0.85 + r() * 0.35;        // dome width
    var asym = (r() - 0.5) * 0.35;         // lopsidedness
    var apexK = 0.62 + r() * 0.2;          // crown height
    var edgeK = 0.4 + r() * 0.2;           // how fast the dome rounds off
    var i, j;
    groundShadow(ctx, x, y, h * 0.34);
    // trunk with a gentle fork
    ctx.fillStyle = TR(P);
    ctx.beginPath();
    ctx.moveTo(x - h * 0.042, y);
    ctx.quadraticCurveTo(x - h * 0.012 + lean * h * 0.5, y - h * 0.34, cx - h * 0.014, cy + domeR * 0.25);
    ctx.lineTo(cx + h * 0.014, cy + domeR * 0.25);
    ctx.quadraticCurveTo(x + h * 0.012 + lean * h * 0.5, y - h * 0.34, x + h * 0.042, y);
    ctx.closePath(); ctx.fill();
    // semitransparent branches: rising from LOW on the trunk, reaching up into
    // the canopy interior — always staying inside the curtain, never past it
    ctx.lineCap = 'round';
    var nb = 5 + Math.floor(r() * 3);
    for (i = 0; i < nb; i++) {
      var bdir = (i % 2 ? 1 : -1) * (0.4 + r() * 0.6);
      var b0x = x + (r() - 0.5) * h * 0.03, b0y = y - h * (0.16 + r() * 0.22);
      var b2x = cx + bdir * domeR * (0.22 + r() * 0.28);
      var b2y = cy - domeR * (r() * 0.14 - 0.04);
      var b1x = (b0x + b2x) / 2 + bdir * domeR * 0.12, b1y = (b0y + b2y) / 2 + domeR * 0.08;
      ctx.strokeStyle = hexA(TR(P), 0.32 + r() * 0.16);
      ctx.lineWidth = Math.max(0.8, h * (0.007 + r() * 0.005));
      ctx.beginPath(); ctx.moveTo(b0x, b0y); ctx.quadraticCurveTo(b1x, b1y, b2x, b2y); ctx.stroke();
      ctx.strokeStyle = hexA(TR(P), 0.2);
      ctx.lineWidth = Math.max(0.5, h * 0.0035);
      ctx.beginPath(); ctx.moveTo(b2x, b2y);
      ctx.quadraticCurveTo(b2x + bdir * domeR * 0.06, b2y - domeR * 0.04, b2x + bdir * domeR * 0.1, b2y - domeR * 0.06); ctx.stroke();
    }
    // inner foliage washes — kept LOW and INSIDE the curtain so the arching
    // strands (not a blob) own the whole silhouette, top included
    var domeSway = Math.sin(o.t * 0.5 + o.seed) * 0.6 * wind;
    for (i = 0; i < 9; i++) {
      var da = r() * TAU, dr = Math.sqrt(r()) * domeR * 0.5;
      var bx = cx + Math.cos(da) * dr + domeSway * 0.5;
      var by = cy + domeR * 0.1 + Math.sin(da) * dr * 0.4;
      ctx.fillStyle = hexA(F(mixHex(FOL[0], FOL[1], 0.4 + r() * 0.4), P), 0.22);
      E(ctx, bx, by, domeR * (0.26 + r() * 0.16), domeR * (0.16 + r() * 0.1)); ctx.fill();
    }
    // dense hanging curtain — every strand rises from the crown, arches out and
    // over, then droops; the arcs themselves draw the rounded top outline.
    // Two passes: shaded back strands, luminous front strands.
    var n = 62 + Math.floor(r() * 22); // app patch: perf — fewer strands, curtain stays dense
    for (var pass = 0; pass < 2; pass++) {
      var back = pass === 0;
      for (i = 0; i < n; i++) {
        if ((i % 2 === 0) !== back) continue;
        var dxn = -1 + 2 * i / (n - 1) + (r() - 0.5) * 0.09;
        var edge = Math.min(1, Math.abs(dxn));
        var reach = domeR * spread * (0.8 + r() * 0.45) * (1 + asym * dxn);
        var sx = cx + dxn * domeR * 0.12;
        var sy = cy - domeR * 0.08 + edge * domeR * 0.05;
        var sway = Math.sin(o.t * 0.45 + i * 0.19 + o.seed) * (0.5 + 0.9 * (1 - edge)) * wind;
        // control point up-and-out: apex highest for middle strands -> dome outline
        var c1x = cx + dxn * reach * 0.85 + sway * 0.3;
        var c1y = cy - domeR * apexK * (1 - edge * edgeK) * (0.92 + r() * 0.16);
        var L = h * (0.5 + 0.3 * (1 - edge)) * (0.7 + r() * 0.55);
        var eyy = Math.min(sy + L, y - h * 0.04);
        var exx = cx + dxn * reach + sway;
        var strand = back ? mixHex(F(FOL[0], P), F(FOL[1], P), 0.5) : mixHex(F(FOL[1], P), F(FOL[2], P), 0.45 + r() * 0.3);
        ctx.strokeStyle = hexA(strand, back ? 0.3 : 0.38);
        ctx.lineWidth = Math.max(0.5, h * 0.0038);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(c1x, c1y, exx, eyy); ctx.stroke();
        // fine leaves along the full arc, top included
        for (var u = 0.06; u < 1; u += 0.1) { // app patch: perf — leaf spacing
          var p = qp(sx, sy, c1x, c1y, exx, eyy, u);
          var p2 = qp(sx, sy, c1x, c1y, exx, eyy, Math.min(1, u + 0.03));
          var ang = Math.atan2(p2.y - p.y, p2.x - p.x);
          var lc = back ? strand : (u < 0.45 ? F(FOL[2], P) : mixHex(F(FOL[1], P), F(FOL[2], P), 0.6));
          ctx.fillStyle = hexA(lc, back ? 0.4 : 0.55);
          var side = (j = (i * 7 + Math.round(u * 26))) % 2 ? 1 : -1;
          E(ctx, p.x + side * h * 0.0035, p.y, h * 0.011, h * 0.004, ang + side * 0.55); ctx.fill();
        }
      }
    }
  }};

  trees.cherry = { footprint: 0.36, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var cx = x, cy = y - h * 0.58, R = h * 0.30;
    groundShadow(ctx, x, y, h * 0.26);
    ctx.strokeStyle = mixHex('#5C4930', P.fol, P.folK * 0.7); ctx.lineCap = 'round';
    ctx.lineWidth = h * 0.05;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - h * 0.03, y - h * 0.3, cx - h * 0.02, cy + R * 0.4); ctx.stroke();
    ctx.lineWidth = h * 0.022;
    ctx.beginPath(); ctx.moveTo(x - h * 0.01, y - h * 0.28); ctx.quadraticCurveTo(x - h * 0.14, y - h * 0.42, cx - R * 0.7, cy + R * 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.34); ctx.quadraticCurveTo(x + h * 0.12, y - h * 0.48, cx + R * 0.65, cy); ctx.stroke();
    var sway = Math.sin(o.t * 0.5 + o.seed) * 2 * wind;
    // app patch: solid blossom heart so the crown never shows a hole
    ctx.fillStyle = hexA(B(mixHex('#E7A9C0', '#F6E3ED', 0.4), P), 0.95);
    E(ctx, cx + sway * 0.6, cy - R * 0.12, R * 0.62, R * 0.5); ctx.fill();
    for (var i = 0; i < 10; i++) {
      var a = r() * TAU, rr = Math.sqrt(r()) * R;
      var bx = cx + Math.cos(a) * rr * 1.15 + sway, by = cy + Math.sin(a) * rr * 0.75;
      var light = (cy - by) / R * 0.5 + 0.5;
      ctx.fillStyle = hexA(B(mixHex('#E7A9C0', '#F6E3ED', 0.25 + light * 0.45), P), 0.95);
      E(ctx, bx, by, R * (0.34 + r() * 0.18), R * (0.26 + r() * 0.12)); ctx.fill();
    }
    // falling petals
    for (var p = 0; p < 8; p++) {
      var ph = r(), sp = 0.05 + r() * 0.05, xo = (r() - 0.5) * R * 2.2;
      var cyc = (o.t * sp + ph) % 1;
      var px = cx + xo + Math.sin(o.t * 1.2 + p * 1.7) * h * 0.045 * wind;
      var py = cy + cyc * (y - cy + 8);
      var al = cyc < 0.82 ? 0.9 : 0.9 * (1 - cyc) / 0.18;
      ctx.fillStyle = hexA(B('#EBC7DA', P), al);
      E(ctx, px, py, h * 0.014, h * 0.008, o.t * 2 + p); ctx.fill();
    }
  }};

  trees.oak = { footprint: 0.38, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var cx = x, cy = y - h * 0.56, R = h * 0.34;
    groundShadow(ctx, x, y, h * 0.3);
    ctx.fillStyle = TR(P);
    ctx.beginPath();
    ctx.moveTo(x - h * 0.065, y);
    ctx.bezierCurveTo(x - h * 0.03, y - h * 0.18, x - h * 0.028, y - h * 0.3, x - h * 0.024, cy + R * 0.3);
    ctx.lineTo(x + h * 0.024, cy + R * 0.3);
    ctx.bezierCurveTo(x + h * 0.028, y - h * 0.3, x + h * 0.03, y - h * 0.18, x + h * 0.065, y);
    ctx.closePath(); ctx.fill();
    var sway = Math.sin(o.t * 0.45 + o.seed * 2) * 2 * wind;
    var i, jx, jy;
    for (i = 0; i < 5; i++) { jx = (r() - 0.5) * R * 0.3; jy = (r() - 0.5) * R * 0.2;
      ctx.fillStyle = F(FOL[0], P); E(ctx, cx + (i - 2) * R * 0.42 + jx, cy + R * 0.28 + jy, R * 0.42, R * 0.34); ctx.fill(); }
    for (i = 0; i < 4; i++) { jx = (r() - 0.5) * R * 0.3; jy = (r() - 0.5) * R * 0.2;
      ctx.fillStyle = F(FOL[1], P); E(ctx, cx + (i - 1.5) * R * 0.48 + jx + sway * 0.5, cy - R * 0.06 + jy, R * 0.46, R * 0.36); ctx.fill(); }
    for (i = 0; i < 3; i++) { jx = (r() - 0.5) * R * 0.25;
      ctx.fillStyle = hexA(F(FOL[2], P), 0.95); E(ctx, cx + (i - 1) * R * 0.44 + jx + sway, cy - R * 0.44, R * 0.36, R * 0.28); ctx.fill(); }
    ctx.fillStyle = 'rgba(34,51,27,0.14)';
    E(ctx, cx, cy + R * 0.5, R * 0.95, R * 0.18); ctx.fill();
  }};

  trees.birch = { footprint: 0.30, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var cy = y - h * 0.62, R = h * 0.26;
    groundShadow(ctx, x, y, h * 0.2);
    var bark = mixHex('#EAE4D4', P.fol, P.folK * 0.5);
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.026, y);
    ctx.lineTo(x - h * 0.012, cy - R * 0.3);
    ctx.lineTo(x + h * 0.012, cy - R * 0.3);
    ctx.lineTo(x + h * 0.026, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(62,58,50,0.65)'; ctx.lineWidth = Math.max(1, h * 0.007); ctx.lineCap = 'round';
    for (var k = 0; k < 6; k++) {
      var ty = y - h * (0.1 + k * 0.09), side = k % 2 ? 1 : -1, tw = h * (0.012 + r() * 0.01);
      ctx.beginPath(); ctx.moveTo(x + side * h * 0.005, ty); ctx.lineTo(x + side * (h * 0.005 + tw), ty - tw * 0.4); ctx.stroke();
    }
    ctx.strokeStyle = bark; ctx.lineWidth = h * 0.012;
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.42); ctx.quadraticCurveTo(x + h * 0.1, y - h * 0.52, x + R * 0.6, cy + R * 0.2); ctx.stroke();
    // app patch: fuller birch — three more limbs reaching into the canopy
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.3); ctx.quadraticCurveTo(x - h * 0.08, y - h * 0.42, x - R * 0.55, cy + R * 0.45); ctx.stroke();
    ctx.lineWidth = h * 0.009;
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.5); ctx.quadraticCurveTo(x + h * 0.06, y - h * 0.58, x + R * 0.42, cy - R * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - h * 0.55); ctx.quadraticCurveTo(x - h * 0.05, y - h * 0.62, x - R * 0.38, cy - R * 0.25); ctx.stroke();
    var sway = Math.sin(o.t * 0.6 + o.seed) * 2.4 * wind;
    for (var i = 0; i < 8; i++) {
      var a = r() * TAU, rr = Math.sqrt(r()) * R;
      var bx = x + Math.cos(a) * rr * 1.2 + sway * ((rr / R) * 0.8 + 0.2), by = cy + Math.sin(a) * rr * 0.8 - R * 0.1;
      var c = i % 3 === 0 ? mixHex(FOL[2], '#D9E4B8', 0.5) : FOL[2];
      ctx.fillStyle = hexA(F(c, P), 0.88);
      E(ctx, bx, by, R * (0.26 + r() * 0.14), R * (0.2 + r() * 0.1)); ctx.fill();
    }
  }};

  trees.conifer = { footprint: 0.26, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    groundShadow(ctx, x, y, h * 0.22);
    ctx.fillStyle = TR(P);
    ctx.fillRect(x - h * 0.02, y - h * 0.16, h * 0.04, h * 0.16);
    var layers = 5;
    for (var L = 0; L < layers; L++) {
      var yb = y - h * (0.10 + L * 0.165);
      var w = h * 0.30 * (1 - L * 0.16) * (0.94 + r() * 0.12);
      var yt = yb - h * 0.24;
      var swx = (L >= layers - 2 ? Math.sin(o.t * 0.7 + o.seed) * 1.6 * wind : 0);
      ctx.fillStyle = mixHex(F(FOL[0], P), F(FOL[1], P), L * 0.16);
      ctx.beginPath();
      ctx.moveTo(x + swx, yt);
      ctx.quadraticCurveTo(x - w * 0.5, yb - h * 0.05, x - w, yb);
      ctx.quadraticCurveTo(x, yb + h * 0.028, x + w, yb);
      ctx.quadraticCurveTo(x + w * 0.5, yb - h * 0.05, x + swx, yt);
      ctx.closePath(); ctx.fill();
    }
  }};

  // ============================================================ FLOWERS
  function petal(ctx, x, y, w, hgt, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, hgt * 0.5);
    ctx.quadraticCurveTo(-w, 0, 0, -hgt * 0.5);
    ctx.quadraticCurveTo(w, 0, 0, hgt * 0.5);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function stem(ctx, x, base, tipX, tipY, P, lw) {
    // app patch: softer stems — mid-foliage tone at reduced alpha so they sit into the field
    ctx.strokeStyle = hexA(F(mixHex(FOL[0], FOL[1], 0.55), P), 0.82); ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + (tipX - x) * 0.3, base - (base - tipY) * 0.55, tipX, tipY);
    ctx.stroke();
  }

  var flowers = {};

  flowers.tulip = { footprint: 0.14, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var sway = Math.sin(o.t * 1.1 + o.seed * 3) * h * 0.04 * wind;
    var tx = x + (r() - 0.5) * h * 0.14 + sway, ty = y - h;
    stem(ctx, x, y, tx, ty + h * 0.12, P, Math.max(1.2, h * 0.03));
    ctx.fillStyle = hexA(F(FOL[1], P), 0.95);
    petal(ctx, x - h * 0.09, y - h * 0.22, h * 0.05, h * 0.42, -0.5);
    petal(ctx, x + h * 0.09, y - h * 0.2, h * 0.05, h * 0.38, 0.55);
    var col = B([ '#E88AA0', '#F2C36B', '#E7A9C0' ][Math.floor(r() * 3)], P);
    var bw = h * 0.115, bh = h * 0.17;
    ctx.fillStyle = mixHex(col, '#22331B', 0.18);
    petal(ctx, tx - bw * 0.55, ty + bh * 0.1, bw * 0.55, bh, -0.16);
    petal(ctx, tx + bw * 0.55, ty + bh * 0.1, bw * 0.55, bh, 0.16);
    ctx.fillStyle = col;
    petal(ctx, tx, ty, bw * 0.7, bh * 1.1, 0);
  }};

  flowers.daisy = { footprint: 0.13, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var sway = Math.sin(o.t * 1.2 + o.seed * 2) * h * 0.045 * wind;
    var tx = x + (r() - 0.5) * h * 0.1 + sway, ty = y - h;
    stem(ctx, x, y, tx, ty, P, Math.max(1, h * 0.025));
    var br = h * 0.14;
    ctx.fillStyle = B('#FBF7EC', P);
    for (var p = 0; p < 9; p++) {
      var a = p / 9 * TAU + o.seed;
      E(ctx, tx + Math.cos(a) * br, ty + Math.sin(a) * br, br * 0.62, br * 0.3, a); ctx.fill();
    }
    ctx.fillStyle = B('#F0D493', P); E(ctx, tx, ty, br * 0.42, br * 0.42); ctx.fill();
    ctx.strokeStyle = hexA('#9A7636', 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(tx, ty, br * 0.42, 0.3, 2.2); ctx.stroke();
  }};

  flowers.foxglove = { footprint: 0.12, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var sway = Math.sin(o.t * 0.9 + o.seed) * h * 0.03 * wind;
    var tx = x + sway, ty = y - h;
    stem(ctx, x, y, tx, ty, P, Math.max(1.2, h * 0.022));
    var col = B(mixHex('#E88AA0', '#B79CD8', r() * 0.7), P);
    for (var i = 0; i < 8; i++) {
      var u = i / 8;
      var byy = ty + h * (0.06 + u * 0.55);
      var bxx = x + sway * (1 - u * 0.6);
      var b = h * 0.052 * (0.45 + u * 0.75);
      var side = i % 2 ? 1 : -1;
      ctx.fillStyle = col;
      E(ctx, bxx + side * b * 0.5, byy, b * 1.05, b * 0.62, side * 0.35); ctx.fill();
      ctx.fillStyle = hexA(mixHex(col, '#22331B', 0.3), 0.8);
      E(ctx, bxx + side * b * 1.15, byy + b * 0.18, b * 0.3, b * 0.22, side * 0.35); ctx.fill();
    }
    ctx.fillStyle = col;
    E(ctx, tx, ty + h * 0.02, h * 0.02, h * 0.03); ctx.fill();
    E(ctx, tx + h * 0.015, ty + h * 0.045, h * 0.016, h * 0.024); ctx.fill();
  }};

  flowers.lavender = { footprint: 0.12, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var leaf = mixHex(FOL[2], '#C9D6C0', 0.5);
    ctx.strokeStyle = hexA(F(leaf, P), 0.9); ctx.lineWidth = Math.max(1, h * 0.016); ctx.lineCap = 'round';
    for (var s = 0; s < 4; s++) {
      var d = (s - 1.5) * 0.24;
      var sway = Math.sin(o.t * 1.35 + o.seed + s) * h * 0.06 * wind;
      var tx = x + d * h * 0.34 + sway, ty = y - h * (0.8 + (s % 2) * 0.2);
      ctx.beginPath(); ctx.moveTo(x + d * h * 0.1, y);
      ctx.quadraticCurveTo(x + d * h * 0.22, y - (y - ty) * 0.6, tx, ty); ctx.stroke();
      var col = B(mixHex('#B79CD8', '#8E7BBE', r() * 0.6), P);
      ctx.fillStyle = col;
      for (var i = 0; i < 7; i++) {
        var u = i / 7;
        var p = qp(x + d * h * 0.1, y, x + d * h * 0.22, y - (y - ty) * 0.6, tx, ty, 0.72 + u * 0.28);
        E(ctx, p.x + (i % 2 ? 1 : -1) * h * 0.014, p.y, h * 0.02, h * 0.014); ctx.fill();
      }
    }
  }};

  flowers.rose = { footprint: 0.17, draw: function (ctx, o) {
    var r = rng(o.seed), P = o.P, h = o.h, x = o.x, y = o.baseY, wind = o.wind == null ? 1 : o.wind;
    var i;
    for (i = 0; i < 3; i++) {
      ctx.fillStyle = hexA(F(FOL[i], P), 0.95);
      E(ctx, x + (i - 1) * h * 0.2 + (r() - 0.5) * h * 0.1, y - h * 0.2 - (i === 1 ? h * 0.1 : 0), h * (0.24 + r() * 0.08), h * (0.17 + r() * 0.05)); ctx.fill();
    }
    var col = B('#E88AA0', P), dark = mixHex(col, '#22331B', 0.35);
    for (i = 0; i < 3; i++) {
      var sway = Math.sin(o.t * 1.0 + o.seed + i * 2) * h * 0.015 * wind;
      var hx0 = x + (i - 1) * h * 0.22 + (r() - 0.5) * h * 0.08 + sway;
      var hy0 = y - h * (0.38 + r() * 0.16) - (i === 1 ? h * 0.08 : 0);
      var rr = h * (0.055 + r() * 0.02);
      ctx.fillStyle = col; E(ctx, hx0, hy0, rr, rr * 0.9); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(0.8, h * 0.012);
      ctx.beginPath(); ctx.arc(hx0, hy0, rr * 0.66, 0.4 + i, 0.4 + i + 4.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx0, hy0, rr * 0.36, 2 + i, 2 + i + 4.6); ctx.stroke();
      ctx.fillStyle = dark; E(ctx, hx0, hy0, rr * 0.12, rr * 0.12); ctx.fill();
    }
    // a bud
    var bx = x + h * 0.3, by = y - h * 0.5;
    ctx.strokeStyle = F(FOL[0], P); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + h * 0.22, y - h * 0.28); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = mixHex(col, '#FBF7EC', 0.2); petal(ctx, bx, by, h * 0.022, h * 0.06, 0.3);
  }};

  // ---------- grass ----------
  function drawGrass(ctx, o) {
    var P = o.P, wind = o.wind == null ? 1 : o.wind;
    var sway = Math.sin(o.t * 1.2 + o.ph) * 3 * wind;
    ctx.strokeStyle = hexA(F(FOL[1], P), 0.8); ctx.lineWidth = o.w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(o.x, o.base);
    ctx.quadraticCurveTo(o.x + o.lean * 14, o.base - o.len * 0.6, o.x + o.lean * 22 + sway, o.base - o.len);
    ctx.stroke();
  }

  // ============================================================ POND
  var pond = {};

  pond.drawBase = function (ctx, pd, t, P) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(pd.cx, pd.cy, pd.rx, pd.ry, 0, 0, TAU); ctx.clip();
    var g = ctx.createLinearGradient(0, pd.cy - pd.ry, 0, pd.cy + pd.ry);
    g.addColorStop(0, P.waterHi); g.addColorStop(1, P.waterLo);
    ctx.fillStyle = g;
    ctx.fillRect(pd.cx - pd.rx, pd.cy - pd.ry, pd.rx * 2, pd.ry * 2);
    // reflection streaks
    for (var i = 0; i < 3; i++) {
      var yy = pd.cy - pd.ry * 0.4 + i * pd.ry * 0.42 + Math.sin(t * 0.7 + i * 2) * 1.5;
      ctx.fillStyle = 'rgba(255,255,255,' + (P.night ? 0.10 : 0.18) + ')';
      E(ctx, pd.cx + Math.sin(t * 0.4 + i) * pd.rx * 0.1, yy, pd.rx * (0.62 - i * 0.13), pd.ry * 0.06); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = hexA(F('#2F5233', P), 0.5); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(pd.cx, pd.cy, pd.rx, pd.ry, 0, 0, TAU); ctx.stroke();
  };

  pond.makeLilyPads = function (pd, seed, n) {
    var r = rng(seed + 91), pads = [], tries = 0;
    while (pads.length < n && tries < 220) {
      tries++;
      var a = r() * TAU, rr = Math.sqrt(r()) * 0.74;
      var nx = Math.cos(a) * rr, ny = Math.sin(a) * rr;
      var size = 0.09 + r() * 0.09;
      var ok = true;
      for (var i = 0; i < pads.length; i++) {
        var dx = nx - pads[i].nx, dy = ny - pads[i].ny;
        if (Math.sqrt(dx * dx + dy * dy) < (size + pads[i].size) * 1.35) { ok = false; break; }
      }
      if (ok) pads.push({ nx: nx, ny: ny, size: size, rot: r() * TAU, ph: r() * TAU, flower: r() < 0.35, tint: r() });
    }
    return pads;
  };

  pond.drawLilyPad = function (ctx, pd, pad, t, P) {
    var x = pd.cx + pad.nx * pd.rx + Math.sin(t * 0.3 + pad.ph) * 1.2;
    var y = pd.cy + pad.ny * pd.ry + Math.sin(t * 0.9 + pad.ph) * 0.8;
    var rx = pd.rx * pad.size, ry = rx * 0.5;
    var col = F(mixHex('#4E8C4A', '#8FBE86', pad.tint * 0.7), P);
    ctx.fillStyle = hexA(mixHex(col, '#22331B', 0.3), 0.35);
    E(ctx, x + 1.5, y + 2, rx, ry); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.ellipse(x, y, rx, ry, 0, pad.rot + 0.32, pad.rot + TAU - 0.32);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA('#FFFFFF', 0.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(pad.rot + 1.4) * rx * 0.8, y + Math.sin(pad.rot + 1.4) * ry * 0.8); ctx.stroke();
    if (pad.flower) {
      var fx = x, fy = y - ry * 0.5, fr = rx * 0.42;
      var open = 0.85 + Math.sin(t * 0.4 + pad.ph) * 0.08;
      var p;
      ctx.fillStyle = B(mixHex('#F6E7EE', '#E7A9C0', 0.25), P);
      for (p = 0; p < 8; p++) petal(ctx, fx + Math.cos(p / 8 * TAU) * fr * 0.5 * open, fy + Math.sin(p / 8 * TAU) * fr * 0.32 * open, fr * 0.26, fr * 0.9, p / 8 * TAU + Math.PI / 2);
      ctx.fillStyle = B('#FBF3F6', P);
      for (p = 0; p < 6; p++) petal(ctx, fx + Math.cos(p / 6 * TAU + 0.5) * fr * 0.26, fy + Math.sin(p / 6 * TAU + 0.5) * fr * 0.18, fr * 0.2, fr * 0.6, p / 6 * TAU + 0.5 + Math.PI / 2);
      ctx.fillStyle = B('#F0D493', P); E(ctx, fx, fy, fr * 0.16, fr * 0.13); ctx.fill();
    }
  };

  pond.makeKoi = function (seed, n) {
    var r = rng(seed + 47), koi = [];
    for (var i = 0; i < n; i++) koi.push({ ph: r() * TAU, sp: (0.14 + r() * 0.12) * (r() < 0.5 ? 1 : -1), size: 0.16 + r() * 0.1, band: 0.35 + r() * 0.3, patch: r() });
    return koi;
  };

  pond.drawKoi = function (ctx, pd, k, t, P) {
    var a = t * k.sp + k.ph;
    var px = pd.cx + Math.cos(a) * pd.rx * k.band;
    var py = pd.cy + Math.sin(a) * pd.ry * k.band;
    var hxv = -Math.sin(a) * pd.rx * k.band * k.sp, hyv = Math.cos(a) * pd.ry * k.band * k.sp;
    var ang = Math.atan2(hyv, hxv);
    var L = pd.rx * k.size;
    var body = P.night ? mixHex('#C9885E', '#2B3A63', 0.45) : '#D9895C';
    ctx.save();
    ctx.translate(px, py); ctx.rotate(ang);
    ctx.globalAlpha = P.night ? 0.3 : 0.38;
    ctx.fillStyle = hexA(mixHex(body, '#22331B', 0.4), 0.5);
    E(ctx, -L * 0.1, 1.5, L * 0.62, L * 0.24); ctx.fill(); // soft shadow halo
    ctx.fillStyle = body;
    E(ctx, 0, 0, L * 0.55, L * 0.2); ctx.fill();
    ctx.fillStyle = mixHex(body, '#FFFFFF', 0.55);
    E(ctx, L * 0.15 - k.patch * L * 0.3, 0, L * 0.16, L * 0.13); ctx.fill();
    var flick = Math.sin(t * 5 + k.ph) * 0.5;
    ctx.rotate(flick * 0.4);
    E(ctx, -L * 0.62, 0, L * 0.2, L * 0.1, flick * 0.3); ctx.fillStyle = body; ctx.fill();
    ctx.restore();
  };

  pond.drawRipples = function (ctx, pd, t, P, seed) {
    var r = rng((seed || 3) + 13);
    for (var i = 0; i < 3; i++) {
      var nx = (r() - 0.5) * 1.1, ny = (r() - 0.5) * 1.1, ph = r();
      var p = (t * 0.13 + ph) % 1;
      var rx = p * pd.rx * 0.5, ry = rx * (pd.ry / pd.rx);
      ctx.strokeStyle = 'rgba(255,255,255,' + ((1 - p) * (P.night ? 0.2 : 0.32)).toFixed(2) + ')';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(pd.cx + nx * pd.rx * 0.6, pd.cy + ny * pd.ry * 0.6, rx, ry, 0, 0, TAU); ctx.stroke();
    }
  };

  // ============================================================ ROBIN & NEST
  // o: {x,y,s,dir,flap,pitch,legs,headTurn,gape,P}
  function drawRobin(ctx, o) {
    var P = o.P || PALETTES.day;
    var back = mixHex(o.blue ? '#6B8FB8' : '#8C7A66', P.fol, P.folK * 0.5);   // app patch: eastern bluebird variant
    var dark = mixHex(o.blue ? '#54749E' : '#7A6A58', P.fol, P.folK * 0.5);
    var breast = mixHex('#C96F4A', P.fol, P.folK * 0.35);
    var belly = mixHex('#F1E9DA', P.fol, P.folK * 0.4);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.dir * o.s, o.s);
    ctx.rotate(o.pitch || 0);
    var flying = !!o.fly;
    // far wing (behind) when flying
    if (flying) {
      ctx.save(); ctx.translate(-1, -4); ctx.rotate(-(o.flap || 0) * 0.9 - 0.3);
      ctx.fillStyle = mixHex(dark, '#22331B', 0.25);
      E(ctx, -7, -2, 9, 3.6, 0.35); ctx.fill(); ctx.restore();
    }
    // tail
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-10, -2); ctx.lineTo(-22, -6); ctx.lineTo(-21, 1); ctx.lineTo(-9, 3);
    ctx.closePath(); ctx.fill();
    // body
    ctx.fillStyle = back; E(ctx, 0, 0, 12, 8.4); ctx.fill();
    // belly
    ctx.fillStyle = belly; E(ctx, 1, 4.6, 7.5, 4.2); ctx.fill();
    // breast + face
    ctx.fillStyle = breast; E(ctx, 6.5, 0.5, 6.6, 6.4); ctx.fill();
    // head
    var ht = (o.headTurn || 0) * 2;
    ctx.fillStyle = back; E(ctx, 9 + ht, -7.5, 5.6, 5.2); ctx.fill();
    ctx.fillStyle = breast; E(ctx, 11.5 + ht, -6, 3.7, 3.6); ctx.fill();
    // eye
    ctx.fillStyle = '#22331B'; E(ctx, 10.6 + ht, -8.6, 1.15, 1.15); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; E(ctx, 11 + ht, -9, 0.36, 0.36); ctx.fill();
    // beak (opens by gape)
    var g = (o.gape || 0) * 0.35;
    ctx.fillStyle = '#4A4238';
    ctx.save(); ctx.translate(14.6 + ht, -7.2);
    ctx.rotate(-g); ctx.beginPath(); ctx.moveTo(0, -0.7); ctx.lineTo(4.6, -0.2); ctx.lineTo(0, 0.35); ctx.closePath(); ctx.fill();
    ctx.rotate(g * 2); ctx.beginPath(); ctx.moveTo(0, -0.35); ctx.lineTo(4.2, 0.4); ctx.lineTo(0, 0.75); ctx.closePath(); ctx.fill();
    ctx.restore();
    // near wing
    ctx.save(); ctx.translate(-2, -3);
    ctx.rotate(flying ? (o.flap || 0) : 0.18);
    ctx.fillStyle = dark;
    E(ctx, -6.5, flying ? -1 : 1.5, 9, flying ? 4.2 : 3.4, flying ? 0.3 : 0.42); ctx.fill();
    ctx.strokeStyle = hexA('#22331B', 0.25); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-11, flying ? -2 : 2.6); ctx.lineTo(-3, flying ? -0.5 : 0.8); ctx.stroke();
    ctx.restore();
    // legs
    if (o.legs) {
      ctx.strokeStyle = '#7A5F3C'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-1, 7.5); ctx.lineTo(-1.5, 12); ctx.moveTo(-1.5, 12); ctx.lineTo(-3.5, 12.8);
      ctx.moveTo(3, 7.5); ctx.lineTo(2.8, 12); ctx.moveTo(2.8, 12); ctx.lineTo(0.8, 12.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNest(ctx, x, y, R, seed, P) {
    var r = rng(seed + 5);
    ctx.fillStyle = mixHex('#4A3826', P.fol, P.folK * 0.5);
    E(ctx, x, y, R, R * 0.55); ctx.fill();
    ctx.fillStyle = 'rgba(20,16,10,0.55)';
    E(ctx, x, y - R * 0.12, R * 0.72, R * 0.3); ctx.fill();
    var browns = ['#7A5F3C', '#8C7351', '#5C4930'];
    ctx.lineCap = 'round';
    for (var i = 0; i < 12; i++) {
      var a0 = r() * TAU, sw = 0.7 + r() * 2.2;
      ctx.strokeStyle = hexA(mixHex(browns[i % 3], P.fol, P.folK * 0.4), 0.85);
      ctx.lineWidth = Math.max(0.8, R * 0.055 * (0.5 + r() * 0.6));
      ctx.beginPath();
      ctx.ellipse(x, y + R * 0.05, R * (0.8 + r() * 0.22), R * (0.4 + r() * 0.2), (r() - 0.5) * 0.3, a0, a0 + sw);
      ctx.stroke();
    }
    // stray twigs
    ctx.strokeStyle = hexA('#5C4930', 0.8); ctx.lineWidth = 1;
    for (var k = 0; k < 4; k++) {
      var a = r() * TAU;
      var sx = x + Math.cos(a) * R, sy = y + Math.sin(a) * R * 0.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * R * 0.3, sy + Math.sin(a) * R * 0.2 - 1); ctx.stroke();
    }
  }

  // chick: gape 0..1, doze 0..1
  function drawChick(ctx, x, y, s, dir, gape, doze, P) {
    var fuzz = mixHex('#B49E76', P.fol, P.folK * 0.4);
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
    ctx.fillStyle = fuzz; E(ctx, 0, 0, 5.2, 4.2); ctx.fill();
    var hy = -4.5 - gape * 3.5 + doze * 1.8;
    ctx.fillStyle = fuzz; E(ctx, 2.2, hy, 3.4, 3.2); ctx.fill();
    // fuzz strokes
    ctx.strokeStyle = hexA(fuzz, 0.8); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-3, -3.4); ctx.lineTo(-4.2, -5.2); ctx.moveTo(-1, -4); ctx.lineTo(-1.4, -6); ctx.stroke();
    // eye
    if (doze > 0.5) {
      ctx.strokeStyle = '#22331B'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(2.2, hy - 1); ctx.lineTo(3.6, hy - 0.8); ctx.stroke();
    } else {
      ctx.fillStyle = '#22331B'; E(ctx, 3, hy - 1, 0.8, 0.8); ctx.fill();
    }
    // gaping beak
    var open = 0.12 + gape * 0.75;
    ctx.fillStyle = '#E0A33C';
    ctx.save(); ctx.translate(5.2, hy + 0.4);
    ctx.rotate(-open * 0.5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3.4, -0.8); ctx.lineTo(0.4, 1); ctx.closePath(); ctx.fill();
    ctx.rotate(open); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3.2, 1.2); ctx.lineTo(0.2, 1.4); ctx.closePath(); ctx.fill();
    if (gape > 0.4) { ctx.fillStyle = '#C96F4A'; E(ctx, 1.2, 0.4, 1.1, 0.8); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  }

  // ---------- the long loop ----------
  var LOOP = 40;
  var PHASES = [
    [0,    'the quiet garden'],
    [2.5,  'a far pass overhead'],
    [6.5,  'the quiet garden'],
    [8,    'she arrives'],
    [13,   'landing'],
    [14,   'to the nest'],
    [15.5, 'feeding'],
    [24,   'keeping watch'],
    [28,   'off again'],
    [31,   'settling down']
  ];
  function phaseAt(tl) {
    var label = PHASES[0][1];
    for (var i = 0; i < PHASES.length; i++) if (tl >= PHASES[i][0]) label = PHASES[i][1];
    return label;
  }

  function robinPose(tl, geo) {
    var perch = geo.perch, nestEdge = geo.nestEdge, s = geo.s;
    if (tl < 8 || tl >= 31) return null;
    if (tl < 13) { // fly in from the left
      var k = ease((tl - 8) / 5);
      var p = cubic({ x: -30, y: geo.H * 0.18 }, { x: geo.W * 0.28, y: geo.H * 0.52 }, { x: perch.x - 70 * s / 1.6, y: perch.y - 60 * s / 1.6 }, perch, k);
      var glide = k > 0.8;
      return { x: p.x, y: p.y, dir: 1, fly: true, flap: glide ? 0.5 : Math.sin(tl * 15) * 0.8 + 0.1, pitch: glide ? -0.22 : 0.04 };
    }
    if (tl < 14) { // land + settle
      var k1 = tl - 13;
      return { x: perch.x, y: perch.y - Math.abs(Math.sin(k1 * Math.PI * 2)) * 3 * (1 - k1), dir: -1, flap: 0, pitch: 0, legs: true };
    }
    if (tl < 15.5) { // two hops toward the nest
      var k2 = ease((tl - 14) / 1.5);
      return {
        x: lerp(perch.x, nestEdge.x, k2),
        y: lerp(perch.y, nestEdge.y, k2) - Math.abs(Math.sin(k2 * Math.PI * 2)) * 5 * s / 1.6,
        dir: -1, flap: 0, pitch: 0, legs: true
      };
    }
    if (tl < 24) { // feeding: 3 slow dips
      var u = ((tl - 15.5) / 2.8333) % 1;
      var pitch = 0;
      if (u < 0.25) pitch = ease(u / 0.25) * 0.85;
      else if (u < 0.5) pitch = 0.85;
      else if (u < 0.7) pitch = (1 - ease((u - 0.5) / 0.2)) * 0.85;
      return { x: nestEdge.x, y: nestEdge.y + pitch * 4 * s / 1.6, dir: -1, flap: 0, pitch: pitch, legs: true, gape: pitch > 0.5 ? 0.7 : 0 };
    }
    if (tl < 28) { // keeping watch
      var w = Math.sin((tl - 24) * 1.9);
      return { x: nestEdge.x, y: nestEdge.y, dir: -1, flap: 0, pitch: -0.04, legs: true, headTurn: w * 0.9 };
    }
    // fly off to the right
    var k3 = ease((tl - 28) / 3);
    if (k3 < 0.15) return { x: nestEdge.x, y: nestEdge.y + k3 * 10, dir: 1, flap: 0, pitch: 0.15, legs: true }; // crouch
    var kk = (k3 - 0.15) / 0.85;
    var p2 = cubic(nestEdge, { x: nestEdge.x + geo.W * 0.2, y: nestEdge.y - geo.H * 0.15 }, { x: geo.W * 0.8, y: geo.H * 0.1 }, { x: geo.W + 40, y: geo.H * 0.06 }, kk);
    return { x: p2.x, y: p2.y, dir: 1, fly: true, flap: Math.sin(tl * 15) * 0.8 + 0.1, pitch: -0.15 };
  }

  function chickGape(tl, which) {
    if (tl < 14 || tl >= 26) return 0;
    if (tl < 15.5) return 0.5 + Math.sin(tl * 7 + which) * 0.2; // begging as parent approaches
    if (tl < 24) {
      var c = Math.floor((tl - 15.5) / 2.8333);
      var u = ((tl - 15.5) / 2.8333) % 1;
      var mine = (c % 2) === which ? 1 : 0.35;
      var amt = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.3);
      return mine * amt * (0.65 + Math.sin(tl * 9 + which * 2) * 0.15);
    }
    return Math.max(0, 1 - (tl - 24) / 2) * 0.3;
  }

  var robinScene = {
    LOOP: LOOP,
    phaseAt: phaseAt,
    draw: function (ctx, o) {
      var W = o.W, H = o.H, t = o.t, P = o.P, wind = o.wind == null ? 1 : o.wind;
      var tl = t % LOOP;
      var s = H / 150;
      drawBackdrop(ctx, W, H, t, P, 0.1, 5);
      // branch: quadratic from left edge
      var b0 = { x: -10, y: H * 0.70 }, bc = { x: W * 0.35, y: H * 0.50 }, b1 = { x: W * 0.8, y: H * 0.52 };
      var bark = mixHex('#5C4930', P.fol, P.folK * 0.5);
      ctx.lineCap = 'round';
      ctx.strokeStyle = bark; ctx.lineWidth = s * 6;
      ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.quadraticCurveTo(bc.x, bc.y, b1.x, b1.y); ctx.stroke();
      ctx.strokeStyle = mixHex(bark, '#F4F7F0', 0.18); ctx.lineWidth = s * 2;
      ctx.beginPath(); ctx.moveTo(b0.x, b0.y - s * 2); ctx.quadraticCurveTo(bc.x, bc.y - s * 2, b1.x, b1.y - s * 2); ctx.stroke();
      // leaf clusters on the branch
      var r = rng(11);
      for (var i = 0; i < 4; i++) {
        var u = 0.16 + i * 0.2 + r() * 0.04;
        var lp = qp(b0.x, b0.y, bc.x, bc.y, b1.x, b1.y, u);
        var swl = Math.sin(t * 0.8 + i) * 1.5 * wind;
        for (var j = 0; j < 3; j++) {
          ctx.fillStyle = hexA(F(FOL[j], P), 0.9);
          E(ctx, lp.x + (j - 1) * s * 6 + swl, lp.y - s * (7 + j * 3) - r() * s * 4, s * (6 - j), s * (3.6 - j * 0.5)); ctx.fill();
        }
      }
      // nest + perch geometry
      var nu = 0.46, pu = 0.68;
      var np = qp(b0.x, b0.y, bc.x, bc.y, b1.x, b1.y, nu);
      var pp = qp(b0.x, b0.y, bc.x, bc.y, b1.x, b1.y, pu);
      var nest = { x: np.x, y: np.y - s * 6 };
      var geo = {
        W: W, H: H, s: s,
        perch: { x: pp.x, y: pp.y - s * 13 },
        nestEdge: { x: nest.x + s * 16, y: nest.y - s * 9 }
      };
      drawNest(ctx, nest.x, nest.y, s * 14, 21, P);
      // chicks
      var doze = (tl < 8 || tl >= 31) ? Math.min(1, tl >= 31 ? (tl - 31) / 3 : 1) : 0;
      drawChick(ctx, nest.x - s * 5, nest.y - s * 4, s * 0.85, 1, chickGape(tl, 0), doze, P);
      drawChick(ctx, nest.x + s * 4, nest.y - s * 3.4, s * 0.8, -1, chickGape(tl, 1), doze, P);
      // distant pass, early in the loop
      if (tl > 2.5 && tl < 6.5) {
        var kd = (tl - 2.5) / 4;
        var dx = -20 + kd * (W + 40), dy = H * 0.16 - Math.sin(kd * Math.PI) * H * 0.05;
        ctx.strokeStyle = hexA(P.night ? '#CBD6E6' : '#4A4238', 0.55); ctx.lineWidth = s * 0.8;
        var fl = Math.sin(t * 14) * 2.4 * s * 0.4;
        ctx.beginPath(); ctx.moveTo(dx - 3 * s * 0.5, dy - fl); ctx.quadraticCurveTo(dx, dy + s * 0.4, dx + 3 * s * 0.5, dy - fl); ctx.stroke();
      }
      // the robin
      var pose = robinPose(tl, geo);
      if (pose) { pose.s = s * 0.95; pose.P = P; drawRobin(ctx, pose); }
    }
  };

  // ============================================================ SKY & SEA — paper-cutout spirits
  function drawSailboat(ctx, o) {
    var r = rng(o.seed || 1), P = o.P || PALETTES.day, s = o.s, t = o.t || 0;
    var hull = r() < 0.55 ? mixHex('#E88AA0', '#22331B', 0.42) : mixHex('#9A7636', '#22331B', 0.12);
    hull = mixHex(hull, P.fol, P.folK * 0.5);
    var sailMain = P.night ? '#B9C6DC' : '#F4F7F0';
    var sailJib = P.night ? '#9FAECB' : '#DFECF2';
    var heel = Math.sin(t * 0.5 + (o.seed || 0)) * 0.05;
    var bob = Math.sin(t * 0.85 + (o.seed || 0)) * s * 0.02;
    ctx.save();
    ctx.translate(o.x, o.y + bob);
    ctx.rotate(heel);
    // reflection smear on the water
    ctx.fillStyle = hexA(hull, 0.16);
    E(ctx, 0, s * 0.14, s * 0.34, s * 0.05); ctx.fill();
    // mast
    ctx.strokeStyle = mixHex('#4A4238', P.fol, P.folK * 0.4); ctx.lineWidth = Math.max(1, s * 0.018); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.03, 0); ctx.lineTo(s * 0.06, -s * 0.78); ctx.stroke();
    // mainsail (aft), gentle belly
    var belly = Math.sin(t * 0.7 + 2) * s * 0.012;
    ctx.fillStyle = sailMain;
    ctx.beginPath();
    ctx.moveTo(s * 0.08, -s * 0.74);
    ctx.quadraticCurveTo(s * 0.30 + belly, -s * 0.42, s * 0.42, -s * 0.08);
    ctx.lineTo(s * 0.08, -s * 0.08);
    ctx.closePath(); ctx.fill();
    // jib (forward)
    ctx.fillStyle = sailJib;
    ctx.beginPath();
    ctx.moveTo(s * 0.02, -s * 0.68);
    ctx.quadraticCurveTo(-s * 0.26 - belly, -s * 0.34, -s * 0.4, -s * 0.07);
    ctx.lineTo(0, -s * 0.07);
    ctx.closePath(); ctx.fill();
    // honey pennant at the masthead
    var fl = Math.sin(t * 3 + (o.seed || 0)) * s * 0.02;
    ctx.fillStyle = B('#D8B26A', P);
    ctx.beginPath();
    ctx.moveTo(s * 0.06, -s * 0.78);
    ctx.lineTo(s * 0.2, -s * 0.74 + fl);
    ctx.lineTo(s * 0.065, -s * 0.71);
    ctx.closePath(); ctx.fill();
    // hull last — a deep paper-cutout crescent over the sail feet
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.02);
    ctx.quadraticCurveTo(-s * 0.1, s * 0.3, s * 0.28, s * 0.22);
    ctx.quadraticCurveTo(s * 0.46, s * 0.16, s * 0.5, -s * 0.02);
    ctx.quadraticCurveTo(0, s * 0.05, -s * 0.5, -s * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(0.8, s * 0.012);
    ctx.beginPath(); ctx.moveTo(-s * 0.46, -s * 0.01); ctx.quadraticCurveTo(0, s * 0.055, s * 0.46, -s * 0.005); ctx.stroke();
    ctx.restore();
  }

  function drawButterfly(ctx, o) {
    var r = rng(o.seed || 1), P = o.P || PALETTES.day, s = o.s, t = o.t || 0;
    var mains = ['#E88AA0', '#B79CD8', '#F2C36B', '#4E628C'];
    var main = B(mains[Math.floor(r() * mains.length)], P);
    var accent = mixHex(main, '#22331B', 0.24);
    var flap = o.flap == null ? 0.55 + Math.sin(t * 5.2 + (o.seed || 0)) * 0.45 : o.flap; // 0..1
    var body = mixHex('#4A4238', P.fol, P.folK * 0.4);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.tilt || 0);
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.scale(side * (0.32 + 0.68 * flap), 1);
      // upper wing — scalloped cutout lobe
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(s * 0.05, -s * 0.06);
      ctx.bezierCurveTo(s * 0.2, -s * 0.5, s * 0.5, -s * 0.62, s * 0.6, -s * 0.42);
      ctx.quadraticCurveTo(s * 0.66, -s * 0.28, s * 0.52, -s * 0.24);
      ctx.quadraticCurveTo(s * 0.58, -s * 0.1, s * 0.42, -s * 0.08);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.06, s * 0.08, 0);
      ctx.closePath(); ctx.fill();
      // lower wing — smaller scalloped lobe
      ctx.beginPath();
      ctx.moveTo(s * 0.06, s * 0.02);
      ctx.bezierCurveTo(s * 0.34, s * 0.02, s * 0.5, s * 0.16, s * 0.4, s * 0.34);
      ctx.quadraticCurveTo(s * 0.32, s * 0.46, s * 0.18, s * 0.38);
      ctx.quadraticCurveTo(s * 0.1, s * 0.32, s * 0.04, s * 0.16);
      ctx.closePath(); ctx.fill();
      // inner accents
      ctx.fillStyle = hexA(accent, 0.5);
      E(ctx, s * 0.3, -s * 0.26, s * 0.13, s * 0.09, -0.5); ctx.fill();
      E(ctx, s * 0.22, s * 0.18, s * 0.08, s * 0.06, 0.4); ctx.fill();
      ctx.restore();
    }
    // body, head, curled antennae with ball tips
    ctx.fillStyle = body;
    E(ctx, 0, s * 0.02, s * 0.05, s * 0.2); ctx.fill();
    E(ctx, 0, -s * 0.24, s * 0.055, s * 0.055); ctx.fill();
    ctx.strokeStyle = body; ctx.lineWidth = Math.max(0.8, s * 0.02); ctx.lineCap = 'round';
    for (var a = -1; a <= 1; a += 2) {
      ctx.beginPath();
      ctx.moveTo(a * s * 0.02, -s * 0.28);
      ctx.quadraticCurveTo(a * s * 0.1, -s * 0.44, a * s * 0.2, -s * 0.46);
      ctx.stroke();
      E(ctx, a * s * 0.2, -s * 0.46, s * 0.03, s * 0.03); ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================ LAYOUT — the spacing algorithm
  var TREE_KINDS = ['willow', 'oak', 'cherry', 'birch', 'conifer'];
  var FLOWER_KINDS = ['tulip', 'daisy', 'foxglove', 'lavender', 'rose'];
  var GOLDEN = 2.39996323;

  function generateLayout(opt) {
    var W = opt.W, H = opt.H, seed = opt.seed || 1;
    var density = opt.density == null ? 0.75 : opt.density;
    var pondOn = opt.pond !== false;
    var r = rng(seed * 7.919 + 17);
    var horizon = (opt.horizon || H * 0.56), G = H - horizon; // app patch: caller may set the horizon
    var pd = pondOn ? { cx: W * (0.58 + r() * 0.1), cy: horizon + G * 0.4, rx: Math.min(W * 0.17, 190), ry: G * 0.16 } : null;
    var placed = [];
    function sc(y) { return 0.42 + 0.78 * (y - horizon) / G; }
    function inPond(x, y, m) {
      if (!pd) return false;
      var dx = (x - pd.cx) / (pd.rx + m), dy = (y - pd.cy) / (pd.ry + m * 0.6);
      return dx * dx + dy * dy < 1;
    }
    // Poisson-disc by rejection: elliptical clearance (y counts 1.8x — perspective foreshortening)
    function tryPlace(y0, y1, radFn, pondMargin, tries) {
      for (var i = 0; i < (tries || 40); i++) {
        var x = r() * W, y = horizon + G * (y0 + r() * (y1 - y0));
        var rr = radFn(y);
        if (inPond(x, y, pondMargin + rr * 0.4)) continue;
        var ok = true;
        for (var j = 0; j < placed.length; j++) {
          var dx = x - placed[j].x, dy = (y - placed[j].y) * 1.8;
          var min = rr + placed[j].r;
          if (dx * dx + dy * dy < min * min) { ok = false; break; }
        }
        if (ok) { var pt = { x: x, y: y, r: rr }; placed.push(pt); return pt; }
      }
      return null;
    }
    function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tmp = a[i]; a[i] = a[j]; a[j] = tmp; } return a; }

    // 1) trees claim the back band first (largest footprints win space early)
    var treesOut = [];
    var kinds = shuffle(TREE_KINDS);
    var treeN = 4 + Math.round(density * 3);
    for (var ti = 0; ti < treeN; ti++) {
      var kind = kinds[ti % kinds.length];
      var pt = tryPlace(0.02, 0.3, function (y) { return G * (0.85 + r() * 0.4) * sc(y) * trees[kind].footprint; }, 26, 60);
      if (pt) treesOut.push({ kind: kind, x: pt.x, y: pt.y, h: pt.r / trees[kind].footprint, seed: Math.floor(r() * 9999) });
    }
    // 2) flowers plant as species clusters; members infill on a golden-angle spiral
    var flowersOut = [];
    var fkinds = shuffle(FLOWER_KINDS);
    var clusterN = 3 + Math.round(density * 5);
    for (var ci = 0; ci < clusterN; ci++) {
      var fk = fkinds[ci % fkinds.length];
      var cpt = tryPlace(0.3, 0.92, function (y) { return G * 0.13 * sc(y); }, 14, 50);
      if (!cpt) continue;
      var members = 3 + Math.floor(r() * 4);
      var a0 = r() * TAU;
      for (var mi = 0; mi < members; mi++) {
        var rad = G * 0.035 * Math.sqrt(mi) * sc(cpt.y);
        var ang = a0 + mi * GOLDEN;
        var fx = cpt.x + Math.cos(ang) * rad, fy = cpt.y + Math.sin(ang) * rad * 0.5;
        if (fx < -10 || fx > W + 10 || inPond(fx, fy, 8)) continue;
        flowersOut.push({ kind: fk, x: fx, y: fy, h: G * (0.2 + r() * 0.14) * sc(fy), seed: Math.floor(r() * 9999) });
      }
    }
    // 3) grass infills every remaining gap (no clearance — it is the ground cover)
    var grassOut = [];
    var grassN = Math.round((50 + 130 * density) * Math.min(W, 1100) / 900);
    for (var gi = 0; gi < grassN; gi++) {
      var gx = r() * W, gy = horizon + G * (0.12 + r() * 0.88);
      if (inPond(gx, gy, 5)) continue;
      grassOut.push({ x: gx, base: gy, len: G * (0.08 + r() * 0.16) * sc(gy), w: 0.8 + r() * 1.8, ph: r() * TAU, lean: (r() - 0.5) * 0.5 });
    }
    return {
      W: W, H: H, horizon: horizon, seed: seed, pond: pd,
      trees: treesOut, flowers: flowersOut, grass: grassOut,
      lilyPads: pd ? pond.makeLilyPads(pd, seed, 6 + Math.floor(density * 4)) : [],
      koi: pd ? pond.makeKoi(seed, opt.koi == null ? 3 : opt.koi) : []
    };
  }

  function drawScene(ctx, L, o) {
    var t = o.t, P = o.P, wind = o.wind == null ? 1 : o.wind;
    var W = L.W, H = L.H;
    drawBackdrop(ctx, W, H, t, P, 1 - L.horizon / H, L.seed);
    if (L.pond) {
      pond.drawBase(ctx, L.pond, t, P);
      var i;
      for (i = 0; i < L.koi.length; i++) pond.drawKoi(ctx, L.pond, L.koi[i], t, P);
      for (i = 0; i < L.lilyPads.length; i++) pond.drawLilyPad(ctx, L.pond, L.lilyPads[i], t, P);
      pond.drawRipples(ctx, L.pond, t, P, L.seed);
    }
    var items = [];
    L.trees.forEach(function (tr) { items.push({ y: tr.y, d: function () { trees[tr.kind].draw(ctx, { x: tr.x, baseY: tr.y, h: tr.h, seed: tr.seed, t: t, P: P, wind: wind }); } }); });
    L.flowers.forEach(function (f) { items.push({ y: f.y, d: function () { flowers[f.kind].draw(ctx, { x: f.x, baseY: f.y, h: f.h, seed: f.seed, t: t, P: P, wind: wind }); } }); });
    L.grass.forEach(function (g) { items.push({ y: g.base, d: function () { drawGrass(ctx, { x: g.x, base: g.base, len: g.len, w: g.w, ph: g.ph, lean: g.lean, t: t, P: P, wind: wind }); } }); });
    items.sort(function (a, b) { return a.y - b.y; });
    items.forEach(function (it) { it.d(); });
  }

  window.GardenElements = {
    rng: rng, mixHex: mixHex, hexA: hexA,
    FOL: FOL, // app patch: mutable foliage triple so garden themes apply
    palettes: PALETTES,
    drawBackdrop: drawBackdrop,
    trees: trees, flowers: flowers, drawGrass: drawGrass,
    pond: pond,
    drawRobin: drawRobin, drawNest: drawNest, drawChick: drawChick,
    drawSailboat: drawSailboat, drawButterfly: drawButterfly,
    robinScene: robinScene,
    layout: { generate: generateLayout, drawScene: drawScene }
  };
})();
