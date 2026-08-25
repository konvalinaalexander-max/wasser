/* ============================================================
   SETUP — geführte Ersteinrichtung als Vollseite.
   Pro Standort: zuerst Journal-Popup, dann derselbe Feld-Editor
   wie im Standorte-Reiter, mit Weiter-Knopf durch die 4 Reiter.
   ============================================================ */
const Setup = {
  aktiv:false, idx:0, feldIdx:0,

  willkommen(){
    openModal('Willkommen',
      `<p style="margin-top:0">Bevor der Wasserplan rechnen kann, müssen die Pläne einmal durchgegangen werden:
        Schiffe zurechtziehen, wo nötig Sektoren teilen, Rohre einzeichnen, Kulturen und Regeln erfassen.</p>
       <div class="okbox" style="margin:14px 0"><b>${Store.db.standorte.length} Standorte · ${Store.db.felder.length} Felder ·
         ${Store.db.felder.reduce((a,f)=>a+f.schiffe.length,0)} Schiffe</b> sind aus den Plänen grob vorbereitet.</div>
       <p class="tiny muted">Jederzeit unterbrechbar — der Fortschritt bleibt erhalten.</p>`,
      `<button class="btn ghost" onclick="Setup.ueberspringen()">Setup überspringen</button>
       <div class="sp"></div>
       <button class="btn pri" onclick="closeModal();Setup.start()">Ersteinrichtung starten</button>`);
  },
  ueberspringen(){
    Store.db.einstellungen.setupUebersprungen=true; Store.mark(); closeModal();
    this.beenden(false);
    toast('Setup übersprungen – jederzeit unter Einstellungen startbar');
    if(Store.db.einstellungen.regenGefragtAm!==D.today()) setTimeout(()=>Admin.regenDialog(),300);
  },

  start(){
    this.aktiv=true; this.idx=0; this.feldIdx=0;
    closeModal(); this.zeige();
  },
  beenden(fertig){
    this.aktiv=false;
    const b=document.getElementById('setupSkip'); if(b) b.remove();
    Admin.go(fertig?'plan':'standorte');
  },

  st(){ return Store.db.standorte[this.idx]; },
  felder(){ return this.st()?Store.felderVon(this.st().id):[]; },

  zeige(){
    if(this.idx>=Store.db.standorte.length) return this.fertig();
    const st=this.st(), fs=this.felder();
    if(!fs.length){ this.idx++; return this.zeige(); }
    if(this.feldIdx>=fs.length){ this.feldIdx=0; }
    const feld=fs[this.feldIdx];

    const p=$('#admPage'); p.innerHTML='';
    const kopf=el('div','row wrap'); kopf.style.marginBottom='10px';
    kopf.innerHTML=`
      <div style="flex:1;min-width:180px">
        <div class="tiny dim">Ersteinrichtung · Standort ${this.idx+1} von ${Store.db.standorte.length}
          ${fs.length>1?` · Feld ${this.feldIdx+1} von ${fs.length}`:''}</div>
        <h2>${esc(st.name)}</h2>
      </div>
      <button class="btn sm ghost" onclick="Setup.zurueckStandort()">‹ Vorheriger</button>
      <button class="btn sm ghost" onclick="Setup.naechsterStandort()">Überspringen ›</button>`;
    p.appendChild(kopf);

    if(fs.length>1){
      const fw=el('div','row wrap'); fw.style.margin='0 0 10px';
      fs.forEach((f,i)=>{ const b=el('button','btn sm'+(i===this.feldIdx?' pri':''),
          esc(f.name)+(f.bewaessert===false?' ✕':''));
        b.onclick=()=>{this.feldIdx=i; FeldEditor.schiffId=null; this.zeige();};
        fw.appendChild(b); });
      p.appendChild(fw);
    }

    const zeile=el('div','row wrap tiny'); zeile.style.marginBottom='8px';
    zeile.innerHTML=`
      <label class="row" style="gap:6px"><input type="checkbox" ${feld.bewaessert!==false?'checked':''}
        style="width:17px;height:17px"
        onchange="Store.feld('${feld.id}').bewaessert=this.checked;Store.mark();Setup.zeige()">
        <span>wird bewässert</span></label>
      <span class="dim">${feld.gesamtflaecheAren?feld.gesamtflaecheAren+' Aren':'Fläche fehlt'}
        · ${feld.schiffe.length} Schiffe</span>
      ${feld.gemeindeFehlt?'<span style="color:var(--amber)">Gemeinde fehlt</span>':''}
      <span class="sp"></span>
      <button class="btn sm ghost" onclick="Admin.feldBearbeiten('${feld.id}')">Stammdaten</button>`;
    p.appendChild(zeile);

    if(feld.bewaessert===false){
      const box=el('div','infobox','Dieses Feld wird nicht bewässert und kann übersprungen werden.');
      p.appendChild(box);
      const w=el('button','btn pri','Weiter →'); w.onclick=()=>this.naechstesFeld();
      p.appendChild(w);
    } else {
      const box=el('div'); p.appendChild(box);
      FeldEditor.mount(box, {standortId:st.id, feldId:feld.id, setup:true,
        onWeiter:()=>this.naechstesFeld()});
    }

    if(!document.getElementById('setupSkip')){
      const b=el('button','btn sm ghost setupskip','Setup umgehen'); b.id='setupSkip';
      b.onclick=()=>this.ueberspringen();
      document.body.appendChild(b);
    }
    this.journalPopup();
  },

  /* Popup über der Grafik: Journal-Zuordnung, einmal pro Standort */
  journalPopup(){
    const st=this.st(), fs=this.felder();
    if(st._journalGeklaert) return;
    const jm=Store.db.einstellungen.journalMap||{};
    const jf=Engine.journalFelder();
    openModal('Journal-Zuordnung · '+st.name,
      `<p class="muted tiny" style="margin-top:0">Damit die Erfahrungswerte (Dauer für X mm) stimmen, muss jedes
        Feld mit seinem Namen im bisherigen Bewässerungsjournal verbunden sein. Vorschläge aus dem automatischen Abgleich:</p>
      ${fs.map(f=>{
        const cur=Object.entries(jm).find(([k,v])=>v===f.id)?.[0]||'';
        const anzahl=cur?Store.db.journal.filter(e=>e.feldJournal===cur).length:0;
        return `<div style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="row"><b style="flex:1">${esc(f.name)}</b>
            ${cur?`<span class="chip g">${anzahl} Einträge</span>`:'<span class="chip a">ohne Historie</span>'}</div>
          <select class="inp suJ" data-feld="${f.id}" style="margin-top:6px">
            <option value="" ${!cur?'selected':''}>— neues Feld, keine Historie —</option>
            <option value="__weg">— wird nicht bewässert —</option>
            ${jf.map(j=>`<option ${cur===j?'selected':''}>${esc(j)}</option>`).join('')}
          </select></div>`;}).join('')}`,
      `<button class="btn pri" onclick="Setup.journalUebernehmen()">Übernehmen</button>`);
  },
  journalUebernehmen(){
    const jm=Store.db.einstellungen.journalMap=Store.db.einstellungen.journalMap||{};
    document.querySelectorAll('.suJ').forEach(sel=>{
      const fid=sel.dataset.feld;
      Object.keys(jm).forEach(k=>{ if(jm[k]===fid) delete jm[k]; });
      const v=sel.value;
      if(v&&v!=='__weg') jm[v]=fid;
      if(v==='__weg'){ const f=Store.feld(fid); if(f) f.bewaessert=false; }
    });
    this.st()._journalGeklaert=true;
    Engine.clearRef(); Store.mark(); closeModal();
    /* Hinweis: Journal kennt Schiffe, Plan (noch) nicht */
    const fs=this.felder();
    const warn=fs.filter(f=>{
      const jn=Object.entries(jm).find(([k,v])=>v===f.id)?.[0];
      return jn && f.schiffe.length<=1 &&
        Store.db.journal.some(e=>e.feldJournal===jn && e.schiffe.length>1);
    });
    if(warn.length) toast('Hinweis: Im Journal sind für '+warn.map(f=>f.name).join(', ')+
      ' mehrere Schiffe erfasst – bitte Schiffe eintragen');
    this.zeige();
  },

  naechstesFeld(){
    const fs=this.felder();
    fs[this.feldIdx].geprueft=true; Store.mark();
    if(this.feldIdx+1<fs.length){ this.feldIdx++; FeldEditor.schiffId=null;
      FeldEditor.reiter='schiffe'; this.zeige(); }
    else this.naechsterStandort();
  },
  naechsterStandort(){
    this.idx++; this.feldIdx=0; FeldEditor.schiffId=null; FeldEditor.reiter='schiffe';
    if(this.idx>=Store.db.standorte.length) return this.fertig();
    this.zeige();
  },
  zurueckStandort(){
    if(this.idx>0){ this.idx--; this.feldIdx=0; FeldEditor.reiter='schiffe'; this.zeige(); }
  },

  fertig(){
    Store.db.einstellungen.setupErledigt=true; Store.mark(); Engine.planNeu();
    const off=Store.db.felder.filter(f=>f.gemeindeFehlt&&f.bewaessert!==false).length;
    const ohneRegel=Store.sektoren().filter(s=>s.sektor.kulturId&&!Store.regel(s.feld.id,s.sektor.kulturId)).length;
    const ohneRohr=Store.db.felder.filter(f=>f.bewaessert!==false &&
      !f.schiffe.some(s=>(s.rohre||[]).length)).length;
    this.beenden(true);
    openModal('Ersteinrichtung abgeschlossen',
      `<div class="okbox"><b>Alle Standorte durchgegangen.</b> Der Wasserplan rechnet ab jetzt laufend mit.</div>
       <ul style="padding-left:20px;color:var(--ink-2);font-size:14px">
        <li>${Store.db.felder.filter(f=>f.bewaessert!==false).length} bewässerte Felder mit
            ${Store.db.felder.filter(f=>f.bewaessert!==false).reduce((a,f)=>a+f.schiffe.length,0)} Schiffen</li>
        <li>${Store.sektoren().filter(s=>s.sektor.kulturId).length} Sektoren mit Kultur</li>
        <li>${Object.keys(Store.db.regeln).length} Bewässerungsregeln</li>
        ${off?`<li style="color:var(--amber)">${off} Felder ohne Gemeinde</li>`:''}
        ${ohneRegel?`<li style="color:var(--rust)">${ohneRegel} Sektoren ohne Regel</li>`:''}
        ${ohneRohr?`<li style="color:var(--amber)">${ohneRohr} Felder ohne eingezeichnete Rohre</li>`:''}
       </ul>
       <div class="tiny dim" style="margin-top:12px">Nicht vergessen: Daten sichern.</div>`,
      `<button class="btn" onclick="Store.exportFile()">Daten sichern</button>
       <button class="btn pri" onclick="closeModal()">Zum Tagesplan</button>`);
  }
};

