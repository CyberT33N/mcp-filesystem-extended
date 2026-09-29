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

// (intentionally not importing from the root config to avoid a cyclic/anti-pattern reference)

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

// ═══╡ 🗿 CONSTANTS ╞═══
const PROJECT_NAME = 'integration'
const BASE_PATH_INTEGRATION = `${BASE_PATH}/${PROJECT_NAME}`

/*
 * 📋 Integration project: the infrastructure is registered and executable and
 * carries its first contract tests. Keeping an empty filtered lane green is
 * controlled at the root via passWithNoTests in vitest.config.ts — that
 * property is not a project config surface.
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
 * 🛠️ Merges the base configuration with the integration suite surface.
 */
const mergedCfg: ViteUserConfig = mergeConfig(baseConfig, cfg)

export default mergedCfg
