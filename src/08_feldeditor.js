/* ============================================================
   FELD-EDITOR — gemeinsam für Standorte-Reiter und Setup.
   Grafik oben, darunter 4 Reiter:
   1 Schiff anpassen · 2 Sektor anpassen · 3 Rohre · 4 Kultur
   ============================================================ */
const FeldEditor = {
  reiter:'schiffe', pv:null, schiffId:null, sektorId:null,
  ctx:null,   // {standortId, feldId, setup, onWeiter, container}

  REITER:[['schiffe','1 · Schiff anpassen'],['sektoren','2 · Sektor anpassen'],
          ['rohr','3 · Rohre'],['kultur','4 · Kultur']],

  mount(container, ctx){
    this.ctx = Object.assign({}, ctx, {container});
    if(ctx.reiter) this.reiter=ctx.reiter;
    if(!['schiffe','sektoren','rohr','kultur'].includes(this.reiter)) this.reiter='schiffe';
    this.render();
  },
  feld(){ return this.ctx?Store.feld(this.ctx.feldId):null; },
  /* PlanView sauber abbauen, bevor ein neues entsteht (sonst bleiben ResizeObserver liegen) */
  entsorgePV(){ if(this.pv && this.pv.destroy) this.pv.destroy(); this.pv=null; },

  render(){
    const c=this.ctx.container; c.innerHTML='';
    this.entsorgePV();
    const f=this.feld(); if(!f){ c.innerHTML='<div class="empty"><h3>Kein Feld</h3></div>'; return; }
    const st=Store.standort(this.ctx.standortId);

    /* Grafik */
    const holder=el('div'); c.appendChild(holder);
    const modus = this.reiter==='kultur' ? 'kultur' : this.reiter;
    this.pv=PlanView({standortId:st.id, feldId:f.id, modus, showKultur:true,
      selected:this.schiffId, selectedSektor:this.sektorId, height:470,
      onPick:(s,f2,sek)=>{ this.schiffId=s.id; this.sektorId=sek?sek.id:null;
        if(this.reiter==='kultur') this.kulturKlick(s,f2,sek);
        else this.renderUnten(); },
      onChange:()=>{ Store.changed('geometrie'); this.renderUnten(); },
      onRohrFertig:(pts)=>this.rohrSpeichern(pts)});
    holder.appendChild(this.pv.node);

    /* Reiterleiste UNTER der Grafik */
    const tabs=el('div','edtabs');
    this.REITER.forEach(([k,l])=>{
      const b=el('button','edtab'+(this.reiter===k?' on':''),esc(l));
      b.onclick=()=>{ this.reiter=k; this.render(); };
      tabs.appendChild(b);
    });
    if(this.ctx.setup){
      tabs.appendChild(el('div','sp'));
      const w=el('button','btn pri sm','Weiter →');
      w.onclick=()=>this.weiter();
      tabs.appendChild(w);
    }
    c.appendChild(tabs);

    /* Bereich unter den Reitern */
    const unten=el('div'); unten.id='edUnten'; unten.style.marginTop='11px';
    c.appendChild(unten);
    this.renderUnten();
  },

  weiter(){
    const folge={schiffe:'sektoren', sektoren:'rohr', rohr:'kultur'};
    if(folge[this.reiter]){ this.reiter=folge[this.reiter]; this.render(); }
    else if(this.ctx.onWeiter) this.ctx.onWeiter();
  },

  renderUnten(){
    const u=document.getElementById('edUnten'); if(!u) return;
    u.innerHTML='';
    const f=this.feld(); if(!f) return;
    const m={schiffe:'uSchiffe', sektoren:'uSektoren', rohr:'uRohre', kultur:'uKultur'}[this.reiter];
    if(m) this[m](u,f);
  },

  gewaehltesSchiff(f){
    const info=this.schiffId?Store.db._sch[this.schiffId]:null;
    return info && info.feld.id===f.id ? info.schiff : null;
  },

  /* ---------- Reiter 1: Schiff anpassen ---------- */
  uSchiffe(u,f){
    u.appendChild(el('div','tiny muted',
      'Weisse Punkte ziehen · Doppelklick auf eine Kante fügt einen Punkt ein · Rechtsklick löscht ihn.'));
    const s=this.gewaehltesSchiff(f);
    const bar=el('div','row wrap'); bar.style.marginTop='9px';
    bar.innerHTML=`
      ${s?`<span class="chip g">${esc(Store.schiffName(s))} gewählt · ${s.aren?s.aren+' Aren':'Aren fehlen'}</span>`:
          '<span class="chip">Schiff im Plan anklicken</span>'}
      <span class="sp"></span>
      <button class="btn sm" onclick="Admin.schiffeVerwalten('${f.id}')">Schiffe-Tabelle (${Store.echteSchiffe(f).length})</button>
      <button class="btn sm ghost" onclick="Admin.schiffeAufteilen('${f.id}')">In n Streifen teilen…</button>
      <button class="btn sm ghost" onclick="Admin.feldBearbeiten('${f.id}')">Stammdaten</button>`;
    u.appendChild(bar);
    if(f.schiffe.some(x=>x.implizit)){
      const i=el('div','infobox tiny'); i.style.marginTop='9px';
      i.innerHTML=`<b>Dieses Feld hat keine nummerierten Schiffe.</b> Es wird als eine einzige Fläche
        bewässert — Kultur und Regel lassen sich trotzdem im Reiter „Kultur" erfassen.
        Über „In n Streifen teilen…" entstehen bei Bedarf nummerierte Schiffe.`;
      u.appendChild(i);
    }
    if(f.unsicher||f.hinweis){
      const w=el('div','warnbox tiny'); w.style.marginTop='9px';
      w.innerHTML=`${f.unsicher?'<b>Diese Digitalisierung ist unsicher — bitte genau prüfen.</b> ':''}${esc(f.hinweis||'')}`;
      u.appendChild(w);
    }
  },

  /* ---------- Reiter 2: Sektor anpassen ---------- */
  uSektoren(u,f){
    const s=this.gewaehltesSchiff(f);
    u.appendChild(el('div','tiny muted',
      s?'Sektor-Punkte (orange) ziehen zum Anpassen. Sektoren teilen ein Schiff in Sätze oder verschiedene Kulturen.'
       :'Zuerst im Plan das Schiff anklicken, das unterteilt werden soll.'));
    const bar=el('div','row wrap'); bar.style.marginTop='9px';
    const add=el('button','btn sm pri','Sektor hinzufügen');
    add.disabled=!s;
    add.onclick=()=>this.sektorTeilenDialog(f,s);
    bar.appendChild(add);
    if(s) bar.appendChild(el('span','chip g',esc(Store.schiffName(s))));
    u.appendChild(bar);

    /* Liste aller Sektoren des Feldes */
    const alle=[];
    f.schiffe.forEach(sc=>(sc.sektoren||[]).forEach(k=>{ if(k.polygon) alle.push({k,sc}); }));
    if(alle.length){
      const box=el('div','card'); box.style.cssText='padding:11px;margin-top:11px';
      box.innerHTML='<div class="sec-title" style="margin-top:0">Sektoren in '+esc(f.name)+'</div>'+
        alle.map(({k,sc})=>{
          const ku=k.kulturId?Store.kultur(k.kulturId):null;
          return `<div class="row wrap" style="padding:6px 0;border-top:1px solid var(--line);gap:6px">
            <span class="chip">${esc(k.name||'?')}</span>
            <span class="tiny" style="flex:1">${ku?`<span class="kultbadge" style="background:${ku.farbe}">${ku.icon||''} ${esc(ku.name)}</span>`
              :'<span class="dim">noch ohne Kultur</span>'}
              ${k.satz?`<span class="chip" style="margin-left:5px">Satz ${esc(k.satz)}</span>`:''}</span>
            <button class="btn sm ghost" onclick="FeldEditor.sektorLoeschen('${sc.id}','${k.id}')">entfernen</button>
          </div>`;}).join('');
      u.appendChild(box);
    }
  },
  sektorTeilenDialog(f,s){
    const vorhanden=(s.sektoren||[]).filter(k=>k.polygon).length;
    openModal(Store.schiffName(s)+' in Sektoren teilen',
      `${vorhanden?`<div class="warnbox tiny"><b>${vorhanden} Sektor${vorhanden===1?'':'en'} sind bereits eingezeichnet.</b>
        Die neue Aufteilung ERSETZT sie. Kultur, Pflanzdatum und Bewässerungsstand des ersten
        bestehenden Sektors werden übernommen.</div>`:''}
       <div class="grid2">
        <div class="field"><label>Anzahl Sektoren</label>
          <select class="inp" id="stAnz">${[2,3,4,5,6].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></div>
        <div class="field"><label>Teilung</label>
          <select class="inp" id="stRicht">
            <option value="h">horizontal (übereinander)</option>
            <option value="v">vertikal (nebeneinander)</option></select></div>
       </div>
       <div class="tiny dim">Die Teilflächen legen sich über das Schiff und lassen sich danach mit den
         orangen Punkten frei anpassen.</div>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="FeldEditor.sektorTeilen('${f.id}','${s.id}')">Teilen</button>`);
  },
  sektorTeilen(fid,sid){
    const f=Store.feld(fid), s=f.schiffe.find(x=>x.id===sid); if(!s) return;
    const n=+$('#stAnz').value, r=$('#stRicht').value;
    const polys=teileInStreifen(s.polygon, n, r);
    const alt=(s.sektoren||[]);
    /* Zustand des ersten bestehenden Sektors mitnehmen – vor allem letzteBewaesserung,
       sonst wird die Fälligkeit neu geraten (früherer Befund B5). */
    const vorlage = alt.find(k=>k.kulturId) || alt[0] || null;
    s.sektoren=[];                                  // ersetzen, nicht stapeln
    polys.forEach((p,i)=>{
      s.sektoren.push({id:uid('sek'), name:(s.nummer||f.name)+'.'+(i+1), polygon:p,
        kulturId:(i===0&&vorlage)?vorlage.kulturId||null:null,
        pflanzdatum:(i===0&&vorlage)?vorlage.pflanzdatum||null:null,
        satz:(i===0&&vorlage)?vorlage.satz||null:null,
        prioritaet:(i===0&&vorlage)?vorlage.prioritaet||'normal':'normal',
        pausiert:(i===0&&vorlage)?!!vorlage.pausiert:false,
        pausiertBis:(i===0&&vorlage)?vorlage.pausiertBis||null:null,
        letzteBewaesserung:(i===0&&vorlage)?vorlage.letzteBewaesserung||null:null});
    });
    closeModal(); Store.changed('kultur'); this.render();
    toast(n+' Sektoren angelegt – Punkte anpassen, dann im Reiter Kultur zuweisen');
  },
  sektorLoeschen(sid,kid){
    const i=Store.db._sch[sid]; if(!i) return;
    const k=(i.schiff.sektoren||[]).find(x=>x.id===kid);
    const beschriftet = k && (k.kulturId||k.satz);
    const weg=()=>{ i.schiff.sektoren=(i.schiff.sektoren||[]).filter(x=>x.id!==kid);
      Store.changed('kultur'); this.render(); toast('Sektor entfernt'); };
    if(!beschriftet) return weg();
    frage('Sektor entfernen?',
      `<p style="margin-top:0">Der Sektor <b>${esc(k.name||'')}</b>${k.kulturId
        ?` mit der Kultur <b>${esc(Store.kultur(k.kulturId)?.name||'?')}</b>`:''} wird gelöscht,
        samt Pflanzdatum und Bewässerungsstand.</p>`, 'Entfernen', weg, true);
  },

  /* ---------- Reiter 3: Rohre ---------- */
  uRohre(u,f){
    u.appendChild(el('div','tiny muted',
      'Erster Klick = Anfang, zweiter Klick = Ende. Für Kurven zwischendurch rechtsklicken. '+
      'Die App erkennt selbst, ob das Rohr in einem Schiff liegt (Rohr 3) oder in der Fahrgasse dazwischen (Rohr 3/4). '+
      'Endpunkte lassen sich ziehen, Rechtsklick auf einen Punkt löscht ihn.'));
    const alle=Store.feldRohre(f);
    const box=el('div','card'); box.style.cssText='padding:11px;margin-top:10px';
    box.innerHTML='<div class="sec-title" style="margin-top:0">Rohre in '+esc(f.name)+' ('+alle.length+')</div>'+
      (alle.length? alle.map(({rohr:r,schiff:s})=>`<div class="row" style="padding:6px 0;border-top:1px solid var(--line)">
          <span class="chip b">Rohr ${esc(r.name||'?')}</span>
          <span class="tiny dim" style="flex:1">${r.punkte.length} Punkte · bei ${esc(Store.schiffName(s))}</span>
          <button class="btn sm ghost" onclick="FeldEditor.rohrLoeschen('${s.id}','${r.id}')">entfernen</button>
        </div>`).join('')
       : '<div class="tiny dim">Noch keine Rohre — direkt in den Plan klicken.</div>');
    u.appendChild(box);
    if(alle.length){
      const del=el('button','btn sm ghost','Alle Rohre löschen'); del.style.marginTop='8px';
      del.onclick=()=>frage('Alle Rohre löschen?',
        `<p style="margin-top:0">Alle <b>${alle.length} Rohre</b> in ${esc(f.name)} werden entfernt.
          Das lässt sich nicht rückgängig machen.</p>`, 'Alle löschen',
        ()=>{ f.schiffe.forEach(s=>s.rohre=[]); Store.changed('geometrie',{stillerPlan:true});
              this.render(); toast('Rohre gelöscht'); }, true);
      u.appendChild(del);
    }
  },
  rohrSpeichern(pts){
    const f=this.feld(); if(!f) return;
    const name=rohrName(pts, f);
    const mp=[(pts[0][0]+pts[pts.length-1][0])/2,(pts[0][1]+pts[pts.length-1][1])/2];
    let ziel=f.schiffe.find(s=>pointInPoly(mp,s.polygon));
    if(!ziel) ziel=f.schiffe.map(s=>({s,d:distToPoly(mp,s.polygon)})).sort((a,b)=>a.d-b.d)[0]?.s;
    if(!ziel){ toast('Kein Schiff in der Nähe'); return; }
    ziel.rohre=ziel.rohre||[];
    ziel.rohre.push({id:uid('rohr'), punkte:pts, name});
    Store.changed('geometrie',{stillerPlan:true}); this.render();
    toast('Rohr '+name+' gespeichert');
  },
  rohrLoeschen(sid,rid){
    const i=Store.db._sch[sid]; if(!i) return;
    i.schiff.rohre=(i.schiff.rohre||[]).filter(r=>r.id!==rid);
    Store.changed('geometrie',{stillerPlan:true}); this.render();
  },

  /* ---------- Reiter 4: Kultur ---------- */
  uKultur(u,f){
    u.appendChild(el('div','tiny muted',
      'Schiff oder Sektor im Plan anklicken → Kultur und Regel eintragen. '+
      'Bei Schiffen mit Sektoren die einzelnen Sektoren anklicken.'));
    const box=el('div','card'); box.style.cssText='padding:11px;margin-top:10px';
    let html='<div class="sec-title" style="margin-top:0">Kulturen in '+esc(f.name)+'</div>';
    f.schiffe.forEach(s=>{
      const sk=(s.sektoren||[]);
      const zeilen = sk.map(k=>{
        const ku=k.kulturId?Store.kultur(k.kulturId):null;
        const r=ku?Store.regel(f.id,k.kulturId):null;
        return `<div class="row wrap" style="padding:5px 0 5px 14px;gap:6px">
          ${k.name?`<span class="chip">${esc(k.name)}</span>`:''}
          ${ku?`<span class="kultbadge" style="background:${ku.farbe}">${ku.icon||''} ${esc(ku.name)}</span>`
             :'<span class="tiny dim">ohne Kultur — im Plan anklicken</span>'}
          ${k.satz?`<span class="chip">Satz ${esc(k.satz)}</span>`:''}
          ${k.pflanzdatum?`<span class="tiny dim">seit ${D.niceFull(k.pflanzdatum)}</span>`:''}
          ${k.pausiert?'<span class="chip a">pausiert</span>':''}
          ${ku?(r?`<span class="chip g">${esc(Admin.regelText(r))}</span>`
               :'<span class="chip r">Regel fehlt</span>'):''}
          <span class="sp"></span>
          <button class="btn sm ghost" onclick="Admin.sektorBearbeiten('${f.id}','${s.id}','${k.id}')">bearbeiten</button>
        </div>`;}).join('');
      html+=`<div style="padding:7px 0;border-top:1px solid var(--line)">
        <div class="row"><b class="tiny">${esc(Store.schiffName(s))}</b><span class="sp"></span>
          ${sk.some(k=>k.polygon)?'':`<button class="btn sm ghost" onclick="Admin.sektorNeu('${f.id}','${s.id}')">${sk.length?'Kultur ändern':'+ Kultur'}</button>`}
        </div>${zeilen||'<div class="tiny dim" style="padding-left:14px">ohne Kultur — wird nicht eingeplant</div>'}</div>`;
    });
    box.innerHTML=html;
    u.appendChild(box);
  },
  kulturKlick(s,f,sek){
    if(sek){ Admin.sektorBearbeiten(f.id, s.id, sek.id); return; }
    const ganz=(s.sektoren||[]).find(k=>!k.polygon);
    if((s.sektoren||[]).some(k=>k.polygon) && !ganz){
      toast('Dieses Schiff hat Sektoren — bitte den Sektor anklicken'); return;
    }
    if(ganz) Admin.sektorBearbeiten(f.id, s.id, ganz.id);
    else Admin.sektorNeu(f.id, s.id);
  }
};
