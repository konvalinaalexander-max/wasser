const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html'); await pg.waitForTimeout(1000);
  const r=await pg.evaluate(()=>{
    const med=a=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);const m=b.length>>1;
      return b.length%2?b[m]:(b[m-1]+b[m])/2;};
    const out={};

    /* 1) Beregnete Fläche gegen tatsächliche Schifffläche */
    const verh=[], details=[];
    Store.db.journal.forEach(e=>{
      if(!e.m3||!e.dauerMin) return;
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      const bf=Engine.beregneteFlaeche(e.kreisregner,e.sektorregner); if(!bf) return;
      const sch=f.schiffe.filter(s=>e.schiffe.includes(String(s.nummer)));
      if(!sch.length) return;
      const sf=sch.reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f)||0),0); if(!sf) return;
      verh.push(bf/sf);
      details.push({feld:e.feldJournal, schiffe:e.schiffe.join('+'), regner:(e.kreisregner||0)+'K'+(e.sektorregner||0)+'S',
        beregnet:Math.round(bf), schiff:Math.round(sf), verh:+(bf/sf).toFixed(2)});
    });
    out.deckung={n:verh.length, median:+med(verh).toFixed(2),
      p10:+[...verh].sort((a,b)=>a-b)[Math.floor(verh.length*0.1)].toFixed(2),
      p90:+[...verh].sort((a,b)=>a-b)[Math.floor(verh.length*0.9)].toFixed(2),
      unter08:verh.filter(x=>x<0.8).length, ueber15:verh.filter(x=>x>1.5).length};
    out.deckungBeispiele=details.slice(0,6);

    /* 2) mm je Eintrag – Verteilung. Plausibel wären 5-40mm pro Gang */
    const mms=[];
    Store.db.journal.forEach(e=>{ const m=Engine.mmVonEintrag(e); if(m) mms.push(m); });
    const s=[...mms].sort((a,b)=>a-b);
    out.mmVerteilung={n:mms.length, p10:+s[Math.floor(s.length*0.1)].toFixed(1),
      median:+med(mms).toFixed(1), p90:+s[Math.floor(s.length*0.9)].toFixed(1),
      unter5:mms.filter(x=>x<5).length, ueber40:mms.filter(x=>x>40).length};

    /* 3) mm alternativ auf die Schifffläche gerechnet */
    const mmFeld=[];
    Store.db.journal.forEach(e=>{
      if(!e.m3) return;
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      const sch=f.schiffe.filter(s=>e.schiffe.includes(String(s.nummer)));
      const sf=(sch.length?sch:f.schiffe).reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f)||0),0);
      if(sf) mmFeld.push(e.m3*1000/sf);
    });
    const s2=[...mmFeld].sort((a,b)=>a-b);
    out.mmAufSchifflaeche={n:mmFeld.length, p10:+s2[Math.floor(s2.length*0.1)].toFixed(1),
      median:+med(mmFeld).toFixed(1), p90:+s2[Math.floor(s2.length*0.9)].toFixed(1)};

    /* 4) Regnerzahl je Schiff – ist sie konstant? */
    const proSchiff={};
    Store.db.journal.forEach(e=>{
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      const sch=f.schiffe.filter(x=>e.schiffe.includes(String(x.nummer)));
      if(sch.length!==1) return;
      const r=(e.kreisregner||0)+(e.sektorregner||0); if(!r) return;
      (proSchiff[sch[0].id]=proSchiff[sch[0].id]||[]).push(r);
    });
    const streu=Object.entries(proSchiff).filter(([k,v])=>v.length>=4).map(([k,v])=>{
      const mn=Math.min(...v), mx=Math.max(...v);
      return {schiff:Store.db._sch[k].feld.name+' '+Store.db._sch[k].schiff.nummer,
        n:v.length, min:mn, max:mx, median:med(v), konstant:mn===mx};
    });
    out.regnerKonstanz={geprueft:streu.length, konstant:streu.filter(x=>x.konstant).length,
      beispiele:streu.slice(0,8)};

    /* 5) Wie oft wurde dasselbe Schiff-Set wiederholt? (Gruppen-Stabilität) */
    const sets={};
    Store.db.journal.forEach(e=>{
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f||!e.schiffe.length) return;
      const k=f.name+': '+[...e.schiffe].sort().join('+');
      sets[k]=(sets[k]||0)+1;
    });
    const top=Object.entries(sets).sort((a,b)=>b[1]-a[1]);
    out.schiffSets={verschiedene:top.length, top:top.slice(0,12)};

    /* 6) Wie viele Standorte / Einträge pro Tag real? */
    const tage={};
    Store.db.journal.forEach(e=>{
      const f=Engine.feldFuerJournal(e.feldJournal);
      (tage[e.datum]=tage[e.datum]||{eintraege:0,standorte:new Set()});
      tage[e.datum].eintraege++;
      if(f) tage[e.datum].standorte.add(f.standortId);
    });
    const tl=Object.values(tage);
    out.tagesrhythmus={arbeitstage:tl.length,
      eintraegeMedian:med(tl.map(x=>x.eintraege)), eintraegeMax:Math.max(...tl.map(x=>x.eintraege)),
      standorteMedian:med(tl.map(x=>x.standorte.size)), standorteMax:Math.max(...tl.map(x=>x.standorte.size))};

    /* 7) Parallel laufende Bewässerungen? Überlappende Zeitfenster am selben Tag */
    let ueberlappend=0, tageMitUeberlapp=0;
    Object.entries(tage).forEach(([d])=>{
      const evs=Store.db.journal.filter(e=>e.datum===d&&e.startZeit&&e.stopZeit&&!e.ueberNacht)
        .map(e=>[hm2min(e.startZeit),hm2min(e.stopZeit)]).filter(x=>x[0]!=null&&x[1]!=null);
      let f=false;
      for(let i=0;i<evs.length;i++) for(let j=i+1;j<evs.length;j++)
        if(evs[i][0]<evs[j][1]&&evs[j][0]<evs[i][1]){ ueberlappend++; f=true; }
      if(f) tageMitUeberlapp++;
    });
    out.parallel={tageMitUeberlappung:tageMitUeberlapp, vonTagen:tl.length, paare:ueberlappend};

    /* 8) Tatsächliche Intervalle je Feld – stimmen die Regeln? */
    const proFeld={};
    Store.db.journal.forEach(e=>{
      const f=Engine.feldFuerJournal(e.feldJournal); if(!f) return;
      (proFeld[f.id]=proFeld[f.id]||new Set()).add(e.datum);
    });
    out.intervalle=Object.entries(proFeld).map(([fid,set])=>{
      const d=[...set].sort(); if(d.length<4) return null;
      const gaps=[]; for(let i=1;i<d.length;i++) gaps.push(D.diff(d[i-1],d[i]));
      const r=Object.entries(Store.db.regeln).find(([k])=>k.startsWith(fid+'::'));
      return {feld:Store.feld(fid).name, tage:d.length, medianAbstand:med(gaps),
        regel:r?Engine.regelIntervall(r[1]):null};
    }).filter(Boolean).sort((a,b)=>b.tage-a.tage).slice(0,12);

    /* 9) Dauer je Eintrag */
    const dau=Store.db.journal.map(e=>e.dauerMin).filter(Boolean).sort((a,b)=>a-b);
    out.dauer={median:med(dau), p10:dau[Math.floor(dau.length*0.1)], p90:dau[Math.floor(dau.length*0.9)],
      ueber8h:dau.filter(x=>x>480).length, unter30min:dau.filter(x=>x<30).length};

    /* 10) Startzeiten – wann arbeitet der Wassermann? */
    const std={};
    Store.db.journal.forEach(e=>{ const m=hm2min(e.startZeit); if(m==null) return;
      const h=Math.floor(m/60); std[h]=(std[h]||0)+1; });
    out.startstunden=Object.entries(std).sort((a,b)=>a[0]-b[0]).map(([h,n])=>h+':00 ×'+n).join('  ');
    return out;
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
