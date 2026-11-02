/* 土地の形（いびつな形）の計算の部品。ブラウザでは window.Katachi、node では require('./katachi.js')。
   土地を「角の座標（m）」の並び（多角形）で表し、面積・辺の長さ・角度・国税庁の想定整形地とかげ地割合・
   建てられる長方形・同じ面積での分割などを計算する。数字はどれも「目安」。根拠は 共通/調べもの_土地の形.md。

   座標の向き（この部品の中）：x＝右（東）、y＝上（北・奥）。単位は m。角は「時計回り」にそろえる。
   測量図（地積測量図の座標求積表）は X＝北・Y＝東 なので、x＝Y、y＝X に入れかえて読む（fromSurvey）。

   土地のデータ（land）：
     { pts: [[x,y], ...],                       角の座標（時計回り。逆回りでも normalize で直す）
       roads: [{edge: 0, w: 4, one: false}],    道路に接する辺の番号（辺 i は pts[i]→pts[i+1]）、道路の幅、
                                                one=true は「反対側ががけ・川などで片側だけ下がる」2項道路
       front: 0,                                正面の道路の辺（省略すると、いちばん長く接する道路）
       tpl: {id:'daikei', p:{...}} }            形の型から作ったときの型と寸法（画面を元にもどす用・省略可）
*/
(function (root) {
"use strict";
var TSUBO = 3.30578, EPS = 1e-9;

// ---------------------------------------------------------------- 小さな道具
function num(v) { var x = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[,，\s]/g, "")); return isFinite(x) ? x : NaN; }
function r2(x) { return Math.round(x * 100) / 100; }
function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function cross(ox, oy, ax, ay, bx, by) { return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox); }
function rot(p, c, s) { return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]; }          // 角度 a で「左に回した軸」から見た座標
function unrot(q, c, s) { return [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; }

// ---------------------------------------------------------------- 面積・辺・角
function signedArea(pts) {
  var s = 0, n = pts.length;
  for (var i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
// 座標の公式（座標法・シューレースの公式）：面積＝｜Σ(x_i × y_{i+1} − x_{i+1} × y_i)｜÷ 2
function area(pts) { return Math.abs(signedArea(pts)); }
function perimeter(pts) { var s = 0; for (var i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]); return s; }

// 数字にして、同じ点の重なり（つづけて同じ点・最後が最初と同じ）を外す
function cleanPts(pts) {
  var out = [];
  (pts || []).forEach(function (p) {
    var x = num(p && (p[0] != null ? p[0] : p.x)), y = num(p && (p[1] != null ? p[1] : p.y));
    if (!isFinite(x) || !isFinite(y)) return;
    if (out.length && dist(out[out.length - 1], [x, y]) < 1e-6) return;
    out.push([x, y]);
  });
  while (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return out;
}

// 道路の指定をそろえる：配列 [{edge,w,one}] でも {辺番号: 幅} でもよい
function normRoads(roads, n) {
  var out = [], seen = {};
  if (roads && !Array.isArray(roads)) roads = Object.keys(roads).map(function (k) { return {edge: +k, w: roads[k]}; });
  (roads || []).forEach(function (r) {
    var e = Math.round(num(r.edge)); if (!(e >= 0 && e < n) || seen[e]) return; seen[e] = 1;
    var w = num(r.w); if (!(w > 0)) w = 4;
    var o = {edge: e, w: w, one: !!r.one};
    if (r.sb != null && isFinite(num(r.sb))) o.sb = Math.max(0, num(r.sb));   // 下がる距離を直接入れるとき
    if (r.g != null) o.g = String(r.g);                                       // 同じ道路（屈折路）の印
    out.push(o);
  });
  return out.sort(function (a, b) { return a.edge - b.edge; });
}

// 時計回りにそろえる（逆回りなら並びを反対にし、道路の辺の番号もつけかえる）
// 反対にした並び：新しい j 番目の点 ＝ もとの (n−j) mod n 番目。もとの辺 i は新しい辺 n−1−i になる
function normalize(land) {
  var pts = cleanPts(land.pts), n = pts.length;
  var roads = normRoads(land.roads, n), front = land.front != null && isFinite(num(land.front)) ? Math.round(num(land.front)) : null;
  var reversed = false;
  if (n >= 3 && signedArea(pts) > 0) {
    reversed = true;
    var np = []; for (var j = 0; j < n; j++) np.push(pts[(n - j) % n]);
    pts = np;
    roads = roads.map(function (r) { var o = Object.assign({}, r); o.edge = n - 1 - r.edge; return o; }).sort(function (a, b) { return a.edge - b.edge; });
    if (front != null) front = n - 1 - front;
  }
  var out = {pts: pts, roads: roads, reversed: reversed};
  if (front != null && front >= 0 && front < n) out.front = front;
  if (land.tpl) out.tpl = land.tpl;
  return out;
}
function isClockwise(pts) { return signedArea(pts) < 0; }

// 辺の一覧。u＝辺の向き（長さ1）、nv＝土地の内側を向く向き（時計回りなので辺の右側）
function edges(pts) {
  var n = pts.length, out = [];
  for (var i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n], L = dist(a, b), ux = L ? (b[0] - a[0]) / L : 0, uy = L ? (b[1] - a[1]) / L : 0;
    out.push({i: i, a: a, b: b, len: L, u: [ux, uy], nv: [uy, -ux], deg: Math.atan2(uy, ux) * 180 / Math.PI});
  }
  return out;
}
// 内角（度）。時計回りの並びが前提。右に曲がる角は180°より小さく、左に曲がる（へこんだ）角は180°より大きい
function angles(pts) {
  var n = pts.length, out = [];
  for (var i = 0; i < n; i++) {
    var p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    var d1x = c[0] - p[0], d1y = c[1] - p[1], d2x = q[0] - c[0], d2y = q[1] - c[1];
    var turn = Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y) * 180 / Math.PI;   // 左曲がりが＋
    out.push(180 + turn);
  }
  return out;
}

// 2本の線分が交わるか（strict=true：端どうしが触れるだけ・重なって並ぶだけは数えない）
function onSeg(px, py, a, b, eps) {
  eps = eps || 1e-7;
  var L = dist(a, b); if (L < 1e-12) return Math.hypot(px - a[0], py - a[1]) < eps;
  var c = cross(a[0], a[1], b[0], b[1], px, py) / L; if (Math.abs(c) > eps) return false;
  var t = ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / (L * L);
  return t >= -eps / L && t <= 1 + eps / L;
}
function segCross(a, b, c, d, strict) {
  var d1 = cross(c[0], c[1], d[0], d[1], a[0], a[1]), d2 = cross(c[0], c[1], d[0], d[1], b[0], b[1]);
  var d3 = cross(a[0], a[1], b[0], b[1], c[0], c[1]), d4 = cross(a[0], a[1], b[0], b[1], d[0], d[1]);
  var e = 1e-9 * Math.max(1, dist(a, b) * dist(c, d));
  if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return true;
  if (strict) return false;
  return onSeg(a[0], a[1], c, d) || onSeg(b[0], b[1], c, d) || onSeg(c[0], c[1], a, b) || onSeg(d[0], d[1], a, b);
}
// 自分で交差していないか（となりでない辺どうしが触れていたら×。となりの辺が折り返して重なるのも×）
function isSimple(pts) {
  var n = pts.length; if (n < 3) return false;
  if (Math.abs(signedArea(pts)) < 1e-6) return false;
  var ang = angles(pts);
  for (var k = 0; k < n; k++) if (ang[k] < 1e-6 || ang[k] > 360 - 1e-6) return false;
  for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n], false)) return false;
  }
  return true;
}
// 点が多角形の中（線の上もふくむ）にあるか
function inside(px, py, pts) {
  var n = pts.length, c = false;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    if (onSeg(px, py, pts[j], pts[i])) return true;
    var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------- 道路・後退（2項道路）
// 建築基準法 第42条2項：幅4m未満の道は、道の中心から2m下がった線を道路の境界とみなす。
// 反対側ががけ・川などのとき（one=true）は、反対側の線から4m。
function setbackOf(w, one) { if (!(w > 0) || w >= 4) return 0; return one ? 4 - w : (4 - w) / 2; }
function roadSetback(r) { return r.sb != null ? r.sb : setbackOf(r.w, r.one); }

// つながった道路の辺をまとめる（同じ道路が折れ曲がっている＝屈折路）。
// 印 g があれば同じ印どうし、なければ「となりの道路の辺で、曲がりが30°以内」なら同じ道路とみる
var BEND_MAX = 30;
function roadGroups(pts, roads) {
  var n = pts.length, E = edges(pts), ang = angles(pts), byEdge = {};
  roads.forEach(function (r) { byEdge[r.edge] = r; });
  function joins(i) {           // 辺 i と辺 i+1 が同じ道路か
    var a = byEdge[i], b = byEdge[(i + 1) % n]; if (!a || !b) return false;
    if (a.g != null || b.g != null) return a.g === b.g;
    return Math.abs(180 - ang[(i + 1) % n]) <= BEND_MAX;
  }
  var used = {}, groups = [];
  roads.forEach(function (r) {
    if (used[r.edge]) return;
    var s = r.edge, guard = 0;
    while (joins((s - 1 + n) % n) && guard++ < n) { s = (s - 1 + n) % n; if (s === r.edge) break; }
    var list = [], e = s; guard = 0;
    do { list.push(e); used[e] = 1; e = (e + 1) % n; } while (byEdge[e] && joins((e - 1 + n) % n) && !used[e] && guard++ < n);
    var len = 0, wmax = 0; list.forEach(function (k) { len += E[k].len; wmax = Math.max(wmax, byEdge[k].w); });
    groups.push({edges: list, len: len, w: wmax});
  });
  return groups;
}

// ---------------------------------------------------------------- 国税庁の想定整形地
// 財産評価基本通達20（注）：想定整形地＝不整形地の全域を囲む、正面路線に面する長方形（または正方形）。
// 屈折路（質疑応答事例「屈折路に面する不整形地の想定整形地のとり方」）：いずれかの路線からの垂線、
// または路線に接する両端を結ぶ直線によって全域を囲む長方形のうち、面積がいちばん小さいもの。
function boxAlong(pts, u) {
  var n = [u[1], -u[0]], s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  pts.forEach(function (p) { var s = p[0] * u[0] + p[1] * u[1], t = p[0] * n[0] + p[1] * n[1];
    if (s < s0) s0 = s; if (s > s1) s1 = s; if (t < t0) t0 = t; if (t > t1) t1 = t; });
  function P(s, t) { return [s * u[0] + t * n[0], s * u[1] + t * n[1]]; }
  return {W: s1 - s0, D: t1 - t0, area: (s1 - s0) * (t1 - t0), u: u, nv: n, s0: s0, s1: s1, t0: t0, t1: t1,
    pts: [P(s0, t0), P(s0, t1), P(s1, t1), P(s1, t0)]};
}
function soteiSeikei(pts, group) {
  var E = edges(pts), cands = [];
  group.edges.forEach(function (k) { if (E[k].len > 1e-9) cands.push({u: E[k].u, how: "辺" + (k + 1) + "の向き"}); });
  if (group.edges.length > 1) {
    var a = E[group.edges[0]].a, b = E[group.edges[group.edges.length - 1]].b, L = dist(a, b);
    if (L > 1e-9) cands.push({u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], how: "道路に接する両端を結ぶ線の向き"});
  }
  var best = null;
  cands.forEach(function (c) { var bx = boxAlong(pts, c.u); bx.how = c.how; if (!best || bx.area < best.area - 1e-9) best = bx; });
  return best;
}

