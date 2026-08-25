#!/usr/bin/env python3
"""Baut build/wasserplan.html aus src/ + data/.

src/*.html und src/*.js werden in Dateinamen-Reihenfolge konkateniert.
Die fuenf data/*.json werden zu einem Objekt {katalog, journal, kulturen,
regeln, gruppen} zusammengesetzt und ersetzen den Platzhalter __DATA__
im seedData-Block.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(ROOT, 'src')
DATA = os.path.join(ROOT, 'data')
OUT  = os.path.join(ROOT, 'build', 'wasserplan.html')

DATA_KEYS = ['katalog', 'journal', 'kulturen', 'regeln', 'gruppen']


def build_data():
    d = {}
    for k in DATA_KEYS:
        with open(os.path.join(DATA, k + '.json'), encoding='utf-8') as f:
            d[k] = json.load(f)
    js = json.dumps(d, ensure_ascii=False, separators=(', ', ': '))
    # </script> im JSON darf den Block nicht vorzeitig schliessen
    return js.replace('</script>', '<\\/script>')


def main():
    parts = sorted(os.listdir(SRC))
    out = []
    for p in parts:
        if not (p.endswith('.html') or p.endswith('.js')):
            continue
        with open(os.path.join(SRC, p), encoding='utf-8') as f:
            out.append(f.read())
    html = ''.join(out)
    if '__DATA__' not in html:
        sys.exit('FEHLER: Platzhalter __DATA__ nicht gefunden.')
    html = html.replace('__DATA__', build_data())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print('geschrieben: %s (%.2f MB)' % (OUT, os.path.getsize(OUT) / 1e6))


if __name__ == '__main__':
    main()
