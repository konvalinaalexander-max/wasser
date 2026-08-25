# Wasserplan — Entwickler-Handbuch

Dieses Dokument macht dich in einer Sitzung arbeitsfähig: **was** die App ist, **wie** sie
technisch aufgebaut ist, **wo** was steht und **wie** man sauber daran weiterarbeitet.
Lies es vollständig, bevor du Code änderst.

> **Kontext-Sprache:** Das gesamte Projekt läuft auf Deutsch (Schweizer Landwirtschaftsbetrieb).
> Der Auftraggeber duzt und erwartet Antworten auf Deutsch. Fachbegriffe wie **„Schiff"**
> (= eine nummerierte Bewässerungs-Teilfläche innerhalb eines Feldes) bleiben immer deutsch,
> auch in fremdsprachigen UI-Versionen.

---

## 0. Wie ist der Code organisiert?

Die auslieferbare Datei `build/wasserplan.html` ist ein **gebautes Artefakt**, kein
handgepflegter Quellcode. Sie entsteht aus:

```
python3 assemble.py        # src/ + data/  ->  build/wasserplan.html
```

- **`src/`** — Quellcode in Modulen, Ladereihenfolge = Dateinamen-Reihenfolge
- **`data/`** — Startdaten (`katalog`, `journal`, `kulturen`, `regeln`, `gruppen`,
  `modell`), werden in den `<script id="seedData">`-Block eingebettet
  (Platzhalter `__DATA__`). `modell.json` enthält die aus den Daten gefitteten
  Parameter; fehlt es, rechnet die Engine mit den in `Store.migriere()`
  dokumentierten Rückfallwerten.

Editiere **nie** `build/wasserplan.html` direkt — der nächste Build überschreibt es.

### Tests

```
npm install playwright --no-save

node tools/regression.js       # DER Test. 36 Prüfungen, deckt alles Wichtige ab.
node tools/backtest.js         # rollende Prüfung gegen die Vergangenheit
node tools/backtest.js --md    # dazu docs/backtest.md neu schreiben

node tools/verify.js     # ältere Einzelprüfungen: Engine, Eingriffe, Migration
node tools/verify2.js    # Mehrfachgänge, Gruppen, Sprenkler, i18n, UI-Durchlauf
node tools/diag.js       # Verteilung über den Horizont im Detail
node tools/shots.js      # Screenshots
```

Der Pflichtlauf nach jeder Änderung ist **`node tools/regression.js`** — er prüft
Planung, Eingriffe, Modell, Auswertung, Reihenfolge und liest die Backtest-Kennzahlen
aus `tools/_backtest.json`. Ist diese Datei älter als der Build, sagt er das; dann
`node tools/backtest.js` neu laufen lassen. **Konsole muss fehlerfrei bleiben.**

Die Statistik-Werkzeuge laufen in Python (numpy/scipy) auf demselben Datenstand:

```
node tools/export_kontext.js   # tools/_kontext.json aus der App exportieren
python3 tools/audit.py         # Datenaudit  -> docs/datenaudit.md
python3 tools/kalibrierung.py  # Modellfit   -> data/modell.json, docs/modell.md
```

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
- **Kein `localStorage`/`sessionStorage`** — steht in der Zielumgebung nicht zuverlässig zur Verfügung. Persistenz läuft ausschliesslich über **manuellen JSON-Export/-Import** (`Store.exportFile()` / `Store.importDialog()`); jeder Import läuft durch `Store.migriere()`. Ausnahme: die Sprachwahl des Wassermanns liegt im In-Memory-Objekt `localStorageless` (überlebt Reload **nicht** — bewusst simpel gehalten).
- **Ein zentrales Datenobjekt** `Store.db`, das beide Rollen teilen. Alles hängt daran.
- **SVG für die Pläne**, mit koordinaten in **relativen Anteilen 0..1** des Hintergrundbildes (nicht Pixel!). Dadurch sind Polygone bildgrößen-unabhängig.
- **Datumslogik streng lokal** (Objekt `D`), Format `YYYY-MM-DD`, keine `Date`-Zeitzonenfallen.
- **Getestet mit Playwright** (Chromium, headless), Skripte in `tools/`: HTML per `file://` laden, Zustand per `pg.evaluate()` prüfen und manipulieren, UI klicken. Konsole muss fehlerfrei bleiben.

---

## 3. Die Module im Detail

Reihenfolge = Ladereihenfolge = Abhängigkeitsreihenfolge (spätere dürfen frühere nutzen).

