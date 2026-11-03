/* 物件ノート：物件資料の文から項目を取り出す部分（画面と切りはなして node でも試せる）。
   読み取りは「決まった言い回し」を探す規則で行う（AIや外のサービスは使わない）。必ず人が資料と見くらべる前提。 */
(function (root) {
  "use strict";
  var M = (typeof module !== "undefined" && module.exports && typeof require === "function")
    ? require(require("path").join(__dirname, "../マイソク/parse.js")) : root.MAISOKU;
  var T = (typeof module !== "undefined" && module.exports && typeof require === "function")
    ? require(require("path").join(__dirname, "touki.js")) : root.BukkenTouki;

  // 画像から読んだ文のくせを直す：字の間の空白を詰める、金額のカンマが点になったものを戻す
  function tidyOcr(t) {
    return String(t).replace(/([^\x00-\x7F])[ \t]+(?=[^\x00-\x7F])/g, "$1")
      .replace(/([^\x00-\x7F])[ \t]+(?=\d)/g, "$1").replace(/(\d)[ \t]+(?=[^\x00-\x7F])/g, "$1")
      .replace(/\b\d{1,3}(?:\.\d{3})+(?=\s*(?:円|万円|$))/gm, m => m.replace(/\./g, ","));
  }

  // 資料の種類：items は [言葉, 点数]。いちばん点の高いものにする
  var TYPES = [
    { id: "touki", name: "登記事項証明書", rank: 5, items: [["登記事項", 5], ["権利部", 4], ["表題部", 4], ["甲区", 3], ["乙区", 3], ["家屋番号", 2], ["地番", 1]] },
    { id: "hyoka", name: "固定資産の評価証明・納税通知", rank: 5, items: [["評価証明", 6], ["固定資産評価", 5], ["納税通知", 5], ["課税明細", 5], ["公課証明", 5], ["名寄帳", 5], ["課税標準額", 2]] },
    { id: "keiyaku", name: "売買契約書", rank: 4, items: [["売買契約書", 6], ["売買代金", 3], ["手付金", 2], ["買主", 1], ["売主", 1]] },
    { id: "juusetsu", name: "重要事項説明書", rank: 3, items: [["重要事項説明", 6], ["宅地建物取引士", 2], ["法令に基づく制限", 2]] },
    { id: "kouzu", name: "公図", rank: 2, items: [["公図", 6], ["地図に準ずる図面", 6], ["地図証明", 5]] },
    { id: "sokuryo", name: "測量図", rank: 4, items: [["地積測量図", 6], ["確定測量", 5], ["求積", 3], ["座標", 1]] },
    { id: "kakunin", name: "建築確認・検査済証", rank: 3, items: [["確認済証", 6], ["検査済証", 6], ["建築確認", 4], ["建築主", 1]] },
    { id: "rent", name: "レントロール", rank: 3, items: [["レントロール", 6], ["賃料一覧", 5], ["入居者", 2], ["号室", 1]] },
    { id: "kanri", name: "管理規約・管理の資料", rank: 2, items: [["管理規約", 5], ["長期修繕計画", 5], ["重要事項調査報告", 5], ["管理組合", 1]] },
    { id: "maisoku", name: "マイソク・物件概要", rank: 1, items: [["物件概要", 3], ["取引態様", 3], ["販売価格", 3], ["間取り", 2], ["徒歩", 1], ["価格", 1]] }
  ];
  var TYPE_BY_ID = {}; TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });
  // ファイルの名前も手がかりにする（公図や測量図は文字が少ないため）
  var NAME_HINT = { touki: /謄本|登記|全部事項/, hyoka: /評価|公課|名寄/, keiyaku: /契約/, juusetsu: /重説|重要事項/, kouzu: /公図/, sokuryo: /測量|求積/, kakunin: /確認済|検査済/, rent: /レントロール|賃料表/, maisoku: /マイソク|概要/ };
  function classify(text, name) {
    var best = null, bestScore = 0;
    TYPES.forEach(function (t) {
      var s = name && NAME_HINT[t.id] && NAME_HINT[t.id].test(name) ? 6 : 0;
      t.items.forEach(function (i) { if (text.indexOf(i[0]) >= 0) s += i[1]; });
      if (s > bestScore) { best = t; bestScore = s; }
    });
    return bestScore >= 3 ? best.id : "other";
  }

  // 登記の「150：23」「１５０．２３」を数に
  function touchiArea(s) {
    var m = String(s).match(/(\d[\d,]*)\s*[:：.]\s*(\d{1,2})/) || String(s).match(/(\d[\d,]*)/);
    if (!m) return null;
    return parseFloat(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
  }
  var ERA = { "昭和": 1925, "平成": 1988, "令和": 2018, "大正": 1911 };
  function ymOf(s) {
    var m = String(s).match(/(昭和|平成|令和|大正)\s*(元|\d+)\s*年\s*(\d+)\s*月/);
    if (m) return (ERA[m[1]] + (m[2] === "元" ? 1 : +m[2])) + "-" + ("0" + m[3]).slice(-2);
    m = String(s).match(/((?:19|20)\d\d)\s*年\s*(\d+)\s*月/);
    return m ? m[1] + "-" + ("0" + m[2]).slice(-2) : null;
  }
  function structCode(s) {
    s = String(s);
    if (/鉄骨鉄筋|SRC/i.test(s)) return "src";
    if (/鉄筋コンクリート|RC/i.test(s)) return "rc";
    if (/軽量鉄骨/.test(s)) return "ls3";
    if (/鉄骨|S造/.test(s)) return "s";
    if (/木造|W造/.test(s)) return "w";
    return "";
  }
  function yenOf(s) {
    var v = M.parseYen(String(s).replace(/^[金\s]+/, "").replace(/[-－ー]+$/, ""));
    return v == null ? null : v;
  }

  // 見出しの次にある値を取る（表が崩れて「│」が入っていても読む）
  function after(text, re) {
    var m = text.match(re);
    return m ? m[1].replace(/[│|┃]/g, " ").replace(/\s+/g, " ").trim() : null;
  }

  function fromTouki(text, f) {
    var recs = T.parseRecords(text); f.parcels = recs;
    var lands = recs.filter(function (r) { return r.kind === "land"; }), bldgs = recs.filter(function (r) { return r.kind === "bldg"; });
    var main = lands.slice().sort(function (a, b) { return (b.area || 0) - (a.area || 0); })[0], b = bldgs[0];
    if (main) {
      if (main.shozai) f.tokiShozai = main.shozai;
      if (main.chiban) f.chiban = main.chiban;
      if (main.chimoku) f.chimoku = main.chimoku;
      if (main.area != null) f.land = main.area;
    }
    if (b) {
      if (!main && b.shozai) f.tokiShozai = b.shozai;
      if (b.kaoku) f.kaoku = b.kaoku;
      if (b.structure) f.structure = b.structure;
      if (b.floorArea) f.bldg = b.floorArea;
      if (b.newBuilt) f.built = ymOf(b.newBuilt);
    }
    var who = main || b;
    if (who && who.owners.length) f.owner = T.ownersText(who.owners);
    var liens = []; recs.forEach(function (r) { r.liens.forEach(function (l) { if (liens.indexOf(l) < 0) liens.push(l); }); });
    if (liens.length) f.lien = liens.join("・");
  }

  function fromHyoka(text, f) {
    // 行ごとに、土地か家屋かを見分けて金額を取る（「課税標準額」の行は使わない）
    var lines = text.split("\n"), landSum = 0, bldgSum = 0;
    var AMOUNT = /(\d{1,3}(?:,\d{3})+|\d{6,})\s*円?/g;
    var mode = null, wantNext = null;
    lines.forEach(function (ln) {
      if (/課税標準|固定資産税額|都市計画税額|相当税額|税額|軽減/.test(ln) && !/評価額|価格/.test(ln)) { wantNext = null; return; }
      if (/^\s*(土地|宅地)/.test(ln)) mode = "land";
      else if (/^\s*(家屋|建物|居宅)/.test(ln)) mode = "bldg";
      var labelled = /(評価額|価格)/.test(ln);
      if (!labelled && !wantNext) return;
      var cleaned = ln.replace(/課税標準額?[\s:：]*[\d,]+\s*円?/g, "");
      var amounts = [], m; AMOUNT.lastIndex = 0;
      while ((m = AMOUNT.exec(cleaned))) amounts.push(parseInt(m[1].replace(/,/g, ""), 10));
      if (!amounts.length) { wantNext = labelled ? mode : null; return; }
      var kind = /土地|宅地/.test(ln) ? "land" : /家屋|建物|居宅/.test(ln) ? "bldg" : (wantNext || mode);
      if (kind === "land") landSum += amounts[0];
      else if (kind === "bldg") bldgSum += amounts[0];
      wantNext = null;
    });
    if (landSum) f.evalLand = Math.round(landSum / 1e4 * 100) / 100;
    if (bldgSum) f.evalBldg = Math.round(bldgSum / 1e4 * 100) / 100;
  }

  function fromKeiyaku(text, f) {
    var a;
    a = text.match(/売買代金(?:\s*[（(]?総額[)）]?)?[\s│|:：]*金?\s*([\d,億万]+)\s*円/); if (a) { var y = yenOf(a[1] + "円"); if (y) f.price = Math.round(y / 1e4 * 100) / 100; }
    a = text.match(/土地(?:代金|価格)?[\s│|:：]*金?\s*([\d,億万]+)\s*円/); if (a) { var l = yenOf(a[1] + "円"); if (l) f.priceLand = Math.round(l / 1e4 * 100) / 100; }
    a = text.match(/建物(?:代金|価格)?(?:\s*[（(]税抜[)）])?[\s│|:：]*金?\s*([\d,億万]+)\s*円/); if (a) { var b = yenOf(a[1] + "円"); if (b) f.priceBldg = Math.round(b / 1e4 * 100) / 100; }
    a = text.match(/消費税(?:額|及び地方消費税(?:の額)?)?[\s│|:：]*金?\s*([\d,億万]+)\s*円/); if (a) { var t = yenOf(a[1] + "円"); if (t) f.priceTax = Math.round(t / 1e4 * 100) / 100; }
  }

  function fromRent(text, f) {
    var a = text.match(/(?:満室想定|想定)?(?:年収|年間賃料|年間収入)[^\d\n]*([\d,億万]+)\s*円/);
    if (a) { var y = yenOf(a[1] + "円"); if (y) f.annualRent = Math.round(y / 1e4 * 100) / 100; }
    a = text.match(/(?:月額賃料|賃料)?合計[^\d\n]*([\d,億万]+)\s*円/);
    if (a) { var m = yenOf(a[1] + "円"); if (m) f.monthlyRent = Math.round(m / 1e4 * 100) / 100; }
  }

  // text：資料の文。type を渡さなければ種類を判定する。戻り値 { type, fields }
  function extract(text, type, name) {
    var marked = M.norm(text), norm = T.plain(marked);
    var t = type || classify(norm, name), f = {}, r = M.parse(norm), d = r.data || {};
    var COPY = ["name", "address", "madori", "kenpei", "yoseki", "youto", "road", "chimoku", "taiyo", "built", "structure", "floors", "units", "land", "bldg", "senyu", "price", "rent", "kanrihi", "shuzen", "kenri", "shido", "genkyo", "hikiwatashi", "parking"];
    // 登記や契約書の書き方をマイソクの規則で読むとまちがえやすいので、その資料の読み方を先に使う
    if (t === "touki") fromTouki(marked, f);
    if (t === "kouzu" || t === "sokuryo") f.labels = T.mapLabels(norm);
    if (t === "hyoka") fromHyoka(norm, f);
    if (t === "keiyaku") fromKeiyaku(norm, f);
    if (t === "rent") fromRent(norm, f);
    var skip = { touki: ["name", "price", "rent", "kanrihi", "shuzen"], hyoka: ["price", "rent", "name", "land", "bldg", "built"], keiyaku: ["taiyo", "rent"], kouzu: ["name", "price", "land", "bldg"] }[t] || [];
    COPY.forEach(function (k) { if (f[k] == null && d[k] != null && d[k] !== "" && skip.indexOf(k) < 0) f[k] = d[k]; });
    // 資料の題名を物件名にしない
    if (f.name && /(証明書|契約書|説明書|通知書|報告書|物件概要|測量図|確認済証|検査済証|規約)$/.test(f.name)) delete f.name;
    if (d.sta1) { f.sta = d.sta1; if (d.line1) f.line = d.line1; if (d.walk1 != null) f.walk = d.walk1; }
    return { type: t, fields: f };
  }

  // 項目の定義：画面の順番。unit は単位の文字
  var FIELDS = [
    ["name", "物件名"], ["address", "住所"], ["tokiShozai", "登記の所在"], ["chiban", "地番"], ["kaoku", "家屋番号"],
    ["price", "価格", "万円"], ["priceLand", "土地の価格", "万円"], ["priceBldg", "建物の価格（税抜）", "万円"], ["priceTax", "消費税額", "万円"],
    ["evalLand", "土地の固定資産税評価額", "万円"], ["evalBldg", "建物の固定資産税評価額", "万円"],
    ["land", "土地の面積", "㎡"], ["bldg", "建物の面積", "㎡"], ["senyu", "専有面積", "㎡"], ["chimoku", "地目"], ["kenri", "土地の権利"], ["shido", "私道負担"],
    ["structure", "構造"], ["floors", "階数"], ["built", "建てた年月"], ["madori", "間取り"], ["units", "総戸数"],
    ["youto", "用途地域"], ["kenpei", "建ぺい率", "%"], ["yoseki", "容積率", "%"], ["road", "接道"],
    ["line", "沿線"], ["sta", "最寄り駅"], ["walk", "徒歩", "分"],
    ["rent", "賃料", "円"], ["kanrihi", "管理費", "円"], ["shuzen", "修繕積立金", "円"], ["monthlyRent", "月額賃料の合計", "万円"], ["annualRent", "年間賃料", "万円"],
    ["taiyo", "取引態様"], ["genkyo", "現況"], ["hikiwatashi", "引渡し"], ["parking", "駐車場"], ["owner", "登記の所有者"], ["lien", "登記に載っている権利"]
  ];
  // 同じ項目で資料どうしの値がちがうとき、どの資料を先に使うか（数字が大きいほど先）
  var PRIORITY = {
    land: { touki: 9, sokuryo: 8, keiyaku: 7 }, bldg: { touki: 9, kakunin: 7, keiyaku: 7 }, built: { touki: 9, kakunin: 8 }, structure: { touki: 9, kakunin: 8 },
    price: { keiyaku: 9, juusetsu: 7, maisoku: 6 }, evalLand: { hyoka: 9 }, evalBldg: { hyoka: 9 }, kenpei: { juusetsu: 8 }, yoseki: { juusetsu: 8 }, youto: { juusetsu: 8 }, road: { juusetsu: 8 }
  };
  function same(a, b) { return String(a).replace(/\s+/g, "") === String(b).replace(/\s+/g, ""); }
  // docs：[{ id, name, type, fields }]。戻り値：{ key: [{ value, docId, docName, type }] }（先に使う順）
  function merge(docs) {
    var out = {};
    docs.forEach(function (doc) {
      Object.keys(doc.fields || {}).forEach(function (k) {
        var v = doc.fields[k]; if (v == null || v === "" || typeof v === "object") return;
        var list = out[k] || (out[k] = []);
        if (!list.some(function (x) { return same(x.value, v); })) list.push({ value: v, docId: doc.id, docName: doc.name, type: doc.type });
      });
    });
    Object.keys(out).forEach(function (k) {
      var p = PRIORITY[k] || {}, rank = function (x) { return p[x.type] != null ? p[x.type] : (TYPE_BY_ID[x.type] ? TYPE_BY_ID[x.type].rank : 0); };
      out[k].sort(function (a, b) { return rank(b) - rank(a); });
    });
    return out;
  }

  var API = { tidyOcr: tidyOcr, TYPES: TYPES, TYPE_BY_ID: TYPE_BY_ID, FIELDS: FIELDS, classify: classify, extract: extract, merge: merge, structCode: structCode, ymOf: ymOf, touchiArea: touchiArea };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.BukkenExtract = API;
})(typeof window !== "undefined" ? window : globalThis);
