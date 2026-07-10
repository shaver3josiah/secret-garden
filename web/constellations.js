/* Constellations — 8 mid-northern patterns, alt/az math, normalized previews.
   Vanilla ES5, no dependencies. Attaches window.Constellations (module.exports in node). */
(function (global) {
  'use strict';

  var RAD = Math.PI / 180;

  /* J2000 star coordinates: ra in hours, dec in degrees. */
  var DATA = [
    {
      name: 'Ursa Major', // Big Dipper asterism
      stars: [
        { ra: 11.062, dec: 61.751 }, // Dubhe
        { ra: 11.031, dec: 56.382 }, // Merak
        { ra: 11.897, dec: 53.695 }, // Phecda
        { ra: 12.257, dec: 57.033 }, // Megrez
        { ra: 12.900, dec: 55.960 }, // Alioth
        { ra: 13.399, dec: 54.925 }, // Mizar
        { ra: 13.792, dec: 49.313 }  // Alkaid
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
      center: { ra: 12.4, dec: 56.0 }
    },
    {
      name: 'Ursa Minor',
      stars: [
        { ra: 2.530, dec: 89.264 },  // Polaris
        { ra: 17.537, dec: 86.586 }, // Yildun
        { ra: 16.766, dec: 82.037 }, // epsilon UMi
        { ra: 15.734, dec: 77.794 }, // zeta UMi
        { ra: 14.845, dec: 74.155 }, // Kochab
        { ra: 15.345, dec: 71.834 }, // Pherkad
        { ra: 16.292, dec: 75.755 }  // eta UMi
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
      center: { ra: 15.5, dec: 80.0 }
    },
    {
      name: 'Cassiopeia', // the W
      stars: [
        { ra: 1.907, dec: 63.670 }, // Segin
        { ra: 1.430, dec: 60.235 }, // Ruchbah
        { ra: 0.945, dec: 60.717 }, // gamma Cas
        { ra: 0.675, dec: 56.537 }, // Schedar
        { ra: 0.153, dec: 59.150 }  // Caph
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
      center: { ra: 1.02, dec: 60.0 }
    },
    {
      name: 'Orion',
      stars: [
        { ra: 5.919, dec: 7.407 },   // Betelgeuse
        { ra: 5.419, dec: 6.350 },   // Bellatrix
        { ra: 5.679, dec: -1.943 },  // Alnitak
        { ra: 5.604, dec: -1.202 },  // Alnilam
        { ra: 5.533, dec: -0.299 },  // Mintaka
        { ra: 5.796, dec: -9.670 },  // Saiph
        { ra: 5.242, dec: -8.202 }   // Rigel
      ],
      lines: [[0, 1], [1, 4], [4, 3], [3, 2], [2, 0], [4, 6], [2, 5], [5, 6]],
      center: { ra: 5.58, dec: -1.5 }
    },
    {
      name: 'Cygnus', // Northern Cross
      stars: [
        { ra: 20.690, dec: 45.280 }, // Deneb
        { ra: 20.371, dec: 40.257 }, // Sadr
        { ra: 19.512, dec: 27.960 }, // Albireo
        { ra: 19.749, dec: 45.131 }, // delta Cyg
        { ra: 20.770, dec: 33.970 }  // Gienah (epsilon)
      ],
      lines: [[0, 1], [1, 2], [3, 1], [1, 4]],
      center: { ra: 20.37, dec: 40.3 }
    },
    {
      name: 'Lyra',
      stars: [
        { ra: 18.616, dec: 38.784 }, // Vega
        { ra: 18.739, dec: 39.640 }, // epsilon Lyr
        { ra: 18.746, dec: 37.605 }, // zeta Lyr
        { ra: 18.835, dec: 33.363 }, // Sheliak
        { ra: 18.982, dec: 32.689 }, // Sulafat
        { ra: 18.908, dec: 36.899 }  // delta Lyr
      ],
      lines: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [5, 2]],
      center: { ra: 18.8, dec: 36.5 }
    },
    {
      name: 'Leo',
      stars: [
        { ra: 10.139, dec: 11.967 }, // Regulus
        { ra: 10.122, dec: 16.763 }, // eta Leo
        { ra: 10.333, dec: 19.842 }, // Algieba
        { ra: 10.278, dec: 23.417 }, // Adhafera (zeta)
        { ra: 9.879, dec: 26.007 },  // Rasalas (mu)
        { ra: 9.764, dec: 23.774 },  // epsilon Leo
        { ra: 11.235, dec: 20.524 }, // Zosma
        { ra: 11.818, dec: 14.572 }, // Denebola
        { ra: 11.237, dec: 15.430 }  // Chertan (theta)
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8], [8, 0]],
      center: { ra: 10.6, dec: 19.0 }
    },
    {
      name: 'Pegasus', // Great Square (with Alpheratz)
      stars: [
        { ra: 23.079, dec: 15.205 }, // Markab
        { ra: 23.063, dec: 28.083 }, // Scheat
        { ra: 0.140, dec: 29.090 },  // Alpheratz
        { ra: 0.220, dec: 15.184 }   // Algenib
      ],
      lines: [[0, 1], [1, 2], [2, 3], [3, 0]],
      center: { ra: 23.63, dec: 21.9 }
    }
  ];

  function daysSinceJ2000(date) {
    return (date.getTime() - 946728000000) / 86400000; // J2000.0 = 2000-01-01 12:00 UTC
  }

  /* ra hours, dec/lat/lon degrees (lon east-positive) -> {alt, az} degrees, az 0=N clockwise */
  function altAz(ra, dec, latDeg, lonDeg, date) {
    var d = daysSinceJ2000(date);
    var lst = (280.46061837 + 360.98564736629 * d + lonDeg) % 360;
    if (lst < 0) lst += 360;
    var ha = (lst - ra * 15) * RAD;
    var decR = dec * RAD, latR = latDeg * RAD;
    var alt = Math.asin(Math.sin(decR) * Math.sin(latR) +
                        Math.cos(decR) * Math.cos(latR) * Math.cos(ha));
    var az = Math.atan2(-Math.cos(decR) * Math.sin(ha),
                        Math.sin(decR) * Math.cos(latR) -
                        Math.cos(decR) * Math.sin(latR) * Math.cos(ha));
    az /= RAD;
    if (az < 0) az += 360;
    return { alt: alt / RAD, az: az };
  }

  /* Project stars to a 0..1 box: sinusoidal about the pattern center (handles the
     RA-0 wrap in Pegasus and the pole in Ursa Minor), y down = south, 8% padding. */
  function makePreview(c) {
    var pts = [], i, dra, x, y;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (i = 0; i < c.stars.length; i++) {
      dra = c.stars[i].ra - c.center.ra;
      if (dra > 12) dra -= 24;
      if (dra < -12) dra += 24;
      x = -dra * 15 * Math.cos(c.stars[i].dec * RAD);
      y = -c.stars[i].dec;
      pts.push([x, y]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    var span = Math.max(maxX - minX, maxY - minY) || 1;
    var scale = 0.84 / span; // 8% padding each side on the larger axis
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    for (i = 0; i < pts.length; i++) {
      pts[i] = [0.5 + (pts[i][0] - cx) * scale, 0.5 + (pts[i][1] - cy) * scale];
    }
    return { pts: pts, lines: c.lines };
  }

  var PREVIEWS = [];
  for (var pi = 0; pi < DATA.length; pi++) PREVIEWS.push(makePreview(DATA[pi]));

  function list(latDeg, lonDeg, date) {
    var out = [];
    for (var i = 0; i < DATA.length; i++) {
      var aa = altAz(DATA[i].center.ra, DATA[i].center.dec, latDeg, lonDeg, date);
      out.push({
        name: DATA[i].name,
        az: aa.az,
        alt: aa.alt,
        up: aa.alt > 5,
        preview: PREVIEWS[i]
      });
    }
    return out;
  }

  function nearest(listResult, headingDeg) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < listResult.length; i++) {
      var e = listResult[i];
      if (e.alt <= 5) continue;
      var d = Math.abs(((e.az - headingDeg + 540) % 360) - 180); // shortest arc
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  var Constellations = {
    data: DATA,
    altAz: altAz,
    daysSinceJ2000: daysSinceJ2000,
    list: list,
    nearest: nearest
  };

  global.Constellations = Constellations;
  if (typeof module !== 'undefined' && module.exports) module.exports = Constellations;
})(typeof window !== 'undefined' ? window : this);