| # | Datei | Inhalt | Öffentliche Objekte |
|---|-------|--------|---------------------|
| 01 | `01_head.html` | Doctype, Meta, **komplettes CSS** (Design-Tokens, Buttons, Karten, Modal, Plan/SVG, Tagesplan, mobile Wassermann-Styles) | — |
| 02 | `02_body.html` | `<body>`, Start-Screen, Admin-Shell, Wassermann-Shell, Modal, Toast, **`<script id="seedData">__DATA__</script>`**, Beginn des Haupt-`<script>` | — |
| 04 | `04_core.js` | Helfer (`$`, `el`, `esc`, `uid`, `clamp`, `num`, `hash`), Geometrie, **`I18N`/`T`/`LT`**, **`D`** (Datum, sprachabhängig), **`U`** (Einheiten), **`W`** (Wert mit Herkunft), Toast/Modal/`frage`, **`Store`** | `D`, `U`, `W`, `I18N`, `T`, `Store`, `toast`, `openModal`, `closeModal`, `frage` |
| 05 | `05_engine.js` | **`Engine`** — Referenzwerte, Sprenklerempfehlung, Wasserbilanz, Tagesplanung, Eingriffe, Regen, `probleme()` | `Engine` |
| 06 | `06_plan.js` | **`PlanView(opts)`** — SVG-Editor + Geometrie-Helfer (`pointInPoly`, `distToPoly`, `rohrName`, `teileInStreifen`) | `PlanView`, Helfer |
| 07 | `07_admin.js` | **`Admin`** (Basis) — Tabs, Tagesplan, Auftragskarten, Regen-Dialog, Freigabe | `Admin` |
| 08 | `08_feldeditor.js` | **`FeldEditor`** (die 4-Reiter-Komponente) | `FeldEditor` |
| 09 | `09_admin2.js` | `Object.assign(Admin,{…})` — Standorte, Stammdaten, Schiffe-Tabelle, Kultur/Sektor, Kulturen & Regeln, Journal, Einstellungen | erweitert `Admin` |
| 10 | `10_setup.js` | **`Setup`** — geführte Ersteinrichtung, `kulturenAusRegeln()` | `Setup` |
| 11 | `11_wm.js` | **`WM`** — mobile Wassermann-Oberfläche + `localStorageless` | `WM`, `localStorageless` |
| 11a | `11a_auswertung.js` | **`St`** (Median, MAD, Unsicherheit des Medians, Anteils-SE), **`Auswert`** (Rechenwerk der Rückschau) und `Admin.vAuswert` (Darstellung) | `St`, `Auswert`, erweitert `Admin` |
| 12 | `12_init.js` | **`App`**, `boot()`, schliesst `<script></body></html>` | `App` |

> **Wichtig zu 07/09/11a:** `Admin` ist EIN Objekt, das über drei Dateien per
> `Object.assign` zusammengesetzt wird. Eine `Admin.xxx`-Methode kann in 07, 09 oder
> 11a stehen. `11a` muss **vor** `12_init.js` geladen werden — `12_init.js` enthält
> das schliessende `</script></body></html>`, alles danach landet ausserhalb des
> Dokuments.

### Einheiten (`U`) und Werte mit Herkunft (`W`)

Zwei kleine Objekte in `04_core.js`, die viel Ärger ersparen.

**`U`** ist die einzige Stelle, an der Einheiten umgerechnet werden:
`arenNachM2`, `m2NachAren`, `mmNachM3(mm, m2)`, `m3NachMm(m3, m2)`, `minNachH`,
`hNachMin`, `dauerMin(m3, m3h)`. **Feldnamen tragen ihre Einheit als Endung**
(`…Mm`, `…M3`, `…M2`, `…Aren`, `…Min`, `…M3h`). Ein Feld ohne Endung ist ein Fehler,
kein Stilproblem.

**`W`** ist ein Wert samt Herkunft: `{wert, quelle, n, sd}`. Die Herkunft ist geordnet
`messung > schiff > feld > betrieb > annahme > keine` (`W.RANG`). Wichtige Funktionen:

- `W.mk(wert, quelle, {n, sd})` — anlegen · `W.leer()` · `W.wert(w)` — Zahl herausholen
- `W.ableiten(wert, teile)` — ein abgeleiteter Wert erbt die **schlechteste** Herkunft
  seiner Bestandteile. Eine Dauer aus einer geschätzten Fläche ist geschätzt.
- `W.stufe(w)` / `W.zeichen(w)` — `●●●` gut, `●●○` mittel, `●○○` schwach, `○○○` keine
- `W.text(w, fmt)` — ausgeschriebene Herkunft für den Tooltip

Alles, was aus Erfahrungswerten stammt und der Oberfläche gezeigt wird, geht als
`W`-Objekt durch — Dauer, Sprenklerzahl, Fläche, Durchfluss.

---

## 4. Das Datenmodell (`Store.db`)

Aufgebaut über `Store.init(seed)` bzw. `Store.migriere(db)`, danach `Store.normalisiere()`
und `Store.reindex()` (Lookup-Indizes `_st`, `_fd`, `_sch`, `_ku`; `_sch[schiffId]` liefert
`{schiff, feld, standort}`).

```
Store.db = {
  version: 4, erstellt,
  einstellungen: {
    ansprechperson, ansprechTelefon, adminMail,
    kapazitaetStandorte: 8,            // Warnschwelle Standorte/Tag (Journal p80)
    planungsHorizont: 10,              // Tage, die die Engine vorausplant
    erfahrungsstufe: "neu",            // "neu" = Kultur/Sprenkler/Gruppen zeigen | "erfahren" = knapp
    mmBezug: "flaeche",                // "flaeche" = mm auf der Kulturfläche (Standard)
                                       // "beregnet" = alte Betriebsformel, nur zum Vergleich
    setupErledigt, setupUebersprungen,
    setupJournalGeklaert: [],          // Standort-IDs mit erledigter Journal-Zuordnung
    regenGefragtAm,                    // ISO-Datum
    sprenkler: {breite:18, abstandKreis:23, abstandSektor:11.5},   // in den Einstellungen editierbar
    journalMap: { "<journalName>": "<feldId>", … }
  },
  standorte, felder, kulturen,
  regeln:    { "<feldId>::<kulturId>": Regel },
  journal:   [ JournalEintrag ],
  journalProbleme, journalKapazitaet,
  regen:     [ {id, datum, mm, standortIds[], stationId} ],
  wetterstationen: [ {id, name, standortIds[]} ],   // ein Standort gehört zu HÖCHSTENS einer
  plan:      { "<datum>": Tagesplan },              // nur [heute … heute+Horizont)
  eingriffe: { "<datum>": { "<key>": Eingriff } },  // Admin-Änderungen, überleben planNeu()
  zusatz:    { "<datum>": [ Auftrag ] },            // von Hand angelegte Aufträge
  laufend:   [ LaufendeBewaesserung ],
  meldungen: [ {id, datum, zeit, text, gelesen} ],  // „Schaffe ich heute nicht"
  gruppen:   [ {feldJournal, schiffe[], haeufigkeit} ],
  modell: {                          // aus data/modell.json, gefittet in tools/kalibrierung.py
    qJeKreisregner: 1.848,           // m³/h je Kreisregner   (H2, 90 %: 1,82–1,87)
    qJeSektorregner: 2.198,          // m³/h je Sektorregner  (H2, 90 %: 2,15–2,25)
    qModell: "linear",               // Sättigung getestet, bringt nichts
    shrinkageLambda: 2.8,            // Dämpfung des Schiffwerts Richtung Feldwert (H4)
    sdInnerhalbSchiff: 0.334,        // m³/h je Sprenkler, Streuung innerhalb eines Schiffs
    mmVerhaeltnisAzuB: 1.415,        // Kulturfläche zu beregneter Fläche (H3)
    iccSchiff: 0.264, iccFeld: 0.338 // Anteil der Varianz zwischen Schiffen bzw. Feldern
  }
}
```

