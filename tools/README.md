# Test- und Analyse-Werkzeuge

Alle Skripte laden `build/wasserplan.html` per `file://` in ein headless Chromium
(Playwright) und lesen bzw. manipulieren den Zustand über `pg.evaluate()`.

```
npm install playwright --no-save
node tools/probe.js        # Zustand direkt nach dem Booten
node tools/engine_test.js  # Verteilung über den Planungshorizont (Befund A2)
node tools/bug_test.js     # Verschieben, planNeu, Phasen, Vergangenheitspläne
node tools/bug_test2.js    # Regel-Korruption 'frei', Sektor-Markierung, Import
node tools/bug_test3.js    # Journal-Mapping des Wassermanns, Flächen, UI-Smoketest
node tools/bug_test4.js    # Referenzwert-Zuordnung, mm-Widerspruch, Dauer-Skalierung
```

Der Chromium-Pfad ist in den Skripten fest verdrahtet
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) — bei Bedarf anpassen oder
durch `chromium.launch()` ersetzen, wenn `npx playwright install` gelaufen ist.
