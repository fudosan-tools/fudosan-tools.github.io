/* マイソク（販売図面）づくり：画面の動き。読み取りの規則は parse.js（window.MAISOKU）。
   入力はこのブラウザの localStorage にだけ保存する。外へ送るのは「住所から地図を出す」を押したときの住所だけ。 */
(function () {
  "use strict";
  var M = window.MAISOKU;
  var TSUBO = M.TSUBO;
  var KEY = "fudosan.maisoku.v1", KEY_IMG = "fudosan.maisoku.img.v1", KEY_OBI = "fudosan.maisoku.obi.v1", KEY_CHK = "fudosan.maisoku.chk.v1";
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var KIND_NAME = { mansion: "中古マンション", house: "一戸建て", land: "土地", rent: "賃貸" };

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function isEmpty(v) { return v == null || v === "" || v === false || (typeof v === "number" && isNaN(v)); }
  function n(v) { if (v == null || v === "") return null; var x = parseFloat(String(v).replace(/,/g, "")); return isNaN(x) ? null : x; }

  /* ---------- 入力欄の一覧 ---------- */
  // show：どの種類で出すか（m=中古マンション h=一戸建て l=土地 r=賃貸）
  var GROUPS = [
    { id: "basic", t: "基本", f: [
      { k: "kind", lab: "物件の種類", t: "sel", opts: [["mansion", "中古マンション"], ["house", "一戸建て（新築・中古）"], ["land", "土地"], ["rent", "賃貸（マンション・アパート・貸家）"]], show: "mhlr" },
      { k: "name", lab: "物件名", t: "text", show: "mhlr", ph: "例：グリーンテラスあおば台 502号室" },
      { k: "address", lab: "所在地", t: "text", show: "mhlr", hint: "町・字の名前まで書きます（地番は書かなくてもよい）。" },
      { k: "catch", lab: "セールスポイント", t: "textarea", show: "mhlr", hint: "図面の上に1〜2行で出ます。「最高」「格安」などの言葉は下の確認で知らせます。" }] },
    { id: "access", t: "交通", f: [
      { k: "acc1", lab: "交通1", t: "access", no: 1, show: "mhlr" },
      { k: "acc2", lab: "交通2", t: "access", no: 2, show: "mhlr" },
      { k: "accessNote", lab: "バスなど", t: "text", show: "mhlr", ph: "例：「市役所前」停 徒歩3分・バス10分" }] },
    { id: "money", t: "お金", f: [
      { k: "price", lab: "価格", t: "num", unit: "万円", show: "mhl", fmt: "man" },
      { k: "rent", lab: "賃料（月額）", t: "num", unit: "円", show: "r", fmt: "yen" },
      { k: "kanrihi", lab: "管理費（月額）", t: "num", unit: "円", show: "mr", fmt: "yen", hint: "なしのときは 0。" },
      { k: "kyoeki", lab: "共益費（月額）", t: "num", unit: "円", show: "r", fmt: "yen" },
      { k: "shuzen", lab: "修繕積立金（月額）", t: "num", unit: "円", show: "m", fmt: "yen" },
      { k: "shikikin", lab: "敷金", t: "text", show: "r", ph: "例：1ヶ月 ／ なし" },
      { k: "reikin", lab: "礼金", t: "text", show: "r", ph: "例：1ヶ月 ／ なし" },
      { k: "hoshokin", lab: "保証金", t: "text", show: "r" },
      { k: "shikibiki", lab: "敷引・償却", t: "text", show: "r" },
      { k: "koshin", lab: "更新料", t: "text", show: "r", ph: "例：新賃料の1ヶ月" },
      { k: "hoken", lab: "損害保険", t: "text", show: "r", ph: "例：要（2年 18,000円）" },
      { k: "hoshoKaisha", lab: "保証会社", t: "text", show: "r", ph: "例：加入要（初回 賃料等の50%）" },
      { k: "sonota", lab: "その他の費用", t: "text", show: "r", ph: "例：鍵交換 22,000円" }] },
    { id: "area", t: "広さ", f: [
      { k: "senyu", lab: "専有面積", t: "area", show: "mr" },
      { k: "balcony", lab: "バルコニー面積", t: "area", show: "mr" },
      { k: "land", lab: "土地面積", t: "area", show: "hl" },
      { k: "shido", lab: "私道負担", t: "text", show: "hl", ph: "例：なし ／ 約12㎡（持分1/4）" },
      { k: "bldg", lab: "建物面積（延床）", t: "area", show: "h" }] },
    { id: "bldg", t: "建物", f: [
      { k: "madori", lab: "間取り", t: "text", show: "mhr", ph: "例：3LDK" },
      { k: "madoriDetail", lab: "間取りの内訳", t: "text", show: "mhr", ph: "例：LDK 14.5畳 / 洋室 6畳 / 洋室 5.5畳", hint: "1畳＝1.62㎡以上の決まりと、LDKの広さの目安を確かめます。" },
      { k: "floors", lab: "建物の階数", t: "num", unit: "階建", show: "mhr" },
      { k: "floor", lab: "所在階", t: "num", unit: "階", show: "mr" },
      { k: "structure", lab: "構造", t: "text", show: "mhr", ph: "例：鉄筋コンクリート造（RC造）" },
      { k: "built", lab: "築年月", t: "ym", show: "mhr" },
      { k: "minyukyo", lab: "未入居", t: "check", show: "mhr", txt: "まだ誰も住んだことがない（新築と書くときに必要）" },
      { k: "direction", lab: "向き", t: "text", show: "mhr", ph: "例：南東（バルコニー）" },
      { k: "units", lab: "総戸数", t: "num", unit: "戸", show: "m" },
      { k: "kanriKeitai", lab: "管理形態", t: "text", show: "m", ph: "例：管理会社に全部委託・管理員 日勤" },
      { k: "rento", lab: "連棟式", t: "check", show: "h", txt: "となりの家と壁がつながった建物" }] },
    { id: "landlaw", t: "土地・法令", f: [
      { k: "kenri", lab: "土地の権利", t: "text", show: "mhl", ph: "例：所有権 ／ 借地権（旧法）" },
      { k: "chimoku", lab: "地目", t: "text", show: "hl", ph: "例：宅地" },
      { k: "youto", lab: "用途地域", t: "text", show: "mhl" },
      { k: "kenpei", lab: "建ぺい率", t: "num", unit: "%", show: "mhl" },
      { k: "yoseki", lab: "容積率", t: "num", unit: "%", show: "mhl" },
      { k: "road", lab: "接道", t: "text", show: "hl", ph: "例：南側 公道 幅員4.0m 接面6.0m" },
      { k: "hourei", lab: "法令上の制限", t: "text", show: "hl", ph: "例：準防火地域、第一種高度地区" }] },
    { id: "cond", t: "条件", f: [
      { k: "genkyo", lab: "現況", t: "text", show: "mhl", ph: "例：居住中 ／ 空家 ／ 更地" },
      { k: "hikiwatashi", lab: "引渡し時期", labR: "入居時期", t: "text", show: "mhlr", ph: "例：相談 ／ 2027年3月下旬" },
      { k: "taiyo", lab: "取引態様", t: "sel", opts: [["", "（選ぶ）"], ["売主", "売主"], ["代理", "代理"], ["媒介（仲介）", "媒介（仲介）"], ["貸主", "貸主"]], show: "mhlr" },
      { k: "parking", lab: "駐車場", t: "text", show: "mhlr", ph: "例：空きあり 月額20,000円" },
      { k: "teiki", lab: "定期借家", t: "check", show: "r", txt: "期間が来たら原則おわる契約（定期建物賃貸借）" },
      { k: "keiyaku", lab: "契約期間", t: "text", show: "r", ph: "例：2年" },
      { k: "yukoKigen", lab: "取引条件の有効期限", t: "date", show: "mhlr", hint: "紙のチラシ・図面で必要。" },
      { k: "koukaiBi", lab: "情報公開日", t: "date", show: "mhlr", hint: "インターネットに出すときに必要。" },
      { k: "koushinYotei", lab: "次回の更新予定日", t: "date", show: "mhlr", hint: "インターネットに出すときに必要。" }] },
    { id: "free", t: "自由に書く", f: [
      { k: "setsubi", lab: "設備", t: "textarea", show: "mhlr" },
      { k: "biko", lab: "備考", t: "textarea", show: "mhlr" }] }
  ];
  var FIELD = {};
  GROUPS.forEach(function (g) { g.f.forEach(function (f) { FIELD[f.k] = f; }); });
  var KIND_LETTER = { mansion: "m", house: "h", land: "l", rent: "r" };

  /* ---------- 状態 ---------- */
  var st = load(KEY, null) || { d: { kind: "mansion" }, auto: {}, map: null, medium: "paper", fill: true };
  if (!st.d) st.d = { kind: "mansion" };
  if (!st.auto) st.auto = {};
  var imgs = load(KEY_IMG, []) || [];
  var obi = load(KEY_OBI, {}) || {};
  var chk = load(KEY_CHK, {}) || {};
  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var ok = save(KEY, st) && save(KEY_OBI, obi);
      $("#saveState").textContent = ok ? "このブラウザの中に保存しました（" + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + "）" : "保存できませんでした（ブラウザの設定で保存が止められているかもしれません）";
    }, 300);
  }
  function saveImgs() {
    if (!save(KEY_IMG, imgs)) $("#imgState").textContent = "画像が大きく、このブラウザに保存できませんでした。ページを閉じると画像は消えます。";
    else $("#imgState").textContent = imgs.length ? "画像もこのブラウザの中に保存しています。" : "";
  }

  /* ---------- 入力欄をつくる ---------- */
  function fieldHTML(f) {
    var k = f.k, v = st.d[k];
    var lab = '<label class="lab" for="f_' + k + '">' + esc(f.lab) + '<span class="automark" hidden>自動で入れた・要確認</span></label>';
    var hint = '<div class="hint">' + (f.hint ? esc(f.hint) : "") + '<span class="emptyhint"></span><span class="fmt"></span></div>';
    var inp = "";
    if (f.t === "text") inp = '<input type="text" id="f_' + k + '" data-k="' + k + '" placeholder="' + esc(f.ph || "") + '">';
    else if (f.t === "textarea") inp = '<textarea id="f_' + k + '" data-k="' + k + '" rows="2" placeholder="' + esc(f.ph || "") + '"></textarea>';
    else if (f.t === "num") inp = '<div class="unit-input"><input type="text" inputmode="decimal" id="f_' + k + '" data-k="' + k + '" data-num="1"><span>' + esc(f.unit) + "</span></div>";
    else if (f.t === "ym") inp = '<input type="text" id="f_' + k + '" data-k="' + k + '" data-ym="1" placeholder="例：1998-03 ／ 平成10年3月 ／ H10.3">';
    else if (f.t === "date") inp = '<div class="unit-input"><input type="date" id="f_' + k + '" data-k="' + k + '"></div>';
    else if (f.t === "check") inp = '<label class="check"><input type="checkbox" id="f_' + k + '" data-k="' + k + '"><span>' + esc(f.txt || "") + "</span></label>";
    else if (f.t === "sel") inp = '<select id="f_' + k + '" data-k="' + k + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + "</option>"; }).join("") + "</select>";
    else if (f.t === "area") inp = '<div class="area2"><div class="unit-input"><input type="text" inputmode="decimal" id="f_' + k + '" data-k="' + k + '" data-area="m2"><span>㎡</span></div>' +
      '<div class="unit-input"><input type="text" inputmode="decimal" data-k="' + k + '" data-area="tsubo" aria-label="' + esc(f.lab) + '（坪）"><span>坪</span></div></div>';
    else if (f.t === "access") {
      var i = f.no;
      inp = '<div class="acc">' +
        '<label><span>路線</span><input type="text" data-k="line' + i + '" placeholder="例：架空線"></label>' +
        '<label><span>駅</span><input type="text" data-k="sta' + i + '" placeholder="例：あおば台"></label>' +
        '<label><span>徒歩（分）</span><input type="text" inputmode="numeric" data-k="walk' + i + '" data-num="1"></label>' +
        '<label><span>道路距離（m）</span><input type="text" inputmode="numeric" data-k="dist' + i + '" data-num="1" placeholder="分かれば"></label></div>';
      lab = '<span class="lab">' + esc(f.lab) + '<span class="automark" hidden>自動で入れた・要確認</span></span>';
      hint = '<div class="hint">道路に沿った距離を入れると、80mで1分・端数切り上げで分数を確かめます。<span class="emptyhint"></span><span class="fmt"></span></div>';
    }
    return '<div class="fr" data-field="' + k + '" data-show="' + f.show + '">' + lab + inp + hint + "</div>";
  }
  function buildForm() {
    var html = "";
    GROUPS.forEach(function (g) {
      html += '<section class="panel fgroup" data-g="' + g.id + '"><h3>' + esc(g.t) + '</h3><div class="formrows">' + g.f.map(fieldHTML).join("") + "</div></section>";
    });
    $("#form").innerHTML = html;
    $all("#form [data-k]").forEach(function (el) {
      var ev = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "month" || el.type === "date" ? "change" : "input";
      el.addEventListener(ev, onInput);
      if (ev === "change" && el.tagName !== "SELECT" && el.type !== "checkbox") el.addEventListener("input", onInput);
    });
  }
  function onInput(e) {
    var el = e.target, k = el.getAttribute("data-k");
    if (el.type === "checkbox") st.d[k] = el.checked;
    else if (el.getAttribute("data-area")) {
      var x = n(el.value);
      if (el.getAttribute("data-area") === "m2") { st.d[k] = x; var t = el.closest(".area2").querySelector('[data-area="tsubo"]'); t.value = x == null ? "" : (x / TSUBO).toFixed(2); }
      else { st.d[k] = x == null ? null : Math.round(x * TSUBO * 100) / 100; var m = el.closest(".area2").querySelector('[data-area="m2"]'); m.value = st.d[k] == null ? "" : st.d[k]; }
    } else if (el.getAttribute("data-num")) st.d[k] = n(el.value);
    else if (el.getAttribute("data-ym")) st.d[k] = M.parseYM(el.value) || "";
    else st.d[k] = el.value;
    // 手で直した欄は「自動」の目印を外す
    var fk = /^(line|sta|walk|dist)[12]$/.test(k) ? "acc" + k.slice(-1) : k;
    if (st.auto[fk] || st.auto[k]) { delete st.auto[fk]; delete st.auto[k]; }
    if (k === "kind") applyKind();
    refreshMarks();
    renderAll();
    saveSoon();
  }
  function fillForm() {
    $all("#form [data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k"), v = st.d[k];
      if (el.type === "checkbox") el.checked = !!v;
      else if (el.getAttribute("data-area") === "m2") el.value = v == null ? "" : v;
      else if (el.getAttribute("data-area") === "tsubo") el.value = v == null || v === "" ? "" : (v / TSUBO).toFixed(2);
      else el.value = v == null ? "" : v;
    });
    applyKind();
    refreshMarks();
  }
  function applyKind() {
    var L = KIND_LETTER[st.d.kind] || "m";
    $all("#form .fr").forEach(function (fr) { fr.hidden = fr.getAttribute("data-show").indexOf(L) < 0; });
    $all("#form .fgroup").forEach(function (g) { g.hidden = !$all(".fr", g).some(function (fr) { return !fr.hidden; }); });
    var hk = $('[data-field="hikiwatashi"] .lab');
    if (hk) hk.firstChild.nodeValue = st.d.kind === "rent" ? "入居時期" : "引渡し時期";
  }
  // 広告に必要な欄（空なら朱の線）
  function requiredKeys() {
    var req = M.REQ[st.d.kind] || M.REQ.mansion, out = {};
    req.items.forEach(function (it) {
      if (it[3] && it[3] !== st.medium) return;
      if (it[4] === "caution") return;
      it[0].split(/[+|]/).forEach(function (k) {
        if (k === "access") out.acc1 = true;
        else if (k === "koukai") { out.koukaiBi = true; out.koushinYotei = true; }
        else out[k] = true;
      });
    });
    out.taiyo = true;
    return out;
  }
  function refreshMarks() {
    var req = requiredKeys();
    $all("#form .fr").forEach(function (fr) {
      var k = fr.getAttribute("data-field"), f = FIELD[k];
      var empty;
      if (f.t === "access") { var i = f.no; empty = isEmpty(st.d["sta" + i]) && isEmpty(st.d["walk" + i]); }
      else empty = isEmpty(st.d[k]);
      if (f.t === "check" || k === "kind") empty = false;
      var isReq = !!req[k];
      fr.classList.toggle("missing", empty && isReq);
      fr.classList.toggle("empty", empty && !isReq && st.readOnce && f.t !== "access");
      var eh = fr.querySelector(".emptyhint");
      if (eh) eh.textContent = empty && isReq ? "空です。広告に出すときに必要な項目です。" : (empty && st.readOnce && st.lastFound && !isReq && f.t !== "access" && f.t !== "check" ? "資料から見つかりませんでした。" : "");
      var am = fr.querySelector(".automark");
      if (am) am.hidden = !st.auto[k];
      var fm = fr.querySelector(".fmt");
      if (fm) {
        var v = st.d[k], s = "";
        if (f.fmt === "man" && v != null && v !== "") s = "＝ " + M.fmtMan(+v);
        if (f.fmt === "yen" && v != null && v !== "") s = "＝ " + M.fmtYen(+v);
        if (f.t === "ym" && v) { var y = +String(v).slice(0, 4), a = M.ageYears(v, new Date()); s = M.wareki(y) + (String(v).length > 4 ? +String(v).slice(5, 7) + "月" : "") + (a != null ? "・築" + a + "年" : ""); }
        if (f.t === "area" && v != null && v !== "") s = FUDOSAN.area(+v, 2);
        if (f.t === "access") { var w = st.d["walk" + f.no], dd = st.d["dist" + f.no]; if (dd) s = "道路距離" + dd + "m → 徒歩" + M.walkFromDist(+dd) + "分" + (w != null && w !== "" && +w < M.walkFromDist(+dd) ? "（入力の" + w + "分は短すぎます）" : ""); }
        fm.textContent = s;
      }
    });
    var na = Object.keys(st.auto).length;
    $("#autoCount").textContent = na ? "「自動で入れた・要確認」の目印が" + na + "か所あります。資料と見くらべて、正しければそのままで大丈夫です。" : "";
    $("#clearAuto").hidden = !na;
  }

  /* ---------- 読み取り ---------- */
  function applyParse(text) {
    var r = M.parse(text);
    if (!r.found.length && !r.kind) return;
    var onlyEmpty = $("#onlyEmpty").checked;
    var count = 0, counted = {};
    var kindBefore = st.d.kind;
    if (!onlyEmpty || !st.readOnce) { st.d.kind = r.kind; } else if (r.kind && r.kind !== kindBefore && !Object.keys(st.d).some(function (k) { return k !== "kind" && !isEmpty(st.d[k]); })) st.d.kind = r.kind;
    r.found.forEach(function (k) {
      if (onlyEmpty && !isEmpty(st.d[k])) return;
      var v = r.data[k];
      if (FIELD[k] && FIELD[k].t === "text" && typeof v === "number") v = String(v);
      st.d[k] = v;
      var fk = /^(line|sta|walk|dist)[12]$/.test(k) ? "acc" + k.slice(-1) : k;
      if (FIELD[fk]) { if (!counted[fk]) count++; counted[fk] = true; st.auto[fk] = true; }
    });
    st.readOnce = true;
    st.lastFound = r.found;
    // 見つからなかった数（その種類で出す欄のうち）
    var L = KIND_LETTER[st.d.kind];
    var missing = 0;
    Object.keys(FIELD).forEach(function (k) {
      var f = FIELD[k];
      if (f.show.indexOf(L) < 0 || f.t === "check" || k === "kind") return;
      if (f.t === "access") { if (f.no === 1 && isEmpty(st.d.sta1)) missing++; return; }
      if (isEmpty(st.d[k])) missing++;
    });
    fillForm();
    renderAll();
    saveSoon();
    $("#readStatus").innerHTML = "<b>" + count + "項目</b>を自動で入れました（種類：" + esc(KIND_NAME[st.d.kind]) + "）。" +
      (missing ? "<b>" + missing + "項目</b>は見つからなかったので空のままです。下の欄で、朱の線は広告に必要な項目です。" : "") +
      " 自動で入れた欄には「自動で入れた・要確認」の目印がつきます。";
    // 担当者向け：読み取った見出しの一覧
    $("#pairs").innerHTML = r.pairs.length ? "<table><thead><tr><th>見つけた見出し</th><th>そのあとの文字</th></tr></thead><tbody>" +
      r.pairs.map(function (p) { return "<tr><td>" + esc(p.word) + "</td><td>" + esc(p.value || "（空）") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">見出し（「価格」「専有面積」など）は見つかりませんでした。文の中の言い回しから読みました。</p>';
    $("#sec-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- PDF（pdf.js を cdnjs から読みこむ。PDFそのものは外に送らない） ---------- */
  var pdfReady = null;
  function loadPdfJs() {
    if (pdfReady) return pdfReady;
    pdfReady = new Promise(function (ok, ng) {
      var s = document.createElement("script");
      s.src = PDFJS; s.crossOrigin = "anonymous";
      s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(window.pdfjsLib); } catch (e) { ng(e); } };
      s.onerror = function () { pdfReady = null; ng(new Error("pdf.js を読みこめませんでした（インターネットにつながっているか確かめてください）")); };
      document.head.appendChild(s);
    });
    return pdfReady;
  }
  function readPdf(file) {
    var status = $("#fileStatus");
    status.textContent = "PDFを読んでいます…";
    return loadPdfJs().then(function (lib) {
      return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (pdf) {
      var pages = Math.min(pdf.numPages, 10), texts = [], chain = Promise.resolve();
      for (var p = 1; p <= pages; p++) (function (p) {
        chain = chain.then(function () {
          status.textContent = "PDFを読んでいます（" + pages + "ページ中" + p + "ページ目）";
          return pdf.getPage(p).then(function (page) { return page.getTextContent(); }).then(function (tc) { texts.push(textFromItems(tc.items)); });
        });
      })(p);
      return chain.then(function () {
        var text = texts.join("\n");
        var letters = text.replace(/\s/g, "").length;
        lastPdf = pdf;
        $("#pdfAsImage").hidden = false;
        if (letters < 30) {
          status.textContent = "このPDFには文字の情報がほとんど入っていません（スキャンした紙や写真のPDFのようです）。試作では文字の読み取りはしないので、項目は手で入れてください。1ページ目を画像として図面に貼ることはできます。";
          return pdfPageToImage(pdf, 1, "madori");
        }
        $("#src").value = text;
        status.textContent = "PDFから文字を取り出しました（" + pages + "ページ・" + letters + "文字）。下の枠で確かめてから「読み取って入れる」を押してください。";
        if (letters < 200) status.textContent += " 文字が少ないので、取れない項目が多いかもしれません。";
      });
    }).catch(function (e) {
      status.textContent = "PDFを読めませんでした：" + (e && e.message ? e.message : e) + "。PDFを開いて文字をコピーし、下の枠に貼ってください。";
    });
  }
  var lastPdf = null;
  // pdf.js の文字のかたまりを、行のつながりがわかる文にする
  function textFromItems(items) {
    var out = "", lastY = null, lastEnd = null;
    items.forEach(function (it) {
      if (typeof it.str !== "string") return;
      var x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      if (lastY != null && Math.abs(y - lastY) > h * 0.6) out += "\n";
      else if (lastEnd != null && x - lastEnd > h * 0.8) out += "\t";
      out += it.str;
      if (it.hasEOL) { out += "\n"; lastY = null; lastEnd = null; return; }
      lastY = y; lastEnd = x + (it.width || 0);
    });
    return out;
  }
  function pdfPageToImage(pdf, p, role) {
    return pdf.getPage(p).then(function (page) {
      var vp0 = page.getViewport({ scale: 1 });
      var scale = Math.min(3, 1600 / Math.max(vp0.width, vp0.height));
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        addImage(c.toDataURL("image/jpeg", 0.85), "PDFの" + p + "ページ目", role);
      });
    });
  }

  /* ---------- 画像（間取り図・写真・地図） ---------- */
  var ROLES = [["madori", "間取り図・区画図"], ["gaikan", "外観・現地の写真"], ["naikan", "室内の写真"], ["map", "地図"], ["none", "使わない"]];
  function readImage(file) {
    return new Promise(function (ok) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1400, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
          var c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
          var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = function () { ok(null); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function nextRole() {
    var used = imgs.map(function (i) { return i.role; });
    if (used.indexOf("madori") < 0) return "madori";
    if (used.indexOf("gaikan") < 0) return "gaikan";
    if (used.indexOf("naikan") < 0) return "naikan";
    return "none";
  }
  function addImage(url, name, role) {
    if (!url) return;
    imgs.push({ id: Date.now() + "_" + Math.random().toString(36).slice(2, 6), url: url, name: name || "画像", role: role || nextRole() });
    saveImgs(); renderImgList(); renderSheet();
  }
  function renderImgList() {
    var box = $("#imgList");
    if (!imgs.length) { box.innerHTML = '<p class="muted">まだ画像はありません。</p>'; return; }
    box.innerHTML = imgs.map(function (im) {
      return '<div class="imgrow" data-id="' + im.id + '"><img src="' + im.url + '" alt=""><div class="meta"><div class="small">' + esc(im.name) + '</div>' +
        '<select data-role aria-label="使い道">' + ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === im.role ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + "</select></div>" +
        '<button type="button" class="btn" data-remove>外す</button></div>';
    }).join("");
    $all("#imgList [data-role]").forEach(function (s) {
      s.addEventListener("change", function () { var id = s.closest(".imgrow").getAttribute("data-id"); imgs.forEach(function (im) { if (im.id === id) im.role = s.value; }); saveImgs(); renderSheet(); });
    });
    $all("#imgList [data-remove]").forEach(function (b) {
      b.addEventListener("click", function () { var id = b.closest(".imgrow").getAttribute("data-id"); imgs = imgs.filter(function (im) { return im.id !== id; }); saveImgs(); renderImgList(); renderSheet(); });
    });
  }
  function imgOf(role, nth) { var list = imgs.filter(function (i) { return i.role === role; }); return list[nth || 0] || null; }

  /* ---------- 地図（国土地理院） ---------- */
  function findMap() {
    var addr = (st.d.address || "").trim(), ms = $("#mapStatus");
    if (!addr) { ms.textContent = "先に所在地を入れてください。"; return; }
    ms.textContent = "国土地理院の住所検索で位置を調べています…";
    fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(addr))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (list) {
        if (!list || !list.length) { ms.textContent = "位置が見つかりませんでした。住所の書き方を変えるか、地図の画像を貼ってください。"; return; }
        var f = list[0], c = f.geometry.coordinates;
        st.map = { lon: c[0], lat: c[1], title: f.properties.title, z: (st.map && st.map.z) || 16 };
        ms.textContent = "「" + f.properties.title + "」の位置で地図を出しました。町名までの目安の位置です。物件の場所に印がずれていないか、必ず確かめてください。";
        saveSoon(); renderSheet();
      }).catch(function (e) { ms.textContent = "住所検索につながりませんでした（" + e.message + "）。地図の画像を貼ってください。"; });
  }
  function tileXY(lon, lat, z) {
    var s = Math.pow(2, z), rad = lat * Math.PI / 180;
    return { x: (lon + 180) / 360 * s, y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * s };
  }
  function drawMap(box) {
    var im = imgOf("map");
    if (im) { box.innerHTML = '<img class="fill contain" src="' + im.url + '" alt="地図">'; return; }
    if (!st.map) { box.innerHTML = '<div class="ph-empty">地図<br><span>「住所から地図を出す」か、地図の画像を貼ってください</span></div>'; return; }
    var w = box.clientWidth, h = box.clientHeight, z = st.map.z || 16;
    var t = tileXY(st.map.lon, st.map.lat, z), px = t.x * 256, py = t.y * 256;
    var x0 = Math.floor((px - w / 2) / 256), x1 = Math.floor((px + w / 2) / 256), y0 = Math.floor((py - h / 2) / 256), y1 = Math.floor((py + h / 2) / 256);
    var html = "";
    for (var tx = x0; tx <= x1; tx++) for (var ty = y0; ty <= y1; ty++) {
      html += '<img class="tile" alt="" src="https://cyberjapandata.gsi.go.jp/xyz/std/' + z + "/" + tx + "/" + ty + '.png" style="left:' + Math.round(tx * 256 - px + w / 2) + "px;top:" + Math.round(ty * 256 - py + h / 2) + 'px">';
    }
    html += '<span class="pin" style="left:' + (w / 2) + "px;top:" + (h / 2) + 'px"></span><span class="attr">地理院タイル（国土地理院）</span>';
    box.innerHTML = html;
  }

  /* ---------- 図面（A4）をつくる ---------- */
  function v(k) { return st.d[k]; }
  function miss() { return '<span class="miss"><span class="scr">未入力</span><span class="prt">—</span></span>'; }
  function val(s) { return isEmpty(s) ? miss() : esc(s); }
  function areaTxt(k) { var x = v(k); return isEmpty(x) ? miss() : esc(FUDOSAN.area(+x, 2)); }
  function builtTxt() {
    var b = v("built"); if (!b) return miss();
    var y = +String(b).slice(0, 4), m = String(b).length > 4 ? +String(b).slice(5, 7) : null, a = M.ageYears(b, new Date());
    return esc(y + "年" + (m ? m + "月" : "") + "（" + M.wareki(y) + (m ? m + "月" : "") + "）" + (a != null ? "　築" + a + "年" : ""));
  }
  function accessTxt() {
    var lines = [];
    [1, 2].forEach(function (i) {
      if (isEmpty(v("sta" + i)) && isEmpty(v("walk" + i))) return;
      lines.push(esc((v("line" + i) || "") + (v("sta" + i) ? "「" + v("sta" + i) + "」駅" : "") + (isEmpty(v("walk" + i)) ? "" : " 徒歩" + v("walk" + i) + "分")));
    });
    if (v("accessNote")) lines.push(esc(v("accessNote")));
    return lines.length ? lines.join("<br>") : miss();
  }
  function depTxt(k) {
    var s = v(k); if (isEmpty(s)) return miss();
    var m = String(s).match(/^(\d+(?:\.\d+)?)ヶ月/);
    if (m && v("rent")) return esc(s + "（" + Math.round(+m[1] * v("rent")).toLocaleString("ja-JP") + "円）");
    return esc(s);
  }
  function yenTxt(k) { var x = v(k); return isEmpty(x) ? miss() : esc(M.fmtYen(+x)); }
  function percTxt() { var a = v("kenpei"), b = v("yoseki"); if (isEmpty(a) && isEmpty(b)) return miss(); return esc((isEmpty(a) ? "—" : a + "%") + "／" + (isEmpty(b) ? "—" : b + "%")); }
  function floorTxt() {
    var a = v("floors"), b = v("floor");
    if (isEmpty(a) && isEmpty(b)) return miss();
    return esc((isEmpty(a) ? "" : a + "階建") + (isEmpty(b) ? "" : (isEmpty(a) ? "" : "の") + b + "階部分"));
  }
  function dateTxt(k) { var s = v(k); if (!s) return miss(); var p = String(s).split("-"); return esc(p.length === 3 ? +p[0] + "年" + +p[1] + "月" + +p[2] + "日" : s); }
  function rowsFor(kind) {
    var R = [];
    function r(l, h) { R.push([l, h]); }
    r("所在地", val(v("address")));
    r("交通", accessTxt());
    if (kind === "rent") {
      r("賃料", yenTxt("rent"));
      r("管理費・共益費", isEmpty(v("kanrihi")) && isEmpty(v("kyoeki")) ? miss() : esc([isEmpty(v("kanrihi")) ? "" : "管理費 " + M.fmtYen(+v("kanrihi")), isEmpty(v("kyoeki")) ? "" : "共益費 " + M.fmtYen(+v("kyoeki"))].filter(Boolean).join("／")));
      r("敷金", depTxt("shikikin")); r("礼金", depTxt("reikin"));
      if (!isEmpty(v("hoshokin"))) r("保証金", depTxt("hoshokin"));
      if (!isEmpty(v("shikibiki"))) r("敷引・償却", depTxt("shikibiki"));
      r("間取り", val(v("madori"))); r("専有面積", areaTxt("senyu"));
      if (!isEmpty(v("balcony"))) r("バルコニー", areaTxt("balcony"));
      r("構造", val(v("structure"))); r("階建・所在階", floorTxt());
      r("築年月", builtTxt()); r("向き", val(v("direction")));
      r("入居時期", val(v("hikiwatashi")));
      r("契約", v("teiki") ? esc("定期借家" + (v("keiyaku") ? "　期間 " + v("keiyaku") : "")) : (v("keiyaku") ? esc("期間 " + v("keiyaku")) : miss()));
      r("更新料", val(v("koshin"))); r("損害保険", val(v("hoken"))); r("保証会社", val(v("hoshoKaisha")));
      if (!isEmpty(v("sonota"))) r("その他の費用", val(v("sonota")));
      r("駐車場", val(v("parking")));
    } else {
      if (kind === "mansion") {
        r("管理費（月額）", yenTxt("kanrihi")); r("修繕積立金（月額）", yenTxt("shuzen"));
        r("間取り", val(v("madori"))); r("専有面積", areaTxt("senyu") + (v("senyuNote") ? esc("（" + v("senyuNote") + "）") : ""));
        r("バルコニー面積", areaTxt("balcony")); r("階建・所在階", floorTxt());
        r("構造", val(v("structure"))); r("築年月", builtTxt());
        r("向き", val(v("direction"))); r("総戸数", isEmpty(v("units")) ? miss() : esc(v("units") + "戸"));
        r("管理形態", val(v("kanriKeitai"))); r("土地の権利", val(v("kenri")));
        r("用途地域", val(v("youto")));
      }
      if (kind === "house") {
        r("土地面積", areaTxt("land")); r("建物面積", areaTxt("bldg")); r("私道負担", val(v("shido")));
        r("間取り", val(v("madori"))); r("構造", val(v("structure")) + (isEmpty(v("floors")) ? "" : esc("　" + v("floors") + "階建")) + (v("rento") ? esc("（連棟式）") : ""));
        r("築年月", builtTxt()); r("接道", val(v("road"))); r("土地の権利", val(v("kenri"))); r("地目", val(v("chimoku")));
        r("用途地域", val(v("youto"))); r("建ぺい率／容積率", percTxt()); r("法令上の制限", val(v("hourei")));
      }
      if (kind === "land") {
        r("土地面積", areaTxt("land") + (v("landNote") ? esc("（" + v("landNote") + "）") : "")); r("私道負担", val(v("shido")));
        r("地目", val(v("chimoku"))); r("用途地域", val(v("youto"))); r("建ぺい率／容積率", percTxt());
        r("接道", val(v("road"))); r("法令上の制限", val(v("hourei"))); r("土地の権利", val(v("kenri")));
        if (v("land") && v("price")) r("坪単価の目安", esc(M.fmtMan(Math.round(v("price") / (v("land") / TSUBO) * 10) / 10) + "/坪（" + M.fmtMan(Math.round(v("price") / v("land") * 10) / 10) + "/㎡）"));
      }
      r("現況", val(v("genkyo"))); r("引渡し時期", val(v("hikiwatashi")));
      r("駐車場", val(v("parking")));
    }
    return R;
  }
  function renderSheet() {
    var d = st.d, kind = d.kind || "mansion", isRent = kind === "rent";
    var sheet = $("#sheet");
    sheet.setAttribute("data-kind", kind);
    var priceHTML;
    if (isRent) {
      priceHTML = '<div class="k">賃料</div><div class="v">' + (isEmpty(d.rent) ? miss() : esc((+d.rent).toLocaleString("ja-JP")) + "<small>円</small>") + "</div>" +
        '<div class="s">' + esc([isEmpty(d.kanrihi) ? "" : "管理費 " + M.fmtYen(+d.kanrihi), isEmpty(d.kyoeki) ? "" : "共益費 " + M.fmtYen(+d.kyoeki)].filter(Boolean).join("／")) +
        (d.shikikin || d.reikin ? esc("　敷金 " + (d.shikikin || "—") + "／礼金 " + (d.reikin || "—")) : "") + "</div>";
    } else {
      var pm = isEmpty(d.price) ? null : M.fmtMan(+d.price);
      priceHTML = '<div class="k">価格</div><div class="v">' + (pm ? esc(pm.replace(/万円$/, "")) + "<small>" + (/万円$/.test(pm) ? "万円" : "") + "</small>" : miss()) + "</div>" +
        '<div class="s">' + (kind === "mansion" && (!isEmpty(d.kanrihi) || !isEmpty(d.shuzen)) ? esc("管理費 " + (isEmpty(d.kanrihi) ? "—" : M.fmtYen(+d.kanrihi)) + "／修繕積立金 " + (isEmpty(d.shuzen) ? "—" : M.fmtYen(+d.shuzen)) + "（月額）") : "") + "</div>";
    }
    var typeName = kind === "house" ? (d.built && M.monthsSince(d.built, new Date()) != null && M.monthsSince(d.built, new Date()) < 12 && d.minyukyo ? "新築一戸建て" : "中古一戸建て") : kind === "land" ? "売地" : kind === "rent" ? "賃貸" : "中古マンション";
    var planCap = kind === "land" ? (d.land ? "土地面積 " + FUDOSAN.area(+d.land, 2) : "") :
      [d.madori, kind === "house" ? (d.bldg ? "建物 " + FUDOSAN.area(+d.bldg, 2) : "") : (d.senyu ? "専有 " + FUDOSAN.area(+d.senyu, 2) : ""), d.balcony && kind !== "house" ? "バルコニー " + FUDOSAN.area(+d.balcony, 2) : ""].filter(Boolean).join("　");
    function ph(role, label, nth) {
      var im = imgOf(role, nth);
      return im ? '<img class="fill contain" src="' + im.url + '" alt="' + esc(label) + '">' : '<div class="ph-empty">' + esc(label) + "<br><span>画像を入れると、ここに入ります</span></div>";
    }
    var rows = rowsFor(kind);
    var half = Math.ceil(rows.length / 2), trs = "";
    for (var i = 0; i < half; i++) {
      var a = rows[i], b = rows[i + half];
      trs += "<tr><th>" + esc(a[0]) + "</th><td>" + a[1] + "</td>" + (b ? "<th>" + esc(b[0]) + "</th><td>" + b[1] + "</td>" : "<th></th><td></td>") + "</tr>";
    }
    var notes = "";
    if (d.setsubi) notes += '<div class="t">設備</div><p>' + esc(d.setsubi) + "</p>";
    if (d.biko) notes += '<div class="t">備考</div><p>' + esc(d.biko) + "</p>";
    if (d.madoriDetail) notes += '<div class="t">間取りの内訳</div><p>' + esc(d.madoriDetail) + "</p>";
    if (!notes) notes = '<div class="t">設備・備考</div><p class="miss"><span class="scr">設備・備考の欄に入れると、ここに出ます</span></p>';
    var taiyo = d.taiyo || "";
    var today = new Date();
    sheet.innerHTML =
      '<header class="sh-head"><div class="sh-title"><div class="sh-type">' + esc(typeName) + (taiyo ? '<span class="sh-taiyo-s">取引態様：' + esc(taiyo) + "</span>" : "") + "</div>" +
      '<div class="sh-name">' + (d.name ? esc(d.name) : miss()) + "</div>" + (d.catch ? '<p class="sh-catch">' + esc(d.catch) + "</p>" : "") + "</div>" +
      '<div class="sh-price">' + priceHTML + "</div></header>" +
      '<div class="sh-body"><div class="sh-plan"><div class="box">' + ph("madori", kind === "land" ? "区画図・地型図" : "間取り図") + "</div>" + (planCap ? '<div class="cap">' + esc(planCap) + "</div>" : "") + "</div>" +
      '<div class="sh-photos"><div class="box">' + ph("gaikan", kind === "land" ? "現地の写真" : "外観の写真") + '</div><div class="box">' + (imgOf("naikan") ? ph("naikan", "室内の写真") : (imgOf("gaikan", 1) ? ph("gaikan", "写真", 1) : ph("naikan", kind === "land" ? "周辺の写真" : "室内の写真"))) + "</div></div></div>" +
      '<div class="sh-table"><table>' + trs + "</table></div>" +
      '<div class="sh-low"><div class="sh-map"><div class="box" id="mapBox"></div></div><div class="sh-notes">' + notes + "</div></div>" +
      '<footer class="sh-obi"><div class="taiyo"><span>取引態様</span><b>' + (taiyo ? esc(taiyo.replace("（仲介）", "")) : miss()) + "</b>" + (taiyo === "媒介（仲介）" ? "<i>（仲介）</i>" : "") + "</div>" +
      '<div class="co"><div class="cn">' + (obi.company ? esc(obi.company) : '<span class="miss"><span class="scr">会社名（担当者向けの画面で入れます）</span></span>') + "</div>" +
      '<div class="cs">' + esc([obi.office, obi.license, obi.assoc].filter(Boolean).join("　")) + "</div></div>" +
      '<div class="tel">' + (obi.phone ? "<div class=\"tn\">TEL " + esc(obi.phone) + "</div>" : "") + (obi.person ? '<div class="cs">担当 ' + esc(obi.person) + "</div>" : "") + "</div></footer>" +
      '<div class="sh-foot"><span>情報作成日 ' + today.getFullYear() + "年" + (today.getMonth() + 1) + "月" + today.getDate() + "日</span>" +
      (d.yukoKigen ? "<span>取引条件の有効期限 " + dateTxt("yukoKigen") + "</span>" : "") +
      (d.koukaiBi ? "<span>情報公開日 " + dateTxt("koukaiBi") + "</span>" : "") + (d.koushinYotei ? "<span>次回更新予定日 " + dateTxt("koushinYotei") + "</span>" : "") +
      "<span>図面と現況がちがう場合は、現況を優先します。</span></div>";
    drawMap($("#mapBox"));
    fitText($(".sh-table", sheet), 8.6, 6.2);
    fitText($(".sh-notes", sheet), 8.2, 6.2);
    scaleSheet();
  }
  function fitText(el, from, min) {
    if (!el) return;
    var fs = from; el.style.fontSize = fs + "pt";
    while (el.scrollHeight > el.clientHeight + 1 && fs > min) { fs = Math.round((fs - 0.2) * 10) / 10; el.style.fontSize = fs + "pt"; }
    el.classList.toggle("overflow", el.scrollHeight > el.clientHeight + 1);
  }
  function scaleSheet() {
    var wrap = $("#sheetWrap"), sheet = $("#sheet");
    var s = Math.min(1, wrap.clientWidth / sheet.offsetWidth);
    sheet.style.transform = "scale(" + s + ")";
    wrap.style.height = Math.ceil(sheet.offsetHeight * s) + "px";
  }

  /* ---------- 広告のルールの確認 ---------- */
  function renderCheck() {
    var res = M.check(st.d, { medium: st.medium, obi: obi });
    var cnt = { alert: 0, caution: 0, ok: 0, info: 0 };
    res.forEach(function (r) { cnt[r.level]++; });
    $("#chkFigures").innerHTML =
      '<div class="figure"><div class="k">直したほうがよい</div><div class="v' + (cnt.alert ? " is-alert" : "") + '">' + cnt.alert + "<small>件</small></div></div>" +
      '<div class="figure"><div class="k">気をつけたい</div><div class="v">' + cnt.caution + "<small>件</small></div></div>" +
      '<div class="figure"><div class="k">問題なし</div><div class="v">' + cnt.ok + "<small>件</small></div></div>" +
      '<div class="figure"><div class="k">参考</div><div class="v">' + cnt.info + "<small>件</small></div></div>";
    var order = { alert: 0, caution: 1, info: 2, ok: 3 };
    var lab = { alert: "直す", caution: "注意", ok: "OK", info: "参考" };
    res.sort(function (a, b) { return order[a.level] - order[b.level]; });
    $("#chkList").innerHTML = res.map(function (r) {
      return '<li class="note ' + (r.level === "info" ? "" : r.level) + '"><span class="lv lv-' + r.level + '">' + lab[r.level] + "</span><b>" + esc(r.title) + "</b>" +
        (r.detail ? '<div class="small">' + esc(r.detail) + "</div>" : "") + (r.ref ? '<div class="ref">根拠：' + esc(r.ref) + "</div>" : "") + "</li>";
    }).join("");
  }
  function renderClientHints() {
    var s = st.d.senyu, box = $("#shuzenGuide");
    if (!box) return;
    if (st.d.kind === "mansion" && s) {
      var lo = Math.round(s * 235 / 100) * 100, hi = Math.round(s * 430 / 100) * 100, avg = Math.round(s * 335 / 100) * 100;
      box.innerHTML = "この部屋（" + esc(FUDOSAN.area(+s, 2)) + "）なら、国のガイドラインの平均（20階未満・延床5,000㎡未満の建物で1㎡あたり月335円）で<b>月" + avg.toLocaleString("ja-JP") + "円</b>くらい、多くの例が入る幅は<b>月" + lo.toLocaleString("ja-JP") + "〜" + hi.toLocaleString("ja-JP") + "円</b>です。" +
        (st.d.shuzen ? "この物件は月" + (+st.d.shuzen).toLocaleString("ja-JP") + "円" + (st.d.shuzen < lo ? "で、目安より低めです。これから値上げや一時金がないか、担当者に聞いてみてください。" : st.d.shuzen > hi ? "で、目安より高めです。大きな修理の予定や、これまでの積立ての状況を聞いてみてください。" : "で、目安の幅の中です。") : "");
    } else box.textContent = "中古マンションで専有面積を入れると、修繕積立金の目安をここに出します。";
  }
  function renderAll() { renderSheet(); renderCheck(); renderClientHints(); }

  /* ---------- 帯（会社の情報）とチェックリスト ---------- */
  function bindObi() {
    $all("[data-obi]").forEach(function (el) {
      var k = el.getAttribute("data-obi");
      el.value = obi[k] || "";
      el.addEventListener("input", function () { obi[k] = el.value; saveSoon(); renderSheet(); renderCheck(); });
    });
    $all("#staffCheck input[type=checkbox]").forEach(function (c, i) {
      c.checked = !!chk[i];
      c.addEventListener("change", function () { chk[i] = c.checked; save(KEY_CHK, chk); });
    });
  }

  /* ---------- 畳数の確かめ ---------- */
  function bindTatami() {
    var m2 = $("#tmM2"), ts = $("#tmTsubo"), jo = $("#tmJo"), out = $("#tmOut");
    function calc() {
      var a = n(m2.value), j = n(jo.value);
      if (!a || !j) { out.textContent = "部屋の広さと畳数を入れてください。"; out.className = "note"; return; }
      var per = a / j, maxJo = Math.floor(a / M.TATAMI * 10) / 10;
      if (per >= M.TATAMI) { out.textContent = "1畳あたり " + per.toFixed(2) + "㎡ です。1.62㎡以上なので、" + j + "畳と書けます。"; out.className = "note ok"; }
      else { out.textContent = "1畳あたり " + per.toFixed(2) + "㎡ で、1.62㎡より小さいです。この広さなら " + maxJo + "畳までと書きます（端数は切り捨て）。"; out.className = "note alert"; }
    }
    m2.addEventListener("input", function () { var a = n(m2.value); ts.value = a == null ? "" : (a / TSUBO).toFixed(2); calc(); });
    ts.addEventListener("input", function () { var t = n(ts.value); m2.value = t == null ? "" : (t * TSUBO).toFixed(2); calc(); });
    jo.addEventListener("input", calc);
  }

  /* ---------- 見本の文 ---------- */
  var SAMPLE = [
    "【見本】架空の物件です（実在しません）",
    "物件名：グリーンテラスあおば台 502号室",
    "所在地：東京都みなみ区あおば台2丁目",
    "交通：架空線「あおば台」駅 徒歩7分（約520m）／架空東線「ひがし台」駅 徒歩15分",
    "価格：3,980万円",
    "管理費：12,000円/月　修繕積立金：9,800円/月",
    "専有面積：65.12㎡（壁芯）　バルコニー面積：10.50㎡",
    "間取り：3LDK（LDK 14.5帖・洋室 6帖・洋室 5.5帖・洋室 4.5帖）",
    "所在階：5階　階建：地上10階建",
    "構造：鉄筋コンクリート造",
    "築年月：平成10年3月",
    "向き：南東　総戸数：48戸",
    "管理形態：管理会社に全部委託・管理員 日勤",
    "土地権利：所有権",
    "用途地域：第一種住居地域",
    "現況：居住中　引渡し：相談",
    "駐車場：空きなし",
    "設備：システムキッチン、浴室乾燥機、床暖房（LD）、宅配ボックス",
    "備考：2023年 浴室・キッチン交換済み。ペット飼育可（規約あり）",
    "セールスポイント：南東向きの角部屋、駅まで平坦な道です",
    "取引態様：専任媒介"
  ].join("\n");

  /* ---------- 印刷 ---------- */
  function printWith(kind) {
    document.body.setAttribute("data-print", kind);
    if (kind === "sheet") { var sh = $("#sheet"); sh.style.transform = "none"; }
    setTimeout(function () { window.print(); }, 50);
  }
  window.addEventListener("beforeprint", function () {
    if (!document.body.getAttribute("data-print")) document.body.setAttribute("data-print", "sheet");
    if (document.body.getAttribute("data-print") === "sheet") $("#sheet").style.transform = "none";
  });
  window.addEventListener("afterprint", function () { document.body.removeAttribute("data-print"); scaleSheet(); });

  /* ---------- はじめに ---------- */
  function init() {
    buildForm(); fillForm();
    $("#onlyEmpty").checked = st.fill !== false;
    $("#onlyEmpty").addEventListener("change", function () { st.fill = $("#onlyEmpty").checked; saveSoon(); });
    $("#readBtn").addEventListener("click", function () {
      var t = $("#src").value;
      if (!t.trim()) { $("#readStatus").textContent = "先に、物件資料の文を貼るか、PDFを選んでください。"; return; }
      applyParse(t);
    });
    $("#sampleBtn").addEventListener("click", function () { $("#src").value = SAMPLE; $("#readStatus").textContent = "見本の文（架空の物件）を入れました。「読み取って入れる」を押すと、下の欄に入ります。"; });
    $("#resetBtn").addEventListener("click", function () {
      if (!confirm("入力した項目・自動の目印・地図の位置をすべて空にします。画像と帯（会社の情報）は残ります。よろしいですか。")) return;
      st = { d: { kind: st.d.kind || "mansion" }, auto: {}, map: null, medium: st.medium, fill: st.fill };
      $("#src").value = ""; $("#readStatus").textContent = ""; $("#pairs").innerHTML = "";
      fillForm(); renderAll(); saveSoon();
    });
    $("#clearAuto").addEventListener("click", function () { st.auto = {}; refreshMarks(); saveSoon(); });
    $("#file").addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) return readPdf(f);
          if (/^image\//.test(f.type)) return readImage(f).then(function (u) { addImage(u, f.name); $("#fileStatus").textContent = "画像を「図面に使う画像」に入れました。試作では画像の文字は読みません（項目は手で入れるか、文を貼ってください）。"; });
          $("#fileStatus").textContent = "PDFか画像（JPEG・PNG）を選んでください。";
        });
      });
      e.target.value = "";
    });
    $("#pdfAsImage").addEventListener("click", function () {
      if (!lastPdf) return;
      if (!confirm("PDFの1ページ目を、そのまま画像として図面に貼ります。他社が作った図面や写真の場合は、使う許可があるときだけにしてください。続けますか。")) return;
      pdfPageToImage(lastPdf, 1, "madori");
    });
    $("#imgFile").addEventListener("change", function (e) {
      Array.prototype.slice.call(e.target.files || []).forEach(function (f) { readImage(f).then(function (u) { addImage(u, f.name); }); });
      e.target.value = "";
    });
    $("#mapBtn").addEventListener("click", findMap);
    $("#mapClear").addEventListener("click", function () { st.map = null; $("#mapStatus").textContent = ""; saveSoon(); renderSheet(); });
    $all("#mapZoom button").forEach(function (b) {
      b.classList.toggle("on", +b.getAttribute("data-z") === ((st.map && st.map.z) || 16));
      b.addEventListener("click", function () {
        $all("#mapZoom button").forEach(function (x) { x.classList.toggle("on", x === b); });
        if (st.map) { st.map.z = +b.getAttribute("data-z"); saveSoon(); renderSheet(); }
      });
    });
    $all("#medium button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-m") === st.medium);
      b.addEventListener("click", function () {
        st.medium = b.getAttribute("data-m");
        $all("#medium button").forEach(function (x) { x.classList.toggle("on", x === b); });
        refreshMarks(); renderCheck(); saveSoon();
      });
    });
    $("#printSheet").addEventListener("click", function () { printWith("sheet"); });
    $("#printCheck").addEventListener("click", function () { printWith("check"); });
    bindObi(); bindTatami(); renderImgList();
    if (imgs.length) $("#imgState").textContent = "画像もこのブラウザの中に保存しています。";
    renderAll();
    window.addEventListener("resize", scaleSheet);
    document.addEventListener("modechange", function () { setTimeout(scaleSheet, 0); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
