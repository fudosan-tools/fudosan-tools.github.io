/* 物件調査シートの計算部分（画面とテストで同じものを使う）。
   - 位置が「どの区域の中にあるか」を、点と多角形の当たり判定で調べる
   - 全国のデータは小さな四角（タイル）ごとのファイルに分かれている。位置からタイルの名前を出す
   - 用途地域・高度地区から、斜線制限・絶対高さ・日影規制の対象などを組み立てる
   根拠：建築基準法 第52条・第53条・第55条・第56条・第56条の2・別表第3・別表第4（e-Gov法令検索）、
         東京都の高度地区（各区の都市計画。式は大田区の計画書の文言で確認）。くわしくは 調べもの_物件調査.md */
(function (root) {
  "use strict";

  // 用途地域の番号（東京都のデータ定義書の番号。13＝田園住居地域はこの道具で足した番号）→ 名前など
  // kind: res=住居系 / com=商業系 / ind=工業系。low=低層住居専用など（絶対高さあり）
  var ZONES = {
    1: { name: "第一種低層住居専用地域", short: "一低層", kind: "res", low: true },
    2: { name: "第二種低層住居専用地域", short: "二低層", kind: "res", low: true },
    3: { name: "第一種中高層住居専用地域", short: "一中高", kind: "res", mid: true },
    4: { name: "第二種中高層住居専用地域", short: "二中高", kind: "res", mid: true },
    5: { name: "第一種住居地域", short: "一住居", kind: "res" },
    6: { name: "第二種住居地域", short: "二住居", kind: "res" },
    7: { name: "準住居地域", short: "準住居", kind: "res" },
    8: { name: "近隣商業地域", short: "近商", kind: "com" },
    9: { name: "商業地域", short: "商業", kind: "com" },
    10: { name: "準工業地域", short: "準工", kind: "ind" },
    11: { name: "工業地域", short: "工業", kind: "ind" },
    12: { name: "工業専用地域", short: "工専", kind: "ind" },
    13: { name: "田園住居地域", short: "田園住居", kind: "res", low: true }
  };
  // 高度地区。1〜4 は東京都のデータの番号。0 は「国のデータで、種類・高さが分からない高度地区」
  var KOUDO = {
    0: { name: "高度地区（種類・高さはデータに無い）", base: null },
    1: { name: "第1種高度地区", base: 5, s1: 0.6, s2: 0.6, brk: 0 },
    2: { name: "第2種高度地区", base: 5, s1: 1.25, s2: 0.6, brk: 8 },
    3: { name: "第3種高度地区", base: 10, s1: 1.25, s2: 0.6, brk: 8 },
    4: { name: "最高限度・最低限度だけの高度地区", base: null }
  };
  var BOUKA = { 10: "防火地域", 20: "準防火地域" };
  var SENBIKI = { 22: "市街化区域", 23: "市街化調整区域" };

  /* ---------- データの読み出し ---------- */
  function decodeRing(arr, scale) {
    var out = new Float64Array(arr.length), x = 0, y = 0;
    for (var i = 0; i < arr.length; i += 2) {
      x += arr[i]; y += arr[i + 1];
      out[i] = x / scale; out[i + 1] = y / scale;
    }
    return out;
  }
  function prepLayers(layers, scale, db) {
    Object.keys(layers).forEach(function (k) {
      db[k] = layers[k].map(function (f) {
        return { p: f[0], b: f[1], rings: f[2].map(function (r) { return decodeRing(r, scale); }) };
      });
    });
    return db;
  }
  // 古い形（data/zoning.js の SURVEY_DATA。3区だけの試作）も読めるように残す
  function prepare(data) {
    return prepLayers(data.layers, data.meta.scale, { meta: data.meta });
  }

  /* ---------- タイル（全国を小さな四角に分けたファイル） ---------- */
  function tileXY(grid, lat, lon) {
    return [Math.floor((lon - grid.lon0) / grid.w), Math.floor((lat - grid.lat0) / grid.h)];
  }
  function tileKey(grid, lat, lon) { var t = tileXY(grid, lat, lon); return t[0] + "_" + t[1]; }
  function tileRect(grid, key) {
    var a = key.split("_"), ix = +a[0], iy = +a[1];
    return [grid.lon0 + ix * grid.w, grid.lat0 + iy * grid.h, grid.lon0 + (ix + 1) * grid.w, grid.lat0 + (iy + 1) * grid.h];
  }
  // 見えている範囲にかかるタイルの名前（多すぎるときは max 個まで）
  function tilesForBounds(grid, w, s, e, n, max) {
    var a = tileXY(grid, s, w), b = tileXY(grid, n, e), out = [];
    for (var iy = a[1]; iy <= b[1]; iy++) for (var ix = a[0]; ix <= b[0]; ix++) out.push(ix + "_" + iy);
    return max && out.length > max ? null : out;
  }
  // index（SURVEY_INDEX）と、読んだタイル（SURVEY_TILES[key]）から、当たり判定に使う形を作る
  function prepareTile(index, key, tile) {
    var r = tileRect(index.meta.grid, key);
    var db = prepLayers(tile.layers, index.meta.scale, { meta: { clip: r, key: key, tiled: true }, index: index });
    return db;
  }
  function hasTile(index, key) { return !!(index && index.tiles && index.tiles[key] != null); }

  /* ---------- 当たり判定 ---------- */
  // 点から右へ水平の線をのばし、辺と何回交わるかを数える（奇数なら中）
  function crossings(lon, lat, ring) {
    var c = 0, n = ring.length;
    for (var i = 0, j = n - 2; i < n; j = i, i += 2) {
      var xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
      if ((yi > lat) !== (yj > lat)) {
        var x = xj + (lat - yj) * (xi - xj) / (yi - yj);
        if (lon < x) c++;
      }
    }
    return c;
  }
  // 外側の輪と穴（中庭のような抜け）を、全部まとめて数える（偶数奇数のきまり）
  function contains(f, lon, lat) {
    var b = f.b;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) return false;
    var c = 0;
    for (var k = 0; k < f.rings.length; k++) c += crossings(lon, lat, f.rings[k]);
    return (c % 2) === 1;
  }
  function findAll(layer, lon, lat) {
    var out = [];
    if (!layer) return out;
    for (var i = 0; i < layer.length; i++) if (contains(layer[i], lon, lat)) out.push(layer[i]);
    return out;
  }
  // 区域の境目までのいちばん近い距離（m）。その場所のまわりだけなので平らとみなして計算
  // タイルで切った線（本当の境目ではない線）は数えない
  function distToEdge(f, lon, lat, clipRect) {
    var ky = 111320, kx = 111320 * Math.cos(lat * Math.PI / 180), best = Infinity, eps = 2e-6;
    var cr = null;
    if (clipRect) { var bf = 0.0006; cr = [clipRect[0] - bf, clipRect[1] - bf, clipRect[2] + bf, clipRect[3] + bf]; }
    function onClip(x1, y1, x2, y2) {
      if (!cr) return false;
      return (Math.abs(x1 - cr[0]) < eps && Math.abs(x2 - cr[0]) < eps) || (Math.abs(x1 - cr[2]) < eps && Math.abs(x2 - cr[2]) < eps) ||
        (Math.abs(y1 - cr[1]) < eps && Math.abs(y2 - cr[1]) < eps) || (Math.abs(y1 - cr[3]) < eps && Math.abs(y2 - cr[3]) < eps);
    }
    f.rings.forEach(function (r) {
      for (var i = 0; i + 3 < r.length; i += 2) {
        if (onClip(r[i], r[i + 1], r[i + 2], r[i + 3])) continue;
        var ax = (r[i] - lon) * kx, ay = (r[i + 1] - lat) * ky;
        var bx = (r[i + 2] - lon) * kx, by = (r[i + 3] - lat) * ky;
        var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        var t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
        var px = ax + t * dx, py = ay + t * dy, d = Math.sqrt(px * px + py * py);
        if (d < best) best = d;
      }
    });
    return best;
  }
  // 地図に線を引くとき、タイルで切った線を除いた「本当の境目」の線だけを返す（[[lat,lon],...] の配列）
  function edgeLines(f, clipRect) {
    var out = [], eps = 2e-6, bf = 0.0006;
    var cr = clipRect ? [clipRect[0] - bf, clipRect[1] - bf, clipRect[2] + bf, clipRect[3] + bf] : null;
    f.rings.forEach(function (r) {
      var cur = [];
      for (var i = 0; i + 3 < r.length; i += 2) {
        var x1 = r[i], y1 = r[i + 1], x2 = r[i + 2], y2 = r[i + 3];
        var cut = cr && ((Math.abs(x1 - cr[0]) < eps && Math.abs(x2 - cr[0]) < eps) || (Math.abs(x1 - cr[2]) < eps && Math.abs(x2 - cr[2]) < eps) ||
          (Math.abs(y1 - cr[1]) < eps && Math.abs(y2 - cr[1]) < eps) || (Math.abs(y1 - cr[3]) < eps && Math.abs(y2 - cr[3]) < eps));
        if (cut) { if (cur.length > 1) out.push(cur); cur = []; continue; }
        if (!cur.length) cur.push([y1, x1]);
        cur.push([y2, x2]);
      }
      if (cur.length > 1) out.push(cur);
    });
    return out;
  }

  /* ---------- ひとつの地点を調べる ---------- */
  function lookup(db, lat, lon) {
    var m = db.meta.clip, index = db.index || null;
    var res = { lat: lat, lon: lon, inData: !(lon < m[0] || lon > m[2] || lat < m[1] || lat > m[3]) };
    // 3区だけの古い形のデータ（町丁目の形つき）
    var towns = findAll(db.town, lon, lat);
    res.town = towns.length ? { ward: towns[0].p[0], name: towns[0].p[1] } : null;
    res.inWards = !!res.town;
    if (!res.inData) return res;
    var cr = db.meta.tiled ? m : null;

    // 区域区分（市街化区域／市街化調整区域）・都市計画区域
    var sb = findAll(db.senbiki, lon, lat);
    var tk = findAll(db.tokei, lon, lat);
    res.kuiki = sb.length ? { code: sb[0].p[0], name: SENBIKI[sb[0].p[0]] || "" } : null;
    res.toshiKeikaku = tk.length ? true : (db.tokei ? false : null);

    var y = findAll(db.youto, lon, lat);
    res.youtoAll = y.map(function (f) { return youtoInfo(f.p); });
    res.youto = res.youtoAll[0] || null;
    res.youtoMixed = y.length > 1 && y.some(function (f) { return f.p.slice(0, 7).join() !== y[0].p.slice(0, 7).join(); });
    res.edgeM = y.length ? distToEdge(y[0], lon, lat, cr) : null;
    res.youtoFeature = y[0] || null;
    // 容積率・建ぺい率が国のデータで空のとき、2019年度の国土数値情報（A29）で補う（同じ用途地域のときだけ）
    if (res.youto && !(res.youto.kenpei > 0 && res.youto.youseki > 0)) {
      var a = findAll(db.a29, lon, lat).filter(function (f) { return f.p[0] === res.youto.code; });
      if (a.length) { res.youto.kenpei = a[0].p[1]; res.youto.youseki = a[0].p[2]; res.youto.fill2019 = true; }
      else res.youto.noRatio = true;
    }

    // 市区町村（データの有無と時点を出すため）
    var code = (res.youto && res.youto.muni) || (sb[0] && sb[0].p[1]) || (tk[0] && tk[0].p[1]) || "";
    res.muni = muniInfo(index, code);

    var k = findAll(db.koudo, lon, lat);
    res.koudo = k.length ? koudoInfo(k[0].p) : null;
    res.koudoFeature = k[0] || null;
    res.koudoEdgeM = k.length ? distToEdge(k[0], lon, lat, cr) : null;
    res.koudoState = k.length ? "yes" : availState(res.muni, "koudo");

    var b = findAll(db.bouka, lon, lat);
    var bcode = b.length ? Math.min.apply(null, b.map(function (f) { return f.p[0]; })) : 0; // 防火(10)を優先
    var bst = b.length ? "yes" : availState(res.muni, "bouka");
    res.bouka = { code: bcode, name: BOUKA[bcode] || (bst === "nodata" ? "データなし" : "指定なし"), state: bst };
    res.boukaEdgeM = b.length ? distToEdge(b[0], lon, lat, cr) : null;

    res.chiku = findAll(db.chiku, lon, lat).map(function (f) {
      return { name: f.p[0] || "名前がデータに無い地区計画", ha: f.p[1], first: ymd(f.p[2]), last: ymd(f.p[3]), contact: f.p[4] };
    });
    res.chikuState = res.chiku.length ? "yes" : availState(res.muni, "chiku");
    res.fuchi = findAll(db.fuchi, lon, lat).map(function (f) { return { name: f.p[0] || "風致地区", no: f.p[1] }; });
    res.fuchiState = res.fuchi.length ? "yes" : availState(res.muni, "fuchi");
    res.other = findAll(db.other, lon, lat).map(function (f) { return { kind: f.p[0], name: f.p[1] }; });
    res.src = (res.youto && res.youto.src) || (res.muni && res.muni.src) || (index ? "" : "T");
    return res;
  }
  // 市区町村のデータに、その種類の情報があるか（o=あり / x=データなし / -=都市計画で決めていない）
  function availState(muni, key) {
    if (!muni || !muni.avail) return "none";
    var v = muni.avail[key];
    return v === "x" ? "nodata" : v === "-" ? "none" : v === "o" ? "none" : "unknown";
  }
  function muniInfo(index, code) {
    if (!index || !code || !index.munis) return null;
    var m = index.munis[code];
    if (!m) return { code: code, pref: "", name: "", src: "", avail: null };
    return { code: code, pref: m.pref, name: m.name, src: m.src, avail: m.avail, asOf: m.asOf, made: m.made, note: m.note, fill2019: !!m.fill2019 };
  }
  function ymd(n) {
    n = String(n || "");
    return n.length === 8 ? n.slice(0, 4) + "年" + (+n.slice(4, 6)) + "月" + (+n.slice(6, 8)) + "日" : "";
  }
  function youtoInfo(p) {
    var z = ZONES[p[0]] || { name: "不明（コード" + p[0] + "）", kind: "res" };
    return { code: p[0], name: z.name, short: z.short, kind: z.kind, low: !!z.low, mid: !!z.mid,
      youseki: p[1], kenpei: p[2], gaiheki: p[3], minArea: p[4], tokurei: p[5] === 1, takasa: p[6],
      src: p[7] || "T", muni: p[8] || "", tokyo: (p[7] || "T") === "T" };
  }
  function koudoInfo(p) {
    var k = KOUDO[p[0]] || { name: "不明（コード" + p[0] + "）" };
    return { code: p[0], name: k.name, min: p[1], max: p[2], src: p[3] || "T", typeKnown: p[0] >= 1 && p[0] <= 4 };
  }

  /* ---------- 高さの制限 ---------- */
  // 東京都の高度地区：真北方向の距離 d(m) の場所で、建てられる高さ(m)
  function koudoHeight(code, d) {
    var k = KOUDO[code];
    if (!k || k.base == null) return null;
    if (!k.brk || d <= k.brk) return k.base + k.s1 * d;
    return k.base + k.s1 * k.brk + k.s2 * (d - k.brk);
  }
  function koudoFormula(code) {
    if (code === 1) return "5m ＋ 真北方向の距離 × 0.6";
    if (code === 2) return "距離8mまで：5m ＋ 距離 × 1.25／8mから先：15m ＋ （距離－8m）× 0.6";
    if (code === 3) return "距離8mまで：10m ＋ 距離 × 1.25／8mから先：20m ＋ （距離－8m）× 0.6";
    return "";
  }
  // 道路斜線が効く範囲（建築基準法 別表第3）
  function roadSlopeRange(kind, far) {
    if (kind === "com") {
      if (far <= 400) return 20; if (far <= 600) return 25; if (far <= 800) return 30;
      if (far <= 1000) return 35; if (far <= 1100) return 40; if (far <= 1200) return 45; return 50;
    }
    if (far <= 200) return 20; if (far <= 300) return 25; if (far <= 400) return 30; return 35;
  }
  // 道路の幅で決まる容積率の上限（第52条第2項。幅12m未満のとき）
  function roadFar(kind, roadW) {
    if (!(roadW > 0) || roadW >= 12) return null;
    var k = kind === "res" ? 0.4 : 0.6;
    return { coef: k, far: Math.round(roadW * k * 1000) / 10 };
  }
  // 絶対高さ（低層・田園住居）。東京都のデータには入っている。国のデータには無いので「10mか12m」
  function absHeight(y) {
    if (!y || !y.low) return null;
    if (y.takasa > 0) return y.takasa;
    return y.tokyo ? 10 : null;
  }

  // 用途地域と高度地区から、その場所にかかる高さのルールを組み立てる
  function heightRules(y, k, opts) {
    opts = opts || {};
    var rows = [];
    if (!y) return rows;
    var res = y.kind === "res";
    var slope = res ? 1.25 : 1.5;
    var tokyo = y.tokyo !== false;
    var hasFar = y.youseki > 0;
    rows.push({ key: "road", title: "道路斜線",
      rule: "道路の反対側の境界線からの距離 × " + slope + "（1m離れるごとに " + slope + "m 高くできる斜めの線）",
      detail: (hasFar ? "道路の反対側の境界線から " + roadSlopeRange(y.kind, y.youseki) + "m の範囲で効きます（指定容積率 " + y.youseki + "% のとき）。" : "効く範囲は容積率で決まります（容積率は役所で確認）。") +
        (opts.roadW > 0 ? "道路の幅 " + opts.roadW + "m なら、道路ぎわの建物の高さは およそ " + (opts.roadW * slope).toFixed(1) + "m が目安（建物を下げると、下げた分だけゆるくなります）。" : ""),
      applies: true });
    if (y.low) {
      var ah = absHeight(y);
      rows.push({ key: "abs", title: "絶対高さ", rule: ah ? "建物の高さは " + ah + "m まで" : "建物の高さは 10m または 12m まで（どちらかは都市計画で決まる。役所で確認）",
        detail: "第一種・第二種低層住居専用地域と田園住居地域だけにある制限です（建築基準法 第55条）。", applies: true, value: ah });
      rows.push({ key: "adj", title: "隣地斜線", rule: "かからない", detail: "絶対高さの制限があるため。", applies: false });
      rows.push({ key: "north", title: "北側斜線", rule: "5m ＋ 真北方向の距離 × 1.25",
        detail: "北どなりの土地（北が道路なら道路の反対側）の境界線からの距離で決まります。", applies: true });
    } else {
      rows.push({ key: "adj", title: "隣地斜線",
        rule: res ? "20m ＋ 隣地からの距離 × 1.25" : "31m ＋ 隣地からの距離 × 2.5",
        detail: res ? "高さ20mを超える部分だけにかかります。戸建てや低めのアパートではふつう効きません。" : "高さ31mを超える部分だけにかかります。",
        applies: true });
      if (y.mid) {
        rows.push({ key: "north", title: "北側斜線", rule: "10m ＋ 真北方向の距離 × 1.25（日影規制のある区域ではかからない）",
          detail: "中高層住居専用地域は、多くの場所で日影規制がかかるため、北側斜線は外れることが多いです。日影規制の有無を役所の図で確かめてください。",
          applies: "maybe" });
      } else {
        rows.push({ key: "north", title: "北側斜線", rule: "かからない", detail: "建築基準法の北側斜線は、低層・中高層住居専用地域と田園住居地域だけです。", applies: false });
      }
    }
    if (k && KOUDO[k.code] && KOUDO[k.code].base != null && k.src === "T") {
      rows.push({ key: "koudo", title: k.name + "（北側の斜線）", rule: koudoFormula(k.code),
        detail: "東京都の高度地区。北どなりの境界線（北が道路なら道路の反対側）からの真北方向の距離で決まります。北側斜線より厳しいことが多いです。" +
          " 例：距離4mで " + koudoHeight(k.code, 4).toFixed(1) + "m、距離8mで " + koudoHeight(k.code, 8).toFixed(1) + "m、距離12mで " + koudoHeight(k.code, 12).toFixed(1) + "m。",
        applies: true });
    }
    if (k && !k.typeKnown) {
      rows.push({ key: "koudo", title: "高度地区", rule: "かかる（種類と高さは役所で確認）",
        detail: "国のデータには、高度地区の「場所」だけがあり、種類（北側の斜線の式）や高さの上限は入っていません。市の都市計画図や窓口で確かめてください。高度地区の式は市ごとにちがいます。",
        applies: true });
    } else if (!k && opts.koudoState === "nodata") {
      rows.push({ key: "koudo", title: "高度地区", rule: "データなし（役所で確認）",
        detail: "この市町村は高度地区のデータを公開していません。高度地区があるかどうかを、市の都市計画図や窓口で確かめてください。",
        applies: "maybe" });
    }
    if (k && k.max > 0) {
      rows.push({ key: "kmax", title: "高度地区の最高限度（絶対高さ）", rule: "建物の高さは " + k.max + "m まで",
        detail: "区市町村が決めた高さの上限です。地区計画などで別の決まりがあれば、そちらが優先されることがあります。", applies: true, value: k.max });
    }
    if (k && k.min > 0) {
      rows.push({ key: "kmin", title: "高度地区の最低限度", rule: "建物の高さは " + k.min + "m 以上",
        detail: "幹線道路ぞいの燃えにくい街並みをつくるための決まりです（一部例外あり）。", applies: true });
    }
    // 日影規制（建築基準法 別表第4。何時間かは都道府県・市の条例で区域ごとに決まる）
    var n;
    if (y.low) n = "軒の高さ7m超、または地上3階建て以上の建物が対象。地面から1.5mの高さで測ります。";
    else if (y.code === 9 || y.code === 11 || y.code === 12) n = "この用途地域には、法律上の日影規制はありません（ただし、となりの地域の日影規制が及ぶことがあります）。";
    else n = "高さ10m超の建物が対象。地面から4m（または6.5m）の高さで測ります。";
    rows.push({ key: "nichiei", title: "日影規制", rule: "対象かどうか・何時間までかは役所の図で確認",
      detail: n + " 時間（例：4時間／2.5時間）は" + (tokyo ? "東京都" : "県（政令市などは市）") + "の条例で区域ごとに決まり、このデータには入っていません。", applies: "maybe" });
    return rows;
  }

  // 建ぺい率の上乗せ（目安。第53条第3項）
  function kenpeiBonus(y, bouka) {
    var out = [];
    if (!y) return out;
    if (bouka && bouka.code === 10) out.push("防火地域で耐火建築物などを建てると ＋10%（指定80%の地域では制限なし）");
    if (bouka && bouka.code === 20) out.push("準防火地域で耐火・準耐火建築物などを建てると ＋10%");
    out.push("役所が角地と認めた土地は ＋10%（市区町村の基準による）");
    return out;
  }

  // 建築・ボリュームのページに渡すURL（引数の名前は kenchiku.html の PARAM_DEFS と同じ）
  function kenchikuUrl(base, r, opts) {
    opts = opts || {};
    var q = [];
    function add(k, v) { if (v !== undefined && v !== null && v !== "") q.push(k + "=" + encodeURIComponent(v)); }
    if (r && r.youto) {
      add("youto", r.youto.name);
      if (r.youto.kenpei > 0) add("kenpei", r.youto.kenpei);
      if (r.youto.youseki > 0) add("youseki", r.youto.youseki);
      var ah = absHeight(r.youto);
      if (ah === 10 || ah === 12) add("zettai", ah);
    }
    if (r && r.koudo) {
      if (r.koudo.src === "T" && r.koudo.code >= 1 && r.koudo.code <= 3) add("koudo", r.koudo.code);
      if (r.koudo.max > 0) add("koudomax", r.koudo.max);
    } else if (r && r.youto && r.koudoState === "none") add("koudo", "なし");
    if (r && r.bouka && r.bouka.state !== "nodata") add("bouka", r.bouka.code === 10 ? "防火" : r.bouka.code === 20 ? "準防火" : "なし");
    if (opts.road > 0) add("road", opts.road);
    if (opts.area > 0) add("area", Math.round(opts.area * 100) / 100);
    return base + (q.length ? "?" + q.join("&") : "");
  }

  var API = { ZONES: ZONES, KOUDO: KOUDO, BOUKA: BOUKA, SENBIKI: SENBIKI, prepare: prepare, decodeRing: decodeRing,
    tileKey: tileKey, tileRect: tileRect, tilesForBounds: tilesForBounds, prepareTile: prepareTile, hasTile: hasTile,
    crossings: crossings, contains: contains, findAll: findAll, distToEdge: distToEdge, edgeLines: edgeLines, lookup: lookup,
    koudoHeight: koudoHeight, koudoFormula: koudoFormula, roadSlopeRange: roadSlopeRange, roadFar: roadFar, absHeight: absHeight,
    heightRules: heightRules, kenpeiBonus: kenpeiBonus, kenchikuUrl: kenchikuUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SURVEY = API;
})(this);
