const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
const ok=(n,c,d)=>console.log((c?'  OK  ':'  ✗   ')+n+(d!==undefined?'   → '+JSON.stringify(d):''));
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1200);

  const r=await pg.evaluate(()=>{
    const L={};
    L.boot={ sektoren:Store.sektoren().length, planbar:Engine.probleme().planbar,
             refN:Engine.refWerte().n, refGlobal:+Engine.refWerte().global.toFixed(2),
             startStat:document.getElementById('startStat').textContent };

    /* --- A1: Kulturen aus den Startregeln übernehmen --- */
    Setup.kulturenAusRegeln(); closeModal();
    L.nachUebernahme={ sektoren:Store.sektoren().length, planbar:Engine.probleme().planbar };

    /* --- A2/A3: Verteilung über den Horizont --- */
    const tage=[];
    for(let i=0;i<10;i++){ const d=D.add(D.today(),i); const p=Store.db.plan[d];
      tage.push(p?p.auftraege.length:null); }
    L.verteilung=tage;
    const vork={};
    for(let i=0;i<10;i++){ const d=D.add(D.today(),i);
      (Store.db.plan[d]||{auftraege:[]}).auftraege.forEach(a=>{
        const n=Store.feld(a.feldId).name+'/'+Store.kultur(a.kulturId).name;
        (vork[n]=vork[n]||[]).push(i); }); }
    L.taeglicheKultur = Object.entries(vork).filter(([n])=>n.startsWith('Eichhof 2'))
      .map(([n,t])=>({n, tage:t.length}));
    L.wochenKultur = Object.entries(vork).filter(([n])=>n.startsWith('Eichhof 1'))
      .map(([n,t])=>({n, tage:t.length}));
    L.mehrmalsTaeglich = Object.values(Store.db.plan).flatMap(p=>p.auftraege)
      .filter(a=>a.gaenge).slice(0,3).map(a=>({feld:Store.feld(a.feldId).name, gang:a.gangNr+'/'+a.gaenge, zeit:a.zeitfenster}));

    /* --- A4: Admin-Anpassung überlebt planNeu --- */
    const heute=D.today();
    const a1=Store.db.plan[heute].auftraege.find(a=>a.quelle==='auto');
    Admin.eingriffSpeichern(a1,{zielMm:999, notiz:'NICHT VERLIEREN', prioritaet:'hoch'});
    Engine.planNeu(); Engine.planNeu();
    const n1=Store.db.plan[heute].auftraege.find(a=>a.key===a1.key);
    L.anpassungUeberlebt={ zielMm:n1?n1.zielMm:'weg', notiz:n1?n1.notiz:null, prio:n1?n1.prioritaet:null };

    /* --- A4b: gelöschter Auftrag bleibt weg --- */
    const a2=Store.db.plan[heute].auftraege.find(a=>a.quelle==='auto'&&a.key!==a1.key);
    const key2=a2.key;
    Admin.auftragLoeschen(heute,a2.id); Engine.planNeu();
    L.loeschungHaelt = !Store.db.plan[heute].auftraege.some(a=>a.key===key2);

    /* --- A5: Verschieben ohne Duplikat --- */
    const a3=Store.db.plan[heute].auftraege.find(a=>a.quelle==='auto'&&a.key!==a1.key&&a.key!==key2);
    const key3=a3.key;
    const res=Engine.verschiebe(heute,a3.id,1);
    Engine.planNeu();
    const zaehl=d=>(Store.db.plan[d]||{auftraege:[]}).auftraege.filter(a=>a.key===key3).length;
    L.verschieben={ok:res.ok, heute:zaehl(heute), morgen:zaehl(D.add(heute,1))};
    /* in die Vergangenheit schieben ist gesperrt */
    const a4=Store.db.plan[heute].auftraege[0];
    L.vergangenheitGesperrt=Engine.verschiebe(heute,a4.id,-1);

    /* --- A6: Phase rechnet mit dem Zieldatum --- */
    const fid=Store.db.felder[0].id;
    Store.setRegel(fid,'k-salat',{anzahl:1,einheit:'woche',mm:30,phasen:[
      {vonTag:0,bisTag:5,anzahl:1,einheit:'tag',mm:8},{vonTag:6,bisTag:null,anzahl:1,einheit:'woche',mm:30}]});
    const r2=Store.regel(fid,'k-salat'), pf=D.add(D.today(),-3);
    L.phase={heute:Engine.aktivePhase(r2,pf,D.today()).mm, in10Tagen:Engine.aktivePhase(r2,pf,D.add(D.today(),10)).mm};

    /* --- A7: Vergangenheit wird nicht angelegt --- */
    const vorher=Object.keys(Store.db.plan).length;
    Engine.tagesPlan('2026-01-15');
    L.keineVergangenheit={vorher, nachher:Object.keys(Store.db.plan).length};

    /* --- B1/B2: 'frei'-Regel überlebt den Editor --- */
    Store.setRegel(fid,'k-fenchel',{anzahl:1,einheit:'frei',tage:10,mm:30,zeiten:[],phasen:[]});
    Admin.regelBearbeiten(fid,'k-fenchel');
    const sel=document.getElementById('reEinheit').value;
    Admin.regelSpeichern(fid,'k-fenchel');
    L.freiRegel={selectWert:sel, nach:Store.regel(fid,'k-fenchel'),
                 intervall:Engine.regelIntervall(Store.regel(fid,'k-fenchel'))};

    /* --- B9: nur die richtigen Sektoren markieren --- */
    const f3=Store.db.felder.find(x=>x.schiffe.length);
    const s3=f3.schiffe[0];
    s3.sektoren=[{id:'sekA',polygon:[[0,0],[1,0],[1,1]],kulturId:'k-salat',prioritaet:'normal',pausiert:false},
                 {id:'sekB',polygon:[[0,0],[1,0],[0,1]],kulturId:'k-fenchel',prioritaet:'normal',pausiert:false}];
    Store.reindex();
    Store.db.laufend=[{id:'runX',auftragId:'x',datum:D.today(),standortId:f3.standortId,feldId:f3.id,
      schiffIds:[s3.id],nummern:[s3.nummer],kulturId:'k-salat',sektorIds:['sekA'],
      zielMm:15,startZeit:'08:00',startM3:100,kreisregner:4,sektorregner:null}];
    WM._bem=''; WM._stoppFinal('runX','10:00',130,false);
    L.sektorMarkierung=s3.sektoren.map(k=>({kultur:k.kulturId, letzte:k.letzteBewaesserung||null}));

    /* --- C4: eigener Journaleintrag ist wiederauffindbar --- */
    const letzterJ=Store.db.journal[Store.db.journal.length-1];
    L.eigenerEintrag={name:letzterJ.feldJournal, findetFeld:!!Engine.feldFuerJournal(letzterJ.feldJournal)};
    const f4=Store.db.felder.find(x=>x.schiffe.length &&
      !Object.values(Store.db.einstellungen.journalMap).includes(x.id));
    L.felderOhneMapping=Store.db.felder.filter(x=>
      !Object.values(Store.db.einstellungen.journalMap).includes(x.id)).length;

    /* --- A13/D4: eine mm-Definition, Flächen ohne Doppelzählung --- */
    const e5=Store.db.journal.find(x=>x.m3&&x.kreisregner&&Engine.feldFuerJournal(x.feldJournal));
    L.mmEinheitlich=+Engine.mmVonEintrag(e5).toFixed(1);
    const f5=Store.db.felder.find(x=>x.schiffe.length>=3&&x.gesamtflaecheAren);
    f5.schiffe.forEach(x=>{x.aren=null;x.laengeM=null;x.breiteM=null;});
    f5.schiffe[0].aren=50;
    L.flaeche={feld:f5.name, soll:f5.gesamtflaecheAren,
      ist:Math.round(f5.schiffe.reduce((a,x)=>a+(Store.schiffFlaecheM2(x,f5)||0),0)/100)};

    /* --- D1: Regenwoche summiert --- */
    Store.db.regen=[{id:'r1',datum:D.add(D.today(),-1),mm:8,standortIds:[Store.db.standorte[0].id],stationId:'ws1'},
                    {id:'r2',datum:D.add(D.today(),-2),mm:8,standortIds:[Store.db.standorte[0].id],stationId:'ws1'},
                    {id:'r3',datum:D.add(D.today(),-3),mm:8,standortIds:[Store.db.standorte[0].id],stationId:'ws1'}];
    const wo=D.add(D.today(),-6); const pt={};
    Store.db.regen.forEach(r=>{ if(r.datum>=wo&&r.datum<=D.today()) pt[r.datum]=Math.max(pt[r.datum]||0,r.mm); });
    L.regenWoche=Object.values(pt).reduce((a,b)=>a+b,0);

    /* --- G2: num --- */
    L.num={leer:num(''), leerzeichen:num(' '), null_:num(null), null2:num('abc'), nullOK:num('0'), zahl:num('12.5')};

    /* --- A11: Felder ohne Schiffe bekommen ein implizites --- */
    const f6=Store.db.felder[1];
    const merk=f6.schiffe.slice();
    f6.schiffe=[]; Store.normalisiere(); Store.reindex();
    L.implizit={schiffe:f6.schiffe.length, implizit:!!f6.schiffe[0]?.implizit,
                gezaehlt:Store.echteSchiffe(f6).length};
    f6.schiffe=merk; Store.reindex();
    return L;
  });
  console.log(JSON.stringify(r,null,1));

  /* --- B6: Import ohne Migration --- */
  const imp=await pg.evaluate(()=>{
    const alt={standorte:Store.db.standorte, felder:Store.db.felder, kulturen:Store.db.kulturen,
      regeln:{}, journal:[], einstellungen:{ansprechperson:'X'}};
    const box=document.createElement('div'); document.body.appendChild(box);
    try{ Store.migriere(JSON.parse(JSON.stringify(alt)));
      Engine.clearRef(); Engine.planNeu();
      ['vEinst','vPlan','vJournal','vKulturen','vStandorte'].forEach(v=>{
        box.innerHTML=''; Admin.standortId=null; Admin[v](box); });
      box.remove();
      return 'OK, alle Ansichten rendern · Kapazität: '+JSON.stringify(Store.db.journalKapazitaet);
    }catch(e){ box.remove(); return 'CRASH: '+e.message; }
  });
  console.log('\nImport ohne Migration:', imp);
  console.log('\nERRORS:', errs.length?errs:'keine');
  await b.close();
})();
