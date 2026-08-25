# Backtest — hat das Modell je gestimmt?

> Phase 4 des Datenmodell-Auftrags. Die Engine läuft rollend gegen die Vergangenheit:
> für jeden Stichtag bekommt sie nur, was bis dahin bekannt war, und sagt den Folgetag
> voraus. Verglichen wird mit dem, was tatsächlich passiert ist.
> Erzeugt von `node tools/backtest.js --md` — alle Zahlen in diesem Text stammen aus
> demselben Lauf wie die Rohausgabe am Ende.

**Grundlage:** 62 Stichtage, 2619 vorhergesagte Schiff-Tage,
632 Gänge mit Menge und Dauer für die Dauerprognose.

---

## Das Ergebnis in drei Sätzen

1. **Die Dauerprognose ist gut.** Median-Fehler 12 Minuten,
   90 % aller Gänge innerhalb von ±30 %. Das
   Durchflussmodell aus Phase 3 trägt.
2. **Die Fälligkeitsprognose ist schwach.** Von allen Schiff-Tagen mit Kultur werden
   22 % bewässert; die Fälligkeitsliste der Engine trifft
   25 %. Das ist nur 1,15× Anreicherung.
   Wer täglich alles bewässert, hätte fast dieselbe Trefferrate.
3. **Die Reihenfolge war anfangs schlechter als würfeln — jetzt ist sie es nicht mehr.**
   Nach purer Dringlichkeit sortiert traf die Engine 177
   von 850 Schiff-Tagen — blindes Ziehen aus derselben Liste hätte 262 getroffen.
   Nach der jetzigen Reihung sind es 398. Das ist der grösste einzelne Gewinn dieser Phase.

---

## 1. Der Filter: welche Schiffe kommen morgen dran?

|  | genannt | davon richtig | Trefferrate | Anreicherung |
|---|---:|---:|---:|---:|
| Grundrate (alle Schiffe mit Kultur) | 3903 | 850 | 22 % | 1,00× |
| Engine | 2360 | 591 | 25 % | 1,15× |
| Vergleichsbasis (Median-Intervall) | 1862 | 441 | 24 % | 1,09× |

Genauigkeit 25 %, Trefferquote 70 %, F1 0,37 gegen
0,33 der Vergleichsbasis.

**Deutung.** Die Engine ist grosszügig: sie nennt 2360 Schiff-Tage, tatsächlich
bewässert wurden 850. Sie verpasst wenig (70 % Trefferquote), nennt aber
das Zwei- bis Dreifache dessen, was gebraucht wird. Für sich genommen ist das kein
Fehler — die Fälligkeitsliste ist absichtlich weit, die Kapazitätsentzerrung macht
daraus erst einen Plan. Es heisst aber: **die Liste allein ist kein Tagesplan.**
Was zählt, ist ihre Reihenfolge.

## 2. Die Reihenfolge

Faire Frage: die Engine darf genau so viele Schiffe nennen, wie an dem Tag wirklich
bewässert wurden. Wie viele davon trifft sie?

|  | Treffer von 850 | Anteil |
|---|---:|---:|
| **Engine (ausgelieferte Reihung)** | **398** | **47 %** |
| Engine nach Dringlichkeit allein | 177 | 21 % |
| Engine nach Tagen Überfälligkeit (altes Mass) | 165 | 19 % |
| blindes Ziehen **aus der Engine-Liste** | 262 | 31 % |
| Vergleichsbasis | 131 | 15 % |
| blindes Ziehen aus allen Schiffen | 223 | 26 % |

**Welcher Zufall ist der richtige Gegner?** Der aus der Engine-Liste. Das blinde Ziehen
aus allen Schiffen beantwortet eine andere Frage — es misst Filter und Reihenfolge
zusammen und profitiert davon, dass an Tagen mit vielen Gängen entsprechend viele
Treffer im Topf liegen. Wer eine Sortierung bewerten will, muss den Kandidatenkreis
konstant halten. Diese Unterscheidung war der Grund, weshalb das Ergebnis anfangs
falsch gelesen wurde.

Gemessen am richtigen Gegner: **1,52× Zufall**, 3,04× Vergleichsbasis.

## 3. Warum die Dringlichkeit falsch herum sortierte

