# Pflichtenheft: Wasserplan- & Betriebsführungs-Webapp

Bio-Gemüsebaubetrieb, Raum Zürich. Stand dieses Dokuments: nach mehreren Runden gemeinsamer Konzeptarbeit im Chat, **vor Beginn der Programmierung**. Dieses Dokument ist die vollständige Grundlage für die Umsetzung.

---

## 1. Vision & Ausgangslage

Der Betrieb bewässert ca. 35–40 benannte Felder mit zusammen ca. 90–110 kleineren Einheiten ("Schiffe") an 29 Standorten, aktuell komplett mündlich organisiert: Der Produktionsleiter denkt sich morgens aus, was zu tun ist, und sagt es dem Wassermann (aktuell ein ungelernter, ggf. wechselnder Saisonnier) mündlich. Das ist fehleranfällig und nicht übertragbar, wenn der Wassermann wechselt.

**Kernidee der App:** Ein System, das
1. alle Standorte/Felder/Schiffe digital abbildet (aus handgezeichneten Plänen),
2. weiss, welche Kultur wo steht und wie viel Wasser sie braucht,
3. **selbständig einen sinnvollen Bewässerungsplan für die kommenden Tage vorschlägt** (das ist laut Betrieb das Herzstück des Projekts – ein Hintergrund-Algorithmus mit "gewisser Intelligenz", der Fälligkeiten über mehrere Tage verteilt statt sie zu bündeln),
4. dem Produktionsleiter erlaubt, diesen Vorschlag zu prüfen, anzupassen und freizugeben,
5. dem Wassermann eine denkbar einfache, mobile Oberfläche gibt, um zu sehen was zu tun ist und einzutragen, was er effektiv gemacht hat,
6. aus den historischen Einträgen lernt (Referenzwerte für "wie lange braucht es für X mm auf Schiff Y").

**Wichtig für die Umsetzung:** Zuerst kommt eine **Offline-Version** (siehe Abschnitt 9) zum Durchklicken und Nörgeln. Online-Betrieb mit Google-Sheets-Sync und E-Mail-Versand folgt erst danach, als bewusst spätere Phase.

**Langfristvision** (beeinflusst nur die Codequalität, nicht den Funktionsumfang jetzt): Das System könnte später an andere Gemüsebetriebe weitergegeben werden, die dann selbst ihre Pläne hochladen und einzeichnen. Datenmodell und Architektur sollen deshalb sauber und generisch sein, ohne betriebsspezifische Sonderfälle hart zu verdrahten – aber es wird jetzt nur für diesen einen Betrieb gebaut.

---

## 2. Rollen

Es gibt genau zwei Rollen, je eine Person:

- **Produktionsleiter / Admin** – arbeitet primär am PC. Verwaltet Standorte/Felder/Schiffe, weist Kulturen und Bewässerungsregeln zu, prüft/passt den täglichen Vorschlag an und gibt ihn frei, sieht volle Pläne inkl. Rohrleitungen, sieht Journal/Auswertungen.
- **Wassermann** – arbeitet mobil, auf dem Feld, am Handy. Sieht seine Aufgaben, trägt ein was er tatsächlich bewässert hat (Schiffe antippen, Zeit, Wasseruhr-Stand). Sieht keine Anbauinformationen oder Rohrpläne – nur Referenzwerte und die Eintrage-Funktion. Aktuell ungelernter/wechselnder Saisonnier (z.B. aus Ungarn/Polen) – App-Texte müssen in Deutsch, Ungarisch und Polnisch verfügbar sein (Sprachwahl beim Login). Fachbegriffe ("Schiff") und alle Standort-/Feldnamen bleiben aber immer auf Deutsch, weil das die einzigen Begriffe sind, die er kennt.

**Für die Offline-Version:** Kein Login/Passwort nötig. Startbildschirm zeigt zwei grosse Kacheln: "Admin" / "Wassermann". Beide Oberflächen mobilfreundlich, aber besonders die Wassermann-Ansicht muss auf einem Handy-Bildschirm exzellent funktionieren.

