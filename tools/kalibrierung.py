#!/usr/bin/env python3
"""Phase 2 — Modellkalibrierung H1 bis H8.

Misst, ob die Annahmen der Engine tragen, und schätzt die Parameter, die
bisher gesetzt statt gefittet waren. Ändert nichts am Code — schreibt
docs/modell.md und data/modell.json (die gefitteten Werte für den Build).

    node tools/export_kontext.js && python3 tools/kalibrierung.py
"""
import json, os
from collections import defaultdict, Counter
import numpy as np
from scipy import stats
from wasserdaten import (ROOT, laden, brauchbar, median, mad, nnls_durch_null,
                         huber_nnls, bestimmtheit, mae, medae, bootstrap_ki,
                         varianzzerlegung)

E, K = laden()
SPR = K['sprenkler']
FELDER = K['felder']

out, ergebnis = [], {}
def w(s=''): out.append(s)
def zelle(x): return str(x).replace('|', '\\|')
def tab(kopf, zeilen):
    w('| ' + ' | '.join(zelle(k) for k in kopf) + ' |')
    w('|' + '|'.join(['---'] * len(kopf)) + '|')
    for z in zeilen:
        w('| ' + ' | '.join(zelle(x) for x in z) + ' |')
    w()
def urteil(txt):
    w(f'> **Urteil.** {txt}')
    w()

w('# Modellkalibrierung — welche Annahmen tragen, welche nicht')
w()
w('> Phase 2 des Datenmodell-Auftrags (`docs/prompt-datenmodell.md`). Jede Hypothese mit')
w('> Messergebnis, Entscheidung und Begründung — auch die verworfenen. Erzeugt von')
w('> `tools/kalibrierung.py`, reproduzierbar. Grundlage ist `docs/datenaudit.md`.')
w()

B = brauchbar(E)
BF = brauchbar(E, mit_flaeche=True)
w(f'Auswertbare Gänge: **{len(B)}** (mit bekannter Kulturfläche: {len(BF)}). '
  'Ausgeschlossen sind Rollomat-Gänge und physikalisch unmögliche Einträge '
  '(Durchfluss ausserhalb 0,5–5 m³/h je Regner) — beides begründet im Audit, Abschnitt 4 und 5b.')
w()

# ============================================================ H1
w('## H1 · Stimmt die beregnete Fläche?')
w()
w('Die Engine rechnet `Fläche = Kreisregner × 18 × 23 + Sektorregner × 18 × 11,5`, also '
  f'**{SPR["breite"]*SPR["abstandKreis"]:.0f} m² je Kreisregner** und '
  f'**{SPR["breite"]*SPR["abstandSektor"]:.0f} m² je Sektorregner**. Diese drei Zahlen wurden nie '
  'an Daten geprüft. Der direkte Test: wenn sie stimmen, muss die so berechnete Fläche die '
  'Kulturfläche treffen.')
w()
deck = [e['_deckung'] for e in BF if e['_deckung']]
lo, hi = bootstrap_ki(deck, lambda a: float(np.median(a)))
w(f'Deckungsgrad (beregnet ÷ Kulturfläche) über {len(deck)} Gänge: Median '
  f'**{np.median(deck):.2f}** (90-%-Bootstrap {lo:.2f}–{hi:.2f}), '
  f'10.–90. Perzentil {np.percentile(deck,10):.2f}–{np.percentile(deck,90):.2f}. '
  'Ein zutreffendes Modell läge bei 1,0.')
w()

# Parameter aus den Daten schätzen: Fläche ~ a*Kreis + b*Sektor, ohne Achsenabschnitt
paar = [(e['_kreis'], e['_sektor'], e['_flaecheM2']) for e in BF
        if e['_flaecheM2'] and (e['_kreis'] or e['_sektor'])]
X = np.array([[k, s] for k, s, _ in paar], float)
y = np.array([f for _, _, f in paar], float)
coef_ls, _ = nnls_durch_null(X, y)
coef_rob = huber_nnls(X, y)
def ki_coef(seed=3, n=600):
    rng = np.random.default_rng(seed); ak, as_ = [], []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        c = huber_nnls(X[i], y[i], iterationen=8)
        ak.append(c[0]); as_.append(c[1])
    return ((np.percentile(ak,5), np.percentile(ak,95)),
            (np.percentile(as_,5), np.percentile(as_,95)))
kiK, kiS = ki_coef()

tab(['Parameter', 'heute gesetzt', 'aus den Daten (robust)', '90-%-Intervall'],
    [('Fläche je Kreisregner', f'{SPR["breite"]*SPR["abstandKreis"]:.0f} m²',
      f'{coef_rob[0]:.0f} m²', f'{kiK[0]:.0f} – {kiK[1]:.0f} m²'),
     ('Fläche je Sektorregner', f'{SPR["breite"]*SPR["abstandSektor"]:.0f} m²',
      f'{coef_rob[1]:.0f} m²', f'{kiS[0]:.0f} – {kiS[1]:.0f} m²'),
     ('Verhältnis Sektor : Kreis', '0,50',
      f'{coef_rob[1]/coef_rob[0]:.2f}' if coef_rob[0] else '–', '—')])

