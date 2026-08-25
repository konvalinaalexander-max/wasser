/* ============================================================
   Phase 4 — Backtest: hat das Modell je gestimmt?

   Lässt die Engine rollend gegen die Vergangenheit laufen. Für jeden
   Stichtag T bekommt sie nur, was bis T bekannt war, und sagt T+1 voraus.
   Verglichen wird mit dem, was tatsächlich passiert ist.

       node tools/backtest.js            Bericht auf der Konsole
       node tools/backtest.js --md       zusätzlich docs/backtest.md

   Gemessen wird gegen eine triviale Vergleichsbasis: „fällig, wenn seit der
   letzten Bewässerung mindestens so viele Tage vergangen sind wie im
   historischen Median dieses Schiffs". Schlägt die Engine die nicht, ist
   sie Zierrat.
   ============================================================ */
const {chromium} = require('playwright');
const fs = require('fs');
const LAUNCH = {executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                args:['--no-sandbox']};

(async () => {
  const b = await chromium.launch(LAUNCH);
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + process.cwd() + '/build/wasserplan.html');
  await pg.waitForTimeout(1200);

  const R = await pg.evaluate(() => {
    /* ---------------- Vorbereitung ---------------- */
    const alleEintraege = Store.db.journal.slice()
      .sort((a, b) => a.datum < b.datum ? -1 : (a.datum > b.datum ? 1 : 0));
    const tage = [...new Set(alleEintraege.map(e => e.datum))].sort();

    /* Journalzeile → betroffene Schiff-IDs */
    const schiffeVon = e => {
      const f = Engine.feldFuerJournal(e.feldJournal);
      if (!f) return [];
      const n = new Set((e.schiffe || []).map(String));
      return f.schiffe.filter(s => n.has(String(s.nummer))).map(s => s.id);
    };
    alleEintraege.forEach(e => { e._ids = schiffeVon(e); e._roll = Engine.istRollomat(e); });

    /* Kultur je Schiff zum Zeitpunkt T: die zuletzt genannte */
    const kulturNachName = {};
    Store.db.kulturen.forEach(k => kulturNachName[k.name.toLowerCase()] = k.id);

    /* Wir bauen den Zustand für jeden Stichtag neu auf. Damit das bezahlbar
       bleibt, werden die Sektoren einmal angelegt und danach nur umgesetzt. */
    Store.db.felder.forEach(f => f.schiffe.forEach(s => {
      s.sektoren = [{id: 'bt-' + s.id, polygon: null, kulturId: null, pflanzdatum: null,
                     prioritaet: 'normal', pausiert: false, letzteBewaesserung: null}];
    }));
    Store.reindex();

    const ORIG_REGELN = JSON.parse(JSON.stringify(Store.db.regeln));
    const ergebnis = {tage: [], fehlerDauer: [], fehlerMenge: [], proFeld: {},
                      proMonat: {}, klassen: {},
                      burst: {nachGang: {n: 0, tp: 0}, sonst: {n: 0, tp: 0}}};

    const START = 30;                       // erst mit etwas Historie prognostizieren
    for (let i = START; i < tage.length - 1; i++) {
      const T = tage[i], Z = tage[i + 1];
      if (D.diff(T, Z) > 3) continue;       // nach langen Pausen ist der Vergleich unfair

      const bisT = alleEintraege.filter(e => e.datum <= T);
      const amZ  = alleEintraege.filter(e => e.datum === Z && !e._roll);

      /* --- Zustand aufbauen: Kultur, letzte Bewässerung, Intervall je Schiff --- */
      const letzte = {}, historie = {}, kultur = {};
      bisT.forEach(e => {
        if (e._roll) return;
        e._ids.forEach(id => {
          letzte[id] = e.datum;
          (historie[id] = historie[id] || []).push(e.datum);
          const k = kulturNachName[String(e.kultur || '').toLowerCase()];
          if (k) kultur[id] = k;
        });
      });
      /* beobachtetes Median-Intervall je Schiff — Grundlage der Vergleichsbasis */
      const medIv = {};
      Object.entries(historie).forEach(([id, ds]) => {
        const u = [...new Set(ds)].sort();
        if (u.length < 3) return;
        const g = []; for (let k = 1; k < u.length; k++) g.push(D.diff(u[k - 1], u[k]));
        g.sort((a, b) => a - b);
        medIv[id] = g[g.length >> 1] || 1;
      });

      Store.db.journal = bisT;
      Store.db.regeln = JSON.parse(JSON.stringify(ORIG_REGELN));
      Store.db.felder.forEach(f => f.schiffe.forEach(s => {
        const k = s.sektoren[0];
        k.kulturId = kultur[s.id] || null;
        k.letzteBewaesserung = letzte[s.id] || null;
        k.pflanzdatum = null;
        /* Regel: die hinterlegte, sonst die beobachtete — so wie ein Admin,
           der seine Erfahrung einträgt. Ohne Regel plant die Engine nicht. */
        if (k.kulturId && !Store.regel(f.id, k.kulturId)) {
          const iv = medIv[s.id];
          if (iv) Store.setRegel(f.id, k.kulturId,
            {anzahl: 1, einheit: 'frei', tage: Math.max(1, iv), mm: 15, zeiten: [], phasen: []});
        }
      }));
      Engine.clearRef();

      /* --- Vorhersage --- */
      const auf = Engine.auftraegeFuer(Z, {});
      const vorher = new Set(auf.flatMap(a => a.schiffIds));

      /* --- Vergleichsbasis: reines Median-Intervall --- */
      const basis = new Set();
      Object.entries(medIv).forEach(([id, iv]) => {
        if (!kultur[id]) return;
        const l = letzte[id];
        if (l && D.diff(l, Z) >= iv) basis.add(id);
      });

      /* --- Wirklichkeit --- */
      const echt = new Set(amZ.flatMap(e => e._ids).filter(id => kultur[id]));
      if (!echt.size) continue;

      const kandidaten = new Set(Object.keys(kultur));
      /* Burstigkeit: wie oft folgt auf einen Gang gleich der nächste? */
      const gestern = D.add(Z, -1);
      kandidaten.forEach(id => {
        const gs = letzte[id] === gestern;
        const b = ergebnis.burst[gs ? 'nachGang' : 'sonst'];
        b.n++; if (echt.has(id)) b.tp++;
      });
      const zaehl = (pred) => {
        let tp = 0, fp = 0, fn = 0;
        kandidaten.forEach(id => {
          const p = pred.has(id), e = echt.has(id);
          if (p && e) tp++; else if (p && !e) fp++; else if (!p && e) fn++;
        });
        return {tp, fp, fn};
      };
      const em = zaehl(vorher), bm = zaehl(basis);

      /* --- Rangfolge: die eigentliche Leistung eines Vorschlagssystems ---
         Die rohe Fälligkeitsliste ist absichtlich grosszügig; erst die
         Kapazitätsentzerrung macht daraus einen Plan. Fair ist deshalb die
         Frage: wenn die Engine genau so viele Schiffe nennen darf, wie
         tatsächlich bewässert wurden — wie viele davon trifft sie?
         Gerankt wird nach Dringlichkeit (Priorität, dann Überfälligkeit). */
      const rang = [], gesehen = new Set();
      auf.forEach(a => a.schiffIds.forEach(id => {
        if (gesehen.has(id)) return; gesehen.add(id);
        rang.push({id, u: a.dringlichkeit ?? 1, t: a.ueberfaellig,
                   seit: letzte[id] ? D.diff(letzte[id], Z) : 999,
                   iv: medIv[id] || null,
                   n: (historie[id] || []).length});
      }));
      /* rang bleibt in der Reihenfolge, die auftraegeFuer ausliefert — nur so
         misst trefferK die tatsächliche Leistung der Engine, nicht eine
         nachträglich im Test erzeugte Sortierung. */
      const topK = new Set(rang.slice(0, echt.size).map(x => x.id));
      let trefferK = 0; topK.forEach(id => { if (echt.has(id)) trefferK++; });
      /* Gegenprobe: dieselbe Liste nach Tagen sortiert (das alte Mass) */
      const rangT = rang.slice().sort((x, y) => y.t - x.t);
      const topKT = new Set(rangT.slice(0, echt.size).map(x => x.id));
      let trefferKT = 0; topKT.forEach(id => { if (echt.has(id)) trefferKT++; });

      /* --- Experiment: welches Merkmal sortiert die Liste eigentlich richtig? ---
         Dieselbe Fälligkeitsliste, dieselbe Zahl an Plätzen, nur andere
         Sortierschlüssel. Wer hier gewinnt, gehört in die Engine. */
      const VAR = {
        dringlichkeit:      (x, y) => y.u - x.u,
        dringlichkeitInvers:(x, y) => x.u - y.u,
        tageUeberfaellig:   (x, y) => y.t - x.t,
        zuletztLang:        (x, y) => y.seit - x.seit,
        zuletztKurz:        (x, y) => x.seit - y.seit,
        haeufigkeit:        (x, y) => y.n - x.n,
        intervallTreue:     (x, y) => Math.abs(x.seit - (x.iv || 3)) - Math.abs(y.seit - (y.iv || 3)),
        /* Kandidat für die Engine: Dringlichkeit, aber gestuft. Wer weit über
           dem Plan liegt, ist nicht dringend, sondern fraglich — der rutscht
           nach hinten. Innerhalb jeder Stufe zählt weiter die Dringlichkeit. */
        gestuft15:          (x, y) => (x.u < 1.5 ? 0 : 1) - (y.u < 1.5 ? 0 : 1) || y.u - x.u,
        gestuft20:          (x, y) => (x.u < 2.0 ? 0 : 1) - (y.u < 2.0 ? 0 : 1) || y.u - x.u,
        gestuft:            (x, y) => (x.u < 2.5 ? 0 : 1) - (y.u < 2.5 ? 0 : 1) || y.u - x.u,
        gestuft30:          (x, y) => (x.u < 3.0 ? 0 : 1) - (y.u < 3.0 ? 0 : 1) || y.u - x.u,
        gestuft40:          (x, y) => (x.u < 4.0 ? 0 : 1) - (y.u < 4.0 ? 0 : 1) || y.u - x.u,
        gestuftIv:          (x, y) => (x.u < 2.5 ? 0 : 1) - (y.u < 2.5 ? 0 : 1)
                                      || (Math.abs(x.seit - (x.iv || 3)) - Math.abs(y.seit - (y.iv || 3))),
        plausibel:          (x, y) => Math.abs(x.u - 1.25) - Math.abs(y.u - 1.25)
      };
      const varianten = {};
      Object.entries(VAR).forEach(([name, cmp]) => {
        const l = rang.slice().sort(cmp).slice(0, echt.size);
        varianten[name] = l.filter(x => echt.has(x.id)).length;
      });

      /* --- Diagnose: Bewässerungsrate je Dringlichkeitsklasse ---
         Wenn die Rate mit der Dringlichkeit FÄLLT, misst „Dringlichkeit"
         nicht Bedarf, sondern Vernachlässigung. */
      rang.forEach(x => {
        const kl = x.u < 1 ? '<1' : x.u < 1.5 ? '1.0–1.5' : x.u < 2 ? '1.5–2' :
                   x.u < 3 ? '2–3' : '>3';
        const d = ergebnis.klassen[kl] = ergebnis.klassen[kl] || {n: 0, tp: 0};
        d.n++; if (echt.has(x.id)) d.tp++;
      });
      /* dieselbe Frage an die Vergleichsbasis: nach Überfälligkeit in Intervallen */
      const rangB = [...basis].map(id => ({id, u: (D.diff(letzte[id], Z) / (medIv[id] || 1))}))
        .sort((x, y) => y.u - x.u);
      const topKB = new Set(rangB.slice(0, echt.size).map(x => x.id));
      let trefferKB = 0; topKB.forEach(id => { if (echt.has(id)) trefferKB++; });
      /* Zufallserwartung — und hier liegt der Hund begraben. Es gibt zwei,
         und sie beantworten verschiedene Fragen:
           (a) blind aus ALLEN Schiffen mit Kultur ziehen. Das misst Filter und
               Rangfolge zusammen und ist der Massstab für „ist der Vorschlag
               insgesamt besser als würfeln?"
           (b) blind aus der Fälligkeitsliste der Engine ziehen. Das misst
               allein, ob die Reihenfolge innerhalb der Liste etwas taugt.
         Wer nur (a) berichtet, verwechselt zwei Leistungen miteinander. */
      const nFaellig = vorher.size;
      const zufall = echt.size * echt.size / kandidaten.size;
      const zufallFaellig = nFaellig
        ? Math.min(echt.size, nFaellig) * em.tp / nFaellig : 0;
      const zufallBasis = basis.size
        ? Math.min(echt.size, basis.size) * bm.tp / basis.size : 0;

      ergebnis.tage.push({datum: Z, kandidaten: kandidaten.size, echt: echt.size,
                          engine: em, basis: bm,
                          nFaellig, nBasis: basis.size,
                          k: echt.size, trefferK, trefferKT, trefferKB,
                          zufall, zufallFaellig, zufallBasis, varianten});
      const mon = Z.slice(0, 7);
      const pm = ergebnis.proMonat[mon] = ergebnis.proMonat[mon] ||
        {tp: 0, fp: 0, fn: 0, btp: 0, bfp: 0, bfn: 0, n: 0};
      pm.tp += em.tp; pm.fp += em.fp; pm.fn += em.fn;
      pm.btp += bm.tp; pm.bfp += bm.fp; pm.bfn += bm.fn; pm.n++;

      /* --- Dauer- und Mengenprognose für die Gänge, die tatsächlich liefen --- */
      amZ.forEach(e => {
        if (!e._ids.length || !e.m3 || !e.dauerMin || e.dauerMin < 5) return;
        const regner = (e.kreisregner || 0) + (e.sektorregner || 0);
        if (!regner) return;
        const q = Engine.qFuerSchiffe(e._ids);
        if (W.wert(q) == null) return;
        /* Dauer für die tatsächlich ausgebrachte Menge — trennt das
           Durchflussmodell von der Frage, ob die Zielmenge richtig war */
        const progDauer = e.m3 / (W.wert(q) * regner) * 60;
        ergebnis.fehlerDauer.push({ist: e.dauerMin, prog: progDauer,
          n: q.n || 0, quelle: q.quelle, feld: e.feldJournal, monat: Z.slice(0, 7)});
        /* Menge für die tatsächliche Dauer */
        const progMenge = W.wert(q) * regner * (e.dauerMin / 60);
        ergebnis.fehlerMenge.push({ist: e.m3, prog: progMenge, feld: e.feldJournal});
        const pf = ergebnis.proFeld[e.feldJournal] = ergebnis.proFeld[e.feldJournal] || [];
        pf.push(Math.abs(progDauer - e.dauerMin));
      });
    }
    /* Zustand zurücksetzen ist unnötig — die Seite wird verworfen. */
    ergebnis.rueckstandAb = Engine.RUECKSTAND_AB;
    return ergebnis;
  });

  /* ---------------- Auswertung ---------------- */
  const sum = (a, k) => a.reduce((x, y) => x + y[k], 0);
  const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y);
    const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const pct = x => (100 * x).toFixed(0) + ' %';

  const e_tp = sum(R.tage.map(t => t.engine), 'tp'), e_fp = sum(R.tage.map(t => t.engine), 'fp'),
        e_fn = sum(R.tage.map(t => t.engine), 'fn');
  const b_tp = sum(R.tage.map(t => t.basis), 'tp'), b_fp = sum(R.tage.map(t => t.basis), 'fp'),
        b_fn = sum(R.tage.map(t => t.basis), 'fn');
  const kenn = (tp, fp, fn) => {
    const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
    return {p, r, f1: 2 * p * r / (p + r || 1)};
  };
  const kE = kenn(e_tp, e_fp, e_fn), kB = kenn(b_tp, b_fp, b_fn);

  const dIst = R.fehlerDauer.map(x => x.ist), dPr = R.fehlerDauer.map(x => x.prog);
  const dAbw = R.fehlerDauer.map(x => Math.abs(x.prog - x.ist));
  const inner30 = R.fehlerDauer.filter(x => Math.abs(x.prog - x.ist) / x.ist <= 0.3).length;
  const mAbw = R.fehlerMenge.map(x => Math.abs(x.prog - x.ist));

  const zeilen = [];
  const L = s => { zeilen.push(s); console.log(s); };

  L('');
  L('=== BACKTEST ============================================');
  L(`Stichtage: ${R.tage.length} · vorhergesagte Schiff-Tage: ${e_tp + e_fp + e_fn}`);
  L('');
  L('--- Fälligkeitsprognose (welche Schiffe kommen morgen dran?) ---');
  L('                       Treffer   Fehlalarm   verpasst   Genauigkeit   Trefferquote   F1');
  L(`  Engine               ${String(e_tp).padStart(7)} ${String(e_fp).padStart(11)} ${String(e_fn).padStart(10)}`
    + `   ${pct(kE.p).padStart(11)}   ${pct(kE.r).padStart(12)}   ${kE.f1.toFixed(2)}`);
  L(`  Vergleichsbasis      ${String(b_tp).padStart(7)} ${String(b_fp).padStart(11)} ${String(b_fn).padStart(10)}`
    + `   ${pct(kB.p).padStart(11)}   ${pct(kB.r).padStart(12)}   ${kB.f1.toFixed(2)}`);
  L('');
  L(`  → Engine ${kE.f1 > kB.f1 ? 'SCHLÄGT' : 'schlägt NICHT'} die triviale Vergleichsbasis `
    + `(F1 ${kE.f1.toFixed(2)} gegen ${kB.f1.toFixed(2)})`);
  L('');
  L('--- Zwei getrennte Leistungen: der Filter und die Rangfolge ---');
  const S = k => R.tage.reduce((a, t) => a + t[k], 0);
  const kSum = S('k'), kEng = S('trefferK'), kEngT = S('trefferKT'), kBas = S('trefferKB');
  const nFae = S('nFaellig'), nBas = S('nBasis'), nKand = S('kandidaten');
  const grundrate = kSum / nKand;                      // Anteil bewässerter Schiffe überhaupt
  const rateFae   = e_tp / (nFae || 1);                // Trefferrate in der Fälligkeitsliste
  const rateBas   = b_tp / (nBas || 1);
  L('  (1) FILTER — wie stark reichert die Fälligkeitsliste an?');
  L(`      Grundrate: von allen ${nKand} Schiff-Tagen mit Kultur wurden ${kSum} bewässert`
    + `  →  ${pct(grundrate)}`);
  L(`      Engine: von ${nFae} als fällig genannten waren ${e_tp} richtig`
    + `  →  ${pct(rateFae)}   (${(rateFae / grundrate).toFixed(2)}× Anreicherung)`);
  L(`      Basis:  von ${nBas} als fällig genannten waren ${b_tp} richtig`
    + `  →  ${pct(rateBas)}   (${(rateBas / grundrate).toFixed(2)}× Anreicherung)`);
  L('');
  L('  (2) RANGFOLGE — die Engine darf genau so viele Schiffe nennen wie bewässert wurden.');
  L('      Verglichen wird gegen blindes Ziehen AUS DER EIGENEN Fälligkeitsliste:');
  L('      das ist der einzig faire Massstab für eine Sortierung.');
  const zFae = S('zufallFaellig'), zBas = S('zufallBasis'), zGlob = S('zufall');
  L(`      von ${kSum} tatsächlich bewässerten Schiff-Tagen trifft`);
  L(`        Engine (ausgelieferte Reihung)  ${String(kEng).padStart(5)}   ${pct(kEng / kSum)}`);
  L(`        Engine nach Tagen (altes Mass)  ${String(kEngT).padStart(5)}   ${pct(kEngT / kSum)}`);
  L(`        Zufall in der Engine-Liste      ${String(Math.round(zFae)).padStart(5)}   ${pct(zFae / kSum)}`);
  L(`        Vergleichsbasis                 ${String(kBas).padStart(5)}   ${pct(kBas / kSum)}`);
  L(`        Zufall in der Basis-Liste       ${String(Math.round(zBas)).padStart(5)}   ${pct(zBas / kSum)}`);
  L(`        Zufall aus allen Schiffen       ${String(Math.round(zGlob)).padStart(5)}   ${pct(zGlob / kSum)}`);
  L('');
  L(`      → Sortierung der Engine: ${(kEng / (zFae || 1)).toFixed(2)}× gegenüber Zufall in der eigenen Liste`);
  L(`      → Dringlichkeit gegen Tage:      ${(kEng / (kEngT || 1)).toFixed(2)}×`);
  L(`      → Engine gegen Vergleichsbasis:  ${(kEng / (kBas || 1)).toFixed(2)}×`);
  L('');
  L('      Achtung beim Lesen: „Zufall aus allen Schiffen" ist KEIN fairer Gegner für');
  L('      die Rangfolge. Er darf aus einem Topf ziehen, in dem an einem Tag mit vielen');
  L('      Gängen entsprechend viele Treffer liegen — das ist die Grundrate, nicht');
  L('      eine Leistung. Massgeblich ist die Zeile „Zufall in der Engine-Liste".');
  L('');
  L('  (3) EXPERIMENT — dieselbe Liste, andere Sortierschlüssel, gleich viele Plätze:');
  const varNamen = Object.keys(R.tage[0].varianten);
  varNamen.map(nm => [nm, R.tage.reduce((a, t) => a + t.varianten[nm], 0)])
    .sort((a, b) => b[1] - a[1])
    .forEach(([nm, v]) => L(`      ${nm.padEnd(20)} ${String(v).padStart(5)}   ${pct(v / kSum)}`
      + `   ${(v / (zFae || 1)).toFixed(2)}× Zufall`));
  L('');
  L('  (4) DIAGNOSE — Bewässerungsrate je Dringlichkeitsklasse:');
  ['<1', '1.0–1.5', '1.5–2', '2–3', '>3'].forEach(kl => {
    const d = R.klassen[kl]; if (!d) return;
    L(`      Dringlichkeit ${kl.padEnd(9)} n=${String(d.n).padStart(5)}`
      + `   tatsächlich bewässert ${pct(d.tp / d.n)}`);
  });
  L('');
  L('  (5) BURSTIGKEIT — hängt der heutige Gang am gestrigen?');
  const bg = R.burst.nachGang, bs = R.burst.sonst;
  L(`      gestern bewässert     n=${String(bg.n).padStart(5)}   heute bewässert ${pct(bg.tp / (bg.n || 1))}`);
  L(`      gestern nicht         n=${String(bs.n).padStart(5)}   heute bewässert ${pct(bs.tp / (bs.n || 1))}`);
  L(`      → ${(bg.tp / (bg.n || 1) / (bs.tp / (bs.n || 1))).toFixed(2)}× so wahrscheinlich`);
  L('');
  L('--- Dauerprognose (bei tatsächlich ausgebrachter Menge) ---');
  L(`  n = ${R.fehlerDauer.length}`);
  L(`  Median-Fehler        ${med(dAbw).toFixed(0)} min`);
  L(`  mittlerer Fehler     ${(dAbw.reduce((a, b) => a + b, 0) / dAbw.length).toFixed(0)} min`);
  L(`  innerhalb ±30 %      ${pct(inner30 / R.fehlerDauer.length)}`);
  L('');
  L('  nach Datenlage des Schiffs:');
  [[0, 0, 'keine Historie'], [1, 3, '1–3 Gänge'], [4, 10, '4–10 Gänge'], [11, 9999, 'über 10']]
    .forEach(([lo, hi, lbl]) => {
      const t = R.fehlerDauer.filter(x => x.n >= lo && x.n <= hi);
      if (t.length < 10) return;
      const a = t.map(x => Math.abs(x.prog - x.ist));
      L(`    ${lbl.padEnd(16)} n=${String(t.length).padStart(4)}   Median ${med(a).toFixed(0).padStart(3)} min`
        + `   innerhalb ±30 %: ${pct(t.filter(x => Math.abs(x.prog - x.ist) / x.ist <= 0.3).length / t.length)}`);
    });
  L('');
  L('--- Mengenprognose (bei tatsächlicher Dauer) ---');
  L(`  Median-Fehler        ${med(mAbw).toFixed(1)} m³ bei typisch ${med(R.fehlerMenge.map(x => x.ist)).toFixed(0)} m³`);
  L('');
  L('--- Wo die Prognose am meisten danebenliegt ---');
  Object.entries(R.proFeld).map(([f, v]) => [f, v.length, med(v)])
    .filter(x => x[1] >= 10).sort((a, b) => b[2] - a[2]).slice(0, 8)
    .forEach(([f, n, m]) => L(`  ${f.padEnd(26)} n=${String(n).padStart(4)}   Median ${m.toFixed(0)} min`));
  L('');
  L('--- Nach Monat ---');
  Object.entries(R.proMonat).sort().forEach(([m, v]) => {
    const k = kenn(v.tp, v.fp, v.fn), kb = kenn(v.btp, v.bfp, v.bfn);
    L(`  ${m}   Tage ${String(v.n).padStart(2)}   Engine F1 ${k.f1.toFixed(2)}   Basis F1 ${kb.f1.toFixed(2)}`);
  });
  L('');
  L(`Konsolenfehler: ${errs.length ? errs.join(' | ') : 'keine'}`);
  L('=========================================================');

  if (process.argv.includes('--md')) {
    const z1 = x => x.toFixed(1).replace('.', ',');
    const z2 = x => x.toFixed(2).replace('.', ',');
    const kl = R.klassen;
    const bgQ = bg.tp / (bg.n || 1), bsQ = bs.tp / (bs.n || 1);
    const varTop = varNamen.map(nm => [nm, R.tage.reduce((a, t) => a + t.varianten[nm], 0)])
                            .sort((a, b) => b[1] - a[1]);
    const md = `# Backtest — hat das Modell je gestimmt?

> Phase 4 des Datenmodell-Auftrags. Die Engine läuft rollend gegen die Vergangenheit:
> für jeden Stichtag bekommt sie nur, was bis dahin bekannt war, und sagt den Folgetag
> voraus. Verglichen wird mit dem, was tatsächlich passiert ist.
> Erzeugt von \`node tools/backtest.js --md\` — alle Zahlen in diesem Text stammen aus
> demselben Lauf wie die Rohausgabe am Ende.

**Grundlage:** ${R.tage.length} Stichtage, ${e_tp + e_fp + e_fn} vorhergesagte Schiff-Tage,
${R.fehlerDauer.length} Gänge mit Menge und Dauer für die Dauerprognose.

---

## Das Ergebnis in drei Sätzen

1. **Die Dauerprognose ist gut.** Median-Fehler ${med(dAbw).toFixed(0)} Minuten,
   ${pct(inner30 / R.fehlerDauer.length)} aller Gänge innerhalb von ±30 %. Das
   Durchflussmodell aus Phase 3 trägt.
2. **Die Fälligkeitsprognose ist schwach.** Von allen Schiff-Tagen mit Kultur werden
   ${pct(kSum / nKand)} bewässert; die Fälligkeitsliste der Engine trifft
   ${pct(rateFae)}. Das ist nur ${z2(rateFae / grundrate)}× Anreicherung.
   Wer täglich alles bewässert, hätte fast dieselbe Trefferrate.
3. **Die Reihenfolge war anfangs schlechter als würfeln — jetzt ist sie es nicht mehr.**
   Nach purer Dringlichkeit sortiert traf die Engine ${varTop.find(v => v[0] === 'dringlichkeit')[1]}
   von ${kSum} Schiff-Tagen — blindes Ziehen aus derselben Liste hätte ${Math.round(zFae)} getroffen.
   Nach der jetzigen Reihung sind es ${kEng}. Das ist der grösste einzelne Gewinn dieser Phase.

---

## 1. Der Filter: welche Schiffe kommen morgen dran?

|  | genannt | davon richtig | Trefferrate | Anreicherung |
|---|---:|---:|---:|---:|
| Grundrate (alle Schiffe mit Kultur) | ${nKand} | ${kSum} | ${pct(grundrate)} | 1,00× |
| Engine | ${nFae} | ${e_tp} | ${pct(rateFae)} | ${z2(rateFae / grundrate)}× |
| Vergleichsbasis (Median-Intervall) | ${nBas} | ${b_tp} | ${pct(rateBas)} | ${z2(rateBas / grundrate)}× |

Genauigkeit ${pct(kE.p)}, Trefferquote ${pct(kE.r)}, F1 ${z2(kE.f1)} gegen
${z2(kB.f1)} der Vergleichsbasis.

**Deutung.** Die Engine ist grosszügig: sie nennt ${nFae} Schiff-Tage, tatsächlich
bewässert wurden ${kSum}. Sie verpasst wenig (${pct(kE.r)} Trefferquote), nennt aber
das Zwei- bis Dreifache dessen, was gebraucht wird. Für sich genommen ist das kein
Fehler — die Fälligkeitsliste ist absichtlich weit, die Kapazitätsentzerrung macht
daraus erst einen Plan. Es heisst aber: **die Liste allein ist kein Tagesplan.**
Was zählt, ist ihre Reihenfolge.

## 2. Die Reihenfolge

Faire Frage: die Engine darf genau so viele Schiffe nennen, wie an dem Tag wirklich
bewässert wurden. Wie viele davon trifft sie?

|  | Treffer von ${kSum} | Anteil |
|---|---:|---:|
| **Engine (ausgelieferte Reihung)** | **${kEng}** | **${pct(kEng / kSum)}** |
| Engine nach Dringlichkeit allein | ${varTop.find(v => v[0] === 'dringlichkeit')[1]} | ${pct(varTop.find(v => v[0] === 'dringlichkeit')[1] / kSum)} |
| Engine nach Tagen Überfälligkeit (altes Mass) | ${kEngT} | ${pct(kEngT / kSum)} |
| blindes Ziehen **aus der Engine-Liste** | ${Math.round(zFae)} | ${pct(zFae / kSum)} |
| Vergleichsbasis | ${kBas} | ${pct(kBas / kSum)} |
| blindes Ziehen aus allen Schiffen | ${Math.round(zGlob)} | ${pct(zGlob / kSum)} |

**Welcher Zufall ist der richtige Gegner?** Der aus der Engine-Liste. Das blinde Ziehen
aus allen Schiffen beantwortet eine andere Frage — es misst Filter und Reihenfolge
zusammen und profitiert davon, dass an Tagen mit vielen Gängen entsprechend viele
Treffer im Topf liegen. Wer eine Sortierung bewerten will, muss den Kandidatenkreis
konstant halten. Diese Unterscheidung war der Grund, weshalb das Ergebnis anfangs
falsch gelesen wurde.

Gemessen am richtigen Gegner: **${z2(kEng / (zFae || 1))}× Zufall**, ${z2(kEng / (kBas || 1))}× Vergleichsbasis.

## 3. Warum die Dringlichkeit falsch herum sortierte

Der eigentliche Befund dieser Phase. Bewässerungsquote nach Rückstand, gemessen an
allen Aufträgen, die die Engine je genannt hat:

| Dringlichkeit (Vielfaches der Regelmenge) | Aufträge | tatsächlich bewässert |
|---|---:|---:|
${[['<1', 'unter 1'], ['1.0–1.5', '1,0–1,5'], ['1.5–2', '1,5–2'], ['2–3', '2–3'], ['>3', 'über 3']]
  .filter(([k]) => kl[k])
  .map(([k, lbl]) => `| ${lbl} | ${kl[k].n} | ${pct(kl[k].tp / kl[k].n)} |`).join('\n')}

Die Quote **fällt** mit steigendem Rückstand. Ein grosses Defizit zeigt bei diesem
Betrieb keinen grossen Bedarf an, sondern ein Schiff, das aus der Rotation gefallen
ist: Kultur abgeräumt ohne Enddatum, Regel zu eng hinterlegt, Gang nicht erfasst, oder
die Fläche läuft über den Rollomat. Solche Aufträge sammeln Defizit an, ohne dass
jemals jemand hingeht.

Wer nach Dringlichkeit sortiert, stellt also **systematisch die Karteileichen nach
oben** — und schiebt die echte Arbeit durch die Kapazitätsentzerrung nach hinten.
Das ist kein Rundungsfehler, das ist ein Vorzeichenfehler in der Logik.

### Was stattdessen sortiert

Dieselbe Liste, dieselbe Zahl an Plätzen, nur andere Sortierschlüssel:

| Schlüssel | Treffer | Anteil | gegen Zufall |
|---|---:|---:|---:|
${varTop.map(([nm, v]) => `| ${nm} | ${v} | ${pct(v / kSum)} | ${z2(v / (zFae || 1))}× |`).join('\n')}

Übernommen wurde die Stufung: **erst die plausiblen Aufträge, darin der, dessen
Abstand zum letzten Gang am genauesten dem eigenen Sollrhythmus entspricht, dann
das Defizit — Rückstände ab dem ${z1(R.rueckstandAb)}fachen stehen hinten.**

Nicht übernommen wurde \`zuletztKurz\` (${varTop.find(v => v[0] === 'zuletztKurz')[1]} Treffer),
obwohl es am besten abschneidet. „Zuerst das Schiff, das zuletzt Wasser bekommen hat"
sagt gut voraus, was der Betrieb tut, ist als Anweisung aber unsinnig. Die App soll
den Betrieb beraten, nicht nachahmen. Die Stufung liegt mit ${kEng} Treffern nahe genug
und lässt sich einem Menschen erklären.

Die Schwelle ${z1(R.rueckstandAb)} ist nicht an die Daten angepasst: zwischen 2,0 und 4,0 liegt das
Ergebnis zwischen ${varTop.find(v => v[0] === 'gestuft20')[1]} und ${varTop.find(v => v[0] === 'gestuft40')[1]} Treffern.

## 4. Bewässerung ist schubweise

| Lage am Vortag | Schiff-Tage | heute bewässert |
|---|---:|---:|
| gestern bewässert | ${bg.n} | ${pct(bgQ)} |
| gestern nicht | ${bs.n} | ${pct(bsQ)} |

${z2(bgQ / bsQ)}× so wahrscheinlich. Bewässert wird in Schüben, nicht gleichmässig
verteilt — typisch für Anwachsphasen nach dem Pflanzen und für Routen, die ein Team
über mehrere Tage abarbeitet.

**Das Modell kennt beides nicht.** Es rechnet eine Wasserbilanz je Sektor, als wäre
jeder Sektor unabhängig und der Bedarf über die Kulturzeit konstant. Die beiden
stärksten Treiber der Wirklichkeit — **Pflanzdatum/Kulturphase** und **Route/Team an
diesem Tag** — stehen nirgends in den Daten. Solange das so bleibt, ist bei der
Fälligkeitsprognose keine grosse Verbesserung zu erwarten. Das ist die wichtigste
offene Frage an den Betrieb.

## 5. Dauer- und Mengenprognose

| | |
|---|---|
| n | ${R.fehlerDauer.length} |
| Median-Fehler Dauer | ${med(dAbw).toFixed(0)} min |
| innerhalb ±30 % | ${pct(inner30 / R.fehlerDauer.length)} |
| Median-Fehler Menge | ${med(mAbw).toFixed(1)} m³ bei typisch ${med(R.fehlerMenge.map(x => x.ist)).toFixed(0)} m³ |

Nach Datenlage des Schiffs:

| Historie | n | Median-Fehler | innerhalb ±30 % |
|---|---:|---:|---:|
${[[1, 3, '1–3 Gänge'], [4, 10, '4–10 Gänge'], [11, 9999, 'über 10 Gänge']]
  .map(([lo, hi, lbl]) => {
    const t = R.fehlerDauer.filter(x => x.n >= lo && x.n <= hi);
    if (t.length < 10) return null;
    const a = t.map(x => Math.abs(x.prog - x.ist));
    return `| ${lbl} | ${t.length} | ${med(a).toFixed(0)} min | ${pct(t.filter(x => Math.abs(x.prog - x.ist) / x.ist <= 0.3).length / t.length)} |`;
  }).filter(Boolean).join('\n')}

Die Shrinkage aus Phase 3 wirkt: Schiffe mit 1–3 Gängen liegen nur wenig schlechter
als solche mit über 10. Ein dünn belegtes Schiff bekommt keinen wilden Einzelwert,
sondern wird zum Feldwert gezogen.

Felder mit dem grössten Restfehler:

| Feld | n | Median-Fehler |
|---|---:|---:|
${Object.entries(R.proFeld).map(([f, v]) => [f, v.length, med(v)])
  .filter(x => x[1] >= 10).sort((a, b) => b[2] - a[2]).slice(0, 6)
  .map(([f, n, m]) => `| ${f} | ${n} | ${m.toFixed(0)} min |`).join('\n')}

## 6. Was das für die App heisst

**Belastbar:** Dauer, Menge, Sprenklerzahl, m³ je Gang. Diese Zahlen darf der
Wassermann so ablesen, mit der Unsicherheitsangabe daneben.

**Mit Vorbehalt:** die Reihenfolge des Tagesplans. Sie ist messbar besser als Zufall
und deutlich besser als jede triviale Regel, aber sie trifft rund die Hälfte.
Der Tagesplan ist ein Vorschlag, keine Disposition.

**Nicht belastbar:** die Aussage „dieses Schiff ist heute fällig" für ein einzelnes
Schiff ohne Prüfung. Als Klärfall markierte Aufträge sind fast immer ein Datenproblem,
kein Wasserbedarf.

## 7. Grenzen dieses Backtests

- Kulturen und letzte Bewässerung wurden aus dem Journal rekonstruiert. Pflanzdaten
  fehlen ganz, Sektoren wurden je Schiff als einer angenommen. Der Betrieb hat also
  in der Wirklichkeit mehr Information, als die Engine hier hatte.
- Fehlt eine Regel, wird das beobachtete Median-Intervall des Schiffs als Regel
  gesetzt. Das ist wohlwollend gegenüber der Engine, aber notwendig — ohne Regel
  plant sie gar nicht.
- Rollomat-Gänge sind ausgeschlossen; sie folgen einer anderen Technik.
- Verglichen wird nur T→T+1 und nur bei Abständen bis 3 Tagen. Nach langen Pausen
  im Journal wäre der Vergleich unfair.
- „Nicht bewässert" heisst im Journal nicht „nicht nötig gewesen". Fehlalarme sind
  deshalb teilweise gar keine — sie lassen sich aus diesen Daten nicht auflösen.

---

## Rohausgabe

\`\`\`
${zeilen.join('\n')}
\`\`\`
`;
    fs.writeFileSync('docs/backtest.md', md);
    console.log('docs/backtest.md geschrieben');
  }

  /* Kennzahlen für die Regression */
  fs.writeFileSync('tools/_backtest.json', JSON.stringify({
    f1Engine: +kE.f1.toFixed(4), f1Basis: +kB.f1.toFixed(4),
    genauigkeit: +kE.p.toFixed(4), trefferquote: +kE.r.toFixed(4),
    dauerMedianFehlerMin: +med(dAbw).toFixed(2),
    dauerInnerhalb30: +(inner30 / R.fehlerDauer.length).toFixed(4),
    rangTrefferEngine: +(kEng / kSum).toFixed(4),
    rangTrefferBasis: +(kBas / kSum).toFixed(4),
    rangTrefferZufallInListe: +(zFae / kSum).toFixed(4),
    rangTrefferZufallGlobal: +(zGlob / kSum).toFixed(4),
    anreicherungEngine: +(rateFae / grundrate).toFixed(4),
    anreicherungBasis: +(rateBas / grundrate).toFixed(4),
    n: R.fehlerDauer.length, stichtage: R.tage.length
  }, null, 1));

  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
