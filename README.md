# Wasserplan

Offline-Webapp zur Bewässerungsplanung für einen Bio-Gemüsebaubetrieb im Raum Zürich.

## Aufbau

Die auslieferbare Datei ist `build/wasserplan.html` — eine einzelne, offline per
Doppelklick lauffähige HTML-Datei ohne externe Abhängigkeiten.

Sie wird **nicht von Hand gepflegt**, sondern gebaut:

```
python3 assemble.py      # src/ + data/  ->  build/wasserplan.html
```

- `src/` — Quellcode in Modulen (Ladereihenfolge = Dateinamen-Reihenfolge)
  - `01_head.html` — Doctype, Head, komplettes CSS
  - `02_body.html` — Body-Gerüst, Start-Screen, Shells, `seedData`-Platzhalter
  - `04_core.js` — Helfer, Geometrie, Datum (`D`), Übersetzungen (`I18N`/`T`), `Store`
  - `05_engine.js` — `Engine`: Referenzwerte, Wasserbilanz, Tagesplanung, Regen
  - `06_plan.js` — `PlanView`: SVG-Editor (Zoom/Pan, Polygone, Sektoren, Rohre)
  - `07_admin.js` — `Admin` (Basis): Tabs, Tagesplan, Auftragskarten, Regen-Dialog
  - `08_feldeditor.js` — `FeldEditor` (4-Reiter-Komponente)
  - `09_admin2.js` — Admin: Standorte, Kulturen, Regeln, Journal, Einstellungen
  - `10_setup.js` — `Setup`: geführte Ersteinrichtung
  - `11_wm.js` — `WM`: mobile Wassermann-Oberfläche
  - `12_init.js` — `App`, `boot()`
- `data/` — Startdaten (werden als JSON in den `seedData`-Block eingebettet)
  - `katalog.json` (Standorte + Felder + Schiffe, inkl. base64-Planbilder)
  - `journal.json` (`{eintraege, probleme, kapazitaet}`)
  - `kulturen.json`, `regeln.json`, `gruppen.json`

## Dokumentation

- `docs/pflichtenheft.md` — fachlicher Anforderungskatalog
- `docs/entwicklerhandbuch.md` — technische Übersicht, Datenmodell, Invarianten
