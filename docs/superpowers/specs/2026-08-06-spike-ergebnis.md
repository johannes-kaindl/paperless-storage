# Spike-Ergebnis — trägt Obsidians PDF-Viewer im Embed-Adapter?

**Gemessen:** 2026-08-06 · **Obsidian 1.13.5** (Desktop, macOS 15.5) · Testvault `00_ProtoVault`
**Gate zu:** Aufgabe 2 des Plans `2026-08-05-paperless-storage-phase-1.md`

## Frage

> Lässt sich Obsidians nativer PDF-Viewer aus einem `embedRegistry`-Adapter heraus auf
> eine beliebige Datei im Vault ansetzen?

## Entscheidung

**Weg A trägt. Der Plan gilt.** Aufgabe 10 nutzt Obsidians eigenen PDF-Creator — pdf.js
wird nicht gebündelt, der Codeblock-Weg bleibt ungenutzt.

**Aber der Plan-Code für Aufgabe 10 ist so nicht lauffähig** — siehe „Zwei Befunde, die
Aufgabe 10 ändern". Beide sind gemessen, nicht vermutet.

## Vorgehen

Stub `_probe/probe.paperless`, fünfseitige `_probe/muster.pdf`, Notiz mit
`![[probe.paperless]]`. Gemessen über CDP gegen das laufende Obsidian
(`--remote-debugging-port=9222`), Messwerte aus `window.__paperlessSpike` und dem DOM —
nicht aus der Konsole abgetippt. Eine **fünfseitige** PDF ist Absicht: an einer
einseitigen wäre die Scroll-Frage nicht beantwortbar.

## Befunde

### Messung 0 — führt Obsidian `.paperless` überhaupt als Vault-Datei?

Ergänzung zum Plan. Trüge sie nicht, wären A und B irrelevant.

```
{"stubAlsVaultDatei":true,"linkAufloesung":"_probe/probe.paperless",
 "dateienImVault":10,"paperlessDateien":["_probe/probe.paperless"]}
```

**Ja — ohne jede Zusatzmaßnahme.** Eine unbekannte Endung wird als `TFile` geführt und
`![[probe.paperless]]` löst auf. `registerExtensions()` ist dafür **nicht** nötig; das
Flag `REGISTER_VIEW_EXTENSION` im Spike blieb auf `false`.

### Messung 1 — Registry

```
embedRegistry vorhanden: true
pdf-Creator vorhanden: true
bekannte Embed-Endungen: ["md","bmp","png","jpg","jpeg","gif","svg","webp","avif","mp3",
 "wav","m4a","3gp","flac","ogg","oga","opus","mp4","webm","ogv","mov","mkv","pdf",
 "canvas","base"]
```

### Weg A — Obsidians PDF-Creator mit unserer Datei

| Prüfpunkt | Befund |
|---|---|
| 1. PDF sichtbar? | **Ja** — Seiteninhalt im Embed, per Screenshot belegt |
| 2. Scrollbar? | **Ja** — `scrollTop` 0 → 1500 wirksam; `scrollHeight` 4581 gegen `clientHeight` 900 |
| 3. Zoom/Navigation? | **Ja** — 6 Toolbar-Schaltflächen, Seiteneingabefeld, Anzeige „von 5" |
| 4. Konsolenfehler? | **Keine** |
| 5. Lifecycle? | **Sauber** — Spike-Knoten 2 → 0 beim Schließen, 0 verbliebene PDF-Knoten |

Alle fünf Seiten sind als `.page` angelegt, gerendert werden sie lazy (2 von 5 mit
Inhalt) — das ist pdf.js' normales Verhalten, kein Mangel.

### Weg B — `MarkdownRenderer.render`

