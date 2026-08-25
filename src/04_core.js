"use strict";

/* ============================================================
   KERN: Hilfsfunktionen, Übersetzungen, Datenspeicher
   ============================================================ */
const $  = (s,r)=> (r||document).querySelector(s);
const el = (t,c,h)=>{const n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n;};
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => (p||'x')+'-'+Math.random().toString(36).slice(2,9);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* num: leere und nur aus Leerzeichen bestehende Eingaben sind NICHT 0, sondern null */
const num = v => { if(v==null) return null; const s=String(v).trim();
  if(s==='') return null; const n=+s; return isNaN(n)?null:n; };
/* stabiler Hash für deterministisches Streuen (kein Math.random im Plan!) */
const hash = s => { let h=0; const t=String(s); for(let i=0;i<t.length;i++){ h=(h*31+t.charCodeAt(i))|0; } return h; };

/* ---------- Übersetzungen ---------- */
const I18N = {
  de:{ _wochentage:['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'],
    _monate:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    _monateKurz:['Jan','Feb','März','April','Mai','Juni','Juli','Aug','Sept','Okt','Nov','Dez'],
    _std:'h', _min:'min',
    _kurz:(d,wd,mk)=>wd+', '+d.getDate()+'. '+mk,
    _lang:(d,m)=>d.getDate()+'. '+m+' '+d.getFullYear(),
    heute:'Heute', morgen:'Morgen', gestern:'Gestern',
    inTagen:n=>'in '+n+' Tagen', vorTagen:n=>'vor '+n+' Tagen',
    auftraege:'Aufträge', keinPlan:'Noch kein Plan freigegeben',
    keinPlanSub:(n)=>'Bitte '+n+' anrufen.', schiff:'Schiff', schiffe:'Schiffe', ziel:'Ziel', dauer:'Dauer',
    starten:'Bewässerung starten', stoppen:'Bewässerung stoppen', laeuft:'läuft', erledigt:'erledigt',
    lageplan:'Lageplan ansehen', welcheSchiffe:'Welche Schiffe hast du bewässert?', startzeit:'Startzeit',
    stoppzeit:'Stoppzeit', zaehlerStart:'Wasseruhr Start', zaehlerStop:'Wasseruhr Stopp',
    kreisregner:'Kreisregner', sektorregner:'Sektorregner', bemerkung:'Bemerkung (optional)',
    speichern:'Speichern', abbrechen:'Abbrechen', zurueck:'Zurück', wassermenge:'Wassermenge',
    rechner:'Dauer-Rechner', rechnerSub:'Wie lange für eine bestimmte Menge?', berechnen:'Berechnen',
    keineDaten:'Noch keine Erfahrungswerte für diese Schiffe',
    nachtFrage:'Lief die Bewässerung über Nacht?', nachtJa:'Ja, über Nacht', nachtNein:'Nein, Fehler korrigieren',
    schaffNicht:'Schaffe ich heute nicht', sprache:'Sprache', laufend:'Läuft gerade',
    neuerEintrag:'Eintrag ohne Auftrag', historie:'Bisherige Einträge',
    zielMenge:'Zielmenge (mm)', empfDauer:'Empfohlene Dauer', pflicht:'Bitte ausfüllen',
    gespeichert:'Gespeichert', keineAuftraege:'Für diesen Tag ist nichts eingeplant.',
    /* neu */
    menue:'Menü', melden:'Melden', warumKurz:'Kurz warum? (optional)',
    meldungErfasst:'Meldung erfasst', keinMailHinweis:'Offline-Testversion: Es wird noch keine E-Mail verschickt.',
    mailWuerde:n=>'In der Online-Version ginge jetzt eine Nachricht an '+n+':',
    mailText:'Der Wassermann meldet, dass er den heutigen Plan nicht schafft.',
    mailGrund:g=>' Grund: '+g,
    schaetzwert:'Schätzwert', nochmalsEintragen:'Nochmals eintragen',
    planBedienung:'Ziehen zum Verschieben, + / − zum Zoomen.',
    ganzesFeld:'Ganzes Feld', vorbelegt:d=>'Vorbelegt aus dem letzten Eintrag vom '+d+' – bitte prüfen.',
    ergibtDauer:d=>'Das ergibt '+d+'. Bitte bestätigen.', bitteBestaetigen:'Bitte bestätigen',
    ausErfahrung:'aus Erfahrungswerten', keineSchiffe:'Noch keine Schiffe erfasst',
    sprenkler:'Sprenkler', empfSprenkler:'Empfohlene Sprenkler',
    zaehlerFalsch:'Der Stopp-Zählerstand liegt unter dem Start – bitte prüfen.',
    zeitfenster:'Zeitfenster', satz:'Satz', notizChef:'Hinweis vom Chef',
    fuerMengeAuf:(mm,n)=>'für '+mm+' mm auf '+n+' Schiffen',
    ueblichZusammen:'Üblicherweise zusammen' },

  hu:{ _wochentage:['vasárnap','hétfő','kedd','szerda','csütörtök','péntek','szombat'],
    _monate:['január','február','március','április','május','június','július','augusztus','szeptember','október','november','december'],
    _monateKurz:['jan.','febr.','márc.','ápr.','máj.','jún.','júl.','aug.','szept.','okt.','nov.','dec.'],
    _std:'ó', _min:'p',
    _kurz:(d,wd,mk)=>wd+', '+mk+' '+d.getDate()+'.',
    _lang:(d,m)=>d.getFullYear()+'. '+m+' '+d.getDate()+'.',
    heute:'Ma', morgen:'Holnap', gestern:'Tegnap',
    inTagen:n=>n+' nap múlva', vorTagen:n=>n+' napja',
    auftraege:'Feladatok', keinPlan:'Még nincs jóváhagyott terv',
    keinPlanSub:(n)=>'Kérlek hívd fel: '+n+'.', schiff:'Schiff', schiffe:'Schiffe', ziel:'Cél', dauer:'Időtartam',
    starten:'Öntözés indítása', stoppen:'Öntözés leállítása', laeuft:'fut', erledigt:'kész',
    lageplan:'Térkép megtekintése', welcheSchiffe:'Melyik Schiff-eket öntözted?', startzeit:'Kezdés',
    stoppzeit:'Befejezés', zaehlerStart:'Vízóra indulás', zaehlerStop:'Vízóra leállás',
    kreisregner:'Körszórófej', sektorregner:'Szektorszórófej', bemerkung:'Megjegyzés (nem kötelező)',
    speichern:'Mentés', abbrechen:'Mégse', zurueck:'Vissza', wassermenge:'Vízmennyiség',
    rechner:'Időtartam-számoló', rechnerSub:'Mennyi ideig egy adott mennyiséghez?', berechnen:'Számítás',
    keineDaten:'Még nincs tapasztalati adat ezekhez a Schiff-ekhez',
    nachtFrage:'Egész éjjel ment az öntözés?', nachtJa:'Igen, egész éjjel', nachtNein:'Nem, javítás',
    schaffNicht:'Ma nem tudom megcsinálni', sprache:'Nyelv', laufend:'Most fut',
    neuerEintrag:'Bejegyzés feladat nélkül', historie:'Korábbi bejegyzések',
    zielMenge:'Célmennyiség (mm)', empfDauer:'Javasolt időtartam', pflicht:'Kérlek töltsd ki',
    gespeichert:'Elmentve', keineAuftraege:'Erre a napra nincs betervezve semmi.',
    menue:'Menü', melden:'Jelentés', warumKurz:'Röviden miért? (nem kötelező)',
    meldungErfasst:'Jelentés rögzítve', keinMailHinweis:'Offline teszt verzió: még nem megy ki e-mail.',
    mailWuerde:n=>'Az online verzióban most üzenet menne ide: '+n+':',
    mailText:'A vízkezelő jelzi, hogy a mai tervet nem tudja teljesíteni.',
    mailGrund:g=>' Ok: '+g,
    schaetzwert:'becsült érték', nochmalsEintragen:'Újabb bejegyzés',
    planBedienung:'Húzd az eltoláshoz, + / − a nagyításhoz.',
    ganzesFeld:'Egész tábla', vorbelegt:d=>'Előre kitöltve a(z) '+d+' bejegyzés alapján – kérlek ellenőrizd.',
    ergibtDauer:d=>'Ez '+d+'. Kérlek erősítsd meg.', bitteBestaetigen:'Kérlek erősítsd meg',
    ausErfahrung:'tapasztalati adatból', keineSchiffe:'Még nincs Schiff rögzítve',
    sprenkler:'Szórófejek', empfSprenkler:'Javasolt szórófejek',
    zaehlerFalsch:'A leállási vízóraállás kisebb az indulásinál – kérlek ellenőrizd.',
    zeitfenster:'Időablak', satz:'Ültetés', notizChef:'Üzenet a főnöktől',
    fuerMengeAuf:(mm,n)=>mm+' mm '+n+' Schiff-re',
    ueblichZusammen:'Általában együtt' },

  pl:{ _wochentage:['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'],
    _monate:['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'],
    _monateKurz:['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'],
    _std:'godz', _min:'min',
    _kurz:(d,wd,mk)=>wd+', '+d.getDate()+' '+mk,
    _lang:(d,m)=>d.getDate()+' '+m+' '+d.getFullYear(),
    heute:'Dzisiaj', morgen:'Jutro', gestern:'Wczoraj',
    inTagen:n=>'za '+n+' dni', vorTagen:n=>n+' dni temu',
    auftraege:'Zadania', keinPlan:'Plan jeszcze niezatwierdzony',
    keinPlanSub:(n)=>'Proszę zadzwonić do: '+n+'.', schiff:'Schiff', schiffe:'Schiffe', ziel:'Cel', dauer:'Czas',
    starten:'Rozpocznij nawadnianie', stoppen:'Zakończ nawadnianie', laeuft:'trwa', erledigt:'gotowe',
    lageplan:'Zobacz plan terenu', welcheSchiffe:'Które Schiffe nawadniałeś?', startzeit:'Początek',
    stoppzeit:'Koniec', zaehlerStart:'Wodomierz start', zaehlerStop:'Wodomierz stop',
    kreisregner:'Zraszacz okrągły', sektorregner:'Zraszacz sektorowy', bemerkung:'Uwagi (opcjonalnie)',
    speichern:'Zapisz', abbrechen:'Anuluj', zurueck:'Wstecz', wassermenge:'Ilość wody',
    rechner:'Kalkulator czasu', rechnerSub:'Jak długo dla danej ilości?', berechnen:'Oblicz',
    keineDaten:'Brak danych z doświadczenia dla tych Schiffe',
    nachtFrage:'Czy nawadnianie trwało całą noc?', nachtJa:'Tak, całą noc', nachtNein:'Nie, popraw',
    schaffNicht:'Dzisiaj nie dam rady', sprache:'Język', laufend:'Trwa teraz',
    neuerEintrag:'Wpis bez zadania', historie:'Wcześniejsze wpisy',
    zielMenge:'Ilość docelowa (mm)', empfDauer:'Zalecany czas', pflicht:'Proszę wypełnić',
    gespeichert:'Zapisano', keineAuftraege:'Na ten dzień nic nie zaplanowano.',
    menue:'Menu', melden:'Zgłoś', warumKurz:'Krótko dlaczego? (opcjonalnie)',
    meldungErfasst:'Zgłoszenie zapisane', keinMailHinweis:'Wersja testowa offline: e-mail nie jest jeszcze wysyłany.',
    mailWuerde:n=>'W wersji online poszłaby teraz wiadomość do: '+n+':',
    mailText:'Nawadniający zgłasza, że nie da rady wykonać dzisiejszego planu.',
    mailGrund:g=>' Powód: '+g,
    schaetzwert:'wartość szacunkowa', nochmalsEintragen:'Wpisz ponownie',
    planBedienung:'Przeciągnij, aby przesunąć, + / − aby przybliżyć.',
    ganzesFeld:'Całe pole', vorbelegt:d=>'Wypełnione z ostatniego wpisu z '+d+' – proszę sprawdzić.',
    ergibtDauer:d=>'To daje '+d+'. Proszę potwierdzić.', bitteBestaetigen:'Proszę potwierdzić',
    ausErfahrung:'z danych doświadczalnych', keineSchiffe:'Brak zapisanych Schiffe',
    sprenkler:'Zraszacze', empfSprenkler:'Zalecane zraszacze',
    zaehlerFalsch:'Stan końcowy wodomierza jest niższy niż początkowy – proszę sprawdzić.',
    zeitfenster:'Okno czasowe', satz:'Nasadzenie', notizChef:'Uwaga od szefa',
    fuerMengeAuf:(mm,n)=>mm+' mm na '+n+' Schiffe',
    ueblichZusammen:'Zwykle razem' }
};
let LANG='de';
const T = (k,...a)=>{ const v=(I18N[LANG]||I18N.de)[k] ?? I18N.de[k] ?? k; return typeof v==='function'?v(...a):v; };
/* Sprachtabelle für Datum/Zeit – fällt immer auf Deutsch zurück */
const LT = k => (I18N[LANG]||I18N.de)[k] || I18N.de[k];

