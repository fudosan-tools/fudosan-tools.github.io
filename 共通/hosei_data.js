/* 土地の「割引（減価）・加算」の数字をまとめたファイル（2026-10-22 調べ）。
   相場マップ（相場マップ試作/web/souba_calc.js）と積算評価（シミュレーター/sekisan.html）の両方から読む。
   ブラウザでは window.HOSEI、node では require("…/共通/hosei_data.js")。
   くわしい出どころと、出どころごとの数字の比べ表は 共通/調べもの_土地の割引.md。

   factors の決まり
   - kind：この道具の初期値（lo・mid・hi）が何にもとづくか。'公的'＝国税庁・総務省などの基準／'目安'＝実務の解説の幅
   - unit：'rate'＝更地の値段に掛ける（1＝そのまま、0.7＝3割安い）／'add'＝足す割合（角地など）／
           'yen_tsubo'＝建物の延床1坪あたりの円／'yen_m'＝長さ1mあたりの円／'yen'＝1件あたりの円
   - lo・mid・hi：rate なら lo＝いちばん安くなる側、hi＝いちばん高い側。費用（yen…）なら lo＝安い費用、hi＝高い費用
   - pub：公的な基準があるときの値と説明（あれば）
   - src：出どころ [{t:題名, u:URL, n:そこに書いてある数字}] */
