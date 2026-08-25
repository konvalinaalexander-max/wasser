const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);
  const out=await pg.evaluate(()=>{
    const buckets={};
    Store.db.journal.forEach(e=>{
      if(!e.m3||!e.dauerMin||e.dauerMin<5) return;
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      const fl=Engine.beregneteFlaeche(e.kreisregner,e.sektorregner); if(!fl) return;
      const mmH=(e.m3*1000/fl)/(e.dauerMin/60);
      if(!isFinite(mmH)||mmH<=0||mmH>40) return;
      const n=e.schiffe.length||1;
      const regner=(e.kreisregner||0)+(e.sektorregner||0);
      (buckets[n]=buckets[n]||[]).push({mmH,regner,dauer:e.dauerMin,m3:e.m3});
    });
    const med=a=>{const b=[...a].sort((x,y)=>x-y);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;};
    const rows=Object.entries(buckets).filter(([k,v])=>v.length>=8).map(([k,v])=>({
      schiffe:+k, n:v.length,
      mmH_median:+med(v.map(x=>x.mmH)).toFixed(2),
      regner_median:med(v.map(x=>x.regner)),
      dauer_median:med(v.map(x=>x.dauer)),
      m3_median:med(v.map(x=>x.m3))
    })).sort((a,b)=>a.schiffe-b.schiffe);
    // Regner pro Schiff
    rows.forEach(r=>r.regnerProSchiff=+(r.regner_median/r.schiffe).toFixed(2));
    return rows;
  });
  console.table(out);
  await b.close();
})();
