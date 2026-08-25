# Wasserplan — Entwickler-Handbuch (Übergabe an Claude Code)

Dieses Dokument macht dich (die KI, die in Claude Code weiterarbeitet) in einer Sitzung arbeitsfähig. Es beschreibt, **was** die App ist, **wie** sie technisch aufgebaut ist, **wo** was steht und **wie** man sauber daran weiterarbeitet. Lies es vollständig, bevor du Code änderst.

> **Kontext-Sprache:** Das gesamte Projekt läuft auf Deutsch (Schweizer Landwirtschaftsbetrieb). Der Auftraggeber duzt und erwartet Antworten auf Deutsch. Fachbegriffe wie **„Schiff"** (= eine nummerierte Bewässerungs-Teilfläche innerhalb eines Feldes) bleiben immer deutsch, auch in fremdsprachigen UI-Versionen.

---

## 0. Das Wichtigste zuerst: Wie ist der Code organisiert?

Die ausgelieferte Datei `wasserplan.html` (ca. 2,7 MB) ist ein **zusammengebautes Artefakt**, kein handgepflegter Quellcode. Sie besteht aus zwei Teilen:

1. **~161 KB Code** (CSS + HTML-Gerüst + JavaScript) — das ist der eigentliche Quellcode, den du editierst.
2. **~2,57 MB eingebettete Daten** in einem `<script id="seedData" type="application/json">…</script>`-Block am Ende des `<body>`. Darin stecken 29 base64-JPEGs der Planzeichnungen, 1069 Journaleinträge, Kulturen, Regeln und Gruppen.

**Der Originalcode war in 12 Module aufgeteilt**, die ein Python-Build-Skript (`assemble.py`) zu `wasserplan.html` zusammenfügt und dabei die Daten als `__DATA__`-Platzhalter einbettet. Diese Modulstruktur ging beim Sitzungswechsel verloren (der Build-Container wurde zurückgesetzt) — **du bekommst nur die fertige HTML**. Das ist in Ordnung: Die HTML ist vollständig und lauffähig. Aber du musst wissen, dass sie eigentlich aus Modulen entsteht (siehe §3), damit du sinnvoll refaktorierst.

### Empfohlenes Vorgehen in Claude Code

Du hast zwei realistische Optionen. **Option B wird für ernsthafte Weiterarbeit dringend empfohlen.**

**Option A — direkt in der HTML editieren (nur für Kleinstfixes):**
Die HTML im Editor öffnen, den `<script>`-Codeblock oberhalb von `id="seedData"` finden, dort ändern. Nachteil: eine 2,7-MB-Datei mit einem riesigen base64-Block ist zäh zu bearbeiten, und du riskierst, den Datenblock zu beschädigen. Nur für „ein String ändern"-Fälle.

**Option B — zurück in eine saubere Projektstruktur (empfohlen):**
Als ersten Schritt in Claude Code die HTML **einmalig in Module + Datendatei zerlegen** und ein Build-Skript wiederherstellen. Konkret:

```
wasserplan/
├── src/
│   ├── 01_head.html      # <!DOCTYPE>, <head>, CSS (Teil 1)
│   ├── 02_css2.html      # CSS (Teil 2) + </style></head>
│   ├── 03_body.html      # <body>, Start-Screen, App-Shells, <script id="seedData">__DATA__</script>, <script>
│   ├── 04_core.js        # Utils, I18N, Store
│   ├── 05_engine.js      # Planungs-Engine
│   ├── 06_plan.js        # PlanView (SVG-Editor)
│   ├── 07_admin.js       # Admin: Tagesplan, Regen
│   ├── 08_admin2.js      # FeldEditor + Standort-/Schiff-/Sektor-/Rohr-Bearbeitung
│   ├── 09_admin3.js      # Kulturen, Regeln, Journal-Ansicht, Einstellungen
│   ├── 10_setup.js       # Setup-Assistent
│   ├── 11_wm.js          # Wassermann (mobil)
│   └── 12_init.js        # App-Objekt, boot(), </script></body></html>
├── data/
│   ├── katalog.json      # Standorte + Felder + Schiffe (mit base64-Bildern)
│   ├── journal.json      # {eintraege, probleme, kapazitaet}
│   ├── kulturen.json
│   ├── regeln.json
│   └── gruppen.json
├── assemble.py           # baut wasserplan.html aus src/ + data/
└── build/wasserplan.html # Output
```

