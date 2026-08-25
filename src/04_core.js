"use strict";

/* ============================================================
   KERN: Hilfsfunktionen, Übersetzungen, Datenspeicher
   ============================================================ */
const $  = (s,r)=> (r||document).querySelector(s);
const el = (t,c,h)=>{const n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n;};
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => (p||'x')+'-'+Math.random().toString(36).slice(2,9);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num = v => (v===''||v==null||isNaN(+v))?null:+v;

/* --- Datum: konsequent lokale ISO-Tage, keine Zeitzonen-Fallen --- */
const D = {
  today(){ return D.iso(new Date()); },
  iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
  parse(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); },
  add(s,n){ const d=D.parse(s); d.setDate(d.getDate()+n); return D.iso(d); },
  diff(a,b){ return Math.round((D.parse(b)-D.parse(a))/86400000); },
  wd(s){ return ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][D.parse(s).getDay()]; },
  nice(s){ const d=D.parse(s); return D.wd(s)+', '+d.getDate()+'. '+
    ['Jan','Feb','März','April','Mai','Juni','Juli','Aug','Sept','Okt','Nov','Dez'][d.getMonth()]; },
  niceFull(s){ if(!s||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s||'';
    const d=D.parse(s); return d.getDate()+'. '+
    ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][d.getMonth()]
    +' '+d.getFullYear(); },
  rel(s){ const n=D.diff(D.today(),s); return n===0?'Heute':n===1?'Morgen':n===-1?'Gestern':
    (n>0?'in '+n+' Tagen':'vor '+(-n)+' Tagen'); }
};
const hhmm = m => { if(m==null) return '–'; m=Math.round(m); const h=Math.floor(m/60), r=m%60;
  return h?(h+' h '+(r?String(r).padStart(2,'0')+' min':'')).trim():r+' min'; };
const nowHM = () => { const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
const hm2min = s => { if(!s||!/^\d{1,2}:\d{2}$/.test(s)) return null; const [h,m]=s.split(':').map(Number); return h*60+m; };

/* --- Geometrie --- */
function polyArea(p){ let a=0; for(let i=0;i<p.length;i++){const [x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length]; a+=x1*y2-x2*y1;} return Math.abs(a/2); }
function polyCenter(p){ let x=0,y=0; p.forEach(q=>{x+=q[0];y+=q[1];}); return [x/p.length,y/p.length]; }
function polyBBox(p){ const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}; }

