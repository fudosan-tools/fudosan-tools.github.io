/* Googleドライブの公開リンクから資料を取ってくる部品。
   問い合わせ先は Google の窓口だけ。鍵は使う人が自分で作ったもので、URLには入れない。
   画面のことはここに書かない（node で試験できるように）。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BukkenDrive = factory();
})(this, function () {
  "use strict";
  var API = "https://www.googleapis.com/drive/v3/files";
  var FOLDER = "application/vnd.google-apps.folder", SHORTCUT = "application/vnd.google-apps.shortcut", GOOGLE = "application/vnd.google-apps.";
  var EXPORTABLE = { "document": "ドキュメント", "spreadsheet": "スプレッドシート", "presentation": "スライド", "drawing": "図形描画" };
  var MAX_FILES = 50, MAX_DEPTH = 3, MAX_BYTES = 50 * 1024 * 1024, RETRIES = 2;
  var ID = "[\\w-]{10,}";

  function DriveError(message, status, reason) {
    var e = new Error(message); e.status = status || 0; e.reason = reason || ""; return e;
  }

  // 1本のリンクを読む。Googleドライブのリンクでなければ null。
  function parseLink(s) {
    var u;
    try { u = new URL(String(s).trim()); } catch (e) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (["drive.google.com", "docs.google.com", "drive.usercontent.google.com"].indexOf(u.hostname) < 0) return null;
    var path = u.pathname, q = u.searchParams, m, out = null;
    if ((m = path.match(new RegExp("/folders/(" + ID + ")")))) out = { kind: "folder", id: m[1] };
    else if ((m = path.match(new RegExp("/d/(" + ID + ")")))) out = { kind: "file", id: m[1] };
    else if (new RegExp("^" + ID + "$").test(q.get("id") || "")) out = { kind: /folderview/.test(path) ? "folder" : "file", id: q.get("id") };
    if (out && q.get("resourcekey")) out.resourceKey = q.get("resourcekey");
    return out;
  }

  // 貼られた文（メールの本文でもよい）からリンクを全部ひろう。同じものは1つにまとめる。
  function parseLinks(text) {
    var found = String(text || "").match(/https?:\/\/[^\s<>"'（）「」、。]+/g) || [], seen = {}, links = [], bad = 0;
    found.forEach(function (raw) {
      var p = parseLink(raw.replace(/[).,;:!?\]]+$/, ""));
      if (!p) { bad++; return; }
      if (!seen[p.id]) { seen[p.id] = 1; links.push(p); }
    });
    return { links: links, others: bad };
  }

  // Google の返事を、使う人がすることの分かる言葉にする
  function explain(status, reason) {
    var r = String(reason || ""), kind = r.replace(/^API.KEY./, "");
    if (status === 0) return "Googleにつながりませんでした。通信の状態を確かめてください";
    if (kind === "HTTP_REFERRER_BLOCKED") return "鍵の「使えるサイト」に、この道具のサイトが入っていません。鍵の設定を確かめてください";
    if (kind === "SERVICE_BLOCKED") return "鍵の「使えるAPI」に Google Drive API が入っていません。鍵の設定を確かめてください";
    if (kind === "INVALID" || r === "keyInvalid" || r === "badRequest") return "鍵の文字が正しくないようです。貼りまちがいがないか確かめてください（作りたての鍵は、数分かかることがあります）";
    if (r === "accessNotConfigured" || r === "SERVICE_DISABLED") return "Googleのプロジェクトで Google Drive API が有効になっていません";
    if (r === "downloadQuotaExceeded") return "このファイルは取り出せる回数の上限に達しています。時間をおくか、持ち主に聞いてください";
    if (r === "cannotDownloadAbusiveFile") return "Googleが危ないファイルの疑いありとしたため、取り出せません";
    if (r === "fileNotDownloadable" || r === "cannotExportFile" || r === "exportSizeLimitExceeded") return "この形のファイルは取り出せません（大きすぎるGoogleの書類など）。PDFにしてから入れてください";
    if (status === 404) return "見つかりません。「リンクを知っている全員」に公開されていないか、リンクがちがいます";
    if (status === 429 || /rateLimit|userRateLimit|RATE_LIMIT/i.test(r)) return "問い合わせが多すぎると断られました。少し待ってからやり直してください";
    if (status === 403) return "読むことを断られました。「リンクを知っている全員」に公開されているか、持ち主がダウンロードを止めていないか確かめてください";
    if (status >= 500) return "Google側が混み合っています。少し待ってからやり直してください";
    return "読めませんでした（" + status + "）";
  }

  function wait(ms, env) { return env && env.sleep ? env.sleep(ms) : new Promise(function (ok) { setTimeout(ok, ms); }); }

  async function ask(url, key, opts) {
    opts = opts || {};
    var fetcher = opts.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null), headers = { "X-Goog-Api-Key": key };
    if (opts.resourceKey && opts.id) headers["X-Goog-Drive-Resource-Keys"] = opts.id + "/" + opts.resourceKey;
    for (var n = 0; ; n++) {
      var r;
      try { r = await fetcher(url, { headers: headers, credentials: "omit" }); }
      catch (e) {
        if (n < RETRIES) { await wait(800 * (n + 1), opts); continue; }
        throw DriveError(explain(0), 0, "network");
      }
      if (r.ok) return r;
      var reason = "";
      try {
        var j = await r.json(), err = j.error || {}, info = (err.details || []).filter(function (d) { return d.reason; })[0];
        reason = info ? info.reason : ((err.errors || [])[0] || {}).reason || "";
      } catch (e2) {}
      var busy = r.status === 429 || r.status >= 500 || /^(rateLimitExceeded|userRateLimitExceeded)$/.test(reason);
      if (busy && n < RETRIES) { await wait(800 * (n + 1), opts); continue; }
      throw DriveError(explain(r.status, reason), r.status, reason);
    }
  }

  var FIELDS = "id,name,mimeType,size,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)";

  async function getMeta(id, key, opts, resourceKey) {
    var r = await ask(API + "/" + encodeURIComponent(id) + "?supportsAllDrives=true&fields=" + encodeURIComponent(FIELDS), key, Object.assign({}, opts, { id: id, resourceKey: resourceKey }));
    return r.json();
  }

  async function listChildren(id, key, opts, resourceKey) {
    var all = [], token = "", q = "'" + id + "' in parents and trashed = false";
    do {
      var url = API + "?pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=" + encodeURIComponent("nextPageToken,files(" + FIELDS + ")") +
        "&q=" + encodeURIComponent(q) + (token ? "&pageToken=" + encodeURIComponent(token) : "");
      var j = await (await ask(url, key, Object.assign({}, opts, { id: id, resourceKey: resourceKey }))).json();
      all = all.concat(j.files || []);
      token = j.nextPageToken || "";
    } while (token);
    return all;
  }

  // 近道（ショートカット）は、指している先に置きかえる
  function resolve(f) {
    if (f.mimeType === SHORTCUT && f.shortcutDetails && f.shortcutDetails.targetId) {
      return { id: f.shortcutDetails.targetId, name: f.name, mimeType: f.shortcutDetails.targetMimeType || "", resourceKey: f.shortcutDetails.targetResourceKey, shortcut: true };
    }
    return f;
  }

  // 物件ノートで読める形かどうかを分ける
  function classify(f) {
    var mt = String(f.mimeType || ""), name = String(f.name || "");
    if (mt.indexOf(GOOGLE) === 0) {   // 名前が「〜.pdf」でも、Googleの書類はPDFに変えて取る
      var sub = mt.slice(GOOGLE.length);
      if (EXPORTABLE[sub]) return { ok: true, type: "application/pdf", exportPdf: true };
      return { ok: false, why: "この形のGoogleのファイルは読めません" };
    }
    if (mt === "application/pdf" || /\.pdf$/i.test(name)) return { ok: true, type: "application/pdf" };
    if (/^image\//.test(mt)) return { ok: true, type: mt };
    if (/^text\/plain/.test(mt) || /\.txt$/i.test(name)) return { ok: true, type: "text/plain" };
    if (/spreadsheet|ms-excel|\.xlsx?$/i.test(mt + " " + name)) return { ok: false, why: "Excelは読めません。PDFにしてください" };
    if (/wordprocessing|msword|\.docx?$/i.test(mt + " " + name)) return { ok: false, why: "Wordは読めません。PDFにしてください" };
    return { ok: false, why: "読めない形です" };
  }

  // リンクたちから、読むファイルの一覧を作る。
  // 返すもの：files（読むもの）、skipped（読まないもの）、errors（開けなかったリンク）、cut（多すぎて外した数）
  async function collect(links, key, opts) {
    opts = opts || {};
    var files = [], skipped = [], errors = [], seen = {}, seenFolder = {}, max = opts.maxFiles || MAX_FILES, cut = 0;
    function add(raw, prefix) {
      var f = resolve(raw);
      if (seen[f.id]) return;
      seen[f.id] = 1;
      var c = classify(f), label = (prefix || "") + (f.name || "名前なし");
      if (!c.ok) { skipped.push({ name: label, why: c.why }); return; }
      if (f.size && Number(f.size) > MAX_BYTES) { skipped.push({ name: label, why: "大きすぎます（" + Math.round(Number(f.size) / 1048576) + "MB。50MBまで）" }); return; }
      if (files.length >= max) { cut++; return; }
      files.push({ id: f.id, name: f.name || "名前なし", path: label, mimeType: f.mimeType, resourceKey: f.resourceKey, type: c.type, exportPdf: !!c.exportPdf });
    }
    async function walk(id, resourceKey, prefix, depth) {
      if (seenFolder[id]) return;
      seenFolder[id] = 1;
      var kids = await listChildren(id, key, opts, resourceKey);
      kids.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), "ja", { numeric: true }); });
      for (var i = 0; i < kids.length; i++) {
        var k = resolve(kids[i]);
        if (k.mimeType === FOLDER) {
          if (depth >= MAX_DEPTH) { skipped.push({ name: prefix + k.name + "／", why: "フォルダの階が深すぎます（" + MAX_DEPTH + "階まで）" }); continue; }
          await walk(k.id, k.resourceKey, prefix + k.name + "／", depth + 1);
        } else add(k, prefix);
      }
    }
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      try {
        // フォルダも先に情報を聞く。非公開のフォルダは一覧だと「0件」としか返らず、見分けられないため。
        var meta = await getMeta(L.id, key, opts, L.resourceKey), t = resolve(meta);
        if (t.mimeType === FOLDER) await walk(t.id, t.resourceKey || L.resourceKey, "", 1);
        else add(meta.resourceKey ? meta : Object.assign({}, meta, { resourceKey: L.resourceKey }));
      } catch (e) { errors.push({ link: L, message: e.message, status: e.status, reason: e.reason }); }
    }
    return { files: files, skipped: skipped, errors: errors, cut: cut };
  }

  // 1つのファイルの中身を取ってくる。File を返す。
  async function download(f, key, opts) {
    var url = API + "/" + encodeURIComponent(f.id) + (f.exportPdf ? "/export?mimeType=application%2Fpdf" : "?alt=media&supportsAllDrives=true");
    var r = await ask(url, key, Object.assign({}, opts, { id: f.id, resourceKey: f.resourceKey }));
    var blob = await r.blob();
    if (blob.size > MAX_BYTES) throw DriveError("大きすぎます（50MBまで）");
    var name = f.exportPdf && !/\.pdf$/i.test(f.name) ? f.name + ".pdf" : f.name;
    return new File([blob], name, { type: f.type });
  }

  return { parseLink: parseLink, parseLinks: parseLinks, explain: explain, classify: classify, collect: collect, download: download, MAX_FILES: MAX_FILES };
});
