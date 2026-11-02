// 土地活用（宅地の分割・アパートの計画・駐車場が要る地域か）の計算の部分。
// 画面（tochi.html）とテスト（tochi_test.js）の両方から読む。画面の部品には触らない。
// 根拠の条文・数字は 調べもの_土地活用.md に書いた。数字はどれも「目安」。
(function (root) {
"use strict";
var TSUBO = 3.30578;

// ---------- 用途地域（kenchiku.html の ZONES と同じ数字を写した：建築基準法 52・53・55条） ----------
var ZONES = [
  {id:'1low', name:'第一種低層住居専用地域', short:'1低層', res:true, coef:0.4, abs:true,  bcr:[30,40,50,60], far:[50,60,80,100,150,200], def:[50,100]},
  {id:'2low', name:'第二種低層住居専用地域', short:'2低層', res:true, coef:0.4, abs:true,  bcr:[30,40,50,60], far:[50,60,80,100,150,200], def:[60,150]},
  {id:'1mid', name:'第一種中高層住居専用地域', short:'1中高', res:true, coef:0.4, abs:false, bcr:[30,40,50,60], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'2mid', name:'第二種中高層住居専用地域', short:'2中高', res:true, coef:0.4, abs:false, bcr:[30,40,50,60], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'1jyu', name:'第一種住居地域', short:'1住居', res:true, coef:0.4, abs:false, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'2jyu', name:'第二種住居地域', short:'2住居', res:true, coef:0.4, abs:false, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'jjyu', name:'準住居地域', short:'準住居', res:true, coef:0.4, abs:false, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'den',  name:'田園住居地域', short:'田園', res:true, coef:0.4, abs:true, bcr:[30,40,50,60], far:[50,60,80,100,150,200], def:[50,100]},
  {id:'kin',  name:'近隣商業地域', short:'近商', res:false, com:true, coef:0.6, abs:false, bcr:[60,80], far:[100,150,200,300,400,500], def:[80,300]},
  {id:'sho',  name:'商業地域', short:'商業', res:false, com:true, coef:0.6, abs:false, bcr:[80], far:[200,300,400,500,600,700,800,900,1000,1100,1200,1300], def:[80,600]},
  {id:'jko',  name:'準工業地域', short:'準工', res:false, coef:0.6, abs:false, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'ko',   name:'工業地域', short:'工業', res:false, coef:0.6, abs:false, bcr:[50,60], far:[100,150,200,300,400], def:[60,200]},
  {id:'kos',  name:'工業専用地域', short:'工専', res:false, coef:0.6, abs:false, bcr:[30,40,50,60], far:[100,150,200,300,400], def:[60,200]}
];
function zoneById(id) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i]; return ZONES[0]; }

// 建ぺい率（第53条。角地・防火の +10%、防火地域の耐火で80% → 制限なし）
function coverage(p) {
  var base = p.bcr, add = 0, notes = [];
  if (p.fire === 'bou' && p.fireBldg === 'taika' && base === 80) return {pct:100, notes:['防火地域・建ぺい率80%で耐火建築物等なので制限なし（第53条6項）']};
  if (p.fire === 'bou' && p.fireBldg === 'taika') { add += 10; notes.push('防火地域の耐火建築物等 +10%'); }
  if (p.fire === 'jun' && (p.fireBldg === 'taika' || p.fireBldg === 'juntaika')) { add += 10; notes.push('準防火地域の耐火・準耐火建築物等 +10%'); }
  if (p.corner) { add += 10; notes.push('角地 +10%'); }
  return {pct: Math.min(100, base + add), notes: notes};
}
// 容積率（第52条1項・2項）。道路の幅は 4m 未満でも 4m とみなす（2項道路は後退したあとで考える）
function farEff(far, roadW, zoneId, coef) {
  var z = zoneById(zoneId), k = coef || z.coef;
  var W = Math.max(roadW || 0, 4);
  var roadPct = W < 12 ? Math.round(W * k * 1000) / 10 : Infinity;
  return {pct: Math.min(far, roadPct), roadPct: roadPct, reduced: roadPct < far};
}
// 2項道路（幅4m未満）：道路の中心から2m下がる（第42条2項）。反対側が川などのときは別（役所で確認）
function setback(w) { return (w > 0 && w < 4) ? (4 - w) / 2 : 0; }
function r2(x) { return Math.round(x * 100) / 100; }

// ---------- 路地状部分（旗竿の竿）に要る幅 ----------
// mode: 'law'＝建築基準法 第43条の2mだけ／'tokyo'＝東京都建築安全条例 第3条／'saitama'＝埼玉県条例 第3条／'yokohama'＝横浜市建築基準条例 第4条
// big: 耐火・準耐火でない建物で延べ面積200㎡超（東京都・埼玉県は幅が広くなる）
function rojiWidth(len, mode, big, base) {
  base = base || 2;
  var w = 2;
  if (mode === 'tokyo') { w = len <= 20 ? 2 : 3; if (big) w += 1; }
  else if (mode === 'saitama') {
    w = len < 10 ? 2 : len < 15 ? 2.5 : len < 20 ? 3 : 4;
    if (big && w < 4) w = (w === 2 ? 3 : w === 2.5 ? 3.5 : 4);
  }
  else if (mode === 'yokohama') { w = len <= 15 ? 2 : len <= 25 ? 3 : 4; }
  return Math.max(w, base);
}
var ROJI_LABEL = {law:'建築基準法の2mだけ', tokyo:'東京都建築安全条例 第3条', saitama:'埼玉県建築基準法施行条例 第3条', yokohama:'横浜市建築基準条例 第4条'};

