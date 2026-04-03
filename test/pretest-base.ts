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
 * 📌 pretest-base.ts.
 *
 * Basis-Setup-Datei für alle Tests (Unit und Integration).
 * Diese Datei wird als globalSetup in vitest.config.ts eingetragen und
 * stellt grundlegende Test-Infrastruktur bereit.
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
    console.info('📋 [1. PRETEST-BASE] Starte Basis-Test-Setup...')

    // Zentralen Bootstrap ausführen
    bootstrapTestEnvironment()

    // Zusätzliches spezifisches Setup für die Basis-Konfiguration
    console.info('✅ [1. PRETEST-BASE] Basis-Test-Setup abgeschlossen')
}

/**
 * 🧹 Teardown-Funktion für Vitest
 * Diese Funktion wird nach allen Tests ausgeführt.
 */
export const teardown = (): void => {
    console.info('🧹 [TEARDOWN - PRETEST-BASE] Starte Basis-Test-Teardown...')

    // Zentralen Cleanup ausführen
    cleanupTestEnvironment()

    // Zusätzliches spezifisches Cleanup für die Basis-Konfiguration
    console.info('✅ [TEARDOWN - PRETEST-BASE] Basis-Test-Teardown abgeschlossen')
}
