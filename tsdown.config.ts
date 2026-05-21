import { defineConfig } from 'tsdown'

export default defineConfig({
    // Keep CJS output intentionally for the internal protection pipeline.
    checks: {
        legacyCjs: false
    },
    clean: true,
    deps: {
        // Preserve the existing node-runtime behavior and avoid bundling native addons.
        skipNodeModulesBundle: true
    },
    dts: {
        /*
         * Keep the existing composite workaround for declaration bundling and use
         * the TypeScript resolver for better compatibility with complex third-party types.
         */
        compilerOptions: {
            composite: false
        },
        resolver: 'tsc'
    },
    entry: {
        index: 'src/index.ts'
    },
    format: [
        'esm',
        'cjs'
    ],
    minify: false,
    // Preserve `node:` builtins such as `node:sqlite` exactly as written in source.
    nodeProtocol: false,
    outExtensions({ format }) {
        return {
            js: format === 'cjs' ? '.cjs' : '.js'
        }
    },
    platform: 'node',
    report: false,
    sourcemap: true,
    treeshake: true,
    // tsdown automatically targets the exact Node runtime from package.json#engines.node.
    tsconfig: 'tsconfig.node.json'
})
