/* 家賃の目安と修繕計画書の計算（2026-11-08）。画面は chinryo.html、試験は scripts/test_chinryo.js。
   根拠のまとめ：../賃料と修繕_調べ/ の調べもの4つ（国の統計・経年の下落・リノベの効果・修繕と法律）。
   ここの数字は「目安」。最後の判断は不動産鑑定士・地元の不動産会社・工事会社の見積で。 */
(function (root) {
  "use strict";

  // ---------------- 1. 築年数による家賃の下がり方 ----------------
  // 築年の段階ごとの「1年あたりの下落率（%）」。新しく貸すときの家賃（募集・成約）の線。
  //  都心：三井住友トラスト基礎研究所（2013年・2020年、東京23区の成約・募集家賃）とSUUMOの相場（2026年10月、世田谷・名古屋中区・札幌中央区）
  //  地方：SUUMOの相場（宇都宮・盛岡・松山・福岡中央区）、東京カンテイ（2026年10月）。木造の31年〜は国の統計（住宅・土地統計調査2023年、地方の県の木造は年2.1%）との間をとった
  //  中間：都心と地方の平均（大阪・名古屋・横浜、地方の政令市など）
  var BANDS = [[0, 2], [3, 10], [11, 20], [21, 30], [31, 999]];
  var RATES = {
    toshin: { rc: [0, 1.2, 0.8, 0.6, 0.3], wood: [0, 1.2, 0.8, 0.9, 0.7] },
    chiho: { rc: [0, 1.5, 1.0, 1.0, 0.8], wood: [0, 1.5, 1.0, 1.2, 1.5] }
  };
  RATES.chukan = { rc: RATES.toshin.rc.map(function (v, i) { return (v + RATES.chiho.rc[i]) / 2; }),
    wood: RATES.toshin.wood.map(function (v, i) { return (v + RATES.chiho.wood[i]) / 2; }) };
  var REGION_LABEL = { toshin: "都心型", chukan: "中間（大都市・地方の中心都市）", chiho: "地方型", custom: "自分で年率を入れる" };

  function bandRate(region, struct, year, custom) {
    if (region === "custom") return year <= 2 ? 0 : (custom || 0);
    var r = (RATES[region] || RATES.chukan)[struct === "wood" ? "wood" : "rc"];
    for (var i = 0; i < BANDS.length; i++) if (year >= BANDS[i][0] && year <= BANDS[i][1]) return r[i];
    return r[r.length - 1];
  }
  // 新築を1としたときの、築 age 年の家賃の倍率。小数の年は最後の1年を割合で入れる
  function ageFactor(age, region, struct, custom) {
    age = Math.max(0, age || 0);
    var f = 1, whole = Math.floor(age);
    for (var y = 1; y <= whole; y++) f *= 1 - bandRate(region, struct, y, custom) / 100;
    var frac = age - whole;
    if (frac > 0) f *= 1 - frac * bandRate(region, struct, whole + 1, custom) / 100;
    return f;
  }

  // ---------------- 2. 見なしの築年数 ----------------
  // 部位ごとの重み（合計1）。骨組み・立地は直せないので、いつも実際の築年数で数える。
  //  部屋の中（内装・水まわり・設備・間取り）を全部直すと0.6ぶんが新しくなる。
  //  重みは、東京23区の住宅REITのリノベの実績（原状回復だけの部屋との差 +12〜19%：アドバンス・レジデンス投資法人 2024年7月期・2025年1月期）と、上の「都心」の線が合うように決めた。
  var PARTS = [
    { id: "frame", name: "建物の骨組み・立地（直せない部分）", w: 0.30, fixed: true },
    { id: "common", name: "共用部・外まわり（外壁・屋根・廊下・エントランス）", w: 0.10 },
    { id: "interior", name: "内装（床・壁・天井・建具）", w: 0.20 },
    { id: "water", name: "水まわり（キッチン・おふろ・トイレ・洗面）", w: 0.25 },
    { id: "equip", name: "設備（給湯器・エアコン・インターホン・照明）", w: 0.10 },
    { id: "layout", name: "間取りの変更（いまの暮らしに合う形に）", w: 0.05 }
  ];
  // done：{ partId: 直した年（西暦） }。直していない部位は実際の築年数
  function effectiveAge(age, done, nowYear) {
    var e = 0, detail = [];
    PARTS.forEach(function (p) {
      var y = !p.fixed && done && done[p.id];
      var a = y ? Math.min(age, Math.max(0, nowYear - y)) : age;
      e += p.w * a;
      detail.push({ id: p.id, name: p.name, w: p.w, age: a, renewed: !!y });
    });
    return { age: e, detail: detail, renewedShare: detail.filter(function (d) { return d.renewed; }).reduce(function (s, d) { return s + d.w; }, 0) };
  }

  // ---------------- 3. 設備の加点 ----------------
  // 近くの似た部屋に無い設備だけを選ぶ。1つずつの%は那覇市の分析（おきぎん経済研究所 2023年8月：築年数・広さをそろえて
  //  バス・トイレ別 +6.7%、洗面化粧台 +8.8%、宅配ボックス +7.4%）を、足し算で多く出すぎないよう半分ほどに抑えた仮の値。合計の上限は12%。
  var EQUIP = [
    { id: "bt", name: "バス・トイレ別", pct: 4 },
    { id: "senmen", name: "独立洗面台", pct: 4 },
    { id: "takuhai", name: "宅配ボックス", pct: 3 },
    { id: "net", name: "インターネット無料", pct: 3 },
    { id: "lock", name: "オートロック", pct: 3 },
    { id: "oidaki", name: "追い焚き", pct: 2 },
    { id: "monitor", name: "TVモニター付きインターホン", pct: 2 },
    { id: "aircon", name: "エアコン（近くの例に無い）", pct: 2 }
  ];
  var EQUIP_CAP = 12;
  function equipBonus(ids) {
    var s = 0;
    (ids || []).forEach(function (id) { EQUIP.forEach(function (e) { if (e.id === id) s += e.pct; }); });
    return Math.min(EQUIP_CAP, s);
  }

  // ---------------- 4. 家賃の目安 ----------------
  // 地域で、リノベの上がり幅を控えめにする割合（地方は実例が少ないので7割：国交省 2019年「地方の家賃は1都3県の約7割」）
  var GAIN_DAMP = { toshin: 1, chukan: 0.85, chiho: 0.7, custom: 0.85 };
  var CAP_RENEWED = 0.95;   // 直しても、同じ場所の新築の95%まで（骨組み・共用部が古いため）

  /* p = { age, struct:'rc'|'wood', region, custom, nowYear, area(㎡),
           comps:[{rent(円/月), area(㎡), age}], done:{partId:年}, equip:[id], cost(円・リノベの工事費) }
     戻り値の円はすべて1か月 */
  function estimate(p) {
    var region = p.region || "chukan", struct = p.struct === "wood" ? "wood" : "rc";
    var comps = (p.comps || []).filter(function (c) { return c && c.rent > 0 && c.area > 0 && c.age >= 0; });
    if (!comps.length || !(p.area > 0)) return { ok: false, reason: comps.length ? "広さを入れてください" : "近くの似た部屋を1つ以上入れてください" };
    var news = comps.map(function (c) {
      var f = ageFactor(c.age, region, struct, p.custom);
      return { rent: c.rent, area: c.area, age: c.age, perM2: c.rent / c.area, factor: f, newPerM2: c.rent / c.area / f };
    });
    var base = news.reduce(function (s, c) { return s + c.newPerM2; }, 0) / news.length;   // 新築ならいくらか（円/㎡）
    var minB = Math.min.apply(null, news.map(function (c) { return c.newPerM2; }));
    var maxB = Math.max.apply(null, news.map(function (c) { return c.newPerM2; }));
    var fAge = ageFactor(p.age, region, struct, p.custom);
    var eff = effectiveAge(p.age, p.done || {}, p.nowYear);
    var fEff = ageFactor(eff.age, region, struct, p.custom);
    var gainRaw = fEff / fAge - 1;
    var gain = gainRaw * (GAIN_DAMP[region] || 1);
    var fUse = fAge * (1 + gain);
    var capped = false;
    if (eff.renewedShare > 0 && fUse > CAP_RENEWED) { fUse = CAP_RENEWED; capped = true; }
    var eq = equipBonus(p.equip);
    var perM2Plain = base * fAge;                            // 直したところを入れない（実際の築年数だけ）
    var perM2 = base * fUse * (1 + eq / 100);
    var spread = region === "chiho" ? 0.08 : 0.05;           // 地方は実例が少ないので幅を広く
    var lowM2 = Math.min(perM2 * (1 - spread), minB * fUse * (1 + eq / 100));
    var highM2 = Math.max(perM2 * (1 + spread), maxB * fUse * (1 + eq / 100));
    var rent = perM2 * p.area, plain = perM2Plain * p.area;
    var up = rent - plain * (1 + eq / 100);                  // 直したことで上がった分（設備の加点を除く）
    var payback = p.cost > 0 && up > 0 ? p.cost / (up * 12) : null;
    // これから10年の、1年あたりの下がり方（収支の道具の「家賃が下がる割合」に入れる目安）
    var decline10 = (1 - Math.pow(ageFactor(eff.age + 10, region, struct, p.custom) / fEff, 1 / 10)) * 100;
    return {
      ok: true, region: region, struct: struct, comps: news, baseNewPerM2: base,
      factorAge: fAge, effAge: eff.age, effDetail: eff.detail, renewedShare: eff.renewedShare, factorEff: fEff,
      gainRaw: gainRaw, gain: gain, factorUse: fUse, capped: capped, equipPct: eq,
      perM2: perM2, perM2Plain: perM2Plain, rent: rent, rentPlain: plain, low: lowM2 * p.area, high: highM2 * p.area,
      upByRenovation: up, payback: payback, decline10: decline10
    };
  }

  // ---------------- 5. 修繕計画書 ----------------
  // 周期：国交省「賃貸住宅の計画的な維持管理及び性能向上の推進について」（平成31年3月）図表3-3〜3-6、
  //       国交省「長期修繕計画作成ガイドライン」（令和6年6月改訂）、住宅金融支援機構「維持管理の目安」、日本ガス石油機器工業会（給湯器）。
  // 単価：国交省「賃貸住宅管理業者向け 計画修繕ガイドブック」の実例を延床㎡・戸あたりに割った目安（実例は2件ほどで、同じ外壁でも3倍ちがう）、
  //       RC一棟の大規模修繕は国交省「令和3年度マンション大規模修繕工事に関する実態調査」（延床1㎡あたり1.0〜1.5万円が最多）。
  //       単価が国の資料に無い工事は 0（要見積）にして、表で「要見積」と出す。かならず見積で上書きする。
  // q：数量の決め方。floor＝延床面積（㎡）、unit＝戸数、one＝1式、floor1＝1階の床面積（延床÷階数）
  var PLAN_ITEMS = {
    wood: [
      { id: "gaiheki", name: "外壁の塗装・目地（シーリング）", cycle: 12, range: "11〜15", unit: 5500, q: "floor", src: "ガイドブック 3,700〜7,200円/延床㎡" },
      { id: "yane", name: "屋根の塗装・防水", cycle: 12, range: "11〜15", unit: 1500, q: "floor", src: "ガイドブック 1,200〜1,800円/延床㎡" },
      { id: "ashiba", name: "足場（外壁・屋根の工事と同じ年）", cycle: 12, range: "11〜15", unit: 2250, q: "floor", src: "ガイドブック 1,300〜3,200円/延床㎡" },
      { id: "tetsubu", name: "鉄部の塗装（階段・手すり）", cycle: 7, range: "5〜10", unit: 0, q: "one", src: "周期のみ（単価は要見積）" },
      { id: "bal", name: "ベランダ・廊下・階段の床の防水", cycle: 13, range: "11〜15", unit: 0, q: "one", src: "周期のみ（単価は要見積）" },
      { id: "kyutoki", name: "給湯器の交換", cycle: 10, range: "10〜15", unit: 80000, q: "unit", src: "ガイドブック 8万円/戸（工業会の目安は10年）" },
      { id: "aircon", name: "エアコンの交換", cycle: 12, range: "10〜15", unit: 70000, q: "unit", src: "ガイドブック 7万円/戸" },
      { id: "kitchen", name: "キッチンの交換", cycle: 15, range: "13〜20", unit: 150000, q: "unit", src: "ガイドブック 15万円/戸" },
      { id: "senmen", name: "洗面化粧台の交換", cycle: 18, range: "15〜25", unit: 70000, q: "unit", src: "ガイドブック 7万円/戸" },
      { id: "toilet", name: "トイレの交換", cycle: 20, range: "15〜30", unit: 100000, q: "unit", src: "ガイドブック 10万円/戸" },
      { id: "bath", name: "浴室（ユニットバス）の交換", cycle: 20, range: "20〜25", unit: 220000, q: "unit", src: "ガイドブック 22万円/戸（RCの例）" },
      { id: "intercom", name: "インターホンの交換", cycle: 10, range: "10", unit: 0, q: "unit", src: "周期のみ（単価は要見積）" },
      { id: "pipe", name: "給水管・排水管の交換", cycle: 30, range: "30", unit: 0, q: "one", src: "周期のみ（単価は要見積）" },
      { id: "gaiko", name: "外構（駐車場の舗装・側溝）", cycle: 18, range: "16〜20", unit: 0, q: "one", src: "周期のみ（単価は要見積）" }
    ],
    rc: [
      { id: "daikibo", name: "大規模修繕（外壁・屋上防水・鉄部・足場をまとめて）", cycle: 13, range: "12〜15", unit: 12500, q: "floor", src: "国交省 実態調査 1.0〜1.5万円/延床㎡が最多" },
      { id: "kyutoki", name: "給湯器の交換", cycle: 10, range: "10〜15", unit: 110000, q: "unit", src: "ガイドブック 11万円/戸（室内設備1回分）" },
      { id: "aircon", name: "エアコンの交換", cycle: 12, range: "10〜15", unit: 70000, q: "unit", src: "ガイドブック 7万円/戸（木造の例）" },
      { id: "kitchen", name: "キッチンの交換", cycle: 20, range: "15〜25", unit: 150000, q: "unit", src: "ガイドブック 15万円/戸（木造の例）" },
      { id: "senmen", name: "洗面化粧台の交換", cycle: 20, range: "15〜25", unit: 70000, q: "unit", src: "ガイドブック 7万円/戸（木造の例）" },
      { id: "toilet", name: "トイレの交換", cycle: 20, range: "15〜30", unit: 100000, q: "unit", src: "ガイドブック 10万円/戸（木造の例）" },
      { id: "bath", name: "浴室（ユニットバス）の交換", cycle: 25, range: "20〜25", unit: 220000, q: "unit", src: "ガイドブック 22万円/戸" },
      { id: "intercom", name: "インターホンの交換", cycle: 15, range: "15", unit: 0, q: "unit", src: "周期のみ（単価は要見積）" },
      { id: "pump", name: "給水ポンプの交換", cycle: 15, range: "15", unit: 0, q: "one", src: "周期のみ（単価は要見積）" },
      { id: "pipe", name: "給水管・排水管の交換（共用）", cycle: 30, range: "30", unit: 0, q: "one", src: "周期のみ（単価は要見積）" },
      { id: "ev", name: "エレベーターの取替（ある場合）", cycle: 30, range: "25〜30", unit: 0, q: "one", src: "周期のみ（単価は要見積）", optional: true }
    ],
    kubun: [
      { id: "kyutoki", name: "給湯器の交換", cycle: 10, range: "10", unit: 110000, q: "unit", src: "ガイドブック 11万円/戸" },
      { id: "aircon", name: "エアコンの交換", cycle: 12, range: "10〜15", unit: 70000, q: "unit", src: "ガイドブック 7万円/戸" },
      { id: "kitchen", name: "キッチンの交換", cycle: 18, range: "15〜20", unit: 150000, q: "unit", src: "機構 15〜20年・ガイドブック 15万円/戸" },
      { id: "senmen", name: "洗面化粧台の交換", cycle: 18, range: "15〜20", unit: 70000, q: "unit", src: "機構 15〜20年・ガイドブック 7万円/戸" },
      { id: "toilet", name: "トイレの交換", cycle: 18, range: "15〜20", unit: 100000, q: "unit", src: "機構 15〜20年・ガイドブック 10万円/戸" },
      { id: "bath", name: "浴室（ユニットバス）の交換", cycle: 20, range: "10〜25", unit: 220000, q: "unit", src: "機構 10〜15年／賃貸の表 20年・ガイドブック 22万円/戸" },
      { id: "kanki", name: "換気扇の交換", cycle: 15, range: "10〜20", unit: 0, q: "unit", src: "周期のみ（単価は要見積）" },
      { id: "tategu", name: "室内ドア（建具）の交換", cycle: 15, range: "10〜20", unit: 0, q: "unit", src: "周期のみ（単価は要見積）" },
      { id: "denki", name: "電気設備（コンセント・スイッチ）", cycle: 18, range: "15〜20", unit: 0, q: "unit", src: "周期のみ（単価は要見積）" }
    ],
    kodate: [
      { id: "gaiheki", name: "外壁の塗装・目地（シーリング）", cycle: 15, range: "15〜20", unit: 5500, q: "floor", src: "機構 15〜20年・ガイドブック 3,700〜7,200円/延床㎡（アパートの例）" },
      { id: "yane", name: "屋根の塗装（スレート・金属）", cycle: 15, range: "10〜15", unit: 1500, q: "floor", src: "ガイドブック 1,200〜1,800円/延床㎡（アパートの例）" },
      { id: "ashiba", name: "足場（外壁・屋根の工事と同じ年）", cycle: 15, range: "15〜20", unit: 2250, q: "floor", src: "ガイドブック 1,300〜3,200円/延床㎡（アパートの例）" },
      { id: "amadoi", name: "雨どいの交換", cycle: 25, range: "20〜30", unit: 0, q: "one", src: "周期のみ（単価は要見積）" },
      { id: "shiroari", name: "シロアリの予防", cycle: 5, range: "5〜10", unit: 1000, q: "floor1", src: "修繕の道具の下限 1,000円/1階の床㎡" },
      { id: "kyutoki", name: "給湯器の交換", cycle: 10, range: "10", unit: 110000, q: "unit", src: "ガイドブック 11万円/戸" },
      { id: "aircon", name: "エアコンの交換", cycle: 12, range: "10〜15", unit: 70000, q: "unit", src: "ガイドブック 7万円/戸" },
      { id: "kitchen", name: "キッチンの交換", cycle: 18, range: "15〜20", unit: 150000, q: "unit", src: "機構 15〜20年・ガイドブック 15万円/戸" },
      { id: "senmen", name: "洗面化粧台の交換", cycle: 18, range: "15〜20", unit: 70000, q: "unit", src: "機構 15〜20年" },
      { id: "toilet", name: "トイレの交換", cycle: 18, range: "15〜20", unit: 100000, q: "unit", src: "機構 15〜20年" },
      { id: "bath", name: "浴室（ユニットバス）の交換", cycle: 20, range: "10〜25", unit: 220000, q: "unit", src: "機構 10〜15年／賃貸の表 20年" },
      { id: "pipe", name: "給水管・排水管の交換", cycle: 25, range: "15〜30", unit: 0, q: "one", src: "周期のみ（単価は要見積）" }
    ]
  };
  var KIND_LABEL = { wood: "木造アパート", rc: "RC・鉄骨の一棟マンション", kubun: "区分マンション（部屋の中だけ）", kodate: "戸建て賃貸" };

  // 「直したところ」（見なしの築年数の部位）と、修繕計画の工事のつながり。直した年を、その工事の「前回」に使う
  var PART_OF_ITEM = { kitchen: "water", bath: "water", toilet: "water", senmen: "water",
    kyutoki: "equip", aircon: "equip", intercom: "equip", kanki: "equip", denki: "equip",
    gaiheki: "common", yane: "common", ashiba: "common", tetsubu: "common", bal: "common", daikibo: "common", amadoi: "common",
    tategu: "interior" };

  function qty(item, b) {
    if (item.q === "floor") return b.floor || 0;
    if (item.q === "floor1") return (b.floor || 0) / Math.max(1, b.stories || 2);
    if (item.q === "unit") return b.units || 1;
    return 1;
  }
  /* b = { kind, built(建てた年), start(計画の始めの年), years, floor(延床㎡), units(戸数), stories, inflation(%/年),
           items: { id: { on, last(前回の年), cycle, amount(1回の金額・円。空ならnull＝目安を使う) } },
           done: { partId: 直した年 }（見なしの築年数で入れた「直したところ」）,
           unknown: 'none'＝前回が分からない工事は建てた年から数える（多めに見る）／'cycle'＝周期どおりに直してきたと考える }
     戻り値：rows（年ごと）・items（工事ごと）・合計 */
  function plan(b) {
    var list = PLAN_ITEMS[b.kind] || PLAN_ITEMS.wood;
    var years = Math.max(1, Math.min(60, b.years || 30));
    var start = b.start, end = start + years - 1, inf = (b.inflation || 0) / 100;
    var rows = [];
    for (var y = start; y <= end; y++) rows.push({ year: y, items: [], total: 0, totalNow: 0 });
    var items = list.map(function (it) {
      var o = (b.items && b.items[it.id]) || {};
      var on = o.on != null ? !!o.on : !it.optional;
      var cycle = o.cycle > 0 ? o.cycle : it.cycle;
      var fromPart = b.done && PART_OF_ITEM[it.id] && b.done[PART_OF_ITEM[it.id]];
      var lastSrc = o.last > 0 ? "input" : fromPart ? "part" : b.unknown === "cycle" ? "cycle" : "built";
      var last = o.last > 0 ? o.last : fromPart ? fromPart
        : b.unknown === "cycle" && cycle > 0 ? b.built + Math.max(0, Math.floor((start - b.built - 1) / cycle)) * cycle : b.built;
      var est = it.unit * qty(it, b);
      var amount = o.amount != null && o.amount >= 0 ? o.amount : est;
      var due = [], overdue = false;
      if (on && cycle > 0) {
        var next = last + cycle;
        if (next < start) { overdue = true; next = start; }   // もう替えどきを過ぎている：今年に入れる
        for (var y2 = next; y2 <= end; y2 += cycle) due.push(y2);
      }
      due.forEach(function (y3) {
        var r = rows[y3 - start], amt = amount * Math.pow(1 + inf, y3 - start);
        r.items.push({ id: it.id, name: it.name, amount: amt, needQuote: amount <= 0 });
        r.total += amt; r.totalNow += amount;
      });
      return { id: it.id, name: it.name, on: on, cycle: cycle, range: it.range, last: last, lastSrc: lastSrc, estimate: est, amount: amount,
        custom: o.amount != null && o.amount >= 0, needQuote: amount <= 0, src: it.src, unit: it.unit, q: it.q, qty: qty(it, b), due: due, overdue: overdue, optional: !!it.optional };
    });
    var cum = 0;
    rows.forEach(function (r) { cum += r.total; r.cum = cum; });
    var total = cum;
    return {
      kind: b.kind, start: start, end: end, rows: rows, items: items, total: total,
      perYear: total / years, perMonth: total / years / 12,
      perM2Month: b.floor > 0 ? total / years / 12 / b.floor : null,
      needQuote: items.filter(function (i) { return i.on && i.needQuote; }).map(function (i) { return i.name; }),
      overdue: items.filter(function (i) { return i.on && i.overdue; }).map(function (i) { return i.name; })
    };
  }

  // 区分マンションの修繕積立金を国のガイドラインと比べる（国交省「マンションの修繕積立金に関するガイドライン」令和6年。20階未満・延床5,000㎡未満で 235〜430円/専有㎡・月、平均335）
  var TSUMITATE = { small: [235, 430, 335], mid: [170, 320, 252], large: [200, 330, 271], xl: [190, 325, 255], tower: [240, 410, 338] };
  function tsumitateCheck(yenMonth, m2, size) {
    var g = TSUMITATE[size] || TSUMITATE.small;
    if (!(yenMonth > 0) || !(m2 > 0)) return null;
    var per = yenMonth / m2;
    return { perM2: per, low: g[0], high: g[1], avg: g[2], level: per < g[0] ? "low" : per > g[1] ? "high" : "ok", toAvg: Math.max(0, (g[2] - per) * m2) };
  }

  var API = { BANDS: BANDS, RATES: RATES, REGION_LABEL: REGION_LABEL, PARTS: PARTS, EQUIP: EQUIP, EQUIP_CAP: EQUIP_CAP, GAIN_DAMP: GAIN_DAMP, CAP_RENEWED: CAP_RENEWED,
    PLAN_ITEMS: PLAN_ITEMS, KIND_LABEL: KIND_LABEL, PART_OF_ITEM: PART_OF_ITEM, TSUMITATE: TSUMITATE,
    bandRate: bandRate, ageFactor: ageFactor, effectiveAge: effectiveAge, equipBonus: equipBonus, estimate: estimate, plan: plan, qty: qty, tsumitateCheck: tsumitateCheck };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.CHINRYO = API;
})(this);