---

## 3. Datenmodell (Kernentitäten)

Vorschlag für eine saubere, erweiterbare Struktur. Konkrete Feldnamen/Typen liegen im Ermessen der Umsetzung, aber folgende Konzepte müssen alle vorkommen:

### Betrieb
Oberste Ebene (aktuell nur einer, Struktur soll aber Mehrbetriebs-fähig sein für später).

### Standort
Eine physische Örtlichkeit (entspricht meist einer PDF-Seite aus dem digitalisierten Plan-Set). Hat:
- Name, Gemeinde(n)
- ein Referenzbild/Übersichtsplan (für die "Standort anzeigen"-Funktion)
- eine eigene Hauptwasseruhr (Kubikzähler)
- enthält 1..n **Felder**

### Feld
Ein benannter Anbaubereich innerhalb eines Standorts (z.B. "Eichhof 2", "Cherwis"). Hat:
- Name, Gemeinde, Gesamtfläche (Aren, laut Plan)
- digitalisierte Aussenform (Polygon)
- enthält 0..n **Schiffe** (Felder ohne Schiff-Nummerierung, nur Gesamtfläche, bleiben schiff-los – reine Feld-Ebene reicht dann)

### Schiff
Die numerierte Bewässerungseinheit innerhalb eines Feldes (z.B. Schiff "1", "1a", "7"). Hat:
- Nummer, digitalisiertes Polygon
- optional: Länge, Breite, Aren (aus Plan; später durch echte Vermessung ersetzbar)
- Rohrleitungs-/Sprenkler-Infos (siehe Abschnitt "Sprenkler & Rohre")
- enthält 1..n **Sektoren**

### Sektor
Die atomare Anbaueinheit – ein frei eingezeichnetes Teilpolygon eines Schiffs (bei nur einer Kultur auf dem ganzen Schiff: genau 1 Sektor = das ganze Schiff). Hat:
- Kultur (Referenz auf Kulturarten-Liste)
- Pflanzdatum
- Status: aktiv / pausiert (mit Enddatum ODER "bis manuell reaktiviert")
- Priorität: hoch / normal / niedrig
- eigene oder von der Standardregel abweichende Bewässerungsregel (siehe unten)

**Wichtig:** "Satz" (Betriebs-Jargon: gleiche Kultur, anderes Pflanz-/Erntedatum) und "Sektor mit anderer Kultur" sind für die App **dasselbe Konzept** – bei jedem neuen Sektor wird einfach gefragt "was steht hier, seit wann?". Wenn ein Schiff geteilt wird, müssen alle Teilflächen lückenlos als Sektoren eingezeichnet werden.

### Kulturart (Stammdaten)
Liste von Kulturen (Salat, Fenchel, Karotten, …), erweiterbar durch den Admin. Pro Kulturart: Name, Farbe (automatisch/zufällig zugeteilt, über kleinen Button änderbar), Icon.

### Bewässerungsregel
Hängt an **Standort + Kultur** (nicht pauschal an der Kulturart – dieselbe Kultur wird an verschiedenen Standorten unterschiedlich bewässert, siehe Regeltabelle in Abschnitt 6). Besteht aus:
- Frequenz: zwei Dropdowns – "1×–7×" und "am Tag" / "in der Woche"
- Menge: mm pro Bewässerung
- optional: mehrere **Phasen** (z.B. "Tag 0–14 nach Pflanzung: täglich 8mm" → "danach: alle 3 Tage 20mm")
- bei mehrfacher Tagesbewässerung: vom Admin definierbare Zeitfenster im 2-Stunden-Raster (6/8/10 Uhr etc.)
- muss beim Ersteinrichten einer Standort-Kultur-Kombination zwingend erfasst werden (kein automatischer Default); wird als Vorschlag angeboten, wenn dieselbe Kultur an einem anderen Standort schon eine Regel hat
- tagesaktuell überschreibbar (z.B. weniger Wasser vor der Ernte) – diese Anpassung gilt nur für den betroffenen Tag

