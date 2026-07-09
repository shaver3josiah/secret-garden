Secret Garden. Art Direction Brief for Three New Scene Elements

Purpose: This brief guides three original, hand-crafted canvas additions to the existing Secret Garden PWA scene. Pinterest and stock-illustration results below are used only to extract recurring motifs, moods, and color language. Nothing here describes tracing, copying, or reproducing a specific copyrighted image. Every shape, gradient, and count spec below is procedural and original, built to match the app's existing canvas techniques (blob fills, layered petal loops, radial glow gradients, rng-seeded scatter, sin-based sway).

Source verification: styles.css and app.js were read in full. Token values below are copied verbatim from styles.css. The app.js drawing pipeline was reviewed end to end (buildScene, initParticles, and the frame() render order) to confirm what already exists, so nothing proposed below duplicates it.

Existing scene elements confirmed in app.js (not to be duplicated):
- Layered petal flowers (stem stroke, radial petal ellipses, honey center dot) in drawGrassesFlowers
- Clustered tree canopy blobs and bush blobs (the blob() helper) in drawTreeline and drawBushes
- Foreground grass blades (thin curved strokes) in drawGrassesFlowers
- Sun and moon "bloom" glows (layered radial gradients) in drawSun, drawMoon, drawCelestial
- Reflective ellipse pond with ripple lines in drawPond (present only when the active theme sets water: true)
- Ambient particles: falling petals, floating pollen, and wandering fireflies in drawAmbient, plus rain, snow, clouds, fog/haze and lightning flash
- Background far/mid ridgelines, sky gradient, ground gradient, and twinkling stars

Confirmed CSS color tokens (from styles.css :root):
paper #F4F7F0, paper-2 #E9F0E2, ink #22331B, ink-soft #3D4B36, ink-muted #6C7A62, leaf-deep #2F5233, leaf #5B8C5A, leaf-light #9DBE92, accent #7A9E6E, honey-deep #9A7636, honey #B4894D, honey-light #D8B26A, rose #C98B93.

1. Motif Descriptors (10, from research)

Across "secret garden aesthetic," "cottagecore walled garden," "english garden gate ivy arch," "moss stone path," "wisteria trellis dusk," "garden lantern firefly evening," "koi pond lily pad," and "climbing roses trellis silhouette" searches, the same handful of motifs kept resurfacing. The ten below are the strongest, each with a one-line mood note.

1. Ivy-clad stone archway threshold. Mood: a hushed invitation into a hidden world.
2. Overgrown garden gate half-swallowed by greenery. Mood: the mystery of a place time forgot.
3. Wisteria cascading from a pergola beam at dusk. Mood: romantic, drowsy abundance.
4. Moss-stepped stone path curving out of sight. Mood: quiet, unhurried wandering.
5. Climbing roses laced through a weathered trellis. Mood: nostalgic, Victorian romance.
6. Koi pond with still lily-pad reflections. Mood: tranquil, hidden-oasis calm.
7. Weathered stone or brick wall softened by creeping foliage. Mood: secrecy, age, enclosure.
8. Hanging paper or glass lanterns glowing warm at twilight. Mood: intimate flicker as day surrenders to night.
9. Firefly-lit blue hour haze. Mood: magical hush at the edge of dark.
10. Trailing flowers spilling from a garden urn or planter. Mood: cultivated elegance gently gone wild.

2. Palette Additions (6 new hex values, harmonized against existing tokens)

| Hex | Label | Harmonization note |
|---|---|---|
| #9B87B5 | Wisteria petal, base | Muted violet at the same desaturation and mid lightness as rose (#C98B93). Sits between rose and the cool blues already used in the moonlit-garden bloom set, so it reads as one more muted garden flower rather than an outside color. |
| #C9BEDD | Wisteria petal, light highlight | Pale lilac for the layered highlight petal pass (mirrors the existing flower-center highlight technique). Shares its lightness family with paper-2 (#E9F0E2), keeping the drape airy against dark canopy. |
| #F6C878 | Lantern glow, core | A warmer, brighter sibling of honey-light (#D8B26A). Stays inside the existing honey hue family so a lit lantern feels native to the app's golden accent language while still reading as an active light source rather than a painted surface. |
| #4A5642 | Moss shadow | A cooler, greyer step between ink-soft (#3D4B36) and ink-muted (#6C7A62). Used for shaded moss clinging to stone so it never competes with sunlit leaf tones. |
| #B8AF98 | Stone, base | A warm taupe-grey, the first true neutral in the palette. Carries the same warm undertone as honey (#B4894D), so weathered stone still feels lit by the same honeyed light rather than looking cold or foreign. |
| #6E6552 | Stone shadow, deep | A dark warm grey-brown matched in value to ink (#22331B), used for crevice shadow on the arch so shadow depth stays consistent with the rest of the scene's near-black ink tone. |

3. Ranked Canvas Additions (exactly 3)

