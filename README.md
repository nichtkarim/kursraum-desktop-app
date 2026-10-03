# Kursraum – lokale Kursplattform

Electron-Desktop-App mit React und Vite: Die vorhandene Ordnerstruktur wird zur responsiven Kursbibliothek. **Offline nutzbar, Nextcloud optional.** Du kannst deine lokalen Kursdateien direkt mit einem selbst gewählten Ordner deiner Nextcloud synchronisieren oder Videos auf Wunsch direkt aus Nextcloud streamen.

## Voraussetzungen und Schnellstart

- Node.js **20+** und npm, Windows/macOS/Linux mit Desktop-Umgebung
- Leserechte auf den Ordner `Kurse`

```bash
npm install
npm start
```

`npm start` startet Vite ausschließlich auf `127.0.0.1:5173` und anschließend Electron. In der App den **Ordner `Kurse` selbst** wählen. Die Beispieldaten unter `example/Kurse` können direkt gewählt werden. Das erste `npm install` lädt Programmabhängigkeiten aus npm, **keine Kursinhalte** werden hochgeladen. Der App-Betrieb selbst erfordert kein Internet.

Tests: `npm test` (Scanner, Kursindex, Lernpunkte, Videoabfolge, Range-Requests und Nextcloud-Abgleich gegen einen lokalen WebDAV-Testserver). `npm run test:reflections:ui` prüft die Lernreflexion in einer separaten Electron-Instanz mit temporären Testdaten, einschließlich Videoende, Speicherfehlern und Neustart.

## Produktions-Build und Installationspaket

```bash
npm install
npm run build
npm run preview:desktop
npm run dist
```

`preview:desktop` öffnet den gebauten Stand in Electron. `dist` erzeugt unter `release/` ein Paket für das aktuelle System: NSIS/Windows, DMG/macOS oder AppImage und DEB/Linux. Für andere Betriebssysteme empfiehlt sich jeweils eine passende Build-Umgebung. macOS kann für unsignierte Apps eine Sicherheitsfreigabe verlangen; bei öffentlicher Verteilung ist Signierung/Notarisierung erforderlich. `npm run build` allein erstellt lediglich das Frontend; im gewöhnlichen Browser funktioniert die App ohne Electron-Preload-API nicht.

### Debian-/Ubuntu-Paket

Mit `npm run dist:deb` wird ein installierbares Paket für **amd64 (Intel/AMD, 64 Bit)** erzeugt:

```bash
npm run dist:deb
sudo apt install ./release/kursraum-local_1.2.0_amd64.deb
```

Danach erscheint **Kursraum** mit eigenem Icon im Anwendungsmenü. Electron und die App-Dateien sind im Paket enthalten; Node.js und npm werden nur zum Bauen benötigt. Die Paketverwaltung installiert die notwendigen Systembibliotheken. Benutzerdaten und Kurse bleiben bei einem Paket-Update erhalten.

Videos lassen sich über **Vollbild**, das Symbol in der Videosteuerung oder per Doppelklick maximieren. **Esc** beendet den Vollbildmodus.

## Nextcloud direkt verbinden

1. In der Seitenleiste **Nextcloud** öffnen (auch unter **Einstellungen → Nextcloud**).
2. Die Basisadresse deiner Nextcloud, z. B. `https://cloud.example.org` oder `https://example.org/nextcloud`, Benutzername und **App-Passwort** eingeben. Das App-Passwort erstellst du in Nextcloud unter **Persönliche Einstellungen → Sicherheit**.
3. Nach der Anmeldung durch deine Nextcloud-Ordner navigieren. Der gerade geöffnete Ordner ist das Ziel; du kannst auch zu übergeordneten Ordnern zurückgehen.
4. Unter **Wie möchtest du Videos nutzen?** zwischen **Videos lokal synchronisieren** und **Videos direkt aus der Cloud streamen** wählen. Den lokalen Kursordner prüfen oder ändern; beim Streamen ohne vorhandenen Kursordner legt Kursraum automatisch einen Ordner für Begleitmaterial an. Auf beiden Seiten enthalten die direkten Unterordner die Kurse.
5. **Ordner verbinden und synchronisieren** beziehungsweise **Verbinden und Videos streamen** starten. Neue und geänderte Dateien werden **in beide Richtungen** übertragen; im Streamingmodus sind Videos davon ausgenommen. Optional läuft der Abgleich alle fünf Minuten, solange Kursraum geöffnet ist und die verbundene lokale Bibliothek aktiv ist; außerdem gibt es **Jetzt synchronisieren** und **Synchronisierung stoppen**.

