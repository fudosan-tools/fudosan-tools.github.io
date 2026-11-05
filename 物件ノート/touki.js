/* 物件ノート：謄本（登記事項証明書）を筆ごとに読む部分と、本地・私道の判定、人に確かめる質問づくり。
   下線で消された部分は、読み取りのときに ST〜EN の印で囲んである（印の中は古い情報として今の値に使わない）。 */
(function (root) {
  "use strict";
  var ST = "", EN = "";
  var STRUCK_RE = new RegExp(ST + "([\\s\\S]*?)" + EN, "g");
  var CHIMOKU = "宅地|公衆用道路|田|畑|雑種地|山林|原野|池沼|墓地|境内地|鉱泉地|塩田|牧場|運河用地|水道用地|用悪水路|ため池|堤|井溝|保安林|学校用地|鉄道用地";

  function joinMarks(t) { return String(t).split(EN + ST).join(""); }
  function plain(t) { return String(t).split(ST).join("").split(EN).join(""); }
  // 1行の中の下線の部分をつないだ文（これが「古い情報の行」の単位）
  function lineStruck(ln) {
    var out = [], m; STRUCK_RE.lastIndex = 0;
    while ((m = STRUCK_RE.exec(ln))) { var c = m[1].replace(/\s+/g, " ").trim(); if (c) out.push(c); }
    return out.join(" ");
  }
  // 「下線ではない」と人が直した行は、ふつうの文にもどす
  function applyKeep(t, keep) {
    if (!keep || !keep.length) return t;
    var keys = keep.map(keepKey);
    return joinMarks(t).split("\n").map(function (ln) { var k = lineStruck(ln); return k && keys.indexOf(keepKey(k)) >= 0 ? plain(ln) : ln; }).join("\n");
  }
  // 質問に出す行は全角を半角にそろえたあとの文、資料の文は全角のままなので、そろえてから比べる
  function keepKey(s) { return String(s).normalize("NFKC").replace(/[‐‑‒–−]/g, "-").replace(/\s+/g, ""); }
  function active(t) { return joinMarks(t).replace(STRUCK_RE, " "); }
  function struckList(t) {
    var out = [];
    joinMarks(t).split("\n").forEach(function (ln) { var k = lineStruck(ln); if (k && out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  // 地番を比べるための形：「123番456」「123-456」「123の456」→「123-456」
  function chibanKey(s) {
    var m = String(s == null ? "" : s).normalize("NFKC").replace(/\s/g, "").match(/(\d+)(?:番地?|[-ーの−])?(\d+)?(?:[-ーの−](\d+))?/);
    return m ? m[1] + (m[2] ? "-" + m[2] : "") + (m[3] ? "-" + m[3] : "") : "";
  }
  function areaOf(s) {
    var m = String(s).match(/(\d[\d,]*)\s*[:：.]\s*(\d{0,2})/) || String(s).match(/(\d[\d,]*)/);
    return m ? parseFloat(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : "")) : null;
  }
  // 地積の小数は2けた。画像から読むと、この書体の5が「35」「3S」「S」になりやすいので直し、直したら guess の印をつける
  function readArea(s) {
    var m = String(s).match(/(\d[\d,]*)\s*[:：.・･]\s*([0-9A-Za-z]{0,4})(?![0-9A-Za-z])/);
    if (!m) { var n = String(s).match(/(\d[\d,]*)/); return n ? { v: parseFloat(n[1].replace(/,/g, "")), guess: false } : { v: null, unread: true }; }
    var d = m[2].replace(/3[5Ss]/g, "5").replace(/[Ss]/g, "5").replace(/[Oo]/g, "0").replace(/[lI]/g, "1");
    if (!/^\d{0,2}$/.test(d)) return { v: null, unread: true };
    return { v: parseFloat(m[1].replace(/,/g, "") + (d ? "." + d : "")), guess: d !== m[2] };
  }
  function flat(s) { return String(s).replace(/[│|┃]/g, " ").replace(/\s+/g, " ").trim(); }
  // 欄の右にある「余白」から後ろは値ではない
  function cutNote(s) { return String(s).replace(/\s*[\[［]?\s*余\s*\S?.*$/, "").replace(/\s*[\[［].*$/, "").trim(); }
  // 謄本の下の注意書きは、登記の中身ではないので読まない（「所有者」の言葉が入っている）
  function stripNotes(t) {
    return String(t).split("\n").filter(function (ln) {
      return !/相続人申告|登記の目的.{0,3}欄|登記官が職権|権利関係を公示|下線のあるもの|これは登記記録に/.test(ln.replace(/\s/g, ""));
    }).join("\n");
  }

  // 画像の表の罫線と黒塗りを白くして、文字だけを残す（px は getImageData の data）。戻り値：表があるか、黒塗りの数
  function cleanPage(px, W, H) {
    var n = W * H, dark = new Uint8Array(n), wipe = new Uint8Array(n), count = 0, i, x, y, s;
    for (i = 0; i < n; i++) { var j = i * 4; if (px[j] * 0.3 + px[j + 1] * 0.59 + px[j + 2] * 0.11 < 140) { dark[i] = 1; count++; } }
    if (count > n * 0.35) return { table: false, red: 0 };   // 暗い写真は線と文字を分けられないので、そのまま読む
    var L = Math.max(40, Math.round(W * 0.045)), VL = Math.max(40, Math.round(H * 0.028)), TH = Math.max(4, Math.round(H * 0.0035)), long = 0, red = 0;
    for (y = 0; y < H; y++) {
      x = 0;
      while (x < W) {
        if (!dark[y * W + x]) { x++; continue; }
        s = x; while (x < W && dark[y * W + x]) x++;
        if (x - s < L) continue;
        var mid = (s + x) >> 1, t = y, b = y;
        while (t > 0 && dark[(t - 1) * W + mid]) t--;
        while (b < H - 1 && dark[(b + 1) * W + mid]) b++;
        if (b - t + 1 > TH * 2) { if (y === t) red++; } else if (y === t) long++;
        for (i = s; i < x; i++) wipe[y * W + i] = 1;
      }
    }
    for (x = 0; x < W; x++) {
      y = 0;
      while (y < H) {
        if (!dark[y * W + x]) { y++; continue; }
        s = y; while (y < H && dark[y * W + x]) y++;
        if (y - s >= VL) for (i = s; i < y; i++) wipe[i * W + x] = 1;
      }
    }
    for (i = 0; i < n; i++) if (wipe[i]) { var k = i * 4; px[k] = px[k + 1] = px[k + 2] = 255; }
    return { table: long >= 3, red: red };
  }

  // 甲区の所有者：いちばん新しい状態を、登記の順にたどって出す
  function nameFrom(s) {
    s = flat(s).replace(/(順位\d+番|権利部|共同担保|これは登記|付記|[0-9]+番(?:抵当|根抵当)).*$/, "").trim();
    var m = s.match(/^(.*(?:番地\d*|号|番\d*|丁目\d*))\s*([^\d\s].*)$/);
    return m ? { addr: m[1].trim(), name: m[2].trim() } : { addr: "", name: s };
  }
  function ownersOf(sec) {
    var EV = /(所有権保存|所有権移転|[^\s│|]{0,24}持分全部移転|[^\s│|]{0,24}持分一部移転)/g, evs = [], m;
    while ((m = EV.exec(sec))) evs.push({ i: m.index, w: m[1] });
    if (!evs.length) evs = [{ i: 0, w: "" }];
    var owners = [];
    evs.forEach(function (ev, k) {
      var slice = sec.slice(ev.i, k + 1 < evs.length ? evs[k + 1].i : undefined);
      var people = [], shareRe = /持分\s*(\d[\d,]*)\s*分の\s*(\d[\d,]*)\s*([^\s│|]+)/g, sm, hit = false;
      var pos = slice.search(/(?:共有者|所有者|権利者)(?!その他|\s*[)）])/);
      var body = pos >= 0 ? flat(slice.slice(pos)).replace(/^(共有者|所有者|権利者)\s*/, "") : /持分\s*\d/.test(slice) ? flat(slice) : "";
      var last = 0;
      while ((sm = shareRe.exec(body))) {
        hit = true;
        people.push({ addr: flat(body.slice(last, sm.index)), name: sm[3], den: +sm[1].replace(/,/g, ""), num: +sm[2].replace(/,/g, "") });
        last = shareRe.lastIndex;
      }
      if (!hit && body) { var p = nameFrom(body); if (p.name && p.name.length <= 40) people.push({ addr: p.addr, name: p.name, den: 1, num: 1 }); }
      if (/持分全部移転/.test(ev.w)) {
        var from = ev.w.replace(/共有者全員/, "").replace(/持分全部移転/, "");
        var gone = owners.filter(function (o) { return from && from.indexOf(o.name) >= 0; });
        if (gone.length && people.length === 1 && people[0].den === 1) { people[0].den = gone[0].den; people[0].num = gone[0].num; }
        owners = from && !/全員/.test(ev.w) ? owners.filter(function (o) { return from.indexOf(o.name) < 0; }).concat(people) : people;
      } else if (/持分一部移転/.test(ev.w)) owners = owners.concat(people);
      else if (people.length) owners = people;
    });
    return owners;
  }
  function shareSum(owners) {
    var v = owners.reduce(function (t, o) { return t + (o.den ? o.num / o.den : 0); }, 0);
    return Math.round(v * 1e6) / 1e6;
  }

  // 1枚の謄本の文 → 筆・建物の記録の配列
  function parseRecords(text) {
    var marked = stripNotes(joinMarks(text)), idx = [], m, re = /表\s*題\s*部/g;
    while ((m = re.exec(marked))) idx.push(m.index);
    // マンションは1通に表題部がいくつもあるので、権利部が出たあとの表題部だけを次の謄本の始まりとする
    idx = idx.filter(function (s, i) { return i === 0 || /権\s*利\s*部|[（(]\s*甲\s*区/.test(marked.slice(idx[i - 1], s)); });
    var parts = idx.length ? idx.map(function (s, i) { return marked.slice(i === 0 ? 0 : s, i + 1 < idx.length ? idx[i + 1] : undefined); }) : [marked];
    return parts.map(function (raw) {
      var t = active(raw), r = { kind: /家\s*屋\s*番\s*号|建物の表示/.test(t) ? "bldg" : "land", struck: struckList(raw), owners: [], liens: [] }, v;
      var firstRights = t.search(/権\s*利\s*部/), head = firstRights >= 0 ? t.slice(0, firstRights) : t;
      v = head.match(/所\s*_*\s*在(?!\s*図)[\s│|_]*([^\n│|]+)/) || head.match(/^[\s│|]*所[\s│|_]+([^\n│|]*[市区町村郡][^\n│|]*)/m); if (v) r.shozai = cutNote(flat(v[1]));
      if (r.kind === "land") {
        // 表の形：「40番10 │宅地│150：23」の行のうち、いちばん下（新しい）を使う。画像から読むと区切りが消えることがある
        var num = "\\d+\\s*番\\s*\\d*(?:の\\d+)?", rowRe = new RegExp("(" + num + ")[\\s│|]*(" + CHIMOKU + ")[^\\n]{0,6}?(\\d[\\d,]*\\s*[:：.・･]\\s*[0-9A-Za-z]{0,4})", "g"), row, lastRow = null;
        while ((row = rowRe.exec(head))) lastRow = row;
        if (!lastRow) { rowRe = new RegExp("(" + num + ")[\\s│|]+(" + CHIMOKU + ")[\\s│|]*(\\d[\\d,]*)", "g"); while ((row = rowRe.exec(head))) lastRow = row; }
        // 地番の行が丸ごと下線でも、筆を落とさない（下線は読みまちがいのこともある）
        if (!lastRow && /余/.test(head)) {
          var allHead = plain(raw), rp = allHead.search(/権\s*利\s*部/); if (rp >= 0) allHead = allHead.slice(0, rp);
          rowRe = new RegExp("(" + num + ")[\\s│|]*(" + CHIMOKU + ")[^\\n]{0,6}?(\\d[\\d,]*\\s*[:：.・･]\\s*[0-9A-Za-z]{0,4})", "g");
          while ((row = rowRe.exec(allHead))) lastRow = row;
          if (lastRow) head = allHead;
        }
        var setArea = function (s) { var a = readArea(s); r.area = a.v == null ? undefined : a.v; if (a.guess) r.areaGuess = true; if (a.unread) r.areaUnread = true; };
        if (lastRow) {
          r.chiban = lastRow[1].replace(/\s/g, ""); r.chimoku = lastRow[2]; setArea(lastRow[3]);
          // 地積や地目を直した行は、地番の欄が「余白」になる。下の行ほど新しい
          var later = head.slice(lastRow.index + lastRow[0].length), fix = new RegExp("余\\S?[\\s│|\\[\\]]*(余\\S?|" + CHIMOKU + ")[\\s│|\\[\\]]*(?:余\\S?[\\s│|\\[\\]]*)?(\\d[\\d,]*\\s*[:：.・･]\\s*[0-9A-Za-z]{0,4})", "g"), fm, lastFix = null;
          while ((fm = fix.exec(later))) lastFix = fm;
          if (lastFix) { r.areaOld = r.area; r.areaGuess = false; setArea(lastFix[2]); if (lastFix[1].charAt(0) !== "余") r.chimoku = lastFix[1]; }
        }
        else {
          v = head.match(/地\s*番[^\d\n]*(\d+\s*番\s*\d*(?:の\d+)?|\d[^\n│|]*)/); if (v) r.chiban = flat(v[1]).replace(/\s/g, "").slice(0, 24);
          v = head.match(new RegExp("地\\s*目[\\s│|_]*(" + CHIMOKU + ")")); if (v) r.chimoku = v[1];
          v = head.match(/地\s*積[\s\S]{0,30}?(\d[\d,]*\s*[:：.・･]\s*[0-9A-Za-z]{0,4})/); if (v) setArea(v[1]);
        }
      } else {
        v = head.match(/家.?\s*番\s*号[\s│|]*([^\n│|]+)/) || head.match(/^\D*(\d+\s*番\s*\d+\s*の\s*\d+)/m); if (v) r.kaoku = cutNote(flat(v[1])).replace(/\s/g, "").replace(/[^\d番]+$/, "").slice(0, 24);
        var KIND = "居宅|店舗|事務所|共同住宅|寄宿舎|倉庫|車庫|工場|旅館|ホテル|病院|診療所|作業場|物置|農家住宅|保育所|集会所|駐車場";
        v = head.match(new RegExp("(?:^|[\\s│|])((?:" + KIND + ")(?:[・、](?:" + KIND + "))*)", "m")) || head.match(/種\s*類[\s│|]*([^\n│|\s②]+)/); if (v) r.shurui = v[1];
        v = head.match(/([木鉄軽土石煉レれ][^\n│|]{0,30}?造[^\n│|]{0,30}?(?:平家建|平屋建|階建))/) || head.match(/構\s*造[\s│|]*([^\n│|]*(?:造|ぶき|葺|建)[^\n│|]*)/); if (v) r.structure = flat(v[1]).replace(/茸/g, "葺").slice(0, 40);
        var floors = head.match(/(?:\d+階(?:部分)?|地下\d+階)[\s│|]*\d[\d,]*\s*[:：.・･]\s*[0-9A-Za-z]{0,4}/g);
        if (!floors) { v = head.match(/(?:平家建|平屋建|階建|床\s*面\s*積)[\s│|㎡mM]*(\d[\d,]*\s*[:：.・･]\s*[0-9A-Za-z]{0,4})/); if (v) floors = [v[1]]; }
        if (floors) {
          var sum = 0, bad = false;
          floors.forEach(function (x) { var a = readArea(x.replace(/^(?:地下)?\d+階(?:部分)?/, "")); if (a.v == null) bad = true; else sum += a.v; if (a.guess) r.floorGuess = true; });
          if (bad) r.floorUnread = true; else r.floorArea = Math.round(sum * 100) / 100;
        } else r.floorUnread = true;
        v = head.match(/((?:昭和|平成|令和)\s*(?:元|\d+)\s*年\s*\d+\s*月\s*\d*\s*日?)\s*新/); if (v) r.newBuilt = v[1];
        v = head.match(/敷地権の割合[\s│|]*(\d[\d,]*)\s*分の\s*(\d[\d,]*)/); if (v) r.shikichiken = { den: +v[1].replace(/,/g, ""), num: +v[2].replace(/,/g, "") };
      }
      // 「権」を読みまちがえても、かっこの中の「甲区」で見つける
      var KO = /権\s*利\s*部\s*[（(]?\s*甲\s*区|[（(]\s*甲\s*区/, OTSU = /権\s*利\s*部\s*[（(]?\s*乙\s*区|[（(]\s*乙\s*区|所有権以外の権利/, ko = t.search(KO), otsu = t.search(OTSU);
      if (ko >= 0) {
        r.owners = ownersOf(t.slice(ko, otsu > ko ? otsu : undefined));
        if (!r.owners.length) r.ownerUnread = true;
        var all = plain(raw), kk = all.search(KO), oo = all.search(OTSU), hr = /(所有権保存|所有権移転|持分全部移転|持分一部移転)[\s│|]*((?:昭和|平成|令和)\s*(?:元|\d+)\s*年)/g, hm;
        r.history = []; var hs = all.slice(kk, oo > kk ? oo : undefined);
        while ((hm = hr.exec(hs))) r.history.push(hm[1] + " " + hm[2].replace(/\s/g, ""));
      }
      var rest = t.slice(ko >= 0 ? ko : 0), gone = rest.match(/\d+番(?:根?抵当権|差押|仮登記)[^\s│|]{0,6}抹消/g) || [];
      if (gone.length) r.lienCleared = gone;
      // 「1番抵当権抹消」があれば、順位1番の抵当権は残っていない（下線を読み落としても）。順位の数字がくっついて「21番」と読めることもある
      var goneNo = gone.map(function (g) { return g.match(/^\d+/)[0]; }), lr = /(\d*)\s*[│|]?\s*(根抵当権設定|抵当権設定|差押|仮差押|仮登記|賃借権設定|地上権設定|地役権設定)/g, lm, left = {};
      while ((lm = lr.exec(rest))) {
        var no = lm[1];
        if (!(no && goneNo.some(function (g) { return g === no || (g.length === no.length + 1 && g.slice(1) === no); }))) left[lm[2]] = 1;
      }
      r.liens = Object.keys(left);
      r.key = r.kind === "land" ? chibanKey(r.chiban) : "b:" + chibanKey(r.kaoku);
      return r;
    }).filter(function (r) { return r.chiban || r.kaoku || r.owners.length; });
  }

  function fmtShare(o) { return o.den === 1 && o.num === 1 ? "単独" : o.den + "分の" + o.num; }
  function ownersText(owners) { return owners.map(function (o) { return o.name + "（" + fmtShare(o) + "）"; }).join("、"); }

  // 同じ筆を別の資料でも読んだとき：読めていない値を埋める。読みまちがいを直した値より、そのまま読めた値を先にする。ちがう値は記録する
  function mergeRead(cur, r) {
    ["chiban", "kaoku", "shozai", "chimoku", "shurui", "structure", "newBuilt"].forEach(function (k) { if (!cur[k] && r[k]) cur[k] = r[k]; });
    [["area", "areaGuess", "areaUnread"], ["floorArea", "floorGuess", "floorUnread"]].forEach(function (x) {
      var k = x[0], g = x[1], u = x[2];
      if (r[k] == null) return;
      if (cur[k] == null) { cur[k] = r[k]; cur[g] = r[g]; cur[u] = false; return; }
      if (cur[k] === r[k]) { if (!r[g]) cur[g] = false; return; }
      (cur.readAlt = cur.readAlt || []).push(r[k]);
      if (cur[g] && !r[g]) { cur[k] = r[k]; cur[g] = false; }
    });
    if (!(cur.owners || []).length && (r.owners || []).length) { cur.owners = r.owners; cur.ownerUnread = false; }
    if (!(cur.liens || []).length && (r.liens || []).length) cur.liens = r.liens;
    if (!(cur.history || []).length && r.history) cur.history = r.history;
  }

  // 同じページを大きさを変えて何回か読んだ結果で多数決する。同じ数なら、読みまちがいやすい字（5→3 や S）を直した値を先にする。割れたら印を残す
  function reread(first, others) {
    (first || []).forEach(function (a) {
      // 地番を読みまちがえて合わないときは、1通に1筆なら同じ筆として比べる
      var same = (others || []).map(function (list) { list = list || []; return list.filter(function (x) { return x.key === a.key; })[0] || (first.length === 1 && list.length === 1 && list[0].kind === a.kind ? list[0] : null); }).filter(Boolean);
      ["chiban", "kaoku", "shozai", "chimoku", "shurui", "structure", "newBuilt"].forEach(function (k) { same.forEach(function (b) { if (!a[k] && b[k]) a[k] = b[k]; }); });
      same.forEach(function (b) { if ((b.history || []).length > (a.history || []).length) a.history = b.history; });
      [["area", "areaGuess", "areaUnread"], ["floorArea", "floorGuess", "floorUnread"]].forEach(function (x) {
        var k = x[0], g = x[1], u = x[2], reads = [a].concat(same).filter(function (r) { return r[k] != null; }), best = null, alts = [];
        if (!reads.length) return;
        reads.forEach(function (r) {
          var n = reads.filter(function (o) { return o[k] === r[k]; }).length, fixed = reads.some(function (o) { return o[k] === r[k] && o[g]; }) ? 1 : 0;
          if (!best || n > best.n || (n === best.n && fixed > best.fixed)) best = { v: r[k], n: n, fixed: fixed };
        });
        reads.forEach(function (r) { if (r[k] !== best.v && alts.indexOf(r[k]) < 0) alts.push(r[k]); });
        a[k] = best.v; a[u] = false;
        a[g] = alts.length > 0 || reads.filter(function (r) { return r[k] === best.v; }).every(function (r) { return r[g]; });
        if (alts.length) a.readAlt = (a.readAlt || []).concat(alts);
      });
    });
    return first;
  }

  // docs：{ type, name, text, fields:{ parcels, labels } }。edits：{ key: { role, share:{den,num}, chiban, area, comment } }
  // 戻り値：筆の配列（判定と理由つき）
  function judgeParcels(docs, edits, manual) {
    edits = edits || {};
    var map = {}, order = [];
    docs.forEach(function (d) {
      ((d.fields && d.fields.parcels) || []).forEach(function (r) {
        if (!r.key) return;
        if (!map[r.key]) { map[r.key] = Object.assign({ docs: [] }, r); order.push(r.key); }
        else mergeRead(map[r.key], r);
        map[r.key].docs.push(d.name);
      });
    });
    (manual || []).forEach(function (r) {
      var key = chibanKey(r.chiban); if (!key) return;
      if (!map[key]) { order.push(key); map[key] = { kind: "land", key: key, owners: [], liens: [], struck: [], docs: [], manual: true }; }
      Object.assign(map[key], { chiban: r.chiban, area: r.area != null ? r.area : map[key].area, chimoku: r.chimoku || map[key].chimoku });
    });
    var lands = order.map(function (k) { return map[k]; }).filter(function (r) { return r.kind === "land"; });
    var maxArea = lands.reduce(function (a, r) { return Math.max(a, r.area || 0); }, 0);
    var others = docs.filter(function (d) { return d.type !== "touki"; });
    return order.map(function (k) {
      var r = map[k], out = Object.assign({}, r), reasons = [], score = 0;
      if (r.kind === "bldg") { out.role = "建物"; out.conf = "高"; out.reasons = ["家屋番号がある謄本です"]; }
      else {
        var s = shareSum(r.owners), keyDigits = r.key.split("-");
        if (r.chimoku === "公衆用道路") { score += 3; reasons.push("地目が公衆用道路です"); }
        if (r.owners.length && s === 1 && r.owners.length > 1 && maxArea && (r.area || 0) < maxArea * 0.5) { score += 1; reasons.push("共有で、いちばん広い筆より小さい筆です"); }
        if (maxArea && r.area === maxArea && lands.length > 1 && r.chimoku !== "公衆用道路") { score -= 2; reasons.push("いちばん広い筆です"); }
        others.forEach(function (d) {
          plain(d.text || "").normalize("NFKC").split("\n").forEach(function (ln) {
            var lk = ln.replace(/\s/g, "").replace(/(\d)(?:番地?|の|ー|−)(?=\d)/g, "$1-");
            if (r.key.indexOf("-") < 0 || !new RegExp("(^|[^\\d-])" + r.key + "($|[^\\d-])").test(lk)) return;
            if (/私道|位置指定道路|持分.*道路|道路.*持分/.test(ln)) { score += 3; reasons.push(d.name + " に、この地番と私道の記載があります"); }
            else if (/本地|敷地/.test(ln)) { score -= 2; reasons.push(d.name + " に、この地番と敷地の記載があります"); }
          });
          if (d.fields && d.fields.shido != null && r.area != null && String(d.fields.shido).indexOf(String(r.area)) >= 0) { score += 2; reasons.push(d.name + " の私道負担の面積と同じです"); }
        });
        // 公図・測量図：地番がのっているか、面積が合うか
        out.onMap = null;
        docs.filter(function (d) { return d.type === "kouzu" || d.type === "sokuryo"; }).forEach(function (d) {
          var L = (d.fields && d.fields.labels) || [];
          var found = L.indexOf(r.key) >= 0 || (keyDigits[1] && L.indexOf(keyDigits[1]) >= 0);
          if (L.length) { reasons.push(d.name + (found ? " にこの地番があります" : " でこの地番を読み取れませんでした")); if (found) out.onMap = true; else if (out.onMap == null) out.onMap = false; }
          if (d.type === "sokuryo" && r.area != null && plain(d.text || "").normalize("NFKC").indexOf(String(r.area)) >= 0) reasons.push(d.name + " の面積と謄本の地積が同じです");
        });
        out.role = score >= 2 ? "私道" : "本地";
        out.conf = Math.abs(score) >= 3 ? "高" : "低";
        if (!reasons.length) reasons.push("決め手が見つからないので、本地としました");
        out.reasons = reasons;
      }
      var e = edits[k] || {};
      if (e.role) { out.role = e.role; out.byHuman = true; }
      if (e.area != null) out.area = e.area;
      if (e.chiban) out.chiban = e.chiban;
      if (e.share) out.humanShare = e.share;
      return out;
    });
  }

  // 本地と私道の合計。私道の持分は、本地の所有者が持っている分を足す（本地の所有者が分からなければ全体）
  function ownerShare(p, names) {
    if (p.humanShare) return p.humanShare.num / p.humanShare.den;
    var own = (p.owners || []).filter(function (o) { return !names.length || names.indexOf(o.name) >= 0; });
    if (!own.length) return names.length && (p.owners || []).length ? 0 : 1;
    return own.reduce(function (t, o) { return t + o.num / o.den; }, 0);
  }
  function summary(parcels) {
    var hon = 0, shi = 0, shiShare = 0, hasBldg = false, names = [], floor = 0, floorAll = true;
    parcels.forEach(function (p) { if (p.role === "本地") (p.owners || []).forEach(function (o) { if (names.indexOf(o.name) < 0) names.push(o.name); }); });
    parcels.forEach(function (p) {
      if (p.role === "建物") { hasBldg = true; if (p.floorArea == null) floorAll = false; else floor += p.floorArea; return; }
      var a = p.area || 0;
      if (p.role === "本地") hon += a;
      else if (p.role === "私道") { shi += a; shiShare += a * ownerShare(p, names); }
    });
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    return { hon: r2(hon), shi: r2(shi), shiShare: r2(shiShare), hasBldg: hasBldg, names: names, floor: hasBldg && floorAll ? r2(floor) : null };
  }

  // コメントから読み取る：役割・持分・地番・面積。読めないものはメモのまま
  function parseComment(c) {
    var t = String(c || "").normalize("NFKC"), r = {};
    if (/対象外|関係(ない|なし)|含まない|別物件/.test(t)) r.role = "対象外";
    else if (/私道|道路/.test(t)) r.role = "私道";
    else if (/本地|敷地|宅地/.test(t)) r.role = "本地";
    var m = t.match(/(\d+)\s*分の\s*(\d+)/); if (m) r.share = { den: +m[1], num: +m[2] };
    else if ((m = t.match(/(\d+)\s*\/\s*(\d+)/))) r.share = { den: +m[2], num: +m[1] };
    m = t.match(/地番\s*(?:は|を)?\s*(\d+\s*(?:番地?|-|の)\s*\d*)/); if (m) r.chiban = m[1].replace(/\s/g, "");
    m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:㎡|平米|m2)/); if (m) r.area = parseFloat(m[1].replace(/,/g, ""));
    return r;
  }

  // 公図・測量図の文から地番らしい数字を拾う
  function mapLabels(text) {
    var t = plain(text).normalize("NFKC"), out = {}, m, re = /(\d{1,5})\s*(?:番地?|[-−ーの])\s*(\d{1,5})|(?:^|[^\d.,:])(\d{1,5})(?![\d.,:㎡mM年月日])/g;
    while ((m = re.exec(t))) { if (m[1]) out[m[1] + "-" + m[2]] = 1; else if (m[3]) out[m[3]] = 1; }
    return Object.keys(out);
  }

  var API = { cleanPage: cleanPage, readArea: readArea, reread: reread, ST: ST, EN: EN, plain: plain, active: active, applyKeep: applyKeep, struckList: struckList, chibanKey: chibanKey, parseRecords: parseRecords, shareSum: shareSum, ownersText: ownersText, fmtShare: fmtShare, judgeParcels: judgeParcels, summary: summary, parseComment: parseComment, mapLabels: mapLabels };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.BukkenTouki = API;
})(typeof window !== "undefined" ? window : globalThis);
