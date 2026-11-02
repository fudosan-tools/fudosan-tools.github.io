/* 不動産ツール 共通の上メニューと「お客様向け／担当者向け」の切りかえ。
   使い方：<nav class="toolnav" data-current="loan"></nav> を置いて、このファイルを読みこむ。 */
(function () {
  "use strict";
  var TOOLS = [
    ["map", "相場マップ", "相場マップ試作/web/index.html"],
    ["survey", "物件調査", "物件調査/index.html"],
    ["maisoku", "マイソク", "マイソク/index.html"],
    ["loan", "住宅ローン", "シミュレーター/loan.html"],
    ["chintai", "賃貸の初期費用", "シミュレーター/chintai.html"],
    ["shushi", "収支", "シミュレーター/shushi.html"],
    ["shuzen", "修繕・リフォーム", "シミュレーター/shuzen.html"],
    ["kenchiku", "建築・ボリューム", "シミュレーター/kenchiku.html"],
    ["tochi", "土地活用", "シミュレーター/tochi.html"],
    ["sekisan", "積算の目安", "シミュレーター/sekisan.html"],
    ["chukai", "仲介手数料", "シミュレーター/chukai.html"],
    ["inshi", "印紙代", "シミュレーター/inshi.html"],
    ["zeikin", "税の概算", "シミュレーター/zeikin.html"],
    ["setsudou", "接道の特例", "接道/index.html"]
  ];
  // このファイルの場所から、ツール一式の一番上のフォルダを割り出す
  var me = document.currentScript && document.currentScript.src;
  var base = me ? me.replace(/共通\/common\.js.*$/, "").replace(/%E5%85%B1%E9%80%9A\/common\.js.*$/i, "") : "../";

  var mode = "client";
  try { mode = localStorage.getItem("fudosanMode") || "client"; } catch (e) {}
  document.documentElement.setAttribute("data-mode", mode);

  function render() {
    var nav = document.querySelector("nav.toolnav");
    if (!nav) return;
    var cur = nav.getAttribute("data-current");
    var html = '<div class="in"><a class="brand" href="' + base + 'index.html">不動産ツール</a>';
    TOOLS.forEach(function (t) {
      html += '<a class="tool' + (t[0] === cur ? " on" : "") + '" href="' + base + t[2] + '">' + t[1] + "</a>";
    });
    html += '<div class="mode seg" role="group" aria-label="表示の切りかえ">' +
      '<button type="button" data-m="client">お客様向け</button><button type="button" data-m="staff">担当者向け</button></div></div>';
    nav.innerHTML = html;
    nav.querySelectorAll(".mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-m") === mode);
      b.addEventListener("click", function () {
        mode = b.getAttribute("data-m");
        document.documentElement.setAttribute("data-mode", mode);
        try { localStorage.setItem("fudosanMode", mode); } catch (e) {}
        nav.querySelectorAll(".mode button").forEach(function (x) { x.classList.toggle("on", x === b); });
        document.dispatchEvent(new CustomEvent("modechange", { detail: mode }));
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();

  // ㎡と坪をいつも両方出すための小さな道具
  var TSUBO = 3.30578;
  window.FUDOSAN = {
    TSUBO: TSUBO,
    m2ToTsubo: function (m2) { return m2 / TSUBO; },
    tsuboToM2: function (t) { return t * TSUBO; },
    // 例：area(40) → "40.0㎡（12.1坪）"
    area: function (m2, d) { if (m2 == null || isNaN(m2)) return "—"; d = d == null ? 1 : d;
      return m2.toFixed(d) + "㎡（" + (m2 / TSUBO).toFixed(1) + "坪）"; },
    // 例：unitPrice(1100000) → "110.0万円/㎡（363.6万円/坪）"
    unitPrice: function (yenPerM2) { if (yenPerM2 == null || isNaN(yenPerM2)) return "—";
      return (yenPerM2 / 1e4).toFixed(1) + "万円/㎡（" + (yenPerM2 * TSUBO / 1e4).toFixed(1) + "万円/坪）"; },
    getMode: function () { return mode; }
  };
})();
