const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);
  const out=await pg.evaluate(()=>{
    const L={};
    /* WM-Eintrag für Feld ohne Journal-Mapping */
    const jm=Store.db.einstellungen.journalMap;
    const f=Store.db.felder.find(x=>x.schiffe.length && !Object.values(jm).includes(x.id));
    L.testFeld=f.name;
    const s=f.schiffe[0];
    Store.db.laufend=[{id:'runY',auftragId:'x',datum:D.today(),standortId:f.standortId,feldId:f.id,
      schiffIds:[s.id],nummern:[s.nummer],kulturId:null,zielMm:15,startZeit:'08:00',startM3:100,
      kreisregner:4,sektorregner:null}];
    WM._bem='';
    WM._stoppFinal('runY','10:00',130,false);
    const j=Store.db.journal[Store.db.journal.length-1];
    L.wmEintrag={feldJournal:j.feldJournal, findetFeldWieder: !!Engine.feldFuerJournal(j.feldJournal),
                 imRefWert: (()=>{Engine.clearRef(); const R=Engine.refWerte(); return !!R.schiff[s.id];})()};
    L.wmEintrag_letzteBewaesserungFunktioniert = Engine.letzteBewaesserung(s.id);

    /* schiffFlaecheM2 bei gemischten Aren-Angaben */
    const f2=Store.db.felder.find(x=>x.schiffe.length>=3 && x.gesamtflaecheAren);
    f2.schiffe.forEach(x=>x.aren=null);
    f2.schiffe[0].aren=50;    // ein Schiff hat eine echte Zahl
    const summe=f2.schiffe.reduce((a,x)=>a+(Store.schiffFlaecheM2(x,f2)||0),0)/100;
    L.flaechenSumme={feld:f2.name, gesamtflaecheAren:f2.gesamtflaecheAren,
      summeAusSchiffen:Math.round(summe), schiffe:f2.schiffe.length};

    /* Admin kann nicht in die Vergangenheit navigieren */
    Admin.tagOffset=0; Admin.tagWechsel(-1);
    L.tagOffsetNachRueckwaerts='(async, siehe unten)';
    /* Pausiert-Logik */
    const sek={id:'p1',kulturId:'k-salat',pflanzdatum:'2026-01-01',pausiert:true,pausiertBis:null,prioritaet:'normal'};
    L.pausiertOhneEnde_wirdUebersprungen = (sek.pausiert && (!sek.pausiertBis || sek.pausiertBis>=D.today()));
    sek.pausiertBis=D.add(D.today(),-1);
    L.pauseAbgelaufen_wirdGeplant = !(sek.pausiert && (!sek.pausiertBis || sek.pausiertBis>=D.today()));
    return L;
  });
  console.log(JSON.stringify(out,null,1));

  /* UI-Smoketest */
  await pg.click('.tile');                    // Admin
  await pg.waitForTimeout(600);
  const modal = await pg.$('#mask.on');
  if(modal){ const skip=await pg.$('button.ghost'); }
  await pg.evaluate(()=>{ closeModal(); Store.db.einstellungen.setupErledigt=true; Store.db.einstellungen.regenGefragtAm=D.today(); });
  for(const tab of ['plan','standorte','kulturen','journal','einst']){
    await pg.evaluate(t=>Admin.go(t), tab);
    await pg.waitForTimeout(400);
  }
  await pg.evaluate(()=>{Admin.standortId=Store.db.standorte[0].id; Admin.go('standorte');});
  await pg.waitForTimeout(900);
  await pg.evaluate(()=>App.home());
  await pg.waitForTimeout(200);
  await pg.click('.tile.wm');
  await pg.waitForTimeout(400);
  await pg.click('.langpick button[data-l="de"]');
  await pg.waitForTimeout(500);
  await pg.evaluate(()=>WM.menu()); await pg.waitForTimeout(300);
  await pg.evaluate(()=>{closeModal(); WM.rechner();}); await pg.waitForTimeout(400);
  await pg.evaluate(()=>closeModal());
  await pg.waitForTimeout(300);
  console.log("SMOKETEST ERRORS:", errs.length?errs:'keine');
  await b.close();
})();
