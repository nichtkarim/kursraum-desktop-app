# Kursraum – lokale Kursplattform

Electron-Desktop-App mit React und Vite: Die vorhandene Ordnerstruktur wird zur responsiven Kursbibliothek. **Keine Anmeldung, keine Cloud-Uploads.** Dateien bleiben an ihrem bisherigen Ort.

## Voraussetzungen und Schnellstart

- Node.js **20+** und npm, Windows/macOS/Linux mit Desktop-Umgebung
- Leserechte auf den Ordner `Kurse`

```bash
npm install
npm start
```

`npm start` startet Vite ausschließlich auf `127.0.0.1:5173` und anschließend Electron. In der App den **Ordner `Kurse` selbst** wählen. Die Beispieldaten unter `example/Kurse` können direkt gewählt werden. Das erste `npm install` lädt Programmabhängigkeiten aus npm, **keine Kursinhalte** werden hochgeladen. Der App-Betrieb selbst erfordert kein Internet.

Tests: `npm test` (Scanner, Kursindex, Sicherheit, Range-Requests).

## Produktions-Build und Installationspaket

```bash
npm install
npm run build
npm run preview:desktop
npm run dist
```

`preview:desktop` öffnet den gebauten Stand in Electron. `dist` erzeugt unter `release/` ein Paket für das aktuelle System: NSIS/Windows, DMG/macOS oder AppImage/Linux. Für andere Betriebssysteme empfiehlt sich jeweils eine passende Build-Umgebung. macOS kann für unsignierte Apps eine Sicherheitsfreigabe verlangen; bei öffentlicher Verteilung ist Signierung/Notarisierung erforderlich. `npm run build` allein erstellt lediglich das Frontend; im gewöhnlichen Browser funktioniert die App ohne Electron-Preload-API nicht.

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
- Helles/dunkles Theme, Schriftgröße und deutsche Oberfläche; lokale JSON-Persistenz im Electron-`userData`-Verzeichnis.

## Struktur im Repository

```text
electron/main.cjs      Electron-Lifecycle, IPC-API, sicherer Medien-Endpunkt
electron/preload.cjs   Eng begrenzte API für React
electron/scanner.cjs   Asynchroner Scanner, Typ- und Pfadprüfung
electron/library.cjs   Datei-Watcher, Kursindex, paginierte Suche
electron/range.cjs     Byte-Range-Prüfung für Videos und PDF
electron/store.cjs     Persistenz (Root, Einstellungen, Status, Notizen)
src/App.jsx           Kursübersicht, Navigation, Kapitel und Dateilisten
src/Preview.jsx       PDF-, DOCX-, Text-, Bild- und Video-Vorschau
src/styles.css        Responsives Design und Themes
example/Kurse/        Zwei Demo-Kurse, u. a. PDF, DOCX, JPG, TXT und MD
tests/                 Node.js-Tests
```

## Sicherheit, Performance, Grenzen

- Electron nutzt `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Der Renderer kann keine freien lokalen Dateipfade an den Medien-Endpunkt übergeben: nur IDs zuvor gescannter Dateien; vor jeder Ausgabe wird der reale Pfad erneut gegen den Kursroot geprüft. Externe Navigation und Netzwerkverbindungen aus dem App-Fenster sind gesperrt.
- Markdown-/DOCX-HTML wird mit DOMPurify bereinigt; Vorschau-Links werden nicht geöffnet. HTML, SVG und ausführbare Dateien erhalten **keine aktive Vorschau**; externes Öffnen geschieht nur nach einem bewussten Klick. Ein normaler Scan verändert Kursdateien nicht; die Download-Funktion speichert eine Kopie. Externes Öffnen kann Änderungen an Originaldateien durch andere Programme ermöglichen.
- Vorschau von TXT/MD auf **8 MB**, DOCX auf **12 MB** begrenzt; größere Dateien extern öffnen. Videos hängen von Chromium-Codecs ab. PDF wird Seite für Seite gerendert.
- Suche nach **Dateiinhalten/Volltext**, OCR, Transkription und Video-Thumbnails sind **nicht** implementiert. Sehr große Bibliotheken mit Hunderttausenden Dateien benötigen für optimale Leistung später SQLite/FTS und Listen-Virtualisierung. Die aktuelle Lösung hält den Index im Arbeitsspeicher und liefert Dateilisten in Seiten.
- Bei großen Ordnern zeigt der Scan die Anzahl bereits gelesener Elemente; eine Prozentzahl ist ohne vorab bekannte Gesamtzahl nicht seriös. Netzwerkfreigaben und fehlende Zugriffsrechte können Watcher-Ereignisse verzögern; dann „Ordner neu scannen“ wählen.
- Root-Pfad, Favoriten, Lesestatus, Notizen und Einstellungen werden unter `kursraum-settings.json` im persönlichen Electron-App-Daten-Ordner gespeichert. Keine Kursinhalte werden kopiert oder in eine Cloud übertragen. Bei mehreren Kursroots sind Status/Notizen pro Root getrennt.

Ein initiales lokales Git-Repository mit Commit liegt bei. Nach dem Entpacken sind `git status` und eigene Commits möglich.