// ---------------------------------------------------------------- 線で切る（半分の平面で切りとる）
// L = {pts, lab}：lab[i] は辺 i（pts[i]→pts[i+1]）の名札（もとの辺の番号、または 'cut…'）
// (p − o)·nv ≥ c の側を残す。切り口の辺には clipLab の名札をつける
function clipHalf(L, o, nv, c, clipLab) {
  var pts = L.pts, n = pts.length, out = [], endLab = [];
  function f(p) { return (p[0] - o[0]) * nv[0] + (p[1] - o[1]) * nv[1] - c; }
  for (var i = 0; i < n; i++) {
    var P = pts[i], Q = pts[(i + 1) % n], lab = L.lab[i], dp = f(P), dq = f(Q);
    var pin = dp >= -1e-9, qin = dq >= -1e-9;
    if (pin && qin) { out.push(Q); endLab.push(lab); }
    else if (pin && !qin) { var t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); endLab.push(lab); }
    else if (!pin && qin) { var t2 = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t2, P[1] + (Q[1] - P[1]) * t2]); endLab.push(clipLab);
      out.push(Q); endLab.push(lab); }
  }
  // 長さ0の辺を消す（点 j を消すと、点 j で終わる辺が消える）
  var changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (var j = 0; j < out.length; j++) {
      var pj = out[j], pp = out[(j - 1 + out.length) % out.length];
      if (dist(pj, pp) < 1e-9) { out.splice(j, 1); endLab.splice(j, 1); changed = true; break; }
    }
  }
  var m = out.length, lab2 = [];
  for (var k = 0; k < m; k++) lab2.push(endLab[(k + 1) % m]);
  return {pts: out, lab: lab2};
}
function labeled(pts) { return {pts: pts.slice(), lab: pts.map(function (_, i) { return i; })}; }

