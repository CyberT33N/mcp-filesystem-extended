

Wieso kommt hier unten die Anzeige, dass für Fixed String noch keine Matches gefunden wurden, und warum passiert das hier redundant, sodass unterschiedliche Sachen angezeigt werden?

Bei Fixed String wird ja nur ein Wert gesucht. Wir suchen zwar in mehreren Routes, aber ist das aus Developer-Experience-Sicht hier nicht ein bisschen falsch? Müsste man es nicht anders anzeigen, nämlich dass es in der Route, in der gesucht wurde, nicht gefunden wurde?

Oder wie kommt es überhaupt dazu, dass unten die Anzeige „No Matches Found“ erscheint?

Bitte mal genauer analysieren, was aus DX-Sicht eigentlich richtig ist.




```
roots
[ "/home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries", "/home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/typescript-eslint/rules", "/home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/typescript-eslint/utils", "/home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/formatting", "/home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/frameworks/react", "/home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/security/no-secrets" ]
fixedString
@shared/constants/patterns
includeGlobs
[ "**/*.ts" ]
maxResults
200
caseSensitive
true
Found 125 matches in 125 locations

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/data-modules/internal/constants/rules.ts
  Line 19: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/data-modules/internal/exports/rules.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/data-modules/internal/pipelines/rules.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/hexagonal/disallow.rules.ts
  Line 26: } from '@shared/constants/patterns'
  Line 28: import { patterns as applicationAclDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/application/acl/directory-names'
  Line 29: import { patterns as applicationDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/application/directory-names'
  Line 30: import { patterns as domainDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/domain/directory-names'
  Line 31: import { patterns as infrastructureDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/infrastructure/directory-names'
  Line 32: import { patterns as sharedDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/shared/directory-names'
  Line 33: import { patterns as sharedSchemasDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/shared/schemas/directory-names'
  Line 34: import { patterns as utilsDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/utils/directory-names'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/hexagonal/ports.rules.ts
  Line 26: } from '@shared/constants/patterns'
  Line 28: import { patterns as infrastructureDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/infrastructure/directory-names'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/module-first/entry-points/contracts.rules.ts
  Line 19: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/architecture/module-structure/module-first/privacy.rules.ts
  Line 31: } from '@shared/constants/patterns'
  Line 33: import { patterns as applicationAclDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/application/acl/directory-names'
  Line 34: import { patterns as applicationDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/application/directory-names'
  Line 35: import { patterns as domainDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/domain/directory-names'
  Line 36: import { patterns as infrastructureDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/infrastructure/directory-names'
  Line 37: import { patterns as utilsDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/utils/directory-names'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/src/cache/cache.rules.ts
  Line 31: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/src/http/server.rules.ts
  Line 19: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/src/http/specs.rules.ts
  Line 25: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/src/observability/observability-logging.rules.ts
  Line 21: } from '@shared/constants/patterns'
  Line 23: import { patterns as loadersDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/loaders/directory-names'
  Line 24: import { patterns as observabilityDirectoryNames } from '@shared/constants/patterns/internal/constants/areas/src/observability/directory-names'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/src/shared/rules.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/test/test.rules.ts
  Line 17: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/element-types/groups/areas/tooling/tooling.rules.ts
  Line 27: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/architecture/module-structure/hexagonal/targets.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/assets/targets.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/docs/targets.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/locales/targets.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/repository-configs.targets.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/cache/targets.ts
  Line 24: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/configs/env.targets.ts
  Line 24: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/entry/entry-files.targets.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/contracts/api.targets.ts
  Line 18: import { API_CONTRACT_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/contracts/domain.targets.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/contracts/routes.targets.ts
  Line 18: import { ROUTE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/contracts/schemas.targets.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/contracts/shared-index.targets.ts
  Line 18: import { INDEX_FILE_NAME_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/contracts/specs.targets.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/middleware/auth.targets.ts
  Line 18: import { MIDDLEWARE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/middleware/errors.targets.ts
  Line 18: import { MIDDLEWARE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/middleware/logging.targets.ts
  Line 18: import { MIDDLEWARE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/middleware/observability.targets.ts
  Line 18: import { MIDDLEWARE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/middleware/security.targets.ts
  Line 18: import { MIDDLEWARE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/middleware/targets.ts
  Line 18: import { MIDDLEWARE_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/server/targets.ts
  Line 18: import { ALL_ELEMENTS_WILDCARD } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/http/targets.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/loaders/targets.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/main/modes/targets.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/modules/components-and-modules.targets.ts
  Line 18: import { INDEX_FILE_NAME_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/observability/logger-registry.targets.ts
  Line 18: import { LOGGER_REGISTRY_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/observability/logger.targets.ts
  Line 18: import { LOGGER_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/shared/constants.targets.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/src/shared/shared-schemas.targets.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/build-presets.targets.ts
  Line 18: import { PRESET_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/configs.targets.ts
  Line 27: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/eslint.targets.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/formatting-presets.targets.ts
  Line 18: import { PRESET_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/generic.targets.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/observability.targets.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/protection.targets.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/shared/constants.targets.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/testing-presets.targets.ts
  Line 18: import { PRESET_TS_JS_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/entry-points/targets/tooling/types.targets.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/rules/external.rules.ts
  Line 17: import { LOGGER_LIBRARY_NAMES } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/architectures/module-structure/hexagonal/elements.ts
  Line 29: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/architectures/module-structure/no-module/elements.ts
  Line 19: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/examples.ts
  Line 18: import { EXAMPLES_DIR_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/assets/elements.ts
  Line 18: import { SRC_ASSETS_DIR_PATTERNS, SRC_ASSETS_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/bootstrap/elements.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/cache/elements.ts
  Line 30: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/configs/elements.ts
  Line 29: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/entry-points.ts
  Line 24: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/errors/elements.ts
  Line 18: import { SRC_ERRORS_DIR_PATTERNS, SRC_ERRORS_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/events/domain/elements.ts
  Line 18: import { LEGACY_SRC_EVENTS_DOMAIN_DIR_PATTERNS, SRC_EVENTS_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/events/integration/elements.ts
  Line 18: import { SRC_EVENTS_INDEX_FILES_PATTERNS, SRC_EVENTS_INTEGRATION_DIR_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/http/contracts/elements.ts
  Line 36: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/http/server/elements.ts
  Line 35: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/infrastructure/datasources/elements.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/infrastructure/elements.ts
  Line 24: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/integration/elements.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/jobs/elements.ts
  Line 18: import { SRC_JOBS_DIR_PATTERNS, SRC_JOBS_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/loaders/elements.ts
  Line 23: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/locales/elements.ts
  Line 18: import { SRC_LOCALES_DIR_PATTERNS, SRC_LOCALES_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/main/entry-points.ts
  Line 29: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/mappers/elements.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/messaging/elements.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/migrations/elements.ts
  Line 18: import { SRC_MIGRATIONS_DIR_PATTERNS, SRC_MIGRATIONS_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/observability/elements.ts
  Line 29: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/plugins/elements.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/repositories/elements.ts
  Line 18: import { SRC_REPOSITORIES_DIR_PATTERNS, SRC_REPOSITORIES_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/runtime/elements.ts
  Line 43: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/security/elements.ts
  Line 18: import { SRC_SECURITY_DIR_PATTERNS, SRC_SECURITY_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/server/elements.ts
  Line 18: import { SRC_SERVER_DIR_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/shared/elements.ts
  Line 35: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/shared/types/elements.ts
  Line 26: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/transformers/elements.ts
  Line 18: import { SRC_TRANSFORMERS_DIR_PATTERNS, SRC_TRANSFORMERS_INDEX_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/src/type-definitions.ts
  Line 18: import { SRC_DECLARATION_FILES_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/test/elements.ts
  Line 42: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/tooling/elements.ts
  Line 86: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/settings/elements/areas/tools.ts
  Line 18: import { TOOLS_DIR_PATTERNS } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/assets.contract.ts
  Line 19: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/cache-layer/cache.contract.ts
  Line 21: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/configs-layer/configs.contract.ts
  Line 17: import type { ModuleFirstInternalDirName, SrcConfigsDirName } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/configs-layer/env/env.contract.ts
  Line 19: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/configs-layer/env/schemas.contract.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/configs-layer/logging.contract.ts
  Line 23: import type { SrcConfigsDirName, SrcConfigsLoggingDirName } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/http-layer/contracts-layer/contracts-layer.contract.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/http-layer/contracts-layer/domains.contract.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/http-layer/contracts-layer/schemas.contract.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/http-layer/contracts-layer/shared.contract.ts
  Line 25: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/contracts/elements/areas/src-layer/http-layer/contracts-layer/specs.contract.ts
  Line 31: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/assets/tokens.ts
  Line 20: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/configs/env/schemas/tokens.ts
  Line 17: import { SRC_CONFIGS_DIR_NAME, SRC_CONFIGS_ENV_DIR_NAME } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/configs/env/tokens.ts
  Line 17: import { SRC_CONFIGS_DIR_NAME, SRC_CONFIGS_ENV_DIR_NAME } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/configs/logging/tokens.ts
  Line 17: import { SRC_CONFIGS_DIR_NAME, SRC_CONFIGS_LOGGING_DIR_NAME } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/configs/tokens.ts
  Line 20: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/http/contracts/domains/tokens.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/http/contracts/schemas/tokens.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/http/contracts/shared/tokens.ts
  Line 22: } from '@shared/constants/patterns'

File: /home/t33n/projects/programming-languages/typescript/linting/eslint/eslint-plugin-enterprise/src/modules/boundaries/tokens/elements/areas/src/http/contracts/specs/tokens.ts
  Line 25: } from '@shared/constants/patterns'

No matches found for fixed string: @shared/constants/patterns
Searched 36 files

No matches found for fixed string: @shared/constants/patterns
Searched 13 files

No matches found for fixed string: @shared/constants/patterns
Searched 27 files

No matches found for fixed string: @shared/constants/patterns
Searched 27 files

No matches found for fixed string: @shared/constants/patterns
Searched 28 files
``