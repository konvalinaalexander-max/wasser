"""Gemeinsame Datenaufbereitung für Audit und Kalibrierung.

Lädt Journal und den aus der App exportierten Kontext und reichert jeden
Eintrag um die abgeleiteten Grössen an. Eine einzige Stelle, damit Audit und
Kalibrierung garantiert dasselbe rechnen.
"""
import json, os
from collections import defaultdict
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def laden():
    J = json.load(open(os.path.join(ROOT, 'data/journal.json'), encoding='utf-8'))
    K = json.load(open(os.path.join(ROOT, 'tools/_kontext.json'), encoding='utf-8'))
    E = J['eintraege']
    felder, jmap, spr = K['felder'], K['journalMap'], K['sprenkler']

    for e in E:
        fid = jmap.get(e['feldJournal'])
        f = felder.get(fid) if fid else None
        e['_fid'], e['_feld'] = (fid if f else None), f
        e['_monat'] = e['datum'][:7]
        e['_kreis'] = e.get('kreisregner') or 0
        e['_sektor'] = e.get('sektorregner') or 0
        e['_regner'] = e['_kreis'] + e['_sektor']
        e['_nSchiffe'] = len(e.get('schiffe') or [])
        tr = []
        if f:
            nummern = set(str(x) for x in (e.get('schiffe') or []))
            tr = [s for s in f['schiffe'] if s['nummer'] in nummern]
        e['_treffer'] = tr
        e['_schiffIds'] = [s['id'] for s in tr]
        e['_flaecheM2'] = sum(s['flaecheM2'] or 0 for s in tr) or None
        e['_beregnet'] = (e['_kreis'] * spr['breite'] * spr['abstandKreis']
                          + e['_sektor'] * spr['breite'] * spr['abstandSektor']) or None
        d, m3 = e.get('dauerMin'), e.get('m3')
        e['_h'] = (d / 60) if d else None
        e['_Q'] = (m3 / e['_h']) if (m3 and e['_h'] and e['_h'] > 0) else None
        e['_QjeRegner'] = (e['_Q'] / e['_regner']) if (e['_Q'] and e['_regner']) else None
        e['_mmBeregnet'] = (m3 * 1000 / e['_beregnet']) if (m3 and e['_beregnet']) else None
        e['_mmFlaeche'] = (m3 * 1000 / e['_flaecheM2']) if (m3 and e['_flaecheM2']) else None
        e['_mmHBeregnet'] = (e['_mmBeregnet'] / e['_h']) if (e['_mmBeregnet'] and e['_h']) else None
        e['_mmHFlaeche'] = (e['_mmFlaeche'] / e['_h']) if (e['_mmFlaeche'] and e['_h']) else None
        e['_deckung'] = (e['_beregnet'] / e['_flaecheM2']) if (e['_beregnet'] and e['_flaecheM2']) else None
        e['_rollomat'] = ('rolo' in str(e.get('schiffRoh') or '').lower()
                          or 'rolo' in str(e.get('bemerkung') or '').lower())
    return E, K


def brauchbar(E, mit_flaeche=False, ohne_rollomat=True):
    """Einträge, aus denen sich ein Erfahrungswert ableiten lässt."""
    out = []
    for e in E:
        if ohne_rollomat and e['_rollomat']:
            continue
        if not (e.get('m3') and e.get('dauerMin') and e['dauerMin'] >= 5 and e['_regner']):
            continue
        if not e['_treffer']:
            continue
        if mit_flaeche and not e['_flaecheM2']:
            continue
        # physikalisch unmögliche Gänge fliegen raus – begründet, nicht nach Gefühl
        if e['_QjeRegner'] and not (0.5 <= e['_QjeRegner'] <= 5.0):
            continue
        out.append(e)
    return out


# ---------------------------------------------------------------- Statistik-Helfer
def median(a):
    a = [x for x in a if x is not None]
    return float(np.median(a)) if a else None


def mad(a):
    a = np.asarray([x for x in a if x is not None], dtype=float)
    if not len(a):
        return None
    return float(np.median(np.abs(a - np.median(a))))


def nnls_durch_null(X, y):
    """Nichtnegative kleinste Quadrate ohne Achsenabschnitt (scipy)."""
    from scipy.optimize import nnls
    coef, rest = nnls(np.asarray(X, dtype=float), np.asarray(y, dtype=float))
    return coef, float(rest)


def huber_nnls(X, y, iterationen=20, k=1.345):
    """Robuste Variante: iterativ neu gewichtete NNLS, dämpft Ausreisser,
    statt sie vorher wegzuwerfen."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    w = np.ones(len(y))
    coef = None
    for _ in range(iterationen):
        sw = np.sqrt(w)
        coef, _ = nnls_durch_null(X * sw[:, None], y * sw)
        r = y - X @ coef
        s = 1.4826 * np.median(np.abs(r - np.median(r))) or 1.0
        z = np.abs(r / s)
        w = np.where(z <= k, 1.0, k / np.maximum(z, 1e-9))
    return coef


def bestimmtheit(y, yhat):
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    ss_res = float(np.sum((y - yhat) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    return 1 - ss_res / ss_tot if ss_tot else float('nan')


def mae(y, yhat):
    return float(np.mean(np.abs(np.asarray(y, float) - np.asarray(yhat, float))))


def medae(y, yhat):
    return float(np.median(np.abs(np.asarray(y, float) - np.asarray(yhat, float))))


def bootstrap_ki(daten, fn, n=1500, alpha=0.10, seed=7):
    """Perzentil-Bootstrap für eine beliebige Statistik."""
    rng = np.random.default_rng(seed)
    daten = list(daten)
    if len(daten) < 3:
        return (None, None)
    werte = []
    for _ in range(n):
        stich = [daten[i] for i in rng.integers(0, len(daten), len(daten))]
        try:
            werte.append(fn(stich))
        except Exception:
            pass
    if not werte:
        return (None, None)
    return (float(np.percentile(werte, 100 * alpha / 2)),
            float(np.percentile(werte, 100 * (1 - alpha / 2))))


def varianzzerlegung(gruppen):
    """gruppen: dict id -> Liste von Werten. Gibt (sd_innen, sd_zwischen, icc)."""
    mehr = {k: v for k, v in gruppen.items() if len(v) >= 3}
    if len(mehr) < 3:
        return (None, None, None)
    innen, mitten = [], []
    for v in mehr.values():
        m = float(np.median(v))
        mitten.append(m)
        innen.extend([x - m for x in v])
    var_i = float(np.var(innen, ddof=1))
    n_quer = float(np.mean([len(v) for v in mehr.values()]))
    var_z = max(0.0, float(np.var(mitten, ddof=1)) - var_i / n_quer)
    icc = var_z / (var_z + var_i) if (var_z + var_i) > 0 else float('nan')
    return (float(np.sqrt(var_i)), float(np.sqrt(var_z)), icc)
