# Sailor Studio

Eine Windows-Desktop-App für die visuelle Konzeptentwicklung von Modellseglern
mit 0,3 bis maximal 2,0 m Rumpflänge.
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
- Gesamtmasse je Schiff: 0,1 bis maximal 10 kg, nicht je Einzelrumpf.
- Katamaran- und Trimaranrümpfe mit unabhängig editierbarer Länge (0,3–2,0 m).
  Länge über alles wird aus dem längsten Rumpf abgeleitet.
- Rundspant, Knickspant und schlanke Rümpfe; Länge, Gesamtbreite, Tiefgang und Farbe.
- Einmast-Rigg mit Mastposition ab Bug und Masthöhe über Deck.
- Klassisches oder Square-Top-Großsegel, Vorsegelfläche, visuelle Profiltiefe.
- 3D-Orbit, Seiten-, Deck- und Bugansicht; Drahtmodell, Wasserfläche und Vollbild.
- Rückgängig/Wiederholen, Arbeitskopie, lokale automatische Sicherung.
- Native JSON-Dateidialoge in der Desktop-App; JSON-Download/Upload im Browser.
- PNG-Export der reinen 3D-Ansicht.
- Strömungsanalyse mit Geschwindigkeit in m/s, Abdrift und Süß-/Salzwasser:
  hydrostatische Wasserlage aus Gesamtmasse (kg), benetzte Fläche, Froude- und
  Reynoldszahl, Widerstandsanteile, Seitenkraft und Schleppleistung.
- Widerstandskurve mit ITTC-57-Reibung, Formfaktor, Michell-Wellenwiderstand
  einschließlich Mehrrumpf-Interferenz sowie Anhänge- und Foilwiderstand.
- 2D-Profilumströmung mit Hess-Smith-Panelverfahren und Kutta-Bedingung;
  Strömungslinien und Auftriebsbeiwert für Kiel/Schwert oder Hydrofoil.
- Optionales Kelvin-Wellenbild in der 3D-Ansicht. Ausschalten betrifft nur die
  Darstellung, nicht den berechneten Wellenwiderstand.
- CAD-STEP-Export (AP214) mit wählbarer Wandstärke von 0,4 bis 5,0 mm,
  drei Auflösungen und Auswahl aller Rümpfe oder eines Haupt-/Einzelrumpfs.
  Native Dateidialoge unter Windows und `.step`-Download im Browser.
- Optionale Hydrofoils: T-, L- und V-Architektur mit rechteckigen, trapezförmigen
  oder elliptischen Flügelumrissen. Editierbare Spannweite, Flügeltiefe,
  Verjüngung, Pfeilung, Neigung, Profildicke, Eintauchtiefe, Position und Winkel.
- Unabhängige Einzelfoils: bis zu sechs je Rumpf (bis zu 18 beim Trimaran).
  Eigene Rumpfzuordnung, Längsposition ab Bug, Querposition zur Rumpfmitte,
  Eintauchtiefe und Drehwinkel; hinzufügen, duplizieren, löschen und deaktivieren.
- Einzelfoil-Analyse mit Fläche, Auftrieb, Widerstand, CL und Reynolds-Zahl;
  Gesamtkraft, Nick-/Rollmoment aus den Positionen sowie Überschneidungshinweise.
- PC-Balancebereich mit editierbarem Massenschwerpunkt (X/Y/Z), Kraft- und
  Momentenbilanz sowie anfänglicher hydrostatischer Rückstellsteifigkeit.
- Geschwindigkeitsvorschau mit Play/Pause, Kraft-/Momentenkurven und synchroner
  3D-Darstellung. Rot: CG/Gewicht, Blau: CB/Rumpfauftrieb, Grün: Foil-Auftrieb.
- Foil Lab: idealisierter Auftrieb, Flügelwiderstand, Gewichtskraft-Anteil,
  theoretische Geschwindigkeitsreferenz und Kurve über der Geschwindigkeit.
  Optionale Kraftpfeile und symbolische Strömungslinien in 3D.
- Foil-Detailansicht: fokussiert die Unterwassergeometrie und blendet die
  Wasserfläche vorübergehend aus, damit Flügel und Profil gut sichtbar sind.

Linke Maustaste dreht, rechte Maustaste verschiebt, das Mausrad zoomt.
Die letzte Arbeitssitzung wird lokal gesichert. Wichtige Varianten separat als
Datei speichern; Vorlagen ersetzen den Arbeitsstand und sind rückgängig machbar.
Entwurfsdateien werden beim Laden validiert (Version 2, höchstens 64 KB).
Länge über 2 m wird abgelehnt. Alte Version-1-Großbootentwürfe werden auf
1 m Rumpflänge skaliert; Flächen, Masse und Geschwindigkeit werden nach
Ähnlichkeitsregeln umgerechnet. Ohne Foils bleiben Foils deaktiviert.
Wandstärke und Strömungseinstellungen werden mitgespeichert.
Version-2-Dateien mit mehr als 10 kg Gesamtmasse werden abgelehnt; Masse vor dem
Import entsprechend korrigieren. Die Version-1-Migration begrenzt die berechnete
Modellmasse auf die neuen Grenzen.

