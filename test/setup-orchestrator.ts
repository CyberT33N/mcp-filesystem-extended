/**
 * Orchestriertes Setup für Vitest, um die Initialisierungsreihenfolge deterministisch zu garantieren.
 *
 * Reihenfolge (Node-TS):
 * 1) Gemeinsame Matcher/Globals (vitest-setup)
 *
 * Weitere Setup-Schritte (z. B. Logger, Worker) werden hier später sequenziert ergänzt.
 */

// Sicherstellung der deterministischen, sequenziellen Ausführung
await import('./vitest-setup')
