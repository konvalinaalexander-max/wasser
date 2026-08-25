# Datenaudit — was in den 1069 Journaleinträgen tatsächlich steht

> Phase 1 des Datenmodell-Auftrags (`docs/prompt-datenmodell.md`). Reine Bestandsaufnahme —
> am Modell wurde nichts geändert. Erzeugt von `tools/audit.py`, reproduzierbar.

Grundlage: **1069 Einträge**, 2026-03-02 bis 2026-08-04, 99 Tage mit mindestens einem Eintrag.

## 1 · Vollständigkeit

Was in einem Eintrag steht, entscheidet, wofür er überhaupt verwendbar ist. Die Engine braucht für einen Referenzwert **alle vier**: Menge, Dauer, Regnerzahl und zuordenbare Schiffe.

| Feld | vorhanden | fehlt |
|---|---|---|
| Datum | 1069 (100.0 %) | 0 (0.0 %) |
| Feldname zuordenbar | 1064 (99.5 %) | 5 (0.5 %) |
| Schiffnummern angegeben | 968 (90.6 %) | 101 (9.4 %) |
| Schiffnummern im Plan gefunden | 810 (75.8 %) | 259 (24.2 %) |
| Startzeit | 1065 (99.6 %) | 4 (0.4 %) |
| Stoppzeit | 1028 (96.2 %) | 41 (3.8 %) |
| Dauer | 1028 (96.2 %) | 41 (3.8 %) |
| Start-Zählerstand | 919 (86.0 %) | 150 (14.0 %) |
| Stopp-Zählerstand | 899 (84.1 %) | 170 (15.9 %) |
| Wassermenge m³ | 898 (84.0 %) | 171 (16.0 %) |
| Kreisregner | 812 (76.0 %) | 257 (24.0 %) |
| Sektorregner | 444 (41.5 %) | 625 (58.5 %) |
| Regner (mind. einer) | 1041 (97.4 %) | 28 (2.6 %) |
| Kultur | 1066 (99.7 %) | 3 (0.3 %) |
| Bemerkung | 15 (1.4 %) | 1054 (98.6 %) |

**Für einen Referenzwert vollständig: 743 (69.5 %).**

Welche Angaben fehlen gemeinsam — die häufigsten Muster:

| fehlende Angaben | Einträge |
|---|---|
| — nichts fehlt — | 743 (69.5 %) |
| Schiffzuordnung | 128 (12.0 %) |
| m³, Schiffzuordnung | 100 (9.4 %) |
| m³ | 35 (3.3 %) |
| Dauer | 17 (1.6 %) |
| m³, Dauer, Schiffzuordnung | 9 (0.8 %) |
| m³, Regner | 8 (0.7 %) |
| m³, Regner, Schiffzuordnung | 7 (0.7 %) |
| Regner, Schiffzuordnung | 7 (0.7 %) |
| m³, Dauer | 6 (0.6 %) |

## 2 · Ist das Fehlen zufällig?

Entscheidend, weil die Engine unvollständige Einträge wegfiltert. Fehlen sie zufällig, ist das Filtern harmlos. Hängt das Fehlen mit dem zusammen, was gemessen wird, verzerrt jedes Filtern die Referenzwerte.

**Wassermenge m³ fehlt** — 171 (16.0 %) betroffen

| Merkmal | Median wenn fehlt | Median wenn da | p | Zusammenhang |
|---|---|---|---|---|
| Dauer (min) | 182 | 156 | 2.26e-04 | ja |
| Schiffe je Eintrag | 1 | 1 | 2.29e-13 | ja |
| Regnerzahl | 11 | 11 | 6.51e-04 | ja |
| Feld | — | — | 2.72e-69 | ja |
| Monat | — | — | 9.37e-06 | ja |

**Regnerzahl fehlt** — 28 (2.6 %) betroffen

| Merkmal | Median wenn fehlt | Median wenn da | p | Zusammenhang |
|---|---|---|---|---|
| Dauer (min) | 197 | 166 | 2.61e-01 | nein |
| Schiffe je Eintrag | 0 | 1 | 1.49e-06 | ja |
| Feld | — | — | 7.39e-25 | ja |
| Monat | — | — | 9.36e-02 | nein |

**Schiffzuordnung fehlt** — 259 (24.2 %) betroffen

| Merkmal | Median wenn fehlt | Median wenn da | p | Zusammenhang |
|---|---|---|---|---|
| Dauer (min) | 192 | 148 | 2.10e-18 | ja |
| Schiffe je Eintrag | 1 | 2 | 1.26e-74 | ja |
| Regnerzahl | 11 | 11 | 8.05e-01 | nein |
| Feld | — | — | 3.49e-136 | ja |
| Monat | — | — | 1.04e-01 | nein |