// ---------- 敷地 ----------
// s = {shape:'rect'|'flag', F:間口, D:奥行, poleW, poleL（旗竿のとき：竿の幅・長さ。F・D は奥の四角の幅・奥行）,
//      roads:{front:{on:true,w}, back:{on,w}, left:{on,w}, right:{on,w}}}
function siteGeom(s) {
  var R = s.roads || {}, g = {sb:{front:0, back:0, left:0, right:0}};
  if (s.shape === 'poly') {   // いびつな形：共通/katachi.js の analyze の結果から（polySite で作った s）
    g.rawArea = s.rawArea; g.area = s.effArea; g.sbArea = Math.max(0, s.rawArea - s.effArea);
    g.F = s.F; g.D = s.D; g.poleL = s.isFlag ? s.poleL : 0;
    g.frontage = s.frontage; g.roadWmax = s.roadWmax;
    return g;
  }
  ['front','back','left','right'].forEach(function (k) { if (R[k] && R[k].on) g.sb[k] = setback(R[k].w); });
  if (s.shape === 'flag') {
    g.rawArea = s.poleW * s.poleL + s.F * s.D;
    var pl = Math.max(0, s.poleL - g.sb.front);
    g.poleL = pl; g.F = s.F; g.D = s.D;
    g.area = s.poleW * pl + s.F * s.D;
    g.sbArea = g.rawArea - g.area;
    g.frontage = s.poleW;
    g.roadWmax = R.front ? R.front.w : 4;
    return g;
  }
  g.rawArea = s.F * s.D;
  g.F = Math.max(0, s.F - g.sb.left - g.sb.right);
  g.D = Math.max(0, s.D - g.sb.front - g.sb.back);
  g.area = g.F * g.D;
  g.sbArea = g.rawArea - g.area;
  var fr = [g.F], ws = [R.front ? R.front.w : 4];
  if (R.back && R.back.on) { fr.push(g.F); ws.push(R.back.w); }
  if (R.left && R.left.on) { fr.push(g.D); ws.push(R.left.w); }
  if (R.right && R.right.on) { fr.push(g.D); ws.push(R.right.w); }
  g.frontage = Math.max.apply(null, fr);
  g.roadWmax = Math.max.apply(null, ws);
  return g;
}

// ---------- 区画1つの評価 ----------
function lotEval(lot, o) {
  lot.area = r2(lot.area);
  lot.okMin = !(o.minLot > 0) || lot.area >= o.minLot - 1e-6;
  lot.okFront = lot.frontage >= lot.reqFront - 1e-6;
  var cov = coverage({bcr:o.bcr, fire:o.fire, fireBldg:o.fireBldg, corner:false});
  var fe = farEff(o.far, lot.roadW, o.zone, o.coef);
  lot.covPct = cov.pct; lot.farPct = fe.pct;
  lot.bldg = lot.area * cov.pct / 100;
  lot.floor = lot.area * fe.pct / 100;
  return lot;
}
function summarize(plan, o) {
  var mins = plan.lots.map(function (l) { return l.area; });
  plan.count = plan.lots.length;
  plan.minArea = mins.length ? Math.min.apply(null, mins) : 0;
  plan.sumArea = mins.reduce(function (a, b) { return a + b; }, 0);
  plan.ok = plan.count > 0 && plan.lots.every(function (l) { return l.okMin && l.okFront; });
  return plan;
}

// 案0：分けない
function planNone(s, o) {
  var g = siteGeom(s), R = s.roads;
  var lot = s.shape === 'flag'
    ? {id:'A', kind:'flag', area:g.area, frontage:s.poleW, reqFront:rojiWidth(g.poleL, o.rojiMode, o.big, o.req), poleLen:g.poleL, poleW:s.poleW,
       bodyW:s.F, bodyD:s.D, roadW:R.front.w, parts:[{x:(s.F - s.poleW), y:0, w:s.poleW, h:g.poleL}, {x:0, y:g.poleL, w:s.F, h:s.D}]}
    : {id:'A', kind:'rect', area:g.area, frontage:g.frontage, reqFront:o.req, roadW:g.roadWmax, bodyW:g.F, bodyD:g.D, parts:[{x:0, y:0, w:g.F, h:g.D}]};
  lotEval(lot, o);
  return summarize({key:'none', name:'分けない（1区画のまま）', lots:[lot], roadArea:0, geom:g, W:s.shape === 'flag' ? s.F : g.F, H:s.shape === 'flag' ? g.poleL + s.D : g.D, flagSite:s.shape === 'flag'}, o);
}

// 案1：道路に沿って、間口で割る（front＝表の道路に沿って横に並べる／side＝横の道路に沿って縦に並べる）
function planStrip(s, o, side) {
  var g = siteGeom(s), R = s.roads, best = null;
  var len = side === 'front' ? g.F : g.D, dep = side === 'front' ? g.D : g.F;
  var rw = side === 'front' ? R.front.w : Math.max(R.left && R.left.on ? R.left.w : 0, R.right && R.right.on ? R.right.w : 0);
  var need = Math.max(o.req, o.minW);
  for (var n = 1; n <= 60; n++) {
    var w = len / n;
    if (w < need - 1e-9) break;
    if (o.minLot > 0 && w * dep < o.minLot - 1e-6) break;
    if (dep < o.minW - 1e-9) break;
    best = n;
  }
  if (!best || best < 2) return null;
  var lots = [];
  for (var i = 0; i < best; i++) {
    var w2 = len / best;
    var part = side === 'front' ? {x:i * w2, y:0, w:w2, h:dep} : {x:0, y:i * w2, w:dep, h:w2};
    var lw = rw;
    if (side === 'front') {
      if (i === 0 && R.left && R.left.on) lw = Math.max(lw, R.left.w);
      if (i === best - 1 && R.right && R.right.on) lw = Math.max(lw, R.right.w);
      if (R.back && R.back.on) lw = Math.max(lw, R.back.w);
    } else if (i === 0) lw = Math.max(lw, R.front.w);
    lots.push(lotEval({id:String.fromCharCode(65 + i), kind:'rect', area:w2 * dep, frontage:w2, reqFront:o.req, roadW:lw,
      bodyW:side === 'front' ? w2 : dep, bodyD:side === 'front' ? dep : w2, parts:[part]}, o));
  }
  return summarize({key:'strip-' + side, name: side === 'front' ? '表の道路に沿って、間口で割る' : '横の道路に沿って、奥行で割る',
    lots:lots, roadArea:0, geom:g, W:g.F, H:g.D}, o);
}

