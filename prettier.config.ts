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

/*
 * Enterprise Prettier configuration (TypeScript)
 * - Target: non-code assets (Markdown/MDX, YAML, HTML, CSS, GraphQL, TOML)
 * - JS/TS formatting is handled by ESLint + @stylistic; these options are aligned for safety
 */

// ═══╡ 🧩 IMPORTS ╞═══
import {
    CSS_FILES_PATTERNS, GRAPHQL_FILES_PATTERNS,
    HTML_FILES_PATTERNS, MARKDOWN_FILES_PATTERNS,
    TOML_FILES_PATTERNS, YAML_FILES_PATTERNS
} from '@shared/constants/patterns'

// ═══╡ 🏷️TYPES ╞═══
import type { Config } from 'prettier'

const config = {
    // Only non-code targets; JS/TS are formatted by ESLint
    overrides: [
        // Markdown & MDX
        {
            files: MARKDOWN_FILES_PATTERNS,
            options: {
                printWidth: 120,
                proseWrap: 'preserve'
            }
        },

        // YAML/YML
        {
            files: YAML_FILES_PATTERNS,
            options: {
                tabWidth: 2
            }
        },

        // HTML
        {
            files: HTML_FILES_PATTERNS,
            options: {
                bracketSameLine: false,
                htmlWhitespaceSensitivity: 'css',
                printWidth: 120
            }
        },

        // Stylesheets
        {
            files: CSS_FILES_PATTERNS,
            options: {
                printWidth: 120
            }
        },

        // GraphQL
        {
            files: GRAPHQL_FILES_PATTERNS,
            options: {
                printWidth: 120
            }
        },

        // TOML
        {
            files: TOML_FILES_PATTERNS,
            options: {
                printWidth: 120
            }
        }
    ],
    plugins: ['prettier-plugin-packagejson']
} satisfies Config

export default config
