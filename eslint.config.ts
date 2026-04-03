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
import { enterprisePlugin } from 'eslint-plugin-enterprise'
import tseslint from 'typescript-eslint'

// ═══╡ 🏷️TYPES ╞═══
import type { TSESLint } from '@typescript-eslint/utils'

// ═══╡ 🏷️CONFIG ╞═══
const config: TSESLint.FlatConfig.ConfigArray = tseslint.config(

    /*
     *╭───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
     *📏 MASTER CONFIG    ►  All-in-one config for enterprise projects
     *╰───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
     */
    enterprisePlugin.configs['all'],

    /*
     *╭───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
     *🔧 OVERRIDE CONFIGS   ►  Override configs
     *╰───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───═══◎◎◎═══───
     */

    /**
     * Wir aktivieren hier den **Code-Block-Parser** vom **Markdown-Plugin**. Und zusätzlich **MUSS** die **Sona.js-Regel** noch deaktiviert werden, weil wir ja in unserem **Custom Forks** es bearbeitet haben, dass die Dateien nun physisch gespeichert werden und diese **Sona.js-Regel** kollidiert damit.
     */
    {
        files: [
            '**/*.md',
            '**/*.mdc'
        ],
        processor: 'markdown/markdown'
    },
    {
        files: [
            '**/*.md/*',
            '**/*.mdc/*'
        ],
        rules: {
            'sonarjs/deprecation': 'off',

            /**
             * Die Dateien, die hier im **ESLint Markdown-Ordner** erstellt werden, entsprechen dementsprechend nicht der **Namenskonvention**, was aber auch irrelevant ist. Deswegen **MUSST** wir die **Regel** deaktivieren.
             */
            'unicorn/filename-case': 'off',

            /**
             * Also, wenn wir Autofix mit ES-Lint benutzen, schlägt trotzdem noch dieser Fehler hier an. In Zukunft **KANN** man mal gucken, wieso, aber es ist einfach, es erst mal zu deaktivieren.
             */
            '@stylistic/linebreak-style': 'off',

            /**
             * Wir deaktivieren diese Regel, weil wir die Dateien physisch nicht gespeichert haben und diese Regel kollidiert damit.
             */
            'import-x/no-unresolved': 'off',

            /**
             * Wir deaktivieren diese Regel, weil wir die Dateien physisch nicht gespeichert haben und diese Regel kollidiert damit. Wir **MÜSSEN** halt theoretisch die ganzen **Dependencies** installieren, was wir hochskaliert natürlich jetzt nicht sicherstellen **KÖNNEN**, nur um das hier sicherzustellen. In Zukunft mal vielleicht Gedanken darum machen, wie wir das lösen **KÖNNEN**.
             */
            'sonarjs/no-implicit-dependencies': 'off'
        }
    }
)

export default config