Der eigentliche Befund dieser Phase. Bewässerungsquote nach Rückstand, gemessen an
allen Aufträgen, die die Engine je genannt hat:

| Dringlichkeit (Vielfaches der Regelmenge) | Aufträge | tatsächlich bewässert |
|---|---:|---:|
| unter 1 | 15 | 7 % |
| 1,0–1,5 | 399 | 52 % |
| 1,5–2 | 145 | 44 % |
| 2–3 | 207 | 26 % |
| über 3 | 1594 | 16 % |

Die Quote **fällt** mit steigendem Rückstand. Ein grosses Defizit zeigt bei diesem
Betrieb keinen grossen Bedarf an, sondern ein Schiff, das aus der Rotation gefallen
ist: Kultur abgeräumt ohne Enddatum, Regel zu eng hinterlegt, Gang nicht erfasst, oder
die Fläche läuft über den Rollomat. Solche Aufträge sammeln Defizit an, ohne dass
jemals jemand hingeht.

Wer nach Dringlichkeit sortiert, stellt also **systematisch die Karteileichen nach
oben** — und schiebt die echte Arbeit durch die Kapazitätsentzerrung nach hinten.
Das ist kein Rundungsfehler, das ist ein Vorzeichenfehler in der Logik.

### Was stattdessen sortiert

Dieselbe Liste, dieselbe Zahl an Plätzen, nur andere Sortierschlüssel:

| Schlüssel | Treffer | Anteil | gegen Zufall |
|---|---:|---:|---:|
| zuletztKurz | 457 | 54 % | 1,75× |
| intervallTreue | 444 | 52 % | 1,70× |
| gestuftIv | 422 | 50 % | 1,61× |
| gestuft40 | 375 | 44 % | 1,43× |
| gestuft | 371 | 44 % | 1,42× |
| gestuft30 | 364 | 43 % | 1,39× |
| dringlichkeitInvers | 360 | 42 % | 1,38× |
| gestuft20 | 360 | 42 % | 1,38× |
| plausibel | 359 | 42 % | 1,37× |
| haeufigkeit | 355 | 42 % | 1,36× |
| gestuft15 | 324 | 38 % | 1,24× |
| dringlichkeit | 177 | 21 % | 0,68× |
| tageUeberfaellig | 165 | 19 % | 0,63× |
| zuletztLang | 98 | 12 % | 0,37× |

Übernommen wurde die Stufung: **erst die plausiblen Aufträge, darin der, dessen
Abstand zum letzten Gang am genauesten dem eigenen Sollrhythmus entspricht, dann
das Defizit — Rückstände ab dem 2,5fachen stehen hinten.**

Nicht übernommen wurde `zuletztKurz` (457 Treffer),
obwohl es am besten abschneidet. „Zuerst das Schiff, das zuletzt Wasser bekommen hat"
sagt gut voraus, was der Betrieb tut, ist als Anweisung aber unsinnig. Die App soll
den Betrieb beraten, nicht nachahmen. Die Stufung liegt mit 398 Treffern nahe genug
und lässt sich einem Menschen erklären.

Die Schwelle 2,5 ist nicht an die Daten angepasst: zwischen 2,0 und 4,0 liegt das
Ergebnis zwischen 360 und 375 Treffern.

## 4. Bewässerung ist schubweise

| Lage am Vortag | Schiff-Tage | heute bewässert |
|---|---:|---:|
| gestern bewässert | 828 | 39 % |
| gestern nicht | 3075 | 17 % |

2,30× so wahrscheinlich. Bewässert wird in Schüben, nicht gleichmässig
verteilt — typisch für Anwachsphasen nach dem Pflanzen und für Routen, die ein Team
über mehrere Tage abarbeitet.

**Das Modell kennt beides nicht.** Es rechnet eine Wasserbilanz je Sektor, als wäre
jeder Sektor unabhängig und der Bedarf über die Kulturzeit konstant. Die beiden
stärksten Treiber der Wirklichkeit — **Pflanzdatum/Kulturphase** und **Route/Team an
diesem Tag** — stehen nirgends in den Daten. Solange das so bleibt, ist bei der
Fälligkeitsprognose keine grosse Verbesserung zu erwarten. Das ist die wichtigste
offene Frage an den Betrieb.

## 5. Dauer- und Mengenprognose

