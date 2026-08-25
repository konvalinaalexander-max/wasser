const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1200);

  const out = await pg.evaluate(()=>{
    const log={};
    // Für jede vorhandene Regel dem ersten Schiff des Feldes einen Sektor mit dieser Kultur geben
    Object.keys(Store.db.regeln).forEach(key=>{
      const [fid,kid]=key.split('::'); const f=Store.feld(fid); if(!f||!f.schiffe.length) return;
      f.schiffe.forEach(s=>{ s.sektoren=[{id:'sek-'+s.id, polygon:null, kulturId:kid,
        pflanzdatum:'2026-06-01', prioritaet:'normal', pausiert:false, letzteBewaesserung:null}]; });
    });
    Store.reindex(); Engine.clearRef(); Engine.planNeu();
    log.sektoren=Store.sektoren().length;

    const tage=[];
    for(let i=0;i<10;i++){ const d=D.add(D.today(),i); const p=Store.db.plan[d];
      tage.push({d, n:p.auftraege.length, felder:p.auftraege.map(a=>Store.feld(a.feldId).name+'/'+Store.kultur(a.kulturId).name)}); }
    log.horizont=tage.map(t=>({d:t.d,n:t.n}));

    // Welche Feld+Kultur erscheint an welchen Tagen?
    const vork={};
    tage.forEach(t=>t.felder.forEach(x=>{(vork[x]=vork[x]||[]).push(t.d)}));
    log.vorkommen=vork;

    // Regel-Intervalle zum Abgleich
    log.regeln=Object.entries(Store.db.regeln).map(([k,r])=>{
      const [fid,kid]=k.split('::');
      return Store.feld(fid).name+' / '+Store.kultur(kid).name+' : '+
        (r.einheit==='frei'?('alle '+r.tage+' Tage'):(r.anzahl+'x pro '+r.einheit))+' '+r.mm+'mm'+
        ' -> Intervall '+Engine.regelIntervall(r)+' Tage';
    });
    return log;
  });
  console.log(JSON.stringify(out,null,1));
  console.log("ERRORS:",errs.length?errs:'keine');
  await b.close();
})();
