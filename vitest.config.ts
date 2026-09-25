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
import { defineConfig } from 'vitest/config'

// ═══╡ 🏷️TYPES ╞═══
import type { ViteUserConfig } from 'vitest/config'

/*
 * 📋 Root-Konfiguration für die modulare Server-Topologie.
 * Trägt ausschließlich globale, prozessweite Optionen (Coverage) und die Projekt-Registrierung.
 * Geteilte Test-Optionen, Plugins und Setup-Orchestrierung leben in vitest.base.config.ts.
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
             * Specifies the directories to include for coverage.
             */
            include: ['src/'],

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
         * Project configurations keep unit, integration and regression verification surfaces
         * distinct while sharing one modularized server baseline.
         */
        projects: [
            './vitest.unit.config.ts',
            './vitest.integration.config.ts',
            './vitest.regression.config.ts'
        ],

        /**
         * Die Integrations-Lane ist absichtlich registriert, aber noch ohne Tests.
         * Der Exit-Code einer leeren, gefilterten Lane wird root-seitig bewertet:
         * Der Lauf meldet sichtbar "No test files found" und endet dennoch grün.
         */
        passWithNoTests: true
    }
}) satisfies ViteUserConfig

/**
 * Represents the configuration for the Vitest test runner.
 */
export default cfg
