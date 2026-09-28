# Kursraum – lokale Kursplattform

Electron-Desktop-App mit React und Vite: Die vorhandene Ordnerstruktur wird zur responsiven Kursbibliothek. **Offline nutzbar, Nextcloud optional.** Du kannst deine lokalen Kursdateien direkt mit einem selbst gewählten Ordner deiner Nextcloud synchronisieren.

## Voraussetzungen und Schnellstart

- Node.js **20+** und npm, Windows/macOS/Linux mit Desktop-Umgebung
- Leserechte auf den Ordner `Kurse`

```bash
npm install
npm start
```

`npm start` startet Vite ausschließlich auf `127.0.0.1:5173` und anschließend Electron. In der App den **Ordner `Kurse` selbst** wählen. Die Beispieldaten unter `example/Kurse` können direkt gewählt werden. Das erste `npm install` lädt Programmabhängigkeiten aus npm, **keine Kursinhalte** werden hochgeladen. Der App-Betrieb selbst erfordert kein Internet.

Tests: `npm test` (Scanner, Kursindex, Videoabfolge, Range-Requests und Nextcloud-Abgleich gegen einen lokalen WebDAV-Testserver).

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
4. Deinen vorhandenen lokalen Kursordner prüfen oder mit **Lokalen Ordner auswählen** ändern. Auf beiden Seiten sollten die direkten Unterordner deine Kurse enthalten.
5. **Ordner verbinden und synchronisieren** starten. Neue und geänderte Dateien werden **in beide Richtungen** übertragen. Optional läuft der Abgleich alle fünf Minuten, solange Kursraum geöffnet ist und die verbundene lokale Bibliothek aktiv ist; außerdem gibt es **Jetzt synchronisieren** und **Synchronisierung stoppen**.

Der Nextcloud-Desktop-Client wird dafür nicht benötigt. Der Zugriff läuft über WebDAV direkt zwischen Kursraum und deiner gewählten Nextcloud. Die Oberfläche zeigt Fortschritt, aktuelle Datei, letzten Abgleich und Konflikte. Ein Wechsel zu einer anderen lokalen Bibliothek pausiert den automatischen Abgleich.

- Unterschiedliche Dateien am gleichen Pfad beim ersten Abgleich sowie beidseitige Änderungen werden als **Konflikt** angezeigt. Die vorhandenen Versionen bleiben erhalten. Benenne eine Version um, wenn beide behalten werden sollen, und gleiche erneut ab. Identische Dateien werden beim ersten Abgleich anhand ihres Inhalts verglichen; dabei kann einmalig ein zusätzlicher Download anfallen.
- **Löschungen werden nicht übertragen**: Auf einer Seite entfernte Dateien werden von der anderen Seite wieder ergänzt. Um eine Datei dauerhaft zu entfernen, lösche sie auf beiden Seiten, während der automatische Abgleich deaktiviert ist. Versteckte Dateien/Ordner werden ausgelassen; symbolische Links werden nicht synchronisiert.
- Downloads erfolgen zunächst in temporäre Dateien. Erst vollständige Downloads ersetzen die lokale Datei. Uploads prüfen die zuvor gelesene Serverversion, damit zwischenzeitliche Änderungen nicht überschrieben werden. Große Dateien werden gestreamt; das Upload-Limit deines Nextcloud-Servers gilt weiterhin (keine Nextcloud-Chunk-Uploads).
- Passwörter werden nur über den Betriebssystem-Schlüsselspeicher geschützt gespeichert (`safeStorage`). Ist kein sicherer Schlüsselspeicher verfügbar oder wird das Speichern abgewählt, gilt die Anmeldung nur für die laufende Sitzung. Dann ist beim nächsten Start eine erneute Anmeldung nötig.
- **Lesestatus, Favoriten und Notizen bleiben lokal**. „Verbindung entfernen“ entfernt die gespeicherte Anmeldung und Konfiguration; die Kursdateien auf beiden Seiten bleiben bestehen.
- HTTPS mit gültigem Zertifikat ist erforderlich; ausschließlich für lokale Tests ist HTTP auf Loopback-Adressen erlaubt. Die Bibliothek bleibt offline lesbar. Bei Netzwerkfehlern zeigt die App einen Fehler; ein weiterer Abgleich setzt anhand des gespeicherten Dateistands fort.