**So zerlegst du die HTML zuverlässig** (die Modulgrenzen sind an Kommentar-Bannern erkennbar):

- Jedes JS-Modul beginnt mit einem Banner-Kommentar. Suche nach diesen Markern, in dieser Reihenfolge:
  `KERN:` (04) · `ENGINE` (05) · `PLANVIEW` (06) · `ADMIN —` (07) · `FELD-EDITOR` (08) · `KULTUREN & REGELN` bzw. der `Object.assign(Admin,{…})`-Block mit `vKulturen` (09) · `SETUP` (10) · `WASSERMANN` (11) · `APP —` (12).
- CSS steht in zwei `<style>`-Abschnitten im `<head>`.
- Der Datenblock ist `<script id="seedData" type="application/json">…</script>`. Ersetze seinen Inhalt durch `__DATA__` und schreibe den echten JSON-Inhalt in `data/` (aufgeteilt nach den Top-Level-Keys `katalog`, `journal`, `kulturen`, `regeln`, `gruppen`).

**assemble.py** muss dann: alle `src/`-Teile in Reihenfolge konkatenieren, die fünf `data/`-Dateien zu einem JSON `{katalog, journal, kulturen, regeln, gruppen}` zusammensetzen, `</script>`-Sequenzen im JSON escapen (`</script>` → `<\/script>`) und `__DATA__` ersetzen. Ausgabe nach `build/wasserplan.html`.

> Wenn du B wählst, verifiziere nach dem ersten Build per Diff/Screenshot, dass die neu gebaute HTML sich identisch verhält wie die gelieferte, **bevor** du inhaltlich änderst.

---

## 1. Was ist die App? (fachlicher Überblick)

Eine **Offline-Webapp zur Bewässerungsplanung** für einen Bio-Gemüsebaubetrieb im Raum Zürich. Sie ersetzt die bisher rein mündliche Organisation (Chef sagt dem Wassermann morgens, was zu tun ist).

**Betriebsstruktur:** 29 Standorte (je eine handgezeichnete Planseite) → darauf 49 benannte **Felder** → darauf 164 **Schiffe** (nummerierte Bewässerungs-Teilflächen) → optional in **Sektoren** unterteilt (verschiedene Kulturen oder Sätze auf einem Schiff).

**Zwei Rollen, ein gemeinsamer Datenbestand:**

- **Produktionsleiter (Admin, am PC):** verwaltet Standorte/Felder/Schiffe, zeichnet Polygone/Sektoren/Rohre, weist Kulturen zu, definiert Bewässerungsregeln, prüft und gibt den täglichen Plan frei, erfasst Regen.
- **Wassermann (mobil, auf dem Feld):** sieht die freigegebene Tagesliste, trägt ein was er tatsächlich bewässert hat (Schiffe, Zeit, Wasseruhr-Stand), nutzt Referenzwerte. UI dreisprachig (DE/HU/PL).

**Das Herzstück** ist die Planungs-Engine (§4): Aus Regeln + Journal-Historie + Regen berechnet sie fällige Bewässerungen und verteilt sie über die kommenden Tage, statt sie zu bündeln.

**Phasen-Plan:** Aktuell ist alles **offline** (eine HTML-Datei, Daten im Browser-RAM, Sichern/Laden per JSON-Download). Geplante **Phase 2** (noch nicht gebaut): Online-Hosting, Google-Sheets-Anbindung als Journal-Backend (über Google Apps Script als Web-App, kein OAuth), echter E-Mail-Versand (externer Dienst wie Resend, **nicht** über den Firmen-Mailserver), Login pro Rolle.