/* ---------- Übersetzungen (Wassermann-Oberfläche) ---------- */
const I18N = {
  de:{ heute:'Heute', morgen:'Morgen', auftraege:'Aufträge', keinPlan:'Noch kein Plan freigegeben',
    keinPlanSub:(n)=>'Bitte '+n+' anrufen.', schiff:'Schiff', schiffe:'Schiffe', ziel:'Ziel', dauer:'Dauer',
    starten:'Bewässerung starten', stoppen:'Bewässerung stoppen', laeuft:'läuft', erledigt:'erledigt',
    lageplan:'Lageplan ansehen', welcheSchiffe:'Welche Schiffe hast du bewässert?', startzeit:'Startzeit',
    stoppzeit:'Stoppzeit', zaehlerStart:'Wasseruhr Start (m³)', zaehlerStop:'Wasseruhr Stopp (m³)',
    kreisregner:'Kreisregner', sektorregner:'Sektorregner', bemerkung:'Bemerkung (optional)',
    speichern:'Speichern', abbrechen:'Abbrechen', zurueck:'Zurück', wassermenge:'Wassermenge',
    rechner:'Dauer-Rechner', rechnerSub:'Wie lange für eine bestimmte Menge?', berechnen:'Berechnen',
    keineDaten:'Noch keine Erfahrungswerte für diese Schiffe',
    nachtFrage:'Lief die Bewässerung über Nacht?', nachtJa:'Ja, über Nacht', nachtNein:'Nein, Fehler korrigieren',
    schaffNicht:'Schaffe ich heute nicht', sprache:'Sprache', laufend:'Läuft gerade',
    fertig:'Fertig', neuerEintrag:'Eintrag ohne Auftrag', historie:'Bisherige Einträge',
    zielMenge:'Zielmenge (mm)', empfDauer:'Empfohlene Dauer', pflicht:'Bitte ausfüllen',
    gespeichert:'Gespeichert', keineAuftraege:'Für diesen Tag ist nichts eingeplant.' },
  hu:{ heute:'Ma', morgen:'Holnap', auftraege:'Feladatok', keinPlan:'Még nincs jóváhagyott terv',
    keinPlanSub:(n)=>'Kérlek hívd fel: '+n+'.', schiff:'Schiff', schiffe:'Schiffe', ziel:'Cél', dauer:'Időtartam',
    starten:'Öntözés indítása', stoppen:'Öntözés leállítása', laeuft:'fut', erledigt:'kész',
    lageplan:'Térkép megtekintése', welcheSchiffe:'Melyik Schiff-eket öntözted?', startzeit:'Kezdés',
    stoppzeit:'Befejezés', zaehlerStart:'Vízóra indulás (m³)', zaehlerStop:'Vízóra leállás (m³)',
    kreisregner:'Körszórófej', sektorregner:'Szektorszórófej', bemerkung:'Megjegyzés (nem kötelező)',
    speichern:'Mentés', abbrechen:'Mégse', zurueck:'Vissza', wassermenge:'Vízmennyiség',
    rechner:'Időtartam-számoló', rechnerSub:'Mennyi ideig egy adott mennyiséghez?', berechnen:'Számítás',
    keineDaten:'Még nincs tapasztalati adat ezekhez a Schiff-ekhez',
    nachtFrage:'Egész éjjel ment az öntözés?', nachtJa:'Igen, egész éjjel', nachtNein:'Nem, javítás',
    schaffNicht:'Ma nem tudom megcsinálni', sprache:'Nyelv', laufend:'Most fut',
    fertig:'Kész', neuerEintrag:'Bejegyzés feladat nélkül', historie:'Korábbi bejegyzések',
    zielMenge:'Célmennyiség (mm)', empfDauer:'Javasolt időtartam', pflicht:'Kérlek töltsd ki',
    gespeichert:'Elmentve', keineAuftraege:'Erre a napra nincs betervezve semmi.' },
  pl:{ heute:'Dzisiaj', morgen:'Jutro', auftraege:'Zadania', keinPlan:'Plan jeszcze niezatwierdzony',
    keinPlanSub:(n)=>'Proszę zadzwonić do: '+n+'.', schiff:'Schiff', schiffe:'Schiffe', ziel:'Cel', dauer:'Czas',
    starten:'Rozpocznij nawadnianie', stoppen:'Zakończ nawadnianie', laeuft:'trwa', erledigt:'gotowe',
    lageplan:'Zobacz plan terenu', welcheSchiffe:'Które Schiffe nawadniałeś?', startzeit:'Początek',
    stoppzeit:'Koniec', zaehlerStart:'Wodomierz start (m³)', zaehlerStop:'Wodomierz stop (m³)',
    kreisregner:'Zraszacz okrągły', sektorregner:'Zraszacz sektorowy', bemerkung:'Uwagi (opcjonalnie)',
    speichern:'Zapisz', abbrechen:'Anuluj', zurueck:'Wstecz', wassermenge:'Ilość wody',
    rechner:'Kalkulator czasu', rechnerSub:'Jak długo dla danej ilości?', berechnen:'Oblicz',
    keineDaten:'Brak danych z doświadczenia dla tych Schiffe',
    nachtFrage:'Czy nawadnianie trwało całą noc?', nachtJa:'Tak, całą noc', nachtNein:'Nie, popraw',
    schaffNicht:'Dzisiaj nie dam rady', sprache:'Język', laufend:'Trwa teraz',
    fertig:'Gotowe', neuerEintrag:'Wpis bez zadania', historie:'Wcześniejsze wpisy',
    zielMenge:'Ilość docelowa (mm)', empfDauer:'Zalecany czas', pflicht:'Proszę wypełnić',
    gespeichert:'Zapisano', keineAuftraege:'Na ten dzień nic nie zaplanowano.' }
};
let LANG='de';
const T = (k,...a)=>{ const v=(I18N[LANG]||I18N.de)[k] ?? I18N.de[k] ?? k; return typeof v==='function'?v(...a):v; };

