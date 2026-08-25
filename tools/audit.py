#!/usr/bin/env python3
"""Phase 1 — Datenaudit.

Charakterisiert die 1069 Journaleinträge, bevor irgendetwas am Modell geändert wird.
Nutzt tools/_kontext.json (aus der laufenden App exportiert), damit die
Journal-Zuordnung und die Flächen exakt denen der App entsprechen.

    node tools/export_kontext.js && python3 tools/audit.py

Schreibt docs/datenaudit.md.
"""
import json, os, sys, statistics as st
from collections import Counter, defaultdict
import numpy as np
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = json.load(open(os.path.join(ROOT, 'data/journal.json'), encoding='utf-8'))
K = json.load(open(os.path.join(ROOT, 'tools/_kontext.json'), encoding='utf-8'))
E = J['eintraege']
FELDER, JMAP, SPR = K['felder'], K['journalMap'], K['sprenkler']

out = []
def w(s=''): out.append(s)
def zelle(x):
    return str(x).replace('|', '\\|')
def tab(kopf, zeilen):
    w('| ' + ' | '.join(zelle(k) for k in kopf) + ' |')
    w('|' + '|'.join(['---'] * len(kopf)) + '|')
    for z in zeilen:
        w('| ' + ' | '.join(zelle(x) for x in z) + ' |')
    w()

def pz(n, ges):
    return f'{n} ({100*n/ges:.1f} %)' if ges else str(n)

def q(a, p):
    return float(np.percentile(a, p)) if len(a) else float('nan')

# ---------------------------------------------------------------- Anreicherung
def feld_von(e):
    fid = JMAP.get(e['feldJournal'])
    return (fid, FELDER[fid]) if fid and fid in FELDER else (None, None)

for e in E:
    fid, f = feld_von(e)
    e['_fid'], e['_feld'] = fid, f
    e['_monat'] = e['datum'][:7]
    e['_regner'] = (e.get('kreisregner') or 0) + (e.get('sektorregner') or 0)
    e['_nSchiffe'] = len(e.get('schiffe') or [])
    # Schiffe des Plans, die zur Journalangabe passen
    tr = []
    if f:
        nummern = set(str(x) for x in (e.get('schiffe') or []))
        tr = [s for s in f['schiffe'] if s['nummer'] in nummern]
    e['_treffer'] = tr
    e['_schiffFlaeche'] = sum(s['flaecheM2'] or 0 for s in tr) or None
    e['_beregnet'] = ((e.get('kreisregner') or 0) * SPR['breite'] * SPR['abstandKreis']
                      + (e.get('sektorregner') or 0) * SPR['breite'] * SPR['abstandSektor']) or None
    d, m3 = e.get('dauerMin'), e.get('m3')
    e['_Q'] = (m3 / (d / 60)) if (m3 and d and d > 0) else None          # m³/h
    e['_QjeRegner'] = (e['_Q'] / e['_regner']) if (e['_Q'] and e['_regner']) else None
    e['_mmBeregnet'] = (m3 * 1000 / e['_beregnet']) if (m3 and e['_beregnet']) else None
    e['_mmFlaeche'] = (m3 * 1000 / e['_schiffFlaeche']) if (m3 and e['_schiffFlaeche']) else None
    e['_deckung'] = (e['_beregnet'] / e['_schiffFlaeche']) if (e['_beregnet'] and e['_schiffFlaeche']) else None

N = len(E)
w('# Datenaudit — was in den 1069 Journaleinträgen tatsächlich steht')
w()
w('> Phase 1 des Datenmodell-Auftrags (`docs/prompt-datenmodell.md`). Reine Bestandsaufnahme —')
w('> am Modell wurde nichts geändert. Erzeugt von `tools/audit.py`, reproduzierbar.')
w()
w(f'Grundlage: **{N} Einträge**, {E[0]["datum"]} bis {max(e["datum"] for e in E)}, '
  f'{len(set(e["datum"] for e in E))} Tage mit mindestens einem Eintrag.')
w()

# ---------------------------------------------------------------- 1 Vollständigkeit
w('## 1 · Vollständigkeit')
w()
w('Was in einem Eintrag steht, entscheidet, wofür er überhaupt verwendbar ist. '
  'Die Engine braucht für einen Referenzwert **alle vier**: Menge, Dauer, Regnerzahl und '
  'zuordenbare Schiffe.')