/* --- Datum: konsequent lokale ISO-Tage, keine Zeitzonen-Fallen --- */
const D = {
  today(){ return D.iso(new Date()); },
  iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
  ok(s){ return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s); },
  parse(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); },
  add(s,n){ const d=D.parse(s); d.setDate(d.getDate()+n); return D.iso(d); },
  diff(a,b){ return Math.round((D.parse(b)-D.parse(a))/86400000); },
  wd(s){ return LT('_wochentage')[D.parse(s).getDay()]; },
  nice(s){ if(!D.ok(s)) return s||''; const d=D.parse(s);
    return LT('_kurz')(d, D.wd(s), LT('_monateKurz')[d.getMonth()]); },
  niceFull(s){ if(!D.ok(s)) return s||''; const d=D.parse(s);
    return LT('_lang')(d, LT('_monate')[d.getMonth()]); },
  rel(s){ if(!D.ok(s)) return s||''; const n=D.diff(D.today(),s);
    return n===0?T('heute'):n===1?T('morgen'):n===-1?T('gestern'):
      (n>0?T('inTagen',n):T('vorTagen',-n)); }
};
const hhmm = m => { if(m==null) return '–'; m=Math.round(m); const h=Math.floor(m/60), r=m%60;
  const S=LT('_std'), M=LT('_min');
  return h?(h+' '+S+' '+(r?String(r).padStart(2,'0')+' '+M:'')).trim():r+' '+M; };
