# Mistakes ledger

Named, categorized mistakes awaiting promotion to a durable memory surface. Maintained by the mistake-cartographer skill. One section per Pattern-Key, newest first.

## [MC-20260716-005] verification/no-field-telemetry
- Pattern-Key: verification/no-field-telemetry
- Family: verification
- Mode: no-success-definition
- Logged: 2026-07-16T00:10:31Z
- Recurrence: 1
- Status: pending
- Scope: all-work
- Surface: project-CLAUDE.md
- Trigger-Context: Shipped 5 blind iterative builds with no way to tell which build produced a user screenshot or what the device viewport was
- Root-Cause: Iterating on a device-only bug without first instrumenting the artifact (build stamp, environment readout) makes every report ambiguous and every fix unfalsifiable
- Generalized-Rule: When a bug reproduces only on a remote device, instrument first (visible build stamp + environment diagnostics), then iterate; one instrumented build beats several blind ones
- Scope-Test: general to any remote-device debugging; no false positives (instrumentation is cheap); durable
- Contributing: none
- Promoted-To: none
- See-Also: none

## [MC-20260716-004] tool-env/preview-not-device
- Pattern-Key: tool-env/preview-not-device
- Family: tool-env
- Mode: env-mismatch
- Logged: 2026-07-16T00:10:30Z
- Recurrence: 1
- Status: pending
- Scope: project
- Surface: project-CLAUDE.md
- Trigger-Context: Treated desktop preview results as authoritative for iOS device behavior; preview differed in SW, network, rate limits, rAF (hidden doc), caching, and viewport
- Root-Cause: The preview pane runs the page as a hidden document (rAF never fires, timers ~1Hz), serves stale cached files unless hard-bypassed, and lacks device network conditions - it is a rendering approximation, not a device
- Generalized-Rule: Treat browser preview as approximation only: hard-bypass caches before testing, never test rAF/timer-dependent code there, and never claim a device-facing fix verified from preview alone
- Scope-Test: general within this harness; bounded to preview-based verification; durable environment facts
- Contributing: none
- Promoted-To: none
- See-Also: none

## [MC-20260716-003] reasoning/patch-not-rederive
- Pattern-Key: reasoning/patch-not-rederive
- Family: reasoning
- Mode: faulty-derivation
- Logged: 2026-07-16T00:10:30Z
- Recurrence: 1
- Status: pending
- Scope: all-work
- Surface: userPreferences
- Trigger-Context: Applied three successive timing patches (barrier, pacing, frame-or-blank) to an architecture that could never be coherent; user had to demand first principles
- Root-Cause: After the first failed fix, kept optimizing the existing design instead of re-deriving from requirements whether the architecture could satisfy them at all
- Generalized-Rule: When a second fix for the same symptom fails, stop patching: re-derive the design from requirements, question the architecture not the timing, and name what evidence would distinguish competing root causes before writing more code
- Scope-Test: general; bounded to repeated failure of the same symptom so it cannot fire on first attempts; durable habit
- Contributing: verification
- Promoted-To: none
- See-Also: none

## [MC-20260716-002] knowledge/img-src-swap-lag
- Pattern-Key: knowledge/img-src-swap-lag
- Family: knowledge
- Mode: stale-knowledge
- Logged: 2026-07-16T00:10:30Z
- Recurrence: 1
- Status: pending
- Scope: cross-project-fact
- Surface: project-CLAUDE.md
- Trigger-Context: Three radar fixes built on the belief that assigning img.src swaps displayed pixels immediately
- Root-Cause: An <img> keeps painting its previous bitmap until the newly assigned src finishes downloading and decoding, so N imgs can never swap in unison; only a single canvas gives an atomic multi-tile paint
- Generalized-Rule: Any UI where multiple images must change in unison (map frames, sprite grids) must composite onto one canvas; per-element src swaps are structurally incapable of atomic swaps
- Scope-Test: general web-platform fact; no false positives; permanent platform semantics
- Contributing: none
- Promoted-To: none
- See-Also: none

## [MC-20260716-001] verification/proxy-not-observable
- Pattern-Key: verification/proxy-not-observable
- Family: verification
- Mode: unverified-output
- Logged: 2026-07-16T00:10:30Z
- Recurrence: 1
- Status: pending
- Scope: all-work
- Surface: userPreferences
- Trigger-Context: Declared radar 'verified coherent' twice from src attributes / frame markers while device pixels still tore
- Root-Cause: Tests checked internal proxies (attribute values, state markers) that agree instantly, not the painted pixels the user sees, which lag per-tile network decode
- Generalized-Rule: Verify UI fixes against the user-observable output under realistic conditions, never an internal proxy (attributes, state vars, logs); if the observable cannot be tested in the current environment, say so and treat the fix as unverified
- Scope-Test: general (any UI work); no false positives (proxies remain fine as debugging aids, just not as verification); durable
- Contributing: none
- Promoted-To: none
- See-Also: none
