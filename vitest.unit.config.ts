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

// ═══╡ 🧩 IMPORTS ╞═══
import {
    defineConfig, mergeConfig
} from 'vitest/config'

import baseConfig from './vitest.config'

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

// 📋 Define the unit test configuration
const cfg = defineConfig({
    test: {

        /**
         * Specifies the coverage configuration.
         *
         */
        coverage: {

            /**
             * Specifies the files or directories to exclude from coverage.
             *
             */
            exclude: [],

            /**
             * Specifies the coverage provider to use.
             *
             */
            provider: 'v8'
        },

        /**
         * Specifies the test files to include.
         *
         */
        include: ['test/unit/**/*.test.ts'],

        /**
         * Name of the test configuration for workspace selection.
         *
         */
        name: 'unit',

        /**
         * Specifies the setup files to use for unit tests.
         * Der Electron-Mock wird bereits in der Basiskonfiguration geladen.
         *
         */
        setupFiles: ['test/unit/test-setup.ts'],

        /**
         * Type checking configuration for unit tests.
         *
         */
        typecheck: {
            /**
             * Specifies the files to include for type checking.
             *
             */
            include: ['test/unit/**/*.test-d.ts']
        }
    }
}) satisfies ViteUserConfig

/**
 * 🛠️ Merges the existing Vitest configuration with additional custom
 * configurations defined below.
 */
const mergedCfg = mergeConfig(baseConfig, defineConfig(cfg))

export default mergedCfg
