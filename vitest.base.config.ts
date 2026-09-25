// ═══╡ 🧩 IMPORTS ╞═══
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// ═══╡ 🗿 CONSTANTS ╞═══

/**
 * Basis-Pfad aller Test-Suiten.
 */
export const BASE_PATH = 'test'

/**
 * Einheitlicher Dateiname der Global-Setup-Datei einer Suite.
 */
export const GLOBAL_SETUP_NAME = 'global.setup.ts'

/**
 * Einheitlicher Dateiname der Suite-Setup-Datei einer Suite.
 */
export const SETUP_NAME = 'setup.ts'

/**
 * Gemeinsames Global-Setup aller Suiten (Orchestrierung, keine vi.* APIs).
 */
export const COMMON_GLOBAL_SETUP = [`${BASE_PATH}/${GLOBAL_SETUP_NAME}`]

/**
 * Gemeinsame Setup-Dateien aller Suiten; die deterministische Reihenfolge lebt im Orchestrator.
 */
export const COMMON_SETUP_FILES = [`${BASE_PATH}/setup-orchestrator.ts`]

// 📋 Gemeinsame Testkonfiguration für alle Vitest-Projekte (Coverage/Reporter leben in der Root-Config)
const cfg = defineConfig({
    plugins: [
        tsconfigPaths({
            projects: ['./tsconfig.typecheck.json', './tsconfig.tests.json']
        })
    ],
    test: {
        clearMocks: true,
        disableConsoleIntercept: true,
        environment: 'node',
        globalSetup: COMMON_GLOBAL_SETUP,
        hookTimeout: 300_000,
        mockReset: false,
        restoreMocks: false,
        setupFiles: COMMON_SETUP_FILES,
        testTimeout: 300_000,
        typecheck: {
            enabled: true
        },
        unstubEnvs: true,
        unstubGlobals: true,
        watch: false
    }
})

export default cfg
