/**
 * pnpmfile hook to rewrite OS-specific absolute `link:` dependencies at install time.
 *
 * Constraints (intentional):
 * - `package.json` does NOT expand `~`, `$HOME`, `%USERPROFILE%`.
 * - We do NOT want env vars for the fork/plugin paths.
 * - We DO want absolute paths, but Windows/Linux differ.
 *
 * Decision:
 * - Keep placeholder tokens in `package.json`.
 * - Rewrite tokens to a hardcoded Windows or Linux absolute path based on `process.platform`.
 *
 * Rewrites:
 * - `@typescript-eslint/parser` -> `link:<absolute>/packages/parser`
 * - `eslint-plugin-enterprise` -> `link:<absolute>/` (repo root)
 */

const path = require('node:path')

/**
 * @param {string} p
 * @returns {string}
 */
function normalizeForPnpm(p) {
  // pnpm accepts forward slashes on Windows; using them avoids escaping issues.
  return p.replaceAll('\\', '/')
}

/**
 * @param {string} root
 * @param {string} subPath
 * @returns {string}
 */
function linkFromRoot(root, subPath) {
  const absolute = path.resolve(root, subPath)
  return `link:${normalizeForPnpm(absolute)}`
}

/**
 * Hardcoded roots (Windows + Linux).
 *
 * NOTE:
 * These must match your local directory layout on each OS.
 */
const TYPESCRIPT_ESLINT_FORK_ROOT_WIN32 =
  'C:\\Projects\\programming-languages\\typescript\\forks\\linting\\typescript-eslint'
const TYPESCRIPT_ESLINT_FORK_ROOT_LINUX =
  '/home/t33n/Projects/programming-languages/typescript/forks/linting/typescript-eslint'

const ESLINT_PLUGIN_ENTERPRISE_ROOT_WIN32 =
  'C:\\Projects\\programming-languages\\typescript\\linting\\eslint\\eslint-plugin-enterprise'
const ESLINT_PLUGIN_ENTERPRISE_ROOT_LINUX =
  '/home/t33n/Projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise'

/**
 * @returns {{ tsEslintForkRoot: string; enterprisePluginRoot: string }}
 */
function getRootsForCurrentPlatform() {
  if (process.platform === 'win32') {
    return {
      tsEslintForkRoot: TYPESCRIPT_ESLINT_FORK_ROOT_WIN32,
      enterprisePluginRoot: ESLINT_PLUGIN_ENTERPRISE_ROOT_WIN32,
    }
  }

  return {
    tsEslintForkRoot: TYPESCRIPT_ESLINT_FORK_ROOT_LINUX,
    enterprisePluginRoot: ESLINT_PLUGIN_ENTERPRISE_ROOT_LINUX,
  }
}

/**
 * @param {Record<string, string> | undefined} deps
 * @param {string} name
 * @param {(current: string | undefined) => string | undefined} resolver
 */
function rewriteDependency(deps, name, resolver) {
  if (!deps) return
  const next = resolver(deps[name])
  if (typeof next === 'string') deps[name] = next
}

module.exports = {
  hooks: {
    /**
     * @param {import('pnpm').PackageManifest} pkg
     * @returns {import('pnpm').PackageManifest}
     */
    readPackage(pkg) {
      const { enterprisePluginRoot, tsEslintForkRoot } = getRootsForCurrentPlatform()

      const parserToken = 'link:__TSESLINT_PARSER__'
      const enterpriseToken = 'link:__ESLINT_PLUGIN_ENTERPRISE__'

      const deps = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies]
      for (const map of deps) {
        rewriteDependency(map, '@typescript-eslint/parser', (current) => {
          if (current !== parserToken) return undefined
          return linkFromRoot(tsEslintForkRoot, 'packages/parser')
        })

        rewriteDependency(map, 'eslint-plugin-enterprise', (current) => {
          if (current !== enterpriseToken) return undefined
          // Repo root (no trailing sub-path)
          return `link:${normalizeForPnpm(path.resolve(enterprisePluginRoot))}`
        })
      }

      return pkg
    },
  },
}