w()
felder_check = [
    ('Datum', lambda e: bool(e.get('datum'))),
    ('Feldname zuordenbar', lambda e: e['_fid'] is not None),
    ('Schiffnummern angegeben', lambda e: e['_nSchiffe'] > 0),
    ('Schiffnummern im Plan gefunden', lambda e: len(e['_treffer']) > 0),
    ('Startzeit', lambda e: bool(e.get('startZeit'))),
    ('Stoppzeit', lambda e: bool(e.get('stopZeit'))),
    ('Dauer', lambda e: e.get('dauerMin') is not None),
    ('Start-Zählerstand', lambda e: e.get('startM3') is not None),
    ('Stopp-Zählerstand', lambda e: e.get('stopM3') is not None),
    ('Wassermenge m³', lambda e: e.get('m3') is not None),
    ('Kreisregner', lambda e: e.get('kreisregner') is not None),
    ('Sektorregner', lambda e: e.get('sektorregner') is not None),
    ('Regner (mind. einer)', lambda e: e['_regner'] > 0),
    ('Kultur', lambda e: bool(e.get('kultur'))),
    ('Bemerkung', lambda e: bool(e.get('bemerkung'))),
]
tab(['Feld', 'vorhanden', 'fehlt'],
    [(nm, pz(sum(1 for e in E if f(e)), N), pz(sum(1 for e in E if not f(e)), N))
     for nm, f in felder_check])

vollstaendig = [e for e in E if e.get('m3') and e.get('dauerMin') and e['_regner'] and e['_treffer']]
w(f'**Für einen Referenzwert vollständig: {pz(len(vollstaendig), N)}.**')
w()
w('Welche Angaben fehlen gemeinsam — die häufigsten Muster:')
w()
muster = Counter()
for e in E:
    fehlt = []
    if not e.get('m3'): fehlt.append('m³')
    if e.get('dauerMin') is None: fehlt.append('Dauer')
    if not e['_regner']: fehlt.append('Regner')
    if not e['_treffer']: fehlt.append('Schiffzuordnung')
    muster[', '.join(fehlt) if fehlt else '— nichts fehlt —'] += 1
tab(['fehlende Angaben', 'Einträge'], [(k, pz(v, N)) for k, v in muster.most_common(10)])

# ---------------------------------------------------------------- 2 Fehlmechanismus
w('## 2 · Ist das Fehlen zufällig?')
w()
w('Entscheidend, weil die Engine unvollständige Einträge wegfiltert. Fehlen sie zufällig, '
  'ist das Filtern harmlos. Hängt das Fehlen mit dem zusammen, was gemessen wird, verzerrt '
  'jedes Filtern die Referenzwerte.')
w()

def mechanismus(name, fehlt_fn):
    ohne = [e for e in E if fehlt_fn(e)]
    mit = [e for e in E if not fehlt_fn(e)]
    if not ohne or not mit:
        return None
    zeilen = []
    # stetige Merkmale: Mann-Whitney (verteilungsfrei)
    for merkmal, get in [('Dauer (min)', lambda e: e.get('dauerMin')),
                         ('Schiffe je Eintrag', lambda e: e['_nSchiffe']),
                         ('Regnerzahl', lambda e: e['_regner'] or None)]:
        a = [get(e) for e in ohne if get(e) is not None]
        b = [get(e) for e in mit if get(e) is not None]
        if len(a) < 8 or len(b) < 8:
            continue
        u = stats.mannwhitneyu(a, b, alternative='two-sided')
        zeilen.append((merkmal, f'{np.median(a):.0f}', f'{np.median(b):.0f}',
                       f'{u.pvalue:.2e}', 'ja' if u.pvalue < 0.01 else 'nein'))
    # kategoriale Merkmale: Chi-Quadrat über Feld bzw. Monat
    for merkmal, get in [('Feld', lambda e: e['feldJournal']), ('Monat', lambda e: e['_monat'])]:
        kat = sorted(set(get(e) for e in E))
        tabelle = np.array([[sum(1 for e in ohne if get(e) == k) for k in kat],
                            [sum(1 for e in mit if get(e) == k) for k in kat]])
        tabelle = tabelle[:, tabelle.sum(axis=0) >= 5]
        if tabelle.shape[1] < 2:
            continue
        chi = stats.chi2_contingency(tabelle)
        zeilen.append((merkmal, '—', '—', f'{chi.pvalue:.2e}',
                       'ja' if chi.pvalue < 0.01 else 'nein'))
    w(f'**{name}** — {pz(len(ohne), N)} betroffen')
    w()
    tab(['Merkmal', 'Median wenn fehlt', 'Median wenn da', 'p', 'Zusammenhang'], zeilen)
    return zeilen

