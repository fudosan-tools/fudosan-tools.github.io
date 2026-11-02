/* 接道の特例の図（上から見た配置図）を SVG の文字で作る部品（2026-10-28）。
   色は共通の色（CSS の --ink など）を使うので、暗い画面でもそのまま見える。
   window.SetsudouZu.passage({ shape, w, len, through, wText, lenText, small }) */
(function (root) {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function n1(v) { return Math.round(v * 100) / 100; }

  // 寸法の線（両はしに短い線）。横：y の高さで x1〜x2、縦：x の位置で y1〜y2
  function dimH(x1, x2, y, label, side) {
    var t = side === "below" ? y + 14 : y - 6;
    return '<g class="dg-dim"><line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '"/><line x1="' + x1 + '" y1="' + (y - 5) + '" x2="' + x1 + '" y2="' + (y + 5) + '"/><line x1="' + x2 + '" y1="' + (y - 5) + '" x2="' + x2 + '" y2="' + (y + 5) + '"/></g>' +
      '<text class="dg-ta" x="' + (x2 + 6) + '" y="' + (t + (side === "below" ? 0 : 10)) + '">' + esc(label) + "</text>";
  }
  function dimV(x, y1, y2, label) {
    var my = (y1 + y2) / 2;
    return '<g class="dg-dim"><line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '"/><line x1="' + (x - 5) + '" y1="' + y1 + '" x2="' + (x + 5) + '" y2="' + y1 + '"/><line x1="' + (x - 5) + '" y1="' + y2 + '" x2="' + (x + 5) + '" y2="' + y2 + '"/></g>' +
      (/ /.test(label) ? '<text class="dg-ta" x="' + (x - 8) + '" y="' + (my - 4) + '" text-anchor="end"><tspan class="dg-t">' + esc(label.split(" ")[0]) + '</tspan><tspan x="' + (x - 8) + '" dy="16">' + esc(label.split(" ").slice(1).join(" ")) + "</tspan></text>"
        : '<text class="dg-ta" x="' + (x - 8) + '" y="' + (my + 4) + '" text-anchor="end">' + esc(label) + "</text>");
  }

  // 長さの寸法：左の空き場所に縦の線を引き、通路の奥から補助線をのばす
  function dimLen(x0, y0, y1, label) {
    if (!label) return "";
    var x = 88;
    return '<line class="dg-ext" x1="' + x0 + '" y1="' + y1 + '" x2="' + (x - 4) + '" y2="' + y1 + '"/>' + dimV(x, y0, y1, label);
  }

  // 通路の図。shape:"路線"（ほかの家も面している道）／"専用"（旗竿の竿）
  function passage(o) {
    o = o || {};
    var hasLen = o.lenText !== "";   // lenText に "" を渡したときは、長さの寸法を書かない
    var W = 380, roadH = 34, LM = hasLen ? 100 : 18, cx = hasLen ? 236 : 196;   // LM：左に長さの寸法を書く場所
    var w = o.w != null && !isNaN(o.w) ? o.w : null, len = o.len != null && !isNaN(o.len) ? o.len : null;
    var pw = 14 + (clamp(w == null ? 1.8 : w, 0.5, 4) - 0.5) / 3.5 * 50;          // 0.5m→14px、4m→64px
    var ph = 70 + (clamp(len == null ? 25 : len, 5, 80) - 5) / 75 * 120;           // 5m→70px、80m→190px
    var pxm = pw / (w == null ? 1.8 : clamp(w, 0.5, 4));                              // 1mあたりの点
    var y0 = roadH, y1 = roadH + ph, x0 = cx - pw / 2, x1 = cx + pw / 2;
    var wText = o.wText || (w == null ? "幅 ?m" : "幅 " + n1(w) + "m");
    var lenText = o.lenText != null ? o.lenText : (len == null ? "長さ ?m" : (o.shape === "専用" ? "通路の長さ " : "道路まで ") + n1(len) + "m");
    var H, s = "";
    s += '<rect class="dg-road" x="0" y="0" width="' + W + '" height="' + roadH + '"/>';
    s += '<text class="dg-t" x="10" y="21">道路（建築基準法の道路）</text>';
    if (o.shape === "専用") {
      // 旗竿地：竿（通路）の奥に敷地。竿の両側はとなりの敷地
      var lotW = 150, lotH = 74, lx = cx - lotW / 2;
      H = y1 + lotH + 18;
      s += '<rect class="dg-house" x="' + LM + '" y="' + (y0 + 10) + '" width="' + (x0 - 12 - LM) + '" height="' + (ph - 16) + '"/>';
      s += '<rect class="dg-house" x="' + (x1 + 12) + '" y="' + (y0 + 10) + '" width="' + (W - x1 - 30) + '" height="' + (ph - 16) + '"/>';
      s += '<text class="dg-t dg-faint" x="' + (x1 + 22) + '" y="' + (y0 + ph - 14) + '">となりの敷地</text>';
      s += '<rect class="dg-pass" x="' + x0 + '" y="' + y0 + '" width="' + pw + '" height="' + ph + '"/>';
      s += '<rect class="dg-site" x="' + lx + '" y="' + y1 + '" width="' + lotW + '" height="' + lotH + '"/>';
      s += '<text class="dg-ts" x="' + cx + '" y="' + (y1 + lotH / 2 + 5) + '" text-anchor="middle">建てたい敷地</text>';
      s += dimH(x0, x1, y0 - 8, wText);
      s += dimLen(x0, y0, y1, lenText);
    } else {
      // 路線型の道：道の両側に家が並ぶ。建てたい敷地は右の奥
      var thru = !!o.through, endH = thru ? roadH : 26;
      H = y1 + endH + (thru ? 0 : 6);
      var n = Math.max(2, Math.floor(ph / 46)), hh = ph / n;
      for (var i = 0; i < n; i++) {
        var yy = y0 + i * hh + 6;
        s += '<rect class="dg-house" x="' + LM + '" y="' + yy + '" width="' + (x0 - 12 - LM) + '" height="' + (hh - 12) + '"/>';
        if (i < n - 1) s += '<rect class="dg-house" x="' + (x1 + 12) + '" y="' + yy + '" width="' + (W - x1 - 30) + '" height="' + (hh - 12) + '"/>';
        else {
          s += '<rect class="dg-site" x="' + (x1 + 12) + '" y="' + yy + '" width="' + (W - x1 - 30) + '" height="' + (hh - 12) + '"/>';
          s += '<text class="dg-ts" x="' + (x1 + 22) + '" y="' + (yy + (hh - 12) / 2 + 5) + '">建てたい敷地</text>';
        }
      }
      s += '<rect class="dg-pass" x="' + x0 + '" y="' + y0 + '" width="' + pw + '" height="' + ph + '"/>';
      s += '<line class="dg-center" x1="' + cx + '" y1="' + y0 + '" x2="' + cx + '" y2="' + y1 + '"/>';
      // 道の中心から2m（幅4m未満のとき、敷地の側に下がる線）
      if (w == null || w < 4) {
        var sx = Math.min(cx + 2 * pxm, x1 + 10);
        s += '<line class="dg-setback" x1="' + sx + '" y1="' + (y0 + 4) + '" x2="' + sx + '" y2="' + (y1 - 4) + '"/>';
        if (!o.small) s += '<text class="dg-t dg-faint" x="' + (sx + 4) + '" y="' + (y0 + 14) + '">中心から2m</text>';
      }
      if (thru) {
        s += '<rect class="dg-road" x="0" y="' + y1 + '" width="' + W + '" height="' + roadH + '"/>';
        s += '<text class="dg-t" x="10" y="' + (y1 + 21) + '">もう一方の道路（通り抜け・2方向に逃げられる）</text>';
      } else {
        s += '<line class="dg-end" x1="' + (x0 - 2) + '" y1="' + y1 + '" x2="' + (x1 + 2) + '" y2="' + y1 + '"/>';
        s += '<text class="dg-t dg-faint" x="' + (x1 + 6) + '" y="' + (y1 + 18) + '">行き止まり</text>';
      }
      s += dimH(x0, x1, y0 - 8, wText);
      s += dimLen(x0, y0, y1, lenText);
    }
    return '<svg class="dg' + (o.small ? " dg-small" : "") + '" viewBox="0 0 ' + W + " " + Math.ceil(H) + '" role="img" aria-label="' + esc((o.shape === "専用" ? "旗竿の通路の図：" : "道の図：") + wText + "・" + lenText) + '">' + s + "</svg>";
  }

  // 「道路に2m接していない」ときの3つの場合を並べた小さな図
  function overview() {
    var a = '<svg class="dg dg-small" viewBox="0 0 360 150" role="img" aria-label="道路に2m以上接する敷地の図">' +
      '<rect class="dg-road" x="0" y="0" width="360" height="34"/><text class="dg-t" x="10" y="21">道路（幅4m以上）</text>' +
      '<rect class="dg-site" x="110" y="34" width="140" height="96"/><text class="dg-ts" x="180" y="88" text-anchor="middle">敷地</text>' +
      '<g class="dg-dim"><line x1="110" y1="44" x2="250" y2="44"/><line x1="110" y1="39" x2="110" y2="49"/><line x1="250" y1="39" x2="250" y2="49"/></g>' +
      '<text class="dg-ta" x="256" y="48">2m以上接する</text></svg>';
    return [
      { t: "ふつうに建てられる", d: "建築基準法の道路に、敷地が2m以上接している。", g: a },
      { t: "43条2項1号「認定」", d: "幅4m以上の道（農道・公の道など）に2m以上接する。役所の基準に合えば認定。審査会は要らない。", g: passage({ shape: "路線", w: 4, len: 20, small: true, wText: "幅4m以上", lenText: "" }) },
      { t: "43条2項2号「許可」", d: "4m未満の通路や旗竿など。周りの空地などの条件で許可。建築審査会の同意が要る（包括同意基準なら1件ずつかけない）。", g: passage({ shape: "専用", w: 1.5, len: 15, small: true, wText: "幅1.5m など", lenText: "" }) }
    ];
  }

  var api = { passage: passage, overview: overview };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SetsudouZu = api;
})(this);