### Bewässerungsgruppe
Eine Menge benachbarter Schiffe, die gemeinsam bewässert werden. Kann vom Admin im Voraus als Vorschlag definiert werden UND vom Wassermann spontan durch Antippen der Schiffe gebildet werden (er trägt immer ein, was er *tatsächlich* gemacht hat, auch wenn es vom Vorschlag abweicht).

### Bewässerungs-Journal-Eintrag
Ein protokollierter Vorgang: Datum, beteiligte Schiffe/Gruppe, Kultur, Startzeit + Start-Zählerstand (m³), Endzeit + End-Zählerstand, Person, Anzahl Kreis-/Sektorregner (optional, vorbelegt mit dem letzten Eintrag für dieselben Schiffe), optionale Bemerkung. Mehrere Einträge können gleichzeitig "offen" sein (Wassermann startet an Standort A, fährt weiter, startet an Standort B, kommt später zurück und stoppt A).

### Rohr / Sprenkler-Layout
Wird pro Feld eingezeichnet (Admin), primär zur Übersicht ("welche Kultur hängt an welcher Leitung"), nicht für exakte Druckberechnung. Sprenkler werden bei jeder Bewässerung neu verlegt; genaue Position/Überlappung wird bewusst NICHT exakt erfasst (zu aufwändig) – die App geht von einer ungefähr regelmässigen Verteilung aus. Drei Bewässerungsarten: Kreisregner, Sektorregner (Halbkreis), Rollomat (fahrbarer Regner, bewässert eine über Zeit wachsende Fläche statt einer fixen – aktuell nur an den Standorten "Winkler" und "Uster Slowgrow" bekannt, Details siehe Offene Punkte).

---

## 4. Digitalisierung der Pläne

Bereits gebaut (siehe mitgelieferte Dateien `feld-digitalisierung.html` + Start-JSON): ein Tool, das handgezeichnete Standort-Pläne (PDF, 29 Seiten) als Hintergrund zeigt und ein grob vorausgefülltes Rechteck-Polygon pro Schiff anbietet, das der Admin per Drag der Eckpunkte korrigiert. 7 Standorte sind darin bereits vollständig vorbereitet.

**Für die restlichen ~22 Standorte und für den finalen Aufbau gilt:**
- Automatische Vorerkennung bewusst einfach halten: nur ungefähre Schiffanzahl erkennen und grob vorzeichnen (Rechtecke reichen). Der Mensch zeichnet im Setup die genauen Polygone selbst – keine aufwändige Bildanalyse investieren.
- Wenn auf dem Plan eine exakte Aren-Zahl pro Schiff steht: diese hat Vorrang vor der gezeichneten Fläche.
- Felder ohne Schiff-Nummerierung (nur Gesamtfläche): keine Schiff-Ebene, nur Feld-Ebene.
- Seiten mit mehreren benannten Feldern (z.B. Eichhof-Cluster): ein gemeinsamer Standort mit mehreren Feldern.
- Gebäude/Gewächshäuser in den Zeichnungen: ignorieren (Gewächshäuser laufen über ein separates System, für den Wasserplan irrelevant).
- Digitalisierung neuer/gepachteter Felder soll **im finalen Tool integriert** möglich sein: Admin lädt eine Zeichnung hoch, zeichnet frei ein Polygon mit beliebiger Eckenzahl, trägt Nummer/Metadaten ein. Auch nachträglich in den Einstellungen: Schiffe neu einteilen, Rohre neu verlegen.
- Bei jährlich neu zugepachteten/wechselnden Feldern (wie "Slowgrow") wird der Admin im Setup explizit aufgefordert, Umriss, Schiffe, Aren und Gemeinde jedes Mal neu einzuzeichnen.

---

## 5. Setup-Ablauf (Ersteinrichtung)

Läuft **Standort für Standort komplett durch** (nicht phasenweise über alle Standorte):

