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
 * 📌 test/unit/test-setup.ts.
 *
 * Setup-Datei für Unit-Tests.
 * Diese Datei wird in der setupFiles-Konfiguration der vitest.unit.config.ts geladen.
 *
 * WICHTIG: Hier können vi.* Funktionen verwendet werden, da setupFiles
 * im Kontext der Testsuite ausgeführt wird.
 */

// ═══╡ 🧩 IMPORTS ╞═══
import { vi } from 'vitest'

/**
 * 🧪 Unit-Test-Setup-Logik
 * Diese Funktion bereitet die Umgebung für Unit-Tests vor.
 */
const setupUnitTestEnvironment = (): void => {
    console.info('🧪 Initialisiere Unit-Test-Umgebung...')

    // ════════════════════════════╡ 🧪 ENVIRONMENT ╞═════════════════════════════
    vi.stubGlobal('TEST_ENV_TYPE', 'unit')

    console.info('✅ Unit-Test-Umgebung erfolgreich initialisiert')
}

// Automatische Ausführung beim Import
setupUnitTestEnvironment()
