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

  /* ---- Erfahrungswerte ------------------------------------------
     Tragende Grösse ist der DURCHFLUSS je Sprenkler (m³/h), nicht mm/h.
     Begründung in docs/modell.md, H2: mm/h entsteht aus drei Messungen und
     einer Wurfweiten-Annahme und erbt deren Fehler; gemessen werden nur
     Menge und Zeit. Zeitlich getrennt geprüft sinkt der Median-Fehler der
     Dauerprognose von 28 auf 12 Minuten, der Anteil innerhalb ±30 % steigt
     von 64 auf 89 %.

     Die Schätzung je Schiff wird gedämpft (Shrinkage, H4): nur rund ein
     Viertel der Streuung geht auf echte Schiffunterschiede zurück, der Rest
     ist Rauschen zwischen zwei Gängen. Je weniger Gänge ein Schiff hat, desto
     stärker zieht der Schätzer Richtung Feld- und Betriebswert.         */
  _refCache:null,

  modell(){ return Store.db.modell || {}; },

  /* Rollomat: fahrbarer Regner, andere Flächen- und Zeitlogik.
     Gehört nicht in die Erfahrungswerte der Standregner (Audit 5b). */
  istRollomat(e){
    return /rolo/i.test(String(e.schiffRoh||'')) || /rolo/i.test(String(e.bemerkung||''));
  },

  /* Fläche einer Schiffgruppe in m², mit Herkunft */
  flaecheFuer(schiffIds){
    let m2=0, fehlt=0;
    (schiffIds||[]).forEach(id=>{
      const i=Store.db._sch[id]; if(!i){ fehlt++; return; }
      const f=Store.schiffFlaecheM2(i.schiff, i.feld);
      if(f) m2+=f; else fehlt++;
    });
    if(!m2) return W.mk(null,'keine');
    const eigen=(schiffIds||[]).every(id=>{
      const i=Store.db._sch[id]; return i && (i.schiff.aren || (i.schiff.laengeM&&i.schiff.breiteM));
    });
    return W.mk(m2, fehlt ? 'annahme' : (eigen ? 'messung' : 'annahme'), {n:null});
  },

  /* Beregnete Fläche der alten Betriebsformel – nur noch für den Vergleich
     und den umschaltbaren mm-Bezug (H1: als Rechengrösse aufgegeben). */
  beregneteFlaeche(kreis, sektor){
    const s = Store.db.einstellungen.sprenkler || {breite:18, abstandKreis:23, abstandSektor:11.5};
    return (kreis||0)*s.breite*s.abstandKreis + (sektor||0)*s.breite*s.abstandSektor;
  },

  /* Ab welchem Verhältnis von beregneter zu genannter Fläche die
     Schiffzuordnung eines Journaleintrags unglaubwürdig wird.
     Verteilung über 798 auswertbare Einträge: Median 0,71, p90 1,51,
     p95 1,82, Maximum 4,65. Über 2,5 liegen 27 Einträge (3,4 %), und deren
     Median-mm ist mit 25,4 gegen 10,1 mm zweieinhalbfach überhöht — die
     genannten Schiffe können die eingetragenen Sprenkler nicht tragen.
     Die Schwelle beschreibt den Schwanz der eigenen Verteilung, nicht einen
     absoluten Wert; ein falsch gesetzter Sprenklerabstand verschiebt alle
     Werte gemeinsam und ändert daran nichts. */
  DECKUNG_MAX: 2.5,

  /* Beregnete Fläche geteilt durch die Fläche der genannten Schiffe. */
  deckungVon(e){
    const bf=this.beregneteFlaeche(e.kreisregner, e.sektorregner);
    if(!bf) return null;
    const f=this.feldFuerJournal(e.feldJournal);
    if(!f) return null;
    const n=new Set((e.schiffe||[]).map(String));
    const m2=f.schiffe.filter(s=>n.has(String(s.nummer)))
                      .reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f)||0),0);
    return m2 ? bf/m2 : null;
  },
  /* „Für so viele Sprenkler ist die genannte Fläche zu klein" — dann fehlen
     Schiffe im Eintrag, und jede mm-Zahl daraus ist zu hoch. Die Menge in m³
     bleibt gültig, sie ist gemessen. */
  zuordnungFraglich(e){
    const d=this.deckungVon(e);
    return d!=null && d>this.DECKUNG_MAX;
  },

  /* mm eines Journaleintrags — beide Definitionen, plus die eingestellte */
  mmBeide(e){
    if(!e || !e.m3) return {flaeche:null, beregnet:null};
    const bf=this.beregneteFlaeche(e.kreisregner, e.sektorregner);
    const f=this.feldFuerJournal(e.feldJournal);
    let kf=null;
    if(f){
      const tr=f.schiffe.filter(s=>(e.schiffe||[]).includes(String(s.nummer)));
      kf=(tr.length?tr:[]).reduce((a,s)=>a+(Store.schiffFlaecheM2(s,f)||0),0)||null;
    }
    return { flaeche: kf ? U.m3NachMm(e.m3, kf) : null,
             beregnet: bf ? U.m3NachMm(e.m3, bf) : null };
  },
  mmVonEintrag(e){
    const b=this.mmBeide(e);
    return Store.db.einstellungen.mmBezug==='beregnet' ? b.beregnet : (b.flaeche ?? b.beregnet);
  },

  refWerte(){
    if(this._refCache) return this._refCache;
    const M=this.modell();
    const proSchiff={}, proFeld={}; const alle=[];
    let unzuordenbar=0, ohneRegner=0, verworfen=0, rollomat=0;
    Store.db.journal.forEach(e=>{
      if(this.istRollomat(e)){ rollomat++; return; }
      if(!e.m3 || !e.dauerMin || e.dauerMin<5) return;
      const f = this.feldFuerJournal(e.feldJournal); if(!f) return;
      const regner = (e.kreisregner||0)+(e.sektorregner||0);
      if(!regner){ ohneRegner++; return; }
      const q = e.m3/U.minNachH(e.dauerMin)/regner;         // m³/h je Sprenkler
      /* Physikalische Schranke statt selbstberechnetem Schwellenwert:
         ein Feldregner bei 4–5 bar liefert 1–3 m³/h. */
      if(!isFinite(q) || q<0.5 || q>5){ verworfen++; return; }
      const betroffen = f.schiffe.filter(s=> (e.schiffe||[]).includes(String(s.nummer)));
      if(!betroffen.length) unzuordenbar++;
      betroffen.forEach(s=>{
        (proSchiff[s.id]=proSchiff[s.id]||[]).push({q, datum:e.datum,
          kreis: e.kreisregner!=null ? e.kreisregner/betroffen.length : null,
          sektor: e.sektorregner!=null ? e.sektorregner/betroffen.length : null});
      });
      (proFeld[f.id]=proFeld[f.id]||[]).push(q);
      alle.push(q);
    });
    const med = a => { if(!a||!a.length) return null; const b=[...a].sort((x,y)=>x-y);
      const m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; };
    const out={ schiff:{}, feld:{}, global: med(alle), n:alle.length,
                unzuordenbar, ohneRegner, verworfen, rollomat };
    Object.entries(proSchiff).forEach(([k,v])=>{
      v.sort((a,b)=> a.datum<b.datum?1:(a.datum>b.datum?-1:0));
      const use=v.slice(0,8);                     // H6: ungewichtetes Fenster, keine Zeitgewichtung
      out.schiff[k]={ q: med(use.map(x=>x.q)), n:v.length,
        kreis:  med(use.map(x=>x.kreis ).filter(x=>x!=null)),
        sektor: med(use.map(x=>x.sektor).filter(x=>x!=null)) };
    });
    Object.entries(proFeld).forEach(([k,v])=> out.feld[k]={q:med(v), n:v.length});
    this._refCache=out; return out;
  },
  clearRef(){ this._refCache=null; },

  /* Durchfluss je Sprenkler für eine Schiffgruppe, mit Herkunft und Streuung.
     Shrinkage: Gewicht des Schiffwerts = n / (n + λ), λ aus der Varianzzerlegung. */
  qFuerSchiffe(schiffIds){
    const R=this.refWerte(), M=this.modell();
    const lam = M.shrinkageLambda ?? 2.8;
    const sdInnen = M.sdInnerhalbSchiff ?? 0.334;
    const werte=[];
    (schiffIds||[]).forEach(id=>{
      const info=Store.db._sch[id];
      const rs=R.schiff[id];
      const rf=info && R.feld[info.feld.id];
      const basis = (rf&&rf.q) ? {q:rf.q, quelle:'feld', n:rf.n} :
                    (R.global ? {q:R.global, quelle:'betrieb', n:R.n} : null);
      if(rs && rs.q){
        const gew = rs.n/(rs.n+lam);
        const q = basis ? gew*rs.q + (1-gew)*basis.q : rs.q;
        werte.push({q, quelle: gew>0.5?'schiff':(basis?basis.quelle:'schiff'), n:rs.n});
      } else if(basis){
        werte.push({q:basis.q, quelle:basis.quelle, n:basis.n});
      }
    });
    if(!werte.length) return W.mk(null,'keine');
    const q = werte.reduce((a,b)=>a+b.q,0)/werte.length;
    const nMin = Math.min(...werte.map(x=>x.n||0));
    const quelle = werte.map(x=>x.quelle).sort((a,b)=>W.RANG[b]-W.RANG[a])[0];
    /* Streuung des gedämpften Schätzers: sd innerhalb / √(n + λ) */
    const sd = sdInnen/Math.sqrt(Math.max(1, nMin + lam));
    return W.mk(q, quelle, {n:nMin, sd});
  },

  /* Empfohlene Sprenklerzahl — additiv je Schiff (H5) */
  sprenklerFuer(schiffIds){
    const R=this.refWerte(), M=this.modell();
    let kreis=0, sektor=0, flaeche=0, ausHistorie=false, geschaetzt=false, nMin=null;
    (schiffIds||[]).forEach(id=>{
      const info=Store.db._sch[id]; if(!info) return;
      const fl=Store.schiffFlaecheM2(info.schiff, info.feld)||0;
      flaeche+=fl;
      const r=R.schiff[id];
      if(r && (r.kreis!=null || r.sektor!=null)){
        kreis+=r.kreis||0; sektor+=r.sektor||0; ausHistorie=true;
        nMin = nMin==null?r.n:Math.min(nMin,r.n);
      } else if(fl){
        /* keine Historie: aus der Fläche und der gefitteten Flächenwirkung je
           Kreisregner hochrechnen — ausdrücklich eine Annahme, kein Messwert */
        const je = M._h1_flaecheJeKreisregnerM2_gefittet || 446;
        kreis += fl/je; geschaetzt=true;
      }
    });
    if(!kreis && !sektor) return W.mk(null,'keine');
    const wert={kreis:Math.max(1,Math.round(kreis)), sektor:Math.round(sektor)||null,
                gesamt:Math.max(1,Math.round(kreis+sektor)), flaecheM2:Math.round(flaeche)};
    return W.mk(wert, geschaetzt ? (ausHistorie?'feld':'annahme') : 'schiff', {n:nMin});
  },

  /* ---- Ein Gang: Fläche → Wassermenge → Dauer -------------------
     Kein Zirkelschluss mehr: die Zielmenge bezieht sich auf die Kulturfläche
     (fest), die Sprenklerzahl bestimmt nur, wie schnell sie zusammenkommt. */
  gangFuer(schiffIds, zielMm, sprenklerZahl){
    const M=this.modell();
    const fl=this.flaecheFuer(schiffIds);
    const spr=this.sprenklerFuer(schiffIds);
    const n = sprenklerZahl || (W.wert(spr) ? W.wert(spr).gesamt : null);
    const q = this.qFuerSchiffe(schiffIds);

    let zielM3=null, flaecheQuelle=fl;
    if(Store.db.einstellungen.mmBezug==='beregnet'){
      const s=W.wert(spr);
      const bf=s ? this.beregneteFlaeche(s.kreis, s.sektor) : null;
      zielM3 = bf ? U.mmNachM3(zielMm, bf) : null;
      flaecheQuelle = W.mk(bf, 'annahme');
    } else {
      zielM3 = U.mmNachM3(zielMm, W.wert(fl));
    }
    if(zielM3==null || !n || W.wert(q)==null)
      return {flaecheM2:fl, zielM3:null, sprenkler:spr, qM3h:null,
              dauerMin:W.mk(null, W.wert(fl)==null?'keine':'keine')};

    const qGesamt = W.wert(q)*n;
    const dauer = U.dauerMin(zielM3, qGesamt);
    /* Unsicherheit: die Dauer ist umgekehrt proportional zum Durchfluss,
       die relative Streuung überträgt sich also direkt. */
    const rel = W.relSd(q);
    const w = W.ableiten(dauer, [fl, q, spr],
                         {sd: rel!=null ? dauer*rel : null, n:q.n});
    return {flaecheM2:flaecheQuelle, zielM3, sprenkler:spr,
            qM3h:W.mk(qGesamt, q.quelle, {n:q.n}), dauerMin:w};
  },

  /* Kompatible Kurzform – liefert weiterhin {min, quelle} und zusätzlich den Wert mit Herkunft */
  dauerFuer(schiffIds, zielMm){
    const g=this.gangFuer(schiffIds, zielMm);
    return { min: W.wert(g.dauerMin), quelle: g.dauerMin.quelle==='keine'?'keine':g.dauerMin.quelle,
             w: g.dauerMin, gang: g };
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
  /* Regen, der beim Bestand ANKOMMT. Unter Folie oder Glas kommt keiner an.
     Ohne diese Unterscheidung würde die App einen Tunnel wegen Regen
     überspringen — der einzige Punkt, an dem eine falsche Annahme in dieser
     Rechnung nicht nur ungenau, sondern schädlich ist.
     `feld` darf fehlen; dann gilt der Standortwert (Verhalten wie bisher). */
  regenFuerFeld(feld, standortId, datum){
    if(feld && feld.ueberdacht) return 0;
    return this.regenAm(standortId, datum);
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
      const rg = tag<ende ? this.regenFuerFeld(feld, standort.id, tag) : 0;
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
  auftraegeFuer(datum, virtuell, vorziehen){
    const roh=[];
    Store.sektoren().forEach(e=>{
      const s=e.sektor;
      if(e.feld.bewaessert===false) return;
      if(s.pausiert && (!s.pausiertBis || s.pausiertBis >= datum)) return;
      if(!s.kulturId) return;
      const b=this.bilanz(e, datum, virtuell); if(!b) return;
      /* Hat der Admin den Auftrag auf einen früheren Tag gezogen, zählt er dort
         schon ab halbem Defizit als fällig – sonst liesse er sich nicht vorziehen. */
      const frueher = vorziehen && vorziehen.has(e.feld.id+'|'+s.kulturId);
      const schwelle = frueher ? b.menge*0.5 : b.menge*0.95;
      if(b.defizit < schwelle) return;
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
        /* Dringlichkeit als VIELFACHES der Regelmenge, nicht in Tagen.
           Tage sind zwischen Rhythmen nicht vergleichbar: eine tägliche Kultur,
           die einen Tag überfällig ist, hat einen ganzen Zyklus verpasst — eine
           Wochenkultur nach einem Tag ein Siebtel. Nach Tagen sortiert stehen
           deshalb systematisch die langsamen Kulturen vorne. */
        const dringlichkeit=Math.max(...paket.map(i=> i.b.menge? i.b.defizit/i.b.menge : 1));
        /* Rhythmustreue: wie nah der Abstand seit dem letzten Gang am eigenen
           Sollrhythmus liegt (0 = genau im Takt). Der Backtest zeigt, dass das
           der mit Abstand beste Sortierschlüssel ist — deutlich besser als die
           reine Dringlichkeit. Massgeblich ist das am besten passende Schiff
           im Paket, deshalb das Minimum. */
        const rhythmus=Math.min(...paket.map(i=>{
          const soll = i.b.proTag ? i.b.menge/i.b.proTag : null;
          const seit = i.b.letzte ? D.diff(i.b.letzte, datum) : null;
          return (soll==null || seit==null) ? 99 : Math.abs(seit-soll);
        }));
        /* Rückstand: so weit über der Regel, dass nicht mehr die Dringlichkeit
           die plausibelste Erklärung ist, sondern ein Fehler in den Stammdaten
           — Kultur abgeräumt, Regel zu eng, Gang nicht eingetragen. Solche
           Aufträge dürfen die Liste nicht anführen; sie brauchen eine
           Entscheidung, keinen Wassergang. */
        const rueckstand = dringlichkeit >= this.RUECKSTAND_AB;
        /* Ältestes Datum im Paket – dasselbe Schiff, das auch die Überfälligkeit bestimmt.
           Vorher stand hier das jüngste, was „1 Tag" neben „+64 Tage überfällig" ergab. */
        const letzte=paket.map(i=>i.b.letzte).filter(Boolean).sort()[0]||null;
        const geschaetzt=paket.some(i=>i.b.geschaetzt);
        const regen=this.regenFuerFeld(first.feld, first.standort.id, datum);
        /* Was am Standort gefallen ist, auch wenn es die Fläche nicht erreicht —
           sonst steht auf der Karte kommentarlos „0 mm Regen" an einem Regentag. */
        const regenStandort=this.regenAm(first.standort.id, datum);
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
            regenStandortMm:regenStandort||0, ueberdacht:!!first.feld.ueberdacht,
            dringlichkeit, rhythmus, rueckstand,
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
    return out.sort(this.reihung);
  },

  /* Ab welchem Vielfachen der Regelmenge ein Auftrag als Rückstand gilt.
     Im Backtest ist das Ergebnis zwischen 2,0 und 4,0 praktisch gleich
     (362–375 Treffer), die Wahl ist also nicht an die Daten angepasst. */
  RUECKSTAND_AB: 2.5,

  /* Reihenfolge der Aufträge. Belegt durch den Backtest (tools/backtest.js):
       nach Dringlichkeit sortiert   177 Treffer   0,68× Zufall
       gestuft + Rhythmustreue       423 Treffer   1,62× Zufall
     Nach purer Dringlichkeit zu sortieren war schlechter als würfeln, weil ein
     grosses Defizit meist keinen grossen Bedarf anzeigt, sondern ein Schiff,
     das aus der Rotation gefallen ist. Die Bewässerungsquote fällt mit
     steigender Dringlichkeit: 52 % bei 1,0–1,5 gegen 16 % über 3.
     Deshalb: Priorität, dann plausible Aufträge vor Rückständen, dann wer am
     genauesten im eigenen Takt liegt, erst dann das Defizit. */
  reihung(a,b){
    const p={hoch:0,normal:1,niedrig:2};
    return (p[a.prioritaet]-p[b.prioritaet])
           || ((a.rueckstand?1:0)-(b.rueckstand?1:0))
           || ((a.rhythmus??99)-(b.rhythmus??99))
           || ((b.dringlichkeit??1)-(a.dringlichkeit??1))
           || (b.ueberfaellig-a.ueberfaellig)
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

    /* Verschiebungen des Admins vorab auswerten.
       Nach vorne geschoben  → der Auftrag ist bis zum Zieltag gesperrt.
       Nach hinten gezogen   → er darf am Zieltag schon früher fällig werden.
       Beides hängt am stabilen key, nicht am Ursprungstag – deshalb bleibt es
       auch nach mehrfachem Verschieben genau EIN Auftrag. */
    const sperre={}, vorziehen={};
    Object.entries(Store.db.eingriffe).forEach(([tag,keys])=>{
      Object.entries(keys).forEach(([key,e])=>{
        if(!e.verschobenNach) return;
        const von=e.verschobenVon||tag;
        if(e.verschobenNach>von) sperre[key]=e.verschobenNach;
        else if(e.verschobenNach<von) vorziehen[key]=e.verschobenNach;
      });
    });
    const prefix = k => k.split('~').slice(0,2).join('|');

    for(let i=0;i<horizont;i++){
      const d = D.add(startDatum, i);
      const bestehend = Store.db.plan[d];

      /* Freigegebene Tage bleiben unangetastet (Handbuch-Invariante 6) –
         nur der Regenbezug wird nachgeführt. */
      if(bestehend && bestehend.freigegeben){
        bestehend.auftraege.forEach(a=>{
          const fd=Store.feld(a.feldId);
          const rg=this.regenFuerFeld(fd, a.standortId, d);
          a.regenMm=rg||0;
          /* auch auf freigegebenen Tagen nachführen, sonst fehlt dem Wassermann
             die Erklärung, warum an einem Regentag nichts gekürzt wird */
          a.regenStandortMm=this.regenAm(a.standortId, d)||0;
          a.ueberdacht=!!(fd && fd.ueberdacht);
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

      /* 1 · automatische Kandidaten für diesen Tag; vorgezogene dürfen früher rein */
      const heuteVorziehen=new Set(Object.entries(vorziehen)
        .filter(([k,ziel])=>ziel===d).map(([k])=>prefix(k)));
      let kandidaten = this.auftraegeFuer(d, virtuell, heuteVorziehen);

      /* 2 · Eingriffe anwenden: entfernte raus, gesperrte warten auf ihren Zieltag */
      kandidaten = kandidaten.filter(a=>{
        if(this.eingriff(d, a.key)?.entfernt) return false;
        if(sperre[a.key]){
          if(d < sperre[a.key]) return false;            // noch gesperrt
          a.verschoben=true;                             // am Zieltag angekommen
        }
        if(vorziehen[a.key] && d===vorziehen[a.key]) a.verschoben=true;
        return true;
      }).map(a=>this.overlay(a));

      /* 3 · von Hand angelegte Aufträge */
      const zusatz=(Store.db.zusatz[d]||[]).map(a=>Object.assign({},a,{datum:d}));

      let alle=[...zusatz, ...kandidaten].sort(this.reihung);

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

      plan[d] = { datum:d, auftraege:alle, freigegeben:false, zurueckgestellt };
      this.kennzahlen(plan[d], kap);
      alle.forEach(a=> (a.sektorIds||[]).forEach(sid=> virtuell[sid]=d));
    }
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
      /* Der Eingriff wandert MIT dem Auftrag auf den Zieltag – sonst findet
         Engine.overlay() ihn dort nicht mehr und Menge, Notiz und Priorität
         gingen beim Verschieben verloren. */
      let daten={}, urspruenglich=a.ursprung||datum;
      Object.values(Store.db.eingriffe).forEach(keys=>{
        const e=keys[a.key]; if(!e) return;
        if(e.verschobenVon) urspruenglich=e.verschobenVon;
        daten=Object.assign(daten, e);
        delete keys[a.key];
      });
      if(ziel===urspruenglich){ delete daten.verschobenNach; delete daten.verschobenVon; }
      else { daten.verschobenNach=ziel; daten.verschobenVon=urspruenglich; }
      if(Object.keys(daten).length) this.setzeEingriff(ziel, a.key, daten);
      else Store.mark();
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