// 案1b：表と裏の両方に道路があるとき、前後2列に分ける
function planTwoRows(s, o) {
  var g = siteGeom(s), R = s.roads;
  if (!(R.back && R.back.on)) return null;
  var dep = g.D / 2, need = Math.max(o.req, o.minW), best = null;
  if (dep < o.minW) return null;
  for (var n = 1; n <= 60; n++) {
    var w = g.F / n;
    if (w < need - 1e-9) break;
    if (o.minLot > 0 && w * dep < o.minLot - 1e-6) break;
    best = n;
  }
  if (!best) return null;
  var lots = [], c = 0;
  for (var r = 0; r < 2; r++) for (var i = 0; i < best; i++) {
    var w2 = g.F / best;
    lots.push(lotEval({id:String.fromCharCode(65 + c++), kind:'rect', area:w2 * dep, frontage:w2, reqFront:o.req,
      roadW: r === 0 ? R.front.w : R.back.w, bodyW:w2, bodyD:dep, parts:[{x:i * w2, y:r * dep, w:w2, h:dep}]}, o));
  }
  return summarize({key:'tworows', name:'表と裏の道路で、前後2列に分ける', lots:lots, roadArea:0, geom:g, W:g.F, H:g.D}, o);
}

// 案2：旗竿（路地状の敷地）をつくる。m＝奥の旗竿の区画の数（1か2）、nf＝道路側の区画の数
function flagLayout(g, s, o, m, nf, Db) {
  var F = g.F, D = g.D, Df = D - Db;
  var p = rojiWidth(Df, o.rojiMode, o.big, o.req);
  var fw = (F - m * p) / nf;
  if (fw < o.minW - 1e-9 || Df < o.minW - 1e-9 || Db < o.minW - 1e-9 || F / m < o.minW - 1e-9) return null;
  var lots = [], c = 0, x0 = m === 2 ? p : 0;
  for (var i = 0; i < nf; i++) {
    lots.push({id:String.fromCharCode(65 + c++), kind:'rect', area:fw * Df, frontage:fw, reqFront:o.req, roadW:s.roads.front.w,
      bodyW:fw, bodyD:Df, parts:[{x:x0 + i * fw, y:0, w:fw, h:Df}]});
  }
  for (var j = 0; j < m; j++) {
    var bw = F / m, px = (m === 1 || j === 1) ? F - p : 0;
    lots.push({id:String.fromCharCode(65 + c++), kind:'flag', area:p * Df + bw * Db, frontage:p, reqFront:p, poleLen:Df, poleW:p,
      roadW:s.roads.front.w, bodyW:bw, bodyD:Db, parts:[{x:px, y:0, w:p, h:Df}, {x:j * bw, y:Df, w:bw, h:Db}]});
  }
  var minA = Math.min.apply(null, lots.map(function (l) { return l.area; }));
  if (o.minLot > 0 && minA < o.minLot - 1e-6) return null;
  // 建物を置ける広さ（旗竿は竿を除いた奥の四角）のいちばん小さいもの。区画数が同じなら、これが大きい案を選ぶ
  var minUse = Math.min.apply(null, lots.map(function (l) { return l.kind === 'flag' ? l.bodyW * l.bodyD : l.area; }));
  return {lots:lots, minA:minA, minUse:minUse, p:p, Df:Df, Db:Db};
}
function planFlag(s, o) {
  var g = siteGeom(s); if (s.shape === 'flag') return null;
  var best = null;
  [1, 2].forEach(function (m) {
    for (var nf = 1; nf <= 12; nf++) {
      for (var Db = o.minW; Db <= g.D - o.minW + 1e-9; Db += 0.05) {
        var L = flagLayout(g, s, o, m, nf, Db);
        if (!L) continue;
        var cnt = m + nf;
        if (!best || cnt > best.cnt || (cnt === best.cnt && L.minUse > best.L.minUse + 1e-9)) best = {cnt:cnt, L:L, m:m, nf:nf};
      }
    }
  });
  if (!best) return null;
  best.L.lots.forEach(function (l) { lotEval(l, o); });
  var pl = summarize({key:'flag', name:'旗竿（路地状の敷地）をつくって、奥も使う', lots:best.L.lots, roadArea:0, geom:g, W:g.F, H:g.D,
    info:{poleW:best.L.p, poleLen:r2(best.L.Df), backDepth:r2(best.L.Db), m:best.m, nf:best.nf}}, o);
  return pl;
}