Der vollständige fachliche Anforderungskatalog steht in **`pflichtenheft-wasserplan.md`** (liegt bei). Dieses Handbuch ergänzt es um die technische Sicht.

---

## 2. Technische Grundentscheidungen

- **Kein Framework, kein Build-Tooling zur Laufzeit.** Reines HTML + CSS + Vanilla-JS (ES6+), ein einziges globales `<script>`. Bewusst so, damit die Datei per Doppelklick offline läuft.
- **Kein `localStorage`/`sessionStorage`** — steht in der Zielumgebung (Artifact-Sandbox) nicht zuverlässig zur Verfügung. Persistenz läuft ausschließlich über **manuellen JSON-Export/-Import** (`Store.exportFile()` / `Store.importDialog()`). Ausnahme: die Sprachwahl des Wassermanns liegt in einem simplen In-Memory-Objekt `localStorageless` (überlebt Reload **nicht** — bewusst simpel gehalten).
- **Ein zentrales Datenobjekt** `Store.db`, das beide Rollen teilen. Alles hängt daran.
- **SVG für die Pläne**, mit koordinaten in **relativen Anteilen 0..1** des Hintergrundbildes (nicht Pixel!). Dadurch sind Polygone bildgrößen-unabhängig.
- **Datumslogik streng lokal** (Objekt `D`), Format `YYYY-MM-DD`, keine `Date`-Zeitzonenfallen.
- **Getestet mit Playwright** (Chromium, headless). Die Testskripte selbst wurden nicht mitgeliefert (Container-Reset), aber das Muster ist: HTML per `file://` laden, Zustand per `pg.evaluate()` seeden, dann UI klicken. Konsole muss fehlerfrei bleiben.

---

## 3. Die 12 Module im Detail

Reihenfolge = Ladereihenfolge = Abhängigkeitsreihenfolge (spätere dürfen frühere nutzen).

| # | Datei | Inhalt | Öffentliche Objekte |
|---|-------|--------|---------------------|
| 01 | `01_head.html` | Doctype, Meta, **CSS Teil 1** (Design-Tokens als CSS-Variablen, Buttons, Karten, Modal, Start-Screen) | — |
| 02 | `02_css2.html` | **CSS Teil 2** (Plan/SVG, Tagesplan, mobile Wassermann-Styles, `.edtabs`, `.statrow`, `.anpassbox`), schließt `<head>` | — |
| 03 | `03_body.html` | `<body>`, Start-Screen (zwei Kacheln), Admin-Shell, Wassermann-Shell, Modal-Container, Toast, **`<script id="seedData">__DATA__</script>`**, Beginn des Haupt-`<script>` | — |
| 04 | `04_core.js` | Helfer (`$`, `el`, `esc`, `uid`, `clamp`, `num`), Geometrie (`polyArea`, `polyCenter`, `polyBBox`), **`D`** (Datum), **`I18N`/`T`** (3 Sprachen), Toast/Modal, **`Store`** | `D`, `I18N`, `T`, `Store`, `toast`, `openModal`, `closeModal` |
| 05 | `05_engine.js` | **`Engine`** — Referenzwerte, Wasserbilanz, Tagesplanung, Regenlogik | `Engine` |
| 06 | `06_plan.js` | **`PlanView(opts)`** — SVG-Editor-Komponente (Zoom/Pan, Polygon-/Sektor-/Rohr-Bearbeitung) + Geometrie-Helfer (`pointInPoly`, `distToPoly`, `rohrName`, `teileInStreifen`) | `PlanView`, Helfer |
| 07 | `07_admin.js` | **`Admin`** (Basis) — Tab-Gerüst, Tagesplan (`vPlan`), Auftragskarten, Regen-Dialog | `Admin` |
| 08 | `08_admin2.js` | **`FeldEditor`** (die 4-Reiter-Komponente) + `Object.assign(Admin,{…})` für Standorte-Ansicht, Schiff-/Sektor-/Rohr-Bearbeitung | `FeldEditor`, erweitert `Admin` |
| 09 | `09_admin3.js` | `Object.assign(Admin,{…})` — Kulturen & Regeln, Journal-Ansicht, Einstellungen (inkl. Wetterstationen) | erweitert `Admin` |
| 10 | `10_setup.js` | **`Setup`** — geführte Ersteinrichtung (nutzt `FeldEditor`) | `Setup` |
| 11 | `11_wm.js` | **`WM`** — komplette mobile Wassermann-Oberfläche + `localStorageless` | `WM`, `localStorageless` |
| 12 | `12_init.js` | **`App`** (enter/home/refreshStart), `boot()`, schließt `<script></body></html>` | `App` |

