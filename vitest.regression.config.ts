/*
 *███████████████████████████████████████████████████████████████████████████████
 *██******************** PRESENTED BY t33n Software ***************************██
 *██                                                                           ██
 *██                  ████████╗██████╗ ██████╗ ███╗   ██╗                      ██
 *██                  ╚══██╔══╝╚════██╗╚════██╗██╔██╗ ██║                      ██
 *██                     ██║    █████╔╝ █████╔╝██╔██╗ ██║                      ██
 *██                     ██║    ╚═══██╗ ╚═══██╗██║╚██╗██║                      ██
 *██                     ██║   ██████╔╝██████╔╝██║ ╚████║                      ██
 *██                     ╚═╝   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝                      ██
 *██                                                                           ██
 *███████████████████████████████████████████████████████████████████████████████
 *███████████████████████████████████████████████████████████████████████████████
 */

// ═══╡ 🧩 IMPORTS ╞═══
import {
    defineProject, mergeConfig
} from 'vitest/config'

import baseConfig, {
    COMMON_SETUP_FILES
} from './vitest.base.config'

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

// 📋 Define the regression verification configuration for the final modularized topology
const cfg = defineProject({
    test: {
        /**
         * Specifies the test files to include.
         */
        include: ['test/regression/**/*.test.ts'],

        /**
         * Name of the verification project for workspace selection.
         */
        name: 'regression',

        /**
         * Setup files: gemeinsame Orchestrierung plus Suite-lokales Setup.
         * Arrays werden bei mergeConfig ersetzt — der Spread ist verbindlich.
         */
        setupFiles: [
            ...COMMON_SETUP_FILES,
            'test/regression/test-setup.ts'
        ],

        /**
         * Type checking configuration for regression tests.
         */
        typecheck: {
            /**
             * Specifies the files to include for type checking.
             */
            include: ['test/regression/**/*.test-d.ts']
        }
    }
})

/**
 * 🛠️ Merges the shared modular verification baseline with the regression-specific surface.
 */
const mergedCfg: ViteUserConfig = mergeConfig(baseConfig, cfg)

export default mergedCfg
