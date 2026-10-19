# Ramim Ali Siddiqui — Portfolio

**Live:** https://ramim-siddiqui.vercel.app

Personal portfolio of Ramim Ali Siddiqui, AI/ML engineer. The site is set in Times New Roman with an editorial layout, and each section has a live WebGL figure that re-forms into a different sculpture for every project as you scroll.

## Features

- **Living figure** (Three.js, custom shaders): thousands of particles morph between a neural sphere, a voice waveform, the support agent's graph, a syntax tree, a spreadsheet with a scan line, a galaxy, orbiting bodies, a database, a helix and finally the words "Say hello." The cursor disturbs the particles.
- **No overlap by design**: every section reserves an empty column for the figure. The figure is measured through the camera into that column on every frame, so it never covers text at any screen size, and it fades out in text-only sections.
- **Live systems table**: pings the deployed projects from the visitor's browser and reports response time.
- **Inline agent console**: runs the deployed Support Ticket Resolution Agent and lights up each graph node in the figure as the agent passes through it.
- Results tables, a skills index that links every skill to the projects that use it, light and dark mode, reduced-motion support, mobile layout, no build step.

## Structure

```
index.html          content and structure
css/style.css       typography, layout, light/dark mode
js/theme.js         picks light or dark before first paint
js/main.js          navigation, progress, side rail, live status, agent console
js/figure.js        the WebGL figure: sculptures, shaders, morphing, fitting, pointer interaction
assets/             portrait, social card, CV
vercel.json         security headers and caching
```

## Run locally

Any static file server works, for example:

```bash
python -m http.server 5173
```

Then open http://localhost:5173. Add `?debug` to the URL to expose `window.__figure()`, which reports the figure's on-screen box (used by the layout tests).

## Deploy

Static site on Vercel; no build command or framework is needed.

## License

Copyright (c) 2026 Ramim Ali Siddiqui. All rights reserved. See [LICENSE](LICENSE).