| | |
|---|---|
| n | 632 |
| Median-Fehler Dauer | 12 min |
| innerhalb ±30 % | 90 % |
| Median-Fehler Menge | 4.6 m³ bei typisch 61 m³ |

Nach Datenlage des Schiffs:

| Historie | n | Median-Fehler | innerhalb ±30 % |
|---|---:|---:|---:|
| 1–3 Gänge | 92 | 15 min | 86 % |
| 4–10 Gänge | 185 | 11 min | 92 % |
| über 10 Gänge | 355 | 11 min | 89 % |

Die Shrinkage aus Phase 3 wirkt: Schiffe mit 1–3 Gängen liegen nur wenig schlechter
als solche mit über 10. Ein dünn belegtes Schiff bekommt keinen wilden Einzelwert,
sondern wird zum Feldwert gezogen.

Felder mit dem grössten Restfehler:

| Feld | n | Median-Fehler |
|---|---:|---:|
| Eiägert | 76 | 21 min |
| Schützenhaus | 126 | 14 min |
| Förliwiesen Schopf | 69 | 14 min |
| Eichhof 1+2 | 16 | 13 min |
| Bühler unten | 33 | 11 min |
| Bachofen (Fällanden) | 74 | 11 min |

## 6. Was das für die App heisst

**Belastbar:** Dauer, Menge, Sprenklerzahl, m³ je Gang. Diese Zahlen darf der
Wassermann so ablesen, mit der Unsicherheitsangabe daneben.

**Mit Vorbehalt:** die Reihenfolge des Tagesplans. Sie ist messbar besser als Zufall
und deutlich besser als jede triviale Regel, aber sie trifft rund die Hälfte.
Der Tagesplan ist ein Vorschlag, keine Disposition.

**Nicht belastbar:** die Aussage „dieses Schiff ist heute fällig" für ein einzelnes
Schiff ohne Prüfung. Als Klärfall markierte Aufträge sind fast immer ein Datenproblem,
kein Wasserbedarf.

## 7. Grenzen dieses Backtests

- Kulturen und letzte Bewässerung wurden aus dem Journal rekonstruiert. Pflanzdaten
  fehlen ganz, Sektoren wurden je Schiff als einer angenommen. Der Betrieb hat also
  in der Wirklichkeit mehr Information, als die Engine hier hatte.
- Fehlt eine Regel, wird das beobachtete Median-Intervall des Schiffs als Regel
  gesetzt. Das ist wohlwollend gegenüber der Engine, aber notwendig — ohne Regel
  plant sie gar nicht.
- Rollomat-Gänge sind ausgeschlossen; sie folgen einer anderen Technik.
- Verglichen wird nur T→T+1 und nur bei Abständen bis 3 Tagen. Nach langen Pausen
  im Journal wäre der Vergleich unfair.
- „Nicht bewässert" heisst im Journal nicht „nicht nötig gewesen". Fehlalarme sind
  deshalb teilweise gar keine — sie lassen sich aus diesen Daten nicht auflösen.

---

## Rohausgabe

