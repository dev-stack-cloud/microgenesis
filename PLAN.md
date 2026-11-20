# MICROGENESIS implementation plan

Use Vite and strict TypeScript, PixiJS 8 WebGL, local procedural art, HTML/CSS, and synthesized audio. Build in this checkout and serve locally. The player begins in the nursery of a finite petri dish, increasingly ventures into contested nutrients, adapts along one of three paths, and confronts the Crown colony during the final phase.

1. Create deterministic fixed-step simulation, filtered inputs, springs, growth, and spatial queries. Acceptance is seeded replay and responsive early movement.
2. Add three independently feeding enemy types, branch damage and regeneration, mutations, combat, phase scaling, crown encounter and outcomes. Verify deterministic resource-to-victory progression and death.
3. Draw depth-separated medium and procedural organism materials. Read every graph node and parent bond from the live state. Give each lineage its own silhouette, accents and appendages.
4. Add inexpensive animated atmosphere and localized optical effects. Bound culling, batches and screen resolution.
5. Build the title, live HUD, controls, mutation tree, pause, outcome and settings. Save/resume and retain best records in localStorage. Integrate Web Audio and touch controls.
6. Profile the real browser build and tune the hot visual and simulation paths. Confirm graphics presets affect actual rendering.
7. Run Playwright on desktop Chromium and mobile emulation. Inspect screenshots in three refinement passes. Record what was run, screenshots and remaining device limitations.

Module boundaries: model and progression are browser-independent. Simulation owns state and emits events. Rendering owns camera and Pixi resources. UI and input report commands through main. Save serializes the simulation, settings and records separately.

All seven stages were implemented and checked. See [VERIFICATION.md](VERIFICATION.md) for the final measurements, Playwright scenarios and screenshot index.