1. Plan-Polygone prüfen/korrigieren (aus der Digitalisierung vorausgefüllt)
2. Abgleich mit dem Bewässerungsjournal: Existiert für diesen Standort ein Journal-Eintrag? Falls nicht: Admin fragen, ob neues Feld / nicht mehr existierendes altes Feld / einem Journal-Namen per Dropdown zuordnen. Falls ein Feld im Plan keine Schiffe hat, aber im Journal schon: Hinweis "Schiffe fehlen, bitte eintragen".
3. Pro Schiff: Sektor(en) definieren – für jeden Sektor abfragen: welche Kultur, seit wann (Pflanzdatum)
4. Für jede neu auftauchende Standort-Kultur-Kombination: Bewässerungsregel zwingend erfassen (zwei Dropdowns + optionale Phasen, siehe Abschnitt 3), mit Vorschlag aus anderen Standorten falls vorhanden
5. Weiter zum nächsten Standort

---

## 6. Bewässerungsregeln – bereits bekannte Werte

Vom Betrieb gelieferte Startregeln (als Vorschläge ins System übernehmen, weitere folgen):

| Standort / Kultur | Regel |
|---|---|
| Eichhof 1 Karotten | 1×/Woche, 30mm |
| Eiägert (Lauch, Randen, Kabis [2 Felder], Sellerie) | 1×/Woche, 30mm |
| Bonomo | 1×/Woche, 30mm |
| Eichhof 2 | täglich, 15mm |
| Abag Schnittlauch | täglich, 15mm |
| Schützenhaus Fenchel | jeden 2. Tag, 15mm |
| Bühler unten | jeden Tag, 10mm |
| Schopf Fenchel | jeden 2. Tag, 15mm |
| Cherwis Karotten | 2×/Tag, 5mm |
| Weber alte Salat | jeden 2. Tag, 15mm |
| Fällanden Fenchel | jeden 2. Tag, 15mm |
| Cherwis Salat | jeden Tag, 15mm |
| Cherwis Fenchel | jeden Tag, 10mm |
| Winkler | 1×/Woche, 30mm — **mit Rollomat** |
| Uster Slowgrow | alle 10 Tage, 30mm — **mit Rollomat** |

---

## 7. Wassermann-Oberfläche

**Startbildschirm nach Login/Sprachwahl:** Idealerweise die fertige, vom Admin freigegebene Tagesliste. Falls noch keine Freigabe vorliegt: Hinweis "noch nicht da, bitte [Name] anrufen" (Name aktuell "Sammy", im Admin-Bereich änderbar).

**Tagesliste:** Grosse, gut antippbare Karten, eine pro Auftrag: Standort, betroffene Schiffe, Ziel-mm, empfohlene Dauer (basierend auf Referenzwerten). Detailgrad ist bewusst so gehalten, dass auch ein unerfahrener Saisonnier ohne Rückfrage loslegen kann ("Schiff 9 und 10, 2h 34min").

**Pro Auftrag antippen → Detail:**
- Knopf "Lageplan anzeigen" mit Zoom (v.a. bei Standorten mit mehreren Feldern, zur Vermeidung von Verwechslungen)
- Schiffe der Gruppe durch Antippen bestätigen/anpassen (er trägt ein, was er *tatsächlich* macht)
- Start/Stopp als Hilfsfunktion (protokolliert Zeit automatisch), er kann aber auch alles von Hand eintragen/korrigieren
- Zählerstand-Eingabe (Start/Stopp), grosses Nummernfeld
- Werte (z.B. Sprenkleranzahl) sind vorbelegt mit dem letzten Eintrag für diese Schiffe – er muss nur bestätigen
- Bei ungewöhnlich langer Zeitspanne (z.B. Start 16 Uhr, Stopp 6 Uhr am Folgetag): Rückfrage "lief das über Nacht, oder ein Fehler?"
- Kleines optionales Bemerkungsfeld
- Mehrere Aufträge können parallel "laufen" (App muss mehrere offene Einträge gleichzeitig verwalten können, weil er oft an mehreren Standorten gleichzeitig etwas laufen lässt)
- Versteckt (z.B. in einem Dropdown, nicht prominent): "schaffe ich heute nicht" – löst optional eine Meldung an den Admin aus