> **Wichtig zu 07/08/09:** `Admin` ist EIN Objekt, das über drei Dateien per `Object.assign` zusammengesetzt wird. Wenn du eine `Admin.xxx`-Methode suchst, kann sie in 07, 08 oder 09 stehen.

---

## 4. Das Datenmodell (`Store.db`)

Zentrale Struktur. Nach `Store.init(seed)` gebaut, dann per `Store.reindex()` mit Lookup-Indizes ergänzt (`_st`, `_fd`, `_sch`, `_ku` — jeweils id→Objekt-Maps; `_sch[schiffId]` liefert `{schiff, feld, standort}`).

```
Store.db = {
  version, erstellt,
  einstellungen: {
    ansprechperson: "Sammy",        // Name, den der Wassermann bei fehlendem Plan anrufen soll
    ansprechTelefon, adminMail,
    kapazitaetStandorte: 8,         // Warnschwelle Standorte/Tag (aus Journal p80)
    planungsHorizont: 10,           // Tage, die die Engine vorausplant
    erfahrungsstufe: "neu",         // "neu" = ausführliche Anweisungen | "erfahren" = knapp
    setupErledigt, setupUebersprungen,
    regenGefragtAm,                 // ISO-Datum: an dem Tag wurde Regen schon abgefragt
    letzteRegenStandorte: [],
    sprenkler: {breite:18, abstandKreis:23, abstandSektor:11.5}, // Formelparameter, s.u.
    journalMap: { "<journalName>": "<feldId>", … }  // Zuordnung Journal↔Feld
  },
  standorte: [ Standort ],
  felder:    [ Feld ],
  kulturen:  [ Kultur ],
  regeln:    { "<feldId>::<kulturId>": Regel },   // KEY = feldId::kulturId !
  journal:   [ JournalEintrag ],
  journalProbleme: [ … ],           // beim Import bereinigte Fälle
  journalKapazitaet: {standorteMedian, standorteP80, standorteMax, eintraegeMedian},
  regen:     [ {id, datum, mm, standortIds[], stationId} ],
  wetterstationen: [ {id, name, standortIds[]} ],  // 3 Stück default
  plan:      { "<datum>": Tagesplan },
  laufend:   [ LaufendeBewaesserung ],   // vom Wassermann gestartet, noch nicht gestoppt
  gruppen:   [ {feldJournal, schiffe[], haeufigkeit} ]  // aus Journal abgeleitete Bew.-Gruppen
}
```

**Standort**
```json
{ "id":"s01-au-landi", "seite":1, "name":"Au Landi", "gemeinde":"Volketswil",
  "bild":"data:image/jpeg;base64,…", "bildW":1000, "bildH":780,
  "istUebersicht":false, "wasseruhr":{"einheit":"m3"} }
```

