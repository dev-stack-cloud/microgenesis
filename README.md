# MICROGENESIS

A browser survival game set in a microscopic culture dish. Absorb nutrients, grow physical branches, adapt into one of three lineages, and destroy the Crown colony. A successful culture is paced for roughly 10–15 minutes.

[Play MICROGENESIS online](https://dev-stack-cloud.github.io/microgenesis/)

## Play locally

Install Node.js 22.13 or newer, then run from this directory.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. To serve a production build, run `npm run build` followed by `npm run preview`. The game needs WebGL and a current desktop or mobile browser. Textures and sound are generated locally. Fonts ship with their Open Font Licenses in `public/fonts`.

The GitHub Pages workflow builds and publishes `dist/` on pushes to `main`. The Pages publishing source is **GitHub Actions**.

## Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Swim | WASD or arrow keys | Left joystick |
| Aim | Mouse | Touch the field or aim with the joystick |
| Absorb | Hold left mouse button | Hold Absorb or touch the field |
| Bond | E | Bond |
| Impulse | Space | Dash |
| Discharge | Q | Pulse |
| Zoom | Mouse wheel | Pinch |
| Evolution tree | Tab or HUD button | Evolution button |
| Pause | Escape or HUD button | Pause button |

Cyan clusters replenish energy. Green tissue becomes biomass for branching. Amber catalysts unlock mutations. A bond spends stored biomass or integrates compatible biomass near your nucleus. An impulse can ram rivals or briefly protect you from damage. Discharge costs energy and follows your aim.

You commit to a lineage with your first mutation. Predator spines reward contact and energy theft. Symbiote veils favor absorption and repair. Crystalline armor supports stronger, aimed discharge. Further mutations require more bonds, catalysts and time.

Around 09:28, follow the HUD bearing to the Crown colony. Keep moving across its wake, avoid acid pools after their warning, and aim discharge at the colony during recovery. Lose the nucleus and the run ends.

## Saves and seeds

Progress saves every six simulated seconds, on pause, and on **Save & exit**. Continue culture resumes from that data. New culture starts a new run and replaces your current save. Settings and best-run records are stored separately in the browser. The default dish is reproducible. Pass an unsigned 32-bit seed as `?seed=12345` to generate a different one.

## Source layout

- `src/simulation.ts`, `src/organism.ts`, `src/spatial.ts`, and `src/progression.ts` implement the 60 Hz world, branching anatomy, nearby queries and evolutionary tradeoffs.
- `src/renderer.ts` and `src/render-*.ts` implement interpolated PixiJS WebGL rendering, procedural textures, camera and quality adaptation.
- `src/ui.ts`, `src/style.css`, `src/controls.ts`, `src/audio.ts`, and `src/storage.ts` handle browser presentation, input, synthesis and persistence. `src/main.ts` connects the layers.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Playwright also detects Chrome on a typical Windows install. Set `CHROME_PATH` to use a different installed Chromium executable. The browser suite serves the project locally, writes screenshots to `qa/`, and drives real browser controls. See [VERIFICATION.md](VERIFICATION.md) for the tested paths and measurement limits.

Run `npm run qa:checkpoints` to regenerate the browser encounter saves from a fixed-step run. With the game served at port 5174, run `node qa/performance.mjs` to sample frame pacing. Set `GAME_URL` to measure a different local address.