(function (root) {
  "use strict";
  var NTA = "https://www.nta.go.jp/law/tsutatsu/kihon/sisan/hyoka_new/02/07.htm";          // 財産評価基本通達 付表
  var NTA_T = "https://www.rosenka.nta.go.jp/docs/h31_thyousei.pdf";                     // 調整率表（平成31年1月分以降用）
  var NTA20 = "https://www.nta.go.jp/law/tsutatsu/kihon/sisan/hyoka_new/02/03.htm";        // 通達20〜20-7
  var NTA24 = "https://www.nta.go.jp/law/tsutatsu/kihon/sisan/hyoka_new/02/04.htm";        // 通達24〜24-8
  var TAS = "https://www.tas-japan.com/help/pdf/help_kobetsukakusa.pdf";                  // タス 個別格差率の解説
  var HIJUN = "https://www.recpas.or.jp/new/jigyo/report_web/kenkyu_giji/18th/18th_1_g.pdf"; // 資産評価情報2015年1月号（土地価格比準表・六次改訂時点の幅）
  var NOMU_PRO = "https://www.nomu.com/pro/contents/knowhow/20230314.html";               // ノムコム・プロ 積算の補正
  var TOKYO_KOTEI = "https://www.tax.metro.tokyo.lg.jp/documents/d/tax/hoseiritsu";        // 東京都主税局 画地補正率表（固定資産税）

  var factors = [
    // ---------------- 土地の形
    { id: "fusei", group: "形", name: "不整形地（台形・L字など）", kind: "目安", unit: "rate", lo: 0.70, mid: 0.85, hi: 0.95,
      how: "更地の値段 × 掛け目。国税庁の表は かげ地割合（土地を囲む長方形のうち自分の土地でない部分）で 0.60〜0.99。売買では −5〜−30% が多い",
      pub: { lo: 0.60, hi: 0.99, text: "国税庁「不整形地補正率表」（かげ地割合×地積区分）× 間口狭小補正率、最小 0.60" },
      src: [{ t: "国税庁 調整率表 ⑤不整形地補正率表", u: NTA_T, n: "普通住宅A：かげ地10% 0.98〜65% 0.60" },
        { t: "土地価格比準表（標準住宅地域・六次改訂時点）", u: HIJUN, n: "0.95〜0.70" },
        { t: "タス 個別格差率の解説", u: TAS, n: "やや不整形 −5〜−10%／不整形 −10〜−30%" },
        { t: "ノムコム・プロ（野村不動産ソリューションズ）", u: NOMU_PRO, n: "▲10〜30%" },
        { t: "7tochi（不整形地の売却）", u: "https://7tochi.jp/type/fuseikei/", n: "台形 85〜95%・L字 75〜90%・三角 70〜85%" },
        { t: "art-pi（国交省の取引データの分析）", u: "https://art-pi.com/tochi-katachi-seikei-fuseikei/", n: "整形地100に対し74.2（100〜200㎡）" }] },
    { id: "sankaku", group: "形", name: "三角地・極端な形", kind: "目安", unit: "rate", lo: 0.50, mid: 0.70, hi: 0.85,
      how: "建物の置き方がかぎられる形。国税庁の表ではかげ地割合が大きくなり 0.60 近くまで下がる",
      src: [{ t: "7tochi（不整形地の売却）", u: "https://7tochi.jp/type/fuseikei/", n: "三角 70〜85%・多角形 60〜80%・極端な形 50〜70%" },
        { t: "固定資産評価基準 附表4 注3（不整形の度合い）", u: "https://www.soumu.go.jp/main_content/000911827.pdf", n: "相当に不整形 0.70・極端に不整形 0.60" }] },
    { id: "hatazao", group: "形", name: "旗竿地（路地状敷地・敷地延長）", kind: "目安", unit: "rate", lo: 0.70, mid: 0.75, hi: 0.80,
      how: "同じ町の整形地より 2〜3割安いことが多い。竿（通路）が細く長いと 5〜6割台。竿の幅が2m未満なら再建築不可の扱い",
      pub: { lo: 0.60, hi: 0.99, text: "国税庁：不整形地として かげ地割合で計算（不整形地補正率 × 間口狭小補正率、最小 0.60）" },
      src: [{ t: "ノムコム（野村の仲介）", u: "https://www.nomu.com/seller/column/20220210.html", n: "整形地より 20〜30%安い場合がある" },
        { t: "リビンマッチ", u: "https://www.lvnmatch.jp/column/sell/13290/", n: "約2〜3割安い" },
        { t: "iekatsu", u: "https://iekatsu.jp/hatazao-chi/", n: "坪単価で2〜3割安い" },
        { t: "売却タイミング診断", u: "https://baikyaku-ai.com/blog/hatazao-chi-baikyaku", n: "竿3m以上 75〜85%・竿2m前後 60〜75%・暗い 50〜65%" },
        { t: "タス 個別格差率の解説", u: TAS, n: "袋地（敷地延長）−20〜−30%" },
        { t: "東京都主税局 画地補正率表（固定資産税）", u: TOKYO_KOTEI, n: "袋地 路地の幅2m未満 0.75・2m以上 0.80" }] },
    { id: "maguchi", group: "形", name: "間口が狭い", kind: "目安", unit: "rate", lo: 0.80, mid: 0.90, hi: 0.95,
      how: "道路に接する長さが短い。国税庁の表は普通住宅で 4m未満 0.90・4〜6m 0.94・6〜8m 0.97",
      pub: { lo: 0.90, hi: 1.00, text: "国税庁「間口狭小補正率表」普通住宅 0.90〜1.00" },
      src: [{ t: "国税庁 調整率表 ⑥間口狭小補正率表", u: NTA_T, n: "普通住宅 4m未満 0.90" },
        { t: "土地価格比準表（標準住宅地域・六次改訂時点）", u: HIJUN, n: "0.95〜0.80" },
        { t: "タス 個別格差率の解説", u: TAS, n: "間口と奥行の関係が劣る −10〜−20%" },
        { t: "東京都主税局 画地補正率表", u: TOKYO_KOTEI, n: "間口2m未満 0.70・2〜4m 0.90" }] },
    { id: "okuyuki_long", group: "形", name: "奥行が長すぎる（細長い）", kind: "目安", unit: "rate", lo: 0.85, mid: 0.92, hi: 0.98,
      how: "奥行 ÷ 間口 が2以上。国税庁の表は普通住宅で 2〜3倍 0.98 … 6倍以上 0.90",
      pub: { lo: 0.90, hi: 1.00, text: "国税庁「奥行長大補正率表」普通住宅 0.90〜0.98" },
      src: [{ t: "国税庁 調整率表 ⑦奥行長大補正率表", u: NTA_T, n: "普通住宅 2〜3倍 0.98・6倍以上 0.90" },
        { t: "土地価格比準表（六次改訂時点）", u: HIJUN, n: "奥行長大 0.95〜0.80・奥行÷間口 0.98〜0.90" }] },
    { id: "okuyuki_short", group: "形", name: "奥行が短すぎる", kind: "目安", unit: "rate", lo: 0.88, mid: 0.93, hi: 0.98,
      how: "奥行が10m未満で建物が置きにくい。国税庁の奥行価格補正率は普通住宅で 4m未満 0.90・8〜10m 0.97",
      pub: { lo: 0.90, hi: 0.97, text: "国税庁「奥行価格補正率表」普通住宅 4m未満 0.90〜10m未満 0.97" },
      src: [{ t: "国税庁 付表1 奥行価格補正率表", u: NTA, n: "普通住宅 4m未満 0.90・4〜6m 0.92・6〜8m 0.95・8〜10m 0.97" },
        { t: "土地価格比準表（六次改訂時点）", u: HIJUN, n: "奥行短小 0.98〜0.88" }] },
    { id: "kibo", group: "形", name: "土地が大きすぎる（分けて売る必要がある）", kind: "目安", unit: "rate", lo: 0.70, mid: 0.80, hi: 0.90,
      how: "買う人が建売業者などにかぎられる。道路を入れて分ける規模だと −20〜−40%",
      pub: { lo: 0.64, hi: 0.80, text: "国税庁「規模格差補正率」三大都市圏で500㎡以上（(地積×B＋C)÷地積×0.8。500㎡で0.80・1000㎡で0.78・5000㎡で0.71）" },
      src: [{ t: "国税庁 通達20-2 規模格差補正率", u: NTA20, n: "三大都市圏 500〜1000㎡ B0.95 C25 など" },
        { t: "タス 個別格差率の解説", u: TAS, n: "2区画 −10〜−20%・6区画 −20〜−30%・大規模 −30〜−40%" },
        { t: "ダイヤモンド不動産研究所", u: "https://diamond-fudosan.jp/articles/-/164685", n: "建売業者は相場の7割程度で買う" },
        { t: "セルフリジェネレーション", u: "https://self-regeneration.jp/academy-blog/archives/15926/", n: "まとめて業者に売ると約80%" }] },

    // ---------------- 高さ・斜面
    { id: "hinadan", group: "高さ", name: "高低差・ひな壇（擁壁は使える）", kind: "目安", unit: "rate", lo: 0.90, mid: 0.95, hi: 1.00,
      how: "擁壁（土を止める壁）に検査済証があり、そのまま使えるとき。階段・深い基礎の費用で少し下がる",
      pub: { lo: 0.90, hi: 0.90, text: "国税庁：道路との著しい高低差などで利用価値が著しく低下している宅地は 10%減（路線価に入っていないとき）" },
      src: [{ t: "空家ベース（がけ条例の土地）", u: "https://sora-ie.jp/investment/cliff-ordinance-land/", n: "擁壁に検査済証があれば市場の7〜9割" },
        { t: "タス 個別格差率の解説", u: TAS, n: "地勢・地盤が劣る −1〜−5%" },
        { t: "国税庁 No.4617 利用価値が著しく低下している宅地", u: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4617.htm", n: "10%減" }] },
    { id: "youheki", group: "高さ", name: "擁壁のやり直しが要る・がけ条例にかかる", kind: "目安", unit: "rate", lo: 0.70, mid: 0.80, hi: 0.90,
      how: "工事費を別に引かないときの掛け目。工事費（下の「擁壁の工事費」）を別に引くなら、掛け目は「ひな壇」の値にする（二重に引かないため）",
      src: [{ t: "空家ベース（がけ条例の土地）", u: "https://sora-ie.jp/investment/cliff-ordinance-land/", n: "がけ条例の土地は1〜3割安い・擁壁が確認できなければ5〜7割" },
        { t: "GMO不動産査定", u: "https://e-estate.jp/media/land-sale/blog/13253/", n: "擁壁専門の買取は相場の7〜8割" },
        { t: "リビンマッチ", u: "https://www.lvnmatch.jp/column/sell/16554/", n: "何割と決められない。造成・擁壁費用分を引く" }] },
    { id: "youheki_cost", group: "高さ", name: "擁壁の工事費（長さ1mあたり・高さ2〜3m）", kind: "目安", unit: "yen_m", lo: 150000, mid: 250000, hi: 400000,
      how: "つくり直しの費用。長さ(m) × 単価。高さ3m・L型で 1mあたり約32万円（国交省マニュアルの例）。がけ条例でさらに50〜300万円かかることがある",
      src: [{ t: "concretus（国交省「宅地擁壁の健全度判定・予防保全対策マニュアル」の数字を引用）", u: "https://concretus.jp/blog/yoheki-kouji-hiyou/", n: "高さ3m×長さ10m：重力式 約240万円・L型 約320万円" },
        { t: "家づくりナビ", u: "https://kurashi-pro.jp/content/articles/tochi-youheki-hiyou/", n: "L型10m：高さ2m 150〜200万円・3m 250〜400万円" },
        { t: "空家ベース", u: "https://sora-ie.jp/investment/cliff-ordinance-land/", n: "10mで 高さ2m 150〜250万円・3〜4m 300〜500万円" }] },
    { id: "keisha", group: "高さ", name: "傾斜地（土地そのものが斜め）", kind: "目安", unit: "rate", lo: 0.50, mid: 0.70, hi: 0.90,
      how: "造成（平らにする工事）が要る。ゆるい傾斜で −10〜−30%、急な傾斜で −30〜−50%",
      src: [{ t: "ノムコム・プロ", u: NOMU_PRO, n: "崖地・傾斜地 ▲30〜50%" },
        { t: "7tochi（傾斜地の売却）", u: "https://7tochi.jp/column/keishachi-sale/", n: "平らな土地の何割、では決まらない" }] },
    { id: "gake", group: "高さ", name: "がけ地（使えない斜面を含む）", kind: "目安", unit: "rate", lo: 0.50, mid: 0.75, hi: 0.90,
      how: "がけの割合と向きで決まる。国税庁の表は 0.53〜0.96。がけの部分そのものは売買ではほぼ0とみることが多い",
      pub: { lo: 0.53, hi: 0.96, text: "国税庁「がけ地補正率表」（がけ地の割合 0.10〜0.90 × 向き）" },
      src: [{ t: "国税庁 調整率表 ⑨がけ地補正率表", u: NTA_T, n: "0.20以上・北 0.88 など" },
        { t: "東京都主税局 画地補正率表", u: TOKYO_KOTEI, n: "傾斜地 20〜50% 0.90・急傾斜地 20〜50% 0.75" },
        { t: "訳ありプロ", u: "https://wakearipro.com/cliff-land-cannot-sell/", n: "がけの割合が大きいと 50%以下も" },
        { t: "ノムコム・プロ", u: NOMU_PRO, n: "▲30〜50%" }] },
    { id: "dosha", group: "高さ", name: "土砂災害特別警戒区域（レッドゾーン）にかかる", kind: "公的", unit: "rate", lo: 0.70, mid: 0.80, hi: 0.90,
      how: "国税庁の特別警戒区域補正率：区域の割合 10%以上 0.90・40%以上 0.80・70%以上 0.70（がけ地補正と掛けて最小0.50）",
      pub: { lo: 0.70, hi: 0.90, text: "国税庁「特別警戒区域補正率表」（通達20-6）" },
      src: [{ t: "国税庁 付表9 特別警戒区域補正率表", u: NTA, n: "0.90／0.80／0.70" },
        { t: "東京都主税局 画地補正率表", u: TOKYO_KOTEI, n: "20%未満 0.95〜80%以上 0.80" }] },

    // ---------------- 道路
    { id: "mudouro", group: "道路", name: "無道路地・袋地（道路に出られない）", kind: "目安", unit: "rate", lo: 0.30, mid: 0.40, hi: 0.50,
      how: "第三者に売るとき。となりの人が買うなら8〜10割のこともある。国税庁は通路をつくる費用を引く（最大40%）",
      pub: { lo: 0.60, hi: 1.00, text: "国税庁 通達20-3：不整形地として計算した価額から、通路部分の価額を引く（最大40%）" },
      src: [{ t: "GMO不動産査定", u: "https://e-estate.jp/media/estate-sale/blog/11530/", n: "整形地の3〜7割（都市部で回復が難しい 30〜50%）" },
        { t: "タス 個別格差率の解説", u: TAS, n: "−30〜−50%" },
        { t: "国税庁 No.4620 無道路地の評価", u: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4620.htm", n: "40%までの範囲で差し引く" },
        { t: "リハコ", u: "https://re-hako.com/sell-contents/saikenchikufukabukken-baikyaku/", n: "隣地の人が買うなら 80〜120%" }] },
    { id: "saikenchiku", group: "道路", name: "再建築不可（建てかえができない）", kind: "目安", unit: "rate", lo: 0.50, mid: 0.60, hi: 0.70,
      how: "建築基準法の道路に2m以上接していないなど。多くの解説が「5〜7割」。買取業者なら3〜5割、条件が悪いと2〜3割。43条2項の許可の見込みがあれば7〜9割",
      src: [{ t: "ワケガイ（ネクスウィル）", u: "https://wakegai.jp/column/saikenchikufuka/how-to-check-non-rebuildable/", n: "ふつうの物件の5〜7割" },
        { t: "リハコ", u: "https://re-hako.com/sell-contents/saikenchikufukabukken-baikyaku/", n: "基本5〜7割（3〜9割）・許可の見込み 70〜90%" },
        { t: "j-angel", u: "https://www.j-angel.co.jp/column/saikenfuka/3528/", n: "半額、良くて7割" },
        { t: "ノムコム・プロ", u: NOMU_PRO, n: "▲50〜70%" },
        { t: "健美家 コラム", u: "https://www.kenbiya.com/ar/cl/hana/25.html", n: "一般の土地より安い（%なし）" }] },
    { id: "shidou_ok", group: "道路", name: "私道に面する（持分あり・通行掘削の承諾あり）", kind: "目安", unit: "rate", lo: 0.90, mid: 0.95, hi: 1.00,
      how: "建築基準法の道路で、私道の持分と承諾書があれば下がりは小さい",
      src: [{ t: "千歳不動産", u: "https://chitose-estate.com/blog-shidou-baikyaku/", n: "承諾書あり・法律上の道路なら約−10%" },
        { t: "私道ラボ", u: "https://shido-labo.com/2025/10/29/shido-hutan/", n: "1〜3割安く買える可能性" }] },
    { id: "shidou_ng", group: "道路", name: "私道に面する（持分なし・承諾なし）", kind: "目安", unit: "rate", lo: 0.60, mid: 0.70, hi: 0.80,
      how: "水道・ガスの工事や通行で揉めやすく、ローンが通りにくい。法律上の道路でなければ再建築不可の幅",
      src: [{ t: "千歳不動産", u: "https://chitose-estate.com/blog-shidou-baikyaku/", n: "承諾書なし・トラブルありなら −30〜−40%" },
        { t: "リハコ", u: "https://re-hako.com/sell-contents/saikenchikufukabukken-baikyaku/", n: "私道の持分・承諾書なし 40〜60%（再建築不可が前提）" }] },
    { id: "shidou_part", group: "道路", name: "私道の部分そのもの（持分として持っている道）", kind: "公的", unit: "rate", lo: 0.00, mid: 0.30, hi: 0.30,
      how: "国税庁：私道は自用地の価額の30%。だれでも通る（通り抜けの）私道は0",
      pub: { lo: 0, hi: 0.30, text: "国税庁 通達24 私道の用に供されている宅地" },
      src: [{ t: "国税庁 通達24", u: NTA24, n: "×0.3・不特定多数の通行は評価しない" },
        { t: "東京都主税局 画地補正率表（固定資産税の課税私道）", u: TOKYO_KOTEI, n: "路線価あり 0.10・なし 0.20" }] },
    { id: "setback", group: "道路", name: "セットバック（道路にする部分）", kind: "公的", unit: "rate", lo: 0.30, mid: 0.30, hi: 0.30,
      how: "国税庁：道路にする部分は 70%を引く（×0.3）。売買ではその部分はほぼ0とみて、残りの土地もさらに数%〜1割下がることがある",
      pub: { lo: 0.30, hi: 0.30, text: "国税庁 通達24-6：セットバック部分の地積÷総地積×0.7 を引く" },
      src: [{ t: "国税庁 通達24-6", u: NTA24, n: "控除 0.7" },
        { t: "ホームワーク（首都圏不動産売却ナビ）", u: "https://home-work.co.jp/column/archives/3445", n: "道路になる面積を引き、さらに数%〜1〜2割" }] },
    { id: "kado", group: "道路", name: "角地（加算）", kind: "目安", unit: "add", lo: 0.03, mid: 0.05, hi: 0.10,
      how: "2つの道路に接する角の土地は高くなる。国税庁は普通住宅で +3%（側方路線価×奥行補正×0.03）。南東の角地は +10〜20% の解説もある",
      pub: { lo: 0.03, hi: 0.03, text: "国税庁「側方路線影響加算率表」普通住宅 角地0.03・準角地0.02" },
      src: [{ t: "国税庁 付表2 側方路線影響加算率表", u: NTA, n: "普通住宅 0.03・普通商業 0.08・高度商業 0.10" },
        { t: "土地価格比準表（標準住宅地域・六次改訂時点）", u: HIJUN, n: "角地 +0.03〜0.10" },
        { t: "タス 個別格差率の解説", u: TAS, n: "住宅地 +2〜+5%" },
        { t: "ノムコム・プロ", u: NOMU_PRO, n: "角地 +10%程度" }] },
    { id: "junkado", group: "道路", name: "準角地（加算。曲がった1本の道路の角）", kind: "目安", unit: "add", lo: 0.02, mid: 0.03, hi: 0.07,
      how: "国税庁は普通住宅で +2%",
      pub: { lo: 0.02, hi: 0.02, text: "国税庁「側方路線影響加算率表」普通住宅 準角地 0.02" },
      src: [{ t: "国税庁 付表2", u: NTA, n: "普通住宅 0.02" }, { t: "土地価格比準表（六次改訂時点）", u: HIJUN, n: "+0.02〜0.07" }] },
    { id: "nihou", group: "道路", name: "二方路（表と裏の両方が道路。加算）", kind: "目安", unit: "add", lo: 0.01, mid: 0.03, hi: 0.05,
      how: "国税庁は普通住宅で +2%（裏面路線価×奥行補正×0.02）",
      pub: { lo: 0.02, hi: 0.02, text: "国税庁「二方路線影響加算率表」普通住宅 0.02" },
      src: [{ t: "国税庁 付表3 二方路線影響加算率表", u: NTA, n: "普通住宅 0.02・普通商業 0.05" },
        { t: "土地価格比準表（六次改訂時点）", u: HIJUN, n: "+0.01〜0.05" }, { t: "タス", u: TAS, n: "+2〜+5%" }] },

    // ---------------- まわりの環境
    { id: "kita", group: "環境", name: "北向き（南向きと比べて）", kind: "目安", unit: "rate", lo: 0.90, mid: 0.93, hi: 0.95,
      how: "路線価や公示価格には方位の差がふくまれていない。南道路と北道路で5〜10%の差という解説が多い",
      src: [{ t: "art-pi（国交省の成約データ74,364件）", u: "https://art-pi.com/tochi-houi-minami-kita/", n: "南100に対し北93.2" },
        { t: "オープンハウス", u: "https://oh.openhouse-group.com/contents/journal/20150606.html", n: "南道路と北道路で5〜10%の差" },
        { t: "すまいーだ（飯田グループ）", u: "https://sumaiida.com/customhome/cafedesmile/contents/recipe_land_3", n: "約1割の差" },
        { t: "タス", u: TAS, n: "日照・通風が劣る −1〜−5%" }] },
    { id: "senro", group: "環境", name: "線路沿い・幹線道路沿い（音・ゆれ）", kind: "目安", unit: "rate", lo: 0.85, mid: 0.92, hi: 0.95,
      how: "5〜15%安い、平均約8%という解説。国税庁は騒音・振動で利用価値が著しく低下していれば10%減（路線価に入っていないとき）",
      pub: { lo: 0.90, hi: 0.90, text: "国税庁 No.4617：騒音・振動などで 10%減" },
      src: [{ t: "ウチカツ（線路沿い）", u: "https://ucikatu.com/times/along-the-railroad/", n: "5〜15%安い・平均約8%" },
        { t: "国税庁 No.4617", u: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4617.htm", n: "10%減" },
        { t: "大阪市 固定資産評価実施要領（所要の補正）", u: "https://www.city.osaka.lg.jp/zaisei/cmsfiles/contents/0000021/21272/jissiyouryoutoti.pdf", n: "騒音・振動 20%以内" }] },
    { id: "kouatsu", group: "環境", name: "高圧線の下（線の下の部分だけに掛ける）", kind: "目安", unit: "rate", lo: 0.50, mid: 0.60, hi: 0.70,
      how: "建物の高さ・構造に制限があれば −30%、建物が建てられなければ −50%以上。土地全体ではなく線の下の部分に掛ける",
      pub: { lo: 0.50, hi: 0.70, text: "国税庁 通達27-5：建築制限あり 30%・家屋の建築不可 50%（または借地権割合の高い方）を引く" },
      src: [{ t: "国税庁 通達27-5・25(5)", u: "https://www.nta.go.jp/law/tsutatsu/kihon/sisan/hyoka_new/02/06.htm", n: "30%／50%" },
        { t: "東京都主税局 画地補正率表", u: TOKYO_KOTEI, n: "線下の割合 20%未満 0.90・80%以上 0.50" },
        { t: "アルバリンク", u: "https://albalink.co.jp/realestate/high-voltage-line-land-price/", n: "建物が建てられないと約5割まで下がる" },
        { t: "タス", u: TAS, n: "線下部分 −50〜−100%" }] },
    { id: "kenoshisetsu", group: "環境", name: "嫌悪施設が近い（墓地・工場・ごみ処理場など）", kind: "目安", unit: "rate", lo: 0.70, mid: 0.90, hi: 0.95,
      how: "見えるほど近いと −5〜−30%。離れて見えなければほぼ影響なし",
      src: [{ t: "利山不動産", u: "https://riyama-fudousan.co.jp/archives/30144", n: "墓地の近くは5〜30%安い" },
        { t: "タス", u: TAS, n: "嫌悪施設など −1〜−5%" }] },

    // ---------------- 権利
    { id: "shakuchi", group: "権利", name: "借地権（税の評価＝更地×借地権割合 に掛ける）", kind: "目安", unit: "rate", lo: 0.50, mid: 0.70, hi: 0.90,
      how: "第三者に売るとき。大手仲介は「更地の6〜7割」、弁護士の解説では更地の約3割の例もあり幅が大きい。地主の承諾料（売買価格の約1割）が別にかかる",
      pub: { lo: 0.30, hi: 0.90, text: "国税庁 No.4611：更地 × 借地権割合（路線価図の記号 A 90%〜G 30%）" },
      src: [{ t: "三井のリハウス（借地権の売却相場）", u: "https://www.rehouse.co.jp/relifemode/column/at/at_0214/", n: "第三者に売る場合 更地価格の6〜7割程度" },
        { t: "VSG弁護士法人", u: "https://vs-group.jp/lawyer/tachinoki/negotiation/shakuchiken-baikyaku-souba/", n: "地主に売る 50〜70%・業者経由 約50%" },
        { t: "ワケガイ", u: "https://wakegai.jp/column/syakuchi/leasehold-right-2/", n: "10〜50%（記事内で幅がそろっていない）" },
        { t: "宮田総合法律事務所", u: "https://www.mc-law.jp/fudousan/18305/", n: "更地1億円で借地権が約3割の例" },
        { t: "国税庁 No.4611", u: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4611.htm", n: "更地×借地権割合" }] },
    { id: "sokochi", group: "権利", name: "底地（税の評価＝更地×(1−借地権割合) に掛ける）", kind: "目安", unit: "rate", lo: 0.25, mid: 0.35, hi: 0.50,
      how: "第三者に売ると更地の1〜2割が多い。借地権割合60%なら 0.4×(0.25〜0.5)＝更地の10〜20%。借地人に売るなら更地の約5割",
      pub: { lo: 0.10, hi: 0.70, text: "国税庁 No.4613：更地 −（更地×借地権割合）" },
      src: [{ t: "三井のリハウス（底地）", u: "https://www.rehouse.co.jp/relifemode/column/at/at_0312/", n: "第三者 約1割・借地人 約5割・業者 1〜1.5割" },
        { t: "クランピー（底地）", u: "https://c-realestate.jp/column/2849/", n: "業者 10〜20%・投資家 10〜30%" },
        { t: "センチュリー21", u: "https://www.century21-sell.jp/reading/16734/", n: "業者 10〜20%・投資家に 40〜50%" },
        { t: "国税庁 No.4613", u: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4613.htm", n: "更地×(1−借地権割合)" }] },

    // ---------------- 費用（引く）
    { id: "kaitai_w", group: "費用", name: "古家の解体費（木造・延床1坪あたり）", kind: "目安", unit: "yen_tsubo", lo: 30000, mid: 40000, hi: 50000,
      how: "延床の坪数 × 単価。東京は4〜7万円と高め。塀・庭木・残った家財・アスベストは別",
      src: [{ t: "解体相談ナビ", u: "https://soudan-kaitai.jp/cost/kaitai-hiyo-kouzoubetsu-tsubosubetsu/", n: "木造 3〜5万円" },
        { t: "解体の教科書（東京）", u: "https://kaitai-textbook.jp/articles/cat-fc445876/cat-a1c5ad27/tokyo-demolition-cost/", n: "東京の木造 約3.9万円" },
        { t: "三井のリハウス", u: "https://www.rehouse.co.jp/relifemode/column/at/at_0059/", n: "木造 3〜5万円前後" }] },
    { id: "kaitai_ls", group: "費用", name: "古家の解体費（軽量鉄骨・延床1坪あたり）", kind: "目安", unit: "yen_tsubo", lo: 35000, mid: 45000, hi: 60000,
      how: "延床の坪数 × 単価",
      src: [{ t: "解体相談ナビ", u: "https://soudan-kaitai.jp/cost/kaitai-hiyo-kouzoubetsu-tsubosubetsu/", n: "軽量鉄骨 3.5〜5万円" },
        { t: "ペガサス（解体業者）", u: "https://kaitai-pegasus.com/blog/260212", n: "軽量鉄骨 4〜6万円" }] },
    { id: "kaitai_s", group: "費用", name: "古家の解体費（鉄骨・延床1坪あたり）", kind: "目安", unit: "yen_tsubo", lo: 40000, mid: 55000, hi: 70000,
      how: "延床の坪数 × 単価",
      src: [{ t: "解体相談ナビ", u: "https://soudan-kaitai.jp/cost/kaitai-hiyo-kouzoubetsu-tsubosubetsu/", n: "重量鉄骨 4.5〜7万円" },
        { t: "ペガサス", u: "https://kaitai-pegasus.com/blog/260212", n: "重量鉄骨 5〜7万円" },
        { t: "野村の仲介", u: "https://www.nomu.com/seller/column/20240610.html", n: "鉄骨 3.5〜7万円程度" }] },
    { id: "kaitai_rc", group: "費用", name: "古家の解体費（RC・SRC・延床1坪あたり）", kind: "目安", unit: "yen_tsubo", lo: 60000, mid: 80000, hi: 100000,
      how: "延床の坪数 × 単価。東京の実勢は約8.5万円",
      src: [{ t: "解体相談ナビ", u: "https://soudan-kaitai.jp/cost/kaitai-hiyo-kouzoubetsu-tsubosubetsu/", n: "RC 6〜10万円" },
        { t: "ペガサス", u: "https://kaitai-pegasus.com/blog/260212", n: "RC 6〜9万円" },
        { t: "解体の教科書（東京）", u: "https://kaitai-textbook.jp/articles/cat-fc445876/cat-a1c5ad27/tokyo-demolition-cost/", n: "東京のRC 約8.5万円" }] },
    { id: "dojou_chousa", group: "費用", name: "土壌汚染の調査費（地歴調査＋表層調査）", kind: "目安", unit: "yen", lo: 100000, mid: 300000, hi: 900000,
      how: "工場・ガソリンスタンド・クリーニング店などの跡地で必要。地歴調査10〜30万円、表層調査20〜60万円。汚染が見つかると対策費は桁がちがう",
      src: [{ t: "ジオリゾーム（調査会社）", u: "https://www.georhizome.co.jp/faq/expenses/", n: "地歴調査10〜30万円・表層調査900㎡以内20〜35万円" },
        { t: "現場の窓口（土壌環境センターの資料を引用）", u: "https://genba-mado.com/dojou/market-price", n: "掘削除去 5〜10万円/㎥" }] },
    { id: "umesetsu", group: "費用", name: "地中埋設物の撤去費（コンクリートがら・浄化槽・井戸など）", kind: "目安", unit: "yen", lo: 300000, mid: 1000000, hi: 3000000,
      how: "掘ってみないと分からない。浄化槽・井戸は各10万円前後、がらは1㎥あたり1〜3万円",
      src: [{ t: "イエウリ", u: "https://www.ieuri.com/bible/sell-knowledge/15504/", n: "がら 約1.2万円/㎥・浄化槽・井戸 各約10万円" },
        { t: "nest解体", u: "https://nest-kaitai.info/column/chichu-maisetsubutsu-tekkyo/", n: "がら 1.5〜3万円/㎥・浄化槽 5〜15万円" }] },

    // ---------------- 心理的なこと
    { id: "jiko_kodoku", group: "心理", name: "孤独死・病死（早く見つかった）", kind: "目安", unit: "rate", lo: 0.90, mid: 0.95, hi: 1.00,
      how: "自然な死で早く見つかったなら下がりは小さい（国交省ガイドラインでは原則告知不要の場合もある）",
      src: [{ t: "グッドバイバイ", u: "https://goodbyebuy.jp/jiko-bukken/column/jikobukken-souba/", n: "自然死 0〜2割・孤独死（早期）1〜2割" },
        { t: "ダイヤモンド不動産研究所", u: "https://diamond-fudosan.jp/articles/-/163729", n: "孤独死 −5%" }] },
    { id: "jiko_tokusou", group: "心理", name: "孤独死（発見が遅れ特殊清掃あり）", kind: "目安", unit: "rate", lo: 0.70, mid: 0.80, hi: 0.90,
      how: "発見が遅れると2〜3割下がる",
      src: [{ t: "グッドバイバイ", u: "https://goodbyebuy.jp/jiko-bukken/column/jikobukken-souba/", n: "2〜3割" },
        { t: "イエコン", u: "https://iekon.jp/column/stigmatized-property/32792", n: "特殊清掃が要ると3割超" }] },
    { id: "jiko_jisatsu", group: "心理", name: "自殺があった", kind: "目安", unit: "rate", lo: 0.70, mid: 0.80, hi: 0.90,
      how: "1〜3割安いという解説が多い（3〜4割の解説もある）",
      src: [{ t: "クランピーリアルエステート", u: "https://c-realestate.jp/column/accident-property-marketprice/", n: "1〜3割" },
        { t: "ダイヤモンド不動産研究所", u: "https://diamond-fudosan.jp/articles/-/163729", n: "−10%" },
        { t: "グッドバイバイ", u: "https://goodbyebuy.jp/jiko-bukken/column/jikobukken-souba/", n: "3〜4割" }] },
    { id: "jiko_tasatsu", group: "心理", name: "他殺（事件）があった", kind: "目安", unit: "rate", lo: 0.50, mid: 0.60, hi: 0.70,
      how: "3〜5割安い。全国ニュースになった事件は5割以上",
      src: [{ t: "クランピーリアルエステート", u: "https://c-realestate.jp/column/accident-property-marketprice/", n: "3〜5割" },
        { t: "リノスマイル", u: "https://reno-smile.com/media/market-price-for-sale/", n: "殺人 3〜5割" },
        { t: "ダイヤモンド不動産研究所", u: "https://diamond-fudosan.jp/articles/-/163729", n: "−20%" }] },

    // ---------------- 売り方・税の評価だけの補正
    { id: "kaitori", group: "売り方", name: "買取業者に売る（仲介で売る値段に対して）", kind: "目安", unit: "rate", lo: 0.70, mid: 0.75, hi: 0.80,
      how: "早く確実に売れるかわりに、仲介の7〜8割",
      src: [{ t: "リノスマイル", u: "https://reno-smile.com/media/market-price-for-sale/", n: "買取は仲介の7〜8割" },
        { t: "売却タイミング診断", u: "https://baikyaku-ai.com/blog/hatazao-chi-baikyaku", n: "買取は仲介相場の7〜8割" }] },
    { id: "riyou_teika", group: "税の評価", name: "利用価値が著しく低下している宅地（税の評価）", kind: "公的", unit: "rate", lo: 0.90, mid: 0.90, hi: 0.90,
      how: "国税庁：道路との著しい高低差・地盤の凹凸・騒音・日照阻害・臭気・忌みなどで、その部分を10%減。路線価にすでに入っていれば使えない",
      pub: { lo: 0.90, hi: 0.90, text: "国税庁 タックスアンサー No.4617" },
      src: [{ t: "国税庁 No.4617", u: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4617.htm", n: "10%減" }] },
  ];

  // ---------------- 国税庁の表（財産評価基本通達 付表。調整率表 平成31年1月分以降用。令和8年分でも使われている）
  // 地区：biru ビル街／koudo 高度商業／hanka 繁華街／shogyo 普通商業・併用住宅／futsu 普通住宅／kojo 中小工場／daikojo 大工場
  var DISTRICTS = { futsu: "普通住宅地区", shogyo: "普通商業・併用住宅地区", koudo: "高度商業地区", hanka: "繁華街地区",
    kojo: "中小工場地区", daikojo: "大工場地区", biru: "ビル街地区" };
  var DCOL = ["biru", "koudo", "hanka", "shogyo", "futsu", "kojo", "daikojo"];
  // ① 奥行価格補正率表：[奥行の下限m, ビル街, 高度商業, 繁華街, 普通商業, 普通住宅, 中小工場, 大工場]
  var OKUYUKI = [
    [0, .80, .90, .90, .90, .90, .85, .85], [4, .80, .92, .92, .92, .92, .90, .90], [6, .84, .94, .95, .95, .95, .93, .93],
    [8, .88, .96, .97, .97, .97, .95, .95], [10, .90, .98, .99, .99, 1.00, .96, .96], [12, .91, .99, 1.00, 1.00, 1.00, .97, .97],
    [14, .92, 1.00, 1.00, 1.00, 1.00, .98, .98], [16, .93, 1.00, 1.00, 1.00, 1.00, .99, .99], [20, .94, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    [24, .95, 1.00, 1.00, 1.00, .97, 1.00, 1.00], [28, .96, 1.00, .98, 1.00, .95, 1.00, 1.00], [32, .97, 1.00, .96, .97, .93, 1.00, 1.00],
    [36, .98, 1.00, .94, .95, .92, 1.00, 1.00], [40, .99, 1.00, .92, .93, .91, 1.00, 1.00], [44, 1.00, 1.00, .90, .91, .90, 1.00, 1.00],
    [48, 1.00, .99, .88, .89, .89, 1.00, 1.00], [52, 1.00, .98, .87, .88, .88, 1.00, 1.00], [56, 1.00, .97, .86, .87, .87, 1.00, 1.00],
    [60, 1.00, .96, .85, .86, .86, .99, 1.00], [64, 1.00, .95, .84, .85, .85, .98, 1.00], [68, 1.00, .94, .83, .84, .84, .97, 1.00],
    [72, 1.00, .93, .82, .83, .83, .96, 1.00], [76, 1.00, .92, .81, .82, .83, .96, 1.00], [80, 1.00, .90, .80, .81, .82, .93, 1.00],
    [84, 1.00, .88, .80, .80, .82, .93, 1.00], [88, 1.00, .86, .80, .80, .81, .90, 1.00], [92, .99, .84, .80, .80, .81, .90, 1.00],
    [96, .97, .82, .80, .80, .81, .90, 1.00], [100, .95, .80, .80, .80, .80, .90, 1.00],
  ];
  // ② 側方路線影響加算率（角地・準角地）③ 二方路線影響加算率
  var SOKUHO = { biru: [.07, .03], koudo: [.10, .05], hanka: [.10, .05], shogyo: [.08, .04], futsu: [.03, .02], kojo: [.03, .02], daikojo: [.02, .01] };
  var NIHOU = { biru: .03, koudo: .07, hanka: .07, shogyo: .05, futsu: .02, kojo: .02, daikojo: .02 };
  // ④ 地積区分（A／B の上限㎡。これ以上は C）。ビル街・大工場は不整形地補正の表なし
  var CHISEKI = { koudo: [1000, 1500], hanka: [450, 700], shogyo: [650, 1000], futsu: [500, 750], kojo: [3500, 5000] };
  // ⑤ 不整形地補正率表：かげ地割合の下限% [高度商業・繁華街・普通商業・中小工場 A,B,C, 普通住宅 A,B,C]
  var FUSEI = [
    [10, .99, .99, 1.00, .98, .99, .99], [15, .98, .99, .99, .96, .98, .99], [20, .97, .98, .99, .94, .97, .98],
    [25, .96, .98, .99, .92, .95, .97], [30, .94, .97, .98, .90, .93, .96], [35, .92, .95, .98, .88, .91, .94],
    [40, .90, .93, .97, .85, .88, .92], [45, .87, .91, .95, .82, .85, .90], [50, .84, .89, .93, .79, .82, .87],
    [55, .80, .87, .90, .75, .78, .83], [60, .76, .84, .86, .70, .73, .78], [65, .70, .75, .80, .60, .65, .70],
  ];
  // ⑥ 間口狭小補正率表：[間口の下限m, ビル街, 高度商業, 繁華街, 普通商業, 普通住宅, 中小工場, 大工場]（ビル街の8m未満は表に無い）
  var MAGUCHI = [
    [0, null, .85, .90, .90, .90, .80, .80], [4, null, .94, 1.00, .97, .94, .85, .85], [6, null, .97, 1.00, 1.00, .97, .90, .90],
    [8, .95, 1.00, 1.00, 1.00, 1.00, .95, .95], [10, .97, 1.00, 1.00, 1.00, 1.00, 1.00, .97], [16, .98, 1.00, 1.00, 1.00, 1.00, 1.00, .98],
    [22, .99, 1.00, 1.00, 1.00, 1.00, 1.00, .99], [28, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
  ];
  // ⑦ 奥行長大補正率表：[奥行÷間口 の下限, ビル街, 高度商業・繁華街・普通商業, 普通住宅, 中小工場, 大工場]
  var CHODAI = [[2, 1.00, 1.00, .98, 1.00, 1.00], [3, 1.00, .99, .96, .99, 1.00], [4, 1.00, .98, .94, .98, 1.00],
    [5, 1.00, .96, .92, .96, 1.00], [6, 1.00, .94, .90, .94, 1.00], [7, 1.00, .92, .90, .92, 1.00], [8, 1.00, .90, .90, .90, 1.00]];
  // ⑧ 規模格差補正率：三大都市圏の [地積の下限㎡, B, C]（それ以外の地域は別表。この道具は1都3県なので三大都市圏）
  var KIBO_SANDAI = [[500, .95, 25], [1000, .90, 75], [3000, .85, 225], [5000, .80, 475]];
  // ⑨ がけ地補正率表：[がけ地の割合の下限, 南, 東, 西, 北]
  var GAKE = [[.10, .96, .95, .94, .93], [.20, .92, .91, .90, .88], [.30, .88, .87, .86, .83], [.40, .85, .84, .82, .78],
    [.50, .82, .81, .78, .73], [.60, .79, .77, .74, .68], [.70, .76, .74, .70, .63], [.80, .73, .70, .66, .58], [.90, .70, .65, .60, .53]];
  // ⑩ 特別警戒区域補正率表：[割合の下限, 補正率]
  var TOKKEI = [[.10, .90], [.40, .80], [.70, .70]];
  // 借地権割合（路線価図の記号）
  var LEASE = { A: .9, B: .8, C: .7, D: .6, E: .5, F: .4, G: .3 };

  var HOSEI = {
    checked: "2026-10-22",
    factors: factors,
    byId: function (id) { for (var i = 0; i < factors.length; i++) if (factors[i].id === id) return factors[i]; return null; },
    nta: { DISTRICTS: DISTRICTS, DCOL: DCOL, OKUYUKI: OKUYUKI, SOKUHO: SOKUHO, NIHOU: NIHOU, CHISEKI: CHISEKI, FUSEI: FUSEI,
      MAGUCHI: MAGUCHI, CHODAI: CHODAI, KIBO_SANDAI: KIBO_SANDAI, GAKE: GAKE, TOKKEI: TOKKEI, LEASE: LEASE,
      src: { table: NTA_T, tsutatsu: NTA, t20: NTA20, t24: NTA24 } },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = HOSEI;
  else root.HOSEI = HOSEI;
})(typeof window !== "undefined" ? window : this);
