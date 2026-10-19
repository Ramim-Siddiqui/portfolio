// The living figure: one cloud of particles that re-forms into a different sculpture
// for every section of the page (sphere, waveform, agent graph, syntax tree,
// spreadsheet, galaxy, laboratory, database, helix, knot, dust and finally text).

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

const canvas = document.getElementById("figure");
const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const N = innerWidth < 760 || coarse ? 4600 : 9000;
const TAU = Math.PI * 2;

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
    this.row = new Float32Array(N);       // spreadsheet row (0 = top, 1 = bottom)
    this.flow = new Float32Array(N);      // position along an agent-graph edge
    this.node = new Float32Array(N).fill(-1); // agent-graph node id, -1 = edge/dust
    this.hot = new Float32Array(N);       // highlighted points (vulnerable path, milestones)
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
  // Rotate every point (applied once, after building).
  rotate(ax, ay) {
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      let x = this.pos[k], y = this.pos[k + 1], z = this.pos[k + 2];
      const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
      const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
      this.pos[k] = x2; this.pos[k + 1] = y1; this.pos[k + 2] = z2;
    }
    return this;
  }
  // Order points left to right so that morphing between shapes sweeps instead of exploding.
  finish() {
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
    return this;
  }
}

/* ------------------------------------------------------------------ */
/* Sculptures                                                          */
/* ------------------------------------------------------------------ */
const builders = {
  // A neural sphere: a lattice of nodes joined by arcs, over a soft shell.
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
    const nEdge = N * 0.5, nNode = N * 0.16;
    for (let k = 0; k < nEdge; k++) {
      const [i, j] = edges[k % edges.length], t = s.r(), a = nodes[i], b = nodes[j];
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const len = Math.hypot(x, y, z), lift = R * (1 + 0.07 * Math.sin(Math.PI * t));
      s.push((x / len) * lift, (y / len) * lift, (z / len) * lift);
    }
    for (let k = 0; k < nNode; k++) {
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
    while (s.i < N * 0.94) {
      const layer = Math.floor(s.r() * L), z = (layer / (L - 1) - 0.5) * 2.6, x = (s.r() - 0.5) * 7.4;
      const env = Math.exp((-x * x) / 6.5);
      const y = env * (0.85 * Math.sin(1.6 * x + z * 1.1) + 0.32 * Math.sin(4.3 * x - z * 2.0)) * 0.95 + s.gauss() * 0.012;
      s.push(x, y, z);
    }
    while (!s.full) s.push((s.r() - 0.5) * 7.6, s.gauss() * 1.1, (s.r() - 0.5) * 3);
    return s.rotate(0.32, -0.25).finish();
  },

  // The agent's LangGraph: six node clusters joined by curved edges.
  flow() {
    const s = new Shape(31);
    const P = [[-3.0, 0.2, 0], [-1.55, 0.2, 0.25], [0, 0.2, 0], [1.55, 0.2, -0.25], [0.78, 1.75, 0.1], [2.85, -1.35, 0]];
    const RAD = [0.34, 0.34, 0.4, 0.4, 0.3, 0.3];
    const W = [1, 1, 1.25, 1.25, 0.8, 0.8], wsum = W.reduce((a, b) => a + b, 0);
    const E = [[0, 1, 0.4], [1, 2, 0.4], [2, 3, 0.4], [3, 4, 0.55], [4, 2, 0.55], [3, 5, -0.45]];
    const nNode = N * 0.5, nEdge = N * 0.44;
    for (let n = 0; n < 6; n++) {
      const count = Math.round((nNode * W[n]) / wsum);
      for (let k = 0; k < count; k++) {
        const th = TAU * s.r(), ph = Math.acos(2 * s.r() - 1), rad = RAD[n] * (0.82 + 0.18 * s.r());
        s.push(P[n][0] + rad * Math.sin(ph) * Math.cos(th), P[n][1] + rad * Math.cos(ph), P[n][2] + rad * Math.sin(ph) * Math.sin(th), { node: n });
      }
    }
    for (let k = 0; k < nEdge; k++) {
      const [a, b, lift] = E[k % E.length], t = s.r();
      const A = P[a], B = P[b];
      const C = [(A[0] + B[0]) / 2 - (B[1] - A[1]) * 0.18, (A[1] + B[1]) / 2 + lift, (A[2] + B[2]) / 2 + 0.3];
      const u = 1 - t;
      s.push(
        u * u * A[0] + 2 * u * t * C[0] + t * t * B[0] + s.gauss() * 0.012,
        u * u * A[1] + 2 * u * t * C[1] + t * t * B[1] + s.gauss() * 0.012,
        u * u * A[2] + 2 * u * t * C[2] + t * t * B[2] + s.gauss() * 0.012,
        { flow: t, node: -1 }
      );
    }
    while (!s.full) s.push((s.r() - 0.5) * 8, (s.r() - 0.5) * 5, (s.r() - 0.5) * 3, { node: -2 });
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
    // The vulnerable path: root to the deepest leaf in the right half.
    let deepest = 0;
    nodes.forEach((nd, i) => { if (nd.depth >= nodes[deepest].depth && nd.X > 0.4) deepest = i; });
    const hotSet = new Set();
    for (let i = deepest; i >= 0; i = nodes[i].parent) hotSet.add(i);
    const nBlob = N * 0.36, nEdge = N * 0.6;
    for (let k = 0; k < nBlob; k++) {
      const id = k % nodes.length, nd = nodes[id];
      s.push(nd.X + s.gauss() * 0.06, nd.Y + s.gauss() * 0.06, nd.z + s.gauss() * 0.06, { hot: hotSet.has(id) ? 1 : 0 });
    }
    const links = nodes.map((nd, i) => [nd.parent, i]).filter(([p]) => p >= 0);
    for (let k = 0; k < nEdge; k++) {
      const [p, c] = links[k % links.length], t = s.r(), A = nodes[p], B = nodes[c];
      s.push(A.X + (B.X - A.X) * t, A.Y + (B.Y - A.Y) * t, A.z + (B.z - A.z) * t, { hot: hotSet.has(p) && hotSet.has(c) ? 1 : 0 });
    }
    while (!s.full) s.push((s.r() - 0.5) * 8, (s.r() - 0.5) * 6, (s.r() - 0.5) * 3);
    return s.finish();
  },

  // A spreadsheet in perspective; the shader runs a scan line down its rows.
  grid() {
    const s = new Shape(51), rows = 13, cols = 7, cw = 0.84, ch = 0.4, W = cols * cw, H = rows * ch;
    const x0 = -W / 2, y0 = H / 2;
    const hLen = (rows + 1) * W, vLen = (cols + 1) * H;
    const nBorder = N * 0.46, nText = N * 0.5;
    for (let k = 0; k < nBorder; k++) {
      if (s.r() < hLen / (hLen + vLen)) {
        const r = Math.floor(s.r() * (rows + 1)), y = y0 - r * ch;
        s.push(x0 + s.r() * W, y, 0, { row: Math.min(1, r / rows) });
      } else {
        const c = Math.floor(s.r() * (cols + 1)), y = y0 - s.r() * H;
        s.push(x0 + c * cw, y, 0, { row: (y0 - y) / H });
      }
    }
    // "Typed values": short strokes inside the cells, denser in the header row.
    const lens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lens.push(0.25 + s.r() * 0.45);
    for (let k = 0; k < nText; k++) {
      const r = s.r() < 0.14 ? 0 : 1 + Math.floor(s.r() * (rows - 1)), c = Math.floor(s.r() * cols);
      const len = lens[r * cols + c] * cw;
      s.push(x0 + c * cw + 0.1 + s.r() * len, y0 - (r + 0.5) * ch + s.gauss() * 0.02, s.gauss() * 0.01, { row: (r + 0.5) / rows, hot: r === 0 ? 1 : 0 });
    }
    while (!s.full) s.push((s.r() - 0.5) * 8, (s.r() - 0.5) * 6, (s.r() - 0.5) * 2, { row: -1 });
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

  // A double helix rising through time; four bright appointments.
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
    while (!s.full) s.push(s.gauss() * 0.03, -2.8 + s.r() * 5.6, s.gauss() * 0.03);
    return s.finish();
  },

  // A (2,3) torus knot: methods tied together.
  knot() {
    const s = new Shape(101), R = 1.6, rr = 0.66;
    while (!s.full) {
      const u = TAU * s.r(), q = 3, p = 2;
      const x = (R + rr * Math.cos(q * u)) * Math.cos(p * u);
      const y = (R + rr * Math.cos(q * u)) * Math.sin(p * u);
      const z = rr * Math.sin(q * u);
      s.push(x + s.gauss() * 0.13, y + s.gauss() * 0.13, z + s.gauss() * 0.13, { hot: s.r() < 0.04 ? 1 : 0 });
    }
    return s.finish();
  },

  // A wide, quiet cloud so the portrait and biography stay readable.
  dust() {
    const s = new Shape(111);
    while (!s.full) s.push((s.r() - 0.5) * 13, (s.r() - 0.5) * 7.5, (s.r() - 0.5) * 5);
    return s.finish();
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
    const scale = 7.8 / cw;
    if (!pts.length) return builders.sphere();
    while (!s.full) {
      const [x, y] = pts[Math.floor(s.r() * pts.length)];
      s.push((x - cw / 2 + s.r() * 3) * scale, -(y - chh / 2 + s.r() * 3) * scale + 0.95, s.gauss() * 0.05, { hot: s.r() < 0.05 ? 1 : 0 });
    }
    return s.finish();
  },
};
const SPIN = { sphere: 0.07, galaxy: 0.05, cluster: 0.09, cylinder: 0.12, helix: 0.16, knot: 0.1, dust: 0.015 };
const UNIFORM_FOR = { wave: "uWave", grid: "uScan", flow: "uFlow", galaxy: "uTwinkle" };
// How strongly each sculpture lights its highlighted points (vulnerable path, milestones, header row...).
const HOT = { tree: 1, helix: 1, grid: 0.55, sphere: 0.6, cluster: 0.55, galaxy: 0.7, cylinder: 0.6, knot: 0.6, text: 0.5 };

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

  // Geometry: rendered positions plus per-point attributes.
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
    // Intro: start scattered far away and assemble.
    const th = TAU * r0(), ph = Math.acos(2 * r0() - 1), rad = 9 + r0() * 6;
    cur[i * 3] = rad * Math.sin(ph) * Math.cos(th);
    cur[i * 3 + 1] = rad * Math.cos(ph);
    cur[i * 3 + 2] = rad * Math.sin(ph) * Math.sin(th) - 4;
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
    uDim: { value: 1 },
    uWave: { value: 0 }, uScan: { value: 0 }, uFlow: { value: 0 }, uHot: { value: 0 }, uTwinkle: { value: 0 },
    uActiveNode: { value: -10 }, uNodePulse: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uSize, uPixelRatio, uAlpha, uDim;
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
        float size = uSize * (0.55 + aRand * 0.9) * (1.0 + glow * 1.4) * max(twinkle, 0.2);
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

  /* ---------- Editions ---------- */
  function applyEdition() {
    const dark = root.dataset.theme === "dark";
    uniforms.uInk.value.set(dark ? "#efe7d6" : "#1b1a24");
    uniforms.uAccent.value.set(dark ? "#ff6b4f" : "#b8321e");
    uniforms.uAlpha.value = dark ? 0.62 : 0.78;
    uniforms.uSize.value = dark ? 28 : 30;
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }
  applyEdition();
  addEventListener("editionchange", applyEdition);

  /* ---------- Sections drive the figure ---------- */
  const sections = [...document.querySelectorAll("[data-shape]")];
  let active = null, targetName = null, target = null;
  const state = { x: 0, y: 0, scale: 1, dim: 1, rotY: 0 };
  const goal = { x: 0, y: 0, scale: 1, dim: 1 };
  const weights = { uWave: 0, uScan: 0, uFlow: 0, uHot: 0, uTwinkle: 0 };

  function visibleSize() {
    const h = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { w: h * camera.aspect, h };
  }
  function setTarget(name) {
    if (name === targetName) return;
    targetName = name;
    target = shape(name);
    geo.attributes.aRow.array.set(target.row); geo.attributes.aRow.needsUpdate = true;
    geo.attributes.aFlow.array.set(target.flow); geo.attributes.aFlow.needsUpdate = true;
    geo.attributes.aNode.array.set(target.node); geo.attributes.aNode.needsUpdate = true;
    geo.attributes.aHot.array.set(target.hot); geo.attributes.aHot.needsUpdate = true;
  }
  function layoutFor(el) {
    const { w } = visibleSize();
    const wide = innerWidth >= 900;
    const side = wide ? el.dataset.side || "center" : "center";
    const shift = el.classList.contains("hero") ? 0.27 : side === "left" ? 0.225 : 0.25;
    goal.x = side === "right" ? w * shift : side === "left" ? -w * shift : 0;
    goal.y = 0;
    goal.scale = side === "center" ? Math.min(1.08, (w * 0.9) / 8) : Math.min(1.0, (w * 0.41) / 6.8);
    if (!wide) goal.scale = Math.min(1, (w * 0.98) / 7.6);
    goal.dim = parseFloat(el.dataset.dim || "1");
  }
  function pickSection() {
    const mid = innerHeight * 0.5;
    let found = null;
    for (const el of sections) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { found = el; break; }
    }
    if (!found) return;
    if (found !== active) { active = found; setTarget(found.dataset.shape); }
    layoutFor(found);
  }

  /* ---------- Pointer ---------- */
  const ndc = new THREE.Vector2(0, 0), parallax = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let pointerActive = 0;
  addEventListener("pointermove", (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (e.pointerType === "mouse") pointerActive = performance.now();
  }, { passive: true });

  /* ---------- Agent console pulses ---------- */
  addEventListener("agentstep", (e) => {
    uniforms.uActiveNode.value = e.detail.node;
    uniforms.uNodePulse.value = 1;
  });

  /* ---------- Resize ---------- */
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (active) layoutFor(active);
  }
  addEventListener("resize", resize);
  resize();

  /* ---------- Loop ---------- */
  const clock = new THREE.Clock();
  const local = new THREE.Vector3();
  let last = 0;
  function frame() {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, t - last || 0.016);
    last = t;
    const k60 = dt * 60;
    pickSection();
    if (!target) setTarget("sphere");

    // Morph toward the target sculpture, each particle at its own pace.
    const tp = target.pos;
    if (reducedMotion) cur.set(tp);
    else for (let i = 0; i < N; i++) {
      const s = Math.min(1, speed[i] * k60), j = i * 3;
      cur[j] += (tp[j] - cur[j]) * s;
      cur[j + 1] += (tp[j + 1] - cur[j + 1]) * s;
      cur[j + 2] += (tp[j + 2] - cur[j + 2]) * s;
    }

    // Cursor disturbance (mouse only), in the group's local space.
    const repel = !reducedMotion && performance.now() - pointerActive < 1800;
    if (repel) {
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) { local.copy(hit); group.worldToLocal(local); }
    }
    const decay = Math.pow(0.9, k60), R = 0.95, R2 = R * R;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      let ox = off[j] * decay, oy = off[j + 1] * decay, oz = off[j + 2] * decay;
      if (repel) {
        const dx = cur[j] + ox - local.x, dy = cur[j + 1] + oy - local.y, dz = cur[j + 2] + oz - local.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2 && d2 > 1e-6) {
          const d = Math.sqrt(d2), f = ((R - d) / R) * 0.16 * k60;
          ox += (dx / d) * f; oy += (dy / d) * f; oz += (dz / d) * f;
        }
      }
      off[j] = ox; off[j + 1] = oy; off[j + 2] = oz;
      render[j] = cur[j] + ox; render[j + 1] = cur[j + 1] + oy; render[j + 2] = cur[j + 2] + oz;
    }
    geo.attributes.position.needsUpdate = true;

    // Ease layout, shape-specific effects and rotation.
    const e = reducedMotion ? 1 : Math.min(1, 0.06 * k60);
    state.x += (goal.x - state.x) * e;
    state.y += (goal.y - state.y) * e;
    state.scale += (goal.scale - state.scale) * e;
    state.dim += (goal.dim - state.dim) * e;
    group.position.set(state.x, state.y, 0);
    group.scale.setScalar(state.scale);
    uniforms.uDim.value = state.dim;
    for (const [shapeName, u] of Object.entries(UNIFORM_FOR)) {
      const want = targetName === shapeName ? 1 : 0;
      weights[u] += (want - weights[u]) * Math.min(1, 0.08 * k60);
      uniforms[u].value = weights[u];
    }
    weights.uHot += ((HOT[targetName] || 0) - weights.uHot) * Math.min(1, 0.08 * k60);
    uniforms.uHot.value = weights.uHot;
    uniforms.uNodePulse.value *= Math.pow(0.985, k60);

    const spin = SPIN[targetName];
    if (spin && !reducedMotion) state.rotY += spin * dt;
    else state.rotY += (Math.round(state.rotY / TAU) * TAU - state.rotY) * e;
    parallax.x += (ndc.x - parallax.x) * 0.04 * k60;
    parallax.y += (ndc.y - parallax.y) * 0.04 * k60;
    group.rotation.y = state.rotY + (coarse ? 0 : parallax.x * 0.22);
    group.rotation.x = coarse ? 0 : -parallax.y * 0.12;

    uniforms.uTime.value = reducedMotion ? 4 : t;
    renderer.render(scene, camera);
  }

  // Build the closing text after the font has loaded, so it is set in Times New Roman.
  const fontReady = document.fonts && document.fonts.load
    ? document.fonts.load('italic 300px "Times New Roman"').catch(() => null).then(() => document.fonts.ready)
    : Promise.resolve();
  fontReady.then(() => { delete cache.text; });

  renderer.setAnimationLoop(frame);
  document.addEventListener("visibilitychange", () => renderer.setAnimationLoop(document.hidden ? null : frame));
}
