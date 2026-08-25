# Bericht: der Umbau des Datenmodells

> Fünf Phasen, vom Datenaudit bis zur Auswertungsansicht. Dieses Dokument sagt in
> knapper Form, **was falsch war**, **was jetzt stimmt** und **was unsicher bleibt**.
> Die Belege stehen in `docs/datenaudit.md`, `docs/modell.md` und `docs/backtest.md`;
> hier stehen nur die Ergebnisse und die Entscheidungen.

---

## Das Wichtigste in fünf Sätzen

1. Die App rechnete Dauern über **mm/h** — eine Grösse, in der die Fläche schon steckt.
   Aus ihr wieder eine Dauer auf derselben Fläche zu rechnen, kürzt die Fläche heraus.
   Ersetzt durch den **Durchfluss je Sprenkler**: Median-Fehler der Dauerprognose von
   28 auf 12 Minuten, Anteil innerhalb ±30 % von 64 auf 89 %.
2. Die Aufträge wurden **nach Dringlichkeit** sortiert. Der Backtest zeigt, dass das
   **schlechter als Zufall** war — 177 Treffer gegen 262 erwartete. Nach dem Umbau: 398.
3. Die **Auswertungsansicht** war nicht da. Jetzt beantwortet sie sechs Fragen des
   Betriebsleiters, jede Zahl mit Fallzahl und Unsicherheit.
4. Zwei Datenprobleme, die vorher lautlos in jede Zahl liefen, sind jetzt sichtbar:
   **99 % der Flächen sind abgeleitet, nicht gemessen**, und **die hinterlegten Regeln
   beschreiben eine Bewässerung, die der Betrieb nicht fährt** (Median 0,32-faches).
5. Die **Fälligkeitsprognose bleibt schwach** und lässt sich mit den vorhandenen Daten
   auch nicht wesentlich verbessern — die stärksten Treiber stehen nirgends.

---

## Phase 1 · Was in den Daten wirklich steht

1069 Journaleinträge, März bis August 2026, alle aus einem Jahr.

**Was falsch war.** Fehlende Werte wurden behandelt, als wären sie zufällig verteilt.
Sie sind es nicht: das Fehlen der Wassermenge hängt am Standort und am Monat. Ausreisser
wurden nach Bauchgefühl beschnitten, ohne Grenze und ohne Begründung. Der Rollomat lief
als Ausreisserklasse mit, obwohl er eine andere Maschine ist.

**Was jetzt stimmt.** Vollständigkeit je Feld und Monat ist ausgewiesen, das Fehlen ist
als systematisch belegt (Chi², Mann-Whitney). Ausreisser werden über den MAD-Abstand
erkannt und über **physikalische Grenzen** verworfen (0,5–5 m³/h je Sprenkler, 16 von 871
Gängen). Rollomat-Gänge sind eine eigene Kategorie, keine Fehler.

**Was unsicher bleibt.** Ein einziges Jahr. Alles, was hier über Saisonverläufe steht,
beruht auf einer Saison. Ein Trockenjahr sähe anders aus, und wir können nicht sagen,
ob 2026 eines war.

---

## Phase 2 · Acht Hypothesen, geprüft statt geglaubt

**Was falsch war.** Die Modellparameter waren gesetzt, nicht gemessen. Es gab keine
Prüfung, ob die Annahmen der App zu den Daten passen.

**Was jetzt stimmt** — jede Hypothese mit Ergebnis, auch die negativen:

| | Frage | Ergebnis |
|---|---|---|
| H1 | Stimmt die beregnete Fläche als Rechengrösse? | **Nein**, als Rechengrösse aufgegeben |
| H2 | Ist der Durchfluss das bessere Modell? | **Ja**, deutlich (28 → 12 min) |
| H2b | Gibt es eine Sättigung bei vielen Sprenklern? | **Kein Modell schlägt das lineare** |
| H3 | Welche mm-Definition? | Kulturfläche; Verhältnis 1,42, je Feld verschieden |
| H4 | Sind die Referenzwerte überangepasst? | Ja bei dünner Datenlage → Shrinkage, λ = 2,8 |
| H5 | Wie Gruppenmessungen zuordnen? | Unterschied 1,5 % — signifikant, praktisch belanglos |
| H6 | Braucht es eine Zeitgewichtung? | Nein, bringt nichts |
| H7 | Widersprechen die Regeln den Daten? | **Ja**, systematisch |
| H8 | Lässt sich ein Bodenmodell kalibrieren? | **Nein**, die Daten tragen es nicht |

