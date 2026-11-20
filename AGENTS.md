# MICROGENESIS

A local, single-player WebGL game. Keep mechanics deterministic, visual identities readable, and tests honest.

- Respect the existing launch and control contracts in README.md.
- Update simulation at a fixed tick. Keep UI, visuals and audio out of simulation state.
- Treat local saves as untrusted data. Version them and recover gracefully when absent or invalid.
- Verify claims against actual test results and browser screenshots. Record software-renderer and emulation limits.
- Preserve deliberate English game copy. Reports distinguish measured results, assumptions and unknowns.