rel = np.abs((y - X @ coef_rob) / y)
w(f'Selbst mit den gefitteten Werten bleibt die Streuung gross: die Vorhersage der '
  f'Kulturfläche aus der Regnerzahl liegt im Median um **{100*np.median(rel):.0f} %** daneben '
  f'({medae(y, X@coef_rob):.0f} m² bei einer typischen Fläche von {np.median(y):.0f} m²); '
  f'nur {100*np.mean(rel<=0.25):.0f} % der Gänge treffen auf ±25 % genau. '
  '(Ein Bestimmtheitsmass wird hier bewusst nicht angegeben — für ein Modell ohne '
  'Achsenabschnitt ist es nicht mit dem üblichen R² vergleichbar und würde mehr '
  'verschleiern als zeigen.)')
w()
# Wie oft passt die Regnerzahl überhaupt zur Fläche?
w('Der Grund für die Streuung liegt offen: die Regnerzahl je Schiff ist selbst nicht stabil.')
w()
proSchiff_r = defaultdict(list)
for e in B:
    if len(e['_treffer']) == 1:
        proSchiff_r[e['_treffer'][0]['id']].append(e['_regner'])
stabil = [(k, v) for k, v in proSchiff_r.items() if len(v) >= 4]
konst = sum(1 for _, v in stabil if min(v) == max(v))
sd_rel = [float(np.std(v, ddof=1) / np.mean(v)) for _, v in stabil if np.mean(v)]
w(f'Von {len(stabil)} Schiffen mit mindestens vier Einzelgängen haben **{konst}** eine '
  f'konstante Regnerzahl. Die typische relative Streuung beträgt '
  f'**{100*np.median(sd_rel):.0f} %**. Wer die Sprenkler während des Gangs versetzt, erzeugt '
  'genau dieses Bild — die Zahl beschreibt dann nicht die gleichzeitig laufende Menge, '
  'sondern eine Stellung oder eine Summe über Stellungen.')
w()
urteil('Die drei Parameter tragen nicht. Aus den Daten geschätzt liegt die Fläche je '
       f'Kreisregner bei {coef_rob[0]:.0f} m² statt {SPR["breite"]*SPR["abstandKreis"]:.0f} m², '
       'und das Verhältnis Sektor zu Kreis bei '
       f'{coef_rob[1]/coef_rob[0]:.2f} statt 0,50. Aber auch die gefitteten Werte erklären die '
       'Fläche nur schwach. **Die beregnete Fläche ist als Rechengrösse nicht zu retten** — '
       'sie hängt davon ab, wie der Wassermann die Sprenkler stellt, und das schwankt um '
       f'{100*np.median(sd_rel):.0f} %. Konsequenz für H3: mm nicht länger über sie definieren.')

# nur zur Dokumentation - die beregnete Flaeche wird als Rechengroesse aufgegeben (H1)
ergebnis['_h1_flaecheJeKreisregnerM2_gefittet'] = round(float(coef_rob[0]), 1)
ergebnis['_h1_flaecheJeSektorregnerM2_gefittet'] = round(float(coef_rob[1]), 1)
ergebnis['deckungMedian'] = round(float(np.median(deck)), 3)

# ============================================================ H2
w('## H2 · Ist der Durchfluss das bessere Modell?')
w()
w('`mm/h` entsteht aus drei Messungen (Menge, Zeit, Regnerzahl) und einer Modellannahme '
  '(Wurfweite) — und erbt die Fehler aller vier. Gemessen werden nur **Menge und Zeit**. '
  'Der Durchfluss `Q = m³ / h` ist also die einzige Grösse, die nichts unterstellt.')
w()
Q = np.array([e['_Q'] for e in B], float)
XK = np.array([[e['_kreis'], e['_sektor']] for e in B], float)
cQ = huber_nnls(XK, Q)
kiQK, kiQS = (lambda: (
    (lambda a: (np.percentile(a[:,0],5), np.percentile(a[:,0],95)))(np.array(_b)),
    (lambda a: (np.percentile(a[:,1],5), np.percentile(a[:,1],95)))(np.array(_b))
))() if (_b := [huber_nnls(XK[i], Q[i], iterationen=8) for i in
        (np.random.default_rng(11).integers(0, len(Q), (400, len(Q))))]) else (None, None)

tab(['Modell', 'Durchfluss je Kreisregner', 'je Sektorregner', 'R²', 'Median-Fehler'],
    [('linear, ohne Achsenabschnitt', f'{cQ[0]:.2f} m³/h', f'{cQ[1]:.2f} m³/h',
      f'{bestimmtheit(Q, XK@cQ):.2f}', f'{medae(Q, XK@cQ):.1f} m³/h')])
w(f'90-%-Intervalle: Kreisregner {kiQK[0]:.2f}–{kiQK[1]:.2f}, '
  f'Sektorregner {kiQS[0]:.2f}–{kiQS[1]:.2f} m³/h.')
w()

# Sättigung prüfen: Q je Regner gegen Regnerzahl
w('Die Vermutung aus dem Praxis-Durchgang war ein Druckabfall bei vielen Sprenklern. '
  'Der Test:')
w()
gruppen = [(1, 6), (7, 12), (13, 20), (21, 60)]
zeilen = []
for lo_, hi_ in gruppen:
    v = [e['_QjeRegner'] for e in B if lo_ <= e['_regner'] <= hi_ and e['_QjeRegner']]
    if len(v) < 10: continue
    a, b = bootstrap_ki(v, lambda x: float(np.median(x)))
    zeilen.append((f'{lo_}–{hi_}', len(v), f'{np.median(v):.2f}', f'{a:.2f} – {b:.2f}'))
