/* ============================================================
   ENGINE — Referenzwerte, Wasserbilanz, Tagesplanung
   Das ist das Herzstück: aus Regeln + Journal + Regen entsteht
   ein über mehrere Tage VERTEILTER Vorschlag.

   Ablauf von planen():
     Tag für Tag durch den Horizont. Für jeden Tag wird die
     Wasserbilanz jedes Sektors bis zu diesem Tag simuliert –
     inklusive der Bewässerungen, die weiter vorne im Horizont
     bereits eingeplant wurden ("virtuell"). Dadurch erscheint
     eine tägliche Kultur auch täglich, und eine Wochenkultur
     genau einmal pro Woche.
     Überschreitet ein Tag die Kapazität, werden die am
     wenigsten dringenden, noch nicht überfälligen Aufträge
     nicht eingeplant – sie werden am Folgetag überfällig und
     rutschen dort automatisch nach vorne. So entzerrt sich der
     Plan von selbst (Pflichtenheft §9.3).
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
  /* Umgekehrt: unter welchem Namen läuft dieses Feld im Journal?
     Fehlt der Eintrag, wird er angelegt – sonst wären neue Einträge des
     Wassermanns für die Engine unsichtbar (früherer Befund C4). */
  journalNameFuer(feld, anlegen){
    const jm = Store.db.einstellungen.journalMap || (Store.db.einstellungen.journalMap={});
    const vorhanden = Object.entries(jm).find(([k,v])=>v===feld.id)?.[0];
    if(vorhanden) return vorhanden;
    if(anlegen){ jm[feld.name]=feld.id; Store.mark(); this.clearRef(); }
    return feld.name;
  },

  /* ---- Erfahrungswerte: mm pro Stunde je Schiff ----------------
     Normalisiert auf einzelne Schiffe, damit auch Kombinationen
     berechenbar sind, die es historisch nie exakt gab.

     mm bezieht sich auf die BEREGNETE Fläche, nicht auf das ganze Feld:
       beregnete Fläche = Kreisregner × Breite × Abstand
                        + Sektorregner × Breite × halber Abstand
     Diese Definition gilt in der GESAMTEN App (auch in der Journal-Ansicht),
     sonst widersprechen sich Plan und Kontrollzahlen.

     Messung am Journal: die Rate liegt bei 1, 2, 3 und 4 gleichzeitig
     bewässerten Schiffen konstant bei rund 4,95 mm/h – der Betrieb legt pro
     Schiff etwa gleich viele Sprenkler und die Pumpe hält mit. Die Dauer
     hängt daher an der Zielmenge, nicht an der Gruppengrösse; was mit der
     Gruppe wächst, ist die nötige SPRENKLERZAHL (siehe sprenklerFuer).    */
  _refCache:null,
  beregneteFlaeche(kreis, sektor){
    const s = Store.db.einstellungen.sprenkler || {breite:18, abstandKreis:23, abstandSektor:11.5};
    return (kreis||0)*s.breite*s.abstandKreis + (sektor||0)*s.breite*s.abstandSektor;
  },
  /* mm eines Journaleintrags – die eine gültige Definition */
  mmVonEintrag(e){
    if(!e || !e.m3) return null;
    const fl=this.beregneteFlaeche(e.kreisregner, e.sektorregner);
    return fl ? e.m3*1000/fl : null;
  },
  refWerte(){
    if(this._refCache) return this._refCache;
    const per={}, feldAgg={}, dichte={}; let alle=[];
    let unzuordenbar=0, ohneRegner=0, verworfen=0;
    Store.db.journal.forEach(e=>{
      if(!e.m3 || !e.dauerMin || e.dauerMin<5) return;
      const f = this.feldFuerJournal(e.feldJournal); if(!f) return;
      const flaeche = this.beregneteFlaeche(e.kreisregner, e.sektorregner);
      if(!flaeche){ ohneRegner++; return; }               // ohne Regnerangabe nicht rechenbar
      const stunden = e.dauerMin/60;
      const mm  = e.m3*1000/flaeche;
      const mmH = mm/stunden;
      if(!isFinite(mmH) || mmH<=0 || mmH>40){ verworfen++; return; }
      const betroffen = f.schiffe.filter(s=> e.schiffe.includes(String(s.nummer)));
      /* Kein Treffer heisst: die Schiffnummern im Journal passen nicht zum Plan.
         Solche Einträge zählen nur zum Feld- und Betriebsschnitt, nicht zu einzelnen
         Schiffen – sonst verwässern sie jeden Schiffwert (früherer Befund A15). */
      if(!betroffen.length) unzuordenbar++;
      const regner=(e.kreisregner||0)+(e.sektorregner||0);
      betroffen.forEach(s=>{
        /* Die Regnerzahl im Eintrag gilt für die GANZE Gruppe – der Anteil je Schiff
           ist das, was sich später wieder aufsummieren lässt. */
        (per[s.id]=per[s.id]||[]).push({mmH, datum:e.datum,
          kreis: e.kreisregner!=null ? e.kreisregner/betroffen.length : null,
          sektor: e.sektorregner!=null ? e.sektorregner/betroffen.length : null});
        const fl=Store.schiffFlaecheM2(s,f);
        if(fl && regner && betroffen.length)
          (dichte[s.id]=dichte[s.id]||[]).push(regner/betroffen.length/(fl/1000));   // Regner je 1000 m²
      });
      (feldAgg[f.id]=feldAgg[f.id]||[]).push(mmH);
      alle.push(mmH);
    });
    const med = a => { if(!a||!a.length) return null; const b=[...a].sort((x,y)=>x-y);
      const m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; };
    const out={ schiff:{}, feld:{}, dichte:{}, global: med(alle), n:alle.length,
                unzuordenbar, ohneRegner, verworfen,
                dichteGlobal: med(Object.values(dichte).flat()) };
    Object.entries(per).forEach(([k,v])=>{
      v.sort((a,b)=> a.datum<b.datum?1:(a.datum>b.datum?-1:0));
      const use=v.slice(0,8);                         // Median über die letzten 8 – glättet Ausreisser
      out.schiff[k]={ mmH: med(use.map(x=>x.mmH)), n:v.length,
        kreis:  med(use.map(x=>x.kreis ).filter(x=>x!=null)),
        sektor: med(use.map(x=>x.sektor).filter(x=>x!=null)) };
    });
    Object.entries(feldAgg).forEach(([k,v])=> out.feld[k]=med(v));
    Object.entries(dichte).forEach(([k,v])=> out.dichte[k]=med(v));
    this._refCache=out; return out;
  },
  clearRef(){ this._refCache=null; },

  /* Dauer in Minuten für Ziel-mm auf einer Schiff-Gruppe */
  dauerFuer(schiffIds, zielMm){
    const R=this.refWerte(); const raten=[];
    let quelle='global';
    (schiffIds||[]).forEach(id=>{
      const r=R.schiff[id];
      if(r&&r.mmH){ raten.push(r.mmH); quelle='schiff'; }
      else { const f=Store.db._sch[id]?.feld; const fr=f&&R.feld[f.id];
             if(fr){ raten.push(fr); if(quelle!=='schiff') quelle='feld'; } }
    });
    const rate = raten.length ? raten.reduce((a,b)=>a+b,0)/raten.length : R.global;
    if(!rate || !zielMm) return {min:null, rate:rate||null, quelle:'keine'};
    return { min: Math.round(zielMm/rate*60), rate, quelle };
  },

  /* Wie viele Sprenkler braucht diese Gruppe? Das ist die Grösse, die mit der
     Fläche wächst – und die dem Wassermann bisher nirgends gesagt wurde. */
  sprenklerFuer(schiffIds){
    const R=this.refWerte();
    let kreis=0, sektor=0, flaeche=0;
    let ausHistorie=false, hochgerechnet=false;
    (schiffIds||[]).forEach(id=>{
      const info=Store.db._sch[id]; if(!info) return;
      const fl=Store.schiffFlaecheM2(info.schiff, info.feld)||0;
      flaeche+=fl;
      const r=R.schiff[id];
      if(r && (r.kreis!=null || r.sektor!=null)){
        kreis+=r.kreis||0; sektor+=r.sektor||0; ausHistorie=true;
      } else {
        const d = R.dichte[id] ?? R.dichteGlobal;
        if(fl && d){ kreis += d*fl/1000; hochgerechnet=true; }
      }
    });
    if(!ausHistorie && !hochgerechnet)
      return {kreis:null, sektor:null, quelle:'keine', flaecheM2:Math.round(flaeche)||null};
    return { kreis: Math.max(1, Math.round(kreis)),
             sektor: Math.round(sektor)||null,
             quelle: hochgerechnet ? (ausHistorie?'gemischt':'geschaetzt') : 'historie',
             flaecheM2: Math.round(flaeche) };
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
  /* Wie oft am selben Tag? 1 bei allen Rhythmen ab einem Tag Abstand. */
  gaengeProTag(r){
    const iv=this.regelIntervall(r);
    return iv && iv<1 ? Math.max(1, Math.round(1/iv)) : 1;
  },
  /* Startstunden im 2-Stunden-Raster (Pflichtenheft §3) */
  zeitfenster(r){
    const n=this.gaengeProTag(r);
    if(n<2) return [];
    const eigene=(r.zeiten||[]).filter(x=>x!=null);
    if(eigene.length>=n) return eigene.slice(0,n).sort((a,b)=>a-b);
    const out=[]; const start=6, spanne=12;             // 6 bis 18 Uhr
    for(let i=0;i<n;i++) out.push(start + 2*Math.round(i*spanne/Math.max(1,n)/2));
    return out;
  },
  /* Regel, die an einem bestimmten DATUM gilt – Phasen zählen ab Pflanzdatum.
     Das Zieldatum muss durchgereicht werden, sonst gilt im ganzen Horizont
     die Phase von heute (früherer Befund A6). */
  aktivePhase(regel, pflanzdatum, datum){
    if(!regel) return null;
    if(regel.phasen && regel.phasen.length && pflanzdatum && D.ok(pflanzdatum)){
      const tage = D.diff(pflanzdatum, datum || D.today());
      for(const p of regel.phasen){
        if(tage >= (p.vonTag??0) && (p.bisTag==null || tage <= p.bisTag))
          return Object.assign({}, p, {zeiten:regel.zeiten, _phase:true});
      }
    }
    return regel;
  },

  /* ---- Regen: mm je Standort an einem Datum ---- */
  regenAm(standortId, datum){
    let mm=0;
    Store.db.regen.forEach(r=>{ if(r.datum===datum && (r.standortIds||[]).includes(standortId)) mm+=r.mm; });
    return mm;
  },

  /* ---- Wasserbilanz eines Sektors ------------------------------
     Defizit wächst täglich um (Menge / Intervall) und wird durch
     Regen und Bewässerung abgebaut. Fällig, wenn Defizit ≥ Menge.
     `virtuell` enthält die im laufenden Planungsdurchgang bereits
     eingeplanten Bewässerungen (sektorId → Datum).                */
  bilanz(eintrag, bisDatum, virtuell){
    const {sektor, schiff, feld, standort} = eintrag;
    const regel = Store.regel(feld.id, sektor.kulturId);
    const ende = bisDatum || D.today();
    const phase = this.aktivePhase(regel, sektor.pflanzdatum, ende);
    if(!phase) return null;
    const iv = this.regelIntervall(phase); if(!iv) return null;
    const menge = phase.mm || 0;
    if(!menge) return null;
    const proTag = menge/iv;

    let geschaetzt=false;
    let letzte = (virtuell && virtuell[sektor.id]) || sektor.letzteBewaesserung ||
                 this.letzteBewaesserung(schiff.id) || sektor.pflanzdatum || null;
    if(!D.ok(letzte)){
      /* Keine Historie: Startpunkt deterministisch über das Intervall streuen,
         damit nicht sämtliche Sektoren am selben Tag zum ersten Mal fällig werden. */
      const spanne=Math.max(1, Math.ceil(iv));
      const streu=Math.abs(hash(sektor.id)) % spanne;
      letzte = D.add(D.today(), -spanne + streu);
      geschaetzt=true;
    }

    let defizit=0, tag=letzte;
    let guard=0;
    while(tag < ende && guard++ < 400){
      tag = D.add(tag,1);
      defizit += proTag;
      // Regen des Zieldatums selbst nicht verrechnen: er erscheint als
      // Anpassungsvorschlag am Auftrag, damit der Admin entscheidet.
      const rg = tag<ende ? this.regenAm(standort.id, tag) : 0;
      if(rg) defizit = Math.max(0, defizit - rg);
    }
    return { regel:phase, menge, intervall:iv, proTag, defizit, letzte, geschaetzt,
             gaenge:this.gaengeProTag(phase), zeiten:this.zeitfenster(phase),
             faelligkeit: defizit>=menge ? 0 : Math.ceil((menge-defizit)/proTag) };
  },

  /* Historisch gemeinsam bewässerte Schiffe eines Feldes (Pflichtenheft §3) */
  gruppenFuer(feldId){
    const jm=Store.db.einstellungen.journalMap||{};
    return (Store.db.gruppen||[])
      .filter(g=> jm[g.feldJournal]===feldId && (g.schiffe||[]).length>1)
      .sort((a,b)=>(b.haeufigkeit||0)-(a.haeufigkeit||0));
  },
  /* Welche historisch üblichen Fahrgassen-Gruppen stecken in dieser Schiffauswahl?
     Sie werden dem Wassermann als Vorschlag gezeigt, wie er die Sprenkler setzt
     (Pflichtenheft §3) – bisher lagen die 40 Einträge ungenutzt im Datenmodell (Befund C1).
     Der Auftrag selbst bleibt EINER: laut Journal (§10) laufen mehrere Fahrgassen
     gleichzeitig, und der Wassermann bestätigt beim Eintragen ohnehin, was er
     tatsächlich gemacht hat. */
  gruppenVorschlag(feldId, nummern){
    const dabei=new Set(nummern.map(String));
    const vergeben=new Set(); const out=[];
    this.gruppenFuer(feldId).forEach(g=>{                 // nach Häufigkeit sortiert
      const n=g.schiffe.map(String);
      if(n.length<2 || out.length>=6) return;
      if(!n.every(x=>dabei.has(x))) return;
      if(n.some(x=>vergeben.has(x))) return;              // keine überlappenden Vorschläge
      n.forEach(x=>vergeben.add(x)); out.push(n);
    });
    return out;
  },

  /* ---- Aufträge eines Tages bilden ---- */
  auftraegeFuer(datum, virtuell){
    const roh=[];
    Store.sektoren().forEach(e=>{
      const s=e.sektor;
      if(e.feld.bewaessert===false) return;
      if(s.pausiert && (!s.pausiertBis || s.pausiertBis >= datum)) return;
      if(!s.kulturId) return;
      const b=this.bilanz(e, datum, virtuell); if(!b) return;
      if(b.defizit < b.menge*0.95) return;                 // noch nicht fällig
      roh.push({ e, b });
    });

    // gruppieren: gleiches Feld + Kultur + gleiche Zielmenge
    const g={};
    roh.forEach(({e,b})=>{
      const k=[e.feld.id, e.sektor.kulturId, Math.round(b.menge)].join('|');
      (g[k]=g[k]||[]).push({e,b});
    });

    const out=[];
    Object.entries(g).forEach(([k,posten])=>{
      const feldId=posten[0].e.feld.id;
      [posten].forEach((paket, pi)=>{
        const first=paket[0].e;
        const schiffIds=[...new Set(paket.map(i=>i.e.schiff.id))];
        const sektorIds=[...new Set(paket.map(i=>i.e.sektor.id))];
        const nummern=[...new Set(paket.map(i=>i.e.schiff.nummer).filter(n=>n!==''))];
        const menge=paket[0].b.menge;
        const dauer=this.dauerFuer(schiffIds, menge);
        const prio=paket.map(i=>i.e.sektor.prioritaet||'normal')
                        .sort((a,b)=>({hoch:0,normal:1,niedrig:2}[a]-{hoch:0,normal:1,niedrig:2}[b]))[0];
        const ueberfaellig=Math.max(...paket.map(i=>Math.round((i.b.defizit-i.b.menge)/i.b.proTag)));
        /* Ältestes Datum im Paket – dasselbe Schiff, das auch die Überfälligkeit bestimmt.
           Vorher stand hier das jüngste, was „1 Tag" neben „+64 Tage überfällig" ergab. */
        const letzte=paket.map(i=>i.b.letzte).filter(Boolean).sort()[0]||null;
        const geschaetzt=paket.some(i=>i.b.geschaetzt);
        const regen=this.regenAm(first.standort.id, datum);
        const vorschlag=regen? this.regenEmpfehlung({zielMm:menge}, regen) : null;
        const gaenge=paket[0].b.gaenge, zeiten=paket[0].b.zeiten;
        const basisKey=[feldId, first.sektor.kulturId, Math.round(menge)].join('~');
        const gruppen=this.gruppenVorschlag(feldId, nummern);

        /* Mehrmals täglich (z. B. Cherwis Karotten 2×/Tag): je Gang ein eigener
           Auftrag mit Zeitfenster – bisher wurde nur einer geplant (Befund A16). */
        for(let gi=0; gi<gaenge; gi++){
          out.push({
            key: basisKey + (gaenge>1?('~g'+gi):''),
            id: 'a-'+(basisKey+(gaenge>1?('~g'+gi):'')).replace(/[^\w~]/g,'_')+'-'+datum,
            datum, ursprung:datum,
            standortId:first.standort.id, feldId, kulturId:first.sektor.kulturId,
            schiffIds, sektorIds, nummern,
            zielMm:menge, letzteBew:letzte, regenMm:regen||0,
            angepasstMm: vorschlag? vorschlag.mm : null,
            anpassungText: vorschlag? vorschlag.hinweis : null,
            anpassungAngenommen: false, anpassungManuell:false,
            dauerMin:dauer.min, dauerQuelle:dauer.quelle,
            prioritaet:prio, ueberfaellig, geschaetzt,
            gangNr: gaenge>1?gi+1:null, gaenge: gaenge>1?gaenge:null,
            zeitfenster: gaenge>1? zeiten[gi] : null,
            gruppen,
            erledigt:false, quelle:'auto', notiz:null
          });
        }
      });
    });
    return out.sort(this.dringlichkeit);
  },

  /* hoch vor normal vor niedrig, danach: je überfälliger, desto weiter vorne */
  dringlichkeit(a,b){
    const p={hoch:0,normal:1,niedrig:2};
    return (p[a.prioritaet]-p[b.prioritaet]) || (b.ueberfaellig-a.ueberfaellig)
           || ((a.zeitfenster??99)-(b.zeitfenster??99));
  },

  /* ---- Admin-Eingriffe: überleben jede Neuberechnung ---- */
  eingriff(datum, key){ return (Store.db.eingriffe[datum]||{})[key] || null; },
  setzeEingriff(datum, key, daten){
    const tag = Store.db.eingriffe[datum] = Store.db.eingriffe[datum] || {};
    tag[key] = Object.assign({}, tag[key]||{}, daten);
    Store.mark();
  },
  loescheEingriff(datum, key){
    if(Store.db.eingriffe[datum]) delete Store.db.eingriffe[datum][key];
    Store.mark();
  },
  /* Eingriffe und Zusatzaufträge aus der Vergangenheit aufräumen,
     ebenso Aufträge, deren Feld oder Schiffe es nicht mehr gibt (Befund E3) */
  eingriffeAufraeumen(){
    const heute=D.today();
    Object.keys(Store.db.eingriffe).forEach(d=>{ if(d<heute) delete Store.db.eingriffe[d]; });
    Object.keys(Store.db.zusatz).forEach(d=>{
      if(d<heute){ delete Store.db.zusatz[d]; return; }
      Store.db.zusatz[d]=Store.db.zusatz[d].filter(a=>{
        if(!Store.feld(a.feldId)) return false;
        a.schiffIds=(a.schiffIds||[]).filter(id=>Store.db._sch[id]);
        a.nummern=a.schiffIds.map(id=>Store.db._sch[id].schiff.nummer).filter(n=>n!=='');
        return a.schiffIds.length>0;
      });
      if(!Store.db.zusatz[d].length) delete Store.db.zusatz[d];
    });
    /* dasselbe für bereits freigegebene Tage – sie werden nicht neu gerechnet */
    Object.values(Store.db.plan).forEach(tp=>{
      if(!tp.freigegeben) return;
      tp.auftraege=tp.auftraege.filter(a=>{
        if(!Store.feld(a.feldId)) return false;
        a.schiffIds=(a.schiffIds||[]).filter(id=>Store.db._sch[id]);
        return a.schiffIds.length>0;
      });
    });
    Object.keys(Store.db.plan).forEach(d=>{
      if(d<heute && !Store.db.plan[d].freigegeben) delete Store.db.plan[d];
    });
  },

  /* Auftrag mit den gespeicherten Admin-Änderungen überschreiben */
  overlay(a){
    const e=this.eingriff(a.datum, a.key);
    if(!e) return a;
    if(e.zielMm!=null) a.zielMm=e.zielMm;
    if(e.angepasstMm!==undefined){ a.angepasstMm=e.angepasstMm; a.anpassungManuell=true; }
    if(e.anpassungAngenommen!=null) a.anpassungAngenommen=e.anpassungAngenommen;
    if(e.prioritaet) a.prioritaet=e.prioritaet;
    if(e.notiz!==undefined) a.notiz=e.notiz;
    if(e.zielMm!=null) a.dauerMin=this.dauerFuer(a.schiffIds, a.zielMm).min;
    a.bearbeitet=true;
    return a;
  },

  /* ---- Plan über den Horizont erzeugen und Tage entzerren ---- */
  planen(startDatum, tage){
    const kap = Store.db.einstellungen.kapazitaetStandorte || 8;
    const horizont = tage || Store.db.einstellungen.planungsHorizont || 10;
    const plan = {};
    const virtuell = {};              // sektorId → zuletzt (geplant) bewässert

    for(let i=0;i<horizont;i++){
      const d = D.add(startDatum, i);
      const bestehend = Store.db.plan[d];

      /* Freigegebene Tage bleiben unangetastet (Handbuch-Invariante 6) –
         nur der Regenbezug wird nachgeführt. */
      if(bestehend && bestehend.freigegeben){
        bestehend.auftraege.forEach(a=>{
          const rg=this.regenAm(a.standortId, d);
          a.regenMm=rg||0;
          if(!a.anpassungManuell){
            if(rg){ const emp=this.regenEmpfehlung(a, rg);
              a.angepasstMm=emp.mm; a.anpassungText=emp.hinweis; }
            else if(!a.anpassungAngenommen){ a.angepasstMm=null; a.anpassungText=null; }
          }
          (a.sektorIds||[]).forEach(sid=> virtuell[sid]=d);
        });
        plan[d]=bestehend;
        this.kennzahlen(plan[d], kap);
        continue;
      }

      /* 1 · automatische Kandidaten für diesen Tag */
      let kandidaten = this.auftraegeFuer(d, virtuell);

      /* 2 · Eingriffe anwenden: entfernte raus, verschobene umhängen */
      const verschobenHierher=[];
      kandidaten = kandidaten.filter(a=>{
        const e=this.eingriff(d, a.key);
        if(e && e.entfernt) return false;
        if(e && e.verschobenNach && e.verschobenNach!==d){
          a.datum=e.verschobenNach; a.verschoben=true;
          verschobenHierher.push(a);                 // wandert weiter unten in den Zieltag
          return false;
        }
        return true;
      }).map(a=>this.overlay(a));

      /* 3 · Aufträge, die von einem FRÜHEREN Tag hierher verschoben wurden */
      const zugezogen=(this._parkplatz||[]).filter(a=>a.datum===d);
      this._parkplatz=(this._parkplatz||[]).filter(a=>a.datum!==d);
      zugezogen.forEach(a=>this.overlay(a));

      /* 4 · von Hand angelegte Aufträge */
      const zusatz=(Store.db.zusatz[d]||[]).map(a=>Object.assign({},a,{datum:d}));

      let alle=[...zugezogen, ...zusatz, ...kandidaten].sort(this.dringlichkeit);

      /* 5 · entzerren nach der Tageskapazität (Pflichtenheft §9.3/§9.5).
             Sortiert ist bereits nach Dringlichkeit. Was heute nicht mehr
             hineinpasst, wird nicht eingeplant – der Sektor bleibt „durstig",
             ist morgen noch überfälliger und steht dort weiter vorne.
             Fixe Aufträge (von Hand angelegt, verschoben, vom Admin bearbeitet)
             zählen mit, werden aber nie weggelassen. */
      const letzterTag = (i===horizont-1);
      let zurueckgestellt=0;
      if(!letzterTag){
        const maxAuftraege=Math.round(kap*2.5);
        const standorte=new Set(); const behalten=[];
        alle.forEach(a=>{
          const fix = a.quelle!=='auto' || a.verschoben || a.bearbeitet;
          const passtStandort = standorte.has(a.standortId) || standorte.size<kap;
          if(fix || (passtStandort && behalten.length<maxAuftraege)){
            standorte.add(a.standortId); behalten.push(a);
          } else zurueckgestellt++;
        });
        alle=behalten;
      }

      /* 6 · in den Zieltag verschobene für später parken */
      verschobenHierher.forEach(a=>{
        if(a.datum>d && a.datum<=D.add(startDatum,horizont-1))
          (this._parkplatz=this._parkplatz||[]).push(this.overlay(a));
      });

      plan[d] = { datum:d, auftraege:alle, freigegeben:false, zurueckgestellt };
      this.kennzahlen(plan[d], kap);
      alle.forEach(a=> (a.sektorIds||[]).forEach(sid=> virtuell[sid]=d));
    }
    this._parkplatz=[];
    return plan;
  },

  /* Kapazitäts-Kennzahlen eines Tages */
  kennzahlen(p, kap){
    kap = kap || Store.db.einstellungen.kapazitaetStandorte || 8;
    const st=new Set(p.auftraege.map(a=>a.standortId));
    p.standorte=st.size;
    p.kapazitaet=kap;
    p.maxAuftraege=Math.round(kap*2.5);
    p.ueberlastet = st.size>kap || p.auftraege.length>p.maxAuftraege;
    p.grund = st.size>kap ? 'standorte' : (p.auftraege.length>p.maxAuftraege?'auftraege':null);
    return p;
  },

  /* Plan neu rechnen und in den Store schreiben (freigegebene Tage bleiben) */
  planNeu(){
    this.clearRef();
    this.eingriffeAufraeumen();
    const neu = this.planen(D.today());
    /* nicht mehr gültige, nicht freigegebene Tage entfernen */
    Object.keys(Store.db.plan).forEach(d=>{
      if(!neu[d] && !Store.db.plan[d].freigegeben && d>=D.today()) delete Store.db.plan[d];
    });
    Object.entries(neu).forEach(([d,v])=>{ Store.db.plan[d]=v; });
    Store.mark();
    return neu;
  },

  leererTag(datum){
    return this.kennzahlen({datum, auftraege:[], freigegeben:false, nurLesen:true});
  },
  /* Lesen darf nicht schreiben: für Tage ausserhalb des Horizonts und für die
     Vergangenheit wird nichts mehr in Store.db.plan angelegt (Befund A7). */
  tagesPlan(datum){
    const p=Store.db.plan[datum];
    if(!p) return this.leererTag(datum);
    return this.kennzahlen(p);
  },
  imHorizont(datum){
    const h=Store.db.einstellungen.planungsHorizont||10;
    return datum>=D.today() && datum<=D.add(D.today(), h-1);
  },

  /* Auftrag auf den Vor-/Folgetag schieben – als Eingriff festgehalten,
     damit die nächste Neuberechnung ihn nicht dupliziert (Befund A5). */
  verschiebe(datum, auftragId, richtung){
    const von=this.tagesPlan(datum);
    const a=von.auftraege.find(x=>x.id===auftragId);
    if(!a) return {ok:false, grund:'Auftrag nicht gefunden'};
    const ziel=D.add(datum, richtung);
    if(!this.imHorizont(ziel))
      return {ok:false, grund: ziel<D.today()
        ? 'Ein Auftrag lässt sich nicht in die Vergangenheit schieben.'
        : 'Das liegt ausserhalb des Planungshorizonts.'};
    if(a.quelle==='manuell'){
      const liste=Store.db.zusatz[datum]||[];
      const i=liste.findIndex(x=>x.id===auftragId);
      if(i>=0){ const [w]=liste.splice(i,1); w.datum=ziel;
        (Store.db.zusatz[ziel]=Store.db.zusatz[ziel]||[]).push(w); }
    } else {
      this.setzeEingriff(a.ursprung||datum, a.key, {verschobenNach:ziel});
    }
    this.planNeu();
    return {ok:true, ziel};
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
  },

  /* ---- Was die Planung stillschweigend ausbremst, sichtbar machen ----
     Alles hier Gelistete führte bisher dazu, dass Sektoren kommentarlos
     aus dem Plan fielen (frühere Befunde A1, A9, A10, C13).            */
  probleme(){
    const p={ ohneRegel:[], ohneKultur:[], verwaisteRegeln:[], journalOhneFeld:[],
              ohneRohr:[], ohneGemeinde:0 };
    const genutzteRegeln=new Set();
    Store.db.felder.forEach(f=>{
      if(f.bewaessert===false) return;
      if(f.gemeindeFehlt) p.ohneGemeinde++;
      if(!Store.feldRohre(f).length) p.ohneRohr.push(f);
      f.schiffe.forEach(s=>{
        const sk=(s.sektoren||[]).filter(k=>k.kulturId);
        if(!sk.length){ p.ohneKultur.push({feld:f, schiff:s}); return; }
        sk.forEach(k=>{
          const key=Store.regelKey(f.id,k.kulturId);
          if(Store.db.regeln[key]) genutzteRegeln.add(key);
          else p.ohneRegel.push({feld:f, schiff:s, sektor:k, kultur:Store.kultur(k.kulturId)});
        });
      });
    });
    Object.keys(Store.db.regeln).forEach(key=>{
      if(genutzteRegeln.has(key)) return;
      const [fid,kid]=key.split('::');
      p.verwaisteRegeln.push({key, feld:Store.feld(fid), kultur:Store.kultur(kid)});
    });
    p.journalOhneFeld=this.journalFelder().filter(j=>!this.feldFuerJournal(j));
    p.planbar = Store.sektoren().filter(e=>e.sektor.kulturId &&
                  Store.regel(e.feld.id, e.sektor.kulturId)).length;
    return p;
  }
};
