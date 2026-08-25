/* ============================================================
   WASSERMANN — mobile Oberfläche
   ============================================================ */
const WM = {
  view:'liste', tagOffset:0, auftrag:null, entwurf:null,

  open(){
    if(!localStorageless.lang){ this.sprachwahl(); return; }
    LANG=localStorageless.lang; this.view='liste'; this.render();
  },
  sprachwahl(){
    $('#wmPage').innerHTML='';
    $('#wmSticky').innerHTML='';
    const c=el('div'); c.style.cssText='padding:22px 4px';
    c.innerHTML=`<h2 style="margin-bottom:6px">Sprache · Nyelv · Język</h2>
      <p class="muted tiny" style="margin-top:0">Standort- und Schiff-Namen bleiben immer auf Deutsch.</p>
      <div class="langpick" style="margin-top:18px">
        <button data-l="de">Deutsch</button><button data-l="hu">Magyar</button><button data-l="pl">Polski</button></div>`;
    $('#wmPage').appendChild(c);
    c.querySelectorAll('.langpick button').forEach(b=>b.onclick=()=>{
      localStorageless.lang=b.dataset.l; LANG=b.dataset.l; this.view='liste'; this.render(); });
  },

  menu(){
    openModal('Menü',
      `<button class="btn big" style="margin-bottom:9px" onclick="WM.rechner()">🧮 ${esc(T('rechner'))}</button>
       <button class="btn big" style="margin-bottom:9px" onclick="WM.freierEintrag()">✏️ ${esc(T('neuerEintrag'))}</button>
       <button class="btn big" style="margin-bottom:9px" onclick="WM.historie()">📋 ${esc(T('historie'))}</button>
       <button class="btn big" style="margin-bottom:9px" onclick="WM.sprachwahl();closeModal()">🌐 ${esc(T('sprache'))}</button>
       <hr class="sep">
       <button class="btn ghost tiny" style="width:100%;color:var(--ink-3)" onclick="WM.schaffNicht()">
         ${esc(T('schaffNicht'))}</button>`);
  },
  schaffNicht(){
    const e=Store.db.einstellungen;
    openModal(T('schaffNicht'),
      `<div class="field"><label>Kurz warum? (optional)</label>
        <input class="inp" id="snText" placeholder="…"></div>`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn warn" onclick="WM.schaffNichtSenden()">Melden</button>`);
  },
  schaffNichtSenden(){
    const e=Store.db.einstellungen;
    const txt=$('#snText').value.trim();
    (Store.db.meldungen=Store.db.meldungen||[]).push({datum:D.today(), zeit:nowHM(), text:txt});
    Store.mark(); closeModal();
    openModal('Meldung erfasst',
      `<div class="infobox" style="margin:0"><b>Offline-Testversion:</b> Es wird noch keine E-Mail verschickt.<br><br>
        In der Online-Version ginge jetzt eine Nachricht an <b>${esc(e.adminMail||'den Produktionsleiter')}</b>:<br>
        <span class="tiny" style="display:block;margin-top:7px;padding:9px;background:#fff;border-radius:8px">
        „Der Wassermann meldet, dass er den heutigen Plan nicht schafft.${txt?' Grund: '+esc(txt):''}"</span></div>
       <div class="tiny dim" style="margin-top:11px">${esc(T('keinPlanSub', e.ansprechperson))}
        ${e.ansprechTelefon?' '+esc(e.ansprechTelefon):''}</div>`,
      `<button class="btn pri" onclick="closeModal()">OK</button>`);
  },

  /* ---------- Tagesliste ---------- */
  render(){
    const p=$('#wmPage'); p.innerHTML=''; $('#wmSticky').innerHTML='';
    if(this.view==='detail') return this.renderDetail(p);
    const datum=D.add(D.today(),this.tagOffset);
    const tp=Store.db.plan[datum];
    $('#wmTitle').textContent = this.tagOffset===0?T('heute'):(this.tagOffset===1?T('morgen'):D.nice(datum));
    $('#wmSub').textContent = D.nice(datum);

    const laufend=(Store.db.laufend||[]).filter(x=>!x.stopZeit);
    if(laufend.length){
      laufend.forEach(l=>{
        const st=Store.standort(l.standortId);
        const b=el('button','runbanner'); b.style.width='100%';
        b.innerHTML=`<span class="pulse"></span><span style="flex:1;text-align:left">
          <b>${esc(st.name)}</b> · ${T('schiffe')} ${esc(l.nummern.join(', '))}<br>
          <span class="tiny">${T('laeuft')} seit ${esc(l.startZeit)}</span></span>
          <span class="btn sm pri">${esc(T('stoppen'))}</span>`;
        b.onclick=()=>this.stoppDialog(l.id);
        p.appendChild(b);
      });
    }

    // Tagesnavigation
    const nav=el('div','row'); nav.style.marginBottom='13px';
    nav.innerHTML=`<button class="dnav" style="width:38px;height:38px;border-radius:10px;border:1px solid var(--line-2);background:#fff" onclick="WM.tag(-1)">‹</button>
      <div style="flex:1;text-align:center"><b>${esc(D.rel(datum))}</b>
        <div class="tiny dim">${esc(D.nice(datum))}</div></div>
      <button class="dnav" style="width:38px;height:38px;border-radius:10px;border:1px solid var(--line-2);background:#fff" onclick="WM.tag(1)">›</button>`;
    p.appendChild(nav);

    if(!tp || !tp.freigegeben){
      const e=Store.db.einstellungen;
      const box=el('div','card'); box.style.cssText='padding:26px 20px;text-align:center';
      box.innerHTML=`<div style="font-size:34px">📭</div>
        <h3 style="margin:10px 0 5px">${esc(T('keinPlan'))}</h3>
        <p class="muted" style="margin:0">${esc(T('keinPlanSub', e.ansprechperson))}</p>
        ${e.ansprechTelefon?`<a class="btn pri" style="margin-top:14px;display:inline-flex" href="tel:${esc(e.ansprechTelefon)}">📞 ${esc(e.ansprechTelefon)}</a>`:''}`;
      p.appendChild(box);
      return;
    }

    const auf=tp.auftraege.filter(a=>Engine.effektivMm(a)>0);
    const fertig=auf.filter(a=>a.erledigt).length;
    if(auf.length){
      const fort=el('div','row tiny dim'); fort.style.marginBottom='10px';
      fort.innerHTML=`<span>${fertig} / ${auf.length} ${esc(T('erledigt'))}</span>
        <span class="sp"></span><span>${auf.length} ${esc(T('auftraege'))}</span>`;
      p.appendChild(fort);
    } else {
      const e2=Store.db.einstellungen;
      const box=el('div','card'); box.style.cssText='padding:24px 20px;text-align:center';
      box.innerHTML=`<div style="font-size:32px">✅</div>
        <h3 style="margin:10px 0 5px">${esc(T('keineAuftraege'))}</h3>
        <p class="muted tiny" style="margin:0">${esc(T('keinPlanSub', e2.ansprechperson))}</p>
        ${e2.ansprechTelefon?`<a class="btn pri" style="margin-top:13px;display:inline-flex" href="tel:${esc(e2.ansprechTelefon)}">📞 ${esc(e2.ansprechTelefon)}</a>`:''}`;
      p.appendChild(box);
    }

    auf.forEach(a=>p.appendChild(this.jobCard(a)));

    const st=el('div','stickybar');
    st.innerHTML=`<button class="btn pri" onclick="WM.freierEintrag()">+ ${esc(T('neuerEintrag'))}</button>`;
    $('#wmSticky').appendChild(st);
  },
  tag(d){ this.tagOffset=clamp(this.tagOffset+d,0,10); this.render(); },

  jobCard(a){
    const st=Store.standort(a.standortId), f=Store.feld(a.feldId), k=a.kulturId?Store.kultur(a.kulturId):null;
    const stufe=Store.db.einstellungen.erfahrungsstufe;
    const laufend=(Store.db.laufend||[]).some(l=>l.auftragId===a.id&&!l.stopZeit);
    const b=el('button','jobcard'+(a.erledigt?' done':'')+(laufend?' running':''));
    b.innerHTML=`
      <div class="jt"><b>${esc(f.name)}</b>
        ${a.erledigt?'<span class="chip g">✓ '+esc(T('erledigt'))+'</span>':''}
        ${laufend?'<span class="chip g"><span class="pulse"></span>'+esc(T('laeuft'))+'</span>':''}
        ${a.prioritaet==='hoch'?'<span class="chip r">!</span>':''}</div>
      ${st.name!==f.name?`<div class="tiny dim">${esc(st.name)}</div>`:''}
      <div class="schiffline">${a.nummern.length?esc(T('schiffe')+' '+a.nummern.join(' + ')):esc(f.name)}</div>
      ${k&&stufe==='neu'?`<div class="tiny dim" style="margin-top:3px">${k.icon||''} ${esc(k.name)}</div>`:''}
      <div class="jnums">
        <div class="kv"><b>${Engine.effektivMm(a)} mm</b><span>${esc(T('ziel'))}</span></div>
        <div class="kv"><b>${Engine.effektivDauer(a)?hhmm(Engine.effektivDauer(a)):'?'}</b><span>${esc(T('dauer'))}</span></div>
      </div>
      ${a.notiz?`<div class="warnbox tiny" style="margin:10px 0 0">${esc(a.notiz)}</div>`:''}`;
    b.onclick=()=>{ this.auftrag=a; this.view='detail'; this.render(); };
    return b;
  },

  /* ---------- Auftrag-Detail ---------- */
  renderDetail(p){
    const a=this.auftrag; if(!a){ this.view='liste'; return this.render(); }
    const st=Store.standort(a.standortId), f=Store.feld(a.feldId);
    $('#wmTitle').textContent=st.name;
    $('#wmSub').textContent=(a.nummern.length?T('schiffe')+' '+a.nummern.join(', '):f.name);

    const back=el('button','btn sm ghost','‹ '+T('zurueck'));
    back.onclick=()=>{this.view='liste';this.auftrag=null;this.render();};
    p.appendChild(back);

    const head=el('div','card'); head.style.cssText='padding:16px;margin-top:11px';
    const R=Engine.dauerFuer(a.schiffIds,Engine.effektivMm(a));
    head.innerHTML=`<div class="jnums" style="border:none;padding:0;margin:0">
        <div class="kv"><b>${Engine.effektivMm(a)} mm</b><span>${esc(T('ziel'))}</span></div>
        <div class="kv"><b>${Engine.effektivDauer(a)?hhmm(Engine.effektivDauer(a)):'?'}</b><span>${esc(T('empfDauer'))}</span></div>
      </div>
      ${R.quelle==='global'?`<div class="tiny dim" style="margin-top:9px">${esc(T('keineDaten'))} – Schätzwert.</div>`:''}
      ${a.notiz?`<div class="warnbox tiny" style="margin-top:11px">${esc(a.notiz)}</div>`:''}`;
    p.appendChild(head);

    const lp=el('button','btn big'); lp.style.marginTop='11px';
    lp.textContent='🗺 '+T('lageplan'); lp.onclick=()=>this.lageplan(a);
    p.appendChild(lp);

    const laufend=(Store.db.laufend||[]).find(l=>l.auftragId===a.id&&!l.stopZeit);
    const st2=el('div','stickybar');
    if(laufend){
      st2.innerHTML=`<button class="btn pri" onclick="WM.stoppDialog('${laufend.id}')">${esc(T('stoppen'))}</button>`;
    } else if(a.erledigt){
      st2.innerHTML=`<button class="btn" onclick="WM.startDialog()">Nochmals eintragen</button>`;
    } else {
      st2.innerHTML=`<button class="btn pri" onclick="WM.startDialog()">${esc(T('starten'))}</button>`;
    }
    $('#wmSticky').appendChild(st2);

    // bisherige Einträge zu diesen Schiffen
    const hist=this.historieFuer(a.schiffIds).slice(0,4);
    if(hist.length){
      p.appendChild(el('div','sec-title',T('historie')));
      hist.forEach(h=>{
        const c=el('div','card'); c.style.cssText='padding:11px 13px;margin-bottom:7px';
        c.innerHTML=`<div class="row tiny"><b>${esc(D.niceFull(h.datum))}</b><span class="sp"></span>
          <span class="dim">${esc(h.schiffRoh||'')}</span></div>
          <div class="row tiny dim" style="margin-top:4px;gap:14px">
            <span>${h.dauerMin?hhmm(h.dauerMin):'–'}</span><span>${h.m3??'–'} m³</span>
            <span>${[h.kreisregner?h.kreisregner+' '+T('kreisregner'):'',
              h.sektorregner?h.sektorregner+' '+T('sektorregner'):''].filter(Boolean).join(' · ')}</span></div>`;
        p.appendChild(c);
      });
    }
  },
  historieFuer(schiffIds){
    const info=Store.db._sch[schiffIds[0]]; if(!info) return [];
    const jn=Object.entries(Store.db.einstellungen.journalMap||{}).find(([k,v])=>v===info.feld.id)?.[0];
    if(!jn) return [];
    return Store.db.journal.filter(e=>e.feldJournal===jn).sort((x,y)=>x.datum<y.datum?1:-1);
  },
  lageplan(a){
    const m=openModal(Store.standort(a.standortId).name,
      `<div id="wmPlan"></div><div class="tiny dim" style="margin-top:8px">Ziehen zum Verschieben, + / − zum Zoomen.</div>`,
      `<button class="btn pri" onclick="closeModal()">OK</button>`, true);
    const pv=PlanView({standortId:a.standortId, feldId:a.feldId, modus:'view', height:430,
      selected:a.schiffIds[0]});
    $('#wmPlan',m).appendChild(pv.node);
  },

  /* ---------- Start / Stopp ---------- */
  startDialog(a){
    a=a||this.auftrag;
    const f=Store.feld(a.feldId);
    const letzte=this.historieFuer(a.schiffIds)[0]||{};
    const sel=new Set(a.schiffIds);
    openModal(T('starten'),
      `<div class="field"><label>${esc(T('welcheSchiffe'))}</label>
        <div class="bigpick" id="wmSch">${f.schiffe.map(s=>
          `<button data-id="${s.id}" class="${sel.has(s.id)?'on':''}">${esc(s.nummer)}</button>`).join('')
          || '<span class="tiny dim">Ganzes Feld</span>'}</div></div>
       <div class="field"><label>${esc(T('startzeit'))}</label>
         <input class="inp" id="wmT1" type="time" value="${nowHM()}"></div>
       <div class="field"><label>${esc(T('zaehlerStart'))}</label>
         <input class="inp big" id="wmM1" type="number" inputmode="decimal" placeholder="0"
           value="${letzte.stopM3??''}"></div>
       <div class="grid2">
         <div class="field"><label>${esc(T('kreisregner'))}</label>
           <input class="inp" id="wmK" type="number" inputmode="numeric" value="${letzte.kreisregner??''}"></div>
         <div class="field"><label>${esc(T('sektorregner'))}</label>
           <input class="inp" id="wmS" type="number" inputmode="numeric" value="${letzte.sektorregner??''}"></div>
       </div>
       ${letzte.datum?`<div class="tiny dim">Vorbelegt aus dem letzten Eintrag vom ${esc(D.niceFull(letzte.datum))} – bitte prüfen.</div>`:''}`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn pri" onclick="WM.startSpeichern()">${esc(T('starten'))}</button>`);
    document.querySelectorAll('#wmSch button').forEach(b=>b.onclick=()=>b.classList.toggle('on'));
  },
  startSpeichern(){
    const a=this.auftrag;
    const ids=[...document.querySelectorAll('#wmSch button.on')].map(b=>b.dataset.id);
    const f=Store.feld(a.feldId);
    const use=ids.length?ids:a.schiffIds;
    const t1=$('#wmT1').value, m1=num($('#wmM1').value);
    if(!t1){ toast(T('pflicht')); return; }
    const l={ id:uid('run'), auftragId:a.id, datum:D.today(), standortId:a.standortId, feldId:a.feldId,
      schiffIds:use, nummern:f.schiffe.filter(s=>use.includes(s.id)).map(s=>s.nummer),
      kulturId:a.kulturId, zielMm:Engine.effektivMm(a), startZeit:t1, startM3:m1,
      kreisregner:num($('#wmK').value), sektorregner:num($('#wmS').value) };
    (Store.db.laufend=Store.db.laufend||[]).push(l);
    Store.mark(); closeModal(); this.view='liste'; this.render(); toast(T('laeuft'));
  },
  stoppDialog(id){
    const l=Store.db.laufend.find(x=>x.id===id); if(!l) return;
    openModal(T('stoppen'),
      `<div class="tiny dim" style="margin-bottom:11px">${esc(Store.standort(l.standortId).name)} ·
        ${esc(T('schiffe'))} ${esc(l.nummern.join(', '))} · ${esc(T('startzeit'))} ${esc(l.startZeit)}</div>
       <div class="field"><label>${esc(T('stoppzeit'))}</label>
         <input class="inp" id="wmT2" type="time" value="${nowHM()}"></div>
       <div class="field"><label>${esc(T('zaehlerStop'))}</label>
         <input class="inp big" id="wmM2" type="number" inputmode="decimal"
           placeholder="${l.startM3??''}"></div>
       <div class="field"><label>${esc(T('bemerkung'))}</label>
         <input class="inp" id="wmBem" placeholder="…"></div>
       <div id="wmVor" class="tiny dim"></div>`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn pri" onclick="WM.stoppSpeichern('${id}')">${esc(T('speichern'))}</button>`);
    const upd=()=>{
      const t2=$('#wmT2').value, m2=num($('#wmM2').value);
      let d=hm2min(t2)-hm2min(l.startZeit); let nacht=false;
      if(d!=null&&d<0){ d+=1440; nacht=true; }
      const m3=(m2!=null&&l.startM3!=null)?m2-l.startM3:null;
      let mm=null;
      if(m3!=null&&m3>0){ const fl=Engine.beregneteFlaeche(l.kreisregner,l.sektorregner);
        if(fl) mm=m3*1000/fl; }
      $('#wmVor').innerHTML=[d!=null?`${T('dauer')}: <b>${hhmm(d)}</b>${nacht?' ⚠ '+T('nachtFrage'):''}`:'',
        m3!=null?`${T('wassermenge')}: <b>${m3.toFixed(1)} m³</b>`:'',
        mm!=null?`≈ <b>${mm.toFixed(1)} mm</b>`:''].filter(Boolean).join(' · ');
    };
    ['wmT2','wmM2'].forEach(i=>$('#'+i).addEventListener('input',upd)); upd();
  },
  stoppSpeichern(id){
    const l=Store.db.laufend.find(x=>x.id===id); if(!l) return;
    const t2=$('#wmT2').value, m2=num($('#wmM2').value);
    if(!t2){ toast(T('pflicht')); return; }
    let d=hm2min(t2)-hm2min(l.startZeit); let nacht=false;
    if(d<0){ d+=1440; nacht=true; }
    if(nacht){
      openModal(T('nachtFrage'),
        `<div class="warnbox" style="margin:0">Start ${esc(l.startZeit)} · Stopp ${esc(t2)} —
          das ergibt ${hhmm(d)}. Bitte bestätigen.</div>`,
        `<button class="btn" onclick="closeModal();WM.stoppDialog('${id}')">${esc(T('nachtNein'))}</button>
         <button class="btn pri" onclick="WM._stoppFinal('${id}','${t2}',${m2??'null'},true)">${esc(T('nachtJa'))}</button>`);
      this._bem=$('#wmBem')?$('#wmBem').value:'';
      return;
    }
    this._bem=$('#wmBem').value;
    this._stoppFinal(id,t2,m2,false);
  },
  _stoppFinal(id,t2,m2,nacht){
    const l=Store.db.laufend.find(x=>x.id===id); if(!l) return;
    let d=hm2min(t2)-hm2min(l.startZeit); if(d<0) d+=1440;
    const m3=(m2!=null&&l.startM3!=null)?+(m2-l.startM3).toFixed(2):null;
    const feld=Store.feld(l.feldId);
    const jn=Object.entries(Store.db.einstellungen.journalMap||{}).find(([k,v])=>v===feld.id)?.[0]||feld.name;
    Store.db.journal.push({ id:uid('j'), datum:l.datum, feldJournal:jn,
      schiffRoh:l.nummern.join(', '), schiffe:l.nummern.map(String),
      kultur:l.kulturId?Store.kultur(l.kulturId).name:null,
      startZeit:l.startZeit, stopZeit:t2, ueberNacht:nacht, dauerMin:d,
      startM3:l.startM3, stopM3:m2, m3, kreisregner:l.kreisregner, sektorregner:l.sektorregner,
      bemerkung:this._bem||null, quelle:'app' });
    l.stopZeit=t2;
    Store.db.laufend=Store.db.laufend.filter(x=>x.id!==id);
    // Auftrag als erledigt markieren
    Object.values(Store.db.plan).forEach(tp=>tp.auftraege.forEach(a=>{ if(a.id===l.auftragId) a.erledigt=true; }));
    // Sektoren aktualisieren, damit die Fälligkeit ab jetzt zählt
    l.schiffIds.forEach(sid=>{ const i=Store.db._sch[sid];
      (i?.schiff.sektoren||[]).forEach(k=>k.letzteBewaesserung=l.datum); });
    Engine.clearRef(); Store.mark(); closeModal();
    this.view='liste'; this.auftrag=null; this.render(); toast(T('gespeichert'));
  },

  /* ---------- Zusatzfunktionen ---------- */
  rechner(){
    const felder=Store.db.felder.filter(f=>f.schiffe.length);
    openModal(T('rechner'),
      `<p class="muted tiny" style="margin-top:0">${esc(T('rechnerSub'))}</p>
       <div class="field"><label>Feld</label><select class="inp" id="rcFeld" onchange="WM._rcSchiffe()">
         ${felder.map(f=>`<option value="${f.id}">${esc(Store.standort(f.standortId).name)} · ${esc(f.name)}</option>`).join('')}
       </select></div>
       <div class="field"><label>${esc(T('schiffe'))}</label><div class="bigpick" id="rcSch"></div></div>
       <div class="field"><label>${esc(T('zielMenge'))}</label>
         <input class="inp big" id="rcMm" type="number" value="20" inputmode="decimal"></div>
       <div id="rcOut"></div>`,
      `<button class="btn" onclick="closeModal()">${esc(T('zurueck'))}</button>
       <button class="btn pri" onclick="WM._rcRechne()">${esc(T('berechnen'))}</button>`);
    this._rcSchiffe();
  },
  _rcSchiffe(){
    const f=Store.feld($('#rcFeld').value), c=$('#rcSch'); c.innerHTML='';
    f.schiffe.forEach(s=>{ const b=el('button',null,esc(s.nummer)); b.dataset.id=s.id;
      b.onclick=()=>b.classList.toggle('on'); c.appendChild(b); });
    $('#rcOut').innerHTML='';
  },
  _rcRechne(){
    const ids=[...document.querySelectorAll('#rcSch button.on')].map(b=>b.dataset.id);
    if(!ids.length){ toast(T('pflicht')); return; }
    const mm=num($('#rcMm').value)||20;
    const r=Engine.dauerFuer(ids,mm);
    $('#rcOut').innerHTML = r.min
      ? `<div class="okbox" style="margin:0"><div style="font-size:27px;font-weight:750">${hhmm(r.min)}</div>
         <div class="tiny">für ${mm} mm auf ${ids.length} ${esc(T('schiffe'))}
         ${r.quelle==='global'?' · '+esc(T('keineDaten')):' · aus Erfahrungswerten'}</div></div>`
      : `<div class="warnbox" style="margin:0">${esc(T('keineDaten'))}</div>`;
  },
  freierEintrag(){
    closeModal();
    const felder=Store.db.felder.filter(f=>f.schiffe.length);
    if(!felder.length){ toast('Noch keine Schiffe erfasst'); return; }
    const f=felder[0];
    this.auftrag={ id:'frei-'+uid(), datum:D.today(), standortId:f.standortId, feldId:f.id,
      kulturId:null, schiffIds:[], nummern:[], zielMm:15, dauerMin:null, quelle:'manuell', erledigt:false };
    openModal(T('neuerEintrag'),
      `<div class="field"><label>Feld</label><select class="inp" id="feFeld">
        ${felder.map(x=>`<option value="${x.id}">${esc(Store.standort(x.standortId).name)} · ${esc(x.name)}</option>`).join('')}
      </select></div>`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn pri" onclick="WM._freiWeiter()">${esc(T('starten'))}</button>`);
  },
  _freiWeiter(){
    const f=Store.feld($('#feFeld').value);
    this.auftrag.feldId=f.id; this.auftrag.standortId=f.standortId; this.auftrag.schiffIds=[];
    closeModal(); this.startDialog(this.auftrag);
  },
  historie(){
    const rows=Store.db.journal.slice().sort((a,b)=>a.datum<b.datum?1:-1).slice(0,60);
    openModal(T('historie'),
      `<div class="scrollx" style="max-height:60vh"><table class="tb"><thead><tr>
        <th>Datum</th><th>Feld</th><th>${esc(T('schiffe'))}</th><th>${esc(T('dauer'))}</th><th>m³</th>
        </tr></thead><tbody>${rows.map(e=>`<tr><td style="white-space:nowrap">${esc(D.niceFull(e.datum))}</td><td>${esc(e.feldJournal)}</td>
        <td>${esc(e.schiffRoh||'–')}</td><td>${e.dauerMin?hhmm(e.dauerMin):'–'}</td><td>${e.m3??'–'}</td></tr>`).join('')}
        </tbody></table></div>`,
      `<button class="btn pri" onclick="closeModal()">${esc(T('zurueck'))}</button>`, true);
  }
};
/* kleiner Ersatz für localStorage (in dieser Umgebung nicht verfügbar) */
const localStorageless = { lang:null };