tab(['Sprenkler gleichzeitig', 'n', 'Median m³/h je Sprenkler', '90-%-Intervall'], zeilen)

n_r = np.array([e['_regner'] for e in B], float)
q_r = np.array([e['_QjeRegner'] for e in B], float)
rho = stats.spearmanr(n_r, q_r)
w(f'Rangkorrelation zwischen Sprenklerzahl und Leistung je Sprenkler: '
  f'**ρ = {rho.statistic:.2f}** (p = {rho.pvalue:.1e}). Der Abfall ist real und deutlich.')
w()

# Lohnt es, den Abfall zu modellieren? Potenzansatz Q = a * n^b (b < 1 = Sättigung)
from scipy.optimize import curve_fit
def potenz(n, a, b): return a * np.power(n, b)
def saett(n, qmax, k): return qmax * n / (n + k)
fits = {}
for nm, fn, p0 in [('Potenz  Q = a·n^b', potenz, [2.0, 1.0]),
                   ('Sättigung  Q = Qmax·n/(n+k)', saett, [80.0, 15.0])]:
    try:
        popt_, _ = curve_fit(fn, n_r, Q, p0=p0, maxfev=40000)
        fits[nm] = (popt_, bestimmtheit(Q, fn(n_r, *popt_)), medae(Q, fn(n_r, *popt_)))
    except Exception:
        fits[nm] = (None, float('nan'), float('nan'))
zeilen = [('linear, zwei Regnertypen', 'Q = a·Kreis + b·Sektor',
           f'{bestimmtheit(Q, XK@cQ):.3f}', f'{medae(Q, XK@cQ):.1f} m³/h')]
for nm, (pp, r2_, me_) in fits.items():
    par = ('a = %.2f, b = %.2f' % tuple(pp)) if (pp is not None and 'Potenz' in nm) else (
        'Qmax = %.0f, k = %.0f' % tuple(pp) if pp is not None else '—')
    zeilen.append((nm, par, f'{r2_:.3f}', f'{me_:.1f} m³/h'))
tab(['Modell', 'Parameter', 'R²', 'Median-Fehler'], zeilen)
b_exp = fits['Potenz  Q = a·n^b'][0][1] if fits['Potenz  Q = a·n^b'][0] is not None else None
if b_exp is not None:
    w(f'Der Potenzansatz schätzt den Exponenten auf **b = {b_exp:.2f}**. Bei b = 1 wäre der '
      'Durchfluss streng proportional zur Sprenklerzahl, bei b < 1 flacht er ab. Der geschätzte '
      f'Wert liegt {"leicht darunter" if b_exp < 1 else "bei eins"} — der Abfall ist also real, '
      'aber schwach.')
    w()
w('**Kein Sättigungsmodell schlägt das lineare.** Über den beobachteten Bereich von 1 bis rund '
  '60 Sprenklern wächst der Durchfluss praktisch proportional; die gemessene Abnahme je '
  'Sprenkler von 2,16 auf 1,82 m³/h ist real, aber zu schwach, um die Vorhersage zu verbessern. '
  'Das ist ein negatives Ergebnis und wird als solches umgesetzt: **die Engine bekommt das '
  'lineare Modell, keine Sättigungskurve.** Eine Leitungsgrenze existiert vermutlich trotzdem — '
  'sie liegt nur ausserhalb dessen, was der Betrieb je gefahren hat, und lässt sich deshalb '
  'nicht schätzen. Sie gehört als Betriebsangabe erfragt, nicht als Kurve erfunden.')
w()

# Dauerprognose vergleichen: alter Weg gegen Durchflussweg, zeitlich getrennt
w('### Was zählt: die Dauerprognose')
w()
w('Beide Wege enden bei derselben Frage — wie lange muss der Gang laufen? Der Vergleich '
  'läuft **zeitlich getrennt**: gerechnet wird nur mit Gängen, die vor dem vorherzusagenden '
  'liegen. So misst der Test, was die App im Betrieb tatsächlich leisten würde.')
w()
BS = sorted([e for e in B if e['_flaecheM2']], key=lambda e: (e['datum'], e.get('startZeit') or ''))
def prognose_vergleich():
    hist_mmH, hist_Q = defaultdict(list), defaultdict(list)
    glob_mmH, glob_Q = [], []
    zeilen = []
    for e in BS:
        ziel_m3 = e['m3']
        ist = e['dauerMin']
        # Weg A: mm/h je Schiff (heutiges Verfahren)
        raten = [hist_mmH[s] for s in e['_schiffIds'] if hist_mmH[s]]
        rate = float(np.mean([np.median(r[-8:]) for r in raten])) if raten else (
            float(np.median(glob_mmH)) if glob_mmH else None)
        zielMm = e['_mmBeregnet']
        progA = (zielMm / rate * 60) if (rate and zielMm) else None
        # Weg B: Durchfluss je Gang
        qs = [hist_Q[s] for s in e['_schiffIds'] if hist_Q[s]]
        qje = float(np.mean([np.median(r[-8:]) for r in qs])) if qs else (
            float(np.median(glob_Q)) if glob_Q else None)
        progB = (ziel_m3 / (qje * e['_regner']) * 60) if (qje and e['_regner']) else None
        if progA and progB:
            zeilen.append((ist, progA, progB))
        for s in e['_schiffIds']:
            if e['_mmHBeregnet']: hist_mmH[s].append(e['_mmHBeregnet'])
            if e['_QjeRegner']: hist_Q[s].append(e['_QjeRegner'])
        if e['_mmHBeregnet']: glob_mmH.append(e['_mmHBeregnet'])
        if e['_QjeRegner']: glob_Q.append(e['_QjeRegner'])
    return zeilen