**Standort** — `{id, seite, name, gemeinde, bild, bildW, bildH, istUebersicht, wasseruhr:{einheit}}`

**Feld** — `{id, standortId, name, gemeinde, gemeindeFehlt, gesamtflaecheAren, umriss, achse,
geprueft, unsicher, hinweis, bewaessert, schiffe[]}`
Koordinaten (`umriss`, `polygon`, `punkte`) immer in **Anteilen 0..1** des Hintergrundbildes.

**Schiff** — `{id, nummer, implizit?, polygon, laengeM, breiteM, aren, notiz, rohre[], sektoren[]}`
Ein Feld ohne Schiff-Nummerierung bekommt in `Store.normalisiere()` **ein implizites Schiff**
über den ganzen Umriss (`implizit:true`, leere Nummer). Dadurch funktioniert die gesamte
übrige Logik unverändert. `Store.echteSchiffe(f)` / `Store.schiffZahl()` zählen nur die
nummerierten, `Store.schiffName(s)` beschriftet sie richtig.

**Sektor** — `{id, name, polygon|null, kulturId, pflanzdatum, satz, prioritaet,
pausiert, pausiertBis, letzteBewaesserung}`

**Regel** — Schlüssel `feldId::kulturId`
```json
{ "anzahl":1, "einheit":"woche|tag|frei", "tage":null, "mm":30,
  "zeiten":[6,10,14], "phasen":[ {vonTag,bisTag,anzahl,einheit,tage,mm} ] }
```
- `einheit:"tag"` → n-mal pro Tag · `"woche"` → n-mal pro Woche · `"frei"` → alle `tage` Tage
- `zeiten` = Startstunden im 2-Stunden-Raster; bei mehrmals täglich erzeugt die Engine
  **je Gang einen eigenen Auftrag** mit Zeitfenster
- `phasen` = wachstumsabhängige Regeln, gemessen ab Pflanzdatum, ausgewertet **pro Plantag**

**Auftrag** (in `plan[datum].auftraege`)
```
{ key, id, datum, ursprung, standortId, feldId, kulturId,
  schiffIds[], sektorIds[], nummern[], gruppen[][],
  zielMm, letzteBew, regenMm, angepasstMm, anpassungAngenommen, anpassungManuell, anpassungText,
  dauerMin, dauerQuelle, prioritaet, ueberfaellig, geschaetzt,
  dringlichkeit, rhythmus, rueckstand,
  gangNr, gaenge, zeitfenster, erledigt, quelle, notiz, verschoben, bearbeitet }
```

Die drei Felder der Reihenfolge (seit Phase 4, belegt im Backtest):

- **`dringlichkeit`** — Defizit als **Vielfaches der Regelmenge**, nicht in Tagen.
  Tage sind zwischen Rhythmen nicht vergleichbar: eine tägliche Kultur, die einen Tag
  überfällig ist, hat einen ganzen Zyklus verpasst, eine Wochenkultur ein Siebtel.
- **`rhythmus`** — Abweichung des Abstands seit dem letzten Gang vom Sollrhythmus,
  in Tagen. 0 heisst: genau im Takt. **Kleiner ist besser.**
- **`rueckstand`** — `dringlichkeit >= Engine.RUECKSTAND_AB` (2,5). Solche Aufträge sind
  meist kein Wasserbedarf, sondern ein Datenproblem, und stehen deshalb hinten.
  Die Oberfläche nennt sie „Klärfälle".
`key` ist über Neuberechnungen hinweg stabil (`feldId~kulturId~menge[~gangN]`) — daran hängen
die Eingriffe. `ursprung` ist der Tag, für den der Auftrag erzeugt wurde (kann von `datum`
abweichen, wenn er verschoben wurde).

**Eingriff** — `{entfernt?, verschobenVon?, verschobenNach?, zielMm?, angepasstMm?,
anpassungAngenommen?, prioritaet?, notiz?}`, abgelegt unter dem **Tag, an dem der Auftrag
steht** (nicht unter seinem Ursprungstag). `Engine.overlay()` legt ihn auf den frisch
erzeugten Auftrag; `Engine.eingriffeAufraeumen()` räumt Altes weg.

