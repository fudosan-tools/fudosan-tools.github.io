/* 土地の形を入れる部品（どのページにも差しこめる）。先に 共通/katachi.js を読みこんでおく。
   使い方：
     var ui = KatachiUI.mount(document.getElementById("katachi"), {
       value: Katachi.fromQuery(location.hash) || null,   // 最初の形（land か "kz=..." の文字。無ければ 10m×20m の長方形）
       onChange: function (res, ui) { ... },               // 形・道路・距離が変わるたびに呼ばれる。res は Katachi.analyze の結果＋ res.query
       analyzeOpts: {side: 0.5, roadSide: 0, wall: 0, minWidth: 3.6},
       showSettings: true, showSummary: true, syncHash: false
     });
     ui.get()（land）／ ui.set(land か "kz=...")／ ui.result()／ ui.query()（"kz=...&kzr=..."）／ ui.setOptions({...})
   見た目は 共通/common.css の部品（.seg .formrows .btn .figures .note など）と色の変数を使う。
   足りない見た目は、この中の <style id="katachi-ui-style"> で1回だけ足す。 */
(function (root) {
"use strict";
var K = root.Katachi;
var STYLE = [
  ".kt{margin:8px 0 16px}",
  ".kt .kt-pane[hidden]{display:none}",
  ".kt .kt-fig{margin:12px 0 4px;padding:0}",
  ".kt .kt-svg{display:block;width:100%;height:auto;max-height:70vh;background:var(--sheet);border:1px solid var(--rule);user-select:none;-webkit-user-select:none}",
  ".kt.kt-gridmode .kt-svg{touch-action:none}",
  ".kt .kt-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink-2);margin-top:6px}",
  ".kt .kt-legend i{display:inline-block;width:18px;height:10px;vertical-align:-1px;margin-right:4px;border:1px solid var(--rule-strong)}",
  ".kt .kt-legend i.l-road{border:0;border-bottom:3px solid var(--accent);height:8px}",
  ".kt .kt-legend i.l-sotei{border:1px dashed var(--ink-2)}",
  ".kt .kt-legend i.l-kage{background:var(--caution-weak);border-color:var(--caution-weak)}",
  ".kt .kt-legend i.l-build{background:var(--accent-weak);border-color:var(--accent)}",
  ".kt .kt-legend i.l-sb{border:0;border-bottom:2px dashed var(--alert);height:8px}",
  ".kt-svg .kt-kage{fill:var(--caution-weak);stroke:none}",
  ".kt-svg .kt-sotei{fill:none;stroke:var(--ink-2);stroke-width:1.2;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-land{fill:var(--sheet);stroke:var(--ink);stroke-width:1.6;vector-effect:non-scaling-stroke;stroke-linejoin:round}",
  ".kt-svg .kt-land.bad{stroke:var(--alert)}",
  ".kt-svg .kt-build{fill:var(--accent-weak);stroke:var(--accent);stroke-width:1.2;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-road{stroke:var(--accent);stroke-width:6;stroke-linecap:butt;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-road.front{stroke-width:8}",
  ".kt-svg .kt-sb{stroke:var(--alert);stroke-width:1.5;stroke-dasharray:5 3;fill:none;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-hit{stroke:transparent;stroke-width:22;vector-effect:non-scaling-stroke;cursor:pointer}",
  ".kt-svg .kt-hit:hover{stroke:var(--accent-weak)}",
  ".kt-svg text{font-family:var(--font);fill:var(--ink-2)}",
  ".kt-svg text.kt-rl{fill:var(--accent)}",
  ".kt-svg text.kt-lot{fill:var(--ink);font-weight:600}",
  ".kt-svg .kt-g1{stroke:var(--rule);stroke-width:.6;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-g5{stroke:var(--rule-strong);stroke-width:.6;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-h{fill:var(--sheet);stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke;cursor:grab}",
  ".kt-svg .kt-h.sel{fill:var(--accent)}",
  ".kt-svg .kt-hh{fill:transparent;cursor:grab}",
  ".kt-svg .kt-add{fill:var(--sheet);stroke:var(--muted);stroke-width:1;vector-effect:non-scaling-stroke;cursor:copy}",
  ".kt-svg .kt-addt{fill:var(--muted);pointer-events:none}",
  ".kt-svg .kt-cut{stroke:var(--alert);stroke-width:1.5;stroke-dasharray:6 3;vector-effect:non-scaling-stroke}",
  ".kt-svg .kt-lotline{fill:none;stroke:var(--ink-2);stroke-width:1;vector-effect:non-scaling-stroke}",
  ".kt .kt-svtable{table-layout:fixed;font-size:13px}",
  ".kt .kt-svtable th:nth-child(1),.kt .kt-svtable td:nth-child(1){width:22%}",
  ".kt .kt-svtable th:nth-child(4),.kt .kt-svtable td:nth-child(4){width:44px;text-align:center}",
  ".kt .kt-svtable td{padding:4px 4px 4px 0}",
  ".kt .kt-svtable input{padding:6px;font-size:14px}",
  ".kt .kt-x{font:inherit;font-size:13px;background:none;border:1px solid var(--rule-strong);border-radius:2px;color:var(--ink-2);min-width:32px;min-height:32px;cursor:pointer}",
  ".kt textarea{font-family:ui-monospace,Menlo,monospace;font-size:13px}",
  ".kt .kt-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}",
  ".kt .kt-tools .btn{min-height:36px}",
  ".kt .kt-roads{border-top:1px solid var(--rule-strong);margin-top:8px}",
  ".kt .kt-roadrow{display:grid;grid-template-columns:minmax(6em,1fr) 7.5em auto;gap:4px 12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rule);font-size:14px}",
  ".kt .kt-roadrow .opts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:2px 16px;font-size:13px;color:var(--ink-2)}",
  ".kt .kt-roadrow .opts label{display:inline-flex;gap:6px;align-items:center;min-height:32px;cursor:pointer}",
  ".kt .kt-roadrow .sb{font-size:12px;color:var(--alert)}",
  ".kt .kt-roadrow .opts label[hidden]{display:none}",
  ".kt .kt-msg ul{margin:4px 0;padding-left:1.2em}",
  ".kt .kt-sum{margin-top:12px}",
  "@media (max-width:640px){.kt .kt-roadrow{grid-template-columns:1fr 7em}.kt .kt-roadrow .x{grid-column:1/-1}}"
].join("\n");
function injectStyle() {
  if (typeof document === "undefined" || document.getElementById("katachi-ui-style")) return;
  var s = document.createElement("style"); s.id = "katachi-ui-style"; s.textContent = STYLE; document.head.appendChild(s);
}
var SVGNS = "http://www.w3.org/2000/svg";
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2); }
function areaText(m2) {
  if (root.FUDOSAN && root.FUDOSAN.area) return root.FUDOSAN.area(m2, 2);
  return m2 == null || !isFinite(m2) ? "—" : m2.toFixed(2) + "㎡（" + (m2 / K.TSUBO).toFixed(1) + "坪）";
}
function el(tag, attrs, parent) {
  var e = document.createElementNS(SVGNS, tag);
  for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e); return e;
}
function ptsAttr(pts) { return pts.map(function (p) { return p[0].toFixed(3) + "," + (-p[1]).toFixed(3); }).join(" "); }

