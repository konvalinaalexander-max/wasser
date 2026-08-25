# Befunde: Architektur-, Logik- und Phantom-Daten-Durchlauf

Vollständiger Durchgang durch `wasserplan5.html` (161 KB Code, 2,57 MB Seed-Daten),
abgeglichen gegen `pflichtenheft.md` und `entwicklerhandbuch.md`.

**Stand: alle 69 Befunde sind behoben.** Unter jedem Befund steht, was konkret geändert
wurde. Ein Befund (A12) hat sich bei der Messung als kein Fehler erwiesen und ist
entsprechend umgewidmet.

Die mit „✅ verifiziert" markierten Befunde wurden vor der Behebung in einem headless
Chromium (Playwright) reproduziert; die Behebung ist mit denselben Skripten gegengeprüft
(`tools/verify.js`, `tools/verify2.js`, `tools/diag.js`).

Stand dieses Dokuments: 25.08.2026

---

## Was sich am Verhalten geändert hat

| | vorher | nachher |
|---|---|---|
| Aufträge über 10 Tage | 13 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 | 11 · 3 · 7 · 3 · 7 · 3 · 7 · 7 · 7 · 3 |
| tägliche Kultur im Horizont | 1 von 10 Tagen | 10 von 10 Tagen |
| planbare Sektoren beim Start | 0 (18 verwaiste Regeln) | 55 nach einem Klick |
| Admin-Anpassung nach `planNeu()` | verworfen | erhalten |
| Auftrag verschieben | Duplikat auf zwei Tagen | ein Auftrag |
| „alle 10 Tage" nach dem Regel-Editor | „1× am Tag" (10× Wasser) | „alle 10 Tage" |
| Import einer älteren Datei | Absturz | läuft durch die Migration |
| mm desselben Journaleintrags | 10,4 (Plan) gegen 5,7 (Journal) | 10,4 überall |
| Felder mit doppelt gezählter Fläche | Au Landi 144 statt 104 Aren | 104 Aren |
| Regen der Woche | Maximum eines Eintrags | Summe der Tage |
| Journaleinträge des Wassermanns | für 26 von 49 Feldern unauffindbar | immer auffindbar |
| Datenfelder ohne Lesezugriff | 18 | 0 |
| hartcodierte deutsche Strings beim Wassermann | 13 | 0 |

---

## A · Planungs-Engine (`05_engine.js`)

### A1 · [P0] Der Plan ist leer und niemand erfährt warum ✅ verifiziert
Die Seed-Daten enthalten **0 Sektoren** bei 164 Schiffen. `Store.sektoren()` iteriert
ausschliesslich über `schiff.sektoren`, also liefert `auftraegeFuer()` für jeden Tag
eine leere Liste.

```
Startbildschirm nach dem Laden:
"29 Standorte · 49 Felder · 164 Schiffe · 0 Kulturen gesetzt · 0 Tage freigegeben"
Plan: 10 Tage angelegt, 0 Aufträge insgesamt.
```

Die 18 mitgelieferten Regeln (Pflichtenheft §6) hängen an Kulturen, die kein Sektor
trägt — sie sind wirkungslos. Der Tagesplan zeigt „Nichts fällig", was fachlich falsch
ist: richtig wäre „noch keine Kulturen erfasst".

> **Behoben.** `Setup.kulturenAusRegeln()` überführt die Startregeln in Kulturzuweisungen (55 planbare Sektoren); Tagesplan und Startbildschirm sagen jetzt, warum nichts fällig ist.

### A2 · [P0] `schonGeplant` unterdrückt jede Wiederholung ✅ verifiziert
`Engine.planen()` führt ein `Set` über `feldId|kulturId` und filtert damit **den
gesamten Horizont**:

```js
let auto = this.auftraegeFuer(d).filter(a=> !schonGeplant.has(a.feldId+'|'+a.kulturId));
```

Folge: „Eichhof 2 Salat, täglich 15 mm" wird an Tag 1 eingeplant und danach **neun Tage
lang nicht mehr**. „Cherwis Karotten, 2×/Tag" ebenso. Reproduziert mit 77 Sektoren aus
den vorhandenen 18 Regeln:

| Tag | +0 | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +8 | +9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Aufträge | **13** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

> **Behoben.** `schonGeplant` ersetzt durch eine Tag-für-Tag-Simulation (`virtuell`). Tägliche Kulturen erscheinen an 10 von 10 Tagen, Wochenkulturen an 2 von 10.

### A3 · [P0] Die geforderte Entzerrung existiert nicht
Pflichtenheft §9.3: *„Fälligkeiten werden über die kommenden Tage verteilt statt
gebündelt (3 Kulturen brauchen alle 3 Tage Wasser → nicht alle am selben Tag, sondern
je einen Tag versetzt)."*

Implementiert ist reine Unterdrückung (A2). Es gibt keinen Ausgleichsschritt, keine
Kapazitätsverteilung, kein Versetzen. Die Kapazitätsprüfung ist nur eine Warnung
**nachdem** alles auf einen Tag gefallen ist — und dann muss der Admin 13 Aufträge von
Hand wegschieben, wobei jedes Wegschieben Duplikate erzeugt (A5).

> **Behoben.** `planen()` entzerrt nach Tageskapazität (Standorte und Aufträge). Verteilung auf den echten Daten: 11/3/7/3/7/3/7/7/7/3 statt 13/0/0/…

### A4 · [P0] `planNeu()` verwirft jede Bearbeitung des Admins ✅ verifiziert
`planen()` behält aus einem nicht freigegebenen Tag nur `quelle==='manuell' || verschoben`.
Alles andere wird neu erzeugt.

```
Test: Auftrag auf zielMm=999, notiz="NICHT VERLIEREN", prioritaet="hoch" gesetzt
      → Engine.planNeu()
Ergebnis: zielMm = 15, notiz = null
```

```
Test: Auftrag gelöscht (Admin.auftragLoeschen)  → Engine.planNeu()
Ergebnis: Auftrag ist wieder da.
```

`planNeu()` wird u. a. von `regenSpeichern()`, `einstSpeichern()`, `regelSpeichern()`,
`sektorSpeichern()` und dem „wird bewässert"-Häkchen ausgelöst — also mehrmals pro
Sitzung. Auch `anpassungManuell` (das Flag, das genau davor schützen soll) hilft nicht:
es wird nur innerhalb *freigegebener* Tage geprüft.

