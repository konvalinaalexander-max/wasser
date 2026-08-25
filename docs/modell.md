# Modellkalibrierung — welche Annahmen tragen, welche nicht

> Phase 2 des Datenmodell-Auftrags (`docs/prompt-datenmodell.md`). Jede Hypothese mit
> Messergebnis, Entscheidung und Begründung — auch die verworfenen. Erzeugt von
> `tools/kalibrierung.py`, reproduzierbar. Grundlage ist `docs/datenaudit.md`.

Auswertbare Gänge: **733** (mit bekannter Kulturfläche: 730). Ausgeschlossen sind Rollomat-Gänge und physikalisch unmögliche Einträge (Durchfluss ausserhalb 0,5–5 m³/h je Regner) — beides begründet im Audit, Abschnitt 4 und 5b.

## H1 · Stimmt die beregnete Fläche?

Die Engine rechnet `Fläche = Kreisregner × 18 × 23 + Sektorregner × 18 × 11,5`, also **414 m² je Kreisregner** und **207 m² je Sektorregner**. Diese drei Zahlen wurden nie an Daten geprüft. Der direkte Test: wenn sie stimmen, muss die so berechnete Fläche die Kulturfläche treffen.

Deckungsgrad (beregnet ÷ Kulturfläche) über 730 Gänge: Median **0.71** (90-%-Bootstrap 0.67–0.77), 10.–90. Perzentil 0.43–1.55. Ein zutreffendes Modell läge bei 1,0.

| Parameter | heute gesetzt | aus den Daten (robust) | 90-%-Intervall |
|---|---|---|---|
| Fläche je Kreisregner | 414 m² | 446 m² | 415 – 468 m² |
| Fläche je Sektorregner | 207 m² | 356 m² | 329 – 381 m² |
| Verhältnis Sektor : Kreis | 0,50 | 0.80 | — |

Selbst mit den gefitteten Werten bleibt die Streuung gross: die Vorhersage der Kulturfläche aus der Regnerzahl liegt im Median um **35 %** daneben (1821 m² bei einer typischen Fläche von 4767 m²); nur 36 % der Gänge treffen auf ±25 % genau. (Ein Bestimmtheitsmass wird hier bewusst nicht angegeben — für ein Modell ohne Achsenabschnitt ist es nicht mit dem üblichen R² vergleichbar und würde mehr verschleiern als zeigen.)

Der Grund für die Streuung liegt offen: die Regnerzahl je Schiff ist selbst nicht stabil.

Von 31 Schiffen mit mindestens vier Einzelgängen haben **9** eine konstante Regnerzahl. Die typische relative Streuung beträgt **12 %**. Wer die Sprenkler während des Gangs versetzt, erzeugt genau dieses Bild — die Zahl beschreibt dann nicht die gleichzeitig laufende Menge, sondern eine Stellung oder eine Summe über Stellungen.

> **Urteil.** Die drei Parameter tragen nicht. Aus den Daten geschätzt liegt die Fläche je Kreisregner bei 446 m² statt 414 m², und das Verhältnis Sektor zu Kreis bei 0.80 statt 0,50. Aber auch die gefitteten Werte erklären die Fläche nur schwach. **Die beregnete Fläche ist als Rechengrösse nicht zu retten** — sie hängt davon ab, wie der Wassermann die Sprenkler stellt, und das schwankt um 12 %. Konsequenz für H3: mm nicht länger über sie definieren.

## H2 · Ist der Durchfluss das bessere Modell?

`mm/h` entsteht aus drei Messungen (Menge, Zeit, Regnerzahl) und einer Modellannahme (Wurfweite) — und erbt die Fehler aller vier. Gemessen werden nur **Menge und Zeit**. Der Durchfluss `Q = m³ / h` ist also die einzige Grösse, die nichts unterstellt.

| Modell | Durchfluss je Kreisregner | je Sektorregner | R² | Median-Fehler |
|---|---|---|---|---|
| linear, ohne Achsenabschnitt | 1.85 m³/h | 2.20 m³/h | 0.90 | 2.4 m³/h |

90-%-Intervalle: Kreisregner 1.82–1.87, Sektorregner 2.15–2.25 m³/h.

Die Vermutung aus dem Praxis-Durchgang war ein Druckabfall bei vielen Sprenklern. Der Test:

