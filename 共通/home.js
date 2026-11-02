/* 不動産ツールのホーム画面。iPhone のように、長押しで並べ替え、下の段はドック。
   並びと追加した道具は、この端末の中（localStorage）だけに保存する。お金のやりとりはまだ無い。 */
(function () {
  "use strict";
  var TOOLS = window.FUDOSAN_TOOLS, BY = {};
  TOOLS.forEach(function (t) { BY[t.id] = t; });
  var KEY = "fudosanHome.v1", STORE = "store", DOCK_MAX = 4;
  var LONG_MS = 450, MOVE_PX = 8;
  var FREE = TOOLS.filter(function (t) { return t.plan === "free"; }).map(function (t) { return t.id; });
  var PLAN = { free: "無料", buy: "買い切り", monthly: "月額" };
  var $ = function (s) { return document.querySelector(s); };
  var grid = $("#grid"), dock = $("#dock"), editing = false, S;

  function initial() { return { grid: [STORE], dock: FREE.slice(0, DOCK_MAX).concat([]), owned: [] }; }
  // 保存された内容が壊れていても、知らない道具や重なりを取り除いて開けるようにする
  function clean(s) {
    var d = initial();
    if (!s || !Array.isArray(s.grid) || !Array.isArray(s.dock)) {
      FREE.slice(DOCK_MAX).forEach(function (id) { d.grid.push(id); });
      return d;
    }
    var seen = {}, keep = function (id) {
      if (seen[id] || (id !== STORE && !BY[id])) return false;
      seen[id] = 1; return true;
    };
    var out = { dock: s.dock.filter(function (id) { return id !== STORE && keep(id); }).slice(0, DOCK_MAX), grid: [], owned: [] };
    out.grid = s.grid.filter(keep);
    if (out.grid.indexOf(STORE) < 0) out.grid.unshift(STORE);
    out.owned = (Array.isArray(s.owned) ? s.owned : []).filter(function (id) { return BY[id] && BY[id].plan !== "free"; });
    return out;
  }
  function load() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return clean(null); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function onHome(id) { return S.grid.indexOf(id) >= 0 || S.dock.indexOf(id) >= 0; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function glyph(t) {
    if (t.icon && window.FUDOSAN_ICONS_READY) return '<img src="共通/icons/' + esc(t.icon) + '" alt="" draggable="false">';
    return '<svg viewBox="0 0 32 32" aria-hidden="true">' + t.svg + "</svg>";
  }
  var PLUS = { name: "道具を追加", svg: '<path d="M16 7v18M7 16h18"/>' };
  function appHtml(id) {
    var t = id === STORE ? PLUS : BY[id], href = id === STORE ? "#" : esc(t.path);
    return '<a class="app' + (id === STORE ? " is-store" : "") + '" data-id="' + id + '" href="' + href + '" draggable="false">' +
      '<span class="tile">' + (id === STORE ? '<svg viewBox="0 0 32 32" aria-hidden="true">' + t.svg + "</svg>" : glyph(t)) +
      (id === STORE ? "" : '<span class="rm" role="button" aria-label="' + esc(t.name) + 'をホームから外す"></span>') +
      '</span><span class="nm">' + esc(t.short || t.name) + "</span></a>";
  }
  function render() {
    grid.innerHTML = S.grid.map(appHtml).join("");
    dock.innerHTML = S.dock.map(appHtml).join("");
    document.body.classList.toggle("editing", editing);
    $("#done").hidden = !editing;
    $("#edit").hidden = editing;
    $("#hint").hidden = S.grid.length > 1;
  }
  function setEditing(v) { editing = v; document.body.classList.toggle("editing", v); $("#done").hidden = !v; $("#edit").hidden = v; }

  // ---- 動かす ----
  var press = null, drag = null, skipClick = false;
  function appsIn(box) { return [].slice.call(box.children).filter(function (e) { return e.classList.contains("app") && !e.classList.contains("held"); }); }
  // 位置が変わったものを、前の場所からすっと動かす
  function flip(change) {
    var els = appsIn(grid).concat(appsIn(dock)), from = els.map(function (e) { return e.getBoundingClientRect(); });
    change();
    els.forEach(function (e, i) {
      var r = e.getBoundingClientRect(), dx = from[i].left - r.left, dy = from[i].top - r.top;
      if ((dx || dy) && e.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        e.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    });
  }
  function startDrag(el, x, y) {
    if (!editing) setEditing(true);
    var r = el.getBoundingClientRect(), g = el.cloneNode(true), ph = document.createElement("div");
    g.className = "app ghost" + (el.dataset.id === STORE ? " is-store" : "");
    g.style.width = r.width + "px"; g.style.height = r.height + "px";
    document.body.appendChild(g);
    ph.className = "app ph"; ph.dataset.id = el.dataset.id;
    el.parentNode.insertBefore(ph, el);
    el.classList.add("held");
    drag = { el: el, ghost: g, ph: ph, ox: x - r.left, oy: y - r.top, x: x, y: y, last: 0, timer: setInterval(autoScroll, 40) };
    moveGhost(x, y);
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
  }
  function moveGhost(x, y) { drag.ghost.style.transform = "translate(" + (x - drag.ox) + "px," + (y - drag.oy) + "px) scale(1.12)"; }
  function autoScroll() {
    if (!drag) return;
    var top = dock.getBoundingClientRect().top;
    if (drag.y < 70) window.scrollBy(0, -8);
    else if (drag.y > top - 24 && drag.y < top) window.scrollBy(0, 8);
  }
  // 指に近い道具の中心を探す（アニメーション中でも揺れないよう、動く前の場所で測る）
  function nearest(box, x, y) {
    var b = box.getBoundingClientRect(), best = null, bd = 1e9;
    appsIn(box).forEach(function (e) {
      if (e === drag.ph) return;
      var cx = b.left + e.offsetLeft + e.offsetWidth / 2, cy = b.top + e.offsetTop + e.offsetHeight / 2, d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = { el: e, d: d, cx: cx, cy: cy, w: e.offsetWidth, h: e.offsetHeight }; }
    });
    return best;
  }
  function dragTo(x, y) {
    drag.x = x; drag.y = y; moveGhost(x, y);
    var now = Date.now(); if (now - drag.last < 110) return;
    var id = drag.ph.dataset.id, dr = dock.parentNode.getBoundingClientRect();
    var inDock = id !== STORE && y >= dr.top - 6 && x >= dr.left && x <= dr.right;
    var box = inDock ? dock : grid, ph = drag.ph, moved = false;
    var n = nearest(box, x, y), near = n && n.d < Math.max(n.w, n.h) * 0.62;
    flip(function () {
      if (ph.parentNode !== box) {
        // ドックがいっぱいなら、いちばん近い道具と入れかえる
        if (box === dock && appsIn(dock).length >= DOCK_MAX && n) {
          ph.parentNode.insertBefore(n.el, ph); box.insertBefore(ph, box.children[0] || null);
          // n.el が抜けた位置へ ph を置きなおす
          var rest = appsIn(dock).filter(function (e) { return e !== ph; });
          var bb = dock.getBoundingClientRect(), idx = 0;
          rest.forEach(function (e, i) { if (x > bb.left + e.offsetLeft + e.offsetWidth / 2) idx = i + 1; });
          dock.insertBefore(ph, rest[idx] || null);
        } else if (n && x < n.cx && box === dock) { box.insertBefore(ph, n.el); }
        else if (n && near) { box.insertBefore(ph, n.el); }
        else if (n && box === grid && y < n.cy - n.h * 0.4) { box.insertBefore(ph, n.el); }
        else if (box === dock && n) { box.insertBefore(ph, n.el.nextSibling); }
        else { box.appendChild(ph); }
        moved = true;
      } else if (near) {
        var list = appsIn(box), a = list.indexOf(ph), b = list.indexOf(n.el);
        if (b < a) box.insertBefore(ph, n.el); else box.insertBefore(ph, n.el.nextSibling);
        moved = true;
      } else if (box === grid) {
        // 空いている所（いちばん後ろより先）に来たら、いちばん後ろへ
        var all = appsIn(grid), lastEl = all[all.length - 1], b0 = grid.getBoundingClientRect();
        if (lastEl && lastEl !== ph) {
          var lb = b0.top + lastEl.offsetTop + lastEl.offsetHeight, lr = b0.left + lastEl.offsetLeft + lastEl.offsetWidth, lt = b0.top + lastEl.offsetTop;
          if (y > lb || (y > lt && x > lr)) { grid.appendChild(ph); moved = true; }
        }
      }
    });
    if (moved) drag.last = now;
  }
  function readOrder() {
    var ids = function (box) { return appsIn(box).map(function (e) { return e.dataset.id; }); };
    S.grid = ids(grid); S.dock = ids(dock);
    if (S.grid.indexOf(STORE) < 0) S.grid.unshift(STORE);
    save();
  }
  function endDrag(keep) {
    var d = drag; if (!d) return; drag = null; clearInterval(d.timer);
    var fin = false, done = function () {
      if (fin) return; fin = true;
      d.ghost.remove();
      if (keep) readOrder();
      render();
    };
    if (keep && d.ghost.animate) {
      var r = d.ph.getBoundingClientRect();
      d.ghost.animate([{ transform: d.ghost.style.transform }, { transform: "translate(" + r.left + "px," + r.top + "px) scale(1)" }], { duration: 160, easing: "ease-out", fill: "forwards" });
      setTimeout(done, 170);   // 画面が裏に回るとアニメーションの終わりが来ないので、時間で片づける
    } else done();
  }
  document.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    if (e.target.closest && e.target.closest(".rm")) return;
    var el = e.target.closest && e.target.closest(".app");
    if (!el || !el.parentNode || (el.parentNode !== grid && el.parentNode !== dock)) return;
    press = { el: el, x: e.clientX, y: e.clientY, id: e.pointerId, timer: null };
    if (!editing) press.timer = setTimeout(function () {
      if (!press) return;
      skipClick = true;
      startDrag(press.el, press.x, press.y);
    }, LONG_MS);
  });
  document.addEventListener("pointermove", function (e) {
    if (drag) { e.preventDefault(); dragTo(e.clientX, e.clientY); return; }
    if (!press || e.pointerId !== press.id) return;
    var far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX;
    if (!far) return;
    if (editing) { skipClick = true; startDrag(press.el, press.x, press.y); dragTo(e.clientX, e.clientY); }
    else { clearTimeout(press.timer); press = null; }  // 動かしたので、ふつうのスクロール
  }, { passive: false });
  function up(keep) { return function () {
    if (press) { clearTimeout(press.timer); press = null; }
    if (drag) endDrag(keep);
  }; }
  document.addEventListener("pointerup", up(true));
  document.addEventListener("pointercancel", up(false));
  // 指で動かしている間だけ、画面が動かないようにする
  document.addEventListener("touchmove", function (e) { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest(".app")) e.preventDefault(); });
  document.addEventListener("dragstart", function (e) { e.preventDefault(); });

  document.addEventListener("click", function (e) {
    var rm = e.target.closest && e.target.closest(".rm");
    if (rm) { e.preventDefault(); e.stopPropagation(); removeApp(rm.closest(".app").dataset.id); return; }
    var a = e.target.closest && e.target.closest(".app");
    if (skipClick) { skipClick = false; if (a) e.preventDefault(); return; }
    if (a && (a.parentNode === grid || a.parentNode === dock)) {
      if (editing || a.dataset.id === STORE) e.preventDefault();
      if (!editing && a.dataset.id === STORE) openStore();
      return;
    }
    if (editing && !e.target.closest("button")) setEditing(false);
  });
  // キーボードでも動かせるように（並べ替え中に矢印キー）
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if ($("#store")) closeStore(); else if (editing) setEditing(false); return; }
    if (!editing || !/^Arrow(Left|Right)$/.test(e.key)) return;
    var a = document.activeElement; if (!a || !a.classList.contains("app")) return;
    var id = a.dataset.id, list = S.grid.indexOf(id) >= 0 ? S.grid : S.dock, i = list.indexOf(id), j = i + (e.key === "ArrowLeft" ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    list[i] = list[j]; list[j] = id; save(); render();
    var f = document.querySelector('.app[data-id="' + id + '"]'); if (f) f.focus();
    e.preventDefault();
  });

  function removeApp(id) {
    S.grid = S.grid.filter(function (x) { return x !== id; });
    S.dock = S.dock.filter(function (x) { return x !== id; });
    save(); render();
    toast(BY[id].name + "をホームから外しました。「道具を追加」から戻せます");
  }
  var toastT;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---- 道具を追加 ----
  function storeRows() {
    return TOOLS.map(function (t) {
      var state = onHome(t.id) ? "on" : (t.plan === "free" || S.owned.indexOf(t.id) >= 0) ? "back" : "new";
      var btn = state === "on" ? '<span class="got">ホームにあります</span>'
        : '<button type="button" class="add' + (state === "new" ? " primary" : "") + '" data-add="' + t.id + '">' + (state === "new" ? "追加" : "ホームに戻す") + "</button>";
      return '<li><span class="tile sm">' + glyph(t) + '</span><div class="tx"><b>' + esc(t.name) + '</b><span class="plan' + (t.plan === "free" ? " free" : "") + '">' + PLAN[t.plan] + "</span><p>" + esc(t.desc) + "</p></div>" + btn + "</li>";
    }).join("");
  }
  function paintStore() {
    var box = $("#store"); if (!box) return;
    box.querySelector("ul").innerHTML = storeRows();
  }
  function openStore() {
    if ($("#store")) return;
    var w = document.createElement("div");
    w.className = "scrim"; w.id = "store";
    w.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="道具を追加"><div class="sh-head"><h2>道具を追加</h2><button type="button" class="close" aria-label="閉じる"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8l16 16M24 8L8 24"/></svg></button></div>' +
      '<p class="trial">試作版です。いまは押すだけで追加され、お金はかかりません。値段と支払いの仕組みは準備中です。</p>' +
      "<ul></ul>" +
      '<div class="sh-foot"><button type="button" class="add" id="addAll">すべて追加して試す</button><button type="button" class="link" id="reset">最初の並びに戻す</button></div>' +
      '<p class="fine">どの道具も目安を出すものです。国や自治体が作ったものではなく、重要事項説明・建築確認・税の申告などの手続には使えません。</p></div>';
    document.body.appendChild(w);
    document.body.classList.add("sheet-open");
    paintStore();
    w.querySelector(".close").focus();
    w.addEventListener("click", function (e) {
      if (e.target === w || e.target.closest(".close")) return closeStore();
      var a = e.target.closest("[data-add]");
      if (a) { addTool(a.getAttribute("data-add")); paintStore(); return; }
      if (e.target.closest("#addAll")) {
        TOOLS.forEach(function (t) { if (!onHome(t.id)) addTool(t.id); });
        paintStore(); toast("すべてホームに追加しました"); return;
      }
      if (e.target.closest("#reset") && confirm("並びを最初に戻し、追加した道具も外します。よろしいですか？")) {
        S = clean(null); save(); render(); paintStore();
      }
    });
  }
  function closeStore() { var w = $("#store"); if (w) w.remove(); document.body.classList.remove("sheet-open"); }
  function addTool(id) {
    if (BY[id].plan !== "free" && S.owned.indexOf(id) < 0) S.owned.push(id);
    if (!onHome(id)) S.grid.push(id);   // 上から順に、空いている次の場所へ
    save(); render();
  }

  $("#edit").addEventListener("click", function () { setEditing(true); });
  $("#done").addEventListener("click", function () { setEditing(false); });
  $("#hint").addEventListener("click", openStore);
  $("#add").addEventListener("click", openStore);
  var d = new Date();
  $("#today").innerHTML = d.getFullYear() + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + ("0" + d.getDate()).slice(-2) + "<small>" + "日月火水木金土".charAt(d.getDay()) + "曜日</small>";

  S = load(); save(); render();
  window.FUDOSAN_HOME = { state: function () { return JSON.parse(JSON.stringify(S)); }, clean: clean };
})();