**Regen-Abfrage:** Nicht beim Wassermann – das macht der Admin (siehe Abschnitt 8).

---

## 8. Produktionsleiter-Oberfläche

**Regen-Eingabe:** Bei jedem Admin-Login gefragt "hat es geregnet?". Falls ja: Liste aller Standorte, Admin wählt an, welchen er denselben (von seiner Wetter-App abgelesenen) Regenwert zuordnen will. Beim nächsten Mal bleibt diese Standort-Auswahl vorausgewählt (änderbar), nur die Menge wird neu erfasst. Die App zeigt danach zwei Werte: was ohne Anpassung fällig wäre, und einen agronomisch angepassten Vorschlag – der Admin kann den Vorschlag vor dem Absenden nochmals frei überschreiben. Letztes Wort liegt immer beim Menschen.

**Tagesplan-Ansicht (das Herzstück):** Ein automatisch generierter, editierbarer Vorschlag für den/die kommenden Tag(e). UI-Idee: ein grosses Tages-Feld mit den Aufträgen; links/rechts neben einem einzelnen Auftrag Pfeile, um ihn auf den Vor-/Folgetag zu verschieben; links/rechts vom ganzen Tages-Container Navigation, um zwischen Tagen zu wechseln (Tag "verschwindet" elegant zur Seite, nächster erscheint). Admin kann jederzeit mehrere Tage im Voraus durchklicken und anpassen – realistisch wird er abends planen und gleich 2–3 Tage im Voraus freigeben.

**Kapazitäts-Warnung:** Die App zählt, wie viele Standort-Einträge der Wassermann historisch durchschnittlich an einem Tag schafft (aus dem Journal), und warnt, wenn der Tagesplan darüber liegt – der Admin kann dann anpassen oder trotzdem bestätigen. Verschiebt er etwas, kann das eine Kettenreaktion auf Folgetage auslösen; er soll das durchblättern und von Hand ausbalancieren können.

**Priorität:** Hoch/normal/niedrig ist nur ein starkes Argument in der Konfliktlogik, keine Garantie – der Admin hat immer die volle Freiheit, es zu übersteuern.

**Standort-/Feld-/Schiff-Verwaltung:** volle Pläne inkl. Rohrleitungen, Kultur-Zuweisung (Feld antippen → Kultur wählen, Kultur-Icon + Text auf dem Schiff sichtbar, automatische/zufällige Farbcodierung mit kleinem Anpass-Button), Sektor-Einzeichnung, Regel-Verwaltung, Pflanzdatum-Erfassung (schnell/unkompliziert, sonst wird sie nicht genutzt) mit Erinnerungs-Hinweis, Pausieren-Funktion (mit Enddatum oder "bis manuell reaktiviert").

**Journal-Ansicht:** durchsuchbare Historie als einfacher Reiter.

---

## 9. Kern-Algorithmus (Tagesplanung)

Das ist laut Betrieb der wichtigste Teil der App. Grundprinzip:

1. Für jeden aktiven Sektor: nächste Fälligkeit = letztes **tatsächlich eingetragenes** Bewässerungsdatum + Intervall aus der Regel (nicht das ursprünglich geplante Datum – sonst verschiebt sich alles künstlich, wenn der Wassermann mal anders vorgeht).
2. Regen reduziert/verschiebt Fälligkeiten agronomisch sinnvoll (z.B. 20mm Regen deckt den Bedarf einer "alle 3 Tage 20mm"-Kultur für die nächsten 3 Tage ab).
3. Fälligkeiten werden über die kommenden Tage verteilt statt gebündelt (Beispiel: 3 Kulturen brauchen alle 3 Tage Wasser → nicht alle am selben Tag, sondern je einen Tag versetzt).
4. Referenzwerte (siehe Abschnitt 10) liefern die empfohlene Dauer pro Auftrag.
5. Tageskapazität wird geprüft (Anzahl Standort-Einträge vs. historischer Durchschnitt); bei Überschreitung Warnung an den Admin statt automatischer Verschiebung.
6. Prioritäten und tagesaktuelle Anpassungen (z.B. weniger Wasser vor der Ernte) fliessen als weiche Faktoren ein, letzte Entscheidung bleibt immer beim Admin.