Grundlagen: [Nextcloud WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html), [App-Passwörter in Nextcloud](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html).

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
- Große, zentrierte Videoansicht (mit Esc schließbar); fertig abgespielte Videos werden automatisch als gelesen gespeichert. Nach 10 Sekunden startet das nächste Video in der Kapitelreihenfolge des Kurses, mit Countdown, „Jetzt abspielen“ und „Abbrechen“. Andere Dateitypen werden übersprungen; nach dem letzten Video stoppt die Wiedergabe.
- Direkte Nextcloud-Anmeldung mit Server-Ordnerbrowser, beidseitigem Datei-Abgleich, Fortschrittsanzeige, Konflikterkennung und optionalem automatischem Abgleich.
- Helles/dunkles Theme, Schriftgröße und deutsche Oberfläche; lokale JSON-Persistenz im Electron-`userData`-Verzeichnis.

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

### Automatisches DEB-Build-Skript

Unter Linux genügt `./scripts/build-deb.sh` (auch aus einem anderen Arbeitsordner mit vollständigem Pfad aufrufbar). Das Skript installiert die Abhängigkeiten aus der Lockdatei, führt die Tests aus und baut bei jedem Aufruf den aktuellen Stand als `release/kursraum-local_<Version>_amd64.deb`. Voraussetzung: Node.js ab Version 20, npm und Internetzugriff für noch nicht zwischengespeicherte Build-Abhängigkeiten. Bei Fehlern bricht das Skript ab; eine ältere DEB-Datei ist dann kein neuer erfolgreicher Build. Es installiert oder veröffentlicht das Paket nicht.

### Begleitdokumente zum Video

Im Videoplayer öffnet **Begleitmaterial öffnen** eine zusätzliche Dokumentansicht. Wähle ein Kapitel und eine PDF-, DOCX-, TXT-, Markdown- oder Bilddatei. Das Video läuft beim Öffnen, Wechseln und Schließen der Dokumentansicht weiter. Der Lernmodus nutzt die gesamte Fensterfläche. Video und Dokument bleiben nebeneinander; die Trennlinie oder der Regler „Aufteilung“ verändert ihre Breite. Metadaten und Dateiaktionen sind über den Info-Knopf erreichbar. PDFs passen sich an die Bereichsbreite an; der PDF-Zoom vergrößert kleine Schrift. Beim automatischen Wechsel zum nächsten Video bleibt das geöffnete Dokument erhalten; **Zum Kapitel des Videos** führt zu dessen Materialien.


## Roadmaps: mehrere Kurse als Lernpfad

**Roadmaps** ist ein zusätzlicher Eintrag in der Seitenleiste. Die Bibliothek und die Einzelkursansicht bleiben der normale Einstieg. Roadmaps sind optional; deine Kursdateien werden dabei nicht verändert.

1. **Neue Roadmap** wählen, einen Namen eingeben und mehrere vorhandene Kurse auswählen.
2. Kurse über die gepunktete Griffleiste verschieben. Den rechten Verbindungspunkt eines Kurses zum linken Punkt des Folgekurses ziehen. Doppelte Verbindungen und Kreise werden verhindert. Mit **Anordnen** wird der Graph automatisch aufgeräumt.
3. Ein Klick auf Cover/Titel oder Enter auf einem fokussierten Knoten öffnet den bestehenden Kurs. **Kapitel** klappt die Kapitel auf; ein Kapitel lässt sich direkt öffnen. Über **Roadmaps** kehrst du zum zuletzt geöffneten Graphen zurück.
4. Rechtsklick oder der Eigenschaftenknopf öffnet Lernziel, Dauer in Minuten, Notizen, Startdatum, Pflicht/optional, Meilenstein und Checkpoint. Dort lassen sich Kurse auch per Auswahlfeld verbinden. Verbindungslinie anklicken, um ihren Hinweis zu bearbeiten oder sie zu entfernen.
5. **Pfad markieren** aktivieren und einen Startkurs sowie direkt verbundene Folgekurse anklicken. **Pfad starten** öffnet die Sequenz; in der Kursansicht navigieren **Zurück / Nächster Kurs** zwischen den Stationen. Ohne markierten Pfad startet **Reihenfolge starten** die topologisch sortierte Gesamtfolge. Der Wechsel zwischen Kursen erfolgt bewusst per Knopf, nicht über einen zusätzlichen Wiedergabetimer.