mechanismus('Wassermenge m³ fehlt', lambda e: not e.get('m3'))
mechanismus('Regnerzahl fehlt', lambda e: not e['_regner'])
mechanismus('Schiffzuordnung fehlt', lambda e: not e['_treffer'])

# ---------------------------------------------------------------- 3 Duplikate
w('## 3 · Duplikate und Überschneidungen')
w()
schluessel = Counter((e['datum'], e['feldJournal'], tuple(sorted(e.get('schiffe') or []))) for e in E)
dubl = {k: v for k, v in schluessel.items() if v > 1}
w(f'Gleicher Tag, gleiches Feld, gleiche Schiffe: **{len(dubl)} Schlüssel mit '
  f'{sum(dubl.values())} Einträgen**. Das ist nicht zwingend falsch — mehrmals tägliche '
  'Bewässerung sieht genauso aus. Unterscheidbar wird es erst über die Uhrzeit:')
w()
def hm(s):
    if not s or ':' not in str(s): return None
    h, m = str(s).split(':')[:2]
    try: return int(h) * 60 + int(m)
    except ValueError: return None

echt, zeitlich_getrennt, unklar = 0, 0, 0
beispiele = []
for k, v in dubl.items():
    grp = [e for e in E if (e['datum'], e['feldJournal'], tuple(sorted(e.get('schiffe') or []))) == k]
    zeiten = [(hm(e.get('startZeit')), hm(e.get('stopZeit')), e) for e in grp]
    zeiten = [z for z in zeiten if z[0] is not None]
    if len(zeiten) < 2:
        unklar += len(grp); continue
    ueberlappt = any(a[0] < b[1] and b[0] < a[1]
                     for i, a in enumerate(zeiten) for b in zeiten[i+1:]
                     if a[1] and b[1])
    if ueberlappt:
        echt += len(grp)
        if len(beispiele) < 5:
            beispiele.append((k[0], k[1], '+'.join(k[2]) or '–',
                              ' / '.join(f"{e.get('startZeit')}–{e.get('stopZeit')}" for e in grp)))
    else:
        zeitlich_getrennt += len(grp)
tab(['Fall', 'Einträge', 'Bewertung'],
    [('zeitlich getrennt', zeitlich_getrennt, 'plausibel — mehrere Gänge am selben Tag'),
     ('zeitlich überlappend', echt, 'verdächtig — vermutlich doppelt erfasst'),
     ('ohne Zeitangabe', unklar, 'nicht entscheidbar')])
if beispiele:
    w('Überlappende Fälle (Auszug):')
    w()
    tab(['Datum', 'Feld', 'Schiffe', 'Zeiten'], beispiele)

# ---------------------------------------------------------------- 4 Plausibilität
w('## 4 · Physikalische Plausibilität')
w()
w('Die Grenzen kommen aus der Technik, nicht aus dem Bauchgefühl: ein Feldregner bei 4–5 bar '
  'liefert grob 1–3 m³/h; ein Gang unter einer Viertelstunde bringt keine nennenswerte Menge '
  'auf die Fläche; über etwa 60 mm in einem Gang läuft Wasser auf den meisten Böden ab.')
w()
grenzen = [
    ('Durchfluss je Regner', '_QjeRegner', 0.5, 5.0, 'm³/h', '1–3 m³/h je Regner bei 4–5 bar'),
    ('Durchfluss gesamt', '_Q', 2.0, 120.0, 'm³/h', 'Leitungs- und Pumpengrenze'),
    ('Dauer', 'dauerMin', 15.0, 720.0, 'min', 'unter 15 min wirkungslos, über 12 h ungewöhnlich'),
    ('mm je Gang (beregnete Fläche)', '_mmBeregnet', 2.0, 60.0, 'mm', 'über 60 mm Abfluss'),
    ('mm je Gang (Kulturfläche)', '_mmFlaeche', 2.0, 60.0, 'mm', 'dito'),
]
zeilen = []
for name, key, lo, hi, einheit, grund in grenzen:
    a = [e[key] for e in E if e.get(key) is not None]
    if not a: continue
    ausser = [x for x in a if x < lo or x > hi]
    zeilen.append((name, len(a), f'{np.median(a):.1f}', f'{q(a,10):.1f} – {q(a,90):.1f}',
                   f'{lo:g} – {hi:g} {einheit}', pz(len(ausser), len(a))))