---

## 10. Journal & Referenzwerte

**Referenzwert-Berechnung:** Nicht pro exakter Gruppen-Kombination speichern (die ändert sich laufend), sondern normalisiert als **mm/h pro einzelnem Schiff**, aus dem Journal abgeleitet (Wassermenge ÷ Fläche ÷ Zeit, aufgeteilt auf beteiligte Schiffe proportional zur Fläche, wenn mehrere gleichzeitig liefen). So lässt sich für jede neue, historisch nie exakt so vorgekommene Kombination die Dauer hochrechnen. Zur Glättung über mehrere vergangene Einträge mitteln, nicht nur den letzten nehmen (Ausnahme: die Vorbelegung von Detailwerten wie Sprenkleranzahl beim Eintragen – dort reicht der letzte Eintrag).

**Alte Journal-Formel (zur Einordnung, nicht 1:1 übernehmen):**
`mm = Wassermenge(m³) × 1000 ÷ (Kreisregner × 18 × 23 + Sektorregner × 18 × 11,5)`
– 23 ist vermutlich eine wurfweiten-bezogene Länge pro Kreisregner, 11,5 die Hälfte davon (Sektorregner = Halbkreis), 18 vermutlich eine bisher pauschal angenommene, in Wahrheit variierende Schiffbreite. Sobald die digitalisierte Polygon-Fläche vorliegt, ersetzt diese die feste "18" – alte, mit der ungenauen Formel berechnete Referenzwerte sollten in der App als "ungenau/historisch" gekennzeichnet werden.

**Datenkorrektur nötig** (siehe mitgelieferte Datei `Bewässerungsjournal_2026_Imhof.xlsx`):
- Excel hat einzelne "Schiff"-Werte fälschlich als Datum interpretiert (z.B. "2.1" → 01.02.2026) – muss bereinigt werden
- Excel rechnet bei Übernacht-Bewässerungen (Start abends, Stopp am nächsten Morgen) fälschlich eine negative Zeitspanne (nimmt denselben Tag an) – ebenfalls zu bereinigen
- Feldnamen im Journal weichen teils von den Namen auf den Plänen ab (z.B. "Abag" statt "Abag Luchs", "Uster Slowgrow" statt "Adlisberg Slowgrow", "Wangen Oertig" statt "Wangen Autobahn", "Thalheim Thuräcker" fasst zwei Plan-Felder zusammen) – Zuordnung erfolgt live im Setup-Schritt (Abschnitt 5, Punkt 2), nicht vorab statisch
- Bedeutung der Bruch-Notation in der Schiff-Spalte (z.B. "3/4 4+5"): Kreisregner stehen in der Fahrgasse zwischen zwei Nachbarschiffen und bewässern beide gleichzeitig; mehrere Fahrgassen können gleichzeitig laufen

---

## 11. Sprache

Login-Bildschirm: Sprachwahl Deutsch / Ungarisch / Polnisch (nur relevant für die Wassermann-Seite, der Admin nutzt Deutsch). KI-Übersetzung ohne Hinweis auf die KI-Herkunft ist ausreichend. Fachbegriffe wie "Schiff" sowie alle Standort-/Feldnamen bleiben in jeder Sprachversion auf Deutsch.

---

## 12. Technischer Rahmen