### Einzelrumpflängen

Im Rumpf-Reiter sind beim Katamaran Backbord- und Steuerbordlänge getrennt
einstellbar, beim Trimaran Hauptrumpf und beide Ausleger. Die Rümpfe bleiben
längs mittig bei X = 0 ausgerichtet; Bug und Heck liegen jeweils bei ±halber
Einzellänge. Breite und Rumpftiefe bleiben die gemeinsamen Parameter.
Einzellängen werden optional als `hullLengths` in Version-2-Dateien gespeichert
(Katamaran: Backbord/Steuerbord; Trimaran: Haupt/Backbord/Steuerbord).
Ohne dieses Feld bleiben alte Entwürfe geometrisch unverändert.

Ruder, Schwerter und Foilpositionen verwenden den jeweils zugeordneten Rumpf.
Mastposition und Segelüberhang beziehen sich auf den Hauptrumpf (beim Katamaran
den Steuerbordrumpf). Querträger liegen im gemeinsamen Längsbereich der Rümpfe.
Hydrostatik, Widerstand, Wellen und STEP verwenden dieselben Einzellängen.
Ein Konzeptwechsel übernimmt passende Längen; nicht mehr vorhandene Foil-
Rumpfzuordnungen müssen weiterhin zuerst korrigiert werden.

## Grenzen des Konzeptmodells

**Konzept-CAD und Näherungsanalysen, keine zertifizierte Konstruktion.**
Das Modell berechnet eine aufrechte hydrostatische Wasserlage, aber keine
Stabilität, Struktur, Ballastverteilung, Segellasten, dynamischen Trimm oder
gekoppelte Fahreigenschaften. Die Masse ist eine Eingabe, kein Materialnachweis.

Die Widerstandsrechnung ist keine Vmax-Vorhersage. Michell setzt schlanke
Verdrängerrümpfe voraus; Gleitfahrt, viskose Ablösung und freie Oberflächen-
Effekte an Foils werden nicht aufgelöst. Modelltypische kleine Reynoldszahlen,
eingetauchte Heckspiegel, Überladung und große Froudezahlen erzeugen Hinweise.
Schlankheit bezieht sich auf den ersten Einzel-/Hauptrumpf.
Segelflächen bezeichnen die ebenen dreieckigen bzw. trapezförmigen Umrisse.
Die Wölbung ist visuell; reale Tuchfläche und aerodynamische Kräfte werden
nicht berechnet. Der angezeigte Segeldruckpunkt ist eine flächengewichtete
geometrische Näherung. Rumpftiefe und Schwerttiefe steuern die Geometrie;
der tatsächliche Tiefgang ergibt sich aus der Wasserlage und den Anhängen.

Die Gesamtbreite schließt die Außenrümpfe ein. Mastposition wird als Prozent der
Rumpflänge vom Bug aus gemessen. Segelflächen bleiben auch bei ungünstigen
Kombinationen erhalten; Überhänge werden ausdrücklich angezeigt, nicht
stillschweigend korrigiert. Vor einem Bau ist professionelle Auslegung erforderlich.

### STEP-Rumpfschalen

Im Reiter CAD Wandstärke in mm, Auflösung und Rumpfauswahl einstellen und
STEP exportieren. Exportiert werden geschlossene Materialkörper mit offenem
Deck, Innen- und Außenflächen sowie Heck- und Randabschluss. Koordinaten:
X vom Heck nach vorne, Y nach Backbord, Z nach oben; Einheiten Millimeter.
Mehrere Rümpfe sind getrennte Körper. Rigg, Kiel, Ruder, Foils und Querträger
sind nicht enthalten. Die Flächen sind facettiert, keine glatten NURBS-Flächen.
Die Wandstärke ist ein angenäherter Normalenversatz; an engen Kanten und am
Bug wird er begrenzt. Unzulässige Dicken ergeben eine Fehlermeldung, keinen
stillen Ersatzwert. Vor Fertigung Wandabstände und Verbindungen im CAD prüfen.
Am inneren Heckabschluss liegt ein zusätzlicher Außenspant, damit die
Innenhaut auch bei grober Facettierung innerhalb der Außenhaut bleibt.
Vor dieser Korrektur exportierte STEP-Dateien müssen neu erzeugt werden.

### Hydrofoil-Näherung

