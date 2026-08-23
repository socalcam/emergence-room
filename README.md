# The Emergence Room

Six live, interactive Canvas2D simulations of emergence — complex global
structure arising from simple local rules — presented as a natural-history
museum where the specimens are algorithms. Zero dependencies, one HTML file.

**Live artifact:** https://claude.ai/code/artifact/db286c65-a6bd-4ef5-a3cb-0798d398e500

| # | Specimen | Algorithm |
|---|---|---|
| EM-01 | Slime Mold | Physarum transport network (28k agents, 3-sensor steering) |
| EM-02 | Reaction–Diffusion | Gray–Scott model (F=0.037, k=0.060) |
| EM-03 | Particle Life | Asymmetric attraction matrix, spatial-grid accelerated |
| EM-04 | Strange Attractor | Clifford map, 60k iterations/frame density plot |
| EM-05 | Dendritic Growth | Diffusion-limited aggregation |
| EM-06 | Spiral Waves | Cyclic cellular automaton (14 states) |

Every random choice derives from one integer seed — on the machine that grew
this collection, `hash(hostname + WLAN MAC)` = `2574436003` (`seed.txt`).
Same seed, same corals, same crystals, same storms.

## Layout

```
emergence.html        the built page (what's published)
pieces.concat.js      all six simulation modules, concatenated
seed.txt              this machine's seed
src/
  head.html           page chrome: hero, specimen grid, styles
  runtime.html        instance lifecycle, observation mode, IntersectionObserver
  pieces.json         per-piece metadata + module source (workflow output)
  assemble.py         src/* + pieces.json -> emergence.html
  extract.py          workflow journal -> pieces.json
test-harness.mjs      mock-DOM contract test (8 methods, cancellable rAF, 40 frames)
stress.mjs            400-step stability + perturbation sweep
pixels.mjs            pixel-diversity audit (catches "renders but black")
```

## Module contract

Each piece registers `window.PIECES[slug] = (canvas, seed) => api` where the
api is `{step, render, start, stop, resize, perturb(nx,ny), reseed, destroy}`.
Rules: seeded mulberry32 PRNG only (no `Math.random`), Canvas 2D only, DPR
capped at 1.5, rAF loop must actually stop, no top-level globals besides the
registration.

## Verify

```sh
node test-harness.mjs ./pieces.concat.js   # contract, 6/6
node stress.mjs                            # long-run stability
node pixels.mjs                            # output actually has color
python3 src/assemble.py                    # rebuild emergence.html (paths in-file)
```

## Provenance

Built by 12 parallel agents (6 implementers + 6 adversarial reviewers, one
per specimen) orchestrated in a Claude Code workflow, then verified through
the three harnesses above. Two reviewer-caught bugs fixed pre-ship.

MIT
