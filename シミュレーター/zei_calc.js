/* 仲介手数料・印紙税・不動産の税の「概算」の計算。画面から切りはなした部品（node でテストできる）。
   数字の根拠：調べもの_税と印紙と手数料.md（2026-11-02 に公式で確認）。
   2027-03-31 で切れる特例が多いので、期限の日付で本則に切りかえる。 */
(function (root) {
  "use strict";
  const CHECKED = "2026-11-02";
  const floor100 = v => Math.floor(Math.round(v * 1000) / 1000 / 100) * 100;   // 小数の計算のずれで100円少なくならないように
  const yen = v => Math.max(0, Math.round(v));
  // 期限の日付（"YYYY-MM-DD"）までに入っているか。文字のまま比べられる形
  const until = (date, limit) => !date || date <= limit;

  // ---------------------------------------------------------------- 価格の分け方
  // 税込の総額から、建物の税抜・消費税・土地を出す。
  // mode: "none"＝売主が個人（住む家など）で消費税なし／"tax"＝消費税額が分かる／"bldgIn"＝建物の税込が分かる／"split"＝土地と建物の税抜を別々に入れる
  function splitPrice(c) {
    const total = +c.total || 0, r = { ok: true, land: 0, bldgEx: 0, tax: 0, priceEx: 0, total };
    if (c.mode === "none") { r.land = +c.land || 0; r.bldgEx = Math.max(0, total - r.land); r.priceEx = total; return r; }
    if (c.mode === "tax") {
      r.tax = +c.tax || 0; r.bldgEx = r.tax / 0.1; r.land = total - r.bldgEx - r.tax;
    } else if (c.mode === "bldgIn") {
      const b = +c.bldgIn || 0; r.bldgEx = b / 1.1; r.tax = b - r.bldgEx; r.land = total - b;
    } else if (c.mode === "split") {
      r.land = +c.land || 0; r.bldgEx = +c.bldgEx || 0; r.tax = r.bldgEx * 0.1; r.total = r.land + r.bldgEx + r.tax;
    } else if (c.mode === "eval") {
      // 税込の総額を評価額の比で分ける（建物の分は税込と見て、1.1で割って税抜にする）
      const L = +c.evalLand || 0, B = +c.evalBldg || 0;
      if (!(L > 0) || !(B > 0)) return { ok: false, msg: "土地と建物の評価額を入れてください" };
      const b = Math.round(total * B / (L + B));
      r.bldgEx = Math.round(b / 1.1); r.tax = b - r.bldgEx; r.land = total - b;
    } else return { ok: false, msg: "分け方を選んでください" };
    if (r.land < -0.5) return { ok: false, msg: "建物の金額が総額より大きくなっています。入力を確かめてください" };
    r.land = Math.max(0, Math.round(r.land)); r.bldgEx = Math.round(r.bldgEx); r.tax = Math.round(r.tax);
    r.priceEx = r.land + r.bldgEx;
    return r;
  }

  // ---------------------------------------------------------------- 仲介手数料（売買・交換）
  // 税抜の報酬の上限（円）。priceEx＝消費税を含まない代金
  function brokerBaseEx(priceEx) {
    if (!(priceEx > 0)) return 0;
    if (priceEx <= 2e6) return priceEx * 0.05;
    if (priceEx <= 4e6) return priceEx * 0.04 + 2e4;
    return priceEx * 0.03 + 6e4;
  }
  const VENDOR = { taxable: 1.1, exempt: 1.04 };   // 課税事業者×1.1／免税事業者×1.04（上限）
  // c: priceEx, vendor("taxable"|"exempt"), special(800万円以下の特例を合意ずみ), agency(代理)
  function brokerSale(c) {
    const baseEx = brokerBaseEx(c.priceEx), m = VENDOR[c.vendor] || 1.1;
    const canSpecial = c.priceEx > 0 && c.priceEx <= 8e6;
    const usedSpecial = !!(c.special && canSpecial && baseEx < 3e5);
    let ex = usedSpecial ? 3e5 : baseEx;
    if (c.agency) ex *= 2;
    return { baseEx: Math.floor(baseEx), ex: Math.floor(ex), cap: Math.floor(ex * m), m, canSpecial, usedSpecial,
      normalCap: Math.floor(baseEx * (c.agency ? 2 : 1) * m) };
  }
  // 賃貸。c: rentEx(消費税を含まない1か月の賃料), vendor, residential(居住用), consent(依頼のときに承諾あり), vacant(長期の空家等で合意ずみ), keyMoneyEx(居住用以外の、返さない権利金)
  function brokerRent(c) {
    const rent = +c.rentEx || 0, m = VENDOR[c.vendor] || 1.1;
    const totalCap = Math.floor(rent * (c.vacant ? 2 : 1) * m);       // 貸主と借主の合計
    let tenantCap = Math.floor(rent * m);                             // 借主から
    if (c.residential && !c.consent) tenantCap = Math.floor(rent * m / 2);
    let ownerCap = c.vacant ? totalCap : Math.floor(rent * m);        // 貸主から（特例で上限をこえてよいのは貸主だけ）
    if (!c.vacant && c.residential && !c.consent) ownerCap = Math.floor(rent * m / 2);
    let key = null;
    if (!c.residential && c.keyMoneyEx > 0) key = Math.floor(brokerBaseEx(c.keyMoneyEx) * m);
    return { totalCap, tenantCap, ownerCap, keyCap: key, m };
  }

  // ---------------------------------------------------------------- 印紙税
  const LIMIT_STAMP = "2027-03-31";
  const T_1_MAIN = [[9999, 0], [1e5, 200], [5e5, 400], [1e6, 1000], [5e6, 2000], [1e7, 1e4], [5e7, 2e4], [1e8, 6e4], [5e8, 1e5], [1e9, 2e5], [5e9, 4e5], [Infinity, 6e5]];
  const T_1_LOW  = [[9999, 0], [1e5, 200], [5e5, 200], [1e6, 500], [5e6, 1000], [1e7, 5000], [5e7, 1e4], [1e8, 3e4], [5e8, 6e4], [1e9, 16e4], [5e9, 32e4], [Infinity, 48e4]];
  const T_2_MAIN = [[9999, 0], [1e6, 200], [2e6, 400], [3e6, 1000], [5e6, 2000], [1e7, 1e4], [5e7, 2e4], [1e8, 6e4], [5e8, 1e5], [1e9, 2e5], [5e9, 4e5], [Infinity, 6e5]];
  const T_2_LOW  = [[9999, 0], [1e6, 200], [2e6, 200], [3e6, 500], [5e6, 1000], [1e7, 5000], [5e7, 1e4], [1e8, 3e4], [5e8, 6e4], [1e9, 16e4], [5e9, 32e4], [Infinity, 48e4]];
  const T_17 = [[49999, 0], [1e6, 200], [2e6, 400], [3e6, 600], [5e6, 1000], [1e7, 2000], [2e7, 4000], [3e7, 6000], [5e7, 1e4], [1e8, 2e4], [2e8, 4e4], [3e8, 6e4], [5e8, 1e5], [1e9, 15e4], [Infinity, 2e5]];
  const look = (t, a) => { for (const r of t) if (a <= r[0]) return r[1]; return 0; };
  const DOCS = {
    sale: { name: "不動産の売買契約書", no: "第1号の1", main: T_1_MAIN, low: T_1_LOW, none: 200 },
    exchange: { name: "不動産の交換契約書", no: "第1号の1", main: T_1_MAIN, low: T_1_LOW, none: 200 },
    land: { name: "土地の賃貸借・地上権の契約書（権利金など）", no: "第1号の2", main: T_1_MAIN, low: null, none: 200 },
    loan: { name: "金銭消費貸借契約書（ローン）", no: "第1号の3", main: T_1_MAIN, low: null, none: 200 },
    work: { name: "建設工事の請負契約書", no: "第2号", main: T_2_MAIN, low: T_2_LOW, none: 200 },
    workOther: { name: "建設工事以外の請負契約書（設計だけなど）", no: "第2号", main: T_2_MAIN, low: null, none: 200 },
    receipt: { name: "領収書（売上代金）", no: "第17号の1", main: T_17, low: null, none: 200 },
    receiptOther: { name: "受取書（敷金・保証金など売上代金以外）", no: "第17号の2", main: null, low: null, none: 200 }
  };
  // c: doc, amount(記載金額。消費税を区分して書いていれば税抜), date(作る日), copies(通数), electronic(電子契約), business(領収書で営業に関する)
  function stamp(c) {
    const d = DOCS[c.doc]; if (!d) return { ok: false, msg: "書類を選んでください" };
    const copies = Math.max(1, Math.floor(+c.copies || 1)), date = c.date || "";
    const out = { ok: true, doc: d.name, no: d.no, copies, reduced: false, each: 0, total: 0, normalEach: null };
    if (c.electronic) { out.electronic = true; return out; }
    if ((c.doc === "receipt" || c.doc === "receiptOther") && c.business === false) { out.notBusiness = true; return out; }
    const amt = +c.amount || 0;
    if (c.doc === "receiptOther") { out.each = amt > 0 ? (amt >= 5e4 ? 200 : 0) : d.none; out.total = out.each * copies; return out; }
    if (!(amt > 0)) { out.each = d.none; out.noAmount = true; out.total = out.each * copies; return out; }
    const useLow = d.low && until(date, LIMIT_STAMP);
    out.normalEach = look(d.main, amt);
    out.each = look(useLow ? d.low : d.main, amt);
    out.reduced = !!useLow && out.each < out.normalEach;
    out.total = out.each * copies;
    return out;
  }
  // 売買価格を変える契約書。前の契約書が特定できるとき：増えた分だけ／減額は記載金額なし（200円）
  function stampChange(c) {
    const diff = (+c.after || 0) - (+c.before || 0);
    if (diff === 0) return { each: 200, note: "金額が変わらないので、記載金額なしとして計算" };
    if (diff < 0) return { each: 200, note: "減額は記載金額なし（200円）。ただし変更後の金額だけを書くと、その全額が記載金額になります" };
    const useLow = until(c.date, LIMIT_STAMP);
    return { each: look(useLow ? T_1_LOW : T_1_MAIN, diff), diff, note: "増えた分が記載金額。ただし変更後の金額だけを書くと、その全額が記載金額になります" };
  }

  // ---------------------------------------------------------------- 取得のとき：不動産取得税
  const LIMIT_ACQ = "2027-03-31";
  // 中古住宅の控除（新築された日 → 控除）。耐震＝証明が要る期間
  const USED_DED = [
    ["1954-07-01", "1963-12-31", 100e4, true], ["1964-01-01", "1972-12-31", 150e4, true], ["1973-01-01", "1975-12-31", 230e4, true],
    ["1976-01-01", "1981-06-30", 350e4, true], ["1981-07-01", "1981-12-31", 420e4, true], ["1982-01-01", "1985-06-30", 420e4, false],
    ["1985-07-01", "1989-03-31", 450e4, false], ["1989-04-01", "1997-03-31", 1000e4, false], ["1997-04-01", "9999-12-31", 1200e4, false]];
  function usedDeduction(built) { for (const r of USED_DED) if (built >= r[0] && built <= r[1]) return { amount: r[2], quake: r[3] }; return null; }
  // c: date(取得日), landEval, bldgEval, isHousing(住宅), kind("new"|"used"), floorM2(1戸の床面積), landM2, built(新築日), selfUse(自分で住む), quakeOK(耐震の証明あり), longLife(認定長期優良), landTaxable(宅地評価)
  function acquisition(c) {
    const date = c.date || CHECKED, inSpecial = until(date, LIMIT_ACQ);
    const notes = [];
    const landRate = inSpecial ? 0.03 : 0.04;
    const bldgRate = c.isHousing && inSpecial ? 0.03 : 0.04;
    const newRules = date >= "2026-04-01";
    const landFree = newRules ? 16e4 : 10e4, bldgFree = (c.kind === "new" ? (newRules ? 66e4 : 23e4) : (newRules ? 34e4 : 12e4));
    const minM2 = newRules ? 40 : 50, f = +c.floorM2 || 0, areaOK = f >= minM2 && f <= 240;
    // 建物
    let ded = 0, dedName = "控除なし";
    if (c.isHousing && areaOK) {
      if (c.kind === "new") {
        const longOK = c.longLife && date <= "2031-03-31";
        ded = longOK ? 1300e4 : 1200e4; dedName = longOK ? "認定長期優良住宅 1,300万円" : "新築住宅 1,200万円";
      } else if (c.selfUse) {
        const u = usedDeduction(c.built || "");
        if (u && (!u.quake || c.quakeOK)) { ded = u.amount; dedName = "中古住宅 " + Math.round(u.amount / 1e4).toLocaleString() + "万円（新築された日で決まる）"; }
        else if (u && u.quake) notes.push("この築年は、耐震基準に合う証明が無いと控除が使えません");
        else notes.push("新築された日が分からないか、控除の表の外です");
      } else notes.push("中古住宅の控除は、個人が自分で住むときだけです");
    } else if (c.isHousing && f > 0) notes.push(`床面積が${minM2}㎡以上240㎡以下から外れるので、住宅の控除は計算に入れていません`);
    const bldgEval = +c.bldgEval || 0, bldgBase = Math.floor(Math.max(0, bldgEval - Math.min(ded, bldgEval)) / 1000) * 1000;
    const bldgFreeHit = bldgBase < bldgFree;
    const bldgTax = bldgFreeHit ? 0 : floor100(bldgBase * bldgRate);
    // 土地
    const landEval = +c.landEval || 0, half = c.landTaxable !== false && inSpecial;
    const landBase = Math.floor((half ? landEval / 2 : landEval) / 1000) * 1000;
    const landFreeHit = landBase < landFree;
    let landTax = landFreeHit ? 0 : landBase * landRate, relief = 0;
    // 住宅用の土地の減額：45,000円（本則税率なら60,000円）か、土地1㎡の価格×床面積の2倍（200㎡まで）×税率の多いほう
    const canRelief = c.isHousing && areaOK && (c.kind === "new" || c.selfUse);
    if (canRelief && landTax > 0) {
      const perM2 = c.landM2 > 0 ? landBase / c.landM2 : 0;
      relief = Math.max(150e4 * landRate, perM2 * Math.min(f * 2, 200) * landRate);
      landTax = Math.max(0, landTax - relief);
    }
    landTax = floor100(landTax);
    if (!inSpecial) notes.push("2027-04-01以後の日付なので、税率4%・土地の2分の1なしの本則で計算しています（延長されるかは未定）");
    return { landBase, landRate, landTax, landFreeHit, landFree, half, relief: Math.round(relief), bldgBase, bldgRate, bldgTax, bldgFreeHit, bldgFree, ded, dedName, areaOK, minM2, total: landTax + bldgTax, notes };
  }

  // ---------------------------------------------------------------- 取得のとき：登録免許税
  // 課税標準は1,000円未満切り捨て、税額は100円未満切り捨て、最低1,000円
  function regTax(base, rate) {
    if (!(base > 0)) return 0;
    return Math.max(1000, floor100(Math.floor(base / 1000) * 1000 * rate));
  }
  // c: date, landEval, bldgEval, loan, kind("new"|"used"), cause("sale"|"inherit"|"gift"), selfUse, floorM2, houseType("mansion"|"house"), cert("general"|"long"|"lowCarbon"|"resale"), usedQuakeOK
  function registration(c) {
    const date = c.date || CHECKED, cause = c.cause || "sale", items = [];
    const landRate = cause === "inherit" ? 0.004 : cause === "gift" ? 0.02 : (until(date, "2029-03-31") ? 0.015 : 0.02);
    const landWhy = cause === "inherit" ? "相続" : cause === "gift" ? "贈与" : (landRate === 0.015 ? "土地の売買の特例（2029-03-31まで）" : "本則");
    if (c.landEval > 0) items.push({ name: "土地の名義を移す", base: +c.landEval, rate: landRate, why: landWhy, tax: regTax(+c.landEval, landRate) });
    const housing = c.selfUse && cause === "sale" && (+c.floorM2 >= 50) && until(date, "2027-03-31");
    let bRate, why;
    if (c.kind === "new") {
      bRate = 0.004; why = "所有権の保存（本則）";
      if (housing) { bRate = (c.cert === "long" || c.cert === "lowCarbon") ? 0.001 : 0.0015; why = bRate === 0.001 ? "保存の軽減（長期優良・低炭素）" : "保存の軽減（住宅用家屋）"; }
    } else {
      bRate = cause === "inherit" ? 0.004 : 0.02; why = cause === "inherit" ? "相続" : cause === "gift" ? "贈与" : "移転（本則）";
      if (housing) {
        bRate = 0.003; why = "移転の軽減（住宅用家屋）";
        if (c.cert === "lowCarbon" || c.cert === "resale") { bRate = 0.001; why = c.cert === "resale" ? "買取再販" : "低炭素"; }
        if (c.cert === "long") { bRate = c.houseType === "house" ? 0.002 : 0.001; why = "長期優良（" + (c.houseType === "house" ? "戸建て" : "マンション") + "）"; }
      }
    }
    if (c.bldgEval > 0) items.push({ name: c.kind === "new" ? "建物を初めて登記する" : "建物の名義を移す", base: +c.bldgEval, rate: bRate, why, tax: regTax(+c.bldgEval, bRate) });
    if (c.loan > 0) { const r = housing ? 0.001 : 0.004; items.push({ name: "抵当権の設定（ローン）", base: +c.loan, rate: r, why: housing ? "住宅の軽減" : "本則（債権金額に対して）", tax: regTax(+c.loan, r) }); }
    return { items, total: items.reduce((a, b) => a + b.tax, 0), housing: !!housing };
  }

  // ---------------------------------------------------------------- 持っているあいだ：固定資産税・都市計画税
  // c: landEval, landM2, bldgEval, isHousing(住宅が建つ土地), units(戸数), floorM2, fixRate, cityRate, newHouse(新築の減額), newYears
  function holding(c) {
    const fixRate = c.fixRate == null ? 0.014 : +c.fixRate, cityRate = c.cityRate == null ? 0.003 : +c.cityRate;
    const landEval = +c.landEval || 0, bldgEval = +c.bldgEval || 0, m2 = +c.landM2 || 0;
    let fixBase = landEval, cityBase = landEval;
    if (c.isHousing && landEval > 0) {
      const units = Math.max(1, +c.units || 1);
      const limit = c.floorM2 > 0 ? Math.min(m2 || Infinity, c.floorM2 * 10) : (m2 || Infinity);   // 住宅用地は床面積の10倍まで
      const small = Math.min(limit, 200 * units);
      const per = m2 > 0 ? landEval / m2 : 0;
      if (m2 > 0) {
        const general = Math.max(0, limit - small), rest = Math.max(0, m2 - limit);
        fixBase = per * (small / 6 + general / 3 + rest);
        cityBase = per * (small / 3 + general * 2 / 3 + rest);
      } else { fixBase = landEval / 6; cityBase = landEval / 3; }
    }
    const landFix = fixBase * fixRate, landCity = cityBase * cityRate;
    let bldgFix = bldgEval * fixRate; const bldgCity = bldgEval * cityRate;
    let reduced = 0;
    if (c.newHouse && bldgEval > 0) {
      const floor = +c.floorM2 || 0, ratio = floor > 0 ? Math.min(120, floor) / floor : 1;
      reduced = bldgFix * ratio / 2;
    }
    const fixTotal = landFix + bldgFix - reduced, cityTotal = landCity + bldgCity;
    return { fixBase: yen(fixBase), cityBase: yen(cityBase), landFix: yen(landFix), landCity: yen(landCity), bldgFix: yen(bldgFix), bldgCity: yen(bldgCity), reduced: yen(reduced),
      fix: floor100(fixTotal), city: floor100(cityTotal), total: floor100(fixTotal) + floor100(cityTotal), noReduced: floor100(fixTotal + reduced) + floor100(cityTotal) };
  }
  // 固定資産税の精算（慣行と合意。起算日は選ぶ）。dateは "YYYY-MM-DD"、start は "01-01"|"04-01"。買主の負担分を返す
  function proration(c) {
    const d = new Date(c.date + "T00:00:00Z"); if (isNaN(d)) return null;
    const startMD = c.start === "04-01" ? [3, 1] : [0, 1];
    let y = d.getUTCFullYear();
    let from = Date.UTC(y, startMD[0], startMD[1]);
    if (d.getTime() < from) { y -= 1; from = Date.UTC(y, startMD[0], startMD[1]); }
    const to = Date.UTC(y + 1, startMD[0], startMD[1]);
    const days = Math.round((to - from) / 864e5), buyerDays = Math.round((to - d.getTime()) / 864e5);
    return { days, buyerDays, buyer: Math.round((+c.annual || 0) * buyerDays / days), seller: (+c.annual || 0) - Math.round((+c.annual || 0) * buyerDays / days) };
  }

  // ---------------------------------------------------------------- 売るとき：譲渡所得（個人）
  // 所有期間：売った年の1月1日で5年超か
  function holdingClass(acqDate, saleDate) {
    const a = new Date(acqDate + "T00:00:00Z"), s = new Date(saleDate + "T00:00:00Z");
    if (isNaN(a) || isNaN(s)) return null;
    const jan1 = Date.UTC(s.getUTCFullYear(), 0, 1);
    const fullYears = (from, to) => { let y = new Date(to).getUTCFullYear() - from.getUTCFullYear();
      const anniv = Date.UTC(from.getUTCFullYear() + y, from.getUTCMonth(), from.getUTCDate()); if (anniv > to) y -= 1; return y; };
    const yrs = a.getTime() > jan1 ? 0 : fullYears(a, jan1);
    const exact = (n) => a.getTime() <= jan1 && Date.UTC(a.getUTCFullYear() + n, a.getUTCMonth(), a.getUTCDate()) < jan1;
    return { yrs, long: exact(5), over10: exact(10) };
  }
  // c: sale, acqCost(取得費。0か空なら概算), sellCost(譲渡費用), acqDate, saleDate, deduct3000(マイホーム), myHome10(10年超の軽減)
  function capitalGain(c) {
    const sale = +c.sale || 0, cls = holdingClass(c.acqDate, c.saleDate);
    if (!cls) return { ok: false, msg: "買った日と売る日を入れてください" };
    const gaisan = sale * 0.05, given = +c.acqCost || 0, useGaisan = given < gaisan;
    const acq = useGaisan ? gaisan : given, cost = +c.sellCost || 0;
    const gain = Math.max(0, sale - acq - cost);
    const deduct = Math.min(gain, c.deduct3000 ? 3000e4 : 0), taxable = Math.floor((gain - deduct) / 1000) * 1000;
    const usesReduced = !!(c.deduct3000 && c.myHome10 && cls.over10);
    let income, resident, kind;
    if (usesReduced) {
      const low = Math.min(taxable, 6000e4), high = taxable - low;
      income = low * 0.10 + high * 0.15; resident = low * 0.04 + high * 0.05; kind = "マイホーム10年超の軽減（14.21%／20.315%）";
    } else if (cls.long) { income = taxable * 0.15; resident = taxable * 0.05; kind = "長期（20.315%）"; }
    else { income = taxable * 0.30; resident = taxable * 0.09; kind = "短期（39.63%）"; }
    income = Math.floor(income / 100) * 100;
    const surtax = Math.floor(income * 0.021);
    resident = Math.floor(resident / 100) * 100;
    return { ok: true, sale, acq: Math.round(acq), useGaisan, cost, gain: Math.round(gain), deduct: Math.round(deduct), taxable, cls, kind, income, surtax, resident, tax: income + surtax + resident, net: Math.round(sale - cost - (income + surtax + resident)) };
  }

  const API = { CHECKED, splitPrice, brokerBaseEx, brokerSale, brokerRent, DOCS, stamp, stampChange, LIMIT_STAMP, usedDeduction, USED_DED, acquisition, regTax, registration, holding, proration, holdingClass, capitalGain };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ZEI = API;
})(typeof window !== "undefined" ? window : globalThis);
