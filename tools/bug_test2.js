const {chromium}=require('playwright');
const LAUNCH={executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']};
(async()=>{
  const b=await chromium.launch(LAUNCH); const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await pg.goto('file://'+process.cwd()+'/build/wasserplan.html');
  await pg.waitForTimeout(1000);
  const out=await pg.evaluate(()=>{
    const L={};
    const jm=Store.db.einstellungen.journalMap;
    L.felderOhneJournal = Store.db.felder.filter(f=>!Object.values(jm).includes(f.id)).length+' von '+Store.db.felder.length;

    /* --- Regel 'frei' wird beim Bearbeiten zerstört --- */
    const fid=Store.db.felder[0].id;
    Store.setRegel(fid,'k-salat',{anzahl:1,einheit:'frei',tage:10,mm:30,zeiten:[],phasen:[]});
    Admin.regelBearbeiten(fid,'k-salat');
    L.freiRegel_selectWert=document.getElementById('reEinheit').value;  // erwartet 'frei', real?
    L.freiRegel_tageFeldVorhanden=!!document.getElementById('reTage');
    Admin.regelSpeichern(fid,'k-salat');
    L.freiRegel_nachSpeichern=JSON.stringify(Store.regel(fid,'k-salat'));
    L.freiRegel_intervallVorher=10;
    L.freiRegel_intervallNachher=Engine.regelIntervall(Store.regel(fid,'k-salat'));

    /* --- _stoppFinal markiert ALLE Sektoren eines Schiffs --- */
    const f=Store.db.felder.find(x=>x.schiffe.length);
    const s=f.schiffe[0];
    s.sektoren=[{id:'sekA',polygon:[[0,0],[1,0],[1,1]],kulturId:'k-salat',pflanzdatum:'2026-06-01',prioritaet:'normal',pausiert:false},
                {id:'sekB',polygon:[[0,0],[1,0],[0,1]],kulturId:'k-fenchel',pflanzdatum:'2026-06-01',prioritaet:'normal',pausiert:false}];
    Store.reindex();
    Store.db.laufend=[{id:'runX',auftragId:'irgendwas',datum:D.today(),standortId:f.standortId,feldId:f.id,
      schiffIds:[s.id],nummern:[s.nummer],kulturId:'k-salat',zielMm:15,startZeit:'08:00',startM3:100,
      kreisregner:4,sektorregner:null}];
    // Dialog-Felder simulieren
    const d=document.createElement('div'); d.innerHTML='<input id="wmBem" value="">'; document.body.appendChild(d);
    WM._bem='';
    WM._stoppFinal('runX','10:00',130,false);
    L.stopp_beideSektorenMarkiert = s.sektoren.map(k=>({id:k.id,kultur:k.kulturId,letzte:k.letzteBewaesserung}));
    const letzterJ=Store.db.journal[Store.db.journal.length-1];
    L.neuerJournalEintrag={feldJournal:letzterJ.feldJournal, mappt: !!Engine.feldFuerJournal(letzterJ.feldJournal)};

    /* --- Import ohne Migration --- */
    const alt={standorte:Store.db.standorte, felder:Store.db.felder, kulturen:Store.db.kulturen,
      regeln:{}, journal:[], einstellungen:{ansprechperson:'X'}, plan:{}};  // alte Datei ohne neue Felder
    try{
      Store.db=JSON.parse(JSON.stringify(alt)); Store.reindex();
      Admin.vEinst(document.createElement('div'));
      L.importOhneMigration='kein Fehler';
    }catch(e){ L.importOhneMigration='CRASH: '+e.message; }
    return L;
  });
  console.log(JSON.stringify(out,null,1));
  console.log("ERRORS:",errs.length?errs:'keine');
  await b.close();
})();