**Feld** (`standortId` verweist auf Standort; `umriss` = Polygon in 0..1-Koordinaten)
```json
{ "id":"s01-au-landi__au-landi", "standortId":"s01-au-landi", "name":"Au Landi",
  "gemeinde":"Volketswil", "gemeindeFehlt":false, "gesamtflaecheAren":104,
  "umriss":[[0.1,0.03],[0.72,0.03],[0.72,0.92],[0.1,0.92]], "achse":"v",
  "geprueft":false, "unsicher":false, "hinweis":null,
  "bewaessert":true, "einzelschiff":false, "planSeite":null, "journalName":null,
  "schiffe":[ Schiff ] }
```

**Schiff** (`polygon` in 0..1; **`aren` hat Vorrang** vor der gezeichneten Fläche bei Flächenrechnungen)
```json
{ "id":"…__sch1", "nummer":"1", "polygon":[[…]], "laengeM":100, "breiteM":null,
  "aren":10, "notiz":"5 Beet", "rohre":[ Rohr ], "sektoren":[ Sektor ] }
```

**Sektor** (atomare Anbaueinheit; ein Schiff ohne Unterteilung hat 0 Sektoren, dann gilt die einzige Kultur fürs ganze Schiff)
```json
{ "id":"sek-…", "name":"2.1", "polygon":[[…]] | null, "kulturId":"k-salat",
  "pflanzdatum":"2026-06-01", "prioritaet":"normal|hoch|niedrig",
  "satz":null, "pausiert":false, "pausiertBis":null, "letzteBewaesserung":null }
```

**Rohr** (`punkte` in 0..1; `name` wird automatisch vergeben: „3" im Schiff, „3/4" in der Fahrgasse)
```json
{ "id":"rohr-…", "punkte":[[…]], "name":"3/4" }
```

**Kultur**
```json
{ "id":"k-salat", "name":"Salat", "icon":"🥬", "farbe":"#4A7C2F" }
```

**Regel** — Schlüssel im `regeln`-Objekt ist **`feldId::kulturId`** (nicht Standort! war ein bewusster Fix, weil z. B. Eichhof 1 und Eichhof 2 auf derselben Planseite/​demselben Standort liegen, aber unterschiedliche Regeln haben).
```json
{ "anzahl":1, "einheit":"woche|tag|frei", "mm":30, "tage":null,
  "zeiten":[6,8,10], "phasen":[ {vonTag,bisTag,anzahl,einheit,mm} ] }
```
- `einheit:"tag"` → n-mal pro Tag; `"woche"` → n-mal pro Woche; `"frei"` → alle `tage` Tage.
- `zeiten` = Startstunden bei mehrmals täglich (2-Stunden-Raster).
- `phasen` = optionale wachstumsabhängige Regeln (z. B. Jungpflanzen), gemessen in Tagen ab Pflanzdatum. Leer = Grundregel gilt immer.

**JournalEintrag** (die 1069 Altdaten + neue vom Wassermann)
```json
{ "id":"j3", "datum":"2026-03-02", "feldJournal":"Cherwis", "schiffRoh":"1.2",
  "schiffe":["1","2"], "kultur":"Salat", "startZeit":"11:46", "stopZeit":"13:00",
  "ueberNacht":false, "dauerMin":74, "startM3":123178, "stopM3":123207, "m3":29,
  "kreisregner":null, "sektorregner":10, "bemerkung":"etwas Wind" }
```
> `feldJournal` ist der **historische Name aus der Excel** und weicht teils von den Plan-Feldnamen ab. Die Zuordnung läuft über `einstellungen.journalMap`, initial per `Engine.autoMap()` geschätzt (Alias-Tabelle in `Engine.ALIAS`).

---

## 5. Die Engine (Herzstück) — `05_engine.js`

Rechenkette: **Journal → Referenzwerte → Wasserbilanz → Tagesplan → Regen-Anpassung**.

### 5.1 Referenzwerte — `Engine.refWerte()` (gecacht, `clearRef()` invalidiert)
Leitet aus dem Journal **mm/h pro Schiff** ab (Median über die letzten ~8 Einträge, glättet Ausreißer). Der Clou: mm bezieht sich auf die **beregnete Fläche**, nicht auf die ganze Feldfläche.

