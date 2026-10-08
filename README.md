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
Die App ist nicht digital signiert; Windows kann beim Start einen
SmartScreen-Hinweis anzeigen.

## Funktionen

- Monohull, Katamaran und Trimaran; drei anpassbare Konzeptvorlagen.
- Rundspant, Knickspant und schlanke Rümpfe; Länge, Gesamtbreite, Tiefgang und Farbe.
- Einmast-Rigg mit Mastposition ab Bug und Masthöhe über Deck.
- Klassisches oder Square-Top-Großsegel, Vorsegelfläche, visuelle Profiltiefe.
- 3D-Orbit, Seiten-, Deck- und Bugansicht; Drahtmodell, Wasserfläche und Vollbild.
- Rückgängig/Wiederholen, Arbeitskopie, lokale automatische Sicherung.
- Native JSON-Dateidialoge in der Desktop-App; JSON-Download/Upload im Browser.
- PNG-Export der reinen 3D-Ansicht.
- Optionale Hydrofoils: T-, L- und V-Architektur mit rechteckigen, trapezförmigen
  oder elliptischen Flügelumrissen. Editierbare Spannweite, Flügeltiefe,
  Verjüngung, Pfeilung, Neigung, Profildicke, Eintauchtiefe, Position und Winkel.
- Foil Lab: idealisierter Auftrieb, Flügelwiderstand, Gewichtskraft-Anteil,
  theoretische Geschwindigkeitsreferenz und Kurve über der Geschwindigkeit.
  Optionale Kraftpfeile, Strömungslinien und symbolischer Hub in 3D.
- Foil-Detailansicht: fokussiert die Unterwassergeometrie und blendet die
  Wasserfläche vorübergehend aus, damit Flügel und Profil gut sichtbar sind.

Linke Maustaste dreht, rechte Maustaste verschiebt, das Mausrad zoomt.
Die letzte Arbeitssitzung wird lokal gesichert. Wichtige Varianten separat als
Datei speichern; Vorlagen ersetzen den Arbeitsstand und sind rückgängig machbar.
Entwurfsdateien werden beim Laden validiert (Version 1, höchstens 64 KB).
Ältere Version-1-Dateien ohne Foils werden mit deaktivierten Foils geöffnet.

## Grenzen des Konzeptmodells

**Kein CAD, keine Baupläne, keine zertifizierte Schiffskonstruktion.**
Das Modell berechnet weder Rumpf-Hydrostatik noch Stabilität, Struktur, Ballast,
tatsächliches Gewicht, Segellasten oder gekoppelte Fahreigenschaften.

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

### Hydrofoil-Näherung

Das Foil Lab verwendet zwei Hauptflügel und symmetrische Profile. Ihre Fläche
ist `2 × Spannweite × Flügeltiefe × Formfaktor`, mit Formfaktor 1 für Rechtecke,
`(1 + Spitzentiefe/Wurzeltiefe)/2` für Trapeze und `π/4` für elliptische Umrisse.
Spannweite ist jeweils die entfaltete Spannweite **eines** Flügels.
Für jeden Flügel gilt `AR = Spannweite² / Einzelfläche`.

- Wasserdichte: 1.025 kg/m³; Geschwindigkeit: Knoten × 0,514444.
- `CL = 2π × Anstellwinkel in Radiant × AR/(AR+2)`.
- Vertikaler Auftrieb: `½ × Dichte × Geschwindigkeit² × Gesamtfläche × CL × cos(Neigung)`.
- `CD = 0,015 + CL²/(π × 0,8 × AR)`.
- Flügelwiderstand: `½ × Dichte × Geschwindigkeit² × Gesamtfläche × CD`.
- Gewichtskraft: angenommene Gesamtmasse in Tonnen × 1.000 × 9,81.

Die Referenzgeschwindigkeit setzt den idealisierten Auftrieb gleich der
Gewichtskraft. **Sie ist keine Abhebegeschwindigkeit.** Bei null oder negativem
Anstellwinkel wird keine positive Referenz angegeben; negative Auftriebskräfte
bleiben sichtbar. Null Geschwindigkeit erzeugt null Kräfte.

Das Modell setzt vollständiges Eintauchen und kleine Anstellwinkel voraus.
Es berücksichtigt keinen Stall, keine Kavitation, keine freie Wasseroberfläche,
keine Strömungsinteraktion, keine Streben, keine Ruderfoils, keine Flugregelung
und kein Nick-/Rollgleichgewicht. Dicke und Pfeilung ändern die 3D-Geometrie,
nicht die Kraftkoeffizienten. T/L/V unterscheiden die Anordnung; bei gleicher
Fläche, Neigung und Winkel liefert das vereinfachte Modell dieselben Kräfte.
Hinweise markieren mögliche Flügelüberschneidung und Oberflächenberührung.
Die Gesamtbreite des Bootes beinhaltet keine auskragenden Foils.

Kraftpfeile zeigen die Auftriebsrichtung. Die symbolische Hubhöhe ist
`0,65 × Eintauchtiefe × clamp(Auftrieb/Gewichtskraft, 0, 1)`.
Sie kann abgeschaltet werden und ist weder Gleichgewicht noch Flugsimulation.

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
Mit der Umgebungsvariable `SAILOR_EXECUTABLE` kann derselbe Test gegen die
gepackte, entpackte Desktop-EXE ausgeführt werden.

Der Paket-Audit meldet derzeit moderate Hinweise in der transitiven
Download-/Proxy-Toolchain von electron-builder. Für Produktionsabhängigkeiten
meldet `npm audit --omit=dev` keine Befunde; die Bauwerkzeuge sind nicht Teil
des ausgeführten Renderer-Codes. Keine erzwungenen Major-Downgrades anwenden.