Drei davon sind negative Ergebnisse (H2b, H6, H8) und wurden als solche umgesetzt: die
Engine bekam **keine** Sättigungskurve, **keine** Zeitgewichtung und **kein** Bodenmodell.
Die zugehörigen Parameter wurden wieder aus `data/modell.json` entfernt.

**Ein eigener Fehler, gefunden und korrigiert.** H7 rechnete beobachtete Intervalle
zunächst je **Feld** statt je **Schiff und Kultur** — genau der Fehler, vor dem der
Auftrag gewarnt hatte. Dadurch waren frühere Aussagen im Praxis-Durchgang (Eiägert 4,7×,
Cherwis 4×) falsch. Korrigiert, und die Korrektur steht als Notiz in `docs/modell.md`.

**Was unsicher bleibt.** Die Leitungsgrenze. Über den beobachteten Bereich von 1 bis 60
Sprenklern wächst der Durchfluss praktisch proportional. Eine Grenze existiert
vermutlich — sie liegt nur ausserhalb dessen, was der Betrieb je gefahren hat. Sie gehört
erfragt, nicht als Kurve erfunden.

---

## Phase 3 · Das Datenmodell umgebaut

**Was falsch war.**

- **Zirkuläre Rechnung.** mm/h enthält eine Fläche. Daraus eine Dauer für eine Zielmenge
  auf derselben Fläche zu rechnen, kürzt die Fläche wieder heraus — die Zahl gab vor,
  mehr zu wissen, als sie wusste.
- **Einheiten unbenannt.** Aus einem Feldnamen war nicht ersichtlich, ob Aren oder m²,
  Minuten oder Stunden gemeint waren.
- **Herkunft unsichtbar.** Ein Wert aus 40 Messungen und ein geratener sahen gleich aus.

**Was jetzt stimmt.**

- Die Rechenkette ist **gerichtet und ohne Rückkopplung**:
  `Fläche (m²) → Menge (m³) → Dauer (min)`, über `Engine.gangFuer()`.
- **`U`** ist die einzige Stelle für Einheitenumrechnung, **Feldnamen tragen ihre Einheit**
  als Endung (`…Mm`, `…M3`, `…M2`, `…Aren`, `…Min`, `…M3h`).
- **`W`** trägt jeden Wert samt Herkunft (`messung > schiff > feld > betrieb > annahme >
  keine`), Fallzahl und Streuung. Abgeleitete Werte erben die **schlechteste** Herkunft
  ihrer Bestandteile. Der Wassermann sieht `●●●` bis `○○○` und im Tooltip den Klartext.
- **mm hat zwei Definitionen**, beide sind da und umschaltbar; die Kulturfläche ist der
  Standard, weil die Regel eine Menge auf die Kultur meint.
- Die Modellparameter stehen in `data/modell.json` und werden aus den Daten gefittet.

**Was unsicher bleibt.** Alles, was durch eine Fläche geteilt wird — und das sind alle
mm-Zahlen. Siehe Phase 5.

---

## Phase 4 · Der Backtest, und der unangenehme Befund

Die Engine läuft rollend gegen die Vergangenheit: je Stichtag nur das bis dahin Bekannte,
Prognose für den Folgetag, Vergleich mit der Wirklichkeit. 62 Stichtage, 2619
vorhergesagte Schiff-Tage.

**Was falsch war.** Die Aufträge wurden nach **Dringlichkeit** sortiert — nach dem Defizit
als Vielfaches der Regelmenge. Das klingt richtig und war messbar falsch:

| Sortierung | Treffer von 850 | gegen Zufall in derselben Liste |
|---|---:|---:|
| nach Dringlichkeit | 177 | **0,68×** |
| nach Tagen Überfälligkeit | 165 | 0,63× |
| **heute: gestuft + Rhythmustreue** | **398** | **1,52×** |

Der Grund steckt in einer einzigen Tabelle:

| Dringlichkeit | Aufträge | tatsächlich bewässert |
|---|---:|---:|
| 1,0–1,5 | 399 | **52 %** |
| 1,5–2 | 145 | 44 % |
| 2–3 | 207 | 26 % |
| über 3 | 1594 | **16 %** |

