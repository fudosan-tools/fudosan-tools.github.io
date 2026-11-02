/* kenchiku_calc.js — 建てられる大きさの計算（kenchiku.html とテストで共通に使う）
   2026-10-22 作りなおし：道路を4辺に・旗竿地・日影規制・1都3県の高度地区・構造と耐火・家の形（段々）
   座標：敷地（旗竿地なら「旗」の部分）を東西 X・南北 Y の長方形とし、x は西→東、y は南→北（m）。
   すべて「目安」。正式には建築士・役所で確かめる。 */
(function (root) {
'use strict';
var TSUBO = 3.30578;
var EPS = 1e-9;

// ---------- 用途地域（建築基準法 52・53・55・56条、別表第三・第四） ----------
// sh：日影規制の区分（別表第四の項）。1＝低層・田園、2＝中高層、3＝住居系・近商・準工、null＝対象外
var ZONES = [
  {id:'1low', name:'第一種低層住居専用地域', road:'res', coef:0.4, nb:null, north:5, abs:true, sh:1, bcr:[30,40,50,60], far:[50,60,80,100,150,200], def:[50,100]},
  {id:'2low', name:'第二種低層住居専用地域', road:'res', coef:0.4, nb:null, north:5, abs:true, sh:1, bcr:[30,40,50,60], far:[50,60,80,100,150,200], def:[60,150]},
  {id:'1mid', name:'第一種中高層住居専用地域', road:'res', coef:0.4, nb:{b:20,s:1.25}, north:10, chuko:true, abs:false, sh:2, bcr:[30,40,50,60], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'2mid', name:'第二種中高層住居専用地域', road:'res', coef:0.4, nb:{b:20,s:1.25}, north:10, chuko:true, abs:false, sh:2, bcr:[30,40,50,60], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'1jyu', name:'第一種住居地域', road:'res', coef:0.4, nb:{b:20,s:1.25}, north:0, abs:false, sh:3, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'2jyu', name:'第二種住居地域', road:'res', coef:0.4, nb:{b:20,s:1.25}, north:0, abs:false, sh:3, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'jjyu', name:'準住居地域', road:'res', coef:0.4, nb:{b:20,s:1.25}, north:0, abs:false, sh:3, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'den',  name:'田園住居地域', road:'res', coef:0.4, nb:null, north:5, abs:true, sh:1, bcr:[30,40,50,60], far:[50,60,80,100,150,200], def:[50,100]},
  {id:'kin',  name:'近隣商業地域', road:'com', coef:0.6, nb:{b:31,s:2.5}, north:0, abs:false, sh:3, bcr:[60,80], far:[100,150,200,300,400,500], def:[80,300]},
  {id:'sho',  name:'商業地域', road:'com', coef:0.6, nb:{b:31,s:2.5}, north:0, abs:false, sh:null, bcr:[80], far:[200,300,400,500,600,700,800,900,1000,1100,1200,1300], def:[80,600]},
  {id:'jko',  name:'準工業地域', road:'ind', coef:0.6, nb:{b:31,s:2.5}, north:0, abs:false, sh:3, bcr:[50,60,80], far:[100,150,200,300,400,500], def:[60,200]},
  {id:'ko',   name:'工業地域', road:'ind', coef:0.6, nb:{b:31,s:2.5}, north:0, abs:false, sh:null, bcr:[50,60], far:[100,150,200,300,400], def:[60,200]},
  {id:'kos',  name:'工業専用地域', road:'ind', coef:0.6, nb:{b:31,s:2.5}, north:0, abs:false, sh:null, bcr:[30,40,50,60], far:[100,150,200,300,400], def:[60,200]}
];
function zoneById(id){ for (var i=0;i<ZONES.length;i++) if (ZONES[i].id===id) return ZONES[i]; return ZONES[0]; }

// 別表第三：道路斜線の「適用距離」と「勾配」。far は基準容積率（指定と道路幅の小さい方）%
function roadTable(group, far){
  var L;
  if (group==='com'){
    L = far<=400?20: far<=600?25: far<=800?30: far<=1000?35: far<=1100?40: far<=1200?45: 50;
    return {L:L, s:1.5};
  }
  L = far<=200?20: far<=300?25: far<=400?30: 35;
  return {L:L, s: group==='res'?1.25:1.5};
}

// 建ぺい率（第53条）
function coverage(p){
  var base = p.bcr, add = 0, notes = [];
  if (p.fire==='bou' && p.fireBldg==='taika' && base===80){
    return {pct:100, notes:['防火地域で建ぺい率80%の地域に耐火建築物等を建てるので、建ぺい率の制限がありません（第53条6項）']};
  }
  if (p.fire==='bou' && p.fireBldg==='taika'){ add += 10; notes.push('防火地域の耐火建築物等 +10%'); }
  if (p.fire==='jun' && (p.fireBldg==='taika' || p.fireBldg==='juntaika')){ add += 10; notes.push('準防火地域の耐火・準耐火建築物等 +10%'); }
  if (p.corner){ add += 10; notes.push('角地 +10%'); }
  return {pct: Math.min(100, base+add), notes:notes};
}

// ---------- 高度地区（北側の斜線型）。L＝真北方向の距離 ----------
// meas：'road'＝前面道路の反対側の境界線か隣地境界線まで（東京都・川崎市・千葉市・船橋市）
//       'half'＝敷地境界線まで。北が道路・水面なら幅の1/2だけ外側（横浜市）
var KODO = {
  none:{name:'なし'},
  T1:{grp:'東京都', name:'第1種高度地区', base:5, s1:0.6, brk:0, s2:0.6, meas:'road'},
  T2:{grp:'東京都', name:'第2種高度地区', base:5, s1:1.25, brk:8, s2:0.6, meas:'road'},
  T3:{grp:'東京都', name:'第3種高度地区', base:10, s1:1.25, brk:8, s2:0.6, meas:'road'},
  Y1:{grp:'横浜市', name:'最高限第1種高度地区', base:5, s1:0.6, brk:0, s2:0.6, max:10, meas:'half'},
  Y2:{grp:'横浜市', name:'最高限第2種高度地区', base:5, s1:0.6, brk:0, s2:0.6, max:12, meas:'half'},
  Y3:{grp:'横浜市', name:'最高限第3種高度地区', base:7, s1:0.6, brk:0, s2:0.6, max:15, meas:'half'},
  Y4:{grp:'横浜市', name:'最高限第4種高度地区', base:7.5, s1:0.6, brk:0, s2:0.6, max:20, meas:'half'},
  Y5:{grp:'横浜市', name:'最高限第5種高度地区', base:10, s1:0.6, brk:0, s2:0.6, max:20, meas:'half'},
  Y6:{grp:'横浜市', name:'最高限第6種高度地区（高さだけ）', max:20},
  Y7:{grp:'横浜市', name:'最高限第7種高度地区（高さだけ）', max:31},
  K1:{grp:'川崎市', name:'第1種高度地区', base:5, s1:0.6, brk:0, s2:0.6, max:10, meas:'road'},
  K2:{grp:'川崎市', name:'第2種高度地区', base:7.5, s1:1.25, brk:0, s2:1.25, max:15, meas:'road'},
  K3:{grp:'川崎市', name:'第3種高度地区', base:10, s1:1.25, brk:0, s2:1.25, max:20, meas:'road'},
  K4:{grp:'川崎市', name:'第4種高度地区', base:10, s1:0.6, brk:0, s2:0.6, max:20, meas:'road'},
  C1:{grp:'千葉市・船橋市', name:'第一種高度地区', base:5, s1:1.25, brk:4, s2:0.6, meas:'road'},
  C2:{grp:'千葉市・船橋市', name:'第二種高度地区', base:10, s1:1.25, brk:8, s2:0.6, meas:'road'},
  S15:{grp:'さいたま市', name:'15m高度地区（高さだけ）', max:15},
  S20:{grp:'さいたま市', name:'20m高度地区（高さだけ）', max:20},
  custom:{grp:'自分で入れる', name:'自分で入れる', meas:'road'}
};
function kodoDef(p){
  var k = p.kodo == null ? 'none' : String(p.kodo);
  if (k==='1'||k==='2'||k==='3') k = 'T' + k;           // 前の形（東京都の 1・2・3）
  if (k==='custom'){
    var c = p.kodoCustom || {};
    return {key:'custom', grp:'自分で入れる', name:'自分で入れた高度地区', base:+c.base||0, s1:+c.s1||0, brk:+c.brk||0, s2: c.s2==null? +c.s1||0 : +c.s2, meas:c.meas||'road', max:0, slope: (+c.s1||0) > 0};
  }
  var d = KODO[k] || KODO.none;
  return {key: KODO[k]?k:'none', grp:d.grp, name:d.name, base:d.base, s1:d.s1, brk:d.brk||0, s2:d.s2, meas:d.meas, max:d.max||0, slope: d.base!=null};
}
function kodoHof(k, L){
  if (!k || !k.slope) return Infinity;
  if (!(k.brk > 0) || L <= k.brk) return k.base + k.s1 * L;
  return k.base + k.s1 * k.brk + k.s2 * (L - k.brk);
}
// 前の形の関数（テスト用に残す）：東京都の型 '1' '2' '3'
function kodoH(type, t){ return kodoHof(kodoDef({kodo:type}), t); }
function kodoReq(type, h){ var k = kodoDef({kodo:type}); return kodoInv(k, h); }
function kodoInv(k, h){   // 高さ h を建てるのに要る距離 L
  if (!k || !k.slope) return -Infinity;
  if (h <= k.base) return -Infinity;
  if (!(k.brk > 0)) return (h - k.base) / k.s1;
  var hb = k.base + k.s1 * k.brk;
  if (h <= hb) return (h - k.base) / k.s1;
  return k.brk + (h - hb) / k.s2;
}

// ---------- 構造（一般的な目安。数字は業界の一般的な目安で、この道具で決めたもの） ----------
var STRUCTS = {
  wood: {name:'木造', fh:2.9, base:0.5, roof:'gable', maxFloors:3, burn:true,  cost:'wood', costK:1.00,
         floors:'2〜3階がふつう。4階以上は耐火の木造（特殊で高い）', span:'柱の間 3.6〜4.5m', fireable:'その他・準耐火がふつう。耐火は特殊（認定品・費用増）'},
  ls:   {name:'軽量鉄骨造', fh:2.9, base:0.5, roof:'gable', maxFloors:3, burn:false, cost:'s', costK:0.90,
         floors:'2〜3階（住宅メーカーの商品はふつう3階まで）', span:'柱の間 〜6m', fireable:'準耐火がふつう。耐火はメーカーの認定品だけ'},
  s:    {name:'重量鉄骨造', fh:3.2, base:0.3, roof:'flat', maxFloors:0, burn:false, cost:'s', costK:1.00,
         floors:'3〜10階くらいが多い（もっと高くもできる）', span:'柱の間 6〜12m', fireable:'耐火被覆をすれば耐火にできる'},
  rc:   {name:'RC造（ラーメン構造）', fh:3.0, base:0.3, roof:'flat', maxFloors:0, burn:false, cost:'rc', costK:1.00,
         floors:'3〜15階くらいが多い（もっと高くもできる）', span:'柱の間 6〜9m', fireable:'そのままで耐火'},
  wrc:  {name:'壁式RC造', fh:2.9, base:0.3, roof:'flat', maxFloors:5, maxEave:20, burn:false, cost:'rc', costK:0.95,
         floors:'5階まで・軒の高さ20mまで（国土交通省告示の決まり）', span:'壁で支える。部屋の幅 〜5m程度', fireable:'そのままで耐火'},
  src:  {name:'SRC造（鉄骨鉄筋コンクリート）', fh:3.2, base:0.3, roof:'flat', maxFloors:0, burn:false, cost:'src', costK:1.00,
         floors:'10階以上の高い建物に多い', span:'柱の間 8〜12m', fireable:'そのままで耐火'}
};
var FIRE_RANK = {none:0, bouka:1, juntaika:2, taika:3};
var FIRE_NAME = {none:'特になし', bouka:'外壁・軒裏を防火構造に（木造など）', juntaika:'準耐火建築物等', taika:'耐火建築物等'};

// 防火地域・準防火地域（第61条・施行令第136条の2）、大規模の木造（第21条）、共同住宅（第27条）から「必要な燃えにくさ」
function fireRequired(p, floors, area, height, area2F){
  var req = 'none', why = [], alt = null;
  function need(c, w){ if (FIRE_RANK[c] > FIRE_RANK[req]) req = c; why.push(w); }
  var st = STRUCTS[p.struct] || {burn:false};
  if (p.fire==='bou'){
    if (floors >= 3 || area > 100) need('taika', '防火地域で' + (floors>=3?'3階以上':'延べ面積100㎡超') + '（施行令第136条の2）');
    else need('juntaika', '防火地域で2階以下・延べ100㎡以下（施行令第136条の2）');
  } else if (p.fire==='jun'){
    if (floors >= 4 || area > 1500) need('taika', '準防火地域で' + (floors>=4?'4階以上':'延べ面積1500㎡超') + '（施行令第136条の2）');
    else if (floors === 3 || area > 500) need('juntaika', '準防火地域で' + (floors===3?'3階':'延べ面積500㎡超') + '（施行令第136条の2。3階は準耐火と同じ程度の決まった作り方でもよい）');
    else if (st.burn) need('bouka', '準防火地域の木造（外壁と軒裏を防火構造にする。施行令第136条の2）');
  }
  if (st.burn && (floors >= 4 || height > 16)) need('taika', '木造で' + (floors>=4?'4階以上':'高さ16m超') + '（第21条：大規模の木造は耐火の性能が必要）');
  if (p.use==='apart'){
    if (floors >= 4) need('taika', '共同住宅で4階以上（第27条・別表第一(2)項）');
    else if (floors === 3){
      if (area < 200) why.push('共同住宅で3階建てでも、延べ200㎡未満なら警報設備を付ければ第27条の対象外');
      else {
        need('taika', '共同住宅で3階以上の階がある（第27条・別表第一(2)項）');
        if (p.fire !== 'bou') alt = {cls:'juntaika', note:'防火地域の外なら、1時間準耐火の木造3階建て共同住宅（いわゆる木三共）も条件つきで可（避難上有効なバルコニー・敷地内の通路など。施行令第110条と告示）'};
      }
    }
    if (area2F >= 300) need('juntaika', '共同住宅で2階の部分が300㎡以上（第27条・別表第一(2)項）');
  }
  return {req:req, why:why, alt:alt};
}
// 選んだ燃えにくさで建てられる上限（階数・延べ面積・高さ）
function fireCaps(p){
  var c = p.fireBldg || 'none', st = STRUCTS[p.struct] || {burn:false, maxFloors:0};
  var cap = {floors:Infinity, area:Infinity, height:Infinity, eave:Infinity, why:[]};
  function lim(f, a, why){ if (f < cap.floors) cap.floors = f; if (a < cap.area) cap.area = a; cap.why.push(why); }
  if (p.fire==='bou'){
    if (c==='juntaika') lim(2, 100, '防火地域で準耐火建築物等なら2階・延べ100㎡まで');
    else if (c!=='taika') lim(0, 0, '防火地域では、耐火か準耐火の建物でないと建てられません');
  } else if (p.fire==='jun'){
    if (c==='juntaika') lim(3, 1500, '準防火地域で準耐火建築物等なら3階・延べ1500㎡まで');
    else if (c!=='taika') lim(2, 500, '準防火地域で耐火・準耐火でない建物は2階・延べ500㎡まで');
  }
  if (st.burn && c!=='taika'){ lim(3, Infinity, '木造は耐火でないと3階まで・高さ16mまで（第21条）'); cap.height = Math.min(cap.height, 16); }
  if (p.use==='apart'){
    if (c==='none' || c==='bouka') lim(2, Infinity, '共同住宅で耐火・準耐火でないなら2階まで（3階建て・延べ200㎡未満は別）');
    else if (c==='juntaika') lim(p.fire==='bou' ? 2 : 3, Infinity, p.fire==='bou' ? '防火地域の共同住宅で準耐火なら2階まで' : '共同住宅で準耐火なら3階まで（3階は1時間準耐火などの条件つき）');
  }
  if (st.maxFloors > 0 && !(p.struct==='wood' && c==='taika')) lim(st.maxFloors, Infinity, st.name + 'は' + st.maxFloors + '階まで（目安）');
  if (st.maxEave) { cap.eave = st.maxEave; cap.why.push(st.name + 'は軒の高さ' + st.maxEave + 'mまで'); }
  return cap;
}

// ---------- 旗竿地（路地状敷地）の条例。都県ごと（政令市などの独自条例は「役所で確認」） ----------
var PREFS = {
  tokyo:{name:'東京都'}, kanagawa:{name:'神奈川県（県の条例の市町村）'}, yokohama:{name:'横浜市'},
  saitama:{name:'埼玉県'}, chiba:{name:'千葉県'}, other:{name:'そのほか・わからない'}
};
// L：路地状部分の長さ m、w：幅 m、area：延べ面積、floors、fire：耐火の度合い、use、units：住戸の数（わからなければ null）
function flagRule(pref, L, w, area, floors, fireCls, use, siteArea){
  var r = {need:2, ok:true, src:'', lines:[], capArea:Infinity, capFloors:Infinity, banned:false, fix:[]};
  var fr = fireCls==='taika' || fireCls==='juntaika';
  function needW(n){ if (n > r.need) r.need = n; }
  if (pref==='tokyo'){
    r.src = '東京都建築安全条例 第3条・第3条の2・第10条';
    var base = L <= 20 ? 2 : 3;
    var big = !fr && area > 200;
    needW(big ? base + 1 : base);
    r.lines.push('路地状部分の長さ ' + fmt1(L) + 'm → 幅 ' + base + 'm 以上' + (big ? '。耐火・準耐火でなく延べ200㎡超なので ' + (base+1) + 'm 以上（第3条2項）' : '（第3条）'));
    if (w < base + 1 && !fr && w >= base) { r.fix.push('延べ面積を200㎡以下にするか、耐火・準耐火建築物にすれば幅 ' + base + 'm で足ります'); }
    if (w < 4){
      var mf = fr ? 3 : 2;
      if (mf < r.capFloors) r.capFloors = mf;
      r.lines.push('幅が4m未満なので、' + (fr ? '耐火・準耐火なら3階まで' : '3階建て以上は建てられません（耐火・準耐火なら3階まで）') + '（第3条の2）');
    }
    if (use==='apart'){
      var ok10 = (w >= 10 && siteArea < 1000) || (floors <= 3 && area <= 200 && L <= 20);
      r.lines.push('共同住宅は、路地状部分だけで道路に接する敷地には原則建てられません。例外：幅10m以上で敷地1000㎡未満、または 3階以下・延べ200㎡以下・住戸12以下で路地状部分の長さ20m以下（第10条）');
      if (!ok10){
        if (L <= 20 && w >= r.need){ r.capArea = Math.min(r.capArea, 200); r.capFloors = Math.min(r.capFloors, 3); r.fix.push('共同住宅にするなら、3階以下・延べ200㎡以下・住戸12以下にする（第10条の例外）'); }
        else { r.banned = true; r.lines.push('この形では共同住宅は建てられません（知事が安全上支障がないと認めた場合を除く）'); }
      }
    }
  } else if (pref==='saitama'){
    r.src = '埼玉県建築基準法施行条例 第3条・第10条';
    var b2 = L < 10 ? 2 : L < 15 ? 2.5 : L < 20 ? 3 : 4;
    var up = {2:3, 2.5:3.5, 3:4, 4:4};
    var big2 = area > 200;
    needW(big2 ? up[b2] : b2);
    r.lines.push('路地状部分の長さ ' + fmt1(L) + 'm → 幅 ' + b2 + 'm 以上' + (big2 && up[b2] !== b2 ? '。延べ200㎡超なので ' + up[b2] + 'm 以上（第3条2項）' : '（第3条）'));
    if (big2 && w < up[b2] && w >= b2) r.fix.push('延べ面積を200㎡以下にすれば幅 ' + b2 + 'm で足ります');
    if (use==='apart'){
      var ok10s = w >= 6 || (w >= 4 && L <= 20);
      r.lines.push('共同住宅・寄宿舎は、路地状部分だけで道路に接する敷地には原則建てられません。例外：幅6m以上、または幅4m以上で長さ20m以下（第10条）');
      if (!ok10s){ r.banned = true; r.lines.push('この形では共同住宅は建てられません'); }
    }
  } else if (pref==='yokohama'){
    r.src = '横浜市建築基準条例 第4条・第5条';
    var b3 = L <= 15 ? 2 : L <= 25 ? 3 : 4;
    needW(b3);
    r.lines.push('路地状部分の長さ ' + fmt1(L) + 'm → 幅 ' + b3 + 'm 以上（' + (L <= 15 ? '15m以下は建築基準法の2m' : '第4条') + '）');
    if (use==='apart' && area > 100){
      var b5 = area <= 200 ? 4 : area <= 500 ? 5 : 6;
      needW(b5);
      r.lines.push('共同住宅で延べ100㎡超なので、1か所で ' + b5 + 'm 以上道路に接する（第5条）');
    }
  } else if (pref==='kanagawa'){
    r.src = '神奈川県建築基準条例 第4条・第5条（路地状の長さによる幅の表はありません）';
    r.lines.push('県の条例には、長さで幅が決まる表はありません。建築基準法の2m以上（第43条）');
    if (use==='apart' && area > 100){
      var b6 = area <= 200 ? 3 : area <= 500 ? 4 : area <= 1000 ? 5 : 6;
      needW(b6);
      r.lines.push('共同住宅で延べ100㎡超なので、' + b6 + 'm 以上道路に接する（第5条）');
    }
    if (area > 1000) { needW(6); r.lines.push('延べ1000㎡超なので6m以上道路に接する（第4条）'); }
  } else if (pref==='chiba'){
    r.src = '千葉県建築基準法施行条例 第7条・第8条（一般の住宅には長さによる幅の表はありません）';
    r.lines.push('一般の住宅は、建築基準法の2m以上（第43条）');
    if (use==='apart' && area > 100){
      var b7 = L <= 10 ? 3 : L <= 20 ? 4 : L <= 25 ? 5 : 6;
      needW(b7);
      r.lines.push('共同住宅で100㎡超は、路地状部分の幅が長さ ' + fmt1(L) + 'm に応じて ' + b7 + 'm 以上（第7条）');
      if (area > 100){ var b8 = area <= 200 ? 3 : area <= 500 ? 4 : 5; needW(b8); }
    }
  } else {
    r.src = '建築基準法 第43条（自治体の条例は役所で確認）';
    r.lines.push('建築基準法では道路に2m以上接すること。自治体の条例で、長さに応じてもっと広い幅が要ることが多いので役所で確認してください');
  }
  if (w < 2){ r.ok = false; r.banned = true; r.lines.push('幅が2m未満なので、道路に2m以上接していません（建築基準法 第43条）。原則として建てられません'); }
  if (w + EPS < r.need) r.ok = false;
  return r;
}
function fmt1(n){ return (Math.round(n*10)/10).toString(); }

// ---------- 日影規制（第56条の2・別表第四）。自治体の条例の例 ----------
var NICHIEI_GO = {1:{1:[3,2],2:[4,2.5],3:[5,3]}, 2:{1:[3,2],2:[4,2.5],3:[5,3]}, 3:{1:[4,2.5],2:[5,3]}};
function nichieiTimes(sh, go){ var t = NICHIEI_GO[sh] && NICHIEI_GO[sh][go]; return t ? {t1:t[0], t2:t[1]} : null; }
// 都県（市）・用途地域・容積率・高度地区から、条例の号と測定面の目安。分からなければ {unknown:true}
function nichieiAuto(pref, zoneId, far, kodoKey){
  var z = zoneById(zoneId);
  if (!z.sh) return {none:true, src:'商業地域・工業地域・工業専用地域は日影規制の対象外（別表第四）'};
  var low = z.sh===1, mid = z.sh===2, res3 = (zoneId==='1jyu'||zoneId==='2jyu'||zoneId==='jjyu');
  var k = String(kodoKey||'none'); if (k==='1'||k==='2'||k==='3') k = 'T'+k;
  var go = null, hm = low ? 1.5 : 4, src = '';
  if (pref==='tokyo'){
    src = '東京都日影規制条例 別表第一（区ごとの例外が多い）';
    if (low){ go = far<=80 ? 1 : far<=150 ? 2 : 3; }
    else if (mid){ if (far<=150) go = 1; else if (far<=300){ if (k==='T3'){ go = 2; hm = 6.5; } else go = 1; } }
    else if (res3){ if (far<=150) go = 1; else if (far<=200){ go = 1; if (k==='T3') hm = 6.5; } else if (far<=300){ if (k==='T3'){ go = 2; hm = 6.5; } else if (k==='T2'||k==='T1') go = 1; else go = 2; } }
    else if (zoneId==='kin'){ if (far<=150) go = 1; else if (far<=300){ if (k==='T3'){ go = far<=200 ? 1 : 2; hm = 6.5; } else go = 1; } }
    else if (zoneId==='jko'){ if (far<=200){ if (k==='T3'){ go = 1; hm = 6.5; } else if (k==='none' && far===200) go = 2; else go = 1; } else if (far<=300){ if (k==='T3'){ go = 2; hm = 6.5; } else go = 1; } }
  } else if (pref==='kanagawa'){
    src = '神奈川県建築基準条例 第4条の2（藤沢市・海老名市・大磯町などは独自の条例）';
    if (low) go = 1; else if (mid) go = 2; else go = 2;
  } else if (pref==='yokohama'){
    src = '横浜市建築基準条例 第4条の4';
    if (low) go = far<=100 ? 1 : 2;
    else if (mid) go = far<=150 ? 1 : 2;
    else if (res3) go = far<=200 ? 1 : 2;
    else if (zoneId==='kin' || zoneId==='jko') go = far<=200 ? 2 : null;
  } else if (pref==='saitama'){
    src = '埼玉県建築基準法施行条例 第8条の2（市町村が独自に決めた所は別）';
    if (low) go = far<=80 ? 1 : far<=100 ? 2 : 3;
    else if (mid) go = far<=150 ? 1 : far<=200 ? 2 : 3;
    else if (res3) go = far<=200 ? 1 : 2;
    else if (zoneId==='kin' || zoneId==='jko') go = far<=200 ? 2 : null;
  } else if (pref==='chiba'){
    src = '千葉県建築基準法施行条例 第46条の2・別表';
    if (low) go = far<=80 ? 1 : far<=150 ? 2 : 3;
    else if (mid) go = far<=150 ? 1 : far<=200 ? (k==='C1' ? 1 : 2) : 3;
    else if (res3) go = far<=200 ? ((k==='C1'||k==='C2') ? 1 : 2) : 2;
    else if (zoneId==='kin' || zoneId==='jko') go = far<=200 ? (k==='C1' ? 1 : k==='C2' ? 2 : null) : null;
  } else {
    return {unknown:true, src:'都県が「そのほか」なので条例の例はありません。役所で確認してください'};
  }
  if (!go) return {unknown:true, src: src + '：この用途地域・容積率の例が表にありません。役所で確認してください'};
  var t = nichieiTimes(z.sh, go);
  if (!t) return {unknown:true, src:src};
  return {hm:hm, go:go, t1:t.t1, t2:t.t2, src:src};
}

// ---------- 敷地の形（4辺の道路・2項道路の後退・旗竿地） ----------
var SIDES = ['S','E','N','W'];
var SIDE_NAME = {S:'南', E:'東', N:'北', W:'西'};
function setbackOf(W, mode){ if (!(W < 4)) return 0; return mode==='one' ? 4 - W : (4 - W)/2; }

// 入力 p から計算の土台（ctx）を作る
function makeCtx(p){
  var z = zoneById(p.zone);
  var dir = p.dir || 'S';
  var F = p.F, D = p.D;
  var Xraw = (dir==='S'||dir==='N') ? F : D, Yraw = (dir==='S'||dir==='N') ? D : F;
  var flag = p.flag && p.flag.on ? {on:true, w:Math.max(0, +p.flag.w||0), L:Math.max(0, +p.flag.L||0), pos:p.flag.pos||'mid'} : {on:false};
  // 4辺の道路
  var sd = {};
  SIDES.forEach(function(k){
    var s = (p.sides && p.sides[k]) || {};
    var road = k===dir ? true : !!s.road;
    var W = k===dir ? (p.W != null ? p.W : s.W) : s.W;
    var nik = k===dir ? (p.nikou || s.nikou || 'auto') : (s.nikou || 'auto');
    if (flag.on && k!==dir) road = false;       // 旗竿地はほかの辺に道路が無い
    W = Math.max(0.5, +W || 4);
    sd[k] = {key:k, road:road, Wraw:W, W: road ? Math.max(W, 4) : 0, back: road ? setbackOf(W, nik) : 0, nikou:nik};
  });
  var backS = sd.S.back, backN = sd.N.back, backW = sd.W.back, backE = sd.E.back;
  var poleBack = 0;
  if (flag.on){ poleBack = sd[dir].back; sd[dir].back = 0; }   // 旗竿地は、2項道路の後退は路地状部分の先だけ
  backS = sd.S.back; backN = sd.N.back; backW = sd.W.back; backE = sd.E.back;
  var X = Math.max(0, Xraw - backW - backE), Y = Math.max(0, Yraw - backS - backN);
  var poleL = flag.on ? Math.max(0, flag.L - poleBack) : 0;
  var roads = [];
  SIDES.forEach(function(k){
    if (!sd[k].road) return;
    roads.push({id:k, side:k, W:sd[k].W, Wraw:sd[k].Wraw, back: flag.on ? poleBack : sd[k].back, off: flag.on ? poleL : 0, remote: !!flag.on});
  });
  // 辺の種類：adj＝道路に直接面する、nb＝隣地（旗竿地の道路側も隣地）
  var side = {};
  SIDES.forEach(function(k){ side[k] = {key:k, isRoad: sd[k].road && !flag.on, W: (sd[k].road && !flag.on) ? sd[k].W : 0, len: (k==='S'||k==='N') ? X : Y}; });
  var Wmax = 0; roads.forEach(function(r){ if (r.W > Wmax) Wmax = r.W; });
  var area = X*Y + (flag.on ? flag.w * poleL : 0);
  var setbackArea = (Xraw*Yraw - X*Y) + (flag.on ? flag.w * poleBack : 0);
  // いびつな形（共通/katachi.js）：建ぺい率・容積率に使う敷地面積は、形の本当の面積（2項道路の後退後）。建物は中に入る長方形 X×Y で考える
  if (p.siteArea > 0){ area = +p.siteArea; setbackArea = Math.max(0, +p.siteSetback || 0); }
  var k = kodoDef(p);
  var off = p.off || {};
  var st = STRUCTS[p.struct] || null;
  var ctx = {p:p, z:z, dir:dir, X:X, Y:Y, Xraw:Xraw, Yraw:Yraw, sd:sd, side:side, roads:roads, Wmax:Wmax, flag:flag, poleL:poleL, poleBack:poleBack,
    area:area, setbackArea:setbackArea, kodo:k, off:off,
    base: p.base == null ? 0 : Math.max(0, +p.base), fh: p.fh || 3, d: Math.max(0, p.d||0), c: Math.max(0, p.c==null?0.5:p.c),
    minDim: p.minDim==null ? 2 : p.minDim, nbRelief: p.nbRelief !== false, struct: st};
  ctx.gake = gakeSides(p, Xraw, Yraw);
  ctx.gakeAny = SIDES.some(function(k){ return ctx.gake[k] && ctx.gake[k].band > 0; });
  ctx.far = farLimit(p, ctx);
  ctx.rt = roadTable(z.road, ctx.far.pct);
  return ctx;
}
// ---------- がけ条例（共通/gake.js）：辺ごとに「建てない帯」の幅を出す ----------
// p.gake = {region, dosha, cost:{oldType,newType,access,neighbor,road}, sides:{S:{pos:'above'|'below'|'', H, angle, wall, measure:'none'|'rebuild'|'rc'|'deep'|'ryudo'}}}
function gakeLib(){
  if (typeof window !== 'undefined' && window.Gake) return window.Gake;
  try { return require('../共通/gake.js'); } catch(e){ return null; }
}
function gakeSides(p, Xraw, Yraw){
  var out = {}, g = p && p.gake, G = g ? gakeLib() : null;
  SIDES.forEach(function(k){ out[k] = null; });
  if (!g || !G || !g.sides) return out;
  SIDES.forEach(function(k){
    var s = g.sides[k];
    if (!s || (s.pos !== 'above' && s.pos !== 'below') || !(+s.H > 0)) return;
    var m = s.measure || 'none', ang = s.angle == null || s.angle === '' ? 90 : +s.angle;
    var q = {region:g.region, H:+s.H, angle:ang, pos:s.pos, wall:s.wall || 'none', dosha:g.dosha, kyoshitsu:true,
      measures:{rebuild: m==='rebuild', rc: m==='rc', deep: m==='deep', ryudo: m==='ryudo'}};
    var j = G.judge(q);
    var keep = (m === 'none') ? j : G.judge(Object.assign({}, q, {measures:{}}));
    var len = (k==='S'||k==='N') ? Xraw : Yraw, c = g.cost || {};
    var cost = null;
    if (m === 'rebuild' || keep.band > 0) cost = G.cost({L:len, H:+s.H, oldType: (s.wall||'none')==='none' ? 'none' : (c.oldType || 'rc'), newType:c.newType || 'L',
      access:c.access || 'ok', neighbor:!!c.neighbor, road:!!c.road, region:g.region, adj:c.adj});
    out[k] = {side:k, pos:s.pos, H:+s.H, angle:ang, wall:s.wall || 'none', measure:m, judge:j, band:j.band, bandKeep:keep.band, len:len, cost:cost};
  });
  return out;
}
// 前の形（テスト用）：道路が1本のときの値
function effSite(p){
  var c = makeCtx(p);
  var main = c.sd[c.dir];
  return {Weff: main.W, Deff: (c.dir==='S'||c.dir==='N') ? c.Y : c.X, back: main.back + c.poleBack, area: c.area, X:c.X, Y:c.Y, setbackArea:c.setbackArea};
}
// 容積率（第52条1項・2項）。道路が2本以上なら一番広い道路の幅
function farLimit(p, ctx){
  var z = zoneById(p.zone);
  ctx = ctx || makeCtx(p);
  var Wm = ctx.Wmax || 4;
  var k = p.coef || z.coef;
  var roadPct = Wm < 12 ? Math.round(Wm * k * 1000)/10 : Infinity;
  var pct = Math.min(p.far, roadPct);
  return {pct:pct, roadPct:roadPct, coef:k, reduced: roadPct < p.far, W:Wm};
}

// 点 (x,y) から、ある辺の境界線までの距離
function distTo(ctx, side, x, y){
  if (side==='S') return y; if (side==='N') return ctx.Y - y; if (side==='W') return x; return ctx.X - x;
}
// 令第132条：2以上の前面道路があるときの「みなし幅員」
function rangeOf(W){ return Math.min(35, W < 4 ? 10 - W/2 : 2*W); }
function deemedW(ctx, r, x, y){
  var roads = ctx.roads;
  if (roads.length < 2 || ctx.off.r132) return r.W;
  var Wm = ctx.Wmax, i, k;
  for (i=0;i<roads.length;i++){ k = roads[i];
    if (k.W >= Wm - EPS && distTo(ctx, k.side, x, y) <= Math.min(2*Wm, 35) + EPS) return Wm; }  // 1項：一番広い道路の幅の2倍以内かつ35m以内
  var dr = distTo(ctx, r.side, x, y);
  if (dr + r.W/2 > 10 + EPS) return Wm;                                                          // 1項：ほかの道路の中心線から10m超
  var w = r.W;
  if (dr <= rangeOf(r.W) + EPS){                                                                 // 2項：2つの道路の両方から近い所
    for (i=0;i<roads.length;i++){ k = roads[i];
      if (k !== r && k.W > w && distTo(ctx, k.side, x, y) <= rangeOf(k.W) + EPS) w = k.W; }
  }
  return w;
}
// 道路 r の道路斜線で、点 (x,y) で許される高さ。rel＝後退距離（null なら、その点までの距離を使う＝その階が一番道路に近いとき）
function roadLimit(ctx, r, x, y, rel){
  var dist = distTo(ctx, r.side, x, y) + r.off;
  var Wd = deemedW(ctx, r, x, y);
  var d = rel == null ? dist : rel;
  var t = dist + Wd + d;                    // 前面道路の反対側の境界線（後退した分だけ外側）からの距離
  if (t > ctx.rt.L + EPS) return Infinity;  // 適用距離より先はかからない
  if (ctx.z.road==='res' && Wd >= 12){      // 第56条3項・4項：12m以上の道路の住居系は、遠い所の勾配1.5
    var T = 1.25*(Wd + 2*d);
    return t < T ? 1.25*t : 1.5*t;
  }
  return ctx.rt.s * t;
}
function northAdd(ctx){ return ctx.side.N.isRoad ? ctx.side.N.W : 0; }
function kodoAdd(ctx){
  var m = ctx.kodo.meas;
  if (!ctx.side.N.isRoad) return 0;
  return m==='half' ? ctx.side.N.W/2 : m==='site' ? 0 : ctx.side.N.W;
}
function northApplies(ctx){
  var p = ctx.p, z = ctx.z;
  if (!(z.north > 0)) return false;
  if (z.chuko && (p.sh || p.nichiei===true)) return false;   // 中高層：日影規制の区域では北側斜線が外れる
  return true;
}
// 点 (x,y) で許される高さ（すべての決まりを重ねたもの）。st＝後退距離などの状態
function heightAt(ctx, x, y, st, which){
  st = st || {rel:{}, a:{}};
  var off = ctx.off, z = ctx.z, h = Infinity, w = which || {};
  if (!off.road && !w.noRoad) ctx.roads.forEach(function(r){ h = Math.min(h, roadLimit(ctx, r, x, y, st.rel[r.id]==null ? null : st.rel[r.id])); });
  if (z.nb && !off.nb && !w.noNb) SIDES.forEach(function(k){
    if (ctx.side[k].isRoad) return;
    var t = distTo(ctx, k, x, y), a = st.a[k];
    var add = !ctx.nbRelief ? 0 : (a==null ? t : a);
    h = Math.min(h, z.nb.b + z.nb.s * (t + add));
  });
  var tN = distTo(ctx, 'N', x, y);
  if (northApplies(ctx) && !off.north && !w.noNorth) h = Math.min(h, z.north + 1.25 * (tN + northAdd(ctx)));
  if (ctx.kodo.slope && !off.kodo && !w.noKodo) h = Math.min(h, kodoHof(ctx.kodo, tN + kodoAdd(ctx)));
  if (!w.noCap) h = Math.min(h, heightCap(ctx).h);
  if (ctx.gakeAny && !off.gake && !w.noGake) SIDES.forEach(function(k){ var gb = ctx.gake[k]; if (gb && gb.band > 0 && distTo(ctx, k, x, y) < gb.band - 1e-9) h = 0; });
  return h;
}
// 絶対高さ・高度地区の最高・そのほかの高さの上限
function heightCap(ctx){
  var p = ctx.p, off = ctx.off, h = Infinity, by = null;
  function cap(v, name){ if (v > 0 && v < h){ h = v; by = name; } }
  if (ctx.z.abs && !off.abs) cap(p.absH, '絶対高さ' + p.absH + 'm');
  var km = Math.max(+p.kodoMax || 0, 0);
  if (!(km > 0) && ctx.kodo.max > 0) km = ctx.kodo.max;
  if (!off.kodoMax && km > 0) cap(km, '高度地区の最高' + km + 'm');
  if (!off.hMax && p.hMax > 0) cap(p.hMax, '高さの上限' + p.hMax + 'm（地区計画・条例など）');
  return {h:h, by:by};
}

// ---------- 階ごとの「入る長方形」 ----------
// 辺 j の、位置 u（辺にそった座標）での必要な離れ t。
function ptOn(ctx, j, u, t){
  if (j==='S') return [u, t]; if (j==='N') return [u, ctx.Y - t]; if (j==='W') return [t, u]; return [ctx.X - t, u];
}
function spanOf(ctx, j){ return (j==='S'||j==='N') ? ctx.Y : ctx.X; }
function sideReq(ctx, j, u, h, st){ return sideReqD(ctx, j, u, h, st).t; }
function sideReqD(ctx, j, u, h, st){
  var z = ctx.z, off = ctx.off, sdj = ctx.side[j];
  var t = sdj.isRoad ? ctx.d : ctx.c, by = sdj.isRoad ? '道路から下げる距離' : '隣地から離す距離';
  function upd(v, tag){ if (v > t + 1e-9){ t = v; by = tag; } }
  var span = spanOf(ctx, j);
  // がけ条例：がけのある辺から、帯の幅だけ離す（すべての階）
  var gb = ctx.gake && ctx.gake[j];
  if (gb && gb.band > 0 && !off.gake) upd(gb.band, 'がけ条例');
  // 道路斜線（この辺の道路）
  if (!off.road) ctx.roads.forEach(function(r){
    if (r.side !== j) return;
    var rel = st.rel[r.id];
    var ok = function(tt){ var q = ptOn(ctx, j, u, tt); return roadLimit(ctx, r, q[0], q[1], rel==null ? null : rel) >= h - 1e-9; };
    var need;
    if (ok(0)) need = 0;
    else if (!ok(span + 50)) need = Infinity;
    else {
      var lo = 0, hi = span + 50;
      for (var it=0; it<80; it++){ var mid = (lo+hi)/2; if (ok(mid)) hi = mid; else lo = mid; }
      need = hi;
      // 念のため：その先で一度ゆるくなってまたきびしくなる所（令132条の区域の境）が無いか確かめる
      for (var s2 = need + 0.1; s2 <= span; s2 += 0.1){ if (!ok(s2)){ var lo2 = s2, hi2 = span + 50; for (var it2=0; it2<60; it2++){ var m2 = (lo2+hi2)/2; if (ok(m2)) hi2 = m2; else lo2 = m2; } need = hi2; s2 = need; } }
    }
    upd(need, '道路斜線');
  });
  // 隣地斜線（道路でない辺）
  if (!sdj.isRoad && z.nb && !off.nb && h > z.nb.b){
    var a = st.a[j];
    var tn = !ctx.nbRelief ? (h - z.nb.b)/z.nb.s : (a==null ? (h - z.nb.b)/(2*z.nb.s) : (h - z.nb.b)/z.nb.s - a);
    upd(tn, '隣地斜線');
  }
  if (j==='N'){
    if (northApplies(ctx) && !off.north && h > z.north) upd((h - z.north)/1.25 - northAdd(ctx), '北側斜線');
    if (ctx.kodo.slope && !off.kodo) upd(kodoInv(ctx.kodo, h) - kodoAdd(ctx), '高度地区');
  }
  return {t:t, by:by};
}
// 辺 j を、令132条の区域の境目で区切る（道路の辺だけ）
function sideBreaks(ctx, j){
  var len = (j==='S'||j==='N') ? ctx.X : ctx.Y, br = [0, len];
  var hasRoad = ctx.roads.some(function(r){ return r.side===j; });
  if (hasRoad && ctx.roads.length >= 2 && !ctx.off.r132){
    ctx.roads.forEach(function(k){
      if (k.side===j) return;
      var adjLow = (j==='S'||j==='N') ? 'W' : 'S', adjHigh = (j==='S'||j==='N') ? 'E' : 'N';
      if (k.side!==adjLow && k.side!==adjHigh) return;
      [Math.min(2*ctx.Wmax, 35), rangeOf(k.W)].forEach(function(rg){
        var u = k.side===adjLow ? rg : len - rg;
        if (u > EPS && u < len - EPS) br.push(u);
      });
    });
  }
  br.sort(function(a,b){ return a-b; });
  var out = [];
  for (var i=0;i<br.length-1;i++) if (br[i+1] - br[i] > 1e-7) out.push([br[i], br[i+1]]);
  return out;
}
function profiles(ctx, h, st){
  var pr = {};
  SIDES.forEach(function(j){
    pr[j] = sideBreaks(ctx, j).map(function(seg){ var d = sideReqD(ctx, j, (seg[0]+seg[1])/2, h, st); return {u0:seg[0], u1:seg[1], t:d.t, by:d.by}; });
  });
  return pr;
}
function maxOver(list, a, b){
  var m = 0;
  for (var i=0;i<list.length;i++){ var q = list[i]; if (q.u0 < b - 1e-9 && q.u1 > a + 1e-9 && q.t > m) m = q.t; }
  return m;
}
// 一番大きい長方形（各辺の必要な離れ＋入れ子の外わく bd の中）
function maxRect(ctx, pr, bd, minDim){
  var X = ctx.X, Y = ctx.Y;
  var xs = [bd.x0, bd.x1], ys = [bd.y0, bd.y1];
  pr.W.forEach(function(q){ xs.push(q.t); ys.push(q.u0, q.u1); });
  pr.E.forEach(function(q){ xs.push(X - q.t); ys.push(q.u0, q.u1); });
  pr.S.forEach(function(q){ ys.push(q.t); xs.push(q.u0, q.u1); });
  pr.N.forEach(function(q){ ys.push(Y - q.t); xs.push(q.u0, q.u1); });
  function uniq(a, lo, hi){ a = a.filter(function(v){ return isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9; }).map(function(v){ return Math.min(hi, Math.max(lo, v)); });
    a.sort(function(p,q){ return p-q; }); var o = []; a.forEach(function(v){ if (!o.length || v - o[o.length-1] > 1e-7) o.push(v); }); return o; }
  xs = uniq(xs, bd.x0, bd.x1); ys = uniq(ys, bd.y0, bd.y1);
  var best = null, bestA = -1;
  for (var i=0;i<xs.length;i++) for (var k=xs.length-1;k>i;k--){
    var xlo = xs[i], xhi = xs[k];
    if (xhi - xlo < minDim - 1e-9) break;
    var ylo0 = Math.max(bd.y0, maxOver(pr.S, xlo, xhi)), yhi0 = Math.min(bd.y1, Y - maxOver(pr.N, xlo, xhi));
    if (yhi0 - ylo0 < minDim - 1e-9) continue;
    var yc = ys.filter(function(v){ return v >= ylo0 - 1e-9 && v <= yhi0 + 1e-9; });
    if (yc[0] === undefined || yc[0] > ylo0 + 1e-9) yc.unshift(ylo0);
    if (yc[yc.length-1] < yhi0 - 1e-9) yc.push(yhi0);
    for (var a=0;a<yc.length;a++) for (var b=yc.length-1;b>a;b--){
      var ylo = yc[a], yhi = yc[b];
      if (yhi - ylo < minDim - 1e-9) break;
      var ar = (xhi-xlo)*(yhi-ylo);
      if (ar <= bestA + 1e-9) break;
      if (maxOver(pr.W, ylo, yhi) > xlo + 1e-9) continue;
      if (X - maxOver(pr.E, ylo, yhi) < xhi - 1e-9) continue;
      best = {x0:xlo, x1:xhi, y0:ylo, y1:yhi}; bestA = ar;
      break;
    }
  }
  return best;
}
function rectArea(r){ return r ? (r.x1-r.x0)*(r.y1-r.y0) : 0; }

// 1階から順に積む。first＝1階の長方形（建ぺい率で小さくしたもの）
function stack(ctx, first, opts){
  opts = opts || {};
  var floors = [], st = {rel:{}, a:{}}, prev = {x0:0, x1:ctx.X, y0:0, y1:ctx.Y}, stopBy = null;
  var cap = heightCap(ctx), z = ctx.z;
  var maxK = opts.maxK || 80;
  for (var k=1; k<=maxK; k++){
    var h = ctx.base + k*ctx.fh;
    if (h > cap.h + 1e-9){ stopBy = cap.by; break; }
    var rect;
    var pr = profiles(ctx, h, st);
    if (k===1 && first) rect = first;
    else rect = maxRect(ctx, pr, prev, ctx.minDim);
    if (!rect){ stopBy = '斜線など（幅か奥行が' + ctx.minDim + 'm未満）'; break; }
    floors.push({k:k, h:h, rect:rect, area:rectArea(rect), by:bindingSides(ctx, pr, rect, prev)});
    if (k===1){ ctx.roads.forEach(function(r){ st.rel[r.id] = rectDist(ctx, rect, r.side) + r.off; }); }
    if (z.nb && h > z.nb.b) SIDES.forEach(function(j){ if (st.a[j]==null && !ctx.side[j].isRoad) st.a[j] = rectDist(ctx, rect, j); });
    prev = rect;
  }
  return {floors:floors, st:st, stopBy:stopBy};
}
function rectDist(ctx, r, j){ return j==='S' ? r.y0 : j==='N' ? ctx.Y - r.y1 : j==='W' ? r.x0 : ctx.X - r.x1; }
// その階の広さを決めている決まり（どの辺がどの決まりで止まっているか）
function bindingSides(ctx, pr, rect, prev){
  var out = {};
  SIDES.forEach(function(j){
    var d = rectDist(ctx, rect, j), lo = (j==='S'||j==='N') ? rect.x0 : rect.y0, hi = (j==='S'||j==='N') ? rect.x1 : rect.y1;
    var need = 0, by = null;
    pr[j].forEach(function(q){ if (q.u0 < hi - 1e-9 && q.u1 > lo + 1e-9 && q.t > need){ need = q.t; by = q.by; } });
    var pd = rectDist(ctx, prev, j);
    if (Math.abs(d - need) < 1e-6 && by) out[j] = by;
    else if (Math.abs(d - pd) < 1e-6 && pd > 1e-6) out[j] = '下の階にそろえる';
    else out[j] = null;
  });
  return out;
}

// 建ぺい率の上限に合わせた1階の候補を作り、一番たくさん建てられる形を選ぶ
function volume(p, off){
  var pp = off ? Object.assign({}, p, {off:off}) : p;
  var ctx = makeCtx(pp);
  var cov = coverage(pp);
  var bldgMax = (ctx.off.bcr) ? Infinity : ctx.area * cov.pct/100;
  var farArea = ctx.area * ctx.far.pct/100;
  var free = stack(ctx, null);
  var chosen = free;
  if (free.floors.length && free.floors[0].area > bldgMax + 1e-9){
    var R1 = free.floors[0].rect;
    var cands = capCandidates(ctx, R1, free.floors.map(function(f){ return f.rect; }), bldgMax);
    var best = null, bestKey = null;
    cands.forEach(function(c){
      var s = stack(ctx, c);
      var sum = 0; s.floors.forEach(function(f){ sum += f.area; });
      var tot = Math.min(sum, farArea), fill = s.floors.length, acc = 0;
      for (var i=0;i<s.floors.length;i++){ acc += s.floors[i].area; if (acc >= farArea - 1e-6){ fill = i+1; break; } }
      var key = [Math.round(tot*100), -fill, -Math.round(c.y0*4), Math.round(sum*100), -Math.round(c.x0*100)];   // 同じなら南に寄せる（日影に有利）
      if (!bestKey || cmpKey(key, bestKey) > 0){ best = s; bestKey = key; }
    });
    // 選んだ候補を南北・東西に少しずつずらして、もっとよい位置がないか確かめる
    if (best){
      var b1 = best.floors[0].rect, bw = b1.x1-b1.x0, bh = b1.y1-b1.y0;
      var tries = [];
      for (var yy = R1.y0; yy <= R1.y1 - bh + 1e-9; yy += 0.25) tries.push({x0:b1.x0, x1:b1.x1, y0:yy, y1:yy+bh});
      tries.push({x0:b1.x0, x1:b1.x1, y0:R1.y1-bh, y1:R1.y1});
      for (var xx = R1.x0; xx <= R1.x1 - bw + 1e-9; xx += 0.25) tries.push({x0:xx, x1:xx+bw, y0:b1.y0, y1:b1.y1});
      tries.push({x0:R1.x1-bw, x1:R1.x1, y0:b1.y0, y1:b1.y1});
      tries.forEach(function(c){
        var s = stack(ctx, c);
        var sum = 0; s.floors.forEach(function(f){ sum += f.area; });
        var tot = Math.min(sum, farArea), fill = s.floors.length, acc = 0;
        for (var i=0;i<s.floors.length;i++){ acc += s.floors[i].area; if (acc >= farArea - 1e-6){ fill = i+1; break; } }
        var key = [Math.round(tot*100), -fill, -Math.round(c.y0*4), Math.round(sum*100), -Math.round(c.x0*100)];   // 同じなら南に寄せる（日影に有利）
        if (cmpKey(key, bestKey) > 0){ best = s; bestKey = key; }
      });
      chosen = best;
    }
  }
  var floors = chosen.floors, sum = 0;
  floors.forEach(function(f){
    sum += f.area;
    var r = f.rect, w = r.x1-r.x0, d = r.y1-r.y0;
    f.raw = f.area;
    f.box = {x0:r.x0, x1:r.x1, y0:r.y0, y1:r.y1, depth: (ctx.dir==='S'||ctx.dir==='N') ? d : w, width: (ctx.dir==='S'||ctx.dir==='N') ? w : d, by:f.by};
    f.capped = false;
  });
  var total = Math.min(sum, farArea), fill = floors.length, acc = 0;
  if (sum > farArea + 1e-9){ for (var i=0;i<floors.length;i++){ acc += floors[i].area; if (acc >= farArea - 1e-9){ fill = i+1; break; } } }
  return {ctx:ctx, site:{Weff:ctx.sd[ctx.dir].W, Deff:(ctx.dir==='S'||ctx.dir==='N')?ctx.Y:ctx.X, back:ctx.sd[ctx.dir].back + ctx.poleBack, area:ctx.area, X:ctx.X, Y:ctx.Y, setbackArea:ctx.setbackArea},
    cov:cov, far:ctx.far, bldgMax:bldgMax, farArea:farArea, floors:floors, shapeSum:sum, total:total, maxFloors:floors.length,
    floorsToFill:fill, farBinding: sum > farArea + 1e-9, stopBy:chosen.stopBy, st:chosen.st, firstCapped: chosen !== free};
}
function cmpKey(a, b){ for (var i=0;i<a.length;i++){ if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; } return 0; }
function capCandidates(ctx, R1, rects, cap){
  var md = ctx.minDim, out = [], seen = {};
  // 形の上の階の長方形から、代表を6つまで（いちばん上をふくむ）
  var uniq = [];
  rects.forEach(function(q){ var key = [q.x0,q.x1,q.y0,q.y1].map(function(v){ return Math.round(v*1000); }).join(','); if (!seen[key]){ seen[key] = 1; uniq.push(q); } });
  var qs = [R1];
  if (uniq.length <= 6) qs = qs.concat(uniq);
  else for (var i=1;i<=6;i++) qs.push(uniq[Math.round((uniq.length-1)*i/6)]);
  seen = {};
  function push(r){
    if (!r) return;
    r = {x0:Math.max(R1.x0, r.x0), x1:Math.min(R1.x1, r.x1), y0:Math.max(R1.y0, r.y0), y1:Math.min(R1.y1, r.y1)};
    if (r.x1 - r.x0 < md - 1e-9 || r.y1 - r.y0 < md - 1e-9) return;
    if (rectArea(r) > cap + 1e-6) return;
    var key = [r.x0,r.x1,r.y0,r.y1].map(function(v){ return Math.round(v*1000); }).join(',');
    if (seen[key]) return; seen[key] = 1; out.push(r);
  }
  qs.forEach(function(q){
    var w = q.x1-q.x0, h = q.y1-q.y0;
    if (w*h > cap + 1e-9){
      var h2 = cap/w, w2 = cap/h;
      if (h2 >= md - 1e-9){ push({x0:q.x0, x1:q.x1, y0:q.y0, y1:q.y0+h2}); push({x0:q.x0, x1:q.x1, y0:q.y1-h2, y1:q.y1}); push({x0:q.x0, x1:q.x1, y0:(q.y0+q.y1-h2)/2, y1:(q.y0+q.y1+h2)/2}); }
      if (w2 >= md - 1e-9){ push({x0:q.x0, x1:q.x0+w2, y0:q.y0, y1:q.y1}); push({x0:q.x1-w2, x1:q.x1, y0:q.y0, y1:q.y1}); push({x0:(q.x0+q.x1-w2)/2, x1:(q.x0+q.x1+w2)/2, y0:q.y0, y1:q.y1}); }
    } else {
      [['y1','y0','x1','x0'],['y0','y1','x0','x1'],['x1','x0','y1','y0'],['x0','x1','y0','y1'],['ys','xs'],['xs','ys']].forEach(function(order){ push(grow(q, R1, cap, order)); });
    }
  });
  return out;
}
// 長方形 q を、外わく R の中で面積 A まで広げる（order の順に辺を動かす。ys/xs は両側へ同じだけ）
function grow(q, R, A, order){
  var r = {x0:q.x0, x1:q.x1, y0:q.y0, y1:q.y1};
  order.forEach(function(e){
    var cur = rectArea(r);
    if (cur >= A - 1e-9) return;
    var w = r.x1-r.x0, h = r.y1-r.y0;
    if (e==='y1') r.y1 = Math.min(R.y1, r.y0 + A/w);
    else if (e==='y0') r.y0 = Math.max(R.y0, r.y1 - A/w);
    else if (e==='x1') r.x1 = Math.min(R.x1, r.x0 + A/h);
    else if (e==='x0') r.x0 = Math.max(R.x0, r.x1 - A/h);
    else if (e==='ys'){ var add = (A/w - h)/2; var a0 = Math.min(add, r.y0 - R.y0), a1 = Math.min(add, R.y1 - r.y1); r.y0 -= a0; r.y1 += a1;
      var lack = A/w - (r.y1-r.y0); if (lack > 1e-9){ var m0 = Math.min(lack, r.y0 - R.y0); r.y0 -= m0; r.y1 = Math.min(R.y1, r.y1 + lack - m0); } }
    else if (e==='xs'){ var ad = (A/h - w)/2; var b0 = Math.min(ad, r.x0 - R.x0), b1 = Math.min(ad, R.x1 - r.x1); r.x0 -= b0; r.x1 += b1;
      var lk = A/h - (r.x1-r.x0); if (lk > 1e-9){ var n0 = Math.min(lk, r.x0 - R.x0); r.x0 -= n0; r.x1 = Math.min(R.x1, r.x1 + lk - n0); } }
  });
  return r;
}

// どの決まりがどれだけ効いているか（1つずつ外して比べる）
function analyze(p){
  var base = volume(p);
  var ctx = base.ctx, z = ctx.z;
  var keys = [['road','道路斜線'],['bcr','建ぺい率']];
  if (z.nb) keys.push(['nb','隣地斜線']);
  if (northApplies(ctx)) keys.push(['north','北側斜線']);
  if (ctx.kodo.slope) keys.push(['kodo','高度地区（斜線）']);
  if (z.abs) keys.push(['abs','絶対高さ']);
  if ((+p.kodoMax > 0) || ctx.kodo.max > 0) keys.push(['kodoMax','高度地区（最高の高さ）']);
  if (p.hMax > 0) keys.push(['hMax','そのほかの高さの上限']);
  if (ctx.gakeAny) keys.push(['gake','がけ条例（離す帯）']);
  var effects = keys.map(function(k){
    var o = Object.assign({}, p.off || {}); o[k[0]] = true;
    var v = volume(p, o);
    return {key:k[0], name:k[1], delta: Math.max(0, v.shapeSum - base.shapeSum)};
  });
  effects.sort(function(a,b){ return b.delta - a.delta; });
  var binding;
  if (base.farBinding) binding = {key:'far', name: base.far.reduced ? '容積率（道路の幅で下がっている）' : '容積率'};
  else if (effects.length && effects[0].delta > 1e-6) binding = {key:effects[0].key, name:effects[0].name};
  else binding = {key:'site', name:'敷地の広さ'};
  base.effects = effects; base.binding = binding;
  base.plan = makePlan(p, base);
  // 建てる建物で、さらに止まった理由があれば、それを「いちばん効いている」にする
  var pl = base.plan;
  if (pl.total < base.total - 0.05){
    var lost = [['shadow','日影規制', pl.shadowCut], ['fire','耐火・構造の決まり', pl.fireCut], ['flag','旗竿地の条例', pl.flagCut], ['roofx','屋根が斜線に入らない', 0]];
    lost.sort(function(a,b){ return b[2]-a[2]; });
    if (lost[0][2] > 0.05) base.binding = {key:lost[0][0], name:lost[0][1]};
  }
  return base;
}

// ---------- 実際に建てる建物（容積率・耐火・旗竿・日影で整える）と屋根 ----------
function makePlan(p, v){
  var ctx = v.ctx, st = v.st;
  var notes = [];
  var fc = p.fireCap === false ? {floors:Infinity, area:Infinity, height:Infinity, eave:Infinity, why:[]} : fireCaps(p);
  var capFloors = fc.floors, capArea = Math.min(v.farArea, fc.area);
  var flagRes = null;
  // 1回目：容積率と耐火の上限で積む
  var fl = takeFloors(ctx, v.floors, capFloors, capArea, fc);
  var fireCut = Math.max(0, sumA(takeFloors(ctx, v.floors, Infinity, v.farArea, null)) - sumA(fl));
  // 旗竿地の条例
  var flagCut = 0;
  if (ctx.flag.on){
    var before = sumA(fl), pref = p.pref || 'other';
    var r1 = flagRule(pref, ctx.flag.L, ctx.flag.w, sumA(fl), fl.length, p.fireBldg, p.use, ctx.area);
    if (r1.banned) fl = [];
    else {
      var cf = Math.min(capFloors, r1.capFloors), ca = Math.min(capArea, r1.capArea), okk = true;
      if (!r1.ok){
        // 幅が足りない：延べ200㎡以下にすれば足りる都県なら、延べを200㎡に下げる
        var r2 = flagRule(pref, ctx.flag.L, ctx.flag.w, 200, Math.min(fl.length, 3), p.fireBldg, p.use, ctx.area);
        if (r2.ok && !r2.banned){ ca = Math.min(ca, 200); cf = Math.min(cf, r2.capFloors); }
        else okk = false;
      }
      fl = okk ? takeFloors(ctx, v.floors, cf, ca, fc) : [];
    }
    flagRes = flagRule(pref, ctx.flag.L, ctx.flag.w, sumA(fl), fl.length, p.fireBldg, p.use, ctx.area);
    if (!fl.length) flagRes.banned = true;
    flagRes.reduced = sumA(fl) < before - 0.05;
    flagCut = Math.max(0, before - sumA(fl));
  }
  // 屋根
  var roof = fitRoof(ctx, fl, st, p);
  // 日影規制
  var sh = null, shadowCut = 0;
  if (p.sh && ctx.z.sh){
    var a0 = sumA(fl);
    var res = shadowTrim(ctx, fl, st, p, roof);
    fl = res.floors; roof = res.roof; sh = res.sh;
    shadowCut = Math.max(0, a0 - sumA(fl));
  }
  var n = fl.length, eave = n ? ctx.base + n*ctx.fh : 0, height = eave + (roof ? roof.rise : 0);
  var total = sumA(fl), area2F = fl.length >= 2 ? fl[1].area : 0;
  var req = fireRequired(p, n, total, height, area2F);
  return {floors:fl, total:total, n:n, eave:eave, height:height, roof:roof, shadow:sh, fireCaps:fc, fireReq:req, flag:flagRes,
    fireCut:fireCut, flagCut:flagCut, shadowCut:shadowCut, notes:notes};
}
function sumA(fl){ var s = 0; fl.forEach(function(f){ s += f.area; }); return s; }
// 形の上の階から、上限（階数・延べ面積・高さ）の中で積む。最後の階は容積率に合わせて小さくする
function takeFloors(ctx, floors, capFloors, capArea, fc){
  var out = [], acc = 0, md = ctx.minDim;
  for (var i=0;i<floors.length;i++){
    var f = floors[i];
    if (out.length >= capFloors) break;
    if (fc && f.h > fc.eave + 1e-9) break;
    if (fc && isFinite(fc.height) && f.h > fc.height + 1e-9) break;
    var r = {x0:f.rect.x0, x1:f.rect.x1, y0:f.rect.y0, y1:f.rect.y1};
    var a = rectArea(r);
    if (acc + a > capArea + 1e-6){
      var rest = capArea - acc, w = r.x1 - r.x0, d = r.y1 - r.y0;
      if (rest / w >= md - 1e-9) r.y1 = r.y0 + rest / w;          // 北側を下げて小さくする
      else if (rest / d >= md - 1e-9) r.x1 = r.x0 + rest / d;
      else {
        // 残りが細すぎて1階分にならないときは、すぐ下の階と半分ずつに分ける（下の階 ≧ 上の階、入れ子のまま）
        var last = out[out.length-1];
        if (!last) break;
        // 2つの階の北の端を同じ線 Ys にそろえて、合計が A になるようにする
        var A = last.area + rest, lw = last.rect.x1 - last.rect.x0;
        var Ys = (A + lw*last.rect.y0 + w*r.y0) / (lw + w);
        if (Ys - r.y0 < md - 1e-9 || Ys > Math.min(last.rect.y1, r.y1) + 1e-9) break;
        last.rect.y1 = Ys; last.area = rectArea(last.rect); last.full = false;
        r = {x0:r.x0, x1:r.x1, y0:r.y0, y1:Ys};
      }
      a = rectArea(r);
    }
    out.push({k:f.k, h:f.h, rect:r, area:a, full: Math.abs(a - f.area) < 1e-6});
    acc += a;
    if (acc >= capArea - 1e-6) break;
  }
  return out;
}
// 屋根：木造・軽量鉄骨は勾配屋根（切妻か片流れ）、ほかは陸屋根。斜線の中に入る形を選ぶ
function fitRoof(ctx, fl, st, p){
  if (!fl.length) return {type:'none', rise:0};
  var want = p.roof || (ctx.struct ? ctx.struct.roof : 'flat');
  var top = fl[fl.length-1].rect, he = ctx.base + fl.length*ctx.fh;
  var pitch = p.pitch == null ? 0.4 : p.pitch;
  if (want === 'flat') return {type:'flat', rise:0, he:he, rect:top};
  var w = top.x1-top.x0, d = top.y1-top.y0;
  var tries = [];
  if (want === 'gable'){ tries.push({type:'gable', axis: w >= d ? 'x' : 'y'}); tries.push({type:'gable', axis: w >= d ? 'y' : 'x'}); }
  ['N','S','E','W'].forEach(function(lowSide){ tries.push({type:'shed', low:lowSide}); });
  if (want === 'shed') tries.sort(function(a,b){ return (a.type==='shed'?0:1) - (b.type==='shed'?0:1); });
  for (var i=0;i<tries.length;i++){
    var r = Object.assign({rise:0, he:he, rect:top, pitch:pitch}, tries[i]);
    r.rise = roofRise(r);
    if (roofFits(ctx, r, st)) { r.adjusted = (r.type !== want) || i > 0; return r; }
  }
  // 勾配をゆるくして試す
  for (var pc = pitch - 0.1; pc >= 0.1 - 1e-9; pc -= 0.1){
    for (var j=0;j<tries.length;j++){
      var r2 = Object.assign({rise:0, he:he, rect:top, pitch:pc}, tries[j]);
      r2.rise = roofRise(r2);
      if (roofFits(ctx, r2, st)){ r2.adjusted = true; return r2; }
    }
  }
  return {type:'flat', rise:0, he:he, rect:top, adjusted:true, fallback:true};
}
function roofRise(r){
  var w = r.rect.x1-r.rect.x0, d = r.rect.y1-r.rect.y0;
  if (r.type==='gable') return r.pitch * ((r.axis==='x' ? d : w)/2);   // axis＝棟の向き
  if (r.type==='shed') return r.pitch * ((r.low==='N'||r.low==='S') ? d : w);
  return 0;
}
// 屋根の高さ（点 x,y）
function roofZ(r, x, y){
  var R = r.rect;
  if (r.type==='gable'){
    if (r.axis==='x'){ var cy = (R.y0+R.y1)/2; return r.he + r.pitch * ((R.y1-R.y0)/2 - Math.abs(y - cy)); }
    var cx = (R.x0+R.x1)/2; return r.he + r.pitch * ((R.x1-R.x0)/2 - Math.abs(x - cx));
  }
  if (r.type==='shed'){
    if (r.low==='N') return r.he + r.pitch * (R.y1 - y);
    if (r.low==='S') return r.he + r.pitch * (y - R.y0);
    if (r.low==='E') return r.he + r.pitch * (R.x1 - x);
    return r.he + r.pitch * (x - R.x0);
  }
  return r.he;
}
function roofFits(ctx, r, st){
  var R = r.rect, n = 8;
  for (var i=0;i<=n;i++) for (var k=0;k<=n;k++){
    var x = R.x0 + (R.x1-R.x0)*i/n, y = R.y0 + (R.y1-R.y0)*k/n;
    if (roofZ(r, x, y) > heightAt(ctx, x, y, st) + 1e-6) return false;
  }
  return true;
}

// ---------- 日影の計算 ----------
// 冬至の日の太陽の高さ・方位（真太陽時）。方位は南から西まわりを＋（度）
function sunPos(lat, hour){
  var d2r = Math.PI/180, dec = -23.44*d2r, phi = lat*d2r, H = 15*(hour-12)*d2r;
  var sa = Math.sin(phi)*Math.sin(dec) + Math.cos(phi)*Math.cos(dec)*Math.cos(H);
  var alt = Math.asin(sa);
  var ca = Math.cos(alt);
  var sA = Math.cos(dec)*Math.sin(H)/ca;
  var cA = (sa*Math.sin(phi) - Math.sin(dec))/(ca*Math.cos(phi));
  return {alt:alt/d2r, az:Math.atan2(sA, cA)/d2r};
}
// 建物を「箱」の集まりにする（階は地面から屋根まで。入れ子なので重ねると段々の形）
function shadowBoxes(ctx, fl, roof){
  var bx = [];
  fl.forEach(function(f){ bx.push({x0:f.rect.x0, x1:f.rect.x1, y0:f.rect.y0, y1:f.rect.y1, z:ctx.base + f.k*ctx.fh}); });
  if (roof && roof.rise > 0){
    var R = roof.rect, n = 4;
    for (var i=0;i<n;i++){
      var b;
      var alongY = (roof.type==='gable' && roof.axis==='x') || (roof.type==='shed' && (roof.low==='N'||roof.low==='S'));
      if (alongY){ var y0 = R.y0 + (R.y1-R.y0)*i/n, y1 = R.y0 + (R.y1-R.y0)*(i+1)/n; b = {x0:R.x0, x1:R.x1, y0:y0, y1:y1};
        b.z = Math.max(roofZ(roof, R.x0, y0), roofZ(roof, R.x0, y1), roofZ(roof, R.x0, (y0+y1)/2)); }
      else { var x0 = R.x0 + (R.x1-R.x0)*i/n, x1 = R.x0 + (R.x1-R.x0)*(i+1)/n; b = {x0:x0, x1:x1, y0:R.y0, y1:R.y1};
        b.z = Math.max(roofZ(roof, x0, R.y0), roofZ(roof, x1, R.y0), roofZ(roof, (x0+x1)/2, R.y0)); }
      bx.push(b);
    }
  }
  return bx;
}
// 点 P（測る面の高さ m）が、太陽の方向に向かって箱に当たるか
function shaded(px, py, m, ux, uy, cot, boxes){
  for (var i=0;i<boxes.length;i++){
    var b = boxes[i];
    if (b.z <= m) continue;
    var smax = (b.z - m) * cot;                 // 箱の上の端まで届く水平距離
    var lo = 0, hi = smax;
    if (Math.abs(ux) < 1e-12){ if (px < b.x0 || px > b.x1) continue; }
    else { var a1 = (b.x0 - px)/ux, a2 = (b.x1 - px)/ux; if (a1 > a2){ var tt = a1; a1 = a2; a2 = tt; } lo = Math.max(lo, a1); hi = Math.min(hi, a2); }
    if (Math.abs(uy) < 1e-12){ if (py < b.y0 || py > b.y1) continue; }
    else { var c1 = (b.y0 - py)/uy, c2 = (b.y1 - py)/uy; if (c1 > c2){ var t2 = c1; c1 = c2; c2 = t2; } lo = Math.max(lo, c1); hi = Math.min(hi, c2); }
    if (lo <= hi + 1e-12) return true;
  }
  return false;
}
// 敷地境界線から dist m の線の上の点（道路側は令第135条の12で境界線を外側にみなす）
function measureShift(ctx){
  var s = {};
  SIDES.forEach(function(k){ var sd = ctx.side[k]; s[k] = sd.isRoad ? (sd.W <= 10 ? sd.W/2 : sd.W - 5) : 0; });
  return s;
}
function linePoints(ctx, dist, step){
  var s = measureShift(ctx), x0 = -s.W, x1 = ctx.X + s.E, y0 = -s.S, y1 = ctx.Y + s.N, pts = [];
  step = step || 0.5;
  function seg(ax, ay, bx, by){ var L = Math.hypot(bx-ax, by-ay), n = Math.max(1, Math.ceil(L/step)); for (var i=0;i<=n;i++) pts.push([ax + (bx-ax)*i/n, ay + (by-ay)*i/n]); }
  function arc(cx, cy, a0, a1){ for (var a = a0; a <= a1 + 1e-9; a += 10){ var r = a*Math.PI/180; pts.push([cx + dist*Math.cos(r), cy + dist*Math.sin(r)]); } }
  seg(x0 - dist, y0, x0 - dist, y1);  arc(x0, y1, 90, 180);
  seg(x0, y1 + dist, x1, y1 + dist);  arc(x1, y1, 0, 90);
  seg(x1 + dist, y1, x1 + dist, y0);  arc(x1, y0, -90, 0);  arc(x0, y0, 180, 270);
  return pts;
}
// 各点の日影の時間（時間）。dt＝分
function shadowHours(ctx, boxes, pts, m, lat, dt){
  dt = dt || 3;
  var n = Math.round(480/dt), out = new Array(pts.length);
  for (var i=0;i<pts.length;i++) out[i] = 0;
  for (var s=0; s<n; s++){
    var hour = 8 + (s + 0.5)*dt/60, sp = sunPos(lat, hour);
    if (sp.alt <= 0) continue;
    var az = sp.az*Math.PI/180, ux = -Math.sin(az), uy = -Math.cos(az), cot = 1/Math.tan(sp.alt*Math.PI/180);
    for (var i2=0;i2<pts.length;i2++) if (shaded(pts[i2][0], pts[i2][1], m, ux, uy, cot, boxes)) out[i2] += dt/60;
  }
  return out;
}
function shadowCheck(ctx, fl, roof, p, dt, step){
  var z = ctx.z, sh = p.sh, n = fl.length;
  var eave = n ? ctx.base + n*ctx.fh : 0, height = eave + (roof ? roof.rise : 0);
  var target = z.sh===1 ? (eave > 7 + 1e-9 || n >= 3) : (height > 10 + 1e-9);
  var res = {hm:sh.hm, t1:sh.t1, t2:sh.t2, target:target, eave:eave, height:height, max5:0, max10:0, ok:true, lat:p.lat||35.7};
  if (!target || !n) return res;
  var boxes = shadowBoxes(ctx, fl, roof);
  var p5 = linePoints(ctx, 5, step), p10 = linePoints(ctx, 10, step);
  var h5 = shadowHours(ctx, boxes, p5, sh.hm, res.lat, dt), h10 = shadowHours(ctx, boxes, p10, sh.hm, res.lat, dt);
  var i, w5 = 0, w10 = 0;
  for (i=0;i<h5.length;i++) if (h5[i] > res.max5){ res.max5 = h5[i]; w5 = i; }
  for (i=0;i<h10.length;i++) if (h10[i] > res.max10){ res.max10 = h10[i]; w10 = i; }
  res.at5 = p5[w5]; res.at10 = p10[w10];
  res.ok = res.max5 <= sh.t1 + 1e-9 && res.max10 <= sh.t2 + 1e-9;
  return res;
}
// こえるときは、上の階の北側から削る（だめなら1階分なくす）
function shadowTrim(ctx, fl, st, p, roof){
  fl = fl.map(function(f){ return {k:f.k, h:f.h, rect:Object.assign({}, f.rect), area:f.area, full:f.full}; });
  var sh = shadowCheck(ctx, fl, roof, p, 6, 1), steps = 0, md = ctx.minDim, trimmed = false;
  while (!sh.ok && fl.length && steps < 400){
    steps++; trimmed = true;
    var top = fl[fl.length-1], r = top.rect;
    if (r.y1 - 0.5 - r.y0 >= md - 1e-9){ r.y1 -= 0.5; top.area = rectArea(r); top.full = false; }
    else fl.pop();
    roof = fitRoof(ctx, fl, st, p);
    sh = shadowCheck(ctx, fl, roof, p, 6, 1);          // あらく確かめて、だいじょうぶそうなら細かく確かめる
    if (sh.ok){ var fine = shadowCheck(ctx, fl, roof, p, 2, 0.5); if (!fine.ok) sh = fine; }
  }
  sh = shadowCheck(ctx, fl, roof, p, 2, 0.5);
  sh.trimmed = trimmed;
  return {floors:fl, roof:roof, sh:sh};
}

// ---------- 建築費 ----------
// 国土交通省「建築着工統計調査」令和7年度計：居住専用住宅の 工事費予定額÷床面積（万円/坪）
var STAT = {
  national:{wood:75.3, s:112.5, rc:127.1, src:114.7},
  tokyo:   {wood:79.2, s:136.3, rc:151.7, src:129.7}
};
var USE_K = {house:1.00, apart:0.95, mansion:1.10};          // 業界の一般的な目安（この道具で決めた係数）
var GRADE_K = {low:[0.80,1.00], std:[1.00,1.30], high:[1.30,1.80]};
var FIRE_K = {none:[1,1], juntaika:[1.00,1.05], taika:[1.20,1.35]};   // 木造だけ：燃えにくくする分（業界の一般的な目安）
var DEMO_UNIT = {wood:[3,6], s:[4,7], rc:[6,10]};             // 解体（万円/坪）業界の一般的な目安
var DEFAULTS = {
  house:   {extra:[['給排水の引込み',30,100],['外構（門・塀・駐車場など）',100,300],['地盤改良（調査しだい）',0,200]], design:[3,10], permit:[20,50],
            misc:[['登記（表示・保存・抵当権）',20,50],['ローンの手数料・保証料',30,100],['火災・地震保険',20,60],['水道の負担金（自治体による）',0,100],['その他（地鎮祭・近所へのあいさつ等）',10,50]]},
  apart:   {extra:[['給排水の引込み',50,150],['外構（駐輪場・ごみ置場など）',100,300],['地盤改良（調査しだい）',0,300]], design:[5,10], permit:[30,80],
            misc:[['登記（表示・保存・抵当権）',30,80],['ローンの手数料・保証料',50,200],['火災・地震保険',30,100],['水道の負担金（自治体による）',0,300],['その他（地鎮祭・入居者募集の準備等）',20,100]]},
  mansion: {extra:[['給排水の引込み',100,300],['外構（植栽・駐車場など）',200,600],['地盤改良・杭（調査しだい）',0,500]], design:[5,10], permit:[50,150],
            misc:[['登記（表示・保存・抵当権）',30,100],['ローンの手数料・保証料',100,300],['火災・地震保険',50,150],['水道の負担金（自治体による）',0,500],['その他（地鎮祭・入居者募集の準備等）',30,150]]}
};
function unitPrice(c){
  if (c.manual) return {lo:c.manual[0], hi:c.manual[1], base:null};
  var st = STRUCTS[c.struct] || STRUCTS.wood;
  var base = STAT[c.region][st.cost] * st.costK, u = USE_K[c.use], g = GRADE_K[c.grade];
  var fk = (c.struct==='wood' && c.fire && FIRE_K[c.fire]) ? FIRE_K[c.fire] : [1,1];
  return {lo: base*u*g[0]*fk[0], hi: base*u*g[1]*fk[1], base:base, stat:STAT[c.region][st.cost], costK:st.costK, fireK:fk};
}
function buildCost(c){
  var tsubo = c.area / TSUBO;
  var up = unitPrice(c);
  var r = {tsubo:tsubo, unit:up, rows:[]};
  function add(name, lo, hi, taxable){ r.rows.push({name:name, lo:lo, hi:hi, taxable:taxable}); }
  add('建物の本体工事', up.lo*tsubo, up.hi*tsubo, true);
  if (c.demo && c.demo.on) add('古い家の解体', c.demo.tsubo*c.demo.lo, c.demo.tsubo*c.demo.hi, true);
  var exLo=0, exHi=0; (c.extra||[]).forEach(function(x){ exLo+=x[1]; exHi+=x[2]; });
  add('付帯工事（引込み・外構・地盤）', exLo, exHi, true);
  var hon = r.rows[0];
  add('設計・監理料と確認申請', hon.lo*c.design[0]/100 + c.permit[0], hon.hi*c.design[1]/100 + c.permit[1], true);
  var taxLo=0, taxHi=0;
  r.rows.forEach(function(x){ if (x.taxable){ taxLo+=x.lo; taxHi+=x.hi; } });
  var rate = c.taxRate==null ? 0.10 : c.taxRate;
  add('消費税（' + Math.round(rate*100) + '%）', taxLo*rate, taxHi*rate, false);
  var mLo=0, mHi=0; (c.misc||[]).forEach(function(x){ mLo+=x[1]; mHi+=x[2]; });
  add('諸費用（登記・ローン・保険など）', mLo, mHi, false);
  r.lo = 0; r.hi = 0; r.rows.forEach(function(x){ r.lo+=x.lo; r.hi+=x.hi; });
  return r;
}
// 建設工事費デフレーター（2020年度=100、住宅総合・木造住宅・非木造住宅）
var DEFL = {years:[2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],
  house:[93.2,93.5,95.2,98.1,100.2,100.0,108.7,115.3,114.9,119.3,122.6],
  wood:[93.5,93.9,95.3,97.9,100.1,100.0,110.3,116.7,114.8,118.8,122.3],
  nonwood:[92.7,92.8,94.8,98.1,100.2,100.0,106.4,113.5,115.1,119.9,123.0]};

// ---------- 前の形の関数（テスト用。道路1本・後退 d のときの道路斜線の離れ） ----------
function roadReqX(p, h){
  var ctx = makeCtx(p), r = ctx.roads[0];
  var st = {rel:{}, a:{}}; st.rel[r.id] = ctx.d + r.off;
  return sideReq(Object.assign({}, ctx, {c:0, d:0}), r.side, 0.5, h, st);
}

// ---------- URL の引数（物件調査のページなどから初期値を受け取る） ----------
function toHalf(s){
  s = String(s == null ? '' : s);
  if (s.normalize) s = s.normalize('NFKC');
  return s.replace(/[\s　]+/g, '');
}
function numParam(s){
  var t = toHalf(s).replace(/,/g, '').replace(/(%|％|m|ｍ|メートル|㎡|平米|坪)$/i, '');
  var n = parseFloat(t);
  return (isFinite(n) && /^-?\d+(\.\d+)?$/.test(t)) ? n : null;
}
function normZone(raw){
  var s = toHalf(raw);
  if (!s) return null;
  for (var i=0;i<ZONES.length;i++){ if (ZONES[i].id === s || ZONES[i].name === s) return ZONES[i].id; }
  s = s.replace(/^第/, '').replace(/^一/, '1').replace(/^二/, '2').replace(/^([12])種/, '$1').replace(/地域$/, '').replace(/^([12])種/, '$1');
  var m;
  if ((m = s.match(/^([12])(低層|低)(住居専用|住専|住)?$/))) return m[1] + 'low';
  if ((m = s.match(/^([12])(中高層|中高|中)(住居専用|住専|住)?$/))) return m[1] + 'mid';
  if ((m = s.match(/^([12])(住居|住)$/))) return m[1] + 'jyu';
  if (/^準住(居)?$/.test(s)) return 'jjyu';
  if (/^田園(住居)?$/.test(s)) return 'den';
  if (/^(近隣商業|近商)$/.test(s)) return 'kin';
  if (/^商業?$/.test(s)) return 'sho';
  if (/^(準工業|準工)$/.test(s)) return 'jko';
  if (/^(工業専用|工専)$/.test(s)) return 'kos';
  if (/^工業?$/.test(s)) return 'ko';
  return null;
}
function normFire(raw){
  var s = toHalf(raw).replace(/地域$/, '');
  if (/^(jun|準防火|準防)$/i.test(s)) return 'jun';
  if (/^(bou|防火)$/i.test(s)) return 'bou';
  if (/^(none|なし|無し|指定なし|0|-|)$/i.test(s)) return 'none';
  return null;
}
function normKodo(raw){
  var s = toHalf(raw).replace(/^第/, '').replace(/高度(地区)?$/, '').replace(/種$/, '');
  if (/^(none|なし|無し|指定なし|0|-|)$/i.test(s)) return 'none';
  s = s.replace(/^一$/, '1').replace(/^二$/, '2').replace(/^三$/, '3');
  if (/^[123]$/.test(s)) return s;
  var u = s.toUpperCase();
  if (KODO[u] && u !== 'NONE') return u;
  return null;
}
function normDir(raw){
  var s = toHalf(raw).replace(/(側|向き)$/, '');
  var t = {S:'S',N:'N',E:'E',W:'W',s:'S',n:'N',e:'E',w:'W','南':'S','北':'N','東':'E','西':'W'};
  return t[s] || null;
}
function normBool(raw){
  var s = toHalf(raw).toLowerCase();
  if (/^(1|true|yes|on|あり|有|はい)$/.test(s)) return true;
  if (/^(0|false|no|off|なし|無|いいえ)$/.test(s)) return false;
  return null;
}
function normPref(raw){
  var s = toHalf(raw).toLowerCase();
  if (/^(tokyo|東京|東京都|13)$/.test(s)) return 'tokyo';
  if (/^(yokohama|横浜|横浜市)$/.test(s)) return 'yokohama';
  if (/^(kanagawa|神奈川|神奈川県|14)$/.test(s)) return 'kanagawa';
  if (/^(saitama|埼玉|埼玉県|11)$/.test(s)) return 'saitama';
  if (/^(chiba|千葉|千葉県|12)$/.test(s)) return 'chiba';
  if (/^(other|その他|そのほか)$/.test(s)) return 'other';
  return null;
}
function normStruct(raw){
  var s = toHalf(raw).toLowerCase();
  var t = {wood:'wood','木造':'wood','w':'wood', ls:'ls','軽量鉄骨':'ls','軽量鉄骨造':'ls', s:'s','鉄骨':'s','鉄骨造':'s','重量鉄骨':'s','重量鉄骨造':'s',
    rc:'rc','rc造':'rc','鉄筋コンクリート':'rc', wrc:'wrc','壁式rc':'wrc','壁式':'wrc', src:'src','src造':'src'};
  return t[s] || null;
}
// ---------------------------------------------------------------- いびつな形（共通/katachi.js の analyze の結果）→ この計算の入力
// この計算は「4辺が東西南北を向いた長方形」と旗竿地でできているので、いびつな形は次の近似にする：
//  ・建物は、形の中に入るいちばん広い長方形（主な道路の辺にそろえた向き）を敷地とみて計算する。
//    となりから離す距離・2項道路の後退はこの計算の側で引くので、長方形は「形そのもの（後退前）」の中で、離す距離0で探す
//  ・建ぺい率・容積率に使う敷地面積は、形の本当の面積（2項道路の後退後）
//  ・道路の辺は、外向きの向きから東西南北のいちばん近い向きに当てる（同じ向きに2本なら広い方）
//  ・旗竿の形（竿が旗の幅の半分以下）なら、竿の幅・長さを旗竿の欄に入れる
// KT：Katachi（ブラウザでは window.Katachi、node では require('../共通/katachi.js')）
function polyInput(res, KT){
  KT = KT || (typeof root !== 'undefined' && root.Katachi) || (typeof require === 'function' ? require('../共通/katachi.js') : null);
  if (!res || !res.ok || res.frontEdge == null || !KT) return null;
  function compass(e){ var ox = -e.nv[0], oy = -e.nv[1], a = Math.atan2(oy, ox) * 180 / Math.PI; return a > -45 && a <= 45 ? 'E' : a > 45 && a <= 135 ? 'N' : a > -135 && a <= -45 ? 'S' : 'W'; }
  var fe = res.edges[res.frontEdge], dir = compass(fe);
  var frontRoad = null; (res.roads || []).forEach(function(r){ if (r.edge === res.frontEdge) frontRoad = r; });
  var fw = res.frontGroup ? res.frontGroup.w : (frontRoad ? frontRoad.w : 4);
  var sides = {}; SIDES.forEach(function(k){ sides[k] = {road:false, W:4, nikou:'auto'}; });
  var mapped = [];
  (res.roads || []).forEach(function(r){
    var inFront = res.frontGroup && res.frontGroup.edges.indexOf(r.edge) >= 0;
    var k = compass(res.edges[r.edge]);
    mapped.push({edge:r.edge, side:k, w:r.w, front:inFront});
    if (inFront || k === dir) return;
    if (!sides[k].road || r.w > sides[k].W) sides[k] = {road:true, W:r.w, nikou:r.one ? 'one' : 'auto'};
  });
  var pts = res.land.pts, lab = pts.map(function(_, i){ return i; });
  var rect = KT.maxRect({pts:pts, lab:lab}, function(){ return 0; }, fe.deg, {minWidth:0});
  if (!rect) return null;
  var f = res.flag, flagOn = !!(f && f.isFlag && f.poleW > 0 && f.poleW <= f.bodyW * 0.5 + 1e-9);
  return {F:Math.round(rect.w * 100) / 100, D:Math.round(rect.d * 100) / 100, dir:dir, W:fw, nikou:frontRoad && frontRoad.one ? 'one' : 'auto', sides:sides,
    flag:{on:flagOn, w:flagOn ? Math.round(f.poleW * 100) / 100 : 0, L:flagOn ? Math.round(f.poleL * 10) / 10 : 0},
    siteArea:Math.round(res.effArea * 100) / 100, siteSetback:Math.round(res.setbackArea * 100) / 100, rawArea:res.area, rect:rect, roads:mapped};
}

var PARAM_DEFS = [
  {k:'youto',   label:'用途地域',       to:'zone',    f:normZone},
  {k:'kenpei',  label:'建ぺい率',       to:'bcr',     f:numParam, min:10, max:100},
  {k:'youseki', label:'容積率',         to:'far',     f:numParam, min:10, max:2000},
  {k:'koudo',   label:'高度地区',       to:'kodo',    f:normKodo},
  {k:'koudo_max', alias:['koudomax'], label:'高度地区の最高の高さ', to:'kodoMax', f:numParam, min:0, max:300},
  {k:'bouka',   label:'防火の地域',     to:'fire',    f:normFire},
  {k:'road',    label:'前面道路の幅',   to:'W',       f:numParam, min:0.5, max:100},
  {k:'area',    label:'敷地面積（㎡）', to:'A',       f:numParam, min:1, max:1000000},
  {k:'tsubo',   label:'敷地面積（坪）', to:'At',      f:numParam, min:0.3, max:300000},
  {k:'maguchi', label:'間口',           to:'F',       f:numParam, min:1, max:1000},
  {k:'okuyuki', label:'奥行',           to:'D',       f:numParam, min:1, max:1000},
  {k:'dir',     label:'道路の向き',     to:'dir',     f:normDir},
  {k:'kado',    label:'角地緩和',       to:'corner',  f:normBool},
  {k:'nichiei', label:'日影規制の区域', to:'nichiei', f:normBool},
  {k:'zettai',  label:'絶対高さ',       to:'absH',    f:numParam, only:[10,12]},
  {k:'ken',     alias:['pref'], label:'都県', to:'pref', f:normPref},
  {k:'kozo',    alias:['struct'], label:'建物のつくり', to:'struct', f:normStruct},
  {k:'road_s',  label:'南の道路の幅',   to:'rS',      f:numParam, min:0, max:100},
  {k:'road_e',  label:'東の道路の幅',   to:'rE',      f:numParam, min:0, max:100},
  {k:'road_n',  label:'北の道路の幅',   to:'rN',      f:numParam, min:0, max:100},
  {k:'road_w',  label:'西の道路の幅',   to:'rW',      f:numParam, min:0, max:100}
];
function parseParams(search){
  var out = {values:{}, used:[], ignored:[]};
  var q = String(search || '').replace(/^[?#]/, '');
  if (!q) return out;
  var raw = {};
  q.split('&').forEach(function(pair){
    if (!pair) return;
    var i = pair.indexOf('='), k = i < 0 ? pair : pair.slice(0, i), v = i < 0 ? '' : pair.slice(i+1);
    try { k = decodeURIComponent(k.replace(/\+/g, ' ')); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch(e){}
    raw[toHalf(k).toLowerCase()] = v;
  });
  PARAM_DEFS.forEach(function(d){
    var key = d.k, v = raw[key];
    if (v === undefined && d.alias) d.alias.forEach(function(a){ if (v === undefined && raw[a] !== undefined){ v = raw[a]; key = a; } });
    if (v === undefined) return;
    var val = d.f(v);
    var ok = val !== null && val !== undefined;
    if (ok && typeof val === 'number'){
      if (d.min != null && val < d.min) ok = false;
      if (d.max != null && val > d.max) ok = false;
      if (d.only && d.only.indexOf(val) < 0) ok = false;
    }
    if (ok){ out.values[d.to] = val; out.used.push({key:key, label:d.label, raw:v, value:val}); }
    else out.ignored.push({key:key, label:d.label, raw:v});
  });
  if (out.values.At != null && out.values.A == null) out.values.A = Math.round(out.values.At * TSUBO * 100)/100;
  Object.keys(raw).forEach(function(k){
    if (/^kz[rft]?$/.test(k)) return;   // 土地の形（共通/katachi.js）の名前。画面で別に読む
    var known = PARAM_DEFS.some(function(d){ return d.k === k || (d.alias && d.alias.indexOf(k) >= 0); });
    if (!known) out.ignored.push({key:k, label:'（知らない名前）', raw:raw[k]});
  });
  return out;
}

var API = {TSUBO:TSUBO, ZONES:ZONES, zoneById:zoneById, roadTable:roadTable, coverage:coverage, KODO:KODO, kodoDef:kodoDef, kodoHof:kodoHof,
  kodoH:kodoH, kodoReq:kodoReq, kodoInv:kodoInv, STRUCTS:STRUCTS, FIRE_RANK:FIRE_RANK, FIRE_NAME:FIRE_NAME, fireRequired:fireRequired, fireCaps:fireCaps,
  PREFS:PREFS, flagRule:flagRule, NICHIEI_GO:NICHIEI_GO, nichieiTimes:nichieiTimes, nichieiAuto:nichieiAuto, SIDES:SIDES, SIDE_NAME:SIDE_NAME,
  setbackOf:setbackOf, makeCtx:makeCtx, effSite:effSite, farLimit:farLimit, deemedW:deemedW, rangeOf:rangeOf, roadLimit:roadLimit,
  heightAt:heightAt, heightCap:heightCap, northApplies:northApplies, sideReq:sideReq, profiles:profiles, maxRect:maxRect, stack:stack,
  volume:volume, analyze:analyze, makePlan:makePlan, takeFloors:takeFloors, fitRoof:fitRoof, roofZ:roofZ, sunPos:sunPos, shadowBoxes:shadowBoxes,
  shaded:shaded, linePoints:linePoints, shadowHours:shadowHours, shadowCheck:shadowCheck, measureShift:measureShift, distTo:distTo, rectDist:rectDist,
  STAT:STAT, USE_K:USE_K, GRADE_K:GRADE_K, FIRE_K:FIRE_K, DEMO_UNIT:DEMO_UNIT, DEFAULTS:DEFAULTS, unitPrice:unitPrice, buildCost:buildCost, DEFL:DEFL,
  roadReqX:roadReqX, toHalf:toHalf, numParam:numParam, normZone:normZone, normFire:normFire, normKodo:normKodo, normDir:normDir, normBool:normBool,
  normPref:normPref, normStruct:normStruct, PARAM_DEFS:PARAM_DEFS, parseParams:parseParams, polyInput:polyInput, gakeSides:gakeSides};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
root.KENCHIKU = API;
})(typeof window !== 'undefined' ? window : this);
