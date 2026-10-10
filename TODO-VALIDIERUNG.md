# Validierung

- [x] Entwurfsdateien fuer alle Vorlagen verlustfrei laden/speichern.
- [x] Exakte 2-m-Grenze akzeptieren, groessere neue Entwuerfe ablehnen.
- [x] Numerische Werte und Wandstaerkengrenzen pruefen.
- [x] 2D-Zylinderstroemung und Profilauftrieb gegen analytische Referenzen.
- [x] Michell-Verfahren gegen geschlossene Wigley-Loesung.
- [x] Kraftbilanz, Stillstand, Abdrift und benetzte Anhaenge testen.
- [x] Schalen geschlossen, positiv orientiert und Wandabstand am Hauptspant.
- [x] Heckfehler reproduziert: Innenhaut lag bei grober Facettierung ausserhalb.
- [x] Aussenstation am inneren Heckabschluss synchronisiert.
- [x] Heck-Regressionsmatrix: drei Formen, drei Aufloesungen, 0,4/1,2/2/5 mm;
	Innenpunkte und Dreiecksschwerpunkte gegen echte Aussenfacetten pruefen.
- [x] STEP in OpenCascade wieder einlesen; mm-Abmessungen und Volumen pruefen.
- [x] Mehrrumpf-STEP als getrennte Koerper einlesen.
- [x] Bis zu sechs Einzelfoils je Rumpf: Geometrie, Kraeftesumme, Zuordnung, Grenzen.
- [x] Electron: freie Foilpositionen, Loeschen/Undo und Wiederladen.
- [x] Schwerpunkt-Persistenz und exakte Verschiebungswirkung auf Nick-/Rollmomente.
- [x] Analytische Parallelachsenregel fuer getrennte Rumpf-Wasserlinien.
- [x] Vertikale Kraftbilanz, Rueckstellungs-Vorzeichen und Schwerpunkt-Hoehenwirkung.
- [x] Physikpruefung bestaetigt weder ueberladene noch theoretisch fliegende Zustaende.
- [x] Foilflug erzeugt keine kuenstliche Rumpf-Froude-/Reynoldszahl.
- [x] Rueckstellung ausserhalb der Modellgrenzen ist nicht bewertbar, kein Instabilitaetsbefund.
- [x] Echte negative Rueckstellung im gueltigen Schwimmzustand bleibt erkennbar.
- [x] 3D-Schwerpunkt-/Volumenmarker und Gewicht-/Rumpfauftriebspfeile.
- [x] Electron: Schwerpunktfelder, Wiederladen, Tempoanimation und Kurvenupdates.
- [x] Gesamtmassengrenze 10 kg fuer alle drei Schiffstypen geprueft.
- [x] Individuelle Rumpflaengen in JSON, Rigg, Anhaengen und Hydrostatik geprueft.
- [x] Asymmetrische Katamaran-/Trimaran-STEP-Dateien: OpenCascade-Abmessungen.
- [x] Electron: Einzellaengen bearbeiten, speichern und nach Neustart wiederherstellen.
- [x] PC-Ansicht mit 0,90/0,65/1,30 m Rumpflaengen: korrekte Gesamtlänge,
  geaenderte Canvas-Pixel, keine Szenenfehler und kein horizontaler Ueberlauf.
- [x] Abschliessende Gesamtsuite mit Einzellaengen: 68 Tests erfolgreich.
- [x] PC-Screenshots und Pixelpruefung fuer die neue Balancevorschau (1440 x 1000).
- [x] Produktionsbuild; nur Vite-Hinweis zum grossen Three.js-Bundle.
- [x] Electron: STEP-Dateidialog, Exportinhalt und Wandstaerken-Persistenz.
- [x] Desktop/Mobil: Screenshots, Canvas-Pixel, Bedienbarkeit und Ueberlaeufe.
- [x] Browser-Exportpfad: Blob, Dateiname, STEP-Header, mm und Volumenkoerper.
- [x] Migration echter Version-1-Dateien mit und ohne Foils testen.
- [ ] Schleppversuche und CAD-Wandabstaende an Bug/Kanten fachlich validieren.

Die analytischen Tests bestaetigen Implementierungskonsistenz, keine
experimentell belegte Geschwindigkeits- oder Fertigungsprognose.

Visuell geprueft bei 1440 x 1000 und 390 x 844: kein horizontaler Ueberlauf,
keine Szenenfehler. WebGL-Pixel: 5559 verschiedene Desktop-Farben, 2091 mobil.
Kamerawechsel aendert den Pixel-Hash. Im integrierten Browser wurde kein echtes
Download-Ereignis geliefert; deshalb wurde dort der erzeugte Blob geprueft.
Der native Electron-Dateiexport wurde end-to-end getestet.

Balanceerweiterung: PC-Ansicht ohne horizontalen Ueberlauf oder Szenenfehler.
WebGL-Pixel bei unterschiedlichen Tempi: 3487 / 3497 verschiedene Farben,
unterschiedlicher Pixel-Hash. Fuenf Kraft-/Momentenlinien vorhanden; Play/Pause
aendert Werte und Szene, ohne die gespeicherte Entwurfsgeschwindigkeit zu aendern.
Neue Verifikation konzentriert sich gemaess Anforderung auf die PC-App.