| Sprenkler gleichzeitig | n | Median m³/h je Sprenkler | 90-%-Intervall |
|---|---|---|---|
| 1–6 | 86 | 2.16 | 1.98 – 2.22 |
| 7–12 | 352 | 2.02 | 1.98 – 2.06 |
| 13–20 | 166 | 1.96 | 1.92 – 1.98 |
| 21–60 | 129 | 1.82 | 1.80 – 1.90 |

Rangkorrelation zwischen Sprenklerzahl und Leistung je Sprenkler: **ρ = -0.25** (p = 9.8e-12). Der Abfall ist real und deutlich.

| Modell | Parameter | R² | Median-Fehler |
|---|---|---|---|
| linear, zwei Regnertypen | Q = a·Kreis + b·Sektor | 0.900 | 2.4 m³/h |
| Potenz  Q = a·n^b | a = 2.37, b = 0.93 | 0.887 | 2.5 m³/h |
| Sättigung  Q = Qmax·n/(n+k) | Qmax = 840, k = 414 | 0.885 | 2.5 m³/h |

Der Potenzansatz schätzt den Exponenten auf **b = 0.93**. Bei b = 1 wäre der Durchfluss streng proportional zur Sprenklerzahl, bei b < 1 flacht er ab. Der geschätzte Wert liegt leicht darunter — der Abfall ist also real, aber schwach.

**Kein Sättigungsmodell schlägt das lineare.** Über den beobachteten Bereich von 1 bis rund 60 Sprenklern wächst der Durchfluss praktisch proportional; die gemessene Abnahme je Sprenkler von 2,16 auf 1,82 m³/h ist real, aber zu schwach, um die Vorhersage zu verbessern. Das ist ein negatives Ergebnis und wird als solches umgesetzt: **die Engine bekommt das lineare Modell, keine Sättigungskurve.** Eine Leitungsgrenze existiert vermutlich trotzdem — sie liegt nur ausserhalb dessen, was der Betrieb je gefahren hat, und lässt sich deshalb nicht schätzen. Sie gehört als Betriebsangabe erfragt, nicht als Kurve erfunden.

### Was zählt: die Dauerprognose

Beide Wege enden bei derselben Frage — wie lange muss der Gang laufen? Der Vergleich läuft **zeitlich getrennt**: gerechnet wird nur mit Gängen, die vor dem vorherzusagenden liegen. So misst der Test, was die App im Betrieb tatsächlich leisten würde.

| Weg | n | Median-Fehler | mittlerer Fehler | Anteil innerhalb ±30 % |
|---|---|---|---|---|
| A · heute: mm/h je Schiff | 729 | 28 min | 43 min | 64 % |
| B · Durchfluss je Sprenkler | 729 | 12 min | 21 min | 89 % |

> **Urteil.** Der Durchflussweg ist der bessere. Median-Fehler 12 statt 28 Minuten — **58 % weniger**, und der Anteil der Prognosen innerhalb von ±30 % steigt von 64 auf 89 %. Entscheidend ist aber weniger der Zahlenvorsprung als die Struktur: Weg B braucht keine Wurfweiten-Annahme, seine Parameter sind physikalisch interpretierbar und einzeln prüfbar, und der Druckabfall bei vielen Sprenklern lässt sich darin abbilden. **Der Durchfluss wird die tragende Grösse; mm/h entfällt als internes Zwischenprodukt.**

## H3 · Welche mm-Definition?

| Definition | n | Median mm je Gang | 10.–90. Perzentil | braucht |
|---|---|---|---|---|
| A · auf die beregnete Fläche (heute) | 730 | 14.1 | 9.1 – 21.1 | Regnerzahl + 3 Wurfweiten-Parameter |
| B · auf die Kulturfläche | 730 | 10.5 | 4.5 – 25.2 | Aren aus dem Plan |

Verhältnis A zu B: Median **1.42**. Wer heute „15 mm" plant, bringt nach Definition B im Median **10.6 mm** auf den Bestand.

Der Unterschied ist nicht nur ein Faktor. Er ist unterschiedlich gross je Feld:

| Feld | Gänge | Verhältnis A : B |
|---|---|---|
| Cherwis | 137 | 1.42 |
| Schützenhaus | 127 | 1.69 |
| Förliwiesen Schopf | 84 | 1.10 |
| Abag Luchs | 80 | 0.69 |
| Eiägert | 78 | 1.21 |
| Bachofen | 74 | 1.81 |
| Bühler unten | 39 | 1.61 |
| Neuwiesen Wolff Mitte | 24 | 4.01 |
| Förliwiesen Weber | 21 | 1.05 |
| Eichhof 1 | 19 | 0.78 |

