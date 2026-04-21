# Referenzdokument: Preview-First-, Admission- und Wiedereinstiegsarchitektur für rekursive MCP-Inspektionsendpunkte
[INTENT: KONTEXT]

---

## 1. Aufgabenübersicht
[INTENT: KONTEXT]

Dieses Referenzdokument beschreibt die aktuelle und die architektonisch korrekte Zielarchitektur für die serverseitige Admission-, Preview- und Wiedereinstiegslogik rekursiver Inspektionsendpunkte des lokalen Filesystem-MCP-Servers.

Der Bericht hält vollständig fest,

- welche Planquellen die Architektur definieren,
- welche aktuellen Endpunkte von der Traversal-/Preview-Thematik betroffen sind,
- wie die aktuelle serverseitige Policy, Guardrail- und Berechnungslogik aufgebaut ist,
- welche Endpunkte heute bereits eine Preview-Lane haben,
- welche Endpunkte heute noch keine echte task-basierte Fortsetzung besitzen,
- und wie die architektonisch korrekte Zielarchitektur für Preview-Lane, task-basierte Vollfortsetzung und Wiedereinstieg als Blueprint gestaltet werden sollte.

Der Bericht dokumentiert das Konzept normativ so, dass die Schwellenwerte und Budgets als korrekt kalibrierte Architektur verstanden werden und die Preview-Lane erst auf dem vorgesehenen Workload-Niveau greift.

---

## 2. Informationsregister (INHALT-Einheiten)
[INTENT: REFERENZ]

| ID | Typ | Beschreibung | Veränderung | Status |
|----|-----|-------------|-------------|--------|
| INFO-001 | INFORMATION | Autoritätsreihenfolge der Plan- und Runtime-Quellen für die Admission-, Preview- und Wiedereinstiegsarchitektur | Nein | ✅ |
| REQ-001 | ANFORDERUNG | Aktuelle Runtime- und Endpoint-Architektur der betroffenen rekursiven Inspektionsoberflächen | Ja | ✅ |
| REQ-002 | ANFORDERUNG | Aktuelle serverseitige Berechnungs-, Admission- und Preview-Logik vom Capability-Profil bis zur Lane-Entscheidung | Ja | ✅ |
| REQ-003 | ANFORDERUNG | Aktuelle Realitätsgrenze: Es gibt noch keine echte backendseitige Task-/Continuation-Ablösung für vollständige Fortsetzung | Ja | ✅ |
| REQ-004 | ANFORDERUNG | Architektonisch korrektes Zielbild für Preview-Lane, task-basierte Vollfortsetzung und endpoint-spezifische Verantwortung | Ja | ✅ |
| REQ-005 | ANFORDERUNG | Prozentuales Schwellenwertmodell für inline, preview-first, task-backed-required und narrowing-required | Ja | ✅ |
| REQ-006 | ANFORDERUNG | No-breaking Tool-Vertrags- und Wiedereinstiegs-Blueprint für spätere Implementierung | Ja | ✅ |
| CONV-001 | CONSTRAINT | Server-owned Policy: keine agent-gesteuerte Preview-/Vollscan-Entscheidung, kein separater Big-Search-Endpoint als Primärmodell | Nein | ✅ |

---

## 3. Informationseinheiten
[INTENT: SPEZIFIKATION]

### 3.1 INFO-001: Autoritätsreihenfolge der Plan- und Runtime-Quellen
[INTENT: SPEZIFIKATION]

**Typ:** INFORMATION

**Beschreibung:**
Die maßgebliche Architektur ergibt sich aus einer festen Autoritätsreihenfolge aus aktuellem Masterplan, der wiedereröffneten Runtime-Unit, den konkreten Traversal-Aufgaben, der historischen Backup-Planlinie und der tatsächlich registrierten öffentlichen Tool-Oberfläche. Die öffentliche Runtime-Wahrheit liegt primär in der Tool-Registrierung, nicht in der Root-Dokumentation.

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`PLAN.md`](PLAN.md) | Aktueller Masterplan und globale Frontier-SSOT | [`PLAN.md`](PLAN.md:21), [`PLAN.md`](PLAN.md:55), [`PLAN.md`](PLAN.md:154) |
| [`orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md) | Status und Frontier von Unit 1 | [`orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md:17), [`orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md:98) |
| [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md) | Phase-one-Refactor und Restlücke vor `1.6` | [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md:286), [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md:303) |
| [`1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md) | Finaler Admission-to-Execution-Abschluss | [`1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md:288), [`1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md:295) |
| [`PLAN.md`](__bak__/plan-ugrep/PLAN.md) | Historische Large-File-, Search-, Read- und Count-Linie | [`PLAN.md`](__bak__/plan-ugrep/PLAN.md:21), [`PLAN.md`](__bak__/plan-ugrep/PLAN.md:24) |
| [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100) | Autoritative öffentliche Inspection-Tool-Oberfläche | [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100) |
| [`SERVER_INSTRUCTIONS`](src/application/server/server-instructions.ts:28) | Serverseitiger Caller-Contract | [`SERVER_INSTRUCTIONS`](src/application/server/server-instructions.ts:28) |
| [`README.md`](README.md) | Informative, aber nicht laufzeitautoritär bindende Root-Dokumentation | [`README.md`](README.md:54) |

**✅ Positivbeispiel(e):**
- Die Zielarchitektur wird aus dem aktiven Masterplan, der wiedereröffneten Runtime-Unit und der tatsächlichen Tool-Registrierung abgeleitet, während die Backup-Planlinie nur als historische Implementationsreferenz dient.

---

### 3.2 REQ-001: Aktuelle Runtime- und Endpoint-Architektur der betroffenen Oberflächen
[INTENT: SPEZIFIKATION]

**Typ:** ANFORDERUNG