// 2項道路の後退をした後の形（道路の辺ごとに、内側へ後退の距離だけ下げた線で切る）
// ※まっすぐな線で切るので、道路の辺の延長上に土地が回りこむ形では、少し多めに切ることがある（目安）
function applySetback(pts, roads) {
  var L = labeled(pts), E = edges(pts);
  roads.forEach(function (r) {
    var sb = roadSetback(r); if (!(sb > 0) || L.pts.length < 3) return;
    var e = E[r.edge]; L = clipHalf(L, e.a, e.nv, sb, r.edge);
  });
  return L;
}

// ---------------------------------------------------------------- 長方形と線分の距離など（回した座標の中で使う）
function ptRectDist(x, y, R) {
  var dx = Math.max(R.s0 - x, 0, x - R.s1), dy = Math.max(R.t0 - y, 0, y - R.t1); return Math.hypot(dx, dy);
}
function ptSegDist(x, y, a, b) {
  var vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy, t = L2 ? ((x - a[0]) * vx + (y - a[1]) * vy) / L2 : 0;
  t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t);
}
function segHitsRect(a, b, R) {   // 線分が長方形（中身）に入るか（Liang–Barsky）
  var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1];
  var p = [-dx, dx, -dy, dy], q = [a[0] - R.s0, R.s1 - a[0], a[1] - R.t0, R.t1 - a[1]];
  for (var i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-15) { if (q[i] < 0) return false; }
    else { var r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}
