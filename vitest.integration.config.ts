// ═══╡ 🧩 IMPORTS ╞═══
import {
    defineProject, mergeConfig
} from 'vitest/config'

import baseConfig, {
    BASE_PATH,
    COMMON_GLOBAL_SETUP,
    COMMON_SETUP_FILES,
    GLOBAL_SETUP_NAME,
    SETUP_NAME
} from './vitest.base.config'

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

// ═══╡ 🗿 CONSTANTS ╞═══
const PROJECT_NAME = 'integration'
const BASE_PATH_INTEGRATION = `${BASE_PATH}/${PROJECT_NAME}`

/*
 * 📋 Integrations-Projekt: Die Infrastruktur ist registriert und ausführbar,
 * enthält aber bewusst noch keine Tests. Das Grün-Halten der leeren Lane wird
 * root-seitig über passWithNoTests in vitest.config.ts gesteuert — die
 * Eigenschaft ist keine Projekt-Config-Oberfläche.
 */
const cfg = defineProject({
    test: {
        globalSetup: [
            ...COMMON_GLOBAL_SETUP,
            `${BASE_PATH_INTEGRATION}/${GLOBAL_SETUP_NAME}`
        ],
        include: [`${BASE_PATH_INTEGRATION}/**/*.test.ts`],
        name: PROJECT_NAME,
        setupFiles: [
            ...COMMON_SETUP_FILES,
            `${BASE_PATH_INTEGRATION}/${SETUP_NAME}`
        ]
    }
})

/**
 * 🛠️ Merges die Basis-Konfiguration mit der Integrations-Suite-Oberfläche.
 */
const mergedCfg: ViteUserConfig = mergeConfig(baseConfig, cfg)

export default mergedCfg