**Beschreibung:**
Die aktuelle Architektur trennt zwischen rekursiven Discovery-/Search-/Count-Endpunkten, die an derselben serverseitigen Traversal-Admission hängen, und den separaten Read-Endpunkten, die eigene bounded read contracts besitzen. Die öffentliche Inspection-Oberfläche ist applikationsseitig komponiert und wird autoritativ in der Tool-Registrierung exponiert.

**Ist-Zustand:**
Die aktuell relevante öffentliche Inspection-Oberfläche wird in [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100) registriert. Für die Preview-/Traversal-Thematik sind aktuell insbesondere betroffen:

| Endpoint | Aktuelle Rolle | Aktuelle Admission-/Preview-Realität | Relevante Quelle |
|---|---|---|---|
| [`search_file_contents_by_regex`](src/application/server/register-inspection-tool-catalog.ts:272) | rekursive Regex-Suche | nutzt gemeinsame Admission + echte Preview-Lane | [`getSearchRegexPathResult()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:437) |
| [`search_file_contents_by_fixed_string`](src/application/server/register-inspection-tool-catalog.ts:315) | rekursive Literal-Suche | nutzt gemeinsame Admission + echte Preview-Lane | [`getSearchFixedStringPathResult()`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts:92) |
| [`list_directory_entries`](src/application/server/register-inspection-tool-catalog.ts:144) | rekursive strukturierte Verzeichnisauflistung | nutzt gemeinsame Admission, aber keine Preview-Lane | [`buildListedDirectoryRoot()`](src/domain/inspection/list-directory-entries/handler.ts:166) |
| [`find_files_by_glob`](src/application/server/register-inspection-tool-catalog.ts:228) | rekursive Glob-Discovery | nutzt gemeinsame Admission, aber keine Preview-Lane | [`getFindFilesByGlobRootResult()`](src/domain/inspection/find-files-by-glob/handler.ts:63) |
| [`find_paths_by_name`](src/application/server/register-inspection-tool-catalog.ts:186) | rekursive Name-Discovery | nutzt gemeinsame Admission, aber keine Preview-Lane | [`searchFiles()`](src/domain/inspection/find-paths-by-name/helpers.ts:58) |
| [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:358) | rekursive Total-/Pattern-Count-Oberfläche | nutzt gemeinsame Admission, aber keine Preview-Lane | [`countLinesInDirectory()`](src/domain/inspection/count-lines/handler.ts:480) |
| [`read_file_content`](src/application/server/register-inspection-tool-catalog.ts:118) | bounded single-file read contract | keine rekursive Preview-Lane; explizite bounded modes | [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:118) |
| [`read_files_with_line_numbers`](src/application/server/register-inspection-tool-catalog.ts:103) | bounded multi-file inline read contract | keine rekursive Preview-Lane; bounded batch read surface | [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:103) |

Die Read-Oberflächen gehören also zur Gesamtarchitektur, sind aber **nicht** Teil der rekursiven Preview-Lane-Mechanik. Ihre boundedness wird über ihren eigenen Read-Contract und nicht über die rekursive Traversal-Preview-Lane modelliert.

**Soll-Zustand:**
Die Zielarchitektur soll die öffentlichen Endpoint-Namen stabil halten, aber die betroffenen rekursiven Familien klar in drei Klassen trennen:

1. **Preview-capable recursive families**
2. **Task-capable but not partial-preview-capable families**
3. **Bounded read families außerhalb der rekursiven Preview-Lane**

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | öffentliche Inspection-Tool-Komposition | [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100) |
| [`handler.ts`](src/domain/inspection/search-file-contents-by-regex/handler.ts) | Regex-Familie | [`handleSearchRegex()`](src/domain/inspection/search-file-contents-by-regex/handler.ts:70) |
| [`search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | Regex-Root-Admission und Preview | [`getSearchRegexPathResult()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:437) |
| [`handler.ts`](src/domain/inspection/search-file-contents-by-fixed-string/handler.ts) | Fixed-string-Familie | [`handleSearchFixedString()`](src/domain/inspection/search-file-contents-by-fixed-string/handler.ts:31) |
| [`search-fixed-string-path-result.ts`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts) | Fixed-string-Root-Admission und Preview | [`getSearchFixedStringPathResult()`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts:92) |
| [`handler.ts`](src/domain/inspection/list-directory-entries/handler.ts) | Discovery-Listing-Familie | [`buildListedDirectoryRoot()`](src/domain/inspection/list-directory-entries/handler.ts:166) |
| [`handler.ts`](src/domain/inspection/find-files-by-glob/handler.ts) | Discovery-Glob-Familie | [`getFindFilesByGlobRootResult()`](src/domain/inspection/find-files-by-glob/handler.ts:63) |
| [`helpers.ts`](src/domain/inspection/find-paths-by-name/helpers.ts) | Discovery-Name-Familie | [`searchFiles()`](src/domain/inspection/find-paths-by-name/helpers.ts:58) |
| [`handler.ts`](src/domain/inspection/count-lines/handler.ts) | Count-Familie | [`countLinesInDirectory()`](src/domain/inspection/count-lines/handler.ts:480) |

**✅ Positivbeispiel(e):**
- Eine rekursive Literal-Suche und eine rekursive Regex-Suche werden als zwei eigene, preview-fähige Suchfamilien modelliert, während bounded reads separat bleiben.

**❌ Negativbeispiel(e):**
- Alle großen Such-, Discovery-, Read- und Count-Fälle werden in einen einzigen universellen „großen Suchendpunkt“ zusammengezogen. Das verletzt die fachliche Trennung der Tool-Familien.

---

### 3.3 REQ-002: Aktuelle serverseitige Berechnungs-, Admission- und Preview-Logik
[INTENT: SPEZIFIKATION]

**Typ:** ANFORDERUNG

**Beschreibung:**
Die aktuelle Architektur berechnet die Admission- und Preview-Entscheidung vollständig serverseitig. Die Kette beginnt beim Runtime-Capability-Profil, läuft über die Execution-Policy und die Root-Preflight-/Candidate-Workload-Evidenz und endet erst im endpoint-spezifischen Admission-Mapping.

**Ist-Zustand:**
Die aktuelle serverseitige Berechnungskette ist wie folgt aufgebaut:

1. **Capability Detection** über [`detectIoCapabilityProfile()`](src/infrastructure/runtime/io-capability-detector.ts:251)
2. **Policy Resolution** über [`resolveSearchExecutionPolicy()`](src/domain/shared/search/search-execution-policy.ts:357)
3. **Root-Level Preflight** über [`resolveTraversalPreflightContext()`](src/domain/shared/guardrails/filesystem-preflight.ts:377)
4. **Candidate-Workload-Probe** über [`collectTraversalCandidateWorkloadEvidence()`](src/domain/shared/guardrails/traversal-candidate-workload.ts:81)
5. **Admission-Entscheidung** über [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:272)
6. **Preview-Lane-Planung** über [`resolveTraversalPreviewLanePlan()`](src/domain/shared/guardrails/traversal-preview-lane.ts:40)
7. **Preview-Stoppprüfung** über [`shouldStopTraversalPreviewLane()`](src/domain/shared/guardrails/traversal-preview-lane.ts:74)
8. **Endpoint-spezifische Execution** in den jeweiligen Root-/Directory-Resolvern

Die kanonischen Admission-Outcomes sind bereits definiert in [`TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES`](src/domain/shared/guardrails/traversal-workload-admission.ts:13):

- inline
- preview-first
- task-backed-required
- narrowing-required

Die wichtigsten serverseitigen Guardrail- und Budgetquellen sind:

| Baustein | Aufgabe | Relevante Quelle |
|---|---|---|
| Shared limit registry | response caps, traversal preflight ceilings, deeper runtime fuse | [`tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts:356) |
| Search execution policy | Sync-Komfort, task recommendation, preview-first fraction, traversal inline/preview budgets | [`search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts:26) |
| Root preflight | root validation, breadth evidence, early narrowing guidance | [`filesystem-preflight.ts`](src/domain/shared/guardrails/filesystem-preflight.ts:377) |
| Admission planner | endpoint-family outcome mapping | [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:272) |
| Preview lane | bounded preview execution plan | [`traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts:40) |
| Deeper emergency fuse | runtime traversal ceiling after admission | [`assertTraversalRuntimeBudget()`](src/domain/shared/guardrails/traversal-runtime-budget.ts:193) |

**Soll-Zustand:**
Die Zielarchitektur soll diese Kette **beibehalten**, aber die endpoint-spezifischen Familien konsequent an dieselbe serverseitige Admission-Logik binden, sodass Preview, task-backed continuation und narrowing nicht agentseitig geraten, sondern serverseitig entschieden und vertragsförmig zurückgegeben werden.

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`io-capability-detector.ts`](src/infrastructure/runtime/io-capability-detector.ts) | Runtime-Capability-Ermittlung | [`detectIoCapabilityProfile()`](src/infrastructure/runtime/io-capability-detector.ts:251) |
| [`search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | Ableitung der Ausführungsbänder | [`resolveSearchExecutionPolicy()`](src/domain/shared/search/search-execution-policy.ts:357) |
| [`filesystem-preflight.ts`](src/domain/shared/guardrails/filesystem-preflight.ts) | Root-Preflight und Breadth-Evidence | [`resolveTraversalPreflightContext()`](src/domain/shared/guardrails/filesystem-preflight.ts:377) |
| [`traversal-candidate-workload.ts`](src/domain/shared/guardrails/traversal-candidate-workload.ts) | Candidate-Workload-Probe | [`collectTraversalCandidateWorkloadEvidence()`](src/domain/shared/guardrails/traversal-candidate-workload.ts:81) |
| [`traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | Admission-Outcomes und Guidance | [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:272) |
| [`traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts) | Preview-Lane-Plan | [`resolveTraversalPreviewLanePlan()`](src/domain/shared/guardrails/traversal-preview-lane.ts:40), [`shouldStopTraversalPreviewLane()`](src/domain/shared/guardrails/traversal-preview-lane.ts:74) |
| [`traversal-runtime-budget.ts`](src/domain/shared/guardrails/traversal-runtime-budget.ts) | Deeper runtime safeguard | [`assertTraversalRuntimeBudget()`](src/domain/shared/guardrails/traversal-runtime-budget.ts:193) |

**✅ Positivbeispiel(e):**
- Ein rekursiver Endpoint entscheidet die Admission erst nach Capability-Profil, Preflight-Evidence und Candidate-Workload-Probe und nicht aufgrund eines agentseitig gesetzten Bypass-Flags.

**❌ Negativbeispiel(e):**
- Ein Endpoint entscheidet allein aufgrund eines vom Agenten gewählten Parameters, ob direkt Vollscan oder Preview ausgeführt wird. Das verletzt die server-owned Admission-Architektur.

---

### 3.4 REQ-003: Aktuelle Realitätsgrenze – keine echte backendseitige Task-/Continuation-Ablösung
[INTENT: SPEZIFIKATION]

**Typ:** ANFORDERUNG

**Beschreibung:**
Die aktuelle Architektur besitzt zwar bereits das gemeinsame Outcome „task-backed-required“, aber es existiert heute noch kein realer öffentlicher Fortsetzungs- oder Polling-Vertrag, der aus Preview oder Admission-Stopp in eine echte backendseitige Vollfortsetzung überleiten würde.

**Ist-Zustand:**
Die aktuelle Implementierung setzt in den relevanten Consumer-Familien durchgehend `taskBackedExecutionSupported: false`.

Das ist aktuell sichtbar in:

| Familie | Aktueller Zustand | Relevante Quelle |
|---|---|---|
| Regex-Suche | task-backed lane nicht aktiviert | [`getSearchRegexPathResult()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:480) |
| Fixed-string-Suche | task-backed lane nicht aktiviert | [`getSearchFixedStringPathResult()`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts:133) |
| Directory-Listing | task-backed lane nicht aktiviert | [`buildListedDirectoryRoot()`](src/domain/inspection/list-directory-entries/handler.ts:199) |
| Glob-Discovery | task-backed lane nicht aktiviert | [`getFindFilesByGlobRootResult()`](src/domain/inspection/find-files-by-glob/handler.ts:93) |
| Name-Discovery | task-backed lane nicht aktiviert | [`searchFiles()`](src/domain/inspection/find-paths-by-name/helpers.ts:90) |
| Count-Lines | task-backed lane nicht aktiviert | [`countLinesInDirectory()`](src/domain/inspection/count-lines/handler.ts:515) |

Daraus folgt aktuell:

- kein server-issued continuation handle,
- kein task token,
- kein Poll-/Resume-Vertrag im öffentlichen Toolkatalog,
- und keine echte backendseitige Vollfortsetzung aus derselben Tool-Familie heraus.

Heute endet die Runtime-Realität daher in der betroffenen Familie bei:

- inline,
- preview-first mit abgeschnittener bounded preview lane,
- oder narrowing-required.

**Soll-Zustand:**
Die korrekte Zielarchitektur ergänzt je geeigneter Familie eine echte serverseitige Fortsetzungsfähigkeit, ohne dass der Agent diese proaktiv erraten oder initial aktivieren muss.

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | Regex-Consumer-Capabilities | [`getSearchRegexPathResult()`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts:480) |
| [`search-fixed-string-path-result.ts`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts) | Fixed-string-Consumer-Capabilities | [`getSearchFixedStringPathResult()`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts:133) |
| [`handler.ts`](src/domain/inspection/list-directory-entries/handler.ts) | Listing-Consumer-Capabilities | [`buildListedDirectoryRoot()`](src/domain/inspection/list-directory-entries/handler.ts:199) |
| [`handler.ts`](src/domain/inspection/find-files-by-glob/handler.ts) | Glob-Consumer-Capabilities | [`getFindFilesByGlobRootResult()`](src/domain/inspection/find-files-by-glob/handler.ts:93) |
| [`helpers.ts`](src/domain/inspection/find-paths-by-name/helpers.ts) | Name-Consumer-Capabilities | [`searchFiles()`](src/domain/inspection/find-paths-by-name/helpers.ts:90) |
| [`handler.ts`](src/domain/inspection/count-lines/handler.ts) | Count-Consumer-Capabilities | [`countLinesInDirectory()`](src/domain/inspection/count-lines/handler.ts:515) |

**✅ Positivbeispiel(e):**
- Ein Endpoint liefert nach Admission oder Preview serverseitig zurück, dass ein echter Wiedereinstieg möglich ist, und gibt dafür einen vom Server erzeugten Fortsetzungsnachweis zurück.

**❌ Negativbeispiel(e):**
- Ein Endpoint signalisiert task-backed-required, besitzt aber keinen realen serverseitigen Fortsetzungs- oder Polling-Vertrag. Das ist konzeptionell angekündigt, aber operativ nicht konsumierbar.

---

### 3.5 REQ-004: Architektonisch korrektes Zielbild für Preview-Lane und task-basierte Vollfortsetzung
[INTENT: SPEZIFIKATION]

**Typ:** ANFORDERUNG

**Beschreibung:**
Die architektonisch korrekte Lösung ist eine strikt server-owned Policy, bei der jeder betroffene Endpoint seine Admission-Fähigkeiten endpoint-spezifisch meldet, der gemeinsame Planner die Lane serverseitig wählt und der Endpoint nur dann eine echte Fortsetzungsmöglichkeit zurückgibt, wenn seine Familie diese auch real backendseitig tragen kann.

**Ist-Zustand:**
Die gemeinsame Policy existiert bereits, aber ihre operative Familienausprägung ist asymmetrisch:

- Preview-Lane nur auf den beiden Suchfamilien
- keine echte task-basierte Vollfortsetzung
- Discovery-Familien aktuell nur inline oder narrowing
- Count-Familie aktuell inline oder narrowing
- Read-Familien separat mit bounded modes statt Preview-Lane

**Soll-Zustand:**
Das architektonisch korrekte Zielbild ist:

| Endpoint-Familie | Preview-Lane soll existieren | Task-basierte Vollfortsetzung soll existieren | Begründung |
|---|---|---|---|
| [`search_file_contents_by_regex`](src/application/server/register-inspection-tool-catalog.ts:272) | Ja | Ja | Teilmengen von Match-Locations sind semantisch wertvoll; vollständige Match-Mengen benötigen später echte Fortsetzung. |
| [`search_file_contents_by_fixed_string`](src/application/server/register-inspection-tool-catalog.ts:315) | Ja | Ja | Literal-Treffer eignen sich für Preview und für echte spätere Vollfortsetzung. |
| [`list_directory_entries`](src/application/server/register-inspection-tool-catalog.ts:144) | Ja | Ja | Strukturierte Entry-Listen sind previewfähig; vollständige große Tree-Listings benötigen später serverseitige Fortsetzung. |
| [`find_files_by_glob`](src/application/server/register-inspection-tool-catalog.ts:228) | Ja | Ja | Pfadlisten sind previewfähig und später fortsetzbar. |
| [`find_paths_by_name`](src/application/server/register-inspection-tool-catalog.ts:186) | Ja | Ja | Pfadtreffer sind previewfähig und später fortsetzbar. |
| [`count_lines`](src/application/server/register-inspection-tool-catalog.ts:358) | Nein | Ja | Partielle Totals sind semantisch problematisch; hier soll zwischen inline und vollständiger task-basierter Fortsetzung umgeschaltet werden. |
| [`read_file_content`](src/application/server/register-inspection-tool-catalog.ts:118) | Nein | Nein, nicht in dieser Preview-Architektur | Diese Oberfläche hat bereits bounded line-/byte-/cursor modes und gehört in einen separaten Read-Contract. |
| [`read_files_with_line_numbers`](src/application/server/register-inspection-tool-catalog.ts:103) | Nein | Nein, nicht in dieser Preview-Architektur | Diese Oberfläche bleibt bounded multi-file inline read und wird nicht in die rekursive Preview-Lane überführt. |

**Prozentuale Architekturwertung für das Zielbild:**

| Architekturentscheidung | Prozentuale Empfehlung |
|---|---:|
| Server-owned Admission-Policy statt Agent-Entscheidung | 95 % |
| Gleiche Endpoint-Familie mit server-issued Wiedereinstieg statt neuem Big-Search-Endpoint | 92 % |
| Discovery-Familien zusätzlich preview- und task-fähig machen | 89 % |
| Count-Familie ohne partielle Preview, aber mit task-basierter Vollfortsetzung | 88 % |
| Agent-gesteuertes „force full scan“-Flag | 8 % |
| Separater Big-Search-/Big-Traversal-Endpoint als Primärmodell | 15 % |

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | gemeinsame Admission-SSOT | [`TRAVERSAL_WORKLOAD_ADMISSION_OUTCOMES`](src/domain/shared/guardrails/traversal-workload-admission.ts:13), [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:272) |
| [`traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts) | Preview-Lane-Planung | [`resolveTraversalPreviewLanePlan()`](src/domain/shared/guardrails/traversal-preview-lane.ts:40) |
| [`register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | öffentliche Familienoberfläche | [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100) |

**✅ Positivbeispiel(e):**
- Eine breite Regex-Suche wird serverseitig admitted, liefert eine bounded Preview-Lane zurück und markiert zugleich, dass eine spätere vollständige Fortsetzung aus derselben Tool-Familie möglich ist.
- Eine große Count-Anfrage liefert keine partiellen Totals zurück, sondern wechselt ab Überschreiten der Inline-Bandgrenze direkt in eine serverseitige Vollfortsetzungsanforderung.

**❌ Negativbeispiel(e):**
- Ein Agent entscheidet selbst, ob er Preview oder Vollscan will.
- Eine Discovery-Familie besitzt nur preview-first, aber keinen echten Wiedereinstieg, obwohl vollständige große Listen fachlich relevant sein können.
- Eine Count-Familie liefert partielle Zwischentotals als Preview und erzeugt dadurch semantisch irreführende Zahlenstände.

---

### 3.6 REQ-005: Prozentuales Schwellenwertmodell für inline, preview-first, task-backed-required und narrowing-required
[INTENT: SPEZIFIKATION]

**Typ:** ANFORDERUNG

**Beschreibung:**
Das richtige Schwellenwertmodell soll nicht dateizahlbasiert, sondern budget- und bandbasiert sein. Maßgeblich sind die Family-Response-Cap-Auslastung, die erwartete Ausführungszeit und die Fähigkeit der jeweiligen Endpoint-Familie, Preview oder echte Fortsetzung überhaupt semantisch korrekt zu tragen.

**Ist-Zustand:**
Die aktuelle Shared-Policy arbeitet bereits mit festen runtime- und response-orientierten Bändern, insbesondere mit

- einem Sync-Komfortfenster,
- einer Task-Empfehlungsschwelle,
- und einer Preview-first-Response-Cap-Fraction.

Die entscheidenden Kanons sind:

- [`SEARCH_SYNC_COMFORT_WINDOW_SECONDS`](src/domain/shared/search/search-execution-policy.ts:14)
- [`SEARCH_TASK_RECOMMENDED_AFTER_SECONDS`](src/domain/shared/search/search-execution-policy.ts:15)
- [`SEARCH_PREVIEW_FIRST_RESPONSE_CAP_FRACTION`](src/domain/shared/search/search-execution-policy.ts:16)

**Soll-Zustand:**
Das architektonisch korrekte Schwellenwertmodell für die später implementierbare Zielarchitektur lautet:

| Band | Prozent der Family-Response-Cap | Zeitfenster | Semantik | Gültig für |
|---|---:|---:|---|---|
| Inline | 0–49 % | bis 15 s | vollständige Inline-Ausführung | alle Familien mit Inline-Lane |
| Preview-first | 50–84 % | 15–60 s | bounded Vorschau mit serverseitiger Fortsetzungsmöglichkeit | Regex-, Fixed-string- und Discovery-Familien |
| Task-backed-required | 85–100 % **oder** > 60 s | ab 60 s | keine weitere Inline-/Preview-Eskalation, sondern echte backendseitige Vollfortsetzung | Regex-, Fixed-string-, Discovery- und Count-Familien |
| Narrowing-required | > 100 % **oder** unsupported/hard-gap | n/a | kein Vollscan; Scope-Verengung erforderlich | alle Familien |

**Spezialregel für `count_lines`:**
Die Count-Familie überspringt das Preview-Band für partielle inhaltliche Totals. Sie wechselt semantisch von Inline direkt nach Task-backed-required, sobald die Inline-Bandgrenze verlassen wird.

**Architekturwertungen für das Schwellenwertmodell:**

| Entscheidung | Prozent |
|---|---:|
| Preview-trigger bei 50 % der Family-Response-Cap | 90 % |
| Task-backed ab 85 % der Family-Response-Cap oder > 60 s | 93 % |
| Datei-Anzahl als Primärtrigger | 21 % |
| Rein agentseitige Vorabschätzung statt serverseitiger Budgetrechnung | 12 % |

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | Policy-Bänder und Response-Fraction | [`SEARCH_SYNC_COMFORT_WINDOW_SECONDS`](src/domain/shared/search/search-execution-policy.ts:14), [`SEARCH_TASK_RECOMMENDED_AFTER_SECONDS`](src/domain/shared/search/search-execution-policy.ts:15), [`SEARCH_PREVIEW_FIRST_RESPONSE_CAP_FRACTION`](src/domain/shared/search/search-execution-policy.ts:16) |
| [`tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts) | Response caps, preflight ceilings und deeper fuse | [`ENDPOINT_FAMILY_GUARDRAIL_LIMITS`](src/domain/shared/guardrails/tool-guardrail-limits.ts:711) |

**✅ Positivbeispiel(e):**
- Eine rekursive Discovery-Anfrage mit erwarteter 62%-Response-Cap-Auslastung bleibt in preview-first und liefert eine bounded Vorschau samt späterer serverseitiger Fortsetzungsmöglichkeit.
- Eine Count-Anfrage, die die Inline-Bandgrenze verlässt, wechselt direkt in task-backed-required statt partielle Totals auszugeben.

**❌ Negativbeispiel(e):**
- Eine Anfrage wird allein wegen „zu vieler Dateien“ in preview-first gezwungen, obwohl Budget und Zeitband noch klar inlinefähig wären.
- Eine Familie bleibt bis kurz vor dem Hard-Gap in Preview-Schleifen, obwohl bereits eine echte task-basierte Vollfortsetzung semantisch richtiger wäre.

---

### 3.7 REQ-006: No-breaking Tool-Vertrags- und Wiedereinstiegs-Blueprint
[INTENT: SPEZIFIKATION]

**Typ:** ANFORDERUNG

**Beschreibung:**
Die spätere Implementierung soll keine agentseitige Bypass-Entscheidung einführen, sondern dieselbe öffentliche Tool-Familie beibehalten und additiv eine server-issued Wiedereinstiegsfähigkeit ergänzen. Der Wiedereinstieg muss aus Vertragssicht vom Server erzeugt, vom Endpoint zurückgegeben und nur durch denselben Endpoint wieder konsumiert werden.

**Ist-Zustand:**
Heute existiert noch kein echter Fortsetzungsvertrag. Die Familien liefern entweder Inline-Ergebnisse, Preview-Ergebnisse oder Narrowing-Guidance, aber keine echte Fortsetzungsoberfläche.

**Soll-Zustand:**
Die spätere Implementierung soll folgenden No-breaking Blueprint verwenden:

#### A. Request-Seite
- Der **Initial-Request** bleibt je Familie unverändert.
- Es gibt **keinen** frei setzbaren Agent-Bypass wie „force full“, „disable preview“ oder eine proaktive Task-Aktivierung.
- Für die spätere Fortsetzung wird **additiv** ein server-issued, opaker Wiedereinstiegsnachweis auf derselben Endpoint-Familie akzeptiert.
- Wenn ein Wiedereinstiegsnachweis vorhanden ist, darf der Request keine neuen Scope-entscheidenden Parameter setzen; der Scope ist dann server-owned fortzusetzen.

#### B. Response-Seite
Jede preview- oder task-fähige Familie soll additiv drei strukturierte Antwortoberflächen tragen:

1. **Admission Surface**
   - welches Outcome gewählt wurde,
   - welche Lane aktiv ist,
   - warum diese Lane gewählt wurde.

2. **Preview Surface**
   - ob eine bounded Vorschau zurückgegeben wurde,
   - ob sie abgeschnitten wurde,
   - ob eine vollständige Fortsetzung möglich ist.

3. **Continuation Surface**
   - ob ein Wiedereinstieg verfügbar ist,
   - ob dieser Wiedereinstieg dieselbe Endpoint-Familie oder eine serverseitige Task-Fortsetzung verwendet,
   - welcher opake server-issued Nachweis dafür gültig ist,
   - und bis wann er verwendbar ist.

#### C. Semantische Vertragsregeln
- Die **strukturierte Antwortoberfläche** bleibt autoritativ, gemäß [`SERVER_INSTRUCTIONS`](src/application/server/server-instructions.ts:28).
- Die Textoberfläche darf nur menschenlesbare Zusammenfassung sein.
- Der Wiedereinstieg darf **nicht** über einen neuen Big-Search-Endpoint modelliert werden.
- Der Wiedereinstieg darf **nicht** über agentseitiges Raten aktiviert werden.
- Eine Familie darf task-backed-required nur dann ausgeben, wenn sie diese Fortsetzung auch real backendseitig bedienen kann.

#### D. Endpoint-spezifischer Wiedereinstieg

| Familie | Rückgabe im Preview-/Admission-Fall | Wiedereinstieg später |
|---|---|---|
| Regex-Suche | Admission + Preview + Continuation | gleiche Suchfamilie mit server-issued Fortsetzungsnachweis |
| Fixed-string-Suche | Admission + Preview + Continuation | gleiche Suchfamilie mit server-issued Fortsetzungsnachweis |
| Discovery-Listing/Glob/Name | Admission + Preview + Continuation | gleiche Discovery-Familie mit server-issued Fortsetzungsnachweis |
| Count-Lines | Admission + Continuation, aber keine partial-preview totals | gleiche Count-Familie mit server-issued Vollfortsetzungsnachweis |
| Read-Familien | kein Teil dieser Preview-Architektur | weiterhin bounded read contracts |

#### E. Implementierungsabfolge als Blaupause
1. Gemeinsame Admission-Decision um echte Continuation-Fähigkeit erweitern.
2. Preview-fähige Familien additiv mit autoritativer structured continuation surface versehen.
3. Einen server-owned Continuation-/Task-State-Store einführen.
4. Derselben Endpoint-Familie erlauben, einen server-issued Wiedereinstiegsnachweis zu konsumieren.
5. Erst danach taskBackedExecutionSupported familienweise von false auf true anheben.
6. Count-Familie separat ohne partielle Preview, aber mit vollständiger task-basierter Fortsetzung modellieren.

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | gemeinsame Outcome-SSOT | [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:272) |
| [`traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts) | Preview-Planung | [`resolveTraversalPreviewLanePlan()`](src/domain/shared/guardrails/traversal-preview-lane.ts:40) |
| [`server-instructions.ts`](src/application/server/server-instructions.ts) | strukturierte Antwort autoritativ | [`SERVER_INSTRUCTIONS`](src/application/server/server-instructions.ts:28) |
| [`register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | öffentliche Tool-Familien und aktuelle Verträge | [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100) |

**✅ Positivbeispiel(e):**
- Eine breite Regex-Suche liefert eine bounded Vorschau und zusätzlich einen server-issued Fortsetzungsnachweis, der nur vom selben Endpoint später weiterverarbeitet werden kann.
- Eine große Count-Anfrage liefert keinen partiellen Count als Preview, sondern eine Admission-Entscheidung mit serverseitig möglicher Vollfortsetzung.
- Eine Discovery-Familie liefert eine Vorschau der ersten Treffer und zugleich einen klaren Wiedereinstieg für die vollständige Restauflistung.

**❌ Negativbeispiel(e):**
- Ein Agent setzt im Erstaufruf selbstständig einen Parameter, um Preview zu deaktivieren und direkt Vollscan zu erzwingen.
- Für große Suchworkloads wird ein separater Sonder-Endpoint eingeführt, statt dieselbe Tool-Familie serverseitig fortsetzbar zu machen.
- Eine Familie gibt task-backed-required zurück, obwohl keine echte backendseitige Fortsetzung implementiert ist.

---

### 3.8 CONV-001: Server-owned Policy statt Agent-owned Decision Making
[INTENT: SPEZIFIKATION]

**Typ:** CONSTRAINT

**Beschreibung:**
Die Admission-, Preview- und Fortsetzungsentscheidung ist server-owned. Der Agent darf weder den initialen Vollscan erzwingen noch proaktiv über Preview-vs-Full entscheiden. Die Entscheidung entsteht aus Endpoint-Familie, Runtime-Policy, Preflight-Evidenz und tatsächlicher Capability-Lage.

**Dateireferenzen:**

| Dateipfad | Relevanz | Relevante Elemente |
|-----------|----------|-------------------|
| [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md) | server-owned scope estimation | [`1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md:286) |
| [`1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md) | shared admission planner | [`1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md:295) |
| [`traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | gemeinsame Lane-Entscheidung | [`resolveTraversalWorkloadAdmissionDecision()`](src/domain/shared/guardrails/traversal-workload-admission.ts:272) |

**✅ Positivbeispiel(e):**
- Der Agent ruft den normalen Endpoint auf; der Server entscheidet Admission, Vorschau und Fortsetzung rein serverseitig.

---

## 4. Konventionen & Constraints
[INTENT: CONSTRAINT]

- Die öffentliche Tool-Familie bleibt die primäre Vertragsoberfläche; ein separater Big-Search- oder Big-Traversal-Endpoint ist nicht das Zielmodell.
- Die Admission-Entscheidung ist server-owned und environment-aware; sie darf nicht über agentseitiges Raten oder agentseitige Flags primär gesteuert werden.
- Preview-first ist nur dort korrekt, wo partielle Ergebnisse semantisch sinnvoll und für Agents verwertbar sind.
- Task-backed-required darf nur dort zurückgegeben werden, wo eine reale backendseitige Fortsetzung existiert.
- Die Count-Familie soll keine partielle Preview von inhaltlichen Totals liefern.
- Die Read-Familien bleiben getrennte bounded read contracts und werden nicht in dieselbe rekursive Preview-Lane überführt.
- Die strukturierte Antwortoberfläche bleibt autoritativ; Textantworten sind zusammenfassend und nicht vertragsführend.
- Der Wiedereinstieg muss additiv und no-breaking auf derselben Endpoint-Familie modelliert werden.

---

## 5. Dateipfad-Index
[INTENT: REFERENZ]

| # | Dateipfad | Relevanz | Zugehörige Einheit-IDs |
|---|-----------|----------|----------------------|
| 1 | [`PLAN.md`](PLAN.md) | Aktueller Masterplan und globale Frontier | INFO-001 |
| 2 | [`.plan/1-runtime-architecture-refactors/orchestration.md`](.plan/1-runtime-architecture-refactors/orchestration.md) | Unit-1-Status und Runtime-Refactor-Frontier | INFO-001 |
| 3 | [`.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md`](.plan/1-runtime-architecture-refactors/1.5-traversal-preflight-and-runtime-budget-refactor.md) | Phase-one-Refactor und Restlücke | INFO-001, CONV-001 |
| 4 | [`.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md`](.plan/1-runtime-architecture-refactors/1.6-traversal-workload-admission-and-lane-routing-completion.md) | Finaler Admission-to-Execution-Abschluss | INFO-001, CONV-001 |
| 5 | [`__bak__/plan-ugrep/PLAN.md`](__bak__/plan-ugrep/PLAN.md) | Historische Large-File-Architektur-Linie | INFO-001 |
| 6 | [`src/application/server/register-inspection-tool-catalog.ts`](src/application/server/register-inspection-tool-catalog.ts) | Autoritative öffentliche Inspection-Oberfläche | INFO-001, REQ-001, REQ-004, REQ-006 |
| 7 | [`src/application/server/server-instructions.ts`](src/application/server/server-instructions.ts) | Serverseitiger Caller-Contract | INFO-001, REQ-006 |
| 8 | [`src/domain/shared/guardrails/tool-guardrail-limits.ts`](src/domain/shared/guardrails/tool-guardrail-limits.ts) | Kanonische Budgets und Guardrail-Limits | REQ-002, REQ-005 |
| 9 | [`src/domain/shared/guardrails/filesystem-preflight.ts`](src/domain/shared/guardrails/filesystem-preflight.ts) | Root-Preflight, Breadth-Evidence, Narrowing | REQ-002 |
| 10 | [`src/domain/shared/guardrails/traversal-candidate-workload.ts`](src/domain/shared/guardrails/traversal-candidate-workload.ts) | Candidate-Workload-Probe | REQ-002 |
| 11 | [`src/domain/shared/guardrails/traversal-workload-admission.ts`](src/domain/shared/guardrails/traversal-workload-admission.ts) | Shared Admission Planner und Outcomes | REQ-002, REQ-004, REQ-006, CONV-001 |
| 12 | [`src/domain/shared/guardrails/traversal-preview-lane.ts`](src/domain/shared/guardrails/traversal-preview-lane.ts) | Preview-Lane-Planung | REQ-002, REQ-006 |
| 13 | [`src/domain/shared/guardrails/traversal-runtime-budget.ts`](src/domain/shared/guardrails/traversal-runtime-budget.ts) | Deeper runtime emergency fuse | REQ-002 |
| 14 | [`src/domain/shared/search/search-execution-policy.ts`](src/domain/shared/search/search-execution-policy.ts) | Ausführungsbänder und Prozent-/Zeit-Schwellen | REQ-002, REQ-005 |
| 15 | [`src/infrastructure/runtime/io-capability-detector.ts`](src/infrastructure/runtime/io-capability-detector.ts) | Runtime-Capability-Detektor | REQ-002 |
| 16 | [`src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts`](src/domain/inspection/search-file-contents-by-regex/search-regex-path-result.ts) | Regex-Admission, Preview und Consumer-Capabilities | REQ-001, REQ-003 |
| 17 | [`src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts`](src/domain/inspection/search-file-contents-by-fixed-string/search-fixed-string-path-result.ts) | Fixed-string-Admission, Preview und Consumer-Capabilities | REQ-001, REQ-003 |
| 18 | [`src/domain/inspection/list-directory-entries/handler.ts`](src/domain/inspection/list-directory-entries/handler.ts) | Discovery-Listing-Admission | REQ-001, REQ-003 |
| 19 | [`src/domain/inspection/find-files-by-glob/handler.ts`](src/domain/inspection/find-files-by-glob/handler.ts) | Discovery-Glob-Admission | REQ-001, REQ-003 |
| 20 | [`src/domain/inspection/find-paths-by-name/helpers.ts`](src/domain/inspection/find-paths-by-name/helpers.ts) | Discovery-Name-Admission | REQ-001, REQ-003 |
| 21 | [`src/domain/inspection/count-lines/handler.ts`](src/domain/inspection/count-lines/handler.ts) | Count-Familie und split execution model | REQ-001, REQ-003, REQ-004 |

---

## 6. Ausführungskontext für LLM-Agents
[INTENT: KONTEXT]

Ein LLM-Agent, der dieses Referenzdokument in einem neuen, isolierten Kontextfenster erhält, soll die Architektur wie folgt interpretieren:

1. **Runtime-Wahrheit zuerst:** Die autoritative öffentliche Tool-Oberfläche liegt in [`registerInspectionToolCatalog()`](src/application/server/register-inspection-tool-catalog.ts:100), nicht in Root-Dokumenttexten.
2. **Shared Control Plane:** Admission, Preflight, Preview-Lane und deeper runtime fuse sind gemeinsame serverseitige Bausteine und nicht agentseitige Entscheidungen.
3. **Aktuelle Realitätsgrenze:** Es gibt heute noch keine echte backendseitige Task-/Continuation-Ablösung; `task-backed-required` ist als Architekturvokabular vorhanden, aber noch nicht als konsumierbarer öffentlicher Fortsetzungsvertrag materialisiert.
4. **Normatives Zielbild:** Preview-first bleibt serverseitig richtig; für geeignete Familien soll später ein echter server-issued Wiedereinstieg auf derselben Endpoint-Familie ergänzt werden.
5. **Endpoint-Familienlogik:**
   - Regex, Fixed-string und Discovery sollen preview- und task-fähig werden.
   - Count-Lines soll task-fähig, aber nicht partial-preview-fähig werden.
   - Read-Familien bleiben bounded read contracts außerhalb dieser Preview-Architektur.
6. **Schwellenwertmodell:**
   - Inline bis 49 % der Family-Response-Cap und innerhalb des Sync-Komfortbands
   - Preview-first von 50 % bis 84 % für preview-sinnvolle Familien
   - Task-backed ab 85 % oder ab Überschreiten des 60-Sekunden-Bandes
   - Narrowing bei Hard-Gap, Unsupported-State oder fehlender Fortsetzungsfähigkeit
7. **Vertragsregel:** Die korrekte spätere Erweiterung ist no-breaking, additiv und same-endpoint-basiert; kein agent-gesteuertes force-full-Flag und kein separater Big-Search-Endpoint sind das Primärmodell.

Alle notwendigen Informationen sind in den Sektionen 1-5 vollständig enthalten.