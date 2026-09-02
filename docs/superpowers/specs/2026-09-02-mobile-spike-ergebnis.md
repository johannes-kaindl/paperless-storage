# Mobile-Spike — Ergebnis

**Datum:** 2026-09-02 · **Status:** abgeschlossen, Gate offen → geschlossen
**Frage:** Trägt paperless-storage auf Mobilgeräten — und wenn ja, was kostet es?

## Antwort

**Ja, ohne eine Zeile Code.** `isDesktopOnly` steht seit dem 2026-09-02 auf `false`.

Der Flag war seit dem 2026-08-06 auf `true`, **ohne je gemessen worden zu sein**: beim
ersten Spike fehlte ein Testgerät, der Wert blieb vorsorglich stehen und überlebte danach
jeden Handoff, weil er in keiner Task lag.

## Die vier Belege, in der Reihenfolge ihrer Beweiskraft

**1 · Der Code zwingt zu nichts** (statisch, hier gemessen). `src/` enthält keine Node-
oder Electron-API, keinen `Platform.`-Zweig, kein `basePath`. Netzwerk läuft über
`requestUrl` (PROF-OBS-12), der Cache über `vault.createBinary`/`modifyBinary`/
`createFolder` — reine Vault-API. Es gab also nie eine technische Sperre, nur eine
unbelegte Zusage im Manifest.

**2 · Zwei Nachbarplugins belegen die beiden riskanten Teile einzeln.**

| Plugin | belegt | wie |
|---|---|---|
| `ryotaushio/obsidian-pdf-plus` | `embedRegistry` existiert auf Mobile | greift in `registerPDFEmbedCreator()` **ohne Feature-Detection** direkt auf `app.embedRegistry.embedByExtension.pdf` zu und ist `isDesktopOnly: false` — fehlte die API dort, stürbe es beim Laden |
| `Talal-A/obsidian-paperless` | der paperless-Netzwerkweg trägt auf Mobile | holt Dokumente per `requestUrl` mit `Authorization: token …` aus paperless-ngx, ebenfalls `isDesktopOnly: false` |

Drei weitere PDF-Plugins gemessen (`oz-image-in-editor`, `obsidian-annotator`,
`better-pdf-plugin`) — alle `isDesktopOnly: false`.

**3 · Eigener Lauf im Mobile-Modus.** Zweite Obsidian-Instanz mit eigenem Profil auf Port
9333 (die reguläre Instanz und ihre acht fremden Vault-Fenster blieben unberührt:
8 vorher, 8 nachher), dann `app.emulateMobile(true)`. Ergebnis: `app.isMobile` → `true`,
`embedByExtension.pdf` → `function`, Plugin lädt, und `![[…​.paperless]]` rendert —
1 Embed-Knoten, 2 PDF-Container, 3 canvas/iframe.

**4 · Der Lauf auf dem echten Gerät** (Maintainer, iOS, KugeVault): Plugin erscheint,
lässt sich aktivieren und konfigurieren, das Dokument rendert inline. **Das ist der
Beleg, der die Umstellung trägt** — die drei davor haben nur entschieden, ob er sich
lohnt.

## Was die Emulation NICHT beantwortet hat (und warum Beleg 4 nötig war)

- `app.emulateMobile` schaltet Plattform-Flags und Layout um, **läuft aber weiter auf
  Desktop-Chromium**. iOS-WebView-Eigenheiten, Speicherlimits und Touch-Bedienung des
  Viewers bleiben darin ungemessen.
- `requestUrl` ist auf Mobile **nativ** implementiert; im Emulationsmodus lief die
  Electron-Fassung. Der mobile Netzwerkweg war damit durch Beleg 2 gestützt, nicht durch
  Beleg 3.
- Dass das Plugin unter Emulation trotz `isDesktopOnly: true` lud, beweist nichts: der
  Modus prüft den Flag nicht. Auf einem echten Gerät wäre es gar nicht angeboten worden —
  deshalb trug das Sideload-Paket für Beleg 4 bereits `false`.
- Die Zweitinstanz lief mit Obsidian 1.12.4 (frisches Profil = gebündelter
  Installer-Stand), nicht 1.13.7 wie die reguläre. `minAppVersion` ist 1.8.7.

## Methodische Notiz

Die Sonde war **Wegwerfcode** und liegt nicht im Repo — ihr Ergebnis ist eine Antwort,
kein Werkzeug. Beim Schreiben trat die bekannte Falle der zentralen Brücke auf:
`pollUntil` nimmt `(cdp, expression, timeoutMs, stepMs)` und pollt auf truthy, **kein**
Prädikat-Callback. Falsch aufgerufen liefert es still `null` — die Sonde hätte „rendert
nicht" gemeldet, und der Spike wäre mit dem falschen Ergebnis ausgegangen.
