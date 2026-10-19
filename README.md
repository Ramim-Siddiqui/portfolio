# Ramim Ali Siddiqui — Portfolio

**Live:** https://ramim-siddiqui.vercel.app

Personal portfolio of Ramim Ali Siddiqui, AI/ML engineer. The site is typeset like an interactive research journal in Times New Roman, with a single WebGL figure behind the text that re-forms into a different sculpture for each project as you scroll.

## Features

- **Living figure** (Three.js, custom shaders): thousands of particles morph between a neural sphere, a voice waveform, the support agent's graph, a syntax tree, a spreadsheet with a scan line, a galaxy, a laboratory of orbiting bodies, a database, a helix, a torus knot and finally the words "Say hello." The cursor disturbs the particles.
- **Live systems table**: pings the deployed projects from the visitor's browser and reports round-trip time.
- **Inline agent console**: runs the deployed Support Ticket Resolution Agent and lights up each graph node in the figure as the agent passes through it.
- **Journal typography**: numbered sections, figure captions, booktabs-style results tables, a drop cap and an index of methods that cross-references every skill to the projects that use it.
- Day and night editions, reduced-motion support, mobile layout, no build step.

## Structure

```
index.html          content and structure
css/style.css       typography, layout, day/night editions
js/theme.js         picks the edition before first paint
js/main.js          navigation, progress, table of contents, live status, agent console
js/figure.js        the WebGL figure: sculptures, shaders, morphing, pointer interaction
assets/             portrait, social card, CV
vercel.json         security headers and caching
```

## Run locally

Any static file server works, for example:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Deploy

Static site on Vercel; no build command or framework is needed.

## License

Copyright (c) 2026 Ramim Ali Siddiqui. All rights reserved. See [LICENSE](LICENSE).
