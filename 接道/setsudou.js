/* 接道の特例（建築基準法43条2項）・50戸連たん（都市計画法34条11号）を、市区町村から引く部品。対象の都道府県はデータで決まる。
   ブラウザでは window.Setsudou、node では require('./setsudou.js')。
   データは data/setsudou_data.js（scripts/build_data.py が data/raw_*.json から作る）。
   数字・条件の出どころは 調べもの_接道_*.md。すべて「目安」。最後の判断は特定行政庁（建築指導の窓口）・建築士。 */
(function (root) {
  "use strict";
  var D = null;

  function load(data) { D = data; index(); return api; }

  // 「ヶ・ケ・が」「ッ」などのゆれ・空白をそろえる
  function norm(s) {
    return String(s || "").replace(/[\s　]/g, "").replace(/[ヶケが]/g, "ケ").replace(/[（(].*?[)）]/g, "");
  }

  var NAMES = [];   // { key: そろえた名前, m: 市区町村の行 }
  function index() {
    NAMES = [];
    PREFS = [];
    if (!D) return;
    D.municipalities.forEach(function (m) { if (PREFS.indexOf(m.pref) < 0) PREFS.push(m.pref); });
    D.municipalities.forEach(function (m) { NAMES.push({ key: norm(m.name), m: m }); });
    // 長い名前を先に（同じ位置で始まるときは長い方を選ぶため）
    NAMES.sort(function (a, b) { return b.key.length - a.key.length; });
  }

  var PREFS = [];   // 対象の都道府県（データから作る）
  function prefOf(text) {
    for (var i = 0; i < PREFS.length; i++) if (text.indexOf(PREFS[i]) >= 0) return PREFS[i];
    return null;
  }

  // 住所や市区町村名から、市区町村の行を選ぶ。
  // いちばん前に出てくる名前を選び、同じ位置なら長い名前（「東大和市」と「大和市」、「千葉市中央区」は千葉市）。
  // 戻り値：{ hit: 行 or null, others: 同じ名前のほかの候補, pref: 入力にあった都県, outside: 対象の外の都道府県名 }
  function find(text, prefHint) {
    var raw = String(text || "");
    var t = norm(raw);
    var out = { hit: null, others: [], pref: prefOf(raw) || prefHint, outside: null };   // 入力に書かれた都県を、選んである都県より先に使う
    if (!t) return out;
    // 「東京都府中市」を「東京都府」と読まないよう、都・府は名前を決めうちにする
    var m = raw.replace(/^[\s　]+/, "").match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/);
    if (m && PREFS.indexOf(m[1]) < 0) { out.outside = m[1]; return out; }
    // 都道府県の名前は探す相手から外す（「千葉県ほげ」を千葉市と読まないように）
    var wrote = prefOf(raw);
    if (wrote) { t = t.replace(norm(wrote), ""); if (!t) return out; }
    function scan(stem) {
      var best = null, bestAt = 1e9;
      NAMES.forEach(function (n) {
        if (out.pref && n.m.pref !== out.pref) return;
        // stem のときは「市・区・町・村」を外した名前（2文字以上）で探す（「茅ヶ崎」→茅ヶ崎市）
        var k = stem ? n.key.replace(/[市区町村]$/, "") : n.key;
        if (stem && k.length < 2) return;
        var at = t.indexOf(k);
        if (at < 0) return;
        if (at < bestAt || (at === bestAt && best && n.key.length > best.key.length)) { best = n; bestAt = at; }
      });
      return best;
    }
    var best = scan(false) || scan(true);
    if (!best) return out;
    out.hit = best.m;
    NAMES.forEach(function (n) { if (n.key === best.key && n.m !== best.m) out.others.push(n.m); });
    return out;
  }

  function gyoseicho(id) { return D && D.gyoseicho[id] || null; }

  // 1つの市区町村の答えをまとめる
  function lookup(text, prefHint) {
    var f = find(text, prefHint);
    if (!f.hit) return { ok: false, find: f };
    var m = f.hit;
    var g = gyoseicho(m.g);
    var r = m.r ? gyoseicho(m.r) : g;
    var rentan = r && r.rentan ? r.rentan : null;
    return {
      ok: true, find: f, city: m.name, pref: m.pref,
      gyoseicho: g,
      selfRun: !!(g && (g.name === m.name || g.name.indexOf(m.name + "（") === 0)),  // その市区町村が自分で受け持つか（「野田市（限定特定行政庁）」も含む）
      roadmap: m.map || (g && g.roadmap) || null,   // 市町村ごとの地図があれば、そちらを先に
      rentan: rentan, rentanBy: r && r !== g ? r.name : (g ? g.name : null),
      checked: (g && g.checked) || D.checked
    };
  }

  // 許可の基準1つ（data/kijun の1行）に、入れた条件が合うかの目安。
  // c = { w: 通路の幅m, len: 道路までの長さm, shape: "路線"|"専用", through: 両端が道路につながる, site: "建替え"|"新しい敷地", use: "一戸建て"|"それ以外" }
  // 戻り値 { fit: "ok"（合いそう）|"cond"（条件つき）|"no"（合わない）|"other"（場面がちがう）, why: [理由] }
  function fitKijun(k, c) {
    c = c || {};
    var why = [], fit = "ok";
    function no(s) { fit = "no"; why.push(s); }
    function cond(s) { if (fit === "ok") fit = "cond"; why.push(s); }
    if (k.shape !== "路線" && k.shape !== "専用") {
      return { fit: "other", why: ["この基準は「" + k.title + "」の場合だけ"] };
    }
    if (c.shape && c.shape !== k.shape) no(k.shape === "専用" ? "自分の家だけの専用の通路（旗竿など）向けの基準" : "ほかの家も面している道（通り抜け型・路線型）向けの基準");
    if (c.site && k.site !== "どちらも" && c.site !== k.site) no(k.site === "建替え" ? "前からある建物の敷地での建替えだけ" : "敷地を分ける・新しく使うとき向けの基準");
    var other = c.use === "それ以外";
    if (other && /^一戸建てだけ/.test(k.yoto || "")) no("一戸建てだけの基準");
    else if (other && /^一戸建て[。（]/.test(k.yoto || "")) cond("一戸建て以外は、前と同じ用途の建替えだけ（延べ100㎡以下など）");
    else if (other && /長屋/.test((k.yoto || "").split("。")[0]) && !/共同住宅/.test((k.yoto || "").split("。")[0])) cond("一戸建てか長屋（2戸など）まで。共同住宅は合わない");
    if (k.w && c.w != null && !isNaN(c.w)) {
      var min = other && k.wOther ? k.wOther : k.w[0];
      if (!min) cond("いちばん狭い幅の決まりは資料に書かれていない（窓口で確かめる）");
      if (c.w < min) no("幅が足りない（" + min + "m以上が要る）");
      else if (k.w[1] != null && c.w >= k.w[1]) no("幅が" + k.w[1] + "m以上あるので、上の基準を見る");
    } else if (!k.w && c.w != null && !isNaN(c.w)) cond("通路の幅の決まりは資料に書かれていない（窓口で確かめる）");
    if (c.len != null && !isNaN(c.len)) {
      if (k.len && c.len > k.len) no("通路の長さが" + k.len + "mをこえる");
      if (k.dist && c.len > k.dist) {
        var df = k.distFree || "", none = !df || /書かれていない/.test(df);
        var thru = /両端|通り抜け|行き止まりでなければ/.test(df);
        var otherEx = !none && /防火|耐火|構造|消防|消火|建替え|前からある|認め|4m以上|公共団体|空地|広場|協定/.test(df);  // 通り抜けのほかに外れる条件があるか
        var wf = !none && df.match(/幅が?([0-9.]+)m以上(?:の道)?なら/);   // 「幅3m以上の道なら決まりはない」（立川市・船橋市など）
        if (wf && c.w != null && !isNaN(c.w) && c.w >= +wf[1]) why.push("道の幅が" + wf[1] + "m以上なので、" + k.dist + "mの決まりは外れる：" + df);
        else if (c.through && thru) cond("道路まで" + k.dist + "mをこえるが、通り抜けできれば制限が外れることがある：" + df);
        else if (otherEx) cond("道路まで" + k.dist + "mをこえる：" + df);
        else if (k.distSoft) cond("道路まで" + k.dist + "mをこえる（" + k.dist + "mは原則の長さ。窓口で確かめる）：" + df);
        else no("道路まで" + k.dist + "mをこえる" + (thru ? "（通り抜けできない道）" : ""));
      }
    }
    if (fit === "ok" && k.only && !(c.through && /両端|通り抜け/.test(k.only))) cond(k.only);
    if (fit !== "no" && k.kind === "個別") why.push("建築審査会に1件ずつかける基準（包括同意ではない）");
    return { fit: fit, why: why };
  }

  // いまの状況から、どの欄を見ればよいかの目安（法43条の形だけ。建てられるかは言わない）。
  // c = { road: "道路"|"2項"|"非道路"|"不明", contact: "2m以上"|"2m未満"|"不明", width: "4m以上"|"4m未満"|"不明", chosei: "はい"|"いいえ"|"不明" }
  // 戻り値 { key, t: 題, d: 説明, go: 移る欄のid, shape: 許可の基準をしぼるときの形, notes: [追加の注意] }
  function triage(c) {
    c = c || {};
    var notes = [], r;
    if (c.chosei === "はい") notes.push("市街化調整区域なので、接道とは別に、開発許可の決まり（04の欄）も確かめます。");
    else if (c.chosei === "不明") notes.push("市街化調整区域かどうかは、都市計画図か役所の窓口で確かめます。調整区域なら開発許可の決まりも関係します。");
    if (c.road === "不明" || !c.road) r = { key: "road", t: "まず、前の道の種類を確かめる", d: "建築基準法の道路かどうかで、使う制度が変わります。見た目では決まらないので、役所の地図と窓口で確かめます。", go: "s1" };
    else if (c.contact === "不明" || !c.contact) r = { key: "contact", t: "次に、道に接している長さを測る", d: "敷地が道に接している長さが2m以上あるかで、見る欄が変わります。いちばん狭い所を測ります。", go: "s6" };
    else if (c.road === "非道路") {
      if (c.width === "不明" || !c.width) r = { key: "width", t: "次に、道の幅を測る", d: "幅が4m以上あるかで、認定（1号）か許可（2号）かの入口が変わります。", go: "s6" };
      else if (c.width === "4m以上" && c.contact === "2m以上") r = { key: "nintei", t: "認定（43条2項1号）の基準を先に見る", d: "幅4m以上の道に2m以上接する形です。ただし、国の基準に合う道か、建物の用途と規模が枠に入るかの条件があります。合わなければ許可（2号）を見ます。", go: "s2" };
      else r = { key: "kyoka", t: "許可（43条2項2号）の基準を見る", d: c.contact === "2m未満" ? "道に接する長さが足りない形です。旗竿の通路の基準を見ます。" : "幅4m未満の道に接する形です。ほかの家も面する道の基準を見ます。", go: "kj", shape: c.contact === "2m未満" ? "専用" : "路線" };
    }
    else if (c.contact === "2m未満") r = { key: "kyoka", t: "許可（43条2項2号）の基準を見る", d: "道路に接する長さが足りない形です。旗竿の通路の基準を見ます。", go: "kj", shape: "専用" };
    else if (c.road === "2項") r = { key: "setback", t: "43条の特例の話ではなさそうです（セットバックの形）", d: "2項道路に2m以上接する形です。ふつうは道の中心から2m下がった線が道の境界とみなされ、その分だけ敷地を小さく使います。下がる線は役所で確かめます。", go: "s1" };
    else r = { key: "normal", t: "43条の特例の話ではなさそうです", d: "建築基準法の道路に2m以上接する形です。ただし、大きな建物や長い通路の敷地は、条例で2mより厳しいことがあります。", go: "s1" };
    r.notes = notes;
    return r;
  }

  // 対象の都道府県
  function prefs() { return PREFS.slice(); }

  // 入力欄の候補（都県ごと）
  function names(pref) {
    if (!D) return [];
    return D.municipalities.filter(function (m) { return !pref || m.pref === pref; }).map(function (m) { return m.name; });
  }

  var api = { load: load, find: find, lookup: lookup, names: names, norm: norm, gyoseicho: gyoseicho, fitKijun: fitKijun, triage: triage, prefs: prefs,
    data: function () { return D; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.Setsudou = api;
    if (root.SETSUDOU_DATA) load(root.SETSUDOU_DATA);
  }
})(this);
