// ═══╡ 🧩 IMPORTS ╞═══
import { defineConfig } from 'vitest/config'

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

/*
 * 📋 Root configuration for the modular server topology.
 * Carries only global, process-wide options (coverage) and the project
 * registration. Shared test options, plugins, and setup orchestration live in
 * vitest.base.config.ts.
 */
const cfg = defineConfig({
    test: {
        /**
         * Configuration for coverage reporting.
         */
        coverage: {
            /**
             * Specifies whether coverage is enabled.
             */
            enabled: true,

            /**
             * Specifies the files or directories to exclude from coverage.
             */
            exclude: [
                '**/e2e/**',
                '**/*.e2e.{ts,tsx,js,jsx}',
                'dist/',
                'out/',
                'log/',
                '.cursor/'
            ],

            /**
             * Restricts coverage measurement to TypeScript sources so the v8
             * provider never attempts to parse Markdown or other non-code
             * artifacts beneath src/.
             */
            include: ['src/**/*.ts'],

            /**
             * Specifies the coverage provider to use.
             */
            provider: 'v8',

            /**
             * Specifies the coverage reporters to use.
             */
            reporter: [
                'text',
                'json',
                'html'
            ]
        },

        /**
         * Project configurations keep unit, integration and regression
         * verification surfaces distinct while sharing one modularized server
         * baseline.
         */
        projects: [
            './vitest.unit.config.ts',
            './vitest.integration.config.ts',
            './vitest.regression.config.ts'
        ],

        /**
         * The integration lane is deliberately registered while still empty:
         * the exit code of an empty filtered lane is evaluated at the root —
         * the run visibly reports "No test files found" and still ends green.
         */
        passWithNoTests: true
    }
}) satisfies ViteUserConfig

/**
 * Represents the configuration for the Vitest test runner.
 */
export default cfg
