# Prompt: Datenmodell und Auswertung auf ein belastbares Fundament stellen

> Diesen Text als Prompt einfügen. Er ist selbsttragend — der ausführende Agent
> braucht keinen weiteren Kontext ausser dem Repository.

---

Du übernimmst das Projekt **Wasserplan** als Data Engineer und angewandter Statistiker.

Die App plant die Bewässerung eines Bio-Gemüsebaubetriebs (29 Standorte, 49 Felder,
164 Schiffe) und lernt dabei aus 1069 historischen Journaleinträgen. Sie ist
funktional fehlerfrei — eine vorangegangene Runde hat 69 Bugs behoben, dokumentiert in
`docs/BEFUNDE.md`. **Was jetzt zu prüfen ist, ist nicht der Code, sondern das Modell
dahinter:** ob die Datenstruktur die Wirklichkeit sinnvoll abbildet, ob die Statistik
korrekt ist, und ob die Auswertung Aussagen produziert, auf die man sich verlassen kann.

Mein Verdacht ist, dass an mehreren Stellen Zahlen entstehen, die *plausibel aussehen,
aber nicht gedeckt sind*. Deine Aufgabe ist, das systematisch herauszufinden und zu
reparieren. Nicht durch Umschreiben nach Gefühl, sondern durch Messen.

## Was da ist

```
src/          Quellcode in Modulen (Vanilla-JS, kein Framework)
  04_core.js    Store, Datenmodell, Migration, Hilfsfunktionen
  05_engine.js  Referenzwerte, Wasserbilanz, Tagesplanung  ← das Herzstück
data/         Startdaten: katalog, journal (1069 Einträge), kulturen, regeln, gruppen
tools/        Playwright-Skripte; tools/regression.js muss grün bleiben
docs/         BEFUNDE.md · praxis-durchgang.html · entwicklerhandbuch.md · pflichtenheft.md
assemble.py   baut build/wasserplan.html aus src/ + data/
```

**Lies zuerst `docs/entwicklerhandbuch.md` (§4 Datenmodell, §5 Engine),
`docs/praxis-durchgang.html` (Abschnitt C, die drei Modellfragen) und
`docs/pflichtenheft.md` (§9, §10).** Danach `src/05_engine.js` vollständig.

