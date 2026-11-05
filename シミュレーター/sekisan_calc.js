/* 積算評価の計算部分（画面と切りはなして、node でもテストできるようにしたもの）。
   画面（sekisan.html）からは window.SEKISAN、node からは require("./sekisan_calc.js")。
   国税庁の表・割引の目安は 共通/hosei_data.js（window.HOSEI）から読む。根拠は 調べもの_積算.md と 共通/調べもの_土地の割引.md。 */
(function (root) {
  "use strict";
  const HOSEI = (typeof module !== "undefined" && module.exports && typeof require === "function")
    ? require(require("path").join(__dirname, "../共通/hosei_data.js")) : root.HOSEI;
  if (!HOSEI) throw new Error("共通/hosei_data.js が読みこめていません（sekisan_calc.js より先に読みこんでください）");
  const T = HOSEI.nta;
  const TSUBO = 3.30578;

  // ---------------------------------------------------------------- 評価の水準（公示価格を1としたとき）
  // 相続税路線価：国税庁「路線価等は…地価公示価格等を基にした価格の80%程度を目途に定めています」
  // 固定資産税評価：固定資産評価基準 第1章第12節 経過措置「地価公示価格等の7割を目途」（平成6年度から）
  const LEVEL = { rosenka: 0.8, kotei: 0.7 };
  // 1㎡あたりの値段を「相続税路線価の水準」にそろえる
  function toRosenka(method, v) {
    if (method === "kotei") return v * LEVEL.rosenka / LEVEL.kotei;   // 固定資産税路線価 × 0.8 ÷ 0.7
    if (method === "koji") return v * LEVEL.rosenka;                  // 公示価格・地価調査価格 × 0.8
    return v;                                                         // 相続税路線価はそのまま
  }
  const trunc2 = x => Math.floor(x * 100 + 1e-9) / 100;   // 小数点以下2位未満を切り捨て（国税庁の補正率の端数の決まり）

  // ---------------------------------------------------------------- 国税庁の表を引く
  const col = d => T.DCOL.indexOf(d) + 1;   // 地区 → 表の列
  function rowFor(table, x) { let row = table[0]; for (const r of table) if (x >= r[0] - 1e-9) row = r; return row; }
  function okuyukiRate(district, depthM) { return depthM > 0 ? rowFor(T.OKUYUKI, depthM)[col(district)] : 1; }
  function sokuhoRate(district, type) { const a = T.SOKUHO[district]; return type === "kado" ? a[0] : type === "junkado" ? a[1] : 0; }
  function nihouRate(district) { return T.NIHOU[district]; }
  function maguchiRate(district, frontM) {
    if (!(frontM > 0)) return 1;
    const v = rowFor(T.MAGUCHI, frontM)[col(district)];
    return v == null ? 1 : v;   // ビル街の8m未満は表に無い
  }
  // 奥行長大：[比の下限, ビル街, 高度商業・繁華街・普通商業, 普通住宅, 中小工場, 大工場]
  const CHODAI_COL = { biru: 1, koudo: 2, hanka: 2, shogyo: 2, futsu: 3, kojo: 4, daikojo: 5 };
  function chodaiRate(district, depthM, frontM) {
    if (!(depthM > 0 && frontM > 0) || depthM / frontM < 2) return 1;
    return rowFor(T.CHODAI, depthM / frontM)[CHODAI_COL[district]];
  }
  // 不整形地補正率表（かげ地割合％・地積区分）。ビル街・大工場は表が無いので 1
  function fuseiTableRate(district, areaM2, kagePct) {
    if (!(kagePct >= 10) || !T.CHISEKI[district]) return 1;
    const [a, b] = T.CHISEKI[district], k = areaM2 < a ? 0 : areaM2 < b ? 1 : 2;
    return rowFor(T.FUSEI, kagePct)[(district === "futsu" ? 4 : 1) + k];
  }
  // かげ地割合（％）＝（想定整形地の面積 − 土地の面積）÷ 想定整形地の面積
  const kageFromSotei = (soteiM2, areaM2) => soteiM2 > 0 && areaM2 > 0 ? Math.max(0, (soteiM2 - areaM2) / soteiM2 * 100) : 0;
  // 規模格差補正率：(地積×B＋C)÷地積×0.8（小数点以下2位未満切り捨て）
  const KIBO_OTHER = [[1000, .90, 100], [3000, .85, 250], [5000, .80, 500]];
  function kiboRate(areaM2, sandai) {
    const tbl = sandai ? T.KIBO_SANDAI : KIBO_OTHER;
    if (!(areaM2 >= tbl[0][0])) return 1;
    const [, B, C] = rowFor(tbl, areaM2);
    return trunc2((areaM2 * B + C) / areaM2 * 0.8);
  }
  const kiboMinArea = sandai => sandai ? 500 : 1000;
  const kiboDistrictOK = d => d === "futsu" || d === "shogyo";
  const GAKE_COL = { "南": 1, "東": 2, "西": 3, "北": 4 };
  function gakeRate(ratio, dir) { return ratio >= 0.1 ? rowFor(T.GAKE, ratio)[GAKE_COL[dir] || 4] : 1; }
  function tokkeiRate(ratio) { return ratio >= 0.1 ? rowFor(T.TOKKEI, ratio)[1] : 1; }

  // ---------------------------------------------------------------- 土地（国税庁の評価明細書の順）
  // p.method：'rosenka' 相続税路線価／'kotei' 固定資産税路線価／'koji' 公示価格・地価調査価格／'bairitsu' 倍率地域
  // 値はすべて円・㎡・m。戻り値の tax＝相続税路線価ベースの評価額（税の評価の水準）、market＝それを時価に戻した目安（÷0.8）
  function land(p) {
    const area = +p.areaM2 || 0, steps = [];
    if (p.method === "bairitsu") {
      const tax = (+p.koteiHyoka || 0) * (+p.bairitsu || 0);
      steps.push({ key: "bairitsu", label: "固定資産税評価額 × 倍率", how: `${yen(p.koteiHyoka)} × ${p.bairitsu}倍`, value: tax });
      return finishLand(p, { area, tax, steps, unit: area ? tax / area : 0, base: null });
    }
    const input = +p.unitInput || 0;
    let R = toRosenka(p.method, input * (p.method === "koji" ? (p.chiikiPct == null ? 100 : +p.chiikiPct) / 100 : 1));
    if (p.method === "kotei") steps.push({ key: "conv", label: "固定資産税路線価を相続税路線価の水準に", how: `${yen(input)} × 0.8 ÷ 0.7`, unit: R });
    else if (p.method === "koji") steps.push({ key: "conv", label: "公示価格・地価調査価格を相続税路線価の水準に",
      how: `${yen(input)}${p.chiikiPct != null && +p.chiikiPct !== 100 ? ` × 地点との差 ${p.chiikiPct}%` : ""} × 0.8`, unit: R });
    else steps.push({ key: "conv", label: "相続税路線価（前面道路）", how: `${yen(input)}`, unit: R });
    // ふつうの積算：面積 × 1㎡あたりの値段（相続税路線価の水準）。形や道路の補正は入れない
    if (p.simple) {
      const tax = R * area;
      steps.push({ key: "area", label: "面積 × 1㎡あたりの値段", how: `${fmtM2(area)} × ${yen(R)}`, value: tax });
      return finishLand({ ...p, riyouTeika: false, shidouM2: 0, right: "own" }, { area, tax, steps, unit: R, base: R });
    }
    const d = p.district || "futsu", conv = v => toRosenka(p.method, (+v || 0) * (p.method === "koji" ? (p.chiikiPct == null ? 100 : +p.chiikiPct) / 100 : 1));
    // 1 一路線：正面路線価 × 奥行価格補正率
    const ok = okuyukiRate(d, +p.depthM);
    let A = R * ok;
    steps.push({ key: "okuyuki", label: "奥行価格補正", how: `× ${ok.toFixed(2)}（奥行 ${p.depthM || "—"}m）`, unit: A });
    // 2 側方路線（角地・準角地）：＋ 側方路線価 × 奥行価格補正率（側方から見た奥行）× 加算率
    if (p.corner === "kado" || p.corner === "junkado") {
      const Rs = conv(p.sideUnit), oks = okuyukiRate(d, +p.sideDepthM || +p.frontM), k = sokuhoRate(d, p.corner);
      const add = Rs * oks * k;
      A += add;
      steps.push({ key: "side", label: p.corner === "kado" ? "角地の加算（側方路線影響加算）" : "準角地の加算",
        how: `＋ ${yen(Rs)} × ${oks.toFixed(2)} × ${k.toFixed(2)}`, unit: A, add });
    }
    // 3 二方路線：＋ 裏面路線価 × 奥行価格補正率 × 加算率
    if (p.rear) {
      const Rr = conv(p.rearUnit), k = nihouRate(d), add = Rr * ok * k;
      A += add;
      steps.push({ key: "rear", label: "二方路の加算（二方路線影響加算）", how: `＋ ${yen(Rr)} × ${ok.toFixed(2)} × ${k.toFixed(2)}`, unit: A, add });
    }
    // 4 形：整形なら 間口狭小 × 奥行長大。不整形なら（不整形地補正率×間口狭小）と（間口狭小×奥行長大）の低い方、最小0.60
    const m = maguchiRate(d, +p.frontM), c = chodaiRate(d, +p.depthM, +p.frontM);
    if (p.shape === "fusei") {
      const f = fuseiTableRate(d, area, +p.kagePct), r1 = trunc2(f * m), r2 = trunc2(m * c), r = Math.max(0.6, Math.min(r1, r2));
      if (r < 1) { A *= r; steps.push({ key: "shape", label: "不整形地補正（旗竿地もここ）",
        how: `× ${r.toFixed(2)}（不整形 ${f.toFixed(2)}×間口狭小 ${m.toFixed(2)}＝${r1.toFixed(2)}、間口狭小×奥行長大＝${r2.toFixed(2)} の低い方・最小0.60）`, unit: A, rate: r }); }
    } else if (m * c < 1) {
      A *= m * c;
      steps.push({ key: "shape", label: "間口狭小・奥行長大補正", how: `× ${m.toFixed(2)} × ${c.toFixed(2)}`, unit: A, rate: m * c });
    }
    // 5 規模格差（地積規模の大きな宅地）
    if (p.kibo) {
      const k = kiboRate(area, p.sandai !== false);
      if (k < 1) { A *= k; steps.push({ key: "kibo", label: "規模格差補正（地積規模の大きな宅地）", how: `× ${k.toFixed(2)}（(地積×B＋C)÷地積×0.8）`, unit: A, rate: k }); }
    }
    // 6 無道路地：通路部分の価額（正面路線価 × 通路の面積）を引く。最大40%
    if (p.mudouro && area > 0) {
      const ded = Math.min(0.4, R * (+p.tsuroM2 || 0) / (A * area));
      A *= 1 - ded;
      steps.push({ key: "mudouro", label: "無道路地（通路をつくる分を引く）", how: `× (1 − ${ded.toFixed(3)})（${yen(R)} × 通路 ${p.tsuroM2 || 0}㎡ ÷ 評価額、最大0.4）`, unit: A, rate: 1 - ded });
    }
    // 7 がけ地・土砂災害特別警戒区域（両方あるときは掛けて最小0.50）
    const g = gakeRate(+p.gakeRatio, p.gakeDir), tk = tokkeiRate(+p.tokkeiRatio);
    if (g < 1 || tk < 1) {
      const r = g < 1 && tk < 1 ? Math.max(0.5, trunc2(g * tk)) : g * tk;
      A *= r;
      steps.push({ key: "gake", label: tk < 1 ? (g < 1 ? "がけ地・特別警戒区域" : "土砂災害特別警戒区域") : "がけ地補正", how: `× ${r.toFixed(2)}`, unit: A, rate: r });
    }
    let tax = A * area;
    steps.push({ key: "area", label: "1㎡あたり × 面積", how: `${yen(A)} × ${fmtM2(area)}`, value: tax });
    // セットバック：その部分は70%を引く
    if (p.setbackM2 > 0) {
      const ded = A * p.setbackM2 * 0.7;
      tax -= ded;
      steps.push({ key: "setback", label: "セットバック（道路にする部分は70%引く）", how: `− ${yen(A)} × ${p.setbackM2}㎡ × 0.7`, value: tax, ded });
    }
    return finishLand(p, { area, tax, steps, unit: A, base: R });
  }
  function finishLand(p, o) {
    let tax = o.tax;
    // 利用価値が著しく低下している宅地：10%減（その部分の割合）
    if (p.riyouTeika) {
      const share = p.riyouShare == null ? 1 : Math.min(1, Math.max(0, +p.riyouShare / 100));
      const ded = tax * share * 0.1;
      tax -= ded;
      o.steps.push({ key: "teika", label: "利用価値が著しく低下（10%減）", how: `− 評価額 × ${Math.round(share * 100)}% × 0.1`, value: tax, ded });
    }
    // 私道の持分（土地とは別の部分）：正面路線価 × 面積 × 0.3（だれでも通る私道は0）
    if (p.shidouM2 > 0 && o.base != null) {
      const k = p.shidouPublic ? 0 : 0.3, add = o.base * p.shidouM2 * k;
      tax += add;
      o.steps.push({ key: "shidou", label: "私道の持分（別の部分）", how: `＋ ${yen(o.base)} × ${p.shidouM2}㎡ × ${k}${p.shidouPublic ? "（通り抜けの私道は0）" : ""}`, value: tax, add });
    }
    // 借地権なら × 借地権割合（税の評価）
    if (p.right === "shakuchi") {
      const r = T.LEASE[p.letter] || 0.6;
      tax *= r;
      o.steps.push({ key: "right", label: "借地権（× 借地権割合）", how: `× ${r.toFixed(2)}（記号${p.letter || "D"}）`, value: tax });
    }
    tax = Math.max(0, Math.round(tax));
    return { ...o, tax, market: Math.round(tax / LEVEL.rosenka) };
  }

  // ---------------------------------------------------------------- 税の評価に入らない事情（目安の掛け目）
  // list：[{id, pct}]（pct＝更地の何%か）。戻り値：掛け目（lo・mid・hi は hosei_data.js の幅、use は画面で入れた値）
  function extras(list) {
    let use = 1, lo = 1, hi = 1;
    const rows = [];
    (list || []).forEach(x => {
      const f = HOSEI.byId(x.id);
      if (!f || f.unit !== "rate") return;
      const u = x.pct != null ? x.pct / 100 : f.mid;
      use *= u; lo *= f.lo; hi *= f.hi;
      rows.push({ id: f.id, name: f.name, use: u, lo: f.lo, hi: f.hi, kind: f.kind });
    });
    return { use, lo, hi, rows };
  }

  // ---------------------------------------------------------------- 建物
  // 法定耐用年数（減価償却資産の耐用年数等に関する省令 別表第一・住宅用）
  const STRUCTS = {
    w: { name: "木造", life: 22 },
    ls3: { name: "軽量鉄骨（骨格材の厚さ3mm以下）", life: 19 },
    ls4: { name: "軽量鉄骨（3mmをこえ4mm以下）", life: 27 },
    s: { name: "重量鉄骨（4mmをこえる）", life: 34 },
    rc: { name: "RC（鉄筋コンクリート）", life: 47 },
    src: { name: "SRC（鉄骨鉄筋コンクリート）", life: 47 },
  };
  // 再調達価格（新しく建てなおすといくらか。1㎡あたり・円）
  // bank：金融機関の積算でよく使われると解説される目安（健美家ほか）。nta：国税庁「地域別・構造別の工事費用表」令和7年分（千円/㎡）
  const UNIT_PRESETS = {
    bank: { w: 150000, ls3: 150000, ls4: 150000, s: 180000, rc: 200000, src: 200000 },
  };
  const NTA_KOJI_R7 = {   // [木造, SRC, RC, 鉄骨] 千円/㎡
    "東京都": [230, 404, 431, 384], "神奈川県": [217, 378, 361, 355], "埼玉県": [217, 334, 354, 314], "千葉県": [217, 335, 359, 321], "全国平均": [217, 334, 338, 314],
  };
  function ntaUnit(pref, struct) {
    const a = NTA_KOJI_R7[pref] || NTA_KOJI_R7["全国平均"];
    const v = struct === "w" ? a[0] : struct === "src" ? a[1] : struct === "rc" ? a[2] : a[3];
    return v * 1000;
  }
  // p：{ struct, unit（円/㎡）, floorM2, age（築年数）, over：'zero'|'residual', residualPct }
  function building(p) {
    const s = STRUCTS[p.struct] || STRUCTS.w, floor = +p.floorM2 || 0, age = Math.max(0, +p.age || 0);
    const full = (+p.unit || 0) * floor;   // 再調達価格（全体）
    const remain = Math.max(0, s.life - age);
    let ratio = remain / s.life;
    if (p.over === "residual") ratio = Math.max(ratio, (+p.residualPct || 0) / 100);
    return { name: s.name, life: s.life, age, remain, ratio, full, value: Math.round(full * ratio), expired: remain <= 0 };
  }

  // ---------------------------------------------------------------- 合計と、売り出し価格とのくらべ
  function total(landValue, bldValue, priceYen) {
    const t = Math.round((landValue || 0) + (bldValue || 0));
    return { total: t, ratio: priceYen > 0 ? t / priceYen : null };
  }

  // ---------------------------------------------------------------- 近くの公示地・基準地
  function distM(lat1, lon1, lat2, lon2) {
    const R = 6371008.8, r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  const tileKey = (grid, lat, lon) => Math.floor(lat / grid[0]) + "_" + Math.floor(lon / grid[1]);
  // まわり ring ます分のます目の名前（ring=1 なら 3×3）
  function tileKeysAround(grid, lat, lon, ring) {
    const r0 = Math.floor(lat / grid[0]), c0 = Math.floor(lon / grid[1]), out = [];
    for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) out.push((r0 + dr) + "_" + (c0 + dc));
    return out;
  }
  const USE_NAMES = { 0: "住宅地", 3: "宅地見込地", 5: "商業地", 9: "工業地" };
  // rows：タイルの配列（[lat, lon, kind, use, no, price, chg, addr, jukyo, area, now, youto, kenpei, youseki, station, dist, roadW, roadDir, roadType, around, year, city]）
  function nearest(rows, lat, lon, n, useFilter) {
    return rows.filter(r => useFilter == null || useFilter === "all" || r[3] === +useFilter)
      .map(r => ({ lat: r[0], lon: r[1], kind: r[2] === 0 ? "公示" : "調査", use: USE_NAMES[r[3]] || "", useCode: r[3], no: r[4], price: r[5], chg: r[6],
        addr: r[7], jukyo: r[8], area: r[9], now: r[10], youto: r[11], kenpei: r[12], youseki: r[13], station: r[14], stDist: r[15],
        roadW: r[16], roadDir: r[17], roadType: r[18], around: r[19], year: r[20], city: r[21], d: distM(lat, lon, r[0], r[1]) }))
      .sort((a, b) => a.d - b.d).slice(0, n);
  }

  // ---------------------------------------------------------------- 土地の形の部品（共通/katachi.js の analyze の結果）から、03 の欄に入れる値
  // res：Katachi.analyze（または KatachiUI の onChange）の結果。戻り値：{areaM2, frontM, depthM, shape, kagePct, soteiM2, setbackM2, flag, cands, notes}
  // 角地・二方路は「候補」として知らせるだけ（正面の道路の決め方・準角地かどうかは、路線価と役所の判断が要るため）
  // 旗竿と読みとった形のうち、竿が旗の幅の半分より広いもの（奥へ広がる台形など）は旗竿として扱わない（katachi.js の読みとりは目安のため）
  function isFlagLot(res) { const f = res && res.flag; return !!(f && f.isFlag && f.poleW > 0 && f.poleW <= f.bodyW * 0.5 + 1e-9); }
  function fromKatachi(res) {
    if (!res || !res.ok || !res.nta) return null;
    const n = res.nta, flag = isFlagLot(res), r2x = v => Math.round(v * 100) / 100;
    const out = { areaM2: n.areaM2, frontM: flag ? r2x(res.flag.poleW) : n.frontM, depthM: n.depthM, shape: flag ? "fusei" : n.shape,
      kagePct: n.kagePct, soteiM2: n.soteiM2, setbackM2: r2x(res.setbackArea || 0), flag,
      poleW: flag ? r2x(res.flag.poleW) : null, poleL: flag ? r2x(res.flag.poleL) : null, cands: [], notes: [] };
    const groups = res.groups || [], fg = res.frontGroup, E = res.edges || [];
    if (!(res.roads && res.roads.length)) out.cands.push({ key: "mudouro", text: "道路に接する辺がありません。「無道路地」の欄を確かめてください" });
    else if (res.contactMax < 2 - 1e-9) out.cands.push({ key: "mudouro", text: "道路に接する長さが " + r2x(res.contactMax) + "m で2m未満です。「無道路地」の欄を確かめてください" });
    const fe = res.frontEdge != null ? E[res.frontEdge] : null;
    groups.forEach(g => {
      if (g === fg || !fe) return;
      let ge = E[g.edges[0]]; g.edges.forEach(k => { if (E[k].len > ge.len) ge = E[k]; });
      const dot = Math.abs(ge.u[0] * fe.u[0] + ge.u[1] * fe.u[1]);
      // その道路から見た奥行（道路の辺に直角な向きの、土地の長さ）
      let t0 = Infinity, t1 = -Infinity;
      res.land.pts.forEach(p => { const t = p[0] * ge.nv[0] + p[1] * ge.nv[1]; t0 = Math.min(t0, t); t1 = Math.max(t1, t); });
      const lab = "辺" + g.edges.map(k => k + 1).join("・") + "（接する長さ " + r2x(g.len) + "m・幅 " + r2x(g.w) + "m）";
      if (dot > Math.cos(30 * Math.PI / 180)) out.cands.push({ key: "rear", edges: g.edges, len: r2x(g.len), w: g.w, text: "裏側の道路（二方路）の候補：" + lab });
      else out.cands.push({ key: "corner", edges: g.edges, len: r2x(g.len), w: g.w, sideDepthM: r2x(t1 - t0),
        text: "横の道路（角地または準角地）の候補：" + lab + "。横から見た奥行の目安 " + r2x(t1 - t0) + "m" });
    });
    if (fg && fg.edges.length > 1) out.notes.push("正面の道路が折れ曲がっています（屈折路）。間口は「想定整形地の間口」と「実際に接する長さ」の短いほうにしました");
    if (flag) out.notes.push("旗竿地と読みとりました。間口に竿（通路）の幅 " + out.poleW + "m を入れました（竿の長さ " + out.poleL + "m）");
    if (out.setbackM2 > 0) out.notes.push("2項道路の後退部分が " + out.setbackM2 + "㎡ あります。「セットバック」の欄に入れると7割を引きます（面積に入っているとき）");
    if (n.kagePct >= 50) out.notes.push("かげ地割合が50%以上です。国税庁の例では、細長い部分のある土地を分けて評価することがあります（税理士に確認）");
    return out;
  }

  // ---------------------------------------------------------------- 表示の道具
  function yen(v) { if (v == null || isNaN(v)) return "—"; return Math.round(v).toLocaleString("ja-JP") + "円"; }
  function man(v, d = 1) { if (v == null || isNaN(v)) return "—"; return (Math.round(v / 1e4 * 10 ** d) / 10 ** d).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d }) + "万円"; }
  function fmtM2(m2) { if (!(m2 >= 0)) return "—"; return (Math.round(m2 * 100) / 100) + "㎡（" + (m2 / TSUBO).toFixed(2) + "坪）"; }
  // 路線価図の場所（年・都県）
  const ROSENKA_PREF = { "北海道": "sapporo/hokkaido", "青森県": "sendai/aomori", "岩手県": "sendai/iwate", "宮城県": "sendai/miyagi", "秋田県": "sendai/akita", "山形県": "sendai/yamagata", "福島県": "sendai/fukusima",
    "茨城県": "kanto/ibaraki", "栃木県": "kanto/tochigi", "群馬県": "kanto/gunma", "埼玉県": "kanto/saitama", "千葉県": "tokyo/chiba", "東京都": "tokyo/tokyo", "神奈川県": "tokyo/kanagawa", "新潟県": "kanto/niigata",
    "富山県": "kanazawa/toyama", "石川県": "kanazawa/isikawa", "福井県": "kanazawa/fukui", "山梨県": "tokyo/yamanasi", "長野県": "kanto/nagano", "岐阜県": "nagoya/gifu", "静岡県": "nagoya/sizuoka", "愛知県": "nagoya/aichi", "三重県": "nagoya/mie",
    "滋賀県": "osaka/shiga", "京都府": "osaka/kyoto", "大阪府": "osaka/osaka", "兵庫県": "osaka/hyogo", "奈良県": "osaka/nara", "和歌山県": "osaka/wakayama", "鳥取県": "hirosima/tottori", "島根県": "hirosima/simane", "岡山県": "hirosima/okayama", "広島県": "hirosima/hirosima", "山口県": "hirosima/yamaguti",
    "徳島県": "takamatu/tokusima", "香川県": "takamatu/kagawa", "愛媛県": "takamatu/ehime", "高知県": "takamatu/koti", "福岡県": "fukuoka/fukuoka", "佐賀県": "fukuoka/saga", "長崎県": "fukuoka/nagasaki", "熊本県": "kumamoto/kumamoto", "大分県": "kumamoto/oita", "宮崎県": "kumamoto/miyazaki", "鹿児島県": "kumamoto/kagosima", "沖縄県": "okinawa/okinawa" };
  const PREF_RE = /^(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/;
  // 三大都市圏（規模格差補正率の500㎡か1000㎡か、開発許可の500㎡の目安に使う）。
  // 国税庁「地積規模の大きな宅地の評価」チェックシート2面の表（平成28年4月1日現在） https://www.nta.go.jp/publication/pamph/sozoku/pdf/chiseki_check.pdf
  // all＝全域、part＝一部（物件が区域の中かは市町村か府県の窓口で確かめる）。ここに無い都道府県・市町村は三大都市圏ではない。
  const list = s => s.split("、");
  const SANDAI = {
    "東京都": { all: list("特別区、武蔵野市、八王子市、立川市、三鷹市、青梅市、府中市、昭島市、調布市、町田市、小金井市、小平市、日野市、東村山市、国分寺市、国立市、福生市、狛江市、東大和市、清瀬市、東久留米市、武蔵村山市、多摩市、稲城市、羽村市、あきる野市、西東京市、瑞穂町、日の出町"), part: [] },
    "埼玉県": { all: list("さいたま市、川越市、川口市、行田市、所沢市、加須市、東松山市、春日部市、狭山市、羽生市、鴻巣市、上尾市、草加市、越谷市、蕨市、戸田市、入間市、朝霞市、志木市、和光市、新座市、桶川市、久喜市、北本市、八潮市、富士見市、三郷市、蓮田市、坂戸市、幸手市、鶴ケ島市、日高市、吉川市、ふじみ野市、白岡市、伊奈町、三芳町、毛呂山町、越生町、滑川町、嵐山町、川島町、吉見町、鳩山町、宮代町、杉戸町、松伏町"), part: list("熊谷市、飯能市") },
    "千葉県": { all: list("千葉市、市川市、船橋市、松戸市、野田市、佐倉市、習志野市、柏市、流山市、八千代市、我孫子市、鎌ケ谷市、浦安市、四街道市、印西市、白井市、富里市、酒々井町、栄町"), part: list("木更津市、成田市、市原市、君津市、富津市、袖ケ浦市") },
    "神奈川県": { all: list("横浜市、川崎市、横須賀市、平塚市、鎌倉市、藤沢市、小田原市、茅ケ崎市、逗子市、三浦市、秦野市、厚木市、大和市、伊勢原市、海老名市、座間市、南足柄市、綾瀬市、葉山町、寒川町、大磯町、二宮町、中井町、大井町、松田町、開成町、愛川町"), part: list("相模原市") },
    "茨城県": { all: list("龍ケ崎市、取手市、牛久市、守谷市、坂東市、つくばみらい市、五霞町、境町、利根町"), part: list("常総市") },
    "京都府": { all: list("亀岡市、向日市、八幡市、京田辺市、木津川市、久御山町、井手町、精華町"), part: list("京都市、宇治市、城陽市、長岡京市、南丹市、大山崎町") },
    "大阪府": { all: list("大阪市、堺市、豊中市、吹田市、泉大津市、守口市、富田林市、寝屋川市、松原市、門真市、摂津市、高石市、藤井寺市、大阪狭山市、忠岡町、田尻町"), part: list("岸和田市、池田市、高槻市、貝塚市、枚方市、茨木市、八尾市、泉佐野市、河内長野市、大東市、和泉市、箕面市、柏原市、羽曳野市、東大阪市、泉南市、四条畷市、交野市、阪南市、島本町、豊能町、能勢町、熊取町、岬町、太子町、河南町、千早赤阪村") },
    "兵庫県": { all: list("尼崎市、伊丹市"), part: list("神戸市、西宮市、芦屋市、宝塚市、川西市、三田市、猪名川町") },
    "奈良県": { all: list("大和高田市、安堵町、川西町、三宅町、田原本町、上牧町、王寺町、広陵町、河合町、大淀町"), part: list("奈良市、大和郡山市、天理市、橿原市、桜井市、五條市、御所市、生駒市、香芝市、葛城市、宇陀市、平群町、三郷町、斑鳩町、高取町、明日香村、吉野町、下市町") },
    "愛知県": { all: list("名古屋市、一宮市、瀬戸市、半田市、春日井市、津島市、碧南市、刈谷市、安城市、西尾市、犬山市、常滑市、江南市、小牧市、稲沢市、東海市、大府市、知多市、知立市、尾張旭市、高浜市、岩倉市、豊明市、日進市、愛西市、清須市、北名古屋市、弥富市、みよし市、あま市、長久手市、東郷町、豊山町、大口町、扶桑町、大治町、蟹江町、阿久比町、東浦町、南知多町、美浜町、武豊町、幸田町、飛島村"), part: list("岡崎市、豊田市") },
    "三重県": { all: list("四日市市、桑名市、木曽岬町、東員町、朝日町、川越町"), part: list("いなべ市") }
  };
  // 住所 → { pref, city, kind }。kind は all／part／none／""（都道府県か市町村が読めない）
  function sandaiOf(addr) {
    const a = String(addr || "").normalize("NFKC").replace(/\s/g, "").replace(/ヶ/g, "ケ");
    const pm = PREF_RE.exec(a);
    if (!pm) return { pref: "", city: "", kind: "" };
    const pref = pm[1], rest = a.slice(pref.length), S = SANDAI[pref];
    if (!S) return { pref, city: "", kind: "none" };
    if (pref === "東京都" && /^[^市区町村]{1,4}区/.test(rest)) return { pref, city: "特別区", kind: "all" };
    const norm = c => c.normalize("NFKC").replace(/ヶ/g, "ケ");
    const has = arr => arr.find(c => rest.startsWith(norm(c)) || new RegExp("^.{1,5}郡" + norm(c)).test(rest));
    const al = has(S.all); if (al) return { pref, city: al, kind: "all" };
    const pa = has(S.part); if (pa) return { pref, city: pa, kind: "part" };
    return /^.+?(市|郡.+?[町村]|[町村])/.test(rest) ? { pref, city: "", kind: "none" } : { pref, city: "", kind: "" };
  }
  function rosenkaUrl(reiwa, pref) {
    const y = "main_r" + String(reiwa).padStart(2, "0");
    return ROSENKA_PREF[pref] ? `https://www.rosenka.nta.go.jp/${y}/${ROSENKA_PREF[pref]}/pref_frm.htm` : `https://www.rosenka.nta.go.jp/${y}/index.htm`;
  }
  function prefOf(addr) { const m = PREF_RE.exec(String(addr || "").trim()); return m ? m[1] : ""; }

  // 住所 → 国税庁の路線価図のページ番号。idx は data/rosenka_index.js の window.ROSENKA_INDEX
  // 戻り値：{ pref, city, code, path, town, nums }（町が索引に無いときは town が null＝倍率地域のことがある）。市区町村も分からなければ null
  const KANSUJI = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  function normTown(s) {
    return String(s).normalize("NFKC").replace(/\s/g, "").replace(/^大字/, "").replace(/[ヶケが]/g, "ケ").replace(/之/g, "ノ")
      .replace(/([一二三四五六七八九十]+)丁目/g, (m, k) => (k.length === 2 && k[0] === "十" ? 10 + KANSUJI[k[1]] : k.length === 2 && k[1] === "十" ? KANSUJI[k[0]] * 10 : k.length === 3 ? KANSUJI[k[0]] * 10 + KANSUJI[k[2]] : KANSUJI[k]) + "丁目");
  }
  function findRosenkaMaps(idx, addr) {
    if (!idx || !idx.prefs) return null;
    const a = String(addr || "").normalize("NFKC").replace(/\s/g, "");
    const prefs = Object.keys(idx.prefs), pref = prefs.find(p => a.startsWith(p));
    if (!pref) return null;
    const rest = a.slice(pref.length), P = idx.prefs[pref];
    if (!P.cities) P.cities = (root.ROSENKA_PREFS && root.ROSENKA_PREFS[pref]) || {};   // 県ごとのファイル（data/rosenka/p_<番号>.js）
    const city = Object.keys(P.cities).filter(c => rest.startsWith(c)).sort((x, y) => y.length - x.length)[0];
    if (!city) return { pref, city: null, code: null, path: P.path, town: null, nums: [] };   // 路線価図の無い市区町村（倍率地域だけ）のことがある
    const c = P.cities[city], tail = normTown(rest.slice(city.length));
    const keys = Object.keys(c.towns), keyOf = k => normTown(k);
    const out = { pref, city, code: c.code, path: P.path, town: null, nums: [] };
    // 「桜上水5丁目40番」→「桜上水5」。丁目が無ければ、いちばん長く一致する町名
    const cho = /^(.+?)(\d+)丁目/.exec(tail);
    let hit = cho ? keys.find(k => keyOf(k) === cho[1] + cho[2]) : null;
    if (!hit) hit = keys.filter(k => tail.startsWith(keyOf(k))).sort((x, y) => y.length - x.length)[0];
    if (hit) { out.town = hit; out.nums = c.towns[hit]; }
    return out;
  }
  function rosenkaMapUrl(idx, f, no) { return `https://www.rosenka.nta.go.jp/main_${idx.meta.year}/${f.path}/prices/html/${no}f.htm`; }
  function rosenkaCityUrl(idx, f) { return `https://www.rosenka.nta.go.jp/main_${idx.meta.year}/${f.path}/prices/${f.code}fr.htm`; }
  function bairitsuCityUrl(idx, f) { return `https://www.rosenka.nta.go.jp/main_${idx.meta.year}/${f.path}/ratios/` + (f.code ? `html/${f.code}rf.htm` : "city_frm.htm"); }

  const API = { findRosenkaMaps, rosenkaMapUrl, rosenkaCityUrl, bairitsuCityUrl, HOSEI, TSUBO, LEVEL, toRosenka, trunc2, okuyukiRate, sokuhoRate, nihouRate, maguchiRate, chodaiRate, fuseiTableRate, kageFromSotei,
    kiboRate, kiboMinArea, kiboDistrictOK, gakeRate, tokkeiRate, land, extras, STRUCTS, UNIT_PRESETS, NTA_KOJI_R7, ntaUnit, building, total,
    distM, tileKey, tileKeysAround, nearest, USE_NAMES, yen, man, fmtM2, rosenkaUrl, prefOf, PREF_RE, sandaiOf, SANDAI, ROSENKA_PREF, fromKatachi, isFlagLot };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SEKISAN = API;
})(typeof window !== "undefined" ? window : this);