**JournalEintrag** — wie bisher, zusätzlich `quelle:'app'` für Einträge des Wassermanns.
Zwei abgeleitete Prüfungen hängen daran, beide in der Engine:
`Engine.istRollomat(e)` und `Engine.deckungVon(e)` / `Engine.zuordnungFraglich(e)`
(siehe 5.6).
`feldJournal` ist der historische Name aus der Excel; die Zuordnung läuft über
`einstellungen.journalMap`, initial per `Engine.autoMap()`. `Engine.journalNameFuer(feld, true)`
legt fehlende Zuordnungen an, damit neue Einträge wiedergefunden werden.

---

## 5. Die Engine (Herzstück) — `05_engine.js`

Rechenkette: **Journal → Referenzwerte → Wasserbilanz → Tagesplan → Eingriffe → Regen**.

### 5.1 Referenzwerte — `Engine.refWerte()` (gecacht, `clearRef()` invalidiert)

**Seit Phase 3 rechnet die Engine in Durchfluss, nicht mehr in mm/h.** Der Grund ist
eine Zirkularität: mm/h enthält bereits eine Fläche, und aus mm/h wieder eine Dauer für
eine Zielmenge auf derselben Fläche zu rechnen, kürzt die Fläche wieder heraus — man
rechnet dann mit einer Grösse, die vorgibt, mehr zu wissen, als sie weiss. Der Durchfluss
je Sprenkler ist dagegen eine Eigenschaft der Technik und flächenunabhängig.

```
q = m³ / (dauerMin/60) / (kreisregner + sektorregner)      [m³/h je Sprenkler]
```

`refWerte()` bildet daraus den Median über die letzten ~8 Gänge je Schiff, Feld und
Betrieb. Ausgeschlossen sind Rollomat-Gänge (andere Technik) und physikalisch unmögliche
Werte ausserhalb 0,5–5 m³/h. Betriebsschnitt der echten Daten ≈ **1,9 m³/h je Sprenkler**.

**`Engine.qFuerSchiffe(schiffIds)`** zieht dünn belegte Schiffe Richtung Feldwert
(Empirical-Bayes-Shrinkage, `gew = n/(n+λ)` mit `λ = shrinkageLambda`). Ein Schiff mit
zwei Gängen bekommt dadurch keinen wilden Einzelwert. Im Backtest liegen Schiffe mit
1–3 Gängen nur wenig schlechter als solche mit über 10.

**Die Kette ist gerichtet und ohne Rückkopplung** — `Engine.gangFuer(schiffIds, zielMm,
sprenklerZahl)`:

```
Fläche (m²)  ──mm──▶  Menge (m³)  ──÷ Durchfluss──▶  Dauer (min)
```

Rückgabe `{flaecheM2, zielM3, sprenkler, qM3h, dauerMin}`, alle als `W`-Objekte mit
Herkunft. `Engine.dauerFuer(schiffIds, zielMm)` ist die schlanke Fassung davon.

**mm hat zwei Definitionen**, und die App kennt beide:

```
mm auf der Kulturfläche  = m³ × 1000 / Fläche der Schiffe      ← Standard
mm auf der beregneten F. = m³ × 1000 / (Sprenkler × Abstand²)  ← alte Betriebsformel
```

`Engine.mmBeide(e)` liefert beide, `Engine.mmVonEintrag(e)` die eingestellte
(`einstellungen.mmBezug`). Die Kulturfläche ist der Standard, weil die Regel eine Menge
auf die Kultur meint. Das Verhältnis der beiden liegt im Median bei 1,42 (Modellparameter
`mmVerhaeltnisAzuB`), je Feld aber sehr verschieden — deshalb ist es kein Umrechnungsfaktor.

`Engine.sprenklerFuer(schiffIds)` schlägt die Sprenklerzahl vor, **additiv je Schiff**
und als `W`-Objekt.

### 5.2 Wasserbilanz — `Engine.bilanz(sektorInfo, bisDatum, virtuell)`
Defizit wächst täglich um `menge/intervall`, Regen und Bewässerungen bauen es ab.
Fällig ab Defizit ≥ Regelmenge.
- `virtuell` (sektorId → Datum) enthält die im laufenden Durchgang bereits eingeplanten
  Bewässerungen — dadurch wiederholt sich eine tägliche Kultur auch täglich.
- Ohne jede Historie wird der Startpunkt **deterministisch über das Intervall gestreut**
  (`hash(sektor.id)`, kein `Math.random`) und der Auftrag als `geschaetzt` markiert.
- Regen des Zieltages wird NICHT verrechnet — er erscheint als Anpassungsvorschlag am Auftrag.

### 5.3 Tagesplan — `Engine.planen()` / `planNeu()` / `tagesPlan(datum)`
`planen()` läuft Tag für Tag durch den Horizont:
1. freigegebene Tage bleiben unangetastet (nur Regenbezug wird nachgeführt)
2. `auftraegeFuer(d, virtuell)` bildet Aufträge: ein Auftrag je Feld + Kultur + Menge,
   bei mehrmals täglichen Regeln je Gang einer
3. Eingriffe anwenden (`entfernt`, `verschobenNach`, `overlay()`)
4. Zusatzaufträge aus `Store.db.zusatz`
5. **Entzerren**: sortiert nach `Engine.reihung` (siehe 5.6); was die Tageskapazität
   (Standorte *und* Aufträge) sprengt, wird heute nicht eingeplant, ist morgen überfälliger
   und rückt dort vor. `plan[d].zurueckgestellt` zählt das und wird im Tagesplan angezeigt.
   Fixe Aufträge (manuell, verschoben, bearbeitet) werden nie weggelassen.

`tagesPlan(datum)` **liest nur** — für Tage ausserhalb des Horizonts kommt ein leerer
Nur-Lese-Tag zurück, es wird nichts in `Store.db.plan` angelegt.