const nowHM = () => { const d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
const hm2min = s => { if(!s||!/^\d{1,2}:\d{2}$/.test(s)) return null; const [h,m]=s.split(':').map(Number); return h*60+m; };

/* ============================================================
   EINHEITEN — jede Zahl trägt ihre Einheit im Feldnamen.
   Konvention: …Mm (Millimeter) · …M3 (Kubikmeter) · …M2 (Quadratmeter)
   …Aren · …Min (Minuten) · …M3h (Kubikmeter je Stunde) · …M (Meter).
   Umgerechnet wird ausschliesslich hier — nirgends im Code steht eine 1000.
   ============================================================ */
const U = {
  arenNachM2: a => a==null?null : a*100,
  m2NachAren: m => m==null?null : m/100,
  /* Wassertiefe auf einer Fläche: wie viel m³ sind X mm auf Y m²? */
  mmNachM3: (mm, m2) => (mm==null||!m2) ? null : mm*m2/1000,
  m3NachMm: (m3, m2) => (m3==null||!m2) ? null : m3*1000/m2,
  minNachH:  min => min==null?null : min/60,
  hNachMin:  h   => h==null?null   : h*60,
  /* Dauer für eine Wassermenge bei gegebenem Durchfluss */
  dauerMin: (m3, m3h) => (m3==null||!m3h) ? null : m3/m3h*60
};

/* ============================================================
   WERT MIT HERKUNFT — jede abgeleitete Zahl weiss, woher sie kommt
   und wie sicher sie ist. {wert, quelle, n, sd}.
   Quellen, absteigend nach Verlässlichkeit:
     messung  gemessen, keine Ableitung
     schiff   aus der Historie genau dieses Schiffs
     feld     aus der Historie des Feldes
     betrieb  Betriebsschnitt
     annahme  gesetzt oder geschätzt, nicht aus Daten
     keine    nicht bestimmbar
   ============================================================ */
const W = {
  RANG: {messung:0, schiff:1, feld:2, betrieb:3, annahme:4, keine:5},
  mk(wert, quelle, opt){
    return {wert: wert==null?null:wert, quelle: quelle||'keine',
            n: opt&&opt.n!=null?opt.n:null, sd: opt&&opt.sd!=null?opt.sd:null};
  },
  leer(){ return W.mk(null,'keine'); },
  wert(w){ return (w && typeof w==='object' && 'wert' in w) ? w.wert : (w??null); },
  /* Herkunft weitergeben: das Ergebnis ist so sicher wie die schwächste Zutat */
  ableiten(wert, teile, opt){
    let q='messung';
    (teile||[]).forEach(t=>{ const tq=(t&&t.quelle)||'keine';
      if(W.RANG[tq] > W.RANG[q]) q=tq; });
    const ns=(teile||[]).map(t=>t&&t.n).filter(x=>x!=null);
    return W.mk(wert, q, Object.assign({n: ns.length?Math.min(...ns):null}, opt||{}));
  },
  /* relative Streuung – Grundlage für die Verlässlichkeitsstufe */
  relSd(w){ const v=W.wert(w); return (w&&w.sd!=null&&v)?Math.abs(w.sd/v):null; },
  stufe(w){
    if(!w || W.wert(w)==null) return 'keine';
    if(w.quelle==='messung') return 'gut';
    if(w.quelle==='annahme') return 'schwach';
    const n=w.n||0, r=W.relSd(w);
    if(n>=8 && (r==null || r<=0.30)) return 'gut';
    if(n>=3) return 'mittel';
    if(n>=1) return 'schwach';
    return w.quelle==='betrieb' ? 'schwach' : 'keine';
  },
  ZEICHEN: {gut:'●●●', mittel:'●●○', schwach:'●○○', keine:'○○○'},
  zeichen(w){ return W.ZEICHEN[W.stufe(w)]; },
  HERKUNFT: {messung:'gemessen', schiff:'aus der Historie dieses Schiffs',
             feld:'aus der Historie des Feldes', betrieb:'Betriebsschnitt',
             annahme:'geschätzt', keine:'nicht bestimmbar'},
  /* Lange Form für den Produktionsleiter: „2 h 34 · ± 25 min · aus 6 Gängen" */
  text(w, fmt){
    if(!w || W.wert(w)==null) return '–';
    const f = fmt || (x=>String(Math.round(x)));
    let s = f(W.wert(w));
    if(w.sd!=null && w.sd>0) s += ' ± ' + f(w.sd);
    const zus=[];
    if(w.n) zus.push(w.n===1?'1 Gang':w.n+' Gänge');
    if(w.quelle && w.quelle!=='schiff' && w.quelle!=='messung') zus.push(W.HERKUNFT[w.quelle]);
    return zus.length ? s+' · '+zus.join(' · ') : s;
  },
  /* Kurze Form für den Wassermann: Zahl plus Verlässlichkeitszeichen */
  kurz(w, fmt){
    if(!w || W.wert(w)==null) return '–';
    return (fmt?fmt(W.wert(w)):String(Math.round(W.wert(w))));
  }
};

/* --- Geometrie --- */
function polyArea(p){ if(!p||p.length<3) return 0;
  let a=0; for(let i=0;i<p.length;i++){const [x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length]; a+=x1*y2-x2*y1;} return Math.abs(a/2); }
function polyCenter(p){ let x=0,y=0; p.forEach(q=>{x+=q[0];y+=q[1];}); return [x/p.length,y/p.length]; }
function polyBBox(p){ const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}; }