Der Nextcloud-Desktop-Client wird dafür nicht benötigt. Der Zugriff läuft über WebDAV direkt zwischen Kursraum und deiner gewählten Nextcloud. Die Oberfläche zeigt Fortschritt, aktuelle Datei, letzten Abgleich und Konflikte. Ein Wechsel zu einer anderen lokalen Bibliothek pausiert den automatischen Abgleich.

- Unterschiedliche Dateien am gleichen Pfad beim ersten Abgleich sowie beidseitige Änderungen werden als **Konflikt** angezeigt. Die vorhandenen Versionen bleiben erhalten. Benenne eine Version um, wenn beide behalten werden sollen, und gleiche erneut ab. Identische Dateien werden beim ersten Abgleich anhand ihres Inhalts verglichen; dabei kann einmalig ein zusätzlicher Download anfallen.
- **Löschungen werden nicht übertragen**: Auf einer Seite entfernte Dateien werden von der anderen Seite wieder ergänzt. Um eine Datei dauerhaft zu entfernen, lösche sie auf beiden Seiten, während der automatische Abgleich deaktiviert ist. Versteckte Dateien/Ordner werden ausgelassen; symbolische Links werden nicht synchronisiert.
- Downloads erfolgen zunächst in temporäre Dateien. Erst vollständige Downloads ersetzen die lokale Datei. Uploads prüfen die zuvor gelesene Serverversion, damit zwischenzeitliche Änderungen nicht überschrieben werden. Große Dateien werden gestreamt; das Upload-Limit deines Nextcloud-Servers gilt weiterhin (keine Nextcloud-Chunk-Uploads).
- Passwörter werden nur über den Betriebssystem-Schlüsselspeicher geschützt gespeichert (`safeStorage`). Ist kein sicherer Schlüsselspeicher verfügbar oder wird das Speichern abgewählt, gilt die Anmeldung nur für die laufende Sitzung. Dann ist beim nächsten Start eine erneute Anmeldung nötig.
- **Lesestatus, Favoriten und Notizen bleiben lokal**. „Verbindung entfernen“ entfernt die gespeicherte Anmeldung und Konfiguration; die Kursdateien auf beiden Seiten bleiben bestehen.
- HTTPS mit gültigem Zertifikat ist erforderlich; ausschließlich für lokale Tests ist HTTP auf Loopback-Adressen erlaubt. Die Bibliothek bleibt offline lesbar. Bei Netzwerkfehlern zeigt die App einen Fehler; ein weiterer Abgleich setzt anhand des gespeicherten Dateistands fort.

Grundlagen: [Nextcloud WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html), [App-Passwörter in Nextcloud](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html).

### Videos wahlweise direkt aus der Cloud abspielen

In **Nextcloud → Wie möchtest du Videos nutzen?** kannst du den Modus auch nach der Einrichtung wechseln und mit **Videomodus speichern** übernehmen:

- **Videos lokal synchronisieren** ist die Voreinstellung. Videos werden wie die übrigen Kursdateien synchronisiert und sind anschließend offline verfügbar.
- **Videos direkt aus der Cloud streamen** nimmt Cloud-Videos in die Bibliothek auf, ohne sie herunterzuladen. Beim Abspielen werden die Videodaten direkt von Nextcloud an den Player weitergereicht. Vor- und Zurückspulen verwendet Byte-Range-Anfragen; es wird keine temporäre Videodatei angelegt. Der Player kennzeichnet diese Dateien als **Cloud-Stream**. Dieser Modus benötigt Internet und eine aktive Nextcloud-Anmeldung.

PDFs, Dokumente, Bilder und Kursbeschreibungen werden weiterhin synchronisiert. Bei der ersten Einrichtung im Streamingmodus ist kein eigener lokaler Kursordner erforderlich: Kursraum verwendet bei Bedarf einen Ordner unter seinem persönlichen App-Datenverzeichnis. Der gespeicherte Cloud-Katalog enthält nur Dateimetadaten. Dadurch bleiben Videos nach einem Neustart sichtbar; ohne gespeicherte Anmeldung musst du dich vor dem Abspielen erneut anmelden.