// 案3：道路を新しくつくる（位置指定道路：建築基準法 第42条1項5号、施行令 第144条の4）
// layout: 'center'＝真ん中に道路（両側に区画）、'side'＝片側に道路（片側に区画）
var TURN_M2 = 15;     // 転回広場1か所の面積の目安（形は役所の基準による。この道具で決めた目安）
var CUT_M2 = 2;       // 隅切り1か所：辺2mの二等辺三角形＝2㎡（施行令 第144条の4 1項2号）
function roadLayout(g, s, o, layout, Lr, k, endN) {
  var F = g.F, D = g.D, Wr = o.newRoadW, R = s.roads;
  var through = Lr >= D - 1e-9 && R.back && R.back.on;   // 裏の道路まで抜ける
  var sides = layout === 'center' ? 2 : 1;
  var a = (F - Wr) / sides;
  if (a < o.minW - 1e-9) return null;
  var e = D - Lr;
  if (e > 1e-9 && e < o.minW - 1e-9) return null;
  if (e < 1e-9) endN = 0;
  if (e > 1e-9 && endN === 0) return null;
  if (endN === 2 && (layout !== 'center' || Wr / 2 < o.req - 1e-9 || F / 2 < o.minW)) return null;
  var seg = Lr / k;
  if (seg < Math.max(o.minW, o.req) - 1e-9) return null;
  var dead = !through;
  var turns = (dead && Lr > 35 && Wr < 6) ? Math.ceil(Lr / 35) : 0;
  var cuts = sides === 2 ? 2 : 1; if (through) cuts *= 2;
  var lots = [], c = 0;
  var turnEach = turns * TURN_M2 / (k * sides);
  for (var sd = 0; sd < sides; sd++) {
    var x = sd === 0 ? 0 : (F + Wr) / 2;
    if (layout === 'side') x = 0;
    for (var i = 0; i < k; i++) {
      var area = a * seg - turnEach;
      var rw = Wr;
      if (i === 0) { area -= CUT_M2; rw = Math.max(rw, R.front.w); }
      if (through && i === k - 1) { area -= CUT_M2; rw = Math.max(rw, R.back.w); }
      if (sd === 0 && R.left && R.left.on && layout !== 'side') rw = Math.max(rw, R.left.w);
      lots.push({id:String.fromCharCode(65 + c++), kind:'rect', area:area, frontage:seg, reqFront:o.req, roadW:rw, bodyW:a, bodyD:seg,
        parts:[{x:x, y:i * seg, w:a, h:seg}], cut: (i === 0)});
    }
  }
  for (var j = 0; j < endN; j++) {
    var ew = F / endN;
    lots.push({id:String.fromCharCode(65 + c++), kind:'rect', area:ew * e, frontage: endN === 1 ? Wr : Wr / 2, reqFront:o.req, roadW:Wr,
      bodyW:ew, bodyD:e, parts:[{x:j * ew, y:Lr, w:ew, h:e}]});
  }
  var minA = Math.min.apply(null, lots.map(function (l) { return l.area; }));
  if (o.minLot > 0 && minA < o.minLot - 1e-6) return null;
  var roadArea = Wr * Lr + cuts * CUT_M2 + turns * TURN_M2;
  return {lots:lots, minA:minA, Lr:Lr, k:k, endN:endN, turns:turns, cuts:cuts, roadArea:roadArea, through:through, layout:layout, x:(layout === 'center' ? (F - Wr) / 2 : F - Wr)};
}
function planRoad(s, o) {
  var g = siteGeom(s); if (s.shape === 'flag') return null;
  var best = null;
  ['center', 'side'].forEach(function (layout) {
    for (var Lr = o.minW; Lr <= g.D + 1e-9; Lr += 0.5) {
      var L2 = Math.min(Lr, g.D);
      for (var k = 1; k <= 20; k++) for (var endN = 0; endN <= 2; endN++) {
        var L = roadLayout(g, s, o, layout, L2, k, endN);
        if (!L) continue;
        var cnt = L.lots.length;
        if (!best || cnt > best.cnt || (cnt === best.cnt && L.minA > best.L.minA + 1e-9)) best = {cnt:cnt, L:L};
      }
      if (Lr < g.D && Lr + 0.5 > g.D) Lr = g.D - 0.5;   // 最後に「奥まで」も試す
    }
  });
  if (!best) return null;
  best.L.lots.forEach(function (l) { lotEval(l, o); });
  var L = best.L;
  var pl = summarize({key:'road', name:'道路を新しくつくる（位置指定道路）', lots:L.lots, roadArea:r2(L.roadArea), geom:g, W:g.F, H:g.D,
    info:{roadW:o.newRoadW, roadLen:r2(L.Lr), layout:L.layout, turns:L.turns, cuts:L.cuts, through:L.through, roadX:L.x}}, o);
  return pl;
}

// 全部の案をまとめて出す
function subdivide(s, o) {
  o = Object.assign({req:2, minW:5, minLot:0, rojiMode:'law', big:false, newRoadW:4, devLimit:500}, o);
  var g = siteGeom(s), R = s.roads;
  var plans = [planNone(s, o)];
  if (s.shape !== 'flag') {
    var p1 = planStrip(s, o, 'front'); if (p1) plans.push(p1);
    if ((R.left && R.left.on) || (R.right && R.right.on)) { var p1s = planStrip(s, o, 'side'); if (p1s) plans.push(p1s); }
    var p1b = planTwoRows(s, o); if (p1b) plans.push(p1b);
    var p2 = planFlag(s, o); if (p2) plans.push(p2);
    var p3 = planRoad(s, o); if (p3) plans.push(p3);
  }
  // 開発許可（都市計画法 第29条・施行令 第19条）：道路をつくる＝区画の変更 → 開発行為。広さが基準以上なら許可が要る
  plans.forEach(function (p) {
    p.dev = null;
    if (p.key === 'road') {
      p.dev = g.rawArea >= o.devLimit - 1e-9 ? 'need' : 'small';
    } else if (p.count >= 2 && g.rawArea >= o.devLimit - 1e-9) p.dev = 'maybe';
  });
  var maxN = 0, bestKey = 'none';
  plans.forEach(function (p) { if (p.ok && p.count > maxN) { maxN = p.count; bestKey = p.key; } });
  return {geom:g, plans:plans, best:bestKey, maxCount:maxN, opt:o};
}

