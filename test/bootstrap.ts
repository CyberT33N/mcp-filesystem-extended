/*
 *███████████████████████████████████████████████████████████████████████████████
 *██******************** PRESENTED BY t33n Software ***************************██
 *██                                                                           ██
 *██                  ████████╗██████╗ ██████╗ ███╗   ██╗                      ██
 *██                  ╚══██╔══╝╚════██╗╚════██╗████╗  ██║                      ██
 *██                     ██║    █████╔╝ █████╔╝██╔██╗ ██║                      ██
 *██                     ██║    ╚═══██╗ ╚═══██╗██║╚██╗██║                      ██
 *██                     ██║   ██████╔╝██████╔╝██║ ╚████║                      ██
 *██                     ╚═╝   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝                      ██
 *██                                                                           ██
 *███████████████████████████████████████████████████████████████████████████████
 *███████████████████████████████████████████████████████████████████████████████
 */

/**
 * 🧰 test/bootstrap.ts.
 *
 * Zentrale Bootstrap-Datei für alle Testarten.
 * Diese Datei wird von allen globalSetup-Dateien importiert und stellt sicher,
 * dass grundlegende Einstellungen vor testspezifischem Setup initialisiert werden.
 *
 * WICHTIG: Diese Datei darf KEINE vi.* Funktionen verwenden, da sie in einem
 * globalSetup-Kontext ausgeführt wird, in dem Vitest-Funktionalitäten nicht verfügbar sind.
 */

/**
 * 🧪 Initialisiert die grundlegende Testumgebung.
 */
export const bootstrapTestEnvironment = (): void => {
    console.info('📋 [1.1 BOOTSTRAP] Initialisiere grundlegende Testumgebung...')

    /*
     *     // Setze Test-Modus-Flag explizit für alle Tests
     *     Process.env.__TEST_MODE__ = 'true'
     */

    /*
     *     // Erzwinge bestimmte Umgebungsvariablen für Tests
     *     Process.env.NODE_ENV = 'test'
     */

    /*
     *     // Verhindere Benutzerinteraktion in Tests
     *     Process.env.CI = 'true'
     */

    console.info('✅ [1.1 BOOTSTRAP] Grundlegende Testumgebung erfolgreich initialisiert')
}

/**
 * 🧹 Räumt die Testumgebung auf.
 */
export const cleanupTestEnvironment = (): void => {
    console.info('🧹 [FINAL CLEANUP] Bootstrap-Test-Environment-Cleanup wird ausgeführt...')

    // Hier können allgemeine Cleanup-Operationen erfolgen

    console.info('✅ [FINAL CLEANUP] Bootstrap-Test-Environment-Cleanup abgeschlossen')
}