Bereits vorhandene lokale Videos werden beim Umschalten **nicht gelöscht oder verändert**. Während des Streamingmodus werden Videos weder herunter- noch hochgeladen; auch lokale Kopien werden nicht erneut ergänzt. Nach dem bewussten Wechsel zurück zur lokalen Synchronisierung werden Videos wieder regulär abgeglichen. Der Wechsel bewahrt Favoriten, Lesestatus, Reflexionen und Dienstleistungsideen derselben Bibliothek. Cloud-Zugangsdaten bleiben im Hauptprozess; der Player erhält keine Passwörter oder öffentlichen Freigabelinks.

Prüfen: `npm run test:cloud:ui` baut die App und testet Einrichtung, echte Streamingwiedergabe, Teilabrufe, Fehlerwiederholung, Reflexion, Neustart und Moduswechsel gegen einen lokalen WebDAV-Testserver. `npm test` deckt zusätzlich fehlende Videodownloads, Abbruch, Katalogzuordnung und HTTP-Antworten ab.

## App-Icon

Das eigene Kursraum-Icon kombiniert ein offenes Buch mit einem Play-Symbol auf einer violetten Kachel. Die skalierbare Quelle liegt in `public/kursraum-icon.svg`; `build/icon.png`, `build/icon.ico`, `build/icon.icns` und `build/icons/` enthalten die Desktop-Formate. Das Icon wird in der Seitenleiste, im App-Fenster und in neu gebauten Installationspaketen verwendet.

## Erwartete Ordnerstruktur

```text
Kurse/
├── Linux Grundlagen/
│   ├── description.md                  # optional, Kurzbeschreibung
│   ├── cover.jpg                       # optional, auch png/jpeg/webp
│   ├── 01 – Einstieg/
│   │   ├── Willkommen.md
│   │   └── Erste Schritte.txt
│   └── 02 – Shell/
│       ├── Terminal.mp4
│       ├── Befehle.pdf
│       └── Übungen/
│           └── Aufgabe.docx
└── Webdesign kompakt/
    └── Tag 1 – Grundlagen/
        └── Start.md
```

Jeder direkte Unterordner ist ein Kurs. Jeder weitere Unterordner (beliebige Tiefe) wird ein Kapitel. Dateien direkt im Kursordner erscheinen unter **Kursstart**; `description.md` und `cover.*` auf Kursebene dienen als Metadaten. Unicode-/Sonderzeichen sind zulässig; natürliche Sortierung ordnet „Tag 2“ vor „Tag 10“. Leere Kapitel werden angezeigt. Symlinks werden nicht verfolgt.

## Funktionen

- Rekursives asynchrones Scannen mit Datei-/Ordner-Fortschrittszähler; `chokidar`-Watcher aktualisiert einzelne Dateien bzw. neu angelegte Unterbäume; manueller Rescan.
- Kurskarten mit Cover, Beschreibung, Materialanzahl und Fortschritt; verschachteltes Inhaltsverzeichnis, Dateitypfilter und paginierte Dateiliste (60 Einträge pro Seite).
- Kursübergreifende Suche über **Kursnamen, Kapitelpfade und Dateinamen**; Favoriten und Lesestatus; abgeschlossene Kapitel und Notizen.
- PDF.js (PDF, seitenweise), Text/Markdown, Mammoth (DOCX), native Bilder/HTML5-Videos; Download-Kopie, externes Öffnen und Anzeige im Dateimanager.
- Große, zentrierte Videoansicht (mit Esc schließbar); fertig abgespielte Videos fragen mindestens zwei Lernpunkte und eine mögliche Dienstleistungsidee ab und werden erst nach dem Speichern als gelesen markiert. Anschließend startet nach 10 Sekunden das nächste Video in der Kapitelreihenfolge des Kurses, mit Countdown, „Jetzt abspielen“ und „Abbrechen“. Andere Dateitypen werden übersprungen; nach dem letzten Video stoppt die Wiedergabe.
- Direkte Nextcloud-Anmeldung mit Server-Ordnerbrowser, beidseitigem Datei-Abgleich, Fortschrittsanzeige, Konflikterkennung und optionalem automatischem Abgleich.
- Helles/dunkles Theme, Schriftgröße und deutsche Oberfläche; lokale JSON-Persistenz im Electron-`userData`-Verzeichnis.

