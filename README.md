# Sailor Studio

Eine Windows-Desktop-App für die visuelle Konzeptentwicklung von Segelbooten.
React, TypeScript, Three.js und Electron. Deutsche Oberfläche, ruhiges Studio-Layout
und eine interaktive parametrische 3D-Ansicht.

## Start

Voraussetzung: Node.js 22 oder neuer mit npm.

```powershell
npm install
npm run desktop
```

Produktionsversion starten:

```powershell
npm run build
npm start
```

Portable Windows-App erzeugen:

```powershell
npm run dist
```

Das Ergebnis liegt unter `release`. Für die Bedienung der fertigen EXE ist kein
Node.js erforderlich.

## Funktionen

- Monohull, Katamaran und Trimaran; drei anpassbare Konzeptvorlagen.
- Rundspant, Knickspant und schlanke Rümpfe; Länge, Gesamtbreite, Tiefgang und Farbe.
- Einmast-Rigg mit Mastposition ab Bug und Masthöhe über Deck.
- Klassisches oder Square-Top-Großsegel, Vorsegelfläche, visuelle Profiltiefe.
- 3D-Orbit, Seiten-, Deck- und Bugansicht; Drahtmodell, Wasserfläche und Vollbild.
- Rückgängig/Wiederholen, Arbeitskopie, lokale automatische Sicherung.
- Native JSON-Dateidialoge in der Desktop-App; JSON-Download/Upload im Browser.
- PNG-Export der reinen 3D-Ansicht.

Linke Maustaste dreht, rechte Maustaste verschiebt, das Mausrad zoomt.
Die letzte Arbeitssitzung wird lokal gesichert. Wichtige Varianten separat als
Datei speichern; Vorlagen ersetzen den Arbeitsstand und sind rückgängig machbar.
Entwurfsdateien werden beim Laden validiert (Version 1, höchstens 64 KB).

## Grenzen des Konzeptmodells

**Kein CAD, keine Baupläne, keine zertifizierte Schiffskonstruktion.**
Das Modell berechnet weder Hydrostatik noch Stabilität, Struktur, Ballast,
Gewicht, Segellasten oder tatsächliche Fahreigenschaften.

Die Rumpfreferenz ist `2,43 × sqrt(0,92 × Länge in Metern)` in Knoten:
eine grobe Verdränger-Näherung, keine Vmax-Vorhersage, insbesondere nicht für
Mehr­rümpfer. Schlankheit bezieht sich auf den ersten Einzel-/Hauptrumpf.
Segelflächen bezeichnen die ebenen dreieckigen bzw. trapezförmigen Umrisse.
Die Wölbung ist visuell; reale Tuchfläche und aerodynamische Kräfte werden
nicht berechnet. Der angezeigte Segeldruckpunkt ist eine flächengewichtete
geometrische Näherung. Der Tiefgang steuert Kiel/Anhänge.

Die Gesamtbreite schließt die Außenrümpfe ein. Mastposition wird als Prozent der
Rumpflänge vom Bug aus gemessen. Segelflächen bleiben auch bei ungünstigen
Kombinationen erhalten; Überhänge werden ausdrücklich angezeigt, nicht
stillschweigend korrigiert. Vor einem Bau ist professionelle Auslegung erforderlich.

## Entwicklung und Tests

```powershell
npm test
npm run build
npm run test:desktop
```

`npm run dev` startet nur die Browser-Vorschau auf `http://127.0.0.1:5173`.
Alle Entwürfe bleiben auf dem Gerät. Schriftarten sind lokal mitgeliefert;
die fertige Desktop-App benötigt keine Internetverbindung.

Die Desktop-Integrationstests verwenden ein isoliertes temporäres Benutzerprofil
und prüfen den echten Electron-Prozess samt Dateidialog-Schnittstellen und PNG-Export.
Vor diesen Tests muss `npm run build` gelaufen sein.