`verschiebe(datum, id, ±1)` schreibt einen Eingriff statt zu kopieren und lehnt Ziele
ausserhalb des Horizonts ab. Der Eingriff wandert dabei **mit** auf den Zieltag
(`{verschobenVon, verschobenNach, …}`), damit `overlay()` ihn dort wiederfindet.
Vor der Tagesschleife wird daraus abgeleitet:
`sperre[key]` (nach vorne geschoben → bis zum Zieltag gesperrt) und
`vorziehen[key]` (nach hinten gezogen → am Zieltag schon ab halbem Defizit fällig).
So bleibt es auch nach mehrfachem Verschieben genau ein Auftrag.

### 5.4 Regen & effektive Menge
`regenEmpfehlung(auftrag, regenMm)` → deckt Regen ≥70 % der Zielmenge, entfällt der Auftrag.
Was der Wassermann sieht, liefert `Engine.effektivMm(a)` / `effektivDauer(a)`.
Regen wird auf den Tag gebucht, an dem er gefallen ist (im Dialog wählbar).

### 5.5 Reihenfolge — `Engine.reihung(a, b)`

Die Sortierung entscheidet, was bei knapper Kapazität heute läuft und was wartet. Sie ist
deshalb keine Kosmetik. Der Backtest (Abschnitt 13) hat gezeigt, dass die naheliegende
Sortierung **schlechter als Zufall** war:

| Sortierschlüssel | Treffer von 850 | gegen Zufall in derselben Liste |
|---|---:|---:|
| nach Dringlichkeit (relatives Defizit) | 177 | 0,68× |
| nach Tagen Überfälligkeit | 165 | 0,63× |
| **gestuft + Rhythmustreue (heute)** | **398** | **1,52×** |

Grund: die Bewässerungsquote **fällt** mit steigendem Rückstand (52 % bei Dringlichkeit
1,0–1,5 gegen 16 % über 3). Ein grosses Defizit zeigt bei diesem Betrieb keinen grossen
Bedarf an, sondern ein Schiff, das aus der Rotation gefallen ist — abgeräumte Kultur, zu
enge Regel, nicht erfasster Gang. Nach Dringlichkeit sortiert stehen die Karteileichen oben.

Die Reihenfolge ist deshalb:

1. **Priorität** — `hoch` vor `normal` vor `niedrig` (Entscheidung des Menschen, schlägt alles)
2. **kein Rückstand vor Rückstand** — `dringlichkeit < Engine.RUECKSTAND_AB` zuerst
3. **Rhythmustreue** — wer am genauesten im eigenen Takt liegt, zuerst
4. **Dringlichkeit** absteigend
5. **Überfälligkeit** in Tagen, dann **Zeitfenster**

`Engine.RUECKSTAND_AB = 2.5`. Die Schwelle ist nicht an die Daten angepasst: zwischen 2,0
und 4,0 liegt das Ergebnis zwischen 360 und 375 Treffern.