/* ---------- UI-Helfer ---------- */
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),2400); }
function openModal(title, bodyHTML, footHTML, wide){
  const m=$('#modal'); m.className='modal'+(wide?' wide':'');
  m.innerHTML = `<div class="modal-h"><h3>${esc(title)}</h3><button class="x" onclick="closeModal()">✕</button></div>
    <div class="modal-b">${bodyHTML}</div>${footHTML?`<div class="modal-f">${footHTML}</div>`:''}`;
  $('#mask').classList.add('on'); return m;
}
function closeModal(){
  if(typeof WM!=='undefined' && WM._planPV && WM._planPV.destroy){ WM._planPV.destroy(); WM._planPV=null; }
  $('#mask').classList.remove('on'); $('#modal').innerHTML='';
}
/* Rückfrage vor zerstörenden Aktionen – ersetzt confirm()/prompt() */
function frage(titel, textHTML, knopf, fn, gefaehrlich){
  window._frageFn = ()=>{ closeModal(); fn(); };
  openModal(titel, textHTML,
    `<button class="btn" onclick="closeModal()">Abbrechen</button>
     <div class="sp"></div>
     <button class="btn ${gefaehrlich?'danger':'pri'}" onclick="window._frageFn()">${esc(knopf)}</button>`);
}
$('#mask').addEventListener('click',e=>{ if(e.target.id==='mask') closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

/* ============================================================
   STORE — ein Datenobjekt, geteilt von Admin und Wassermann
   ============================================================ */
const Store = {
  db:null,
  dirty:false,
  VERSION: 4,

  /* Standardwerte – eine einzige Quelle für init UND import (Migration) */
  standardEinstellungen(){
    return {
      ansprechperson: 'Sammy',
      ansprechTelefon: '',
      adminMail: 'leitung@betrieb.ch',
      kapazitaetStandorte: 8,
      planungsHorizont: 10,
      erfahrungsstufe: 'neu',            // neu | erfahren  → Detailgrad Wassermann
      setupErledigt: false,
      setupUebersprungen: false,
      setupJournalGeklaert: [],          // Standort-IDs, deren Journal-Zuordnung erledigt ist
      regenGefragtAm: null,
      sprenkler: {breite:18, abstandKreis:23, abstandSektor:11.5},
      /* Worauf sich „mm" bezieht (Kalibrierung H3):
         'flaeche'  = auf die Kulturfläche — was auf dem Bestand ankommt (Vorgabe)
         'beregnet' = auf die beregnete Fläche — die alte Betriebsformel */
      mmBezug: 'flaeche',
      journalMap: {}
    };
  },

  init(seed){
    this.db = this.migriere({
      version: this.VERSION,
      erstellt: D.today(),
      einstellungen: Object.assign(this.standardEinstellungen(), {
        kapazitaetStandorte: seed.journal?.kapazitaet?.standorteP80 || 8
      }),
      standorte: seed.katalog.standorte,
      felder:    seed.katalog.felder,
      kulturen:  seed.kulturen,
      regeln:    seed.regeln,
      journal:   seed.journal.eintraege,
      journalProbleme: seed.journal.probleme,
      journalKapazitaet: seed.journal.kapazitaet,
      gruppen:   seed.gruppen || [],
      modell:    seed.modell || null
    });
  },

  /* Migration: füllt jede fehlende Struktur auf. Läuft bei init UND bei jedem Import,
     damit ältere oder unvollständige Dateien die App nicht zum Absturz bringen. */
  migriere(d){
    if(!d || !Array.isArray(d.standorte) || !Array.isArray(d.felder))
      throw new Error('Die Datei enthält keine Standorte und Felder.');

    d.version = this.VERSION;
    d.erstellt = d.erstellt || D.today();
    d.einstellungen = Object.assign(this.standardEinstellungen(), d.einstellungen||{});
    d.einstellungen.sprenkler = Object.assign({breite:18,abstandKreis:23,abstandSektor:11.5},
                                              d.einstellungen.sprenkler||{});
    if(!Array.isArray(d.einstellungen.setupJournalGeklaert)) d.einstellungen.setupJournalGeklaert=[];
    if(typeof d.einstellungen.journalMap!=='object'||!d.einstellungen.journalMap)
      d.einstellungen.journalMap={};
    delete d.einstellungen.letzteRegenStandorte;         // nie verwendet, ersetzt durch Wetterstationen

    d.kulturen = Array.isArray(d.kulturen)?d.kulturen:[];
    d.regeln   = (d.regeln && typeof d.regeln==='object')?d.regeln:{};
    d.journal  = Array.isArray(d.journal)?d.journal:[];
    d.journalProbleme = Array.isArray(d.journalProbleme)?d.journalProbleme:[];
    d.journalKapazitaet = Object.assign({standorteMedian:5,standorteP80:8,standorteMax:10,eintraegeMedian:9},
                                        d.journalKapazitaet||{});
    d.wetterstationen = Array.isArray(d.wetterstationen)&&d.wetterstationen.length ? d.wetterstationen : [
      {id:'ws1', name:'Wetterstation 1', standortIds:[]},
      {id:'ws2', name:'Wetterstation 2', standortIds:[]},
      {id:'ws3', name:'Wetterstation 3', standortIds:[]}
    ];
    d.regen   = Array.isArray(d.regen)?d.regen:[];
    d.plan    = (d.plan && typeof d.plan==='object')?d.plan:{};
    d.laufend = Array.isArray(d.laufend)?d.laufend:[];
    d.gruppen = Array.isArray(d.gruppen)?d.gruppen:[];
    d.meldungen = Array.isArray(d.meldungen)?d.meldungen:[];
    /* Aus den Daten gefittete Modellparameter (tools/kalibrierung.py).
       Fehlen sie, rechnet die Engine mit den dokumentierten Rückfallwerten. */
    d.modell = Object.assign({
      qJeKreisregner: 1.85,      // m³/h, H2, 90-%-Intervall 1,82–1,87
      qJeSektorregner: 2.20,     // m³/h, H2, 90-%-Intervall 2,15–2,25
      qModell: 'linear',         // Sättigung getestet, bringt nichts (H2)
      shrinkageLambda: 2.8,      // Dämpfung des Schiffwerts (H4)
      sdInnerhalbSchiff: 0.334,  // m³/h je Sprenkler (H4)
      mmVerhaeltnisAzuB: 1.415   // beregnete Fläche zu Kulturfläche (H3)
    }, d.modell || {});
    if(!['flaeche','beregnet'].includes(d.einstellungen.mmBezug))
      d.einstellungen.mmBezug='flaeche';
    /* Admin-Eingriffe in den Plan: datum → key → {entfernt, verschobenNach, zielMm, …}
       Sie überleben jede Neuberechnung (siehe Engine.overlay). */
    d.eingriffe = (d.eingriffe && typeof d.eingriffe==='object')?d.eingriffe:{};
    /* Von Hand angelegte Aufträge: datum → [auftrag] */
    d.zusatz    = (d.zusatz && typeof d.zusatz==='object')?d.zusatz:{};

    /* Ein Standort darf nur zu genau einer Wetterstation gehören, sonst summiert
       Engine.regenAm() denselben Regen doppelt. */
    const gesehen=new Set();
    d.wetterstationen.forEach(w=>{
      w.standortIds = (w.standortIds||[]).filter(id=>{ if(gesehen.has(id)) return false;
        gesehen.add(id); return true; });
    });

    this.db = d;
    this.normalisiere();
    this.reindex();
    return d;
  },

  /* Struktur begradigen: implizite Schiffe, tote Attribute, fehlende Arrays */
  normalisiere(){
    const d=this.db;
    d.felder.forEach(f=>{
      f.schiffe = Array.isArray(f.schiffe)?f.schiffe:[];
      /* Ein Feld ohne Schiff-Nummerierung (Pflichtenheft §3/§4) bekommt EIN implizites
         Schiff über den ganzen Umriss. Dadurch funktioniert die gesamte übrige Logik
         – Planung, Sektoren, Kultur, Dauer – unverändert auch für schifflose Felder. */
      if(!f.schiffe.length && f.umriss && f.umriss.length>2){
        f.schiffe.push({ id:f.id+'__ganz', nummer:'', implizit:true,
          polygon:f.umriss.map(p=>[p[0],p[1]]), aren:f.gesamtflaecheAren||null,
          laengeM:null, breiteM:null, rohre:[], sektoren:[] });
      }
      /* Ein implizites Schiff verschwindet wieder, sobald echte Schiffe da sind */
      if(f.schiffe.length>1 && f.schiffe.some(s=>s.implizit))
        f.schiffe = f.schiffe.filter(s=>!s.implizit);
      f.schiffe.forEach(s=>{
        s.rohre    = Array.isArray(s.rohre)?s.rohre:[];
        s.sektoren = Array.isArray(s.sektoren)?s.sektoren:[];
        s.sektoren.forEach(k=>{ if(!k.prioritaet) k.prioritaet='normal'; });
      });
      /* Rohre gehören laut Pflichtenheft §3 zum Feld – sie bleiben aus Kompatibilität
         am Schiff gespeichert, werden aber über feldRohre() feldweit gelesen. */
      delete f.einzelschiff; delete f.planSeite; delete f.journalName;   // nie gelesen
    });
    d.standorte.forEach(s=>{
      if(s._journalGeklaert){                 // UI-Zustand gehört nicht ins Datenmodell
        if(!d.einstellungen.setupJournalGeklaert.includes(s.id))
          d.einstellungen.setupJournalGeklaert.push(s.id);
        delete s._journalGeklaert;
      }
      s.wasseruhr = s.wasseruhr || {einheit:'m3'};
    });
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

  /* ---------- Ein Weg für „Daten haben sich geändert" ----------
     bereich: 'geometrie' | 'kultur' | 'regel' | 'journal' | 'regen' | 'einstellung' | 'plan'
     Ruft genau die Invalidierungen auf, die das Handbuch (Invariante 5) verlangt. */
  changed(bereich, opts){
    this.mark();
    const struktur = bereich==='geometrie' || bereich==='kultur';
    if(struktur) this.reindex();
    if(bereich==='journal' || bereich==='geometrie' || bereich==='einstellung') Engine.clearRef();
    if((opts&&opts.stillerPlan)!==true && bereich!=='plan') Engine.planNeu();
  },

  feld(id){ return this.db._fd[id]; },
  standort(id){ return this.db._st[id]; },
  kultur(id){ return this.db._ku[id]; },
  felderVon(sid){ return this.db.felder.filter(f=>f.standortId===sid); },
  /* Anzeigename eines Schiffs – implizite Schiffe haben keine Nummer */
  schiffName(s){ return s && s.implizit ? T('ganzesFeld') : (T('schiff')+' '+(s?s.nummer:'?')); },
  /* echte, nummerierte Schiffe (für Zählungen in der Oberfläche) */
  echteSchiffe(f){ return f.schiffe.filter(s=>!s.implizit); },
  schiffZahl(){ return this.db.felder.reduce((a,f)=>a+this.echteSchiffe(f).length,0); },
  /* Einheit der Hauptwasseruhr eines Standorts (Pflichtenheft §3) */
  uhrLabel(standortId){
    const st=this.standort(standortId);
    const e=(st&&st.wasseruhr&&st.wasseruhr.einheit)||'m3';
    return e==='m3' ? 'm³' : e;
  },
  /* Rohre eines Feldes – am Schiff gespeichert, fachlich Feld-Ebene (Pflichtenheft §3) */
  feldRohre(f){ const out=[]; f.schiffe.forEach(s=>(s.rohre||[]).forEach(r=>out.push({rohr:r, schiff:s}))); return out; },

  /* Regel-Schlüssel: pro Feld + Kultur (Handbuch-Invariante 1) */
  regelKey(feldId, kulturId){ return feldId+'::'+kulturId; },
  regel(feldId, kulturId){ return this.db.regeln[this.regelKey(feldId,kulturId)] || null; },
  setRegel(feldId, kulturId, r){ this.db.regeln[this.regelKey(feldId,kulturId)] = r; this.mark(); },
  /* Vorschlag: gleiche Kultur woanders schon geregelt? Nächster Standort zuerst. */
  regelVorschlag(kulturId, feldId){
    const eigenerStandort = feldId ? this.feld(feldId)?.standortId : null;
    let beste=null;
    for(const [k,v] of Object.entries(this.db.regeln)){
      if(!k.endsWith('::'+kulturId)) continue;
      const fid=k.slice(0, k.length-kulturId.length-2);
      if(fid===feldId) continue;
      const f=this.feld(fid); if(!f) continue;
      const punkte = (f.standortId===eigenerStandort)?2:1;
      if(!beste || punkte>beste.punkte) beste={regel:v, feld:f, punkte};
    }
    return beste ? {regel:beste.regel, feldName:beste.feld.name} : null;
  },

  /* alle Sektoren (die atomaren Anbaueinheiten) */
  sektoren(){
    const out=[];
    this.db.felder.forEach(f=> f.schiffe.forEach(s=> (s.sektoren||[]).forEach(k=>{
      out.push({sektor:k, schiff:s, feld:f, standort:this.db._st[f.standortId]});
    })));
    return out;
  },

  /* Fläche eines Schiffs in m².
     Vorrang (Pflichtenheft §4, Handbuch-Invariante 4):
     1. eingetragene Aren   2. Länge × Breite   3. Anteil an der Feldfläche */
  schiffFlaecheM2(schiff, feld){
    if(schiff.aren) return schiff.aren*100;
    if(schiff.laengeM && schiff.breiteM) return schiff.laengeM*schiff.breiteM;
    const f = feld || this.db._sch[schiff.id]?.feld;
    if(!f || !f.gesamtflaecheAren || !f.schiffe.length) return null;
    /* Schiffe mit eigener Zahl belegen ihren Teil der Feldfläche bereits –
       nur der Rest wird über die Zeichnung verteilt (sonst zählt die Fläche doppelt). */
    let belegtM2=0; const offen=[];
    f.schiffe.forEach(s=>{
      const eigen = s.aren ? s.aren*100 : (s.laengeM&&s.breiteM ? s.laengeM*s.breiteM : null);
      if(eigen!=null) belegtM2+=eigen; else offen.push(s);
    });
    if(!offen.length) return null;
    const restM2 = Math.max(0, f.gesamtflaecheAren*100 - belegtM2);
    const tot = offen.reduce((a,s)=>a+polyArea(s.polygon),0);
    if(tot>0) return restM2*(polyArea(schiff.polygon)/tot);
    return restM2/offen.length;
  },
  feldFlaecheM2(feld){
    if(feld.gesamtflaecheAren) return feld.gesamtflaecheAren*100;
    const s=feld.schiffe.reduce((a,x)=>a+(this.schiffFlaecheM2(x,feld)||0),0);
    return s||null;
  },

  /* ---------- Export / Import ---------- */
  exportFile(){
    try{
      const d = JSON.parse(JSON.stringify(this.db));
      ['_st','_fd','_sch','_ku'].forEach(k=>delete d[k]);
      const blob=new Blob([JSON.stringify(d)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url;
      a.download='wasserplan_daten_'+D.today()+'_'+nowHM().replace(':','')+'.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      /* dirty erst zurücksetzen, wenn der Download wirklich angestossen wurde */
      this.dirty=false; toast('Daten gesichert');
    }catch(err){
      alert('Die Daten konnten nicht gesichert werden:\n'+err.message+
            '\n\nBitte nochmals versuchen – die Daten sind noch da.');
    }
  },
  importDialog(){
    const i=document.createElement('input'); i.type='file'; i.accept='application/json';
    i.onchange=e=>{ const f=e.target.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=ev=>{ try{
          const d=JSON.parse(ev.target.result);
          this.migriere(d);                     // füllt fehlende Strukturen auf
          this.dirty=false;
          Engine.clearRef(); Engine.planNeu();  // Cache und Plan gehören zu den NEUEN Daten
          App.home(); App.refreshStart(); toast('Daten geladen');
        }catch(err){ alert('Datei konnte nicht gelesen werden:\n'+err.message); } };
      r.readAsText(f); };
    i.click();
  }
};
window.addEventListener('beforeunload', e=>{ if(Store.dirty){ e.preventDefault(); e.returnValue=''; } });