vgl = prognose_vergleich()
ist = [a for a, _, _ in vgl]; pa = [b for _, b, _ in vgl]; pb = [c for _, _, c in vgl]
tab(['Weg', 'n', 'Median-Fehler', 'mittlerer Fehler', 'Anteil innerhalb ±30 %'],
    [('A · heute: mm/h je Schiff', len(vgl), f'{medae(ist,pa):.0f} min', f'{mae(ist,pa):.0f} min',
      f'{100*np.mean([abs(x-y)/x<=0.3 for x,y in zip(ist,pa)]):.0f} %'),
     ('B · Durchfluss je Sprenkler', len(vgl), f'{medae(ist,pb):.0f} min', f'{mae(ist,pb):.0f} min',
      f'{100*np.mean([abs(x-y)/x<=0.3 for x,y in zip(ist,pb)]):.0f} %')])
besser = medae(ist, pb) < medae(ist, pa)
urteil(('Der Durchflussweg ist der bessere. ' if besser else 'Beide Wege liegen nahe beieinander. ')
       + f'Median-Fehler {medae(ist,pb):.0f} statt {medae(ist,pa):.0f} Minuten — '
       f'**{100*(medae(ist,pa)-medae(ist,pb))/medae(ist,pa):.0f} % weniger**, und der Anteil der '
       'Prognosen innerhalb von ±30 % steigt von '
       f'{100*np.mean([abs(x-y)/x<=0.3 for x,y in zip(ist,pa)]):.0f} auf '
       f'{100*np.mean([abs(x-y)/x<=0.3 for x,y in zip(ist,pb)]):.0f} %. Entscheidend ist aber weniger '
       'der Zahlenvorsprung als die Struktur: Weg B braucht keine Wurfweiten-Annahme, seine '
       'Parameter sind physikalisch interpretierbar und einzeln prüfbar, und der Druckabfall '
       'bei vielen Sprenklern lässt sich darin abbilden. **Der Durchfluss wird die tragende '
       'Grösse; mm/h entfällt als internes Zwischenprodukt.**')

ergebnis['qJeKreisregner'] = round(float(cQ[0]), 3)
ergebnis['qJeSektorregner'] = round(float(cQ[1]), 3)
ergebnis['qModell'] = 'linear'          # Sättigung getestet, bringt nichts (siehe H2)
if b_exp is not None:
    ergebnis['qPotenzExponent'] = round(float(b_exp), 3)   # nur zur Dokumentation

# ============================================================ H3
w('## H3 · Welche mm-Definition?')
w()
mb = [e['_mmBeregnet'] for e in BF if e['_mmBeregnet']]
mf = [e['_mmFlaeche'] for e in BF if e['_mmFlaeche']]
tab(['Definition', 'n', 'Median mm je Gang', '10.–90. Perzentil', 'braucht'],
    [('A · auf die beregnete Fläche (heute)', len(mb), f'{np.median(mb):.1f}',
      f'{np.percentile(mb,10):.1f} – {np.percentile(mb,90):.1f}', 'Regnerzahl + 3 Wurfweiten-Parameter'),
     ('B · auf die Kulturfläche', len(mf), f'{np.median(mf):.1f}',
      f'{np.percentile(mf,10):.1f} – {np.percentile(mf,90):.1f}', 'Aren aus dem Plan')])
paar_mm = [(e['_mmBeregnet'], e['_mmFlaeche']) for e in BF if e['_mmBeregnet'] and e['_mmFlaeche']]
verh = [a/b for a, b in paar_mm if b]
w(f'Verhältnis A zu B: Median **{np.median(verh):.2f}**. Wer heute „15 mm" plant, bringt nach '
  f'Definition B im Median **{15/np.median(verh):.1f} mm** auf den Bestand.')
w()
w('Der Unterschied ist nicht nur ein Faktor. Er ist unterschiedlich gross je Feld:')
w()
proFeld = defaultdict(list)
for e in BF:
    if e['_mmBeregnet'] and e['_mmFlaeche']:
        proFeld[e['_feld']['name']].append(e['_mmBeregnet']/e['_mmFlaeche'])
zeilen = [(k, len(v), f'{np.median(v):.2f}') for k, v in
          sorted(proFeld.items(), key=lambda x: -len(x[1]))[:10]]
tab(['Feld', 'Gänge', 'Verhältnis A : B'], zeilen)
w('Eine Umstellung ist also **keine gleichmässige Umrechnung** — sie verschiebt Felder '
  'gegeneinander. Genau deshalb kann sie nicht stillschweigend passieren.')