Die Quote **fällt** mit steigendem Rückstand. Ein grosses Defizit zeigt bei diesem Betrieb
keinen grossen Bedarf an, sondern ein Schiff, das aus der Rotation gefallen ist —
abgeräumte Kultur, zu enge Regel, nicht erfasster Gang. Nach Dringlichkeit sortiert stehen
die **Karteileichen oben**, und die echte Arbeit wird durch die Kapazitätsentzerrung nach
hinten geschoben.

**Was jetzt stimmt.** Die Reihenfolge ist gestuft: Priorität, dann plausible Aufträge vor
Rückständen, dann wer am genauesten im eigenen Takt liegt, erst dann das Defizit.
Rückstände ab dem 2,5-fachen heissen in der Oberfläche **Klärfälle** und stehen hinten,
verschwinden aber nicht — sie brauchen eine Entscheidung, keinen Wassergang.

**Ein methodischer Fehler auf dem Weg dahin, der Erwähnung verdient.** Der erste Lauf
verglich die Rangfolge mit blindem Ziehen aus **allen** Schiffen. Das ist der falsche
Gegner: es misst Filter und Rangfolge zusammen. Der richtige Gegner ist blindes Ziehen
**aus der eigenen Fälligkeitsliste** — nur so bleibt der Kandidatenkreis konstant. Mit dem
falschen Massstab sah die verbesserte Engine schlechter aus als sie war, und die
ursprüngliche schlechter als sie war. Beide Zahlen stehen jetzt im Bericht nebeneinander.

**Was jetzt gut ist.** Die Dauerprognose: Median-Fehler 12 Minuten, 90 % innerhalb ±30 %.
Schiffe mit nur 1–3 Gängen liegen dank Shrinkage kaum schlechter als solche mit über 10.

**Was unsicher bleibt — und das ist der ehrliche Kern.** Die **Fälligkeitsprognose**.
Die Fälligkeitsliste reichert nur 1,15-fach an: von allen Schiff-Tagen mit Kultur werden
22 % bewässert, von den als fällig genannten 25 %. Bewässert wird **schubweise** (nach
einem Gang am Vortag 2,3-fach so wahrscheinlich), und die stärksten Treiber dieser
Schübe — **Pflanzdatum/Kulturphase** und **Route/Mannschaft** — stehen nirgends in den
Daten. Solange das so bleibt, ist hier keine wesentliche Verbesserung zu erwarten. Das ist
keine Frage besserer Statistik, sondern fehlender Eingaben.

---

## Phase 5 · Die Auswertung

**Was falsch war.** Es gab keine. Der Betriebsleiter konnte die 1069 Einträge sehen, aber
keine Frage an sie stellen.

**Was jetzt stimmt.** Ein Reiter „Auswertung", umschaltbar zwischen Saison, letzten 30
Tagen und ganzem Journal, mit sechs Abschnitten: Überblick, Wasser je Kultur, Regel gegen
Wirklichkeit, je Standort, Flächen ohne Historie, Datenqualität. **Jede Kennzahl trägt
ihre Fallzahl**, jeder Median seine Unsicherheit (`1,2533·σ̂/√n` mit `σ̂ = 1,4826·MAD`)
oder ein `±?`, wenn n < 5. Ein siebter Abschnitt heisst „Was hier nicht steht" und
schreibt die Grenzen aus.

**Zwei Rechenfehler dabei gefunden — in der ersten Fassung dieser Ansicht selbst:**

1. **mm wurde über Einträge summiert, die verschiedene Schiffe betreffen.** mm ist eine
   Grösse je Fläche: bekommt jedes von vier Schiffen an seinem eigenen Tag 20 mm, dann hat
   jedes 20 mm in vier Tagen bekommen — nicht das Feld 80 mm. Das vervierfachte das Ist.
   Jetzt wird je Schiff gerechnet, danach der Median über die Schiffe, plus die Spanne vom
   10. bis zum 90. Prozentwert.
2. **27 Journaleinträge nennen zu wenige Schiffe für ihre Sprenklerzahl.** Ein Eintrag
   führt 37 Kreisregner auf einem Schiff von 39 Aren — daraus wurden 119 mm in einem
   einzigen Gang. Neu prüft `Engine.deckungVon()` das Verhältnis von beregneter zu
   genannter Fläche; über 2,5 liefert ein Eintrag keine mm-Zahl mehr, seine gemessene
   Menge zählt weiter. Die Schwelle ist aus der Verteilung begründet (Median 0,71,
   p95 1,82, Maximum 4,65) und ihre Unempfindlichkeit ist geprüft.

**Zwei Befunde, die die Ansicht sichtbar macht:**

