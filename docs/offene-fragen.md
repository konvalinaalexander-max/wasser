# Offene Fragen an den Betrieb

> Jede Frage hier kommt aus einem konkreten Befund in den Daten, nicht aus einer
> Checkliste. Darum steht bei jeder, **was gefunden wurde**, **warum es zählt** und
> **was sich ändert**, wenn die Frage beantwortet ist. Wo eine Antwort nichts ändern
> würde, steht die Frage nicht drin.
>
> Reihenfolge nach Wirkung. Die ersten drei sind die wichtigen.

---

## 1. Können die Schiffe eine eigene Flächenangabe bekommen?

**Gefunden.** 5 von 164 Schiffen haben eine eingetragene Fläche — 104 von rund 7534 Aren,
also 1 %. Bei allen anderen verteilt die App die Feldfläche über die gezeichneten Schiffe.

**Warum es zählt.** Jede mm-Zahl und jedes m³ je Are teilt durch diese Fläche. Im
Betriebsschnitt stimmen die Summen; für ein einzelnes Schiff ist die Zahl aber nur so
genau wie die Zeichnung seines Feldes. Von den Feldern sind mehrere ausdrücklich als
`unsicher` markiert.

**Was sich ändert.** Die Zielmengen und Dauern je Schiff werden belastbar statt
plausibel. Das ist die wirksamste einzelne Verbesserung an diesen Daten — grösser als
jede Modelländerung, die wir noch machen könnten.

**Konkret gefragt:** Gibt es Flächenangaben je Schiff irgendwo — Pachtvertrag,
Anbauplanung, GIS, Direktzahlungsformular? Oder liesse sich Länge × Breite je Schiff
einmal abschreiten? Eine Zahl je Schiff genügt, die App rechnet den Rest.

---

## 2. Welche Flächen sind überdacht?

**Gefunden.** In den Daten gibt es kein Feld dafür. Die App verrechnet Regen auf allen
Flächen gleich und schlägt vor, einen Auftrag zu kürzen oder zu streichen, wenn genug
geregnet hat.

**Warum es zählt.** In einem Tunnel kommt kein Regen an. Wenn die App dort einen Gang
wegen Regen streicht, trocknet die Kultur aus. Das ist der einzige Punkt in dieser
Auswertung, an dem eine falsche Annahme **direkten Schaden** anrichten kann.

**Was sich ändert.** Ein Häkchen „überdacht" je Feld oder Schiff, und die Regenlogik
überspringt diese Flächen. Aufwand: klein. Wirkung: verhindert einen echten Fehler.

**Konkret gefragt:** Welche Standorte oder Felder stehen unter Folie oder Glas? Und
gibt es Zwischenformen — Vlies, Netz —, bei denen ein Teil des Regens ankommt?

---

## 3. Sind die hinterlegten Regeln Anspruch oder Beschreibung?

**Gefunden.** 8 von 10 auswertbaren Kombinationen aus Feld und Kultur bekommen unter 80 %
ihrer Regelmenge, im Median das **0,32-fache**. Nur eine einzige Kombination
(Abag Luchs · Schnittlauch, 1,12) läuft ungefähr nach Regel.

| Fläche · Kultur | Regel | Soll mm/Tag | Ist mm/Tag | Ist ÷ Soll |
|---|---|---:|---:|---:|
| Abag Luchs · Schnittlauch | 1× am Tag · 15 mm | 15,0 | 16,9 | 1,12 |
| Förliwiesen Weber · Salat | 4× pro Woche · 15 mm | 8,6 | 7,9 | 0,92 |
| Bachofen · Fenchel | 4× pro Woche · 15 mm | 8,6 | 6,1 | 0,71 |
| Cherwis · Fenchel | 1× am Tag · 10 mm | 10,0 | 3,4 | 0,34 |
| Schützenhaus · Fenchel | 4× pro Woche · 15 mm | 8,6 | 2,5 | 0,29 |
| Cherwis · Salat | 1× am Tag · 15 mm | 15,0 | 2,3 | 0,15 |
| Eiägert · Kabis | 1× pro Woche · 30 mm | 4,3 | 0,5 | 0,11 |

