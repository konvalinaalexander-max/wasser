const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html'); await pg.waitForTimeout(1000);
  const r=await pg.evaluate(()=>{
    const med=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);const m=b.length>>1;
      return b.length%2?b[m]:(b[m-1]+b[m])/2;};
    const out={};

    /* A) Intervall PRO SCHIFF statt pro Feld */
    const proSchiff={};
    Store.db.journal.forEach(e=>{
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      f.schiffe.forEach(s=>{ if(e.schiffe.includes(String(s.nummer)))
        (proSchiff[s.id]=proSchiff[s.id]||new Set()).add(e.datum); });
    });
    out.intervallProSchiff=Object.entries(proSchiff).filter(([k,v])=>v.size>=6).map(([k,set])=>{
      const d=[...set].sort(); const gaps=[];
      for(let i=1;i<d.length;i++) gaps.push(D.diff(d[i-1],d[i]));
      const i=Store.db._sch[k];
      const r=Object.entries(Store.db.regeln).find(([key])=>key.startsWith(i.feld.id+'::'));
      return {schiff:i.feld.name+' '+i.schiff.nummer, gaenge:d.length,
        medianAbstand:med(gaps), regelSoll:r?Engine.regelIntervall(r[1]):null,
        von:d[0], bis:d[d.length-1]};
    }).sort((a,b)=>b.gaenge-a.gaenge).slice(0,18);

    /* B) Wie viele Schiffe pro Eintrag? */
    const anz={};
    Store.db.journal.forEach(e=>{ const n=e.schiffe.length; anz[n]=(anz[n]||0)+1; });
    out.schiffeProEintrag=anz;

    /* C) Werden die Schiffe eines Feldes am selben Tag oder verteilt bewässert? */
    const feldTag={};
    Store.db.journal.forEach(e=>{
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f||!e.schiffe.length) return;
      const k=f.id+'|'+e.datum;
      (feldTag[k]=feldTag[k]||new Set()); e.schiffe.forEach(s=>feldTag[k].add(s));
    });
    const abdeck=[];
    Object.entries(feldTag).forEach(([k,set])=>{
      const fid=k.split('|')[0]; const f=Store.feld(fid);
      const n=Store.echteSchiffe(f).length; if(n>1) abdeck.push(set.size/n);
    });
    out.feldabdeckungProTag={n:abdeck.length, median:+med(abdeck).toFixed(2),
      ganzesFeld:abdeck.filter(x=>x>=0.99).length, unterHalb:abdeck.filter(x=>x<0.5).length};

    /* D) Regnerzahl gegen Dauer: mehrere Stellungen? */
    const paare=[];
    Store.db.journal.forEach(e=>{
      const r=(e.kreisregner||0)+(e.sektorregner||0);
      if(r&&e.dauerMin&&e.schiffe.length===1) paare.push({r, d:e.dauerMin, m3:e.m3});
    });
    const bucket={};
    paare.forEach(p=>{ const b=p.r<=6?'1-6':p.r<=12?'7-12':p.r<=20?'13-20':'21+';
      (bucket[b]=bucket[b]||[]).push(p); });
    out.regnerGegenDauer=Object.entries(bucket).map(([k,v])=>({regner:k,n:v.length,
      medianDauer:med(v.map(x=>x.d)), medianM3:med(v.map(x=>x.m3).filter(Boolean))}));

    /* E) m³ pro Stunde – der Durchfluss. Ist der konstant? */
    const fluss=[];
    Store.db.journal.forEach(e=>{ if(e.m3&&e.dauerMin>=20) fluss.push({
      q:e.m3/(e.dauerMin/60), r:(e.kreisregner||0)+(e.sektorregner||0)}); });
    out.durchfluss={n:fluss.length, medianM3h:+med(fluss.map(x=>x.q)).toFixed(1),
      p10:+[...fluss.map(x=>x.q)].sort((a,b)=>a-b)[Math.floor(fluss.length*.1)].toFixed(1),
      p90:+[...fluss.map(x=>x.q)].sort((a,b)=>a-b)[Math.floor(fluss.length*.9)].toFixed(1)};
    const fb={};
    fluss.forEach(p=>{ if(!p.r) return; const b=p.r<=6?'1-6':p.r<=12?'7-12':p.r<=20?'13-20':'21+';
      (fb[b]=fb[b]||[]).push(p.q); });
    out.durchflussJeRegnerzahl=Object.entries(fb).map(([k,v])=>({regner:k,n:v.length,
      medianM3h:+med(v).toFixed(1), proRegner:+(med(v)/(k==='1-6'?4:k==='7-12'?9:k==='13-20'?16:25)).toFixed(2)}));

    /* F) Kulturwechsel im Journal – wie oft ändert sich die Kultur auf einem Feld? */
    const kult={};
    Store.db.journal.forEach(e=>{ if(!e.kultur) return;
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      (kult[f.name]=kult[f.name]||new Set()).add(e.kultur); });
    out.kulturenJeFeld=Object.entries(kult).map(([k,v])=>({feld:k,kulturen:[...v]}))
      .filter(x=>x.kulturen.length>1).slice(0,10);
    out.kulturNamen=[...new Set(Store.db.journal.map(e=>e.kultur).filter(Boolean))].sort();

    /* G) Bemerkungen – was schreibt der Wassermann? */
    const bem=Store.db.journal.map(e=>e.bemerkung).filter(Boolean);
    out.bemerkungen={n:bem.length, beispiele:[...new Set(bem)].slice(0,25)};

    /* H) Lücken: Tage ohne jede Bewässerung */
    const tage=[...new Set(Store.db.journal.map(e=>e.datum))].sort();
    const luecken=[];
    for(let i=1;i<tage.length;i++){ const g=D.diff(tage[i-1],tage[i]); if(g>1) luecken.push({nach:tage[i-1],tage:g-1}); }
    out.pausen={anzahl:luecken.length, laengste:luecken.sort((a,b)=>b.tage-a.tage).slice(0,6)};
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