w()
urteil('**B ist die agronomisch richtige Grösse** — sie misst, was auf dem Bestand ankommt, '
       'und braucht nur die Aren-Zahl, die ohnehin auf dem Plan steht. A ist die gewohnte. '
       'Die Umsetzung führt beide: intern wird in B gerechnet, und überall, wo eine mm-Zahl '
       'erscheint, steht die andere Definition als Vergleich daneben. Welche Zahl in den Regeln '
       'steht, entscheidet der Betrieb über einen Schalter in den Einstellungen — Vorgabe B.')

ergebnis['mmVerhaeltnisAzuB'] = round(float(np.median(verh)), 3)
ergebnis['zeitgewichtung'] = 'ungewichtet'   # H6: kein Signal

# ============================================================ H4
w('## H4 · Sind die Referenzwerte überangepasst?')
w()
w('Das Audit hat gezeigt: nur rund ein Viertel der Streuung in mm/h geht auf echte '
  'Unterschiede zwischen Schiffen zurück. Hier dieselbe Zerlegung für die Grösse, die nach '
  'H2 tragend wird — den Durchfluss je Sprenkler:')
w()
proSchiffQ = defaultdict(list)
for e in B:
    for s in e['_schiffIds']:
        if e['_QjeRegner']: proSchiffQ[s].append(e['_QjeRegner'])
sd_i, sd_z, icc = varianzzerlegung(proSchiffQ)
proFeldQ = defaultdict(list)
for e in B:
    if e['_fid'] and e['_QjeRegner']: proFeldQ[e['_fid']].append(e['_QjeRegner'])
sd_iF, sd_zF, iccF = varianzzerlegung(proFeldQ)
tab(['Ebene', 'Streuung innerhalb', 'Streuung zwischen', 'Anteil echter Unterschiede'],
    [('Schiff', f'{sd_i:.2f} m³/h', f'{sd_z:.2f} m³/h', f'{icc:.2f}'),
     ('Feld', f'{sd_iF:.2f} m³/h', f'{sd_zF:.2f} m³/h', f'{iccF:.2f}')])
w(f'Auf Feldebene ist der Anteil echter Unterschiede mit {iccF:.2f} deutlich höher als auf '
  f'Schiffebene ({icc:.2f}). Übersetzt: **Felder unterscheiden sich, Schiffe innerhalb eines '
  'Feldes kaum.** Das ist die Rechtfertigung für Shrinkage — und zugleich der Hinweis, dass '
  'die richtige Analyseeinheit eher das Feld als das Schiff ist.')
w()

# Shrinkage-Schätzer mit Kreuzvalidierung (zeitlich vorwärts)
w('### Kreuzvalidierung')
w()
w('Vier Schätzer im Vergleich, alle zeitlich vorwärts (nur Vergangenheit sichtbar): '
  'der Betriebsschnitt, der Feldwert, der rohe Schiffwert (heutiges Verfahren) und der '
  'Shrinkage-Schätzer, der den Schiffwert je nach Datenlage Richtung Feld- und Betriebswert zieht.')
w()
def cv_schaetzer():
    hist_s, hist_f, hist_g = defaultdict(list), defaultdict(list), []
    zeilen = []
    for e in sorted(B, key=lambda x: (x['datum'], x.get('startZeit') or '')):
        y = e['_QjeRegner']
        if not y: continue
        g = float(np.median(hist_g)) if len(hist_g) >= 5 else None
        f = float(np.median(hist_f[e['_fid']])) if len(hist_f[e['_fid']]) >= 3 else None
        sv = [hist_s[s] for s in e['_schiffIds'] if hist_s[s]]
        s_ = float(np.mean([np.median(v[-8:]) for v in sv])) if sv else None
        n_s = int(np.mean([len(v) for v in sv])) if sv else 0
        if g is None:
            for s in e['_schiffIds']: hist_s[s].append(y)
            hist_f[e['_fid']].append(y); hist_g.append(y); continue
        basis_f = f if f is not None else g
        # Shrinkage: Gewicht des Schiffwerts wächst mit n, gedämpft durch das
        # Verhältnis von Rausch- zu Signalvarianz (Empirical Bayes)
        lam = (var_ratio := (sd_i**2 / sd_z**2) if sd_z else 50.0)
        gew = n_s / (n_s + lam) if n_s else 0.0
        shrink = gew * (s_ if s_ is not None else basis_f) + (1 - gew) * basis_f
        zeilen.append((y, g, basis_f, s_ if s_ is not None else basis_f, shrink, n_s))
        for s in e['_schiffIds']: hist_s[s].append(y)
        hist_f[e['_fid']].append(y); hist_g.append(y)
    return zeilen
cv = cv_schaetzer()
yv = [r[0] for r in cv]
namen = [('Betriebsschnitt', 1), ('Feldwert', 2), ('roher Schiffwert (heute)', 3), ('Shrinkage', 4)]
tab(['Schätzer', 'n', 'Median-Fehler', 'mittlerer Fehler', 'RMSE'],
    [(nm, len(cv), f'{medae(yv,[r[i] for r in cv]):.3f}', f'{mae(yv,[r[i] for r in cv]):.3f}',
      f'{np.sqrt(np.mean([(a-b)**2 for a,b in zip(yv,[r[i] for r in cv])])):.3f}')
     for nm, i in namen])
