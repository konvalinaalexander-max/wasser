const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);
  const out=await pg.evaluate(()=>{
    const L={};
    /* Wie viele Journaleinträge werden pauschal ALLEN Schiffen eines Feldes zugerechnet? */
    let pauschal=0, gezielt=0, ignoriert=0;
    Store.db.journal.forEach(e=>{
      if(!e.m3||!e.dauerMin||e.dauerMin<5) return;
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f){ignoriert++;return;}
      if(!Engine.beregneteFlaeche(e.kreisregner,e.sektorregner)) {ignoriert++;return;}
      const tr=f.schiffe.filter(s=>e.schiffe.includes(String(s.nummer)));
      if(tr.length) gezielt++; else pauschal++;
    });
    L.refZuordnung={gezielt,pauschalAufAlleSchiffe:pauschal,ignoriert};

    /* mm-Definition: Engine vs. Journal-Ansicht */
    const e=Store.db.journal.find(x=>x.m3&&x.kreisregner&&Engine.feldFuerJournal(x.feldJournal));
    const f=Engine.feldFuerJournal(e.feldJournal);
    const mmEngine=e.m3*1000/Engine.beregneteFlaeche(e.kreisregner,e.sektorregner);
    const sch=f.schiffe.filter(s=>e.schiffe.includes(String(s.nummer)));
    const fl=(sch.length?sch:f.schiffe).reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f)||0),0)||Store.feldFlaecheM2(f);
    L.mmWiderspruch={eintrag:e.feldJournal+' '+e.datum, m3:e.m3,
      mm_Engine:+mmEngine.toFixed(1), mm_JournalAnsicht:+(e.m3*1000/fl).toFixed(1),
      faktor:+(mmEngine/(e.m3*1000/fl)).toFixed(1)};

    /* Dauer-Modell: skaliert die Dauer mit der Gruppengröße? */
    const f2=Store.db.felder.find(x=>x.schiffe.length>=4 && x.schiffe.every(s=>Engine.refWerte().schiff[s.id]));
    if(f2){
      L.dauerSkalierung={feld:f2.name,
        einSchiff:Engine.dauerFuer([f2.schiffe[0].id],20).min,
        vierSchiffe:Engine.dauerFuer(f2.schiffe.slice(0,4).map(s=>s.id),20).min};
    }
    /* Regen doppelt gezählt? */
    const sid=Store.db.standorte[0].id;
    Store.db.regen=[{id:'r1',datum:D.today(),mm:10,standortIds:[sid],stationId:'ws1'},
                    {id:'r2',datum:D.today(),mm:10,standortIds:[sid],stationId:'ws2'}];
    L.regenSummiert=Engine.regenAm(sid,D.today());
    return L;
  });
  console.log(JSON.stringify(out,null,1));
  /* Admin: Rückwärtsnavigation */
  await pg.evaluate(()=>{Store.db.einstellungen.setupErledigt=true;Store.db.einstellungen.regenGefragtAm=D.today();});
  await pg.click('.tile'); await pg.waitForTimeout(500);
  const o1=await pg.evaluate(()=>Admin.tagOffset);
  await pg.evaluate(()=>Admin.tagWechsel(-1)); await pg.waitForTimeout(400);
  const o2=await pg.evaluate(()=>Admin.tagOffset);
  console.log("tagOffset vor/nach '‹' bei 0:", o1, o2, "-> Klick wirkungslos:", o1===o2);
  console.log("ERRORS:",errs.length?errs:'keine');
  await b.close();
})();