```
beregneteFlaeche = kreisregner × breite × abstandKreis
                 + sektorregner × breite × abstandSektor
mm  = m³ × 1000 / beregneteFlaeche
mmH = mm / (dauerMin/60)
```
Default-Parameter `breite=18, abstandKreis=23, abstandSektor=11.5` (aus der alten Excel-Formel des Betriebs; in `einstellungen.sprenkler` überschreibbar, sobald echte Feldmaße vorliegen). Ergebnis-Betriebsschnitt ≈ **4,95 mm/h** (plausibel gegen die realen Daten geprüft).

`Engine.dauerFuer(schiffIds, zielMm)` → `{min, rate, quelle:'schiff'|'global'|'keine'}`: geschätzte Bewässerungsdauer. Nutzt Schiff-Referenzwerte, fällt auf Feld- bzw. Betriebsschnitt zurück.

### 5.2 Wasserbilanz — `Engine.bilanz(sektorInfo, bisDatum)`
Simuliert das Defizit eines Sektors: es wächst täglich um `menge/intervall`, Regen und Bewässerungen bauen es ab. Fällig, wenn Defizit ≥ Regelmenge. `regelIntervall(r)` rechnet die Regel in Tage um (auch `phasen` via `aktivePhase()` und `frei`). **Wichtig:** Regen des *Zieltages selbst* wird hier NICHT verrechnet — er erscheint stattdessen als Anpassungsvorschlag am Auftrag (s. 5.4), damit der Admin entscheidet.

### 5.3 Tagesplan — `Engine.tagesPlan(datum)` / `Engine.planNeu()`
`auftraegeFuer(datum)` sammelt fällige Sektoren, bündelt benachbarte Schiffe gleicher Kultur+Menge zu **Aufträgen**, sortiert nach Priorität und Überfälligkeit. `planNeu()` rechnet den ganzen Horizont neu, **überspringt aber freigegebene Tage nicht** (das war ein Bug!) und respektiert manuell verschobene/angepasste Aufträge. `verschiebe(datum, auftragId, ±1)` schiebt einen Auftrag auf Nachbartag. Kapazitätswarnung: >`kapazitaetStandorte` Standorte ODER >`kap×2.5` Aufträge.

**Auftrag-Objekt** (lebt in `plan[datum].auftraege`):
```
{ id, datum, standortId, feldId, kulturId, schiffIds[], nummern[],
  zielMm, regenMm, angepasstMm, anpassungAngenommen, anpassungText,
  dauerMin, dauerQuelle, prioritaet, ueberfaellig, erledigt, quelle, notiz }
```

### 5.4 Regen & effektive Menge
`regenEmpfehlung(auftrag, regenMm)` → agronomischer Vorschlag (deckt Regen ~≥70 % der Zielmenge, entfällt der Auftrag). Der Admin bekommt pro betroffenem Auftrag Zielmenge **und** Vorschlag angezeigt und übernimmt per Checkbox. Was der Wassermann letztlich sieht, liefert **`Engine.effektivMm(a)`** / **`Engine.effektivDauer(a)`** (= angepasste Menge, falls angenommen, sonst Zielmenge). Auftrag mit effektiv 0 mm wird beim Wassermann ausgeblendet.

---

## 6. Der SVG-Editor — `PlanView(opts)` in `06_plan.js`

Wiederverwendbare Komponente, gibt `{node, redraw, setModus, getSelected, …}` zurück. Erzeugt ein `<svg>` mit Hintergrundbild + drei Ebenen (`gFill`, `gEdge`, `gHand`).

**Modi** (`opts.modus`): `view` | `schiffe` | `sektoren` | `rohr` | `kultur`.
**Callbacks:** `onPick(schiff, feld, sektor)`, `onChange()`, `onRohrFertig(punkte)`, `onSektorFertig(punkte)`.