### Reflexion und Dienstleistungsideen nach Videos

**Nur Videos** lösen die Pflichtreflexion aus – nach dem Abspielen oder beim manuellen Markieren als gelesen. Dokumente, PDFs, Bilder und Kapitel lassen sich ohne Reflexionsabfrage abschließen; freie Kapitelnotizen bleiben verfügbar.

Für ein Video hältst du fest:

- **Mindestens zwei unterschiedliche Lernpunkte** in eigenen Worten. Weitere Punkte lassen sich hinzufügen; leere oder doppelte Einträge zählen nicht.
- **Eine mögliche Dienstleistungsidee:** Was könntest du mit diesem Wissen theoretisch für andere anbieten?
- Optional: **Für wen?** und **Erster Umsetzungsschritt**, um die Idee konkreter zu machen.

Erst nach erfolgreichem Speichern gilt das Video als gelesen und der 10-Sekunden-Countdown zum nächsten Video beginnt. Abbrechen lässt das Video offen. Vorhandene vollständige Reflexionen können bei einer Wiederholung weiterverwendet werden; fehlen bei älteren Videos noch Ideen, werden die vorhandenen Lernpunkte zur Ergänzung vorgefüllt.

Unter **Reflexion & Ideen** in der Seitenleiste findest du dein Reflexionsbuch und eine eigene **Dienstleistungsideen**-Ansicht. Suche über Erkenntnisse, Ideen, Zielgruppen, Kurse und Videos, filtere nach Kurs, bearbeite deine Einträge oder öffne das zugehörige Video erneut. Im Videoplayer öffnet **Reflexion** den jeweiligen Eintrag direkt; dabei pausiert die Wiedergabe.

Die Einträge bleiben nach dem Zurücksetzen des Lesestatus und nach einem Neustart erhalten. Sie werden lokal in `kursraum-settings.json` gespeichert und nach Kursordner getrennt; Nextcloud synchronisiert sie nicht. Bestehender Fortschritt und ältere Lernpunkte zu Dokumenten oder Kapiteln bleiben erhalten und weiterhin in der Übersicht abrufbar.

## Struktur im Repository

```text
electron/main.cjs      Electron-Lifecycle, IPC-API, sicherer Medien-Endpunkt
electron/preload.cjs   Eng begrenzte API für React
electron/scanner.cjs   Asynchroner Scanner, Typ- und Pfadprüfung
electron/library.cjs   Datei-Watcher, Kursindex, paginierte Suche
electron/range.cjs     Byte-Range-Prüfung für Videos und PDF
electron/nextcloud*.cjs WebDAV, Synchronisierung und geschützte Anmeldung
electron/store.cjs     Persistenz (Root, Einstellungen, Status, Notizen)
src/App.jsx           Kursübersicht, Navigation, Kapitel und Dateilisten
src/Preview.jsx       PDF-, DOCX-, Text-, Bild- und Video-Vorschau
src/styles.css        Responsives Design und Themes
example/Kurse/        Zwei Demo-Kurse, u. a. PDF, DOCX, JPG, TXT und MD
tests/                 Node.js-Tests
```

## Sicherheit, Performance, Grenzen

