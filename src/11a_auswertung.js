/* ============================================================
   AUSWERTUNG — was die Daten wirklich hergeben

   Grundsatz dieser Ansicht: jede Zahl trägt ihre Fallzahl und, wo es
   eine Streuung gibt, ihre Unsicherheit. Eine Kennzahl aus drei Gängen
   sieht anders aus als eine aus dreihundert, und das muss man ihr
   ansehen können, ohne die Herkunft zu kennen.

   Nichts hier ist eine Prognose. Alles ist Rückschau auf das Journal.
   ============================================================ */

/* ---------------- kleine Statistik ---------------- */
const St = {
  zahlen(a){ return (a||[]).filter(x=>x!=null && isFinite(x)); },
  summe(a){ return St.zahlen(a).reduce((x,y)=>x+y,0); },
  median(a){ const b=St.zahlen(a).sort((x,y)=>x-y); if(!b.length) return null;
    const m=b.length>>1; return b.length%2 ? b[m] : (b[m-1]+b[m])/2; },
  quantil(a,q){ const b=St.zahlen(a).sort((x,y)=>x-y); if(!b.length) return null;
    const i=(b.length-1)*q, lo=Math.floor(i), hi=Math.ceil(i);
    return lo===hi ? b[lo] : b[lo]+(b[hi]-b[lo])*(i-lo); },
  /* Median der absoluten Abweichung vom Median — robust gegen Ausreisser,
     anders als die Standardabweichung, die ein einziger Fehleintrag kippt. */
  mad(a){ const b=St.zahlen(a); if(!b.length) return null;
    const m=St.median(b); return St.median(b.map(x=>Math.abs(x-m))); },
  /* Unsicherheit des Medians. Normalapproximation: SE ≈ 1,2533·σ̂/√n mit
     σ̂ = 1,4826·MAD. Unter n=5 wird sie nicht ausgewiesen — dort wäre jede
     Zahl dahinter Zierrat. */
  medianSE(a){ const b=St.zahlen(a); if(b.length<5) return null;
    /* MAD 0 heisst bei genug Fällen „keine messbare Streuung" — das ist eine
       Aussage, kein fehlender Wert. Sonst stünde bei 114 gleichen Abständen
       ein „±?", als wüsste man nichts. */
    return 1.2533*(1.4826*(St.mad(b)||0))/Math.sqrt(b.length); },
  /* Anteil mit Wald-Intervall; für den Anteil-Balken der Datenqualität. */
  anteilSE(k,n){ if(!n) return null; const p=k/n; return Math.sqrt(p*(1-p)/n); }
};