Wichtige Details, die man leicht kaputt macht:
- **Koordinaten sind 0..1** relativ zum Bild. `abs()`/`rel()` konvertieren.
- **Griffgröße konstant in Bildschirmpixeln:** `px(n)` rechnet über `getScreenCTM().a` (die echte Transformation), NICHT über die Elementbreite — sonst werden Punkte bei höhenbegrenztem SVG winzig (war ein Bug).
- **Performance beim Ziehen:** während eines Drags wird per `patchDrag()` nur der betroffene Knoten via `requestAnimationFrame` verschoben, kein voller `draw()`. Nach dem Loslassen einmal `draw()`.
- **Pan vs. Klick:** Pan fängt den Pointer erst ab, wenn wirklich >5 px bewegt wurde (`suppressClick`), sonst würden Doppel-/Rechtsklicks verschluckt.
- **Rohr-Benennung:** `rohrName(punkte, feld)` prüft via `pointInPoly`/`distToPoly`, ob der Mittelpunkt in einem Schiff liegt (→ „3") oder gleich weit zwischen zwei (→ „3/4", Fahrgasse).
- **Sektor teilen:** `teileInStreifen(poly, n, 'h'|'v')` erzeugt n gleichmäßige Streifen; die Punkte sind danach frei ziehbar.

---

## 7. Der FeldEditor — `08_admin2.js`

Die zentrale Bearbeitungs-Komponente mit **4 Reitern unter der Grafik**, benutzt sowohl vom Standorte-Reiter des Admin als auch vom Setup.

`FeldEditor.mount(container, ctx)` mit `ctx = {standortId, feldId, setup:bool, onWeiter, reiter?}`.

