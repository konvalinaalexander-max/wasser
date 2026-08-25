/* ============================================================
   ENGINE — Referenzwerte, Wasserbilanz, Tagesplanung
   Das ist das Herzstück: aus Regeln + Journal + Regen entsteht
   ein über mehrere Tage verteilter Vorschlag.
   ============================================================ */
const Engine = {

  /* ---- Journal-Feldnamen den digitalisierten Feldern zuordnen ---- */
  normName(s){ return String(s||'').toLowerCase()
      .replace(/[äÄ]/g,'a').replace(/[öÖ]/g,'o').replace(/[üÜ]/g,'u').replace(/ß/g,'ss')
      .replace(/\(.*?\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim(); },

  ALIAS:{ 'abag':'abag luchs', 'au landi':'au landi', 'uster slowgrow':'adlisberg slowgrow',
          'wangen oertig':'wangen autobahn', 'werrikon':'werrikon zuunwis',
          'thalheim thuracker':'thuracker', 'wolf':'neuwiesen wolff mitte',
          'bachofen':'bachofen' },

  journalFelder(){ const s=new Set(); Store.db.journal.forEach(e=>s.add(e.feldJournal)); return [...s].sort(); },

  autoMap(){
    const db=Store.db;
    const kand = db.felder.map(f=>({f, n:this.normName(f.name),
                  ueber: db._st[f.standortId]?.istUebersicht}));
    const map={};
    this.journalFelder().forEach(jn=>{
      const n0=this.normName(jn); const n=this.ALIAS[n0]||n0;
      let hit = kand.filter(k=>k.n===n);
      if(!hit.length) hit = kand.filter(k=>k.n.startsWith(n)||n.startsWith(k.n));
      if(!hit.length){ const tk=n.split(' ').filter(x=>x.length>2);
        hit = kand.filter(k=>tk.length&&tk.every(t=>k.n.includes(t))); }
      hit.sort((a,b)=> (a.ueber?1:0)-(b.ueber?1:0));   // Detailseite vor Übersichtsseite
      map[jn] = hit.length?hit[0].f.id:null;
    });
    return map;
  },

  feldFuerJournal(jn){
    const m = Store.db.einstellungen.journalMap || {};
    return m[jn] ? Store.feld(m[jn]) : null;
  },

  /* ---- Erfahrungswerte: mm pro Stunde je Schiff ----------------
     Normalisiert auf einzelne Schiffe, damit auch Kombinationen
     berechenbar sind, die es historisch nie exakt gab.            */
  _refCache:null,
  /* Wichtig: mm bezieht sich auf die BEREGNETE Fläche, nicht auf das ganze Feld.
     Beregnete Fläche = Kreisregner × Breite × Abstand + Sektorregner × Breite × halber Abstand
     (entspricht der bisherigen Journal-Formel; die Werte sind in den Einstellungen anpassbar,
     sobald die Felder ausgemessen sind). */
  beregneteFlaeche(kreis, sektor){
    const s = Store.db.einstellungen.sprenkler || {breite:18, abstandKreis:23, abstandSektor:11.5};
    return (kreis||0)*s.breite*s.abstandKreis + (sektor||0)*s.breite*s.abstandSektor;
  },
  refWerte(){
    if(this._refCache) return this._refCache;
    const per={}, feldAgg={}; let alle=[];
    Store.db.journal.forEach(e=>{
      if(!e.m3 || !e.dauerMin || e.dauerMin<5) return;
      const f = this.feldFuerJournal(e.feldJournal); if(!f) return;
      const flaeche = this.beregneteFlaeche(e.kreisregner, e.sektorregner);
      if(!flaeche) return;                                  // ohne Regnerangabe nicht rechenbar
      const stunden = e.dauerMin/60;
      const mm  = e.m3*1000/flaeche;                        // Liter je m² beregneter Fläche
      const mmH = mm/stunden;
      if(!isFinite(mmH) || mmH<=0 || mmH>40) return;        // grobe Ausreisser verwerfen
      let betroffen = f.schiffe.filter(s=> e.schiffe.includes(String(s.nummer)));
      if(!betroffen.length) betroffen = f.schiffe.length ? f.schiffe : [];
      betroffen.forEach(s=>{
        (per[s.id]=per[s.id]||[]).push({mmH, datum:e.datum, kreis:e.kreisregner, sektor:e.sektorregner});
      });
      (feldAgg[f.id]=feldAgg[f.id]||[]).push(mmH);
      alle.push(mmH);
    });
    const med = a => { if(!a.length) return null; const b=[...a].sort((x,y)=>x-y);
      const m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; };
    const out={ schiff:{}, feld:{}, global: med(alle), n:alle.length };
    Object.entries(per).forEach(([k,v])=>{
      v.sort((a,b)=> a.datum<b.datum?1:-1);
      const use=v.slice(0,8);
      out.schiff[k]={ mmH: med(use.map(x=>x.mmH)), n:v.length,
        letzteKreis: v.find(x=>x.kreis!=null)?.kreis ?? null,
        letzteSektor: v.find(x=>x.sektor!=null)?.sektor ?? null };
    });
    Object.entries(feldAgg).forEach(([k,v])=> out.feld[k]=med(v));
    this._refCache=out; return out;
  },
  clearRef(){ this._refCache=null; },

  /* Dauer in Minuten für Ziel-mm auf einer Schiff-Gruppe */
  dauerFuer(schiffIds, zielMm){
    const R=this.refWerte(); const raten=[];
    schiffIds.forEach(id=>{
      const r=R.schiff[id];
      if(r&&r.mmH) raten.push(r.mmH);
      else { const f=Store.db._sch[id]?.feld; const fr=f&&R.feld[f.id]; if(fr) raten.push(fr); }
    });
    const rate = raten.length ? raten.reduce((a,b)=>a+b,0)/raten.length : R.global;
    if(!rate) return {min:null, quelle:'keine'};
    return { min: Math.round(zielMm/rate*60), rate,
             quelle: raten.length?'schiff':'global' };
  },

  /* letzte Bewässerung eines Schiffs (aus Journal + neuen Einträgen) */
  letzteBewaesserung(schiffId){
    const info=Store.db._sch[schiffId]; if(!info) return null;
    let best=null;
    Store.db.journal.forEach(e=>{
      const f=this.feldFuerJournal(e.feldJournal); if(!f||f.id!==info.feld.id) return;
      const trifft = !e.schiffe.length || e.schiffe.includes(String(info.schiff.nummer));
      if(trifft && (!best||e.datum>best)) best=e.datum;
    });
    return best;
  },

  /* ---- Regel → Tage/Menge ---- */
  regelIntervall(r){                       // in Tagen (0.5 = 2× am Tag)
    if(!r) return null;
    if(r.einheit==='frei') return Math.max(0.25, r.tage||2);
    return r.einheit==='tag' ? 1/(r.anzahl||1) : 7/(r.anzahl||1);
  },
  aktivePhase(regel, pflanzdatum){
    if(!regel) return null;
    if(regel.phasen && regel.phasen.length && pflanzdatum){
      const tage = D.diff(pflanzdatum, D.today());
      for(const p of regel.phasen){
        if(tage >= (p.vonTag??0) && (p.bisTag==null || tage <= p.bisTag)) return p;
      }
    }
    return regel;
  },

  /* ---- Regen: mm je Standort an einem Datum ---- */
  regenAm(standortId, datum){
    let mm=0;
    Store.db.regen.forEach(r=>{ if(r.datum===datum && r.standortIds.includes(standortId)) mm+=r.mm; });
    return mm;
  },

  /* ---- Wasserbilanz eines Sektors ------------------------------
     Defizit wächst täglich um (Menge / Intervall) und wird durch
     Regen und Bewässerung abgebaut. Fällig, wenn Defizit ≥ Menge.  */
  bilanz(eintrag, bisDatum){
    const {sektor, schiff, feld, standort} = eintrag;
    const regel = Store.regel(feld.id, sektor.kulturId);
    const phase = this.aktivePhase(regel, sektor.pflanzdatum);
    if(!phase) return null;
    const iv = this.regelIntervall(phase); if(!iv) return null;
    const menge = phase.mm || 0;
    const proTag = menge/iv;

    const letzte = sektor.letzteBewaesserung || this.letzteBewaesserung(schiff.id) ||
                   sektor.pflanzdatum || D.add(D.today(), -Math.ceil(iv));
    let defizit=0, tag=letzte;
    const ende = bisDatum || D.today();
    let guard=0;
    while(tag < ende && guard++ < 400){
      tag = D.add(tag,1);
      defizit += proTag;
      // Regen des Zieldatums selbst nicht verrechnen: er erscheint als
      // Anpassungsvorschlag am Auftrag, damit der Admin entscheidet.
      const rg = tag<ende ? this.regenAm(standort.id, tag) : 0;
      if(rg) defizit = Math.max(0, defizit - rg);
    }
    return { regel:phase, menge, intervall:iv, proTag, defizit,
             letzte, faelligkeit: defizit>=menge ? 0 : Math.ceil((menge-defizit)/proTag) };
  },

  /* ---- Aufträge bilden: benachbarte Schiffe mit gleicher Regel bündeln ---- */
  auftraegeFuer(datum){
    const roh=[];
    Store.sektoren().forEach(e=>{
      const s=e.sektor;
      if(e.feld.bewaessert===false) return;
      if(s.pausiert && (!s.pausiertBis || s.pausiertBis >= datum)) return;
      if(!s.kulturId) return;
      const b=this.bilanz(e, datum); if(!b) return;
      if(b.defizit < b.menge*0.95) return;                 // noch nicht fällig
      roh.push({ e, b });
    });

    // gruppieren: gleicher Standort + Feld + Kultur + gleiche Zielmenge
    const g={};
    roh.forEach(({e,b})=>{
      const k=[e.feld.id, e.sektor.kulturId, Math.round(b.menge)].join('|');
      (g[k]=g[k]||[]).push({e,b});
    });

    return Object.entries(g).map(([k,items])=>{
      const first=items[0].e;
      const schiffIds=[...new Set(items.map(i=>i.e.schiff.id))];
      const nummern=[...new Set(items.map(i=>i.e.schiff.nummer))];
      const menge=items[0].b.menge;
      const dauer=this.dauerFuer(schiffIds, menge);
      const prio=items.map(i=>i.e.sektor.prioritaet||'normal')
                      .sort((a,b)=>({hoch:0,normal:1,niedrig:2}[a]-{hoch:0,normal:1,niedrig:2}[b]))[0];
      const ueberfaellig=Math.max(...items.map(i=>Math.round((i.b.defizit-i.b.menge)/i.b.proTag)));
      const letzte=items.map(i=>i.b.letzte).filter(Boolean).sort().pop()||null;
      const regen=this.regenAm(first.standort.id, datum);
      const vorschlag=regen? this.regenEmpfehlung({zielMm:menge}, regen) : null;
      return {
        id:'a-'+k.replace(/[^\w]/g,'_')+'-'+datum,
        datum, standortId:first.standort.id, feldId:first.feld.id,
        kulturId:first.sektor.kulturId, schiffIds, nummern,
        zielMm:menge, letzteBew:letzte, regenMm:regen||0,
        angepasstMm: vorschlag? vorschlag.mm : null,
        anpassungText: vorschlag? vorschlag.hinweis : null,
        anpassungAngenommen: false,
        dauerMin:dauer.min, dauerQuelle:dauer.quelle,
        prioritaet:prio, ueberfaellig, erledigt:false, quelle:'auto'
      };
    }).sort((a,b)=>{
      const p={hoch:0,normal:1,niedrig:2};
      return (p[a.prioritaet]-p[b.prioritaet]) || (b.ueberfaellig-a.ueberfaellig);
    });
  },

  /* ---- Plan über den Horizont erzeugen und Tage entzerren ---- */
  planen(startDatum, tage){
    const kap = Store.db.einstellungen.kapazitaetStandorte || 8;
    const horizont = tage || Store.db.einstellungen.planungsHorizont || 10;
    const plan = {};
    const schonGeplant = new Set();

    for(let i=0;i<horizont;i++){
      const d = D.add(startDatum, i);
      const bestehend = Store.db.plan[d];
      if(bestehend && bestehend.freigegeben){
        // Aufträge bleiben, aber Regen-Anpassung wird nachgeführt
        bestehend.auftraege.forEach(a=>{
          const rg=this.regenAm(a.standortId, d);
          a.regenMm=rg||0;
          if(!a.anpassungManuell){
            if(rg){ const emp=this.regenEmpfehlung(a, rg);
              a.angepasstMm=emp.mm; a.anpassungText=emp.hinweis; }
            else if(!a.anpassungAngenommen){ a.angepasstMm=null; a.anpassungText=null; }
          }
        });
        plan[d]=bestehend;
        bestehend.auftraege.forEach(a=> schonGeplant.add(a.feldId+'|'+a.kulturId));
        continue;
      }
      const manuell = (bestehend?.auftraege||[]).filter(a=>a.quelle==='manuell'||a.verschoben);
      manuell.forEach(a=>{
        const rg=this.regenAm(a.standortId, d);
        a.regenMm=rg||0;
        if(rg && !a.anpassungManuell){ const emp=this.regenEmpfehlung(a, rg);
          a.angepasstMm=emp.mm; a.anpassungText=emp.hinweis; }
      });
      let auto = this.auftraegeFuer(d).filter(a=> !schonGeplant.has(a.feldId+'|'+a.kulturId));
      let alle = [...manuell, ...auto];

      const standorteHeute = new Set(alle.map(a=>a.standortId));
      plan[d] = { datum:d, auftraege:alle, freigegeben:false,
                  ueberlastet: standorteHeute.size > kap || alle.length > kap*2.5,
                  standorte:standorteHeute.size, kapazitaet:kap };
      alle.forEach(a=> schonGeplant.add(a.feldId+'|'+a.kulturId));
    }
    return plan;
  },

  /* Plan neu rechnen und in den Store schreiben (freigegebene Tage bleiben) */
  planNeu(){
    this.clearRef();
    const neu = this.planen(D.today());
    Object.entries(neu).forEach(([d,v])=>{ Store.db.plan[d]=v; });
    Store.mark();
    return neu;
  },

  tagesPlan(datum){
    if(!Store.db.plan[datum]) {
      const kap=Store.db.einstellungen.kapazitaetStandorte||8;
      const a=this.auftraegeFuer(datum);
      Store.db.plan[datum]={datum, auftraege:a, freigegeben:false,
        standorte:new Set(a.map(x=>x.standortId)).size, kapazitaet:kap,
        ueberlastet:new Set(a.map(x=>x.standortId)).size>kap};
    }
    const p=Store.db.plan[datum];
    const st=new Set(p.auftraege.map(a=>a.standortId));
    p.standorte=st.size; p.kapazitaet=Store.db.einstellungen.kapazitaetStandorte||8;
    p.maxAuftraege=Math.round(p.kapazitaet*2.5);
    p.ueberlastet = st.size>p.kapazitaet || p.auftraege.length>p.maxAuftraege;
    p.grund = st.size>p.kapazitaet ? 'standorte' : (p.auftraege.length>p.maxAuftraege?'auftraege':null);
    return p;
  },

  verschiebe(datum, auftragId, richtung){
    const von=this.tagesPlan(datum);
    const i=von.auftraege.findIndex(a=>a.id===auftragId); if(i<0) return;
    const a=von.auftraege.splice(i,1)[0];
    const ziel=D.add(datum, richtung);
    a.datum=ziel; a.verschoben=true; a.id=a.id.replace(/-\d{4}-\d{2}-\d{2}$/,'')+'-'+ziel;
    const zp=this.tagesPlan(ziel); zp.auftraege.push(a);
    this.tagesPlan(datum); this.tagesPlan(ziel);
    Store.mark();
  },

  /* Die Menge, die der Wassermann tatsächlich sieht */
  effektivMm(a){
    return (a.anpassungAngenommen && a.angepasstMm!=null) ? a.angepasstMm : a.zielMm;
  },
  effektivDauer(a){
    const mm=this.effektivMm(a);
    if(mm===a.zielMm && a.dauerMin!=null) return a.dauerMin;
    return this.dauerFuer(a.schiffIds, mm).min;
  },

  /* Regen-Empfehlung: wie viel sollte nach dem Regen noch gegeben werden? */
  regenEmpfehlung(auftrag, regenMm){
    const rest = Math.max(0, auftrag.zielMm - regenMm);
    // agronomisch: unter ~30% der Zielmenge lohnt ein separater Gang kaum
    if(rest < auftrag.zielMm*0.3) return {mm:0, hinweis:'Regen deckt den Bedarf – Bewässerung kann entfallen'};
    return {mm:Math.round(rest), hinweis:'Restmenge nach Regen'};
  }
};