> Bewusst **nicht** übernommen wurde der beste gemessene Schlüssel („zuerst das Schiff,
> das zuletzt Wasser bekam", 457 Treffer). Er sagt gut voraus, was der Betrieb tut, ist
> als Anweisung aber unsinnig. Die App soll beraten, nicht nachahmen.

### 5.6 Zwei Plausibilitätsprüfungen am Journal

- **`Engine.istRollomat(e)`** — `/rolo/i` auf `schiffRoh` oder `bemerkung`. Rollomat ist
  eine andere Technik; solche Gänge fliessen in keine Modellrechnung ein.
- **`Engine.deckungVon(e)`** — beregnete Fläche geteilt durch die Fläche der genannten
  Schiffe. **`Engine.zuordnungFraglich(e)`** ist wahr über `Engine.DECKUNG_MAX = 2.5`.
  Dann fehlen Schiffe im Eintrag: 37 Kreisregner passen nicht auf ein Schiff von 39 Aren.
  Solche Einträge zählen weiter in allen m³-Summen — die Menge ist gemessen —, liefern
  aber **keine mm-Zahl**, sonst entstünden Werte wie 120 mm in einem Gang.
  Verteilung über 798 auswertbare Einträge: Median 0,71, p90 1,51, p95 1,82, Maximum 4,65;
  über der Schwelle liegen 27 Einträge (3,4 %) mit einem 2,5-fach überhöhten Median-mm.

### 5.7 `Engine.probleme()`
Macht sichtbar, was sonst lautlos aus dem Plan fällt: `ohneRegel`, `ohneKultur`,
`verwaisteRegeln`, `journalOhneFeld`, `ohneRohr`, `ohneGemeinde`, `planbar`.
Wird im Tagesplan, im Kulturen-Reiter, im Setup-Abschluss und auf dem Startbildschirm genutzt.

---

## 6. Der SVG-Editor — `PlanView(opts)` in `06_plan.js`

Wiederverwendbare Komponente, gibt `{node, redraw, setModus, getSelected, …}` zurück. Erzeugt ein `<svg>` mit Hintergrundbild + drei Ebenen (`gFill`, `gEdge`, `gHand`).

**Modi** (`opts.modus`): `view` | `schiffe` | `sektoren` | `rohr` | `kultur`.
**Callbacks:** `onPick(schiff, feld, sektor)`, `onChange()`, `onRohrFertig(punkte)`.
`opts.selectedIds` hebt mehrere Schiffe gleichzeitig hervor (Auftragsgruppe im Lageplan).
Der Rückgabewert enthält **`destroy()`** — beim Neuaufbau aufrufen, sonst sammeln sich
`ResizeObserver` und Timer an.

Wichtige Details, die man leicht kaputt macht:
- **Koordinaten sind 0..1** relativ zum Bild. `abs()`/`rel()` konvertieren.
- **Griffgröße konstant in Bildschirmpixeln:** `px(n)` rechnet über `getScreenCTM().a` (die echte Transformation), NICHT über die Elementbreite — sonst werden Punkte bei höhenbegrenztem SVG winzig (war ein Bug).
- **Performance beim Ziehen:** während eines Drags wird per `patchDrag()` nur der betroffene Knoten via `requestAnimationFrame` verschoben, kein voller `draw()`. Nach dem Loslassen einmal `draw()`.
- **Pan vs. Klick:** Pan fängt den Pointer erst ab, wenn wirklich >5 px bewegt wurde (`suppressClick`), sonst würden Doppel-/Rechtsklicks verschluckt.
- **Rohr-Benennung:** `rohrName(punkte, feld)` prüft via `pointInPoly`/`distToPoly`, ob der Mittelpunkt in einem Schiff liegt (→ „3") oder gleich weit zwischen zwei (→ „3/4", Fahrgasse).
- **Sektor teilen:** `teileInStreifen(poly, n, 'h'|'v')` erzeugt n gleichmäßige Streifen; die Punkte sind danach frei ziehbar.

---

## 7. Der FeldEditor — `08_feldeditor.js`

Die zentrale Bearbeitungs-Komponente mit **4 Reitern unter der Grafik**, benutzt sowohl vom Standorte-Reiter des Admin als auch vom Setup.

`FeldEditor.mount(container, ctx)` mit `ctx = {standortId, feldId, setup:bool, onWeiter, reiter?}`.
`render()` ruft vorher `entsorgePV()`, damit die alte `PlanView` ihre Beobachter und Timer freigibt.

Reiter: **1 Schiff anpassen** (`uSchiffe`) · **2 Sektor anpassen** (`uSektoren`, mit „Sektor hinzufügen"→`sektorTeilenDialog`→`sektorTeilen`) · **3 Rohre** (`uRohre`, zeichnen + Liste) · **4 Kultur** (`uKultur`, Klick auf Schiff/Sektor → `kulturKlick` → Popup mit Kultur+Regel).
- `setup:true` blendet einen **Weiter-Knopf** ein, der die Reiter der Reihe nach durchschaltet und am Ende `onWeiter()` ruft. Ohne `setup` navigiert man frei.
- Nach jeder Änderung `renderUnten()` (aktualisiert den Bereich unter den Reitern) bzw. `pv.redraw()`.

---

## 8. Setup-Assistent — `10_setup.js`

`Setup.willkommen()` (Begrüßung, „überspringen") → `Setup.start()` setzt `Setup.aktiv=true` und rendert eine **Vollseite in `#admPage`** (kein Modal). Pro Standort: zuerst ein **Journal-Zuordnungs-Popup**, dann der `FeldEditor` mit `setup:true`. `naechsterStandort`/`zurueckStandort`/`zeige()` steuern den Durchlauf; `fertig()` setzt `setupErledigt`.
**Verzahnung beachten:** Ein Klick auf einen Admin-Tab oder `App.home()` setzt `Setup.aktiv=false` und entfernt den „Setup umgehen"-Knopf (`#setupSkip`).
Der Zustand „Journal für diesen Standort geklärt" liegt in `einstellungen.setupJournalGeklaert`, nicht am Standort-Objekt.
**`Setup.kulturenAusRegeln()`** überführt die mitgelieferten Startregeln in echte Kulturzuweisungen — aber nur bei Feldern mit genau EINER Regel; mehrdeutige Felder bleiben dem Menschen überlassen.

---

## 9. Wassermann — `11_wm.js`

Mobile-first. `WM.open()` → Sprachwahl (`sprachwahl()`, schreibt `localStorageless.lang`, setzt globales `LANG`) → `render()` zeigt die **freigegebene** Tagesliste (`plan[datum].freigegeben`). Fehlt sie: Hinweis „bitte {ansprechperson} anrufen".

Ablauf: Auftrag antippen → Detail (`renderDetail`) mit Lageplan, Sprenklerempfehlung, Gruppenvorschlag und **schiffbezogener** Historie (`historieFuer`), `startDialog`→`startSpeichern` (legt Eintrag in `Store.db.laufend`), später `stoppDialog`→`stoppSpeichern`/`_stoppFinal`.
`_stoppFinal` schreibt den Journaleintrag (registriert bei Bedarf den Journalnamen des Feldes), markiert den Auftrag `erledigt`, setzt `letzteBewaesserung` **nur auf den tatsächlich bewässerten Sektoren** und ruft `Store.changed('journal')`.
Der Start-Zählerstand kommt vom **Standort** (`letzterZaehler`), nicht vom Feld — die Wasseruhr hängt am Standort.
Rückfragen: Zeitspanne über Mitternacht (`ueberNacht`) und rückwärts laufender Zählerstand.
`menu()` bietet Dauer-Rechner, freien Eintrag, Historie und „Schaffe ich heute nicht" (landet in `Store.db.meldungen` und erscheint im Tagesplan des Admins).

**Alle sichtbaren Strings laufen über `T('key')`** aus `I18N` (de/hu/pl) — auch Wochentage, Monate und Zeiteinheiten über `LT()`. Neue UI-Texte immer in alle drei Sprachen eintragen. Feld-, Standort- und Schiffnamen bleiben deutsch.

---

## 10. Wichtige Invarianten (nicht kaputt machen!)

1. **Regel-Key ist `feldId::kulturId`.** Niemals auf Standort umstellen.
2. **Geo-Koordinaten immer 0..1.** Kein Pixel in `polygon`/`umriss`/`punkte`.
3. **mm rechnet auf der Kulturfläche** (`einstellungen.mmBezug='flaeche'`, Standard).
   `Engine.mmBeide()` / `Engine.mmVonEintrag()` sind die einzigen Quellen. Die alte
   Formel auf der beregneten Fläche bleibt umschaltbar, aber nur zum Vergleich.
   **mm ist eine Grösse je Fläche und darf niemals über Einträge summiert werden, die
   verschiedene Schiffe betreffen** — je Schiff rechnen, danach zusammenfassen.
4. **Flächenreihenfolge in `Store.schiffFlaecheM2`:** `aren` → `laengeM × breiteM` →
   Restanteil an der Feldfläche. Schiffe mit eigener Zahl belegen ihren Teil bereits —
   nie die volle Feldfläche zusätzlich verteilen.
5. **Nach jeder Datenänderung `Store.changed(bereich)` aufrufen** —
   `'geometrie' | 'kultur' | 'regel' | 'journal' | 'regen' | 'einstellung' | 'plan'`.
   Das ist der EINZIGE Weg; er erledigt `reindex()`, `clearRef()` und `planNeu()`.
   Nie wieder `Store.mark()` allein für strukturelle Änderungen.
6. **`planNeu()` darf freigegebene Tage nicht verwerfen.**
7. **Admin-Änderungen gehören in `Store.db.eingriffe`**, nicht direkt auf das Auftragsobjekt —
   sonst überleben sie die nächste Neuberechnung nicht.
8. **`tagesPlan()` schreibt nicht.** Lesen darf keinen Plan anlegen.
9. **Persistenz nur über Export/Import** — kein `localStorage`. Jeder Import läuft durch
   `Store.migriere()`, das fehlende Strukturen auffüllt.
10. **Kein `<form>` mit Submit und keine externen CDNs** — die Datei muss offline
    per `file://` laufen.
11. **Wassermann-Texte dreisprachig über `T()`**, inklusive Wochentage, Monate und
    Zeiteinheiten (`D.nice`, `D.niceFull`, `D.rel`, `hhmm` lesen die Sprachtabelle).
    Feld-, Standort- und Schiffnamen bleiben deutsch.
12. **Zerstörende Aktionen fragen mit `frage()` nach** und nennen die Folgen
    (wie viele Sektoren, Rohre, Kulturen verloren gehen).
13. **Emoji-Auswahl** auf breit unterstützte Symbole beschränkt.
14. **Kein `Math.random()` in der Planung** — Streuung läuft über `hash(id)`,
    sonst ändert sich der Plan bei jedem Neurechnen.
15. **Einheiten stehen im Feldnamen** (`…Mm`, `…M3`, `…M2`, `…Aren`, `…Min`, `…M3h`),
    umgerechnet wird ausschliesslich über `U`. Ein Feld ohne Einheitsendung ist ein Fehler.
16. **Die Rechenkette ist gerichtet:** Fläche → Menge → Dauer. Nie eine Grösse verwenden,
    in der die Fläche schon steckt (mm/h), um daraus wieder eine Dauer auf derselben
    Fläche zu rechnen. Das ist die Zirkularität, die Phase 3 beseitigt hat.
17. **Abgeleitete Werte erben die schlechteste Herkunft** ihrer Bestandteile
    (`W.ableiten`). Eine Dauer aus einer geschätzten Fläche ist geschätzt und muss so
    angezeigt werden.
18. **Nicht nach purer Dringlichkeit sortieren.** Das war messbar schlechter als Zufall
    (siehe 5.5). Änderungen an `Engine.reihung` gehören durch `tools/backtest.js` belegt,
    bevor sie eingebaut werden.
19. **Kennzahlen tragen ihre Fallzahl.** In der Auswertung steht neben jedem Median seine
    Unsicherheit oder ein `±?`, wenn n < 5. Eine Zahl ohne n ist in dieser App unvollständig.
20. **Schwellen werden aus der Verteilung begründet**, nicht nach Gefühl gesetzt, und ihre
    Unempfindlichkeit wird mitgeprüft (`RUECKSTAND_AB`, `DECKUNG_MAX`, die Grenzen 0,5–5
    für den Durchfluss).

---

## 11. Bekannte offene Punkte / To-dos

- **Polygone sind grobe Rechtecke.** Der Mensch zieht sie im Setup zurecht.
  Als `unsicher:true` markierte Felder (Cherwis, Thalheimer Hofparzellen, Aegert
  Bischofberger) werden im Plan und im Feldeditor hervorgehoben.
- **Journalname „Trüb"** liess sich keinem Plan zuordnen (im Setup manuell zuweisen).
- **Rollomat** (Winkler & Uster Slowgrow) wird weiterhin wie ein Standregner gerechnet.
  Eigene Flächenlogik wäre genauer — dem Betrieb ist die Rechnung selbst noch unklar.
- **Pflanzdaten fehlen weitgehend.** Ohne Datum schätzt die Engine den Startpunkt und
  markiert den Auftrag als „Fälligkeit geschätzt". Der Backtest zeigt, dass das die
  grösste Lücke im Modell ist: bewässert wird schubweise (nach einem Gang am Vortag
  2,3-fach so wahrscheinlich), und der stärkste Treiber dieser Schübe — das Anwachsen
  nach dem Pflanzen — steht nirgends in den Daten.
- **Flächen je Schiff fehlen fast vollständig.** Nur 5 von 164 Schiffen haben eine eigene
  Angabe (104 von 7534 Aren); der Rest wird aus der Feldfläche über die Zeichnung
  verteilt. Alle mm- und m³/Are-Zahlen hängen daran. Eingetragene Aren je Schiff wären
  die wirksamste einzelne Verbesserung an diesen Daten.
- **Die hinterlegten Regeln passen nicht zur Praxis.** 8 von 10 auswertbaren Kombinationen
  aus Feld und Kultur bekommen unter 80 % ihrer Regelmenge, im Median das 0,32-fache.
  Solange das so ist, wächst überall dauerhaft ein Defizit und die Fälligkeitsliste bleibt
  lang und nichtssagend. Die Auswertung schlägt je Zeile die beobachtete Regel vor.
- **Überdachung ist nicht erfasst.** Ob eine Fläche im Tunnel liegt, steht in keinem
  Datenfeld. Die Regenverrechnung gilt deshalb nur für Freiland — die App kann das
  derzeit nicht unterscheiden.
- **27 Journaleinträge nennen zu wenige Schiffe** für ihre Sprenklerzahl und liefern
  darum keine mm-Zahl. Werden die fehlenden Nummern nachgetragen, kommen sie zurück.
- **Rückstand aus dem Journal:** die Altdaten enden am 04.08.2026. Läuft die App später,
  sind viele Sektoren rechnerisch stark überfällig; der Plan arbeitet den Rückstand
  kapazitätsgerecht ab und zeigt `zurueckgestellt` an.
- **Phase 2** (online/Sheets/E-Mail/Login) ist konzipiert, aber nicht gebaut.

---

## 12. Arbeiten am Projekt

1. `python3 assemble.py` baut `build/wasserplan.html` aus `src/` + `data/`.
2. Änderungen immer in `src/` — nie im Build.
3. Nach jeder Änderung: bauen, **`node tools/regression.js`** laufen lassen, Konsole muss
   sauber bleiben. `node tools/shots.js` für den Blick aufs UI.
   Bei Änderungen an Engine oder Modell zusätzlich `node tools/backtest.js --md`.
4. Neue sichtbare Wassermann-Texte in alle drei Sprachen eintragen
   (`tools/verify2.js` prüft die Vollständigkeit der `I18N`-Tabellen).
5. **Sprache:** mit dem Auftraggeber auf Deutsch kommunizieren, „du"-Form.

Der Code ist bewusst framework-frei und kommentiert — die Banner in jedem Modul erklären
den Zweck direkt am Code.

---

## 13. Das Modell prüfen — `tools/backtest.js`

Der Backtest lässt die Engine **rollend gegen die Vergangenheit** laufen. Für jeden
Stichtag T bekommt sie nur, was bis T bekannt war, und sagt T+1 voraus; verglichen wird
mit dem, was tatsächlich passiert ist. Das ist die einzige Prüfung, die verhindert, dass
ein Modell an denselben Daten glänzt, aus denen es gefittet wurde.

```
node tools/backtest.js          # Bericht auf der Konsole
node tools/backtest.js --md     # dazu docs/backtest.md neu schreiben
```

Er schreibt immer `tools/_backtest.json`; `tools/regression.js` liest die Kennzahlen von
dort und lässt sie nicht mehr unbemerkt schlechter werden.

**Gemessen werden drei verschiedene Dinge, und sie dürfen nicht vermischt werden:**

1. **Filter** — reichert die Fälligkeitsliste an? (heute nur 1,15×, also schwach)
2. **Rangfolge** — trifft die Reihenfolge, wenn die Engine genau so viele Schiffe nennen
   darf, wie bewässert wurden? Der faire Gegner ist **blindes Ziehen aus der eigenen
   Fälligkeitsliste**, nicht aus allen Schiffen: wer eine Sortierung bewerten will, muss
   den Kandidatenkreis konstant halten. Diese Unterscheidung wurde beim ersten Lauf
   falsch gemacht und führte zu einem falschen Alarm.
3. **Dauer- und Mengenprognose** bei tatsächlich ausgebrachter Menge — das trennt das
   Durchflussmodell von der Frage, ob die Zielmenge stimmte.

Zusätzlich gibt es ein **Experiment** mit alternativen Sortierschlüsseln auf derselben
Liste. Wer `Engine.reihung` ändern will, nimmt dort einen Schlüssel auf, lässt den
Backtest laufen und baut ihn erst ein, wenn er gewinnt.

Grenzen: Kulturen und letzte Bewässerung werden aus dem Journal rekonstruiert, Pflanzdaten
fehlen ganz, je Schiff wird ein Sektor angenommen, Rollomat-Gänge sind ausgeschlossen, und
„nicht bewässert" heisst im Journal nicht „war nicht nötig". Alles ausgeschrieben in
`docs/backtest.md`.

---

## 14. Welches Dokument sagt was?

| Datei | Inhalt |
|---|---|
| `docs/pflichtenheft.md` | was die App fachlich leisten soll |
| `docs/entwicklerhandbuch.md` | dieses Dokument: wie sie gebaut ist |
| `docs/BEFUNDE.md` | 69 gefundene Fehler samt Behebung und Begründung |
| `docs/datenaudit.md` | Zustand der 1069 Journaleinträge (`tools/audit.py`) |
| `docs/modell.md` | Kalibrierung H1–H8, welche Hypothese hielt und welche nicht |
| `docs/backtest.md` | ehrliche Prüfung gegen die Vergangenheit |
| `docs/praxis-durchgang.html` | Durchgang aus Sicht von Betriebsleiter und Wassermann |
| `docs/offene-fragen.md` | was der Betrieb beantworten muss, damit es weitergeht |
