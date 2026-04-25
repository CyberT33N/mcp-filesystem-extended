# CONVENTIONS — `count-lines` Domain Handler

## Zweck dieses Dokuments

Dieses Dokument legt die architektonellen Konventionen, Designentscheidungen und Erweiterungsverbote für den `count-lines`-Endpunkt fest. Es dient als verbindliche Referenz für alle zukünftigen Entwicklungen in diesem Verzeichnis.

---

## Vertragsdefinition — Was dieser Endpunkt ist

Der `count-lines`-Endpunkt hat **eine einzige, klar definierte Verantwortlichkeit**:

> **Er zählt Zeilen. Er gibt zurück, wie viele es sind.**

Das ist der vollständige und unveränderliche Vertrag dieses Endpunkts. Alle Designentscheidungen leiten sich aus diesem Vertrag ab.

### Aktueller Response (architektonisch korrekt)

```
count_lines

{
  "paths": ["src/application/server/server-instructions.ts"],
  "recursive": false,
  "regex": "preview-first|task-backed"
}

Line counts:

C:\...\server-instructions.ts: 40 lines total, 3 matching lines

Total: 1 files, 40 lines, 3 matching lines
```

Dieser Response ist **vollständig und korrekt** — er erfüllt exakt seinen Vertrag.

---

## Architektonische Entscheidung — Keine Erweiterung um Zeilenpositionen

### Was abgelehnt wurde

Ergänzung des Response um die konkreten Zeilennummern der Matches, z. B.:

```
# ABGELEHNT — nicht Teil des Vertrags
matching_lines: [20, 30, 45]
```

### Warum das architektonisch falsch wäre

#### 1. Single Responsibility Principle (SRP)

Der Endpunkt würde gleichzeitig zwei verschiedene Verantwortlichkeiten übernehmen:

| Verantwortlichkeit | Gehört zu |
|---|---|
| **Aggregation** — Wie viele Zeilen matchen? | `count_lines` ✅ |
| **Lokalisation** — Wo befinden sich die Matches? | `search_file_contents_by_*` ✅ |

Ein Tool, das zählt **und** lokalisiert, verletzt SRP. Die Verantwortlichkeiten sind semantisch verschieden:
- *Zählen* ist eine **quantitative Aggregation** — das Ergebnis ist eine Zahl.
- *Lokalisieren* ist eine **Enumeration mit Positions-Metadaten** — das Ergebnis ist eine geordnete Liste mit Koordinaten.

#### 2. Vertragsdrift (Contract Drift)

Der Name `count_lines` beschreibt Aggregation. Sobald Positionen hinzukommen, beginnt der Endpunkt semantisch in Richtung eines `search`-Endpunkts zu driften. Diese Drift ist nicht reversibel:

```
Schritt 1: count_lines → Zeilenpositionen hinzufügen
Schritt 2: Nächste Anfrage → "Kannst du auch den Inhalt zeigen?"
Schritt 3: count_lines wird zu einem zweiten search-Endpunkt

→ RESULT: Architektonische Redundanz, unklare Verantwortlichkeit
```

#### 3. Redundanz mit bestehenden Endpunkten

Der MCP-Server stellt bereits dedizierte Endpunkte bereit, die Positionen **und** Inhalt liefern:

```
search_file_contents_by_regex       → Treffer + Zeilennummern + Kontext
search_file_contents_by_fixed_string → Treffer + Zeilennummern + Kontext
```

Das Duplizieren dieser Funktionalität in `count_lines` würde eine **unkontrollierte Überschneidung** der Tool-Verträge erzeugen.

#### 4. Falsche Tool-Selektion als eigentliches Problem

Wenn ein Agent nach einem `count_lines`-Aufruf fragt *„aber an welcher Zeile genau?"*, ist das **kein Zeichen, dass `count_lines` erweitert werden muss**. Es ist ein Zeichen, dass das **falsche Tool für die eigentliche Absicht gewählt wurde**.

Die Absicht war eine **Suche**, keine Zählung. Der korrekte Endpunkt wäre von Anfang an `search_file_contents_by_regex` gewesen.

---

## Architektonische Entscheidung — Keine Erweiterung um Inhalt (Content)

