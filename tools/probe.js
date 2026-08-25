const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const pg=await b.newPage();
  const errs=[];
  pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(()=>{
    const R=Engine.refWerte();
    const jm=Store.db.einstellungen.journalMap||{};
    return {
      startStat: document.getElementById('startStat').textContent,
      sektoren: Store.sektoren().length,
      regeln: Object.keys(Store.db.regeln).length,
      planTage: Object.keys(Store.db.plan).length,
      auftraegeHeute: (Store.db.plan[D.today()]||{}).auftraege?.length ?? null,
      auftraegeGesamt: Object.values(Store.db.plan).reduce((a,p)=>a+p.auftraege.length,0),
      refGlobal: R.global, refN: R.n, refSchiffe: Object.keys(R.schiff).length,
      journalMapped: Object.keys(jm).length,
      journalUnmapped: Engine.journalFelder().filter(j=>!jm[j]),
      journalNamen: Engine.journalFelder().length,
      gruppen: Store.db.gruppen.length,
      dauerBeispiel: Engine.dauerFuer([Store.db.felder[0].schiffe[0].id], 20)
    };
  });
  console.log(JSON.stringify(r,null,1));
  console.log("CONSOLE ERRORS:", errs.length?errs:'keine');
  await b.close();
})();
