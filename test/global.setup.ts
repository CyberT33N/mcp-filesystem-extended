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
 * 📌 test/global.setup.ts.
 *
 * Gemeinsame Global-Setup-Datei aller Verifikationsprojekte der modularen Server-Topologie.
 * Diese Datei wird über COMMON_GLOBAL_SETUP aus vitest.base.config.ts in allen
 * Suite-Konfigurationen eingetragen und stellt die gemeinsame Infrastruktur bereit.
 *
 * Hinweis: In dieser Datei können KEINE Vitest-spezifischen Funktionen wie
 * vi, expect, etc. Verwendet werden, da sie in einem separaten Kontext ausgeführt wird.
 */

// Import des zentralen Bootstrap
import {
    bootstrapTestEnvironment, cleanupTestEnvironment
} from './bootstrap'

/**
 * 🔄 Setup-Funktion für Vitest
 * Diese Funktion wird vor allen Tests ausgeführt.
 */
export const setup = (): void => {
    console.info('📋 [GLOBAL-SETUP] Starte gemeinsames Basis-Setup für die modulare Verifikationsstruktur...')

    // Zentralen Bootstrap ausführen
    bootstrapTestEnvironment()

    // Zusätzliches spezifisches Setup für die Basis-Konfiguration
    console.info('✅ [GLOBAL-SETUP] Gemeinsames Basis-Setup für alle Verifikationsprojekte abgeschlossen')
}

/**
 * 🧹 Teardown-Funktion für Vitest
 * Diese Funktion wird nach allen Tests ausgeführt.
 */
export const teardown = (): void => {
    console.info('🧹 [TEARDOWN - GLOBAL-SETUP] Starte gemeinsames Basis-Teardown der modularen Verifikationsstruktur...')

    // Zentralen Cleanup ausführen
    cleanupTestEnvironment()

    // Zusätzliches spezifisches Cleanup für die Basis-Konfiguration
    console.info('✅ [TEARDOWN - GLOBAL-SETUP] Gemeinsames Basis-Teardown der modularen Verifikationsstruktur abgeschlossen')
}
