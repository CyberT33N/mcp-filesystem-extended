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
import { defineConfig } from 'tsup'

// ═══╡ 🏷️TYPES ╞═══
import type { Format } from 'tsup'

/**
 * Context for out path generation.
 *
 * @remarks
 * This is a helper type to avoid inline `Readonly<...>` in parameter types.
 */
interface ContextForOutPathGeneration {
    /**
     * The format of the output file.
     *
     * @remarks
     * This is the format of the output file.
     *
     * @example
     * ```ts
     * 'esm'
     * 'cjs'
     * ```
     */
    readonly format: Format
}

/**
 * ✅ TSUP CONFIGURATION.
 *
 * • target: 'node20', Defaults to compilerOptions.target in your tsconfig.json
 * • clean: True
 * • dts: \{ compilerOptions: \{ composite: false \}, resolve: true \}
 *   - dts: Lässt tsup deklarationsdateien (.d.ts) erzeugen/bündeln
 *   - composite (nur für den DTS‑Schritt hier):
 *       true  → TS Projekt‑Referenzen/inkrementelle Builds; erfordert vollständige Projektdateiliste
 *       false → Einzelprojekt‑Modus; verhindert TS6307 im tsup‑DTS‑Build
 *     Hinweis: Wir deaktivieren composite nur HIER für die .d.ts‑Erzeugung. Ihre
 *     tsconfig.node.json kann weiterhin mit "composite": true (IDE, tsc -b) arbeiten.
 * • entry: ['src/index.ts']
 * • minify: False
 * • sourcemap: True
 * • treeshake: True
 * • tsconfig: 'tsconfig.node.json'.
 */
const config = defineConfig({
    clean: true,

    /*
     * DTS‑Erzeugung via tsup
     * - resolve: true   → löst Referenzen auf externe Typen aus node_modules
     * - composite:false → deaktiviert Projekt‑Referenzen NUR für diesen Schritt, um
     *                     TS6307 („File ... is not listed within the file list of project …“)
     *                     zu vermeiden. Der normale tsc/IDE‑Flow bleibt unverändert.
     */
    dts: {
        /*
         * Workaround for TS project references affecting tsup's dts bundling
         * Ref: https://github.com/egoist/tsup/issues/647 and #571
         */
        compilerOptions: {
            composite: false
        },
        resolve: true
    },

    entry: {
        /**
         * Public plugin entry (published API surface).
         */
        index: 'src/index.ts'
    },

    /*
     * Will be used for exports in package.json
     *
     * We intentionally build **both** ESM and CJS variants:
     * - ESM (`dist/index.js`)  → offizieller Runtime-Entry für reguläre Consumers.
     * - CJS (`dist/index.cjs`) → technische Basis für die Protection-Pipeline
     *   (Terser → javascript-obfuscator → bytenode → Encryption + Loader‑Stub).
     *
     * Der CJS-Output wird anschließend **nicht** direkt von diesem Projekt benutzt,
     * sondern ausschließlich als Input für die Build-Schutzschichten im
     * `tooling/protection`‑Boundary. Dadurch bleibt der öffentliche Contract
     * (ESM‑Exports aus `dist/index.js`) stabil, während die Distribution‑Ebene
     * intern weitergehenden Schutz erfährt.
     */
    format: [
        'esm',
        'cjs'
    ],
    minify: false,

    /*
     * Why platform 'node' and skipNodeModulesBundle:
     * - platform: 'node' → explizit Node‑Runtime (keine Web‑Polyfills, erwartetes Auflösungsverhalten für Node‑Module/ESM/CJS).
     * - skipNodeModulesBundle: true → bundle node_modules NICHT mit; Resolver/Plugins bleiben extern.
     *   Verhindert das Einpacken nativer .node‑Artefakte (z. B. unrs‑resolver via import‑x) und behebt die beobachteten
     *   "Cannot find module './resolver.*.node'"‑Fehler in tsup/esbuild.
     */
    platform: 'node',
    skipNodeModulesBundle: true,

    /**
     * Dateiendungen pro Format:
     * - ESM  → `.js`   (konform zu `"type": "module"` in package.json)
     * - CJS  → `.cjs`  (saubere Trennung und expliziter Stub‑Entry für Consumer).
     *
     * Beispiel-Ausgabe:
     * - `dist/index.js`   (ESM)
     * - `dist/index.cjs`  (CommonJS – Basis für die Protection-Pipeline).
     *
     * @returns - Extension based on format.
     */
    outExtension({ format }: ContextForOutPathGeneration) {
        return {
            js: format === 'cjs' ? '.cjs' : '.js'
        }
    },

    sourcemap: true,
    treeshake: true,
    tsconfig: 'tsconfig.node.json'
})

export default config
