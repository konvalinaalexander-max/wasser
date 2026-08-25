/* ============================================================
   ADMIN-DIALOGE (Stammdaten, Schiffe-Tabelle, Kultur/Sektor)
   ============================================================ */
Object.assign(Admin, {
  zeigeUnbewaessert:false,

  /* Eine einzige Stelle, an der eine Regel in Text übersetzt wird –
     vorher zeigten Regeltabelle und Feldeditor Verschiedenes an (Befund D3). */
  regelText(r){
    if(!r) return 'keine Regel';
    if(r.einheit==='frei') return 'alle '+(r.tage||2)+' Tage · '+r.mm+' mm';
    const wie = r.einheit==='tag' ? 'am Tag' : 'pro Woche';
    return (r.anzahl||1)+'× '+wie+' · '+r.mm+' mm';
  },

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
          ${sichtbar.reduce((a,f)=>a+Store.echteSchiffe(f).length,0)} Schiffe · ${ok}/${fs.length} geprüft</span></span>
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
        style="width:17px;height:17px" onchange="Admin.bewaessertSetzen('${feld.id}',this.checked)">
        <span>wird bewässert</span></label>
      <button class="btn sm ${feld.geprueft?'ghost':''}" onclick="Admin.geprueftToggle('${feld.id}')">
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
  bewaessertSetzen(id,on){ const f=Store.feld(id); if(!f) return;
    f.bewaessert=on; Store.changed('kultur'); this.render(); },
  geprueftToggle(id){ const f=Store.feld(id); if(!f) return;
    f.geprueft=!f.geprueft; if(f.geprueft) f.unsicher=false; Store.mark(); this.render(); },

  /* --- Stammdaten --- */
  feldBearbeiten(id){
    const f=Store.feld(id);
    const jm=Store.db.einstellungen.journalMap||{};
    const aktuell=Object.entries(jm).find(([k,v])=>v===f.id)?.[0]||'';
    openModal('Stammdaten · '+f.name,
      `<div class="field"><label>Name</label><input class="inp" id="fbName" value="${esc(f.name)}"></div>
       <div class="grid2">
        <div class="field"><label>Gemeinde</label><input class="inp" id="fbGem" value="${esc(f.gemeinde||'')}"
          placeholder="${f.gemeindeFehlt?'muss nachgetragen werden':''}"></div>
        <div class="field"><label>Gesamtfläche (Aren)</label><input class="inp" id="fbAren" type="number"
          value="${f.gesamtflaecheAren??''}"></div></div>
       <div class="field"><label>Journal-Name (Historie)</label>
         <select class="inp" id="fbJournal">
           <option value="">— nicht zugeordnet —</option>
           ${Engine.journalFelder().map(j=>
             `<option value="${esc(j)}" ${aktuell===j?'selected':''}>${esc(j)} (${
               Store.db.journal.filter(e=>e.feldJournal===j).length})</option>`).join('')}</select>
         <div class="tiny dim" style="margin-top:4px">Ohne Zuordnung fliesst weder die Historie in die
           Erfahrungswerte ein, noch findet die App die neuen Einträge des Wassermanns wieder.</div></div>
       <label class="row" style="gap:9px"><input type="checkbox" id="fbUnsicher" ${f.unsicher?'checked':''}
          style="width:18px;height:18px"><span>Digitalisierung unsicher — im Plan hervorheben</span></label>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.feldSpeichern('${id}')">Speichern</button>`);
  },
  feldSpeichern(id){
    const f=Store.feld(id);
    f.name=$('#fbName').value.trim()||f.name;
    f.gemeinde=$('#fbGem').value.trim()||null; f.gemeindeFehlt=!f.gemeinde;
    f.gesamtflaecheAren=num($('#fbAren').value);
    f.unsicher=$('#fbUnsicher').checked;
    const jm=Store.db.einstellungen.journalMap=Store.db.einstellungen.journalMap||{};
    Object.keys(jm).forEach(k=>{ if(jm[k]===f.id) delete jm[k]; });
    const jn=$('#fbJournal').value; if(jn) jm[jn]=f.id;
    closeModal(); Store.changed('journal');
    if(FeldEditor.ctx) FeldEditor.render(); else this.render();
    toast('Gespeichert');
  },

  /* --- Schiffe-Tabelle --- */
  schiffeVerwalten(id){
    const f=Store.feld(id);
    const rows=f.schiffe.map(s=>{
      const a=Store.schiffFlaecheM2(s,f);
      const spr=Engine.refWerte().schiff[s.id];
      return `<tr>
        <td><input class="inp" style="width:74px;padding:5px 7px" value="${esc(s.nummer)}"
             ${s.implizit?'disabled placeholder="ganzes Feld"':''}
             onchange="Admin.schiffFeld('${id}','${s.id}','nummer',this.value)"></td>
        <td><input class="inp" style="width:78px;padding:5px 7px" type="number" value="${s.aren??''}"
             onchange="Admin.schiffFeld('${id}','${s.id}','aren',this.value)"></td>
        <td><input class="inp" style="width:78px;padding:5px 7px" type="number" value="${s.laengeM??''}"
             onchange="Admin.schiffFeld('${id}','${s.id}','laengeM',this.value)"></td>
        <td><input class="inp" style="width:78px;padding:5px 7px" type="number" value="${s.breiteM??''}"
             onchange="Admin.schiffFeld('${id}','${s.id}','breiteM',this.value)"></td>
        <td class="tiny dim">${a?Math.round(a/100)+' a':'–'}</td>
        <td class="tiny dim">${(s.sektoren||[]).length}/${(s.rohre||[]).length}</td>
        <td class="tiny dim">${spr&&spr.mmH?spr.mmH.toFixed(1)+' mm/h':'–'}</td>
        <td>${s.implizit?'':`<button class="btn sm ghost" onclick="Admin.schiffLoeschen('${id}','${s.id}')">✕</button>`}</td></tr>`;
    }).join('');
    openModal('Schiffe · '+f.name,
      `<div class="tiny muted" style="margin-bottom:10px">Reihenfolge der Flächenquellen:
        eingetragene <b>Aren</b> → <b>Länge × Breite</b> → Anteil an der Feldfläche.
        Spalte „S/R" = Sektoren/Rohre, „mm/h" = Erfahrungswert aus dem Journal.</div>
       <div class="scrollx"><table class="tb"><thead><tr><th>Nr.</th><th>Aren</th><th>Länge m</th><th>Breite m</th>
         <th>Fläche</th><th>S/R</th><th>mm/h</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
       <div class="row wrap" style="margin-top:12px;gap:7px">
         <button class="btn sm" onclick="Admin.schiffHinzu('${id}')">+ Schiff</button>
         <button class="btn sm ghost" onclick="Admin.schiffeAufteilen('${id}')">In n gleiche Streifen teilen…</button>
       </div>`,
      `<button class="btn pri" onclick="closeModal();Admin.render()">Fertig</button>`, true);
  },
  schiffFeld(fid,sid,feldName,wert){
    const f=Store.feld(fid); const s=f.schiffe.find(x=>x.id===sid); if(!s) return;
    if(feldName==='nummer'){
      const neu=String(wert).trim();
      if(!neu){ toast('Die Nummer darf nicht leer sein'); this.schiffeVerwalten(fid); return; }
      if(f.schiffe.some(x=>x.id!==sid && String(x.nummer)===neu)){
        toast('Nummer '+neu+' gibt es in diesem Feld schon'); this.schiffeVerwalten(fid); return; }
      s.nummer=neu;
    } else s[feldName]=num(wert);
    Store.changed('geometrie');
  },
  /* Nächste freie Nummer – „1a", Lücken und Löschungen berücksichtigt */
  naechsteNummer(f){
    const belegt=new Set(f.schiffe.map(s=>String(s.nummer)));
    let n=1; while(belegt.has(String(n))) n++;
    return String(n);
  },
  schiffHinzu(id){
    const f=Store.feld(id);
    f.schiffe=f.schiffe.filter(s=>!s.implizit);          // implizites Schiff weicht echten
    const b=polyBBox(f.umriss); const n=f.schiffe.length;
    const y=b.y+b.h*((n%5)/5), h=b.h/5;
    f.schiffe.push({id:uid('sch'), nummer:this.naechsteNummer(f),
      polygon:[[b.x,y],[b.x+b.w,y],[b.x+b.w,y+h],[b.x,y+h]].map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]),
      aren:null,laengeM:null,breiteM:null,rohre:[],sektoren:[]});
    Store.changed('geometrie'); this.schiffeVerwalten(id);
  },
  schiffLoeschen(fid,sid){
    const f=Store.feld(fid); const s=f.schiffe.find(x=>x.id===sid); if(!s) return;
    const sek=(s.sektoren||[]).length, rohre=(s.rohre||[]).length;
    const weg=()=>{
      f.schiffe=f.schiffe.filter(x=>x.id!==sid);
      Store.normalisiere();                       // leeres Feld bekommt wieder ein implizites Schiff
      Store.changed('geometrie'); this.schiffeVerwalten(fid); toast('Schiff entfernt');
    };
    if(!sek && !rohre) return weg();
    frage('Schiff '+s.nummer+' entfernen?',
      `<p style="margin-top:0">Mit dem Schiff verschwinden <b>${sek} Sektor${sek===1?'':'en'}</b>
        (Kultur, Pflanzdatum, Bewässerungsstand) und <b>${rohre} Rohr${rohre===1?'':'e'}</b>.</p>`,
      'Entfernen', weg, true);
  },
  schiffeAufteilen(id){
    const f=Store.feld(id);
    const echte=Store.echteSchiffe(f);
    const sek=f.schiffe.reduce((a,s)=>a+(s.sektoren||[]).length,0);
    const rohre=Store.feldRohre(f).length;
    openModal('In gleiche Streifen teilen · '+f.name,
      `<div class="grid2">
        <div class="field"><label>Anzahl Schiffe</label>
          <input class="inp" id="saN" type="number" min="1" max="40" value="${echte.length||5}"></div>
        <div class="field"><label>Richtung</label>
          <select class="inp" id="saAchse">
            <option value="h" ${f.achse!=='v'?'selected':''}>waagrecht (übereinander)</option>
            <option value="v" ${f.achse==='v'?'selected':''}>senkrecht (nebeneinander)</option></select></div>
       </div>
       <div class="warnbox tiny"><b>Das ersetzt die gezeichneten Umrisse.</b>
         Aktuell: ${echte.length} Schiffe, ${sek} Sektoren, ${rohre} Rohre.
         Die Streifen entstehen gleichmässig aus dem Feldumriss — von Hand zurechtgezogene
         Polygone sind danach weg. Nummern, Aren, Sektoren und Rohre der ersten Schiffe bleiben erhalten;
         darüber hinausgehende Schiffe werden mitsamt Sektoren und Rohren gelöscht.</div>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn danger" onclick="Admin.schiffeAufteilenAusfuehren('${id}')">Ersetzen</button>`);
  },
  schiffeAufteilenAusfuehren(id){
    const f=Store.feld(id);
    const n=parseInt($('#saN').value,10);
    if(!n||n<1||n>40){ toast('Bitte eine Zahl zwischen 1 und 40'); return; }
    f.achse=$('#saAchse').value;                    // erst jetzt – nicht mehr bei Abbruch (Befund B4)
    const b=polyBBox(f.umriss), v=f.achse==='v';
    const alt=Store.echteSchiffe(f).slice();
    f.schiffe=[];
    for(let i=0;i<n;i++){
      const a=i/n, c=(i+1)/n;
      const poly = v ? [[b.x+b.w*a,b.y],[b.x+b.w*c,b.y],[b.x+b.w*c,b.y+b.h],[b.x+b.w*a,b.y+b.h]]
                     : [[b.x,b.y+b.h*a],[b.x+b.w,b.y+b.h*a],[b.x+b.w,b.y+b.h*c],[b.x,b.y+b.h*c]];
      const neu=poly.map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]);
      const vor=alt[i];
      const s={id:vor?vor.id:uid('sch'), nummer:vor?vor.nummer:String(i+1),
        polygon:neu,
        aren:vor?vor.aren:null, laengeM:vor?vor.laengeM:null, breiteM:vor?vor.breiteM:null,
        rohre:vor?vor.rohre:[], sektoren:vor?vor.sektoren:[]};
      /* Sektorflächen in den neuen Umriss überführen, damit sie nicht daneben liegen */
      if(vor && s.sektoren.length){
        const altB=polyBBox(vor.polygon), neuB=polyBBox(neu);
        s.sektoren.forEach(k=>{ if(!k.polygon) return;
          k.polygon=k.polygon.map(([x,y])=>[
            +(neuB.x + (altB.w? (x-altB.x)/altB.w : 0)*neuB.w).toFixed(4),
            +(neuB.y + (altB.h? (y-altB.y)/altB.h : 0)*neuB.h).toFixed(4)]);
        });
      }
      f.schiffe.push(s);
    }
    Store.normalisiere();
    closeModal(); Store.changed('geometrie');
    if(this.standortId||FeldEditor.ctx){ if(FeldEditor.ctx) FeldEditor.render(); this.render(); }
    else this.schiffeVerwalten(id);
    toast(n+' Schiffe angelegt');
  },

  /* --- Kultur-/Sektor-Dialog --- */
  sektorNeu(fid,sid){ this.sektorDialog(fid,sid,null); },
  sektorBearbeiten(fid,sid,kid){ this.sektorDialog(fid,sid,kid); },
  sektorDialog(fid,sid,kid){
    const f=Store.feld(fid), s=f.schiffe.find(x=>x.id===sid);
    if(!s) return;
    const k = kid? (s.sektoren||[]).find(x=>x.id===kid) : null;
    openModal((k&&k.polygon?'Sektor '+(k.name||''):Store.schiffName(s))+' · Kultur',
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
            `<option value="${x}" ${k&&k.prioritaet===x?'selected':''}>${x}</option>`).join('')}</select></div></div>
       <div class="field"><label>Satz-Bezeichnung (optional)</label>
         <input class="inp" id="skSatz" value="${esc(k?.satz||'')}" placeholder="z.B. Satz 34-877">
         <div class="tiny dim" style="margin-top:4px">Erscheint in der Sektorliste und auf der Karte des Wassermanns.</div></div>
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
    const best=Store.regel(f.id,kid);
    const vorschlag=best?null:Store.regelVorschlag(kid, f.id);
    const r=best||(vorschlag&&vorschlag.regel)||{anzahl:1,einheit:'woche',mm:30};
    box.innerHTML=`<div class="card" style="padding:13px;background:var(--paper);margin-top:6px">
      <div class="sec-title" style="margin-top:0">Bewässerungsregel für dieses Feld</div>
      ${vorschlag?`<div class="tiny" style="color:var(--amber);margin-bottom:8px">Vorschlag von
        <b>${esc(vorschlag.feldName)}</b> – bitte prüfen.</div>`:''}
      ${!best&&!vorschlag?'<div class="tiny" style="color:var(--rust);margin-bottom:8px">Noch keine Regel – bitte festlegen.</div>':''}
      <div class="grid3">
        <div class="field" style="margin:0"><label>Wie oft</label>
          <select class="inp" id="rgAnz">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${r.anzahl===n?'selected':''}>${n}</option>`).join('')}</select></div>
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
        (iv<1?' ('+Math.round(1/iv)+'× täglich)':' – etwa alle '+String(iv.toFixed(1)).replace('.0','')+' Tage');
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
    const einheit=$('#rgEinheit').value;
    const tage=einheit==='frei' ? (num($('#rgTage')?.value)||2) : null;
    Store.setRegel(f.id, kultur, {anzahl:+$('#rgAnz').value, einheit, tage, mm,
      zeiten:(Store.regel(f.id,kultur)||{}).zeiten||[],
      phasen:(Store.regel(f.id,kultur)||{}).phasen||[]});
    s.sektoren=s.sektoren||[];
    let k = kid? s.sektoren.find(x=>x.id===kid) : null;
    if(!k){ k={id:uid('sek'), name:s.implizit?f.name:null}; s.sektoren.push(k); }
    k.kulturId=kultur; k.pflanzdatum=$('#skDatum').value||null;
    k.prioritaet=$('#skPrio').value; k.satz=$('#skSatz').value.trim()||null;
    k.pausiert=$('#skPause').checked; k.pausiertBis=$('#skPauseBis')?.value||null;
    closeModal(); Store.changed('kultur');
    if(FeldEditor.ctx) FeldEditor.render(); else this.render();
    toast('Kultur erfasst');
  },
  kulturEntfernen(fid,sid,kid){
    const f=Store.feld(fid), s=f.schiffe.find(x=>x.id===sid);
    const k=s.sektoren.find(x=>x.id===kid);
    if(k&&k.polygon){ k.kulturId=null; k.pflanzdatum=null; k.satz=null; k.letzteBewaesserung=null; }
    else s.sektoren=s.sektoren.filter(x=>x.id!==kid);
    closeModal(); Store.changed('kultur');
    if(FeldEditor.ctx) FeldEditor.render(); else this.render();
  }
});