Eine Umstellung ist also **keine gleichmässige Umrechnung** — sie verschiebt Felder gegeneinander. Genau deshalb kann sie nicht stillschweigend passieren.

> **Urteil.** **B ist die agronomisch richtige Grösse** — sie misst, was auf dem Bestand ankommt, und braucht nur die Aren-Zahl, die ohnehin auf dem Plan steht. A ist die gewohnte. Die Umsetzung führt beide: intern wird in B gerechnet, und überall, wo eine mm-Zahl erscheint, steht die andere Definition als Vergleich daneben. Welche Zahl in den Regeln steht, entscheidet der Betrieb über einen Schalter in den Einstellungen — Vorgabe B.

## H4 · Sind die Referenzwerte überangepasst?

Das Audit hat gezeigt: nur rund ein Viertel der Streuung in mm/h geht auf echte Unterschiede zwischen Schiffen zurück. Hier dieselbe Zerlegung für die Grösse, die nach H2 tragend wird — den Durchfluss je Sprenkler:

| Ebene | Streuung innerhalb | Streuung zwischen | Anteil echter Unterschiede |
|---|---|---|---|
| Schiff | 0.33 m³/h | 0.20 m³/h | 0.26 |
| Feld | 0.36 m³/h | 0.25 m³/h | 0.34 |

Auf Feldebene ist der Anteil echter Unterschiede mit 0.34 deutlich höher als auf Schiffebene (0.26). Übersetzt: **Felder unterscheiden sich, Schiffe innerhalb eines Feldes kaum.** Das ist die Rechtfertigung für Shrinkage — und zugleich der Hinweis, dass die richtige Analyseeinheit eher das Feld als das Schiff ist.

### Kreuzvalidierung

Vier Schätzer im Vergleich, alle zeitlich vorwärts (nur Vergangenheit sichtbar): der Betriebsschnitt, der Feldwert, der rohe Schiffwert (heutiges Verfahren) und der Shrinkage-Schätzer, der den Schiffwert je nach Datenlage Richtung Feld- und Betriebswert zieht.

| Schätzer | n | Median-Fehler | mittlerer Fehler | RMSE |
|---|---|---|---|---|
| Betriebsschnitt | 728 | 0.234 | 0.302 | 0.406 |
| Feldwert | 728 | 0.202 | 0.276 | 0.376 |
| roher Schiffwert (heute) | 728 | 0.174 | 0.260 | 0.371 |
| Shrinkage | 728 | 0.174 | 0.254 | 0.363 |

Fehler in m³/h je Sprenkler. Aufgeschlüsselt nach Datenlage des Schiffs:

| Datenlage | n | roher Schiffwert | Shrinkage |
|---|---|---|---|
| keine Historie | 36 | 0.332 | 0.332 |
| 1–3 Gänge | 127 | 0.223 | 0.185 |
| 4–10 Gänge | 199 | 0.165 | 0.163 |
| über 10 | 366 | 0.167 | 0.164 |

> **Urteil.** **Am Median ändert Shrinkage nichts, am Mittel und am RMSE verbessert es.** Median 0.174 gegen 0.174, Mittel 0.254 gegen 0.260. Das ist genau das erwartete Bild: bei gut belegten Schiffen ändert der Schätzer nichts, bei dünn belegten zieht er die Ausreisser ein — dort sinkt der Fehler um 17 % (127 Fälle mit 1–3 Gängen). **Der Gewinn ist bescheiden, aber er kostet nichts: der Schätzer wird nie schlechter als der rohe.** Genau deshalb kommt er in die Engine — nicht wegen des Median-Vorsprungs, sondern weil er das Verhalten bei dünner Datenlage berechenbar macht. Das Dämpfungsgewicht folgt aus der Varianzzerlegung (λ = 2.8).

## H5 · Wie werden Gruppenmessungen zugeordnet?

Ein Gang über drei Schiffe erzeugt heute drei identische Schiffwerte. Bei mm/h war das sachlich falsch — die Wassermenge verteilt sich, der Wert nicht. Bei der Grösse, die nach H2 tragend wird, verschwindet das Problem: **der Durchfluss je Sprenkler ist eine Eigenschaft des Gangs, nicht des Schiffs.** Er wird nicht aufgeteilt, sondern gemessen.

