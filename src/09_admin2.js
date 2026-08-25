/* ============================================================
   ADMIN-DIALOGE (Stammdaten, Schiffe-Tabelle, Kultur/Sektor)
   ============================================================ */
Object.assign(Admin, {
  zeigeUnbewaessert:false,

  vStandorte(p){
    if(this.standortId) return this.vStandortDetail(p);
    const n=Store.db.felder.filter(f=>!f.geprueft).length;
    if(n){ const b=el('div','infobox');
      b.innerHTML=`${n} von ${Store.db.felder.length} Feldern noch nicht geprüft.
        <button class="btn sm pri" style="margin-left:8px" onclick="Setup.start()">Geführte Ersteinrichtung</button>`;
      p.appendChild(b); }
    let versteckt=0;
    Store.db.standorte.forEach(s=>{
      const fs=Store.felderVon(s.id);
      const sichtbar=fs.filter(f=>f.bewaessert!==false);
      if(!sichtbar.length && !this.zeigeUnbewaessert){ versteckt++; return; }
      const ok=fs.filter(f=>f.geprueft).length;
      const b=el('button','lrow');
      b.innerHTML=`<span class="dot ${ok===fs.length?'ok':(ok?'warn':'')}"></span>
        <span class="lmain"><b>${esc(s.name)}</b><span>Seite ${s.seite} · ${sichtbar.length} bewässerte Felder ·
          ${sichtbar.reduce((a,f)=>a+f.schiffe.length,0)} Schiffe · ${ok}/${fs.length} geprüft</span></span>
        <span class="arw">›</span>`;
      b.onclick=()=>{this.standortId=s.id; this.feldId=null; this.render();};
      p.appendChild(b);
    });
    const t=el('button','btn sm ghost',
      this.zeigeUnbewaessert?'Nicht bewässerte ausblenden':`Nicht bewässerte anzeigen (${versteckt})`);
    t.style.marginTop='10px';
    t.onclick=()=>{this.zeigeUnbewaessert=!this.zeigeUnbewaessert; this.render();};
    p.appendChild(t);
  },

  vStandortDetail(p){
    const st=Store.standort(this.standortId);
    const fs=Store.felderVon(st.id);
    if(!this.feldId || !fs.some(f=>f.id===this.feldId)) this.feldId=fs[0]?.id||null;
    const feld=this.feldId?Store.feld(this.feldId):null;

    const bar=el('div','row wrap'); bar.style.marginBottom='10px';
    bar.innerHTML=`<button class="btn sm ghost" onclick="Admin.standortId=null;Admin.feldId=null;Admin.render()">‹ Alle Standorte</button>
      <div class="sp"></div><span class="chip">Plan-Seite ${st.seite}</span>`;
    p.appendChild(bar);
    const kopf=el('div','row wrap'); kopf.style.marginBottom='8px';
    kopf.innerHTML=`<h2 style="flex:1">${esc(st.name)}</h2>
      ${feld?`<label class="row tiny" style="gap:6px"><input type="checkbox" ${feld.bewaessert!==false?'checked':''}
        style="width:17px;height:17px" onchange="Store.feld('${feld.id}').bewaessert=this.checked;Store.mark();Engine.planNeu();Admin.render()">
        <span>wird bewässert</span></label>
      <button class="btn sm ${feld.geprueft?'ghost':''}" onclick="Store.feld('${feld.id}').geprueft=!Store.feld('${feld.id}').geprueft;Store.mark();Admin.render()">
        ${feld.geprueft?'✓ geprüft':'Als geprüft markieren'}</button>`:''}`;
    p.appendChild(kopf);

    if(fs.length>1){
      const fw=el('div','row wrap'); fw.style.margin='0 0 10px';
      fs.forEach(f=>{ const b=el('button','btn sm'+(f.id===this.feldId?' pri':''),
          esc(f.name)+(f.bewaessert===false?' ✕':''));
        b.onclick=()=>{this.feldId=f.id; FeldEditor.schiffId=null; FeldEditor.sektorId=null; this.render();};
        fw.appendChild(b); });
      p.appendChild(fw);
    }
    if(!feld){ p.appendChild(el('div','empty','<h3>Keine Felder</h3>')); return; }

    const box=el('div'); p.appendChild(box);
    FeldEditor.mount(box, {standortId:st.id, feldId:feld.id, setup:false});
  },

  /* --- Stammdaten --- */
  feldBearbeiten(id){
    const f=Store.feld(id);
    openModal('Stammdaten · '+f.name,
      `<div class="field"><label>Name</label><input class="inp" id="fbName" value="${esc(f.name)}"></div>
       <div class="grid2">
        <div class="field"><label>Gemeinde</label><input class="inp" id="fbGem" value="${esc(f.gemeinde||'')}"
          placeholder="${f.gemeindeFehlt?'muss nachgetragen werden':''}"></div>
        <div class="field"><label>Gesamtfläche (Aren)</label><input class="inp" id="fbAren" type="number"
          value="${f.gesamtflaecheAren??''}"></div></div>
       <div class="grid2">
        <div class="field"><label>Länge (m)</label><input class="inp" id="fbL" type="number" value="${f.laengeM??''}"></div>
        <div class="field"><label>Breite (m)</label><input class="inp" id="fbB" type="number" value="${f.breiteM??''}"></div></div>
       <div class="field"><label>Journal-Name (Historie)</label>
         <select class="inp" id="fbJournal">
           <option value="">— nicht zugeordnet —</option>
           ${Engine.journalFelder().map(j=>{const cur=(Store.db.einstellungen.journalMap||{})[j]===f.id;
             return `<option ${cur?'selected':''}>${esc(j)}</option>`;}).join('')}</select></div>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.feldSpeichern('${id}')">Speichern</button>`);
  },
  feldSpeichern(id){
    const f=Store.feld(id);
    f.name=$('#fbName').value.trim()||f.name;
    f.gemeinde=$('#fbGem').value.trim()||null; f.gemeindeFehlt=!f.gemeinde;
    f.gesamtflaecheAren=num($('#fbAren').value);
    f.laengeM=num($('#fbL').value); f.breiteM=num($('#fbB').value);
    const jm=Store.db.einstellungen.journalMap=Store.db.einstellungen.journalMap||{};
    Object.keys(jm).forEach(k=>{ if(jm[k]===f.id) delete jm[k]; });
    const jn=$('#fbJournal').value; if(jn) jm[jn]=f.id;
    Engine.clearRef(); Store.mark(); closeModal(); Engine.planNeu(); this.render(); toast('Gespeichert');
  },

  /* --- Schiffe-Tabelle --- */
  schiffeVerwalten(id){
    const f=Store.feld(id);
    const rows=f.schiffe.map((s,i)=>{
      const a=Store.schiffFlaecheM2(s,f);
      return `<tr>
        <td><input class="inp" style="width:70px;padding:5px 7px" value="${esc(s.nummer)}"
             onchange="Store.feld('${id}').schiffe[${i}].nummer=this.value;Store.mark()"></td>
        <td><input class="inp" style="width:78px;padding:5px 7px" type="number" value="${s.aren??''}"
             onchange="Store.feld('${id}').schiffe[${i}].aren=(this.value===''?null:+this.value);Store.mark()"></td>
        <td><input class="inp" style="width:78px;padding:5px 7px" type="number" value="${s.laengeM??''}"
             onchange="Store.feld('${id}').schiffe[${i}].laengeM=(this.value===''?null:+this.value);Store.mark()"></td>
        <td><input class="inp" style="width:78px;padding:5px 7px" type="number" value="${s.breiteM??''}"
             onchange="Store.feld('${id}').schiffe[${i}].breiteM=(this.value===''?null:+this.value);Store.mark()"></td>
        <td class="tiny dim">${a?Math.round(a/100)+' a':'–'}</td>
        <td class="tiny dim">${(s.sektoren||[]).filter(k=>k.polygon).length}/${(s.rohre||[]).length}</td>
        <td><button class="btn sm ghost" onclick="Admin.schiffLoeschen('${id}','${s.id}')">✕</button></td></tr>`;
    }).join('');
    openModal('Schiffe · '+f.name,
      `<div class="tiny muted" style="margin-bottom:10px">Eine eingetragene Aren-Zahl hat Vorrang vor der gezeichneten
        Fläche. Spalte „S/R" = Sektoren/Rohre.</div>
       <div class="scrollx"><table class="tb"><thead><tr><th>Nr.</th><th>Aren</th><th>Länge m</th><th>Breite m</th>
         <th>Fläche</th><th>S/R</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
       <div class="row wrap" style="margin-top:12px;gap:7px">
         <button class="btn sm" onclick="Admin.schiffHinzu('${id}')">+ Schiff</button>
         <button class="btn sm ghost" onclick="Admin.schiffeAufteilen('${id}')">In n gleiche Streifen teilen…</button>
         <button class="btn sm ghost" onclick="Admin.achseWechseln('${id}')">Richtung drehen</button>
       </div>`,
      `<button class="btn pri" onclick="closeModal();Admin.render()">Fertig</button>`, true);
  },
  schiffHinzu(id){
    const f=Store.feld(id); const b=polyBBox(f.umriss); const n=f.schiffe.length;
    const y=b.y+b.h*((n%5)/5), h=b.h/5;
    f.schiffe.push({id:uid('sch'), nummer:String(n+1),
      polygon:[[b.x,y],[b.x+b.w,y],[b.x+b.w,y+h],[b.x,y+h]].map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]),
      aren:null,laengeM:null,breiteM:null,rohre:[],sektoren:[]});
    Store.reindex(); Store.mark(); this.schiffeVerwalten(id);
  },
  schiffLoeschen(fid,sid){
    const f=Store.feld(fid); f.schiffe=f.schiffe.filter(s=>s.id!==sid);
    Store.reindex(); Store.mark(); this.schiffeVerwalten(fid);
  },
  schiffeAufteilen(id){
    const f=Store.feld(id);
    const n=parseInt(prompt('In wie viele gleiche Streifen aufteilen?', f.schiffe.length||5),10);
    if(!n||n<1||n>40) return;
    const b=polyBBox(f.umriss), v=f.achse==='v';
    const alt=f.schiffe.slice();
    f.schiffe=[];
    for(let i=0;i<n;i++){
      const a=i/n, c=(i+1)/n;
      const poly = v ? [[b.x+b.w*a,b.y],[b.x+b.w*c,b.y],[b.x+b.w*c,b.y+b.h],[b.x+b.w*a,b.y+b.h]]
                     : [[b.x,b.y+b.h*a],[b.x+b.w,b.y+b.h*a],[b.x+b.w,b.y+b.h*c],[b.x,b.y+b.h*c]];
      const vor=alt[i];
      f.schiffe.push({id:vor?vor.id:uid('sch'), nummer:vor?vor.nummer:String(i+1),
        polygon:poly.map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]),
        aren:vor?vor.aren:null, laengeM:vor?vor.laengeM:null, breiteM:vor?vor.breiteM:null,
        rohre:vor?vor.rohre:[], sektoren:vor?vor.sektoren:[]});
    }
    Store.reindex(); Store.mark(); closeModal();
    if(this.standortId) this.render(); else this.schiffeVerwalten(id);
  },
  achseWechseln(id){ const f=Store.feld(id); f.achse=f.achse==='v'?'h':'v'; Store.mark();
    this.schiffeAufteilen(id); },

  /* --- Kultur-/Sektor-Dialog --- */
  sektorNeu(fid,sid){ this.sektorDialog(fid,sid,null); },
  sektorBearbeiten(fid,sid,kid){ this.sektorDialog(fid,sid,kid); },
  sektorDialog(fid,sid,kid){
    const f=Store.feld(fid), s=f.schiffe.find(x=>x.id===sid);
    const k = kid? (s.sektoren||[]).find(x=>x.id===kid) : null;
    openModal((k&&k.polygon?'Sektor '+(k.name||''):'Schiff '+s.nummer)+' · Kultur',
      `<div class="field"><label>Kultur</label>
        <select class="inp" id="skKultur" onchange="Admin._skRegelVorschlag()">
          <option value="">— wählen —</option>
          ${Store.db.kulturen.map(x=>`<option value="${x.id}" ${k&&k.kulturId===x.id?'selected':''}>${x.icon||''} ${esc(x.name)}</option>`).join('')}
          <option value="__neu">＋ neue Kultur anlegen…</option>
        </select></div>
       <div class="grid2">
        <div class="field"><label>Steht dort seit</label>
          <input class="inp" id="skDatum" type="date" value="${k?.pflanzdatum||''}"></div>
        <div class="field"><label>Priorität</label>
          <select class="inp" id="skPrio">${['normal','hoch','niedrig'].map(x=>
            `<option ${k&&k.prioritaet===x?'selected':''}>${x}</option>`).join('')}</select></div></div>
       <div class="field"><label>Satz-Bezeichnung (optional)</label>
         <input class="inp" id="skSatz" value="${esc(k?.satz||'')}" placeholder="z.B. Satz 34-877"></div>
       <div id="skRegelBox"></div>
       <hr class="sep">
       <label class="row" style="gap:9px"><input type="checkbox" id="skPause" ${k?.pausiert?'checked':''}
          style="width:18px;height:18px" onchange="document.getElementById('skPauseWrap').style.display=this.checked?'block':'none'">
          <span>Vorerst nicht bewässern</span></label>
       <div class="field" id="skPauseWrap" style="margin-top:9px;display:${k?.pausiert?'block':'none'}">
         <label>Pausiert bis (leer = bis manuell aktiviert)</label>
         <input class="inp" id="skPauseBis" type="date" value="${k?.pausiertBis||''}"></div>`,
      `${k&&k.kulturId?`<button class="btn danger" onclick="Admin.kulturEntfernen('${fid}','${sid}','${kid}')">Kultur entfernen</button>`:''}
       <div class="sp"></div><button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.sektorSpeichern('${fid}','${sid}','${kid||''}')">Speichern</button>`);
    this._skFeld=f; this._skSchiff=sid; this._skKid=kid; this._skRegelVorschlag();
  },
  _skRegelVorschlag(){
    const sel=$('#skKultur'), box=$('#skRegelBox'); if(!sel||!box) return;
    if(sel.value==='__neu'){
      closeModal();
      this.kulturNeu(k=>{ this.sektorDialog(this._skFeld.id, this._skSchiff, this._skKid);
        setTimeout(()=>{ const s2=$('#skKultur'); if(s2){ s2.value=k.id; this._skRegelVorschlag(); } },60); });
      return;
    }
    const f=this._skFeld, kid=sel.value;
    if(!kid){ box.innerHTML=''; return; }
    const best=Store.regel(f.id,kid), vor=best||Store.regelVorschlag(kid);
    const r=vor||{anzahl:1,einheit:'woche',mm:30};
    box.innerHTML=`<div class="card" style="padding:13px;background:var(--paper);margin-top:6px">
      <div class="sec-title" style="margin-top:0">Bewässerungsregel für dieses Feld</div>
      ${!best&&vor?'<div class="tiny" style="color:var(--amber);margin-bottom:8px">Vorschlag von einem anderen Feld – bitte prüfen.</div>':''}
      ${!best&&!vor?'<div class="tiny" style="color:var(--rust);margin-bottom:8px">Noch keine Regel – bitte festlegen.</div>':''}
      <div class="grid3">
        <div class="field" style="margin:0"><label>Wie oft</label>
          <select class="inp" id="rgAnz">${[1,2,3,4,5,6,7].map(n=>`<option ${r.anzahl===n?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="field" style="margin:0"><label>Pro</label>
          <select class="inp" id="rgEinheit">
            <option value="tag" ${r.einheit==='tag'?'selected':''}>am Tag</option>
            <option value="woche" ${r.einheit==='woche'?'selected':''}>in der Woche</option>
            <option value="frei" ${r.einheit==='frei'?'selected':''}>alle … Tage</option></select></div>
        <div class="field" style="margin:0"><label>Menge (mm)</label>
          <input class="inp" id="rgMm2" type="number" value="${r.mm}"></div></div>
      <div class="field" id="rgFreiWrap" style="margin-top:8px;display:${r.einheit==='frei'?'block':'none'}">
        <label>Alle wie viele Tage</label><input class="inp" id="rgTage" type="number" value="${r.tage||2}"></div>
      <div class="tiny dim" style="margin-top:8px" id="rgErkl"></div></div>`;
    const upd=()=>{
      const e=$('#rgEinheit').value;
      $('#rgFreiWrap').style.display = e==='frei'?'block':'none';
      const a=+$('#rgAnz').value, mm=+$('#rgMm2').value||0;
      const iv = e==='tag'?1/a : e==='woche'?7/a : (+$('#rgTage').value||2);
      $('#rgErkl').textContent='Ergibt rund '+(mm/iv).toFixed(1)+' mm pro Tag'+
        (iv<1?' (mehrmals täglich)':' – etwa alle '+String(iv.toFixed(1)).replace('.0','')+' Tage');
    };
    ['rgAnz','rgEinheit','rgMm2','rgTage'].forEach(i=>{const n=$('#'+i); n&&n.addEventListener('input',upd);});
    upd();
  },
  sektorSpeichern(fid,sid,kid){
    const f=Store.feld(fid), s=f.schiffe.find(x=>x.id===sid);
    const kultur=$('#skKultur').value;
    if(!kultur||kultur==='__neu'){ toast('Bitte eine Kultur wählen'); return; }
    const mm=num($('#rgMm2').value);
    if(!mm){ toast('Bitte eine Menge in mm eintragen'); return; }
    Store.setRegel(f.id, kultur, {anzahl:+$('#rgAnz').value, einheit:$('#rgEinheit').value,
      tage:num($('#rgTage')?.value)||null, mm, phasen:(Store.regel(f.id,kultur)||{}).phasen||[]});
    s.sektoren=s.sektoren||[];
    let k = kid? s.sektoren.find(x=>x.id===kid) : null;
    if(!k){ k={id:uid('sek')}; s.sektoren.push(k); }
    k.kulturId=kultur; k.pflanzdatum=$('#skDatum').value||null;
    k.prioritaet=$('#skPrio').value; k.satz=$('#skSatz').value.trim()||null;
    k.pausiert=$('#skPause').checked; k.pausiertBis=$('#skPauseBis')?.value||null;
    Store.mark(); closeModal(); Engine.planNeu();
    if(FeldEditor.ctx) FeldEditor.render(); else this.render();
    toast('Kultur erfasst');
  },
  kulturEntfernen(fid,sid,kid){
    const f=Store.feld(fid), s=f.schiffe.find(x=>x.id===sid);
    const k=s.sektoren.find(x=>x.id===kid);
    if(k&&k.polygon){ k.kulturId=null; k.pflanzdatum=null; }   // Sektorfläche behalten
    else s.sektoren=s.sektoren.filter(x=>x.id!==kid);
    Store.mark(); closeModal(); Engine.planNeu();
    if(FeldEditor.ctx) FeldEditor.render(); else this.render();
  }
});

/* ---------------- KULTUREN & REGELN / JOURNAL / EINSTELLUNGEN ---------------- */
Object.assign(Admin, {
  vKulturen(p){
    p.appendChild(el('div','sec-title','Kulturen'));
    const grid=el('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px';
    Store.db.kulturen.forEach(k=>{
      const n=Store.sektoren().filter(s=>s.sektor.kulturId===k.id).length;
      const c=el('div','card'); c.style.cssText='padding:12px';
      c.innerHTML=`<div class="row"><span class="kultbadge" style="background:${k.farbe}">${k.icon||''} ${esc(k.name)}</span>
        <span class="sp"></span><button class="btn sm ghost" onclick="Admin.kulturBearbeiten('${k.id}')">⚙</button></div>
        <div class="tiny dim" style="margin-top:7px">${n} Sektor${n===1?'':'en'} im Betrieb</div>`;
      grid.appendChild(c);
    });
    p.appendChild(grid);
    const add=el('button','btn sm','+ Kultur hinzufügen'); add.style.marginTop='10px';
    add.onclick=()=>this.kulturNeu(); p.appendChild(add);

    p.appendChild(el('div','sec-title','Bewässerungsregeln (Feld + Kultur)'));
    const eintraege=Object.entries(Store.db.regeln);
    if(!eintraege.length) p.appendChild(el('div','empty','<h3>Noch keine Regeln</h3><p>Regeln entstehen, sobald du einem Schiff eine Kultur zuweist.</p>'));
    else{
      const box=el('div','scrollx');
      box.innerHTML=`<table class="tb"><thead><tr><th>Feld</th><th>Kultur</th><th>Rhythmus</th><th>Menge</th>
        <th>pro Tag</th><th>Phasen</th><th></th></tr></thead><tbody>${
        eintraege.map(([key,r])=>{
          const [sid,kid]=key.split('::'); const st=Store.feld(sid), k=Store.kultur(kid);
          if(!st||!k) return '';
          const iv=Engine.regelIntervall(r);
          return `<tr><td>${esc(st.name)}</td>
            <td><span class="kultbadge" style="background:${k.farbe}">${k.icon||''} ${esc(k.name)}</span></td>
            <td>${r.anzahl}× ${r.einheit==='tag'?'am Tag':'pro Woche'}</td>
            <td><b>${r.mm} mm</b></td>
            <td class="dim">${(r.mm/iv).toFixed(1)} mm</td>
            <td class="dim">${(r.phasen||[]).length||'–'}</td>
            <td><button class="btn sm ghost" onclick="Admin.regelBearbeiten('${sid}','${kid}')">bearbeiten</button></td></tr>`;
        }).join('')}</tbody></table>`;
      p.appendChild(box);
    }
  },
  EMOJIS:['🥬','🌿','🥕','🥦','🧄','🍠','🧅','🥔','🎃','🌽','🍓','🌱','🥗','🍆','🫐','🍅'],
  kulturNeu(cb){
    const farben=['#2F5D3A','#B3760F','#A3452F','#2A5F7A','#6B4E9E','#4A7C2F','#B0455F','#3C7A72'];
    openModal('Neue Kultur',
      `<div class="field"><label>Name</label><input class="inp" id="knName" placeholder="z.B. Fenchel"></div>
       <div class="field"><label>Symbol</label><div class="row wrap" id="knIcons">${
        this.EMOJIS.map((e,i)=>`<button class="knI" data-i="${e}" style="width:38px;height:38px;border-radius:9px;
          font-size:21px;background:var(--paper-2);border:2px solid ${i?'transparent':'#1F211D'}">${e}</button>`).join('')}</div></div>
       <div class="field"><label>Farbe</label><div class="row wrap" id="knFarben">${
        farben.map((f,i)=>`<button class="knF" data-f="${f}" style="width:34px;height:34px;border-radius:9px;background:${f};
          border:3px solid ${i?'transparent':'#1F211D'}"></button>`).join('')}</div></div>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.kulturSpeichern()">Anlegen</button>`);
    let sel=farben[0], selI=this.EMOJIS[0];
    document.querySelectorAll('.knF').forEach(b=>b.onclick=()=>{
      sel=b.dataset.f; document.querySelectorAll('.knF').forEach(x=>x.style.borderColor='transparent');
      b.style.borderColor='#1F211D'; });
    document.querySelectorAll('.knI').forEach(b=>b.onclick=()=>{
      selI=b.dataset.i; document.querySelectorAll('.knI').forEach(x=>x.style.borderColor='transparent');
      b.style.borderColor='#1F211D'; });
    this._knFarbe=()=>sel; this._knIcon=()=>selI; this._knCb=cb;
  },
  kulturSpeichern(){
    const n=$('#knName').value.trim(); if(!n){ toast('Name fehlt'); return; }
    const k={id:uid('k'), name:n, icon:this._knIcon(), farbe:this._knFarbe()};
    Store.db.kulturen.push(k); Store.reindex(); Store.mark(); closeModal();
    if(this._knCb) this._knCb(k); else this.render();
    toast('Kultur angelegt');
  },
  kulturBearbeiten(id){
    const k=Store.kultur(id);
    openModal('Kultur · '+k.name,
      `<div class="field"><label>Name</label><input class="inp" id="kbName" value="${esc(k.name)}"></div>
       <div class="field"><label>Symbol</label><div class="row wrap">${
        this.EMOJIS.map(e=>`<button class="kbI" data-i="${e}" style="width:38px;height:38px;border-radius:9px;
          font-size:21px;background:var(--paper-2);border:2px solid ${e===(k.icon||'')?'#1F211D':'transparent'}">${e}</button>`).join('')}</div></div>
       <div class="field"><label>Farbe</label><input class="inp" id="kbFarbe" type="color" value="${k.farbe}" style="height:44px;padding:4px"></div>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.kulturUpdate('${id}')">Speichern</button>`);
    this._kbIcon=k.icon||null;
    document.querySelectorAll('.kbI').forEach(b=>b.onclick=()=>{
      this._kbIcon=b.dataset.i;
      document.querySelectorAll('.kbI').forEach(x=>x.style.borderColor='transparent');
      b.style.borderColor='#1F211D'; });
  },
  kulturUpdate(id){
    const k=Store.kultur(id);
    const ib=document.querySelector('.kbI[style*="rgb(31"]')||document.querySelector('.kbI[data-sel]');
    k.name=$('#kbName').value.trim()||k.name; k.farbe=$('#kbFarbe').value;
    if(this._kbIcon) k.icon=this._kbIcon;
    Store.mark(); closeModal(); this.render();
  },
  regelBearbeiten(sid,kid){
    const r=Store.regel(sid,kid)||{anzahl:1,einheit:'woche',mm:30,phasen:[]};
    const ph=(r.phasen||[]).map((p,i)=>`
      <div class="card" style="padding:10px;margin-bottom:7px;background:var(--paper)">
        <div class="grid2" style="gap:7px">
          <div class="field" style="margin:0"><label>Ab Tag nach Pflanzung</label>
            <input class="inp phVon" type="number" value="${p.vonTag??0}"></div>
          <div class="field" style="margin:0"><label>Bis Tag (leer = offen)</label>
            <input class="inp phBis" type="number" value="${p.bisTag??''}"></div>
        </div>
        <div class="grid3" style="margin-top:7px">
          <div class="field" style="margin:0"><label>Wie oft</label>
            <select class="inp phAnz">${[1,2,3,4,5,6,7].map(n=>`<option ${p.anzahl===n?'selected':''}>${n}</option>`).join('')}</select></div>
          <div class="field" style="margin:0"><label>Pro</label>
            <select class="inp phEinheit"><option value="tag" ${p.einheit==='tag'?'selected':''}>am Tag</option>
              <option value="woche" ${p.einheit==='woche'?'selected':''}>in der Woche</option></select></div>
          <div class="field" style="margin:0"><label>mm</label><input class="inp phMm" type="number" value="${p.mm}"></div>
        </div>
        <button class="btn sm ghost" style="margin-top:7px" onclick="this.closest('.card').remove()">Phase entfernen</button>
      </div>`).join('');
    openModal('Regel · '+Store.feld(sid).name+' · '+Store.kultur(kid).name,
      `<div class="sec-title" style="margin-top:0">Grundregel</div>
       <div class="grid3">
         <div class="field" style="margin:0"><label>Wie oft</label>
           <select class="inp" id="reAnz">${[1,2,3,4,5,6,7].map(n=>`<option ${r.anzahl===n?'selected':''}>${n}</option>`).join('')}</select></div>
         <div class="field" style="margin:0"><label>Pro</label>
           <select class="inp" id="reEinheit"><option value="tag" ${r.einheit==='tag'?'selected':''}>am Tag</option>
             <option value="woche" ${r.einheit==='woche'?'selected':''}>in der Woche</option></select></div>
         <div class="field" style="margin:0"><label>Menge (mm)</label><input class="inp" id="reMm" type="number" value="${r.mm}"></div>
       </div>
       <div class="field" style="margin-top:12px"><label>Zeitfenster bei mehrmals täglich</label>
         <input class="inp" id="reZeiten" value="${(r.zeiten||[]).join(', ')}" placeholder="z.B. 6, 8, 10">
         <div class="tiny dim" style="margin-top:4px">Startstunden im 2-Stunden-Takt, durch Komma getrennt.</div></div>
       <div class="sec-title">Kulturphasen (optional)</div>
       <div class="tiny dim" style="margin-bottom:9px">Etwa für Jungpflanzen, die häufiger aber weniger Wasser brauchen.
         Ohne Phasen gilt immer die Grundregel.</div>
       <div id="rePhasen">${ph}</div>
       <button class="btn sm" onclick="Admin.phaseHinzu()">+ Phase</button>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.regelSpeichern('${sid}','${kid}')">Speichern</button>`);
  },
  phaseHinzu(){
    const d=el('div','card'); d.style.cssText='padding:10px;margin-bottom:7px;background:var(--paper)';
    d.innerHTML=`<div class="grid2" style="gap:7px">
        <div class="field" style="margin:0"><label>Ab Tag nach Pflanzung</label><input class="inp phVon" type="number" value="0"></div>
        <div class="field" style="margin:0"><label>Bis Tag (leer = offen)</label><input class="inp phBis" type="number"></div></div>
      <div class="grid3" style="margin-top:7px">
        <div class="field" style="margin:0"><label>Wie oft</label><select class="inp phAnz">${[1,2,3,4,5,6,7].map(n=>`<option>${n}</option>`).join('')}</select></div>
        <div class="field" style="margin:0"><label>Pro</label><select class="inp phEinheit"><option value="tag">am Tag</option><option value="woche">in der Woche</option></select></div>
        <div class="field" style="margin:0"><label>mm</label><input class="inp phMm" type="number" value="10"></div></div>
      <button class="btn sm ghost" style="margin-top:7px" onclick="this.closest('.card').remove()">Phase entfernen</button>`;
    $('#rePhasen').appendChild(d);
  },
  regelSpeichern(sid,kid){
    const phasen=[...document.querySelectorAll('#rePhasen .card')].map(c=>({
      vonTag:num($('.phVon',c).value)??0, bisTag:num($('.phBis',c).value),
      anzahl:+$('.phAnz',c).value, einheit:$('.phEinheit',c).value, mm:num($('.phMm',c).value)||10
    })).sort((a,b)=>a.vonTag-b.vonTag);
    const zeiten=$('#reZeiten').value.split(',').map(x=>num(x.trim())).filter(x=>x!=null);
    Store.setRegel(sid,kid,{anzahl:+$('#reAnz').value, einheit:$('#reEinheit').value,
      mm:num($('#reMm').value)||10, zeiten, phasen});
    closeModal(); Engine.planNeu(); this.render(); toast('Regel gespeichert');
  },

  /* ---------------- JOURNAL ---------------- */
  vJournal(p){
    const pr=Store.db.journalProbleme||[];
    const arten={schiff_als_datum:'Schiff-Angabe war als Datum verfälscht',
                 ueber_nacht:'Bewässerung über Mitternacht',
                 zaehler_rueckwaerts:'Zählerstand rückwärts'};
    if(pr.length){
      const zz={}; pr.forEach(x=>zz[x.art]=(zz[x.art]||0)+1);
      const b=el('div','okbox');
      b.innerHTML=`<b>Beim Einlesen automatisch bereinigt:</b> `+
        Object.entries(zz).map(([k,v])=>`${v}× ${arten[k]||k}`).join(' · ');
      p.appendChild(b);
    }
    const R=Engine.refWerte();
    const info=el('div','infobox');
    info.innerHTML=`<b>Erfahrungswerte</b> aus ${Store.db.journal.length} Einträgen ·
      ${Object.keys(R.schiff).length} Schiffe mit eigenen Werten ·
      Betriebsschnitt ${R.global?R.global.toFixed(1)+' mm/h':'–'}.
      Sie bestimmen die empfohlene Bewässerungsdauer.`;
    p.appendChild(info);

    const f=el('div','row wrap'); f.style.marginBottom='11px';
    f.innerHTML=`<input class="inp" id="jSuche" placeholder="Suchen nach Feld, Kultur, Datum…" style="max-width:320px">
      <span class="sp"></span><span class="tiny dim" id="jCount"></span>`;
    p.appendChild(f);
    const box=el('div','scrollx'); p.appendChild(box);
    const render=()=>{
      const q=($('#jSuche').value||'').toLowerCase();
      const rows=Store.db.journal.filter(e=>!q||
        (e.feldJournal+' '+(e.kultur||'')+' '+e.datum+' '+e.schiffRoh).toLowerCase().includes(q))
        .slice().sort((a,b)=>a.datum<b.datum?1:-1).slice(0,400);
      $('#jCount').textContent=rows.length+' von '+Store.db.journal.length+' Einträgen';
      box.innerHTML=`<table class="tb"><thead><tr><th>Datum</th><th>Feld</th><th>Schiffe</th><th>Kultur</th>
        <th>Dauer</th><th>m³</th><th>mm</th><th>Regner</th></tr></thead><tbody>${rows.map(e=>{
          const f2=Engine.feldFuerJournal(e.feldJournal);
          let mm=null;
          if(f2&&e.m3){ const sch=f2.schiffe.filter(s=>e.schiffe.includes(String(s.nummer)));
            const fl=(sch.length?sch:f2.schiffe).reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f2)||0),0)||Store.feldFlaecheM2(f2);
            if(fl) mm=(e.m3*1000/fl); }
          return `<tr><td>${e.datum}</td><td>${esc(e.feldJournal)}${f2?'':' <span class="chip r tiny">?</span>'}</td>
            <td>${esc(e.schiffRoh||'–')}</td><td>${esc(e.kultur||'–')}</td>
            <td>${e.dauerMin?hhmm(e.dauerMin):'–'}${e.ueberNacht?' <span class="chip a">Nacht</span>':''}</td>
            <td>${e.m3??'–'}</td><td>${mm?mm.toFixed(1):'–'}</td>
            <td class="dim">${[e.kreisregner?e.kreisregner+'K':'',e.sektorregner?e.sektorregner+'S':''].filter(Boolean).join(' ')||'–'}</td></tr>`;
        }).join('')}</tbody></table>`;
    };
    $('#jSuche').addEventListener('input',render); render();

    const un=Engine.journalFelder().filter(j=>!Engine.feldFuerJournal(j));
    if(un.length){
      const w=el('div','warnbox'); w.style.marginTop='12px';
      w.innerHTML=`<b>${un.length} Journal-Namen ohne Feld:</b> ${un.map(esc).join(', ')}.
        Diese Historie fliesst nicht in die Erfahrungswerte ein – bei den Stammdaten des passenden Feldes zuordnen
        oder als aufgegebene Fläche ignorieren.`;
      p.appendChild(w);
    }
  },

  /* ---------------- EINSTELLUNGEN ---------------- */
  vEinst(p){
    const e=Store.db.einstellungen, k=Store.db.journalKapazitaet;
    const c=el('div','card'); c.style.cssText='padding:16px;max-width:620px';
    c.innerHTML=`
      <div class="sec-title" style="margin-top:0">Betrieb</div>
      <div class="grid2">
        <div class="field"><label>Ansprechperson für den Wassermann</label>
          <input class="inp" id="esName" value="${esc(e.ansprechperson)}"></div>
        <div class="field"><label>Telefon (optional)</label>
          <input class="inp" id="esTel" value="${esc(e.ansprechTelefon||'')}"></div>
      </div>
      <div class="field"><label>E-Mail für Meldungen</label>
        <input class="inp" id="esMail" value="${esc(e.adminMail||'')}"></div>

      <div class="sec-title">Planung</div>
      <div class="grid2">
        <div class="field"><label>Standorte pro Tag (Kapazität)</label>
          <input class="inp" id="esKap" type="number" value="${e.kapazitaetStandorte}">
          <div class="tiny dim" style="margin-top:4px">Aus dem Journal: im Mittel ${k.standorteMedian},
            an vollen Tagen ${k.standorteP80}, Maximum ${k.standorteMax}.</div></div>
        <div class="field"><label>Planungshorizont (Tage)</label>
          <input class="inp" id="esHor" type="number" value="${e.planungsHorizont}"></div>
      </div>
      <div class="field"><label>Detailgrad für den Wassermann</label>
        <select class="inp" id="esStufe">
          <option value="neu" ${e.erfahrungsstufe==='neu'?'selected':''}>Neu – ausführliche Schritt-für-Schritt-Anweisung</option>
          <option value="erfahren" ${e.erfahrungsstufe==='erfahren'?'selected':''}>Erfahren – knappe Angaben</option>
        </select></div>
      <button class="btn pri" onclick="Admin.einstSpeichern()">Speichern</button>

      <div class="sec-title">Wetterstationen</div>
      <div class="tiny dim" style="margin-bottom:9px">Ordne jedem Standort eine Station zu. Beim Erfassen des
        Niederschlags gibst du dann nur noch drei Werte ein — sie verteilen sich automatisch.</div>
      <div id="wsBox"></div>
      <button class="btn sm" onclick="Admin.wsHinzu()">+ Station</button>

      <div class="sec-title">Daten</div>
      <div class="row wrap">
        <button class="btn sm" onclick="Store.exportFile()">Daten sichern (JSON)</button>
        <button class="btn sm" onclick="Store.importDialog()">Daten laden</button>
        <button class="btn sm ghost" onclick="Admin.journalExport()">Journal als CSV</button>
      </div>
      <div class="tiny dim" style="margin-top:9px">Offline-Testversion: Admin und Wassermann arbeiten auf demselben
        Datenstand. Zum Aufbewahren zwischen zwei Sitzungen die Daten sichern und beim nächsten Mal wieder laden.</div>

      <div class="sec-title">Ersteinrichtung</div>
      <div class="row wrap">
        <button class="btn sm ${e.setupErledigt?'ghost':'pri'}" onclick="Setup.start()">
          ${e.setupErledigt?'Nochmals durchgehen':'Ersteinrichtung starten'}</button>
        ${e.setupErledigt?'<span class="chip g">abgeschlossen</span>':''}
      </div>`;
    p.appendChild(c);
    this.renderWs();
  },
  renderWs(){
    const box=document.getElementById('wsBox'); if(!box) return;
    const zug={}; Store.db.wetterstationen.forEach(w=>w.standortIds.forEach(i=>zug[i]=w.id));
    box.innerHTML=Store.db.wetterstationen.map(w=>`
      <div class="wsCard">
        <div class="row"><input class="inp" style="flex:1;font-weight:650" value="${esc(w.name)}"
            onchange="Admin.wsName('${w.id}',this.value)">
          <span class="chip">${w.standortIds.length}</span>
          <button class="btn sm ghost" onclick="Admin.wsLoeschen('${w.id}')">✕</button></div>
        <div class="stlist">${Store.db.standorte.map(st=>{
          const anders=zug[st.id]&&zug[st.id]!==w.id;
          return `<label class="row tiny" style="padding:4px 0;gap:8px;${anders?'opacity:.45':''}">
            <input type="checkbox" style="width:16px;height:16px" ${w.standortIds.includes(st.id)?'checked':''}
              ${anders?'disabled':''} onchange="Admin.wsToggle('${w.id}','${st.id}',this.checked)">
            <span>${esc(st.name)}</span>${anders?'<span class="dim">(andere Station)</span>':''}</label>`;}).join('')}</div>
      </div>`).join('');
  },
  wsName(id,v){ const w=Store.db.wetterstationen.find(x=>x.id===id); if(w){w.name=v; Store.mark();} },
  wsToggle(id,sid,on){
    const w=Store.db.wetterstationen.find(x=>x.id===id); if(!w) return;
    w.standortIds = on ? [...new Set([...w.standortIds,sid])] : w.standortIds.filter(x=>x!==sid);
    Store.mark(); this.renderWs();
  },
  wsHinzu(){ Store.db.wetterstationen.push({id:uid('ws'),name:'Wetterstation '+(Store.db.wetterstationen.length+1),
    standortIds:[]}); Store.mark(); this.renderWs(); },
  wsLoeschen(id){ Store.db.wetterstationen=Store.db.wetterstationen.filter(x=>x.id!==id);
    Store.mark(); this.renderWs(); },
  einstSpeichern(){
    const e=Store.db.einstellungen;
    e.ansprechperson=$('#esName').value.trim()||'Sammy';
    e.ansprechTelefon=$('#esTel').value.trim();
    e.adminMail=$('#esMail').value.trim();
    e.kapazitaetStandorte=num($('#esKap').value)||8;
    e.planungsHorizont=num($('#esHor').value)||10;
    e.erfahrungsstufe=$('#esStufe').value;
    Store.mark(); Engine.planNeu(); toast('Einstellungen gespeichert'); this.render();
  },
  journalExport(){
    const h=['Datum','Feld','Schiffe','Kultur','Start','Stopp','ÜberNacht','DauerMin','StartM3','StopM3','m3','Kreisregner','Sektorregner','Bemerkung'];
    const rows=Store.db.journal.map(e=>[e.datum,e.feldJournal,e.schiffRoh,e.kultur||'',e.startZeit||'',e.stopZeit||'',
      e.ueberNacht?'ja':'',e.dauerMin??'',e.startM3??'',e.stopM3??'',e.m3??'',e.kreisregner??'',e.sektorregner??'',
      (e.bemerkung||'').replace(/[;\n]/g,' ')]);
    const csv=[h,...rows].map(r=>r.join(';')).join('\n');
    const b=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b);
    a.download='bewaesserungsjournal_bereinigt.csv'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000); toast('CSV erstellt');
  }
});

