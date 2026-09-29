// ═══╡ 🧩 IMPORTS ╞═══
import {
    defineProject, mergeConfig
} from 'vitest/config'

import baseConfig, {
    COMMON_SETUP_FILES
} from './vitest.base.config'

// (intentionally not importing from the root config to avoid a cyclic/anti-pattern reference)

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

// ═══╡ 🗿 CONSTANTS ╞═══
const PROJECT_NAME = 'unit'

// 📋 Define the unit verification configuration
const cfg = defineProject({
    test: {
        /**
         * Specifies the test files to include.
         */
        include: ['test/unit/**/*.test.ts'],

        /**
         * Name of the verification project for workspace selection.
         */
        name: PROJECT_NAME,

        /**
         * Setup files: common orchestration plus the suite-local setup.
         * Arrays are replaced by mergeConfig — the spread is binding.
         */
        setupFiles: [
            ...COMMON_SETUP_FILES,
            'test/unit/test-setup.ts'
        ],

        /**
         * Type checking configuration for unit tests.
         */
        typecheck: {
            /**
             * Specifies the files to include for type checking.
             */
            include: ['test/unit/**/*.test-d.ts']
        }
    }
})

/**
 * 🛠️ Merges the shared verification baseline with the unit-specific surface.
 */
const mergedCfg: ViteUserConfig = mergeConfig(baseConfig, cfg)

export default mergedCfg