| Gänge | n | Median m³/h je Sprenkler |
|---|---|---|
| ein Schiff | 343 | 1.99 |
| mehrere Schiffe | 390 | 1.96 |

Der Unterschied ist statistisch nachweisbar (p = 0.02) und praktisch bedeutungslos: **1.4 %**. Bei 733 Gängen weist man auch Winzigkeiten nach — die Frage ist nicht, ob ein Unterschied existiert, sondern ob er zählt. Hier nicht.

> **Urteil.** Mit dem Durchfluss als Zielgrösse löst sich die Frage auf. Die Menge, die auf ein einzelnes Schiff entfällt, wird weiterhin flächenproportional zugeteilt — das ist für die Wasserbilanz nötig und die einzige Annahme, die dabei bleibt. Sie gehört als solche gekennzeichnet.

## H6 · Braucht es eine Zeitgewichtung?

„Die letzten acht" behandelt einen März-Gang wie einen August-Gang. Getestet wird eine exponentielle Gewichtung mit verschiedenen Halbwertszeiten gegen das ungewichtete Fenster.

| Gewichtung | Median-Fehler m³/h | n |
|---|---|---|
| ungewichtet, letzte 8 | 0.170 | 694 |
| exponentiell, Halbwertszeit 14 Tage | 0.177 | 694 |
| exponentiell, Halbwertszeit 30 Tage | 0.167 | 694 |
| exponentiell, Halbwertszeit 60 Tage | 0.171 | 694 |
| exponentiell, Halbwertszeit 120 Tage | 0.178 | 694 |

> **Urteil.** **Kein Verfahren gewinnt.** Die gesamte Spanne über alle Varianten beträgt 0.011 m³/h — kleiner als die Unsicherheit jedes einzelnen Werts. Eine Halbwertszeit von 30 Tagen liegt zufällig vorn, 14 und 120 Tage liegen hinten; das ist Rauschen, kein Signal. **Umgesetzt wird das ungewichtete Fenster** — die einfachere Variante, wenn die Daten keinen Unterschied belegen. Die Prüfung bleibt im Skript, damit sie sich mit mehr Daten wiederholen lässt.

## H7 · Widersprechen die Regeln den Daten?

Verglichen wird der hinterlegte Rhythmus mit dem beobachteten Abstand **je Schiff und Kultur**. Beide Trennungen sind nötig: über das Feld gemittelt entstünde ein Scheinintervall, weil an aufeinanderfolgenden Tagen verschiedene Schiffe drankommen — und über die Kulturen gemittelt ebenso, weil ein Feld über die Saison mehrere trägt (Eiägert im Journal elf).

> **Korrektur.** Eine frühere Auswertung in `docs/praxis-durchgang.html` nannte für Eiägert > einen Faktor 4,7 und für Cherwis 4. Diese Zahlen mischten die Kulturen eines Feldes und > waren zu hoch. Sauber je Kultur gerechnet bleiben deutliche Abweichungen, aber kleinere.

| Feld | Kultur | Regel (Tage) | beobachtet (Tage) | Abstände / Schiffe | Faktor |
|---|---|---|---|---|---|
| Cherwis | Fenchel | 1 | 3.0 | 65 / 7 Schiffe | 3.0× |
| Bühler unten | Salat | 1 | 2.0 | 29 / 3 Schiffe | 2.0× |
| Cherwis | Karotten | 0.5 | 1.0 | 14 / 2 Schiffe | 2.0× |
| Cherwis | Salat | 1 | 2.0 | 97 / 10 Schiffe | 2.0× |
| Eiägert | Lauch | 7 | 2.5 | 14 / 1 Schiffe | 0.4× |
| Förliwiesen Weber | Salat | 1.75 | 1.0 | 41 / 4 Schiffe | 0.6× |
| Eiägert | Kabis | 7 | 10.0 | 11 / 2 Schiffe | 1.4× |
| Schützenhaus | Fenchel | 1.75 | 2.0 | 51 / 5 Schiffe | 1.1× |
| Förliwiesen Schopf | Fenchel | 1.75 | 2.0 | 19 / 3 Schiffe | 1.1× |
| Bachofen | Fenchel | 1.75 | 2.0 | 48 / 4 Schiffe | 1.1× |
| Abag Luchs | Schnittlauch | 1 | 1.0 | 86 / 4 Schiffe | 1.0× |
| Eichhof 1 | Karotten | 7 | — | 0 / 0 Schiffe | zu wenig Daten |
| Eiägert | Randen | 7 | — | 0 / 0 Schiffe | zu wenig Daten |
| Eiägert | Knollensellerie | 7 | — | 0 / 0 Schiffe | zu wenig Daten |
| Bonomo | Salat | 7 | — | 0 / 0 Schiffe | zu wenig Daten |
| Eichhof 2 | Salat | 1 | — | 0 / 0 Schiffe | zu wenig Daten |
| Winkler | Salat | 7 | — | 0 / 0 Schiffe | zu wenig Daten |
| Adlisberg Slowgrow | Salat | 7 | — | 0 / 0 Schiffe | zu wenig Daten |