## 3 · Duplikate und Überschneidungen

Gleicher Tag, gleiches Feld, gleiche Schiffe: **71 Schlüssel mit 145 Einträgen**. Das ist nicht zwingend falsch — mehrmals tägliche Bewässerung sieht genauso aus. Unterscheidbar wird es erst über die Uhrzeit:

| Fall | Einträge | Bewertung |
|---|---|---|
| zeitlich getrennt | 139 | plausibel — mehrere Gänge am selben Tag |
| zeitlich überlappend | 2 | verdächtig — vermutlich doppelt erfasst |
| ohne Zeitangabe | 4 | nicht entscheidbar |

Überlappende Fälle (Auszug):

| Datum | Feld | Schiffe | Zeiten |
|---|---|---|---|
| 2026-06-17 | Cherwis | 13+14+15 | 09:45–12:38 / 05:38–10:21 |

## 4 · Physikalische Plausibilität

Die Grenzen kommen aus der Technik, nicht aus dem Bauchgefühl: ein Feldregner bei 4–5 bar liefert grob 1–3 m³/h; ein Gang unter einer Viertelstunde bringt keine nennenswerte Menge auf die Fläche; über etwa 60 mm in einem Gang läuft Wasser auf den meisten Böden ab.

| Grösse | n | Median | 10.–90. Perzentil | plausibler Bereich | ausserhalb |
|---|---|---|---|---|---|
| Durchfluss je Regner | 871 | 2.0 | 1.5 – 2.6 | 0.5 – 5 m³/h | 16 (1.8 %) |
| Durchfluss gesamt | 878 | 22.2 | 12.4 – 43.5 | 2 – 120 m³/h | 8 (0.9 %) |
| Dauer | 1028 | 167.0 | 65.7 – 310.0 | 15 – 720 min | 30 (2.9 %) |
| mm je Gang (beregnete Fläche) | 891 | 14.2 | 8.6 – 24.6 | 2 – 60 mm | 5 (0.6 %) |
| mm je Gang (Kulturfläche) | 757 | 10.5 | 4.4 – 25.1 | 2 – 60 mm | 12 (1.6 %) |

Begründung der Bereiche: *Durchfluss je Regner* — 1–3 m³/h je Regner bei 4–5 bar · *Durchfluss gesamt* — Leitungs- und Pumpengrenze · *Dauer* — unter 15 min wirkungslos, über 12 h ungewöhnlich · *mm je Gang (beregnete Fläche)* — über 60 mm Abfluss · *mm je Gang (Kulturfläche)* — dito

Zählerstand rückwärts: **1** · Menge über 300 m³ in einem Gang: **12**.

## 5 · Ausreisser — was ein robustes Verfahren hier wirklich tut

Die Engine verwirft heute alles über 40 mm/h. Ein fester Schnitt ohne Begründung und ohne Protokoll. Der Lehrbuchweg wäre der modifizierte z-Wert über die mittlere absolute Abweichung (Iglewicz/Hoaglin, Schwelle 3,5). Angewandt auf diese Daten führt er in die Irre — und das ist selbst ein Befund.

| Verfahren | verworfen | Median danach | Streuung (MAD) | 10.–90. Perzentil |
|---|---|---|---|---|
| nichts verwerfen | 0 (0.0 %) | 4.95 | 0.89 | 3.74 – 11.66 |
| heute: über 40 mm/h | 2 (0.2 %) | 4.95 | 0.89 | 3.74 – 11.61 |
| robust global (z > 3,5) | 172 (19.8 %) | 4.71 | 0.58 | 3.57 – 6.70 |
| robust je Feld (z > 3,5) | 100 (11.5 %) | 4.82 | 0.66 | 3.71 – 11.32 |

**Der globale robuste Schnitt verwirft 20 % der Daten.** Das ist kein Ausreisserproblem, sondern ein Modellproblem: die Verteilung von mm/h ist nicht eingipflig um einen Betriebswert, sondern eine Mischung aus Feldern mit sehr verschiedenen Sprenklertypen und Flächen. Ein Verfahren, das globale Homogenität unterstellt, erklärt echte Unterschiede zu Fehlern.

Innerhalb der Felder angewandt verwirft dasselbe Verfahren nur 11.5 % — das ist die methodisch richtige Ebene. Noch besser wäre, gar nicht auf mm/h zu prüfen, sondern auf dem Durchfluss je Regner: dort gibt es eine physikalische Erwartung (1–3 m³/h), gegen die man messen kann, statt gegen einen selbstberechneten Mittelwert.

Fälle, die kein Verfahren retten kann — hier ist der Eintrag selbst falsch oder die Technik eine andere:

| Datum | Feld | Schiffe | m³ | Dauer min | Regner | m³/h je Regner | Bemerkung |
|---|---|---|---|---|---|---|---|
| 2026-06-12 | Winkler | – | 382.0 | 10 | 30 | 76.4 | – |
| 2026-06-30 | Winkler | – | 288.0 | 13 | 26 | 51.1 | – |
| 2026-04-24 | Förliwiesen Schopf | 1/2 2/3 | 408.0 | 112 | 22 | 9.9 | – |
| 2026-07-22 | Trüb | – | 34.0 | 126 | 2 | 8.1 | 20m  2h  8 klic |
| 2026-08-02 | Schützenhaus | 4 | 54.0 | 45 | 10 | 7.2 | – |
| 2026-07-07 | Hunziker klein | – | 82.0 | 317 | 3 | 5.2 | – |
| 2026-06-17 | Uster Slowgrow | 1+2 | 440.0 | 142 | 36 | 5.2 | rollomat 1 tag +3h |
| 2026-06-12 | Winkler | – | 8.0 | 33 | 30 | 0.5 | 8 klik 4 bar |
| 2026-07-23 | Trüb | rolo mata | 249.0 | 962 | 35 | 0.4 | – |
| 2026-07-13 | Schützenhaus | 5.6 | 56.0 | 973 | 10 | 0.3 | – |

Davon entfallen **4 von 15** auf Winkler und Uster Slowgrow — genau die beiden Standorte mit **Rollomat**. Ein fahrbarer Regner bewässert eine über die Zeit wachsende Fläche; die Grössen „Regnerzahl" und „beregnete Fläche" bedeuten dort etwas anderes. Diese Einträge gehören nicht bereinigt, sondern als eigene Bewässerungsart geführt.

## 5b · Der Rollomat ist eine andere Maschine, keine Ausreisserklasse

3 Einträge nennen den Rollomat ausdrücklich, verteilt auf **Uster Slowgrow** (1), **Trüb** (2).

| Datum | Feld | Schiffe | m³ | Dauer | Regner | Bemerkung |
|---|---|---|---|---|---|---|
| 2026-06-16 | Uster Slowgrow | 4+5 | 390.0 | 1414 min | 20 | rolomat |
| 2026-07-23 | Trüb | rolo mata | 126.0 | 469 min | 0 | – |
| 2026-07-23 | Trüb | rolo mata | 249.0 | 962 min | 35 | – |

Die Dauern liegen bei 8 bis 24 Stunden statt der üblichen 2 bis 3 — ein fahrbarer Regner zieht über die Fläche, statt an einem Ort zu stehen. „Regnerzahl" bedeutet hier nicht „so viele Düsen stehen gleichzeitig", und „beregnete Fläche" nicht „Anzahl × Wurfweite".

**Nebenbefund:** „Trüb" ist der Journalname, der sich im Setup keinem Plan zuordnen liess. Von seinen 5 Einträgen sind 2 ausdrücklich Rollomat-Gänge. Das ist ein Hinweis darauf, um was für eine Fläche es sich handelt — und eine Frage an den Betrieb, keine, die sich aus den Daten beantworten lässt.

## 6 · Zeitliche Abdeckung

| Monat | Einträge | Tage mit Bewässerung | Wasser m³ |
|---|---|---|---|
| 2026-03 | 22 | 10 | 569 |
| 2026-04 | 63 | 13 | 5317 |
| 2026-05 | 194 | 21 | 11750 |
| 2026-06 | 340 | 26 | 21918 |
| 2026-07 | 400 | 25 | 24458 |
| 2026-08 | 50 | 4 | 3592 |

18 Pausen von mindestens einem Tag, die längsten: 12 Tage nach 2026-03-25, 8 Tage nach 2026-03-10, 7 Tage nach 2026-05-09, 6 Tage nach 2026-04-14, 3 Tage nach 2026-06-03.

**Der letzte Eintrag stammt vom 2026-08-04.** Jede Fälligkeitsrechnung, die später läuft, unterstellt, dass seither nicht bewässert wurde — der Rückstand wächst rein rechnerisch.

## 7 · Trägt ein Referenzwert je Schiff überhaupt?

Die Engine schätzt mm/h **je Schiff**. Das lohnt nur, wenn sich Schiffe systematisch unterscheiden — und wenn der Unterschied grösser ist als das Rauschen zwischen zwei Gängen auf demselben Schiff. Das lässt sich zerlegen.

| Grösse | Wert |
|---|---|
| Schiffe mit mindestens 3 Gängen | 63 |
| Streuung INNERHALB eines Schiffs (SD) | 2.82 mm/h |
| Streuung ZWISCHEN Schiffen (SD) | 1.60 mm/h |
| Anteil echter Schiffunterschiede (ICC) | 0.24 |