const Auswert = {
  zeitraum:'saison',
  ZEITRAEUME:[['saison','Diese Saison'],['tage30','Letzte 30 Tage'],['alles','Ganzes Journal']],
  _cache:null,

  /* ---------------- Zeitraum ---------------- */
  spanne(){
    const ds=Store.db.journal.map(e=>e.datum).filter(Boolean).sort();
    const erster=ds[0]||D.today(), letzter=ds[ds.length-1]||D.today();
    /* Ende ist heute, nie ein Datum aus der Zukunft eines Eintrags. */
    const bis = D.today()>letzter ? D.today() : letzter;
    if(this.zeitraum==='alles')  return {von:erster, bis, label:'ganzes Journal'};
    if(this.zeitraum==='tage30') return {von:D.add(bis,-29), bis, label:'letzte 30 Tage'};
    return {von:bis.slice(0,4)+'-01-01', bis, label:'Saison '+bis.slice(0,4)};
  },

  /* ---------------- Datenschicht ----------------
     Ein einziger Durchgang durch das Journal, danach rechnen alle Abschnitte
     auf demselben angereicherten Satz. Sonst driften die Abschnitte
     auseinander, sobald einer eine Bedingung anders formuliert. */
  daten(){
    const sp=this.spanne();
    if(this._cache && this._cache.schluessel===this.zeitraum+'|'+sp.von+'|'+sp.bis
       && this._cache.stand===Store.db.journal.length) return this._cache;

    const kulturNachName={};
    Store.db.kulturen.forEach(k=>kulturNachName[String(k.name).toLowerCase()]=k);

    const E=[];
    Store.db.journal.forEach(e=>{
      if(!e.datum || e.datum<sp.von || e.datum>sp.bis) return;
      const feld=Engine.feldFuerJournal(e.feldJournal);
      const nummern=new Set((e.schiffe||[]).map(String));
      const treffer=feld ? feld.schiffe.filter(s=>nummern.has(String(s.nummer))) : [];
      const m2=treffer.reduce((a,s)=>a+(Store.schiffFlaecheM2(s,feld)||0),0)||null;
      const kult=kulturNachName[String(e.kultur||'').toLowerCase()]||null;
      const regner=(e.kreisregner||0)+(e.sektorregner||0);
      E.push({
        roh:e, datum:e.datum, feld, kultur:kult, kulturRoh:e.kultur||'',
        schiffe:treffer, schiffIds:treffer.map(s=>s.id), flaecheM2:m2,
        m3:e.m3||null, dauerMin:e.dauerMin||null, regner,
        mm: null,   // unten gesetzt, sobald die Zuordnung geprüft ist
        qJeRegner: (e.m3 && e.dauerMin && e.dauerMin>0 && regner)
                   ? e.m3/(e.dauerMin/60)/regner : null,
        rollomat: Engine.istRollomat(e),
        /* Deckung = beregnete Fläche ÷ Fläche der genannten Schiffe.
           Weit über 1 heisst: für so viele Sprenkler ist die genannte Fläche
           zu klein, es fehlen Schiffe im Eintrag. Die Menge bleibt gültig,
           die mm-Zahl nicht. */
        deckung: (feld && m2) ? (Engine.beregneteFlaeche(e.kreisregner,e.sektorregner)||0)/m2 || null : null,
        standort: feld ? Store.standort(feld.standortId) : null
      });
    });

    /* mm nur dort, wo die Schiffzuordnung die Sprenklerzahl trägt. Sonst
       teilt man eine gemessene Menge durch eine zu kleine Fläche und bekommt
       120 mm in einem Gang — eine Zahl, die es nicht gibt. */
    E.forEach(x=>{
      x.fraglich = x.deckung!=null && x.deckung>Engine.DECKUNG_MAX;
      x.mm = (x.roh.m3 && x.flaecheM2 && !x.fraglich)
             ? U.m3NachMm(x.roh.m3, x.flaecheM2) : null;
    });

    const c={schluessel:this.zeitraum+'|'+sp.von+'|'+sp.bis,
             stand:Store.db.journal.length, spanne:sp, E};
    this._cache=c;
    return c;
  },

  /* Gänge, aus denen sich rechnen lässt: zugeordnet, nicht Rollomat, mit Menge. */
  messbar(E){ return E.filter(x=>x.feld && !x.rollomat && x.m3); },

  /* ---------------- 1 · Überblick ---------------- */
  ueberblick(){
    const {E,spanne}=this.daten();
    const zug=E.filter(x=>x.feld);
    const mitM3=zug.filter(x=>x.m3);
    /* Bewässerte Fläche: jedes Schiff ZÄHLT EINMAL, egal wie oft es
       Wasser bekam. Die Summe über die Einträge wäre eine Mehrfachzählung
       und war in einer früheren Fassung genau das (Befund A3). */
    const schiffe=new Map();
    zug.forEach(x=>x.schiffe.forEach(s=>{
      if(!schiffe.has(s.id)) schiffe.set(s.id, Store.schiffFlaecheM2(s,x.feld)||0); }));
    const m2=[...schiffe.values()].reduce((a,b)=>a+b,0);
    const m3=St.summe(mitM3.map(x=>x.m3));
    /* Regen im Zeitraum: je Tag und Standort das Maximum, dann summiert.
       Mehrere Stationen auf denselben Standort dürfen sich nicht addieren. */
    const proTagStandort={};
    Store.db.regen.forEach(r=>{
      if(r.datum<spanne.von || r.datum>spanne.bis) return;
      const k=(r.standortId||'*')+'|'+r.datum;
      proTagStandort[k]=Math.max(proTagStandort[k]||0, r.mm||0);
    });
    const regenTage={};
    Object.entries(proTagStandort).forEach(([k,v])=>{
      const d=k.split('|')[1]; regenTage[d]=Math.max(regenTage[d]||0, v); });
    const regenMm=St.summe(Object.values(regenTage));

    return {spanne, gaenge:zug.length, gaengeGesamt:E.length,
            ohneZuordnung:E.length-zug.length,
            mitMenge:mitM3.length, m3, aren:U.m2NachAren(m2),
            mmSchnitt: m2 ? U.m3NachMm(m3, m2) : null,
            regenMm, regenM3Aequiv: m2 ? U.mmNachM3(regenMm, m2) : null,
            schiffe:schiffe.size};
  },

  /* ---------------- 2 · Wasser je Kultur ---------------- */
  jeKultur(){
    const {E}=this.daten();
    const g={};
    E.filter(x=>x.feld && !x.rollomat).forEach(x=>{
      const name=x.kultur ? x.kultur.name : (x.kulturRoh||'ohne Angabe');
      const d=g[name]=g[name]||{name, n:0, nMenge:0, m3:0, mm:[], schiffe:new Map(),
                                termine:{}};
      d.n++;
      if(x.m3){ d.nMenge++; d.m3+=x.m3; }
      if(x.mm!=null) d.mm.push(x.mm);
      x.schiffe.forEach(s=>{
        if(!d.schiffe.has(s.id)) d.schiffe.set(s.id, Store.schiffFlaecheM2(s,x.feld)||0);
        (d.termine[s.id]=d.termine[s.id]||new Set()).add(x.datum);
      });
    });
    return Object.values(g).map(d=>{
      const m2=[...d.schiffe.values()].reduce((a,b)=>a+b,0);
      const aren=U.m2NachAren(m2);
      /* Abstände zwischen Gängen — je Schiff, danach über alle Schiffe.
         Über Schiffe hinweg gemischt wären es keine Intervalle mehr. */
      const abst=[];
      Object.values(d.termine).forEach(set=>{
        const t=[...set].sort();
        for(let i=1;i<t.length;i++) abst.push(D.diff(t[i-1],t[i]));
      });
      return {name:d.name, n:d.n, nMenge:d.nMenge, schiffe:d.schiffe.size, aren,
              m3:d.m3, m3JeAre: (aren && d.nMenge) ? d.m3/aren : null,
              mmMedian:St.median(d.mm), mmSE:St.medianSE(d.mm), nMm:d.mm.length,
              abstMedian:St.median(abst), abstSE:St.medianSE(abst), nAbst:abst.length,
              deckung: d.n ? d.nMenge/d.n : 0};
    }).filter(d=>d.n>=3).sort((a,b)=>(b.m3JeAre??-1)-(a.m3JeAre??-1));
  },

  /* ---------------- 3 · Regel gegen Wirklichkeit ----------------
     Bekommt eine Fläche das, was ihre Regel verspricht?

     Gerechnet wird JE SCHIFF, nicht je Feld. mm ist eine intensive Grösse:
     bekommt jedes von vier Schiffen an seinem eigenen Tag 20 mm, dann hat
     jedes Schiff 20 mm in vier Tagen bekommen — nicht das Feld 80 mm.
     Über die Einträge eines Feldes zu summieren, wie es eine frühere Fassung
     tat, vervierfacht das Ist.

     Der Zeitraum ist der, in dem die Kultur auf diesem Schiff im Journal
     auftaucht, plus ein Intervall, damit der letzte Gang seinen Zyklus noch
     abdecken darf. Über den ganzen Auswertungszeitraum zu rechnen würde jede
     Kultur dafür bestrafen, dass sie nicht ganzjährig steht. */
  sollIst(){
    const {E}=this.daten();
    const g={};
    E.filter(x=>x.feld && x.kultur && !x.rollomat).forEach(x=>{
      x.schiffe.forEach(sch=>{
        const k=x.feld.id+'|'+x.kultur.id;
        const d=g[k]=g[k]||{feld:x.feld, kultur:x.kultur, n:0, nMenge:0, schiffe:{}};
        const t=d.schiffe[sch.id]=d.schiffe[sch.id]||{mm:0, n:0, nMm:0, von:x.datum, bis:x.datum,
                                                       mmListe:[], termine:new Set()};
        t.n++; if(x.mm!=null){ t.mm+=x.mm; t.nMm++; t.mmListe.push(x.mm); }
        t.termine.add(x.datum);
        if(x.datum<t.von) t.von=x.datum;
        if(x.datum>t.bis) t.bis=x.datum;
      });
      const d=g[x.feld.id+'|'+x.kultur.id];
      if(d){ d.n++; if(x.m3) d.nMenge++; }
    });
    return Object.values(g).map(d=>{
      const r=Store.regel(d.feld.id, d.kultur.id);
      if(!r) return null;
      const iv=Engine.regelIntervall(r);            // Tage je Gang
      if(!iv || !r.mm) return null;
      const sollProTag=r.mm/iv;
      /* je Schiff ein Ist, danach der Median über die Schiffe */
      const je=[], mmAlle=[], abstaende=[];
      Object.values(d.schiffe).forEach(t=>{
        if(!t.nMm) return;
        const tage=Math.max(iv, D.diff(t.von,t.bis)+iv);
        je.push(t.mm/tage);
        mmAlle.push(...t.mmListe);
        const dt=[...t.termine].sort();
        for(let i=1;i<dt.length;i++) abstaende.push(D.diff(dt[i-1],dt[i]));
      });
      if(!je.length) return null;
      const ist=St.median(je);
      /* Was der Betrieb tatsächlich tut, als Regel formuliert: der übliche
         Abstand und die übliche Menge je Gang. Ein Vorschlag zum Prüfen, keine
         Empfehlung — der Betrieb kann aus gutem Grund knapper fahren, als
         agronomisch ideal wäre. */
      const ivBeob=St.median(abstaende), mmBeob=St.median(mmAlle);
      return {feld:d.feld, kultur:d.kultur, n:d.n, nSchiffe:je.length,
              deckung:d.n?d.nMenge/d.n:0, regelText:Admin.regelText(r),
              sollProTag, istProTag:ist, istSE:St.medianSE(je),
              spanne:[St.quantil(je,0.1), St.quantil(je,0.9)],
              ivBeob, mmBeob, nAbst:abstaende.length,
              verhaeltnis: sollProTag ? ist/sollProTag : null};
    }).filter(Boolean).filter(d=>d.n>=3 && d.verhaeltnis!=null)
      .sort((a,b)=>b.verhaeltnis-a.verhaeltnis);
  },

  /* ---------------- 4 · Regen je Standort ---------------- */
  jeStandort(){
    const {E,spanne}=this.daten();
    const g={};
    E.filter(x=>x.feld && x.standort).forEach(x=>{
      const d=g[x.standort.id]=g[x.standort.id]||{standort:x.standort, n:0, m3:0,
                                                  schiffe:new Map(), abw:[]};
      d.n++; if(x.m3) d.m3+=x.m3;
      x.schiffe.forEach(s=>{ if(!d.schiffe.has(s.id))
        d.schiffe.set(s.id, Store.schiffFlaecheM2(s,x.feld)||0); });
      /* Modellgüte: prognostizierte gegen gemessene Dauer bei der
         tatsächlich ausgebrachten Menge. Das trennt das Durchflussmodell
         von der Frage, ob die Zielmenge richtig war. */
      if(x.m3 && x.dauerMin && x.dauerMin>=5 && x.regner && x.schiffIds.length){
        const q=Engine.qFuerSchiffe(x.schiffIds), qv=W.wert(q);
        if(qv) d.abw.push(Math.abs(x.m3/(qv*x.regner)*60 - x.dauerMin));
      }
    });
    /* Regen je Standort: je Tag das Maximum der zugeordneten Stationen. */
    const regen={};
    Store.db.regen.forEach(r=>{
      if(r.datum<spanne.von || r.datum>spanne.bis) return;
      const ids = r.standortId ? [r.standortId]
                 : (Store.db.wetterstationen.find(w=>w.id===r.wetterstationId)||{standortIds:[]}).standortIds;
      (ids||[]).forEach(id=>{
        const k=id+'|'+r.datum; regen[k]=Math.max(regen[k]||0, r.mm||0); });
    });
    const regenJeStandort={};
    Object.entries(regen).forEach(([k,v])=>{
      const id=k.split('|')[0]; regenJeStandort[id]=(regenJeStandort[id]||0)+v; });

    return Object.values(g).map(d=>{
      const m2=[...d.schiffe.values()].reduce((a,b)=>a+b,0);
      const rmm=regenJeStandort[d.standort.id]||0;
      return {standort:d.standort, n:d.n, aren:U.m2NachAren(m2), m3:d.m3,
              m3JeAre: m2 ? d.m3/U.m2NachAren(m2) : null,
              regenMm:rmm, regenM3: m2 ? U.mmNachM3(rmm, m2) : null,
              abwMedian:St.median(d.abw), abwSE:St.medianSE(d.abw), nAbw:d.abw.length};
    }).sort((a,b)=>b.m3-a.m3);
  },

  /* ---------------- 5 · Flächen ohne Historie ---------------- */
  ohneHistorie(){
    const {E}=this.daten();
    const bekannt=new Set();
    E.forEach(x=>x.schiffIds.forEach(id=>bekannt.add(id)));
    const out=[];
    Store.db.felder.forEach(f=>{
      if(f.bewaessert===false) return;
      const fehlt=Store.echteSchiffe(f).filter(s=>!bekannt.has(s.id));
      if(!fehlt.length) return;
      const m2=fehlt.reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f)||0),0);
      out.push({feld:f, standort:Store.standort(f.standortId), schiffe:fehlt.length,
                gesamt:Store.echteSchiffe(f).length, aren:U.m2NachAren(m2)});
    });
    return out.sort((a,b)=>(b.aren||0)-(a.aren||0));
  },

  /* ---------------- 5b · Woher die Flächen stammen ----------------
     Die wichtigste Fussnote der ganzen Ansicht. Jede mm- und m³/Are-Zahl
     teilt durch eine Fläche. Stammt die Fläche aus der Feldgrösse geteilt
     durch die Zeichnung statt aus einer Messung, dann ist die Zahl im
     Betriebsschnitt richtig und für das einzelne Schiff nur so gut wie
     die Zeichnung. */
  flaechenHerkunft(){
    let eigen=0, abgeleitet=0, keine=0, m2Eigen=0, m2Abgeleitet=0;
    Store.db.felder.forEach(f=>Store.echteSchiffe(f).forEach(s=>{
      const m2=Store.schiffFlaecheM2(s,f)||0;
      if(s.aren || (s.laengeM && s.breiteM)){ eigen++; m2Eigen+=m2; }
      else if(m2){ abgeleitet++; m2Abgeleitet+=m2; }
      else keine++;
    }));
    const gesamt=eigen+abgeleitet+keine;
    return {eigen, abgeleitet, keine, gesamt,
            arenEigen:U.m2NachAren(m2Eigen), arenAbgeleitet:U.m2NachAren(m2Abgeleitet),
            anteilGemessen: (m2Eigen+m2Abgeleitet) ? m2Eigen/(m2Eigen+m2Abgeleitet) : 0};
  },

  /* ---------------- 6 · Datenqualität ---------------- */
  qualitaet(){
    const {E}=this.daten();
    const n=E.length;
    const zug=E.filter(x=>x.feld).length;
    const mitM3=E.filter(x=>x.m3).length;
    const mitDauer=E.filter(x=>x.dauerMin).length;
    const mitRegner=E.filter(x=>x.regner).length;
    const mitKultur=E.filter(x=>x.kultur).length;
    const mitFlaeche=E.filter(x=>x.flaecheM2).length;
    /* Physikalisch unmöglicher Durchfluss je Sprenkler — Grenzen aus der
       Kalibrierung (H2), nicht nach Gefühl gesetzt. */
    const unmoeglich=E.filter(x=>x.qJeRegner!=null && (x.qJeRegner<0.5 || x.qJeRegner>5)).length;
    const nQ=E.filter(x=>x.qJeRegner!=null).length;
    /* Einträge, deren Schiffzuordnung die Sprenklerzahl nicht trägt */
    const fraglich=E.filter(x=>x.fraglich);
    const nDeckung=E.filter(x=>x.deckung!=null).length;
    const fragFelder={};
    fraglich.forEach(x=>fragFelder[x.feld.name]=(fragFelder[x.feld.name]||0)+1);
    /* Journalnamen, die auf kein Feld zeigen */
    const offen={};
    E.filter(x=>!x.feld).forEach(x=>offen[x.roh.feldJournal]=(offen[x.roh.feldJournal]||0)+1);
    /* Schiffe ohne jede Flächenangabe — ohne sie ist keine mm-Rechnung möglich */
    let ohneFlaeche=0, schiffeGesamt=0;
    Store.db.felder.forEach(f=>Store.echteSchiffe(f).forEach(s=>{
      schiffeGesamt++; if(!Store.schiffFlaecheM2(s,f)) ohneFlaeche++; }));
    /* Kulturen im Journal, die im Katalog fehlen */
    const unbekannt={};
    E.filter(x=>!x.kultur && x.kulturRoh).forEach(x=>
      unbekannt[x.kulturRoh]=(unbekannt[x.kulturRoh]||0)+1);
    /* Felder mit Kultur, aber ohne Regel — die plant die Engine nicht */
    const ohneRegel=new Set();
    E.filter(x=>x.feld && x.kultur).forEach(x=>{
      if(!Store.regel(x.feld.id, x.kultur.id)) ohneRegel.add(x.feld.name+' · '+x.kultur.name); });

    return {n, fraglich:fraglich.length, nDeckung,
      fragFelder:Object.entries(fragFelder).sort((a,b)=>b[1]-a[1]),
      felder:[
      ['einem Feld zugeordnet', zug, n],
      ['mit Wassermenge (m³)', mitM3, n],
      ['mit Dauer', mitDauer, n],
      ['mit Sprenklerzahl', mitRegner, n],
      ['mit bekannter Kultur', mitKultur, n],
      ['mit bekannter Fläche', mitFlaeche, n]
    ], unmoeglich, nQ,
      offen:Object.entries(offen).sort((a,b)=>b[1]-a[1]),
      unbekannt:Object.entries(unbekannt).sort((a,b)=>b[1]-a[1]),
      ohneFlaeche, schiffeGesamt,
      ohneRegel:[...ohneRegel].sort()};
  }
};

