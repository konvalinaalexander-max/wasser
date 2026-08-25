/* ============================================================
   WASSERMANN — mobile Oberfläche
   Alle sichtbaren Texte laufen über T() (Handbuch-Invariante 9),
   auch Wochentage, Monate und Zeitangaben.
   Feld-, Standort- und Schiffnamen bleiben in jeder Sprache deutsch.
   ============================================================ */
const WM = {
  view:'liste', tagOffset:0, auftrag:null,

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
  maxOffset(){ return (Store.db.einstellungen.planungsHorizont||10)-1; },
  einfach(){ return Store.db.einstellungen.erfahrungsstufe==='erfahren'; },

  menu(){
    openModal(T('menue'),
      `<button class="btn big" style="margin-bottom:9px" onclick="WM.rechner()">🧮 ${esc(T('rechner'))}</button>
       <button class="btn big" style="margin-bottom:9px" onclick="WM.freierEintrag()">✏️ ${esc(T('neuerEintrag'))}</button>
       <button class="btn big" style="margin-bottom:9px" onclick="WM.historie()">📋 ${esc(T('historie'))}</button>
       <button class="btn big" style="margin-bottom:9px" onclick="WM.sprachwahl();closeModal()">🌐 ${esc(T('sprache'))}</button>
       <hr class="sep">
       <button class="btn ghost tiny" style="width:100%;color:var(--ink-3)" onclick="WM.schaffNicht()">
         ${esc(T('schaffNicht'))}</button>`);
  },
  schaffNicht(){
    openModal(T('schaffNicht'),
      `<div class="field"><label>${esc(T('warumKurz'))}</label>
        <input class="inp" id="snText" placeholder="…"></div>`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn warn" onclick="WM.schaffNichtSenden()">${esc(T('melden'))}</button>`);
  },
  schaffNichtSenden(){
    const e=Store.db.einstellungen;
    const txt=$('#snText').value.trim();
    Store.db.meldungen.push({id:uid('m'), datum:D.today(), zeit:nowHM(), text:txt||null, gelesen:false});
    Store.mark(); closeModal();
    openModal(T('meldungErfasst'),
      `<div class="infobox" style="margin:0"><b>${esc(T('keinMailHinweis'))}</b><br><br>
        ${esc(T('mailWuerde', e.adminMail||e.ansprechperson))}<br>
        <span class="tiny" style="display:block;margin-top:7px;padding:9px;background:#fff;border-radius:8px">
        „${esc(T('mailText'))}${txt?esc(T('mailGrund',txt)):''}"</span></div>
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
    laufend.forEach(l=>{
      const st=Store.standort(l.standortId);
      const b=el('button','runbanner'); b.style.width='100%';
      b.innerHTML=`<span class="pulse"></span><span style="flex:1;text-align:left">
        <b>${esc(st?st.name:'?')}</b> · ${esc(T('schiffe'))} ${esc(l.nummern.join(', '))}<br>
        <span class="tiny">${esc(T('laufend'))} — ${esc(T('startzeit'))} ${esc(l.startZeit)}</span></span>
        <span class="btn sm pri">${esc(T('stoppen'))}</span>`;
      b.onclick=()=>this.stoppDialog(l.id);
      p.appendChild(b);
    });

    // Tagesnavigation
    const nav=el('div','row'); nav.style.marginBottom='13px';
    const dn='width:38px;height:38px;border-radius:10px;border:1px solid var(--line-2);background:#fff';
    nav.innerHTML=`<button class="dnav" style="${dn}" ${this.tagOffset<=0?'disabled':''} onclick="WM.tag(-1)">‹</button>
      <div style="flex:1;text-align:center"><b>${esc(D.rel(datum))}</b>
        <div class="tiny dim">${esc(D.nice(datum))}</div></div>
      <button class="dnav" style="${dn}" ${this.tagOffset>=this.maxOffset()?'disabled':''} onclick="WM.tag(1)">›</button>`;
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
  tag(d){ const n=clamp(this.tagOffset+d,0,this.maxOffset());
    if(n===this.tagOffset) return; this.tagOffset=n; this.render(); },

  jobCard(a){
    const st=Store.standort(a.standortId), f=Store.feld(a.feldId), k=a.kulturId?Store.kultur(a.kulturId):null;
    const laufend=(Store.db.laufend||[]).some(l=>l.auftragId===a.id&&!l.stopZeit);
    const dauer=Engine.effektivDauer(a);
    const spr=this.einfach()?null:Engine.sprenklerFuer(a.schiffIds);
    const satz=this.satzFuer(a);
    const b=el('button','jobcard'+(a.erledigt?' done':'')+(laufend?' running':''));
    b.innerHTML=`
      <div class="jt"><b>${esc(f?f.name:'?')}</b>
        ${a.erledigt?'<span class="chip g">✓ '+esc(T('erledigt'))+'</span>':''}
        ${laufend?'<span class="chip g"><span class="pulse"></span>'+esc(T('laeuft'))+'</span>':''}
        ${a.prioritaet==='hoch'?'<span class="chip r">!</span>':''}</div>
      ${st&&f&&st.name!==f.name?`<div class="tiny dim">${esc(st.name)}</div>`:''}
      <div class="schiffline">${a.nummern.length?esc(T('schiffe')+' '+a.nummern.join(' + ')):esc(T('ganzesFeld'))}</div>
      ${k&&!this.einfach()?`<div class="tiny dim" style="margin-top:3px">${k.icon||''} ${esc(k.name)}${
        satz?' · '+esc(T('satz'))+' '+esc(satz):''}</div>`:''}
      ${a.gaenge?`<div class="tiny dim" style="margin-top:3px">${a.gangNr}/${a.gaenge}${
        a.zeitfenster!=null?' · '+esc(T('zeitfenster'))+' '+a.zeitfenster+':00':''}</div>`:''}
      <div class="jnums">
        <div class="kv"><b>${Engine.effektivMm(a)} mm</b><span>${esc(T('ziel'))}</span></div>
        <div class="kv"><b>${dauer?hhmm(dauer):'?'}</b><span>${esc(T('dauer'))}</span></div>
        ${spr&&spr.kreis?`<div class="kv"><b>${spr.kreis}${spr.sektor?'+'+spr.sektor:''}</b><span>${esc(T('sprenkler'))}</span></div>`:''}
      </div>
      ${a.notiz?`<div class="warnbox tiny" style="margin:10px 0 0"><b>${esc(T('notizChef'))}:</b> ${esc(a.notiz)}</div>`:''}`;
    b.onclick=()=>{ this.auftrag=a; this.view='detail'; this.render(); };
    return b;
  },
  satzFuer(a){
    for(const sid of (a.sektorIds||[])){
      const s=Store.sektoren().find(x=>x.sektor.id===sid);
      if(s&&s.sektor.satz) return s.sektor.satz;
    }
    return null;
  },

  /* ---------- Auftrag-Detail ---------- */
  renderDetail(p){
    const a=this.auftrag; if(!a){ this.view='liste'; return this.render(); }
    const st=Store.standort(a.standortId), f=Store.feld(a.feldId);
    $('#wmTitle').textContent=st?st.name:'';
    $('#wmSub').textContent=(a.nummern.length?T('schiffe')+' '+a.nummern.join(', '):(f?f.name:''));

    const back=el('button','btn sm ghost','‹ '+T('zurueck'));
    back.onclick=()=>{this.view='liste';this.auftrag=null;this.render();};
    p.appendChild(back);

    const dauer=Engine.effektivDauer(a);
    const R=Engine.dauerFuer(a.schiffIds,Engine.effektivMm(a));
    const spr=Engine.sprenklerFuer(a.schiffIds);
    const head=el('div','card'); head.style.cssText='padding:16px;margin-top:11px';
    head.innerHTML=`<div class="jnums" style="border:none;padding:0;margin:0">
        <div class="kv"><b>${Engine.effektivMm(a)} mm</b><span>${esc(T('ziel'))}</span></div>
        <div class="kv"><b>${dauer?hhmm(dauer):'?'}</b><span>${esc(T('empfDauer'))}</span></div>
        ${spr.kreis?`<div class="kv"><b>${spr.kreis}${spr.sektor?'+'+spr.sektor:''}</b><span>${esc(T('empfSprenkler'))}</span></div>`:''}
      </div>
      ${a.gaenge?`<div class="tiny dim" style="margin-top:9px">${a.gangNr}/${a.gaenge}${
        a.zeitfenster!=null?' · '+esc(T('zeitfenster'))+' '+a.zeitfenster+':00':''}</div>`:''}
      ${(a.gruppen||[]).length&&!this.einfach()?`<div class="tiny dim" style="margin-top:9px">
        ${esc(T('ueblichZusammen'))}: <b>${esc(a.gruppen.map(g=>g.join(' + ')).join(' · '))}</b></div>`:''}
      ${R.quelle==='global'||R.quelle==='keine'?`<div class="tiny dim" style="margin-top:9px">${esc(T('keineDaten'))} – ${esc(T('schaetzwert'))}.</div>`:''}
      ${a.notiz?`<div class="warnbox tiny" style="margin-top:11px"><b>${esc(T('notizChef'))}:</b> ${esc(a.notiz)}</div>`:''}`;
    p.appendChild(head);

    const lp=el('button','btn big'); lp.style.marginTop='11px';
    lp.textContent='📍 '+T('lageplan'); lp.onclick=()=>this.lageplan(a);
    p.appendChild(lp);

    const laufend=(Store.db.laufend||[]).find(l=>l.auftragId===a.id&&!l.stopZeit);
    const st2=el('div','stickybar');
    if(laufend){
      st2.innerHTML=`<button class="btn pri" onclick="WM.stoppDialog('${laufend.id}')">${esc(T('stoppen'))}</button>`;
    } else if(a.erledigt){
      st2.innerHTML=`<button class="btn" onclick="WM.startDialog()">${esc(T('nochmalsEintragen'))}</button>`;
    } else {
      st2.innerHTML=`<button class="btn pri" onclick="WM.startDialog()">${esc(T('starten'))}</button>`;
    }
    $('#wmSticky').appendChild(st2);

    // bisherige Einträge zu genau diesen Schiffen
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
  /* Einträge für GENAU diese Schiffe (Pflichtenheft §7) – nicht mehr feldweit */
  historieFuer(schiffIds){
    const info=Store.db._sch[(schiffIds||[])[0]]; if(!info) return [];
    const jn=Engine.journalNameFuer(info.feld, false);
    const nummern=new Set((schiffIds||[]).map(id=>String(Store.db._sch[id]?.schiff.nummer)));
    const alle=Store.db.journal.filter(e=>e.feldJournal===jn)
      .sort((x,y)=>x.datum<y.datum?1:(x.datum>y.datum?-1:0));
    const genau=alle.filter(e=>(e.schiffe||[]).some(n=>nummern.has(String(n))));
    return genau.length?genau:alle;      // Feld-Historie nur als Rückfallebene
  },
  /* Zählerstand: die Wasseruhr hängt am STANDORT, nicht am Feld (Pflichtenheft §3) */
  letzterZaehler(standortId){
    const felder=Store.felderVon(standortId).map(f=>Engine.journalNameFuer(f,false));
    let best=null;
    Store.db.journal.forEach(e=>{
      if(e.stopM3==null || !felder.includes(e.feldJournal)) return;
      if(!best || e.datum>best.datum || (e.datum===best.datum && (e.stopZeit||'')>(best.stopZeit||''))) best=e;
    });
    return best;
  },
  lageplan(a){
    const m=openModal(Store.standort(a.standortId).name,
      `<div id="wmPlan"></div><div class="tiny dim" style="margin-top:8px">${esc(T('planBedienung'))}</div>`,
      `<button class="btn pri" onclick="closeModal()">OK</button>`, true);
    const pv=PlanView({standortId:a.standortId, feldId:a.feldId, modus:'view', height:430,
      selectedIds:a.schiffIds});          // alle Schiffe der Gruppe hervorheben, nicht nur das erste
    $('#wmPlan',m).appendChild(pv.node);
    this._planPV=pv;
  },

  /* ---------- Start / Stopp ---------- */
  startDialog(a){
    a=a||this.auftrag; if(!a) return;
    this._start=a;
    const f=Store.feld(a.feldId); if(!f) return;
    const letzteSchiff=this.historieFuer(a.schiffIds)[0]||{};
    const letzteUhr=this.letzterZaehler(a.standortId);
    const spr=Engine.sprenklerFuer(a.schiffIds);
    const sel=new Set(a.schiffIds);
    openModal(T('starten'),
      `<div class="field"><label>${esc(T('welcheSchiffe'))}</label>
        <div class="bigpick" id="wmSch">${f.schiffe.map(s=>
          `<button data-id="${esc(s.id)}" class="${sel.has(s.id)?'on':''}">${esc(s.implizit?T('ganzesFeld'):s.nummer)}</button>`).join('')}</div></div>
       <div class="field"><label>${esc(T('startzeit'))}</label>
         <input class="inp" id="wmT1" type="time" value="${nowHM()}"></div>
       <div class="field"><label>${esc(T('zaehlerStart'))}</label>
         <input class="inp big" id="wmM1" type="number" inputmode="decimal" placeholder="0"
           value="${letzteUhr&&letzteUhr.stopM3!=null?letzteUhr.stopM3:''}"></div>
       <div class="grid2">
         <div class="field"><label>${esc(T('kreisregner'))}</label>
           <input class="inp" id="wmK" type="number" inputmode="numeric"
             value="${letzteSchiff.kreisregner ?? (spr.quelle!=='keine'?spr.kreis??'':'')}"></div>
         <div class="field"><label>${esc(T('sektorregner'))}</label>
           <input class="inp" id="wmS" type="number" inputmode="numeric"
             value="${letzteSchiff.sektorregner ?? (spr.sektor??'')}"></div>
       </div>
       ${letzteUhr?`<div class="tiny dim">${esc(T('vorbelegt', D.niceFull(letzteUhr.datum)))}</div>`:''}`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn pri" onclick="WM.startSpeichern()">${esc(T('starten'))}</button>`);
    document.querySelectorAll('#wmSch button').forEach(b=>b.onclick=()=>b.classList.toggle('on'));
  },
  startSpeichern(){
    const a=this._start||this.auftrag; if(!a) return;
    const ids=[...document.querySelectorAll('#wmSch button.on')].map(b=>b.dataset.id);
    const f=Store.feld(a.feldId);
    const use=ids.length?ids:a.schiffIds;
    if(!use.length){ toast(T('pflicht')); return; }
    const t1=$('#wmT1').value, m1=num($('#wmM1').value);
    if(!t1){ toast(T('pflicht')); return; }
    const gewaehlt=f.schiffe.filter(s=>use.includes(s.id));
    const l={ id:uid('run'), auftragId:a.id, datum:D.today(), standortId:a.standortId, feldId:a.feldId,
      schiffIds:use, nummern:gewaehlt.map(s=>s.nummer).filter(n=>n!==''),
      kulturId:a.kulturId||null, sektorIds:a.sektorIds||null,
      zielMm:Engine.effektivMm(a), startZeit:t1, startM3:m1,
      kreisregner:num($('#wmK').value), sektorregner:num($('#wmS').value) };
    Store.db.laufend.push(l);
    Store.mark(); closeModal(); this.view='liste'; this._start=null; this.render(); toast(T('laeuft'));
  },
  stoppDialog(id){
    const l=Store.db.laufend.find(x=>x.id===id); if(!l) return;
    openModal(T('stoppen'),
      `<div class="tiny dim" style="margin-bottom:11px">${esc(Store.standort(l.standortId)?.name||'')} ·
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
      const roh=hm2min(t2), start=hm2min(l.startZeit);
      let d=(roh!=null&&start!=null)?roh-start:null; let nacht=false;
      if(d!=null&&d<0){ d+=1440; nacht=true; }
      const m3=(m2!=null&&l.startM3!=null)?m2-l.startM3:null;
      let mm=null;
      if(m3!=null&&m3>0){ const fl=Engine.beregneteFlaeche(l.kreisregner,l.sektorregner);
        if(fl) mm=m3*1000/fl; }
      const teile=[d!=null?`${T('dauer')}: <b>${hhmm(d)}</b>${nacht?' ⚠ '+esc(T('nachtFrage')):''}`:'',
        m3!=null?`${T('wassermenge')}: <b>${m3.toFixed(1)} m³</b>`:'',
        mm!=null?`≈ <b>${mm.toFixed(1)} mm</b>`:''].filter(Boolean);
      if(m3!=null&&m3<0) teile.push(`<span style="color:var(--rust)">${esc(T('zaehlerFalsch'))}</span>`);
      $('#wmVor').innerHTML=teile.join(' · ');
    };
    ['wmT2','wmM2'].forEach(i=>$('#'+i).addEventListener('input',upd)); upd();
  },
  stoppSpeichern(id){
    const l=Store.db.laufend.find(x=>x.id===id); if(!l) return;
    const t2=$('#wmT2').value, m2=num($('#wmM2').value);
    if(!t2){ toast(T('pflicht')); return; }
    const roh=hm2min(t2), start=hm2min(l.startZeit);
    if(roh==null||start==null){ toast(T('pflicht')); return; }
    this._bem=$('#wmBem')?$('#wmBem').value:'';
    /* Zählerstand rückwärts – der Eintrag wäre sonst still unbrauchbar (Befund F5) */
    if(m2!=null && l.startM3!=null && m2<l.startM3){
      openModal(T('bitteBestaetigen'),
        `<div class="warnbox" style="margin:0">${esc(T('zaehlerFalsch'))}<br>
          ${esc(T('zaehlerStart'))}: <b>${l.startM3}</b> · ${esc(T('zaehlerStop'))}: <b>${m2}</b></div>`,
        `<button class="btn pri" onclick="closeModal();WM.stoppDialog('${id}')">${esc(T('nachtNein'))}</button>`);
      return;
    }
    let d=roh-start; let nacht=false;
    if(d<0){ d+=1440; nacht=true; }
    if(nacht){
      openModal(T('nachtFrage'),
        `<div class="warnbox" style="margin:0">${esc(T('startzeit'))} ${esc(l.startZeit)} ·
          ${esc(T('stoppzeit'))} ${esc(t2)} — ${esc(T('ergibtDauer', hhmm(d)))}</div>`,
        `<button class="btn" onclick="closeModal();WM.stoppDialog('${id}')">${esc(T('nachtNein'))}</button>
         <button class="btn pri" onclick="WM._stoppFinal('${id}','${t2}',${m2??'null'},true)">${esc(T('nachtJa'))}</button>`);
      return;
    }
    this._stoppFinal(id,t2,m2,false);
  },
  _stoppFinal(id,t2,m2,nacht){
    const l=Store.db.laufend.find(x=>x.id===id); if(!l) return;
    const roh=hm2min(t2), start=hm2min(l.startZeit);
    let d=(roh!=null&&start!=null)?roh-start:null; if(d!=null&&d<0) d+=1440;
    const m3=(m2!=null&&l.startM3!=null)?+(m2-l.startM3).toFixed(2):null;
    const feld=Store.feld(l.feldId);
    /* Journalnamen notfalls anlegen, damit der eigene Eintrag wiedergefunden wird (Befund C4) */
    const jn=Engine.journalNameFuer(feld, true);
    Store.db.journal.push({ id:uid('j'), datum:l.datum, feldJournal:jn,
      schiffRoh:l.nummern.join(', '), schiffe:l.nummern.map(String),
      kultur:l.kulturId?Store.kultur(l.kulturId)?.name||null:null,
      startZeit:l.startZeit, stopZeit:t2, ueberNacht:!!nacht, dauerMin:d,
      startM3:l.startM3, stopM3:m2, m3, kreisregner:l.kreisregner, sektorregner:l.sektorregner,
      bemerkung:this._bem||null, quelle:'app' });
    Store.db.laufend=Store.db.laufend.filter(x=>x.id!==id);
    // Auftrag als erledigt markieren
    Object.values(Store.db.plan).forEach(tp=>tp.auftraege.forEach(a=>{ if(a.id===l.auftragId) a.erledigt=true; }));
    /* Nur die tatsächlich bewässerten Sektoren markieren. Ein Schiff kann mehrere
       Kulturen tragen – vorher galten alle als bewässert (Befund B9). */
    const gemeint = l.sektorIds && l.sektorIds.length ? new Set(l.sektorIds) : null;
    l.schiffIds.forEach(sid=>{ const i=Store.db._sch[sid];
      (i?.schiff.sektoren||[]).forEach(k=>{
        const trifft = gemeint ? gemeint.has(k.id)
                     : (l.kulturId ? k.kulturId===l.kulturId : true);
        if(trifft) k.letzteBewaesserung=l.datum;
      }); });
    this._bem='';
    closeModal();
    Store.changed('journal');            // Referenzwerte UND Plan neu (Befund E2)
    this.view='liste'; this.auftrag=null; this.render(); toast(T('gespeichert'));
  },

  /* ---------- Zusatzfunktionen ---------- */
  rechner(){
    const felder=Store.db.felder.filter(f=>f.schiffe.length);
    if(!felder.length){ toast(T('keineSchiffe')); return; }
    openModal(T('rechner'),
      `<p class="muted tiny" style="margin-top:0">${esc(T('rechnerSub'))}</p>
       <div class="field"><label>Feld</label><select class="inp" id="rcFeld" onchange="WM._rcSchiffe()">
         ${felder.map(f=>`<option value="${esc(f.id)}">${esc(Store.standort(f.standortId).name)} · ${esc(f.name)}</option>`).join('')}
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
    if(!f) return;
    f.schiffe.forEach(s=>{ const b=el('button',null,esc(s.implizit?T('ganzesFeld'):s.nummer)); b.dataset.id=s.id;
      b.onclick=()=>b.classList.toggle('on'); c.appendChild(b); });
    $('#rcOut').innerHTML='';
  },
  _rcRechne(){
    const ids=[...document.querySelectorAll('#rcSch button.on')].map(b=>b.dataset.id);
    if(!ids.length){ toast(T('pflicht')); return; }
    const mm=num($('#rcMm').value)||20;
    const r=Engine.dauerFuer(ids,mm);
    const spr=Engine.sprenklerFuer(ids);
    $('#rcOut').innerHTML = r.min
      ? `<div class="okbox" style="margin:0"><div style="font-size:27px;font-weight:750">${hhmm(r.min)}</div>
         <div class="tiny">${esc(T('fuerMengeAuf', mm, ids.length))}
         ${r.quelle==='global'||r.quelle==='keine'?' · '+esc(T('keineDaten')):' · '+esc(T('ausErfahrung'))}</div>
         ${spr.kreis?`<div class="tiny" style="margin-top:5px">${esc(T('empfSprenkler'))}: <b>${spr.kreis}${spr.sektor?'+'+spr.sektor:''}</b></div>`:''}</div>`
      : `<div class="warnbox" style="margin:0">${esc(T('keineDaten'))}</div>`;
  },
  freierEintrag(){
    closeModal();
    const felder=Store.db.felder.filter(f=>f.schiffe.length);
    if(!felder.length){ toast(T('keineSchiffe')); return; }
    openModal(T('neuerEintrag'),
      `<div class="field"><label>Feld</label><select class="inp" id="feFeld">
        ${felder.map(x=>`<option value="${esc(x.id)}">${esc(Store.standort(x.standortId).name)} · ${esc(x.name)}</option>`).join('')}
      </select></div>`,
      `<button class="btn" onclick="closeModal()">${esc(T('abbrechen'))}</button>
       <button class="btn pri" onclick="WM._freiWeiter()">${esc(T('starten'))}</button>`);
  },
  _freiWeiter(){
    const f=Store.feld($('#feFeld').value); if(!f) return;
    const a={ id:'frei-'+uid(), datum:D.today(), standortId:f.standortId, feldId:f.id,
      kulturId:null, sektorIds:null, schiffIds:f.schiffe.map(s=>s.id),
      nummern:f.schiffe.map(s=>s.nummer).filter(n=>n!==''),
      zielMm:15, dauerMin:null, quelle:'manuell', erledigt:false };
    closeModal(); this.startDialog(a);
  },
  historie(){
    const rows=Store.db.journal.slice()
      .sort((a,b)=>a.datum<b.datum?1:(a.datum>b.datum?-1:0)).slice(0,60);
    openModal(T('historie'),
      `<div class="scrollx" style="max-height:60vh"><table class="tb"><thead><tr>
        <th>${esc(T('startzeit'))}</th><th>Feld</th><th>${esc(T('schiffe'))}</th><th>${esc(T('dauer'))}</th><th>m³</th>
        </tr></thead><tbody>${rows.map(e=>`<tr><td style="white-space:nowrap">${esc(D.niceFull(e.datum))}</td><td>${esc(e.feldJournal)}</td>
        <td>${esc(e.schiffRoh||'–')}</td><td>${e.dauerMin?hhmm(e.dauerMin):'–'}</td><td>${e.m3??'–'}</td></tr>`).join('')}
        </tbody></table></div>`,
      `<button class="btn pri" onclick="closeModal()">${esc(T('zurueck'))}</button>`, true);
  }
};
/* kleiner Ersatz für localStorage (in dieser Umgebung nicht verfügbar) */
const localStorageless = { lang:null };
