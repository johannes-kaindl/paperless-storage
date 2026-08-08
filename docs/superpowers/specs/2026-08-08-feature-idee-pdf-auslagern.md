# Feature-Idee: „Nach paperless auslagern"

**Status: Idee, keine Spec.** Festgehalten am 2026-08-08, damit der Kontext nicht verlorengeht.
Der Weg zur Umsetzung ist `superpowers:brainstorming` → `writing-plans`, nicht direkt Code.

## Die Idee

Ein Befehl im Kontextmenü einer PDF-Datei im Vault: **„Nach paperless auslagern"**.

1. Die Datei per `POST /api/documents/post_document/` hochladen.
2. Auf die Konsumierung warten, die Dokument-ID holen.
3. Einen `.paperless`-Stub daneben anlegen (`serializeStub`, `uniqueStubPath` — beides liegt bereits in `src/core/stub.ts`).
4. Einbettungen der alten Datei auf den Stub umbiegen.
5. Das Original in den Obsidian-Papierkorb (`FileManager.trashFile()`, nicht `Vault.delete()` — siehe `aab247a`).

Damit schließt sich der Kreis: Das Plugin kann Dokumente bisher nur **einfügen**, nicht **hineingeben**.

## Warum jetzt nur eine Idee und kein Plan

Parallel steht die **Bestandsmigration** an — die PDFs, die heute schon im Vault liegen. Die wird
bewusst **als Skript außerhalb des Plugins** gebaut, nicht als Massenfeature hier drin:

- Die Migration läuft genau einmal; ein Massenoperations-Feature bliebe für immer im Store-Plugin
  und erzeugt Review- und Supportlast für etwas, das niemand zweimal braucht.
- Sie braucht Trockenlauf, Wiederaufnahme und ein Protokoll. Ein Obsidian-Befehl kann das schlecht:
  keine Wiederaufnahme nach Abbruch, blockierte UI bei hundert Dateien.
- Als Skript läuft sie gegen einen committeten Vault — `git checkout` ist die Rückabwicklung.

**Die Reihenfolge ist der eigentliche Punkt:** Erst das Skript bauen, dabei lernen, welche
Handgriffe sich wirklich lohnen — und *danach* den Einzelfall hier umsetzen. Mit Erfahrung statt
mit Vermutung. Wer das Feature vorher baut, rät.

Entscheidungsgrundlage und offene Fragen der Migration liegen im Vault:
`10_Pallas/60_Bereiche/70_Lernen/paperless-ngx/Vorüberlegung — PDF-Migration in den Vault.md`

## Was vor einer Spec zu klären ist

1. **Was passiert mit dem Original?** Papierkorb, löschen oder liegen lassen — ein PDF in paperless
   *und* im Vault ist ein Duplikat mit zwei Wahrheiten. Wahrscheinlich eine Einstellung, aber welcher
   Default?
2. **Wie zuverlässig ist Schritt 4?** Einbettungen umbiegen heißt fremde Notizen ändern. Obsidian
   kennt die Backlinks über `MetadataCache` — trägt das für alle Link-Formen (`![[x.pdf]]`,
   `[[x.pdf|Alias]]`, Markdown-Links, `#page=3`)?
3. **Der Upload ist asynchron.** paperless quittiert mit einer Task-UUID, nicht mit der Dokument-ID.
   Wie lange wird gewartet, was passiert bei Zeitüberschreitung, und was, wenn die Konsumierung
   *danach* scheitert? Der Stub zeigt sonst auf ein Dokument, das es nie gab.
4. **Duplikate.** paperless führt ein Duplikat als `failure` mit `duplicate_of` im Ergebnis. Das ist
   kein Fehler, sondern ein brauchbares Signal: Der Stub könnte auf das bestehende Dokument zeigen,
   statt abzubrechen.
5. **Rechte und Eigentümer.** Der Upload läuft mit dem konfigurierten API-Token; paperless trägt
   dessen Benutzer als Eigentümer ein. Bei geteilten Instanzen ist das eine bewusste Entscheidung.

## Hinweise aus dem Betrieb (2026-08-08)

- **Ein API-Token pro Benutzer.** Django REST Framework führt genau einen; Plugin und andere Clients
  teilen ihn sich zwangsläufig. Ein Zurücksetzen bricht alle gleichzeitig.
- **Zwei-Faktor betrifft den Token nicht.** TOTP schützt die Weboberfläche; Token-Zugriffe umgehen es
  absichtlich — sonst könnte das Plugin nicht arbeiten.
- **`/api/documents/<id>/download/` fällt bei fehlender Archivdatei automatisch aufs Original
  zurück.** Verifiziert: Bei einem PDF ohne Archivversion liefern beide Varianten dasselbe Dokument.
  `fileVersion: "archive"` ist deshalb ein sicherer Default.