// =====================================================================
// いびつな形（共通/katachi.js の Katachi を使う。ブラウザでは window.Katachi、node では require）
// =====================================================================
function KT() { return root.Katachi || (typeof require === 'function' ? require('../共通/katachi.js') : null); }
// 旗竿と読みとった形のうち、竿が旗の幅の半分より広いもの（奥へ広がる台形など）は旗竿として扱わない
function isFlagLot(res) { var f = res && res.flag; return !!(f && f.isFlag && f.poleW > 0 && f.poleW <= f.bodyW * 0.5 + 1e-9); }
// Katachi.analyze の結果 → この道具の「敷地」(siteGeom などに渡す形)
function polySite(res, land) {
  var flag = isFlagLot(res), rw = 0;
  (res.roads || []).forEach(function (r) { rw = Math.max(rw, r.w); });
  var fw = res.frontGroup ? res.frontGroup.w : (rw || 4);
  return {shape:'poly', land:land, res:res, F:res.frontage || 0, D:res.depth || 0, isFlag:flag, poleW:flag ? res.flag.poleW : 0, poleL:flag ? res.flag.poleL : 0,
    rawArea:res.area, effArea:res.effArea, frontage:res.contactMax || 0, roadWmax:rw || 4,
    roads:{front:{on:true, w:fw}, back:{on:false, w:4}, left:{on:false, w:4}, right:{on:false, w:4}}};
}
// いびつな形の分割：Katachi.split で 2〜nMax 区画、向き2つ（道路に沿って横に並べる／前と奥に分ける）を試す
// o：req（接道）・minW（1区画の最小の幅）・minLot（最低敷地）・devLimit・zone・bcr・far・coef・fire・fireBldg
// kopt：建物を離す距離（side・roadSide・wall）と、家として成り立つ幅 minWidth（土地の形の部品の設定）
// 判定：最低敷地／道路に接する長さ／区画の中に「最小の幅×最小の幅」以上の長方形が入る／建てられる長方形の幅が minWidth 以上／1つにまとまっている
function subdividePoly(s, o, kopt) {
  o = Object.assign({req:2, minW:5, minLot:0, devLimit:500}, o); kopt = kopt || {};
  var K = KT(), g = siteGeom(s), res = s.res;
  var out = {geom:g, plans:[], best:null, maxCount:0, nMax:0, opt:o, errors:[]};
  if (!K || !res || !res.ok) { out.errors.push('形が正しくないので分けられません'); return out; }
  if (res.frontEdge == null) { out.errors.push('道路に接する辺が無いので分けられません（形の図で道路の辺を選んでください）'); return out; }
  var limitA = o.minLot > 0 ? o.minLot : 40;          // 最低敷地が無いときは 40㎡ を区画の数の上限の目安にする
  out.nMax = Math.min(10, Math.floor(g.area / limitA + 1e-9));
  var fe = res.edges[res.frontEdge], roadW = {};
  (res.roads || []).forEach(function (r) { roadW[r.edge] = r.w; });
  for (var N = 2; N <= out.nMax; N++) {
    ['along', 'across'].forEach(function (dir) {
      var sp = K.split(s.land, N, {dir:dir, minLot:o.minLot, minFront:o.req, minWidth:kopt.minWidth == null ? 3.6 : kopt.minWidth,
        side:kopt.side, roadSide:kopt.roadSide, wall:kopt.wall});
      var lots = sp.lots.map(function (l) {
        var rw = 0; l.lab.forEach(function (lb) { if (typeof lb === 'number' && roadW[lb] != null) rw = Math.max(rw, roadW[lb]); });
        var whole = l.pts.length >= 3 ? K.maxRect({pts:l.pts, lab:l.lab}, function () { return 0; }, fe.deg, {minWidth:o.minW, cells:36}) : null;
        var lot = {id:l.id, kind:'poly', area:l.area, frontage:l.front, reqFront:o.req, roadW:rw || s.roadWmax, narrowW:l.narrowW, build:l.build, parts:l.parts,
          pts:l.pts, lab:l.lab, whole:whole, noRoad:!(l.front > 1e-6)};
        lotEval(lot, o);
        lot.okW = !!(whole && whole.okWidth);
        lot.okBuild = !!(l.build && l.build.okWidth);
        lot.ok = lot.okMin && lot.okFront && lot.okW && lot.okBuild && l.parts === 1;
        return lot;
      });
      var plan = {key:'poly-' + dir + '-' + N, name:N + '区画（' + (dir === 'along' ? '道路に沿って横に並べる' : '前と奥に分ける') + '）', dir:dir, N:N,
        lots:lots, roadArea:0, geom:g, split:sp, warnings:sp.warnings.concat(sp.errors)};
      summarize(plan, o);
      plan.ok = sp.errors.length === 0 && lots.length === N && lots.every(function (l) { return l.ok; });
      plan.minBuild = lots.reduce(function (m, l) { return Math.min(m, l.build ? l.build.area : 0); }, Infinity);
      plan.noRoadLots = lots.filter(function (l) { return l.noRoad; }).map(function (l) { return l.id; });
      plan.dev = g.rawArea >= o.devLimit - 1e-9 ? 'maybe' : null;
      out.plans.push(plan);
    });
  }
  var best = null;
  out.plans.forEach(function (p) { if (p.ok && (!best || p.N > best.N || (p.N === best.N && p.minBuild > best.minBuild + 1e-6))) best = p; });
  out.best = best ? best.key : null; out.maxCount = best ? best.N : 0;
  return out;
}

// 最低敷地面積の例の表から、用途地域・建ぺい率・容積率に合う行を探す
function minLotLookup(rules, city, zone, bcr, far) {
  if (!rules) return [];
  var rec = null;
  rules.forEach(function (r) { if (r.city === city) rec = r; });
  if (!rec) return [];
  return (rec.rules || []).filter(function (x) {
    if (x.zones && x.zones.indexOf(zone) < 0) return false;
    if (x.bcr != null && x.bcr !== bcr) return false;
    if (x.far && x.far.indexOf(far) < 0) return false;
    if (x.bcr == null && !x.zones) return true;
    return true;
  }).map(function (x) { return {m2:x.m2, cond:x.cond, note:x.note || '', src:rec.src, asof:rec.asof, recNote:rec.note || ''}; });
}

// =====================================================================
// アパート（共同住宅）
// =====================================================================
var UNIT_TYPES = {
  '1R':  {name:'1R（ワンルーム）', area:20, w:3.0},
  '1K':  {name:'1K',  area:25, w:3.4},
  '1LDK':{name:'1LDK', area:40, w:5.0},
  '2LDK':{name:'2LDK', area:55, w:6.2}
};
var FH = {wood:2.9, s:3.0, rc:3.0};
// 東京都建築安全条例 第19条：窓先空地の幅（住戸の床面積の合計で決まる。耐火建築物は区切りが2倍）
function madosakiWidth(total, taika) {
  var k = taika ? 2 : 1;
  if (total <= 100 * k) return 1.5;
  if (total <= 300 * k) return 2;
  if (total <= 500 * k) return 3;
  return 4;
}
// 東京都建築安全条例 第10条の3：共同住宅の床面積の合計に応じて、道路に接する長さ
function tokyoFrontReq(fl) { return fl <= 500 ? 4 : fl <= 1000 ? 6 : fl <= 2000 ? 8 : 10; }
// 神奈川県建築基準条例 第5条／横浜市建築基準条例 第5条／千葉県建築基準法施行条例 第8条
function prefFrontReq(pref, fl) {
  if (fl <= 100) return 2;
  if (pref === 'yokohama') return fl <= 200 ? 4 : fl <= 500 ? 5 : 6;
  if (pref === 'kanagawa' || pref === 'chiba') return fl <= 200 ? 3 : fl <= 500 ? 4 : fl <= 1000 ? 5 : 6;
  return 2;
}

