const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);
  const r=await pg.evaluate(()=>{
    Setup.kulturenAusRegeln(); closeModal();
    const L={};
    L.proTag=[];
    for(let i=0;i<10;i++){ const d=D.add(D.today(),i); const p=Store.db.plan[d];
      L.proTag.push({t:i, auftraege:p.auftraege.length, standorte:p.standorte,
        kap:p.kapazitaet, max:p.maxAuftraege, ueberlastet:p.ueberlastet, grund:p.grund}); }
    const p0=Store.db.plan[D.today()];
    L.tag0=p0.auftraege.map(a=>({feld:Store.feld(a.feldId).name, schiffe:a.nummern.join('+')||'ganz',
      mm:a.zielMm, ueberf:a.ueberfaellig, gesch:a.geschaetzt}));
    L.buendelung={};
    p0.auftraege.forEach(a=>{ const n=Store.feld(a.feldId).name;
      L.buendelung[n]=(L.buendelung[n]||0)+1; });
    L.gruppenBekannt=Store.db.felder.map(f=>({f:f.name, g:Engine.gruppenFuer(f.id).length}))
      .filter(x=>x.g);
    /* Mehrmals täglich gezielt testen */
    const cher=Store.db.felder.find(f=>f.name==='Cherwis');
    cher.schiffe.forEach(s=>{ s.sektoren=[{id:'ck-'+s.id, polygon:null, kulturId:'k-karotten',
      pflanzdatum:D.add(D.today(),-30), prioritaet:'normal', pausiert:false, letzteBewaesserung:D.add(D.today(),-2)}]; });
    Store.changed('kultur');
    const heute=Store.db.plan[D.today()].auftraege.filter(a=>a.feldId===cher.id);
    L.cherwis=heute.map(a=>({schiffe:a.nummern.join('+'), mm:a.zielMm, gang:a.gaenge?a.gangNr+'/'+a.gaenge:'–', zeit:a.zeitfenster}));
    L.cherwisRegel=Store.regel(cher.id,'k-karotten');
    return L;
  });
  console.log(JSON.stringify(r,null,1));
  console.log('ERRORS:',errs.length?errs:'keine');
  await b.close();
})();