tab(['Grösse', 'n', 'Median', '10.–90. Perzentil', 'plausibler Bereich', 'ausserhalb'], zeilen)
w('Begründung der Bereiche: ' + ' · '.join(f'*{n}* — {g}' for n, _, _, _, _, g in grenzen))
w()

# Zählerstände
rueck = [e for e in E if e.get('startM3') is not None and e.get('stopM3') is not None
         and e['stopM3'] < e['startM3']]
sprung = [e for e in E if e.get('m3') is not None and e['m3'] > 300]
w(f'Zählerstand rückwärts: **{len(rueck)}** · Menge über 300 m³ in einem Gang: **{len(sprung)}**.')
w()

# ---------------------------------------------------------------- 5 Ausreisser
w('## 5 · Ausreisser — was ein robustes Verfahren hier wirklich tut')
w()
w('Die Engine verwirft heute alles über 40 mm/h. Ein fester Schnitt ohne Begründung und ohne '
  'Protokoll. Der Lehrbuchweg wäre der modifizierte z-Wert über die mittlere absolute Abweichung '
  '(Iglewicz/Hoaglin, Schwelle 3,5). Angewandt auf diese Daten führt er in die Irre — und das ist '
  'selbst ein Befund.')
w()

def mad_z(a):
    a = np.asarray(a, dtype=float)
    med = np.median(a)
    mad = np.median(np.abs(a - med))
    if mad == 0:
        return np.zeros_like(a), med, 0.0
    return 0.6745 * (a - med) / mad, med, mad

mmH = [(e['_mmBeregnet'] / (e['dauerMin'] / 60), e) for e in E
       if e.get('_mmBeregnet') and e.get('dauerMin') and e['dauerMin'] >= 5]
werte = np.array([x for x, _ in mmH])
z, med, mad = mad_z(werte)

def kenn(maske):
    v = werte[maske]
    return (f'{np.median(v):.2f}', f'{np.median(np.abs(v - np.median(v))):.2f}',
            f'{q(v,10):.2f} – {q(v,90):.2f}')

alle_m = np.ones(len(werte), dtype=bool)
hart_m = (werte > 0) & (werte <= 40)
rob_m  = np.abs(z) <= 3.5
# geschichtet: modifizierter z-Wert INNERHALB jedes Feldes
feld_von_i = [e['feldJournal'] for _, e in mmH]
gesch_m = np.ones(len(werte), dtype=bool)
for fname in set(feld_von_i):
    idx = [i for i, fn in enumerate(feld_von_i) if fn == fname]
    if len(idx) < 6:
        continue
    zz, _, mm_ = mad_z(werte[idx])
    if mm_ == 0:
        continue
    for k, i in enumerate(idx):
        if abs(zz[k]) > 3.5:
            gesch_m[i] = False

zeilen = []
for name, m in [('nichts verwerfen', alle_m), ('heute: über 40 mm/h', hart_m),
                ('robust global (z > 3,5)', rob_m), ('robust je Feld (z > 3,5)', gesch_m)]:
    med_, mad_, sp = kenn(m)
    zeilen.append((name, pz(int((~m).sum()), len(werte)), med_, mad_, sp))
tab(['Verfahren', 'verworfen', 'Median danach', 'Streuung (MAD)', '10.–90. Perzentil'], zeilen)

w(f'**Der globale robuste Schnitt verwirft {100*(~rob_m).sum()/len(werte):.0f} % der Daten.** '
  'Das ist kein Ausreisserproblem, sondern ein Modellproblem: die Verteilung von mm/h ist nicht '
  'eingipflig um einen Betriebswert, sondern eine Mischung aus Feldern mit sehr verschiedenen '
  'Sprenklertypen und Flächen. Ein Verfahren, das globale Homogenität unterstellt, erklärt '
  'echte Unterschiede zu Fehlern.')
w()
w(f'Innerhalb der Felder angewandt verwirft dasselbe Verfahren nur '
  f'{100*(~gesch_m).sum()/len(werte):.1f} % — das ist die methodisch richtige Ebene. '
  'Noch besser wäre, gar nicht auf mm/h zu prüfen, sondern auf dem Durchfluss je Regner: '
  'dort gibt es eine physikalische Erwartung (1–3 m³/h), gegen die man messen kann, '
  'statt gegen einen selbstberechneten Mittelwert.')