**Nur rund 24 % der beobachteten Streuung gehen auf echte Unterschiede zwischen Schiffen zurück; der Rest ist Streuung zwischen zwei Gängen auf demselben Schiff.** Ein Schiffwert aus wenigen Beobachtungen misst damit überwiegend Rauschen. Genau dafür ist Shrinkage gedacht: der Schätzer wird um so stärker Richtung Feld- und Betriebsmittel gezogen, je weniger Beobachtungen er hat. → **H4 ist nicht nur begründet, sondern notwendig.**

Wie stark ein Einzelwert wackelt, zeigt die Stichprobenverteilung des Medians bei gegebener Anzahl Gänge (simuliert aus den beobachteten Abweichungen innerhalb der Schiffe):

| Gänge je Schiff | 90-%-Intervall (halbe Breite) | relativ | Schiffe mit mind. so vielen |
|---|---|---|---|
| 1 | ± 4.36 mm/h | ± 88 % | 73 |
| 2 | ± 3.15 mm/h | ± 63 % | 67 |
| 3 | ± 2.56 mm/h | ± 51 % | 63 |
| 5 | ± 1.34 mm/h | ± 27 % | 53 |
| 8 | ± 0.92 mm/h | ± 18 % | 48 |
| 12 | ± 0.55 mm/h | ± 11 % | 44 |
| 20 | ± 0.34 mm/h | ± 7 % | 29 |

Insgesamt haben **73 von 164 Schiffen** überhaupt einen eigenen Wert; die Hälfte davon stützt sich auf weniger als 14 Gänge.

Feld-Kultur-Kombinationen im Journal: **56**, davon **32** mit mindestens 8 Einträgen. Die App führt 18 Regeln — die Schnittmenge entscheidet, wo sich eine Regel überhaupt aus Daten belegen lässt.

| Feld | Kultur | Einträge |
|---|---|---|
| Eichhof 1 | Schnittlauch | 143 |
| Schützenhaus | Mix | 92 |
| Cherwis | Salat | 64 |
| Abag Luchs | Schnittlauch | 56 |
| Cherwis | Fenchel | 48 |
| Schützenhaus | Fenchel | 48 |
| Förliwiesen Schopf | Mix | 40 |
| Bachofen | Salat | 39 |
| Bachofen | Fenchel | 33 |
| Förliwiesen Schopf | Salat | 32 |
| Eichhof 1 | Karotten | 30 |
| Neuwiesen Wolff Mitte | Fenchel | 29 |

## 8 · Was daraus für Phase 2 folgt

- **Deckungsgrad** (beregnete Fläche ÷ Kulturfläche): Median 0.71, 10.–90. Perzentil 0.43–1.51, 444 von 798 unter 0,8. Ein Modell, dessen Flächenannahme stimmt, läge bei 1,0. → **H1 ist ernst.**
- **Durchfluss je Regner**: Median 1.95 m³/h, 1.51–2.56. Eine physikalisch direkt interpretierbare Grösse — im Gegensatz zu mm/h, das drei Messungen und eine Annahme kombiniert. → **H2 prüfen.**
- **743 (69.5 %)** der Einträge sind für einen Referenzwert vollständig. Ob das Wegfiltern der übrigen verzerrt, entscheidet Abschnitt 2.
- **Varianzzerlegung**: nur 24 % der Streuung in mm/h gehen auf echte Unterschiede zwischen Schiffen zurück, 76 % sind Rauschen zwischen zwei Gängen desselben Schiffs. 73 Schiffe haben eigene Werte, die Hälfte davon aus wenigen Gängen. → **H4 (Shrinkage) ist nicht nur begründet, sondern notwendig.**
- **Ausreisserfilterung** gehört auf die Ebene, auf der die Daten homogen sind (Feld oder Schiff), oder besser auf eine physikalisch interpretierbare Grösse. Global angewandt verwirft ein Standardverfahren hier ein Fünftel der Daten.
- **Der Rollomat** braucht eine eigene Bewässerungsart, keine Ausnahmeregel in der Ausreisserlogik. Die Frage, wie seine Fläche zu rechnen ist, kann nur der Betrieb beantworten (Pflichtenheft §13 hält sie selbst als offen fest).
- **Was das Fehlen verzerrt**: Einträge ohne m³ sind systematisch die längeren (182 gegen 156 min) und häufen sich in bestimmten Feldern. Das Wegfiltern verschiebt die Referenzwerte in Richtung kürzerer Gänge. → in Phase 2 quantifizieren, nicht ignorieren.

---

*Erzeugt von `tools/audit.py`. Zum Reproduzieren: `node tools/export_kontext.js && python3 tools/audit.py`.*