// ---------------------------------------------------------------- 描く（ページから直接使ってもよい）
// res：Katachi.analyze の結果。o：{build:'road'|'best'|'longest'|null, sotei, kage, dims, split（Katachi.split の結果）, grid, vb（決めた表示範囲）}
function computeVB(res, o) {
  var pts = res.land.pts.slice(); if (res.sotei) pts = pts.concat(res.sotei.pts);
  var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
  var span = Math.max(x1 - x0, y1 - y0, 4), m = Math.max(span * 0.14, 2.2);
  return {x: x0 - m, y: -(y1 + m), w: (x1 - x0) + 2 * m, h: (y1 - y0) + 2 * m};
}
function draw(svg, res, o) {
  o = o || {};
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!res || !res.land || res.land.pts.length < 2) return null;
  var vb = o.vb || computeVB(res, o);
  svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
  var r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : {width: 0, height: 0};
  var cw = r.width || 600, ch = r.height || cw * vb.h / vb.w;
  var mpp = Math.max(vb.w / cw, vb.h / ch);           // 1px が何m か
  var fs = 12 * mpp, pts = res.land.pts;
  if (o.grid) {
    var g = el("g", {}, svg), gx0 = Math.floor(vb.x), gx1 = Math.ceil(vb.x + vb.w), gy0 = Math.floor(vb.y), gy1 = Math.ceil(vb.y + vb.h);
    var stepG = vb.w / cw * 6 > 1 ? 5 : 1;
    for (var x = gx0; x <= gx1; x++) if (x % stepG === 0) el("line", {x1: x, y1: gy0, x2: x, y2: gy1, "class": x % 5 === 0 ? "kt-g5" : "kt-g1"}, g);
    for (var y = gy0; y <= gy1; y++) if (y % stepG === 0) el("line", {x1: gx0, y1: y, x2: gx1, y2: y, "class": y % 5 === 0 ? "kt-g5" : "kt-g1"}, g);
  }
  if (res.sotei && o.kage !== false) el("polygon", {points: ptsAttr(res.sotei.pts), "class": "kt-kage"}, svg);
  el("polygon", {points: ptsAttr(pts), "class": "kt-land" + (res.ok === false ? " bad" : "")}, svg);
  var B = o.build === null ? null : res.build && res.build[o.build || "road"] || (res.build && res.build.best);
  if (B && !o.split) el("polygon", {points: ptsAttr(B.pts), "class": "kt-build"}, svg);
  if (o.split && o.split.lots) {
    o.split.lots.forEach(function (lot) {
      if (lot.build) el("polygon", {points: ptsAttr(lot.build.pts), "class": "kt-build"}, svg);
      if (lot.pts.length >= 3) el("polygon", {points: ptsAttr(lot.pts), "class": "kt-lotline"}, svg);
    });
    o.split.cuts.forEach(function (c) { el("line", {x1: c[0][0], y1: -c[0][1], x2: c[1][0], y2: -c[1][1], "class": "kt-cut"}, svg); });
    o.split.lots.forEach(function (lot) {
      if (lot.pts.length < 3) return;
      var cx = 0, cy = 0, src = lot.build ? lot.build.pts : lot.pts; src.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= src.length; cy /= src.length;
      var t = el("text", {x: cx, y: -cy, "font-size": fs * 1.25, "text-anchor": "middle", "class": "kt-lot"}, svg); t.textContent = lot.id;
      var t2 = el("text", {x: cx, y: -cy + fs * 1.3, "font-size": fs, "text-anchor": "middle"}, svg); t2.textContent = f2(lot.area) + "㎡";
    });
  }
  if (res.sotei && o.sotei !== false) el("polygon", {points: ptsAttr(res.sotei.pts), "class": "kt-sotei"}, svg);
  // 2項道路の後退線
  if (res.effPts && res.setbackArea > 1e-6) {
    var ep = res.effPts, isR = {}; (res.roads || []).forEach(function (rd) { if (rd.setback > 0) isR[rd.edge] = 1; });
    res.effLab.forEach(function (lb, i) { if (typeof lb === "number" && isR[lb]) { var a = ep[i], b = ep[(i + 1) % ep.length];
      el("line", {x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], "class": "kt-sb"}, svg); } });
  }
  // 道路・寸法
  var fe = res.frontGroup ? res.frontGroup.edges : [];
  (res.edges || []).forEach(function (e) {
    var out = [-e.nv[0], -e.nv[1]], mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
    if (e.road) el("line", {x1: e.a[0], y1: -e.a[1], x2: e.b[0], y2: -e.b[1], "class": "kt-road" + (fe.indexOf(e.i) >= 0 ? " front" : "")}, svg);
    if (o.dims !== false && e.len > 0.05) {
      var d = fs * (e.road ? 1.9 : 0.9), ang = Math.atan2(-(e.b[1] - e.a[1]), e.b[0] - e.a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      var tx = mx + out[0] * d, ty = -(my + out[1] * d);
      var t = el("text", {x: tx, y: ty, "font-size": fs, "text-anchor": "middle", "dominant-baseline": "middle", transform: "rotate(" + ang.toFixed(2) + " " + tx + " " + ty + ")"}, svg);
      t.textContent = f2(e.len) + "m";
      if (e.road) {
        var d2 = fs * 0.75, tx2 = mx + out[0] * d2, ty2 = -(my + out[1] * d2);
        var t2 = el("text", {x: tx2, y: ty2, "font-size": fs * 0.9, "text-anchor": "middle", "dominant-baseline": "middle", "class": "kt-rl",
          transform: "rotate(" + ang.toFixed(2) + " " + tx2 + " " + ty2 + ")"}, svg);
        t2.textContent = "道路 幅" + f2(e.road.w).replace(/\.?0+$/, "") + "m";
      }
    }
  });
  return {vb: vb, mpp: mpp, fs: fs};
}