**Werkzeug:** Der Container hat **kein numpy, scipy, pandas oder statsmodels**. Prüfe, ob
`pip install numpy` funktioniert; wenn nicht, schreibe die Statistik in reinem Python —
Median, MAD, gewichtete Regression, Bootstrap-Konfidenzintervalle und Kreuzvalidierung
sind alle in wenigen Dutzend Zeilen implementierbar. Node/Playwright ist verfügbar
(`npm install playwright --no-save`, Chromium unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--no-sandbox`).

## Arbeitsweise — nicht verhandelbar

1. **Messen vor Bauen.** Keine Modelländerung ohne vorherige Auswertung an den echten
   Daten. Jede Zahl, die du in den Code schreibst, muss aus einem Skript in `tools/`
   stammen, das reproduzierbar durchläuft.
2. **Kein geratener Parameter.** Wenn ein Wert nicht aus den Daten schätzbar ist, wird er
   nicht erfunden — er kommt auf die Liste der offenen Fachfragen (siehe Lieferergebnis).
3. **Jede abgeleitete Grösse trägt ihre Herkunft und ihre Unsicherheit.** Ein Referenzwert
   aus 46 Beobachtungen und einer aus 2 dürfen im Datenmodell nicht gleich aussehen.
4. **Negative Ergebnisse sind Ergebnisse.** Wenn eine Kalibrierung zeigt, dass ein Modell
   nicht trägt, schreibst du das hin, statt es zu glätten. Wenn ein bestehender Ansatz sich
   als richtig erweist, lässt du ihn stehen und belegst warum.
5. **Nichts kaputt machen.** `node tools/regression.js` (21 Prüfungen) muss nach jeder
   Etappe grün sein, die Browserkonsole fehlerfrei. Die App muss offline per `file://`
   laufen, ohne externe Abhängigkeiten.
6. **Auf Deutsch dokumentieren**, „du"-Form, Schweizer Rechtschreibung (ss statt ß).

---

## Phase 1 — Datenaudit: was steht wirklich in den 1069 Einträgen?

Schreibe `tools/audit.py` (oder `.js`), das die Rohdaten charakterisiert und einen
Bericht nach `docs/datenaudit.md` schreibt. Prüfe mindestens:

- **Vollständigkeit je Feld** des Journaleintrags: wie viele Einträge haben `m3`,
  `dauerMin`, `kreisregner`, `sektorregner`, zuordenbare `schiffe`. Welche Kombinationen
  fehlen gemeinsam?
- **Ist das Fehlen zufällig?** Vergleiche die Verteilung von Dauer, Datum und Feld zwischen
  vollständigen und unvollständigen Einträgen. Wenn Einträge ohne `m3` systematisch die
  langen oder die eines bestimmten Standorts sind, verzerrt jedes Wegfiltern die
  Referenzwerte. Benenne den Mechanismus (zufällig / abhängig von Beobachtetem /
  abhängig von Unbeobachtetem) und leite daraus ab, wie damit umzugehen ist.
- **Duplikate**: gleicher Tag, gleiches Feld, gleiche Schiffe, überlappende Zeiten.
- **Physikalische Plausibilität** je Eintrag: Durchfluss m³/h, mm/h, mm je Gang,
  Dauer. Grenzen aus der Physik begründen, nicht aus dem Bauchgefühl.
- **Ausreisser robust** (MAD-basiert, nicht per fixem Schwellenwert wie dem aktuellen
  `mmH > 40`). Wie viel Prozent der Daten fällt weg, und ändert sich das Ergebnis, wenn
  man sie behält?
- **Zeitliche Abdeckung**: Einträge je Woche, Lücken, Saisonverlauf, letzter Eintrag.
- **Abdeckung je Analyseeinheit**: für wie viele Schiffe / Feld-Kultur-Kombinationen gibt es
  überhaupt genug Beobachtungen für eine belastbare Schätzung? Definiere „genug" begründet.

## Phase 2 — Modellkalibrierung: stimmen die Annahmen?

Der Kern der App ist eine Kette:
`m³ + Dauer + Regnerzahl → mm → mm/h → empfohlene Dauer für Zielmenge`.
Diese Kette enthält **drei nie gefittete Parameter** (`sprenkler.breite = 18`,
`abstandKreis = 23`, `abstandSektor = 11.5`) und eine implizite Modellannahme über die
beregnete Fläche. Prüfe mindestens diese Hypothesen — jede mit Zahl, Streuung und Urteil:

**H1 — Die beregnete Fläche stimmt.** Vergleiche `Regnerzahl × Wurfweite` gegen die
Schiffflächen. Ein sauberes Modell landet im Median bei einem Deckungsgrad von 1,0.
(Vorbefund: Median 0,71, 10.–90.-Perzentil 0,43–1,55.) Falls die Parameter nicht tragen:
schätze sie aus den Daten (z. B. so, dass der Deckungsgrad zentriert wird) und quantifiziere,
wie viel Streuung übrig bleibt.

**H2 — Die richtige Messgrösse ist der Durchfluss, nicht mm/h.** `mm/h` ist eine dreifach
abgeleitete Grösse (aus m³, Zeit und einer Flächenannahme) und erbt die Fehler aller drei.
Gemessen werden nur **m³ und Minuten**. Modelliere den Durchfluss `Q [m³/h]` direkt als
Funktion der Regnerzahl (und was sich sonst als erklärend erweist: Standort, Feld,
Gruppengrösse, Jahreszeit). Berichte Bestimmtheitsmass, Residuenstruktur und
Vorhersagefehler. Vergleiche die Dauerprognose aus diesem Weg gegen die bestehende.
(Vorbefund: Durchfluss je Sprenkler fällt von 2,69 auf 1,78 m³/h bei steigender Anzahl —
ein Druckabfall, der modellierbar und aktuell unmodelliert ist.)

**H3 — Zwei mm-Definitionen, eine Entscheidung.** `mm = m³/beregnete Fläche` (heute,
Median 14,2) gegen `mm = m³/Kulturfläche` (Median 9,8). Rechne beide durch, zeige die
Konsequenz für Regeln, Referenzwerte und Planung, und **implementiere beide als
umschaltbare Definition** mit einer klaren Vorgabe. Der Betrieb muss die Wahl treffen
können, ohne dass jemand Daten neu erfasst.

**H4 — Referenzwerte sind überangepasst.** Aktuell: Median der letzten 8 Beobachtungen je
Schiff, ohne Berücksichtigung von n. Ein Schiff mit 2 Beobachtungen bekommt einen
Referenzwert mit derselben Autorität wie eines mit 46. Ersetze das durch **Shrinkage**
(Schiff → Feld → Betrieb, Gewicht abhängig von n und Streuung; Empirical Bayes oder
James-Stein, in reinem Python implementierbar). Zeige an einer Kreuzvalidierung, dass der
Vorhersagefehler sinkt.

**H5 — Die Zuordnung von Gruppenmessungen auf Schiffe ist falsch.** Ein Eintrag über drei
Schiffe erzeugt heute drei identische Schiffwerte. Das ist keine Messung, das ist eine
Vervielfältigung. Prüfe die Alternativen (proportionale Zuteilung nach Fläche; oder die
Gruppe als Beobachtungseinheit behalten und Schiffeffekte in einem gemischten Modell
schätzen) und wähle begründet.

**H6 — Die Zeitgewichtung fehlt.** „Die letzten 8" behandelt März wie August, obwohl sich
Kultur, Bestandeshöhe und Verdunstung ändern. Prüfe exponentielle Gewichtung und/oder eine
explizite Saisonkomponente gegen die ungewichtete Variante.

**H7 — Die Regeln widersprechen den Daten.** Vergleiche für jede Feld-Kultur-Kombination den
hinterlegten Rhythmus mit dem beobachteten Abstand *je Schiff* (nicht je Feld — sonst
mischst du verschiedene Schiffe zu einem Scheinintervall). Wo die Abweichung gross ist,
liefere einen datenbasierten Vorschlagswert samt Verlässlichkeitsmass.
(Vorbefund: Eiägert 4 — Regel 7 Tage, beobachtet 1,5 Tage über 31 Gänge.)

**H8 — Die Wasserbilanz ignoriert den Boden.** Regen baut Defizit eins zu eins ab, ohne
Feldkapazität und ohne Abfluss. 50 mm Regen auf einen gesättigten Boden bauen kein
50-mm-Defizit ab. Prüfe, ob ein einfaches Bucket-Modell (nutzbare Feldkapazität je Boden,
Überlauf verworfen) mit den vorhandenen Daten überhaupt kalibrierbar ist — falls nicht,
sag das und liste, welche Angabe dafür fehlt.

## Phase 3 — Datenmodell: Herkunft und Unsicherheit sichtbar machen

Das aktuelle Modell speichert nackte Zahlen. `aren: 10` steht gleichberechtigt neben einer
aus einem groben Rechteck abgeleiteten Fläche; `letzteBewaesserung` kann aus dem Journal
(Messung), aus dem Pflanzdatum (Annahme) oder aus einem Fallback (geraten) stammen.

Baue das um, sodass **jede abgeleitete Grösse ihre Herkunft und ihre Unsicherheit trägt**.
Ein einheitliches, kleines Format, konsequent angewandt — etwa `{wert, quelle, n, sd}` oder
`{wert, quelle, intervall:[unten, oben]}`. Anforderungen:

- Die Herkunft ist **propagiert**: was aus einer Schätzung gerechnet wird, ist eine Schätzung.
- Die Unsicherheit **erreicht die Oberfläche**. „2 h 34" ist eine Behauptung; „2 h 34,
  ± 25 min, aus 6 Gängen" ist eine Aussage. Der Wassermann bekommt die kurze Form
  (Zahl plus Verlässlichkeitszeichen), der Produktionsleiter die lange.
- **Einheiten werden geprüft.** mm, m³, m², Aren, Minuten, Stunden liegen heute als nackte
  Zahlen nebeneinander; ein Faktor-1000-Fehler zwischen m³ und Litern ist jederzeit möglich.
  Führe eine Konvention ein, die das strukturell verhindert (Suffix im Feldnamen und eine
  zentrale Umrechnung), und dokumentiere sie als Invariante im Handbuch.
- **Migration**: bestehende Exportdateien müssen weiter ladbar sein (`Store.migriere`).

## Phase 4 — Backtest: hat das Modell je gestimmt?

Das ist die eigentliche Lücke. Die App hat **kein Mass für ihre eigene Güte**.

Baue `tools/backtest.js`, das die Engine gegen die Vergangenheit laufen lässt: Journal bis
zum Stichtag T einspeisen, Plan für T+1 rechnen, mit dem vergleichen, was tatsächlich
passiert ist. Über den gesamten Zeitraum rollend. Berichte:

- **Fälligkeitsprognose**: Trefferquote und Verpassquote — an wie vielen Tagen hat die
  Engine ein Schiff eingeplant, das auch bewässert wurde, und umgekehrt. Gegen eine
  triviale Vergleichsbasis („immer der historische Median-Abstand") — schlägt das Modell
  sie überhaupt?
- **Dauerprognose**: mittlerer absoluter Fehler in Minuten, aufgeschlüsselt nach
  Datenlage des Schiffs (viel / wenig / keine Historie).
- **Mengenprognose**: Abweichung der vorhergesagten von der tatsächlich ausgebrachten Menge.
- **Wo das Modell am meisten danebenliegt**: nach Feld, Kultur, Monat, Gruppengrösse.
  Das ist die Liste, an der die nächste Verbesserung ansetzt.

Der Backtest wird Teil der Testsuite: `tools/regression.js` prüft, dass die Kennzahlen sich
nicht verschlechtern.

## Phase 5 — Auswertung, die etwas wert ist

Der Journal-Reiter ist heute eine Tabelle. Der Betrieb kann daraus nichts ableiten. Baue
eine Auswertung, die Fragen beantwortet, die ein Betriebsleiter tatsächlich hat — jede
Kennzahl mit ihrer Unsicherheit und ihrer Datengrundlage, keine ohne:

- Wasserverbrauch je Kultur, je Are, je Saison — und wo er auffällig ist
- Welche Flächen bekommen systematisch mehr oder weniger als ihre Regel vorsieht
- Wie viel Wasser hat der Regen ersetzt
- Wie verlässlich ist die Dauerprognose je Standort (aus dem Backtest)
- Welche Flächen haben zu wenig Historie für belastbare Aussagen — und was müsste
  erfasst werden, damit sie belastbar werden
- Ein Datenqualitäts-Überblick: Vollständigkeit, Duplikate, verworfene Ausreisser

**Für Diagramme zuerst die `dataviz`-Skill laden.** Keine Zahl ohne Bezugsgrösse, keine
Aggregation ohne n.

---

## Abnahmekriterien

Die Arbeit ist fertig, wenn all das gilt und belegt ist:

1. `docs/datenaudit.md` beschreibt die Datenlage vollständig, inklusive Fehlmechanismus
   und Ausreisserbehandlung.
2. `docs/modell.md` dokumentiert jede der Hypothesen H1–H8 mit Messergebnis, Entscheidung
   und Begründung. Verworfene Ansätze stehen mit drin.
3. **Kein Parameter im Code ist ungefittet oder unbegründet.** Für jeden gilt: aus den Daten
   geschätzt (mit Skript und Konfidenzintervall) oder als Betriebsvorgabe dokumentiert
   und in den Einstellungen sichtbar.
4. Jede abgeleitete Zahl im Datenmodell trägt Herkunft und Unsicherheit, und beides
   erreicht die Oberfläche.
5. `tools/backtest.js` läuft und zeigt, dass das neue Modell die triviale Vergleichsbasis
   schlägt — oder dokumentiert ehrlich, dass es das (noch) nicht tut.
6. `node tools/regression.js` grün, Konsole fehlerfrei, App läuft offline per `file://`.
7. `docs/entwicklerhandbuch.md` ist nachgeführt: neues Datenmodell, neue Invarianten,
   wie man den Backtest laufen lässt.

## Verboten

- Parameter raten, runden oder „plausibel setzen", ohne es als Annahme zu kennzeichnen
- Ausreisser mit festen Schwellenwerten wegwerfen, ohne die Wirkung zu zeigen
- Kennzahlen ohne Bezugsgrösse und ohne n ausgeben
- Ein Modell verkomplizieren, ohne dass der Backtest die Verbesserung zeigt
- Ergebnisse schönreden. Wenn die Datenlage eine Aussage nicht trägt, ist genau das
  das Ergebnis.

## Lieferergebnis

1. Die Analyse- und Testskripte in `tools/`, reproduzierbar
2. Die drei Dokumente `docs/datenaudit.md`, `docs/modell.md`, nachgeführtes Handbuch
3. Der umgebaute Code, gebaut und getestet, in sauberen Commits je Phase
4. **Eine Liste offener Fachfragen an den Betrieb** — alles, was die Daten nicht hergeben
   und wo geraten worden wäre. Jede Frage mit dem, was von der Antwort abhängt, und
   deinem Vorschlag für den Fall, dass keine Antwort kommt.
5. Ein kurzer Bericht: was war falsch, was ist jetzt richtig, was bleibt unsicher.

Beginne mit Phase 1 und zeige mir das Datenaudit, bevor du das Modell anfasst.
