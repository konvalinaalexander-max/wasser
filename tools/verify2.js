const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);

  const r=await pg.evaluate(()=>{
    const L={};
    /* A16/C2: mehrmals täglich, isoliert */
    const cher=Store.db.felder.find(f=>f.name==='Cherwis');
    Store.setRegel(cher.id,'k-karotten',{anzahl:2,einheit:'tag',mm:5,zeiten:[6,16],phasen:[]});
    cher.schiffe.forEach(s=>{ s.sektoren=[{id:'ck-'+s.id,polygon:null,kulturId:'k-karotten',
      pflanzdatum:D.add(D.today(),-30),prioritaet:'normal',pausiert:false,
      letzteBewaesserung:D.add(D.today(),-1)}]; });
    Store.changed('kultur');
    const heute=Store.db.plan[D.today()].auftraege.filter(a=>a.feldId===cher.id);
    L.mehrmalsTaeglich=heute.map(a=>({gang:a.gangNr+'/'+a.gaenge, zeit:a.zeitfenster,
      mm:a.zielMm, schiffe:a.nummern.length, gruppen:(a.gruppen||[]).map(g=>g.join('+'))}));

    /* C1: Gruppenvorschlag genutzt */
    L.gruppenGenutzt=Object.values(Store.db.plan).flatMap(p=>p.auftraege)
      .filter(a=>(a.gruppen||[]).length).length;

    /* A12/Sprenkler */
    const ids=cher.schiffe.slice(0,2).map(s=>s.id);
    L.sprenkler={eins:Engine.sprenklerFuer([ids[0]]), zwei:Engine.sprenklerFuer(ids)};
    L.dauer={eins:Engine.dauerFuer([ids[0]],20).min, zwei:Engine.dauerFuer(ids,20).min};

    /* A9: Sektor ohne Regel wird gemeldet statt verschluckt */
    const f2=Store.db.felder.find(f=>f.name==='Au Landi');
    f2.schiffe[0].sektoren=[{id:'sx',polygon:null,kulturId:'k-kabis',prioritaet:'normal',pausiert:false}];
    Store.changed('kultur');
    L.ohneRegel=Engine.probleme().ohneRegel.map(x=>x.feld.name+'/'+(x.kultur?x.kultur.name:'?'));

    /* F3: Historie schiffbezogen */
    const f3=Engine.feldFuerJournal('Cherwis');
    const s1=f3.schiffe.find(s=>String(s.nummer)==='1');
    const h=WM.historieFuer([s1.id]);
    L.historieSchiffbezogen={n:h.length, alleEnthalten1:h.every(e=>(e.schiffe||[]).includes('1'))};
    L.historieFeldweit=Store.db.journal.filter(e=>e.feldJournal==='Cherwis').length;

    /* F4: Zählerstand vom Standort */
    L.zaehler=(()=>{ const z=WM.letzterZaehler(f3.standortId);
      return z?{datum:z.datum, feld:z.feldJournal, stopM3:z.stopM3}:null; })();

    /* C3: Meldung erreicht den Admin */
    Store.db.meldungen=[]; WM.schaffNichtSenden=WM.schaffNichtSenden;
    Store.db.meldungen.push({id:'m1',datum:D.today(),zeit:'14:00',text:'Regen',gelesen:false});
    const div=document.createElement('div'); document.body.appendChild(div);
    Admin.vPlan(div);
    L.meldungSichtbar=div.textContent.includes('Meldung');
    div.remove();

    /* E8: Rohre feldweit */
    const f4=Store.db.felder.find(f=>Store.feldRohre(f).length) || Store.db.felder[0];
    f4.schiffe[0].rohre=[{id:'r1',punkte:[[0,0],[1,1]],name:'1/2'}];
    L.rohreFeldweit=Store.feldRohre(f4).length;

    /* C10: tote Attribute entfernt */
    L.toteAttribute=Store.db.felder.filter(f=>'einzelschiff' in f||'planSeite' in f||'journalName' in f).length;
    L.journalGeklaertImModell=Store.db.standorte.filter(s=>'_journalGeklaert' in s).length;
    L.letzteRegenStandorte='letzteRegenStandorte' in Store.db.einstellungen;

    /* G6: Standort in genau einer Station */
    Admin.wsToggle('ws1', Store.db.standorte[0].id, true);
    Admin.wsToggle('ws2', Store.db.standorte[0].id, true);
    const treffer=Store.db.wetterstationen.filter(w=>w.standortIds.includes(Store.db.standorte[0].id));
    L.stationEindeutig={stationen:treffer.length, regen:(()=>{
      Store.db.regen=[]; treffer.forEach(w=>Store.db.regen.push({id:uid('r'),datum:D.today(),mm:10,
        standortIds:w.standortIds.slice(),stationId:w.id}));
      return Engine.regenAm(Store.db.standorte[0].id, D.today()); })()};
    return L;
  });
  console.log(JSON.stringify(r,null,1));

  /* Import ohne Migration – Views in einem angehängten Container rendern */
  const imp=await pg.evaluate(()=>{
    const alt={standorte:Store.db.standorte, felder:Store.db.felder, kulturen:Store.db.kulturen,
      regeln:{}, journal:[], einstellungen:{ansprechperson:'X'}};
    const box=document.createElement('div'); box.id='admPage2'; document.body.appendChild(box);
    try{
      Store.migriere(JSON.parse(JSON.stringify(alt)));
      Engine.clearRef(); Engine.planNeu();
      ['vEinst','vPlan','vJournal','vKulturen','vStandorte'].forEach(v=>{
        box.innerHTML=''; Admin.standortId=null; Admin[v](box); });
      box.remove();
      return 'OK – alle fünf Ansichten rendern, kapazitaet='+JSON.stringify(Store.db.journalKapazitaet);
    }catch(e){ box.remove(); return 'CRASH: '+e.message; }
  });
  console.log('\nImport ohne Migration:', imp);

  /* UI-Smoketest über echte Klicks */
  await pg.reload(); await pg.waitForTimeout(900);
  await pg.click('.tile'); await pg.waitForTimeout(700);
  await pg.evaluate(()=>{ closeModal(); Store.db.einstellungen.setupErledigt=true;
    Store.db.einstellungen.regenGefragtAm=D.today(); Setup.kulturenAusRegeln(); closeModal(); });
  for(const t of ['plan','standorte','kulturen','journal','einst']){
    await pg.evaluate(x=>Admin.go(x), t); await pg.waitForTimeout(350);
  }
  await pg.evaluate(()=>{Admin.standortId=Store.db.standorte[0].id; Admin.go('standorte');});
  await pg.waitForTimeout(800);
  for(const r of ['sektoren','rohr','kultur','schiffe']){
    await pg.evaluate(x=>{FeldEditor.reiter=x; FeldEditor.render();}, r); await pg.waitForTimeout(300);
  }
  await pg.evaluate(()=>{Admin.standortId=null; Admin.go('plan');
    const d=Store.db.plan[D.today()]; if(d.auftraege.length) Admin.auftragBearbeiten(D.today(), d.auftraege[0].id);});
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>{ const d=Store.db.plan[D.today()];
    if(d.auftraege.length) Admin.auftragSpeichern(D.today(), d.auftraege[0].id); });
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>{ Admin.freigabe(D.today(),true); App.home(); });
  await pg.waitForTimeout(200);
  await pg.click('.tile.wm'); await pg.waitForTimeout(400);
  for(const lang of ['hu','pl','de']){
    await pg.evaluate(l=>{ localStorageless.lang=l; LANG=l; WM.view='liste'; WM.render(); }, lang);
    await pg.waitForTimeout(300);
    const txt=await pg.evaluate(()=>document.getElementById('wmPage').textContent.slice(0,90));
    console.log('  '+lang+': '+txt.replace(/\s+/g,' ').trim());
  }
  await pg.evaluate(()=>{ const d=Store.db.plan[D.today()];
    if(d.auftraege.length){ WM.auftrag=d.auftraege[0]; WM.view='detail'; WM.render(); } });
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>WM.startDialog()); await pg.waitForTimeout(300);
  await pg.evaluate(()=>WM.startSpeichern()); await pg.waitForTimeout(300);
  const lauf=await pg.evaluate(()=>Store.db.laufend.length);
  await pg.evaluate(()=>{ const l=Store.db.laufend[0]; WM.stoppDialog(l.id); });
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>{ document.getElementById('wmT2').value='12:00';
    document.getElementById('wmM2').value=String((Store.db.laufend[0].startM3||0)+40);
    WM.stoppSpeichern(Store.db.laufend[0].id); });
  await pg.waitForTimeout(400);
  const nach=await pg.evaluate(()=>({laufend:Store.db.laufend.length,
    journalNeu:Store.db.journal.filter(e=>e.quelle==='app').length}));
  await pg.evaluate(()=>{ WM.menu(); });
  await pg.waitForTimeout(200);
  await pg.evaluate(()=>{ closeModal(); WM.rechner(); });
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>closeModal());
  console.log('\nStart/Stopp:', {laufendNachStart:lauf, ...nach});
  console.log('\nERRORS:', errs.length?errs:'keine');
  await b.close();
})();