function rectSegDist(R, a, b) {
  if (segHitsRect(a, b, R)) return 0;
  var c = [[R.s0, R.t0], [R.s0, R.t1], [R.s1, R.t1], [R.s1, R.t0]], d = Math.min(ptRectDist(a[0], a[1], R), ptRectDist(b[0], b[1], R));
  c.forEach(function (p) { d = Math.min(d, ptSegDist(p[0], p[1], a, b)); });
  return d;
}
// 長方形 R が「土地の中」で、どの辺からも決めた距離以上はなれているか
function rectOK(R, Q, off) {
  if (!(R.s1 > R.s0 && R.t1 > R.t0)) return false;
  var cs = [[R.s0, R.t0], [R.s0, R.t1], [R.s1, R.t1], [R.s1, R.t0]];
  for (var k = 0; k < 4; k++) if (!inside(cs[k][0], cs[k][1], Q)) return false;
  var n = Q.length, e = 1e-9;
  for (var i = 0; i < n; i++) {
    var v = Q[i];
    if (v[0] > R.s0 + e && v[0] < R.s1 - e && v[1] > R.t0 + e && v[1] < R.t1 - e) return false;   // 角が長方形の中に入る
  }
  for (var j = 0; j < n; j++) {
    var a = Q[j], b = Q[(j + 1) % n], o = off[j];
    if (o > 1e-9) { if (rectSegDist(R, a, b) < o - 1e-9) return false; }
    else {
      for (var k2 = 0; k2 < 4; k2++) if (segCross(a, b, cs[k2], cs[(k2 + 1) % 4], true)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- 建てられる長方形（格子でさがす近似）
// L：名札つきの形、offOf(名札)：その辺から離す距離（m）、deg：長方形の向き（度。x軸から左回り）
// 1) 長方形の向きに回した座標で、細かいます目のうち「まるごと入る」ますを調べる
// 2) 入るますでできる長方形をすべて調べ（ヒストグラムの方法）、大きいものを候補にする
// 3) 候補の4辺を少しずつ外へ広げ、ぎりぎりまで大きくする（0.01m くらいまで）
function maxRect(L, offOf, deg, opt) {
  opt = opt || {};
  var minW = opt.minWidth || 0, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  var Q = L.pts.map(function (p) { return rot(p, c, s); }), off = L.lab.map(function (lb) { return Math.max(0, offOf(lb) || 0); });
  if (Q.length < 3) return null;
  var s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  Q.forEach(function (p) { s0 = Math.min(s0, p[0]); s1 = Math.max(s1, p[0]); t0 = Math.min(t0, p[1]); t1 = Math.max(t1, p[1]); });
  var span = Math.max(s1 - s0, t1 - t0), cells = opt.cells || 72, h = Math.max(0.05, span / cells);
  var nx = Math.max(1, Math.ceil((s1 - s0) / h)), ny = Math.max(1, Math.ceil((t1 - t0) / h));
  var ok = [];
  for (var y = 0; y < ny; y++) { var row = []; for (var x = 0; x < nx; x++)
    row.push(rectOK({s0: s0 + x * h, s1: s0 + (x + 1) * h, t0: t0 + y * h, t1: t0 + (y + 1) * h}, Q, off) ? 1 : 0); ok.push(row); }
  var hgt = new Array(nx).fill(0), top = [], topW = [], need = Math.max(0, Math.floor((minW - 2 * h) / h + 1e-9));
  function keep(list, r, k) { list.push(r); list.sort(function (p, q) { return q.cells - p.cells; }); if (list.length > k) list.length = k; }
  for (var yy = 0; yy < ny; yy++) {
    for (var xx = 0; xx < nx; xx++) hgt[xx] = ok[yy][xx] ? hgt[xx] + 1 : 0;
    var st = [];
    for (var i = 0; i <= nx; i++) {
      var hh = i < nx ? hgt[i] : 0;
      while (st.length && hgt[st[st.length - 1]] >= hh) {
        var H = hgt[st.pop()], left = st.length ? st[st.length - 1] + 1 : 0, W = i - left;
        if (H > 0 && W > 0) {
          var r = {x0: left, x1: i, y0: yy - H + 1, y1: yy + 1, cells: H * W};
          keep(top, r, 6);
          if (Math.min(H, W) >= need) keep(topW, r, 6);
        }
      }
      st.push(i);
    }
  }
  var cands = topW.concat(top);
  if (!cands.length) return null;
  function grow(R) {
    var keys = ["s0", "s1", "t0", "t1"], sign = {s0: -1, s1: 1, t0: -1, t1: 1};
    for (var pass = 0; pass < 2; pass++) keys.forEach(function (k) {
      var lo = 0, hi = 3 * h, base = R[k];
      for (var it = 0; it < 14; it++) {
        var mid = (lo + hi) / 2, T = Object.assign({}, R); T[k] = base + sign[k] * mid;
        if (rectOK(T, Q, off)) lo = mid; else hi = mid;
      }
      R[k] = base + sign[k] * lo;
    });
    return R;
  }
  var best = null, bestAny = null;
  cands.forEach(function (g) {
    var R = grow({s0: s0 + g.x0 * h, s1: s0 + g.x1 * h, t0: t0 + g.y0 * h, t1: t0 + g.y1 * h});
    var w = R.s1 - R.s0, d = R.t1 - R.t0, ar = w * d, mn = Math.min(w, d);
    var item = {w: w, d: d, area: ar, R: R};
    if (!bestAny || ar > bestAny.area) bestAny = item;
    if (mn >= minW - 1e-6 && (!best || ar > best.area)) best = item;
  });
  var pick = best || bestAny, R0 = pick.R;
  var pts = [[R0.s0, R0.t0], [R0.s0, R0.t1], [R0.s1, R0.t1], [R0.s1, R0.t0]].map(function (q) { return unrot(q, c, s); });
  return {w: pick.w, d: pick.d, area: pick.area, minSide: Math.min(pick.w, pick.d), deg: deg, pts: pts,
    okWidth: Math.min(pick.w, pick.d) >= minW - 1e-6, step: h};
}

// 辺ごとに離す距離を決める関数を作る
// side：となりの土地から（民法234条の50cm）、roadSide：道路側（ふつう0。地区計画の壁面の位置などがあれば）、
// wall：外壁の後退距離（建築基準法54条。1低層・2低層・田園住居で都市計画に決めがあるとき 1m か 1.5m）、edgeOff：辺ごとの上書き {番号: m}
function offsetFn(roads, o) {
  o = o || {};
  var isRoad = {}; roads.forEach(function (r) { isRoad[r.edge] = 1; });
  var side = o.side == null ? 0.5 : +o.side, roadSide = +o.roadSide || 0, wall = +o.wall || 0, edgeOff = o.edgeOff || {};
  return function (lab) {
    if (typeof lab === "number" && edgeOff[lab] != null) return +edgeOff[lab];
    if (typeof lab === "number" && isRoad[lab]) return Math.max(roadSide, wall);
    return Math.max(side, wall);          // となりの土地・分けた線（新しい境界）
  };
}

// ---------------------------------------------------------------- 旗竿（路地状部分）の読みとり
// 正面の道路から奥へ、少しずつ「その深さでの土地の幅」を測る。道路ぎわの細い部分が続き、
// その先で幅が1.5倍以上に広がれば旗竿とみる。竿の幅＝細い部分のいちばん狭い幅、竿の長さ＝広がるまでの距離
function chordAt(Q, t) {   // 回した座標で、高さ t の横線と形が重なる区間（いちばん長いもの）
  var xs = [], n = Q.length;
  for (var i = 0; i < n; i++) {
    var a = Q[i], b = Q[(i + 1) % n];
    if ((a[1] <= t && b[1] > t) || (b[1] <= t && a[1] > t)) xs.push(a[0] + (t - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  xs.sort(function (p, q) { return p - q; });
  var best = 0, sum = 0;
  for (var k = 0; k + 1 < xs.length; k += 2) { var w = xs[k + 1] - xs[k]; sum += w; if (w > best) best = w; }
  return {max: best, sum: sum};
}
function flagInfo(pts, frontEdge) {
  if (frontEdge == null) return {isFlag: false};
  var e = edges(pts)[frontEdge], a = Math.atan2(e.u[1], e.u[0]), c = Math.cos(a), s = Math.sin(a);
  var Q = pts.map(function (p) { return rot(p, c, s); });
  // 回した座標：辺の向き＝+s、内側＝−t（時計回りなので内側は右＝下）。t を内側向きに直す
  Q = Q.map(function (q) { return [q[0], -q[1]]; });
  var tr = -rot(e.a, c, s)[1], tmax = -Infinity; Q.forEach(function (q) { tmax = Math.max(tmax, q[1]); });
  var depth = tmax - tr; if (!(depth > 0.5)) return {isFlag: false};
  var step = Math.max(0.02, depth / 400), poleMin = Infinity, first = null, poleL = null, bodyMax = 0;
  for (var t = tr + step / 2; t < tmax; t += step) {
    var w = chordAt(Q, t).max;
    if (first == null) first = w;
    if (poleL == null) {
      if (w > Math.max(first * 1.5, first + 1) ) poleL = t - tr - step / 2;
      else poleMin = Math.min(poleMin, w);
    } else bodyMax = Math.max(bodyMax, w);
  }
  if (poleL == null || !(poleL >= 1) || !(bodyMax >= poleMin * 1.5)) return {isFlag: false, width0: first};
  return {isFlag: true, poleW: poleMin, poleL: poleL, bodyW: bodyMax, note: "形から読みとった目安（竿の幅はいちばん狭いところ）"};
}

// ---------------------------------------------------------------- まとめて計算する
// opt：side（隣地から m、既定0.5）・roadSide（道路側 m、既定0）・wall（外壁の後退 m、既定0）・minWidth（家として成り立つ最小の幅 m、既定3.6）
//      orient：'all'（既定：道路の向き・いちばん長い辺の向き・いちばん広くとれる向き）／'road'（道路の向きだけ。速い）
//      cells：格子の細かさ（既定72。ドラッグ中は 40 くらいにすると速い）
function analyze(land, opt) {
  opt = opt || {};
  var minWidth = opt.minWidth == null ? 3.6 : +opt.minWidth;
  var L = normalize(land || {}), pts = L.pts, n = pts.length, res = {land: L, errors: [], warnings: [], notes: []};
  res.n = n;
  if (n < 3) { res.errors.push("角が3つ以上必要です"); res.ok = false; return res; }
  res.area = area(pts); res.tsubo = res.area / TSUBO; res.perimeter = perimeter(pts);
  res.edges = edges(pts); res.angles = angles(pts); res.simple = isSimple(pts);
  if (!(res.area > 1e-6)) { res.errors.push("面積が0です（角の座標を確かめてください）"); res.ok = false; return res; }
  if (!res.simple) res.errors.push("辺どうしが交差しています（角の順番が入れかわっていないか、測量図の点の順番を確かめてください）");
  var roads = L.roads, byEdge = {};
  roads.forEach(function (r) { r.setback = roadSetback(r); r.len = res.edges[r.edge].len; byEdge[r.edge] = r; });
  res.roads = roads;
  res.edges.forEach(function (e) { e.road = byEdge[e.i] || null; });
  var groups = roadGroups(pts, roads); res.groups = groups;
  res.contactTotal = roads.reduce(function (s, r) { return s + r.len; }, 0);
  res.contactMax = groups.reduce(function (m, g) { return Math.max(m, g.len); }, 0);

  // 正面の道路
  var fg = null;
  if (L.front != null) groups.forEach(function (g) { if (g.edges.indexOf(L.front) >= 0) fg = g; });
  if (!fg) groups.forEach(function (g) { if (!fg || g.len > fg.len + 1e-9 || (Math.abs(g.len - fg.len) < 1e-9 && g.w > fg.w)) fg = g; });
  res.frontGroup = fg;
  var frontEdge = null;
  if (fg) { frontEdge = fg.edges[0]; fg.edges.forEach(function (k) { if (res.edges[k].len > res.edges[frontEdge].len) frontEdge = k; }); }
  res.frontEdge = frontEdge;
  if (!fg) res.warnings.push("道路に接する辺が選ばれていません（道路に接していない土地は、建物が建てられないことがあります）");

  // 想定整形地・かげ地割合・間口・平均的な奥行
  var longest = 0; res.edges.forEach(function (e) { if (e.len > res.edges[longest].len) longest = e.i; });
  var st = fg ? soteiSeikei(pts, fg) : boxAlong(pts, res.edges[longest].u);
  if (!fg) st.how = "道路が無いので、いちばん長い辺の向き（参考）";
  res.sotei = st;
  res.kagePct = st.area > 0 ? Math.max(0, (st.area - res.area) / st.area * 100) : 0;
  if (res.kagePct < 1e-7) res.kagePct = 0;
  var actual = fg ? fg.len : 0;
  res.frontage = fg ? (fg.edges.length > 1 ? Math.min(actual, st.W) : actual) : 0;
  res.frontageActual = actual;
  res.avgDepth = res.frontage > 0 ? res.area / res.frontage : null;
  res.depth = res.avgDepth != null ? Math.min(res.avgDepth, st.D) : st.D;
  res.isRect = n === 4 && res.angles.every(function (a) { return Math.abs(a - 90) < 0.5; });
  res.nta = {frontM: r2(res.frontage), depthM: r2(res.depth), soteiW: r2(st.W), soteiD: r2(st.D), soteiM2: r2(st.area),
    kagePct: Math.round(res.kagePct * 10) / 10, areaM2: r2(res.area), shape: res.kagePct >= 0.05 ? "fusei" : "seikei"};
  if (fg && fg.edges.length > 1) res.notes.push("屈折した道路：間口は「想定整形地の間口」と「実際に接する長さ」の短いほう（国税庁の質疑応答事例）");
  if (res.kagePct >= 50) res.warnings.push("かげ地割合が50%以上です。細長い帯のような部分がある土地は、国税庁の例では不整形地補正を使わず、部分に分けて評価することがあります");

  // 2項道路の後退・建てられる長方形
  var eff = applySetback(pts, roads);
  res.effPts = eff.pts; res.effLab = eff.lab;
  res.effArea = eff.pts.length >= 3 ? area(eff.pts) : 0;
  res.setbackArea = Math.max(0, res.area - res.effArea);
  var offOf = offsetFn(roads, opt);
  var dirs = [];
  function addDir(deg, key) {
    deg = ((deg % 180) + 180) % 180;
    for (var i = 0; i < dirs.length; i++) { var d = Math.abs(dirs[i].deg - deg) % 90; if (Math.min(d, 90 - d) < 0.5) { dirs[i].keys.push(key); return; } }
    dirs.push({deg: deg, keys: [key]});
  }
  if (frontEdge != null) addDir(res.edges[frontEdge].deg, "road");
  addDir(res.edges[longest].deg, "longest");
  if (opt.orient !== "road") res.edges.slice().sort(function (p, q) { return q.len - p.len; }).slice(0, 8).forEach(function (e) { addDir(e.deg, "other"); });
  var build = {road: null, longest: null, best: null, minWidth: minWidth};
  if (res.effPts.length >= 3 && res.simple) dirs.forEach(function (d) {
    if (opt.orient === "road" && d.keys.indexOf("road") < 0) return;
    var r = maxRect(eff, offOf, d.deg, {minWidth: minWidth, cells: opt.cells});
    if (!r) return;
    if (d.keys.indexOf("road") >= 0) build.road = r;
    if (d.keys.indexOf("longest") >= 0) build.longest = r;
    if (!build.best || (r.okWidth && !build.best.okWidth) || (r.okWidth === build.best.okWidth && r.area > build.best.area + 1e-6)) build.best = r;
  });
  res.build = build;
  var mainB = build.road || build.best;
  if (!mainB) res.warnings.push("離す距離をとると、長方形の建物が入りません");
  else if (!mainB.okWidth) res.warnings.push("建てられる長方形の幅が " + mainB.minSide.toFixed(2) + "m で、目安の " + minWidth + "m を下回ります（家として使いにくい形です）");

  // 旗竿の読みとり
  res.flag = flagInfo(pts, frontEdge);
  if (res.flag.isFlag && res.flag.poleW < 2 - 1e-6) res.warnings.push("路地状部分（竿）の幅が2m未満です。建築基準法43条の「道路に2m以上接する」を満たさないおそれ");
  if (fg && res.contactMax < 2 - 1e-6) res.warnings.push("道路に接する長さが2m未満です（建築基準法43条の接道の決まりを満たさないおそれ）");
  res.ok = res.errors.length === 0;
  return res;
}

// ---------------------------------------------------------------- 同じ面積で N 区画に分ける
// dir：'along'（既定：道路の辺に沿って横に並べる＝道路に直角の線で切る）／'across'（道路と平行な線で前後に切る）
// opt：minLot（最低敷地面積 ㎡）・minFront（接道の長さ、既定2m）・minWidth（建てられる長方形の最小の幅、既定3.6m）・side・roadSide・wall
// 2項道路の後退をしたあとの形を分ける（区画の面積は後退後の面積）
function split(land, N, opt) {
  opt = opt || {};
  var A = analyze(land, {orient: "road", minWidth: opt.minWidth, side: opt.side, roadSide: opt.roadSide, wall: opt.wall, cells: 24});
  var out = {N: N, lots: [], cuts: [], errors: A.errors.slice(), warnings: []};
  if (!A.ok || A.frontEdge == null) { if (A.frontEdge == null) out.errors.push("道路の辺が無いので分けられません"); return out; }
  N = Math.max(1, Math.round(N));
  var fe = A.edges[A.frontEdge], u = opt.dir === "across" ? [fe.nv[0], fe.nv[1]] : [-fe.u[0], -fe.u[1]];   // 区画を並べる向き（道路から見て左→右／手前→奥）
  var L0 = {pts: A.effPts, lab: A.effLab}, total = area(L0.pts);
  var smin = Infinity, smax = -Infinity; L0.pts.forEach(function (p) { var v = p[0] * u[0] + p[1] * u[1]; smin = Math.min(smin, v); smax = Math.max(smax, v); });
  function partBelow(c) { return clipHalf(L0, [0, 0], [-u[0], -u[1]], -c, "cut"); }      // u·p ≤ c の側
  var cutsAt = [smin];
  for (var k = 1; k < N; k++) {
    var target = total * k / N, lo = smin, hi = smax;
    for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2, P = partBelow(mid); if ((P.pts.length >= 3 ? area(P.pts) : 0) < target) lo = mid; else hi = mid; }
    cutsAt.push((lo + hi) / 2);
  }
  cutsAt.push(smax);
  var minWidth = opt.minWidth == null ? 3.6 : +opt.minWidth, minFront = opt.minFront == null ? 2 : +opt.minFront, minLot = +opt.minLot || 0;
  var roadEdge = {}; A.roads.forEach(function (r) { roadEdge[r.edge] = 1; });
  var offOf = offsetFn(A.roads, opt);
  var a = Math.atan2(u[1], u[0]), cs = Math.cos(a), sn = Math.sin(a), maxDiff = 0;
  for (var j = 0; j < N; j++) {
    var P1 = clipHalf(L0, [0, 0], u, cutsAt[j], "cut" + j);
    var P2 = P1.pts.length >= 3 ? clipHalf(P1, [0, 0], [-u[0], -u[1]], -cutsAt[j + 1], "cut" + (j + 1)) : P1;
    var lot = {id: String.fromCharCode(65 + j), pts: P2.pts, lab: P2.lab, area: P2.pts.length >= 3 ? area(P2.pts) : 0};
    lot.front = 0; var cutEdges = {};
    for (var q = 0; q < P2.pts.length; q++) {
      var lb = P2.lab[q], len = dist(P2.pts[q], P2.pts[(q + 1) % P2.pts.length]);
      if (typeof lb === "number" && roadEdge[lb]) lot.front += len;
      if (typeof lb === "string" && len > 1e-6) cutEdges[lb] = (cutEdges[lb] || 0) + 1;
    }
    lot.parts = Object.keys(cutEdges).some(function (k) { return cutEdges[k] > 1; }) ? 2 : 1;
    lot.width = cutsAt[j + 1] - cutsAt[j];
    // いちばん細いところの幅（区画を並べる向きに測る。奥行の両はし1割は除く）
    var Q = P2.pts.map(function (p) { return rot(p, cs, sn); });   // 並べる向きを横（1つめの値）に
    var t0 = Infinity, t1 = -Infinity; Q.forEach(function (p) { t0 = Math.min(t0, p[1]); t1 = Math.max(t1, p[1]); });
    var nw = Infinity; for (var z = 1; z <= 19; z++) { var tt = t0 + (t1 - t0) * (0.1 + 0.8 * z / 20); nw = Math.min(nw, chordAt(Q, tt).max); }
    lot.narrowW = isFinite(nw) ? nw : 0;
    lot.build = lot.pts.length >= 3 ? maxRect({pts: lot.pts, lab: lot.lab}, offOf, fe.deg, {minWidth: minWidth}) : null;
    lot.okArea = !(minLot > 0) || lot.area >= minLot - 1e-6;
    lot.okFront = lot.front >= minFront - 1e-6;
    lot.okWidth = !!(lot.build && lot.build.okWidth);
    lot.ok = lot.okArea && lot.okFront && lot.okWidth && lot.parts === 1;
    out.lots.push(lot);
    maxDiff = Math.max(maxDiff, Math.abs(lot.area - total / N));
  }
  for (var m = 1; m < N; m++) {     // 切る線（画面に描く用）：u·p = c の線と土地の重なり
    var c0 = cutsAt[m], nrm = [-u[1], u[0]], ts = [];
    L0.pts.forEach(function (p, i) {
      var b = L0.pts[(i + 1) % L0.pts.length], fa = p[0] * u[0] + p[1] * u[1] - c0, fb = b[0] * u[0] + b[1] * u[1] - c0;
      if ((fa <= 0 && fb > 0) || (fb <= 0 && fa > 0)) { var t = fa / (fa - fb); ts.push([p[0] + (b[0] - p[0]) * t, p[1] + (b[1] - p[1]) * t]); }
    });
    ts.sort(function (p, q) { return (p[0] * nrm[0] + p[1] * nrm[1]) - (q[0] * nrm[0] + q[1] * nrm[1]); });
    if (ts.length >= 2) out.cuts.push([ts[0], ts[ts.length - 1]]);
  }
  out.total = total; out.each = total / N; out.maxDiff = maxDiff;
  out.ok = out.lots.every(function (l) { return l.ok; });
  if (out.lots.some(function (l) { return l.parts > 1; })) out.warnings.push("1つの区画が2つ以上に分かれました（へこみのある形）。分け方を変えてください");
  return out;
}

// ---------------------------------------------------------------- 形の型
// どの型も「道路は下の辺（y=0）、奥が上」。道路の辺が0番になるように並べる
var SHAPES = [
  {id: "rect", name: "長方形", params: [{k: "W", lab: "間口（道路に面する幅）", def: 10}, {k: "D", lab: "奥行", def: 20}]},
  {id: "daikei", name: "台形", params: [{k: "W", lab: "間口（道路側の幅）", def: 10}, {k: "Wb", lab: "奥の幅", def: 14}, {k: "D", lab: "奥行", def: 20},
    {k: "off", lab: "奥の辺のずれ（右へ＋）", def: 0, neg: true}]},
  {id: "lji", name: "L字", params: [{k: "W", lab: "全体の幅", def: 12}, {k: "D", lab: "全体の奥行", def: 20}, {k: "cw", lab: "欠けている部分の幅", def: 5},
    {k: "cd", lab: "欠けている部分の奥行", def: 8}, {k: "corner", lab: "欠けている角", def: "br", opts: [["br", "奥の右"], ["bl", "奥の左"], ["fr", "手前の右"], ["fl", "手前の左"]]}]},
  {id: "sankaku", name: "三角", params: [{k: "W", lab: "間口（道路側の辺）", def: 12}, {k: "D", lab: "奥行（いちばん奥の角まで）", def: 16},
    {k: "ax", lab: "奥の角の位置（左はしから）", def: 6, neg: true}]},
  {id: "hata", name: "旗竿", params: [{k: "pw", lab: "竿（通路）の幅", def: 2.5}, {k: "pl", lab: "竿（通路）の長さ", def: 12}, {k: "bw", lab: "旗（奥の四角）の幅", def: 10},
    {k: "bd", lab: "旗（奥の四角）の奥行", def: 10}, {k: "pos", lab: "竿の位置", def: "l", opts: [["l", "左"], ["r", "右"], ["c", "真ん中"]]}]},
  {id: "heiko", name: "平行四辺形", params: [{k: "W", lab: "間口", def: 10}, {k: "D", lab: "奥行（道路から直角に測る）", def: 20}, {k: "off", lab: "奥の辺のずれ（右へ＋）", def: 4, neg: true}]},
  {id: "gokaku", name: "五角形（角を落とした形）", params: [{k: "W", lab: "幅", def: 12}, {k: "D", lab: "奥行", def: 18}, {k: "cx", lab: "落とした角の横の長さ", def: 4},
    {k: "cy", lab: "落とした角の縦の長さ", def: 4}, {k: "corner", lab: "落とした角", def: "br", opts: [["br", "奥の右"], ["bl", "奥の左"], ["fr", "手前の右（隅切りなど）"], ["fl", "手前の左（隅切りなど）"]]}]}
];
function shapeDef(id) { for (var i = 0; i < SHAPES.length; i++) if (SHAPES[i].id === id) return SHAPES[i]; return null; }
function shapeParams(id, p) {
  var d = shapeDef(id), o = {}; if (!d) return o; p = p || {};
  d.params.forEach(function (q) { var v = p[q.k]; if (q.opts) o[q.k] = q.opts.some(function (x) { return x[0] === v; }) ? v : q.def;
    else { v = num(v); o[q.k] = isFinite(v) ? v : q.def; } });
  return o;
}
// 一直線にならぶ角（180°）を外す（型で作った形だけ。測量図の点は外さない）
function dropCollinear(pts) {
  var out = pts.slice(), changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (var i = 0; i < out.length; i++) {
      var p = out[(i - 1 + out.length) % out.length], c = out[i], q = out[(i + 1) % out.length];
      if (Math.abs(cross(p[0], p[1], c[0], c[1], q[0], q[1])) < 1e-9 * Math.max(1, dist(p, q))) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}
// 形の型から land を作る。roadW：道路の幅（既定4m）
function makeShape(id, p, roadW) {
  var q = shapeParams(id, p), pts, R0;           // R0：道路の辺の始まりの点
  var W = Math.max(0.01, q.W || 0), D = Math.max(0.01, q.D || 0);
  switch (id) {
    case "daikei": { var Wb = Math.max(0.01, q.Wb), xl = (W - Wb) / 2 + q.off; pts = [[W, 0], [0, 0], [xl, D], [xl + Wb, D]]; R0 = [W, 0]; break; }
    case "lji": {
      var cw = Math.min(Math.max(0.01, q.cw), W - 0.01), cd = Math.min(Math.max(0.01, q.cd), D - 0.01);
      if (q.corner === "bl") { pts = [[W, 0], [0, 0], [0, D - cd], [cw, D - cd], [cw, D], [W, D]]; R0 = [W, 0]; }
      else if (q.corner === "fr") { pts = [[W - cw, 0], [0, 0], [0, D], [W, D], [W, cd], [W - cw, cd]]; R0 = [W - cw, 0]; }
      else if (q.corner === "fl") { pts = [[W, 0], [cw, 0], [cw, cd], [0, cd], [0, D], [W, D]]; R0 = [W, 0]; }
      else { pts = [[W, 0], [0, 0], [0, D], [W - cw, D], [W - cw, D - cd], [W, D - cd]]; R0 = [W, 0]; }
      break;
    }
    case "sankaku": pts = [[W, 0], [0, 0], [q.ax, D]]; R0 = [W, 0]; break;
    case "hata": {
      var pw = Math.max(0.01, q.pw), pl = Math.max(0.01, q.pl), bw = Math.max(pw, q.bw), bd = Math.max(0.01, q.bd);
      var x0 = q.pos === "r" ? bw - pw : q.pos === "c" ? (bw - pw) / 2 : 0;
      pts = [[x0 + pw, 0], [x0, 0], [x0, pl], [0, pl], [0, pl + bd], [bw, pl + bd], [bw, pl], [x0 + pw, pl]]; R0 = [x0 + pw, 0];
      break;
    }
    case "heiko": pts = [[W, 0], [0, 0], [q.off, D], [q.off + W, D]]; R0 = [W, 0]; break;
    case "gokaku": {
      var cx = Math.min(Math.max(0.01, q.cx), W - 0.01), cy = Math.min(Math.max(0.01, q.cy), D - 0.01);
      if (q.corner === "bl") { pts = [[W, 0], [0, 0], [0, D - cy], [cx, D], [W, D]]; R0 = [W, 0]; }
      else if (q.corner === "fr") { pts = [[W - cx, 0], [0, 0], [0, D], [W, D], [W, cy]]; R0 = [W - cx, 0]; }
      else if (q.corner === "fl") { pts = [[W, 0], [cx, 0], [0, cy], [0, D], [W, D]]; R0 = [W, 0]; }
      else { pts = [[W, 0], [0, 0], [0, D], [W - cx, D], [W, D - cy]]; R0 = [W, 0]; }
      break;
    }
    default: id = "rect"; pts = [[W, 0], [0, 0], [0, D], [W, D]]; R0 = [W, 0];
  }
  pts = dropCollinear(cleanPts(pts));
  var k = 0; pts.forEach(function (pp, i) { if (dist(pp, R0) < 1e-6) k = i; });
  pts = pts.slice(k).concat(pts.slice(0, k));
  var land = normalize({pts: pts, roads: [{edge: 0, w: roadW > 0 ? roadW : 4}]});
  land.tpl = {id: id, p: q};
  return land;
}

// 「間口・奥行・形の種類」しか分からないときの近似。area（面積㎡）が分かれば、それに合うように寸法をきめる
// type：rect / daikei / lji / sankaku / hata / heiko / gokaku（ほかに seikei→rect、fusei→daikei）
function approxFromDims(o) {
  o = o || {};
  var F = num(o.F), D = num(o.D), A = num(o.area), t = o.type || "rect";
  if (t === "seikei") t = "rect"; if (t === "fusei") t = "daikei";
  if (!(F > 0) || !(D > 0)) return null;
  var hasA = A > 0, p;
  switch (t) {
    case "daikei": { var Wb = hasA ? 2 * A / D - F : F * 1.3; p = {W: F, Wb: Wb > 0.1 ? Wb : F, D: D, off: 0}; break; }
    case "lji": { var cw = F / 2, cd = hasA ? (F * D - A) / cw : D / 3; cd = Math.min(Math.max(cd, 0.1), D - 0.1); p = {W: F, D: D, cw: cw, cd: cd, corner: "br"}; break; }
    case "sankaku": p = {W: F, D: D, ax: F / 2}; break;
    case "hata": {
      var pl = Math.max(2, Math.round(D * 0.4 * 10) / 10), bd = Math.max(0.5, D - pl), bw = hasA ? (A - F * pl) / bd : Math.max(F * 3, 8);
      p = {pw: F, pl: pl, bw: Math.max(bw, F), bd: bd, pos: "l"}; break;
    }
    case "heiko": p = {W: F, D: D, off: F * 0.4}; break;
    case "gokaku": { var cut = hasA ? Math.sqrt(Math.max(0.02, 2 * (F * D - A))) : Math.min(F, D) / 3; p = {W: F, D: D, cx: Math.min(cut, F - 0.1), cy: Math.min(cut, D - 0.1), corner: "br"}; break; }
    default: t = "rect"; p = {W: F, D: D};
  }
  var land = makeShape(t, p, o.roadW);
  land.approx = true;
  return land;
}

// ---------------------------------------------------------------- 測量図の座標
// 地積測量図の「座標求積表」：点名・X（北）・Y（東）。行ごとに「名前 X Y」（カンマ・タブ・空白で区切る）
// 数字が2つ以上ある行だけ読む。数字が3つ以上なら、最後の2つを X・Y とみる（先頭の番号などは点名あつかい）
function parseSurveyText(text) {
  var rows = [];
  String(text || "").split(/\r?\n/).forEach(function (line) {
    var s = line.replace(/[０-９．－，]/g, function (ch) { return {"．": ".", "－": "-", "，": ","}[ch] || String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/[−ー―‐](?=\d)/g, "-").trim();
    if (!s) return;
    var tok = s.split(/[\s,，、\t]+/).filter(Boolean), nums = [], name = "";
    tok.forEach(function (t) { var v = /^[+-]?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN; if (isFinite(v)) nums.push(v); else if (!nums.length) name += (name ? " " : "") + t; });
    if (nums.length < 2) return;
    if (nums.length >= 3 && !name) name = String(nums[0]);
    rows.push({name: name || ("点" + (rows.length + 1)), X: nums[nums.length - 2], Y: nums[nums.length - 1]});
  });
  // 最後の点が最初と同じ（閉じた表）なら外す
  if (rows.length > 3) { var a = rows[0], b = rows[rows.length - 1]; if (Math.abs(a.X - b.X) < 1e-6 && Math.abs(a.Y - b.Y) < 1e-6) rows.pop(); }
  return rows;
}
// 測量の座標（X 北・Y 東）を、この部品の向き（x 東・y 北）に直す。左下が (0,0) になるようにずらす
// swap=true：X が東・Y が北で書かれている表（CADの出力など）のとき
function fromSurvey(rows, swap) {
  var raw = (rows || []).map(function (r) { var X = num(r.X), Y = num(r.Y); return swap ? [X, Y] : [Y, X]; })
    .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
  if (!raw.length) return {pts: [], origin: [0, 0], names: []};
  var mx = Infinity, my = Infinity; raw.forEach(function (p) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); });
  return {pts: raw.map(function (p) { return [p[0] - mx, p[1] - my]; }), origin: [mx, my], names: (rows || []).map(function (r) { return r.name; })};
}
// 逆向き：この部品の座標 → 測量の表（X 北・Y 東）。origin があれば足す
function toSurvey(pts, origin, names) {
  origin = origin || [0, 0];
  return pts.map(function (p, i) { return {name: (names && names[i]) || ("K" + (i + 1)), X: p[1] + origin[1], Y: p[0] + origin[0]}; });
}

// ---------------------------------------------------------------- URL に入れて引きつぐ
// 書き方（ほかのページの ? や # の値と名前がぶつからないよう、kz で始める）：
//   kz=x1,y1;x2,y2;...      角の座標（m、小数2けたまで、時計回り）
//   kzr=辺:幅[:1],...        道路の辺と幅。「:1」は片側だけ下がる2項道路。例 kzr=0:4,2:3.6:1
//   kzf=辺                   正面の道路の辺（省略可）
//   kzt=型:値,値,...         形の型と寸法（省略可。画面で型の入力に戻すため）。例 kzt=daikei:10,14,20,0
function fmtN(v) { var s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, ""); return s === "-0" ? "0" : s; }
function toQuery(land) {
  var L = normalize(land || {}); if (L.pts.length < 3) return "";
  var q = "kz=" + L.pts.map(function (p) { return fmtN(p[0]) + "," + fmtN(p[1]); }).join(";");
  if (L.roads.length) q += "&kzr=" + L.roads.map(function (r) { return r.edge + ":" + fmtN(r.w) + (r.one ? ":1" : ""); }).join(",");
  if (L.front != null) q += "&kzf=" + L.front;
  if (L.tpl && shapeDef(L.tpl.id)) {
    var d = shapeDef(L.tpl.id); q += "&kzt=" + L.tpl.id + ":" + d.params.map(function (pp) { var v = L.tpl.p[pp.k]; return typeof v === "number" ? fmtN(v) : String(v); }).join(",");
  }
  return q;
}
function fromQuery(str) {
  var raw = {};
  String(str || "").replace(/^[?#]/, "").split(/[&#?]/).forEach(function (pr) {
    var i = pr.indexOf("="); if (i < 0) return; var k = pr.slice(0, i), v = pr.slice(i + 1);
    try { k = decodeURIComponent(k); v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) {}
    raw[k.toLowerCase()] = v;
  });
  if (!raw.kz) return null;
  var pts = raw.kz.split(";").map(function (s) { var a = s.split(","); return [num(a[0]), num(a[1])]; })
    .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
  if (pts.length < 3) return null;
  var roads = [];
  if (raw.kzr) raw.kzr.split(",").forEach(function (s) { var a = s.split(":"); if (a[0] === "") return; roads.push({edge: num(a[0]), w: num(a[1]), one: a[2] === "1"}); });
  var land = {pts: pts, roads: roads};
  if (raw.kzf != null && raw.kzf !== "" && isFinite(num(raw.kzf))) land.front = num(raw.kzf);
  if (raw.kzt) {
    var j = raw.kzt.indexOf(":"), id = j < 0 ? raw.kzt : raw.kzt.slice(0, j), d = shapeDef(id);
    if (d) { var vals = j < 0 ? [] : raw.kzt.slice(j + 1).split(","), p = {}; d.params.forEach(function (pp, k) { if (vals[k] != null) p[pp.k] = pp.opts ? vals[k] : num(vals[k]); });
      land.tpl = {id: id, p: shapeParams(id, p)}; }
  }
  return normalize(land);
}

// ---------------------------------------------------------------- 書き出し
var API = {TSUBO: TSUBO, num: num, signedArea: signedArea, area: area, perimeter: perimeter, cleanPts: cleanPts, normalize: normalize,
  isClockwise: isClockwise, edges: edges, angles: angles, isSimple: isSimple, inside: inside, segCross: segCross,
  setbackOf: setbackOf, roadGroups: roadGroups, soteiSeikei: soteiSeikei, boxAlong: boxAlong, clipHalf: clipHalf, applySetback: applySetback,
  maxRect: maxRect, offsetFn: offsetFn, flagInfo: flagInfo, analyze: analyze, split: split,
  SHAPES: SHAPES, shapeDef: shapeDef, shapeParams: shapeParams, makeShape: makeShape, approxFromDims: approxFromDims,
  parseSurveyText: parseSurveyText, fromSurvey: fromSurvey, toSurvey: toSurvey, toQuery: toQuery, fromQuery: fromQuery, fmtN: fmtN};
if (typeof module !== "undefined" && module.exports) module.exports = API;
root.Katachi = API;
})(typeof window !== "undefined" ? window : this);