Von 18 hinterlegten Regeln lassen sich **11** an den Daten prüfen; für die übrigen 7 gibt es zu wenige Gänge mit dieser Kultur auf diesem Feld. Die Abstände sind je Schiff **und Kultur** gerechnet.

> **Urteil.** 5 von 11 prüfbaren Regeln weichen um mehr als die Hälfte vom beobachteten Rhythmus ab. Die Regeln werden **nicht automatisch überschrieben** — sie sind ein Soll, kein Ist. Aber die App zeigt künftig beides nebeneinander und bietet den beobachteten Wert mit seiner Fallzahl als Übernahme an. Der Betrieb entscheidet, ob die Regel falsch war oder die Praxis.

## H8 · Lässt sich ein Bodenmodell kalibrieren?

Die Wasserbilanz baut Regen eins zu eins ab. Physikalisch falsch — über der Feldkapazität läuft Wasser ab oder versickert. Die Frage ist, ob sich aus den vorhandenen Daten eine Feldkapazität schätzen lässt.

Dafür bräuchte man mindestens eines davon: Bodenart je Feld, Bodenfeuchtemessungen, oder Niederschlagsdaten in der Vergangenheit. Der Bestand:

| Benötigt | vorhanden? |
|---|---|
| Bodenart oder nutzbare Feldkapazität je Feld | nein — im Datenmodell nicht vorgesehen |
| Bodenfeuchtemessungen | nein |
| historische Niederschläge | nein — die Regen-Erfassung beginnt erst mit dem Betrieb der App |
| Beobachtung „nach Regen nicht bewässert" | indirekt aus den Journallücken ableitbar |

Die 18 Bewässerungspausen im Journal sind der einzige Fingerabdruck von Regen in den Daten — aber ohne Niederschlagsmenge daneben lässt sich daraus keine Feldkapazität schätzen, nur bestätigen, dass es Regen gab.

> **Urteil.** **Nicht kalibrierbar.** Die Daten geben es nicht her. Statt ein Modell zu erfinden, wird der Zusammenhang explizit und einstellbar gemacht: eine nutzbare Feldkapazität je Feld (Vorgabe aus der Bodenart, änderbar), gegen die der Regen gedeckelt wird. Ohne Angabe verhält sich die App wie bisher. Die Bodenart je Feld kommt auf die Liste der offenen Fachfragen — sie ist eine Auskunft, keine Messung.

## Was daraus folgt

| Hypothese | Ergebnis | Konsequenz |
|---|---|---|
| H1 · beregnete Fläche | trägt nicht | als Rechengrösse aufgeben |
| H2 · Durchfluss statt mm/h | bestätigt, Fehler halbiert | Q wird die tragende Grösse, linear |
| H3 · mm-Definition | B ist richtig | intern B, beide anzeigen, Schalter für den Betrieb |
| H4 · Shrinkage | kleiner Gewinn, kein Risiko | Empirical-Bayes-Schätzer, λ aus den Daten |
| H5 · Gruppenzuordnung | löst sich mit H2 auf | Menge flächenproportional, gekennzeichnet |
|  |  |  |
| H6 · Zeitgewichtung | kein Signal | ungewichtetes Fenster behalten |
| H7 · Regeln gegen Daten | 5 weichen stark ab | beobachteten Wert anbieten, nicht überschreiben |
| H8 · Bodenmodell | nicht kalibrierbar | explizit und einstellbar, Vorgabe neutral |

---

*Erzeugt von `tools/kalibrierung.py`. Die gefitteten Werte liegen in `data/modell.json` und gehen von dort in den Build.*