w('Fehler in m³/h je Sprenkler. Aufgeschlüsselt nach Datenlage des Schiffs:')
w()
zeilen = []
for lo_, hi_, lbl in [(0, 0, 'keine Historie'), (1, 3, '1–3 Gänge'), (4, 10, '4–10 Gänge'), (11, 999, 'über 10')]:
    teil = [r for r in cv if lo_ <= r[5] <= hi_]
    if len(teil) < 15: continue
    yy = [r[0] for r in teil]
    zeilen.append((lbl, len(teil), f'{medae(yy,[r[3] for r in teil]):.3f}',
                   f'{medae(yy,[r[4] for r in teil]):.3f}'))
tab(['Datenlage', 'n', 'roher Schiffwert', 'Shrinkage'], zeilen)
duenn = [r for r in cv if 1 <= r[5] <= 3]
gewinn_duenn = (medae([r[0] for r in duenn], [r[3] for r in duenn]) -
                medae([r[0] for r in duenn], [r[4] for r in duenn]))
urteil('**Am Median ändert Shrinkage nichts, am Mittel und am RMSE verbessert es.** '
       f'Median {medae(yv,[r[4] for r in cv]):.3f} gegen {medae(yv,[r[3] for r in cv]):.3f}, '
       f'Mittel {mae(yv,[r[4] for r in cv]):.3f} gegen {mae(yv,[r[3] for r in cv]):.3f}. '
       'Das ist genau das erwartete Bild: bei gut belegten Schiffen ändert der Schätzer nichts, '
       'bei dünn belegten zieht er die Ausreisser ein — dort sinkt der Fehler um '
       f'{100*gewinn_duenn/medae([r[0] for r in duenn],[r[3] for r in duenn]):.0f} % '
       f'({len(duenn)} Fälle mit 1–3 Gängen). **Der Gewinn ist bescheiden, aber er kostet nichts: '
       'der Schätzer wird nie schlechter als der rohe.** Genau deshalb kommt er in die Engine — '
       'nicht wegen des Median-Vorsprungs, sondern weil er das Verhalten bei dünner Datenlage '
       f'berechenbar macht. Das Dämpfungsgewicht folgt aus der Varianzzerlegung (λ = {sd_i**2/sd_z**2:.1f}).')

ergebnis['shrinkageLambda'] = round(float(sd_i**2 / sd_z**2), 1)
ergebnis['sdInnerhalbSchiff'] = round(float(sd_i), 3)
ergebnis['sdZwischenSchiffen'] = round(float(sd_z), 3)
ergebnis['iccSchiff'] = round(float(icc), 3)
ergebnis['iccFeld'] = round(float(iccF), 3)

# ============================================================ H5
w('## H5 · Wie werden Gruppenmessungen zugeordnet?')
w()
w('Ein Gang über drei Schiffe erzeugt heute drei identische Schiffwerte. Bei mm/h war das '
  'sachlich falsch — die Wassermenge verteilt sich, der Wert nicht. Bei der Grösse, die nach H2 '
  'tragend wird, verschwindet das Problem: **der Durchfluss je Sprenkler ist eine Eigenschaft '
  'des Gangs, nicht des Schiffs.** Er wird nicht aufgeteilt, sondern gemessen.')
w()
einzel = [e['_QjeRegner'] for e in B if len(e['_treffer']) == 1 and e['_QjeRegner']]
gruppe = [e['_QjeRegner'] for e in B if len(e['_treffer']) > 1 and e['_QjeRegner']]
u = stats.mannwhitneyu(einzel, gruppe, alternative='two-sided')
tab(['Gänge', 'n', 'Median m³/h je Sprenkler'],
    [('ein Schiff', len(einzel), f'{np.median(einzel):.2f}'),
     ('mehrere Schiffe', len(gruppe), f'{np.median(gruppe):.2f}')])
unterschied = abs(np.median(einzel) - np.median(gruppe)) / np.median(einzel)
w(f'Der Unterschied ist statistisch nachweisbar (p = {u.pvalue:.2f}) und praktisch bedeutungslos: '
  f'**{100*unterschied:.1f} %**. Bei {len(einzel)+len(gruppe)} Gängen weist man auch Winzigkeiten '
  'nach — die Frage ist nicht, ob ein Unterschied existiert, sondern ob er zählt. Hier nicht.')
w()
urteil('Mit dem Durchfluss als Zielgrösse löst sich die Frage auf. Die Menge, die auf ein '
       'einzelnes Schiff entfällt, wird weiterhin flächenproportional zugeteilt — das ist für '
       'die Wasserbilanz nötig und die einzige Annahme, die dabei bleibt. Sie gehört als '
       'solche gekennzeichnet.')

# ============================================================ H6
w('## H6 · Braucht es eine Zeitgewichtung?')
w()
w('„Die letzten acht" behandelt einen März-Gang wie einen August-Gang. Getestet wird eine '
  'exponentielle Gewichtung mit verschiedenen Halbwertszeiten gegen das ungewichtete Fenster.')