**Warum es zählt.** Das erklärt das schwächste Ergebnis der ganzen Prüfung. Wenn die
Regeln durchgängig mehr versprechen, als der Betrieb fährt, dann wächst bei fast jedem
Sektor dauernd ein Defizit, das nie abgebaut wird. Die Fälligkeitsliste wird dadurch lang
und nichtssagend — und die Rangfolge nach Defizit war messbar schlechter als Zufall.

**Was sich ändert.** Sind die Regeln der agronomische Anspruch, dann fehlt dem Betrieb
Kapazität, und das ist eine Investitionsfrage, keine Softwarefrage. Beschreiben sie
dagegen die Praxis falsch, gehören sie angeglichen — die Auswertung schlägt je Zeile die
beobachtete Regel vor („alle 2 Tage · 6 mm") und verlinkt in den Regel-Editor.

**Konkret gefragt, für jede Zeile oben:** Ist das zu wenig Wasser, oder ist die Regel zu
grosszügig aufgeschrieben? Bei Cherwis · Salat: 15 mm täglich gegen tatsächlich 2,3 —
war das ein Trockenjahr, ein Kapazitätsproblem, oder war die Regel nie so gemeint?

---

## 4. Wenn 37 Sprenkler laufen — welche Schiffe hängen dann dran?

**Gefunden.** 27 Journaleinträge nennen für ihre Sprenklerzahl zu wenige Schiffe. Ein
Beispiel: Cherwis, 8. Juli, **Schiff 3, 37 Kreisregner, 465 m³**. 37 Kreisregner belegen
rund 15 300 m²; Schiff 3 hat rund 3 900 m². Rechnerisch ergäbe das 119 mm in einem Gang.
Betroffen sind vor allem Cherwis (25 Einträge), dazu Au Landi und Förliwiesen Schopf.

**Warum es zählt.** Solche Einträge liefern derzeit keine mm-Zahl (sie sind markiert und
ausgenommen), sonst würden sie jede Auswertung verzerren. Ihre Menge zählt weiter.

**Was sich ändert.** Werden die fehlenden Schiffnummern nachgetragen, kommen 27 Gänge —
und mit ihnen die grösste Fläche des Betriebs — in die Auswertung zurück.

**Konkret gefragt:** Bei so einem grossen Gang: wurde tatsächlich das ganze Feld bewässert
und nur ein Schiff notiert? Oder standen die Sprenkler enger, als die Einstellung
`18 m Breite / 23 m Abstand` annimmt?

---

## 5. Stimmen die Sprenkler-Abstände?

**Gefunden.** Die App rechnet mit `Breite 18 m`, `Abstand Kreisregner 23 m`,
`Abstand Sektorregner 11,5 m`. Woher diese Zahlen ursprünglich stammen, ist nicht
dokumentiert. Der gefittete Durchfluss liegt bei 1,85 m³/h je Kreisregner und
2,20 m³/h je Sektorregner.

**Warum es zählt.** Die Abstände bestimmen die „beregnete Fläche" — die alte
Betriebsformel für mm und die Grundlage der Prüfung aus Frage 4.

**Was sich ändert.** Wenig am Tagesbetrieb (die Engine rechnet inzwischen über den
Durchfluss, nicht über die Abstände), aber die Plausibilitätsprüfung wird schärfer.

**Konkret gefragt:** Sind 18 m und 23 m gemessen oder geschätzt? Und sind sie überall
gleich, oder steht Cherwis anders als Schützenhaus?

---

## 6. Wie rechnet der Rollomat?

**Gefunden.** Gänge mit „Rolo" im Text werden aus allen Modellrechnungen ausgeschlossen —
die Technik ist eine andere, und im Handbuch steht seit Längerem, dem Betrieb sei die
Rechnung selbst unklar.

**Warum es zählt.** Winkler und Uster Slowgrow laufen darüber. Für diese Flächen kann die
App derzeit weder Dauer noch Menge vorschlagen.

**Konkret gefragt:** Was ist beim Rollomat die Stellgrösse — Vorschubgeschwindigkeit,
Druck, Anzahl Durchgänge? Und was steht auf dem Gerät ab Werk als Wassermenge?

---

## 7. Was misst die Wasseruhr genau?

**Gefunden.** 84 % der Einträge tragen eine Menge in m³, meist als Differenz aus
`startM3` und `stopM3`. 16 von 871 auswertbaren Gängen ergeben einen physikalisch
unmöglichen Durchfluss (unter 0,5 oder über 5 m³/h je Sprenkler).

**Warum es zählt.** Die 16 sind vermutlich Tippfehler bei Zähler, Dauer oder
Sprenklerzahl. Sie sind ausgeschlossen, aber es wäre gut zu wissen, wo sie entstehen.

**Konkret gefragt:** Gibt es je Standort eine eigene Uhr, oder eine gemeinsame? Wird
vor und nach jedem Gang abgelesen, oder einmal am Tag? Und läuft über dieselbe Uhr noch
etwas anderes — Waschplatz, Tränke, Gebäude?

---

## 8. Wann ist eine Kultur abgeräumt?

**Gefunden.** Das Journal kennt kein Enddatum. Ein Sektor behält seine Kultur, bis eine
andere eingetragen wird. In der Auswertung schlägt sich das als Aufträge nieder, die weit
über ihrer Regel liegen und trotzdem nie bewässert werden — in der Historie werden Schiffe
mit mehr als dem 3-fachen Rückstand nur in 16 % der Fälle bewässert, solche im Takt in 52 %.

**Warum es zählt.** Diese Aufträge blockieren die Liste. Die App markiert sie inzwischen
als **Klärfälle** und stellt sie hinten an, aber sie verschwinden erst, wenn jemand die
Kultur beendet.

**Konkret gefragt:** Soll die App nach der Ernte fragen („steht auf Eichhof 2 noch
Salat?"), oder soll ein Sektor nach einer einstellbaren Zeit ohne Wasser automatisch als
leer gelten? Und wie lange ist diese Zeit im Betrieb üblicherweise?

---

## 9. Können Pflanzdaten erfasst werden?

**Gefunden.** Bewässert wird schubweise: nach einem Gang am Vortag ist ein Schiff
**2,3-fach** so wahrscheinlich wieder dran. Das Modell kennt diesen Rhythmus nicht — es
rechnet eine gleichmässige Wasserbilanz je Sektor.

**Warum es zählt.** Der stärkste Treiber solcher Schübe im Gartenbau ist das Anwachsen
nach dem Pflanzen: erst täglich wenig, dann seltener mehr. Die App hat dafür bereits ein
Feld (`phasen` in der Regel, gemessen ab Pflanzdatum), aber es steht kein Datum drin.

**Was sich ändert.** Das ist die grösste noch offene Modellverbesserung. Ohne Pflanzdatum
ist bei der Fälligkeitsprognose keine wesentliche Verbesserung zu erwarten — mit einem
Datum je Sektor wird die Anwachsphase planbar.

**Konkret gefragt:** Gibt es die Pflanztermine irgendwo (Anbauplan, Bestellung,
Kalender)? Und wäre es zumutbar, sie beim Setzen der Kultur mitzuerfassen — ein Feld,
ein Datum?

---

## 10. Was entscheidet tatsächlich über den Tagesablauf?

**Gefunden.** Die Engine sagt für den Folgetag voraus, welche Schiffe drankommen. Ihre
Trefferrate liegt bei 25 %, die Grundrate bei 22 % — sie reichert also kaum an. Die
Rangfolge ist mit 47 % deutlich besser als Zufall (31 %), aber trifft eben rund die Hälfte.

**Warum es zählt.** Wasserbedarf ist offensichtlich nicht der einzige Grund, aus dem ein
Schiff drankommt. Route, Mannschaft, Erntetermine, Pumpenkapazität, Wetterfenster — nichts
davon steht in den Daten.

**Konkret gefragt:** Wenn morgens entschieden wird, wo bewässert wird — was gibt den
Ausschlag? Wird eine feste Route abgefahren? Hängt es daran, wo ohnehin geerntet wird?
Wie viele Standorte schafft eine Person an einem Tag realistisch, und arbeiten mehrere
gleichzeitig?

Je nach Antwort ist der Tagesplan als **Vorschlagsliste** richtig aufgehängt — oder er
müsste Routen kennen, und dann bräuchte er eine ganz andere Eingabe.

---

## 11. Kleinigkeiten, die schnell erledigt sind

- **Journalname „Trüb"** — 5 Einträge, die auf kein Feld zeigen. Welches Feld ist gemeint,
  oder ist die Fläche aufgegeben?
- **42 Kombinationen aus Feld und Kultur haben keine Regel.** Ohne Regel plant die App sie
  nicht — sie fallen lautlos aus dem Tagesplan. Betroffen unter anderem Abag Luchs ·
  Fenchel, Adlisberg Slowgrow · Kürbis, Au Landi · Karotten.
- **15 Schiffe haben gar keine Fläche** (auch keine abgeleitete), weil ihrem Feld die
  Gesamtfläche fehlt. Für sie lässt sich weder mm noch Dauer rechnen.
- **90 von 164 Schiffen** tauchen in dieser Saison in keinem einzigen Journaleintrag auf —
  zusammen rund 4500 Aren. Werden sie nicht bewässert, sind sie verpachtet, oder wird dort
  nur nichts aufgeschrieben?
- **Wetterstationen:** es gibt drei, aber keiner ist bisher ein Standort zugeordnet.
  Solange das so ist, verrechnet die App keinen Regen.
- **Cherwis · Karotten steht mit „2× am Tag · 5 mm"** in den Regeln. Wird dort wirklich
  zweimal täglich bewässert, oder ist das ein Übertragungsfehler?

---

---

## Stand: was die App inzwischen dafür bereithält

Die Fragen stehen weiterhin offen — beantworten kann sie nur der Betrieb. Die App wartet
aber nicht mehr auf sie, sondern hat für jede eine Stelle, an der die Antwort eingetragen
wird:

| Frage | Wo es jetzt erfasst wird |
|---|---|
| 1 · Flächen je Schiff | **Standorte → Feld → Schiffe**: Spalte „Herkunft" zeigt, was eingetragen und was abgeleitet ist; eine Kontrollzeile rechnet gegen die Feldfläche. Übersicht über alle Lücken über den Knopf **Flächen nachtragen** in der Auswertung. |
| 2 · Überdachung | Häkchen in den Feld-Stammdaten, plus **Einstellungen → Überdachung festlegen** für alle Felder auf einmal. Der Regen-Dialog warnt, solange Felder unangeschaut sind. |
| 3 · Regeln gegen Praxis | **Auswertung → Regel gegen Wirklichkeit**: je Zeile ein Vorschlag aus dem Journal und ein Knopf **übernehmen**. Die Rückfrage sagt ausdrücklich, dass die Änderung ein Kapazitätsproblem verdecken würde, falls die alte Regel der Anspruch war. |
| 4 · Fehlende Schiffnummern | Im **Journal** rot markiert mit Begründung; nachgetragene Nummern holen den Gang in die Auswertung zurück. |
| 8 · Kultur abgeräumt | Am Auftrag: **Klärfall — klären ›**, Weg 3 entfernt die Kultur. |
| 9 · Pflanzdaten | **Kulturen & Regeln** warnt, wenn Phasen ohne Pflanzdatum wirkungslos bleiben; Sammelmaske **Pflanzdaten nachtragen**. |
| 11 · nicht erfasste Gänge | Am Auftrag: **Klärfall — klären ›**, Weg 1 trägt den Gang nach. |

Offen ohne Entsprechung in der App bleiben **5** (Sprenkler-Abstände), **6** (Rollomat),
**7** (Wasseruhr) und **10** (was den Tagesablauf entscheidet) — die verlangen zuerst eine
Antwort, bevor sich sinnvoll etwas bauen lässt.

---

## Was wir ohne Antworten trotzdem tun können

Nichts davon blockiert den Betrieb der App. Sie rechnet, plant und zeigt ihre Unsicherheit
an. Die Antworten verschieben nur die Grenze zwischen „plausibel" und „belastbar" — und
bei Frage 2 (Überdachung) zwischen „ungenau" und „schädlich". Deshalb steht die weit oben,
obwohl sie die kleinste ist.