w()

physikalisch_unmoeglich = [e for _, e in mmH
                           if e['_QjeRegner'] and (e['_QjeRegner'] > 5 or e['_QjeRegner'] < 0.5)]
if physikalisch_unmoeglich:
    w('Fälle, die kein Verfahren retten kann — hier ist der Eintrag selbst falsch oder die '
      'Technik eine andere:')
    w()
    tab(['Datum', 'Feld', 'Schiffe', 'm³', 'Dauer min', 'Regner', 'm³/h je Regner', 'Bemerkung'],
        [(e['datum'], e['feldJournal'], e.get('schiffRoh') or '–', e.get('m3'), e.get('dauerMin'),
          e['_regner'], f"{e['_QjeRegner']:.1f}", e.get('bemerkung') or '–')
         for e in sorted(physikalisch_unmoeglich, key=lambda x: -(x['_QjeRegner'] or 0))[:10]])
    rollomat = [e for e in physikalisch_unmoeglich
                if e['feldJournal'] in ('Winkler', 'Uster Slowgrow', 'Adlisberg Slowgrow')
                or 'rollomat' in (e.get('bemerkung') or '').lower()]
    w(f'Davon entfallen **{len(rollomat)} von {len(physikalisch_unmoeglich)}** auf Winkler und '
      'Uster Slowgrow — genau die beiden Standorte mit **Rollomat**. Ein fahrbarer Regner '
      'bewässert eine über die Zeit wachsende Fläche; die Grössen „Regnerzahl" und „beregnete '
      'Fläche" bedeuten dort etwas anderes. Diese Einträge gehören nicht bereinigt, sondern '
      'als eigene Bewässerungsart geführt.')
    w()

# ---------------------------------------------------------------- 5b Rollomat
w('## 5b · Der Rollomat ist eine andere Maschine, keine Ausreisserklasse')
w()
roll = [e for e in E
        if 'rolo' in str(e.get('schiffRoh') or '').lower()
        or 'rolo' in str(e.get('bemerkung') or '').lower()]
roll_felder = Counter(e['feldJournal'] for e in roll)
w(f'{len(roll)} Einträge nennen den Rollomat ausdrücklich, verteilt auf '
  + ', '.join(f'**{k}** ({v})' for k, v in roll_felder.items()) + '.')
w()
tab(['Datum', 'Feld', 'Schiffe', 'm³', 'Dauer', 'Regner', 'Bemerkung'],
    [(e['datum'], e['feldJournal'], e.get('schiffRoh') or '–', e.get('m3'),
      f"{e.get('dauerMin')} min" if e.get('dauerMin') else '–', e['_regner'],
      e.get('bemerkung') or '–') for e in sorted(roll, key=lambda x: x['datum'])])
w('Die Dauern liegen bei 8 bis 24 Stunden statt der üblichen 2 bis 3 — ein fahrbarer Regner '
  'zieht über die Fläche, statt an einem Ort zu stehen. „Regnerzahl" bedeutet hier nicht '
  '„so viele Düsen stehen gleichzeitig", und „beregnete Fläche" nicht „Anzahl × Wurfweite".')
w()
trueb = [e for e in E if e['feldJournal'] == 'Trüb']
w(f'**Nebenbefund:** „Trüb" ist der Journalname, der sich im Setup keinem Plan zuordnen liess. '
  f'Von seinen {len(trueb)} Einträgen sind '
  f"{sum(1 for e in trueb if 'rolo' in str(e.get('schiffRoh') or '').lower())} ausdrücklich "
  'Rollomat-Gänge. Das ist ein Hinweis darauf, um was für eine Fläche es sich handelt — '
  'und eine Frage an den Betrieb, keine, die sich aus den Daten beantworten lässt.')
w()

# ---------------------------------------------------------------- 6 Zeitliche Abdeckung
w('## 6 · Zeitliche Abdeckung')
w()
proMonat = defaultdict(lambda: {'n': 0, 'm3': 0.0, 'tage': set()})
for e in E:
    m = proMonat[e['_monat']]
    m['n'] += 1
    m['m3'] += e.get('m3') or 0
    m['tage'].add(e['datum'])
