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
    return joinMarks(t).split("\n").map(function (ln) { var k = lineStruck(ln); return k && keep.indexOf(k) >= 0 ? plain(ln) : ln; }).join("\n");
  }
  function active(t) { return joinMarks(t).replace(STRUCK_RE, " "); }
  function struckList(t) {
    var out = [];
    joinMarks(t).split("\n").forEach(function (ln) { var k = lineStruck(ln); if (k && out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  // 地番を比べるための形：「123番456」「123-456」「123の456」→「123-456」
  function chibanKey(s) {
    var m = String(s == null ? "" : s).normalize("NFKC").replace(/\s/g, "").match(/(\d+)(?:番地?|[-ーの−])?(\d+)?/);
    return m ? m[1] + (m[2] ? "-" + m[2] : "") : "";
  }
  function areaOf(s) {
    var m = String(s).match(/(\d[\d,]*)\s*[:：.]\s*(\d{0,2})/) || String(s).match(/(\d[\d,]*)/);
    return m ? parseFloat(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : "")) : null;
  }
  function flat(s) { return String(s).replace(/[│|┃]/g, " ").replace(/\s+/g, " ").trim(); }

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
      var pos = slice.search(/共有者|所有者|権利者/);
      var body = pos >= 0 ? flat(slice.slice(pos)).replace(/^(共有者|所有者|権利者)\s*/, "") : "";
      var last = 0;
      while ((sm = shareRe.exec(body))) {
        hit = true;
        people.push({ addr: flat(body.slice(last, sm.index)), name: sm[3], den: +sm[1].replace(/,/g, ""), num: +sm[2].replace(/,/g, "") });
        last = shareRe.lastIndex;
      }
      if (!hit && body) { var p = nameFrom(body); if (p.name) people.push({ addr: p.addr, name: p.name, den: 1, num: 1 }); }
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
    var marked = joinMarks(text), idx = [], m, re = /表\s*題\s*部/g;
    while ((m = re.exec(marked))) idx.push(m.index);
    var parts = idx.length ? idx.map(function (s, i) { return marked.slice(i === 0 ? 0 : s, i + 1 < idx.length ? idx[i + 1] : undefined); }) : [marked];
    return parts.map(function (raw) {
      var t = active(raw), r = { kind: /家\s*屋\s*番\s*号|建物の表示/.test(t) ? "bldg" : "land", struck: struckList(raw), owners: [], liens: [] }, v;
      var firstRights = t.search(/権\s*利\s*部/), head = firstRights >= 0 ? t.slice(0, firstRights) : t;
      v = head.match(/所\s*在[\s│|]*([^\n│|]+)/); if (v) r.shozai = flat(v[1]);
      if (r.kind === "land") {
        // 表の形：「40番10 │宅地│150：23」の行のうち、いちばん下（新しい）を使う
        var rowRe = new RegExp("(\\d+番\\d*(?:の\\d+)?)[\\s│|]+(" + CHIMOKU + ")[\\s│|]*(\\d[\\d,]*\\s*[:：.]\\s*\\d{0,2}|\\d[\\d,]*)", "g"), row, lastRow = null;
        while ((row = rowRe.exec(head))) lastRow = row;
        if (lastRow) { r.chiban = lastRow[1]; r.chimoku = lastRow[2]; r.area = areaOf(lastRow[3]); }
        else {
          v = head.match(/地\s*番[^\d\n]*(\d+\s*番\s*\d*(?:の\d+)?|\d[^\n│|]*)/); if (v) r.chiban = flat(v[1]).replace(/\s/g, "").slice(0, 24);
          v = head.match(new RegExp("地\\s*目[\\s│|_]*(" + CHIMOKU + ")")); if (v) r.chimoku = v[1];
          v = head.match(/地\s*積[\s\S]{0,30}?(\d[\d,]*\s*[:：.]\s*\d{0,2})/); if (v) r.area = areaOf(v[1]);
        }
      } else {
        v = head.match(/家\s*屋\s*番\s*号[\s│|]*([^\n│|]+)/); if (v) r.kaoku = flat(v[1]).slice(0, 24);
        v = head.match(/種\s*類[\s│|]*([^\n│|\s]+)/); if (v) r.shurui = v[1];
        v = head.match(/構\s*造[\s│|]*([^\n│|]*(?:造|ぶき|葺|建)[^\n│|]*)/); if (v) r.structure = flat(v[1]).slice(0, 40);
        var floors = head.match(/(?:\d+階(?:部分)?|地下\d+階)[\s│|]*\d[\d,]*\s*[:：.]\s*\d{0,2}/g);
        if (floors) r.floorArea = Math.round(floors.reduce(function (s, x) { return s + (areaOf(x.replace(/^(?:地下)?\d+階(?:部分)?/, "")) || 0); }, 0) * 100) / 100;
        v = head.match(/((?:昭和|平成|令和)\s*(?:元|\d+)\s*年\s*\d+\s*月\s*\d*\s*日?)\s*新\s*築/); if (v) r.newBuilt = v[1];
        v = head.match(/敷地権の割合[\s│|]*(\d[\d,]*)\s*分の\s*(\d[\d,]*)/); if (v) r.shikichiken = { den: +v[1].replace(/,/g, ""), num: +v[2].replace(/,/g, "") };
      }
      var ko = t.search(/権\s*利\s*部\s*[（(]\s*甲\s*区/), otsu = t.search(/権\s*利\s*部\s*[（(]\s*乙\s*区/);
      if (ko >= 0) r.owners = ownersOf(t.slice(ko, otsu > ko ? otsu : undefined));
      var liens = t.slice(ko >= 0 ? ko : 0).match(/根抵当権設定|抵当権設定|差押|仮差押|仮登記|賃借権設定|地上権設定|地役権設定/g);
      if (liens) r.liens = Array.from(new Set(liens));
      var gone = t.match(/\d+番(?:根?抵当権|差押|仮登記)[^\s│|]{0,6}抹消/g);
      if (gone) r.lienCleared = gone;
      r.key = r.kind === "land" ? chibanKey(r.chiban) : "b:" + chibanKey(r.kaoku);
      return r;
    }).filter(function (r) { return r.chiban || r.kaoku || r.owners.length; });
  }

  function fmtShare(o) { return o.den === 1 && o.num === 1 ? "単独" : o.den + "分の" + o.num; }
  function ownersText(owners) { return owners.map(function (o) { return o.name + "（" + fmtShare(o) + "）"; }).join("、"); }

  // docs：{ type, name, text, fields:{ parcels, labels } }。edits：{ key: { role, share:{den,num}, chiban, area, comment } }
  // 戻り値：筆の配列（判定と理由つき）
  function judgeParcels(docs, edits, manual) {
    edits = edits || {};
    var map = {}, order = [];
    docs.forEach(function (d) {
      ((d.fields && d.fields.parcels) || []).forEach(function (r) {
        if (!r.key) return;
        if (!map[r.key]) { map[r.key] = Object.assign({ docs: [] }, r); order.push(r.key); }
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
            if (/私道|持分.*道路|道路.*持分/.test(ln)) { score += 3; reasons.push(d.name + " に、この地番と私道の記載があります"); }
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
    var hon = 0, shi = 0, shiShare = 0, hasBldg = false, names = [];
    parcels.forEach(function (p) { if (p.role === "本地") (p.owners || []).forEach(function (o) { if (names.indexOf(o.name) < 0) names.push(o.name); }); });
    parcels.forEach(function (p) {
      if (p.role === "建物") { hasBldg = true; return; }
      var a = p.area || 0;
      if (p.role === "本地") hon += a;
      else if (p.role === "私道") { shi += a; shiShare += a * ownerShare(p, names); }
    });
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    return { hon: r2(hon), shi: r2(shi), shiShare: r2(shiShare), hasBldg: hasBldg, names: names };
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

  var API = { ST: ST, EN: EN, plain: plain, active: active, applyKeep: applyKeep, struckList: struckList, chibanKey: chibanKey, parseRecords: parseRecords, shareSum: shareSum, ownersText: ownersText, fmtShare: fmtShare, judgeParcels: judgeParcels, summary: summary, parseComment: parseComment, mapLabels: mapLabels };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.BukkenTouki = API;
})(typeof window !== "undefined" ? window : globalThis);