- **Nur 5 von 164 Schiffen haben eine eigene Flächenangabe** — 104 von 7534 Aren. Alles
  übrige wird aus der Feldfläche über die Zeichnung verteilt. Das steht als Warnung über
  der ganzen Auswertung, nicht in einer Fussnote, weil alles darunter durch eine Fläche
  teilt.
- **8 von 10 auswertbaren Kombinationen aus Feld und Kultur bekommen unter 80 % ihrer
  Regelmenge, im Median das 0,32-fache.** Das schliesst den Kreis zu Phase 4: wenn die
  Regeln durchgängig mehr versprechen, als der Betrieb fährt, wächst überall dauerhaft ein
  Defizit, das nie abgebaut wird — und genau davon lebte die kaputte Sortierung. Jede
  Zeile schlägt die beobachtete Regel vor und verlinkt in den Regel-Editor.

---

## Was die App jetzt behaupten darf, und was nicht

**Belastbar.** Dauer, Menge, Sprenklerzahl und m³ je Gang. Median-Fehler 12 Minuten, 90 %
innerhalb ±30 %, mit Herkunftsangabe daneben. Der Wassermann darf das ablesen.

**Mit Vorbehalt.** Die Reihenfolge des Tagesplans. Messbar besser als Zufall (1,52×) und
deutlich besser als jede triviale Regel (3,04×), aber sie trifft rund die Hälfte. Der
Tagesplan ist ein **Vorschlag**, keine Disposition — und die Oberfläche sagt das auch so.

**Nicht belastbar.** „Dieses Schiff ist heute fällig" für ein einzelnes Schiff ohne
Prüfung. Als Klärfall markierte Aufträge sind fast immer ein Datenproblem, kein
Wasserbedarf.

**Gar nicht behauptet.** Bodenfeuchte, Verdunstung, Ertragswirkung. Für nichts davon
tragen die Daten ein Modell, und keine dieser Grössen steht in der App.

---

## Was sich lohnen würde, in dieser Reihenfolge

1. **Flächen je Schiff eintragen.** Grösste Wirkung, kleinster Modellaufwand — alle
   mm-Zahlen werden dadurch belastbar statt plausibel.
2. **Überdachung erfassen.** Ein Häkchen je Feld. Verhindert den einzigen Fall, in dem
   eine falsche Annahme Schaden anrichten kann: einen Tunnel wegen Regen nicht bewässern.
3. **Pflanzdaten erfassen.** Die einzige realistische Aussicht darauf, die
   Fälligkeitsprognose spürbar zu verbessern. Die Regeln haben das Feld dafür bereits.
4. **Regeln an die Wirklichkeit angleichen** — oder feststellen, dass Kapazität fehlt.
   Die Auswertung liefert je Zeile den Vorschlag.
5. **Fehlende Schiffnummern in 27 Journaleinträgen nachtragen.** Holt die grösste Fläche
   des Betriebs in die Auswertung zurück.

Die dazugehörigen Fragen stehen ausformuliert in `docs/offene-fragen.md`.

---

## Wie geprüft wird, dass das so bleibt

```
node tools/regression.js      # 36 Prüfungen, Pflichtlauf nach jeder Änderung
node tools/backtest.js --md   # rollende Prüfung gegen die Vergangenheit
```

Die Regression liest die Backtest-Kennzahlen aus `tools/_backtest.json` und schlägt an,
wenn die Reihenfolge wieder unter den Zufall in der eigenen Liste fällt, wenn die
Dauerprognose unter 85 % innerhalb ±30 % rutscht, wenn die Auswertung mm wieder über
Schiffe hinweg summiert oder wenn die Deckungsschwelle in den gesunden Teil der
Verteilung wandert. **Jeder Befund dieses Berichts hat einen Test, der ihn festhält.**

Dass diese Tests auch wirklich greifen, ist nicht behauptet, sondern geprüft: die beiden
wichtigsten wurden durch **Mutation** verifiziert — der jeweilige Fehler wurde absichtlich
wieder eingebaut, der Test schlug an, danach wurde zurückgenommen.

| Wieder eingebauter Fehler | Reaktion |
|---|---|
| mm über Schiffe hinweg summieren | ✗ „Soll-Ist rechnet je Schiff" — Ansicht 35,2 statt 2,3 mm/Tag |
| Stufung aus `Engine.reihung` entfernen | ✗ „Rückstände sind markiert und stehen hinten" |

Ein Test, der nie fehlschlägt, prüft nichts.