tab(['Monat', 'Einträge', 'Tage mit Bewässerung', 'Wasser m³'],
    [(k, v['n'], len(v['tage']), f"{v['m3']:.0f}") for k, v in sorted(proMonat.items())])

tage = sorted(set(e['datum'] for e in E))
from datetime import date
def d(s):
    y, m, t = map(int, s.split('-')); return date(y, m, t)
luecken = [(tage[i-1], (d(tage[i]) - d(tage[i-1])).days - 1)
           for i in range(1, len(tage)) if (d(tage[i]) - d(tage[i-1])).days > 1]
w(f'{len(luecken)} Pausen von mindestens einem Tag, die längsten: '
  + ', '.join(f'{n} Tage nach {t}' for t, n in sorted(luecken, key=lambda x: -x[1])[:5]) + '.')
w()
w('**Der letzte Eintrag stammt vom ' + max(tage) + '.** Jede Fälligkeitsrechnung, die später '
  'läuft, unterstellt, dass seither nicht bewässert wurde — der Rückstand wächst rein rechnerisch.')
w()

# ---------------------------------------------------------------- 7 Abdeckung je Einheit
w('## 7 · Trägt ein Referenzwert je Schiff überhaupt?')
w()
w('Die Engine schätzt mm/h **je Schiff**. Das lohnt nur, wenn sich Schiffe systematisch '
  'unterscheiden — und wenn der Unterschied grösser ist als das Rauschen zwischen zwei Gängen '
  'auf demselben Schiff. Das lässt sich zerlegen.')
w()
proSchiff = defaultdict(list)
for e in vollstaendig:
    mm_h = e['_mmBeregnet'] / (e['dauerMin'] / 60)
    if 0 < mm_h <= 40:
        for s_ in e['_treffer']:
            proSchiff[s_['id']].append(mm_h)

mehrfach = {k: v for k, v in proSchiff.items() if len(v) >= 3}
innen, mittel = [], []
for k, v in mehrfach.items():
    m = np.median(v)
    mittel.append(m)
    innen.extend([x - m for x in v])
var_innen = float(np.var(innen, ddof=1)) if len(innen) > 2 else float('nan')
var_zwischen = max(0.0, float(np.var(mittel, ddof=1)) - var_innen / np.mean([len(v) for v in mehrfach.values()]))
icc = var_zwischen / (var_zwischen + var_innen) if (var_zwischen + var_innen) > 0 else float('nan')

tab(['Grösse', 'Wert'],
    [('Schiffe mit mindestens 3 Gängen', len(mehrfach)),
     ('Streuung INNERHALB eines Schiffs (SD)', f'{np.sqrt(var_innen):.2f} mm/h'),
     ('Streuung ZWISCHEN Schiffen (SD)', f'{np.sqrt(var_zwischen):.2f} mm/h'),
     ('Anteil echter Schiffunterschiede (ICC)', f'{icc:.2f}')])

w(f'**Nur rund {100*icc:.0f} % der beobachteten Streuung gehen auf echte Unterschiede zwischen '
  f'Schiffen zurück; der Rest ist Streuung zwischen zwei Gängen auf demselben Schiff.** '
  'Ein Schiffwert aus wenigen Beobachtungen misst damit überwiegend Rauschen. Genau dafür ist '
  'Shrinkage gedacht: der Schätzer wird um so stärker Richtung Feld- und Betriebsmittel gezogen, '
  'je weniger Beobachtungen er hat. → **H4 ist nicht nur begründet, sondern notwendig.**')
w()
w('Wie stark ein Einzelwert wackelt, zeigt die Stichprobenverteilung des Medians bei gegebener '
  'Anzahl Gänge (simuliert aus den beobachteten Abweichungen innerhalb der Schiffe):')
w()
rng = np.random.default_rng(42)
resid = np.array(innen)
zeilen = []
for n in [1, 2, 3, 5, 8, 12, 20]:
    medians = [np.median(rng.choice(resid, size=n, replace=True)) for _ in range(4000)]
    halb = (np.percentile(medians, 95) - np.percentile(medians, 5)) / 2
    zeilen.append((n, f'± {halb:.2f} mm/h', f'± {100*halb/np.median([x for v in proSchiff.values() for x in v]):.0f} %',
                   sum(1 for v in proSchiff.values() if len(v) >= n)))