// p: {area（後退後の敷地㎡）, frontage, roadW, zone, bcr, far, coef, corner, fire, fireBldg, struct, floors, fh,
//     unit:{area,w}, fam:{area,w}, famCount, corridorW, stairM2, stairs('auto'|1|2), ev(bool), evM2, entranceM2, taika(bool)}
function apartment(p) {
  var cov = coverage({bcr:p.bcr, fire:p.fire, fireBldg:p.fireBldg, corner:p.corner});
  var fe = farEff(p.far, p.roadW, p.zone, p.coef);
  var B = p.area * cov.pct / 100, V = p.area * fe.pct / 100, Bcov = B, plateByShape = false;
  // いびつな形：1つの階の床は「形の中に入る長方形」の広さまで（建ぺい率の上限と小さい方）
  if (p.plateMax > 0 && p.plateMax < B) { B = p.plateMax; plateByShape = true; }
  var cw = p.corridorW || 1.2;
  var floors = Math.max(1, Math.round(p.floors || 3));
  var fireOK = p.struct !== 'wood' || p.fireBldg === 'taika' || p.fireBldg === 'juntaika';
  function run(stairs) {
    var stairPer = (p.stairM2 || 11) * stairs;
    var evPer = p.ev ? (p.evM2 || 8) : 0;
    var cap = B - stairPer - evPer;                 // 1つの階で、住戸と廊下に使える広さ
    var famLeft = Math.max(0, p.famCount || 0);
    var res = {floorsUnits:[], units:0, small:0, fam:0, senyu:0, corridor:0};
    var su = p.unit, fu = p.fam || p.unit;
    for (var f = 1; f <= floors; f++) {
      var used = (f === 1 ? (p.entranceM2 || 0) : 0), n = 0, nf = 0, ns = 0;
      while (true) {
        var isFam = famLeft > 0;
        var u = isFam ? fu : su;
        var need = u.area + cw * u.w;
        if (used + need > cap + 1e-9) break;
        if (res.senyu + u.area > V + 1e-9) break;
        used += need; res.senyu += u.area; res.corridor += cw * u.w; n++;
        if (isFam) { famLeft--; nf++; } else ns++;
        if (n > 400) break;
      }
      res.floorsUnits.push({floor:f, units:n, fam:nf, small:ns, plate:used + (n ? stairPer + evPer : 0)});
      res.units += n; res.fam += nf; res.small += ns;
      if (n === 0) break;
    }
    var usedFloors = res.floorsUnits.filter(function (x) { return x.units > 0; }).length;
    res.usedFloors = usedFloors;
    res.stairs = stairs;
    res.stairArea = stairPer * usedFloors;
    res.evArea = evPer * usedFloors;
    res.entrance = usedFloors ? (p.entranceM2 || 0) : 0;
    res.common = res.corridor + res.stairArea + res.evArea + res.entrance;
    res.total = res.senyu + res.common;           // 延べ面積（施工する床）
    res.farArea = res.senyu;                      // 容積率に入る床（共用の廊下・階段・EVは入れない：第52条6項）
    res.plateMax = Math.max.apply(null, res.floorsUnits.map(function (x) { return x.plate; }).concat([0]));
    res.upperMax = Math.max.apply(null, res.floorsUnits.filter(function (x) { return x.floor >= 2; }).map(function (x) { return x.units; }).concat([0]));
    res.famShort = Math.max(0, (p.famCount || 0) - res.fam);
    return res;
  }
  var st = p.stairs === 'auto' || p.stairs == null ? 1 : p.stairs;
  var res = run(st);
  // 東京都建築安全条例 第18条：木造など（耐火・準耐火でない）で、2階より上の階の住戸が6戸を超えると直通階段が2つ
  var autoNote = '';
  if ((p.stairs === 'auto' || p.stairs == null) && p.tokyo && !fireOK && res.upperMax > 6) {
    var res2 = run(2);
    res = res2; autoNote = '2階より上の階に住戸が6戸を超えるので、階段を2つにしました（東京都建築安全条例 第18条）';
    if (res2.upperMax <= 6) autoNote = '階段を2つにすると、上の階が6戸以下になりました（1つ階段で6戸以下にする計画もできます）';
  }
  res.autoNote = autoNote;
  res.Bcov = Bcov; res.plateByShape = plateByShape; res.plateMax = p.plateMax || 0;
  res.B = B; res.V = V; res.covPct = cov.pct; res.farPct = fe.pct; res.farReduced = fe.reduced; res.roadPct = fe.roadPct;
  res.farUse = V > 0 ? res.farArea / V : 0;
  res.rentable = res.total > 0 ? res.senyu / res.total : 0;
  res.height = res.usedFloors * (p.fh || FH[p.struct] || 3);
  res.footprint = res.plateMax;
  res.open = Math.max(0, p.area - res.footprint);
  // 建物の長さの目安（住戸の奥行＋廊下 を建物の奥行とみる）
  var depth = p.unit.area / p.unit.w + cw;
  res.bldgDepth = depth;
  res.bldgLen = res.footprint > 0 ? res.footprint / depth : 0;
  res.madosakiW = madosakiWidth(res.senyu, !!p.taika);
  res.tokyoFront = tokyoFrontReq(res.total);
  res.fireOK = fireOK;
  return res;
}