/* ---------------- KULTUREN & REGELN / JOURNAL / EINSTELLUNGEN ---------------- */
Object.assign(Admin, {
  vKulturen(p){
    const pr=Engine.probleme();
    if(pr.ohneRegel.length){
      const b=el('div','warnbox');
      b.innerHTML=`<b>${pr.ohneRegel.length} Sektor${pr.ohneRegel.length===1?'':'en'} ohne Regel — nicht planbar</b>
        <div class="tiny" style="margin-top:6px;color:var(--ink-2)">${
          [...new Map(pr.ohneRegel.map(x=>[x.feld.id+'|'+x.sektor.kulturId,x])).values()].slice(0,8)
            .map(x=>`<button class="btn sm" style="margin:3px 4px 0 0" onclick="Admin.regelBearbeiten('${x.feld.id}','${x.sektor.kulturId}')">${esc(x.feld.name)} · ${esc(x.kultur?x.kultur.name:'?')}</button>`).join('')}</div>`;
      p.appendChild(b);
    }
    if(pr.verwaisteRegeln.length){
      const b=el('div','infobox');
      b.innerHTML=`<b>${pr.verwaisteRegeln.length} Regel${pr.verwaisteRegeln.length===1?'':'n'} ohne Fläche.</b>
        Sie sind hinterlegt, aber keine Kultur nutzt sie — deshalb wirken sie nicht.
        ${pr.planbar?'':'<button class="btn sm pri" style="margin-left:8px" onclick="Setup.kulturenAusRegeln()">Kulturen daraus übernehmen</button>'}`;
      p.appendChild(b);
    }

    p.appendChild(el('div','sec-title','Kulturen'));
    const grid=el('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px';
    const zaehl={}; Store.sektoren().forEach(s=>{ if(s.sektor.kulturId) zaehl[s.sektor.kulturId]=(zaehl[s.sektor.kulturId]||0)+1; });
    Store.db.kulturen.forEach(k=>{
      const n=zaehl[k.id]||0;
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
      const verwaist=new Set(pr.verwaisteRegeln.map(x=>x.key));
      const box=el('div','scrollx');
      box.innerHTML=`<table class="tb"><thead><tr><th>Feld</th><th>Kultur</th><th>Rhythmus</th><th>Menge</th>
        <th>pro Tag</th><th>Phasen</th><th>Zeiten</th><th></th></tr></thead><tbody>${
        eintraege.map(([key,r])=>{
          const [fid,kid]=key.split('::'); const fd=Store.feld(fid), k=Store.kultur(kid);
          if(!fd||!k) return '';
          const iv=Engine.regelIntervall(r);
          const gaenge=Engine.gaengeProTag(r);
          return `<tr${verwaist.has(key)?' style="opacity:.55"':''}><td>${esc(fd.name)}${
              verwaist.has(key)?' <span class="chip a tiny">ohne Fläche</span>':''}</td>
            <td><span class="kultbadge" style="background:${k.farbe}">${k.icon||''} ${esc(k.name)}</span></td>
            <td>${esc(this.regelText(r).split(' · ')[0])}</td>
            <td><b>${r.mm} mm</b></td>
            <td class="dim">${(r.mm/iv).toFixed(1)} mm</td>
            <td class="dim">${(r.phasen||[]).length||'–'}</td>
            <td class="dim">${gaenge>1?Engine.zeitfenster(r).map(h=>h+':00').join(', '):'–'}</td>
            <td><button class="btn sm ghost" onclick="Admin.regelBearbeiten('${fid}','${kid}')">bearbeiten</button></td></tr>`;
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
    this._knFarbe=()=>sel; this._knIcon=()=>selI; this._knCb=cb||null;
  },
  kulturSpeichern(){
    const n=$('#knName').value.trim(); if(!n){ toast('Name fehlt'); return; }
    if(Store.db.kulturen.some(k=>k.name.toLowerCase()===n.toLowerCase())){
      toast('Diese Kultur gibt es schon'); return; }
    const k={id:uid('k'), name:n, icon:this._knIcon(), farbe:this._knFarbe()};
    Store.db.kulturen.push(k); Store.reindex(); Store.mark(); closeModal();
    const cb=this._knCb; this._knCb=null;
    if(cb) cb(k); else this.render();
    toast('Kultur angelegt');
  },
  kulturBearbeiten(id){
    const k=Store.kultur(id);
    const n=Store.sektoren().filter(s=>s.sektor.kulturId===id).length;
    openModal('Kultur · '+k.name,
      `<div class="field"><label>Name</label><input class="inp" id="kbName" value="${esc(k.name)}"></div>
       <div class="field"><label>Symbol</label><div class="row wrap">${
        this.EMOJIS.map(e=>`<button class="kbI" data-i="${e}" style="width:38px;height:38px;border-radius:9px;
          font-size:21px;background:var(--paper-2);border:2px solid ${e===(k.icon||'')?'#1F211D':'transparent'}">${e}</button>`).join('')}</div></div>
       <div class="field"><label>Farbe</label><input class="inp" id="kbFarbe" type="color" value="${k.farbe}" style="height:44px;padding:4px"></div>
       <div class="tiny dim">${n} Sektor${n===1?'':'en'} nutzen diese Kultur.</div>`,
      `${n?'':`<button class="btn danger" onclick="Admin.kulturLoeschen('${id}')">Löschen</button>`}
       <div class="sp"></div><button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.kulturUpdate('${id}')">Speichern</button>`);
    this._kbIcon=k.icon||null;
    document.querySelectorAll('.kbI').forEach(b=>b.onclick=()=>{
      this._kbIcon=b.dataset.i;
      document.querySelectorAll('.kbI').forEach(x=>x.style.borderColor='transparent');
      b.style.borderColor='#1F211D'; });
  },
  kulturUpdate(id){
    const k=Store.kultur(id);
    k.name=$('#kbName').value.trim()||k.name; k.farbe=$('#kbFarbe').value;
    if(this._kbIcon) k.icon=this._kbIcon;
    closeModal(); Store.changed('kultur'); this.render();
  },
  kulturLoeschen(id){
    if(Store.sektoren().some(s=>s.sektor.kulturId===id)){ toast('Diese Kultur ist noch in Verwendung'); return; }
    Store.db.kulturen=Store.db.kulturen.filter(k=>k.id!==id);
    Object.keys(Store.db.regeln).forEach(key=>{ if(key.endsWith('::'+id)) delete Store.db.regeln[key]; });
    closeModal(); Store.changed('kultur'); this.render(); toast('Kultur gelöscht');
  },

  regelBearbeiten(sid,kid){
    const r=Store.regel(sid,kid)||{anzahl:1,einheit:'woche',mm:30,phasen:[]};
    const feld=Store.feld(sid), kultur=Store.kultur(kid);
    if(!feld||!kultur){ toast('Feld oder Kultur nicht gefunden'); return; }
    const ph=(r.phasen||[]).map(p=>this.phaseHTML(p)).join('');
    openModal('Regel · '+feld.name+' · '+kultur.name,
      `<div class="sec-title" style="margin-top:0">Grundregel</div>
       <div class="grid3">
         <div class="field" style="margin:0"><label>Wie oft</label>
           <select class="inp" id="reAnz">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${r.anzahl===n?'selected':''}>${n}</option>`).join('')}</select></div>
         <div class="field" style="margin:0"><label>Pro</label>
           <select class="inp" id="reEinheit" onchange="Admin._reUpd()">
             <option value="tag" ${r.einheit==='tag'?'selected':''}>am Tag</option>
             <option value="woche" ${r.einheit==='woche'?'selected':''}>in der Woche</option>
             <option value="frei" ${r.einheit==='frei'?'selected':''}>alle … Tage</option></select></div>
         <div class="field" style="margin:0"><label>Menge (mm)</label><input class="inp" id="reMm" type="number" value="${r.mm}"></div>
       </div>
       <div class="field" id="reFreiWrap" style="margin-top:8px;display:${r.einheit==='frei'?'block':'none'}">
         <label>Alle wie viele Tage</label><input class="inp" id="reTage" type="number" value="${r.tage||2}"></div>
       <div class="field" style="margin-top:12px"><label>Zeitfenster bei mehrmals täglich</label>
         <input class="inp" id="reZeiten" value="${(r.zeiten||[]).join(', ')}" placeholder="z.B. 6, 10, 14">
         <div class="tiny dim" style="margin-top:4px" id="reZeitHint"></div></div>
       <div class="sec-title">Kulturphasen (optional)</div>
       <div class="tiny dim" style="margin-bottom:9px">Etwa für Jungpflanzen, die häufiger aber weniger Wasser brauchen.
         Gezählt in Tagen ab Pflanzdatum. Ohne Phasen gilt immer die Grundregel.</div>
       <div id="rePhasen">${ph}</div>
       <button class="btn sm" onclick="Admin.phaseHinzu()">+ Phase</button>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.regelSpeichern('${sid}','${kid}')">Speichern</button>`);
    this._reUpd();
  },
  _reUpd(){
    const e=$('#reEinheit'); if(!e) return;
    $('#reFreiWrap').style.display = e.value==='frei'?'block':'none';
    const n = e.value==='tag' ? (+$('#reAnz').value||1) : 1;
    $('#reZeitHint').textContent = n>1
      ? 'Startstunden im 2-Stunden-Takt, durch Komma getrennt — '+n+' Werte für '+n+' Gänge pro Tag. '+
        'Ohne Angabe verteilt die App sie zwischen 6 und 18 Uhr.'
      : 'Nur bei mehrmals täglicher Bewässerung nötig.';
  },
  phaseHTML(p){
    p=p||{vonTag:0,bisTag:null,anzahl:1,einheit:'tag',mm:10};
    return `<div class="card" style="padding:10px;margin-bottom:7px;background:var(--paper)">
      <div class="grid2" style="gap:7px">
        <div class="field" style="margin:0"><label>Ab Tag nach Pflanzung</label>
          <input class="inp phVon" type="number" value="${p.vonTag??0}"></div>
        <div class="field" style="margin:0"><label>Bis Tag (leer = offen)</label>
          <input class="inp phBis" type="number" value="${p.bisTag??''}"></div></div>
      <div class="grid3" style="margin-top:7px">
        <div class="field" style="margin:0"><label>Wie oft</label>
          <select class="inp phAnz">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${p.anzahl===n?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="field" style="margin:0"><label>Pro</label>
          <select class="inp phEinheit"><option value="tag" ${p.einheit==='tag'?'selected':''}>am Tag</option>
            <option value="woche" ${p.einheit==='woche'?'selected':''}>in der Woche</option>
            <option value="frei" ${p.einheit==='frei'?'selected':''}>alle … Tage</option></select></div>
        <div class="field" style="margin:0"><label>mm</label><input class="inp phMm" type="number" value="${p.mm}"></div>
      </div>
      <div class="field" style="margin:7px 0 0"><label>… alle wie viele Tage (nur bei „alle … Tage")</label>
        <input class="inp phTage" type="number" value="${p.tage||''}" placeholder="–"></div>
      <button class="btn sm ghost" style="margin-top:7px" onclick="this.closest('.card').remove()">Phase entfernen</button>
    </div>`;
  },
  phaseHinzu(){
    const d=el('div'); d.innerHTML=this.phaseHTML();
    $('#rePhasen').appendChild(d.firstElementChild);
  },
  regelSpeichern(sid,kid){
    const phasen=[...document.querySelectorAll('#rePhasen .card')].map(c=>{
      const einheit=$('.phEinheit',c).value;
      return { vonTag:num($('.phVon',c).value)??0, bisTag:num($('.phBis',c).value),
        anzahl:+$('.phAnz',c).value, einheit,
        tage: einheit==='frei' ? (num($('.phTage',c).value)||2) : null,
        mm:num($('.phMm',c).value)||10 };
    }).sort((a,b)=>a.vonTag-b.vonTag);
    const einheit=$('#reEinheit').value;
    /* „alle n Tage" bleibt erhalten – vorher wurde es beim Speichern still zu
       „1× am Tag" und damit zur zehnfachen Wassermenge (Befunde B1/B2). */
    const tage = einheit==='frei' ? (num($('#reTage').value)||2) : null;
    const zeiten=$('#reZeiten').value.split(',').map(x=>num(x)).filter(x=>x!=null&&x>=0&&x<=23);
    Store.setRegel(sid,kid,{anzahl:+$('#reAnz').value, einheit, tage,
      mm:num($('#reMm').value)||10, zeiten, phasen});
    closeModal(); Store.changed('regel'); this.render(); toast('Regel gespeichert');
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
        Object.entries(zz).map(([k,v])=>`${v}× ${arten[k]||k}`).join(' · ')+
        ` <button class="btn sm ghost" style="margin-left:8px" onclick="Admin.journalProbleme()">Einzeln ansehen</button>`;
      p.appendChild(b);
    }
    const R=Engine.refWerte();
    const info=el('div','infobox');
    info.innerHTML=`<b>Erfahrungswerte</b> aus ${Store.db.journal.length} Einträgen ·
      ${R.n} verwertbar · ${Object.keys(R.schiff).length} Schiffe mit eigenen Werten ·
      Betriebsschnitt <b>${R.global?R.global.toFixed(2)+' m³/h je Sprenkler':'–'}</b>.
      <div class="tiny" style="margin-top:6px;color:var(--ink-2)">
        Die Dauer folgt aus <b>Wassermenge ÷ Durchfluss</b>. Die Spalten „mm Fläche" und „mm alt"
        zeigen beide Definitionen; fett ist die eingestellte
        (${Store.db.einstellungen.mmBezug==='flaeche'?'Kulturfläche':'beregnete Fläche'}).
        ${R.rollomat?`${R.rollomat} Rollomat-Gänge und `:''}${R.verworfen} unphysikalische Gänge
        bleiben aussen vor.${R.unzuordenbar
          ? ` ${R.unzuordenbar} Einträge mit unbekannten Schiffnummern fliessen nur in den Feld- und
             Betriebsschnitt ein, nicht in einzelne Schiffwerte.`:''}</div>`;
    p.appendChild(info);

    const f=el('div','row wrap'); f.style.marginBottom='11px';
    f.innerHTML=`<input class="inp" id="jSuche" placeholder="Suchen nach Feld, Kultur, Datum…" style="max-width:320px">
      <span class="sp"></span><span class="tiny dim" id="jCount"></span>`;
    p.appendChild(f);
    const box=el('div','scrollx'); p.appendChild(box);
    const LIMIT=400;
    const render=()=>{
      const q=($('#jSuche').value||'').toLowerCase();
      const treffer=Store.db.journal.filter(e=>!q||
        (e.feldJournal+' '+(e.kultur||'')+' '+e.datum+' '+(e.schiffRoh||'')).toLowerCase().includes(q))
        .slice().sort((a,b)=>a.datum<b.datum?1:(a.datum>b.datum?-1:0));
      const rows=treffer.slice(0,LIMIT);
      /* erst zählen, dann kürzen – sonst stand dort immer „400 von …" (Befund D2) */
      $('#jCount').textContent = treffer.length>LIMIT
        ? `${treffer.length} Treffer, die ${LIMIT} neuesten angezeigt (von ${Store.db.journal.length})`
        : `${treffer.length} von ${Store.db.journal.length} Einträgen`;
      box.innerHTML=`<table class="tb"><thead><tr><th>Datum</th><th>Feld</th><th>Schiffe</th><th>Kultur</th>
        <th>Dauer</th><th>m³</th><th>m³/h</th><th>mm Fläche</th><th>mm alt</th><th>Regner</th><th></th></tr></thead><tbody>${rows.map(e=>{
          const f2=Engine.feldFuerJournal(e.feldJournal);
          const mm=Engine.mmBeide(e);
          const qq=(e.m3&&e.dauerMin)?e.m3/U.minNachH(e.dauerMin):null;
          return `<tr><td>${e.datum}</td><td>${esc(e.feldJournal)}${f2?'':' <span class="chip r tiny">?</span>'}</td>
            <td>${esc(e.schiffRoh||'–')}</td><td>${esc(e.kultur||'–')}</td>
            <td>${e.dauerMin?hhmm(e.dauerMin):'–'}${e.ueberNacht?' <span class="chip a">Nacht</span>':''}</td>
            <td>${e.m3??'–'}</td>
            <td class="dim">${qq?qq.toFixed(1):'–'}</td>
            <td${Store.db.einstellungen.mmBezug==='flaeche'?' style="font-weight:650"':' class="dim"'}>${mm.flaeche?mm.flaeche.toFixed(1):'–'}</td>
            <td${Store.db.einstellungen.mmBezug==='beregnet'?' style="font-weight:650"':' class="dim"'}>${mm.beregnet?mm.beregnet.toFixed(1):'–'}</td>
            <td class="dim">${[e.kreisregner?e.kreisregner+'K':'',e.sektorregner?e.sektorregner+'S':''].filter(Boolean).join(' ')||'–'}${
              Engine.istRollomat(e)?' <span class="chip a">Rollomat</span>':''}</td>
            <td>${e.quelle==='app'?`<button class="btn sm ghost" onclick="Admin.journalLoeschen('${e.id}')">✕</button>`:''}</td></tr>`;
        }).join('')}</tbody></table>`;
    };
    $('#jSuche').addEventListener('input',render); render();

    const un=Engine.journalFelder().filter(j=>!Engine.feldFuerJournal(j));
    if(un.length){
      const w=el('div','warnbox'); w.style.marginTop='12px';
      w.innerHTML=`<b>${un.length} Journal-Name${un.length===1?'':'n'} ohne Feld:</b> ${un.map(esc).join(', ')}.
        Diese Historie fliesst nicht in die Erfahrungswerte ein – bei den Stammdaten des passenden Feldes zuordnen
        oder als aufgegebene Fläche ignorieren.`;
      p.appendChild(w);
    }
    const ohneMap=Store.db.felder.filter(fd=>fd.bewaessert!==false &&
      !Object.values(Store.db.einstellungen.journalMap||{}).includes(fd.id));
    if(ohneMap.length){
      const w=el('div','infobox'); w.style.marginTop='10px';
      w.innerHTML=`<b>${ohneMap.length} Feld${ohneMap.length===1?'':'er'} ohne Journal-Namen.</b>
        Neue Einträge des Wassermanns werden dort automatisch unter dem Feldnamen angelegt und bleiben
        auffindbar — eine Zuordnung zur bestehenden Historie fehlt aber:
        ${esc(ohneMap.slice(0,6).map(x=>x.name).join(', '))}${ohneMap.length>6?' …':''}`;
      p.appendChild(w);
    }
  },
  journalProbleme(){
    const pr=Store.db.journalProbleme||[];
    const arten={schiff_als_datum:'Schiff-Angabe war als Datum verfälscht',
                 ueber_nacht:'Bewässerung über Mitternacht',
                 zaehler_rueckwaerts:'Zählerstand rückwärts'};
    openModal('Beim Einlesen bereinigt ('+pr.length+')',
      `<div class="tiny muted" style="margin-bottom:9px">Excel hatte diese Werte verfälscht. Hier steht,
        was daraus gemacht wurde — falls etwas falsch aussieht, lässt es sich im Journal korrigieren.</div>
       <div class="scrollx" style="max-height:56vh"><table class="tb">
         <thead><tr><th>Zeile</th><th>Art</th><th>Repariert zu</th></tr></thead>
         <tbody>${pr.map(x=>`<tr><td>${x.zeile??'–'}</td><td>${esc(arten[x.art]||x.art)}</td>
           <td><b>${esc(String(x.repariert??'–'))}</b></td></tr>`).join('')}</tbody></table></div>`,
      `<button class="btn pri" onclick="closeModal()">Schliessen</button>`, true);
  },
  journalLoeschen(id){
    const e=Store.db.journal.find(x=>x.id===id); if(!e) return;
    frage('Eintrag löschen?',
      `<p style="margin-top:0">${esc(D.niceFull(e.datum))} · ${esc(e.feldJournal)} ·
        ${esc(e.schiffRoh||'')} — ${e.m3??'?'} m³. Die Erfahrungswerte rechnen sich danach neu.</p>`,
      'Löschen', ()=>{ Store.db.journal=Store.db.journal.filter(x=>x.id!==id);
        Store.changed('journal'); this.render(); toast('Eintrag gelöscht'); }, true);
  },

  /* ---------------- EINSTELLUNGEN ---------------- */
  vEinst(p){
    const e=Store.db.einstellungen, k=Store.db.journalKapazitaet;
    const R=Engine.refWerte(), m=Store.db.modell||{};
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
          <input class="inp" id="esHor" type="number" min="2" max="30" value="${e.planungsHorizont}"></div>
      </div>
      <div class="field"><label>Detailgrad für den Wassermann</label>
        <select class="inp" id="esStufe">
          <option value="neu" ${e.erfahrungsstufe==='neu'?'selected':''}>Neu – Kultur, Sprenklerzahl und Erklärungen anzeigen</option>
          <option value="erfahren" ${e.erfahrungsstufe==='erfahren'?'selected':''}>Erfahren – nur Schiffe, Menge und Dauer</option>
        </select></div>

      <div class="sec-title">Worauf sich „mm" bezieht</div>
      <div class="tiny dim" style="margin-bottom:9px">Die wichtigste Einstellung der App — sie entscheidet,
        was eine Regel wie „15 mm" bedeutet. Beide Zahlen stehen überall nebeneinander,
        gerechnet und geplant wird mit der gewählten.</div>
      <div class="field"><select class="inp" id="esMmBezug">
        <option value="flaeche" ${e.mmBezug==='flaeche'?'selected':''}>Kulturfläche — was auf dem Bestand ankommt</option>
        <option value="beregnet" ${e.mmBezug==='beregnet'?'selected':''}>Beregnete Fläche — die alte Betriebsformel</option>
      </select>
      <div class="tiny dim" style="margin-top:6px">Im Journal unterscheiden sich die beiden im Median um den
        Faktor <b>${(m.mmVerhaeltnisAzuB||1.42).toFixed(2)}</b>, je Feld aber sehr verschieden.
        Eine Umstellung verschiebt Felder gegeneinander — nach dem Wechsel die Regeln prüfen.</div></div>

      <div class="sec-title">Rechenmodell</div>
      <div class="tiny dim" style="margin-bottom:9px">Die Dauer folgt aus <b>Wassermenge ÷ Durchfluss</b>.
        Der Durchfluss je Sprenkler ist aus dem Journal geschätzt und wird laufend nachgeführt;
        die Sprenkler-Kennwerte darunter gehen nur noch in die alte mm-Definition ein.</div>
      <div class="scrollx" style="margin-bottom:12px"><table class="tb">
        <thead><tr><th>Grösse</th><th>Wert</th><th>Herkunft</th></tr></thead><tbody>
        <tr><td>Durchfluss je Sprenkler (Betriebsschnitt)</td>
            <td><b>${R.global?R.global.toFixed(2)+' m³/h':'–'}</b></td>
            <td class="dim">${R.n} Gänge aus dem Journal</td></tr>
        <tr><td>je Kreisregner (gefittet)</td><td>${(m.qJeKreisregner||0).toFixed(2)} m³/h</td>
            <td class="dim">Kalibrierung H2</td></tr>
        <tr><td>je Sektorregner (gefittet)</td><td>${(m.qJeSektorregner||0).toFixed(2)} m³/h</td>
            <td class="dim">Kalibrierung H2</td></tr>
        <tr><td>Dämpfung dünner Schiffwerte (λ)</td><td>${m.shrinkageLambda??'–'}</td>
            <td class="dim">aus der Varianzzerlegung, H4</td></tr>
        <tr><td>Schiffe mit eigenem Wert</td><td>${Object.keys(R.schiff).length} von ${Store.schiffZahl()}</td>
            <td class="dim">Rest über Feld- und Betriebsschnitt</td></tr>
        <tr><td>verworfen (unphysikalisch / Rollomat)</td><td>${R.verworfen} / ${R.rollomat}</td>
            <td class="dim">Durchfluss ausserhalb 0,5–5 m³/h je Sprenkler</td></tr>
        </tbody></table></div>

      <div class="sec-title">Sprenkler-Kennwerte (alte Formel)</div>
      <div class="tiny dim" style="margin-bottom:9px">Gehen nur noch in die mm-Definition „beregnete Fläche" ein.
        Die Kalibrierung hat gezeigt, dass sie die tatsächliche Kulturfläche im Median um 38 %
        verfehlen — deshalb rechnet die Planung nicht mehr über sie.</div>
      <div class="grid3">
        <div class="field" style="margin:0"><label>Breite (m)</label>
          <input class="inp" id="esSprB" type="number" step="0.5" value="${e.sprenkler.breite}"></div>
        <div class="field" style="margin:0"><label>Abstand Kreisregner (m)</label>
          <input class="inp" id="esSprK" type="number" step="0.5" value="${e.sprenkler.abstandKreis}"></div>
        <div class="field" style="margin:0"><label>Abstand Sektorregner (m)</label>
          <input class="inp" id="esSprS" type="number" step="0.5" value="${e.sprenkler.abstandSektor}"></div>
      </div>
      <button class="btn pri" style="margin-top:14px" onclick="Admin.einstSpeichern()">Speichern</button>

      <div class="sec-title">Wetterstationen</div>
      <div class="tiny dim" style="margin-bottom:9px">Ordne jedem Standort eine Station zu. Beim Erfassen des
        Niederschlags gibst du dann nur noch wenige Werte ein — sie verteilen sich automatisch.
        Ein Standort gehört zu höchstens einer Station.</div>
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
          const andereName=anders?Store.db.wetterstationen.find(x=>x.id===zug[st.id])?.name:'';
          return `<label class="row tiny" style="padding:4px 0;gap:8px;${anders?'opacity:.55':''}">
            <input type="checkbox" style="width:16px;height:16px" ${w.standortIds.includes(st.id)?'checked':''}
              onchange="Admin.wsToggle('${w.id}','${st.id}',this.checked)">
            <span>${esc(st.name)}</span>${anders?`<span class="dim">(${esc(andereName)})</span>`:''}</label>`;}).join('')}</div>
      </div>`).join('');
  },
  wsName(id,v){ const w=Store.db.wetterstationen.find(x=>x.id===id); if(w){w.name=v; Store.mark();} },
  wsToggle(id,sid,on){
    const w=Store.db.wetterstationen.find(x=>x.id===id); if(!w) return;
    if(on){
      /* Umhängen statt sperren – ein Standort gehört zu genau einer Station,
         sonst zählt Engine.regenAm() denselben Regen doppelt (Befund G6). */
      Store.db.wetterstationen.forEach(x=>{ if(x.id!==id) x.standortIds=x.standortIds.filter(s=>s!==sid); });
      w.standortIds=[...new Set([...w.standortIds,sid])];
    } else w.standortIds=w.standortIds.filter(x=>x!==sid);
    Store.mark(); this.renderWs();
  },
  wsHinzu(){ Store.db.wetterstationen.push({id:uid('ws'),name:'Wetterstation '+(Store.db.wetterstationen.length+1),
    standortIds:[]}); Store.mark(); this.renderWs(); },
  wsLoeschen(id){
    const w=Store.db.wetterstationen.find(x=>x.id===id); if(!w) return;
    const weg=()=>{ Store.db.wetterstationen=Store.db.wetterstationen.filter(x=>x.id!==id);
      Store.mark(); this.renderWs(); };
    if(!w.standortIds.length) return weg();
    frage('Station löschen?',
      `<p style="margin-top:0"><b>${esc(w.name)}</b> versorgt ${w.standortIds.length} Standorte mit Regenwerten.
        Nach dem Löschen musst du diese Standorte einer anderen Station zuordnen.</p>`, 'Löschen', weg, true);
  },
  einstSpeichern(){
    const e=Store.db.einstellungen;
    e.ansprechperson=$('#esName').value.trim()||'Sammy';
    e.ansprechTelefon=$('#esTel').value.trim();
    e.adminMail=$('#esMail').value.trim();
    e.kapazitaetStandorte=Math.max(1, num($('#esKap').value)||8);
    e.planungsHorizont=clamp(num($('#esHor').value)||10, 2, 30);
    e.erfahrungsstufe=$('#esStufe').value;
    const b=num($('#esSprB').value), k=num($('#esSprK').value), s=num($('#esSprS').value);
    if(!b||!k||!s||b<=0||k<=0||s<=0){ toast('Die Sprenkler-Kennwerte müssen grösser als 0 sein'); return; }
    e.sprenkler={breite:b, abstandKreis:k, abstandSektor:s};
    const bezugAlt=e.mmBezug;
    e.mmBezug=$('#esMmBezug').value;
    if(bezugAlt!==e.mmBezug) toast('mm-Bezug geändert — bitte die Regeln prüfen');
    Admin.tagOffset=clamp(Admin.tagOffset,0,e.planungsHorizont-1);
    Store.changed('einstellung'); toast('Einstellungen gespeichert'); this.render();
  },
  journalExport(){
    const h=['Datum','Feld','Schiffe','Kultur','Start','Stopp','ÜberNacht','DauerMin','StartM3','StopM3','m3','Kreisregner','Sektorregner','mm','Bemerkung'];
    const q=v=>{ const s=String(v??''); return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
    const rows=Store.db.journal.map(e=>[e.datum,e.feldJournal,e.schiffRoh,e.kultur||'',e.startZeit||'',e.stopZeit||'',
      e.ueberNacht?'ja':'',e.dauerMin??'',e.startM3??'',e.stopM3??'',e.m3??'',e.kreisregner??'',e.sektorregner??'',
      (Engine.mmVonEintrag(e)??'')&&Engine.mmVonEintrag(e).toFixed(1), e.bemerkung||'']);
    const csv=[h,...rows].map(r=>r.map(q).join(';')).join('\r\n');
    const b=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(b);
    const a=document.createElement('a'); a.href=url; a.download='bewaesserungsjournal_bereinigt.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000); toast('CSV erstellt');
  }
});