### Phase 1 – JETZT zu bauen: Offline-Version
- Kein Login/Passwort (kommt später) – Startbildschirm mit zwei Kacheln "Admin" / "Wassermann"
- Gemeinsamer Datenspeicher: eine Datei (Format nach eigenem Ermessen – z.B. eine JSON-Datei, auf die beide Oberflächen zugreifen; Bilder/Pläne eingebettet wie im bestehenden Digitalisierungs-Tool)
- E-Mail-Funktionen (z.B. "schaffe ich heute nicht") als **UI-Stub**: Klick zeigt eine Meldung ("Würde eine E-Mail an [Name] senden – aktuell offline/nicht aktiv"), ohne tatsächlichen Versand
- Modernes, elegantes, aber vor allem benutzerfreundliches UI; besonderes Gewicht auf mobile Bedienbarkeit der Wassermann-Seite
- Freie Wahl der Programmiersprache/Architektur – Ziel ist ein möglichst cleveres, wartbares, aber auch für den Betrieb später erweiterbares Ergebnis

### Phase 2 – SPÄTER, erst nach Freigabe durch den Betrieb
- Login/Passwort pro Rolle
- Google-Sheets-Anbindung als Journal-Backend: über ein Google Apps Script, das direkt im Sheet als Web-App veröffentlicht wird ("Zugriff: jeder") – kein OAuth, kein Service-Account, keine 2-Faktor-Hürde für den Betrieb. Die App ruft nur eine URL auf.
- Echter E-Mail-Versand über einen externen Dienst (z.B. Resend), ausdrücklich NICHT über den betriebseigenen Mailserver, um den IT-Admin nicht involvieren zu müssen
- Hosting/Deployment für den mobilen Zugriff des Wassermanns von unterwegs

---

## 13. Bewusst offene Punkte / Annahmen für Phase 1

Diese Punkte sind noch nicht abschliessend geklärt – sinnvolle Annahme treffen, klar im Code/UI kennzeichnen, nicht blockieren:

- Genaue Behandlung des Rollomat (fahrbarer Regner, andere Flächenlogik als stehende Sprenkler) ist auch dem Betrieb selbst noch nicht klar – am Journal orientieren, einfache Näherung wählen
- Nicht sicher, ob "Wojciech" (bei einem Rollomat-Journal-Eintrag) eine Person oder eine Maschinenbezeichnung ist
- Bedeutung von "Weber alte Salat" (Sortenbezeichnung? Bedeutungslos?) ist unklar
- Genaues Konfliktverhalten bei gleichzeitig fälligen, unterschiedlich priorisierten Kulturen: einfache, nachvollziehbare Logik wählen (z.B. "hoch" wird zuerst eingeplant, alles bleibt aber manuell übersteuerbar), wird später mit der operativen Leitung noch verfeinert
- Was mit tagesaktuellen Anpassungen der Wassermenge geschieht (dauerhafte Notiz vs. spurlos): einfache, nachvollziehbare Lösung wählen (Empfehlung: als Notiz mit Datum festhalten, damit der Admin später sieht, wann/warum angepasst wurde)

---

## 14. Vorgehen nach der Offline-Version

Der Betrieb wird die Offline-Version durchklicken, Feedback geben ("nörgeln"), und iterativ verbessern lassen. Google-Sheets-/E-Mail-Anbindung und Login erst, wenn die Offline-Version passt.

---

## Anhang: Bereits vorhandene Dateien (bitte im neuen Chat mitgeben)

1. `feld-digitalisierung.html` + Start-JSON – bestehendes Digitalisierungs-Tool mit 7 fertig vorbereiteten Standorten (Abag Luchs, Au Landi, Bonomo, Eiägert, Eichhof 1–3)
2. `Bewässerungsjournal_2026_Imhof.xlsx` – 1087 echte Bewässerungs-Einträge seit März 2026, Grundlage für Referenzwerte
3. `Schläge_gezeichnet_Variante_2-2.pdf` – 29-seitiger Master-Plan aller Standorte (die restlichen ~22 müssen noch digitalisiert werden)
4. Dieses Pflichtenheft