// ワンルーム条例などの例（区ごと）。n＝住戸の総数、small＝小さい住戸の数、floors＝階数、com＝商業系の地域か、total＝延べ面積
// famReq は「ファミリー住戸がいくつ要るか」の目安。くわしい条件は TOCHI_RULES.oneRoom と区の文書で確かめる
var ONE_ROOM = {
  '世田谷区': {minUnit:25, smallBelow:40, famArea:50, applies:function (c) { return c.small >= (c.com ? 15 : 12); },
    famReq:function (c) { return (c.small > 30 && c.total >= 1500) ? Math.ceil((c.small - 30) / 2) : 0; },
    famText:'40㎡未満が30戸を超え、延べ1,500㎡以上なら、30戸を超えた分の1/2以上を50㎡以上に'},
  '新宿区': {minUnit:25, smallBelow:30, famArea:40, applies:function (c) { return c.floors >= 3 && (c.small >= 10 || (c.small >= c.n / 3 && (c.floors > 3 || c.n >= 10))); },
    famReq:function (c) { return c.small > 29 ? Math.ceil((c.small - 29) * (c.zone === '1low' ? 1 / 2 : 1 / 3)) : 0; },
    famText:'（ワンルームの戸数−29）×1/3以上（第一種低層は1/2）を家族向けに'},
  '渋谷区': {minUnit:28, smallBelow:33, famArea:50, applies:function (c) { return c.floors >= 3 && c.small >= 15 && c.small >= c.n / 3; },
    famReq:function (c) { return c.n > 15 ? Math.ceil((c.n - 15) * (c.com ? 1 / 3 : 1 / 2)) : 0; },
    famText:'（総戸数−15）×1/2以上（商業地域は1/3）を50㎡以上に'},
  '中野区': {minUnit:25, smallBelow:40, famArea:40, applies:function (c) { return c.floors >= 3 && c.n >= 12; },
    famReq:function (c) { return c.n > 11 ? Math.ceil((c.n - 11) / 2) : 0; },
    famText:'（総戸数−11）×1/2以上を40㎡以上に'},
  '杉並区': {minUnit:25, smallBelow:40, famArea:40, applies:function (c) { return c.floors >= 3 && (c.n >= 20 || c.small >= 6); },
    famReq:function (c) { return c.small > 20 ? Math.ceil((c.small - 20) / 2) : 0; },
    famText:'ワンルームが20戸を超えたら、超えた分の1/2以上を40㎡以上に'},
  '文京区': {minUnit:25, smallBelow:40, famArea:40, applies:function (c) { return c.small >= 10; },
    famReq:function (c) { return c.n > 15 ? Math.ceil((c.n - 15) / 2) : 0; },
    famText:'（総戸数−15）×1/2以上を40㎡以上に'},
  '江東区': {minUnit:25, smallBelow:40, famArea:40, applies:function (c) { return c.floors >= 3 && c.n >= 15 && c.small > c.n / 2; },
    famReq:function (c) { return c.small >= 20 ? Math.min(29, Math.ceil((c.small - 19) / 3)) : 0; },
    famText:'ワンルームが20戸以上なら（ワンルーム戸数−19）×1/3以上を40㎡以上に（上限29戸）'},
  '豊島区': {minUnit:null, smallBelow:30, famArea:null, applies:function (c) { return c.n >= 15; }, famReq:function () { return 0; },
    famText:'（最低面積・ファミリー住戸は未確認）。30㎡未満の住戸が9戸以上で「狭小住戸集合住宅税」1戸50万円', tax:function (c) { return c.small >= 9 ? c.small * 50 : 0; }},
  '千葉市': {minUnit:20, smallBelow:29.0001, famArea:null, applies:function (c) { return c.small >= 6 && c.small >= c.n / 3; }, famReq:function () { return 0; },
    famText:'（ファミリー住戸の決まりは無し）'}
};