> **Behoben.** Admin-Änderungen liegen als Overlay in `Store.db.eingriffe` und werden nach jeder Neuberechnung wieder aufgelegt. Löschungen bleiben Löschungen.

### A5 · [P0] Verschieben erzeugt ein Duplikat ✅ verifiziert
`Engine.verschiebe(datum, id, +1)` markiert den Auftrag als `verschoben` und hängt ihn
an den Folgetag. Beim nächsten `planNeu()` wird der Quelltag neu berechnet — `schonGeplant`
ist dort noch leer, also entsteht derselbe Auftrag ein zweites Mal.

```
Test: Auftrag "Eichhof 2 / Salat" von heute auf morgen geschoben → Engine.planNeu()
Ergebnis: heute 1 ×, morgen 1 ×  →  Feld+Kultur zweimal im Plan.
```

Rückwärts (auf den Vortag) tritt der Fehler nicht auf, weil der Zieltag zuerst
verarbeitet wird — das Verhalten hängt also an der Schleifenrichtung.

> **Behoben.** `verschiebe()` schreibt einen Eingriff, statt zu kopieren. Der Eingriff wandert mit auf den Zieltag; daraus wird vor der Tagesschleife eine Sperre (nach vorne) bzw. ein Vorziehen (nach hinten) abgeleitet. Auch nach mehrfachem Hin- und Herschieben bleibt es genau ein Auftrag, und Menge, Notiz und Priorität wandern mit. Ziele ausserhalb des Horizonts werden abgelehnt.

### A6 · [P1] `aktivePhase()` rechnet immer mit heute ✅ verifiziert
```js
const tage = D.diff(pflanzdatum, D.today());   // ← Zieldatum wird nicht durchgereicht
```
`bilanz(eintrag, bisDatum)` kennt das Zieldatum, gibt es aber nicht weiter. Für alle
Zukunftstage gilt damit die Phase von heute.

```
Test: Pflanzung vor 3 Tagen, Phase 1 (Tag 0–5): 8 mm, Phase 2 (ab Tag 6): 30 mm
Tag +10 (= Kulturtag 13) müsste 30 mm liefern → liefert 8 mm.
```

Bei Jungpflanzen-Phasen wird also über den ganzen Horizont mit der falschen Menge und
dem falschen Rhythmus geplant.

> **Behoben.** `aktivePhase(regel, pflanzdatum, datum)` bekommt das Zieldatum durchgereicht.

### A7 · [P1] `tagesPlan()` legt Pläne für beliebige Daten an ✅ verifiziert
```js
tagesPlan('2026-01-15')  →  Store.db.plan hat danach einen Eintrag für den 15.01.
```
Jeder Lesezugriff ist ein Schreibzugriff. `Store.db.plan` wächst unbegrenzt, alte Tage
werden nie aufgeräumt und landen im Export. Ausserdem rechnet `auftraegeFuer()` für
Vergangenheitsdaten Defizite aus, die nie jemand sieht.

> **Behoben.** `tagesPlan()` liest nur; Tage ausserhalb des Horizonts liefern einen Nur-Lese-Tag. `eingriffeAufraeumen()` löscht alte Einträge.

### A8 · [P1] Sektoren ohne Historie sind sofort überfällig
```js
const letzte = sektor.letzteBewaesserung || this.letzteBewaesserung(schiff.id) ||
               sektor.pflanzdatum || D.add(D.today(), -Math.ceil(iv));
```
Der letzte Fallback setzt das Defizit auf genau 100 % — ein frisch angelegter Sektor
ohne Pflanzdatum und ohne Journalbezug ist am selben Tag fällig. Nichts kennzeichnet
diesen Auftrag als „geraten".

> **Behoben.** Ohne Historie wird der Startpunkt deterministisch über das Intervall gestreut (`hash(id)`) und der Auftrag als „Fälligkeit geschätzt“ gekennzeichnet.

### A9 · [P1] Sektoren ohne Regel verschwinden lautlos
`bilanz()` gibt `null` zurück, wenn `Store.regel(feld.id, kulturId)` leer ist — der
Sektor fällt kommentarlos aus der Planung. Sichtbar ist das nur im
Abschluss-Dialog der Ersteinrichtung („n Sektoren ohne Regel") und als roter Chip im
Kultur-Reiter des jeweiligen Feldes. Im Tagesplan und im Reiter „Kulturen & Regeln"
gibt es keine Liste der Lücken.

Das Pflichtenheft (§3) verlangt: *„muss beim Ersteinrichten einer Standort-Kultur-
Kombination zwingend erfasst werden"*. Der Zwang existiert im Dialog (`sektorSpeichern`
bricht ohne mm ab), aber nicht als laufende Kontrolle.

> **Behoben.** `Engine.probleme().ohneRegel` erscheint als Warnung im Tagesplan und als Schnellzugriff im Kulturen-Reiter.

### A10 · [P1] Schiffe ohne Sektoren sind für die Engine unsichtbar
Handbuch §4: *„ein Schiff ohne Unterteilung hat 0 Sektoren, dann gilt die einzige Kultur
fürs ganze Schiff"*. Diesen Fall implementiert kein Code — `Store.sektoren()` liefert
für so ein Schiff nichts. In der Praxis legt `sektorSpeichern()` immer einen (polygonlosen)
Sektor an, das Modell verspricht aber etwas anderes. Wer die Daten von Hand oder per
Import erzeugt, bekommt stumme Ausfälle.

> **Behoben.** `probleme().ohneKultur` zählt und meldet sie; Setup-Abschluss und Tagesplan zeigen die Zahl.

### A11 · [P1] Felder ohne Schiffe kommen im Code nicht vor
Pflichtenheft §3/§4: *„Felder ohne Schiff-Nummerierung (nur Gesamtfläche) bleiben
schiff-los – reine Feld-Ebene reicht dann."*

Betroffene Stellen, die alle auf `f.schiffe` laufen und solche Felder überspringen:
`Store.sektoren()`, `Admin.neuerAuftrag()`, `WM.rechner()`, `WM.freierEintrag()`,
`FeldEditor.uKultur()`, `PlanView` (kein klickbares Element). Solche Felder können
also weder eine Kultur bekommen noch je bewässert werden.

