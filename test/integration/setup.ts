/**
 * 📌 Integration lokale setupFiles (vi.* erlaubt).
 *
 * Suite-lokale Erweiterungsstelle für Integration-spezifische Mocks und Globals,
 * sobald Integrationstests hinzukommen.
 */

// ═══╡ 🧩 IMPORTS ╞═══
import { vi } from 'vitest'

/**
 * 🧪 Integration-Test-Setup-Logik.
 */
const setup = (): void => {
    console.info('🧪 [SETUP-INTEGRATION] Initialisiere Integration-Setup...')

    vi.stubGlobal('INTEGRATION_TEST_MODE', true)

    console.info('✅ [SETUP-INTEGRATION] Integration-Setup bereit')
}

// Automatische Ausführung beim Import
setup()
