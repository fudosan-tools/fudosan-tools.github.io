/* マイソク（販売図面）づくり：物件資料の文から項目を取り出す道具と、広告のルールの確認。
   ブラウザでは window.MAISOKU、node では require("./parse.js") で使う。外へは何も送らない。
   読み取りは「決まった言い回し」を探す規則で行う（AIや外のサービスは使わない）。 */
(function (root) {
  "use strict";
  var TSUBO = 3.30578;          // 1坪＝3.30578㎡
  var TATAMI = 1.62;            // 1畳＝1.62㎡以上（表示規約施行規則 第9条(16)）

  /* ---------- 1. 文字をそろえる（全角→半角、㎡の書き方をそろえる） ---------- */
  function norm(s) {
    s = String(s || "");
    s = s.replace(/\r\n?/g, "\n");
    // 全角の英数字・記号を半角に（かっこ（）は日本語の文に多いので、そのまま残す）
    s = s.replace(/[\uFF01-\uFF07\uFF0A-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/　/g, " ").replace(/[‐‑‒–−]/g, "-");
    s = s.replace(/ /g, " ");
    // 面積の単位：m2 / m² / 平米 / 平方メートル → ㎡
    s = s.replace(/(\d)\s*(?:m\^?2|m²|M2|M²|平米|平方メートル|平方m|平方M)(?![A-Za-z0-9])/g, "$1㎡");
    s = s.replace(/(\d)\s*m\s*㎡/g, "$1㎡");
    s = s.replace(/(ヵ月|カ月|か月|ケ月|箇月|ヶ月)/g, "ヶ月");
    s = s.replace(/帖/g, "畳");
    s = s.replace(/[“”"]/g, "\"");
    return s;
  }
  function num(s) { if (s == null) return null; var n = parseFloat(String(s).replace(/,/g, "")); return isNaN(n) ? null : n; }

  /* ---------- 2. 値の読み方（項目ごと） ---------- */
  // お金 → 円。例：「3,980万円」「1億2,500万円」「8.5万円」「125,000円」「12万5000円」「なし」
  function parseYen(s) {
    s = norm(s).replace(/\s+/g, "");
    if (!s) return null;
    if (/^(なし|無し|無|不要|0円|-|―|—|ゼロ)$/.test(s) || /^(なし|無し|不要)/.test(s)) return 0;
    var m = s.match(/(\d[\d,]*(?:\.\d+)?)億(?:(\d[\d,]*(?:\.\d+)?)万)?/);
    if (m) return Math.round(num(m[1]) * 1e8 + (m[2] ? num(m[2]) * 1e4 : 0));
    m = s.match(/(\d[\d,]*(?:\.\d+)?)万(\d[\d,]*)?円?/);
    if (m) return Math.round(num(m[1]) * 1e4 + (m[2] ? num(m[2]) : 0));
    m = s.match(/(\d[\d,]*)円/);
    if (m) return num(m[1]);
    m = s.match(/^(\d[\d,]*(?:\.\d+)?)/);
    if (m) return num(m[1]);
    return null;
  }
  // 価格 → 万円（単位が無い小さい数は万円とみなす）
  function parseMan(s) {
    var t = norm(s).replace(/\s+/g, "");
    if (!/\d/.test(t)) return null;
    var y = parseYen(t);
    if (y == null) return null;
    if (!/[万億円]/.test(t) && y < 100000) return y;        // 「3980」→ 3980万円
    return Math.round(y / 1e4 * 100) / 100;
  }
  // 賃料など → 円（単位の無い小さい数（100未満）は万円とみなす）
  function parseRentYen(s) {
    var t = norm(s).replace(/\s+/g, "");
    if (!/\d/.test(t) && !/なし|無/.test(t)) return null;
    var y = parseYen(t);
    if (y == null) return null;
    if (!/[万億円]/.test(t) && y > 0 && y < 100) return Math.round(y * 1e4);
    return y;
  }
  // 面積 → ㎡。「65.12㎡（19.69坪）」「30.25坪」「1階50.0㎡ 2階48.3㎡ 延床98.3㎡」
  function parseArea(s) {
    s = norm(s);
    var m = s.match(/(?:合計|延床|延べ床|延|計)[^\d]{0,6}(\d[\d,]*(?:\.\d+)?)\s*㎡/);
    if (m) return num(m[1]);
    var floors = s.match(/\d\s*階[^\d]{0,3}\d[\d,]*(?:\.\d+)?\s*㎡/g);
    if (floors && floors.length >= 2) {
      var sum = 0;
      floors.forEach(function (f) { var x = f.match(/(\d[\d,]*(?:\.\d+)?)\s*㎡$/); sum += num(x[1]); });
      return Math.round(sum * 100) / 100;
    }
    m = s.match(/(\d[\d,]*(?:\.\d+)?)\s*㎡/);
    if (m) return num(m[1]);
    m = s.match(/(\d[\d,]*(?:\.\d+)?)\s*坪/);
    if (m) return Math.round(num(m[1]) * TSUBO * 100) / 100;
    return null;
  }
  function areaNote(s) {
    s = norm(s);
    if (/壁芯|壁心/.test(s)) return "壁芯";
    if (/登記|内法/.test(s)) return "登記";
    if (/実測/.test(s)) return "実測";
    if (/公簿/.test(s)) return "公簿";
    return "";
  }
  // 年月 → "YYYY-MM"（月が分からなければ "YYYY"）。和暦も西暦にする。
  var ERA = { "明治": 1868, "大正": 1912, "昭和": 1926, "平成": 1989, "令和": 2019, M: 1868, T: 1912, S: 1926, H: 1989, R: 2019 };
  function eraYear(era, n) { return ERA[era] + (n === "元" ? 1 : parseInt(n, 10)) - 1; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function parseYM(s) {
    s = norm(s);
    var y = null, mo = null, rest = "", m;
    if ((m = s.match(/(\d{4})\s*[.\/-]\s*(\d{1,2})(?!\d)/))) { y = +m[1]; mo = +m[2]; }
    else if ((m = s.match(/(明治|大正|昭和|平成|令和|(?:^|[^A-Za-z])[MTSHR])\s*(元|\d{1,2})\s*[.\/-]\s*(\d{1,2})(?!\d)/))) {
      y = eraYear(m[1].replace(/[^明治大正昭和平成令和MTSHR]/g, ""), m[2]); mo = +m[3];
    } else if ((m = s.match(/(\d{4})\s*年/))) { y = +m[1]; rest = s.slice(m.index + m[0].length); }
    else if ((m = s.match(/(明治|大正|昭和|平成|令和|(?:^|[^A-Za-z])[MTSHR])\s*(元|\d{1,2})\s*年/))) {
      y = eraYear(m[1].replace(/[^明治大正昭和平成令和MTSHR]/g, ""), m[2]); rest = s.slice(m.index + m[0].length);
    }
    if (y == null) return null;
    if (mo == null) { var mm = rest.replace(/[（(][^)）]*[)）]/g, "").match(/^\s*[^\d]{0,4}?(\d{1,2})\s*月/); if (mm) mo = +mm[1]; }
    if (y < 1868 || y > 2100) return null;
    if (mo != null && (mo < 1 || mo > 12)) mo = null;
    return mo ? y + "-" + pad2(mo) : String(y);
  }
  function parsePercents(s) { var out = [], re = /(\d+(?:\.\d+)?)\s*%/g, m; s = norm(s); while ((m = re.exec(s))) out.push(num(m[1])); return out; }
  function parseMadori(s) {
    s = norm(s);
    if (/ワンルーム/.test(s)) return "1R";
    var m = s.match(/(?:^|[^0-9A-Za-z])(\d{1,2})\s*(SLDK|LDK|SDK|SLK|DK|LK|K|R)(\s*\+\s*(?:S|N|納戸|サービスルーム|WIC|ロフト|WTC|SIC))?(?![A-Za-z])/i);
    if (!m) return null;
    return m[1] + m[2].toUpperCase() + (m[3] ? m[3].replace(/\s/g, "") : "");
  }
  function parseStructure(s) {
    s = norm(s);
    if (/鉄骨鉄筋コンクリート|SRC/i.test(s)) return "鉄骨鉄筋コンクリート造（SRC造）";
    if (/鉄筋コンクリート|(?:^|[^S])RC/i.test(s)) return "鉄筋コンクリート造（RC造）";
    if (/軽量鉄骨/.test(s)) return "軽量鉄骨造";
    if (/重量鉄骨|鉄骨造|(?:^|[^A-Z])S造/.test(s)) return "鉄骨造（S造）";
    if (/ALC/i.test(s)) return "ALC造";
    if (/木造|W造|ツーバイフォー|2×4|2x4/i.test(s)) return "木造";
    if (/ブロック/.test(s)) return "コンクリートブロック造";
    return null;
  }
  function parseDirection(s) {
    s = norm(s);
    var m = s.match(/(南東|南西|北東|北西|東南|西南|東北|西北|南|北|東|西)/);
    if (!m) return null;
    return { "東南": "南東", "西南": "南西", "東北": "北東", "西北": "北西" }[m[1]] || m[1];
  }
  function parseTaiyo(s) {
    s = norm(s);
    var cands = [["売主", /売主/], ["貸主", /貸主/], ["代理", /代理/], ["媒介（仲介）", /専属専任|専任|一般媒介|媒介|仲介/]];
    var best = null, pos = 1e9;
    cands.forEach(function (c) { var m = s.match(c[1]); if (m && m.index < pos) { pos = m.index; best = c[0]; } });
    return best;
  }
  var YOUTO = [
    ["第一種低層住居専用地域", /第?[一1]種?低層住居専用(?:地域)?|[一1]低層|[一1]種低層/],
    ["第二種低層住居専用地域", /第?[二2]種?低層住居専用(?:地域)?|[二2]低層|[二2]種低層/],
    ["第一種中高層住居専用地域", /第?[一1]種?中高層住居専用(?:地域)?|[一1]中高|[一1]種中高層/],
    ["第二種中高層住居専用地域", /第?[二2]種?中高層住居専用(?:地域)?|[二2]中高|[二2]種中高層/],
    ["田園住居地域", /田園住居(?:地域)?/],
    ["準住居地域", /準住居(?:地域)?/],
    ["第一種住居地域", /第?[一1]種住居(?:地域)?|[一1]住居/],
    ["第二種住居地域", /第?[二2]種住居(?:地域)?|[二2]住居/],
    ["近隣商業地域", /近隣商業(?:地域)?|近商/],
    ["商業地域", /商業地域|商業/],
    ["準工業地域", /準工業(?:地域)?|準工/],
    ["工業専用地域", /工業専用(?:地域)?|工専/],
    ["工業地域", /工業地域|工業/],
    ["市街化調整区域", /市街化調整区域|調整区域/]
  ];
  function parseYouto(s) {
    s = norm(s);
    var found = [];
    YOUTO.forEach(function (y) {
      var m = s.match(y[1]);
      if (m) { found.push([m.index, y[0]]); s = s.slice(0, m.index) + "＿".repeat(m[0].length) + s.slice(m.index + m[0].length); }
    });
    found.sort(function (a, b) { return a[0] - b[0]; });
    return found.length ? found.map(function (f) { return f[1]; }).join("・") : null;
  }
  // 交通：「JR山手線「渋谷」駅 徒歩7分」「○○駅歩5分（約400m）」を何本でも
  var ACCESS_RE = /(?:([^\s「『"、,。\/／|：:()（）]{1,20}?線)\s*[\/／・]?\s*)?[「『"]?([^\s「」『』"、,。\/／|：:()（）]{1,15}?)[」』"]?\s*駅?\s*(?:から|より|まで)?\s*(?:徒歩|歩)\s*約?\s*(\d{1,2})\s*分(?:\s*[（(]?\s*(?:約|道路距離)?\s*(\d[\d,]*)\s*m\s*[)）]?)?/g;
  function parseAccess(s) {
    s = norm(s);
    var out = [], m;
    ACCESS_RE.lastIndex = 0;
    while ((m = ACCESS_RE.exec(s))) {
      var sta = m[2].replace(/駅$/, "");
      if (/^(停|バス停|停留所)$/.test(sta) || /バス|停$/.test(sta)) continue;   // バスは別の書き方として残す
      if (/徒歩|^歩$|分$|^駅$/.test(sta)) sta = "";                            // 「徒歩\t駅から徒歩12分」のような見出しの取りちがえ
      out.push({ line: m[1] || "", sta: sta, walk: +m[3], dist: m[4] ? num(m[4]) : null });
    }
    return out;
  }
  function parseFloors(s) {
    s = norm(s);
    var r = {}, m;
    if ((m = s.match(/(?:地上)?\s*(\d{1,2})\s*階建/))) r.floors = +m[1];
    if ((m = s.match(/(\d{1,2})\s*階建[^\d]{0,4}?[\/／]\s*(\d{1,2})\s*階/))) r.floor = +m[2];
    else if ((m = s.match(/(\d{1,2})\s*階\s*[\/／]\s*[^\d\n]{0,6}?\s*\d{1,2}\s*階建/))) r.floor = +m[1];
    else if ((m = s.match(/\d{1,2}\s*階建て?の\s*(\d{1,2})\s*階/))) r.floor = +m[1];
    else if ((m = s.match(/(\d{1,2})\s*階部分/))) r.floor = +m[1];
    else if ((m = s.match(/所在階\s*[:：]?\s*(\d{1,2})\s*階/))) r.floor = +m[1];
    if ((m = s.match(/地下\s*(\d)\s*階/))) r.basement = +m[1];
    return r;
  }
  // 部屋ごとの畳数：「LDK15.2畳」「洋室 6.0畳」
  var ROOM_RE = /(LDK|SDK|DK|LK|K|洋室|和室|寝室|居間|リビング・ダイニング|リビングダイニング|リビング|ダイニング|キッチン|納戸|サービスルーム|S)\s*(?:約)?\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:畳|J|jo)(?![a-z])/g;
  function parseRooms(s) {
    s = norm(s);
    var out = [], m;
    ROOM_RE.lastIndex = 0;
    while ((m = ROOM_RE.exec(s))) out.push({ room: m[1], jo: num(m[2]) });
    return out;
  }

  /* ---------- 3. 見出し（ラベル）の一覧 ---------- */
  var LABELS = [
    ["name", "物件名|建物名|マンション名|物件名称|名称"],
    ["address", "所在地|住所|所在"],
    ["access", "交通|最寄駅|最寄り駅|沿線・駅|沿線|アクセス|交通機関"],
    ["sta", "駅名|駅"],
    ["walk", "徒歩分|徒歩"],
    ["price", "販売価格|売買価格|価格"],
    ["rent", "月額賃料|賃料|家賃"],
    ["combo_kanri_shuzen", "管理費[\\/／・]修繕積立金|管理費等[\\/／・]修繕積立金"],
    ["combo_kanri_kyoeki", "管理費[\\/／・]共益費|管理費・共益費|共益費[\\/／・]管理費"],
    ["kanrihi", "管理費等|管理費"],
    ["kyoeki", "共益費"],
    ["shuzen", "修繕積立金"],
    ["combo_shiki_rei", "敷金[\\/／・]礼金"],
    ["shikikin", "敷金"],
    ["reikin", "礼金"],
    ["hoshokin", "保証金"],
    ["shikibiki", "敷引き|敷引|償却"],
    ["senyu", "専有面積|使用部分面積|占有面積"],
    ["land", "土地面積|敷地面積|地積"],
    ["bldg", "建物面積|延床面積|延べ床面積|延面積"],
    ["area_generic", "面積"],
    ["balcony", "バルコニー面積|バルコニー"],
    ["madoriDetail", "間取り詳細|間取り内訳|間取り\\(内訳\\)|間取内訳"],
    ["madori", "間取り|間取"],
    ["combo_floors", "階建[\\/／]階|階建て[\\/／]階|所在階[\\/／]階建|階数[\\/／]所在階"],
    ["floor", "所在階|階部分"],
    ["floors", "建物階数|階建て|階建|階数"],
    ["structure", "建物構造|構造"],
    ["built", "築年月|建築年月|完成年月|完成時期|竣工年月|竣工|築年"],
    ["direction", "主要採光面|バルコニー向き|向き|方位|方角"],
    ["units", "総戸数"],
    ["combo_kenpei_yoseki", "建ぺい率[\\/／・]容積率|建蔽率[\\/／・]容積率"],
    ["youto", "用途地域"],
    ["kenpei", "建ぺい率|建蔽率"],
    ["yoseki", "容積率"],
    ["road", "接道状況|接道|前面道路"],
    ["genkyo", "現況"],
    ["hikiwatashi", "引渡し可能年月|引渡可能時期|引渡し時期|引渡時期|引渡し|引渡|入居可能時期|入居可能日|入居時期|入居日|入居"],
    ["taiyo", "取引態様|取引形態"],
    ["parking", "駐車場"],
    ["setsubi", "設備・条件|設備・仕様|主な設備|設備"],
    ["biko", "備考|特記事項|その他"],
    ["chimoku", "地目"],
    ["shido", "私道負担面積|私道負担"],
    ["kenri", "土地権利|土地の権利|敷地の権利形態|敷地権利|権利形態"],
    ["kanriKeitai", "管理形態|管理方式|管理会社・形態"],
    ["hoken", "損害保険|火災保険|住宅保険"],
    ["hoshoKaisha", "保証会社|家賃保証"],
    ["keiyaku", "契約期間"],
    ["koshin", "更新料"],
    ["teikiLabel", "定期借家|定期建物賃貸借"],
    ["sonota", "その他費用|その他初期費用|その他の費用"],
    ["yukoKigen", "取引条件の有効期限|有効期限"],
    ["hourei", "法令上の制限|法令制限|その他制限|その他の制限"],
    ["catch", "セールスポイント|アピールポイント|おすすめポイント|PR|コメント"]
  ];
  var labelList = [];
  LABELS.forEach(function (l) { l[1].split("|").forEach(function (w) { labelList.push([l[0], w]); }); });
  labelList.sort(function (a, b) { return b[1].replace(/\\/g, "").length - a[1].replace(/\\/g, "").length; });
  var LABEL_RE = new RegExp("(^|[\\s|【■●◆□◇・/／\\[])(" + labelList.map(function (l) { return l[1]; }).join("|") +
    ")(?:\\s*[\\(（][^)）\\n]{0,12}[\\)）])?(?=\\s*(?:[:：\\t】\\]]|\\s|$|\\d))", "gm");
  function labelKey(word) {
    for (var i = 0; i < labelList.length; i++) { if (new RegExp("^(?:" + labelList[i][1] + ")$").test(word)) return labelList[i][0]; }
    return null;
  }

  // 文を「見出し → 値」に分ける
  function splitLabels(text) {
    var lines = text.split("\n");
    var hits = [];   // {key, line, start, end}
    lines.forEach(function (ln, li) {
      LABEL_RE.lastIndex = 0;
      var m;
      while ((m = LABEL_RE.exec(ln))) {
        var start = m.index + m[1].length;
        var k = labelKey(m[2]);
        if (k) hits.push({ key: k, word: m[2], li: li, start: start, end: m.index + m[0].length });
        if (m[0].length === 0) LABEL_RE.lastIndex++;
      }
    });
    var pairs = [];
    hits.forEach(function (h, i) {
      var next = hits[i + 1];
      var ln = lines[h.li];
      var stop = next && next.li === h.li ? next.start : ln.length;
      var v = ln.slice(h.end, stop).replace(/^[\s:：\t】\]]+/, "").replace(/[\s|【■●◆]+$/, "");
      if (!v) {
        // 値が次の行にある（レインズやポータルからのコピーに多い）
        var li = h.li + 1, buf = [];
        while (li < lines.length && (!next || li < next.li || (li === next.li && next.start > 0))) {
          var t = lines[li];
          if (next && li === next.li) t = t.slice(0, next.start);
          t = t.trim();
          if (t) { buf.push(t); if (!/^(setsubi|biko|access|catch|madoriDetail|sonota|hourei|road)$/.test(h.key)) break; }
          if (next && li === next.li) break;
          li++;
          if (buf.length >= 6) break;
        }
        v = buf.join(" ");
      }
      pairs.push({ key: h.key, word: h.word, value: v.trim() });
    });
    return pairs;
  }

  /* ---------- 4. まとめて読む ---------- */
  function parse(raw) {
    var text = norm(raw);
    var d = {}, found = {};
    function set(k, v) { if (v == null || v === "" || (typeof v === "number" && isNaN(v))) return; if (d[k] == null || d[k] === "") { d[k] = v; found[k] = true; } }
    var pairs = splitLabels(text);
    var get = function (k) { for (var i = 0; i < pairs.length; i++) if (pairs[i].key === k && pairs[i].value) return pairs[i].value; return null; };
    var allOf = function (k) { return pairs.filter(function (p) { return p.key === k && p.value; }).map(function (p) { return p.value; }); };

    // 種類（売買の種別・賃貸）
    var isRent = !!(get("rent") || /(賃料|家賃)\s*[:：]?\s*\d/.test(text) || /貸主|賃貸(?:マンション|アパート|物件)|貸家/.test(text));
    var kind = null;
    if (isRent) kind = "rent";

    pairs.forEach(function (p) {
      var v = p.value;
      switch (p.key) {
        case "name": set("name", v.slice(0, 60)); break;
        case "address": set("address", v.replace(/\s*(地図|MAP|周辺地図).*$/i, "").slice(0, 80)); break;
        case "price": set("price", parseMan(v)); break;
        case "rent": set("rent", parseRentYen(v)); break;
        case "kanrihi": set("kanrihi", parseRentYen(v)); break;
        case "kyoeki": set("kyoeki", parseRentYen(v)); break;
        case "shuzen": set("shuzen", parseRentYen(v)); break;
        case "combo_kanri_shuzen": {
          var ys = v.split(/[\/／・]/); set("kanrihi", parseRentYen(ys[0])); if (ys[1]) set("shuzen", parseRentYen(ys[1])); break; }
        case "combo_kanri_kyoeki": set("kanrihi", parseRentYen(v.split(/[\/／]/)[0])); break;
        case "combo_shiki_rei": { var sr = v.split(/[\/／・]/); set("shikikin", depText(sr[0])); if (sr[1]) set("reikin", depText(sr[1])); break; }
        case "shikikin": set("shikikin", depText(v)); break;
        case "reikin": set("reikin", depText(v)); break;
        case "hoshokin": set("hoshokin", depText(v)); break;
        case "shikibiki": set("shikibiki", depText(v)); break;
        case "senyu": set("senyu", parseArea(v)); set("senyuNote", areaNote(v)); break;
        case "land": set("land", parseArea(v)); set("landNote", areaNote(v)); break;
        case "bldg": set("bldg", parseArea(v)); break;
        case "area_generic": break;   // 種類が決まってから
        case "balcony": set("balcony", parseArea(v)); break;
        case "madori": set("madori", parseMadori(v) || v.slice(0, 20)); break;
        case "madoriDetail": set("madoriDetail", v.slice(0, 120)); break;
        case "combo_floors": case "floor": case "floors": {
          var f = parseFloors((p.key === "floor" ? "所在階 " : "") + v + (p.key === "floors" && /^\d+$/.test(v.trim()) ? "階建" : "") + (p.word === "階部分" ? "階部分" : ""));
          if (p.key === "combo_floors") {
            var nums = v.match(/\d{1,2}/g) || [];
            if (f.floors == null && nums.length >= 2) { if (/所在階[\/／]階建/.test(p.word)) { f.floor = +nums[0]; f.floors = +nums[1]; } else { f.floors = +nums[0]; f.floor = +nums[1]; } }
          }
          if (p.key === "floor" && f.floor == null) { var fm = v.match(/(\d{1,2})\s*階?/); if (fm) f.floor = +fm[1]; }
          set("floors", f.floors); set("floor", f.floor); if (f.basement) set("basement", f.basement);
          break; }
        case "structure": set("structure", parseStructure(v) || v.slice(0, 30)); {
          var ff = parseFloors(v); set("floors", ff.floors); set("floor", ff.floor); } break;
        case "built": set("built", parseYM(v)); break;
        case "direction": set("direction", parseDirection(v)); break;
        case "units": { var u = norm(v).match(/(\d+)\s*戸?/); if (u) set("units", +u[1]); break; }
        case "combo_kenpei_yoseki": { var pc = parsePercents(v); set("kenpei", pc[0]); set("yoseki", pc[1]); break; }
        case "youto": set("youto", parseYouto(v) || v.slice(0, 40)); break;
        case "kenpei": set("kenpei", parsePercents(v)[0]); break;
        case "yoseki": set("yoseki", parsePercents(v)[0]); break;
        case "road": set("road", v.slice(0, 80)); break;
        case "genkyo": set("genkyo", v.slice(0, 30)); break;
        case "hikiwatashi": set("hikiwatashi", v.slice(0, 30)); break;
        case "taiyo": set("taiyo", parseTaiyo(v) || v.slice(0, 20)); break;
        case "parking": set("parking", v.slice(0, 50)); break;
        case "setsubi": set("setsubi", v.slice(0, 300)); break;
        case "biko": set("biko", v.slice(0, 300)); break;
        case "chimoku": set("chimoku", v.slice(0, 20)); break;
        case "shido": set("shido", v.slice(0, 40)); break;
        case "kenri": set("kenri", v.slice(0, 30)); break;
        case "kanriKeitai": set("kanriKeitai", v.slice(0, 40)); break;
        case "hoken": set("hoken", v.slice(0, 40)); break;
        case "hoshoKaisha": set("hoshoKaisha", v.slice(0, 40)); break;
        case "keiyaku": set("keiyaku", v.slice(0, 30)); break;
        case "koshin": set("koshin", v.slice(0, 30)); break;
        case "teikiLabel": if (!/なし|無|×|普通/.test(v)) set("teiki", true); break;
        case "sonota": set("sonota", v.slice(0, 120)); break;
        case "yukoKigen": { var yk = parseYMD(v); set("yukoKigen", yk || v.slice(0, 20)); break; }
        case "hourei": set("hourei", v.slice(0, 120)); break;
        case "catch": set("catch", v.slice(0, 120)); break;
        case "access": if (/線$/.test(v.trim()) && !/徒歩|歩\s*\d/.test(v)) set("line1", v.trim()); break;
        case "sta": if (!/徒歩|分/.test(v)) set("sta1", v.trim().replace(/^[「『]|[」』]?駅?$/g, "")); break;
        case "walk": { var wm = norm(v).match(/(\d{1,2})\s*分/) || norm(v).match(/^(\d{1,2})$/); if (wm) set("walk1", +wm[1]); break; }
      }
    });

    // 交通（見出しの値 → だめなら全文から）
    var accSrc = allOf("access").join("\n");
    var acc = parseAccess(accSrc);
    if (!acc.length) acc = parseAccess(text);
    acc.slice(0, 2).forEach(function (a, i) {
      var n = i + 1;
      set("line" + n, a.line); set("sta" + n, a.sta); set("walk" + n, a.walk); if (a.dist != null) set("dist" + n, a.dist);
    });
    if (/バス/.test(accSrc || text)) {
      var bm = (accSrc || text).match(/[^\n]*バス[^\n]*/);
      if (bm) set("accessNote", bm[0].trim().slice(0, 60));
    }
    // 駅までの距離が別に書いてある場合「駅まで約560m」
    if (d.walk1 != null && d.dist1 == null) { var dm = text.match(/駅まで\s*(?:約|道路距離)?\s*(\d[\d,]*)\s*m(?![a-z²])/); if (dm) set("dist1", num(dm[1])); }

    // 見出しが無いメモ書きでも拾えるもの（全文から）
    if (d.madori == null) set("madori", parseMadori(text));
    if (d.structure == null) set("structure", parseStructure(text.replace(/[A-Za-z]+線/g, "")));
    if (d.built == null) {
      var bm2 = text.match(/(?:築年月|建築年月|完成)[^\n]{0,20}|[^\n\s]{0,12}(?:年|[.\/]\d{1,2})\s*\d{0,2}\s*月?\s*築/);
      if (bm2) set("built", parseYM(bm2[0]));
    }
    if (d.floors == null || d.floor == null) { var fl = parseFloors(text); set("floors", fl.floors); set("floor", fl.floor); }
    if (d.direction == null) { var dr = text.match(/(南東|南西|北東|北西|東南|西南|南|北|東|西)\s*向き/); if (dr) set("direction", parseDirection(dr[1])); }
    if (d.taiyo == null) { var tm = text.match(/(売主|貸主|代理|専属専任媒介|専任媒介|一般媒介|媒介|仲介)/); if (tm) set("taiyo", parseTaiyo(tm[1])); }
    if (d.youto == null) { var yt = text.match(/[^\n]{0,4}(低層住居専用|中高層住居専用|住居地域|商業地域|工業地域|準工業|市街化調整区域)[^\n]{0,4}/); if (yt) set("youto", parseYouto(yt[0])); }
    if (d.kenpei == null) { var kp = text.match(/建[ぺ蔽]い?率\s*[:：]?\s*(\d+)\s*%/); if (kp) set("kenpei", +kp[1]); }
    if (d.yoseki == null) { var yo = text.match(/容積率\s*[:：]?\s*(\d+)\s*%/); if (yo) set("yoseki", +yo[1]); }
    if (!isRent && d.price == null) { var pm = text.match(/(?:価格|売出|販売)?\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?億(?:\d[\d,]*万)?円?|\d[\d,]{2,}(?:\.\d+)?万円)/); if (pm) set("price", parseMan(pm[1])); }
    if (isRent && d.rent == null) { var rm = text.match(/(?:賃料|家賃)\s*[:：]?\s*(\d[\d,]*(?:\.\d+)?\s*万?円?)/); if (rm) set("rent", parseRentYen(rm[1])); }
    if (d.units == null) { var um = text.match(/総戸数\s*[:：]?\s*(\d+)/); if (um) set("units", +um[1]); }
    if (/定期借家|定期建物賃貸借/.test(text) && !/定期借家\s*[:：]?\s*(なし|無|×)/.test(text)) set("teiki", true);
    if (/未入居/.test(text)) set("minyukyo", true);
    if (/連棟/.test(text)) set("rento", true);

    // 部屋ごとの畳数
    if (d.madoriDetail == null) {
      var rooms = parseRooms(text);
      if (rooms.length) set("madoriDetail", rooms.map(function (r) { return r.room + " " + r.jo + "畳"; }).join(" / "));
    }

    // 種類を決める
    if (!kind) {
      if (/売地|土地売|建築条件付|古家付土地/.test(text) && d.bldg == null && d.senyu == null) kind = "land";
      else if (d.bldg != null || /一戸建|戸建|一棟/.test(text)) kind = "house";
      else if (d.senyu != null || /マンション/.test(text)) kind = "mansion";
      else if (d.land != null) kind = "land";
      else kind = "mansion";
    }
    // 「面積」とだけ書いてあるもの
    var ag = get("area_generic");
    if (ag) {
      var av = parseArea(ag);
      if (kind === "land") set("land", av); else if (kind === "house" && d.land != null) set("bldg", av); else set("senyu", av);
    }
    // 見出しが無いメモ：㎡の数が1つだけならその種類の面積へ
    if (d.senyu == null && d.land == null && d.bldg == null) {
      var am = text.match(/(\d[\d,]*(?:\.\d+)?)\s*㎡/g) || [];
      var tm2 = text.match(/(\d[\d,]*(?:\.\d+)?)\s*坪/g) || [];
      if (am.length + tm2.length >= 1) {
        var first = parseArea((am[0] || tm2[0]));
        if (kind === "land") set("land", first); else if (kind !== "house") set("senyu", first);
      }
    }
    if (kind === "rent" && d.hikiwatashi == null) { var ny = text.match(/入居\s*(?:可能)?\s*[:：]?\s*([^\s\n]{1,12})/); if (ny) set("hikiwatashi", ny[1]); }
    if (/新築/.test(text)) d._shinchikuWord = true;

    // 物件名の見出しが無いとき：1行目が見出しの無い短い文で、値段・住所・駅などでなければ、それを物件名とみなす（目印がつくので手で確かめる）
    if (d.name == null) {
      var first = (text.split("\n").map(function (t) { return t.trim(); }).filter(Boolean)[0]) || "";
      var firstHasLabel = pairs.length && splitLabels(first).length > 0;
      if (first && first.length <= 40 && !firstHasLabel && !/[:：]|万円|円|㎡|駅|徒歩|丁目|番地|[都道府県].+[市区町村]|^(中古|新築)?(マンション|一戸建て?|戸建|土地|売地|賃貸)$/.test(first))
        set("name", first.replace(/\s+\d+階$/, "").slice(0, 60));
    }
    return { kind: kind, data: d, found: Object.keys(found).filter(function (k) { return k.charAt(0) !== "_"; }), pairs: pairs };
  }
  function depText(v) {
    v = norm(v).trim();
    if (!v) return null;
    if (/^(なし|無し|無|0|0円|-|―|不要)/.test(v)) return "なし";
    var m = v.match(/(\d+(?:\.\d+)?)\s*ヶ月/);
    if (m) return m[1] + "ヶ月";
    var y = parseYen(v);
    if (y != null) return y.toLocaleString("ja-JP") + "円";
    return v.slice(0, 20);
  }
  function parseYMD(s) {
    s = norm(s);
    var m = s.match(/(\d{4})\s*[年.\/-]\s*(\d{1,2})\s*[月.\/-]\s*(\d{1,2})/);
    if (m) return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
    var w = s.match(/(令和|平成|R|H)\s*(元|\d{1,2})\s*[年.\/]\s*(\d{1,2})\s*[月.\/]\s*(\d{1,2})/);
    if (w) return eraYear(w[1], w[2]) + "-" + pad2(+w[3]) + "-" + pad2(+w[4]);
    return null;
  }

  /* ---------- 5. 表示の道具 ---------- */
  function wareki(y) {
    if (y >= 2019) return "令和" + (y === 2019 ? "元" : y - 2018) + "年";
    if (y >= 1989) return "平成" + (y === 1989 ? "元" : y - 1988) + "年";
    if (y >= 1926) return "昭和" + (y === 1926 ? "元" : y - 1925) + "年";
    if (y >= 1912) return "大正" + (y - 1911) + "年";
    return "明治" + (y - 1867) + "年";
  }
  // 築年数（満）。today は Date
  function ageYears(ym, today) {
    if (!ym) return null;
    var p = String(ym).split("-"), y = +p[0], m = p[1] ? +p[1] : 1;
    var months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
    return months < 0 ? null : Math.floor(months / 12);
  }
  function monthsSince(ym, today) {
    if (!ym) return null;
    var p = String(ym).split("-"), y = +p[0], m = p[1] ? +p[1] : null;
    if (m == null) return null;
    return (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  }
  function fmtMan(man) {
    if (man == null || isNaN(man)) return "";
    var oku = Math.floor(man / 10000), rest = Math.round((man - oku * 10000) * 100) / 100;
    if (oku > 0) return oku + "億" + (rest ? rest.toLocaleString("ja-JP") + "万円" : "円");
    return man.toLocaleString("ja-JP") + "万円";
  }
  function fmtYen(y) { return y == null || isNaN(y) ? "" : (y === 0 ? "なし" : Number(y).toLocaleString("ja-JP") + "円"); }
  function walkFromDist(m) { return m == null || isNaN(m) || m <= 0 ? null : Math.ceil(m / 80); }

  /* ---------- 6. 広告のルールの確認 ---------- */
  // 特定用語（表示規約 第18条第2項）。根拠の資料があり、(1)(2)は根拠の事実も一緒に書く場合だけ使える
  var TERMS = [
    { g: "いちばん上を意味する言葉（第18条2項1号）", re: /最高級|最高|最上級|最上|極上|究極|特級/g },
    { g: "とても安いと思わせる言葉（第18条2項2号）", re: /お買い?得|買得|掘り?出し?物?|掘出|土地値|格安|投げ?売り|破格|特安|激安|バーゲン|安値|底値/g },
    { g: "欠けるところが無いことを意味する言葉（第18条2項3号）", re: /完全|完璧|完ぺき|絶対|万全/g },
    { g: "ほかより優れていると思わせる言葉（第18条2項4号）", re: /日本一|日本初|業界一|業界初|地域一番|No\.?1|ナンバーワン|当社だけ|当社のみ|他に類を見ない|抜群|超(?!高層)/gi },
    { g: "選び抜いたと思わせる言葉（第18条2項5号）", re: /特選|厳選/g },
    { g: "とても人気があると思わせる言葉（第18条2項6号）", re: /完売|即完売/g }
  ];
  // 種類ごとの「必要な表示事項」（施行規則 別表3・5・7・9。チラシとインターネットの列を写した）
  var OBI = [
    ["company", "広告主（会社）の名前"], ["office", "広告主の事務所の所在地"], ["phone", "事務所の電話番号"],
    ["license", "宅建業の免許証番号"], ["assoc", "所属団体名と、公正取引協議会に加盟している旨"]
  ];
  var REQ = {
    mansion: { table: "別表7（中古マンション）", items: [
      ["taiyo", "取引態様（売主・代理・媒介の別）", 6], ["address", "物件の所在地（町・字まで）", 7], ["access", "交通（最寄駅と徒歩分数）", 8],
      ["floors+floor", "建物の階数と、その部屋がある階", 9], ["senyu", "専有面積", 10], ["balcony", "バルコニー面積", 11],
      ["built", "建築年月", 12], ["hikiwatashi", "引渡し可能年月", 13, "net"], ["price", "価格", 14],
      ["kanrihi+shuzen", "管理費と修繕積立金", 16], ["kanriKeitai", "管理形態と管理員の勤務形態", 17],
      ["yukoKigen", "取引条件の有効期限", 18, "paper"], ["koukai", "情報公開日（または更新日）と次回の更新予定日", 19, "net"]] },
    house: { table: "別表5（新築・中古の一戸建て）", items: [
      ["taiyo", "取引態様（売主・代理・媒介の別）", 6], ["address", "物件の所在地（町・字まで）", 7], ["access", "交通（最寄駅と徒歩分数）", 8],
      ["land+shido", "土地面積と私道負担面積", 9], ["bldg", "建物面積", 10], ["built", "建築年月", 13],
      ["hikiwatashi", "引渡し可能年月", 14, "net"], ["price", "価格", 15],
      ["yukoKigen", "取引条件の有効期限", 18, "paper"], ["koukai", "情報公開日（または更新日）と次回の更新予定日", 19, "net"]] },
    land: { table: "別表3（売地）", items: [
      ["taiyo", "取引態様（売主・代理・媒介の別）", 6], ["address", "物件の所在地（町・字まで）", 7], ["access", "交通（最寄駅と徒歩分数）", 8],
      ["land+shido", "土地面積と私道負担面積", 9], ["chimoku+youto", "地目と用途地域", 10], ["kenpei+yoseki", "建ぺい率と容積率", 11],
      ["hourei", "法令にもとづく制限（宅建業法施行令第3条のもの）", 12], ["price", "価格", 13],
      ["yukoKigen", "取引条件の有効期限", 15, "paper"], ["koukai", "情報公開日（または更新日）と次回の更新予定日", 16, "net"]] },
    rent: { table: "別表9（賃貸マンション・アパート・貸家）", items: [
      ["taiyo", "取引態様（貸主・代理・媒介の別）", 6], ["address", "物件の所在地（町・字まで）", 7], ["access", "交通（最寄駅と徒歩分数）", 8],
      ["structure+floors+floor", "建物の構造・階数・その部屋がある階", 9, "net"], ["senyu|bldg", "建物面積または専有面積", 10],
      ["built", "建築年月", 11], ["hikiwatashi", "入居可能時期", 12, "net"], ["rent", "賃料", 13],
      ["reikin", "礼金（いるならその額。いらないなら「なし」と書くと親切）", 14, "", "caution"],
      ["shikikin|hoshokin", "敷金・保証金（いるならその額、償却するならその額か割合）", 15, "", "caution"],
      ["hoken", "損害保険（火災保険など）に入る必要があるならその旨", 16, "", "caution"],
      ["hoshoKaisha", "保証会社との契約が条件ならその旨と額", 17, "", "caution"],
      ["kanrihi|kyoeki", "管理費または共益費", 18, "", "caution"],
      ["yukoKigen", "取引条件の有効期限", 21, "paper"], ["koukai", "情報公開日（または更新日）と次回の更新予定日", 22, "net"]] }
  };
  function filled(d, k) {
    if (k === "access") return !!(d.sta1 && d.walk1 != null && d.walk1 !== "") || !!d.accessNote;
    if (k === "koukai") return !!(d.koukaiBi && d.koushinYotei);
    if (k.indexOf("|") >= 0) return k.split("|").some(function (x) { return filled(d, x); });
    if (k.indexOf("+") >= 0) return k.split("+").every(function (x) { return filled(d, x); });
    var v = d[k];
    return !(v == null || v === "" || (typeof v === "number" && isNaN(v)));
  }
  function freeText(d) {
    return ["name", "catch", "setsubi", "biko", "genkyo", "parking", "madoriDetail", "sonota"].map(function (k) { return d[k] || ""; }).join("\n");
  }
  function check(d, opt) {
    opt = opt || {};
    var today = opt.today || new Date();
    var medium = opt.medium || "paper";
    var obi = opt.obi || {};
    var kind = d.kind || "mansion";
    var res = [];
    function add(level, title, detail, ref) { res.push({ level: level, title: title, detail: detail || "", ref: ref || "" }); }

    // (1) 徒歩分数
    [1, 2].forEach(function (n) {
      var w = d["walk" + n], dist = d["dist" + n], sta = d["sta" + n];
      if ((w == null || w === "") && !dist) return;
      if (w != null && w !== "" && !sta) add("alert", "徒歩" + w + "分の行き先（駅の名前）がありません", "交通は「最寄駅の名前」と「徒歩の分数」をセットで書きます。", "施行規則 第9条(3)");
      if (dist) {
        var need = walkFromDist(+dist);
        if (w == null || w === "") add("caution", (sta || "駅") + "まで道路距離" + dist + "mなら、徒歩" + need + "分と書きます", "80mで1分、1分に満たない端数は1分に切り上げます。", "施行規則 第9条(9)");
        else if (+w < need) add("alert", (sta || "駅") + " 徒歩" + w + "分は短すぎます（道路距離" + dist + "m → " + need + "分）", "80mで1分、端数は切り上げです。" + dist + "÷80＝" + (dist / 80).toFixed(2) + " → " + need + "分。", "施行規則 第9条(9)");
        else if (+w > need) add("ok", (sta || "駅") + " 徒歩" + w + "分（距離からは" + need + "分）", "実際より長めに書くのは問題ありませんが、測りなおすと短く書ける場合があります。", "施行規則 第9条(9)");
        else add("ok", (sta || "駅") + " 徒歩" + w + "分は、道路距離" + dist + "mと合っています", "80mで1分、端数切り上げ。", "施行規則 第9条(9)");
      } else {
        add("info", (sta || "駅") + " 徒歩" + w + "分：道路距離を入れると計算を確かめられます", "地図の直線距離ではなく、道路に沿った距離で数えます。起点は物件（マンションは建物の出入口）、着点は駅の出入口です。", "施行規則 第9条(7)(9)");
      }
    });

    // (2) 新築
    var ft = freeText(d);
    if (/新築(?!時)/.test(ft)) {
      var ms = monthsSince(d.built, today);
      if (!d.built) add("caution", "「新築」と書いてありますが、建築年月が空です", "「新築」は、工事が終わってから1年未満で、まだ誰も住んだことがない物件にだけ使えます。", "表示規約 第18条1項1号");
      else if (ms != null && ms >= 12) add("alert", "「新築」は使えません（完成から" + Math.floor(ms / 12) + "年" + (ms % 12) + "か月たっています）", "「新築」は完成から1年未満で、まだ誰も住んだことがない物件だけです。「築浅」「未入居」など事実を書きます。", "表示規約 第18条1項1号");
      else if (ms != null && ms === 11) add("caution", "完成から11か月です。日付によっては「新築」が使えなくなります", "工事が終わった日（検査済証の日付など）で確かめてください。", "表示規約 第18条1項1号");
      if (d.built && (ms == null || ms < 12) && !d.minyukyo) add("alert", "「新築」と書くなら、まだ誰も住んでいないこと（未入居）を確かめてください", "入力欄の「未入居」にチェックすると、この注意は消えます。", "表示規約 第18条1項1号");
      if (d.built && ms != null && ms < 12 && d.minyukyo) add("ok", "「新築」の条件（1年未満・未入居）に合っています", "", "表示規約 第18条1項1号");
    }

    // (3) 畳数（1畳＝1.62㎡以上）
    var rooms = parseRooms(d.madoriDetail || "");
    var areaBase = kind === "house" ? d.bldg : d.senyu;
    if (rooms.length && areaBase) {
      var sumJo = rooms.reduce(function (a, r) { return a + r.jo; }, 0);
      var need2 = Math.round(sumJo * TATAMI * 100) / 100;
      if (need2 > areaBase) add("alert", "部屋の畳数を足すと" + sumJo + "畳（" + need2 + "㎡以上）になり、面積" + areaBase + "㎡より広くなります", "1畳は1.62㎡以上の広さで数える決まりです。畳数か面積のどちらかがまちがっていないか確かめてください。", "施行規則 第9条(16)");
      else add("ok", "部屋の畳数の合計" + sumJo + "畳（" + need2 + "㎡）は、面積" + areaBase + "㎡におさまっています", "1畳＝1.62㎡以上で数えているかは、部屋ごとの面積で確かめます（下の「畳数の確かめ」）。", "施行規則 第9条(16)");
    }
    // DK・LDK の広さの目安（業界の目安。要確認）
    var mm = String(d.madori || "").match(/^(\d+)\s*(SLDK|LDK|SDK|DK)/);
    if (mm && rooms.length) {
      var nRoom = +mm[1], ldk = rooms.filter(function (r) { return /^(LDK|DK|SDK)$/.test(r.room); })[0];
      if (ldk) {
        var isLDK = /L/.test(mm[2]);
        var min = isLDK ? (nRoom >= 2 ? 10 : 8) : (nRoom >= 2 ? 6 : 4.5);
        if (ldk.jo < min) add("caution", mm[2] + "が" + ldk.jo + "畳です。" + nRoom + "部屋の" + (isLDK ? "LDK" : "DK") + "は" + min + "畳以上が目安です", "業界団体が示す最低限の広さの目安です（寝室1部屋：DK4.5畳・LDK8畳、2部屋以上：DK6畳・LDK10畳）。足りないときは「K」などと書きます。", "公正取引協議会の目安（要確認）");
      }
    }

    // (4) 取引態様
    if (!d.taiyo) add("alert", "取引態様が書いてありません", "「売主」「貸主」「代理」「媒介（仲介）」のどれかを、その言葉で書きます。買う人・借りる人にとっては、仲介手数料がかかるかどうかの目印になります。", "表示規約 第15条・施行規則 第9条(1)");
    else if (!/^(売主|貸主|代理|媒介（仲介）|媒介|仲介)$/.test(d.taiyo)) add("alert", "取引態様「" + d.taiyo + "」は決まった言葉ではありません", "「売主」「貸主」「代理」「媒介（仲介）」のどれかで書きます。", "施行規則 第9条(1)");
    else if (kind === "rent" && d.taiyo === "売主") add("caution", "賃貸なのに取引態様が「売主」になっています", "賃貸では「貸主」「代理」「媒介（仲介）」のどれかです。", "施行規則 第9条(1)");
    else if (kind !== "rent" && d.taiyo === "貸主") add("caution", "売買なのに取引態様が「貸主」になっています", "売買では「売主」「代理」「媒介（仲介）」のどれかです。", "施行規則 第9条(1)");

    // (5) 必要な表示事項
    var req = REQ[kind] || REQ.mansion;
    var miss = [], soft = [];
    req.items.forEach(function (it) {
      if (it[3] && it[3] !== medium) return;
      if (it[0] === "taiyo") return;   // 上で確かめた
      if (!filled(d, it[0])) (it[4] === "caution" ? soft : miss).push(it[1] + "（" + it[2] + "）");
    });
    var obiMiss = OBI.filter(function (o) { return !(obi[o[0]] && String(obi[o[0]]).trim()); }).map(function (o) { return o[1]; });
    if (miss.length) add("alert", "必要な表示事項のうち、" + miss.length + "つが空です", miss.join("、"), "施行規則 " + req.table);
    else add("ok", "必要な表示事項（物件の情報）はそろっています", "当てはまる場合だけ書くもの（借地・定期借家など）は下も見てください。", "施行規則 " + req.table);
    if (soft.length) add("caution", "当てはまるなら書くもの：" + soft.length + "つが空です", soft.join("、"), "施行規則 " + req.table);
    if (obiMiss.length) add("alert", "帯（会社の情報）のうち" + obiMiss.length + "つが空です", obiMiss.join("、") + "。お客様に渡す図面には必要です（担当者向けの画面で入れられます）。", "施行規則 " + req.table + " 1〜5");

    // 当てはまる場合だけ必要なもの
    if (/借地/.test(d.kenri || "")) add("caution", "借地権の物件です", "借地であることに加え、借地権の種類・内容・期間、保証金・敷金、1か月あたりの地代を書きます。", "施行規則 " + req.table);
    if (kind !== "rent" && kind !== "land" && !d.kenri) add("info", "土地の権利（所有権か借地権か）が空です", "借地のときは、そのことと内容を書く決まりがあります。", "施行規則 " + req.table);
    if (kind === "house" && d.rento) add("caution", "連棟式の建物であることを書いてください", "連棟式（となりの家と壁がつながっている建物）は、その旨を書きます。", "施行規則 別表5 11");
    if (kind === "rent" && d.teiki && !d.keiyaku) add("alert", "定期借家なのに契約期間が空です", "定期建物賃貸借であることと、契約期間を書きます。", "施行規則 別表9 19・20");
    if (kind === "rent" && d.teiki) add("info", "定期借家（期間が来たら原則おわる契約）であることを図面に書きます", "図面の表には「定期借家」と出ます。", "施行規則 別表9 19");
    if (kind === "rent" && !d.sonota) add("info", "賃料・礼金・敷金・保険・保証会社・管理費のほかに、かかるお金はありませんか", "鍵の交換代・クリーニング代などがあるなら、その名前と額を書きます。", "施行規則 別表9（注）");
    if (d.address && /(市|区|町|村|郡)$/.test(String(d.address).trim())) add("caution", "所在地が市区町村で終わっています", "所在地は町や字の名前まで書きます（地番は書かなくてもよい）。", "施行規則 第9条(2)");
    if (kind === "land" && /調整区域/.test(d.youto || "")) add("caution", "市街化調整区域の土地です", "原則として家を建てられないことや、建てるための許可の条件を書きます。", "施行規則 別表3（注）");

    // (6) 特定用語
    var hits = [];
    TERMS.forEach(function (t) {
      var seen = {};
      (ft.match(t.re) || []).forEach(function (w) { if (!seen[w]) { seen[w] = 1; hits.push([w, t.g]); } });
    });
    if (hits.length) {
      add("alert", "使い方に決まりがある言葉：" + hits.map(function (h) { return "「" + h[0] + "」"; }).join(""),
        hits.map(function (h) { return "「" + h[0] + "」は" + h[1]; }).join("。") + "。裏づける資料が手もとにある場合だけ使え、1号・2号の言葉は、その根拠になる事実も一緒に書く必要があります。ふつうは使わずに、事実（例：「南向き」「駅徒歩5分」）を書きます。", "表示規約 第18条2項");
    } else add("ok", "「最高」「格安」「日本一」などの言葉は見つかりませんでした", "名前・セールスポイント・設備・備考の欄を調べました。", "表示規約 第18条2項");
    if (/値下げ|価格改定|旧価格|→\s*\d|⇒\s*\d/.test(ft)) add("caution", "前の価格と並べる書き方（二重価格）になっていませんか", "過去の価格と並べるには、その価格で一定の期間売っていたことを資料で示せるなど、条件があります。", "表示規約 第20条・施行規則 第12条");
    if (/新発売/.test(ft) && !/新築/.test(ft)) add("caution", "「新発売」は、新しく造った土地や新築の住宅を初めて売り出すときだけの言葉です", "", "表示規約 第18条1項2号");

    // (7) 数字の形
    if (d.kenpei != null && d.kenpei !== "" && (+d.kenpei < 30 || +d.kenpei > 80)) add("caution", "建ぺい率" + d.kenpei + "%は、ふつうの範囲（30〜80%）の外です", "角地の緩和などで上がることはありますが、役所の資料で確かめてください。", "建築基準法 第53条");
    if (d.yoseki != null && d.yoseki !== "" && (+d.yoseki < 50 || +d.yoseki > 1300)) add("caution", "容積率" + d.yoseki + "%は、ふつうの範囲（50〜1300%）の外です", "", "建築基準法 第52条");
    if (d.floor && d.floors && +d.floor > +d.floors) add("alert", "所在階（" + d.floor + "階）が建物の階数（" + d.floors + "階建）より上です", "", "");
    return res;
  }

  var api = {
    TSUBO: TSUBO, TATAMI: TATAMI, norm: norm, parse: parse, parseYen: parseYen, parseMan: parseMan, parseRentYen: parseRentYen,
    parseArea: parseArea, parseYM: parseYM, parseYMD: parseYMD, parseAccess: parseAccess, parseMadori: parseMadori,
    parseStructure: parseStructure, parseYouto: parseYouto, parseFloors: parseFloors, parseTaiyo: parseTaiyo, parseRooms: parseRooms,
    wareki: wareki, ageYears: ageYears, monthsSince: monthsSince, fmtMan: fmtMan, fmtYen: fmtYen, walkFromDist: walkFromDist,
    check: check, REQ: REQ, OBI: OBI, TERMS: TERMS, splitLabels: splitLabels
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MAISOKU = api;
})(this);