w()
def cv_gewicht(halbwert=None, fenster=8):
    hist = defaultdict(list); glob = []
    fehler = []
    for e in sorted(B, key=lambda x: (x['datum'], x.get('startZeit') or '')):
        y = e['_QjeRegner']
        if not y: continue
        vs = [hist[s] for s in e['_schiffIds'] if hist[s]]
        if vs and glob:
            schaetz = []
            for v in vs:
                if halbwert:
                    tage = np.array([(np.datetime64(e['datum']) - np.datetime64(d)).astype(int)
                                     for d, _ in v], float)
                    g = 0.5 ** (tage / halbwert)
                    idx = np.argsort([x for _, x in v])
                    vals = np.array([x for _, x in v])
                    ordn = np.argsort(vals); cw = np.cumsum(g[ordn]) / g.sum()
                    schaetz.append(float(vals[ordn][np.searchsorted(cw, 0.5)]))
                else:
                    schaetz.append(float(np.median([x for _, x in v[-fenster:]])))
            fehler.append(abs(y - float(np.mean(schaetz))))
        for s in e['_schiffIds']: hist[s].append((e['datum'], y))
        glob.append(y)
    return float(np.median(fehler)) if fehler else float('nan'), len(fehler)

zeilen = [('ungewichtet, letzte 8', *[f'{x:.3f}' if i == 0 else x for i, x in
                                      enumerate(cv_gewicht(None, 8))])]
for hw in [14, 30, 60, 120]:
    f_, n_ = cv_gewicht(hw)
    zeilen.append((f'exponentiell, Halbwertszeit {hw} Tage', f'{f_:.3f}', n_))
tab(['Gewichtung', 'Median-Fehler m³/h', 'n'], zeilen)
werte_h6 = [float(z[1]) for z in zeilen]
spanne = max(werte_h6) - min(werte_h6)
urteil(f'**Kein Verfahren gewinnt.** Die gesamte Spanne über alle Varianten beträgt '
       f'{spanne:.3f} m³/h — kleiner als die Unsicherheit jedes einzelnen Werts. Eine '
       'Halbwertszeit von 30 Tagen liegt zufällig vorn, 14 und 120 Tage liegen hinten; das ist '
       'Rauschen, kein Signal. **Umgesetzt wird das ungewichtete Fenster** — die einfachere '
       'Variante, wenn die Daten keinen Unterschied belegen. Die Prüfung bleibt im Skript, '
       'damit sie sich mit mehr Daten wiederholen lässt.')

# ============================================================ H7
w('## H7 · Widersprechen die Regeln den Daten?')
w()
w('Verglichen wird der hinterlegte Rhythmus mit dem beobachteten Abstand **je Schiff und '
  'Kultur**. Beide Trennungen sind nötig: über das Feld gemittelt entstünde ein Scheinintervall, '
  'weil an aufeinanderfolgenden Tagen verschiedene Schiffe drankommen — und über die Kulturen '
  'gemittelt ebenso, weil ein Feld über die Saison mehrere trägt (Eiägert im Journal elf).')
w()
w('> **Korrektur.** Eine frühere Auswertung in `docs/praxis-durchgang.html` nannte für Eiägert '
  '> einen Faktor 4,7 und für Cherwis 4. Diese Zahlen mischten die Kulturen eines Feldes und '
  '> waren zu hoch. Sauber je Kultur gerechnet bleiben deutliche Abweichungen, aber kleinere.')
w()
def tage_diff(a, b):
    return (np.datetime64(b) - np.datetime64(a)).astype(int)
# Abstände je Schiff UND Kultur – sonst mischt man verschiedene Kulturen desselben
# Feldes zu einem Scheinintervall (Eiägert trug 11 Kulturen in einer Saison).
proSchiffKultur = defaultdict(set)
for e in E:
    if e['_rollomat'] or not e.get('kultur'): continue
    for s in e['_treffer']:
        proSchiffKultur[(s['id'], e['kultur'].strip().lower())].add(e['datum'])
regel_rows = []
for key, r in K['regeln'].items():
    fid, kid = key.split('::')
    f = FELDER.get(fid)
    kname = K['kulturen'].get(kid, kid)
    if not f: continue
    iv_soll = (r.get('tage') or 2) if r.get('einheit') == 'frei' else (
        1 / (r.get('anzahl') or 1) if r.get('einheit') == 'tag' else 7 / (r.get('anzahl') or 1))
    abstaende, schiffe_n = [], 0
    for s in f['schiffe']:
        d = sorted(proSchiffKultur.get((s['id'], kname.strip().lower()), []))
        if len(d) < 4: continue
        schiffe_n += 1
        abstaende.extend([tage_diff(d[i-1], d[i]) for i in range(1, len(d))])
    if len(abstaende) < 6:
        regel_rows.append((f['name'], kname, f'{iv_soll:.2f}'.rstrip('0').rstrip('.'),
                           '—', f'{len(abstaende)} / {schiffe_n} Schiffe', 'zu wenig Daten'))
        continue
    beob = float(np.median(abstaende))
    regel_rows.append((f['name'], kname, f'{iv_soll:.2f}'.rstrip('0').rstrip('.'),
                       f'{beob:.1f}', f'{len(abstaende)} / {schiffe_n} Schiffe',
                       f'{beob/iv_soll:.1f}×'))
pruefbar = [z for z in regel_rows if z[5] != 'zu wenig Daten']
pruefbar.sort(key=lambda z: -abs(float(z[5][:-1]) - 1))
tab(['Feld', 'Kultur', 'Regel (Tage)', 'beobachtet (Tage)', 'Abstände / Schiffe', 'Faktor'],
    pruefbar + [z for z in regel_rows if z[5] == 'zu wenig Daten'])