// ---------------------------------------------------------------- 入力の部品
function mount(host, opts) {
  injectStyle();
  opts = opts || {};
  var AO = Object.assign({side: 0.5, roadSide: 0, wall: 0, minWidth: 3.6}, opts.analyzeOpts || {});
  var uid = "kt" + Math.random().toString(36).slice(2, 7);
  var st = {mode: opts.mode || "shape", raw: null, tplId: "rect", tplP: null, sv: [], svSwap: false, svOrigin: [0, 0], res: null,
    sel: null, drag: null, vbLock: null, snap: 0.1, roadW: 4, lastSig: ""};
  var wrap = document.createElement("div"); wrap.className = "kt"; host.appendChild(wrap);
  var shapeOpts = K.SHAPES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("");
  wrap.innerHTML =
    '<div class="segscroll"><div class="seg kt-modes" role="group" aria-label="形の入れ方">' +
      '<button type="button" data-m="shape">形を選ぶ</button><button type="button" data-m="survey">測量図の座標</button><button type="button" data-m="grid">方眼で描く</button></div></div>' +
    '<div class="kt-pane" data-p="shape"><div class="formrows">' +
      '<div class="fr"><label class="lab" for="' + uid + '-type">形</label><select id="' + uid + '-type" class="kt-type">' + shapeOpts + "</select></div>" +
      '<div class="kt-params"></div></div>' +
      '<p class="muted">寸法は m。道路は図の下の辺です。ほかの辺も道路なら、図の辺をタップして選びます。</p></div>' +
    '<div class="kt-pane" data-p="survey">' +
      '<p class="muted">地積測量図の「座標求積表」の 点名・X・Y を、表の順に入れます。測量の決まりで X は北向き、Y は東向きです（図では上が北）。</p>' +
      '<div class="tablewrap"><table class="kt-svtable"><thead><tr><th>点名</th><th>X（北）m</th><th>Y（東）m</th><th></th></tr></thead><tbody></tbody></table></div>' +
      '<div class="kt-tools"><button type="button" class="btn kt-addrow">点を足す</button>' +
        '<label class="check"><input type="checkbox" class="kt-swap"><span>X と Y が逆の表（X が東）</span></label></div>' +
      '<details class="more"><summary>表をまとめて貼り付ける</summary>' +
        '<p>1行に「点名 X Y」。Excel や PDF からコピーしたもの（タブ・空白・カンマ区切り）をそのまま貼れます。数字が2つ無い行（見出しなど）は飛ばします。</p>' +
        '<textarea rows="6" class="kt-pastebox" placeholder="K1  -12345.678  23456.789&#10;K2  -12357.100  23458.020"></textarea>' +
        '<div class="kt-tools"><button type="button" class="btn kt-paste">貼り付けた表を読む</button></div></details></div>' +
    '<div class="kt-pane" data-p="grid">' +
      '<p class="muted">角の点を指（マウス）で動かします。辺の真ん中の「＋」で角を足し、角をタップして選んでから「選んだ角を消す」で減らせます。</p>' +
      '<div class="kt-tools"><button type="button" class="btn kt-del">選んだ角を消す</button><button type="button" class="btn kt-reset">長方形 10×20 にもどす</button>' +
        '<label class="small">合わせる細かさ <select class="kt-snap" style="width:auto"><option value="0.1">0.1m</option><option value="0.5">0.5m</option><option value="1">1m</option></select></label></div></div>' +
    '<figure class="kt-fig"><svg class="kt-svg" role="img" aria-label="土地の形の図" xmlns="' + SVGNS + '"></svg>' +
      '<figcaption class="kt-legend"><span><i class="l-road"></i>道路（タップで選ぶ）</span><span><i class="l-sotei"></i>想定整形地</span>' +
      '<span><i class="l-kage"></i>かげ地</span><span><i class="l-build"></i>建てられる長方形（目安）</span><span><i class="l-sb"></i>道路の後退線</span></figcaption></figure>' +
    '<div class="kt-roads"></div>' +
    (opts.showSettings === false ? "" :
    '<details class="more kt-settings"><summary>建物を離す距離（建てられる長方形の計算）</summary><div class="formrows">' +
      '<div class="fr"><label class="lab" for="' + uid + '-side">となりの土地から</label><div class="unit-input"><input id="' + uid + '-side" type="number" step="0.1" min="0" class="kt-o" data-k="side"><span>m</span></div>' +
        '<span class="hint">民法234条：建物は境界線から50cm以上はなす（地域の習わしで変わることがあります）</span></div>' +
      '<div class="fr"><label class="lab" for="' + uid + '-road">道路側</label><div class="unit-input"><input id="' + uid + '-road" type="number" step="0.1" min="0" class="kt-o" data-k="roadSide"><span>m</span></div>' +
        '<span class="hint">ふつうは0m。地区計画などで壁の位置の決まりがあれば入れます（2項道路の後退は別に自動で引きます）</span></div>' +
      '<div class="fr"><label class="lab" for="' + uid + '-wall">外壁の後退</label><select id="' + uid + '-wall" class="kt-o" data-k="wall"><option value="0">決まりなし</option><option value="1">1m</option><option value="1.5">1.5m</option></select>' +
        '<span class="hint">建築基準法54条：第一種・第二種低層住居専用地域、田園住居地域で、都市計画で決めている所だけ（道路側にもかかる）。役所で確認</span></div>' +
      '<div class="fr"><label class="lab" for="' + uid + '-minw">家として成り立つ幅</label><div class="unit-input"><input id="' + uid + '-minw" type="number" step="0.1" min="0" class="kt-o" data-k="minWidth"><span>m 以上</span></div>' +
        '<span class="hint">これより細い長方形しか入らないと注意を出します（目安 3.6m＝2間）</span></div>' +
    "</div></details>") +
    '<div class="kt-msg"></div><div class="kt-sum"></div>';
  var $ = function (s) { return wrap.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(wrap.querySelectorAll(s)); };
  var svg = $(".kt-svg");

  // ---------- 生の形（入れた順）と、時計回りにそろえた形の対応
  function rawLand() { return st.raw; }
  function norm() { return K.normalize(st.raw); }
  function rev() { var a = st.raw; return a && a.pts.length >= 3 && K.signedArea(K.cleanPts(a.pts)) > 0; }
  function nEdges() { return K.cleanPts(st.raw.pts).length; }
  function toRawEdge(j) { var n = nEdges(); return rev() ? n - 1 - j : j; }
  function toRawVertex(j) { var n = nEdges(); return rev() ? (n - j) % n : j; }

  // ---------- 計算して描く
  var raf = null;
  function compute(quick) {
    var o = Object.assign({}, AO); if (quick) { o.orient = "road"; o.cells = 36; }
    st.res = K.analyze(st.raw, o);
    st.res.query = K.toQuery(st.raw);
    return st.res;
  }
  function render(quick) {
    var res = compute(quick);
    var d = draw(svg, res, {grid: st.mode === "grid", vb: st.vbLock});
    drawInteractive(d);
    renderRoads(); renderMsg(); renderSummary();
    if (!quick) {
      if (opts.syncHash && typeof history !== "undefined" && history.replaceState) {
        try { history.replaceState(null, "", "#" + mergeQuery(location.hash, res.query)); } catch (e) {}
      }
      if (typeof opts.onChange === "function") {
        // はじめの1回は、mount の戻り値（var ui = ...）が入ってから呼ぶ
        if (st.booting) { st.pending = true; } else opts.onChange(res, api);
      }
    }
  }
  function later(quick) { if (raf) return; var f = function () { raf = null; render(quick); }; raf = (root.requestAnimationFrame || setTimeout)(f); }

  // 辺のタップ（道路の切りかえ）と、方眼モードの角の操作
  function drawInteractive(d) {
    var res = st.res; if (!res || !res.edges || !d) return;
    res.edges.forEach(function (e) {
      var ln = el("line", {x1: e.a[0], y1: -e.a[1], x2: e.b[0], y2: -e.b[1], "class": "kt-hit", "data-e": e.i}, svg);
      var t = el("title", {}, ln); t.textContent = "辺" + (e.i + 1) + "：" + f2(e.len) + "m（タップで道路にする／外す）";
    });
    if (st.mode !== "grid") return;
    var R = 9 * d.mpp;
    res.edges.forEach(function (e) {
      if (e.len < 4 * R) return;
      var mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2;
      el("circle", {cx: mx, cy: -my, r: R * 0.8, "class": "kt-add", "data-add": e.i}, svg);
      var t = el("text", {x: mx, y: -my, "font-size": R * 1.3, "text-anchor": "middle", "dominant-baseline": "central", "class": "kt-addt"}, svg); t.textContent = "+";
    });
    res.land.pts.forEach(function (p, j) {
      el("circle", {cx: p[0], cy: -p[1], r: R, "class": "kt-h" + (st.sel === toRawVertex(j) ? " sel" : "")}, svg);
      el("circle", {cx: p[0], cy: -p[1], r: R * 2, "class": "kt-hh", "data-v": j}, svg);
    });
  }
  function svgPoint(ev) {
    var m = svg.getScreenCTM(); if (!m) return null;
    var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var q = pt.matrixTransform(m.inverse());
    return [q.x, -q.y];
  }
  function snapV(v) { var s = st.snap; return Math.round(v / s) * s; }
  svg.addEventListener("pointerdown", function (ev) {
    var t = ev.target;
    if (st.mode === "grid" && t.getAttribute("data-v") != null) {
      var j = +t.getAttribute("data-v"), rv = toRawVertex(j);
      st.sel = rv; st.drag = {v: rv, moved: false}; st.vbLock = computeVB(st.res);
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault(); render(true); return;
    }
    if (st.mode === "grid" && t.getAttribute("data-add") != null) {
      var ei = toRawEdge(+t.getAttribute("data-add")), P = st.raw.pts, n = P.length, a = P[ei], b = P[(ei + 1) % n];
      var mid = [snapV((a[0] + b[0]) / 2), snapV((a[1] + b[1]) / 2)];
      P.splice(ei + 1, 0, mid);
      st.raw.roads = st.raw.roads.map(function (r) { return r.edge > ei ? Object.assign({}, r, {edge: r.edge + 1}) : r; });
      var was = st.raw.roads.filter(function (r) { return r.edge === ei; })[0];
      if (was) st.raw.roads.push(Object.assign({}, was, {edge: ei + 1}));
      if (st.raw.front != null && st.raw.front > ei) st.raw.front++;
      st.raw.tpl = null; st.sel = ei + 1; st.drag = {v: ei + 1, moved: false}; st.vbLock = computeVB(st.res);
      try { svg.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault(); render(true); return;
    }
  });
  svg.addEventListener("pointermove", function (ev) {
    if (!st.drag) return;
    var p = svgPoint(ev); if (!p) return;
    st.raw.pts[st.drag.v] = [snapV(p[0]), snapV(p[1])]; st.drag.moved = true; st.raw.tpl = null;
    later(true);
  });
  function endDrag() {
    if (!st.drag) return;
    var v = st.drag.v, P = st.raw.pts, n = P.length; st.drag = null; st.vbLock = null;
    // となりの角と同じ場所に重ねたら、その角を消す（角が1つ減る）
    var pv = P[(v - 1 + n) % n], nx = P[(v + 1) % n];
    if (n > 3 && P[v] && ((Math.abs(P[v][0] - pv[0]) < 1e-6 && Math.abs(P[v][1] - pv[1]) < 1e-6) || (Math.abs(P[v][0] - nx[0]) < 1e-6 && Math.abs(P[v][1] - nx[1]) < 1e-6))) {
      st.sel = v; shiftToOrigin(); delVertex(); return;
    }
    shiftToOrigin(); render(false);
  }
  svg.addEventListener("pointerup", endDrag); svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("click", function (ev) {
    var t = ev.target; if (t.getAttribute("data-e") == null) return;
    var re = toRawEdge(+t.getAttribute("data-e")), has = st.raw.roads.filter(function (r) { return r.edge === re; })[0];
    if (has) st.raw.roads = st.raw.roads.filter(function (r) { return r.edge !== re; });
    else st.raw.roads.push({edge: re, w: st.roadW});
    if (st.raw.front === re && has) st.raw.front = null;
    render(false);
  });
  // 動かしたあと、左下が (0,0) 付近になるようにずらす（数字が見やすいように）
  function shiftToOrigin() {
    var P = st.raw.pts; if (!P.length) return;
    var mx = Infinity, my = Infinity; P.forEach(function (p) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); });
    if (Math.abs(mx) < 1e-9 && Math.abs(my) < 1e-9) return;
    st.raw.pts = P.map(function (p) { return [Math.round((p[0] - mx) * 1000) / 1000, Math.round((p[1] - my) * 1000) / 1000]; });
  }

  // ---------- 道路の一覧
  function renderRoads() {
    var res = st.res, box = $(".kt-roads"); if (!res || !res.edges) { box.innerHTML = ""; return; }
    // 面積0の形（点の順番がちがって交差した形など）は道路の一覧を持たないので、止まらずに案内だけ出す
    if (!res.roads || !res.groups) { st.lastSig = null; box.innerHTML = '<p class="note caution">形が正しく作れていません（辺が交差しているかもしれません）。点の順番を確かめてください。</p>'; return; }
    var sig = res.n + "|" + (res.roads || []).map(function (r) { return r.edge; }).join(",") + "|" + (res.frontGroup ? res.frontGroup.edges.join(",") : "") + "|" + (res.groups || []).length;
    if (sig !== st.lastSig) {
      st.lastSig = sig;
      if (!res.roads.length) { box.innerHTML = '<p class="note caution">道路に接する辺を、図の辺をタップして選んでください。</p>'; return; }
      var multi = res.groups.length > 1;
      box.innerHTML = res.roads.map(function (r) {
        var g = -1; res.groups.forEach(function (gg, k) { if (gg.edges.indexOf(r.edge) >= 0) g = k; });
        var isFront = res.frontGroup && res.frontGroup.edges.indexOf(r.edge) >= 0;
        return '<div class="kt-roadrow" data-e="' + r.edge + '"><span>辺' + (r.edge + 1) + '（<span class="len">' + f2(r.len) + "</span>m）が道路" +
          (multi && isFront ? '<span class="tag info" style="margin-left:6px">正面</span>' : "") + '</span>' +
          '<span class="unit-input"><span>幅</span><input type="number" step="0.1" min="0.5" class="kt-rw" value="' + r.w + '" aria-label="辺' + (r.edge + 1) + 'の道路の幅"><span>m</span></span>' +
          '<button type="button" class="kt-x x" aria-label="辺' + (r.edge + 1) + 'を道路から外す">外す</button>' +
          '<div class="opts"><label class="onebox"' + (r.w < 4 ? "" : " hidden") + '><input type="checkbox" class="kt-one"' + (r.one ? " checked" : "") + '>反対側ががけ・川（片側だけ下がる）</label>' +
          (multi ? '<label><input type="radio" name="' + uid + '-front" class="kt-front"' + (isFront ? " checked" : "") + '>この道路を正面にする</label>' : "") +
          '<span class="sb"></span></div></div>';
      }).join("") + (res.groups.length > 1 ? '<p class="muted">正面の道路：国税庁では路線価×奥行の補正がいちばん高い道路。ここでは指定が無ければ、いちばん長く接する道路にしています。</p>' : "");
    }
    res.roads.forEach(function (r) {
      var row = box.querySelector('.kt-roadrow[data-e="' + r.edge + '"]'); if (!row) return;
      var l = row.querySelector(".len"); if (l) l.textContent = f2(r.len);
      var ob = row.querySelector(".onebox"); if (ob) ob.hidden = !(r.w < 4);
      var sb = row.querySelector(".sb"); if (sb) sb.textContent = r.setback > 0 ? "2項道路：境界から " + f2(r.setback) + "m 下がる（建築基準法42条2項）" : "";
    });
  }
  function rawRoadOfRow(row) { var j = +row.getAttribute("data-e"), re = toRawEdge(j); return {re: re, r: st.raw.roads.filter(function (x) { return x.edge === re; })[0]}; }
  wrap.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.classList.contains("kt-rw")) { var o = rawRoadOfRow(t.closest(".kt-roadrow")); var w = K.num(t.value); if (o.r && w > 0) { o.r.w = w; st.roadW = w; later(false); } return; }
    if (t.classList.contains("kt-o")) { var v = K.num(t.value); if (isFinite(v) && v >= 0) { AO[t.getAttribute("data-k")] = v; later(false); } return; }
    if (t.classList.contains("kt-p")) { readParams(); return; }
    if (t.classList.contains("kt-sv")) { readTable(); return; }
  });
  wrap.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.classList.contains("kt-one")) { var o = rawRoadOfRow(t.closest(".kt-roadrow")); if (o.r) { o.r.one = t.checked; render(false); } return; }
    if (t.classList.contains("kt-front")) { var o2 = rawRoadOfRow(t.closest(".kt-roadrow")); st.raw.front = o2.re; st.lastSig = ""; render(false); return; }
    if (t.classList.contains("kt-type")) { st.tplId = t.value; st.tplP = null; buildParams(); readParams(true); return; }
    if (t.classList.contains("kt-swap")) { st.svSwap = t.checked; readTable(); return; }
    if (t.classList.contains("kt-snap")) { st.snap = K.num(t.value) || 0.1; return; }
    if (t.classList.contains("kt-p") && t.tagName === "SELECT") { readParams(); return; }
  });
  wrap.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t.classList.contains("kt-x") && t.closest(".kt-roadrow")) { var o = rawRoadOfRow(t.closest(".kt-roadrow")); st.raw.roads = st.raw.roads.filter(function (r) { return r.edge !== o.re; }); render(false); return; }
    if (t.closest(".kt-modes button")) { setMode(t.closest("button").getAttribute("data-m")); return; }
    if (t.classList.contains("kt-addrow")) { st.sv.push({name: "K" + (st.sv.length + 1), X: "", Y: ""}); buildTable(); return; }
    if (t.classList.contains("kt-x") && t.closest(".kt-svtable")) { var i = +t.closest("tr").getAttribute("data-i"); st.sv.splice(i, 1); buildTable(); readTable(); return; }
    if (t.classList.contains("kt-paste")) { var rows = K.parseSurveyText($(".kt-pastebox").value); if (rows.length >= 3) { st.sv = rows; st.raw.roads = []; buildTable(); readTable(); } else showMsg(["貼り付けた表から、点が3つ以上読めませんでした。1行に「点名 X Y」の形か確かめてください"]); return; }
    if (t.classList.contains("kt-del")) { delVertex(); return; }
    if (t.classList.contains("kt-reset")) { setRaw(K.makeShape("rect", {W: 10, D: 20}, st.roadW)); st.raw.tpl = null; render(false); return; }
  });
  function delVertex() {
    var j = st.sel, P = st.raw.pts, n = P.length;
    if (j == null || j >= n) { showMsg(["先に、消したい角をタップして選んでください"]); return; }
    if (n <= 3) { showMsg(["角は3つより減らせません"]); return; }
    // 角 j を消すと、辺 j−1 と辺 j が1本になる（新しい辺の番号は j−1）
    var prev = (j - 1 + n) % n, wasRoad = st.raw.roads.filter(function (r) { return r.edge === prev || r.edge === j; })[0];
    P.splice(j, 1);
    var roads = [];
    st.raw.roads.forEach(function (r) { if (r.edge === prev || r.edge === j) return; var e = r.edge > j ? r.edge - 1 : r.edge; roads.push(Object.assign({}, r, {edge: e})); });
    var ne = j === 0 ? n - 2 : j - 1;
    if (wasRoad) roads.push(Object.assign({}, wasRoad, {edge: ne}));
    st.raw.roads = roads; st.raw.front = null; st.raw.tpl = null; st.sel = null; render(false);
  }

  // ---------- 形の型
  function buildParams() {
    var d = K.shapeDef(st.tplId) || K.SHAPES[0], p = K.shapeParams(d.id, st.tplP || {});
    $(".kt-type").value = d.id;
    $(".kt-params").innerHTML = d.params.map(function (q) {
      var id = uid + "-p-" + q.k;
      var inp = q.opts ? '<select id="' + id + '" class="kt-p" data-k="' + q.k + '">' + q.opts.map(function (o) { return '<option value="' + o[0] + '"' + (p[q.k] === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"
        : '<div class="unit-input"><input id="' + id + '" type="number" step="0.01" ' + (q.neg ? "" : 'min="0" ') + 'class="kt-p" data-k="' + q.k + '" value="' + p[q.k] + '"><span>m</span></div>';
      return '<div class="fr"><label class="lab" for="' + id + '">' + esc(q.lab) + "</label>" + inp + "</div>";
    }).join("");
  }
  function readParams(reset) {
    var d = K.shapeDef(st.tplId), p = {};
    $$(".kt-p").forEach(function (i) { p[i.getAttribute("data-k")] = i.tagName === "SELECT" ? i.value : K.num(i.value); });
    st.tplP = K.shapeParams(d.id, p);
    var keep = !reset && st.raw && st.raw.tpl && st.raw.tpl.id === d.id ? st.raw.roads.slice() : null;
    var keepFront = keep ? st.raw.front : null;
    var land = K.makeShape(d.id, st.tplP, st.roadW);
    if (keep && keep.length) { var n = land.pts.length; land.roads = keep.filter(function (r) { return r.edge < n; }); land.front = keepFront; }
    setRaw(land); later(false);
  }

  // ---------- 測量図の表
  function buildTable() {
    $(".kt-svtable tbody").innerHTML = st.sv.map(function (r, i) {
      return '<tr data-i="' + i + '"><td><input type="text" class="kt-sv" data-k="name" value="' + esc(r.name) + '" aria-label="点名"></td>' +
        '<td><input type="text" inputmode="text" autocomplete="off" class="kt-sv" data-k="X" value="' + esc(r.X) + '" aria-label="' + esc(r.name) + 'のX"></td>' +
        '<td><input type="text" inputmode="text" autocomplete="off" class="kt-sv" data-k="Y" value="' + esc(r.Y) + '" aria-label="' + esc(r.name) + 'のY"></td>' +
        '<td><button type="button" class="kt-x" aria-label="' + esc(r.name) + 'を消す">×</button></td></tr>';
    }).join("");
    $(".kt-swap").checked = st.svSwap;
  }
  function readTable() {
    $$(".kt-svtable tbody tr").forEach(function (tr) {
      var i = +tr.getAttribute("data-i"); if (!st.sv[i]) return;
      tr.querySelectorAll(".kt-sv").forEach(function (inp) { st.sv[i][inp.getAttribute("data-k")] = inp.value; });
    });
    var rows = st.sv.filter(function (r) { return isFinite(K.num(r.X)) && isFinite(K.num(r.Y)); });
    var s = K.fromSurvey(rows, st.svSwap);
    st.svOrigin = s.origin;
    var n = s.pts.length, roads = (st.raw && st.raw.roads || []).filter(function (r) { return r.edge < n; });
    if (!roads.length && n >= 3) roads = [{edge: 0, w: st.roadW}];
    st.raw = {pts: s.pts, roads: roads, front: st.raw && st.raw.front != null && st.raw.front < n ? st.raw.front : null};
    if (n < 3) { st.res = null; showMsg(["点を3つ以上入れてください"]); while (svg.firstChild) svg.removeChild(svg.firstChild); return; }
    later(false);
  }
  function tableFromRaw() {
    var P = K.cleanPts(st.raw.pts), o = st.svOrigin || [0, 0];
    st.sv = K.toSurvey(P, o).map(function (r) {
      var X = st.svSwap ? r.Y : r.X, Y = st.svSwap ? r.X : r.Y;
      return {name: r.name, X: K.fmtN(X), Y: K.fmtN(Y)};
    });
    buildTable();
  }

  // ---------- 切りかえ
  function setMode(m) {
    if (["shape", "survey", "grid"].indexOf(m) < 0) m = "shape";
    var prev = st.mode; st.mode = m;
    $$(".kt-modes button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-m") === m); b.setAttribute("aria-pressed", b.getAttribute("data-m") === m ? "true" : "false"); });
    $$(".kt-pane").forEach(function (p) { p.hidden = p.getAttribute("data-p") !== m; });
    wrap.classList.toggle("kt-gridmode", m === "grid");
    if (m === "survey" && prev !== "survey") tableFromRaw();
    if (m === "shape" && prev !== "shape") { buildParams(); if (!(st.raw && st.raw.tpl)) { readParams(true); return; } }
    if (m === "grid") { st.raw.tpl = st.raw.tpl || null; }
    render(false);
  }
  function setRaw(land) {
    var L = K.normalize(land || {});
    st.raw = {pts: L.pts.map(function (p) { return p.slice(); }), roads: L.roads.map(function (r) { return Object.assign({}, r); }), front: L.front != null ? L.front : null, tpl: L.tpl || null};
    if (L.roads.length) st.roadW = L.roads[0].w;
    if (L.tpl) { st.tplId = L.tpl.id; st.tplP = L.tpl.p; }
  }

  // ---------- 注意・まとめ
  function showMsg(list, kind) {
    var b = $(".kt-msg"); if (!list || !list.length) { b.innerHTML = ""; return; }
    b.innerHTML = '<div class="note ' + (kind || "alert") + '"><ul>' + list.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>";
  }
  function renderMsg() {
    var r = st.res; if (!r) return;
    var b = $(".kt-msg"), html = "";
    if (r.errors.length) html += '<div class="note alert"><ul>' + r.errors.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>";
    if (r.warnings.length) html += '<div class="note caution"><ul>' + r.warnings.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>";
    b.innerHTML = html;
  }
  function renderSummary() {
    var box = $(".kt-sum"), r = st.res;
    if (opts.showSummary === false || !r || !r.ok) { box.innerHTML = ""; return; }
    var B = r.build.road || r.build.best;
    box.innerHTML = '<div class="figures">' +
      '<div class="figure main"><div class="k">土地の面積</div><div class="v">' + f2(r.area) + '<small>㎡</small></div><div class="s">' + (r.area / K.TSUBO).toFixed(2) + "坪" +
        (r.setbackArea > 1e-6 ? "・後退後 " + f2(r.effArea) + "㎡" : "") + "</div></div>" +
      '<div class="figure"><div class="k">間口・奥行（国税庁の求め方）</div><div class="v">' + f2(r.frontage) + "<small>m</small> × " + f2(r.depth) + '<small>m</small></div><div class="s">奥行＝面積÷間口（想定整形地の奥行まで）</div></div>' +
      '<div class="figure"><div class="k">かげ地割合</div><div class="v">' + r.kagePct.toFixed(1) + '<small>%</small></div><div class="s">想定整形地 ' + f2(r.sotei.W) + "×" + f2(r.sotei.D) + "m＝" + f2(r.sotei.area) + "㎡</div></div>" +
      '<div class="figure"><div class="k">建てられる長方形（目安）</div><div class="v">' + (B ? f2(B.w) + "<small>m</small> × " + f2(B.d) + "<small>m</small>" : "—") + '</div><div class="s">' + (B ? areaText(B.area) : "入りません") + "</div></div>" +
      "</div>";
  }

  // ---------- 外から使う
  function setOptions(o) {
    Object.assign(AO, o || {});
    $$(".kt-o").forEach(function (i) { var k = i.getAttribute("data-k"); if (AO[k] != null) i.value = String(AO[k]); });
    render(false);
  }
  var api = {
    el: wrap,
    get: function () { return K.normalize(st.raw); },
    set: function (v, mode) {
      var land = typeof v === "string" ? K.fromQuery(v) : v;
      if (!land || !land.pts || land.pts.length < 3) return false;
      setRaw(land); st.svOrigin = [0, 0];
      var m = mode || (land.tpl ? "shape" : "survey");
      st.mode = null; if (m === "shape") buildParams();
      setMode(m); return true;
    },
    result: function () { return st.res; },
    query: function () { return K.toQuery(st.raw); },
    setOptions: setOptions,
    redraw: function () { render(false); },
    mode: function () { return st.mode; }
  };

  // ---------- はじめ
  $$(".kt-o").forEach(function (i) { var k = i.getAttribute("data-k"); i.value = String(AO[k]); });
  var first = typeof opts.value === "string" ? K.fromQuery(opts.value) : opts.value;
  if (!first || !first.pts || first.pts.length < 3) first = K.makeShape("rect", {W: 10, D: 20}, opts.roadW || 4);
  setRaw(first);
  st.mode = null; st.booting = true;
  buildParams();
  setMode(opts.mode || (first.tpl ? "shape" : "survey"));
  st.booting = false;
  if (st.pending && typeof opts.onChange === "function") {
    var fire = function () { if (st.pending) { st.pending = false; opts.onChange(st.res, api); } };
    if (typeof Promise !== "undefined") Promise.resolve().then(fire); else setTimeout(fire, 0);
  }
  if (typeof ResizeObserver !== "undefined") { var lastW = 0; new ResizeObserver(function () { var w = svg.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; if (st.res && !st.drag) { var d = draw(svg, st.res, {grid: st.mode === "grid"}); drawInteractive(d); } } }).observe(svg); }
  return api;
}

// ほかの ? や # の値を残したまま、kz・kzr・kzf・kzt だけ入れかえる
function mergeQuery(existing, kzQuery) {
  var keep = String(existing || "").replace(/^[?#]/, "").split("&").filter(function (p) { return p && !/^kz[rft]?=/i.test(p); });
  return keep.concat(kzQuery ? [kzQuery] : []).join("&");
}
// ページの # → ? の順に kz を探して読む
function readLocation() {
  if (typeof location === "undefined") return null;
  return K.fromQuery(location.hash) || K.fromQuery(location.search);
}

root.KatachiUI = {mount: mount, draw: draw, computeVB: computeVB, injectStyle: injectStyle, mergeQuery: mergeQuery, readLocation: readLocation, areaText: areaText};
})(typeof window !== "undefined" ? window : this);
