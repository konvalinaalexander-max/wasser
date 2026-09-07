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

  /* ---- Auswertung: rechnet sie, und rechnet sie das Richtige? ---- */
  const AW=await pg.evaluate(()=>{
    const o={};
    Admin.go('auswert');
    o.tabellen=document.querySelectorAll('#admPage .atab').length;
    o.balken=document.querySelectorAll('#admPage .bar').length;

    /* mm darf nicht über Einträge summiert werden, die verschiedene Schiffe
       betreffen — sonst vervielfacht sich das Ist mit der Zahl der Schiffe.
       Der Test rechnet dieselbe Kombination BEIDE Wege nach und verlangt, dass
       die Ansicht dem richtigen folgt. Damit er überhaupt unterscheiden kann,
       wird eine Kombination mit mehreren Schiffen gewählt und geprüft, dass
       die beiden Wege sich deutlich unterscheiden. */
    const S=Auswert.sollIst();
    o.sollIst=S.length;
    o.hatBeobachtet=S.filter(x=>x.ivBeob!=null).length;
    o.istPlausibel=S.every(x=>x.istProTag>=0 && x.istProTag<40);

    const probe=S.filter(x=>x.nSchiffe>=3).sort((a,b)=>b.n-a.n)[0];
    if(probe){
      const E=Auswert.daten().E.filter(x=>x.feld && x.kultur && !x.rollomat
        && x.feld.id===probe.feld.id && x.kultur.id===probe.kultur.id && x.mm!=null);
      const r=Store.regel(probe.feld.id, probe.kultur.id);
      const iv=Engine.regelIntervall(r);
      /* Weg A – falsch: über alle Einträge des FELDES summieren */
      let mmA=0, vonA=null, bisA=null;
      E.forEach(x=>{ mmA+=x.mm;
        if(!vonA||x.datum<vonA) vonA=x.datum; if(!bisA||x.datum>bisA) bisA=x.datum; });
      const istFalsch = mmA/Math.max(iv, D.diff(vonA,bisA)+iv);
      /* Weg B – richtig: je SCHIFF, danach der Median */
      const jeS={};
      E.forEach(x=>x.schiffe.forEach(sc=>{
        const t=jeS[sc.id]=jeS[sc.id]||{mm:0,von:x.datum,bis:x.datum};
        t.mm+=x.mm;
        if(x.datum<t.von) t.von=x.datum; if(x.datum>t.bis) t.bis=x.datum; }));
      const werte=Object.values(jeS)
        .map(t=>t.mm/Math.max(iv, D.diff(t.von,t.bis)+iv)).sort((a,b)=>a-b);
      const istRichtig=werte.length%2 ? werte[werte.length>>1]
        : (werte[(werte.length>>1)-1]+werte[werte.length>>1])/2;
      o.probe={feld:probe.feld.name, kultur:probe.kultur.name, schiffe:probe.nSchiffe,
               ansicht:+probe.istProTag.toFixed(3),
               richtig:+istRichtig.toFixed(3), falsch:+istFalsch.toFixed(3)};
      o.folgtRichtigem = Math.abs(probe.istProTag-istRichtig) < 0.01*Math.max(1,istRichtig);
      o.wegeUnterscheidbar = istFalsch > istRichtig*1.5;
    }

    /* Fläche darf nicht doppelt gezählt werden: die berührte Fläche im
       Überblick kann nie grösser sein als die Fläche aller Schiffe. */
    const Ub=Auswert.ueberblick();
    let gesamtM2=0;
    Store.db.felder.forEach(f=>Store.echteSchiffe(f).forEach(s=>
      gesamtM2+=Store.schiffFlaecheM2(s,f)||0));
    o.flaechePlausibel = Ub.aren<=U.m2NachAren(gesamtM2)*1.001;
    o.gaenge=Ub.gaenge;

    /* Deckungsschwelle muss jenseits des 95. Prozentwerts liegen, sonst
       wirft sie gesunde Einträge weg. */
    const dk=[];
    Store.db.journal.forEach(e=>{ const d=Engine.deckungVon(e); if(d!=null) dk.push(d); });
    dk.sort((a,b)=>a-b);
    o.p95=dk[Math.floor(dk.length*0.95)];
    o.schwelleUeberP95 = Engine.DECKUNG_MAX > o.p95;
    o.fraglich=dk.filter(x=>x>Engine.DECKUNG_MAX).length;
    o.anteilFraglich=+(o.fraglich/dk.length).toFixed(3);

    /* Zeitraumwechsel darf die Zahlen ändern, aber nicht zerstören. Bewusst
       KEINE Annahme, dass ein Fenster gefüllt ist — das Journal endet am
       04.08.2026, und je nach heutigem Datum ist „letzte 30 Tage" leer. Genau
       dieser Fall muss eine brauchbare Ansicht ergeben statt einer leeren Seite. */
    Auswert.zeitraum='tage30'; Auswert._cache=null; Admin.render();
    o.tage30=Auswert.ueberblick().gaenge;
    o.leerZustandBrauchbar = o.tage30>0
      || !!document.querySelector('#admPage .infobox button');
    Auswert.zeitraum='alles'; Auswert._cache=null; Admin.render();
    o.alles=Auswert.ueberblick().gaenge;
    Auswert.zeitraum='saison'; Auswert._cache=null; Admin.render();
    return o;
  });
  t('Auswertung rendert Tabellen und Balken', AW.tabellen>=5 && AW.balken>20, AW);
  t('Soll-Ist rechnet je Schiff, nicht je Feld',
    AW.sollIst>=5 && AW.istPlausibel && AW.folgtRichtigem && AW.wegeUnterscheidbar, AW.probe);
  t('Soll-Ist schlägt eine beobachtete Regel vor', AW.hatBeobachtet>=AW.sollIst-2, AW);
  t('berührte Fläche ohne Doppelzählung', AW.flaechePlausibel, AW);
  t('Deckungsschwelle liegt jenseits des 95. Prozentwerts',
    AW.schwelleUeberP95 && AW.anteilFraglich<0.08, {p95:AW.p95, anteil:AW.anteilFraglich});
  t('Zeiträume liefern eine sinnvolle Staffelung',
    AW.tage30<=AW.gaenge && AW.alles>=AW.gaenge && AW.leerZustandBrauchbar,
    {t30:AW.tage30, saison:AW.gaenge, alles:AW.alles, leerOk:AW.leerZustandBrauchbar});

  /* ---- Klärfall auflösen: die drei Wege müssen wirken ---- */
  const KL=await pg.evaluate(()=>{
    const o={}, heute=D.today();
    Engine.planNeu();
    const finde=()=>(Store.db.plan[heute]||{auftraege:[]}).auftraege
      .filter(a=>a.quelle==='auto' && a.rueckstand);
    const a=finde()[0];
    if(!a) return {kein:true};
    o.vorher=finde().length;

    /* Weg 1 — Gang nachtragen */
    const jVorher=Store.db.journal.length;
    Admin._klaer={datum:heute, auftragId:a.id};
    Admin.klaerGangNachtragen();
    document.getElementById('kgDatum').value=heute;
    Admin.klaerGangSpeichern();
    o.journalGewachsen=Store.db.journal.length===jVorher+1;
    const sek=Store.db._sch[a.schiffIds[0]].schiff.sektoren.find(k=>a.sektorIds.includes(k.id));
    o.letzteGesetzt = sek && sek.letzteBewaesserung===heute;
    /* Auf SEKTOR-Ebene prüfen, nicht auf Auftragsebene: ein Auftrag bündelt
       Feld + Kultur, andere Sektoren desselben Feldes erzeugen denselben
       Schlüssel weiter. Entscheidend ist, dass DIESE Sektoren raus sind. */
    const imRueckstand=()=>new Set(Object.values(Store.db.plan)
      .flatMap(pp=>pp.auftraege).filter(x=>x.rueckstand).flatMap(x=>x.sektorIds||[]));
    const rs1=imRueckstand();
    o.keinRueckstandMehr = a.sektorIds.every(id=>!rs1.has(id));

    /* Weg 3 — Kultur abgeräumt */
    const b=finde()[0];
    if(b){
      const schiff=Store.db._sch[b.schiffIds[0]].schiff;
      const vorherSek=(schiff.sektoren||[]).filter(k=>k.kulturId).length;
      Admin._klaer={datum:heute, auftragId:b.id};
      Admin.klaerAbgeraeumt(); window._frageFn();
      const nachherSek=(schiff.sektoren||[]).filter(k=>k.kulturId).length;
      o.kulturWeg = nachherSek < vorherSek;
      const alleSek=new Set(Object.values(Store.db.plan)
        .flatMap(pp=>pp.auftraege).flatMap(x=>x.sektorIds||[]));
      o.auftragWeg = b.sektorIds.every(id=>!alleSek.has(id));
    } else { o.kulturWeg=true; o.auftragWeg=true; }

    /* Weg 2 — Regel öffnen (nur dass der Dialog kommt) */
    const c=finde()[0] || a;
    Admin._klaer={datum:heute, auftragId:c.id};
    Admin.klaerRegel();
    o.regelDialog = !!document.getElementById('reMm');
    closeModal();
    return o;
  });
  /* ---- Freigegebene Tage: Anzeige darf nachgeführt werden, der Plan nicht ---- */
  const FG=await pg.evaluate(()=>{
    const heute=D.today();
    Admin.freigabe(heute,true);
    Engine.planNeu();
    const vorher=(Store.db.plan[heute]||{auftraege:[]}).auftraege
      .map(a=>[a.key, a.zielMm, a.dauerMin, a.erledigt]).sort();
    /* alles anfassen, was die Bilanz verschiebt */
    Store.db.journal.push({id:uid('j'), datum:heute, feldJournal:'__test__',
      schiffRoh:'', schiffe:[], kultur:null, dauerMin:null, m3:null, quelle:'app'});
    Store.changed('journal');
    for(let i=0;i<3;i++) Engine.planNeu();
    const nachher=(Store.db.plan[heute]||{auftraege:[]}).auftraege
      .map(a=>[a.key, a.zielMm, a.dauerMin, a.erledigt]).sort();
    Store.db.journal=Store.db.journal.filter(j=>j.feldJournal!=='__test__');
    Store.changed('journal');
    return {gleich: JSON.stringify(vorher)===JSON.stringify(nachher),
            n:vorher.length, freigegeben:!!Store.db.plan[heute].freigegeben};
  });
  t('freigegebener Tag behält Umfang, Menge und Dauer',
    FG.gleich && FG.freigegeben, FG);

  t('Klärfall lässt sich auf allen drei Wegen auflösen',
    KL.kein || (KL.journalGewachsen && KL.letzteGesetzt && KL.keinRueckstandMehr
                && KL.kulturWeg && KL.auftragWeg && KL.regelDialog), KL);

  /* ---- Kulturphasen greifen nur mit Pflanzdatum ---- */
  const PH=await pg.evaluate(()=>{
    const o={}, heute=D.today();
    const e0=Store.sektoren().find(e=>e.sektor.kulturId && Store.regel(e.feld.id,e.sektor.kulturId));
    if(!e0) return {kein:true};
    const key=Store.regelKey(e0.feld.id, e0.sektor.kulturId);
    const alt=JSON.parse(JSON.stringify(Store.db.regeln[key]));
    const altDatum=e0.sektor.pflanzdatum;

    /* Grundregel 30 mm alle 7 Tage, Anwachsphase 8 mm alle 2 Tage */
    Store.setRegel(e0.feld.id, e0.sektor.kulturId, {anzahl:1, einheit:'frei', tage:7, mm:30,
      zeiten:[], phasen:[{vonTag:0, bisTag:20, anzahl:1, einheit:'frei', tage:2, mm:8}]});

    e0.sektor.pflanzdatum=null; Store.changed('kultur');
    o.problemErkannt = Engine.probleme().phasenOhneDatum.some(x=>x.sektor.id===e0.sektor.id);
    const ohne=Engine.bilanz(e0, heute);
    o.mengeOhneDatum = ohne? ohne.menge : null;

    /* frisch gepflanzt: die Phase muss greifen */
    e0.sektor.pflanzdatum=D.add(heute,-5); Store.changed('kultur');
    const mit=Engine.bilanz(e0, heute);
    o.mengeMitDatum = mit? mit.menge : null;
    o.intervallMitDatum = mit? mit.intervall : null;

    /* alt genug: die Phase ist vorbei, die Grundregel gilt wieder */
    e0.sektor.pflanzdatum=D.add(heute,-60); Store.changed('kultur');
    const spaet=Engine.bilanz(e0, heute);
    o.mengeSpaet = spaet? spaet.menge : null;

    o.phaseGreift = o.mengeOhneDatum===30 && o.mengeMitDatum===8
                    && o.intervallMitDatum===2 && o.mengeSpaet===30;

    Store.db.regeln[key]=alt; e0.sektor.pflanzdatum=altDatum||null; Store.changed('kultur');
    return o;
  });
  t('Kulturphasen greifen nur mit Pflanzdatum, und dann richtig',
    PH.kein || (PH.phaseGreift && PH.problemErkannt), PH);

  /* ---- Flächen eintragen ---- */
  const FL=await pg.evaluate(()=>{
    const o={};
    Admin.flaechenLuecken();
    o.uebersichtZeilen=document.querySelectorAll('.modal tbody tr').length;
    closeModal();

    const f=Store.db.felder.find(x=>x.gesamtflaecheAren
      && Store.echteSchiffe(x).length>=3
      && x.schiffe.every(s=>!s.aren && !(s.laengeM&&s.breiteM)));
    if(!f) return {kein:true};

    /* Vorher: alle Flächen abgeleitet */
    const vorher=f.schiffe.map(s=>Math.round(Store.schiffFlaecheM2(s,f)));
    o.herkunftVorher=W.wert(Engine.flaecheFuer([f.schiffe[0].id]))!=null
      ? Engine.flaecheFuer([f.schiffe[0].id]).quelle : null;

    /* Festschreiben darf die Zahlen NICHT verändern — es macht aus einer
       Annahme nur eine Angabe. Sonst wäre der Knopf eine stille Datenänderung. */
    f.schiffe.forEach(s=>{ const m2=Store.schiffFlaecheM2(s,f);
      if(m2) s.aren=Math.round(m2/100*10)/10; });
    Store.changed('geometrie');
    const nachher=f.schiffe.map(s=>Math.round(Store.schiffFlaecheM2(s,f)));
    o.unveraendert = vorher.every((v,i)=>Math.abs(v-nachher[i])<=Math.max(5, v*0.005));
    o.herkunftNachher=Engine.flaecheFuer([f.schiffe[0].id]).quelle;
    o.wirdMessung = o.herkunftVorher==='annahme' && o.herkunftNachher==='messung';

    /* eine eingetragene Zahl schlägt die abgeleitete */
    f.schiffe[0].aren=12.5;
    Store.changed('geometrie');
    o.eigeneZahlGewinnt = Math.round(Store.schiffFlaecheM2(f.schiffe[0],f))===1250;

    /* zurücksetzen */
    f.schiffe.forEach(s=>{ s.aren=null; }); Store.changed('geometrie');
    o.zurueck = f.schiffe.every((s,i)=>Math.abs(Store.schiffFlaecheM2(s,f)-vorher[i])<=5);
    return o;
  });
  t('Flächen-Übersicht und Herkunft der Fläche',
    FL.kein || (FL.uebersichtZeilen>0 && FL.unveraendert && FL.wirdMessung
                && FL.eigeneZahlGewinnt && FL.zurueck), FL);

  /* ---- Überdachte Flächen bekommen keinen Regen ---- */
  const UE=await pg.evaluate(()=>{
    const o={}, heute=D.today();
    const a0=(Store.db.plan[heute]||{auftraege:[]}).auftraege.find(a=>a.quelle==='auto');
    if(!a0) return {kein:true};
    const feld=Store.feld(a0.feldId), st=feld.standortId;
    const info=Store.db._sch[a0.schiffIds[0]];
    const sek=info && info.schiff.sektoren.find(x=>x.kulturId);
    if(!sek) return {kein:true};

    /* kräftiger Regen an diesem Standort über zwei Wochen zurück */
    for(let i=0;i<14;i++) Store.db.regen.push({id:uid('rg'), datum:D.add(heute,-i), mm:20,
      standortIds:[st], stationId:null});
    /* und eine lange Trockenphase davor, damit die Bilanz überhaupt Tage im
       Regenfenster durchläuft */
    sek.letzteBewaesserung = D.add(heute,-20);

    const eintrag={sektor:sek, schiff:info.schiff, feld, standort:Store.standort(st)};
    const bis=D.add(heute,1);

    feld.ueberdacht=false; Store.changed('regen');
    o.regenFreiland = Engine.regenFuerFeld(feld, st, heute);
    const frei=Engine.bilanz(eintrag, bis);

    feld.ueberdacht=true; Store.changed('regen');
    o.regenUeberdacht = Engine.regenFuerFeld(feld, st, heute);
    const dach=Engine.bilanz(eintrag, bis);

    o.defizitFreiland   = frei? +frei.defizit.toFixed(2) : null;
    o.defizitUeberdacht = dach? +dach.defizit.toFixed(2) : null;
    o.regenGreift = o.regenFreiland>0 && o.regenUeberdacht===0
                    && o.defizitUeberdacht > o.defizitFreiland;

    /* Aufträge dieses Feldes im Horizont: unter Dach kein Regen, kein Vorschlag,
       aber der Standortregen bleibt sichtbar */
    Engine.planNeu();
    const meine=Object.entries(Store.db.plan)
      .flatMap(([d,pp])=>pp.auftraege.filter(x=>x.feldId===feld.id && x.quelle==='auto')
        .map(x=>({d, regenMm:x.regenMm, standort:x.regenStandortMm, anp:x.angepasstMm})))
      .filter(x=>Store.db.regen.some(r=>r.datum===x.d && r.standortIds.includes(st)));
    o.nAuftraege=meine.length;
    o.keinVorschlagUnterDach = meine.every(x=>x.regenMm===0 && x.anp==null);
    o.zeigtStandortregen     = meine.every(x=>x.standort>0);

    feld.ueberdacht=false; Store.db.regen=[]; sek.letzteBewaesserung=null;
    Store.changed('regen');
    return o;
  });
  t('überdachte Flächen bekommen keinen Regen angerechnet',
    UE.kein || (UE.regenGreift && UE.keinVorschlagUnterDach
                && (UE.nAuftraege===0 || UE.zeigtStandortregen)), UE);

  /* ---- Rückstands-Stufung: die Reihung darf sich nicht still umdrehen ---- */
  const rk=await pg.evaluate(()=>{
    Engine.planNeu();
    const a=Object.values(Store.db.plan).flatMap(p=>p.auftraege).filter(x=>x.quelle==='auto');
    const markiert=a.every(x=>x.rueckstand===(x.dringlichkeit>=Engine.RUECKSTAND_AB));
    /* innerhalb gleicher Priorität steht kein Rückstand vor einem normalen Auftrag */
    let ordnung=true;
    Object.values(Store.db.plan).forEach(p=>{
      const l=p.auftraege.filter(x=>x.quelle==='auto'&&x.prioritaet==='normal');
      for(let i=1;i<l.length;i++) if(l[i-1].rueckstand && !l[i].rueckstand) ordnung=false;
    });
    return {markiert, ordnung, hatFeld:a.length? ('rhythmus' in a[0]) : false};
  });
  t('Rückstände sind markiert und stehen hinten', rk.markiert&&rk.ordnung&&rk.hatFeld, rk);

  /* ---- Backtest-Kennzahlen: dürfen nicht still schlechter werden ----
     Quelle ist tools/_backtest.json, geschrieben von tools/backtest.js.
     Die Schwellen liegen unter den gemessenen Werten, aber deutlich über
     dem, was ein kaputtes Modell liefern würde. */
  const fsx=require('fs');
  if(fsx.existsSync('tools/_backtest.json')){
    const B=JSON.parse(fsx.readFileSync('tools/_backtest.json','utf8'));
    const alt = fsx.statSync('tools/_backtest.json').mtimeMs < fsx.statSync('build/wasserplan.html').mtimeMs;
    if(alt) console.log('  ! tools/_backtest.json ist älter als der Build — `node tools/backtest.js` neu laufen lassen');
    t('Backtest: Reihung schlägt den Zufall in der eigenen Liste',
      B.rangTrefferEngine > B.rangTrefferZufallInListe*1.2,
      {engine:B.rangTrefferEngine, zufall:B.rangTrefferZufallInListe});
    t('Backtest: Reihung schlägt die triviale Vergleichsbasis',
      B.rangTrefferEngine > B.rangTrefferBasis*2, {engine:B.rangTrefferEngine, basis:B.rangTrefferBasis});
    t('Backtest: F1 der Fälligkeit über der Vergleichsbasis',
      B.f1Engine > B.f1Basis, {engine:B.f1Engine, basis:B.f1Basis});
    t('Backtest: Dauerprognose zu über 85 % innerhalb ±30 %',
      B.dauerInnerhalb30 >= 0.85, B.dauerInnerhalb30);
    t('Backtest: Median-Fehler der Dauer unter 15 min',
      B.dauerMedianFehlerMin <= 15, B.dauerMedianFehlerMin);
  } else {
    console.log('  ! tools/_backtest.json fehlt — `node tools/backtest.js` liefert die Kennzahlen');
  }

  console.log(`\n  ${pass} bestanden, ${fail} fehlgeschlagen`);
  await b.close();
  process.exit(fail?1:0);
})();