// 条例・要綱で決まっている駐車場・駐輪場の台数の例（なければ null）
function parkingRuleMin(city, pref, c) {
  // c: {n, small, fam, famArea40(40㎡以上の戸数), total（集合住宅の延べ面積）, siteArea, com, ku（23区か）}
  var r = [];
  if (city === '世田谷区' && (c.big40 >= 20 || c.total >= 1500)) r.push({cars:Math.ceil(c.big40 * 3 / 10) + (c.under40 > 0 ? 1 : 0), text:'世田谷区住環境整備条例：40㎡以上の住戸の3/10以上（40㎡未満の住戸があれば＋1台以上）'});
  if (city === '杉並区' && c.floors >= 3 && (c.n >= 20 || c.under40 >= 6)) r.push({cars:Math.ceil(c.big40 * 0.2) + (c.n >= 30 ? 2 : 1), text:'杉並区の指導要綱：ファミリー（40㎡以上）住戸の20%以上＋外来者用（30戸以上2台・未満1台）'});
  if (city === '江東区' && c.n >= 20 && c.under40 * 2 <= c.n) r.push({cars:Math.min(Math.ceil(c.n * (c.n >= 200 ? 0.3 : c.n >= 100 ? 0.2 : 0.1)), Math.floor(c.total / 350) || 1), text:'江東区マンション等の建設に関する条例：ファミリーマンション20〜99戸は戸数の1/10（100戸以上2/10、200戸以上3/10）'});
  if (pref === '東京都' && c.ku && c.total > 2000) r.push({cars:Math.min(Math.ceil(c.n * 0.3), Math.floor(c.total / 350)), text:'東京都集合住宅駐車施設附置要綱：集合住宅の部分が2,000㎡超なら、戸数×30% と 床面積÷350 の小さい方（区部。駐車場整備地区などは東京都駐車場条例）'});
  if (city.indexOf('横浜市') === 0 && c.total > 2000) {
    var cnt = c.n - c.under30 + c.under30 / 3;
    r.push({cars:Math.ceil(cnt * (c.com ? 0.1 : 0.3)), text:'横浜市建築基準条例 第4条の3：住居部分2,000㎡超で住戸数の3/10以上（商業・近隣商業は1/10。30㎡以下の住戸は1/3戸と数える）'});
  }
  if (city.indexOf('さいたま市') === 0 && c.siteArea >= 500) r.push({cars:Math.ceil(c.n * (c.siteArea >= 2000 ? 2 / 3 : 1 / 2)), text:'さいたま市の自動車駐車施設の設置基準：敷地500〜2,000㎡未満は計画戸数の1/2以上、2,000㎡以上は2/3以上（開発行為の手続の条例の対象の建物）'});
  if (city.indexOf('千葉市') === 0) r.push({cars:Math.ceil(c.n * (c.com ? 0.3 : 0.6)), text:'千葉市宅地開発指導要綱：共同住宅は計画戸数の60%以上（商業地域が過半なら30%）。要綱の対象になる開発のとき'});
  return r;
}
function bikeRuleMin(city, c) {
  if (city === '世田谷区') return {bikes:c.n, text:'世田谷区住環境整備条例：戸数以上'};
  if (city === '杉並区') return {bikes:c.under40 + Math.ceil(c.big40 * 1.5), text:'杉並区の指導要綱：ワンルームは戸数以上、ファミリーは戸数×1.5以上'};
  if (city === '江東区') return {bikes:c.under40 + c.big40 * 2, text:'江東区：ファミリー住戸1戸2台＋ワンルーム住戸1戸1台'};
  if (city === '渋谷区') return {bikes:(c.n - c.fam50) + c.fam50 * 2, text:'渋谷区：50㎡以上の住戸は戸数の2倍、その他は戸数以上'};
  if (city === '豊島区') return {bikes:c.n, text:'豊島区：1戸1台が基本（駅から500m以内はワンルームの台数を半分にできる）'};
  if (city.indexOf('さいたま市') === 0) return {bikes:(c.under30 + Math.ceil((c.n - c.under30) * 1.5)), text:'さいたま市の設置基準：ワンルームは1戸1台、それ以外は1戸1.5台'};
  if (city.indexOf('千葉市') === 0) return {bikes:(c.under30 + Math.ceil((c.n - c.under30) * 1.3)), text:'千葉市宅地開発指導要綱：29㎡以下は戸数の100%、それより広い住戸は130%'};
  return {bikes:c.n, text:'条例の例が無い地域：1戸1台を目安にしています（自治体の自転車条例を確認）'};
}

// =====================================================================
// 駐車場が要る地域か（data/parking_1to3ken.js の数字から3段階）
// 主な物差し：通勤・通学で自家用車を使う人の割合（令和2年国勢調査）。15%未満／15〜40%／40%以上
// 補正：1世帯あたりの乗用車（軽を除く）が多いのに通勤の割合が低い所は、1段上げる（会社の車が多い都心は上げない）
// =====================================================================
var PARK_CUT = [15, 40];
function parkingLevel(row) {
  if (!row || row.commuteCarPct == null) return null;
  var c = row.commuteCarPct, lv = c < PARK_CUT[0] ? 1 : c < PARK_CUT[1] ? 2 : 3, why = [];
  why.push('通勤・通学で自家用車を使う人 ' + c.toFixed(1) + '%（' + (lv === 1 ? '15%未満' : lv === 2 ? '15〜40%' : '40%以上') + '）');
  var cp = row.carsPerHH;
  if (lv === 1 && cp != null && cp >= 0.55 && c >= 10) { lv = 2; why.push('ただし1世帯あたりの乗用車が ' + cp.toFixed(2) + '台と多いので、1段上げました'); }
  else if (lv === 2 && cp != null && cp >= 0.7) { lv = 3; why.push('ただし1世帯あたりの乗用車が ' + cp.toFixed(2) + '台と多いので、1段上げました'); }
  return {level:lv, label:['', 'あまり要らない', '場所による', '要る'][lv], why:why};
}
// アパートで用意する台数の目安：戸数 × 1世帯あたりの台数（軽も入れた数があればそれ）× 住戸の広さの係数
// 係数（この道具で決めた目安）：1R・1K＝0.5、1LDK＝0.8、2LDK以上＝1.0（一人暮らしは車を持つ人が少ないため）
var PARK_K = {'1R':0.5, '1K':0.5, '1LDK':0.8, '2LDK':1.0};
function parkingNeed(row, cityRow, counts) {
  var per = row.carsInclKeiPerHH != null ? row.carsInclKeiPerHH : (cityRow && cityRow.carsInclKeiPerHH != null ? cityRow.carsInclKeiPerHH : null);
  var basis = 'kei';
  if (per == null) { per = row.carsPerHH; basis = 'reg'; }
  var cars = 0;
  Object.keys(counts).forEach(function (t) { cars += counts[t] * per * (PARK_K[t] || 1); });
  return {per:per, basis:basis, cars:cars, carsRound:Math.round(cars)};
}

var API = {TSUBO:TSUBO, ZONES:ZONES, zoneById:zoneById, coverage:coverage, farEff:farEff, setback:setback, rojiWidth:rojiWidth, ROJI_LABEL:ROJI_LABEL,
  siteGeom:siteGeom, subdivide:subdivide, planNone:planNone, planStrip:planStrip, planTwoRows:planTwoRows, planFlag:planFlag, planRoad:planRoad,
  minLotLookup:minLotLookup, isFlagLot:isFlagLot, polySite:polySite, subdividePoly:subdividePoly, TURN_M2:TURN_M2, CUT_M2:CUT_M2,
  UNIT_TYPES:UNIT_TYPES, FH:FH, madosakiWidth:madosakiWidth, tokyoFrontReq:tokyoFrontReq, prefFrontReq:prefFrontReq, apartment:apartment,
  ONE_ROOM:ONE_ROOM, parkingRuleMin:parkingRuleMin, bikeRuleMin:bikeRuleMin, PARK_CUT:PARK_CUT, parkingLevel:parkingLevel, PARK_K:PARK_K, parkingNeed:parkingNeed};
if (typeof module !== 'undefined') module.exports = API;
root.TOCHI = API;
})(typeof window !== 'undefined' ? window : this);
