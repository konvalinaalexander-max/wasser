/* ============================================================
   SETUP — geführte Ersteinrichtung als Vollseite.
   Pro Standort: zuerst Journal-Popup, dann derselbe Feld-Editor
   wie im Standorte-Reiter, mit Weiter-Knopf durch die 4 Reiter.
   ============================================================ */
const Setup = {
  aktiv:false, idx:0, feldIdx:0,

  willkommen(){
    const pr=Engine.probleme();
    openModal('Willkommen',
      `<p style="margin-top:0">Bevor der Wasserplan rechnen kann, müssen die Pläne einmal durchgegangen werden:
        Schiffe zurechtziehen, wo nötig Sektoren teilen, Rohre einzeichnen, Kulturen und Regeln erfassen.</p>
       <div class="okbox" style="margin:14px 0"><b>${Store.db.standorte.length} Standorte · ${Store.db.felder.length} Felder ·
         ${Store.schiffZahl()} Schiffe</b> sind aus den Plänen grob vorbereitet.</div>
       ${pr.verwaisteRegeln.length&&!pr.planbar?`<div class="infobox">
         <b>${pr.verwaisteRegeln.length} Bewässerungsregeln liegen schon bereit</b> — aus den Startwerten des Betriebs.
         Sie wirken erst, wenn die passenden Flächen eine Kultur haben.
         <div style="margin-top:9px"><button class="btn sm" onclick="Setup.kulturenAusRegeln()">
           Kulturen daraus übernehmen und danach prüfen</button></div>
         <div class="tiny dim" style="margin-top:6px">Setzt bei jedem Feld mit genau einer Startregel die
           passende Kultur auf alle Schiffe. Felder mit mehreren Regeln bleiben offen — die musst du selbst aufteilen.</div>
        </div>`:''}
       <p class="tiny muted">Jederzeit unterbrechbar — der Fortschritt bleibt erhalten.</p>`,
      `<button class="btn ghost" onclick="Setup.ueberspringen()">Setup überspringen</button>
       <div class="sp"></div>
       <button class="btn pri" onclick="closeModal();Setup.start()">Ersteinrichtung starten</button>`);
  },

  /* Startregeln in echte Kulturzuweisungen überführen.
     Nur eindeutige Fälle: Felder mit genau EINER Regel. Alles andere bleibt
     dem Menschen überlassen – die App erfindet keine Aufteilung. */
  kulturenAusRegeln(){
    const proFeld={};
    Object.keys(Store.db.regeln).forEach(key=>{
      const i=key.indexOf('::'); if(i<0) return;
      const fid=key.slice(0,i), kid=key.slice(i+2);
      (proFeld[fid]=proFeld[fid]||[]).push(kid);
    });
    const eindeutig=Object.entries(proFeld).filter(([fid,ks])=>{
      const f=Store.feld(fid);
      return f && ks.length===1 && Store.kultur(ks[0]) &&
             !f.schiffe.some(s=>(s.sektoren||[]).some(k=>k.kulturId));
    });
    const mehrdeutig=Object.entries(proFeld).filter(([fid,ks])=>ks.length>1 && Store.feld(fid));
    if(!eindeutig.length){
      toast(mehrdeutig.length?'Alle betroffenen Felder haben mehrere Regeln — bitte von Hand zuweisen'
                             :'Nichts zu übernehmen');
      return;
    }
    let schiffe=0;
    eindeutig.forEach(([fid,ks])=>{
      const f=Store.feld(fid);
      f.schiffe.forEach(s=>{
        s.sektoren=s.sektoren||[];
        if(s.sektoren.length) return;
        s.sektoren.push({id:uid('sek'), name:s.implizit?f.name:null, polygon:null,
          kulturId:ks[0], pflanzdatum:null, satz:null, prioritaet:'normal',
          pausiert:false, pausiertBis:null, letzteBewaesserung:null});
        schiffe++;
      });
    });
    closeModal(); Store.changed('kultur');
    if(typeof Admin!=='undefined') Admin.render();
    openModal('Kulturen übernommen',
      `<div class="okbox" style="margin-top:0"><b>${eindeutig.length} Felder · ${schiffe} Schiffe</b>
        haben jetzt die Kultur aus ihrer Startregel. Der Tagesplan rechnet ab sofort mit.</div>
       <p class="tiny muted">Was noch fehlt: das <b>Pflanzdatum</b> je Fläche. Ohne Datum schätzt die App den
        Startpunkt und streut die erste Fälligkeit über das Intervall — die Aufträge sind dann als
        „Fälligkeit geschätzt" gekennzeichnet.</p>
       ${mehrdeutig.length?`<div class="warnbox tiny"><b>${mehrdeutig.length} Feld${mehrdeutig.length===1?'':'er'}
         mit mehreren Kulturen</b> (${esc(mehrdeutig.map(([fid])=>Store.feld(fid).name).join(', '))})
         bleiben offen — dort musst du selbst festlegen, welche Kultur auf welchem Schiff steht.</div>`:''}`,
      `<button class="btn" onclick="closeModal()">Später</button>
       <div class="sp"></div>
       <button class="btn pri" onclick="closeModal();Setup.start()">Jetzt durchgehen</button>`);
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
  geklaert(sid){ return (Store.db.einstellungen.setupJournalGeklaert||[]).includes(sid); },

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
      <button class="btn sm ghost" ${this.idx===0?'disabled':''} onclick="Setup.zurueckStandort()">‹ Vorheriger</button>
      <button class="btn sm ghost" onclick="Setup.naechsterStandort()">Überspringen ›</button>`;
    p.appendChild(kopf);

    if(fs.length>1){
      const fw=el('div','row wrap'); fw.style.margin='0 0 10px';
      fs.forEach((f,i)=>{ const b=el('button','btn sm'+(i===this.feldIdx?' pri':''),
          esc(f.name)+(f.bewaessert===false?' ✕':'')+(f.geprueft?' ✓':''));
        b.onclick=()=>{this.feldIdx=i; FeldEditor.schiffId=null; this.zeige();};
        fw.appendChild(b); });
      p.appendChild(fw);
    }

    const zeile=el('div','row wrap tiny'); zeile.style.marginBottom='8px';
    zeile.innerHTML=`
      <label class="row" style="gap:6px"><input type="checkbox" ${feld.bewaessert!==false?'checked':''}
        style="width:17px;height:17px"
        onchange="Store.feld('${feld.id}').bewaessert=this.checked;Store.changed('kultur');Setup.zeige()">
        <span>wird bewässert</span></label>
      <span class="dim">${feld.gesamtflaecheAren?feld.gesamtflaecheAren+' Aren':'Fläche fehlt'}
        · ${Store.echteSchiffe(feld).length} Schiffe</span>
      ${feld.gemeindeFehlt?'<span style="color:var(--amber)">Gemeinde fehlt</span>':''}
      ${feld.unsicher?'<span style="color:var(--rust)">Digitalisierung unsicher</span>':''}
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
    if(this.geklaert(st.id)) return;
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
          <select class="inp suJ" data-feld="${esc(f.id)}" style="margin-top:6px">
            <option value="" ${!cur?'selected':''}>— neues Feld, keine Historie —</option>
            <option value="__weg">— wird nicht bewässert —</option>
            ${jf.map(j=>`<option value="${esc(j)}" ${cur===j?'selected':''}>${esc(j)} (${
              Store.db.journal.filter(e=>e.feldJournal===j).length})</option>`).join('')}
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
    const liste=Store.db.einstellungen.setupJournalGeklaert;
    if(!liste.includes(this.st().id)) liste.push(this.st().id);
    closeModal(); Store.changed('journal',{stillerPlan:true});
    /* Hinweis: Journal kennt Schiffe, Plan (noch) nicht */
    const fs=this.felder();
    const warn=fs.filter(f=>{
      const jn=Object.entries(jm).find(([k,v])=>v===f.id)?.[0];
      return jn && Store.echteSchiffe(f).length<=1 &&
        Store.db.journal.some(e=>e.feldJournal===jn && e.schiffe.length>1);
    });
    if(warn.length) toast('Im Journal sind für '+warn.map(f=>f.name).join(', ')+
      ' mehrere Schiffe erfasst – bitte Schiffe eintragen');
    this.zeige();
  },

  naechstesFeld(){
    const fs=this.felder();
    if(fs[this.feldIdx]){ fs[this.feldIdx].geprueft=true; Store.mark(); }
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
    Store.db.einstellungen.setupErledigt=true;
    Store.changed('kultur');
    const pr=Engine.probleme();
    this.beenden(true);
    openModal('Ersteinrichtung abgeschlossen',
      `<div class="okbox"><b>Alle Standorte durchgegangen.</b> Der Wasserplan rechnet ab jetzt laufend mit.</div>
       <ul style="padding-left:20px;color:var(--ink-2);font-size:14px">
        <li>${Store.db.felder.filter(f=>f.bewaessert!==false).length} bewässerte Felder mit
            ${Store.db.felder.filter(f=>f.bewaessert!==false).reduce((a,f)=>a+Store.echteSchiffe(f).length,0)} Schiffen</li>
        <li><b>${pr.planbar} Sektoren sind planbar</b> (Kultur und Regel vorhanden)</li>
        <li>${Object.keys(Store.db.regeln).length} Bewässerungsregeln</li>
        ${pr.ohneGemeinde?`<li style="color:var(--amber)">${pr.ohneGemeinde} Felder ohne Gemeinde</li>`:''}
        ${pr.ohneRegel.length?`<li style="color:var(--rust)">${pr.ohneRegel.length} Sektoren ohne Regel — werden nicht eingeplant</li>`:''}
        ${pr.ohneKultur.length?`<li style="color:var(--amber)">${pr.ohneKultur.length} Schiffe ohne Kultur</li>`:''}
        ${pr.ohneRohr.length?`<li style="color:var(--amber)">${pr.ohneRohr.length} Felder ohne eingezeichnete Rohre</li>`:''}
        ${pr.verwaisteRegeln.length?`<li class="dim">${pr.verwaisteRegeln.length} Regeln ohne zugehörige Fläche</li>`:''}
       </ul>
       <div class="tiny dim" style="margin-top:12px">Nicht vergessen: Daten sichern.</div>`,
      `<button class="btn" onclick="Store.exportFile()">Daten sichern</button>
       <button class="btn pri" onclick="closeModal()">Zum Tagesplan</button>`);
  }
};