**Fortschritt und Empfehlungen:** Gelesene Materialien aktualisieren die Prozentanzeigen live. Ein Kurs mit vollständig gelesenen Materialien oder manuell erreichtem Checkpoint gilt in der Roadmap als abgeschlossen. Der Checkpoint verändert keine Dateilesestatus. Jede Verbindung ist eine Voraussetzung: Erst nach Abschluss aller direkten Vorgänger und Erreichen eines optionalen Startdatums wird eine Station empfohlen. Pflichtstationen werden bevorzugt. Hinweise an Verbindungen sind Beschreibungen, keine ausführbaren Regeln. Du kannst Kurse jederzeit trotzdem öffnen.

**Speichern und Zuordnung:** Änderungen werden lokal in `kursraum-roadmaps.json` im Electron-Benutzerverzeichnis gespeichert, getrennt von Kursordnern und Nextcloud. Ein Speicherindikator zeigt Fehler an. Der Name oben ist editierbar. Löschen entfernt nur die Roadmap. Weil Kurs-IDs vom Ordner abhängen, erscheinen umbenannte/verschobene Kurse zunächst als fehlend. Über **Eigenschaften → Kurs zuordnen** wird die Referenz repariert; Position, Verbindungen und eigene Notizen bleiben erhalten.

**JSON-Import/-Export:** Export speichert Titel, Kursnamen, Knotenpositionen, Metadaten, Verbindungen und markierte Pfade. Kursdateien, Coverdateien, absolute Ordnerpfade und interne Kurs-IDs werden nicht automatisch exportiert. Vor dem Export erinnert ein Dialog daran, eigene Texte auf private Angaben zu prüfen. Import erstellt immer eine neue Roadmap und ordnet eindeutig passende Kursnamen zu. Fehlende Kurse können anschließend manuell zugeordnet werden. Importierte Daten werden geprüft (Version, Größe, IDs, Verbindungen, Kreise); es wird kein Code daraus ausgeführt. Roadmap-Daten werden nicht hochgeladen.

**Beispiel:** `example/Kurse` als Bibliotheksordner auswählen und [example/roadmap-server.json](example/roadmap-server.json) importieren. Das Beispiel enthält vier Kurse, eine dreistufige Hauptfolge und einen optionalen Seitenpfad.

**Darstellung und Performance:** Mausrad zoomt, Ziehen auf freier Fläche verschiebt die Ansicht. Die Knöpfe links unten zoomen und passen alles ein; die Minimap ist ebenfalls bedienbar. Mit **Kompakt** werden Cover und Ziele ausgeblendet. Für mehr als 80 Knoten ist das zunächst aktiviert. Nur sichtbare Knoten werden gerendert; Cover werden als lokal erzeugte Miniaturen mit begrenztem Cache geladen. Maximal 500 Knoten, 2000 Verbindungen und 2 MB pro Roadmap; maximal 200 gespeicherte Roadmaps. **Weniger Effekte** wird dauerhaft gespeichert; die systemweite Einstellung für reduzierte Bewegung wird zusätzlich respektiert. Dark/Light folgt der App-Einstellung. Tab/Enter, Pfeiltasten und die Auswahlfelder ermöglichen Grundinteraktionen ohne Maus.

### Entwicklung und Tests

- `npm test`: Kernlogik einschließlich Roadmap-Persistenz, Validierung, Empfehlungen, Kursauflösung und großer Graphen.
- `npm run test:roadmap:ui`: echter Electron-Test in isoliertem temporärem Profil; benötigt einen grafischen Linux-Desktop (oder Xvfb). Testet Erstellen, Ziehen, Verbindungen, Eigenschaften, Kapitel, Tastatur, Kursnavigation, Fortschritt, Pfadfolge, Import/Export, Themes und 60 Knoten. Der Test ersetzt native Dateidialoge durch temporäre Testpfade; er verändert keine vorhandenen Benutzerdaten. Screenshots werden in `docs/roadmap` aktualisiert.
- Backend: `electron/roadmap-manager.cjs` (validiertes Modell und lokale Speicherung), `electron/roadmap-api.cjs` (IPC und native Dateidialoge).
- Frontend: `src/roadmap/RoadmapAPI.js`, `RoadmapView.jsx`, `CourseNode.jsx`. React Flow wird erst beim Öffnen der Roadmaps geladen.

### Demo in Bildern

[Roadmap erstellen](docs/roadmap/01-erstellen.png) · [Knoten und Verbindungen](docs/roadmap/02-graph.png) · [Kurs öffnen](docs/roadmap/03-kurs-oeffnen.png) · [Helles Theme](docs/roadmap/04-hell.png) · [Kleines Fenster](docs/roadmap/05-kleines-fenster.png) · [60 Knoten](docs/roadmap/06-sechzig-knoten.png)
