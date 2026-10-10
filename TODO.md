# Modellsegler-Suite: Analyse und Aufgaben

## Projektanalyse

React/TypeScript steuert parametrische Entwuerfe; Three.js rendert Rumpf,
Rigg und Foils. Electron bietet isolierte Dateidialoge. Vorhandene Module
fuer Hydrostatik, Michell-Wellen, Panelstroemung und STEP-Schalen waren
weitgehend implementiert, aber nicht vollstaendig mit der UI verbunden.
App.tsx enthielt ein vorzeitiges Komponentenende; Tests und README verwendeten
teilweise noch Grossboot-Einheiten. Der JSON-Lader verlor den Tiefgang und
die Version-1-Migration setzte nicht alle Modell-Pflichtfelder.

## Umgesetzt

- [x] JSX-Struktur und Dateirundlauf repariert; lokale Vorarbeiten erhalten.
- [x] Rumpflaenge 0,3 bis 2 m in Bedienung und Dateivalidierung.
- [x] Modell-Einheiten m, mm, m/s, kg und N statt Knoten/Tonnen.
- [x] Widerstandsanteile, Leistung, Hydrostatik, Kennzahlen und Warnungen.
- [x] Widerstandskurve und berechnete 2D-Profilstroemung eingebunden.
- [x] Kelvin-Wellenbild schaltbar.
- [x] Benetzungsgrad von Kiel/Schwert/Ruder und Ballastkoerper beruecksichtigt.
- [x] STEP AP214: Rumpfschalen mit 0,4-5 mm Wandstaerke und drei Aufloesungen.
- [x] Alle Rumpfkoerper oder Haupt-/Einzelrumpf auswaehlbar.
- [x] Browserdownload und nativer Electron-STEP-Dateidialog.
- [x] README mit Modellannahmen und CAD-Exportgrenzen aktualisiert.
- [x] Bis zu sechs unabhaengige Foils je Rumpf, inklusive persistierter Positionen.
- [x] Hinzufuegen, Duplizieren, Loeschen, Rumpfzuordnung und Einzelaktivierung.
- [x] Laengs-/Querposition, Eintauchtiefe, Drehwinkel und Spiegelung je Foil.
- [x] Einzelkraefte, Gesamtkraft, Hebelmomente und Ueberschneidungshinweise.
- [x] Foil-Detailkamera und 2D-Profilanalyse folgen dem ausgewaehlten Foil.
- [x] Alte Paarentwuerfe ohne Einzel-Liste bleiben kompatibel.
- [x] Editierbarer Massenschwerpunkt X/Y/Z mit JSON-Persistenz und 3D-Marker.
- [x] Kraft-/Momentenbilanz am Schwerpunkt mit Vierteltiefen-Foil-Angriffspunkten.
- [x] Rumpf-Volumenschwerpunkt und Wasserflaechen-Traegheitsmomente integriert.
- [x] Anfaengliche Rueckstellung und klare Grenzen des statischen Pruefmodells.
- [x] Geschwindigkeitskurven und Play/Pause-Vorschau synchron mit der 3D-Szene.
- [x] PC-Bedienung direkt unter der 3D-Ansicht und im Balancebereich.
- [x] Gesamtmasse maximal 10 kg je Schiff in Bedienung und Dateivalidierung.
- [x] Individuelle Katamaran-/Trimaranlaengen mit abgeleiteter Gesamtlaenge.
- [x] Rigg, Quertraeger und Anhaenge auf passende Einzellaengen beziehen.
- [x] Einzellaengen in Hydrostatik, Wellen, STEP und JSON konsistent verwenden.

## Bewusste Folgeaufgaben

- [ ] Widerstandsmodell mit Schleppversuchen im Modellmassstab kalibrieren.
- [ ] Viskoese CFD, dynamischer Trimm, Kraengung und Stabilitaet separat auslegen.
- [ ] Strutwiderstand, Foil-Teilbenetzung und Oberflaecheneffekte modellieren.
- [ ] Gemessene Low-Re-Profilpolaren, Stall und induzierte Anstroemung einbinden.
- [ ] Nichtlineares Nick-/Rollgleichgewicht einschliesslich Widerstands- und Segelmomenten.
- [ ] Rechenintensive Analysen in einen Web Worker verschieben.
- [ ] Glatten CAD-Kernel-Export mit robustem 3D-Offset statt Facetten anbieten.
- [ ] Kiel/Ruder/Foils, Quertraeger und Deck als optionale CAD-Bauteile ergaenzen.
- [ ] Wandstaerkenpruefung, Bauteiltrennung und Fertigungszugaben ergaenzen.

Der jetzige Export betrifft Rumpfschalen, nicht einen fertig konstruierten Bausatz.