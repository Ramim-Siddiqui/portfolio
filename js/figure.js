// The living figure: one cloud of particles that re-forms into a different sculpture
// for each section of the page. Every section reserves an empty column (.fig-slot);
// the sculpture is measured into that column each frame, so it never covers text.
// Sections without a slot (data-shape="none") simply fade the figure out.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const canvas = document.getElementById("figure");
const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const N = innerWidth < 760 || coarse ? 4600 : 9000;
const TAU = Math.PI * 2;
const DEBUG = new URLSearchParams(location.search).has("debug");

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Collects exactly N points plus the per-point data some shapes animate with. */
class Shape {
  constructor(seed) {
    this.r = rng(seed);
    this.pos = new Float32Array(N * 3);
    this.row = new Float32Array(N);           // spreadsheet row (0 = top, 1 = bottom)
    this.flow = new Float32Array(N);          // position along an agent-graph edge
    this.node = new Float32Array(N).fill(-1); // agent-graph node id, -1 = edge
    this.hot = new Float32Array(N);           // highlighted points
    this.i = 0;
  }
  get full() { return this.i >= N; }
  gauss() {
    let u = 0, v = 0;
    while (!u) u = this.r();
    while (!v) v = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  push(x, y, z, extra) {
    if (this.i >= N) return;
    const k = this.i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    if (extra) {
      if (extra.row !== undefined) this.row[this.i] = extra.row;
      if (extra.flow !== undefined) this.flow[this.i] = extra.flow;
      if (extra.node !== undefined) this.node[this.i] = extra.node;
      if (extra.hot) this.hot[this.i] = extra.hot;
    }
    this.i++;
  }
  rotate(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      const x = this.pos[k], y = this.pos[k + 1], z = this.pos[k + 2];
      const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
      this.pos[k] = x * cy + z1 * sy; this.pos[k + 1] = y1; this.pos[k + 2] = -x * sy + z1 * cy;
    }
    return this;
  }
  // Order points left to right so morphs sweep instead of exploding, and measure the shape.
  finish(extraHeight = 0) {
    const idx = Array.from({ length: N }, (_, i) => i);
    const key = new Float32Array(N);
    for (let i = 0; i < N; i++) key[i] = this.pos[i * 3] + (this.r() - 0.5) * 0.6;
    idx.sort((a, b) => key[a] - key[b]);
    const pos = new Float32Array(N * 3), row = new Float32Array(N), flow = new Float32Array(N), node = new Float32Array(N), hot = new Float32Array(N);
    idx.forEach((src, dst) => {
      pos[dst * 3] = this.pos[src * 3]; pos[dst * 3 + 1] = this.pos[src * 3 + 1]; pos[dst * 3 + 2] = this.pos[src * 3 + 2];
      row[dst] = this.row[src]; flow[dst] = this.flow[src]; node[dst] = this.node[src]; hot[dst] = this.hot[src];
    });
    Object.assign(this, { pos, row, flow, node, hot });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, maxR = 0;
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      maxR = Math.max(maxR, Math.hypot(x, z));
    }
    this.bounds = {
      minX, maxX, minY, maxY, minZ, maxZ,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY + extraHeight,
      depth: Math.max(Math.abs(minZ), Math.abs(maxZ)), radius: maxR,
    };
    return this;
  }
}

/* ------------------------------------------------------------------ */
/* Sculptures                                                          */
/* ------------------------------------------------------------------ */
// A random point on the outline of a rectangle (for sheet and photo frames).
function edgePoint(s, L, R, B, T) {
  let d = s.r() * 2 * (R - L + T - B);
  if (d < R - L) return [L + d, B];
  if ((d -= R - L) < T - B) return [R, B + d];
  if ((d -= T - B) < R - L) return [R - d, T];
  return [L, T - (d - (R - L))];
}

