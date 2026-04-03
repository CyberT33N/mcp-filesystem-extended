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
import { RuleConfigSeverity } from '@commitlint/types'

// ═══╡ 🏷️TYPES ╞═══
import type { UserConfig } from '@commitlint/types'

/*
 * Why constants?
 * - Makes rationale visible and reused consistently across rules.
 * - Header 72 chars is the long-standing git convention (used by Angular, Rust, Homebrew).
 * - Body 100 chars is a pragmatic wrap used by many OSS repos to balance readability and diff noise.
 */
const BODY_MAX_LINE_LENGTH = 100
const HEADER_MAX_LENGTH = 72

const config = {
    /*
     * DefaultIgnores
     * - Keep commitlint's built-in ignore list (merge commits, version tags, etc.).
     * - Industry practice: Most projects (Angular, Jest, ESLint) keep defaults to avoid
     *   false-positives on generated messages.
     * - Enterprise stance: Defaults reduce friction and align with CI auto-merges/cherry-picks.
     */
    defaultIgnores: true,

    /*
     * Extends
     * - Use the canonical baseline: @commitlint/config-conventional.
     * - Broadly adopted across OSS (Angular eco, Nx, Vite, pnpm, semantic-release templates).
     * - Ensures Conventional Commits 1.0 compatibility and a predictable rule set.
     */
    extends: ['@commitlint/config-conventional'],

    /*
     * Formatter
     * - Use the official formatter for consistent, readable output locally and in CI.
     * - Common in OSS and templates (commitlint docs, semantic-release starters).
     */
    formatter: '@commitlint/format',

    /*
     * HelpUrl
     * - Provide a single, authoritative help link for failure guidance.
     * - Industry best practice: Show actionable remediation links (Angular, Next.js repos).
     */
    helpUrl: 'https://www.conventionalcommits.org/en/v1.0.0/',

    /*
     * Ignores
     * - Allow explicit WIP commits locally to support iterative work.
     * - Best practice: Keep WIP minimal and avoid pushing to protected branches; in CI
     *   pair with `--strict` to elevate warnings to failures and gate PRs.
     * - Seen in enterprise setups where trunk requires green commit linting while
     *   developer branches tolerate temporary WIP.
     */
    ignores: [
        (message: string): boolean => message.startsWith('WIP'),
        (message: string): boolean => message.startsWith('wip')
    ],

    /*
     * ParserPreset
     * - Use the conventional commits parser so tools like conventional-changelog and
     *   semantic-release derive changelogs and versions deterministically.
     * - Mirrors setups in Angular, RxJS, NestJS, and many libraries using
     *   conventional-changelog-conventionalcommits.
     */
    parserPreset: 'conventional-changelog-conventionalcommits',

    /*
     * Prompt
     * - Integrates with @commitlint/prompt-cli / cz-commitlint to guide authors.
     * - Enterprise best practice: steer authors via curated types and clear copy,
     *   reduce lint failures, and increase semantic-release signal quality.
     */
    prompt: {
        /*
         * Messages
         * - Localized, developer-friendly hints. Mirrors the official examples.
         */
        messages: {
            emptyWarning: 'cannot be empty',
            lowerLimitWarning: 'below limit',
            max: 'upper %d chars',
            min: '%d chars at least',
            skip: 'Press enter to skip',
            upperLimitWarning: 'over limit'
        },

        /*
         * Questions
         * - Curated flow matching Conventional Commits anatomy.
         * - Type enum mirrors common OSS presets (Angular-like taxonomy with build/ci/chore).
         */
        questions: {
            body: {
                description: 'Provide a longer description of the change'
            },
            breaking: {
                description: 'Describe the breaking changes'
            },
            breakingBody: {
                description:
                    'A BREAKING CHANGE commit requires a body. Please enter a longer description of the commit itself'
            },
            isBreaking: {
                description: 'Are there any breaking changes?'
            },
            isIssueAffected: {
                description: 'Does this change affect any open issues?'
            },
            issues: {
                description:
                    'Add issue references (e.g. "fix #123", "re #123".)'
            },
            issuesBody: {
                description:
                    'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself'
            },
            scope: {
                description:
                    'What is the scope of this change (e.g. component or package name)'
            },
            subject: {
                description:
                    'Write a short, imperative tense description of the change'
            },
            type: {
                description: "Select the type of change that you're committing:",
                enum: {
                    build: {
                        description:
                            'Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)',
                        emoji: '🛠',
                        title: 'Builds'
                    },
                    chore: {
                        description:
                            "Other changes that don't modify src or test files",
                        emoji: '♻️',
                        title: 'Chores'
                    },
                    ci: {
                        description:
                            'Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)',
                        emoji: '⚙️',
                        title: 'Continuous Integrations'
                    },
                    docs: {
                        description: 'Documentation only changes',
                        emoji: '📚',
                        title: 'Documentation'
                    },
                    feat: {
                        description: 'A new feature',
                        emoji: '✨',
                        title: 'Features'
                    },
                    fix: {
                        description: 'A bug fix',
                        emoji: '🐛',
                        title: 'Bug Fixes'
                    },
                    perf: {
                        description: 'A code change that improves performance',
                        emoji: '🚀',
                        title: 'Performance Improvements'
                    },
                    refactor: {
                        description:
                            'A code change that neither fixes a bug nor adds a feature',
                        emoji: '📦',
                        title: 'Code Refactoring'
                    },
                    revert: {
                        description: 'Reverts a previous commit',
                        emoji: '🗑',
                        title: 'Reverts'
                    },
                    style: {
                        description:
                            'Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)',
                        emoji: '💎',
                        title: 'Styles'
                    },
                    test: {
                        description:
                            'Adding missing tests or correcting existing tests',
                        emoji: '🚨',
                        title: 'Tests'
                    }
                }
            }
        },

        /*
         * Settings
         * - Allow multiple scopes (e.g., package/ui) with portable separator '/'.
         * - Monorepo best practice (Nx, Turborepo): encode package + area concisely
         *   to improve changelog aggregation and release grouping.
         */
        settings: {
            enableMultipleScopes: true,
            scopeEnumSeparator: '/'
        }
    },

    rules: {
        /*
         * Body-max-line-length
         * - Encourage readable bodies in reviews and terminals; 100 strikes a balance
         *   between readability and avoiding spurious wraps in diffs.
         * - Used by many OSS repos (e.g., Angular tooling, community presets) and
         *   internal enterprise coding standards.
         */
        'body-max-line-length': [
            RuleConfigSeverity.Warning,
            'always',
            BODY_MAX_LINE_LENGTH
        ],

        /*
         * Footer-leading-blank
         * - Require a blank line before footers (BREAKING CHANGE:, refs/fixes, Co-authored-by)
         *   to ensure parsers (conventional-changelog, semantic-release) detect sections reliably.
         * - Matches defaults in @commitlint/config-conventional and common OSS practice.
         */
        'footer-leading-blank': [
            RuleConfigSeverity.Error,
            'always'
        ],

        /* Conventional baseline + gentle guidance */
        /*
         * Header-max-length
         * - Enforce 72-char header per git/Conventional Commits guidance; improves readability
         *   in CLI tools and GitHub UI. Used by Angular, Rust, Homebrew, many others.
         */
        'header-max-length': [
            RuleConfigSeverity.Error,
            'always',
            HEADER_MAX_LENGTH
        ],

        /* Encourage scoping without hard failure locally */
        /*
         * Scope-empty
         * - Prefer explicit scoping to improve changelog grouping and impact analysis.
         * - Warning-level to ease adoption; raise to Error once teams are aligned.
         * - Seen in large mono-repos that phase in scoping (e.g., Nx workspaces).
         */
        'scope-empty': [
            RuleConfigSeverity.Warning,
            'never'
        ],

        /*
         * Subject-case
         * - Disallow sentence/start/pascal/upper case to nudge towards lower/imperative style.
         * - Mirrors @commitlint/config-conventional default and widely used OSS norms.
         */
        'subject-case': [
            RuleConfigSeverity.Error,
            'never',
            [
                'sentence-case',
                'start-case',
                'pascal-case',
                'upper-case'
            ]
        ],

        /*
         * Subject-empty
         * - Require a non-empty subject to avoid meaningless commits; standard across
         *   Conventional Commits implementations.
         */
        'subject-empty': [
            RuleConfigSeverity.Error,
            'never'
        ],

        /* Types curated for enterprise baseline */
        /*
         * Type-enum
         * - Canonical set used across conventional-changelog ecosystems (feat/fix/docs/style/...).
         * - Matches examples from Angular preset and commitlint docs; ensures semantic-release
         *   can classify changes for versioning and changelog sections.
         */
        'type-enum': [
            RuleConfigSeverity.Error,
            'always',
            [
                'feat',
                'fix',
                'docs',
                'style',
                'refactor',
                'perf',
                'test',
                'build',
                'ci',
                'chore',
                'revert'
            ]
        ]
    }
} satisfies UserConfig

export default config