Lief ebenfalls und erzeugte einen Viewer („von 5", Toolbar), instanziierte aber nur
**eine** Seite gegen fünf bei Weg A. Wird nicht gebraucht; Weg A ist der direktere Weg
mit weniger Zwischenschichten.

### Mobile

**Ungemessen** — kein iPad/iPhone im Zugriff. `isDesktopOnly: true` bleibt im Manifest
stehen. Eine Vermutung wird nicht als Messung ausgegeben.

## Zwei Befunde, die Aufgabe 10 ändern

### 1. Der Rückgabewert des Embed-Creators muss eine `Component` sein

Der Spike-Code des Plans gibt ein Plain-Object zurück:

```typescript
registry.registerExtension("paperless", (ctx, _file) => ({ loadFile: () => { … } }));
```

Gemessene Folge:

```
TypeError: e.load is not a function
    at t.addChild (app://obsidian.md/app.js:1:727518)
    at Object.addChild (app://obsidian.md/app.js:1:2000073)
    at t.postProcess (app://obsidian.md/app.js:1:2001454)
    at e.onRender (app://obsidian.md/app.js:1:1971532)
```

Obsidian ruft `addChild()` auf dem Rückgabewert und damit dessen `load()`. Der Wurf
passiert in `postProcess` — **die gesamte Notiz rendert daraufhin nicht mehr**, nicht nur
das Embed. Eine leere Seite ist das Symptom, und sie sieht aus wie „das Embed geht
nicht", ist aber ein abgerissener Renderdurchlauf.

Aufgabe 10 trifft das nicht: `PaperlessEmbed extends MarkdownRenderChild` ist korrekt.
Der Fehler steckt nur im Spike-Code der Aufgabe 2.

### 2. Die PDF-Component muss als Kind registriert werden — sonst bleibt sie leer

Das ist der Befund, der Aufgabe 10 **wirklich** betrifft. `showPdf()` steht dort so:

```typescript
const child = creator({ app, containerEl, linktext: file.path, sourcePath: file.path }, file);
child.loadFile();
```

So gemessen: `threw: false` — und `innerHTMLLength: 0`. Der Creator läuft durch und
rendert **nichts**, weil Obsidians PDF-Viewer sein DOM erst in `onload()` aufbaut und
`loadFile()` allein das nicht auslöst. Erst mit

```typescript
this.addChild(child as unknown as MarkdownRenderChild);
child.loadFile();
```

entstand der Viewer: `innerHTMLLength` 8991, `pdf-toolbar` + `pdf-container`, 5 Seiten.

**Konsequenz für Aufgabe 10:** `showPdf()` braucht Zugriff auf den `MarkdownRenderChild`,
um `addChild()` aufrufen zu können. Als freie Funktion mit nur `app` und `containerEl`
kann sie das nicht — die Signatur muss den Render-Child mitführen. Ohne diese Änderung
zeigt das Plugin einen leeren Rahmen und wirft dabei keinen Fehler, der die Ursache
verriete.

## Fallstricke der Messung selbst

Beide haben je einen Anlauf gekostet und gehören in jeden künftigen CDP-Treiber:

- **Obsidian hält ein zweites Target mit demselben Vault-Titel**, `url: about:blank`, in
  dem `window.app` nicht existiert. Wer nur nach Titel filtert, misst dort und liest
  `app is not defined` als Befund. Richtig ist zusätzlich
  `url.startsWith("app://obsidian.md")`.
- **Im Quelltext-Modus rendert Obsidian keine Embeds.** Eine über CDP geöffnete Notiz
  landet im zuletzt genutzten Modus; ohne `mode: 'preview'` misst man „kein Embed" und
  hält es für ein Ergebnis.

## Reproduktion

Treiber und Spike-Code sind Wegwerf-Werkzeug (Scratchpad dieser Session). Der getrackte
GUI-Smoke-Treiber ist Phase-2-Thema über den Dach-Skill `gui-smoke-setup` — hier
bewusst nicht vorgezogen.

```bash
osascript -e 'quit app "Obsidian"' && open -a Obsidian --args --remote-debugging-port=9222
npm run build && cp main.js manifest.json "$OBSIDIAN_PLUGIN_DIR/paperless-storage/"
```