Im Foils-Reiter über „Einzelfoils konfigurieren“ das bisherige Paar übernehmen.
Danach Rumpf und Foil auswählen. Positionsfelder verwenden mm; Längsposition
ist der Abstand vom Bug des zugeordneten Rumpfs, Querposition der seitliche
Versatz zur Rumpfmitte (positiv Steuerbord, negativ Backbord). Eintauchtiefe
bezieht sich auf die Ruhewasserlinie. Eingaben mit Enter oder Fokuswechsel
übernehmen. Drehwinkel ist die Drehung um die Hochachse; „Flügel spiegeln“
kehrt die Ausladung von L-/V-Flügeln um. Jeder Foil besitzt eigene Geometrie
und Aktivierung. Rumpfwechsel, die Zuordnungen ungültig machen, werden abgelehnt;
vorher Foils umordnen oder entfernen. Einzelanordnungen werden als optionales
`foils.items` in Version-2-Dateien mitgespeichert; alte Paarentwürfe bleiben gültig.
Die Foil-Detailkamera und die Hydrofoil-Profilanalyse folgen der Foilauswahl.

Das Foil Lab verwendet symmetrische Profile. Die Fläche eines Einzelfoils
ist `Spannweite × Flügeltiefe × Formfaktor`, mit Formfaktor 1 für Rechtecke,
`(1 + Spitzentiefe/Wurzeltiefe)/2` für Trapeze und `π/4` für elliptische Umrisse.
Beim alten Paar wird die Einzelfläche verdoppelt. Nur aktive Einzelfoils
tragen zur Gesamtkraft bei; ihre Kräfte werden unabhängig aufsummiert.
Spannweite ist jeweils die entfaltete Spannweite **eines** Flügels.
Für jeden Flügel gilt `AR = Spannweite² / Einzelfläche`.

- Wasserdichte: 998 kg/m³ (Süßwasser) oder 1.025 kg/m³ (Salzwasser), bei 20 °C;
  Geschwindigkeit in m/s aus dem Strömungsreiter.
- `CL = 2π × Anstellwinkel in Radiant × AR/(AR+2)`.
- Vertikaler Auftrieb: `½ × Dichte × Geschwindigkeit² × Gesamtfläche × CL × cos(Neigung)`.
- `CD = CD0(Re, Profildicke) + CL²/(π × 0,8 × AR)`;
  `CD0 = 2 × Cf(Re) × (1 + 2 × Dickenverhältnis + 60 × Dickenverhältnis⁴)`.
- Flügelwiderstand: `½ × Dichte × Geschwindigkeit² × Gesamtfläche × CD`.
- Gewichtskraft: angenommene Gesamtmasse in kg × 9,81.

Bei gedrehten Einzelfoils wird der Anstellwinkel mit `cos(Drehwinkel)` projiziert.
Das ist keine vollständige Queranströmungsrechnung; über 20° folgt ein Hinweis.
Die Gleichgewichtsprüfung bezieht Rumpf- und Foilmomente auf den editierbaren
Massenschwerpunkt. Sie löst keinen dynamischen Trimm oder Krängungszustand.
Längs- und Querposition ändern in der unabhängigen Näherung die Hebelmomente,
nicht unmittelbar die Auftriebs-/Widerstandsbeiwerte. Die Eintauchtiefe beeinflusst
die Geometrie und Oberflächenwarnungen, nicht einen Oberflächenkorrekturfaktor.

Die Referenzgeschwindigkeit setzt den idealisierten Auftrieb gleich der
Gewichtskraft. **Sie ist keine Abhebegeschwindigkeit.** Bei null oder negativem
Anstellwinkel wird keine positive Referenz angegeben; negative Auftriebskräfte
bleiben sichtbar. Null Geschwindigkeit erzeugt null Kräfte.

Das Modell setzt vollständiges Eintauchen und kleine Anstellwinkel voraus.
Es berücksichtigt keinen Stall, keine Kavitation, keine freie Wasseroberfläche,
keine Strömungsinteraktion, keinen Strebenwiderstand, keine Flugregelung
und keine dynamische Nick-/Rollausrichtung. Die Dicke beeinflusst den Profilwiderstand;
Pfeilung bleibt rein geometrisch. T/L/V unterscheiden die Anordnung; bei gleicher
Fläche, Neigung und Winkel liefert das vereinfachte Modell dieselben Kräfte.
Hinweise markieren mögliche Flügelüberschneidung und Oberflächenberührung.
Überschneidungen werden konservativ mit Flügel-Hüllboxen geprüft, nicht als
exakter CAD-Kollisionstest. Bei solchen Anordnungen ist die Kraftsumme unsicher.
Die Gesamtbreite des Bootes beinhaltet keine auskragenden Foils.