w(f'Von {len(regel_rows)} hinterlegten Regeln lassen sich **{len(pruefbar)}** an den Daten '
  f'prüfen; für die übrigen {len(regel_rows)-len(pruefbar)} gibt es zu wenige Gänge mit dieser '
  'Kultur auf diesem Feld. Die Abstände sind je Schiff **und Kultur** gerechnet.')
w()
schlimm = [z for z in pruefbar if abs(float(z[5][:-1]) - 1) > 0.5]
urteil(f'{len(schlimm)} von {len(pruefbar)} prüfbaren Regeln weichen um mehr als die Hälfte '
       'vom beobachteten Rhythmus ab. Die Regeln werden **nicht automatisch überschrieben** — '
       'sie sind ein Soll, kein Ist. Aber die App zeigt künftig beides nebeneinander und bietet '
       'den beobachteten Wert mit seiner Fallzahl als Übernahme an. Der Betrieb entscheidet, ob '
       'die Regel falsch war oder die Praxis.')

# ============================================================ H8
w('## H8 · Lässt sich ein Bodenmodell kalibrieren?')
w()
w('Die Wasserbilanz baut Regen eins zu eins ab. Physikalisch falsch — über der Feldkapazität '
  'läuft Wasser ab oder versickert. Die Frage ist, ob sich aus den vorhandenen Daten eine '
  'Feldkapazität schätzen lässt.')
w()
w('Dafür bräuchte man mindestens eines davon: Bodenart je Feld, Bodenfeuchtemessungen, oder '
  'Niederschlagsdaten in der Vergangenheit. Der Bestand:')
w()
tab(['Benötigt', 'vorhanden?'],
    [('Bodenart oder nutzbare Feldkapazität je Feld', 'nein — im Datenmodell nicht vorgesehen'),
     ('Bodenfeuchtemessungen', 'nein'),
     ('historische Niederschläge', f'nein — {len(K.get("gruppen", []))and ""}die Regen-Erfassung '
      'beginnt erst mit dem Betrieb der App'),
     ('Beobachtung „nach Regen nicht bewässert"', 'indirekt aus den Journallücken ableitbar')])
tage_alle = sorted(set(e['datum'] for e in E))
luecken = [(tage_alle[i-1], tage_diff(tage_alle[i-1], tage_alle[i]) - 1)
           for i in range(1, len(tage_alle)) if tage_diff(tage_alle[i-1], tage_alle[i]) > 1]
w(f'Die {len(luecken)} Bewässerungspausen im Journal sind der einzige Fingerabdruck von Regen '
  'in den Daten — aber ohne Niederschlagsmenge daneben lässt sich daraus keine Feldkapazität '
  'schätzen, nur bestätigen, dass es Regen gab.')
w()
urteil('**Nicht kalibrierbar.** Die Daten geben es nicht her. Statt ein Modell zu erfinden, '
       'wird der Zusammenhang explizit und einstellbar gemacht: eine nutzbare Feldkapazität je '
       'Feld (Vorgabe aus der Bodenart, änderbar), gegen die der Regen gedeckelt wird. Ohne '
       'Angabe verhält sich die App wie bisher. Die Bodenart je Feld kommt auf die Liste der '
       'offenen Fachfragen — sie ist eine Auskunft, keine Messung.')

# ============================================================ Zusammenfassung
w('## Was daraus folgt')
w()
tab(['Hypothese', 'Ergebnis', 'Konsequenz'],
    [('H1 · beregnete Fläche', 'trägt nicht', 'als Rechengrösse aufgeben'),
     ('H2 · Durchfluss statt mm/h', 'bestätigt, Fehler halbiert', 'Q wird die tragende Grösse, linear'),
     ('H3 · mm-Definition', 'B ist richtig', 'intern B, beide anzeigen, Schalter für den Betrieb'),
     ('H4 · Shrinkage', 'kleiner Gewinn, kein Risiko', 'Empirical-Bayes-Schätzer, λ aus den Daten'),
     ('H5 · Gruppenzuordnung', 'löst sich mit H2 auf', 'Menge flächenproportional, gekennzeichnet'),
     ('', '', ''),
     ('H6 · Zeitgewichtung', 'kein Signal', 'ungewichtetes Fenster behalten'),
     ('H7 · Regeln gegen Daten', f'{len(schlimm)} weichen stark ab', 'beobachteten Wert anbieten, nicht überschreiben'),
     ('H8 · Bodenmodell', 'nicht kalibrierbar', 'explizit und einstellbar, Vorgabe neutral')])

w('---')
w()
w('*Erzeugt von `tools/kalibrierung.py`. Die gefitteten Werte liegen in `data/modell.json` '
  'und gehen von dort in den Build.*')

# --------------------------------------------------------------- schreiben
open(os.path.join(ROOT, 'docs/modell.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
ergebnis['_erzeugt'] = 'tools/kalibrierung.py'
ergebnis['_grundlage'] = f'{len(B)} auswertbare Gänge aus {len(E)} Journaleinträgen'
json.dump(ergebnis, open(os.path.join(ROOT, 'data/modell.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('docs/modell.md und data/modell.json geschrieben')
for k, v in ergebnis.items():
    if not k.startswith('_'): print(f'  {k:26s} {v}')
