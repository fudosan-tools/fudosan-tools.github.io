/* 物件ノートの画面。物件と資料は、この端末のブラウザの中（IndexedDB）にだけ保存する。
   読み取りの部品（pdf.js と Tesseract.js）も一緒に置いてあり、資料は外へ送らない。 */
(function () {
  "use strict";
  var X = window.BukkenExtract, T = window.BukkenTouki, DB_NAME = "fudosanBukken", STORE = "bukken";
  var PARTS = new URL("data/parts/", location.href).href;   // 読み取りの部品は同じ場所に置く（外のサイトが止まっても動くように）
  var MAX_PDF_PAGES = 40, MAX_OCR_PAGES = 15, SEND_KEY = "fudosanBukkenSend";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------------------------------------------------------------- 保存
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, ng) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: "id" }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ng(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, ng) {
        var t = d.transaction(STORE, mode), res = fn(t.objectStore(STORE));
        t.oncomplete = function () { ok(res && res.result); };
        t.onerror = t.onabort = function () { ng(t.error); };
      });
    });
  }
  var allP = function () { return tx("readonly", function (s) { return s.getAll(); }); };
  var putP = function (p) { return tx("readwrite", function (s) { return s.put(p); }); };
  var delP = function (id) { return tx("readwrite", function (s) { return s.delete(id); }); };

  var list = [], cur = null, saveTimer = null;
  function newId() { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function blank() { return { id: newId(), created: Date.now(), updated: Date.now(), docs: [], manual: {}, memo: "", parcelEdits: {}, manualParcels: [], checks: {}, keep: [], checker: "" }; }
  function fillIn(p) { p.parcelEdits = p.parcelEdits || {}; p.manualParcels = p.manualParcels || []; p.checks = p.checks || {}; p.keep = p.keep || []; return p; }
  function parcelsOf(p) { return T.judgeParcels(p.docs, p.parcelEdits, p.manualParcels); }
  // 筆の合計を、資料のひとつとして項目に入れる
  function docsWithSum(p) {
    var ps = parcelsOf(p);
    if (!ps.some(function (x) { return x.kind === "land"; })) return p.docs;
    var m = T.summary(ps), f = {};
    if (m.hon) f.land = m.hon;
    if (m.shi) f.shido = m.shi + "㎡（持分をかけると " + m.shiShare + "㎡）";
    return [{ id: "sum", name: "筆ごとの合計", type: "touki", fields: f }].concat(p.docs);
  }
  function values(p) {
    var m = X.merge(docsWithSum(p)), o = {};
    X.FIELDS.forEach(function (f) {
      var k = f[0];
      if (p.manual[k] != null) o[k] = p.manual[k];
      else if (m[k] && m[k].length) o[k] = m[k][0].value;
    });
    return o;
  }
  function titleOf(p) { var v = values(p); return v.name || v.address || v.tokiShozai || "名前のない物件"; }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!cur) return;
      cur.updated = Date.now();
      putP(cur).then(function () { $("saveMsg").textContent = "この端末に保存しました"; renderList(); })
        .catch(function (e) { $("saveMsg").textContent = "保存できませんでした：" + (e && e.message || e) + "（端末の空きを確かめてください）"; });
    }, 300);
  }

  // ---------------------------------------------------------------- 一覧
  function renderList() {
    var q = $("q").value.trim();
    var rows = list.slice().sort(function (a, b) { return b.updated - a.updated; })
      .filter(function (p) { if (!q) return true; var v = values(p); return (titleOf(p) + " " + (v.address || "") + " " + (p.memo || "")).indexOf(q) >= 0; });
    $("emptyMsg").hidden = list.length > 0;
    $("plist").innerHTML = rows.map(function (p) {
      var v = values(p), bits = [];
      if (v.address && v.address !== titleOf(p)) bits.push(v.address);
      if (v.price != null) bits.push(v.price + "万円");
      bits.push("資料 " + p.docs.length + "件", new Date(p.updated).toLocaleDateString("ja-JP"));
      var cs = buildChecks(p), left = cs.filter(function (c) { return !isDone(p, c); }).length;
      return '<li class="' + (cur && cur.id === p.id ? "on" : "") + '"><button type="button" class="open" data-id="' + esc(p.id) + '"><b>' + esc(titleOf(p)) + "</b>" +
        (cs.length ? (left ? '<span class="badge">未確認 ' + left + "</span>" : '<span class="badge ok">確認ずみ</span>') : "") + "<small>" + esc(bits.join("／")) + "</small></button></li>";
    }).join("");
  }
  function open(p) {
    cur = p; $("editor").hidden = false; $("saveMsg").textContent = ""; $("fileStatus").textContent = "";
    fillIn(p);
    $("memo").value = p.memo || ""; $("checker").value = p.checker || "";
    renderList(); renderEditor();
  }
  function ensureCur() {
    if (cur) return cur;
    var p = blank(); list.push(p); open(p); return p;
  }

  // ---------------------------------------------------------------- 編集
  function renderEditor() {
    if (!cur) return;
    var types = X.TYPES.concat([{ id: "other", name: "そのほかの資料" }]);
    $("dlist").innerHTML = cur.docs.map(function (d) {
      var n = Object.keys(d.fields || {}).length;
      return '<li><div class="h"><span class="nm">' + esc(d.name) + "</span>" +
        '<select data-type="' + esc(d.id) + '" aria-label="資料の種類">' + types.map(function (t) { return '<option value="' + t.id + '"' + (t.id === d.type ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select>" +
        '<span class="small muted">' + n + "項目" + (d.ocr ? "・画像から読んだ" : "") + "</span>" +
        (d.blob ? '<button type="button" class="btn" data-view="' + esc(d.id) + '">元の資料</button>' : "") +
        '<button type="button" class="btn" data-rm="' + esc(d.id) + '">外す</button></div>' +
        (d.note ? '<p class="small note caution" style="margin:6px 0 0">' + esc(d.note) + "</p>" : "") +
        "<details><summary class=\"small\">読み取った文（取り消し線は下線として読んだ部分）</summary><pre>" + esc(d.text || "（文字がありません）").split(T.ST).join("<s>").split(T.EN).join("</s>") + "</pre></details></li>";
    }).join("");
    renderParcels();
    var m = X.merge(docsWithSum(cur));
    $("ftable").innerHTML = X.FIELDS.map(function (f) {
      var k = f[0], cands = m[k] || [], manual = cur.manual[k], val = manual != null ? manual : cands.length ? cands[0].value : "";
      if (manual == null && !cands.length && !["name", "address", "price", "land", "bldg", "built", "structure", "evalLand", "evalBldg", "road", "rosenka"].includes(k)) return "";
      var from = manual != null ? "手で入れた値" : cands.length ? "資料：" + cands[0].docName : "";
      var others = cands.filter(function (c) { return String(c.value) !== String(val); });
      return '<div class="k"><label for="f_' + k + '">' + esc(f[1]) + (f[2] ? "（" + esc(f[2]) + "）" : "") + "</label></div>" +
        '<div class="v"><input type="text" id="f_' + k + '" data-k="' + k + '" value="' + esc(val) + '" autocomplete="off">' +
        (from ? '<span class="src">' + esc(from) + "</span>" : "") +
        (others.length ? '<div class="alt">' + others.map(function (c) { return '<button type="button" data-k="' + k + '" data-v="' + esc(c.value) + '">' + esc(c.value + (f[2] || "")) + "（" + esc(c.docName) + "）</button>"; }).join("") + "</div>" : "") + "</div>";
    }).join("");
    renderSend();
  }
  // ---------------------------------------------------------------- 筆の表と、人の確認（Wチェック）
  var ROLE_NG = ["本地", "私道", "対象外"];
  function label(x) { return x.kind === "bldg" ? "家屋番号 " + (x.kaoku || x.key) : "地番 " + (x.chiban || x.key); }
  function shareText(x) {
    if (x.humanShare) return x.humanShare.den + "分の" + x.humanShare.num;
    return x.owners && x.owners.length ? T.ownersText(x.owners) : x.manual ? "未入力" : "読み取れていません";
  }
  // 確認の質問。v は今の値で、値が変わったら答えをやり直す
  function buildChecks(p) {
    fillIn(p);
    var out = [], ps = parcelsOf(p);
    ps.forEach(function (x) {
      if (x.kind === "bldg") out.push({ id: "bld:" + x.key, kind: "bld", key: x.key, v: x.key, q: label(x) + " の建物は、この物件のものであっていますか？", why: [x.structure, x.floorArea && x.floorArea + "㎡"].filter(Boolean).join("・") });
      else out.push({ id: "role:" + x.key, kind: "role", key: x.key, v: x.role, q: label(x) + " は" + x.role + "であっていますか？", warn: x.conf === "低" && !x.byHuman,
        why: [x.area != null ? x.area + "㎡" : "", x.chimoku].filter(Boolean).join("・") + "。" + (x.reasons || []).join("。") });
      var sum = x.owners && x.owners.length ? T.shareSum(x.owners) : null;
      out.push({ id: "share:" + x.key, kind: "share", key: x.key, v: shareText(x), q: label(x) + " の持分は「" + shareText(x) + "」であっていますか？", warn: sum != null && sum !== 1 && !x.humanShare, why: sum != null && sum !== 1 && !x.humanShare ? "持分を合計すると " + sum + " になり、1になりません。読み落としか、一部の持分だけの売買かもしれません。" : "" });
      (x.liens || []).forEach(function (l) { out.push({ id: "lien:" + x.key + ":" + l, kind: "ok", v: l, q: label(x) + " に「" + l + "」が残っていますが、あっていますか？", warn: true, why: "下線がある古い登記なら、消えているはずです。" }); });
      if (x.struck && x.struck.length) out.push({ id: "struck:" + x.key, kind: "struck", lines: x.struck, v: x.struck.join("／"), q: label(x) + " で、下線のある " + x.struck.length + " 行を古い情報として扱いました。あっていますか？", why: x.struck.join("　／　") });
    });
    var m = X.merge(docsWithSum(p));
    X.FIELDS.forEach(function (f) {
      var k = f[0], c = m[k]; if (!c || !c.length || p.manual[k] != null) return;
      var ocrDoc = p.docs.find(function (d) { return d.id === c[0].docId && d.ocr; });
      if (c.length > 1) out.push({ id: "field:" + k, kind: "field", field: k, v: String(c[0].value), q: f[1] + "は「" + c[0].value + (f[2] || "") + "」であっていますか？", warn: true, why: "資料どうしで値がちがいます。" + c.map(function (x) { return x.docName + "：" + x.value; }).join("／") });
      else if (ocrDoc && (f[2] || /地番|所有者/.test(f[1]))) out.push({ id: "field:" + k, kind: "field", field: k, v: String(c[0].value), q: f[1] + "は「" + c[0].value + (f[2] || "") + "」であっていますか？", why: "画像から読んだ値です（" + c[0].docName + "）。" });
    });
    return out;
  }
  function isDone(p, c) { var a = p.checks[c.id]; return !!(a && a.v === c.v && (a.ans === "yes" || a.ans === "fixed")); }
  function answer(c, ans, note) {
    cur.checks[c.id] = { ans: ans, v: c.v, by: cur.checker || "", at: new Date().toISOString(), note: note || (cur.checks[c.id] && cur.checks[c.id].note) || "" };
  }
  function renderParcels() {
    var ps = parcelsOf(cur);
    $("ptable").innerHTML = ps.length ? "<thead><tr><th>筆</th><th>判定</th><th>面積</th><th>地目</th><th>所有者と持分</th></tr></thead><tbody>" + ps.map(function (x) {
      return "<tr><td>" + esc(label(x)) + "</td><td>" + esc(x.role) + (x.byHuman ? "（人が直した）" : x.conf === "低" ? "（要確認）" : "") + "</td><td>" + (x.area != null ? esc(x.area) + "㎡" : x.floorArea ? esc(x.floorArea) + "㎡" : "—") + "</td><td>" + esc(x.chimoku || x.shurui || "—") + "</td><td>" + esc(shareText(x)) + "</td></tr>";
    }).join("") + "</tbody>" : '<tbody><tr><td class="small muted">筆はまだありません。謄本を入れるか、手で足してください。</td></tr></tbody>';
    $("maps").innerHTML = cur.docs.filter(function (d) { return (d.type === "kouzu" || d.type === "sokuryo") && (d.preview || d.blob); }).map(function (d) {
      var src = d.preview || (d.blob && /^image\//.test(d.blob.type) ? URL.createObjectURL(d.blob) : "");
      return src ? '<figure><a href="' + esc(src) + '" target="_blank" rel="noopener"><img src="' + esc(src) + '" alt="' + esc(d.name) + '"></a><figcaption>' + esc(d.name) + "（図の形は目で確かめてください）</figcaption></figure>" : "";
    }).join("");
    var cs = buildChecks(cur), done = cs.filter(function (c) { return isDone(cur, c); }).length;
    $("chkbar").textContent = cs.length ? "人の確認：" + done + "／" + cs.length + (done === cs.length ? "　すべて確認しました" : "　残り " + (cs.length - done)) : "確かめる項目はまだありません。";
    $("chks").innerHTML = cs.map(function (c) {
      var a = cur.checks[c.id], d = isDone(cur, c), no = a && a.v === c.v && a.ans === "no";
      var fix = "";
      if (no) {
        if (c.kind === "role") fix = "選び直す：" + ROLE_NG.map(function (r) { return '<button type="button" class="btn" data-pick="' + r + '">' + r + "</button>"; }).join(" ");
        else if (c.kind === "struck") fix = "下線ではない行を押すと、今の情報として読み直します。" + c.lines.map(function (l, i) { return '<div style="margin-top:6px"><button type="button" class="btn" data-unstruck="' + i + '">' + esc(l) + "</button></div>"; }).join("");
        else if (c.kind === "share") fix = '持分：<input type="number" data-den min="1" style="width:5em" aria-label="分母">分の<input type="number" data-num min="0" style="width:5em" aria-label="分子"> <button type="button" class="btn" data-setshare="1">直す</button>';
        else if (c.kind === "field") fix = '正しい値：<input type="text" data-val style="max-width:14em" aria-label="正しい値"> <button type="button" class="btn" data-setval="1">直す</button>';
        fix = '<div class="fix">' + fix + '<textarea data-comment placeholder="コメント（例：私道です、持分8分の1、地番は123番457、面積45.5㎡）">' + esc(a.note || "") + '</textarea><button type="button" class="btn" data-cmt="1">コメントを読みとって直す</button><span class="small muted" data-cmtmsg>' + esc(a.msg || "") + "</span></div>";
      }
      return '<div class="chk' + (d ? " done" : "") + (c.warn && !d ? " warn" : "") + '" data-c="' + esc(c.id) + '"><div class="q">' + esc(c.q) + "</div>" + (c.why ? '<p class="why">' + esc(c.why) + "</p>" : "") +
        '<div class="ans"><button type="button" class="btn' + (d ? " on" : "") + '" data-yes="1">はい</button><button type="button" class="btn' + (no ? " on" : "") + '" data-no="1">いいえ</button></div>' + fix + "</div>";
    }).join("");
    var left = cs.length - done;
    $("sendWarn").hidden = !left;
    $("sendWarn").textContent = left ? "人の確認がまだ " + left + " 件残っています。送る値が正しいとは限りません。" : "";
  }
  function reread() { cur.docs.forEach(function (d) { d.fields = X.extract(T.applyKeep(d.text || "", cur.keep), d.type, d.name).fields; }); }
  function editParcel(key, o) { cur.parcelEdits[key] = Object.assign(cur.parcelEdits[key] || {}, o); }
  $("chks").addEventListener("click", function (e) {
    var t = e.target, box = t.closest && t.closest("[data-c]"); if (!box || t.tagName !== "BUTTON") return;
    var c = buildChecks(cur).find(function (x) { return x.id === box.getAttribute("data-c"); }); if (!c) return;
    function finish(afterKey) {
      var fresh = buildChecks(cur).find(function (x) { return x.id === (afterKey || c.id); });
      if (fresh) { var note = box.querySelector("[data-comment]"); cur.checks[fresh.id] = { ans: "fixed", v: fresh.v, by: cur.checker || "", at: new Date().toISOString(), note: note ? note.value : "" }; }
      saveSoon(); renderEditor();
    }
    if (t.hasAttribute("data-yes")) { answer(c, "yes"); saveSoon(); renderEditor(); return; }
    if (t.hasAttribute("data-no")) { answer(c, "no"); saveSoon(); renderEditor(); return; }
    if (t.hasAttribute("data-pick")) { editParcel(c.key, { role: t.getAttribute("data-pick") }); finish(); return; }
    if (t.hasAttribute("data-unstruck")) { cur.keep.push(c.lines[+t.getAttribute("data-unstruck")]); reread(); saveSoon(); renderEditor(); return; }
    if (t.hasAttribute("data-setshare")) {
      var den = +box.querySelector("[data-den]").value, n = +box.querySelector("[data-num]").value;
      if (den > 0 && n >= 0) { editParcel(c.key, { share: { den: den, num: n } }); finish(); } return;
    }
    if (t.hasAttribute("data-setval")) { var val = box.querySelector("[data-val]").value.trim(); if (val) { cur.manual[c.field] = val; delete cur.checks[c.id]; saveSoon(); renderEditor(); } return; }
    if (t.hasAttribute("data-cmt")) {
      var text = box.querySelector("[data-comment]").value, r = T.parseComment(text), bits = [], a = cur.checks[c.id];
      if (c.key) {
        if (r.role) { editParcel(c.key, { role: r.role }); bits.push(r.role); }
        if (r.share) { editParcel(c.key, { share: r.share }); bits.push("持分" + r.share.den + "分の" + r.share.num); }
        if (r.area != null) { editParcel(c.key, { area: r.area }); bits.push("面積" + r.area + "㎡"); }
        if (r.chiban) { editParcel(c.key, { chiban: r.chiban }); bits.push("地番" + r.chiban); }
      }
      if (bits.length) { finish(); return; }
      a.note = text; a.msg = "直す内容を読みとれなかったので、メモとして残しました。選び直すか、値を入れてください。";
      saveSoon(); renderEditor();
    }
  });
  $("checker").addEventListener("input", function () { if (cur) { cur.checker = this.value; saveSoon(); } });
  $("aBtn").addEventListener("click", function () {
    var ch = $("aChiban").value.trim(); if (!ch || !T.chibanKey(ch)) { $("aChiban").focus(); return; }
    ensureCur().manualParcels.push({ chiban: ch, area: parseFloat($("aArea").value) || null, chimoku: $("aChimoku").value.trim() });
    $("aChiban").value = $("aArea").value = $("aChimoku").value = "";
    saveSoon(); renderEditor();
  });
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return isFinite(n) ? n : null; }
  function renderSend() {
    var v = values(cur), q = new URLSearchParams();
    var addr = v.address || v.tokiShozai;
    if (addr) q.set("addr", addr);
    if (num(v.land)) q.set("area", num(v.land));
    if (num(v.price)) q.set("price", num(v.price));
    if (num(v.bldg)) q.set("floor", num(v.bldg));
    var y = /^(\d{4})/.exec(v.built || ""); if (y) q.set("built", y[1]);
    var sc = X.structCode(v.structure || ""); if (sc) q.set("struct", sc);
    if (v.youto) q.set("youto", v.youto);
    if (v.road) q.set("road", v.road);
    if (num(v.rosenka)) q.set("rosenka", num(v.rosenka));
    $("toSekisan").href = "../シミュレーター/sekisan.html?" + q.toString();
    var c = new URLSearchParams();
    if (num(v.price)) c.set("total", num(v.price));
    if (num(v.evalLand)) c.set("evalLand", num(v.evalLand));
    if (num(v.evalBldg)) c.set("evalBldg", num(v.evalBldg));
    $("toChukai").href = "../シミュレーター/chukai.html" + (c.toString() ? "?" + c.toString() : "");
    $("toSurvey").href = "../物件調査/index.html" + (addr ? "?q=" + encodeURIComponent(addr) : "");
  }

  // ---------------------------------------------------------------- 読む部品
  function loadScript(url) {
    return new Promise(function (ok, ng) {
      var s = document.createElement("script"); s.src = url; s.onload = ok;
      s.onerror = function () { ng(new Error("読み取りの部品を読みこめませんでした。インターネットの接続を確かめてください")); };
      document.head.appendChild(s);
    });
  }
  var pdfReady = null, ocrReady = null;
  function pdfLib() {
    if (!pdfReady) pdfReady = loadScript(PARTS + "pdf.min.js").then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PARTS + "pdf.worker.min.js"; return window.pdfjsLib; }).catch(function (e) { pdfReady = null; throw e; });
    return pdfReady;
  }
  function ocrWorker(status) {
    if (!ocrReady) ocrReady = loadScript(PARTS + "tesseract.min.js").then(function () {
      return window.Tesseract.createWorker("jpn", 1, { workerPath: PARTS + "worker.min.js", corePath: PARTS, langPath: PARTS.replace(/\/$/, ""), gzip: true, workerBlobURL: false, logger: function (m) {
        if (m.status === "loading language traineddata" && status) status("読み取りの部品を準備しています（" + Math.round((m.progress || 0) * 100) + "%）");
      } });
    }).catch(function (e) { ocrReady = null; throw e; });
    return ocrReady;
  }
  // ページの横線を集める（下線を見つけるため）
  async function hLines(page, lib) {
    var ol = await page.getOperatorList(), O = lib.OPS, ctm = [1, 0, 0, 1, 0, 0], st = [], segs = [];
    function pt(x, y) { return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]; }
    function add(x0, y0, x1, y1) { var a = pt(x0, y0), b = pt(x1, y1); if (Math.abs(a[1] - b[1]) < 0.8 && Math.abs(a[0] - b[0]) > 3) segs.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: (a[1] + b[1]) / 2 }); }
    for (var i = 0; i < ol.fnArray.length; i++) {
      var fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === O.save) st.push(ctm.slice());
      else if (fn === O.restore) ctm = st.pop() || ctm;
      else if (fn === O.transform) ctm = [ctm[0] * a[0] + ctm[2] * a[1], ctm[1] * a[0] + ctm[3] * a[1], ctm[0] * a[2] + ctm[2] * a[3], ctm[1] * a[2] + ctm[3] * a[3], ctm[0] * a[4] + ctm[2] * a[5] + ctm[4], ctm[1] * a[4] + ctm[3] * a[5] + ctm[5]];
      else if (fn === O.constructPath) {
        var k = 0, cx = 0, cy = 0, c = a[1];
        a[0].forEach(function (op) {
          if (op === O.rectangle) { if (Math.abs(c[k + 3]) < 2) add(c[k], c[k + 1] + c[k + 3] / 2, c[k] + c[k + 2], c[k + 1] + c[k + 3] / 2); k += 4; }
          else if (op === O.moveTo) { cx = c[k]; cy = c[k + 1]; k += 2; }
          else if (op === O.lineTo) { add(cx, cy, c[k], c[k + 1]); cx = c[k]; cy = c[k + 1]; k += 2; }
          else if (op === O.curveTo) k += 6;
          else if (op === O.curveTo2 || op === O.curveTo3) k += 4;
        });
      }
    }
    return segs;
  }
  // 文字のすぐ下に線があり、線の長さが文字の幅に近ければ下線。長すぎる線は表の罫線として外す
  function underlined(it, segs, items) {
    var x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10, w = it.width || 0;
    if (!(w > 0) || !it.str.trim()) return false;
    return segs.some(function (s) {
      if (s.y < y - h * 0.45 || s.y > y + h * 0.12) return false;
      var over = Math.min(s.x1, x + w) - Math.max(s.x0, x);
      if (over < w * 0.6) return false;
      var span = 0;
      items.forEach(function (o) {
        if (typeof o.str !== "string" || !o.str.trim() || Math.abs(o.transform[5] - y) > h * 0.4) return;
        var ov = Math.min(s.x1, o.transform[4] + (o.width || 0)) - Math.max(s.x0, o.transform[4]);
        if (ov > 0) span += ov;
      });
      return (s.x1 - s.x0) <= span * 1.6 + h;
    });
  }
  function textFromItems(items, segs) {
    var out = "", lastY = null, lastEnd = null;
    items.forEach(function (it) {
      if (typeof it.str !== "string") return;
      var x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      if (lastY != null && Math.abs(y - lastY) > h * 0.6) out += "\n";
      else if (lastEnd != null && x - lastEnd > h * 0.8) out += "\t";
      out += segs && underlined(it, segs, items) ? T.ST + it.str + T.EN : it.str;
      if (it.hasEOL) { out += "\n"; lastY = null; lastEnd = null; return; }
      lastY = y; lastEnd = x + (it.width || 0);
    });
    return out;
  }
  async function toCanvas(src) {
    if (src.getContext) return src;
    var bmp = await createImageBitmap(src), c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0);
    return c;
  }
  // 言葉のすぐ下に、言葉の幅いっぱいの黒い横線があれば下線。行の幅をはるかにこえる線は表の罫線として外す
  function wordUnderlined(px, W, H, b, lineW) {
    var w = b.x1 - b.x0, hh = b.y1 - b.y0; if (w < 3 || hh < 3) return false;
    for (var y = Math.max(0, b.y1 - 2); y < Math.min(H, b.y1 + Math.max(4, hh * 0.35)); y++) {
      var dark = 0;
      for (var x = b.x0; x < b.x1; x++) { var i = (y * W + x) * 4; if (px[i] < 130 && px[i + 1] < 130 && px[i + 2] < 130) dark++; }
      if (dark < w * 0.85) continue;
      var l = b.x0, r = b.x1;
      var isD = function (xx) { var j = (y * W + xx) * 4; return px[j] < 130 && px[j + 1] < 130 && px[j + 2] < 130; };
      while (l > 0 && isD(l - 1)) l--;
      while (r < W - 1 && isD(r + 1)) r++;
      if (r - l <= lineW * 1.6 + hh) return true;
    }
    return false;
  }
  async function ocrCanvas(src, status) {
    var w = await ocrWorker(status), c = await toCanvas(src);
    var r = await w.recognize(c, {}, { text: true, blocks: true });
    var blocks = r.data.blocks;
    if (!blocks || !blocks.length) return X.tidyOcr(r.data.text || "");
    var px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, out = [];
    blocks.forEach(function (bk) { (bk.paragraphs || []).forEach(function (pa) { (pa.lines || []).forEach(function (ln) {
      var lw = ln.bbox.x1 - ln.bbox.x0;
      var ws = ln.words || [], marks = ws.map(function (wd) { return wordUnderlined(px, c.width, c.height, wd.bbox, lw); });
      // 画像では言葉の切れ目で線を見落としやすいので、半分以上に線があれば行ぜんぶを下線とする
      var many = marks.filter(Boolean).length * 2 >= ws.length && ws.length > 0;
      var tx = ws.map(function (wd) { return wd.text; }).join(" ");
      out.push(many ? T.ST + tx + T.EN : tx);
    }); }); });
    return X.tidyOcr(out.join("\n"));
  }
  async function readPdf(file, status) {
    var lib = await pdfLib(), pdf = await lib.getDocument({ data: await file.arrayBuffer(), cMapUrl: PARTS + "cmaps/", cMapPacked: true }).promise;
    var pages = Math.min(pdf.numPages, MAX_PDF_PAGES), texts = [];
    for (var p = 1; p <= pages; p++) {
      status(file.name + "：" + pages + "ページ中" + p + "ページ目");
      var page = await pdf.getPage(p), tc = await page.getTextContent();
      texts.push(textFromItems(tc.items, await hLines(page, lib)));
    }
    var pv = await pagePreview(pdf);
    var text = texts.join("\n"), note = pdf.numPages > pages ? "はじめの" + pages + "ページだけ読みました（全部で" + pdf.numPages + "ページ）。" : "";
    if (text.replace(/\s/g, "").length >= pages * 20) return { text: text, note: note, preview: pv };
    // 文字が入っていない（スキャンなど）ときは、ページを画像にして読む
    var n = Math.min(pdf.numPages, MAX_OCR_PAGES), parts = [];
    for (var q = 1; q <= n; q++) {
      status(file.name + "：画像から文字を読んでいます（" + n + "ページ中" + q + "ページ目）");
      var pg = await pdf.getPage(q), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(3, 2200 / Math.max(vp0.width, vp0.height)) });
      var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      parts.push(await ocrCanvas(c, status));
    }
    return { text: parts.join("\n"), ocr: true, note: (pdf.numPages > n ? "はじめの" + n + "ページだけ読みました（全部で" + pdf.numPages + "ページ）。" : "") + "画像から読んだ文です。数字を必ず資料と見くらべてください。", preview: pv };
  }
  async function pagePreview(pdf) {
    var pg = await pdf.getPage(1), v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: Math.min(2, 1200 / Math.max(v0.width, v0.height)) });
    var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return c.toDataURL("image/jpeg", 0.7);
  }
  async function readFile(file, status) {
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return readPdf(file, status);
    if (/^image\//.test(file.type)) {
      status(file.name + "：画像から文字を読んでいます");
      return { text: await ocrCanvas(file, status), ocr: true, note: "画像から読んだ文です。数字を必ず資料と見くらべてください。" };
    }
    return { text: await file.text() };
  }
  function addDoc(name, res, blob) {
    var p = ensureCur(), r = X.extract(res.text || "", null, name);
    p.docs.push({ id: newId(), name: name, type: r.type, fields: r.fields, text: res.text || "", ocr: !!res.ocr, note: res.note || "", blob: blob || null, preview: res.preview || null });
    saveSoon();
  }

  // ---------------------------------------------------------------- 操作
  $("newBtn").addEventListener("click", function () { var p = blank(); list.push(p); open(p); $("editor").scrollIntoView({ block: "start" }); });
  $("q").addEventListener("input", renderList);
  $("plist").addEventListener("click", function (e) {
    var b = e.target.closest("[data-id]"); if (!b) return;
    var p = list.find(function (x) { return x.id === b.getAttribute("data-id"); }); if (p) open(p);
  });
  $("file").addEventListener("change", async function () {
    var files = Array.prototype.slice.call(this.files), st = $("fileStatus"), done = 0, bad = [];
    this.value = "";
    if (!files.length) return;
    ensureCur();
    for (var i = 0; i < files.length; i++) {
      try {
        var res = await readFile(files[i], function (m) { st.textContent = "（" + (i + 1) + "／" + files.length + "）" + m; });
        addDoc(files[i].name, res, files[i]);
        done++; renderEditor();
      } catch (e) { bad.push(files[i].name + "（" + (e && e.message || e) + "）"); }
    }
    st.textContent = done + "件を読みました。" + (bad.length ? "読めなかった資料：" + bad.join("、") : "下の項目を資料と見くらべてください。");
  });
  $("pasteBtn").addEventListener("click", function () {
    var t = $("src").value.trim(); if (!t) return;
    addDoc("貼りつけた文 " + new Date().toLocaleString("ja-JP"), { text: t }); $("src").value = ""; renderEditor();
  });
  $("dlist").addEventListener("change", function (e) {
    var id = e.target.getAttribute("data-type"); if (!id) return;
    var d = cur.docs.find(function (x) { return x.id === id; }); if (!d) return;
    var r = X.extract(T.applyKeep(d.text || "", cur.keep), e.target.value, d.name); d.type = e.target.value; d.fields = r.fields;
    saveSoon(); renderEditor();
  });
  $("dlist").addEventListener("click", function (e) {
    var rm = e.target.getAttribute("data-rm"), view = e.target.getAttribute("data-view");
    if (rm && confirm("この資料を物件から外しますか？（読み取った値も消えます）")) { cur.docs = cur.docs.filter(function (d) { return d.id !== rm; }); saveSoon(); renderEditor(); }
    if (view) { var d = cur.docs.find(function (x) { return x.id === view; }); if (d && d.blob) window.open(URL.createObjectURL(d.blob), "_blank", "noopener"); }
  });
  $("ftable").addEventListener("input", function (e) {
    var k = e.target.getAttribute("data-k"); if (!k) return;
    var v = e.target.value.trim(), m = X.merge(cur.docs)[k];
    if (v === "" && !(m && m.length)) delete cur.manual[k]; else cur.manual[k] = v;
    var s = e.target.parentNode.querySelector(".src"); if (s) s.textContent = "手で入れた値";
    saveSoon(); renderSend();
  });
  $("ftable").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    cur.manual[b.getAttribute("data-k")] = b.getAttribute("data-v");
    saveSoon(); renderEditor();
  });
  $("memo").addEventListener("input", function () { if (cur) { cur.memo = this.value; saveSoon(); } });
  $("delBtn").addEventListener("click", function () {
    if (!cur || !confirm("「" + titleOf(cur) + "」を消しますか？書き出していなければ元に戻せません。")) return;
    var id = cur.id;
    delP(id).then(function () { list = list.filter(function (p) { return p.id !== id; }); cur = null; $("editor").hidden = true; renderList(); });
  });
  // マイソクへは、文をいちど端末に置いてから開く
  $("toMaisoku").href = "../マイソク/index.html#from=bukken";
  $("toMaisoku").addEventListener("click", function () {
    if (!cur) return;
    try { localStorage.setItem(SEND_KEY, cur.docs.map(function (d) { return d.text || ""; }).join("\n")); } catch (e) {}
  });

  // ---------------------------------------------------------------- 書き出しと読みこみ（元のファイルは入れず、文と項目だけ）
  $("exportBtn").addEventListener("click", function () {
    var data = { kind: "fudosan-bukken", v: 1, at: new Date().toISOString(), items: list.map(function (p) {
      return Object.assign({}, p, { docs: p.docs.map(function (d) { var o = Object.assign({}, d); delete o.blob; delete o.preview; return o; }) });
    }) };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = "物件ノート_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    $("listStatus").textContent = list.length + "件を書き出しました。元のPDFや画像は入っていません。個人の情報を含むので、置き場所に気をつけてください。";
  });
  $("importFile").addEventListener("change", async function () {
    var f = this.files[0], st = $("listStatus"); this.value = "";
    if (!f) return;
    try {
      var data = JSON.parse(await f.text());
      if (data.kind !== "fudosan-bukken" || !Array.isArray(data.items)) throw new Error("物件ノートのファイルではありません");
      var n = 0;
      for (var i = 0; i < data.items.length; i++) {
        var p = data.items[i];
        if (!p || typeof p.id !== "string" || !Array.isArray(p.docs)) continue;
        p.manual = p.manual && typeof p.manual === "object" ? p.manual : {};
        fillIn(p);
        if (list.some(function (x) { return x.id === p.id; })) continue;   // すでにある物件は上書きしない
        await putP(p); list.push(p); n++;
      }
      st.textContent = n + "件を読みこみました（同じ物件はそのままにしました）。"; renderList();
    } catch (e) { st.textContent = "読みこめませんでした：" + (e && e.message || e); }
  });

  // ---------------------------------------------------------------- 始め
  if (!window.indexedDB) { $("listStatus").textContent = "このブラウザでは保存が使えません。"; }
  allP().then(function (rows) {
    list = (rows || []).map(fillIn); renderList();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }).catch(function (e) { $("listStatus").textContent = "保存した物件を読めませんでした：" + (e && e.message || e); renderList(); });
})();
