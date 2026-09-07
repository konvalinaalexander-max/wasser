/* ============================================================
   ADMIN — Produktionsleiter
   ============================================================ */
const Admin = {
  tab:'plan', tagOffset:0, standortId:null, feldId:null, schiffId:null,

  TABS:[['plan','Tagesplan'],['standorte','Standorte'],['kulturen','Kulturen & Regeln'],
        ['journal','Journal'],['einst','Einstellungen']],

  open(){
    LANG='de';                                   // der Admin arbeitet auf Deutsch
    if(typeof Setup!=='undefined' && Setup.aktiv){ Setup.aktiv=false;
      const sk=document.getElementById('setupSkip'); if(sk) sk.remove(); }
    $('#admSub').textContent = Store.db.felder.length+' Felder · '+Store.schiffZahl()+' Schiffe';
    this.renderTabs(); this.render();
    // Ersteinrichtung hat Vorrang vor der Regenabfrage
    if(!Store.db.einstellungen.setupErledigt && !Store.db.einstellungen.setupUebersprungen){
      setTimeout(()=>Setup.willkommen(), 260); return;
    }
    if(Store.db.einstellungen.regenGefragtAm!==D.today()) setTimeout(()=>this.regenDialog(), 320);
  },
  renderTabs(){
    const t=$('#admTabs'); t.innerHTML='';
    this.TABS.forEach(([k,l])=>{ const b=el('button','tab'+(this.tab===k?' on':''),esc(l));
      b.onclick=()=>{
        if(typeof Setup!=='undefined' && Setup.aktiv){ Setup.aktiv=false;
          const sk=document.getElementById('setupSkip'); if(sk) sk.remove(); }
        this.tab=k; this.renderTabs(); this.render(); };
      t.appendChild(b); });
  },
  go(t){ this.tab=t; this.renderTabs(); this.render(); },
  render(){
    const p=$('#admPage'); p.innerHTML='';
    const m={plan:'vPlan',auswert:'vAuswert',standorte:'vStandorte',kulturen:'vKulturen',
             journal:'vJournal',einst:'vEinst'}[this.tab];
    if(m) this[m](p);
  },

  /* ---------------- Regen über Wetterstationen ---------------- */
  regenDialog(){
    const ws=Store.db.wetterstationen;
    const ohne=ws.filter(w=>!w.standortIds.length).length;
    const ungeprueft=Store.db.felder.filter(f=>f.bewaessert!==false && !f.ueberdachtGeprueft).length;
    openModal('Niederschlag erfassen',
      `<p class="muted" style="margin-top:0">Trage ab, was die Wetterstationen gemessen haben.
        Die zugeordneten Standorte bekommen den Wert automatisch.</p>
       ${ungeprueft?`<div class="warnbox">Bei <b>${ungeprueft} Feldern</b> ist nicht erfasst, ob sie
         überdacht sind. Sie gelten als Freiland und bekommen den Regen angerechnet — bei einem
         Tunnel wäre das der einzige Fehler in dieser App, der wirklich schadet.
         <button class="btn sm" style="margin-left:8px"
           onclick="closeModal();Admin.ueberdachungDialog()">Jetzt festlegen</button></div>`:''}
       <div class="field"><label>Für welchen Tag?</label>
         <select class="inp" id="rgTag">
           <option value="${D.today()}">Heute — ${esc(D.nice(D.today()))}</option>
           <option value="${D.add(D.today(),-1)}">Gestern — ${esc(D.nice(D.add(D.today(),-1)))}</option>
           <option value="${D.add(D.today(),-2)}">Vorgestern — ${esc(D.nice(D.add(D.today(),-2)))}</option>
         </select>
         <div class="tiny dim" style="margin-top:4px">Regen wird auf den Tag gebucht, an dem er gefallen ist —
           nur so rechnet die Wasserbilanz richtig.</div></div>
       ${ohne?`<div class="warnbox tiny"><b>${ohne} Station${ohne===1?' ist':'en sind'} noch keinem Standort zugeordnet.</b>
         Werte dieser Stationen können nicht verteilt werden. Zuordnen unter Einstellungen → Wetterstationen.</div>`:''}
       ${ws.map(w=>`<div class="card" style="padding:12px;margin-bottom:9px${w.standortIds.length?'':';opacity:.6'}">
          <div class="row"><b style="flex:1">${esc(w.name)}</b>
            <span class="chip">${w.standortIds.length} Standorte</span></div>
          <div class="row" style="margin-top:9px;gap:9px">
            <input class="inp big wsMm" data-id="${w.id}" type="number" step="0.5" placeholder="0"
              inputmode="decimal" style="flex:1" ${w.standortIds.length?'':'disabled'}>
            <span class="muted" style="font-weight:650">mm</span></div>
          <div class="tiny dim" style="margin-top:6px">${w.standortIds.length
            ? esc(w.standortIds.map(i=>Store.standort(i)?.name).filter(Boolean).slice(0,4).join(', '))+
              (w.standortIds.length>4?' …':'')
            : 'keine Standorte zugeordnet — Eingabe gesperrt'}</div>
        </div>`).join('')}
       <div class="tiny dim">Leere Felder werden als „kein Regen" gewertet.</div>`,
      `<button class="btn" onclick="Admin.regenNein()">Kein Regen</button>
       <div class="sp"></div>
       <button class="btn" onclick="Admin.go('einst');closeModal()">Stationen zuordnen</button>
       <button class="btn pri" onclick="Admin.regenSpeichern()">Übernehmen</button>`);
  },
  regenNein(){ Store.db.einstellungen.regenGefragtAm=D.today(); closeModal();
    Store.changed('regen'); this.render(); },
  regenSpeichern(){
    const datum=$('#rgTag').value || D.today();
    let total=0, standorte=0;
    document.querySelectorAll('.wsMm').forEach(inp=>{
      const mm=num(inp.value); if(mm==null || mm<=0) return;
      const w=Store.db.wetterstationen.find(x=>x.id===inp.dataset.id);
      if(!w||!w.standortIds.length) return;
      Store.db.regen.push({id:uid('r'), datum, mm, standortIds:w.standortIds.slice(), stationId:w.id});
      total++; standorte+=w.standortIds.length;
    });
    Store.db.einstellungen.regenGefragtAm=D.today();
    closeModal(); Store.changed('regen'); this.go('plan');
    if(total){
      const betroffen=Engine.tagesPlan(D.today()).auftraege.filter(a=>a.regenMm>0).length;
      toast(betroffen
        ? `${total>1?total+' Werte':'Regen'} auf ${standorte} Standorte gebucht — ${betroffen} Auftrag${betroffen===1?'':'e'} mit Anpassungsvorschlag`
        : `${total>1?total+' Werte':'Regen'} auf ${standorte} Standorte gebucht`);
    } else toast('Kein Regen erfasst');
  },

  /* ---------------- TAGESPLAN ---------------- */
  vPlan(p){
    const e=Store.db.einstellungen;
    const pr=Engine.probleme();

    if(!e.setupErledigt){
      const box=el('div','infobox');
      box.innerHTML=`<b>Ersteinrichtung noch offen.</b> Ohne Kulturen und Regeln kann kein Plan entstehen.
        <div style="margin-top:9px"><button class="btn pri sm" onclick="Setup.start()">Ersteinrichtung starten</button></div>`;
      p.appendChild(box);
    }
    /* Warum der Plan (noch) leer ist – das wurde bisher nirgends gesagt */
    if(!pr.planbar){
      const box=el('div','warnbox');
      box.style.background='var(--rust-soft)'; box.style.borderColor='#E7C3B8'; box.style.color='var(--rust)';
      box.innerHTML=`<b>Der Plan bleibt leer: keinem Schiff ist bisher eine Kultur mit Regel zugewiesen.</b>
        <div class="tiny" style="margin-top:6px;color:var(--ink-2)">
          ${pr.ohneKultur.length} Schiffe ohne Kultur${pr.verwaisteRegeln.length
            ?` · ${pr.verwaisteRegeln.length} Regeln liegen bereit, aber keine Fläche nutzt sie`:''}.
          Die Planung rechnet über Sektoren — erst wenn dort „was steht hier, seit wann" erfasst ist, entstehen Aufträge.</div>
        <div class="row wrap" style="margin-top:10px;gap:7px">
          <button class="btn pri sm" onclick="Setup.start()">Ersteinrichtung starten</button>
          ${pr.verwaisteRegeln.length?`<button class="btn sm" onclick="Setup.kulturenAusRegeln()">Kulturen aus den Startregeln übernehmen</button>`:''}
        </div>`;
      p.appendChild(box);
    } else if(pr.ohneRegel.length){
      const box=el('div','warnbox');
      box.innerHTML=`<b>${pr.ohneRegel.length} Sektor${pr.ohneRegel.length===1?'':'en'} ohne Bewässerungsregel</b> —
        ${esc([...new Set(pr.ohneRegel.map(x=>x.feld.name+' · '+(x.kultur?x.kultur.name:'?')))].slice(0,4).join(', '))}${pr.ohneRegel.length>4?' …':''}.
        Diese Flächen werden nicht eingeplant.
        <button class="btn sm" style="margin-left:8px" onclick="Admin.go('kulturen')">Regeln ansehen</button>`;
      p.appendChild(box);
    }

    /* Meldungen des Wassermanns – wurden bisher gespeichert und nie angezeigt */
    const offene=(Store.db.meldungen||[]).filter(m=>!m.gelesen);
    if(offene.length){
      const box=el('div','warnbox');
      box.style.background='var(--amber-soft)'; box.style.borderColor='#E8D2A6';
      box.innerHTML=`<b>${offene.length} Meldung${offene.length===1?'':'en'} vom Wassermann</b>
        ${offene.slice(0,3).map(m=>`<div class="tiny" style="margin-top:5px">
          ${esc(D.nice(m.datum))}, ${esc(m.zeit)} — „schaffe ich heute nicht"${m.text?': '+esc(m.text):''}</div>`).join('')}
        <div style="margin-top:9px"><button class="btn sm" onclick="Admin.meldungenGelesen()">Zur Kenntnis genommen</button></div>`;
      p.appendChild(box);
    }

    const datum=D.add(D.today(), this.tagOffset);
    const tp=Engine.tagesPlan(datum);

    /* Kennzahlen: das sieht der Leiter zuerst */
    const heute=Engine.tagesPlan(D.today());
    const ueberf=heute.auftraege.filter(a=>a.ueberfaellig>0).length;
    /* Rückstände getrennt zählen: das sind keine dringenden Gänge, sondern
       Klärfälle. Sie stehen in der Liste hinten, dürfen aber nicht
       verschwinden — sonst fällt genau das nicht auf, was auffallen muss. */
    const rueck=heute.auftraege.filter(a=>a.rueckstand).length;
    /* Wenn fast alles Klärfall ist, sind das nicht viele einzelne Datenprobleme,
       sondern ein veraltetes Journal. Diese Unterscheidung entscheidet darüber,
       ob der Leiter zehn Flächen prüft oder einmal nachträgt. */
    const letzterEintrag=Store.db.journal.map(j=>j.datum).filter(Boolean).sort().pop()||null;
    const journalAlterTage=letzterEintrag?D.diff(letzterEintrag, D.today()):null;
    const flaechendeckend = heute.auftraege.length>=4 && rueck/heute.auftraege.length>=0.7;
    const woGrenze=D.add(D.today(),-6);
    let m3Woche=0;
    Store.db.journal.forEach(j=>{ if(j.datum>=woGrenze && j.m3) m3Woche+=j.m3; });
    /* Regen der letzten 7 Tage: Summe je Tag, danach die Summe über die Tage –
       das Maximum eines Einzeleintrags war irreführend (früherer Befund D1). */
    const proTag={};
    Store.db.regen.forEach(r=>{ if(r.datum>=woGrenze && r.datum<=D.today())
      proTag[r.datum]=Math.max(proTag[r.datum]||0, r.mm); });
    const regenWoche=Object.values(proTag).reduce((a,b)=>a+b,0);
    const statr=el('div','statrow');
    statr.innerHTML=`
      <div class="stt"><b>${heute.auftraege.length}</b><span>heute fällig</span></div>
      <div class="stt"><b style="color:${ueberf?'var(--rust)':'inherit'}">${ueberf}</b><span>überfällig</span></div>
      <div class="stt" title="Aufträge, die mehr als das ${Engine.RUECKSTAND_AB}-fache der Regelmenge im Rückstand sind. Meist steckt kein Wasserbedarf dahinter, sondern eine abgeräumte Kultur, eine zu enge Regel oder ein nicht eingetragener Gang."><b style="color:${
        rueck?'var(--amber)':'inherit'}">${rueck}</b><span>Klärfälle</span></div>
      <div class="stt"><b>${Math.round(m3Woche)} m³</b><span>Wasser · 7 Tage</span></div>
      <div class="stt"><b>${regenWoche?Math.round(regenWoche*10)/10+' mm':'–'}</b><span>Regen · 7 Tage</span></div>`;
    p.appendChild(statr);

    if(flaechendeckend && journalAlterTage>7){
      const w=el('div','warnbox');
      w.innerHTML=`<b>${rueck} von ${heute.auftraege.length} Aufträgen sind Klärfälle</b> —
        das ist kein Flächenproblem, sondern eines im Journal. Der letzte Eintrag ist vom
        ${esc(D.nice(letzterEintrag))}, also ${journalAlterTage} Tage alt. Solange nichts
        nachgetragen wird, rechnet die App weiter Defizit auf und hält fast jeden Sektor für
        stark überfällig.
        <span class="tiny dim">Der Plan arbeitet den Rückstand kapazitätsgerecht ab und
        versteckt ihn nicht. Sobald die letzten Gänge erfasst sind, verschwinden diese
        Markierungen von selbst. Bleiben sie danach bei einzelnen Flächen stehen, sind es
        dort echte Klärfälle — abgeräumte Kultur, zu enge Regel oder ein nicht erfasster
        Gang.</span>`;
      p.appendChild(w);
    } else if(flaechendeckend){
      const w=el('div','warnbox');
      w.innerHTML=`<b>${rueck} von ${heute.auftraege.length} Aufträgen sind Klärfälle.</b>
        Bei so vielen liegt die Ursache meist nicht auf den Flächen, sondern in den Regeln:
        versprechen sie durchgängig mehr, als der Betrieb fährt, wächst überall dauerhaft
        ein Defizit. <button class="btn sm ghost" style="margin-left:6px"
        onclick="Admin.go('auswert')">Regel gegen Wirklichkeit ansehen</button>`;
      p.appendChild(w);
    }

    const maxOffset=(e.planungsHorizont||10)-1;
    const head=el('div','dayhead');
    head.innerHTML=`<button class="dnav" ${this.tagOffset<=0?'disabled':''} onclick="Admin.tagWechsel(-1)">‹</button>
      <div class="daytitle"><div class="d1">${esc(D.nice(datum))}</div>
      <div class="d2">${esc(D.rel(datum))} · ${tp.auftraege.length} Aufträge · ${tp.standorte} Standorte</div></div>
      <button class="dnav" ${this.tagOffset>=maxOffset?'disabled':''} onclick="Admin.tagWechsel(1)">›</button>`;
    p.appendChild(head);

    const bar=el('div','row wrap'); bar.style.marginBottom='12px';
    bar.innerHTML=`<button class="btn sm" onclick="Admin.regenDialog()">🌧 Regen erfassen</button>
      <button class="btn sm ghost" onclick="Admin.neuerAuftrag('${datum}')">+ Auftrag</button>
      <div class="sp"></div>
      <span class="tiny dim">Plan rechnet sich laufend selbst neu</span>`;
    p.appendChild(bar);

    if(tp.ueberlastet){
      const w=el('div','warnbox'); w.style.background='var(--rust-soft)'; w.style.borderColor='#E7C3B8';
      w.style.color='var(--rust)';
      w.innerHTML=`<b>Maximale Kapazität erreicht.</b> ${tp.grund==='standorte'
        ? `${tp.standorte} Standorte an einem Tag — erfahrungsgemäss schafft der Wassermann etwa ${tp.kapazitaet}.`
        : `${tp.auftraege.length} Aufträge an einem Tag — üblich sind bis zu ${tp.maxAuftraege}.`}
        Was hier steht, ist bereits überfällig und lässt sich nicht weiter aufschieben — mit den Pfeilen
        kannst du trotzdem einzelne Aufträge verschieben.`;
      p.appendChild(w);
    }
    if(tp.zurueckgestellt){
      const z=el('div','infobox');
      z.innerHTML=`<b>${tp.zurueckgestellt} weitere${tp.zurueckgestellt===1?'r Auftrag wäre':' Aufträge wären'} heute fällig</b>,
        ${tp.zurueckgestellt===1?'liegt':'liegen'} aber über der Tageskapazität von ${tp.kapazitaet} Standorten.
        ${tp.zurueckgestellt===1?'Er rutscht':'Sie rutschen'} auf die Folgetage und ${tp.zurueckgestellt===1?'steht':'stehen'}
        dort weiter vorne. Mit „+ Auftrag" lässt sich trotzdem etwas dazunehmen.`;
      p.appendChild(z);
    }
    const regenHeute=Store.db.regen.filter(r=>r.datum===datum);
    if(regenHeute.length){
      const i=el('div','infobox');
      i.innerHTML=`<b>Regen erfasst:</b> `+regenHeute.map(r=>`${r.mm} mm auf ${r.standortIds.length} Standorte`).join(' · ')+
        `. Betroffene Aufträge zeigen unten einen Anpassungsvorschlag.`;
      p.appendChild(i);
    }
    if(tp.freigegeben){
      const o=el('div','okbox');
      o.innerHTML=`<b>Für den Wassermann freigegeben.</b>
        ${tp.geaendertNachFreigabe?'<span style="color:var(--rust)">Seit der Freigabe geändert — der Wassermann sieht die Änderung erst beim nächsten Öffnen.</span>':'Änderungen wirken sofort.'}
        <button class="btn sm ghost" style="margin-left:8px" onclick="Admin.freigabe('${datum}',false)">Freigabe zurücknehmen</button>`;
      p.appendChild(o);
    }

    const vp=el('div','dayviewport'); const stack=el('div','daystack'); vp.appendChild(stack); p.appendChild(vp);
    this._stack=stack;
    if(!tp.auftraege.length)
      stack.appendChild(el('div','empty','<h3>Nichts fällig</h3><p>Für diesen Tag ist keine Bewässerung nötig.</p>'));
    tp.auftraege.forEach(a=>stack.appendChild(this.auftragCard(a,datum)));

    if(!tp.freigegeben && tp.auftraege.length){
      const f=el('div'); f.style.marginTop='14px';
      f.innerHTML=`<button class="btn pri big" onclick="Admin.freigabePruefen('${datum}')">Für Wassermann freigeben</button>`;
      p.appendChild(f);
    }

    const vor=el('div'); vor.style.marginTop='22px';
    vor.innerHTML='<div class="sec-title">Vorschau nächste Tage</div>';
    for(let i=1;i<=4;i++){
      if(this.tagOffset+i>maxOffset) break;
      const d=D.add(datum,i), t=Engine.tagesPlan(d);
      const b=el('button','lrow');
      b.innerHTML=`<span class="dot ${t.freigegeben?'ok':(t.ueberlastet?'warn':'')}"></span>
        <span class="lmain"><b>${esc(D.nice(d))}</b><span>${t.auftraege.length} Aufträge · ${t.standorte} Standorte
        ${t.freigegeben?' · freigegeben':''}${t.ueberlastet?' · über Kapazität':''}</span></span><span class="arw">›</span>`;
      b.onclick=()=>{this.tagOffset=clamp(this.tagOffset+i,0,maxOffset); this.render();};
      vor.appendChild(b);
    }
    p.appendChild(vor);
  },
  meldungenGelesen(){ (Store.db.meldungen||[]).forEach(m=>m.gelesen=true); Store.mark(); this.render(); },
  tagWechsel(dir){
    const max=(Store.db.einstellungen.planungsHorizont||10)-1;
    const neu=clamp(this.tagOffset+dir,0,max);
    if(neu===this.tagOffset) return;                       // kein toter Klick mehr
    const s=this._stack; if(s) s.classList.add(dir>0?'left':'right');
    setTimeout(()=>{ this.tagOffset=neu; this.render();
      const n=this._stack; if(n){ n.classList.add(dir>0?'right':'left');
        requestAnimationFrame(()=>requestAnimationFrame(()=>n.classList.remove('left','right'))); } }, 150);
  },

  auftragCard(a,datum){
    const f=Store.feld(a.feldId), st=Store.standort(a.standortId), k=a.kulturId?Store.kultur(a.kulturId):null;
    const eff=Engine.effektivMm(a);
    const gang=Engine.gangFuer(a.schiffIds, eff);
    const dauer=Engine.effektivDauer(a);
    const spr=W.wert(gang.sprenkler);
    const hatAnpassung = a.angepasstMm!=null && a.angepasstMm!==a.zielMm;
    const row=el('div','auftrag');
    const bd=el('div','abody prio-'+a.prioritaet);
    const schiffText = a.nummern.length ? 'Schiffe '+esc(a.nummern.join(', ')) : 'ganzes Feld';
    bd.innerHTML=`
      <div class="row" style="gap:8px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <h4>${esc(f?f.name:'?')}</h4>
          <div class="tiny muted">${esc(st?st.name:'?')} · ${schiffText}${
            a.gaenge?` · Gang ${a.gangNr}/${a.gaenge}${a.zeitfenster!=null?' ab '+a.zeitfenster+' Uhr':''}`:''}</div>
        </div>
        ${k?`<span class="kultbadge" style="background:${k.farbe}">${esc(k.name)}</span>`:''}
      </div>
      ${hatAnpassung?`
      <div class="anpassbox">
        <div class="tiny" style="font-weight:650;color:var(--amber);margin-bottom:7px">
          ${a.regenMm} mm Regen — ${esc(a.anpassungText||'Vorschlag')}</div>
        <div class="row" style="gap:10px;align-items:flex-end">
          <div style="flex:1"><label class="tiny dim">Zielmenge</label>
            <input class="inp" type="number" value="${a.zielMm}"
              onchange="Admin.mengeSetzen('${datum}','${a.id}','ziel',this.value)"></div>
          <div style="flex:1"><label class="tiny dim">angepasste Menge</label>
            <input class="inp" type="number" value="${a.angepasstMm}"
              onchange="Admin.mengeSetzen('${datum}','${a.id}','anp',this.value)"></div>
        </div>
        <label class="row" style="gap:8px;margin-top:9px">
          <input type="checkbox" style="width:18px;height:18px" ${a.anpassungAngenommen?'checked':''}
            onchange="Admin.anpassungToggle('${datum}','${a.id}',this.checked)">
          <span class="tiny" style="font-weight:650">Anpassung übernehmen — ${a.angepasstMm===0
            ? 'der Auftrag entfällt dann und erscheint beim Wassermann nicht'
            : 'der Wassermann sieht dann '+a.angepasstMm+' mm statt '+a.zielMm+' mm'}</span></label>
      </div>`:''}
      <div class="abig">
        <div class="kv"><b>${eff===0?'entfällt':eff+' mm'}</b><span>${hatAnpassung&&a.anpassungAngenommen?'angepasst':'Zielmenge'}</span></div>
        <div class="kv" title="${esc(W.text(gang.dauerMin, x=>hhmm(x)))}">
          <b>${dauer?hhmm(dauer):'–'}</b><span>Dauer ${W.zeichen(gang.dauerMin)}</span></div>
        ${spr&&spr.kreis?`<div class="kv" title="${esc(W.HERKUNFT[gang.sprenkler.quelle]||'')}">
          <b>${spr.kreis}${spr.sektor?'+'+spr.sektor:''}</b><span>Sprenkler</span></div>`:''}
        ${gang.zielM3?`<div class="kv"><b>${Math.round(gang.zielM3)} m³</b><span>Wasser</span></div>`:''}
        ${a.ueberfaellig>0?`<div class="kv" title="entspricht dem ${
          (a.dringlichkeit||1).toFixed(1)}-fachen der Regelmenge"><b style="color:var(--rust)">+${
          a.ueberfaellig} T</b><span>überfällig</span></div>`:''}
        ${a.letzteBew?`<div class="kv"><b>${D.diff(a.letzteBew,datum)} T</b><span>seit letzter Bew.</span></div>`:''}
      </div>
      <div class="ameta">
        ${a.prioritaet!=='normal'?`<span class="chip ${a.prioritaet==='hoch'?'r':''}">Priorität ${esc(a.prioritaet)}</span>`:''}
        ${W.stufe(gang.dauerMin)==='keine'?'<span class="chip r">Dauer nicht berechenbar — Fläche fehlt</span>':''}
        ${['schwach','mittel'].includes(W.stufe(gang.dauerMin))
          ?`<span class="chip a" title="${esc(W.text(gang.dauerMin, x=>hhmm(x)))}">Dauer ${
            W.stufe(gang.dauerMin)==='schwach'?'unsicher':'mittel sicher'}</span>`:''}
        ${a.ueberdacht && a.regenStandortMm>0
          ?`<span class="chip b" title="Am Standort sind ${a.regenStandortMm} mm gefallen, aber diese Fläche ist als überdacht erfasst. Der Regen wird nicht verrechnet und es gibt keinen Kürzungsvorschlag.">überdacht — ${
            a.regenStandortMm} mm Regen zählen nicht</span>`:''}
        ${a.rueckstand?`<span class="chip a" title="Der Rückstand beträgt das ${
          (a.dringlichkeit||1).toFixed(1)}-fache der Regelmenge. Ab dem ${
          Engine.RUECKSTAND_AB}-fachen ist erfahrungsgemäss nicht der Wasserbedarf die Ursache: In der Historie wurden Schiffe mit so grossem Rückstand nur in 16 % der Fälle bewässert, solche im Takt in 52 %."
          onclick="Admin.klaerfall('${datum}','${a.id}')" style="cursor:pointer">Klärfall — klären ›</span>`:''}
        ${a.geschaetzt?'<span class="chip a">Fälligkeit geschätzt — keine Historie</span>':''}
        ${a.quelle==='manuell'?'<span class="chip b">manuell</span>':''}
        ${a.verschoben?'<span class="chip">verschoben</span>':''}
        ${a.bearbeitet?'<span class="chip">angepasst</span>':''}
        ${a.notiz?`<span class="chip">Notiz</span>`:''}
        ${eff===0?'<span class="chip a">entfällt wegen Regen</span>':''}
        ${(a.gruppen||[]).length?`<span class="chip b" title="Aus dem Journal: diese Schiffe liefen bisher gemeinsam">üblich: ${
          esc(a.gruppen.map(g=>g.join('+')).join(' · '))}</span>`:''}
        <span class="sp"></span>
        <button class="btn sm ghost" onclick="Admin.auftragBearbeiten('${datum}','${a.id}')">Anpassen</button>
      </div>`;
    const l=el('button','mv','‹'); l.title='Auf den Vortag schieben';
    l.onclick=()=>this.schiebe(datum,a.id,-1);
    const r=el('button','mv','›'); r.title='Auf den Folgetag schieben';
    r.onclick=()=>this.schiebe(datum,a.id,1);
    row.appendChild(l); row.appendChild(bd); row.appendChild(r);
    return row;
  },
  schiebe(datum,id,richtung){
    const res=Engine.verschiebe(datum,id,richtung);
    if(!res.ok){ toast(res.grund); return; }
    this.render(); toast('Auf '+D.nice(res.ziel)+' geschoben');
  },

  /* Ein Auftrag im Plan – über alle Tage, weil Verschieben den Tag ändern kann */
  findeAuftrag(datum,id){
    const tp=Engine.tagesPlan(datum);
    return tp.auftraege.find(x=>x.id===id)||null;
  },
  /* Änderung festhalten, damit sie die nächste Neuberechnung überlebt */
  eingriffSpeichern(a, daten){
    if(a.quelle==='manuell'){
      const liste=Store.db.zusatz[a.datum]||[];
      const w=liste.find(x=>x.id===a.id);
      if(w) Object.assign(w, daten);
    } else {
      /* unter dem Tag ablegen, an dem der Auftrag steht – dort liest overlay() */
      Engine.setzeEingriff(a.datum, a.key, daten);
    }
    if(Engine.tagesPlan(a.datum).freigegeben) Engine.tagesPlan(a.datum).geaendertNachFreigabe=true;
    Store.changed('plan'); Engine.planNeu();
  },
  mengeSetzen(datum,id,welche,wert){
    const a=this.findeAuftrag(datum,id); if(!a) return;
    const v=num(wert); if(v==null) return;
    this.eingriffSpeichern(a, welche==='ziel' ? {zielMm:v} : {angepasstMm:v});
    this.render();
  },
  anpassungToggle(datum,id,on){
    const a=this.findeAuftrag(datum,id); if(!a) return;
    this.eingriffSpeichern(a, {anpassungAngenommen:!!on});
    this.render();
    toast(on?'Angepasste Menge gilt':'Ursprüngliche Zielmenge gilt');
  },
  auftragBearbeiten(datum,id){
    const a=this.findeAuftrag(datum,id); if(!a) return;
    const tp=Engine.tagesPlan(datum);
    openModal('Auftrag anpassen',
      `${tp.freigegeben?`<div class="warnbox tiny"><b>Dieser Tag ist bereits freigegeben.</b>
         Der Wassermann sieht die Änderung erst, wenn er die Liste neu öffnet.</div>`:''}
       <div class="grid2">
         <div class="field"><label>Zielmenge (mm)</label>
           <input class="inp" id="abMm" type="number" value="${a.zielMm}"></div>
         <div class="field"><label>Angepasste Menge (mm, optional)</label>
           <input class="inp" id="abAnp" type="number" value="${a.angepasstMm??''}" placeholder="leer = keine"></div>
       </div>
       <label class="row" style="gap:9px;margin-bottom:12px">
         <input type="checkbox" id="abAnn" ${a.anpassungAngenommen?'checked':''} style="width:18px;height:18px">
         <span>Angepasste Menge verwenden</span></label>
       <div class="field"><label>Priorität</label>
         <select class="inp" id="abPrio">${['hoch','normal','niedrig'].map(x=>
           `<option value="${x}" ${a.prioritaet===x?'selected':''}>${x}</option>`).join('')}</select></div>
       <div class="field"><label>Notiz für den Wassermann</label>
         <input class="inp" id="abNotiz" value="${esc(a.notiz||'')}" placeholder="z.B. nur halbe Menge, Ernte morgen"></div>
       <div class="tiny dim">Anpassungen bleiben erhalten, auch wenn der Plan neu gerechnet wird.</div>`,
      `<button class="btn danger" onclick="Admin.auftragLoeschen('${datum}','${id}')">Entfernen</button>
       <div class="sp"></div><button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.auftragSpeichern('${datum}','${id}')">Übernehmen</button>`);
  },
  auftragSpeichern(datum,id){
    const a=this.findeAuftrag(datum,id); if(!a) return;
    const mm=num($('#abMm').value);
    const anp=num($('#abAnp').value);
    const daten={ prioritaet:$('#abPrio').value, notiz:$('#abNotiz').value.trim()||null,
                  angepasstMm:anp, anpassungAngenommen:$('#abAnn').checked && anp!=null };
    if(mm!=null) daten.zielMm=mm;
    closeModal(); this.eingriffSpeichern(a, daten); this.render(); toast('Auftrag angepasst');
  },
  auftragLoeschen(datum,id){
    const a=this.findeAuftrag(datum,id); if(!a) return;
    closeModal();
    if(a.quelle==='manuell'){
      Store.db.zusatz[a.datum]=(Store.db.zusatz[a.datum]||[]).filter(x=>x.id!==id);
      Store.mark();
    } else {
      Engine.setzeEingriff(a.datum, a.key, {entfernt:true});
    }
    Engine.planNeu(); this.render();
    toast('Auftrag entfernt — er kommt beim Neurechnen nicht zurück');
  },
  neuerAuftrag(datum){
    const felder=Store.db.felder.filter(f=>f.bewaessert!==false && f.schiffe.length);
    if(!felder.length){ toast('Keine bewässerten Felder vorhanden'); return; }
    openModal('Auftrag hinzufügen',
      `<div class="field"><label>Feld</label><select class="inp" id="naFeld" onchange="Admin._naSchiffe()">
        ${felder.map(f=>`<option value="${esc(f.id)}">${esc(Store.standort(f.standortId).name)} · ${esc(f.name)}</option>`).join('')}
       </select></div>
       <div class="field"><label>Schiffe <span class="tiny dim">(keins gewählt = alle)</span></label>
         <div id="naSchiffe" class="bigpick"></div></div>
       <div class="grid2">
        <div class="field"><label>Zielmenge (mm)</label><input class="inp" id="naMm" type="number" value="15"></div>
        <div class="field"><label>Priorität</label><select class="inp" id="naPrio">
          <option value="normal">normal</option><option value="hoch">hoch</option>
          <option value="niedrig">niedrig</option></select></div></div>`,
      `<button class="btn" onclick="closeModal()">Abbrechen</button>
       <button class="btn pri" onclick="Admin.neuerAuftragSpeichern('${datum}')">Hinzufügen</button>`);
    this._naSchiffe();
  },
  _naSchiffe(){
    const f=Store.feld($('#naFeld').value); const c=$('#naSchiffe'); c.innerHTML='';
    if(!f) return;
    f.schiffe.forEach(s=>{ const b=el('button',null,esc(s.implizit?'Ganzes Feld':s.nummer)); b.dataset.id=s.id;
      b.onclick=()=>b.classList.toggle('on'); c.appendChild(b); });
  },
  neuerAuftragSpeichern(datum){
    const f=Store.feld($('#naFeld').value); if(!f) return;
    const sel=[...document.querySelectorAll('#naSchiffe button.on')].map(b=>b.dataset.id);
    const ids=sel.length?sel:f.schiffe.map(s=>s.id);
    const mm=num($('#naMm').value)||15;
    const gewaehlt=f.schiffe.filter(s=>ids.includes(s.id));
    /* Kultur aus den tatsächlich gewählten Schiffen ableiten, nicht aus dem ganzen Feld */
    const kulturId=(gewaehlt.flatMap(s=>s.sektoren||[]).find(k=>k.kulturId)||{}).kulturId||null;
    const a={ id:'a-man-'+uid(), key:'man-'+uid(), datum, ursprung:datum,
      standortId:f.standortId, feldId:f.id, kulturId,
      schiffIds:ids, sektorIds:gewaehlt.flatMap(s=>(s.sektoren||[]).map(k=>k.id)),
      nummern:gewaehlt.map(s=>s.nummer).filter(n=>n!==''),
      zielMm:mm, regenMm:0, angepasstMm:null, anpassungAngenommen:false, anpassungManuell:false,
      dauerMin:Engine.dauerFuer(ids,mm).min, dauerQuelle:'manuell',
      prioritaet:$('#naPrio').value, ueberfaellig:0, erledigt:false, quelle:'manuell', notiz:null };
    (Store.db.zusatz[datum]=Store.db.zusatz[datum]||[]).push(a);
    closeModal(); Engine.planNeu(); this.render(); toast('Auftrag hinzugefügt');
  },
  freigabePruefen(datum){
    const tp=Engine.tagesPlan(datum);
    const ohneRohr=tp.auftraege.filter(a=>{
      const f=Store.feld(a.feldId);
      return f && !Store.feldRohre(f).length;
    });
    if(!tp.ueberlastet && !ohneRohr.length){ this.freigabe(datum,true); return; }
    openModal('Wirklich freigeben?',
      `${tp.ueberlastet?`<div class="warnbox"><b>Der Tag liegt über der Kapazität.</b><br>
        ${tp.standorte} Standorte und ${tp.auftraege.length} Aufträge — üblich sind ${tp.kapazitaet} Standorte.
        Bist du sicher, dass der Wassermann das schafft?</div>`:''}
       ${ohneRohr.length?`<div class="infobox"><b>${ohneRohr.length} Auftrag${ohneRohr.length===1?'':'e'} auf Feldern ohne eingezeichnetes Rohr:</b>
         ${esc([...new Set(ohneRohr.map(a=>Store.feld(a.feldId).name))].join(', '))}.
         Das ist nur ein Hinweis — bewässern lässt sich trotzdem.</div>`:''}`,
      `<button class="btn" onclick="closeModal()">Nochmals anschauen</button>
       <button class="btn warn" onclick="closeModal();Admin.freigabe('${datum}',true)">Trotzdem freigeben</button>`);
  },
  freigabe(datum,on){
    const tp=Engine.tagesPlan(datum);
    if(tp.nurLesen){ toast('Dieser Tag liegt ausserhalb des Planungshorizonts'); return; }
    tp.freigegeben=on;
    tp.freigegebenAm=on?new Date().toISOString():null;
    tp.geaendertNachFreigabe=false;
    Store.mark(); this.render();
    toast(on?'Für den Wassermann freigegeben':'Freigabe zurückgenommen');
  }
};