Kraftpfeile zeigen die Auftriebsrichtung. Foil-Auftrieb reduziert den erforderlichen
Rumpfauftrieb und damit die berechnete Eintauchtiefe. Auftrieb größer/gleich
Gewicht wird als theoretischer Flugzustand markiert, ohne Flugregelung.
Strömungslinien direkt an den 3D-Foils sind symbolisch; nur die separate
2D-Profilansicht verwendet die berechnete Potentialströmung.

### Schwerpunkt und Gleichgewichtsprüfung

Im Reiter Balance Gesamtmasse und Schwerpunkt X/Y/Z in mm eingeben. Bezugsrahmen:
X positiv zum Bug, Y nach oben, Z nach Steuerbord. X/Z = 0 ist die Bootsmitte;
Y = 0 ist die feste Geometrienullhöhe, nicht die veränderliche Wasserlinie.
Ohne Schwerpunktangabe gilt X = 0, Y = -50 mm, Z = 0 als ausdrückliche Annahme.
Der Schwerpunkt wird optional als `massCenter` in der Entwurfsdatei gespeichert.

Die Prüfung berechnet den Schwerpunkt des verdrängten Volumens (CB),
Rumpfauftrieb `B = Dichte × g × Volumen` und Einzel-Foilkräfte. Die Foil-
Angriffspunkte liegen am flächengewichteten Viertel der lokalen Profiltiefe,
einschließlich Pfeilung, Neigung, Spiegelung und Drehung. Dann gelten:

- Vertikale Restkraft: `B + ΣL - Gewicht`.
- Nickmoment: `B × (xCB - xCG) + Σ[L × (xFoil - xCG)]`.
- Rollmoment: `-B × (zCB - zCG) - Σ[L × (zFoil - zCG)]`.
- Anfängliche Nick-/Roll-Rückstellung: `Dichte × g × Wasserflächen-Trägheitsmoment
  + B × (yCB - yCG) + Σ[L × (yFoil - yCG)]`, bei konstanten vertikalen Foilkräften.

Die Wasserflächen-Trägheitsmomente beziehen sich auf den Wasserflächenschwerpunkt;
bei mehreren Rümpfen werden die seitlichen Abstände über die Parallelachsenregel
berücksichtigt. Positives Vorzeichen bedeutet nur eine rückstellende Anfangslage
unter diesen Annahmen, keinen vollständigen Stabilitätsnachweis.

Die Kennzeichnung unterscheidet erfüllte Näherungsbilanz, offene Kräfte/Momente,
instabile Anfangslage und Modellgrenzen. Toleranzen: 1 % Gewichtskraft (mindestens
0,01 N), für Momente 0,1 % Gewichtskraft × Rumpflänge (mindestens 0,0001 Nm).
Oberflächenkontakt, Flügelüberschneidungen, große Drehwinkel, lineare CL außerhalb
des konservativen Bereichs, Überladung, theoretischer Flug und Fn > 0,6 werden
nicht als gültiges Gleichgewicht bestätigt. Niedrige Reynolds-Zahlen zeigen
die Unsicherheit ohne gemessene Profilpolaren ausdrücklich an.
Im theoretischen Foil-Flugbereich ist keine benetzte Rumpf-Bezugslänge vorhanden:
Froude-/Rumpf-Reynoldszahl werden dann als nicht anwendbar angezeigt. Rückstellung
wird außerhalb des gültigen statischen Bereichs als nicht bewertbar ausgewiesen,
nicht als bestätigte Instabilität. Der Fluglage-Hinweis bleibt bestehen; eine
geregelte Fluglage wird weiterhin nicht simuliert. Für eine schwimmende Prüfung
Geschwindigkeit, Foilfläche oder Anstellwinkel reduzieren.

Tempo direkt unter der 3D-Ansicht oder im Balancebereich verändern/abspielen.
Die Vorschau ändert keine gespeicherten Strömungsparameter; Zurücksetzen kehrt
zur Entwurfsgeschwindigkeit zurück. Kurven von 0 bis 5 m/s zeigen Foilauftrieb,
Rest-Rumpfauftrieb, Gewicht und Restmomente; markierte Punkte zeigen den Prüfstatus.
Auch die Wasserlage und Kraftpfeile in 3D folgen der Vorschau. Pfeillängen sind
relative Darstellungen mit Begrenzung, keine maßstäbliche Kräftezeichnung.

Es fehlen gekoppelte Rumpf-/Foil-Anströmung, zusätzliche Momente durch Widerstand,
Streben, Segelkräfte, Nick-/Rollregelung und nichtlineare Lage-/Stabilitätsrechnung.
Für belastbare Auslegung sind gemessene Low-Re-Polaren und Versuche erforderlich.
Die aktuelle Oberflächenentwicklung und Prüfung konzentriert sich auf die PC-App.

Analyse und Aufgabenstand: `TODO.md` und `TODO-VALIDIERUNG.md`.

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