- Electron nutzt `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Der Renderer kann keine freien lokalen Dateipfade an den Medien-Endpunkt übergeben: nur IDs zuvor gescannter Dateien; vor jeder Ausgabe wird der reale Pfad erneut gegen den Kursroot geprüft. Externe Navigation und Netzwerkverbindungen aus dem App-Fenster sind gesperrt. Nur der Hauptprozess greift für die ausdrücklich eingerichtete Nextcloud-Verbindung auf den ausgewählten Server zu; Weiterleitungen werden abgelehnt.
- Markdown-/DOCX-HTML wird mit DOMPurify bereinigt; Vorschau-Links werden nicht geöffnet. HTML, SVG und ausführbare Dateien erhalten **keine aktive Vorschau**; externes Öffnen geschieht nur nach einem bewussten Klick. Ein normaler Scan verändert Kursdateien nicht; die Download-Funktion speichert eine Kopie. Externes Öffnen kann Änderungen an Originaldateien durch andere Programme ermöglichen.
- Vorschau von TXT/MD auf **8 MB**, DOCX auf **12 MB** begrenzt; größere Dateien extern öffnen. Videos hängen von Chromium-Codecs ab. PDF wird Seite für Seite gerendert.
- Suche nach **Dateiinhalten/Volltext**, OCR, Transkription und Video-Thumbnails sind **nicht** implementiert. Sehr große Bibliotheken mit Hunderttausenden Dateien benötigen für optimale Leistung später SQLite/FTS und Listen-Virtualisierung. Die aktuelle Lösung hält den Index im Arbeitsspeicher und liefert Dateilisten in Seiten.
- Bei großen Ordnern zeigt der Scan die Anzahl bereits gelesener Elemente; eine Prozentzahl ist ohne vorab bekannte Gesamtzahl nicht seriös. Netzwerkfreigaben und fehlende Zugriffsrechte können Watcher-Ereignisse verzögern; dann „Ordner neu scannen“ wählen.
- Root-Pfad, Favoriten, Lesestatus, Notizen und Einstellungen werden unter `kursraum-settings.json` im persönlichen Electron-App-Daten-Ordner gespeichert. Ohne aktivierte Nextcloud-Verbindung werden keine Kursinhalte in eine Cloud übertragen. Bei mehreren Kursroots sind Status/Notizen pro Root getrennt.

Ein initiales lokales Git-Repository mit Commit liegt bei. Nach dem Entpacken sind `git status` und eigene Commits möglich.

### Roadmaps mit Verknüpfungen

Verbinde Kurse per Ziehen an den Verbindungspunkten oder über „Verbinden mit“ in den Eigenschaften. Wenn mehrere Verbindungen in einen Kurs führen, wähle dort unter **Verknüpfung**:

- **Und:** Alle Vorgänger müssen abgeschlossen sein (bisheriges Verhalten).
- **Oder:** Ein beliebiger abgeschlossener Vorgänger genügt.
- **Entweder oder:** Wähle genau einen Vorgänger als Variante. Nur dessen Abschluss schaltet die Empfehlung für den Zielkurs frei. Die Auswahl lässt sich später ändern.

Die Art der Verknüpfung steht einmal am Zielkurs. Seine eingehenden Linien haben dieselbe Farbe; einzelne Linien werden beim Darüberfahren hervorgehoben. Roadmaps speichern diese Einstellungen lokal und nehmen sie beim JSON-Export mit. Ein explizit markierter Pfad legt weiterhin die Abspielreihenfolge fest; „Reihenfolge starten“ ohne markierten Pfad umfasst alle Kurse der Roadmap.

### Automatisches DEB-Build-Skript

Unter Linux genügt `./scripts/build-deb.sh` (auch aus einem anderen Arbeitsordner mit vollständigem Pfad aufrufbar). Das Skript installiert die Abhängigkeiten aus der Lockdatei, führt die Tests aus und baut bei jedem Aufruf den aktuellen Stand als `release/kursraum-local_<Version>_amd64.deb`. Voraussetzung: Node.js ab Version 20, npm und Internetzugriff für noch nicht zwischengespeicherte Build-Abhängigkeiten. Bei Fehlern bricht das Skript ab; eine ältere DEB-Datei ist dann kein neuer erfolgreicher Build. Es installiert oder veröffentlicht das Paket nicht.

### Videoposition merken

Kursraum merkt sich die letzte Wiedergabeposition pro Video auf diesem Gerät – für lokale Dateien und Cloud-Streams. Beim erneuten Öffnen wird diese Position automatisch wiederhergestellt, auch nach einem App-Neustart. Während der Wiedergabe wird spätestens alle fünf Sekunden gespeichert, zusätzlich beim Pausieren, nach dem Spulen und beim Schließen. Das Desktop-Fenster wartet vor dem Schließen auf die Speicherung. Vollständig abgespielte Videos beginnen beim erneuten Öffnen am Anfang; Abschlussstatus und Reflexion bleiben erhalten.

`npm run test:video-progress:ui` prüft Fortsetzen, Zurückspulen, getrennte Videopositionen, regelmäßiges Speichern, Schließen während der Wiedergabe und Neustart mit einem temporären Profil. Der Cloud-Oberflächentest prüft auch das Fortsetzen gestreamter Videos.

### Begleitdokumente zum Video

`npm run test:companion:ui` prüft schmale Aufteilungen, Ziehen ohne leere PDF-Bilder, Zoom, Seitenwechsel und fortlaufende Videowiedergabe in einem isolierten Electron-Testprofil.

Im Videoplayer öffnet **Begleitmaterial öffnen** eine zusätzliche Dokumentansicht. Wähle ein Kapitel und eine PDF-, DOCX-, TXT-, Markdown- oder Bilddatei. Das Video läuft beim Öffnen, Wechseln und Schließen der Dokumentansicht weiter. Der Lernmodus nutzt die gesamte Fensterfläche. Video und Dokument bleiben nebeneinander; die Trennlinie oder der Regler „Aufteilung“ verändert ihre Breite. Metadaten und Dateiaktionen sind über den Info-Knopf erreichbar. PDFs passen sich an die Bereichsbreite an; der PDF-Zoom vergrößert kleine Schrift. Beim Ziehen der Trennlinie bleibt die bisherige PDF-Seite sichtbar, bis die neue Größe fertig gerendert ist. Beim automatischen Wechsel zum nächsten Video bleibt das geöffnete Dokument erhalten; **Zum Kapitel des Videos** führt zu dessen Materialien.


## Roadmaps: mehrere Kurse als Lernpfad

**Roadmaps** ist ein zusätzlicher Eintrag in der Seitenleiste. Die Bibliothek und die Einzelkursansicht bleiben der normale Einstieg. Roadmaps sind optional; deine Kursdateien werden dabei nicht verändert.

1. **Neue Roadmap** wählen, einen Namen eingeben und mehrere vorhandene Kurse auswählen.
2. Kurse über die gepunktete Griffleiste verschieben. Den rechten Verbindungspunkt eines Kurses zum linken Punkt des Folgekurses ziehen. Doppelte Verbindungen und Kreise werden verhindert. Mit **Anordnen** wird der Graph automatisch aufgeräumt.
3. Ein Klick auf Cover/Titel oder Enter auf einem fokussierten Knoten öffnet den bestehenden Kurs. **Kapitel** klappt die Kapitel auf; ein Kapitel lässt sich direkt öffnen. Über **Roadmaps** kehrst du zum zuletzt geöffneten Graphen zurück.
4. Rechtsklick oder der Eigenschaftenknopf öffnet Lernziel, Dauer in Minuten, Notizen, Startdatum, Pflicht/optional, Meilenstein und Checkpoint. Dort lassen sich Kurse auch per Auswahlfeld verbinden. Verbindungslinie anklicken, um ihren Hinweis zu bearbeiten oder sie zu entfernen.
5. **Pfad markieren** aktivieren und einen Startkurs sowie direkt verbundene Folgekurse anklicken. **Pfad starten** öffnet die Sequenz; in der Kursansicht navigieren **Zurück / Nächster Kurs** zwischen den Stationen. Ohne markierten Pfad startet **Reihenfolge starten** die topologisch sortierte Gesamtfolge. Der Wechsel zwischen Kursen erfolgt bewusst per Knopf, nicht über einen zusätzlichen Wiedergabetimer.

**Fortschritt und Empfehlungen:** Gelesene Materialien aktualisieren die Prozentanzeigen live. Ein Kurs mit vollständig gelesenen Materialien oder manuell erreichtem Checkpoint gilt in der Roadmap als abgeschlossen. Der Checkpoint verändert keine Dateilesestatus. Jede Verbindung ist eine Voraussetzung: Die gewählte Und-/Oder-/Entweder-oder-Regel und das optionale Startdatum bestimmen die Empfehlung. Pflichtstationen werden bevorzugt. Hinweise an Verbindungen sind Beschreibungen, keine ausführbaren Regeln. Du kannst Kurse jederzeit trotzdem öffnen.

**Speichern und Zuordnung:** Änderungen werden lokal in `kursraum-roadmaps.json` im Electron-Benutzerverzeichnis gespeichert, getrennt von Kursordnern und Nextcloud. Ein Speicherindikator zeigt Fehler an. Der Name oben ist editierbar. Löschen entfernt nur die Roadmap. Weil Kurs-IDs vom Ordner abhängen, erscheinen umbenannte/verschobene Kurse zunächst als fehlend. Über **Eigenschaften → Kurs zuordnen** wird die Referenz repariert; Position, Verbindungen und eigene Notizen bleiben erhalten.

**JSON-Import/-Export:** Export speichert Titel, Kursnamen, Knotenpositionen, Metadaten, Verbindungen und markierte Pfade. Kursdateien, Coverdateien, absolute Ordnerpfade und interne Kurs-IDs werden nicht automatisch exportiert. Vor dem Export erinnert ein Dialog daran, eigene Texte auf private Angaben zu prüfen. Import erstellt immer eine neue Roadmap und ordnet eindeutig passende Kursnamen zu. Fehlende Kurse können anschließend manuell zugeordnet werden. Importierte Daten werden geprüft (Version, Größe, IDs, Verbindungen, Kreise); es wird kein Code daraus ausgeführt. Roadmap-Daten werden nicht hochgeladen.

**Beispiel:** `example/Kurse` als Bibliotheksordner auswählen und [example/roadmap-server.json](example/roadmap-server.json) importieren. Das Beispiel enthält vier Kurse, eine dreistufige Hauptfolge und einen optionalen Seitenpfad.

**Darstellung und Performance:** Mausrad zoomt, Ziehen auf freier Fläche verschiebt die Ansicht. Die Knöpfe links unten zoomen und passen alles ein; die Minimap ist ebenfalls bedienbar. **Ansicht zentrieren** holt alle Stationen ins Bild. Eine beim Öffnen vollständig außerhalb liegende Ansicht wird automatisch zentriert. **Anordnen** verteilt Kurse nach Abhängigkeiten mit Platz für ausgeklappte Kapitel und Verbindungslinien. Linien haben getrennte Anschlusspunkte, umgehen dazwischenliegende Karten und lassen sich per Klick einzeln auswählen. Mit **Kompakt** werden Cover und Ziele ausgeblendet. Für mehr als 80 Knoten ist das zunächst aktiviert. Knoten bleiben beim Speichern, Zoomen und Verschieben stabil eingebunden; Cover werden als lokal erzeugte Miniaturen mit begrenztem Cache geladen. Maximal 500 Knoten, 2000 Verbindungen und 2 MB pro Roadmap; maximal 200 gespeicherte Roadmaps. **Weniger Effekte** wird dauerhaft gespeichert; die systemweite Einstellung für reduzierte Bewegung wird zusätzlich respektiert. Dark/Light folgt der App-Einstellung. Tab/Enter, Pfeiltasten und die Auswahlfelder ermöglichen Grundinteraktionen ohne Maus.

### Entwicklung und Tests

- `npm test`: Kernlogik einschließlich Roadmap-Persistenz, Validierung, Empfehlungen, Kursauflösung und großer Graphen.
- `npm run test:roadmap:ui`: echter Electron-Test in isoliertem temporärem Profil; benötigt einen grafischen Linux-Desktop (oder Xvfb). Prüft zusätzlich auf Flackern bei wiederholtem Speichern und Bibliotheksaktualisierungen, freie Linienwege und Wiederherstellung einer außerhalb liegenden Ansicht. Testet Erstellen, Ziehen, Verbindungen, Eigenschaften, Kapitel, Tastatur, Kursnavigation, Fortschritt, Pfadfolge, Import/Export, Themes und 60 Knoten. Der Test ersetzt native Dateidialoge durch temporäre Testpfade; er verändert keine vorhandenen Benutzerdaten. Screenshots werden in `docs/roadmap` aktualisiert.
- Backend: `electron/roadmap-manager.cjs` (validiertes Modell und lokale Speicherung), `electron/roadmap-api.cjs` (IPC und native Dateidialoge).
- Frontend: `src/roadmap/RoadmapAPI.js`, `RoadmapView.jsx`, `CourseNode.jsx`. React Flow wird erst beim Öffnen der Roadmaps geladen.

### Demo in Bildern

[Roadmap erstellen](docs/roadmap/01-erstellen.png) · [Knoten und Verbindungen](docs/roadmap/02-graph.png) · [Kurs öffnen](docs/roadmap/03-kurs-oeffnen.png) · [Helles Theme](docs/roadmap/04-hell.png) · [Kleines Fenster](docs/roadmap/05-kleines-fenster.png) · [60 Knoten](docs/roadmap/06-sechzig-knoten.png)