Selection rationale: Koi pond shadows, a moss stone path, and a climbing-rose trellis were all considered. Koi shadows were set aside because the pond only exists on themes with water: true, making it a conditional enhancement rather than a always-on new motif; it is a strong candidate for a later pass. A winding moss path was set aside because it would run through the same ground band already populated by randomly scattered grasses and flowers, risking visual collisions that the brief asks to avoid. A climbing-rose trellis was folded conceptually into the arch below rather than shipped separately, since two independent climbing-plant structures would feel redundant. The three picks below are all edge-anchored or top-anchored, sit in open canvas space the existing scene does not use, and compose into one coherent "garden entrance at dusk" vignette.

RANK 1: Ivy-Clad Stone Archway

Where it sits in scene depth order: New function drawArch(), called in frame() between drawTreeline() and daylightWash(). This places it at the same rough depth as the tree canopy layer. The daylight wash glazes over it correctly, and the pond, bushes, grasses, flowers, ambient particles, weather, and fog all continue to layer on top of it exactly as they do today, so nothing needs to change about their draw order. Foreground grass and flowers near the left edge will naturally appear to grow up around its base, which reads as intentional, not as clipping.

Parametric draw spec:
- Confined region: x from -0.02W to 0.16W (left edge, bleeding slightly off-canvas), y from horizonY - 0.30H to horizonY + 0.05H. It never enters the central 70 percent of canvas width.
- Left pillar: a slightly tapered rectangle/quad, x0 -0.02W to x1 0.085W, top at horizonY - 0.30H, base at horizonY + 0.05H. Filled with a linear gradient, stone base (#B8AF98) at the lit face to stone shadow (#6E6552) at the shaded edge.
- Right pillar (inner edge of the opening): x2 0.115W to x3 0.16W, top at horizonY - 0.27H (slightly shorter, for hand-built asymmetry), same gradient treatment.
- Lintel: one quadratic-curve path connecting the two pillar tops, peak bulge 0.05H above the tops, thickness about 0.045H, same stone gradient. Built the same way the existing ridge() helper builds its curve, just anchored to two points instead of a scatter of points.
- Moss patches: 3 to 4 irregular blob fills (reuse the existing blob() helper at small scale) at the pillar bases and along the lintel underside, moss shadow (#4A5642), 0.5 to 0.7 alpha.
- Ivy leaf clusters: 14 to 18 small clusters of 2 to 3 overlapping ellipses each, climbing the pillars and draping slightly over the lintel edge. Colored from activeTheme().foliage[0] and foliage[1], not a fixed hex, so the arch restyles automatically when the user switches theme presets, matching how flowers and bushes already source color from the active theme.
- Ivy tendrils: 4 to 6 thin bezier strokes trailing from the inner pillar into the archway opening, capped at 0.03W maximum reach so they never cross into the open path.

Reacts to inputs:
- Weather: during rain, stone gradient darkens slightly and gains a faint 0.08-alpha white streak overlay for a wet-stone look; fog and haze pass over it for free since drawFog() runs after it in the existing pipeline.
- Day and night: stone and moss shaded using the same darkening factor already used for bushes and trees (the nf = clamp(1 - sunAltitude()*2.6, 0, 1) pattern), so the arch dims at dusk and night in step with everything else.
- Wind: ivy tendrils sway using the existing windAmp() helper, phase-offset per tendril, same sin(T * small-frequency + phase) technique as tree and bush sway.
- Moon: no direct reaction; night darkening is already handled through the shared nf/night factor, so moonlight does not need a separate code path.
- Theme: ivy color always pulled from activeTheme().foliage, so it is present and correctly colored across all five theme presets without new per-theme configuration.

Performance budget: about 28 to 30 draw calls per frame (2 pillar fills, 1 lintel fill, 3 to 4 moss blobs, 16 to 18 leaf-cluster fills, 4 to 6 tendril strokes). Entirely static geometry aside from the tendril sway, so cost is flat regardless of scene density settings.

RANK 2: Wisteria Corner Drape

Where it sits in scene depth order: New function drawWisteria(), called in frame() between drawAmbient() and drawWeather(). This is a foreground layer, composited on top of the fully rendered garden, which keeps its purple saturated and crisp. Confining it to the top corners means it never overlaps the pond, flowers, or grasses, which all live in the lower 40 to 100 percent height band.

Parametric draw spec:
- Two mirrored clusters, top-left anchored at x -0.01W to 0.15W, y 0 to 0.02H, and top-right anchored at x 0.85W to 1.01W, y 0 to 0.02H, both bleeding slightly off the top edge.
- Each cluster: 1 main vine stroke (2 to 3 bezier segments, width about 0.006W, colored activeTheme().foliage[0]) descending from the top edge to roughly 0.16H to 0.22H, with 2 to 3 secondary branch offshoots.
- From the branches, 5 drooping raceme clusters per side (10 total), each built the same way the existing flower loop builds a petal ring: 5 small overlapping petal ellipses per raceme in wisteria petal base (#9B87B5), plus a lighter 2-petal highlight pass in wisteria petal light (#C9BEDD) offset toward the top of each raceme, mirroring the existing flower center-highlight trick.
- Sizes as fractions: each raceme spans about 0.012W wide by 0.05H to 0.09H long (longer near the outer edge, shorter near center, for a natural taper), petal ellipses about 0.006W by 0.003W each.

Reacts to inputs:
- Wind: each raceme swings from its attachment point using sin(T * 0.0009 + phase) * windAmp(), the same helper already driving grass and flower sway, scaled down since wisteria is heavier than grass.
- Day and night: petal color darkened at night with the same shade(color, -0.25 * nf) pattern used elsewhere; during twilight the petals are mixed about 15 percent toward honey-light (#D8B26A) to pick up the same warm kiss the daylightWash already gives the rest of the scene.
- Weather: under rain, sway amplitude drops by half and droop angle increases slightly for a heavier, wet look; under snow, an optional single white rim-highlight stroke per raceme suggests light frost (skippable to save draw calls on low-power devices).
- Moon: no direct reaction, covered by the shared night-darkening factor.
- Theme: vine color sourced from activeTheme().foliage[0] like the arch; raceme color stays fixed to the two new wisteria hexes across all themes, since wisteria is a specific plant motif rather than a theme-driven foliage tone. This keeps it recognizable regardless of which of the five presets is active.

Performance budget: about 60 to 65 draw calls per frame at full settings (2 vine strokes, 6 branch strokes, 10 racemes times 5 to 7 fills each). Scale racemes-per-side down by the existing scale = Math.min(W, 1200) / 1200 factor already used for grass and flower counts, and halve raceme count when motionOn() is false, bringing the low-power case to about 30 to 35 draw calls.

RANK 3: Hanging Garden Lanterns

Where it sits in scene depth order: New function drawLanterns(), called immediately after drawWisteria() (still between drawAmbient() and drawWeather()). Glow composites on top of the fully rendered foliage, arch, and wisteria, and still sits beneath rain, snow, and fog so weather passes in front of the light for correct atmospheric compositing, the same relationship fog already has with the sun and moon glow today.

Parametric draw spec:
- 3 lanterns hung from the archway's implied crossbeam: x at 0.03W, 0.07W, 0.12W, strings starting at y around horizonY - 0.28H. 2 more lanterns hung from the implied right-edge tree canopy for left-right balance: x at 0.90W, 0.95W, strings starting at y around 0.10H to 0.16H. None fall inside the central 70 percent of width where the pond, flower bed, and trees live.
- Each lantern: 1 thin string stroke (1px, ink-muted at 0.4 alpha) from anchor point down to the lantern body; 1 small lantern body fill (rounded rect or hexagon, about 0.018W wide by 0.026H tall) using a radial gradient from lantern glow core (#F6C878) outward to transparent; 1 thin cap/base ring stroke in honey-deep (#9A7636, existing token); 1 outer glow halo, radius about 0.035W, built the same way as the existing moon and sun glow gradients and the firefly glow in drawAmbient.
- 5 lanterns times 4 draw operations each.

Reacts to inputs:
- Day and night: glow alpha is 0 through full day and fades in once twilight() passes roughly 0.3, reaching full strength through night, the same activation threshold pattern already used for fireflies (nf > 0.25) in drawAmbient. This is the literal "lights at dusk" behavior called for in the brief and is the clearest tie-in to the lantern and firefly research.
- Wind: lantern body swings as a pendulum from its string anchor, sin(T * 0.0007 + phase) * windAmp() * 0.02W, with amplitude scaling directly with state.weather.wind the same way clouds and grass already do.
- Weather: rain or storm increases sway amplitude by about 1.4x and dims glow alpha by about 0.8x for a damp-glass look; fog widens the glow halo radius by about 30 percent to mimic light scattering, echoing the logic already in daylightWash.
- Moon: optional minor nuance, reduce lantern glow alpha by about 10 percent when moonPhase() is within 0.05 of a full moon (0.5), since ambient moonlight is already bright on those nights. Low priority, safe to skip in a first pass.
- Distinctness from existing fireflies: lanterns are fixed-position, structured light sources with a visible body and string; fireflies remain small, mobile, wandering glow dots with no housing. The two are meant to coexist at night, not substitute for one another, and both can appear together regardless of which ambient theme setting (petals, pollen, fireflies, none) is active, since lanterns are tied to day and night rather than to activeTheme().ambient.

Performance budget: about 20 draw calls per frame (5 lanterns times 4 draws). Drop the glow halo pass when motionOn() is false to save 5 calls, bringing the reduced-motion case to about 15.

Combined total: the three additions together add roughly 108 to 115 draw calls per frame at full settings. For scale, the existing flower and grass loops alone already run into the several hundred draw calls per frame at high theme density, so this addition is proportionate and should not materially change the app's performance envelope.