Reiter: **1 Schiff anpassen** (`uSchiffe`) · **2 Sektor anpassen** (`uSektoren`, mit „Sektor hinzufügen"→`sektorTeilenDialog`→`sektorTeilen`) · **3 Rohre** (`uRohre`, zeichnen + Liste) · **4 Kultur** (`uKultur`, Klick auf Schiff/Sektor → `kulturKlick` → Popup mit Kultur+Regel).
- `setup:true` blendet einen **Weiter-Knopf** ein, der die Reiter der Reihe nach durchschaltet und am Ende `onWeiter()` ruft. Ohne `setup` navigiert man frei.
- Nach jeder Änderung `renderUnten()` (aktualisiert den Bereich unter den Reitern) bzw. `pv.redraw()`.

---

## 8. Setup-Assistent — `10_setup.js`

`Setup.willkommen()` (Begrüßung, „überspringen") → `Setup.start()` setzt `Setup.aktiv=true` und rendert eine **Vollseite in `#admPage`** (kein Modal). Pro Standort: zuerst ein **Journal-Zuordnungs-Popup**, dann der `FeldEditor` mit `setup:true`. `naechsterStandort`/`zurueckStandort`/`zeige()` steuern den Durchlauf; `fertig()` setzt `setupErledigt`.
**Verzahnung beachten:** Ein Klick auf einen Admin-Tab oder `App.home()` setzt `Setup.aktiv=false` und entfernt den „Setup umgehen"-Knopf (`#setupSkip`), damit das Setup sauber verlassen wird.

---

## 9. Wassermann — `11_wm.js`

Mobile-first. `WM.open()` → Sprachwahl (`sprachwahl()`, schreibt `localStorageless.lang`, setzt globales `LANG`) → `render()` zeigt die **freigegebene** Tagesliste (`plan[datum].freigegeben`). Fehlt sie: Hinweis „bitte {ansprechperson} anrufen".

Ablauf: Auftrag antippen → Detail (`renderDetail`) mit Lageplan-Knopf (Zoom), Referenz-Historie, `startDialog`→`startSpeichern` (legt Eintrag in `Store.db.laufend`), später `stoppDialog`→`stoppSpeichern`/`_stoppFinal` (schreibt Journaleintrag, markiert Auftrag `erledigt`, setzt `sektor.letzteBewaesserung`). Mehrere laufende Bewässerungen gleichzeitig möglich. Bei Zeitspanne über Mitternacht Rückfrage (`ueberNacht`). `menu()` bietet Dauer-Rechner (`rechner`), freien Eintrag (`freierEintrag`), Historie, „Schaffe ich heute nicht" (`schaffNicht` → E-Mail-Stub).

**Alle sichtbaren Strings laufen über `T('key')`** aus `I18N` (de/hu/pl). Neue UI-Texte im Wassermann immer in alle drei Sprachen eintragen. Feld-/Schiffnamen bleiben deutsch.

---

## 10. Wichtige Invarianten (nicht kaputt machen!)

1. **Regel-Key ist `feldId::kulturId`.** Niemals auf Standort umstellen.
2. **Geo-Koordinaten immer 0..1.** Kein Pixel in `polygon`/`umriss`/`punkte`/`rohre`.
3. **mm rechnet auf beregnete Fläche**, nicht auf Feldfläche (sonst Faktor-10-Fehler in der Dauer).
4. **`aren` schlägt Zeichnungsfläche** in `Store.schiffFlaecheM2`.
5. **Nach Daten-Änderung, die den Plan betrifft:** `Engine.clearRef()` (wenn Journal/Flächen betroffen) und `Engine.planNeu()` aufrufen.
6. **`planNeu()` darf freigegebene Tage nicht verwerfen.**
7. **Persistenz nur über Export/Import** — kein `localStorage` einführen.
8. **Kein `<form>` mit Submit** und keine externen CDNs — die Datei muss offline per `file://` laufen.
9. **Wassermann-Texte dreisprachig** über `T()`.
10. **Emoji-Auswahl** bewusst auf breit unterstützte Symbole beschränkt (Darstellungsprobleme mit exotischen Emojis).

---

## 11. Bekannte offene Punkte / To-dos

- **Polygone sind grobe Rechtecke.** Der Mensch zieht sie im Setup zurecht. Besonders unsicher (im Datenmodell mit `unsicher:true`/`hinweis` markiert): Cherwis, Thalheimer Hofparzellen, Aegert Bischofberger.
- **Journalnamen „Trüb" und „Wolf"** ließen sich keinem Plan sicher zuordnen (im Setup manuell zuweisen; „Wolf" vermutlich Neuwiesen Wolff).
- **Rollomat** (fahrbarer Regner, an Winkler & Uster Slowgrow) wird derzeit wie ein Standregner gerechnet — eigene Flächenlogik wäre genauer.
- **„alle 2 Tage" / „alle 10 Tage"** wurden näherungsweise auf Wochen-Rhythmus gemappt; es gibt inzwischen `einheit:"frei"` mit `tage`, das man dafür konsequenter nutzen könnte.
- **Phase 2** (online/Sheets/E-Mail/Login) ist konzipiert, aber nicht gebaut (§1, §pflichtenheft).

---

## 12. Konkrete erste Schritte in Claude Code

1. `wasserplan.html`, dieses Handbuch, `pflichtenheft-wasserplan.md`, `Bewaesserungsjournal_2026_bereinigt.xlsx` und die Planbilder (`/uploads`) ins Projekt legen.
2. **Zuerst Option B umsetzen:** HTML in `src/` + `data/` zerlegen, `assemble.py` schreiben, neu bauen, Verhalten gegen die Original-HTML verifizieren (Screenshots/Playwright). Das ist die Investition, die alle weiteren Änderungen leicht macht.
3. Erst danach inhaltlich weiterentwickeln. Für jede Änderung: bauen → im Browser oder mit Playwright testen → Konsole muss sauber sein.
4. **Sprache:** mit dem Auftraggeber auf Deutsch kommunizieren, „du"-Form.

Viel Erfolg. Der Code ist bewusst framework-frei und gut kommentiert — die Banner-Kommentare in jedem Modul erklären den jeweiligen Zweck direkt am Code.