/* ---------- UI-Helfer ---------- */
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),2400); }
function openModal(title, bodyHTML, footHTML, wide){
  const m=$('#modal'); m.className='modal'+(wide?' wide':'');
  m.innerHTML = `<div class="modal-h"><h3>${esc(title)}</h3><button class="x" onclick="closeModal()">✕</button></div>
    <div class="modal-b">${bodyHTML}</div>${footHTML?`<div class="modal-f">${footHTML}</div>`:''}`;
  $('#mask').classList.add('on'); return m;
}
function closeModal(){ $('#mask').classList.remove('on'); $('#modal').innerHTML=''; }
$('#mask').addEventListener('click',e=>{ if(e.target.id==='mask') closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

/* ============================================================
   STORE — ein Datenobjekt, geteilt von Admin und Wassermann
   ============================================================ */
const Store = {
  db:null,
  dirty:false,

  init(seed){
    this.db = {
      version: 3,
      erstellt: D.today(),
      einstellungen: {
        ansprechperson: 'Sammy',
        ansprechTelefon: '',
        adminMail: 'leitung@betrieb.ch',
        kapazitaetStandorte: seed.journal.kapazitaet.standorteP80 || 8,
        planungsHorizont: 10,
        erfahrungsstufe: 'neu',            // neu | erfahren  → Detailgrad Wassermann
        setupErledigt: false,
        letzteRegenStandorte: [],
        sprenkler: {breite:18, abstandKreis:23, abstandSektor:11.5}
      },
      standorte: seed.katalog.standorte,
      felder:    seed.katalog.felder,
      kulturen:  seed.kulturen,
      regeln:    seed.regeln,              // Standort+Kultur → Regel
      journal:   seed.journal.eintraege,
      journalProbleme: seed.journal.probleme,
      journalKapazitaet: seed.journal.kapazitaet,
      wetterstationen: seed.wetterstationen || [
        {id:'ws1', name:'Wetterstation 1', standortIds:[]},
        {id:'ws2', name:'Wetterstation 2', standortIds:[]},
        {id:'ws3', name:'Wetterstation 3', standortIds:[]}
      ],
      regen:     [],                       // {datum, mm, standortIds[], stationId}
      plan:      {},                       // datum → {auftraege:[], freigegeben:bool, notiz}
      laufend:   [],                       // offene Bewässerungen
      gruppen:   seed.gruppen || []
    };
    this.reindex();
  },

  reindex(){
    const d=this.db;
    d._st = Object.fromEntries(d.standorte.map(s=>[s.id,s]));
    d._fd = Object.fromEntries(d.felder.map(f=>[f.id,f]));
    d._sch = {};
    d.felder.forEach(f=> f.schiffe.forEach(s=>{ d._sch[s.id]={schiff:s, feld:f, standort:d._st[f.standortId]}; }));
    d._ku = Object.fromEntries(d.kulturen.map(k=>[k.id,k]));
  },
  mark(){ this.dirty=true; },

  feld(id){ return this.db._fd[id]; },
  standort(id){ return this.db._st[id]; },
  kultur(id){ return this.db._ku[id]; },
  felderVon(sid){ return this.db.felder.filter(f=>f.standortId===sid); },

  /* Regel-Schlüssel: pro Standort + Kultur (nicht pauschal pro Kulturart) */
  regelKey(feldId, kulturId){ return feldId+'::'+kulturId; },
  regel(feldId, kulturId){ return this.db.regeln[this.regelKey(feldId,kulturId)] || null; },
  setRegel(feldId, kulturId, r){ this.db.regeln[this.regelKey(feldId,kulturId)] = r; this.mark(); },
  /* Vorschlag: gleiche Kultur an einem anderen Standort schon geregelt? */
  regelVorschlag(kulturId){
    for(const [k,v] of Object.entries(this.db.regeln)) if(k.endsWith('::'+kulturId)) return v;
    return null;
  },

  /* alle Sektoren mit Kultur */
  sektoren(){
    const out=[];
    this.db.felder.forEach(f=> f.schiffe.forEach(s=> (s.sektoren||[]).forEach(k=>{
      out.push({sektor:k, schiff:s, feld:f, standort:this.db._st[f.standortId]});
    })));
    return out;
  },

  /* Fläche eines Schiffs in m² – Aren-Angabe hat Vorrang vor der Zeichnung */
  schiffFlaecheM2(schiff, feld){
    if(schiff.aren) return schiff.aren*100;
    const f = feld || this.db._sch[schiff.id]?.feld;
    if(!f) return null;
    if(f.gesamtflaecheAren && f.schiffe.length){
      const tot = f.schiffe.reduce((a,s)=>a+polyArea(s.polygon),0);
      if(tot>0) return f.gesamtflaecheAren*100*(polyArea(schiff.polygon)/tot);
      return f.gesamtflaecheAren*100/f.schiffe.length;
    }
    return null;
  },
  feldFlaecheM2(feld){
    if(feld.gesamtflaecheAren) return feld.gesamtflaecheAren*100;
    const s=feld.schiffe.reduce((a,x)=>a+(x.aren||0),0); return s?s*100:null;
  },

  /* ---------- Export / Import ---------- */
  exportFile(){
    const d = JSON.parse(JSON.stringify(this.db));
    ['_st','_fd','_sch','_ku'].forEach(k=>delete d[k]);
    const blob=new Blob([JSON.stringify(d)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='wasserplan_daten_'+D.today()+'_'+nowHM().replace(':','')+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    this.dirty=false; toast('Daten gesichert');
  },
  importDialog(){
    const i=document.createElement('input'); i.type='file'; i.accept='application/json';
    i.onchange=e=>{ const f=e.target.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=ev=>{ try{
          const d=JSON.parse(ev.target.result);
          if(!d.standorte||!d.felder) throw new Error('Unerwartetes Format');
          this.db=d; this.reindex(); this.dirty=false;
          App.home(); App.refreshStart(); toast('Daten geladen');
        }catch(err){ alert('Datei konnte nicht gelesen werden:\n'+err.message); } };
      r.readAsText(f); };
    i.click();
  }
};
window.addEventListener('beforeunload', e=>{ if(Store.dirty){ e.preventDefault(); e.returnValue=''; } });

