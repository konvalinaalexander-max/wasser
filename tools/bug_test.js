const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);
  const out=await pg.evaluate(()=>{
    const L={};
    const seed=()=>{ Object.keys(Store.db.regeln).forEach(key=>{
        const [fid,kid]=key.split('::'); const f=Store.feld(fid); if(!f||!f.schiffe.length) return;
        f.schiffe.forEach(s=>{ s.sektoren=[{id:'sek-'+s.id,polygon:null,kulturId:kid,
          pflanzdatum:'2026-06-01',prioritaet:'normal',pausiert:false,letzteBewaesserung:null}];});});
      Store.reindex(); Engine.clearRef(); Engine.planNeu(); };
    seed();
    const heute=D.today(), morgen=D.add(heute,1);

    /* --- BUG: Verschieben erzeugt Duplikat nach planNeu --- */
    const a0=Store.db.plan[heute].auftraege[0];
    const key0=a0.feldId+'|'+a0.kulturId;
    Engine.verschiebe(heute, a0.id, 1);
    L.nachVerschieben={heute:Store.db.plan[heute].auftraege.length, morgen:Store.db.plan[morgen].auftraege.length};
    Engine.planNeu();
    const zaehl = d => Store.db.plan[d].auftraege.filter(a=>a.feldId+'|'+a.kulturId===key0).length;
    L.duplikatNachPlanNeu={feldKultur:key0, heute:zaehl(heute), morgen:zaehl(morgen),
      gesamt: zaehl(heute)+zaehl(morgen)};

    /* --- BUG: Admin-Anpassung geht bei planNeu verloren --- */
    Engine.planNeu();
    const a1=Store.db.plan[heute].auftraege.find(a=>a.quelle==='auto');
    a1.zielMm=999; a1.notiz='NICHT VERLIEREN'; a1.prioritaet='hoch';
    const id1=a1.id;
    Engine.planNeu();
    const nach=Store.db.plan[heute].auftraege.find(a=>a.id===id1);
    L.adminAnpassungVerloren={vorher:999, nachher: nach?nach.zielMm:'Auftrag weg', notiz: nach?nach.notiz:null};

    /* --- BUG: gelöschter Auftrag kehrt zurück --- */
    const a2=Store.db.plan[heute].auftraege.find(a=>a.quelle==='auto');
    const id2=a2.id;
    Store.db.plan[heute].auftraege=Store.db.plan[heute].auftraege.filter(x=>x.id!==id2);
    L.nachLoeschen=Store.db.plan[heute].auftraege.some(x=>x.id===id2);
    Engine.planNeu();
    L.nachPlanNeuWiederDa=Store.db.plan[heute].auftraege.some(x=>x.id===id2);

    /* --- BUG: tagesPlan legt Einträge für Vergangenheit an --- */
    const vorher=Object.keys(Store.db.plan).length;
    Engine.tagesPlan('2026-01-15');
    L.vergangenheitAngelegt={vorher, nachher:Object.keys(Store.db.plan).length,
      eintragDa: !!Store.db.plan['2026-01-15']};

    /* --- BUG: aktivePhase rechnet immer mit heute --- */
    Store.setRegel(Store.db.felder[0].id,'k-salat',
      {anzahl:1,einheit:'woche',mm:30,phasen:[{vonTag:0,bisTag:5,anzahl:1,einheit:'tag',mm:8},
                                              {vonTag:6,bisTag:null,anzahl:1,einheit:'woche',mm:30}]});
    const r=Store.regel(Store.db.felder[0].id,'k-salat');
    const pflanz=D.add(D.today(),-3);            // heute Tag 3 -> Phase 1
    L.phaseHeute=Engine.aktivePhase(r,pflanz).mm;          // erwartet 8
    // in 10 Tagen wäre es Tag 13 -> Phase 2 (30mm). aktivePhase kennt kein Zieldatum:
    L.phaseIn10Tagen_erwartet=30;
    L.phaseIn10Tagen_tatsaechlich=Engine.aktivePhase(r,pflanz).mm;

    /* --- BUG: Regen des Zieltages wird nie von der Bilanz abgezogen --- */
    Store.db.regen.push({id:'rX',datum:heute,mm:50,standortIds:Store.db.standorte.map(s=>s.id),stationId:'ws1'});
    Engine.planNeu();
    L.regen50mm_auftraegeHeute=Store.db.plan[heute].auftraege.length;
    L.regen50mm_angepasst=Store.db.plan[heute].auftraege.filter(a=>a.angepasstMm===0).length;
    L.regen50mm_automatischUebernommen=Store.db.plan[heute].auftraege.filter(a=>a.anpassungAngenommen).length;

    /* --- BUG: WM-Journaleintrag landet unter unbekanntem Namen --- */
    const f3=Store.db.felder.find(f=>!Object.values(Store.db.einstellungen.journalMap).includes(f.id));
    L.feldOhneJournalMapping=f3?f3.name:null;
    return L;
  });
  console.log(JSON.stringify(out,null,1));
  console.log("ERRORS:",errs.length?errs:'keine');
  await b.close();
})();