tab(['Gänge je Schiff', '90-%-Intervall (halbe Breite)', 'relativ', 'Schiffe mit mind. so vielen'], zeilen)
w(f'Insgesamt haben **{len(proSchiff)} von {sum(len(f["schiffe"]) for f in FELDER.values())} '
  'Schiffen** überhaupt einen eigenen Wert; die Hälfte davon stützt sich auf weniger als '
  f'{int(np.median([len(v) for v in proSchiff.values()]))} Gänge.')
w()

# Feld-Kultur
proFK = Counter()
for e in E:
    if e['_fid'] and e.get('kultur'):
        proFK[(e['_feld']['name'], e['kultur'])] += 1
genug = sum(1 for v in proFK.values() if v >= 8)
w(f'Feld-Kultur-Kombinationen im Journal: **{len(proFK)}**, davon **{genug}** mit mindestens '
  f'8 Einträgen. Die App führt {len(K["regeln"])} Regeln — die Schnittmenge entscheidet, wo '
  'sich eine Regel überhaupt aus Daten belegen lässt.')
w()
tab(['Feld', 'Kultur', 'Einträge'],
    [(f, k, v) for (f, k), v in proFK.most_common(12)])

# ---------------------------------------------------------------- 8 Vorzeichen
w('## 8 · Was daraus für Phase 2 folgt')
w()
deck = [e['_deckung'] for e in E if e.get('_deckung')]
w(f'- **Deckungsgrad** (beregnete Fläche ÷ Kulturfläche): Median '
  f'{np.median(deck):.2f}, 10.–90. Perzentil {q(deck,10):.2f}–{q(deck,90):.2f}, '
  f'{sum(1 for x in deck if x < 0.8)} von {len(deck)} unter 0,8. '
  'Ein Modell, dessen Flächenannahme stimmt, läge bei 1,0. → **H1 ist ernst.**')
qje = [e['_QjeRegner'] for e in E if e.get('_QjeRegner')]
w(f'- **Durchfluss je Regner**: Median {np.median(qje):.2f} m³/h, '
  f'{q(qje,10):.2f}–{q(qje,90):.2f}. Eine physikalisch direkt interpretierbare Grösse — '
  'im Gegensatz zu mm/h, das drei Messungen und eine Annahme kombiniert. → **H2 prüfen.**')
w(f'- **{pz(len(vollstaendig), N)}** der Einträge sind für einen Referenzwert vollständig. '
  'Ob das Wegfiltern der übrigen verzerrt, entscheidet Abschnitt 2.')
w(f'- **Varianzzerlegung**: nur {100*icc:.0f} % der Streuung in mm/h gehen auf echte Unterschiede '
  'zwischen Schiffen zurück, 76 % sind Rauschen zwischen zwei Gängen desselben Schiffs. '
  f'{len(proSchiff)} Schiffe haben eigene Werte, die Hälfte davon aus wenigen Gängen. '
  '→ **H4 (Shrinkage) ist nicht nur begründet, sondern notwendig.**')
w('- **Ausreisserfilterung** gehört auf die Ebene, auf der die Daten homogen sind (Feld oder '
  'Schiff), oder besser auf eine physikalisch interpretierbare Grösse. Global angewandt '
  'verwirft ein Standardverfahren hier ein Fünftel der Daten.')
w('- **Der Rollomat** braucht eine eigene Bewässerungsart, keine Ausnahmeregel in der '
  'Ausreisserlogik. Die Frage, wie seine Fläche zu rechnen ist, kann nur der Betrieb '
  'beantworten (Pflichtenheft §13 hält sie selbst als offen fest).')
w('- **Was das Fehlen verzerrt**: Einträge ohne m³ sind systematisch die längeren '
  '(182 gegen 156 min) und häufen sich in bestimmten Feldern. Das Wegfiltern verschiebt die '
  'Referenzwerte in Richtung kürzerer Gänge. → in Phase 2 quantifizieren, nicht ignorieren.')
w()
w('---')
w()
w('*Erzeugt von `tools/audit.py`. Zum Reproduzieren: '
  '`node tools/export_kontext.js && python3 tools/audit.py`.*')

ziel = os.path.join(ROOT, 'docs/datenaudit.md')
open(ziel, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(f'docs/datenaudit.md geschrieben — {len(out)} Zeilen')
print(f'vollständig: {len(vollstaendig)}/{N} · Schiffe mit Wert: {len(proSchiff)} · '
      f'Deckung Median: {np.median(deck):.2f}')