### Was abgelehnt wurde

Ergänzung des Response um den tatsächlichen Inhalt der gematchten Zeilen, z. B.:

```
# ABGELEHNT — klarer Vertragsbruch
matched_content:
  - line 20: "preview-first delivery..."
  - line 30: "task-backed streaming..."
```

### Warum das ein Vertragsbruch wäre

Das Zurückgeben von Inhalt bedeutet gleichzeitig eine **Read-Operation** durchzuführen. Damit würde `count_lines` drei verschiedene Verantwortlichkeiten in sich vereinen:

```
count_lines  +  content  =  Count + Read + Search

→ SRP-Verletzung: ~95% architektonisch falsch
```

Die MCP-Server-Architektur trennt diese Verantwortlichkeiten explizit:

| Operation | Verantwortlicher Endpunkt |
|---|---|
| **Zählen** | `count_lines` |
| **Lesen** | `read_file_content`, `read_files_with_line_numbers` |
| **Suchen** | `search_file_contents_by_regex`, `search_file_contents_by_fixed_string` |

---

## Entscheidungsmatrix — Finale Übersicht

| Erweiterungskandidat | Entscheidung | Begründung |
|---|---|---|
| Zeilenpositionen der Matches | **ABGELEHNT** | SRP-Verletzung, Vertragsdrift, Redundanz mit `search_*` |
| Inhalt der gematchten Zeilen | **ABGELEHNT** | Vertragsbruch — kombiniert Count + Read + Search |
| Erweiterte Aggregations-Metriken (z. B. Prozentanteil) | **Bedingt möglich** | Nur wenn es sich um reine Zähl-Metadaten handelt, Einzelfallentscheidung |
| Aktueller Stand | **BEIBEHALTEN** | Vertragstreu, klar abgegrenzt, korrekt |

---

## Korrekte Tool-Selektion in der Praxis

### Szenario A — Nur Anzahl der Matches relevant

```
Ziel: "Wie viele Zeilen enthalten 'preview-first'?"
Richtiges Tool: count_lines ✅
```

### Szenario B — Position der Matches relevant

```
Ziel: "In welcher Zeile befindet sich 'preview-first'?"
Richtiges Tool: search_file_contents_by_regex ✅
Falsches Tool: count_lines ✗
```

### Szenario C — Inhalt der Matches relevant

```
Ziel: "Was steht in den Zeilen, die 'preview-first' enthalten?"
Richtiges Tool: search_file_contents_by_regex ✅
Falsches Tool: count_lines ✗
```

### Szenario D — Inhalt der gesamten Datei relevant

```
Ziel: "Lies die Datei und zeig mir Zeile 20–30"
Richtiges Tool: read_file_content (mit line_range) ✅
Falsches Tool: count_lines ✗
```

---

## Prinzipien, die diese Entscheidungen leiten

### 1. Single Responsibility Principle (SRP)
Jeder Endpunkt hat genau eine Verantwortlichkeit. Erweiterungen, die eine zweite Verantwortlichkeit einführen, werden abgelehnt — unabhängig von der kurzfristigen Bequemlichkeit.

### 2. Vertragstreue (Contract Integrity)
Der Name eines Endpunkts ist sein Vertrag. `count_lines` zählt Zeilen. Änderungen, die den semantischen Vertrag verletzen, sind architektonisch falsch.

### 3. Redundanzvermeidung (No Redundancy)
Wenn ein bestehender Endpunkt eine Funktion bereits korrekt abbildet, wird diese Funktion nicht in einem anderen Endpunkt dupliziert. Die Architektur des MCP-Servers ist bewusst so designed, dass die Endpunkte komplementär, nicht redundant sind.

### 4. Korrekte Tool-Selektion als primäre Lösung
Wenn ein Agent die Antwort eines Endpunkts als unvollständig empfindet, ist die primäre Lösung die Wahl des richtigen Endpunkts — nicht die Erweiterung des falschen.

---

## Änderungsprotokoll

| Datum | Entscheidung | Begründung |
|---|---|---|
| Initial | `count_lines` bleibt in aktuellem Stand | Vertragstreue, SRP, Redundanzvermeidung |
