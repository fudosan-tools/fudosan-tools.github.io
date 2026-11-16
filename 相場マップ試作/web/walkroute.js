// 徒歩の道路距離（2026-11-17）
// 国土地理院のベクトルタイル（地理院地図Vector・optimal_bvmap-v1）の道路中心線（RdCL）で道路網を作り、
// 地点から駅までの最短経路の道路距離を出す。駅の終点は、鉄道中心線（RailCL）の「駅部分」＝ホームの線。
//   起点：地点にいちばん近い道路の線の上の点（地点からその点までの直線距離を足す）
//   終点：ホームの線にいちばん近い道路の点と、それより40m以内に遠い点（ホームまでの直線距離を足す）。地下駅のホームも駅部分に含まれる
//   除外：高速自動車国道等・有料道路・自動車専用道路
// タイルは z15（約1.2km四方。道路は z16 と同じ細かさで入っている）。タイルの外側の余白部分は切り捨て、境目でつなぐ。
window.WALK = (() => {
  const Z = 15, URL = (x, y) => `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/${Z}/${x}/${y}.pbf`;
  const MAX_KM = 2.5;          // これより遠い駅は道路距離を出さない（読み込むタイルが多くなるため）
  const GOAL_SLACK = 40, GOAL_MAX = 200, SNAP_MAX = 150, STEP = 5, PLAT_MAX = 150, PLAT_SLACK = 60;

  // ---- ベクトルタイル（MVT）の読み取り：道路と駅部分の線だけ
  function decode(u8) {
    let p = 0;
    const varint = () => { let r = 0, s = 0, b; do { b = u8[p++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
    const msg = (end, cb) => { while (p < end) { const k = varint(), f = k >> 3, t = k & 7;
      if (t === 2) { const l = varint(), e = p + l; cb(f, e); p = e; } else if (t === 0) cb(f, varint()); else if (t === 5) p += 4; else if (t === 1) p += 8; else return; } };
    const td = new TextDecoder(), str = e => td.decode(u8.subarray(p, e));
    const out = {};
    msg(u8.length, (f, e) => { if (f !== 3) return;
      const L = { keys: [], values: [], feats: [], extent: 4096 };
      msg(e, (f2, e2) => {
        if (f2 === 1) L.name = str(e2); else if (f2 === 3) L.keys.push(str(e2)); else if (f2 === 5) L.extent = e2;
        else if (f2 === 4) { let v = null; msg(e2, (f3, e3) => { if (f3 === 1) v = str(e3); else if (f3 === 4 || f3 === 5) v = e3; else if (f3 === 6) v = e3 % 2 ? -(e3 + 1) / 2 : e3 / 2; else if (f3 === 7) v = !!e3; }); L.values.push(v); }
        else if (f2 === 2 && (L.name === "RdCL" || L.name === "RailCL")) { const F = { tags: [], geom: [] };
          msg(e2, (f3, e3) => { if (f3 === 2) while (p < e3) F.tags.push(varint()); else if (f3 === 4) while (p < e3) F.geom.push(varint()); });
          L.feats.push(F); }
      });
      if (L.name === "RdCL" || L.name === "RailCL") out[L.name] = L;
    });
    for (const L of Object.values(out)) for (const F of L.feats) {
      F.props = {}; for (let i = 0; i < F.tags.length; i += 2) F.props[L.keys[F.tags[i]]] = L.values[F.tags[i + 1]];
      const lines = []; let x = 0, y = 0, cur = null, i = 0; const g = F.geom;
      while (i < g.length) { const c = g[i++], id = c & 7, cnt = c >> 3; if (id === 7) continue;
        for (let j = 0; j < cnt; j++) { const dx = g[i++], dy = g[i++]; x += (dx >> 1) ^ -(dx & 1); y += (dy >> 1) ^ -(dy & 1);
          if (id === 1) { cur = [[x, y]]; lines.push(cur); } else cur.push([x, y]); } }
      F.lines = lines;
    }
    return out;
  }
  // 線をタイルの内側 [0, ext] に切る（余白の部分は隣のタイルが持つので、境目の点でつながる）
  function clip(line, ext) {
    const res = []; let cur = null; const inside = ([x, y]) => x >= 0 && x <= ext && y >= 0 && y <= ext;
    for (let i = 1; i < line.length; i++) {
      let a = line[i - 1], b = line[i], t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
      let ok = true;
      for (const [pp, q] of [[-dx, a[0]], [dx, ext - a[0]], [-dy, a[1]], [dy, ext - a[1]]]) {
        if (pp === 0) { if (q < 0) { ok = false; break; } continue; }
        const r = q / pp; if (pp < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
      if (!ok) { cur = null; continue; }
      const A = [a[0] + t0 * dx, a[1] + t0 * dy], B = [a[0] + t1 * dx, a[1] + t1 * dy];
      if (!cur || t0 > 0) { cur = [A]; res.push(cur); }
      cur.push(B); if (t1 < 1) cur = null;
    }
    return res;
  }
  const TILES = new Map();
  function loadTile(x, y) {
    const k = x + "/" + y;
    if (!TILES.has(k)) TILES.set(k, fetch(URL(x, y)).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
      if (!buf) return { roads: [], plats: [] };
      const T = decode(new Uint8Array(buf)), roads = [], plats = [];
      const g = (L, [px, py]) => [x * L.extent + px, y * L.extent + py];   // タイルをまたいだ通しの座標（z15 の 4096 分割）
      const R = T.RdCL; if (R) for (const F of R.feats) { const p = F.props;
        if (p.vt_rdctg === "高速自動車国道等" || p.vt_tollsect === "有料" || p.vt_motorway === 1) continue;
        for (const ln of F.lines) for (const c of clip(ln, R.extent)) if (c.length > 1) roads.push(c.map(q => g(R, q))); }
      const RL = T.RailCL; if (RL) for (const F of RL.feats) if (F.props.vt_sngldbl === "駅部分") for (const ln of F.lines) plats.push(ln.map(q => g(RL, q)));
      return { roads, plats };
    }).catch(() => { TILES.delete(k); return null; }));
    return TILES.get(k);
  }

  // ---- 座標：通しの座標（タイル z15 × 4096）⇔ 緯度経度
  const N = 2 ** Z * 4096;
  const toG = (lat, lng) => [(lng + 180) / 360 * N, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N];
  const toLL = ([gx, gy]) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / N))) * 180 / Math.PI, gx / N * 360 - 180];

  // 線分 AB の上で点 P にいちばん近い点（t と距離）
  function proj(P, A, B) { const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    let t = L2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = A[0] + t * dx, qy = A[1] + t * dy; return { t, q: [qx, qy], d: Math.hypot(P[0] - qx, P[1] - qy) }; }

  // 地点（lat, lng）から、駅の一覧 [{ key, lat, lng }] までの道路距離。返り値は key → { m, path, offStart, offEnd } か null
  async function route(lat, lng, stations) {
    const mpp = Math.cos(lat * Math.PI / 180) * 40075016.686 / N;     // 通しの座標 1 あたりのメートル
    const P = toG(lat, lng), list = stations.map(s => ({ ...s, G: toG(s.lat, s.lng) })).filter(s => Math.hypot(s.G[0] - P[0], s.G[1] - P[1]) * mpp <= MAX_KM * 1000);
    if (!list.length) return {};
    const pad = 400 / mpp, xs = [P[0], ...list.map(s => s.G[0])], ys = [P[1], ...list.map(s => s.G[1])];
    const tx0 = Math.floor((Math.min(...xs) - pad) / 4096), tx1 = Math.floor((Math.max(...xs) + pad) / 4096);
    const ty0 = Math.floor((Math.min(...ys) - pad) / 4096), ty1 = Math.floor((Math.max(...ys) + pad) / 4096);
    const jobs = []; for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) jobs.push(loadTile(x, y));
    const tiles = await Promise.all(jobs);
    if (tiles.some(t => !t)) throw new Error("道路データを読み込めませんでした");
    // 道路網：同じ座標（0.1 単位＝約3cm）の点を同じ点とみなす
    const id = new Map(), pts = [], adj = [], segs = [];
    const node = q => { const k = Math.round(q[0] * 10) + "," + Math.round(q[1] * 10); let i = id.get(k); if (i == null) { i = pts.length; id.set(k, i); pts.push(q); adj.push([]); } return i; };
    const plats = [];
    for (const T of tiles) { T.plats.forEach(l => plats.push(l));
      for (const ln of T.roads) { let prev = node(ln[0]); for (let j = 1; j < ln.length; j++) { const cur = node(ln[j]); if (cur !== prev) { const w = Math.hypot(pts[cur][0] - pts[prev][0], pts[cur][1] - pts[prev][1]) * mpp; adj[prev].push(cur, w); adj[cur].push(prev, w); segs.push(prev, cur); } prev = cur; } } }
    // 起点：いちばん近い道路の線
    let s0 = null; for (let j = 0; j < segs.length; j += 2) { const r = proj(P, pts[segs[j]], pts[segs[j + 1]]); if (!s0 || r.d < s0.d) s0 = { ...r, a: segs[j], b: segs[j + 1] }; }
    if (!s0 || s0.d * mpp > SNAP_MAX) return {};
    // ダイクストラ（道路距離の上限：いちばん遠い駅の直線距離の3倍）
    const lim = Math.max(...list.map(s => Math.hypot(s.G[0] - P[0], s.G[1] - P[1]) * mpp)) * 3 + 500;
    const D = new Float64Array(pts.length).fill(Infinity), prv = new Int32Array(pts.length).fill(-1), heap = [];
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
    const d0 = s0.d * mpp, A0 = pts[s0.a], B0 = pts[s0.b];
    const da = d0 + Math.hypot(A0[0] - s0.q[0], A0[1] - s0.q[1]) * mpp, db = d0 + Math.hypot(B0[0] - s0.q[0], B0[1] - s0.q[1]) * mpp;
    D[s0.a] = da; push(da, s0.a); if (db < D[s0.b]) { D[s0.b] = db; push(db, s0.b); }
    while (heap.length) { const [d, u] = pop(); if (d > D[u] || d > lim) continue; const e = adj[u];
      for (let j = 0; j < e.length; j += 2) { const v = e[j], nd = d + e[j + 1]; if (nd < D[v]) { D[v] = nd; prv[v] = u; push(nd, v); } } }
    const back = (u, tail) => { const p = []; for (; u >= 0; u = prv[u]) p.push(pts[u]); p.reverse(); return [P, s0.q, ...p, ...tail].map(toLL); };   // 地点 → 道路 → … → ホームに近い道路の点
    // 駅ごとの終点
    const res = {};
    for (const s of list) {
      // その駅のホーム：駅の地点（各路線のホームの中点の平均）から150m以内の駅部分のうち、いちばん近いものより60m以内のもの。
      // 駅が密集する場所（梅田・八王子など）で、隣の駅のホームを拾わないようにする。150m以内に無ければ駅の地点を終点にする
      const pd = []; for (const l of plats) for (let j = 1; j < l.length; j++) { const d = proj(s.G, l[j - 1], l[j]).d * mpp; if (d <= PLAT_MAX) pd.push([d, l[j - 1], l[j]]); }
      const dn = pd.length ? Math.min(...pd.map(x => x[0])) : 0, ps = pd.filter(x => x[0] <= dn + PLAT_SLACK).map(x => [x[1], x[2]]);
      const dEnd = q => ps.length ? Math.min(...ps.map(([A, B]) => proj(q, A, B).d)) * mpp : Math.hypot(q[0] - s.G[0], q[1] - s.G[1]) * mpp;
      const cand = []; let dmin = Infinity;
      for (let j = 0; j < segs.length; j += 2) { const a = segs[j], b = segs[j + 1], A = pts[a], B = pts[b];
        if (proj(s.G, A, B).d * mpp > 600) continue;
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]) * mpp, n = Math.max(1, Math.ceil(len / STEP));
        for (let k = 0; k <= n; k++) { const t = k / n, q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], d = dEnd(q);
          if (d <= GOAL_MAX) { cand.push({ a, b, t, q, d, len }); if (d < dmin) dmin = d; } } }
      let best = null;
      for (const c of cand) { if (c.d > dmin + GOAL_SLACK) continue;
        const ga = D[c.a] + c.len * c.t, gb = D[c.b] + c.len * (1 - c.t), g = Math.min(ga, gb), tot = g + c.d;
        if (isFinite(g) && (!best || tot < best.m)) best = { m: tot, end: ga <= gb ? c.a : c.b, q: c.q, offEnd: c.d }; }
      if (best) res[s.key] = { m: best.m, offStart: d0, offEnd: best.offEnd, path: back(best.end, [best.q]), plat: ps.length > 0 };
    }
    return res;
  }
  return { route, MAX_KM };
})();
