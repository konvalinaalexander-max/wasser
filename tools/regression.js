const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
let pass=0, fail=0;
const t=(n,c,d)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d!==undefined?'  → '+JSON.stringify(d):''));} };
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html'); await pg.waitForTimeout(1200);

  const R=await pg.evaluate(()=>{
    const o={};
    Setup.kulturenAusRegeln(); closeModal();
    const heute=D.today();
    o.planbar=Engine.probleme().planbar;
    o.tage=[]; for(let i=0;i<10;i++) o.tage.push((Store.db.plan[D.add(heute,i)]||{auftraege:[]}).auftraege.length);
    o.keinTagUeberKap=Object.values(Store.db.plan).every(p=>!p.ueberlastet);
    // Wiederholung
    const v={}; for(let i=0;i<10;i++)(Store.db.plan[D.add(heute,i)]||{auftraege:[]}).auftraege
      .forEach(a=>{const n=Store.feld(a.feldId).name+'/'+Store.kultur(a.kulturId).name;(v[n]=v[n]||0);v[n]++;});
    o.taeglich=v['Eichhof 2/Salat']||0; o.woche=v['Eichhof 1/Karotten']||0;
    // Determinismus
    const vor=JSON.stringify(Object.entries(Store.db.plan).map(([d,p])=>[d,p.auftraege.map(a=>a.key)]));
    Engine.planNeu(); Engine.planNeu(); Engine.planNeu();
    o.deterministisch = vor===JSON.stringify(Object.entries(Store.db.plan).map(([d,p])=>[d,p.auftraege.map(a=>a.key)]));
    // Eingriffe
    const a1=Store.db.plan[heute].auftraege[0];
    Admin.eingriffSpeichern(a1,{zielMm:42,notiz:'x',prioritaet:'hoch'});
    for(let i=0;i<5;i++) Engine.planNeu();
    const n1=Store.db.plan[heute].auftraege.find(a=>a.key===a1.key);
    o.eingriffStabil = n1 && n1.zielMm===42 && n1.notiz==='x' && n1.prioritaet==='hoch';
    // Verschieben mehrfach – Wochenkultur, damit die Wiederholung nicht mitzaehlt
    const finde=k=>Object.values(Store.db.plan).flatMap(p=>p.auftraege).find(x=>x.key===k);
    const z=k=>[0,1,2,3,4,5].map(i=>(Store.db.plan[D.add(heute,i)]||{auftraege:[]}).auftraege.filter(a=>a.key===k).length);
    const w=Store.db.plan[heute].auftraege.find(a=>a.quelle==='auto'&&a.key!==a1.key&&a.zielMm===30);
    let cur=w;
    for(let i=0;i<2;i++){ Engine.verschiebe(cur.datum,cur.id,1); cur=finde(w.key); }
    o.zweifachVerschoben=z(w.key);
    // Anpassung ueberlebt das Verschieben
    Admin.eingriffSpeichern(cur,{zielMm:77,notiz:'bleibt'});
    Engine.planNeu(); Engine.planNeu();
    const nw=finde(w.key);
    o.anpassungNachVerschieben = nw && nw.zielMm===77 && nw.notiz==='bleibt';
    // wieder zurueck an den Ausgangstag
    for(let i=0;i<2;i++){ const c=finde(w.key); Engine.verschiebe(c.datum,c.id,-1); }
    o.zurueckAmStart=z(w.key);
    // Export/Import-Rundlauf
    const dump=JSON.parse(JSON.stringify(Store.db));
    ['_st','_fd','_sch','_ku'].forEach(k=>delete dump[k]);
    const s1=JSON.stringify(dump).length;
    Store.migriere(JSON.parse(JSON.stringify(dump)));
    Engine.clearRef(); Engine.planNeu();
    o.rundlauf = Store.sektoren().length>0 && Engine.probleme().planbar>0 && s1>1000;
    // Freigabe bleibt
    Admin.freigabe(heute,true); Engine.planNeu(); Engine.planNeu();
    o.freigabeBleibt = Store.db.plan[heute].freigegeben===true;
    // Regeln
    const fid=Store.db.felder[0].id;
    Store.setRegel(fid,'k-salat',{anzahl:1,einheit:'frei',tage:10,mm:30,zeiten:[],phasen:[]});
    Admin.regelBearbeiten(fid,'k-salat'); Admin.regelSpeichern(fid,'k-salat');
    o.freiRegel=Engine.regelIntervall(Store.regel(fid,'k-salat'))===10;
    // mm-Bezug: beide Definitionen vorhanden, die eingestellte wird geliefert
    const e=Store.db.journal.find(x=>x.m3&&x.kreisregner&&Engine.feldFuerJournal(x.feldJournal));
    const beide=Engine.mmBeide(e);
    const alt=Store.db.einstellungen.mmBezug;
    Store.db.einstellungen.mmBezug='beregnet';
    const mmB=Engine.mmVonEintrag(e);
    Store.db.einstellungen.mmBezug='flaeche';
    const mmF=Engine.mmVonEintrag(e);
    Store.db.einstellungen.mmBezug=alt;
    o.mmDefinition = beide.flaeche!=null && beide.beregnet!=null
      && Math.abs(mmB-beide.beregnet)<1e-9 && Math.abs(mmF-beide.flaeche)<1e-9;
    // Durchflussmodell: Dauer folgt aus Menge und Durchfluss
    const f9=Store.db.felder.find(x=>x.schiffe.length>=2);
    const g9=Engine.gangFuer(f9.schiffe.slice(0,2).map(s=>s.id), 15);
    o.gangKette = g9.zielM3!=null && W.wert(g9.dauerMin)!=null
      && Math.abs(W.wert(g9.dauerMin) - g9.zielM3/W.wert(g9.qM3h)*60) < 0.5;
    // Herkunft und Unsicherheit erreichen die Oberflaeche
    o.herkunft = ['messung','schiff','feld','betrieb','annahme','keine'].includes(g9.dauerMin.quelle)
      && g9.dauerMin.sd!=null && W.zeichen(g9.dauerMin).length===3;
    // Shrinkage: duenn belegtes Schiff wird Richtung Feldwert gezogen
    const R9=Engine.refWerte();
    const duenn=Object.entries(R9.schiff).filter(([k,v])=>v.n<=2 && v.q);
    o.shrinkage = duenn.length===0 || duenn.some(([k,v])=>{
      const q=W.wert(Engine.qFuerSchiffe([k]));
      const inf=Store.db._sch[k]; const rf=inf&&R9.feld[inf.feld.id];
      return q!=null && rf && Math.abs(q-rf.q) < Math.abs(v.q-rf.q)+1e-9;
    });
    // Phantom-Felder
    o.phantomWeg = !Store.db.felder.some(f=>'einzelschiff' in f||'planSeite' in f||'journalName' in f)
      && !('letzteRegenStandorte' in Store.db.einstellungen)
      && !Store.db.standorte.some(s=>'_journalGeklaert' in s);
    o.gruppenGenutzt=Object.values(Store.db.plan).flatMap(p=>p.auftraege).filter(a=>(a.gruppen||[]).length).length;
    // i18n
    const de=Object.keys(I18N.de).filter(k=>!k.startsWith('_'));
    o.i18nVoll = de.every(k=>k in I18N.hu && k in I18N.pl && typeof I18N.de[k]===typeof I18N.hu[k]);
    // Flächen
    const f5=Store.db.felder.find(x=>x.schiffe.length>=3&&x.gesamtflaecheAren);
    f5.schiffe.forEach(x=>{x.aren=null;x.laengeM=null;x.breiteM=null;}); f5.schiffe[0].aren=50;
    o.flaeche=Math.round(f5.schiffe.reduce((a,x)=>a+(Store.schiffFlaecheM2(x,f5)||0),0)/100)===f5.gesamtflaecheAren;
    // Sprenkler monoton
    const ids=Store.db.felder.find(f=>f.schiffe.length>=4).schiffe.slice(0,4).map(s=>s.id);
    const sp=[1,2,3,4].map(n=>W.wert(Engine.sprenklerFuer(ids.slice(0,n))));
    o.sprenklerMonoton = sp.every((x,i)=>i===0||(x&&sp[i-1]&&x.gesamt>=sp[i-1].gesamt));
    return o;
  });

  t('Startregeln ergeben planbare Sektoren', R.planbar>0, R.planbar);
  t('Plan über 10 Tage verteilt (kein Tag leer nach Tag 0)', R.tage.filter(x=>x>0).length>=8, R.tage);
  t('kein Tag über Kapazität', R.keinTagUeberKap);
  t('tägliche Kultur an allen 10 Tagen', R.taeglich===10, R.taeglich);
  t('Wochenkultur 1–2× in 10 Tagen', R.woche>=1&&R.woche<=2, R.woche);
  t('planNeu ist deterministisch', R.deterministisch);
  t('Admin-Eingriff übersteht 5× planNeu', R.eingriffStabil);
  t('zweimal verschoben = weiterhin ein Auftrag', JSON.stringify(R.zweifachVerschoben)==='[0,0,1,0,0,0]', R.zweifachVerschoben);
  t('Anpassung überlebt das Verschieben', R.anpassungNachVerschieben);
  t('zurückgeschoben landet wieder am Ausgangstag', JSON.stringify(R.zurueckAmStart)==='[1,0,0,0,0,0]', R.zurueckAmStart);
  t('Export→Import-Rundlauf funktioniert', R.rundlauf);
  t('Freigabe überlebt Neuberechnung', R.freigabeBleibt);
  t('„alle n Tage" übersteht den Regel-Editor', R.freiRegel);
  t('beide mm-Definitionen verfügbar und umschaltbar', R.mmDefinition);
  t('Dauer folgt aus Menge ÷ Durchfluss', R.gangKette);
  t('Herkunft und Unsicherheit erreichen die Oberfläche', R.herkunft);
  t('Shrinkage zieht dünn belegte Schiffe Richtung Feldwert', R.shrinkage);
  t('keine Phantom-Felder mehr im Modell', R.phantomWeg);
  t('Bewässerungsgruppen werden genutzt', R.gruppenGenutzt>0, R.gruppenGenutzt);
  t('I18N in allen drei Sprachen vollständig', R.i18nVoll);
  t('Flächen ohne Doppelzählung', R.flaeche);
  t('Sprenklerzahl wächst mit der Fläche', R.sprenklerMonoton);

  // UI-Durchlauf über echte Klicks, alle Ansichten, drei Sprachen
  await pg.reload(); await pg.waitForTimeout(900);
  await pg.click('.tile'); await pg.waitForTimeout(700);
  await pg.evaluate(()=>{ closeModal(); Store.db.einstellungen.setupErledigt=true;
    Store.db.einstellungen.regenGefragtAm=D.today(); Setup.kulturenAusRegeln(); closeModal(); });
  for(const tab of ['plan','standorte','kulturen','journal','einst']){
    await pg.evaluate(x=>Admin.go(x),tab); await pg.waitForTimeout(300); }
  await pg.evaluate(()=>{Admin.standortId=Store.db.standorte[0].id;Admin.go('standorte');});
  await pg.waitForTimeout(900);
  for(const r of ['sektoren','rohr','kultur','schiffe']){
    await pg.evaluate(x=>{FeldEditor.reiter=x;FeldEditor.render();},r); await pg.waitForTimeout(250); }
  await pg.evaluate(()=>{const f=Store.feld(Admin.feldId); Admin.schiffeVerwalten(f.id);}); await pg.waitForTimeout(300);
  await pg.evaluate(()=>closeModal());
  await pg.evaluate(()=>{Admin.standortId=null;Admin.go('plan');Admin.regenDialog();}); await pg.waitForTimeout(300);
  await pg.evaluate(()=>Admin.regenNein()); await pg.waitForTimeout(300);
  await pg.evaluate(()=>{Admin.neuerAuftrag(D.today());}); await pg.waitForTimeout(300);
  await pg.evaluate(()=>Admin.neuerAuftragSpeichern(D.today())); await pg.waitForTimeout(400);
  const manuell=await pg.evaluate(()=>{Engine.planNeu();
    return Store.db.plan[D.today()].auftraege.filter(a=>a.quelle==='manuell').length;});
  t('manueller Auftrag übersteht planNeu', manuell===1, manuell);
  await pg.evaluate(()=>{Admin.freigabe(D.today(),true);App.home();}); await pg.waitForTimeout(200);
  await pg.click('.tile.wm'); await pg.waitForTimeout(400);
  for(const l of ['de','hu','pl']){
    await pg.evaluate(x=>{localStorageless.lang=x;LANG=x;WM.view='liste';WM.render();},l);
    await pg.waitForTimeout(250);
    await pg.evaluate(()=>{const d=Store.db.plan[D.today()];
      if(d.auftraege.length){WM.auftrag=d.auftraege[0];WM.view='detail';WM.render();}});
    await pg.waitForTimeout(250);
    await pg.evaluate(()=>{WM.lageplan(WM.auftrag);}); await pg.waitForTimeout(250);
    await pg.evaluate(()=>closeModal());
    await pg.evaluate(()=>{WM.menu();}); await pg.waitForTimeout(150);
    await pg.evaluate(()=>{closeModal();WM.rechner();}); await pg.waitForTimeout(250);
    await pg.evaluate(()=>{WM._rcRechne();closeModal();WM.view='liste';WM.render();});
  }
  t('Konsole bleibt in allen Ansichten fehlerfrei', errs.length===0, errs.slice(0,3));

  console.log(`\n  ${pass} bestanden, ${fail} fehlgeschlagen`);
  await b.close();
  process.exit(fail?1:0);
})();