Im aktuellen Datensatz gibt es keine (0 von 49) — die Ersteinrichtung kann sie aber
erzeugen, und für Neubetriebe (Langfristvision §1) ist es der Normalfall.

> **Behoben.** `Store.normalisiere()` gibt jedem schifflosen Feld ein implizites Schiff über den ganzen Umriss — damit ist es überall vollwertig planbar.

### A12 · [P1] Die empfohlene Dauer skaliert nicht mit der Gruppengrösse ✅ verifiziert
```
Au Landi, Ziel 20 mm:
  1 Schiff  →  270 min
  4 Schiffe →  277 min
```
Der zentrale Nutzen für den Wassermann („Schiff 9 und 10, 2 h 34 min") hängt an dieser
Zahl. `dauerFuer()` mittelt die mm/h-Raten der Schiffe und teilt die Zielmenge dadurch —
die Gruppengrösse fällt heraus. Das ist nur dann richtig, wenn die Sprenklerzahl
proportional mitwächst *und* die Pumpe das liefert. Diese Annahme steht nirgends und
ist nicht geprüft.

> **Behoben.** **Kein Fehler.** Am Journal gemessen liegt die Rate bei 1–4 Schiffen konstant bei 4,95 mm/h — die Dauer soll nicht skalieren. Was fehlte, war die Sprenklerzahl: neu `Engine.sprenklerFuer()`, additiv je Schiff, sichtbar auf Auftragskarte und beim Wassermann.

### A13 · [P1] Zwei widersprüchliche mm-Definitionen in derselben App ✅ verifiziert
- **Engine** (`refWerte`): mm = m³ × 1000 / **beregnete Fläche** (Sprenklerzahl × Raster)
- **Journal-Ansicht** (`vJournal`): mm = m³ × 1000 / **Feldfläche** (`schiffFlaecheM2`)

```
Eintrag "Au landi 2026-03-05", 56 m³:
  Engine          10.4 mm
  Journal-Ansicht  5.7 mm      → Faktor 1,8
```
Der Admin prüft die Plausibilität des Plans an Zahlen, die anders gerechnet sind als
der Plan. Handbuch-Invariante Nr. 3 wird in `vJournal` gebrochen.

> **Behoben.** `Engine.mmVonEintrag()` ist die einzige mm-Definition — in Plan, Journal-Ansicht und CSV-Export.

### A14 · [P2] `aren` und Polygonfläche haben null Einfluss auf die Planung
`Store.schiffFlaecheM2()` wird nur an zwei Stellen aufgerufen: in der Schiffe-Tabelle
(Anzeige) und in der Journal-mm-Spalte (die falsche, A13). Die Handbuch-Invariante
Nr. 4 („`aren` schlägt Zeichnungsfläche") ist praktisch wirkungslos, weil die Fläche
in der Dauerberechnung gar nicht vorkommt. Pflichtenheft §10 („sobald die digitalisierte
Polygon-Fläche vorliegt, ersetzt diese die feste 18") ist nicht umgesetzt.

> **Behoben.** Fläche geht jetzt in die Planung ein: `schiffFlaecheM2` → Regnerdichte → Sprenklerempfehlung. Reihenfolge `aren` → `laengeM × breiteM` → Restanteil.

### A15 · [P2] 125 Journaleinträge werden pauschal allen Schiffen zugerechnet ✅ verifiziert
```js
let betroffen = f.schiffe.filter(s=> e.schiffe.includes(String(s.nummer)));
if(!betroffen.length) betroffen = f.schiffe.length ? f.schiffe : [];
```
```
Von 877 verwertbaren Einträgen:  742 gezielt · 125 pauschal auf alle Schiffe · 10 ignoriert
```
125 Einträge (14 %) verwässern die Schiff-Referenzwerte, ohne dass irgendwo steht, dass
die Schiffnummern nicht zugeordnet werden konnten.

> **Behoben.** Unzuordenbare Einträge zählen nur zum Feld- und Betriebsschnitt und werden im Journal-Reiter beziffert.

### A16 · [P2] Mehrmals tägliche Bewässerung wird nur einmal geplant
`regelIntervall()` liefert für „2×/Tag" korrekt 0,5 Tage, aber `auftraegeFuer(datum)`
erzeugt pro Feld+Kultur+Menge genau **einen** Auftrag pro Tag. „Cherwis Karotten,
2×/Tag 5 mm" (Pflichtenheft §6) wird also als ein 5-mm-Gang statt zwei geplant.
Die dazugehörigen Zeitfenster (`regel.zeiten`, 2-Stunden-Raster) werden erfasst und
gespeichert, aber nie gelesen — siehe C2.

> **Behoben.** Mehrmals tägliche Regeln erzeugen je Gang einen Auftrag mit Zeitfenster aus `regel.zeiten`.

### A17 · [P2] Regen wird immer auf den Erfassungstag gebucht
Der Dialog fragt „was die Wetterstationen **seit der letzten Anmeldung** gemessen haben",
`regenSpeichern()` schreibt aber `datum: D.today()`. Regen von gestern Nacht landet auf
heute. `bilanz()` klammert den Regen des Zieltages bewusst aus — der gestrige Regen baut
also für heute kein Defizit ab, sondern erscheint nur als Anpassungsvorschlag.

---

## B · Datenverlust und stille Korruption

> **Behoben.** Der Regen-Dialog fragt den Tag ab (heute / gestern / vorgestern) und bucht auf diesen Tag.

### B1 · [P0] Der Regel-Editor zerstört „alle n Tage"-Regeln ✅ verifiziert
`Admin.regelBearbeiten()` bietet im Dropdown nur `tag` und `woche` an. Eine Regel mit
`einheit:'frei'` findet keine passende Option, der Browser wählt die erste — `tag`.

```
Vorher:  {einheit:'frei', tage:10, mm:30}      → Intervall 10 Tage
Öffnen + Speichern, ohne etwas anzufassen:
Nachher: {einheit:'tag', anzahl:1, mm:30}      → Intervall 1 Tag
```
„Uster Slowgrow: alle 10 Tage, 30 mm" wird zu „täglich 30 mm" — **zehnfache
Wassermenge**, ohne Warnung, ohne sichtbare Änderung im Dialog.

> **Behoben.** Der Regel-Editor hat die Option „alle … Tage“ und ein Feld für die Tageszahl.

### B2 · [P0] `regelSpeichern()` schreibt `tage` gar nicht
```js
Store.setRegel(sid,kid,{anzahl:…, einheit:…, mm:…, zeiten, phasen});   // tage fehlt
```
Selbst wenn B1 behoben wäre, ginge der Wert verloren. `_skRegelVorschlag()` (der
Kultur-Dialog) kann `frei` und schreibt `tage` korrekt — die beiden Editoren für
dieselbe Entität sind nicht deckungsgleich.

> **Behoben.** `regelSpeichern()` schreibt `tage`. Prüfung: 10 Tage rein, 10 Tage raus.

### B3 · [P1] „In n Streifen teilen" überschreibt alle handgezogenen Polygone
`Admin.schiffeAufteilen()` ersetzt `f.schiffe` komplett durch gleichmässige Streifen aus
der Bounding-Box. Die im Setup mühsam zurechtgezogenen Polygone sind weg. Bei kleinerem
`n` werden überzählige Schiffe samt Sektoren, Rohren und Kulturen **gelöscht** — ohne
Rückfrage, ohne Undo. Die übernommenen Sektorpolygone passen danach nicht mehr zu ihrem
Schiff.

> **Behoben.** Ersetzt durch einen Dialog, der Anzahl, Richtung und die Folgen benennt; Sektorpolygone werden in den neuen Umriss überführt.

### B4 · [P1] `achseWechseln()` dreht die Achse auch bei Abbruch
```js
achseWechseln(id){ f.achse = f.achse==='v'?'h':'v'; Store.mark(); this.schiffeAufteilen(id); }
```
Bricht der Nutzer den anschliessenden `prompt()` ab, ist die Achse trotzdem gedreht.

> **Behoben.** Die Achse wird erst nach Bestätigung gesetzt.

### B5 · [P1] `sektorTeilen()` verliert Zustand und stapelt Duplikate
Übernommen werden nur `kulturId` und `pflanzdatum` des alten Sektors. Verloren gehen
**`letzteBewaesserung`** (→ Fälligkeit wird neu geraten, A8), `prioritaet`, `satz`,
`pausiert`, `pausiertBis`. Ausserdem *ergänzt* die Funktion die neuen Streifen, statt
zu ersetzen — zweimal aufgerufen liegen 2n überlappende Sektoren auf dem Schiff, jeder
mit eigener Fälligkeit.

> **Behoben.** `sektorTeilen()` übernimmt `letzteBewaesserung`, Priorität, Satz und Pause — und ersetzt bestehende Sektoren, statt sie zu stapeln.

### B6 · [P1] Import ohne Migration stürzt ab ✅ verifiziert
```js
importDialog(){ … if(!d.standorte||!d.felder) throw …; this.db=d; this.reindex(); … }
```
Es gibt keine Versionsprüfung und keine Auffüllung fehlender Felder.
```
Datei ohne journalKapazitaet laden → Einstellungen öffnen
→ TypeError: Cannot read properties of undefined (reading 'standorteMedian')
```
Gleiches gilt für `wetterstationen`, `laufend`, `regen`, `gruppen`,
`einstellungen.sprenkler`, `einstellungen.journalMap`. Da Persistenz **ausschliesslich**
über Export/Import läuft (Handbuch-Invariante Nr. 7), ist das der einzige Weg, Arbeit
über eine Sitzung zu retten — und er ist der ungeschützteste Pfad der App.

> **Behoben.** `Store.migriere()` füllt jede fehlende Struktur; alle fünf Admin-Ansichten rendern nach dem Import einer minimalen Datei.

### B7 · [P1] Import lässt Cache und Plan des Vorgänger-Datensatzes stehen
`importDialog()` ruft weder `Engine.clearRef()` noch `Engine.planNeu()`. Nach dem Laden
einer fremden Datei rechnet die App mit den Referenzwerten der alten Daten weiter, und
`Store.db.plan` enthält den Plan der neuen Datei, aber `_refCache` den der alten.

> **Behoben.** Der Import ruft `clearRef()` und `planNeu()`.

### B8 · [P1] „Alle Rohre löschen" ohne Rückfrage
Ein Klick in `FeldEditor.uRohre()` löscht alle Rohre des Feldes. Kein Bestätigen,
kein Undo.

> **Behoben.** Rückfrage mit Anzahl der betroffenen Rohre.

### B9 · [P1] Stoppen markiert alle Sektoren eines Schiffs als bewässert ✅ verifiziert
```js
l.schiffIds.forEach(sid=>{ const i=Store.db._sch[sid];
  (i?.schiff.sektoren||[]).forEach(k=> k.letzteBewaesserung = l.datum); });
```
```
Schiff mit Sektor A (Salat) und Sektor B (Fenchel); Auftrag betraf Salat.
Nach dem Stoppen: beide Sektoren tragen letzteBewaesserung = heute.
```
Der Fenchel gilt als bewässert, obwohl er es nicht ist — und wird entsprechend später
wieder fällig. Genau der Fall, für den Sektoren erfunden wurden (Pflichtenheft §3, „Satz").

---

## C · Phantom-Daten (vorhanden, aber nie verarbeitet)

> **Behoben.** Nur die Sektoren des Auftrags (`sektorIds`) bzw. der passenden Kultur werden markiert.

### C1 · [P1] `gruppen` — 40 Einträge, kein einziger Lesezugriff
```
Vorkommen im gesamten Code:  gruppen: seed.gruppen || []     (Store.init)
```
Aus dem Journal abgeleitete Bewässerungsgruppen (`{feldJournal, schiffe[], haeufigkeit}`)
liegen im Datenmodell und im Export, werden aber nirgends angezeigt, vorgeschlagen oder
verwendet. Die **Bewässerungsgruppe** ist im Pflichtenheft §3 eine eigene Kernentität
(„vom Admin im Voraus als Vorschlag definierbar UND vom Wassermann spontan bildbar") —
komplett unimplementiert.

> **Behoben.** Die Gruppen werden gelesen: überlappungsfreier „üblicherweise zusammen“-Vorschlag auf der Auftragskarte und im Wassermann-Detail (40 Aufträge nutzen sie).

### C2 · [P1] `regel.zeiten` — erfassbar, gespeichert, nie gelesen
Der Regel-Editor hat ein Feld „Zeitfenster bei mehrmals täglich", `regelSpeichern()`
schreibt es. Danach: kein Lesezugriff. Der Wassermann sieht keine Uhrzeit, die Engine
plant keine (A16). Pflichtenheft §3 fordert das 2-Stunden-Raster ausdrücklich.

> **Behoben.** `regel.zeiten` steuern die Zeitfenster der Gänge und stehen in der Regeltabelle.

### C3 · [P1] `Store.db.meldungen` — „Schaffe ich heute nicht" landet im Nichts
`WM.schaffNichtSenden()` legt `{datum, zeit, text}` in `Store.db.meldungen` ab. Das Feld
wird in `Store.init()` nicht angelegt und in der gesamten Admin-Oberfläche nicht gelesen.
Der Wassermann bekommt die Bestätigung „Meldung erfasst", der Produktionsleiter erfährt
nie davon — auch nicht offline, wo eine simple Liste genügen würde.

> **Behoben.** Meldungen erscheinen als Kasten im Tagesplan des Admins, mit „Zur Kenntnis genommen“.

### C4 · [P1] Journaleinträge des Wassermanns für 26 von 49 Feldern sind unsichtbar ✅ verifiziert
`_stoppFinal()` bestimmt den Journalnamen so:
```js
const jn = <reverse-lookup in journalMap> || feld.name;
```
Für Felder ohne Mapping wird `feld.name` verwendet — ein Name, der in `journalMap` nicht
vorkommt, also von `feldFuerJournal()` nicht aufgelöst wird.
```
Test: Bewässerung auf "Eichhof 2" eingetragen und gestoppt.
  Journaleintrag angelegt:            ja  (feldJournal: "Eichhof 2")
  Findet das Feld wieder:             nein
  Fliesst in Referenzwerte ein:       nein
  Engine.letzteBewaesserung(schiff):  null
```
Die App erzeugt also selbst Daten, die sie anschliessend nicht mehr sieht. Betroffen:
**26 der 49 Felder** haben kein Journal-Mapping.

> **Behoben.** `Engine.journalNameFuer(feld, true)` legt fehlende Zuordnungen an; der eigene Eintrag findet sein Feld wieder.

### C5 · [P1] `einstellungen.sprenkler` bestimmt alles und hat keine UI
`{breite:18, abstandKreis:23, abstandSektor:11.5}` geht in jede mm-Berechnung und damit
in jede Dauer ein. Handbuch: *„in `einstellungen.sprenkler` überschreibbar, sobald die
Felder ausgemessen sind"* — es gibt aber kein Eingabefeld. Die Werte sind nur per
JSON-Editor änderbar.

> **Behoben.** Breite, Kreis- und Sektorabstand sind in den Einstellungen editierbar, mit Anzeige des Betriebsschnitts.

### C6 · [P2] `journalProbleme` — 220 Fälle, nur als Zähler
```
schiff_als_datum: 185 · ueber_nacht: 34 · zaehler_rueckwaerts: 1
```
Die Einträge tragen `{zeile, art, repariert}`, angezeigt wird nur „185× Schiff-Angabe war
als Datum verfälscht". Welche 185 Einträge das sind und ob die Reparatur stimmt, kann
niemand prüfen. Pflichtenheft §10 macht die Datenkorrektur zum expliziten Thema.

> **Behoben.** „Einzeln ansehen“ listet alle 220 bereinigten Fälle mit Zeile, Art und repariertem Wert.

### C7 · [P2] `laengeM` / `breiteM` (Schiff **und** Feld) — erfassbar, nie verwendet
Vier Eingabefelder (Schiffe-Tabelle + Feld-Stammdaten), gespeichert, in keiner
Berechnung. Für Feld-Objekte stehen sie nicht einmal im dokumentierten Datenmodell.

> **Behoben.** Am Schiff gehen sie als Flächenquelle in `schiffFlaecheM2` ein; die nie gelesenen Feld-Varianten sind entfernt.

### C8 · [P2] `sektor.satz` — erfassbar, nie angezeigt
Der Kultur-Dialog hat „Satz-Bezeichnung (optional)", `sektorSpeichern()` schreibt sie.
Kein Lesezugriff — weder in der Sektorliste, noch im Plan, noch beim Wassermann.

> **Behoben.** Der Satz steht in der Sektorliste, im Kultur-Reiter und auf der Karte des Wassermanns.

### C9 · [P2] `standort.wasseruhr` — 0 Vorkommen im Code
Jeder Standort trägt `{einheit:"m3"}`. Die Hauptwasseruhr pro Standort ist im
Pflichtenheft §3 ein eigenes Merkmal; die Zählerstände werden aber ohne jeden
Standortbezug erfasst (siehe F4).

> **Behoben.** `Store.uhrLabel()` beschriftet die Zählerfelder; die Vorbelegung kommt jetzt vom Standort statt vom Feld.

### C10 · [P2] `feld.einzelschiff`, `feld.planSeite`, `feld.journalName`, `feld.unsicher` — 0 Vorkommen
`unsicher` sollte laut Handbuch §11 die drei kritischen Digitalisierungen markieren
(Cherwis, Thalheimer Hofparzellen, Aegert Bischofberger). Angezeigt wird nur `hinweis`.
`journalName` ist ein zweiter, konkurrierender Mechanismus neben `journalMap` — tot,
aber verwirrend.

> **Behoben.** `einzelschiff`, `planSeite`, `journalName` entfernt; `unsicher` wird im Plan und im Feldeditor hervorgehoben.

### C11 · [P2] `einstellungen.letzteRegenStandorte` — initialisiert, nie beschrieben, nie gelesen
Pflichtenheft §8: *„Beim nächsten Mal bleibt diese Standort-Auswahl vorausgewählt."*
Die Umsetzung ist stattdessen auf Wetterstationen umgeschwenkt; das Feld blieb stehen.

> **Behoben.** Entfernt — die Wetterstationen haben die Funktion übernommen.

### C12 · [P2] `refWerte().schiff[].letzteKreis` / `.letzteSektor` — berechnet, nie gelesen
Die Vorbelegung der Sprenklerzahl (Pflichtenheft §7) läuft über `historieFuer()`, nicht
über diese Werte. Doppelte Logik, eine Hälfte tot.

> **Behoben.** Sie tragen jetzt den Anteil je Schiff und sind die Grundlage der Sprenklerempfehlung.

### C13 · [P2] Die 18 Seed-Regeln sind verwaist
Sie referenzieren Feld+Kultur-Kombinationen, für die kein Sektor existiert (A1). Sie
erscheinen in „Kulturen & Regeln" als vollwertige Regeln und wirken dadurch so, als
wäre das System bereits eingerichtet.

> **Behoben.** Verwaiste Regeln werden im Kulturen-Reiter ausgegraut und beziffert, mit Knopf zur Übernahme.

### C14 · [P3] `_journalGeklaert` — UI-Zustand im Datenmodell
`Setup.journalUebernehmen()` schreibt `st._journalGeklaert = true` auf das
Standort-Objekt. Das landet im Export und unterdrückt nach einem Import die
Journal-Zuordnung, ohne dass das irgendwo dokumentiert ist.

> **Behoben.** Wandert nach `einstellungen.setupJournalGeklaert`; die Migration räumt Altdaten auf.

### C15 · [P3] `erfahrungsstufe` steuert genau eine Zeile
„Neu – ausführliche Schritt-für-Schritt-Anweisung" vs. „Erfahren – knappe Angaben"
entscheidet ausschliesslich darüber, ob der Kulturname auf der Auftragskarte steht.

> **Behoben.** Steuert jetzt Kultur, Satz, Sprenklerzahl und Gruppenvorschlag in der Wassermann-Ansicht.

### C16 · [P3] Ungenutzte I18N-Keys: `fertig`, `laufend`, `schiff` (je 3 Sprachen)

> **Behoben.** `fertig`, `regner` und `planGeaendert` entfernt, `schiff` wird in `Store.schiffName()` verwendet. Laufzeitprüfung: 78 Keys, in allen drei Sprachen vollständig, keine ungenutzten.

### C17 · [P3] Tote lokale Variablen
`nWoche` (`vPlan`, gezählt und nie ausgegeben), `f` (`freigabePruefen`), `ib`
(`kulturUpdate`).

> **Behoben.** Entfernt.

### C18 · [P3] `Store.regelVorschlag()` nimmt die erste beliebige Regel
`for(const [k,v] of Object.entries(...)) if(k.endsWith('::'+kulturId)) return v;`
Ohne Sortierung — welcher Standort als Vorschlag dient, hängt an der Einfügereihenfolge.
Pflichtenheft §3 verlangt einen Vorschlag, sagt aber nichts über die Herkunft; dem
Admin wird sie auch nicht angezeigt („Vorschlag von einem anderen Feld" — von welchem?).

---

## D · Kennzahlen, die etwas anderes zeigen als ihre Beschriftung

> **Behoben.** `regelVorschlag(kulturId, feldId)` bevorzugt denselben Standort und nennt das Herkunftsfeld im Dialog.

### D1 · [P1] „Regen · 7 Tage" zeigt das Maximum, nicht die Summe
```js
Store.db.regen.forEach(r=>{ if(r.datum>=woGrenze) regenWoche = Math.max(regenWoche, r.mm); });
```
Drei Regentage à 8 mm ergeben „8 mm", nicht 24 mm. Genau die Zahl, an der der Admin
entscheidet, ob überhaupt bewässert werden muss.

> **Behoben.** Summe je Tag über die Woche statt Maximum eines Eintrags (3 × 8 mm ergibt 24 mm).

### D2 · [P2] Journal-Suche: „400 von 1069" auch bei 800 Treffern
`.slice(0,400)` läuft **vor** der Zählung. Die Trefferzahl ist nie grösser als 400 und
der Nutzer erfährt nicht, dass abgeschnitten wurde.

> **Behoben.** Es wird vor dem Kürzen gezählt: „X Treffer, die 400 neuesten angezeigt“.

### D3 · [P2] Die Regeltabelle zeigt `einheit:'frei'` als „pro Woche"
```js
<td>${r.anzahl}× ${r.einheit==='tag'?'am Tag':'pro Woche'}</td>
```
„alle 10 Tage" erscheint als „1× pro Woche". Der Kultur-Reiter des Feldeditors macht es
richtig — zwei Anzeigen derselben Regel widersprechen sich.

> **Behoben.** Eine gemeinsame Funktion `Admin.regelText()` beschriftet Regeln überall gleich.

### D4 · [P2] `schiffFlaecheM2` zählt bei gemischten Aren-Angaben doppelt ✅ verifiziert
Hat ein Schiff eine `aren`-Zahl und die übrigen nicht, verteilt die Funktion die
**volle** Feldfläche zusätzlich über *alle* Schiffe (inklusive dem mit eigener Zahl).
```
Au Landi: gesamtflaecheAren = 104, ein Schiff mit aren = 50
Summe über alle 5 Schiffe: 144 Aren   (+38 %)
```

---

## E · Interne Kommunikation zwischen den Bausteinen

> **Behoben.** Schiffe mit eigener Zahl belegen ihren Teil der Feldfläche; nur der Rest wird verteilt (Au Landi: 104 statt 144 Aren).

### E1 · [P0] 49 Mutationen, 10 Neuberechnungen
```
Store.mark()      49 ×
Engine.planNeu()  10 ×
Engine.clearRef()  4 ×
```
Handbuch-Invariante Nr. 5: *„Nach Daten-Änderung, die den Plan betrifft: `clearRef()`
und `planNeu()` aufrufen."* Ohne `planNeu()` bleiben u. a.:
`FeldEditor.sektorTeilen` · `sektorLoeschen` · `rohrSpeichern` · `rohrLoeschen` ·
`Admin.schiffHinzu` · `schiffLoeschen` · `schiffeAufteilen` · `achseWechseln` ·
`PlanView`-Polygon-Drag · `WM.startSpeichern` · `Store.importDialog`.

Der Tagesplan zeigt danach Aufträge, die zu den Daten nicht mehr passen.

> **Behoben.** `Store.changed(bereich)` ist der einzige Weg — er erledigt Reindex, Cache und Neuberechnung. Alle Mutationen laufen darüber.

### E2 · [P1] `WM._stoppFinal()` ruft `clearRef()`, aber nicht `planNeu()`
Die Referenzwerte werden invalidiert, der Plan nicht. Bis zur nächsten Admin-Aktion
zeigt der Tagesplan den Zustand vor der Bewässerung.

> **Behoben.** `_stoppFinal()` ruft `Store.changed('journal')`, also auch `planNeu()`.

### E3 · [P1] Aufträge halten `schiffIds` gelöschter Schiffe
`schiffLoeschen()` / `schiffeAufteilen()` entfernen Schiffe, ohne die Aufträge in
`Store.db.plan` zu bereinigen. `dauerFuer()` fängt das per `?.` ab und rechnet still
mit einem zu kleinen Referenzwert; `WM.startDialog()` zeigt eine Vorauswahl, die im
Feld nicht mehr existiert.

> **Behoben.** `eingriffeAufraeumen()` entfernt Aufträge und Schiff-IDs, deren Objekte es nicht mehr gibt — auch in freigegebenen Tagen.

### E4 · [P1] Freigegebene Tage lassen sich hinter dem Rücken des Wassermanns ändern
`Engine.verschiebe()` schiebt Aufträge in freigegebene Tage hinein, `auftragLoeschen()`
und `mengeSetzen()` wirken auch dort. Der Hinweis lautet „Änderungen wirken sofort" —
der Wassermann erfährt nur beim nächsten Laden davon, ohne Kennzeichnung.

> **Behoben.** Änderungen an einem freigegebenen Tag setzen `geaendertNachFreigabe`; der Kasten und der Anpassen-Dialog weisen darauf hin.

### E5 · [P1] Wetterstationen ohne Standorte schlucken die Eingabe
```js
const mm=num(inp.value); if(!mm) return;
const w=…; if(!w || !w.standortIds.length) return;    // Wert verworfen
```
Der Admin tippt 12 mm ein, klickt „Übernehmen" und bekommt „Kein Regen erfasst".
Der Warnhinweis oben im Dialog erklärt das nicht.

> **Behoben.** Stationen ohne Standorte sind gesperrt statt still verworfen, mit Begründung am Feld.

### E6 · [P2] Der Admin kann Aufträge in die unerreichbare Vergangenheit schieben
Das `‹` an der Auftragskarte schiebt auf `datum-1`. Bei `tagOffset === 0` ist das
gestern — und `tagWechsel()` klemmt auf `Math.max(0, …)`, der Auftrag ist damit nicht
mehr erreichbar.

> **Behoben.** `verschiebe()` lehnt Ziele in der Vergangenheit mit Begründung ab.

### E7 · [P2] `‹` in der Tagesnavigation ist bei Offset 0 ein toter Klick ✅ verifiziert
Der Knopf ist sichtbar, aktiv, animiert — und tut nichts.

> **Behoben.** Die Pfeile sind an den Rändern des Horizonts deaktiviert — auch beim Wassermann.

### E8 · [P2] Rohre hängen am Schiff, nicht am Feld
Pflichtenheft §3: *„Wird pro Feld eingezeichnet."* `rohrSpeichern()` hängt jedes Rohr an
das nächstgelegene Schiff. Ein Fahrgassen-Rohr „3/4" gehört damit nur zu Schiff 3, und
`freigabePruefen()` meldet für Schiff 4 „ohne eingezeichnetes Rohr".

---

## F · Wassermann-Oberfläche

> **Behoben.** `Store.feldRohre(f)` liest Rohre feldweit; die Freigabeprüfung fragt das Feld statt das einzelne Schiff.

### F1 · [P1] 13 hartcodierte deutsche Strings ✅ verifiziert
Handbuch-Invariante Nr. 9: *„Alle sichtbaren Strings laufen über `T('key')`."*
Nicht übersetzt sind u. a.:
`'Menü'` · `'Kurz warum? (optional)'` · `'Melden'` · `'Meldung erfasst'` ·
der komplette E-Mail-Stub-Text · `'– Schätzwert.'` · `'Nochmals eintragen'` ·
`'Ziehen zum Verschieben, + / − zum Zoomen.'` · `'Ganzes Feld'` ·
`'Vorbelegt aus dem letzten Eintrag vom …'` · `'das ergibt … Bitte bestätigen.'` ·
`'aus Erfahrungswerten'` · `'Noch keine Schiffe erfasst'`.

Der Übernacht-Dialog — die einzige Rückfrage, bei der ein Missverständnis echte Daten
verfälscht — ist ausgerechnet komplett deutsch.

> **Behoben.** Alle 13 Strings laufen über `T()`, inklusive Übernacht- und Zählerdialog.

### F2 · [P1] Datum und Dauer sind immer deutsch
`D.nice()`, `D.rel()`, `D.niceFull()`, `D.wd()` und `hhmm()` liefern feste deutsche
Wochentage, Monate und Einheiten („Montag", „März", „2 h 34 min") — auch in der
ungarischen und polnischen Version, auf jeder Auftragskarte.

> **Behoben.** Wochentage, Monate, Zeiteinheiten und das Datumsformat kommen aus der Sprachtabelle (`kedd, aug. 25.` / `wtorek, 25 sie`).

### F3 · [P2] `historieFuer()` ist feldweit, nicht schiffbezogen
Pflichtenheft §7: *„vorbelegt mit dem letzten Eintrag für **dieselben Schiffe**"*.
Die Funktion nimmt `schiffIds[0]`, ermittelt daraus das Feld und liefert **alle**
Einträge des Feldes. Die Sprenklerzahl von Schiff 1 wird für Schiff 12 vorgeschlagen.

> **Behoben.** `historieFuer()` filtert auf die tatsächlich beteiligten Schiffnummern (15 statt 150 Einträge), Feld-Historie nur als Rückfallebene.

### F4 · [P2] Zählerstand-Vorbelegung greift auf die falsche Ebene
Der Startwert kommt aus dem letzten Journaleintrag desselben **Feldes**, die Wasseruhr
hängt aber am **Standort** (Pflichtenheft §3, `standort.wasseruhr`). Bei Standorten mit
mehreren Feldern ist der vorgeschlagene Zählerstand veraltet — und der ist die Grundlage
für `m3` und damit für jeden Referenzwert.

> **Behoben.** `letzterZaehler(standortId)` sucht über alle Felder des Standorts.

### F5 · [P2] Keine Plausibilitätsprüfung beim Zählerstand
`stoppSpeichern()` prüft nur die Uhrzeit. Ein Stop-Stand unter dem Start-Stand ergibt
negatives `m3`; die Vorschau blendet den Wert dann einfach aus (`m3 > 0`), gespeichert
wird er trotzdem. `refWerte()` verwirft ihn später still. Der Eintrag bleibt falsch im
Journal stehen.

> **Behoben.** Rückwärts laufender Zählerstand wird abgefangen, in der Vorschau markiert und vor dem Speichern zur Korrektur zurückgewiesen.

### F6 · [P2] Der Wassermann kann einen Tag ansteuern, den es nie gibt
`WM.tag()` klemmt auf 0…10, der Planungshorizont ist 10 Tage (Index 0…9). Tag +10 zeigt
immer „Noch kein Plan freigegeben".

> **Behoben.** Beide Ansichten klemmen auf `planungsHorizont − 1`.

### F7 · [P3] Der Lageplan hebt nur das erste Schiff hervor
`PlanView({selected: a.schiffIds[0]})` — bei „Schiff 9 und 10" ist Schiff 10 nicht
markiert. Genau die Verwechslungsgefahr, gegen die der Lageplan laut Pflichtenheft §7
eingebaut wurde.

---

> **Behoben.** `PlanView({selectedIds})` hebt alle Schiffe der Gruppe hervor.

## G · Robustheit und Kleinkram

### G1 · [P1] `exportFile()` setzt `dirty=false`, bevor der Download bestätigt ist
Bricht der Browser ab, glaubt die App, gesichert zu sein, und der `beforeunload`-Schutz greift
nicht mehr. Bei rein export-basierter Persistenz ist das der Unterschied zwischen „Arbeit da"
und „Arbeit weg".

> **Behoben.** `dirty` wird erst nach erfolgreichem Download zurückgesetzt; im Fehlerfall kommt eine Meldung.

### G2 · [P2] `num(' ')` liefert `0` statt `null`
`+' '` ist `0`, nicht `NaN`. Ein Feld mit einem Leerzeichen wurde als „0 mm" gewertet.

> **Behoben.** `num()` trimmt und liefert für Leerzeichen `null`.

### G3 · [P2] `<option>` ohne `value` in der Journal-Zuordnung
In `feldBearbeiten` und `journalPopup` war der Wert der angezeigte Text. Enthält ein Journalname
je ein `&`, `<` oder `"`, bricht die Zuordnung.

> **Behoben.** Alle `<option>` haben ein explizites `value`; zusätzlich steht die Anzahl der Journaleinträge daneben.

### G4 · [P2] `PlanView` lässt bei jedem Render einen `ResizeObserver` zurück
Kein `disconnect()` — und der Feldeditor rendert bei jeder Änderung neu.

> **Behoben.** `PlanView` gibt `destroy()` zurück; `FeldEditor.render()` und `closeModal()` rufen es auf.

### G5 · [P3] `schiffHinzu()` kann doppelte Nummern vergeben
`String(n+1)` als Nummer — nach einer Löschung oder bei Nummern wie „1a" entstanden Duplikate.

> **Behoben.** `naechsteNummer()` sucht die erste freie Nummer; Umbenennen prüft auf Duplikate im Feld.

### G6 · [P3] Das Modell erlaubt einen Standort in zwei Wetterstationen
`regenAm()` summiert dann beide Werte. Die UI verhinderte es per deaktivierter Checkbox, das
Datenmodell nicht — und der Import ging direkt am Modell vorbei.

> **Behoben.** Ein Standort wird beim Ankreuzen umgehängt statt doppelt zugeordnet; `Store.migriere()` bereinigt Altdaten.

---

## Nachtrag zur Behebung

**Was gemessen statt vermutet wurde.** A12 stand als „die Dauer skaliert nicht mit der
Gruppengrösse" im Bericht. Die Auswertung des Journals nach Gruppengrösse zeigt:

| gleichzeitig bewässerte Schiffe | Einträge | Median mm/h | Median Regner | Median Dauer |
|---|---|---|---|---|
| 1 | 439 | 4,96 | 11 | 151 min |
| 2 | 277 | 5,03 | 11 | 152 min |
| 3 | 113 | 4,94 | 21 | 169 min |
| 4 | 36 | 4,89 | 25 | 174 min |

Die Rate ist über alle Gruppengrössen konstant — der Betrieb legt pro Fläche etwa gleich
viele Sprenkler, und die Pumpe hält mit. Die Dauer **soll** also nicht mit der Gruppe
wachsen. Was mit ihr wächst, ist die Sprenklerzahl, und genau die stand nirgends. Statt
die Formel zu „reparieren", ist die Annahme jetzt im Code dokumentiert und
`Engine.sprenklerFuer()` liefert die fehlende Zahl.

**Was bewusst nicht automatisiert wurde.** `Setup.kulturenAusRegeln()` weist nur bei Feldern
mit genau einer Startregel eine Kultur zu. Felder mit mehreren Kulturen (Cherwis, Eiägert)
bleiben offen — welche Kultur auf welchem Schiff steht, kann die App nicht erraten, und
falsch geratene Anbaudaten wären schlimmer als eine offene Stelle.

**Was aus den Daten übrig bleibt.** Die Journal-Altdaten enden am 04.08.2026. Läuft die App
später, sind viele Sektoren rechnerisch stark überfällig. Der Plan arbeitet diesen Rückstand
kapazitätsgerecht ab und zeigt an, wie viele Aufträge zurückgestellt wurden — er versteckt
ihn nicht. Ebenso bleiben die fehlenden Pflanzdaten: ohne Datum schätzt die Engine den
Startpunkt und kennzeichnet den Auftrag als „Fälligkeit geschätzt".

**Was offen bleibt.** Der Rollomat wird weiterhin wie ein Standregner gerechnet — dem Betrieb
ist die richtige Flächenlogik selbst noch unklar (Pflichtenheft §13). „Trüb" liess sich keinem
Plan zuordnen. Und Phase 2 (Login, Google Sheets, echter E-Mail-Versand) ist unverändert
konzipiert, aber nicht gebaut.