const builders = {
  // A neural sphere: a lattice of nodes joined by arcs, over a thin shell.
  sphere() {
    const s = new Shape(11), R = 2.45, nodes = [], M = 72;
    for (let k = 0; k < M; k++) {
      const y = 1 - (2 * (k + 0.5)) / M, r = Math.sqrt(1 - y * y), th = k * 2.399963;
      nodes.push([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R]);
    }
    const edges = [];
    nodes.forEach((a, i) => {
      nodes.map((b, j) => [j, (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2])
        .filter((e) => e[0] !== i).sort((p, q) => p[1] - q[1]).slice(0, 3)
        .forEach(([j]) => { if (i < j) edges.push([i, j]); });
    });
    for (let k = 0; k < N * 0.5; k++) {
      const [i, j] = edges[k % edges.length], t = s.r(), a = nodes[i], b = nodes[j];
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const len = Math.hypot(x, y, z), lift = R * (1 + 0.07 * Math.sin(Math.PI * t));
      s.push((x / len) * lift, (y / len) * lift, (z / len) * lift);
    }
    for (let k = 0; k < N * 0.16; k++) {
      const a = nodes[k % M];
      s.push(a[0] + s.gauss() * 0.045, a[1] + s.gauss() * 0.045, a[2] + s.gauss() * 0.045, { hot: k % 9 === 0 ? 1 : 0 });
    }
    while (!s.full) {
      const th = TAU * s.r(), ph = Math.acos(2 * s.r() - 1);
      const rad = s.r() < 0.75 ? R * (0.985 + s.r() * 0.015) : R * (0.55 + Math.cbrt(s.r()) * 0.35);
      s.push(rad * Math.sin(ph) * Math.cos(th), rad * Math.cos(ph), rad * Math.sin(ph) * Math.sin(th));
    }
    return s.finish();
  },

  // A voice waveform: stacked ribbons that the shader sets in motion.
  wave() {
    const s = new Shape(21), L = 15;
    while (s.i < N * 0.95) {
      const layer = Math.floor(s.r() * L), z = (layer / (L - 1) - 0.5) * 2.6, x = (s.r() - 0.5) * 7.4;
      const env = Math.exp((-x * x) / 6.5);
      const y = env * (0.85 * Math.sin(1.6 * x + z * 1.1) + 0.32 * Math.sin(4.3 * x - z * 2.0)) * 0.95 + s.gauss() * 0.012;
      s.push(x, y, z);
    }
    while (!s.full) s.push((s.r() - 0.5) * 7.2, (s.r() - 0.5) * 2.4, (s.r() - 0.5) * 2.6);
    return s.rotate(0.32, -0.25).finish(0.9);
  },

  // The agent's LangGraph: six node clusters joined by curved edges.
  flow() {
    const s = new Shape(31);
    const P = [[-3.0, 0.2, 0], [-1.55, 0.2, 0.25], [0, 0.2, 0], [1.55, 0.2, -0.25], [0.78, 1.75, 0.1], [2.85, -1.35, 0]];
    const RAD = [0.34, 0.34, 0.4, 0.4, 0.3, 0.3];
    const W = [1, 1, 1.25, 1.25, 0.8, 0.8], wsum = W.reduce((a, b) => a + b, 0);
    const E = [[0, 1, 0.4], [1, 2, 0.4], [2, 3, 0.4], [3, 4, 0.55], [4, 2, 0.55], [3, 5, -0.45]];
    for (let n = 0; n < 6; n++) {
      const count = Math.round((N * 0.52 * W[n]) / wsum);
      for (let k = 0; k < count; k++) {
        const th = TAU * s.r(), ph = Math.acos(2 * s.r() - 1), rad = RAD[n] * (0.82 + 0.18 * s.r());
        s.push(P[n][0] + rad * Math.sin(ph) * Math.cos(th), P[n][1] + rad * Math.cos(ph), P[n][2] + rad * Math.sin(ph) * Math.sin(th), { node: n });
      }
    }
    for (let k = 0; k < N * 0.44; k++) {
      const [a, b, lift] = E[k % E.length], t = s.r(), A = P[a], B = P[b];
      const C = [(A[0] + B[0]) / 2 - (B[1] - A[1]) * 0.18, (A[1] + B[1]) / 2 + lift, (A[2] + B[2]) / 2 + 0.3];
      const u = 1 - t;
      s.push(
        u * u * A[0] + 2 * u * t * C[0] + t * t * B[0] + s.gauss() * 0.012,
        u * u * A[1] + 2 * u * t * C[1] + t * t * B[1] + s.gauss() * 0.012,
        u * u * A[2] + 2 * u * t * C[2] + t * t * B[2] + s.gauss() * 0.012,
        { flow: t, node: -1 }
      );
    }
    while (!s.full) s.push(-3.2 + s.r() * 6.3, -1.6 + s.r() * 3.6, (s.r() - 0.5) * 1.6, { node: -2 });
    return s.rotate(0.12, 0).finish();
  },

  // An abstract syntax tree with one vulnerable path in red.
  tree() {
    const s = new Shape(41), nodes = [];
    const grow = (depth, parent) => {
      const id = nodes.length;
      nodes.push({ depth, parent, kids: [], z: (s.r() - 0.5) * 1.1 });
      if (parent >= 0) nodes[parent].kids.push(id);
      if (depth < 5) {
        const k = depth < 2 ? 3 : s.r() < 0.5 ? 2 : s.r() < 0.6 ? 1 : 0;
        for (let i = 0; i < k; i++) grow(depth + 1, id);
      }
    };
    grow(0, -1);
    let leaf = 0;
    const layout = (id) => {
      const nd = nodes[id];
      if (!nd.kids.length) nd.x = leaf++;
      else { nd.kids.forEach(layout); nd.x = (nodes[nd.kids[0]].x + nodes[nd.kids[nd.kids.length - 1]].x) / 2; }
    };
    layout(0);
    nodes.forEach((nd) => { nd.X = (nd.x / Math.max(1, leaf - 1) - 0.5) * 6.4; nd.Y = 2.3 - nd.depth * 0.98; });
    let deepest = 0;
    nodes.forEach((nd, i) => { if (nd.depth >= nodes[deepest].depth && nd.X > 0.4) deepest = i; });
    const hotSet = new Set();
    for (let i = deepest; i >= 0; i = nodes[i].parent) hotSet.add(i);
    for (let k = 0; k < N * 0.37; k++) {
      const id = k % nodes.length, nd = nodes[id];
      s.push(nd.X + s.gauss() * 0.06, nd.Y + s.gauss() * 0.06, nd.z + s.gauss() * 0.06, { hot: hotSet.has(id) ? 1 : 0 });
    }
    const links = nodes.map((nd, i) => [nd.parent, i]).filter(([p]) => p >= 0);
    for (let k = 0; k < N * 0.6; k++) {
      const [p, c] = links[k % links.length], t = s.r(), A = nodes[p], B = nodes[c];
      s.push(A.X + (B.X - A.X) * t, A.Y + (B.Y - A.Y) * t, A.z + (B.z - A.z) * t, { hot: hotSet.has(p) && hotSet.has(c) ? 1 : 0 });
    }
    while (!s.full) s.push((s.r() - 0.5) * 6.4, -2.6 + s.r() * 4.9, (s.r() - 0.5) * 1.2);
    return s.finish();
  },

  // A spreadsheet in perspective; the shader runs a scan line down its rows.
  grid() {
    const s = new Shape(51), rows = 13, cols = 7, cw = 0.84, ch = 0.4, W = cols * cw, H = rows * ch;
    const x0 = -W / 2, y0 = H / 2, hLen = (rows + 1) * W, vLen = (cols + 1) * H;
    for (let k = 0; k < N * 0.46; k++) {
      if (s.r() < hLen / (hLen + vLen)) {
        const r = Math.floor(s.r() * (rows + 1));
        s.push(x0 + s.r() * W, y0 - r * ch, 0, { row: Math.min(1, r / rows) });
      } else {
        const c = Math.floor(s.r() * (cols + 1)), y = y0 - s.r() * H;
        s.push(x0 + c * cw, y, 0, { row: (y0 - y) / H });
      }
    }
    const lens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lens.push(0.25 + s.r() * 0.45);
    for (let k = 0; k < N * 0.52; k++) {
      const r = s.r() < 0.14 ? 0 : 1 + Math.floor(s.r() * (rows - 1)), c = Math.floor(s.r() * cols);
      const len = lens[r * cols + c] * cw;
      s.push(x0 + c * cw + 0.1 + s.r() * len, y0 - (r + 0.5) * ch + s.gauss() * 0.02, s.gauss() * 0.01, { row: (r + 0.5) / rows, hot: r === 0 ? 1 : 0 });
    }
    while (!s.full) s.push(x0 + s.r() * W, y0 - s.r() * H, s.gauss() * 0.05, { row: -1 });
    return s.rotate(-0.92, 0.38).finish();
  },

  // A two-armed spiral galaxy that twinkles.
  galaxy() {
    const s = new Shape(61);
    while (s.i < N * 0.86) {
      const arm = s.i % 2, u = s.r(), r = 0.25 + Math.pow(u, 0.62) * 3.3;
      const th = r * 1.55 + arm * Math.PI + (s.gauss() * 0.32) / (r * 0.45 + 0.5);
      s.push(r * Math.cos(th), s.gauss() * 0.1 * (1 + 0.8 / (r + 0.3)), r * Math.sin(th));
    }
    while (!s.full) s.push(s.gauss() * 0.42, s.gauss() * 0.28, s.gauss() * 0.42, { hot: s.r() < 0.12 ? 1 : 0 });
    return s.rotate(0.52, 0).finish();
  },

  // Six bodies of work orbiting one another.
  cluster() {
    const s = new Shape(71), RAD = [0.78, 0.6, 0.5, 0.66, 0.45, 0.56], ring = 2.25;
    const area = RAD.map((r) => r * r), total = area.reduce((a, b) => a + b, 0);
    for (let n = 0; n < 6; n++) {
      const a = (n / 6) * TAU, cx = Math.cos(a) * ring, cz = Math.sin(a) * ring, cy = Math.sin(a * 2) * 0.35;
      const count = Math.round((N * 0.9 * area[n]) / total);
      for (let k = 0; k < count; k++) {
        const th = TAU * s.r(), ph = Math.acos(2 * s.r() - 1), rad = RAD[n] * (s.r() < 0.75 ? 1 : Math.cbrt(s.r()));
        s.push(cx + rad * Math.sin(ph) * Math.cos(th), cy + rad * Math.cos(ph), cz + rad * Math.sin(ph) * Math.sin(th), { hot: n === 0 && s.r() < 0.4 ? 1 : 0 });
      }
    }
    while (!s.full) { const a = TAU * s.r(); s.push(Math.cos(a) * ring, s.gauss() * 0.02, Math.sin(a) * ring); }
    return s.rotate(0.42, 0).finish();
  },

  // The classic database: a cylinder with banded rings and a filled lid.
  cylinder() {
    const s = new Shape(81), R = 1.7, levels = [1.55, 0.52, -0.52, -1.55];
    for (let k = 0; k < N * 0.44; k++) {
      const y = levels[k % 4], a = TAU * s.r();
      s.push(Math.cos(a) * R * (1 + s.gauss() * 0.006), y + s.gauss() * 0.012, Math.sin(a) * R * (1 + s.gauss() * 0.006));
    }
    for (let k = 0; k < N * 0.18; k++) {
      const a = TAU * s.r(), r = R * Math.sqrt(s.r());
      s.push(Math.cos(a) * r, 1.55, Math.sin(a) * r);
    }
    while (!s.full) {
      const a = TAU * s.r(), y = -1.55 + s.r() * 3.1;
      s.push(Math.cos(a) * R, y, Math.sin(a) * R, { hot: s.r() < 0.05 ? 1 : 0 });
    }
    return s.rotate(0.26, 0).finish();
  },

  // A double helix rising through time; four bright jobs.
  helix() {
    const s = new Shape(91), turns = 2.1, r = 1.25, ms = [0.12, 0.38, 0.64, 0.9];
    const at = (t, phase) => [Math.cos(t * TAU * turns + phase) * r, -2.6 + t * 5.2, Math.sin(t * TAU * turns + phase) * r];
    for (let k = 0; k < N * 0.6; k++) {
      const t = s.r(), p = at(t, s.r() < 0.5 ? 0 : Math.PI);
      s.push(p[0] + s.gauss() * 0.05, p[1] + s.gauss() * 0.05, p[2] + s.gauss() * 0.05);
    }
    for (let k = 0; k < N * 0.14; k++) {
      const t = Math.floor(s.r() * 22) / 22 + 0.02, a = at(t, 0), b = at(t, Math.PI), u = s.r();
      s.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    }
    for (let k = 0; k < N * 0.12; k++) {
      const p = at(ms[k % 4], 0);
      s.push(p[0] + s.gauss() * 0.11, p[1] + s.gauss() * 0.11, p[2] + s.gauss() * 0.11, { hot: 1 });
    }
    while (!s.full) s.push(s.gauss() * 0.03, -2.7 + s.r() * 5.4, s.gauss() * 0.03);
    return s.finish();
  },

  // An answer sheet: two columns of questions, four bubbles each, one marked per question.
  quiz() {
    const s = new Shape(131), cols = 2, rows = 9, opts = 4, br = 0.16, gap = 0.48, rowH = 0.5, colW = 3.05;
    const W = cols * colW, H = rows * rowH, top = H / 2, left = -W / 2, qs = cols * rows, mark = [];
    for (let q = 0; q < qs; q++) mark.push(Math.floor(s.r() * opts));
    const at = (q, o) => [left + Math.floor(q / rows) * colW + 0.95 + o * gap, top - ((q % rows) + 0.5) * rowH];
    for (let k = 0; k < N * 0.46; k++) {
      const b = k % (qs * opts), [x, y] = at(Math.floor(b / opts), b % opts), a = TAU * s.r();
      s.push(x + Math.cos(a) * br, y + Math.sin(a) * br, s.gauss() * 0.008);
    }
    for (let k = 0; k < N * 0.2; k++) {
      const q = k % qs, [x, y] = at(q, mark[q]), a = TAU * s.r(), r = br * 0.9 * Math.sqrt(s.r());
      s.push(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.015, { hot: 1 });
    }
    for (let k = 0; k < N * 0.1; k++) {
      const [x, y] = at(k % qs, 0);
      s.push(x - 0.75 + s.r() * 0.38, y + s.gauss() * 0.012, 0);
    }
    for (let k = 0; k < N * 0.08; k++) {
      const x0 = left + 0.2 + (k % 2) * colW;
      s.push(x0 + s.r() * (colW - 0.6), top + 0.42 + s.gauss() * 0.01, 0);
    }
    while (!s.full) {
      const [x, y] = edgePoint(s, left - 0.05, left + W - 0.25, -H / 2 - 0.3, top + 0.8);
      s.push(x + s.gauss() * 0.01, y + s.gauss() * 0.01, -0.02);
    }
    return s.rotate(-0.5, 0.28).finish();
  },

  // A camera's view: lens rings and an aperture, a radar sweep (in the shader) and three tracked faces.
  lens() {
    const s = new Shape(141), radii = [0.5, 1.0, 1.55, 2.2], R = 2.2;
    const ang = (x, y) => (Math.atan2(y, x) / TAU + 1) % 1;
    for (let k = 0; k < N * 0.42; k++) {
      const i = k % radii.length, a = TAU * s.r(), r = radii[i] * (1 + s.gauss() * 0.006);
      s.push(Math.cos(a) * r, Math.sin(a) * r, -i * 0.14, { row: a / TAU });
    }
    for (let k = 0; k < N * 0.1; k++) {
      const a0 = ((k % 6) / 6) * TAU + 0.3, a1 = a0 + TAU / 6, t = s.r(), r = 0.78;
      const x = Math.cos(a0) * r * (1 - t) + Math.cos(a1) * r * t, y = Math.sin(a0) * r * (1 - t) + Math.sin(a1) * r * t;
      s.push(x, y, 0.06, { row: ang(x, y) });
    }
    const faces = [[1.2, 0.85, 0.5], [-1.3, 0.35, 0.42], [0.25, -1.35, 0.46]];
    for (let k = 0; k < N * 0.16; k++) {
      const [cx, cy, h] = faces[k % 3];
      let x, y;
      if (s.r() < 0.35) {
        const a = TAU * s.r(), r = h * 0.28 * Math.sqrt(s.r());
        x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r;
      } else {
        const c = Math.floor(s.r() * 4), sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, along = s.r() * h * 0.45;
        if (s.r() < 0.5) { x = cx + sx * h; y = cy + sy * (h - along); } else { x = cx + sx * (h - along); y = cy + sy * h; }
      }
      s.push(x, y, 0.1, { hot: 1, row: -1 });
    }
    while (!s.full) {
      const a = TAU * s.r(), r = R * Math.sqrt(s.r());
      s.push(Math.cos(a) * r, Math.sin(a) * r, -0.3 + s.gauss() * 0.04, { row: a / TAU });
    }
    return s.rotate(-0.3, 0.35).finish();
  },

  // A head-and-shoulders portrait in a photo frame; the face landmarks are lit.
  bust() {
    const s = new Shape(151), hx = 0.78, hy = 0.98, hz = 0.8, hc = 0.72;
    for (let k = 0; k < N * 0.32; k++) {
      const th = TAU * s.r(), ph = Math.acos(2 * s.r() - 1);
      s.push(hx * Math.sin(ph) * Math.cos(th), hc + hy * Math.cos(ph), hz * Math.sin(ph) * Math.sin(th));
    }
    for (let k = 0; k < N * 0.05; k++) {
      const a = TAU * s.r();
      s.push(Math.cos(a) * 0.33, -0.95 + s.r() * 0.75, Math.sin(a) * 0.3);
    }
    for (let k = 0; k < N * 0.3; k++) {
      const th = TAU * s.r(), ph = Math.acos(s.r());
      s.push(1.75 * Math.sin(ph) * Math.cos(th), -2.05 + 1.15 * Math.cos(ph), 0.62 * Math.sin(ph) * Math.sin(th));
    }
    const marks = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; marks.push([side * 0.3 + Math.cos(a) * 0.13, 0.86 + Math.sin(a) * 0.055]); }
      for (let i = 0; i < 9; i++) { const t = i / 8; marks.push([side * (0.15 + t * 0.32), 1.06 + Math.sin(t * Math.PI) * 0.06]); }
    }
    for (let i = 0; i < 8; i++) marks.push([0, 0.84 - i * 0.045]);
    for (let i = 0; i < 7; i++) marks.push([-0.09 + i * 0.03, 0.5]);
    for (let i = 0; i < 15; i++) { const t = i / 14 - 0.5; marks.push([t * 0.44, 0.34 - Math.cos(t * Math.PI) * 0.025]); }
    for (let i = 0; i < 25; i++) { const a = Math.PI * (1.05 + (i / 24) * 0.9); marks.push([Math.cos(a) * 0.68, hc + Math.sin(a) * 0.88]); }
    for (let k = 0; k < N * 0.09; k++) {
      const [x, y] = marks[k % marks.length], u = Math.max(0, 1 - (x / hx) ** 2 - ((y - hc) / hy) ** 2);
      s.push(x + s.gauss() * 0.008, y + s.gauss() * 0.008, hz * Math.sqrt(u) + 0.02, { hot: 1 });
    }
    while (!s.full) {
      const [x, y] = edgePoint(s, -2.6, 2.6, -2.3, 2.15);
      s.push(x + s.gauss() * 0.012, y + s.gauss() * 0.012, -0.85);
    }
    return s.rotate(0.04, -0.26).finish();
  },

  // "Say hello." sampled from Times New Roman on a hidden canvas.
  text() {
    const s = new Shape(121);
    const c = document.createElement("canvas"), cw = 1600, chh = 420;
    c.width = cw; c.height = chh;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#000";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = 'italic 300px "Times New Roman", Tinos, Times, serif';
    g.fillText("Say hello.", cw / 2, chh / 2 + 10);
    const data = g.getImageData(0, 0, cw, chh).data, pts = [];
    for (let y = 0; y < chh; y += 3) for (let x = 0; x < cw; x += 3) if (data[(y * cw + x) * 4 + 3] > 128) pts.push([x, y]);
    if (!pts.length) return builders.sphere();
    const scale = 7.8 / cw;
    while (!s.full) {
      const [x, y] = pts[Math.floor(s.r() * pts.length)];
      s.push((x - cw / 2 + s.r() * 3) * scale, -(y - chh / 2 + s.r() * 3) * scale, s.gauss() * 0.05, { hot: s.r() < 0.05 ? 1 : 0 });
    }
    return s.finish();
  },
};
const SPIN = { sphere: 0.07, galaxy: 0.05, cluster: 0.09, cylinder: 0.12, helix: 0.16 };
const UNIFORM_FOR = { wave: "uWave", grid: "uScan", lens: "uScan", flow: "uFlow", galaxy: "uTwinkle" };
const TILT = { text: 0.03 };
const HOT = { tree: 1, helix: 1, grid: 0.55, sphere: 0.6, cluster: 0.55, galaxy: 0.7, cylinder: 0.6, text: 0.5, quiz: 0.85, lens: 0.9, bust: 0.85 };

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  root.classList.add("no-webgl");
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9.5);
  const group = new THREE.Group();
  scene.add(group);

  const cache = {};
  const shape = (name) => (cache[name] ||= (builders[name] || builders.sphere)());

  const geo = new THREE.BufferGeometry();
  const render = new Float32Array(N * 3);
  const cur = new Float32Array(N * 3);
  const off = new Float32Array(N * 3);
  const rand = new Float32Array(N), accent = new Float32Array(N), speed = new Float32Array(N);
  const r0 = rng(7);
  for (let i = 0; i < N; i++) {
    rand[i] = r0();
    accent[i] = r0() < 0.045 ? 1 : 0;
    speed[i] = 0.022 + rand[i] * 0.05;
    // Intro: start as a small seed in the middle of the figure's own column and grow.
    cur[i * 3] = (r0() - 0.5) * 0.4;
    cur[i * 3 + 1] = (r0() - 0.5) * 0.4;
    cur[i * 3 + 2] = (r0() - 0.5) * 0.4;
  }
  const attr = (arr, size) => new THREE.BufferAttribute(arr, size);
  geo.setAttribute("position", attr(render, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aRand", attr(rand, 1));
  geo.setAttribute("aAccent", attr(accent, 1));
  geo.setAttribute("aRow", attr(new Float32Array(N), 1));
  geo.setAttribute("aFlow", attr(new Float32Array(N), 1));
  geo.setAttribute("aNode", attr(new Float32Array(N).fill(-1), 1));
  geo.setAttribute("aHot", attr(new Float32Array(N), 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: 30 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uInk: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
    uAlpha: { value: 1 },
    uDim: { value: 0 },
    uScale: { value: 1 },
    uWave: { value: 0 }, uScan: { value: 0 }, uFlow: { value: 0 }, uHot: { value: 0 }, uTwinkle: { value: 0 },
    uActiveNode: { value: -10 }, uNodePulse: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uSize, uPixelRatio, uAlpha, uDim, uScale;
      uniform float uWave, uScan, uFlow, uHot, uTwinkle, uActiveNode, uNodePulse;
      uniform vec3 uInk, uAccent;
      attribute float aRand, aAccent, aRow, aFlow, aNode, aHot;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p += 0.03 * vec3(sin(uTime * 0.7 + aRand * 40.0), cos(uTime * 0.6 + aRand * 31.0), sin(uTime * 0.5 + aRand * 23.0));
        float env = exp(-p.x * p.x / 7.0);
        p.y += uWave * env * 0.45 * sin(uTime * 2.6 + p.x * 2.1 + p.z * 1.4) * (0.55 + 0.45 * sin(uTime * 1.1 + p.x * 0.6));

        float glow = 0.0;
        float scanPos = fract(uTime * 0.065);
        glow += uScan * step(0.0, aRow) * (1.0 - smoothstep(0.0, 0.045, abs(aRow - scanPos)));
        float onEdge = step(aNode, -0.5) * step(-1.5, aNode);
        glow += uFlow * onEdge * (1.0 - smoothstep(0.0, 0.08, abs(fract(uTime * 0.42) - aFlow)));
        glow += uFlow * uNodePulse * (1.0 - step(0.5, abs(aNode - uActiveNode)));
        glow += uHot * aHot * (0.7 + 0.3 * sin(uTime * 2.0 + aRand * 6.0));
        float twinkle = 1.0 + uTwinkle * 0.9 * sin(uTime * 2.3 + aRand * 90.0);
        glow = clamp(glow, 0.0, 1.0);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // Point size follows the figure's scale so small columns get finer particles.
        float size = uSize * clamp(uScale, 0.8, 1.25) * (0.55 + aRand * 0.9) * (1.0 + glow * 1.4) * max(twinkle, 0.2);
        gl_PointSize = size * uPixelRatio / -mv.z;
        float a = max(aAccent * 0.9, glow);
        vColor = mix(uInk, uAccent, a);
        float depthFade = smoothstep(17.0, 6.0, -mv.z);
        vAlpha = (0.5 + 0.5 * aRand) * depthFade * uDim * uAlpha * (0.85 + glow * 0.7);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.08, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  group.add(points);

  /* ---------- Light / dark ---------- */
  function applyMode() {
    const dark = root.dataset.theme === "dark";
    uniforms.uInk.value.set(dark ? "#efe7d6" : "#1b1a24");
    uniforms.uAccent.value.set(dark ? "#ff6b4f" : "#b8321e");
    uniforms.uAlpha.value = dark ? 0.66 : 0.85;
    uniforms.uSize.value = dark ? 30 : 34;
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }
  applyMode();
  addEventListener("editionchange", applyMode);

  /* ---------- Fitting the sculpture into a section's slot ---------- */
  const sections = [...document.querySelectorAll("[data-shape]")];
  const railVisible = () => innerWidth >= 1520;   // same breakpoint as .toc in style.css
  const slotOf = (el) => {
    if (!el || el.dataset.shape === "none") return null;
    const slot = el.querySelector(".fig-slot");
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    if (r.width <= 4 || r.height <= 4) return null;
    // On wide screens the page margin beside the slot is empty, so let the figure use it
    // (only on the side away from the text; the nav rail keeps its strip on the left).
    let left = r.left, right = r.right;
    const text = el.querySelector(".split-text, .paper-text");
    if (text && innerWidth >= 900) {
      const tr = text.getBoundingClientRect();
      if (r.left >= tr.right) right = Math.max(right, innerWidth - 40);
      else if (r.right <= tr.left) left = Math.min(left, railVisible() ? 88 : 40);
    }
    return { left, right, top: r.top, bottom: r.bottom, width: right - left, height: r.height };
  };
  function visibleSize() {
    const h = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { w: h * camera.aspect, h };
  }
  // Sample points (with the extremes of every axis) used to measure a shape on screen.
  const sampleCache = {};
  function samplesOf(name) {
    if (sampleCache[name]) return sampleCache[name];
    const sh = shape(name), pts = [], p = sh.pos;
    const ext = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    for (const [axis, sign] of ext) {
      let best = 0;
      for (let i = 1; i < N; i++) if (sign * p[i * 3 + axis] > sign * p[best * 3 + axis]) best = i;
      pts.push(p[best * 3], p[best * 3 + 1], p[best * 3 + 2]);
    }
    const step = Math.max(1, Math.floor(N / 320));
    for (let i = 0; i < N; i += step) pts.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    // Morphs travel inside the shape's box (see remapInto), so measure the box itself too:
    // its eight corners, or for spinning shapes the rims of the cylinder it sweeps.
    const bb = sh.bounds, lift = name === "wave" ? 0.45 : 0;
    if (SPIN[name]) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU, x = Math.cos(a) * bb.radius, z = Math.sin(a) * bb.radius;
        pts.push(x, bb.minY, z, x, bb.maxY, z);
      }
    } else {
      for (const x of [bb.minX, bb.maxX]) for (const y of [bb.minY - lift, bb.maxY + lift]) for (const z of [bb.minZ, bb.maxZ]) pts.push(x, y, z);
    }
    // The waveform also moves vertically in the shader; include its reach.
    if (name === "wave") {
      const n = pts.length;
      for (let k = 0; k < n; k += 3) pts.push(pts[k], pts[k + 1] + 0.45, pts[k + 2], pts[k], pts[k + 1] - 0.45, pts[k + 2]);
    }
    return (sampleCache[name] = new Float32Array(pts));
  }
  // Screen-space box of a shape for a given placement, over every rotation it can take.
  function measure(name, x, y, s) {
    const pts = samplesOf(name), spin = !!SPIN[name], tilt = coarse || reducedMotion ? 0 : (TILT[name] ?? 0.12);
    const d = camera.position.z, ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tx = ty * camera.aspect;
    const ys = spin ? [0, 0.785, 1.571, 2.356, 3.142, 3.927, 4.712, 5.498] : [-tilt, 0, tilt];
    const xs = tilt ? [-tilt * 0.6, tilt * 0.6] : [0];
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (const ay of ys) for (const ax of xs) {
      const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      for (let i = 0; i < pts.length; i += 3) {
        const px = pts[i] * s, py = pts[i + 1] * s, pz = pts[i + 2] * s;
        const x1 = px * cy + pz * sy, z1 = -px * sy + pz * cy;     // rotate around Y
        const y2 = py * cx - z1 * sx, z2 = py * sx + z1 * cx;      // then around X
        const wx = x1 + x, wy = y2 + y, depth = d - z2;
        const sxp = ((wx / depth) / tx + 1) / 2 * innerWidth, syp = (1 - (wy / depth) / ty) / 2 * innerHeight;
        if (sxp < l) l = sxp; if (sxp > r) r = sxp; if (syp < t) t = syp; if (syp > b) b = syp;
      }
    }
    return { l, r, t, b, w: r - l, h: b - t, cx: (l + r) / 2, cy: (t + b) / 2 };
  }
  function fit(rect, name) {
    const vis = visibleSize(), perPx = vis.w / innerWidth;
    const pad = 6, availW = rect.width - pad * 2, availH = Math.min(rect.height, innerHeight * 0.82) - pad * 2;
    const toWorld = (px, py) => [(px - innerWidth / 2) * perPx, -(py - innerHeight / 2) * perPx];
    const wantX = rect.left + rect.width / 2;
    const key = `${name}|${Math.round(rect.width)}|${Math.round(rect.height)}|${innerWidth}|${innerHeight}`;
    let s = fitCache.get(key), m = null, [x, y] = toWorld(wantX, innerHeight / 2);
    if (s === undefined) {
      // Scale until the measured box fits (only when the slot or window size changes).
      s = 1;
      for (let it = 0; it < 4; it++) {
        m = measure(name, x, y, s);
        s *= Math.min(availW / m.w, availH / m.h);
        m = measure(name, x, y, s);
        x += (wantX - m.cx) * perPx;
        y -= (innerHeight / 2 - m.cy) * perPx;
      }
      m = measure(name, x, y, s);
      if (m.w > availW + 0.5 || m.h > availH + 0.5) s *= Math.min(availW / m.w, availH / m.h) * 0.99;
      fitCache.set(key, s);
    }
    // Position: centre the measured box in the slot (sticky to the middle of the screen).
    const place = () => {
      for (let it = 0; it < 3; it++) {
        m = measure(name, x, y, s);
        const wantY = Math.max(rect.top + pad + m.h / 2, Math.min(rect.bottom - pad - m.h / 2, innerHeight / 2));
        x += (wantX - m.cx) * perPx;
        y -= (wantY - m.cy) * perPx;
      }
      m = measure(name, x, y, s);
    };
    place();
    // Off-centre, perspective enlarges the shape slightly; shrink for this frame if it pokes out.
    for (let it = 0; it < 3; it++) {
      const over = Math.max(
        m.w / availW, m.h / availH,
        (rect.top + pad - m.t) > 0.5 || (m.b - (rect.bottom - pad)) > 0.5 || (rect.left + pad - m.l) > 0.5 || (m.r - (rect.right - pad)) > 0.5 ? 1.0001 : 0
      );
      if (over <= 1) break;
      const k = Math.min(
        availW / m.w, availH / m.h,
        (rect.bottom - pad - (rect.top + pad)) / Math.max(1, m.b - m.t + Math.max(0, rect.top + pad - m.t) + Math.max(0, m.b - (rect.bottom - pad)))
      );
      s *= Math.min(0.995, k);
      place();
    }
    return { x, y, s };
  }
  const fitCache = new Map();

  let targetName = null, target = null;
  function setTarget(name) {
    if (name === targetName) return;
    targetName = name;
    target = shape(name);
    geo.attributes.aRow.array.set(target.row); geo.attributes.aRow.needsUpdate = true;
    geo.attributes.aFlow.array.set(target.flow); geo.attributes.aFlow.needsUpdate = true;
    geo.attributes.aNode.array.set(target.node); geo.attributes.aNode.needsUpdate = true;
    geo.attributes.aHot.array.set(target.hot); geo.attributes.aHot.needsUpdate = true;
  }
  // Squeeze the current cloud into the new shape's box (done while invisible), so every
  // in-between frame of the morph is a blend of two shapes that both fit the slot.
  function remapInto(nb, spin) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, rc = 0;
    for (let i = 0; i < N; i++) {
      const j = i * 3, x = cur[j], y = cur[j + 1], z = cur[j + 2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z); rc = Math.max(rc, Math.hypot(x, z));
    }
    const map = (v, a0, a1, b0, b1) => (a1 - a0 < 1e-6 ? (b0 + b1) / 2 : b0 + ((v - a0) / (a1 - a0)) * (b1 - b0));
    const k = spin && rc > 1e-6 ? nb.radius / rc : 1;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      if (spin) { cur[j] *= k; cur[j + 2] *= k; }
      else { cur[j] = map(cur[j], x0, x1, nb.minX, nb.maxX); cur[j + 2] = map(cur[j + 2], z0, z1, nb.minZ, nb.maxZ); }
      cur[j + 1] = map(cur[j + 1], y0, y1, nb.minY, nb.maxY);
      off[j] = off[j + 1] = off[j + 2] = 0;
    }
  }

  function activeSection() {
    const mid = innerHeight * 0.5;
    for (const el of sections) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) return el;
    }
    return null;
  }

  /* ---------- Pointer ---------- */
  const ndc = new THREE.Vector2(0, 0), parallax = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let pointerActive = 0;
  addEventListener("pointermove", (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (e.pointerType === "mouse") pointerActive = performance.now();
  }, { passive: true });

  addEventListener("agentstep", (e) => {
    uniforms.uActiveNode.value = e.detail.node;
    uniforms.uNodePulse.value = 1;
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  /* ---------- State ---------- */
  let shown = null;          // section whose slot the figure currently occupies
  let pending = null;        // section we are moving to (after fading out)
  const st = { dim: 0, rotY: 0 };
  const weights = { uWave: 0, uScan: 0, uFlow: 0, uHot: 0, uTwinkle: 0 };
  const clock = new THREE.Clock();
  const local = new THREE.Vector3();
  let last = 0;

  let frameMs = 0;
  function frame() {
    const f0 = performance.now();
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - last || 0.016);
    last = t;
    const k60 = dt * 60;

    // 1. Which section is in charge, and should we move there?
    const act = activeSection();
    if (act && act !== shown && act !== pending) pending = act;
    if (pending) {
      if (!shown || st.dim < 0.04 || reducedMotion) {
        shown = pending; pending = null;
        if (slotOf(shown)) {
          setTarget(shown.dataset.shape);
          remapInto(target.bounds, !!SPIN[targetName]);
          // The figure is invisible at this moment: face the camera now rather than turning in view.
          if (!SPIN[targetName]) st.rotY = Math.round(st.rotY / TAU) * TAU;
        }
      }
    }
    if (!target) setTarget("sphere");

    // 2. Place the figure in its slot (rigidly, so it scrolls with the page).
    const rect = slotOf(shown);
    let goalDim = 0;
    if (rect && shown.dataset.shape === targetName) {
      const f = fit(rect, targetName);
      group.position.set(f.x, f.y, 0);
      group.scale.setScalar(f.s);
      uniforms.uScale.value = f.s;
      goalDim = 1;
    }
    if (pending) st.dim *= Math.pow(0.72, k60);                       // quick fade out before moving
    else st.dim += (goalDim - st.dim) * (reducedMotion ? 1 : Math.min(1, 0.07 * k60));
    uniforms.uDim.value = st.dim;
    points.visible = st.dim > 0.005;

    // 3. Morph toward the target sculpture, each particle at its own pace.
    const tp = target.pos;
    if (reducedMotion) cur.set(tp);
    else for (let i = 0; i < N; i++) {
      const s = Math.min(1, speed[i] * k60), j = i * 3;
      cur[j] += (tp[j] - cur[j]) * s;
      cur[j + 1] += (tp[j + 1] - cur[j + 1]) * s;
      cur[j + 2] += (tp[j + 2] - cur[j + 2]) * s;
    }

    // 4. Cursor disturbance (mouse only), limited so particles stay in their column.
    const repel = !reducedMotion && st.dim > 0.3 && performance.now() - pointerActive < 1800;
    if (repel) {
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) { local.copy(hit); group.worldToLocal(local); }
    }
    const decay = Math.pow(0.9, k60), R = 0.9, R2 = R * R, MAXO = 0.35;
    const cb = target.bounds, spinNow = !!SPIN[targetName];
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      let ox = off[j] * decay, oy = off[j + 1] * decay, oz = off[j + 2] * decay;
      if (repel) {
        const dx = cur[j] + ox - local.x, dy = cur[j + 1] + oy - local.y, dz = cur[j + 2] + oz - local.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2 && d2 > 1e-6) {
          const d = Math.sqrt(d2), f = ((R - d) / R) * 0.12 * k60;
          ox += (dx / d) * f; oy += (dy / d) * f; oz += (dz / d) * f;
          const m = Math.hypot(ox, oy, oz);
          if (m > MAXO) { ox *= MAXO / m; oy *= MAXO / m; oz *= MAXO / m; }
        }
      }
      off[j] = ox; off[j + 1] = oy; off[j + 2] = oz;
      let rx = cur[j] + ox, ry = cur[j + 1] + oy, rz = cur[j + 2] + oz;
      if (repel || ox || oy || oz) {
        ry = Math.min(cb.maxY, Math.max(cb.minY, ry));
        if (spinNow) {
          const rr = Math.hypot(rx, rz);
          if (rr > cb.radius) { rx *= cb.radius / rr; rz *= cb.radius / rr; }
        } else {
          rx = Math.min(cb.maxX, Math.max(cb.minX, rx));
          rz = Math.min(cb.maxZ, Math.max(cb.minZ, rz));
        }
      }
      render[j] = rx; render[j + 1] = ry; render[j + 2] = rz;
    }
    geo.attributes.position.needsUpdate = true;

    // 5. Shape-specific effects and rotation.
    for (const u of ["uWave", "uScan", "uFlow", "uTwinkle"]) {
      const want = UNIFORM_FOR[targetName] === u ? 1 : 0;
      weights[u] += (want - weights[u]) * Math.min(1, 0.08 * k60);
      uniforms[u].value = weights[u];
    }
    weights.uHot += ((HOT[targetName] || 0) - weights.uHot) * Math.min(1, 0.08 * k60);
    uniforms.uHot.value = weights.uHot;
    uniforms.uNodePulse.value *= Math.pow(0.985, k60);

    const spin = SPIN[targetName];
    if (spin && !reducedMotion) st.rotY += spin * dt;
    else st.rotY += (Math.round(st.rotY / TAU) * TAU - st.rotY) * Math.min(1, 0.06 * k60);
    parallax.x += (ndc.x - parallax.x) * 0.04 * k60;
    parallax.y += (ndc.y - parallax.y) * 0.04 * k60;
    const tilt = coarse || reducedMotion ? 0 : (TILT[targetName] ?? 0.12);
    group.rotation.y = st.rotY + parallax.x * tilt;
    group.rotation.x = -parallax.y * tilt * 0.6;

    uniforms.uTime.value = reducedMotion ? 4 : t;
    renderer.render(scene, camera);
    frameMs = frameMs * 0.9 + (performance.now() - f0) * 0.1;
  }

  // Build the closing text once the font is ready, so it is set in Times New Roman.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('italic 300px "Times New Roman"').catch(() => null).then(() => document.fonts.ready).then(() => {
      if (targetName !== "text") delete cache.text;
    });
  }

  // Test hook (only with ?debug): the on-screen box covered by the visible particles.
  if (DEBUG) {
    window.__figure = () => {
      group.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      let l = Infinity, r = -Infinity, tp = Infinity, b = -Infinity;
      for (let i = 0; i < N; i += 2) {
        v.set(render[i * 3], render[i * 3 + 1], render[i * 3 + 2]).applyMatrix4(group.matrixWorld).project(camera);
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
        l = Math.min(l, x); r = Math.max(r, x); tp = Math.min(tp, y); b = Math.max(b, y);
      }
      return { shape: targetName, dim: st.dim, section: shown && shown.id, frameMs, box: { left: l, top: tp, right: r, bottom: b } };
    };
  }

  renderer.setAnimationLoop(frame);
  document.addEventListener("visibilitychange", () => renderer.setAnimationLoop(document.hidden ? null : frame));
}