```

=== BACKTEST ============================================
Stichtage: 62 · vorhergesagte Schiff-Tage: 2619

--- Fälligkeitsprognose (welche Schiffe kommen morgen dran?) ---
                       Treffer   Fehlalarm   verpasst   Genauigkeit   Trefferquote   F1
  Engine                   591        1769        259          25 %           70 %   0.37
  Vergleichsbasis          441        1421        409          24 %           52 %   0.33

  → Engine SCHLÄGT die triviale Vergleichsbasis (F1 0.37 gegen 0.33)

--- Zwei getrennte Leistungen: der Filter und die Rangfolge ---
  (1) FILTER — wie stark reichert die Fälligkeitsliste an?
      Grundrate: von allen 3903 Schiff-Tagen mit Kultur wurden 850 bewässert  →  22 %
      Engine: von 2360 als fällig genannten waren 591 richtig  →  25 %   (1.15× Anreicherung)
      Basis:  von 1862 als fällig genannten waren 441 richtig  →  24 %   (1.09× Anreicherung)

  (2) RANGFOLGE — die Engine darf genau so viele Schiffe nennen wie bewässert wurden.
      Verglichen wird gegen blindes Ziehen AUS DER EIGENEN Fälligkeitsliste:
      das ist der einzig faire Massstab für eine Sortierung.
      von 850 tatsächlich bewässerten Schiff-Tagen trifft
        Engine (ausgelieferte Reihung)    398   47 %
        Engine nach Tagen (altes Mass)    165   19 %
        Zufall in der Engine-Liste        262   31 %
        Vergleichsbasis                   131   15 %
        Zufall in der Basis-Liste         237   28 %
        Zufall aus allen Schiffen         223   26 %

      → Sortierung der Engine: 1.52× gegenüber Zufall in der eigenen Liste
      → Dringlichkeit gegen Tage:      2.41×
      → Engine gegen Vergleichsbasis:  3.04×

      Achtung beim Lesen: „Zufall aus allen Schiffen" ist KEIN fairer Gegner für
      die Rangfolge. Er darf aus einem Topf ziehen, in dem an einem Tag mit vielen
      Gängen entsprechend viele Treffer liegen — das ist die Grundrate, nicht
      eine Leistung. Massgeblich ist die Zeile „Zufall in der Engine-Liste".

  (3) EXPERIMENT — dieselbe Liste, andere Sortierschlüssel, gleich viele Plätze:
      zuletztKurz            457   54 %   1.75× Zufall
      intervallTreue         444   52 %   1.70× Zufall
      gestuftIv              422   50 %   1.61× Zufall
      gestuft40              375   44 %   1.43× Zufall
      gestuft                371   44 %   1.42× Zufall
      gestuft30              364   43 %   1.39× Zufall
      dringlichkeitInvers    360   42 %   1.38× Zufall
      gestuft20              360   42 %   1.38× Zufall
      plausibel              359   42 %   1.37× Zufall
      haeufigkeit            355   42 %   1.36× Zufall
      gestuft15              324   38 %   1.24× Zufall
      dringlichkeit          177   21 %   0.68× Zufall
      tageUeberfaellig       165   19 %   0.63× Zufall
      zuletztLang             98   12 %   0.37× Zufall

  (4) DIAGNOSE — Bewässerungsrate je Dringlichkeitsklasse:
      Dringlichkeit <1        n=   15   tatsächlich bewässert 7 %
      Dringlichkeit 1.0–1.5   n=  399   tatsächlich bewässert 52 %
      Dringlichkeit 1.5–2     n=  145   tatsächlich bewässert 44 %
      Dringlichkeit 2–3       n=  207   tatsächlich bewässert 26 %
      Dringlichkeit >3        n= 1594   tatsächlich bewässert 16 %

  (5) BURSTIGKEIT — hängt der heutige Gang am gestrigen?
      gestern bewässert     n=  828   heute bewässert 39 %
      gestern nicht         n= 3075   heute bewässert 17 %
      → 2.30× so wahrscheinlich

--- Dauerprognose (bei tatsächlich ausgebrachter Menge) ---
  n = 632
  Median-Fehler        12 min
  mittlerer Fehler     31 min
  innerhalb ±30 %      90 %

  nach Datenlage des Schiffs:
    1–3 Gänge        n=  92   Median  15 min   innerhalb ±30 %: 86 %
    4–10 Gänge       n= 185   Median  11 min   innerhalb ±30 %: 92 %
    über 10          n= 355   Median  11 min   innerhalb ±30 %: 89 %

--- Mengenprognose (bei tatsächlicher Dauer) ---
  Median-Fehler        4.6 m³ bei typisch 61 m³

--- Wo die Prognose am meisten danebenliegt ---
  Eiägert                    n=  76   Median 21 min
  Schützenhaus               n= 126   Median 14 min
  Förliwiesen Schopf         n=  69   Median 14 min
  Eichhof 1+2                n=  16   Median 13 min
  Bühler unten               n=  33   Median 11 min
  Bachofen (Fällanden)       n=  74   Median 11 min
  Förliwiesen Weber          n=  21   Median 9 min
  Cherwis                    n= 100   Median 9 min

--- Nach Monat ---
  2026-05   Tage 11   Engine F1 0.41   Basis F1 0.33
  2026-06   Tage 23   Engine F1 0.31   Basis F1 0.32
  2026-07   Tage 24   Engine F1 0.40   Basis F1 0.32
  2026-08   Tage  4   Engine F1 0.35   Basis F1 0.39

Konsolenfehler: keine
=========================================================
```
