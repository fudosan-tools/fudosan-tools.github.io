/* 売買相場マップの計算部分（画面と切りはなして、node でもテストできるようにしたもの）。
   画面（index.html）からは window.SOUBA_CALC、node からは require("./souba_calc.js") で使う。 */
(function (root) {
  "use strict";
  const TSUBO = 3.30578;
  const MIN_N = 5;   // これ未満の件数は「参考値」
  // 割引の目安の数字は 共通/hosei_data.js（相場マップと積算評価で共通）から読む。
  // ブラウザでは index.html が先に読みこんだ window.HOSEI、node では require で読む
  const HOSEI = (typeof module !== "undefined" && module.exports && typeof require === "function")
    ? require(require("path").join(__dirname, "../../共通/hosei_data.js")) : root.HOSEI;
  if (!HOSEI) throw new Error("共通/hosei_data.js が読みこめていません（souba_calc.js より先に読みこんでください）");
  const loHi = id => { const f = HOSEI.byId(id); return [f.lo, f.hi]; };

  // ---------------------------------------------------------------- 市区町村ファイルを読みやすい形に
  function decodeCity(o) {
    const D = o.rec.dicts, C = o.rec.cols, ix = {};
    C.forEach((c, i) => { ix[c] = i; });
    const towns = o.towns.map(t => ({ name: t[0], hh: t[1], onMap: !!t[2], key: o.code + "|" + t[0] }));
    const rows = o.rec.rows.map(r => {
      const g = c => r[ix[c]], d = c => D[c][r[ix[c]]];
      const x = {
        k: towns[g("k")].key, city: o.code, type: d("type"), src: d("src"), station: d("station"), walk: g("walk"),
        price: g("price"), area: g("area"), floor: g("floor"), plan: d("plan"), built: g("year"), struct: d("struct"),
        y: g("y"), q: g("q"), shape: d("shape"), front: g("front"), rtype: d("rtype"), rwidth: g("rwidth"),
        rdir: d("rdir"), jijo: d("jijo"), cp: d("cp"), bcr: g("bcr"), far: g("far"), renov: d("renov"),
      };
      x.age = x.built ? x.y - x.built : null;
      x.unit = x.price / x.area;   // マンション＝専有㎡あたり／土地・戸建＝土地㎡あたり
      return x;
    });
    return { code: o.code, name: o.name, pref: o.pref, towns, rows, geo: o.geo };
  }
  // 町の形：差にした整数の並びを、[緯度, 経度] の並びにもどす
  function decodeRing(a) {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([y / 1e5, x / 1e5]); }
    return out;
  }

  // ---------------------------------------------------------------- 円（半径）
  // 2点の距離（km）。緯度経度は [lat, lng]
  function distKm(a, b) {
    const R = 6371, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // 町の代表点：いくつかの形を合わせた重心（面積で重みをつける）。形が点や線に近いときは平均
  function centroid(rings) {
    let A = 0, X = 0, Y = 0, n = 0, sx = 0, sy = 0;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], c = p[1] * q[0] - q[1] * p[0];
      A += c; X += (p[1] + q[1]) * c; Y += (p[0] + q[0]) * c; sx += p[1]; sy += p[0]; n++;
    }
    if (!n) return null;
    if (Math.abs(A) < 1e-12) return [sy / n, sx / n];
    return [Y / (3 * A), X / (3 * A)];
  }
  function inRing(pt, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[0] > pt[0]) !== (b[0] > pt[0]) && pt[1] < (b[1] - a[1]) * (pt[0] - a[0]) / (b[0] - a[0]) + a[1]) hit = !hit;
    }
    return hit;
  }

  // ---------------------------------------------------------------- 数の道具
  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function quant(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p,
    lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
  const range = s => s ? s.split("-").map(Number) : null;

  // ---------------------------------------------------------------- 種類と条件の分け方
  const TYPES = {
    "中古マンション等": { label: "中古マンション", short: "マンション", total: false },
    "宅地(土地と建物)": { label: "戸建（土地と建物）", short: "戸建", total: true },
    "宅地(土地)": { label: "土地", short: "土地", total: false },
    "宅地(土地と建物・戸建以外)": { label: "アパート・店舗など（土地と建物・戸建以外）", short: "アパート・店舗等", total: true },
  };
  const isTotal = type => !!(TYPES[type] && TYPES[type].total);   // 総額で比べる種類（戸建・アパート等）
  const isLandish = type => type !== "中古マンション等";          // 土地の条件（形・道路・間口）で絞れる種類

  function planGroup(p) {
    if (!p) return "";
    const n = parseInt(p, 10);
    if (/^1(R|K|DK)/.test(p)) return "1R1K";
    if (/^1LDK/.test(p) || /^2(K|DK)/.test(p)) return "1LDK";
    if (/^2LDK/.test(p) || /^3(K|DK)/.test(p)) return "2LDK";
    if (/^3LDK/.test(p) || /^4(K|DK)$/.test(p)) return "3LDK";
    if (n >= 4) return "4LDK";
    return "";
  }
  function structGroup(s) { if (s === "RC") return "RC"; if (s === "SRC") return "SRC";
    if (s === "S" || s === "軽量S") return "S"; if (s === "木造") return "木造"; return ""; }

  // 土地の形（国のデータの「土地の形状」をまとめる）
  const SHAPE_GROUP = { "長方形": "seikei", "ほぼ長方形": "seikei", "正方形": "seikei", "ほぼ正方形": "seikei", "ほぼ整形": "seikei",
    "不整形": "fusei", "台形": "fusei", "ほぼ台形": "fusei", "袋地等": "fukuro" };
  const shapeGroup = s => SHAPE_GROUP[s] || "";
  // 前面道路：公道／私道／道路に接していない。「道路」とだけ書かれたものなどは、どちらとも言えないので入れない
  const PUBLIC_ROADS = new Set(["公道", "国道", "都道", "道道", "府道", "県道", "区道", "市道", "町道", "村道", "区画街路"]);
  function roadGroup(r) {
    if (r.rdir === "接面道路無") return "none";
    if (r.rtype === "私道") return "private";
    if (PUBLIC_ROADS.has(r.rtype)) return "public";
    return "";
  }
  const widthBin = w => w == null ? "" : w < 4 ? "lt4" : w < 6 ? "4to6" : "ge6";
  const frontBin = f => f == null ? "" : f < 2 ? "lt2" : f < 4 ? "2to4" : "ge4";
  const SPECIAL = /関係者間|調停|競売|隣地の購入|その他事情/;
  const isSpecial = r => SPECIAL.test(r.jijo || "");
  // 都市計画（取引データの項目）を大きな区分にまとめる。市街化調整区域は価格が大きく違うので分けて見る
  const CP_GROUP = { "1低住専": "low", "2低住専": "low", "田園住居": "low", "1中住専": "mid", "2中住専": "mid", "1種住居": "res", "2種住居": "res", "準住居": "res",
    "近隣商業": "com", "商業": "com", "準工業": "ind", "工業": "ind", "工業専用": "ind", "調整区域": "chosei", "非線引き": "other", "都計外": "other", "準都計": "other" };
  const cpGroup = cp => CP_GROUP[cp] || "none";
  // 駅名をそろえる（取引データの「大手町(東京)」と国の鉄道データの「大手町」、ヶとケのちがいなど）
  const stationKey = n => String(n || "").normalize("NFKC").replace(/[(（].*?[)）]/g, "").replace(/ヶ/g, "ケ").replace(/ヵ/g, "カ").replace(/ｹ/g, "ケ").replace(/駅$/, "").trim();
  // 駅のつながりから、start 駅から n 駅先までの駅数を出す。返り値は 駅の番号 → 駅数
  function stationsWithin(adj, start, n) {
    const hops = { [start]: 0 }; let cur = [start];
    for (let h = 1; h <= n; h++) { const nx = [];
      cur.forEach(i => adj[i].forEach(j => { if (hops[j] == null) { hops[j] = h; nx.push(j); } }));
      cur = nx; }
    return hops;
  }
  const hasPrivateRoad = r => /私道を含む/.test(r.jijo || "");
  // 古家付きの可能性：土地と建物の取引のうち、木造で築35年以上（国のデータに「古家付き」の印は無いので推し量る）
  const OLD_HOUSE_AGE = 35;
  const isOldHouse = r => (r.type === "宅地(土地と建物)" || r.type === "宅地(土地と建物・戸建以外)") &&
    r.struct === "木造" && r.age != null && r.age >= OLD_HOUSE_AGE;

  // S（いまの条件）に合うか。skip で一部の条件を外せる（前年比で「期間」を外すときなど）
  function pass(r, S, skip = {}) {
    if (r.type !== S.type) return false;
    if (S.src !== "all" && r.src !== S.src) return false;
    if (!skip.year) { const [a, b] = range(S.year); if (r.y < a || r.y > b) return false; }
    if (S.station && r.station !== S.station) return false;
    if (S.walk) { const [a, b] = range(S.walk); if (r.walk == null || r.walk < a || r.walk > b) return false; }
    if (S.area) { const [a, b] = range(S.area); if (r.area < a || r.area >= b) return false; }
    if (S.plan && planGroup(r.plan) !== S.plan) return false;
    if (S.struct && structGroup(r.struct) !== S.struct) return false;
    if (S.age) { const [a, b] = range(S.age); if (r.age == null || r.age < a || r.age > b) return false; }
    if (!skip.land) {
      if (S.shape && shapeGroup(r.shape) !== S.shape) return false;
      if (S.road && roadGroup(r) !== S.road) return false;
      if (S.width && widthBin(r.rwidth) !== S.width) return false;
      if (S.front && frontBin(r.front) !== S.front) return false;
    }
    if (S.cp === "noChosei") { if (r.cp === "調整区域") return false; }
    else if (S.cp && cpGroup(r.cp) !== S.cp) return false;
    if (S.jijo === "nospecial" && isSpecial(r)) return false;
    if (S.jijo === "clean" && (isSpecial(r) || hasPrivateRoad(r))) return false;
    if (S.jijo === "private" && !hasPrivateRoad(r)) return false;
    if (S.house === "old" && !isOldHouse(r)) return false;
    if (S.house === "notold" && isOldHouse(r)) return false;
    return true;
  }
  // 期間が何年分か（データにある四半期の数 ÷ 4）
  function yearsInRange(year, quarters) {
    const [a, b] = range(year);
    const n = quarters.filter(([y]) => y >= a && y <= b).length;
    return Math.max(0.25, n / 4);
  }
  // 1年分そろっている年（4つの四半期がある年）
  function fullYears(quarters) {
    const c = {};
    quarters.forEach(([y]) => { c[y] = (c[y] || 0) + 1; });
    return Object.keys(c).filter(y => c[y] === 4).map(Number).sort((a, b) => a - b);
  }
  const mainVal = (r, type) => isTotal(type) ? r.price : r.unit;   // 戸建・アパート等は総額、ほかは単価

  // ---------------------------------------------------------------- 町ごとの集計
  function aggregate(rows, S, hhOf, quarters) {
    const TOWN = {};
    for (const r of rows) { if (!pass(r, S)) continue; (TOWN[r.k] ||= []).push(r); }
    const yrs = yearsInRange(S.year, quarters);
    const liqList = [];
    for (const k in TOWN) {
      const rs = TOWN[k], vals = rs.map(r => mainVal(r, S.type));
      const hh = hhOf(k) || 0;
      const t = TOWN[k] = { rows: rs, n: rs.length, med: median(vals), q1: quant(vals, .25), q3: quant(vals, .75),
        perYear: rs.length / yrs, liq: hh > 0 ? rs.length / yrs / hh * 1000 : null, hh };
      if (t.liq != null && t.n >= MIN_N) liqList.push(t.liq);
    }
    // 流動性の★：いまの条件で比べられる町（5件以上）を、1000世帯あたり年間件数の多い順に並べて3つに分ける
    const c1 = quant(liqList, 1 / 3), c2 = quant(liqList, 2 / 3);
    const sorted = [...liqList].sort((a, b) => b - a);
    const LIQ = { n: liqList.length, c1, c2 };
    for (const k in TOWN) { const t = TOWN[k];
      t.stars = t.liq == null || t.n < MIN_N ? 0 : (t.liq >= c2 ? 3 : t.liq >= c1 ? 2 : 1);
      t.rank = t.stars ? sorted.indexOf(t.liq) + 1 : null; }
    return { TOWN, LIQ };
  }
  // 前年比：「期間」の条件を外して、1年分そろう最後の2年をくらべる
  function yoy(rows, k, S, quarters) {
    const fy = fullYears(quarters);
    if (fy.length < 2) return null;
    const y2 = fy[fy.length - 1], y1 = y2 - 1;
    const by = { [y1]: [], [y2]: [] };
    for (const r of rows) if (r.k === k && (r.y === y1 || r.y === y2) && pass(r, S, { year: true })) by[r.y].push(mainVal(r, S.type));
    if (by[y1].length < MIN_N || by[y2].length < MIN_N) return null;
    return { p: median(by[y2]) / median(by[y1]) - 1, c: by[y2].length / by[y1].length - 1, n1: by[y1].length, n2: by[y2].length, y1, y2 };
  }

  // ---------------------------------------------------------------- 古家付きと解体費
  // 解体費の目安（建物の延床1坪あたり・円）。共通/hosei_data.js の kaitai_w・kaitai_s・kaitai_rc（出典は 共通/調べもの_土地の割引.md）。
  // 塀・庭木・残置物・地中の埋設物は別
  const DEMOLISH = { "木造": loHi("kaitai_w"), "S": loHi("kaitai_s"), "RC": loHi("kaitai_rc") };
  const demolishKey = s => s === "木造" ? "木造" : (s === "S" || s === "軽量S") ? "S" : (s === "RC" || s === "SRC") ? "RC" : "木造";
  function oldHouseStats(rows, perTsubo) {
    const olds = rows.filter(isOldHouse);
    const asIs = olds.map(r => r.unit);
    const withF = olds.filter(r => r.floor);
    const lo = withF.map(r => (r.price + r.floor / TSUBO * (perTsubo ? perTsubo[0] : DEMOLISH[demolishKey(r.struct)][0])) / r.area);
    const hi = withF.map(r => (r.price + r.floor / TSUBO * (perTsubo ? perTsubo[1] : DEMOLISH[demolishKey(r.struct)][1])) / r.area);
    return { n: olds.length, nFloor: withF.length, asIs: median(asIs), sarachiLo: median(lo), sarachiHi: median(hi),
      floor: median(withF.map(r => r.floor)), price: median(olds.map(r => r.price)) };
  }

  // ---------------------------------------------------------------- 国税庁の表（財産評価基本通達 付表。平成31年1月分以降用の調整率表）
  // 地区区分：koudo 高度商業／hanka 繁華街／shogyo 普通商業・併用住宅／futsu 普通住宅／kojo 中小工場
  const DISTRICTS = { futsu: "普通住宅地区", shogyo: "普通商業・併用住宅地区", koudo: "高度商業地区", hanka: "繁華街地区", kojo: "中小工場地区" };
  // ④ 不整形地補正率を算定する際の地積区分表（A／B の上限㎡。これ以上は C）
  const CHISEKI = { koudo: [1000, 1500], hanka: [450, 700], shogyo: [650, 1000], futsu: [500, 750], kojo: [3500, 5000] };
  // ⑤ 不整形地補正率表：かげ地割合 10%以上〜65%以上 の各行 [その他の地区 A,B,C, 普通住宅 A,B,C]
  const FUSEI = [
    [10, .99, .99, 1.00, .98, .99, .99], [15, .98, .99, .99, .96, .98, .99], [20, .97, .98, .99, .94, .97, .98],
    [25, .96, .98, .99, .92, .95, .97], [30, .94, .97, .98, .90, .93, .96], [35, .92, .95, .98, .88, .91, .94],
    [40, .90, .93, .97, .85, .88, .92], [45, .87, .91, .95, .82, .85, .90], [50, .84, .89, .93, .79, .82, .87],
    [55, .80, .87, .90, .75, .78, .83], [60, .76, .84, .86, .70, .73, .78], [65, .70, .75, .80, .60, .65, .70],
  ];
  function chisekiKubun(district, areaM2) { const [a, b] = CHISEKI[district]; return areaM2 < a ? 0 : areaM2 < b ? 1 : 2; }
  function fuseiRate(district, areaM2, kagePct) {
    if (!(kagePct >= 10)) return 1;
    let row = FUSEI[0];
    for (const r of FUSEI) if (kagePct >= r[0]) row = r;
    return row[(district === "futsu" ? 4 : 1) + chisekiKubun(district, areaM2)];
  }
  // ⑥ 間口狭小補正率表：[間口の下限m, 高度商業, 繁華街, 普通商業・併用住宅, 普通住宅, 中小工場]
  const MAGUCHI = [
    [0, .85, .90, .90, .90, .80], [4, .94, 1.00, .97, .94, .85], [6, .97, 1.00, 1.00, .97, .90], [8, 1.00, 1.00, 1.00, 1.00, .95],
    [10, 1.00, 1.00, 1.00, 1.00, 1.00], [16, 1.00, 1.00, 1.00, 1.00, 1.00], [22, 1.00, 1.00, 1.00, 1.00, 1.00], [28, 1, 1, 1, 1, 1],
  ];   // 2026-10-22 直した：中小工場の10m以上は1.00（前は大工場の列 0.97〜0.99 を入れていた。国税庁 付表6 で確認）
  const MAGUCHI_COL = { koudo: 1, hanka: 2, shogyo: 3, futsu: 4, kojo: 5 };
  function maguchiRate(district, frontM) {
    if (!(frontM > 0)) return 1;
    let row = MAGUCHI[0];
    for (const r of MAGUCHI) if (frontM >= r[0]) row = r;
    return row[MAGUCHI_COL[district]];
  }
  // 形の補正（国税庁のやり方）：不整形地補正率 × 間口狭小補正率。ただし不整形のときは最小 0.60
  function shapeRate(shape, district, areaM2, kagePct, frontM) {
    const m = maguchiRate(district, frontM);
    if (shape === "seikei") return { rate: m, fusei: 1, maguchi: m };
    const f = fuseiRate(district, areaM2, kagePct);
    return { rate: Math.max(0.6, f * m), fusei: f, maguchi: m };
  }
  // ⑨ がけ地補正率表：がけ地の割合 0.10以上〜0.90以上 の各行 [割合, 南, 東, 西, 北]
  const GAKE = [[.10, .96, .95, .94, .93], [.20, .92, .91, .90, .88], [.30, .88, .87, .86, .83], [.40, .85, .84, .82, .78],
    [.50, .82, .81, .78, .73], [.60, .79, .77, .74, .68], [.70, .76, .74, .70, .63], [.80, .73, .70, .66, .58], [.90, .70, .65, .60, .53]];
  const GAKE_COL = { "南": 1, "東": 2, "西": 3, "北": 4 };
  function gakeRate(ratio, dir) {
    if (!(ratio >= 0.1)) return 1;
    let row = GAKE[0];
    for (const r of GAKE) if (ratio >= r[0] - 1e-9) row = r;
    return row[GAKE_COL[dir] || 4];
  }
  // 借地権割合（路線価図の記号）
  const LEASE = { A: .9, B: .8, C: .7, D: .6, E: .5, F: .4, G: .3 };

  // 補正の目安（一般的な目安。画面で変えられる）。数字は 共通/hosei_data.js から読む（2026-10-22 調べなおし）
  const DEFAULTS = {
    rebuild: loHi("saikenchiku"),  // 再建築不可：更地の5〜7割
    slope: loHi("hinadan"),        // 高低差・ひな壇（擁壁は使える）：更地の9〜10割
    youheki: loHi("youheki"),      // 擁壁のやり直しが要る・がけ条例：更地の7〜9割（工事費を別に引かないとき）
    shakuchi: loHi("shakuchi"),    // 借地権：税の評価（更地×借地権割合）の5〜9割
    sokochi: loHi("sokochi"),      // 底地：税の評価（更地×(1−借地権割合)）の2.5〜5割
  };
  const slopeDefault = type => type === "youheki" ? DEFAULTS.youheki : DEFAULTS.slope;

  const manTxt = v => String(Math.round(v / 1e4 * 10) / 10);   // 円 → 万円（小数1けたまで）
  // 自分の物件に合わせて相場を直す計算。円で受けとり、各段の「低め・高め」を返す
  function adjust(p) {
    const steps = [];
    const base = p.unitM2 * p.areaM2;
    let lo = base, hi = base;
    steps.push({ key: "base", label: "更地（ふつうの土地）の相場", how: `単価 × 面積`, lo, hi });
    if (p.shape && (p.shape !== "seikei" || maguchiRate(p.district, p.frontM) < 1)) {
      const s = shapeRate(p.shape, p.district, p.areaM2, p.kagePct, p.frontM);
      lo *= s.rate; hi *= s.rate;
      steps.push({ key: "shape", label: "形（国税庁の補正率）", how: `× ${s.rate.toFixed(3)}（不整形 ${s.fusei.toFixed(2)} × 間口狭小 ${s.maguchi.toFixed(2)}${p.shape !== "seikei" ? "・最小0.60" : ""}）`, lo, hi, rate: s });
    }
    if (p.slope && p.slope !== "none") {
      lo *= p.slopeLo; hi *= p.slopeHi;
      steps.push({ key: "slope", label: "高低差（擁壁・ひな壇）", how: `× ${p.slopeLo}〜${p.slopeHi}`, lo, hi });
      if (p.wallLo || p.wallHi) {
        lo -= p.wallHi || 0; hi -= p.wallLo || 0;
        steps.push({ key: "wall", label: "擁壁の工事費", how: `− ${manTxt(p.wallLo || 0)}〜${manTxt(p.wallHi || 0)}万円`, lo, hi });
      }
    }
    if (p.gakeRatio >= 0.1) {
      const g = gakeRate(p.gakeRatio, p.gakeDir);
      lo *= g; hi *= g;
      steps.push({ key: "gake", label: "がけ地（国税庁のがけ地補正率）", how: `× ${g.toFixed(2)}`, lo, hi });
    }
    if (p.rebuildNG) {
      lo *= p.rebuildLo; hi *= p.rebuildHi;
      steps.push({ key: "rebuild", label: "再建築不可", how: `× ${p.rebuildLo}〜${p.rebuildHi}`, lo, hi });
    }
    if (p.right === "shakuchi" || p.right === "sokochi") {
      const ratio = LEASE[p.letter];
      const part = p.right === "shakuchi" ? ratio : 1 - ratio;
      lo *= part * p.rightLo; hi *= part * p.rightHi;
      steps.push({ key: "right", label: p.right === "shakuchi" ? "借地権" : "底地",
        how: `× ${part.toFixed(2)}（${p.right === "shakuchi" ? "借地権割合" : "1−借地権割合"}・記号${p.letter}） × ${p.rightLo}〜${p.rightHi}（市場の目安）`, lo, hi, part });
    }
    if (p.house && p.right !== "sokochi" && p.floorM2 > 0) {
      const t = p.floorM2 / TSUBO;
      lo -= t * p.demoHi; hi -= t * p.demoLo;
      steps.push({ key: "demolish", label: "古家の解体費", how: `− 延床 ${t.toFixed(1)}坪 × ${manTxt(p.demoLo)}〜${manTxt(p.demoHi)}万円/坪`, lo, hi });
    }
    lo = Math.max(0, lo); hi = Math.max(0, hi);
    return { base, lo, hi, steps, pctLo: base ? lo / base : null, pctHi: base ? hi / base : null,
      unitLo: lo / p.areaM2, unitHi: hi / p.areaM2 };
  }

  // ---------------------------------------------------------------- 自分の記録（CSV の書き出し・読みこみ）
  const MY_COLS = [["id", "ID"], ["date", "時期"], ["city", "市区町村コード"], ["cityName", "市区町村"], ["town", "町"],
    ["kind", "種類"], ["rebuildNG", "再建築不可"], ["slope", "高低差"], ["shape", "土地の形"], ["area", "土地面積㎡"],
    ["floor", "延床面積㎡"], ["price", "価格円"], ["letter", "借地権割合の記号"], ["memo", "メモ"], ["fee", "共益費円"]];
  const MY_KINDS = ["土地", "戸建", "マンション", "借地権", "底地", "その他", "賃貸（居住用）", "賃貸（事業用）"];
  // 賃貸の記録は「価格円」に月額賃料を入れる（売買の単価と混ぜない）
  const isRentKind = k => /^賃貸/.test(k || "");
  function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(list) {
    return "﻿" + [MY_COLS.map(c => c[1]).join(","), ...list.map(r => MY_COLS.map(([k]) => csvCell(k === "rebuildNG" || k === "slope" ? (r[k] ? "1" : "") : r[k])).join(","))].join("\r\n") + "\r\n";
  }
  function parseCSVText(text) {
    text = text.replace(/^﻿/, "");
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c !== ""));
  }
  function fromCSV(text) {
    const rows = parseCSVText(text);
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    const pos = {};
    MY_COLS.forEach(([k, j]) => { const i = head.indexOf(j); if (i >= 0) pos[k] = i; });
    if (pos.price == null) throw new Error("「価格円」の列がありません");
    return rows.slice(1).map((r, n) => {
      const o = {};
      MY_COLS.forEach(([k]) => { o[k] = pos[k] != null ? (r[pos[k]] || "").trim() : ""; });
      o.rebuildNG = o.rebuildNG === "1"; o.slope = o.slope === "1";
      ["area", "floor", "price", "fee"].forEach(k => { const v = parseFloat(String(o[k]).replace(/,/g, "")); o[k] = isFinite(v) ? v : null; });
      if (o.fee == null) delete o.fee;   // 売買の記録には共益費の欄を持たせない
      if (!o.id) o.id = "imp" + Date.now().toString(36) + n;
      return o;
    }).filter(o => o.price > 0);
  }
  // 土地の形の部品（共通/katachi.js の analyze の結果）から「目安の計算」の欄に入れる値。
  // かげ地割合・想定整形地は国税庁の決め方（想定整形地＝正面の道路に面して土地を囲む長方形）。旗竿なら間口は竿の幅
  // 竿が旗の幅の半分より広いもの（奥へ広がる台形など）は旗竿としない（形の読みとりは目安のため）
  function fromKatachi(res) {
    if (!res || !res.ok || !res.nta) return null;
    const f = res.flag, flag = !!(f && f.isFlag && f.poleW > 0 && f.poleW <= f.bodyW * 0.5 + 1e-9), n = res.nta;
    return { kagePct: n.kagePct, soteiM2: n.soteiM2, areaM2: n.areaM2, frontM: flag ? Math.round(f.poleW * 100) / 100 : n.frontM,
      shape: flag ? "hata" : n.shape, flag };
  }

  // 単価：面積あたり（土地・戸建・借地・底地は土地の面積、マンションは専有面積）
  const myUnit = r => r.area > 0 ? r.price / r.area : null;
  // 賃料＋共益費の月額と、㎡あたりの月額（円）
  const rentTotal = r => (r.price || 0) + (r.fee || 0);
  const rentUnit = r => r.area > 0 ? rentTotal(r) / r.area : null;
  // 賃貸の記録のまとめ：中央値（1件ずつの賃料＋共益費、㎡あたり）と、真ん中の半分
  function rentSummary(list) {
    const totals = list.map(rentTotal).filter(v => v > 0), units = list.map(rentUnit).filter(v => v > 0);
    return { n: totals.length, total: totals.length ? median(totals) : null, unit: units.length ? median(units) : null,
      unitLow: units.length ? quant(units, .25) : null, unitHigh: units.length ? quant(units, .75) : null };
  }

  const API = { TSUBO, MIN_N, TYPES, isTotal, isLandish, decodeCity, decodeRing, distKm, centroid, inRing, median, quant, range, planGroup, structGroup,
    shapeGroup, roadGroup, widthBin, frontBin, isSpecial, hasPrivateRoad, isOldHouse, OLD_HOUSE_AGE, pass, yearsInRange,
    fullYears, mainVal, aggregate, yoy, DEMOLISH, demolishKey, oldHouseStats, DISTRICTS, CHISEKI, chisekiKubun, fuseiRate,
    maguchiRate, shapeRate, gakeRate, LEASE, DEFAULTS, slopeDefault, HOSEI, FUSEI, MAGUCHI, GAKE, adjust, cpGroup, stationKey, stationsWithin, MY_COLS, MY_KINDS, isRentKind, rentTotal, rentUnit, rentSummary, toCSV, fromCSV, parseCSVText, myUnit, fromKatachi };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SOUBA_CALC = API;
})(typeof window !== "undefined" ? window : this);
