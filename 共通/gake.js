/* がけ条例・盛土規制法・擁壁のやり直し費用（1都3県）の共通の部品。
   ブラウザでは window.Gake、node では require('../共通/gake.js')。
   数字の出どころは 共通/調べもの_がけと擁壁.md（確認日 2026-10-22）。
   すべて「目安」。最後の判断は役所（建築指導課・宅地の担当）・建築士・施工会社。 */
(function (root) {
  "use strict";
  var CHECKED = "2026-10-22";

  // ---------------------------------------------------------------
  // 1. がけ条例（条文ごと）
  //   hMin   : この高さを「超える」とがけ（m）
  //   angle  : この角度を「超える」とがけ（度）
  //   kUp    : がけの上に建てるとき、がけの高さの何倍の範囲か
  //   kDown  : がけの下に建てるとき、何倍の範囲か
  //   refUp  : がけの上に建てるときの測り始め（lower=がけの下端 / upper=がけの上端）
  //   refDown: がけの下に建てるときの測り始め
  //   effect : wall=範囲の中では「安全な擁壁を設ける」 / nobuild=範囲の中に「居室のある建物を建てない」
  //   only居室: 居室のある建物だけが対象
  //   cap    : これ以上離れていれば外れることがある距離（m）（横浜市第3条1項4号）
  //   relief : 離さなくてよい条件（条文・解説の言葉を短く言いかえ）。st: ok=条文にある / ask=解説・取扱いで認める例（役所で確認）
  // ---------------------------------------------------------------
  function R(o) { o.checked = CHECKED; return o; }
  var COMMON_RELIEF = {
    wall: { id: "wall", st: "ok", t: "検査済証のある安全な擁壁がある（または作り直す）" },
    slope: { id: "slope", st: "ok", t: "斜面の形・土の性質から安全（土質ごとの角度以下、安定計算で確かめた等）" },
    deep: { id: "deep", st: "ok", t: "がけの上：基礎をがけの下端から引いた30度の線より深くする（深基礎・杭・地盤改良）" },
    rc: { id: "rc", st: "ok", t: "がけの下：建物の主要な部分を鉄筋コンクリート造にする（がけ側に窓を設けない・土砂に耐える）" },
    ryudo: { id: "ryudo", st: "ok", t: "がけの下：建物とがけの間に、土砂を受け止める壁（流土止め・待受け擁壁）を設ける" }
  };
  function rel(list) { return list.map(function (x) { if (typeof x === "string") return COMMON_RELIEF[x]; return x; }); }

  var RULES = {
    tokyo: R({ name: "東京都建築安全条例 第6条・第6条の2", short: "東京都建築安全条例 第6条",
      hMin: 2, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false,
      def: "高さ2mを超えるがけ（がけ高は、がけの下端を通る1：2〔約26.6度〕の線より上の部分の高さ）。こう配30度以下のがけは、ただし書きで外れる",
      dist: "がけの下端から、がけ高の2倍以内（がけの上も下も、下端から水平に測る）",
      need: "範囲の中に建てる・敷地を造成するときは、高さ2mを超える擁壁を設ける",
      relief: rel(["wall", "slope",
        { id: "deep", st: "ask", t: "がけの上：がけ又は既設の擁壁に構造耐力上支障がない（深基礎などで確かめる。条文は「支障がないとき」）" },
        { id: "rc", st: "ok", t: "がけの下：主要構造部を鉄筋コンクリート造・鉄骨鉄筋コンクリート造にする" },
        { id: "far", st: "ok", t: "がけの下：建物の位置ががけから相当の距離にあり、崩れても安全" }]),
      extra: ["擁壁の基礎の底は、がけの下端を通る30度の線の内側の良い地盤に届かせる（第6条の2）", "擁壁には壁の面積3㎡以内ごとに水抜き穴・透水層、上の地面に水がしみこまない層（第6条4項）",
        "検査済証の無い擁壁は「既存の擁壁」として、原則がけと同じに扱う（新宿区の案内）"],
      src: [{ t: "東京都例規集 東京都建築安全条例", u: "https://www.reiki.metro.tokyo.lg.jp/reiki/reiki_honbun/g101RG00001306.html" },
        { t: "新宿区 がけ条例の案内（検査済証の無い擁壁）", u: "https://www.city.shinjuku.lg.jp/content/000393492.pdf" }] }),
    kanagawa: R({ name: "神奈川県建築基準条例 第3条（2026年4月1日からの条文）", short: "神奈川県建築基準条例 第3条",
      hMin: 2, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false, redOut: true,
      def: "こう配30度を超え、高さ2mを超える崖（2026年3月までは3m超）",
      dist: "崖の下端から、崖の高さの2倍以内（崖の上も下も、下端から水平に測る）",
      need: "範囲の中に建てる・敷地を造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "崖の上の盛土で、高さ1m以下・30度以下・芝などで覆ったもの" }, "deep",
        { id: "rc", st: "ok", t: "崖の下：主要構造部を鉄筋コンクリート造にする" }, "ryudo"]),
      extra: ["土砂災害特別警戒区域の中で居室のある建物を建てるときは、この条文ではなく建築基準法施行令80条の3の構造の決まり", "崖の上の敷地は、崖の上部に沿って排水溝などを設ける"],
      src: [{ t: "神奈川県 条例第3条の解説（令和8年3月31日）", u: "https://www.pref.kanagawa.jp/documents/24951/jourei3jou_kaisetsu.pdf" },
        { t: "神奈川県 新旧対照表（令和7年12月23日公布）", u: "https://www.pref.kanagawa.jp/documents/127425/jyoureishinnkyuu.pdf" }] }),
    yokohama: R({ name: "横浜市建築基準条例 第3条", short: "横浜市建築基準条例 第3条",
      hMin: 3, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false, cap: 20,
      def: "高さ3mを超え、主な部分のこう配が30度を超える崖",
      dist: "崖の下端から、崖の高さの2倍以内（上も下も、下端から水平に測る）",
      need: "範囲の中に建てる・造成するときは、擁壁または防土堤（高さ2m以上のコンクリート造）を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "盛土の部分が高さ1m以下・45度以下で芝などで覆ったもの" }, "deep",
        { id: "rc", st: "ok", t: "崖の下：被害を受けるおそれのある部分の主要構造部を鉄筋コンクリート造にする（基礎の立ち上げは原則3mまで・開口部は原則つくれない）" },
        { id: "ryudo", st: "ok", t: "崖の下：防土堤（高さ2m以上のコンクリート造）を設ける" },
        { id: "far20", st: "ok", t: "崖の下端から水平に20m以上離れていて、被害のおそれがない" },
        { id: "nokyo", st: "ok", t: "崖の下の建物で、居室が無い（物置・車庫など）" }]),
      extra: ["高さ3mを超える崖の上の敷地は、雨水・汚水が崖にしみこまないよう排水施設を設ける", "大谷石・ガンタ石・玉石の擁壁は今の基準に合わない、増し積みは認められない（横浜市 崖地Q&A）"],
      src: [{ t: "横浜市建築基準条例及び同解説（令和8年5月版）", u: "https://www.city.yokohama.lg.jp/business/bunyabetsu/kenchiku/tetsuduki/jorei/kijunjourei/kijunjourei.files/20260501_joreiall.pdf" },
        { t: "横浜市 崖地に関するQ&A", u: "https://www.city.yokohama.lg.jp/business/bunyabetsu/kenchiku/bosai/gake/qa.html" }] }),
    kawasaki: R({ name: "川崎市建築基準条例 第5条", short: "川崎市建築基準条例 第5条",
      hMin: 3, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false, redOut: true,
      def: "こう配30度を超え、高さ3mを超えるがけ（擁壁も「人工がけ」）",
      dist: "がけの下端から、がけの高さの2倍以内（上も下も、下端から）",
      need: "範囲の中に建てる・造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "上部の盛土で、高さ1m以下・30度以下・芝など" }, "deep",
        { id: "rc", st: "ok", t: "がけの下：構造耐力上主要な部分を鉄筋コンクリート造にする" },
        { id: "ryudo", st: "ok", t: "がけの下：鉄筋コンクリート造の流土止めを設ける" }]),
      extra: ["高さ3mを超えるがけの上の敷地は排水溝など", "安全性が確認できない既存擁壁は、擁壁を含めて検討（条例の解説）"],
      src: [{ t: "川崎市建築基準条例及び同解説（令和8年7月版）", u: "https://www.city.kawasaki.jp/500/cmsfiles/contents/0000035/35933/kijyunjyoureioyobidoukaisetu_R8.7.pdf" }] }),
    sagamihara: R({ name: "相模原市建築基準条例 第5条", short: "相模原市建築基準条例 第5条",
      hMin: 3, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false, redOut: true,
      def: "こう配30度を超え、高さ3mを超える崖（土留めがあっても30度を超えれば崖）",
      dist: "崖の下端から、崖の高さの2倍以内（上も下も、下端から）",
      need: "範囲の中に建てる・造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "上部の盛土で、高さ1m以下・45度以下・芝など" }, "deep", "rc", "ryudo"]),
      extra: ["高さ3mを超える崖の上は排水溝など", "例規集の最新の条文とは見比べていない（解説 令和7年4月版で確認）"],
      src: [{ t: "相模原市建築基準条例の解説（令和7年4月25日改定）", u: "https://www.city.sagamihara.kanagawa.jp/_res/projects/default_project/_page_/001/004/781/kaisetu_20250425.pdf" }] }),
    yokosuka: R({ name: "横須賀市建築基準条例 第5条", short: "横須賀市建築基準条例 第5条",
      hMin: 3, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "upper", effect: "wall", only居室: false,
      def: "こう配30度を超え、高さ3mを超える崖",
      dist: "崖の下端（崖の下に建てるときは崖の上端）から、崖の高さの2倍以内",
      need: "範囲の中に建てる・造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "deep", st: "ok", t: "崖の上：基礎が崖または既設の擁壁に影響しない" }, "rc", "ryudo",
        { id: "red", st: "ok", t: "崖の下：建築基準法施行令80条の3（土砂災害特別警戒区域の構造）に合う建物" }]),
      extra: ["崖の上の敷地は排水設備など"],
      src: [{ t: "横須賀市例規集 建築基準条例", u: "https://www.city.yokosuka.kanagawa.jp/reiki/reiki_honbun/g204RG00000421.html" },
        { t: "横須賀市 条例の解説（令和8年3月10日改訂）", u: "https://www.city.yokosuka.kanagawa.jp/4840/toriatukai/documents/jyourei_no_kaisetu.pdf" }] }),
    fujisawa: R({ name: "藤沢市建築基準等に関する条例 第5条", short: "藤沢市建築基準等条例 第5条",
      hMin: 2, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "upper", effect: "wall", only居室: false,
      def: "こう配30度を超え、高さ2mを超える崖（土留めがあっても安全が確かめられなければ対象）",
      dist: "崖の上は崖の下端から、崖の下は崖の上端から、崖の高さの2倍の範囲",
      need: "範囲の中に建てる・造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "上部の盛土で、高さ1m以下・45度以下、モルタルなどで覆ったもの" }, "deep", "rc", "ryudo",
        { id: "nokyo", st: "ok", t: "崖の下の建物で、居室が無い" }]),
      extra: ["2019年4月1日から市の条例（それまでは県の条例）", "既存の擁壁の安全性は設計者が確認（市のQ&A）"],
      src: [{ t: "藤沢市 条例の解説 第3章", u: "https://www.city.fujisawa.kanagawa.jp/documents/20898/03dai3syou.pdf" }] }),
    kamakura: R({ name: "鎌倉市建築基準条例 第5条", short: "鎌倉市建築基準条例 第5条",
      hMin: 2, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false, redOut: true,
      def: "こう配30度を超え、高さ2mを超える崖",
      dist: "崖の下端から、崖の高さの2倍以内",
      need: "範囲の中に建てる・造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "上部の盛土で、高さ2.5m以下・45度以下・芝など" }, "deep", "rc", "ryudo"]),
      extra: ["高さ2mを超える崖の上は排水溝など"],
      src: [{ t: "鎌倉市建築基準条例（令和7年3月11日まで反映）", u: "https://www.city.kamakura.kanagawa.jp/kenchikushidou/documents/kamakura_kenchikukijun_jourei_20250311.pdf" }] })
  };
  // 神奈川で「がけの下は上端から」型の市（数字は横須賀と同じ形）
  [["atsugi", "厚木市建築基準条例 第5条", "https://www.city.atsugi.kanagawa.jp/material/files/group/50/kenjokaiR7_12.pdf", "厚木市 条例の解説（令和7年12月版）", "1m以下・45度以下"],
    ["hiratsuka", "平塚市建築基準条例 第5条", "https://www.city.hiratsuka.kanagawa.jp/common/200055152.pdf", "平塚市建築基準条例（令和7年4月1日改正）", "2.5m以下・45度以下"],
    ["odawara", "小田原市建築基準条例 第5条", "https://www.city.odawara.kanagawa.jp/global-image/units/92127/1-20250128085530_b67981cf2c4f92.pdf", "小田原市 条例等及び同解説（令和6年12月）", "2.5m以下・45度以下"],
    ["hadano", "秦野市建築基準条例 第5条", "https://www.city.hadano.kanagawa.jp/material/files/group/58/kaisetu.pdf", "秦野市 条例の解説（令和5年4月版。令和7年4月の条文は文字が読めず要確認）", "2.5m以下・45度以下"],
    ["chigasaki", "茅ヶ崎市建築基準条例 第3条", "https://www.city.chigasaki.kanagawa.jp/_res/projects/default_project/_page_/001/008/168/kenchiku_kijyun_jourei_r4-26.pdf", "茅ヶ崎市建築基準条例（令和4年9月まで反映。その後の改正は要確認）", "2.5m以下・45度以下"],
    ["yamato", "大和市建築基準条例 第3条", "https://www.city.yamato.lg.jp/material/files/group/10/H12-11-kaisetsu.pdf", "大和市 逐条解説（令和6年4月）", "2.5m以下・45度以下"]
  ].forEach(function (a) {
    RULES[a[0]] = R({ name: a[1], short: a[1], hMin: 3, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "upper", effect: "wall", only居室: false,
      def: "こう配30度を超え、高さ3mを超えるがけ", dist: "がけの下端（がけの下に建てるときはがけの上端）から、がけの高さの2倍以内",
      need: "範囲の中に建てる・造成するときは、安全な擁壁を設ける",
      relief: rel(["wall", "slope", { id: "mori", st: "ok", t: "上部の盛土で、高さ" + a[4] + "・芝など" }, "deep", "rc", "ryudo"]),
      extra: a[0] === "hiratsuka" ? ["条例とは別に、市の指導方針（高さ2mを超えるがけ）がある"] : [],
      src: [{ t: a[3], u: a[2] }] });
  });
  RULES.saitama = R({ name: "埼玉県建築基準法施行条例 第6条", short: "埼玉県建築基準法施行条例 第6条",
    hMin: 2, angle: 30, kUp: 2, kDown: 2, refUp: "lower", refDown: "lower", effect: "wall", only居室: false,
    def: "がけ高2mを超えるがけ（がけ高は、がけの下端を通る1：2〔約26.6度〕の線より上の部分の高さ）。こう配30度以下は、ただし書きで外れる",
    dist: "がけの下端から、がけ高の2倍以内（上も下も、下端から水平に測る）",
    need: "範囲の中に建てる・敷地を造成するときは、高さ2mを超える擁壁を設ける",
    relief: rel(["wall", { id: "slope", st: "ok", t: "こう配30度以下、かたい地盤を切った斜面など、安全上支障がないと認められる" },
      { id: "deep", st: "ok", t: "がけの上：がけ又は既設の擁壁が構造耐力上支障がない（さいたま市の取扱いでは、30度の線より深い基礎・杭も当たる）" },
      { id: "rc", st: "ok", t: "がけの下：主要構造部が鉄筋コンクリート造・鉄骨鉄筋コンクリート造で、崩れても安全と認められる" },
      { id: "ryudo", st: "ask", t: "がけの下：防護壁・基礎の立ち上げ（さいたま市の取扱いの例。ほかの市は要確認）" }]),
    extra: ["確認申請に、がけの下端から建物までの距離・がけの形・擁壁の作りを書いた図面を付ける（県の施行細則 第5条の3）",
      "さいたま市・川口市など県内の市も、この県の条例を使う（市の独自のがけの条例は見つからなかった）"],
    src: [{ t: "埼玉県建築基準法施行条例と解説（2025年9月25日版）", u: "https://www.pref.saitama.lg.jp/documents/183175/saitamakenjyourei_ver20250925.pdf" },
      { t: "さいたま市建築基準法取扱集（令和8年3月）", u: "https://www.city.saitama.lg.jp/005/003/014/002/p002794_d/fil/saitamasi-toriatukai.pdf" }] });
  RULES.chiba = R({ name: "千葉県建築基準法施行条例 第4条", short: "千葉県建築基準法施行条例 第4条",
    hMin: 2, angle: 30, kUp: 1.5, kDown: 2, refUp: "lower", refDown: "upper", effect: "nobuild", only居室: true, hardRockOut: true,
    def: "地表が30度を超える角度の、かたい岩盤（風化の著しいものを除く）以外の土地で、高さ2mを超えるもの",
    dist: "がけの上はがけの下端から高さの1.5倍、がけの下はがけの上端から高さの2倍",
    need: "範囲の中に、居室のある建物を建ててはいけない",
    relief: rel([{ id: "rc", st: "ok", t: "がけの下：外壁と構造上主要な部分を鉄筋コンクリート造などにし、必要なら開口部から土砂が入らない壁を設ける" },
      { id: "ryudo", st: "ok", t: "がけの下：がけと建物の間に、安全な塀など（待受け擁壁）がある" },
      { id: "far", st: "ok", t: "建物ががけから相当の距離にあり安全（解説の例：がけの下で下端から50mを超える）" },
      { id: "deep", st: "ok", t: "がけの上：深基礎・杭・地盤改良で、基礎をがけの下端から引いた30度の線より深くする（解説の例）" },
      { id: "wall", st: "ok", t: "構造耐力上安全な擁壁がある（検査済証があり、ひび・傾きなどの状態も確かめたもの）" },
      { id: "slope", st: "ok", t: "がけの形・土の性質から崩れるおそれがない" }]),
    extra: ["高さ5mを超える擁壁は鉄筋コンクリート造、擁壁の上に排水施設（第4条2項）", "千葉市・船橋市・市川市・松戸市なども、この県の条例第4条を使う（柏市は市のサイトが止まっていて要確認）"],
    src: [{ t: "千葉県建築基準法施行条例", u: "https://www.pref.chiba.lg.jp/kenchiku/iken/r05/documents/sekoujourei.pdf" },
      { t: "千葉県 条例とその解説2025年版 第2章", u: "https://www.pref.chiba.lg.jp/kenchiku/zyourei-kaisetu/documents/jyourei20253-2-5.pdf" },
      { t: "千葉市 がけ条例について（令和6年3月）", u: "https://www.city.chiba.jp/toshi/kenchiku/johosoudan/documents/gake.pdf" }] });

  // ---------------------------------------------------------------
  // 2. 地域（市区町村）→ 使う条文・盛土規制法の区域を見るページ
  // ---------------------------------------------------------------
  var MORIDO_MAP = {
    tokyo: { by: "東京都", u: "https://www.toshiseibi.metro.tokyo.lg.jp/kenchiku_kaihatsu/jyutaku/takuzou", map: "https://www2.wagmap.jp/tokyo_tokeizu/Portal", when: "2024年7月31日", zone: "宅地造成等工事規制区域（島しょを含むほぼ全域）と特定盛土等規制区域" },
    hachioji: { by: "八王子市", u: "https://www.city.hachioji.tokyo.jp/jigyosha/005/10103/p032291.html", when: "2024年7月31日", zone: "市の全域が宅地造成等工事規制区域" },
    kanagawa: { by: "神奈川県", u: "https://www.pref.kanagawa.jp/docs/jy2/morido/moridounyou.html", map: "https://www.pref.kanagawa.jp/documents/113935/morido_kuiki.pdf", when: "2025年4月1日", zone: "宅地造成等工事規制区域と特定盛土等規制区域（特定盛土等規制区域の許可の大きさも宅造と同じに下げている）" },
    yokohama: { by: "横浜市", u: "https://www.city.yokohama.lg.jp/business/bunyabetsu/kenchiku/takuchi/morido/moridokuiki.html", when: "2025年4月1日", zone: "市の全域が宅地造成等工事規制区域" },
    kawasaki: { by: "川崎市", u: "https://www.city.kawasaki.jp/500/page/0000151005.html", when: "2025年4月1日", zone: "市の全域が宅地造成等工事規制区域" },
    sagamihara: { by: "相模原市", u: "https://www.city.sagamihara.kanagawa.jp/shisei/1026823/machitsukuri/kaihatsu/1029495.html", when: "2025年4月1日", zone: "宅地造成等工事規制区域と特定盛土等規制区域" },
    yokosuka: { by: "横須賀市", u: "https://www.city.yokosuka.kanagawa.jp/4830/kaihatu/morido.html", when: "2025年4月1日", zone: "市の全域が宅地造成等工事規制区域" },
    saitama: { by: "埼玉県", u: "https://www.pref.saitama.lg.jp/a1102/morido/kisotyousa_kiseikuiki.html", map: "https://experience.arcgis.com/experience/b7ebb4272bb34921a76e26d10d127eb5", when: "2025年7月1日", zone: "宅地造成等工事規制区域と特定盛土等規制区域（特定盛土等規制区域の許可の大きさも宅造と同じに下げている）" },
    saitama_city: { by: "さいたま市", u: "https://www.city.saitama.lg.jp/005/003/021/007/p121416.html", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域" },
    kawagoe: { by: "川越市", u: "https://www.city.kawagoe.saitama.jp/shisei/toshikei/1010554/1010806/1017378/index.html", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域" },
    kawaguchi: { by: "川口市", u: "https://www.city.kawaguchi.lg.jp/soshiki/01130/050/moridokiseihou/45316.html", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域" },
    koshigaya: { by: "越谷市", u: "https://www.city.koshigaya.saitama.jp/kurashi_shisei/kurashi/sumai/machidukuri/moridokiseihou.html", map: "https://www2.wagmap.jp/koshigayacity/Portal", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域" },
    chiba: { by: "千葉県", u: "https://www.pref.chiba.lg.jp/tokei/kaihatsukoui/moridokisei.html", when: "2025年5月26日", zone: "県の全域が宅地造成等工事規制区域" },
    chiba_city: { by: "千葉市", u: "https://www.city.chiba.jp/toshi/kenchiku/takuchi/moridokiseihou_taiou.html", map: "https://webgis.alandis.jp/chiba12/portal/index.html", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域" },
    funabashi: { by: "船橋市", u: "https://www.city.funabashi.lg.jp/jigyou/kenchiku_kaihatsu/002/115990.html", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域" },
    kashiwa: { by: "柏市", u: "https://www.city.kashiwa.lg.jp/takuchi/shiseijoho/keikaku/shigoto/kaihatsu/tochi/morido.html", when: "2025年5月26日", zone: "市の全域が宅地造成等工事規制区域（国交省の一覧。市のページは調べた日に開けず要確認）" }
  };
  var DOSHA_MAP = {
    tokyo: { t: "東京都 土砂災害警戒区域等マップ", u: "https://www2.sabomap.jp/tokyo/" },
    kanagawa: { t: "神奈川県 土砂災害情報ポータル", u: "https://dosyasaigai.pref.kanagawa.jp/website/kanagawa/gis/index.html" },
    saitama: { t: "埼玉県 土砂災害警戒区域等の指定", u: "https://www.pref.saitama.lg.jp/a1007/dosyasitei.html" },
    chiba: { t: "ちば情報マップ（防災情報）", u: "https://map.pref.chiba.lg.jp/pref-chiba/Portal" },
    nation: { t: "国土地理院 重ねるハザードマップ", u: "https://disaportal.gsi.go.jp/hazardmap/maps/index.html" }
  };
  // id, 都県, 表示名, がけの条文, 盛土規制法の区域のページ, 市区町村名の目印
  var REGIONS = [
    ["tokyo", "tokyo", "東京都（23区・市町村）", "tokyo", "tokyo", null],
    ["hachioji", "tokyo", "東京都 八王子市", "tokyo", "hachioji", /八王子市/],
    ["kanagawa", "kanagawa", "神奈川県（下の市のほか：逗子・三浦・海老名・座間・伊勢原・綾瀬・南足柄・町村）", "kanagawa", "kanagawa", null],
    ["yokohama", "kanagawa", "横浜市", "yokohama", "yokohama", /横浜市/],
    ["kawasaki", "kanagawa", "川崎市", "kawasaki", "kawasaki", /川崎市/],
    ["sagamihara", "kanagawa", "相模原市", "sagamihara", "sagamihara", /相模原市/],
    ["yokosuka", "kanagawa", "横須賀市", "yokosuka", "yokosuka", /横須賀市/],
    ["fujisawa", "kanagawa", "藤沢市", "fujisawa", "kanagawa", /藤沢市/],
    ["kamakura", "kanagawa", "鎌倉市", "kamakura", "kanagawa", /鎌倉市/],
    ["atsugi", "kanagawa", "厚木市", "atsugi", "kanagawa", /厚木市/],
    ["hiratsuka", "kanagawa", "平塚市", "hiratsuka", "kanagawa", /平塚市/],
    ["odawara", "kanagawa", "小田原市", "odawara", "kanagawa", /小田原市/],
    ["hadano", "kanagawa", "秦野市", "hadano", "kanagawa", /秦野市/],
    ["chigasaki", "kanagawa", "茅ヶ崎市", "chigasaki", "kanagawa", /茅[ヶケが]崎市/],
    ["yamato", "kanagawa", "大和市", "yamato", "kanagawa", /大和市/],
    ["saitama", "saitama", "埼玉県（下の市のほか）", "saitama", "saitama", null],
    ["saitama_city", "saitama", "さいたま市", "saitama", "saitama_city", /さいたま市/],
    ["kawagoe", "saitama", "川越市", "saitama", "kawagoe", /川越市/],
    ["kawaguchi", "saitama", "川口市", "saitama", "kawaguchi", /川口市/],
    ["koshigaya", "saitama", "越谷市", "saitama", "koshigaya", /越谷市/],
    ["chiba", "chiba", "千葉県（下の市のほか）", "chiba", "chiba", null],
    ["chiba_city", "chiba", "千葉市", "chiba", "chiba_city", /千葉市/],
    ["funabashi", "chiba", "船橋市", "chiba", "funabashi", /船橋市/],
    ["kashiwa", "chiba", "柏市", "chiba", "kashiwa", /柏市/]
  ].map(function (a) { return { id: a[0], pref: a[1], name: a[2], rule: a[3], morido: a[4], re: a[5] }; });
  var PREF_NAME = { tokyo: "東京都", kanagawa: "神奈川県", saitama: "埼玉県", chiba: "千葉県" };
  function region(id) { for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i]; return null; }
  // 都県名（"東京都" か "tokyo"）と市区町村名から地域を選ぶ。1都3県の外は null
  function regionFor(pref, city) {
    var p = pref && PREF_NAME[pref] ? pref : null;
    if (!p) for (var k in PREF_NAME) if (pref && String(pref).indexOf(PREF_NAME[k]) >= 0) p = k;
    var c = String(city || "");
    for (var i = 0; i < REGIONS.length; i++) { var r = REGIONS[i]; if (r.re && r.re.test(c) && (!p || r.pref === p)) return r; }
    if (!p) return null;
    return region(p);
  }
  function ruleOf(regionId) { var r = region(regionId) || region("tokyo"); return RULES[r.rule]; }

  // ---------------------------------------------------------------
  // 3. 判定
  // 入力 q：{ region, H（がけの高さ m）, angle（度。擁壁なら90）, pos: 'above'（敷地ががけの上）| 'below',
  //   dist（がけの近い方の端〔上なら上端・下なら下端〕から建物までの水平距離 m。分からなければ null）,
  //   wall: 'none'（擁壁なし・自然の斜面）| 'ok'（検査済証あり・状態よし）| 'nocert'（検査済証なし）| 'unknown' | 'bad'（不適格の形・傷みあり）,
  //   measures: { rc, ryudo, deep, calc, rebuild }（選んだ対策）, kyoshitsu（居室のある建物か。既定 true）,
  //   dosha: 'none' | 'yellow' | 'red' | 'unknown', hardRock（かたい岩盤）}
  // 出力：がけに当たるか・必要な距離・足りない距離・使えない帯の幅・緩和の一覧・要確認の点
  // 帯の幅は、がけの近い方の端＝敷地の境界と考えたときの、境界からの幅
  // ---------------------------------------------------------------
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function judge(q) {
    q = q || {};
    var reg = region(q.region) || region("tokyo"), rule = RULES[reg.rule];
    var H = Math.max(0, num(q.H, 0)), ang = num(q.angle, 90), pos = q.pos === "below" ? "below" : "above";
    var wall = q.wall || "none", m = q.measures || {}, kyo = q.kyoshitsu !== false;
    var out = { region: reg.id, regionName: reg.name, rule: rule, ruleName: rule.short, pos: pos, H: H, angle: ang,
      isCliff: false, applies: false, k: 0, ref: "", range: 0, slopeW: 0, need: 0, dist: q.dist == null || q.dist === "" ? null : Math.max(0, num(q.dist, 0)),
      short: 0, band: 0, relieved: false, reliefBy: [], reliefs: [], checks: [], why: [], wallAsNone: false };
    // がけか
    if (!(H > rule.hMin)) { out.why.push("高さ " + r2(H) + "m は、この条文のがけ（" + rule.hMin + "mを超える）に当たらない"); }
    else if (!(ang > rule.angle)) { out.why.push("角度 " + ang + "度 は30度以下なので、がけに当たらない（または、ただし書きで外れる）"); }
    else if (rule.hardRockOut && q.hardRock) { out.why.push("かたい岩盤（風化していない）はがけから除かれる（" + rule.short + "）"); }
    else out.isCliff = true;
    if (H > 0 && H <= rule.hMin && H > 2 && reg.pref === "kanagawa") out.checks.push("神奈川の市には2m超をがけとする所（県の条例・鎌倉市・藤沢市）と3m超の所がある。市の決まりを確かめる");
    if (!out.isCliff) { out.checks.push("高さ・角度は測り方で変わる（がけの下端を通る線・30度の線からの高さ）。測量図で確かめる"); return out; }
    out.k = pos === "above" ? rule.kUp : rule.kDown;
    out.ref = pos === "above" ? rule.refUp : rule.refDown;
    out.range = r2(out.k * H);
    // がけの斜面の横の幅（擁壁ならほぼ0）
    var w = ang >= 89.99 ? 0 : H / Math.tan(ang * Math.PI / 180);
    out.slopeW = r2(w);
    // 近い方の端（上に建てるなら上端、下に建てるなら下端）から測りなおす
    var nearIsRef = (pos === "above" && out.ref === "upper") || (pos === "below" && out.ref === "lower");
    out.need = r2(Math.max(0, out.range - (nearIsRef ? 0 : w)));
    // 居室だけが対象の条文
    if (rule.only居室 && !kyo) { out.why.push("この条文は居室のある建物だけが対象。居室の無い建物（物置・車庫など）はかからない"); out.checks.push("あとで居室に変えると条文にかかる"); return out; }
    out.applies = true;
    // 特別警戒区域（神奈川県・川崎市・相模原市・鎌倉市の条文は、レッドゾーンの居室のある建物を外し、令80条の3の構造の決まりにまかせる）
    if (q.dosha === "red") {
      out.checks.push("土砂災害特別警戒区域：居室のある建物は、建築基準法施行令80条の3（がけ側の壁を鉄筋コンクリート造にするなど）の構造にする。宅地の分譲などは知事の許可");
      if (rule.redOut && kyo) out.checks.push(rule.short + " は、特別警戒区域の中の居室のある建物には使わない（施行令80条の3の構造の決まりにまかせる）");
    } else if (q.dosha === "yellow") out.checks.push("土砂災害警戒区域（イエローゾーン）：建物の構造の決まりは無いが、重要事項説明で説明が要る");
    else if (q.dosha !== "none") out.checks.push("土砂災害警戒区域・特別警戒区域に入っていないか、都県の地図で確かめる");
    // 擁壁の状態
    var wallOk = wall === "ok";
    if (wall === "nocert" || wall === "unknown" || wall === "bad") {
      out.wallAsNone = true;
      out.checks.push(wall === "bad" ? "空石積み・増し積み・二段擁壁・大谷石・はらみ・ひびなどがある擁壁は、安全と認められず「擁壁が無い」のと同じあつかいになる"
        : "検査済証が無い（分からない）擁壁は、安全と認められず「擁壁が無い」のと同じあつかいになることが多い。建築士の調査（強度・構造計算）で使えると示せることもある");
    }
    if (wallOk) out.checks.push("検査済証があっても、ひび・はらみ・水抜き穴・上に載る重さを確かめる（傷みがあれば使えない）");
    // 緩和の一覧（選んだ対策を当てる）
    var chosen = { wall: wallOk || !!m.rebuild, rc: !!m.rc && pos === "below", ryudo: !!m.ryudo && pos === "below", deep: !!m.deep && pos === "above", slope: !!m.calc,
      nokyo: !kyo && pos === "below", far20: false, far: false };
    if (rule.cap && pos === "below" && out.dist != null && out.dist >= rule.cap) chosen.far20 = true;
    rule.relief.forEach(function (x) {
      var applicable = !((x.id === "rc" || x.id === "ryudo" || x.id === "nokyo" || x.id === "red" || x.id === "far20" || x.id === "far") && pos === "above") && !(x.id === "deep" && pos === "below") && !(x.id === "mori" && pos === "below");
      var on = applicable && !!chosen[x.id];
      out.reliefs.push({ id: x.id, t: x.t, st: x.st, applicable: applicable, on: on });
      if (on) out.reliefBy.push(x);
    });
    var MNAME = { rc: "鉄筋コンクリート造にする", ryudo: "土砂を受ける壁（流土止め）", deep: "基礎を深くする" };
    ["rc", "ryudo", "deep"].forEach(function (k) {
      if (!m[k]) return;
      var x = null; out.reliefs.forEach(function (y) { if (y.id === k) x = y; });
      if (!x) out.checks.push("選んだ対策「" + MNAME[k] + "」は、" + rule.short + " の緩和の条件に書かれていない（役所で確かめる）");
      else if (!x.applicable) out.checks.push("選んだ対策「" + MNAME[k] + "」は、" + (pos === "above" ? "がけの上" : "がけの下") + "に建てるときには使えない");
    });
    if (out.reliefBy.length) {
      out.relieved = true;
      out.reliefBy.forEach(function (x) { if (x.st === "ask") out.checks.push("「" + x.t + "」は条文ではなく解説・取扱いの例。役所・確認検査機関で確かめる"); });
      if (m.rebuild) out.checks.push("擁壁を作り直すと、離す帯は無くなる（高さ2mを超える擁壁は工作物の確認申請、または盛土規制法の許可）");
      if (chosen.rc) out.checks.push("鉄筋コンクリート造でがけ側に窓を設けないなど、建物の作りと費用が変わる");
      if (chosen.deep) out.checks.push("深基礎・杭の費用がかかる（建物の大きさ・地盤しだい）");
    }
    // 帯と足りない距離
    out.band = out.relieved ? 0 : out.need;
    if (!out.relieved && out.dist != null) out.short = r2(Math.max(0, out.need - out.dist));
    if (out.ref === "lower" && pos === "above" && w > 0) out.checks.push("がけの上に建てるときも、がけの下端から測る条文なので、斜面の横の幅 " + r2(w) + "m を引いた");
    if (out.ref === "upper" && pos === "below" && w > 0) out.checks.push("がけの下に建てるときはがけの上端から測る条文なので、斜面の横の幅 " + r2(w) + "m を引いた");
    if (rule.cap && pos === "below") out.checks.push("横浜市は、崖の下端から20m以上離れていて被害のおそれがなければ外れる（第3条1項4号）");
    out.checks.push("がけの高さ・下端と上端の位置は測量図で確かめる。最後の判断は役所（建築指導課）・確認検査機関");
    return out;
  }

  // ---------------------------------------------------------------
  // 4. 盛土規制法（宅地造成及び特定盛土等規制法・2023年5月26日施行）
  //   q：{ region, zone: 'takuzo'|'tokutei'|'none'|'unknown', kind: 'fill'|'cut'|'both', cliffH（できる崖の高さ）, fillH（崖ができない盛土の高さ）, area（㎡）}
  // ---------------------------------------------------------------
  var MORIDO = {
    takuzo: { name: "宅地造成等工事規制区域", fill: 1, cut: 2, both: 2, fillH: 2, area: 500 },     // 施行令3条
    tokutei: { name: "特定盛土等規制区域", fill: 2, cut: 5, both: 5, fillH: 5, area: 3000 }      // 施行令28条（許可）
  };
  function morido(q) {
    q = q || {};
    var reg = region(q.region) || region("tokyo"), zone = q.zone || "unknown";
    var out = { zone: zone, permit: false, notice: false, why: [], checks: [], page: MORIDO_MAP[reg.morido] || null };
    if (zone === "none") { out.why.push("規制区域の外（区域の地図で確かめた場合）"); return out; }
    var useZ = zone === "tokutei" && (reg.pref === "saitama" || reg.pref === "kanagawa") && reg.morido !== "sagamihara" ? "takuzo" : zone === "tokutei" ? "tokutei" : "takuzo";
    if (zone === "tokutei" && useZ === "takuzo") out.checks.push(PREF_NAME[reg.pref] + "は、特定盛土等規制区域の許可の大きさを宅地造成等工事規制区域と同じに下げている");
    if (zone === "unknown") out.checks.push("区域が分からないので、きびしい方（宅地造成等工事規制区域）で見た。1都3県はほぼ全域がこの区域");
    var t = MORIDO[useZ], kind = q.kind || "fill", cH = num(q.cliffH, 0), fH = num(q.fillH, 0), A = num(q.area, 0);
    var lim = kind === "cut" ? t.cut : kind === "both" ? t.both : t.fill;
    var label = kind === "cut" ? "切土" : kind === "both" ? "盛土と切土" : "盛土";
    if (cH > lim) out.why.push(label + "で高さ" + lim + "mを超える崖ができる（" + r2(cH) + "m）");
    if (kind !== "cut" && fH > t.fillH) out.why.push("崖ができない盛土でも高さ" + t.fillH + "mを超える（" + r2(fH) + "m）");
    if (A > t.area) out.why.push("盛土・切土の面積が" + t.area.toLocaleString() + "㎡を超える（" + A + "㎡）");
    out.permit = out.why.length > 0;
    if (out.permit) out.checks.push(t.name + "：工事の前に許可が要る（" + (useZ === "takuzo" ? "施行令第3条" : "施行令第28条") + "）。許可を受けた擁壁は、建築基準法の工作物の確認申請が要らない");
    else if (useZ === "tokutei" && (cH > MORIDO.takuzo[kind === "cut" ? "cut" : kind === "both" ? "both" : "fill"] || fH > MORIDO.takuzo.fillH || A > MORIDO.takuzo.area)) {
      out.notice = true; out.checks.push("特定盛土等規制区域：許可までは要らないが、工事の前に届出が要る大きさ");
    }
    out.checks.push("盛土で1m・切土で2mを超える崖面は、原則として擁壁で覆う（技術基準 施行令第8条）。水抜き穴は壁の面積3㎡以内ごとに内径7.5cm以上（施行令第12条）");
    out.checks.push("高さ2mを超える擁壁を取り壊す工事は、区域の中では届出が要る（施行令第26条。要確認）");
    return out;
  }

  // ---------------------------------------------------------------
  // 5. 擁壁の見分け（不適格になりやすいもの）
  // ---------------------------------------------------------------
  var WALL_SIGNS = [
    { id: "nocert", lv: "alert", t: "検査済証が無い・見つからない", why: "安全と認められず、がけ条例では「擁壁が無い」のと同じあつかいになることが多い（新宿区・目黒区・町田市の案内）" },
    { id: "karaishi", lv: "alert", t: "空石積み（石を積んだだけ・ガンタ積み・玉石積み）", why: "宅地の擁壁として適さない（国交省 我が家の擁壁チェックシート）" },
    { id: "mashi", lv: "alert", t: "増し積み（擁壁の上にブロックなどを積み足した）", why: "宅地の擁壁として適さない。横浜市は「法令上認められていない」" },
    { id: "nidan", lv: "alert", t: "二段擁壁（擁壁の上にもう1段の擁壁）", why: "宅地の擁壁として適さない（国交省）" },
    { id: "hari", lv: "alert", t: "張出し床版つき（擁壁の上に床を張り出している）", why: "宅地の擁壁として適さない（国交省）" },
    { id: "oya", lv: "alert", t: "大谷石積み", why: "横浜市・町田市は、今の基準に合わない・安全性を確認できない例に挙げている" },
    { id: "block", lv: "alert", t: "コンクリートブロック（空洞ブロック）積みで、土を止めている", why: "空洞ブロックは土を止める擁壁として認められないことが多い。高さ1mを超えるとくに危ない" },
    { id: "harami", lv: "caution", t: "はらみ（壁の中ほどがふくらんでいる）・傾き", why: "国交省の健全度の点数で大きく減点" },
    { id: "hibi", lv: "caution", t: "ひび割れ（幅1mm以上）・目地のずれ・欠け", why: "国交省のチェックシートで点数に数える" },
    { id: "mizunuki", lv: "caution", t: "水抜き穴が無い・少ない（3㎡に1か所・内径7.5cm以上が目安）・水が出ていない・つまっている", why: "水がたまると壁を押す力が大きくなる。技術基準（盛土規制法施行令第12条）" },
    { id: "omosa", lv: "caution", t: "擁壁のすぐ上に建物・車庫・塀など重いものがある", why: "設計より重いものが載ると安全とはいえない（小田原市の解説）" }
  ];

  // ---------------------------------------------------------------
  // 6. 擁壁のやり直し費用（下限・中央・上限。2026年後半の首都圏の値段・税抜）
  //   単価は 調べもの_がけと擁壁.md の「費用の単価」の節（国交省 施工パッケージ・国税庁 土止費・業者の公開の幅）
  // ---------------------------------------------------------------
  var COST = {
    level: "2026年後半（土木総合デフレーター 2026年4〜6月 125.5、2020年度＝100）",
    // 今の擁壁の解体・撤去・処分（円/壁の面積㎡）
    demo: { rc: [15000, 25000, 40000], stone: [10000, 18000, 30000], dry: [8000, 15000, 25000], none: [0, 0, 0] },
    demoName: { rc: "鉄筋コンクリート", stone: "間知石・間知ブロックの練積み", dry: "空石積み・大谷石・ブロック積み", none: "なし（土の斜面）" },
    // 掘る・仮置き・埋め戻し・残土の一部の処分（円/m³）。土の量は 壁の面積㎡あたり 0.6×高さ m³（目安）
    soil: [6000, 10000, 16000], soilK: 0.6,
    temp: [2000, 3000, 5000],                  // 足場・養生（円/㎡）
    yamadome: [10000, 15000, 30000],          // 山留め（隣の建物・境界が近い）（円/㎡）
    road: [100000, 200000, 400000],           // 道路に面する：道路使用・交通誘導（一式）
    // 新しい擁壁の本体（RC L型・円/壁の面積㎡）高さで段階
    body: [{ upTo: 2, v: [30000, 45000, 70000] }, { upTo: 3, v: [35000, 55000, 85000] }, { upTo: 5, v: [50000, 75000, 110000] }, { upTo: 99, v: [65000, 100000, 150000] }],
    typeK: { L: [1, 1, 1], T: [1.05, 1.1, 1.2], kenchi: [0.9, 1.0, 1.6] },
    typeName: { L: "鉄筋コンクリート L型", T: "鉄筋コンクリート 逆T型", kenchi: "間知ブロック練積み" },
    drain: [3000, 5000, 8000],                 // 水抜き・裏込め砕石・透水マット（円/㎡）
    accessK: { ok: [1, 1, 1], small: [1.1, 1.2, 1.35], hand: [1.2, 1.4, 1.6] },
    accessName: { ok: "重機が入る", small: "小型の重機だけ", hand: "手作業" },
    overhead: [0.20, 0.30, 0.45],              // 諸経費（現場の管理・会社の経費）の割合
    design: { low: [50000, 80000, 150000], high: [150000, 250000, 500000] },   // 設計・構造計算（高さ2m以下 / 2m超）
    agent: [50000, 100000, 300000],            // 申請の書類づくり・代行（2m超）
    fee: { tokyo: [18100, 18100, 18100], yokohama: [30000, 30000, 30000], other: [15000, 30000, 50000] }, // 確認＋完了検査の手数料
    survey: { sws: [50000, 80000, 120000], boring: [200000, 300000, 500000] }
  };
  function three(f) { return [f(0), f(1), f(2)]; }
  function cost(q) {
    q = q || {};
    var L = Math.max(0, num(q.L, 0)), H = Math.max(0, num(q.H, 0)), A = L * H;
    var old = COST.demo[q.oldType] ? q.oldType : "rc", nt = COST.typeK[q.newType] ? q.newType : "L", ac = COST.accessK[q.access] ? q.access : "ok";
    var adj = num(q.adj, 1) > 0 ? num(q.adj, 1) : 1;
    var reg = region(q.region) || region("tokyo"), rows = [], notes = [];
    var bodyU = COST.body[COST.body.length - 1].v;
    for (var i = 0; i < COST.body.length; i++) if (H <= COST.body[i].upTo + 1e-9) { bodyU = COST.body[i].v; break; }
    var aK = COST.accessK[ac], tK = COST.typeK[nt];
    function add(key, name, v, how, direct) { rows.push({ key: key, name: name, lo: Math.round(v[0] * adj), mid: Math.round(v[1] * adj), hi: Math.round(v[2] * adj), how: how, direct: !!direct }); }
    var soilV = COST.soilK * H * A;   // m³
    add("demo", "今の擁壁の解体・撤去と処分（" + COST.demoName[old] + "）", three(function (j) { return COST.demo[old][j] * A * aK[j]; }), "壁の面積 " + r2(A) + "㎡ × " + COST.demo[old].map(man).join("〜") + "/㎡", true);
    add("soil", "土を掘る・仮に置く・埋め戻す・残土の処分", three(function (j) { return COST.soil[j] * soilV * aK[j]; }), "土の量 約" + r2(soilV) + "m³（壁の面積×高さ×" + COST.soilK + "）× " + COST.soil.map(man).join("〜") + "/m³", true);
    var tempV = three(function (j) { return (COST.temp[j] + (q.neighbor ? COST.yamadome[j] : 0)) * A * aK[j] + (q.road ? COST.road[j] : 0); });
    add("temp", "仮設（足場・養生" + (q.neighbor ? "・山留め" : "") + (q.road ? "・道路使用と交通誘導" : "") + "）", tempV,
      "足場・養生 " + COST.temp.map(man).join("〜") + "/㎡" + (q.neighbor ? "＋山留め " + COST.yamadome.map(man).join("〜") + "/㎡" : "") + (q.road ? "＋道路 " + COST.road.map(man).join("〜") + "（一式）" : ""), true);
    add("body", "新しい擁壁の本体（" + COST.typeName[nt] + "・高さ" + r2(H) + "m）", three(function (j) { return bodyU[j] * tK[j] * A * aK[j]; }),
      "壁の面積 " + r2(A) + "㎡ × " + bodyU.map(man).join("〜") + "/㎡" + (nt !== "L" ? "（L型の" + tK.join("〜") + "倍）" : ""), true);
    add("drain", "水抜き穴・裏込め砕石・透水マット", three(function (j) { return COST.drain[j] * A * aK[j]; }), COST.drain.map(man).join("〜") + "/㎡", true);
    var dsum = three(function (j) { var s = 0; rows.forEach(function (r) { if (r.direct) s += [r.lo, r.mid, r.hi][j]; }); return s / adj; });
    add("over", "諸経費（現場の管理・会社の経費）", three(function (j) { return dsum[j] * COST.overhead[j]; }), "上の工事の " + COST.overhead.map(function (x) { return Math.round(x * 100) + "%"; }).join("〜"), false);
    var high = H > 2;
    add("design", "設計と構造計算", high ? COST.design.high : COST.design.low, high ? "高さ2mを超える擁壁" : "高さ2m以下", false);
    if (high) {
      var fee = COST.fee[reg.rule === "tokyo" ? "tokyo" : reg.rule === "yokohama" ? "yokohama" : "other"];
      add("permit", "確認申請（工作物）または盛土規制法の許可：書類づくりと手数料", three(function (j) { return COST.agent[j] + fee[j]; }),
        "代行 " + COST.agent.map(man).join("〜") + "＋手数料 " + (fee[0] === fee[2] ? man(fee[0]) : fee.map(man).join("〜")), false);
    } else notes.push("高さ2m以下の擁壁は、工作物の確認申請は要らない（盛土規制法の許可・届出が要る場合はある）");
    add("survey", H > 3 ? "地盤調査（ボーリング）" : "地盤調査（スウェーデン式サウンディング）", H > 3 ? COST.survey.boring : COST.survey.sws, H > 3 ? "高さ3mを超えるのでボーリング1か所の目安" : "1宅地の目安", false);
    var tot = three(function (j) { var s = 0; rows.forEach(function (r) { s += [r.lo, r.mid, r.hi][j]; }); return s; });
    if (nt === "kenchi" && H > 5) notes.push("間知ブロック練積みは高さ5mまで。5mを超えるなら鉄筋コンクリート造");
    if (nt === "kenchi") notes.push("間知ブロック練積みは斜め（1：0.3〜0.5ほど）に積むので、上の敷地が少し狭くなる");
    if (H > 5) notes.push("高さ5mを超える擁壁は個別の設計。費用の幅が大きい");
    if (ac !== "ok") notes.push("重機が入りにくいので、工事の費用を " + COST.accessK[ac].join("〜") + " 倍にした");
    notes.push("地盤改良・杭・大きな山留め・隣の家の補償・建物の解体は入っていない");
    notes.push("値段は" + COST.level + "の目安・税抜。着工が先なら1年に3%ほど上がる見込み（ここ数年の土木の工事費は年2.5〜5%上がっている）");
    return { L: L, H: H, A: r2(A), soilV: r2(soilV), rows: rows, lo: tot[0], mid: tot[1], hi: tot[2],
      perM: L > 0 ? [tot[0] / L, tot[1] / L, tot[2] / L] : [0, 0, 0], notes: notes, adj: adj };
  }
  function man(y) { return (Math.round(y / 1000) / 10) + "万円"; }
  // 着工までの年数から、値上がりの掛け目（1年3%の目安）
  function priceAdj(years) { years = Math.max(0, num(years, 0)); return Math.round(Math.pow(1.03, years) * 1000) / 1000; }

  // 離して建てる場合に使えなくなる面積（帯の幅 × がけに面する辺の長さ。奥行を超えない）
  function bandLoss(edgeLen, band, depth) {
    edgeLen = Math.max(0, num(edgeLen, 0)); band = Math.max(0, num(band, 0));
    var b = depth > 0 ? Math.min(band, depth) : band;
    return { band: r2(b), area: r2(edgeLen * b) };
  }

  var Gake = { CHECKED: CHECKED, RULES: RULES, REGIONS: REGIONS, MORIDO_MAP: MORIDO_MAP, DOSHA_MAP: DOSHA_MAP, WALL_SIGNS: WALL_SIGNS, COST: COST,
    region: region, regionFor: regionFor, ruleOf: ruleOf, judge: judge, morido: morido, cost: cost, priceAdj: priceAdj, bandLoss: bandLoss, man: man,
    PREF_NAME: PREF_NAME };
  if (typeof module !== "undefined" && module.exports) module.exports = Gake;
  if (root) root.Gake = Gake;
})(typeof window !== "undefined" ? window : null);