/* ============================================================
   AUSWERTUNG — Darstellung
   ============================================================ */
Object.assign(Admin, {

  /* --- Bausteine --------------------------------------------------- */
  awGrp(titel, unter){
    const d=el('div','awgrp');
    d.innerHTML=`<h3>${esc(titel)}</h3>`+(unter?`<p class="awsub">${unter}</p>`:'');
    return d;
  },
  /* Ein Balken mit optionaler Unsicherheitsspanne. Die Spanne ist ein
     heller Streifen über dem Balken, keine zweite Zahl — sonst liest
     niemand mehr, was der Balken sagt. */
  awBalken(wert, max, se, klasse){
    if(wert==null || !max) return '<span class="du">–</span>';
    const p=Math.max(0,Math.min(100, 100*wert/max));
    let sp='';
    if(se){
      const lo=Math.max(0,Math.min(100,100*(wert-se)/max));
      const hi=Math.max(0,Math.min(100,100*(wert+se)/max));
      sp=`<u style="left:${lo.toFixed(1)}%;width:${Math.max(0.6,hi-lo).toFixed(1)}%"></u>`;
    }
    return `<span class="bar ${klasse||''}"><i style="width:${p.toFixed(1)}%"></i>${sp}</span>`;
  },
  /* Zahl mit Unsicherheit. Ohne n≥5 gibt es keine Spanne, und das steht
     dann auch da — statt eine Genauigkeit vorzutäuschen. */
  awPM(wert, se, dez, einheit){
    if(wert==null) return '<span class="du">–</span>';
    const z=wert.toFixed(dez==null?1:dez)+(einheit?' '+einheit:'');
    return se==null ? `${z} <span class="du">±?</span>`
                    : `${z} <span class="du">± ${se.toFixed(dez==null?1:dez)}</span>`;
  },
  awTab(kopf, zeilen){
    const w=el('div','awscroll');
    w.innerHTML=`<table class="atab"><thead><tr>${
      kopf.map(([t,k])=>`<th class="${k||''}">${t}</th>`).join('')}</tr></thead><tbody>${
      zeilen.map(z=>`<tr>${z.join('')}</tr>`).join('')}</tbody></table>`;
    return w;
  },

  /* --- Die Ansicht ------------------------------------------------- */
  vAuswert(p){
    const A=Auswert;
    const sp=A.spanne();

    /* Zeitraumwahl */
    const bar=el('div','row wrap'); bar.style.marginBottom='14px';
    A.ZEITRAEUME.forEach(([k,l])=>{
      const b=el('button','btn sm'+(A.zeitraum===k?' pri':' ghost'), l);
      b.onclick=()=>{ A.zeitraum=k; A._cache=null; this.render(); };
      bar.appendChild(b);
    });
    const hin=el('span','tiny dim');
    hin.style.marginLeft='auto';
    hin.textContent=D.nice(sp.von)+' bis '+D.nice(sp.bis);
    bar.appendChild(hin);
    p.appendChild(bar);

    const U1=A.ueberblick();
    if(!U1.gaenge){
      const b=el('div','infobox');
      b.innerHTML=`Im Zeitraum <b>${esc(sp.label)}</b> steht kein zugeordneter Journaleintrag.
        ${U1.gaengeGesamt?`${U1.gaengeGesamt} Einträge gibt es, aber keiner zeigt auf ein Feld —
        das lässt sich unter <b>Journal</b> zuordnen.`:'Wähle einen anderen Zeitraum.'}`;
      p.appendChild(b); return;
    }

    /* ---- 1 Überblick ---- */
    const g1=this.awGrp('Überblick', `Alle zugeordneten Gänge im Zeitraum <b>${esc(sp.label)}</b>.
      Rollomat-Gänge zählen mit, sind aber aus allen Modellrechnungen weiter unten ausgenommen.`);
    const sr=el('div','statrow');
    sr.innerHTML=`
      <div class="stt"><b>${U1.gaenge}</b><span>Gänge</span></div>
      <div class="stt" title="Nur Gänge mit gemessener Wassermenge gehen in die m³-Summe ein: ${
        U1.mitMenge} von ${U1.gaenge}."><b>${Math.round(U1.m3).toLocaleString('de-CH')} m³</b>
        <span>Wasser · ${Math.round(100*U1.mitMenge/U1.gaenge)} % erfasst</span></div>
      <div class="stt"><b>${U1.aren?Math.round(U1.aren):'–'} a</b><span>${U1.schiffe} Schiffe berührt</span></div>
      <div class="stt" title="Wassermenge geteilt durch die berührte Fläche. Nicht mit der Zielmenge einer Regel verwechseln — das hier ist die Summe über den ganzen Zeitraum."><b>${
        U1.mmSchnitt?Math.round(U1.mmSchnitt):'–'} mm</b><span>über die Fläche</span></div>
      <div class="stt" title="${U1.regenMm?'Summe der Tagesmaxima über alle Standorte.':'Noch kein Niederschlag erfasst — der Vergleich fehlt deshalb.'}"><b>${
        U1.regenMm?Math.round(U1.regenMm)+' mm':'–'}</b><span>Regen</span></div>`;
    g1.appendChild(sr);
    if(U1.ohneZuordnung){
      const w=el('div','tiny dim');
      w.innerHTML=`${U1.ohneZuordnung} Einträge im Zeitraum zeigen auf kein Feld und fehlen in
        allen Zahlen oben. Siehe <b>Datenqualität</b> ganz unten.`;
      g1.appendChild(w);
    }
    if(U1.regenM3Aequiv){
      const r=el('div','okbox');
      r.innerHTML=`Der Regen entspricht auf der berührten Fläche rund
        <b>${Math.round(U1.regenM3Aequiv).toLocaleString('de-CH')} m³</b> —
        das ${(U1.regenM3Aequiv/(U1.m3||1)).toFixed(1)}-fache dessen, was bewässert wurde.
        <span class="tiny dim">Rechnerisch. Ob der Regen die Kultur erreicht, hängt davon ab,
        ob die Fläche überdacht ist — das steht bisher nirgends in den Daten.</span>`;
      g1.appendChild(r);
    }
    /* Woher die Flächen stammen — das gehört nach oben, nicht in eine Fussnote.
       Alles unter dieser Zeile teilt durch eine Fläche. */
    const FH=A.flaechenHerkunft();
    if(FH.anteilGemessen<0.9){
      const w=el('div','warnbox'); w.style.marginTop='10px';
      w.innerHTML=`<b>${FH.eigen} von ${FH.gesamt} Schiffen</b> haben eine eigene Flächenangabe
        (${FH.arenEigen.toFixed(0)} von ${(FH.arenEigen+FH.arenAbgeleitet).toFixed(0)} Aren,
        ${Math.round(100*FH.anteilGemessen)} %). Bei den übrigen wird die Feldfläche über die
        gezeichneten Schiffe verteilt${FH.keine?`, ${FH.keine} Schiffe haben gar keine Fläche`:''}.
        <span class="tiny dim">Damit stimmen die Summen im Betriebsschnitt, aber jede mm- und
        m³/Are-Zahl für ein einzelnes Schiff ist nur so genau wie die Zeichnung seines Feldes.
        Eingetragene Aren je Schiff wären die wirksamste einzelne Verbesserung an diesen Daten.</span>`;
      g1.appendChild(w);
    }
    p.appendChild(g1);

    /* ---- 2 Je Kultur ---- */
    const K=A.jeKultur();
    if(K.length){
      const maxA=Math.max(...K.map(k=>k.m3JeAre||0))||1;
      const g2=this.awGrp('Wasser je Kultur',
        `Wie viel Wasser ein Are dieser Kultur im Zeitraum bekommen hat. Die Fläche zählt jedes
         Schiff einmal, unabhängig davon, wie oft es an der Reihe war.
         <b>±</b> ist die Unsicherheit des Medians (n ≥ 5), <b>±?</b> heisst: zu wenig Gänge dafür.`);
      g2.appendChild(this.awTab(
        [['Kultur'],['m³ je Are','num'],['',''],['mm je Gang','num'],['Abstand','num'],
         ['Schiffe','num'],['Gänge','num'],['Menge erfasst','num']],
        K.map(k=>[
          `<td><b>${esc(k.name)}</b><br><span class="nn">${k.aren?k.aren.toFixed(1)+' a':'Fläche unbekannt'}</span></td>`,
          `<td class="num">${k.m3JeAre!=null?k.m3JeAre.toFixed(1):'–'}</td>`,
          `<td style="width:22%;min-width:70px">${this.awBalken(k.m3JeAre, maxA, null,
             k.deckung<0.7?'warn':'')}</td>`,
          `<td class="num">${this.awPM(k.mmMedian, k.mmSE, 1)}<br><span class="nn">n=${k.nMm}</span></td>`,
          `<td class="num">${this.awPM(k.abstMedian, k.abstSE, 1, 'T')}<br><span class="nn">n=${k.nAbst}</span></td>`,
          `<td class="num">${k.schiffe}</td>`,
          `<td class="num">${k.n}</td>`,
          `<td class="num${k.deckung<0.7?' du':''}">${Math.round(100*k.deckung)} %</td>`
        ])));
      const lg=el('div','awlegend');
      lg.innerHTML=`Ein gelber Balken heisst: bei dieser Kultur hat weniger als jeder dritte Gang
        eine gemessene Menge. Die m³-Zahl ist dann eine Untergrenze, keine Bilanz.`;
      g2.appendChild(lg);
      p.appendChild(g2);
    }

    /* ---- 3 Regel gegen Wirklichkeit ---- */
    const S=A.sollIst();
    if(S.length){
      const g3=this.awGrp('Regel gegen Wirklichkeit',
        `Bekommt eine Fläche das, was ihre Regel verspricht? Verglichen wird mm je Tag über den
         Zeitraum, in dem die Kultur dort im Journal auftaucht — nicht über den ganzen
         Auswertungszeitraum, sonst würde jede Kultur dafür bestraft, dass sie nicht ganzjährig steht.
         <b>1.0</b> heisst: genau nach Regel.`);
      const gut=S.filter(s=>s.deckung>=0.8);
      const schwach=S.filter(s=>s.deckung<0.8);
      const zeile=s=>[
        `<td><b>${esc(s.feld.name)}</b><br><span class="nn">${esc(s.kultur.name)}</span></td>`,
        `<td class="du">${esc(s.regelText)}</td>`,
        `<td class="num">${s.sollProTag.toFixed(1)}</td>`,
        `<td class="num">${s.nSchiffe>=3
            ? s.istProTag.toFixed(1)+`<br><span class="nn">Schiffe ${s.spanne[0].toFixed(1)}–${s.spanne[1].toFixed(1)}</span>`
            : this.awPM(s.istProTag, s.istSE, 1)+`<br><span class="nn">${s.nSchiffe} Schiff${s.nSchiffe===1?'':'e'}</span>`}</td>`,
        `<td class="num"><b>${s.verhaeltnis.toFixed(2)}</b></td>`,
        `<td style="width:18%;min-width:60px">${this.awBalken(Math.min(s.verhaeltnis,2), 2, null,
           s.verhaeltnis<0.6?'neg':(s.verhaeltnis>1.6?'warn':''))}</td>`,
        `<td class="num">${s.n}<br><span class="nn">${s.nSchiffe} Schiffe</span></td>`,
        `<td>${(s.ivBeob && s.mmBeob && s.nAbst>=3)
          ? `<span class="du">alle ${String(s.ivBeob.toFixed(1)).replace('.0','')} T · ${
             s.mmBeob.toFixed(0)} mm</span><br><button class="btn sm ghost" style="margin-top:3px"
             onclick="Admin.regelBearbeiten('${s.feld.id}','${s.kultur.id}')">Regel öffnen</button>`
          : '<span class="du">zu wenig Gänge</span>'}</td>`
      ];
      const kopf=[['Fläche · Kultur'],['Regel'],['Soll mm/T','num'],['Ist mm/T','num'],
                  ['Ist ÷ Soll','num'],[''],['Gänge','num'],['beobachtet']];
      const unter=gut.filter(s=>s.verhaeltnis<0.8).length;
      if(gut.length>=4 && unter/gut.length>=0.6){
        const w=el('div','warnbox'); w.style.marginBottom='10px';
        w.innerHTML=`<b>${unter} von ${gut.length} Kombinationen bekommen unter 80 % ihrer
          Regelmenge</b>, im Median das ${(St.median(gut.map(s=>s.verhaeltnis))||0).toFixed(2)}-fache.
          Das ist kein Zufall einzelner Flächen — die hinterlegten Regeln beschreiben eine
          Bewässerung, die der Betrieb so nicht fährt.
          <span class="tiny dim">Folge im Tagesplan: bei fast jedem Sektor wächst dauernd ein
          Defizit, das nie abgebaut wird. Die Fälligkeitsliste wird dadurch lang und
          nichtssagend, und die als <b>Klärfälle</b> markierten Aufträge häufen sich.
          Entweder sind die Regeln zu grosszügig, oder der Betrieb bewässert bewusst knapper —
          in beiden Fällen gehört die Regel an die Wirklichkeit angeglichen. Die Spalte
          <b>beobachtet</b> zeigt, was tatsächlich läuft.</span>`;
        g3.appendChild(w);
      }
      if(gut.length) g3.appendChild(this.awTab(kopf, gut.map(zeile)));
      const lg=el('div','awlegend');
      lg.innerHTML=`Gerechnet wird je Schiff, danach der Median über die Schiffe — mm ist eine
        Grösse je Fläche und darf nicht über Einträge summiert werden, die verschiedene Schiffe
        betreffen. „Schiffe 4.1–9.8" ist die Spanne vom 10. bis zum 90. Prozentwert: liegt sie
        weit auseinander, behandelt der Betrieb die Schiffe derselben Fläche verschieden.<br>
        Rot: bekommt unter 60 % der Regelmenge. Gelb: über 160 %. Beides ist erst einmal eine
        Frage, keine Diagnose — entweder stimmt die Regel nicht, oder die Fläche wird tatsächlich
        anders behandelt, als der Plan annimmt. Genau solche Zeilen erzeugen die
        <b>Klärfälle</b> im Tagesplan.`;
      g3.appendChild(lg);
      if(schwach.length){
        const w=el('div','tiny dim'); w.style.marginTop='8px';
        w.innerHTML=`${schwach.length} weitere Kombinationen sind ausgelassen, weil bei ihnen
          unter 80 % der Gänge eine gemessene Menge tragen. Ihr „Ist" wäre systematisch zu tief
          und der Vergleich damit irreführend.`;
        g3.appendChild(w);
      }
      p.appendChild(g3);
    }

    /* ---- 4 Je Standort ---- */
    const ST=A.jeStandort();
    if(ST.length){
      const maxM3=Math.max(...ST.map(s=>s.m3||0))||1;
      const g4=this.awGrp('Je Standort',
        `Wasserverbrauch, Regen und wie genau das Modell dort die Dauer trifft. Die Modellgüte ist
         der Median des Fehlers zwischen berechneter und aufgeschriebener Dauer bei der
         tatsächlich ausgebrachten Menge — sie misst das Durchflussmodell, nicht die Zielmenge.`);
      g4.appendChild(this.awTab(
        [['Standort'],['m³','num'],['',''],['m³ je Are','num'],['Regen','num'],
         ['Modellgüte','num'],['Gänge','num']],
        ST.map(s=>[
          `<td><b>${esc(s.standort.name)}</b><br><span class="nn">${
            s.aren?s.aren.toFixed(0)+' a':'Fläche unbekannt'}</span></td>`,
          `<td class="num">${Math.round(s.m3).toLocaleString('de-CH')}</td>`,
          `<td style="width:18%;min-width:60px">${this.awBalken(s.m3, maxM3)}</td>`,
          `<td class="num">${s.m3JeAre!=null?s.m3JeAre.toFixed(1):'–'}</td>`,
          `<td class="num">${s.regenMm?s.regenMm.toFixed(0)+' mm':'<span class="du">–</span>'}${
            s.regenM3?`<br><span class="nn">≈ ${Math.round(s.regenM3)} m³</span>`:''}</td>`,
          `<td class="num">${s.nAbw>=5?this.awPM(s.abwMedian,s.abwSE,0,'min')
            :'<span class="du">zu wenig</span>'}<br><span class="nn">n=${s.nAbw}</span></td>`,
          `<td class="num">${s.n}</td>`
        ])));
      p.appendChild(g4);
    }

    /* ---- 5 Ohne Historie ---- */
    const OH=A.ohneHistorie();
    const g5=this.awGrp('Flächen ohne Historie im Zeitraum',
      `Diese Schiffe tauchen im gewählten Zeitraum in keinem Journaleintrag auf. Für sie rechnet
       die App mit Feld- oder Betriebswerten statt mit eigener Erfahrung — die Dauerangabe ist
       dort entsprechend unsicherer.`);
    if(!OH.length){
      const o=el('div','okbox'); o.textContent='Jedes bewässerte Schiff kommt im Zeitraum mindestens einmal vor.';
      g5.appendChild(o);
    } else {
      const summe=OH.reduce((a,x)=>a+x.schiffe,0);
      const flaeche=OH.reduce((a,x)=>a+(x.aren||0),0);
      const i=el('div','tiny dim'); i.style.marginBottom='8px';
      i.innerHTML=`<b>${summe} Schiffe</b> auf ${OH.length} Feldern, zusammen rund
        <b>${flaeche.toFixed(0)} Aren</b>.`;
      g5.appendChild(i);
      g5.appendChild(this.awTab(
        [['Feld'],['Standort'],['ohne Historie','num'],['von','num'],['Aren','num']],
        OH.slice(0,25).map(x=>[
          `<td><b>${esc(x.feld.name)}</b></td>`,
          `<td class="du">${esc(x.standort?x.standort.name:'–')}</td>`,
          `<td class="num">${x.schiffe}</td>`,
          `<td class="num">${x.gesamt}</td>`,
          `<td class="num">${x.aren?x.aren.toFixed(1):'–'}</td>`
        ])));
      if(OH.length>25){ const m=el('div','tiny dim'); m.style.marginTop='6px';
        m.textContent=`… und ${OH.length-25} weitere Felder.`; g5.appendChild(m); }
    }
    p.appendChild(g5);

    /* ---- 6 Datenqualität ---- */
    const Q=A.qualitaet();
    const g6=this.awGrp('Datenqualität',
      `Was die Auswertung tragen kann, hängt daran. Der Anteil ist mit seiner Unsicherheit
       angegeben; bei ${Q.n} Einträgen ist die klein, bei kurzen Zeiträumen nicht.`);
    g6.appendChild(this.awTab(
      [['Journaleinträge im Zeitraum'],['Anteil','num'],[''],['n','num']],
      Q.felder.map(([l,k,n])=>{
        const se=St.anteilSE(k,n);
        return [`<td>${esc(l)}</td>`,
          `<td class="num">${(100*k/n).toFixed(0)} %${se?` <span class="du">± ${(100*1.96*se).toFixed(1)}</span>`:''}</td>`,
          `<td style="width:30%;min-width:80px">${this.awBalken(k, n, se?n*1.96*se:null,
             k/n<0.8?'warn':'')}</td>`,
          `<td class="num">${k} / ${n}</td>`];
      })));
    const pr=el('div'); pr.style.marginTop='10px';
    const punkte=[];
    if(Q.fraglich) punkte.push(`<b>${Q.fraglich}</b> von ${Q.nDeckung} Gängen nennen zu wenige
      Schiffe für ihre Sprenklerzahl — die beregnete Fläche übersteigt die genannte um mehr als
      das ${Engine.DECKUNG_MAX}-fache. Ihre Menge zählt in allen m³-Summen, ihre mm-Zahl wird
      nicht gebildet${Q.fragFelder.length?': '+Q.fragFelder.slice(0,5).map(([n,c])=>esc(n)+' ('+c+')').join(', '):''}${
      Q.fragFelder.length>5?' …':''}. Fehlende Schiffnummern im <b>Journal</b> nachtragen holt sie zurück.`);
    if(Q.unmoeglich) punkte.push(`<b>${Q.unmoeglich}</b> von ${Q.nQ} Gängen ergeben einen
      physikalisch unmöglichen Durchfluss je Sprenkler (unter 0.5 oder über 5 m³/h). Sie sind aus
      der Modellrechnung ausgeschlossen — meist ein Tippfehler bei Zähler, Dauer oder Sprenklerzahl.`);
    if(Q.ohneFlaeche) punkte.push(`<b>${Q.ohneFlaeche}</b> von ${Q.schiffeGesamt} Schiffen haben
      keine Flächenangabe. Für sie lässt sich weder mm noch Dauer aus einer Zielmenge rechnen.`);
    if(Q.offen.length) punkte.push(`<b>${Q.offen.length}</b> Journalnamen zeigen auf kein Feld:
      ${Q.offen.slice(0,6).map(([n,c])=>esc(n)+' ('+c+')').join(', ')}${
      Q.offen.length>6?' …':''}. Zuordnen unter <b>Journal</b>.`);
    if(Q.unbekannt.length) punkte.push(`<b>${Q.unbekannt.length}</b> Kulturbezeichnungen aus dem
      Journal stehen nicht im Katalog: ${Q.unbekannt.slice(0,6).map(([n,c])=>esc(n)+' ('+c+')').join(', ')}${
      Q.unbekannt.length>6?' …':''}.`);
    if(Q.ohneRegel.length) punkte.push(`<b>${Q.ohneRegel.length}</b> Kombinationen aus Feld und
      Kultur kommen im Journal vor, haben aber keine Regel. Ohne Regel plant die App sie nicht:
      ${Q.ohneRegel.slice(0,5).map(esc).join(', ')}${Q.ohneRegel.length>5?' …':''}.`);
    if(punkte.length){
      const w=el('div','warnbox');
      w.innerHTML='<ul style="margin:0;padding-left:18px;line-height:1.6">'
        +punkte.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
      pr.appendChild(w);
    } else {
      const o=el('div','okbox'); o.textContent='Keine offenen Zuordnungen, keine unmöglichen Werte.';
      pr.appendChild(o);
    }
    g6.appendChild(pr);
    p.appendChild(g6);

    /* ---- Was diese Ansicht NICHT sagt ---- */
    const g7=this.awGrp('Was hier nicht steht',
      `Damit die Zahlen oben nicht mehr behaupten, als sie können.`);
    const n=el('div','infobox');
    n.innerHTML=`<ul style="margin:0;padding-left:18px;line-height:1.65">
      <li>Alles hier ist <b>Rückschau</b>. Keine Zahl sagt voraus, was morgen gebraucht wird.</li>
      <li>„Nicht bewässert" heisst im Journal nicht „war nicht nötig". Fehlende Gänge und nicht
          aufgeschriebene Gänge sehen in den Daten gleich aus.</li>
      <li>Ob eine Fläche überdacht ist, steht nirgends. Der Regenvergleich ist deshalb
          rechnerisch und für Tunnel oder Gewächshäuser nicht gültig.</li>
      <li>Pflanzdaten fehlen. Der Mehrbedarf beim Anwachsen — der stärkste Treiber im
          Gartenbau — lässt sich aus diesen Daten nicht herausrechnen.</li>
      <li>Die Modellgüte je Standort ist an denselben Daten gemessen, aus denen das Modell
          gefittet wurde. Die ehrliche Prüfung steht in <b>docs/backtest.md</b>.</li></ul>`;
    g7.appendChild(n);
    p.appendChild(g7);
  }
});

/* Reiter anmelden — an einer Stelle, damit die Reihenfolge sichtbar bleibt. */
Admin.TABS.splice(1, 0, ['auswert','Auswertung']);
