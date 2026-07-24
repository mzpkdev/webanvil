# WebAnvil improvements

## Automatic TypeScript project-reference checking

**Status:** Deferred

**Found in:** Pokécards

### Problem

`wa typecheck` currently runs `tsgo --noEmit`. A solution-style root
`tsconfig.json` can contain no files and only reference child projects. In that
case, the command checks no source files and reports success.

Pokécards uses this structure:

- `tsconfig.app.json` checks the application.
- `tsconfig.node.json` checks the Vite configuration.
- The root `tsconfig.json` has `"files": []` and references both projects.

### Decision

Choose the TypeScript invocation automatically, without adding configuration:

- When the root `tsconfig.json` has project references, run
  `tsgo -b --noEmit`.
- Otherwise, run `tsgo --noEmit`.
- Keep explicit-path typechecking unchanged.

Build mode can create `.tsbuildinfo` files. Projects using references remain
responsible for configuring and ignoring those files, matching `tsc -b`.

### Acceptance criteria

- A solution-style root config checks every referenced project.
- A type error in any referenced project makes `wa typecheck` fail.
- A regular single-project config keeps the current behavior.
- Explicit file paths keep the current behavior.
- Tests cover solution-style, single-project, and explicit-path projects.

## Resolve Vite production builds with production defaults

**Status:** Deferred

**Found in:** Pokécards

### Problem

WebAnvil calls `resolveConfig(config, "build")` before calling Vite's build API
so it can inspect the resolved output and public directories. The public
`resolveConfig` function defaults both mode and `NODE_ENV` to `development`
unless its production defaults are passed explicitly.

The preliminary resolution therefore sets `process.env.NODE_ENV` to
`development`. Vite's later build resolution preserves that value and bundles
development dependencies, including React's development build.

This produced the following Pokécards bundles from the same source and config:

- Direct Vite 8.0.16: 499.23 kB, 154.45 kB gzip.
- Direct Vite 8.1.5: 499.27 kB, 154.45 kB gzip.
- WebAnvil with Vite 8.1.5: 726.65 kB, 215.23 kB gzip.

The Vite version is not the cause. A controlled resolve-then-build reproduction
created the inflated bundle, while production resolution restored the 499.27
kB result and removed React's development-only code.

### Decision

Resolve web build configuration with Vite's production defaults:

`resolveConfig(config, "build", "production", "production")`

This matches the defaults used by Vite's internal build path while preserving
an explicit user-provided `NODE_ENV`. Avoid resetting `NODE_ENV` after config
resolution because that would override intentional Vite behavior.

### Acceptance criteria

- A web production build resolves with production mode and production
  `NODE_ENV` when neither was explicitly supplied.
- WebAnvil and direct Vite select the same production dependency branches.
- The Pokécards bundle no longer contains React development-only diagnostics.
- The Pokécards JavaScript and gzip sizes return to direct-Vite parity.
- An explicitly supplied `NODE_ENV` retains Vite's native behavior.
- Regression tests cover both the default production path and an explicit
  environment override.

## Publish TypeScript declarations for the WebAnvil API

**Status:** Deferred

**Found in:** Pokécards

### Problem

WebAnvil publishes `dist/index.mjs` but no declaration file, `types` field, or
typed export condition. TypeScript therefore reports `TS7016` for
`import { defineConfig } from "webanvil"` and treats the public API as `any`.
Runtime config loading still works, but consumers lose autocomplete and
compile-time validation.

The package build explicitly sets `dts: false` in `build.config.ts`. The initial
toolchain configuration used `dts: {}`, but declaration output was disabled
when the CLI was scaffolded.

Re-enabling `dts` currently fails before compilation:

```text
TypeScript is not installed. You should install `typescript` package.
Or enable `isolatedDeclarations` in your `tsconfig.json` to use Oxc instead.
```

`@typescript/native-preview` supplies `tsgo`, but it does not satisfy
`rolldown-plugin-dts`'s dependency on the `typescript` package.

### Proposed correction

Choose and validate one declaration pipeline:

- Add `typescript` as a development dependency and re-enable `dts: {}`.
- Or make the public source compatible with `isolatedDeclarations` and use
  Oxc-backed declaration generation.

The compiler-backed path is the lower-risk first fix. Publish the resulting
`dist/index.d.mts` through `package.json` using `types` and a typed export
condition.

### Acceptance criteria

- `npm run build` emits `dist/index.d.mts`.
- `npm pack --dry-run` includes the declaration file.
- `package.json` resolves runtime and type entries for `webanvil`.
- A clean consumer project imports `defineConfig` without `TS7016`.
- The consumer receives autocomplete for WebAnvil configuration.
- An invalid configuration field fails consumer typechecking.
- The declaration build runs in CI and cannot be disabled silently.

## Prefer project-local toolchain packages with WebAnvil fallbacks

**Status:** Deferred

**Found in:** Questline, then generalized across the WebAnvil toolchain

### Problem

WebAnvil currently loads its own toolchain dependencies directly. A project can
also install those packages for its configuration, plugins, setup files, or
direct scripts. Both copies can then run in the same command.

Questline exposed the concrete failure: `wa test` started WebAnvil's Vitest,
while `@testing-library/jest-dom/vitest` imported Questline's Vitest. The adapter
extended one `expect` instance and the tests used the other, so Jest DOM matchers
were missing even though direct Vitest passed.

The same ownership ambiguity applies to Vite, Rolldown, Oxlint, Oxfmt, and
`@typescript/native-preview`. Projects that deliberately install a tool should
control its version. Projects that do not should retain WebAnvil's zero-config
fallback.

### Decision

Use one resolution policy for all user-selectable toolchain packages:

- Resolve `vite`, `vitest`, `rolldown`, `oxlint`, `oxfmt`, and
  `@typescript/native-preview` from the active project or workspace first.
- When the project provides a version inside WebAnvil's supported range, run
  that exact package instance or executable.
- When the project does not provide the package, use WebAnvil's pinned fallback.
- When the project provides an incompatible version, fail with an actionable
  compatibility error instead of silently falling back.
- Report the selected package version and source, for example
  `vitest 4.1.10 (project)` or `rolldown 1.2.0 (webanvil)`.
- Substitute only the same engine. A project dependency on `typescript` does
  not replace `@typescript/native-preview`.

Project-owned configuration, setup files, and plugins remain the consumer's
responsibility. Under strict dependency layouts such as pnpm, a project-side
module that imports one of these tools must declare that tool in the project.
The WebAnvil fallback is for projects that do not otherwise depend on the tool.

### Implementation notes

- Resolve JavaScript APIs relative to the active project or workspace rather
  than through static imports from WebAnvil.
- Resolve CLI executables using the same project-first policy.
- Do not mistake an unrelated hoisted transitive dependency for an intentional
  project selection.
- Keep the supported version ranges explicit and test their minimum and maximum
  accepted versions.

### Acceptance criteria

- Every covered tool uses a compatible project-provided package when present.
- Every covered tool uses WebAnvil's pinned fallback when absent.
- An incompatible project version fails before loading configuration or
  plugins.
- Runner, configuration, setup files, and plugins resolve the same Vitest
  instance.
- Rolldown follows the same project-first behavior as Vite and Vitest.
- Command output identifies the selected source and version.
- Tests cover npm, pnpm, and Bun with both local and fallback dependencies.
- Tests cover project-side plugins and setup files that import their host tool.

## Store generated Oxc configs under `.webanvil/`

**Status:** Deferred

**Found in:** Questline

### Problem

When format or lint settings are defined in `webanvil.config.ts`, WebAnvil
serializes them for the Oxfmt or Oxlint CLI. It currently writes the generated
config directly into the project root as
`.webanvil-oxfmt-<uuid>.json` or `.webanvil-oxlint-<uuid>.json`.

Oxfmt includes its generated JSON config in the project scan and reports that
file as incorrectly formatted. `wa format --check` therefore fails on
WebAnvil's temporary file rather than the project's source. Oxlint does not lint
the JSON file, but it uses the same root-level temporary-file pattern.

### Decision

Store both generated configs inside WebAnvil's internal directory:

- `.webanvil/oxfmt-<uuid>.json`
- `.webanvil/oxlint-<uuid>.json`

Pass the exact generated path through each tool's `--config` option. Exclude
`.webanvil/**` from project source scans and preserve project-root-relative
configuration semantics after moving the config file. Keep unique filenames
for concurrent commands and remove each generated file in a `finally` block.

### Acceptance criteria

- Inline Oxfmt config no longer causes `wa format --check` to inspect its own
  generated file.
- Inline Oxlint config uses the same `.webanvil/` storage policy.
- Include and ignore patterns behave as though the config were rooted at the
  project, not at `.webanvil/`.
- Generated files are removed after successful and failed commands.
- Concurrent lint and format commands cannot overwrite each other's configs.
- Native `.oxfmtrc.json` and `.oxlintrc.json` behavior remains unchanged.

## Pass native tool configuration through unchanged

**Status:** Deferred

**Found in:** Questline

### Problem

WebAnvil redefines narrow subsets of upstream configuration. Its Vitest schema
accepts only `environment` and `include`, while Questline also needs `globals`,
`setupFiles`, and `env`. Its web build schema has no Vite `base` field. Every
missing or newly added upstream option therefore requires another WebAnvil
schema change.

This prevents a compatible project-local tool update from exposing its new
configuration immediately. It also forces Questline to retain
`vite.config.ts`, which currently causes WebAnvil's own web settings and plugin
list to be discarded.

### Decision

Keep WebAnvil's schema for orchestration concerns such as command selection,
build mode, and WebAnvil-managed copy rules. Represent tool-owned settings with
the native configuration types published by Vite, Vitest, Rolldown, Oxlint,
Oxfmt, and other integrated tools.

- Reference upstream types instead of copying their fields into WebAnvil types.
- Treat each native configuration block as opaque at runtime and pass it to the
  selected project-local or WebAnvil fallback tool unchanged.
- Validate WebAnvil-owned fields in WebAnvil; leave native-field validation to
  the tool that owns them.
- Apply tool defaults first, WebAnvil defaults second, native user
  configuration third, and explicit CLI flags last.
- Reject unsupported tool versions through the project-local compatibility
  check rather than restricting compatible configuration fields.
- Avoid exposing the same tool-owned setting in multiple WebAnvil locations.

This lets supported upstream releases add configuration without requiring a
WebAnvil release, while the supported-version range remains the compatibility
boundary.

### Acceptance criteria

- Questline can express Vite `base`, Vite plugins, and Vitest `globals`,
  `setupFiles`, and `env` in `webanvil.config.ts`.
- Questline no longer needs `vite.config.ts` solely for those settings.
- A new configuration field from a compatible tool release typechecks and
  reaches that tool without a WebAnvil schema change.
- Function-valued native configuration and plugin objects retain their
  identities.
- Explicit CLI flags override native configuration deterministically.
- Unsupported tool versions fail with an actionable compatibility error.
- Existing native Oxlint and Oxfmt configuration pass-through remains intact.

## Allow custom Node output filenames and extensions

**Status:** Deferred

**Found in:** Stageplay

### Problem

WebAnvil hard-codes Node ESM entries to `[name].js` and CommonJS entries to
`[name].cjs`. Selecting `formats` changes the module format but does not let a
package choose the filename or extension required by its public contract.

Stageplay is a CommonJS package whose metadata requires:

- CommonJS at `index.js`
- ESM at `index.mjs`

WebAnvil would instead emit ESM at `index.js` and CommonJS at `index.cjs`.
Changing Stageplay's package type only reverses which output is interpreted
incorrectly, and retaining a post-build rename step defeats WebAnvil's goal of
owning the complete build.

### Decision

Allow each Node output format to customize its Rolldown output filenames and
extensions.

- Pass native Rolldown `entryFileNames`, `chunkFileNames`, and
  `assetFileNames` options through for each generated format.
- Preserve both string templates and function-valued native options.
- Merge WebAnvil's generated ESM and CommonJS output blocks with the
  corresponding native per-format options, with explicit user configuration
  overriding WebAnvil's `[name].js` and `[name].cjs` defaults.
- Apply the same naming rules to bundled, `preserveModules`, build, and watch
  output.
- Detect cross-format filename collisions before writing output.
- Record and clean the actual emitted filenames instead of predicting paths
  from WebAnvil's default extensions.
- Do not rename files or rewrite their extensions after Rolldown emits them.

This should be exposed through the native Rolldown configuration pass-through,
not through a second WebAnvil-specific filename-template API.

### Acceptance criteria

- Stageplay can emit CommonJS `index.js` and ESM `index.mjs` in one build while
  keeping `"type": "commonjs"`.
- Stageplay's `main` and `module` fields point directly at WebAnvil outputs
  without a legacy rename pass.
- Preserved and bundled chunks use the configured extension for their format,
  and generated relative imports resolve to those filenames.
- String and function forms of Rolldown's output naming options reach Rolldown
  unchanged.
- Build metadata, source maps, watch updates, and `wa clean` use the actual
  customized output paths.
- Two formats configured to emit the same path fail before either output is
  written.

## Resolve project imports before externalizing dependencies

**Status:** Deferred

**Found in:** Stageplay

### Problem

WebAnvil currently treats every import that does not begin with `.` or `/` as
external. This correctly preserves ordinary package imports, but it also
externalizes project-local aliases such as Stageplay's `@/common`, `@/network`,
and `@/system`.

Stageplay defines `@/*` as a TypeScript path to local source files and uses
`typescript-transform-paths` in its legacy JavaScript and declaration emit.
WebAnvil never consults that mapping before its external predicate accepts the
specifier, so a successful build would retain unresolved `@/*` imports.

Scanning only direct dependencies from `package.json` is not sufficient because
a project may import an installed transitive dependency. Using
`require.resolve` as the fallback resolver is also incorrect because its
conditions can differ from Rolldown for ESM exports, browser builds, aliases,
plugins, and other native resolution settings.

### Decision

Resolve imports before deciding whether they are external:

1. Treat Node built-ins as external immediately.
2. Fast-path `.` and `/` specifiers into normal Rolldown local resolution.
3. Load the active TypeScript configuration and make its `baseUrl` and `paths`
   mappings available to Rolldown resolution.
4. Resolve every remaining specifier with Rolldown's resolver, including native
   aliases, plugins, platform, conditions, and extensions.
5. Keep targets resolved into the project source graph internal.
6. Externalize targets resolved into `node_modules` or the active package
   manager's dependency store while preserving their original package
   specifier.
7. Fail unresolved imports with Rolldown's normal diagnostic instead of
   silently treating them as external.

Do not infer dependency identity from `package.json`, and do not use
`require.resolve` as a second resolution system. Explicit native Rolldown alias
and external configuration remains the user override.

### Implementation notes

- Implement this as a Rolldown-aware resolver/externalization step so the same
  plugin chain and resolution conditions decide both locality and output.
- Cache resolutions by specifier, importer, platform, and active conditions.
- Invalidate the cache when the TypeScript configuration or watched resolution
  inputs change.
- Preserve the original bare specifier when an installed package is marked
  external; never emit its resolved absolute store path.
- Share the resolved local graph with bundled and `preserveModules` builds.
- Keep declaration aliases aligned through the `rolldown-plugin-dts` and
  project-local TypeScript transform decision.

### Acceptance criteria

- Stageplay's `@/*` imports resolve to project files and no emitted JavaScript
  contains an unresolved `@/` specifier.
- Relative and absolute project imports remain internal.
- Direct and transitive installed dependencies remain external without reading
  their names from the project's dependency lists.
- ESM export conditions, browser conditions, native aliases, and resolver
  plugins affect locality exactly as they affect Rolldown's build graph.
- An unresolved or misspelled bare import fails the build.
- External package imports retain portable package specifiers rather than
  absolute `node_modules` or package-store paths.
- Native user `resolve` and `external` settings can override WebAnvil defaults.

## Build unbundled Node output with Rolldown `preserveModules`

**Status:** Deferred

**Found in:** Argvex, Cmdore, and Stageplay

### Problem

WebAnvil currently treats the directory containing the Node entry as a source
root, globs every TypeScript and JavaScript file below it, and makes every file
a Rolldown input. This defines unbundled mode as source-tree mirroring rather
than an unbundled module graph.

Real projects colocate files that are not package output:

- Argvex emitted its specs and test setup.
- Cmdore emitted specs and type-test sources.
- Stageplay would emit its examples.
- Cmdore also rediscovered a generated Rolldown runtime helper when its output
  overlapped its source directory.

The directory layout cannot identify a package's public modules reliably.
Test-runner discovery and tsconfig exclusions are also incomplete substitutes
because projects can use other runners, helpers may not be test entries, and
JavaScript projects may have no TypeScript configuration.

### Decision

Replace unbundled source-tree globbing with Rolldown's module graph:

- `entry` is the single public root when `entries` is absent.
- `entries` declares multiple public roots in bundled and unbundled modes.
- Bundled mode keeps ordinary Rolldown bundling.
- Unbundled mode passes the same public roots to Rolldown with
  `output.preserveModules: true`.
- Set `output.preserveModulesRoot` from the stable common source root so
  reachable modules retain predictable relative paths.
- Let Rolldown follow TypeScript and JavaScript imports. Do not precompute a
  source list with directory, TypeScript, or Vitest scans.
- Require independent public modules that are unreachable from another public
  root to appear in `entries`.

This deliberately replaces the previous source-tree-mirroring contract.
Unreferenced files are no longer assumed to be publishable.

### Implementation notes

- Remove the validation that restricts `entries` to bundled mode.
- Use the selected project-local or WebAnvil fallback Rolldown instance.
- Base cleanup and build metadata on actual emitted output rather than the old
  source glob.
- Keep watch mode tied to Rolldown's graph so added and removed imports update
  the preserved output.
- Preserve native Rolldown configuration pass-through while WebAnvil owns the
  `bundle` to `preserveModules` strategy switch.

### Acceptance criteria

- Argvex unbundled output excludes its specs and setup file.
- Cmdore unbundled output excludes specs and type-test sources.
- Stageplay examples are excluded unless declared or imported by a public
  entry.
- Imported modules retain separate output files and stable relative imports.
- Multiple unbundled public entries work through `entries`.
- A vanilla JavaScript project without tsconfig, jsconfig, or Vitest builds
  correctly from its module graph.
- Declaration output follows the same reachable module graph.
- Two consecutive builds succeed when source and output directories overlap.
- Watch mode adds and removes preserved modules as imports change.

## Replace declaration post-processing with `rolldown-plugin-dts`

**Status:** Deferred

**Found in:** Argvex and Cmdore

### Problem

WebAnvil generates declarations with Rolldown's experimental
`isolatedDeclarationPlugin()`. That emitter writes one declaration per source
module using source-relative paths and requires isolated-declaration-compatible
TypeScript.

WebAnvil then moves declaration files after Rolldown finishes so mapped public
entries match their JavaScript names. For Argvex, it moved
`lib/lib/index.d.ts` to `lib/index.d.ts` but left dependency declarations under
`lib/lib/`. The entry's unchanged `./ParseError` and `./schema` imports became
broken.

Cmdore exposed the other side of the same pipeline: valid TypeScript that the
regular compiler accepts failed isolated declaration generation with seven
errors.

### Decision

Replace `isolatedDeclarationPlugin()` with a direct dependency on
`rolldown-plugin-dts` and remove WebAnvil's declaration moving, aliasing, and
import-rewriting responsibilities.

- Give the declaration plugin the same native Rolldown input names used for
  JavaScript public entries.
- Let the plugin emit final declaration chunks directly into their public
  paths.
- Default to the plugin's TypeScript generator for full TypeScript
  compatibility.
- Allow projects to select the Oxc or tsgo generator through native declaration
  configuration.
- Resolve a compatible project-local `typescript` first for the TypeScript
  generator, with a pinned WebAnvil fallback when absent.
- When the project uses `ts-patch` or `typescript-transform-paths`, preserve
  that patched compiler and declaration-transform pipeline instead of silently
  switching to WebAnvil's fallback compiler.
- Emit declarations once for ESM builds.
- For CommonJS-only or dual-format builds, run the plugin's documented separate
  ESM declaration-only pass with `emitDtsOnly: true`.
- Reject an unsupported format or option combination before building rather
  than relocating generated files afterward.

The declaration backend owns declaration paths and imports. WebAnvil owns only
entry selection, generator selection, and build orchestration.

### Implementation notes

- Remove `moveDeclarations`, `applyDeclarationAliases`, declaration staging
  directories, and their predicted-output aliases.
- Reuse the `entry` or `entries` map from the bundled or `preserveModules`
  JavaScript build.
- Emit one declaration graph when JavaScript targets both ESM and CommonJS.
- Expose the plugin's native configuration type instead of duplicating its
  options in WebAnvil.
- Resolve the TypeScript generator from the project context so a locally
  patched `typescript` package and its configured emit transforms remain
  active.
- Detect unsupported declaration transforms before building and report them
  explicitly rather than emitting declarations with unresolved path aliases.
- Record actual declaration chunks in WebAnvil build metadata and cleanup.

### Acceptance criteria

- Argvex mapped entries emit declarations at their final public paths with all
  relative imports resolving.
- Argvex builds declarations from its original valid TypeScript without the
  isolated-declaration-only annotations added by the demo.
- Cmdore emits declarations without retaining a separate `tsc` build.
- Cmdore's `ts-patch` and `typescript-transform-paths` behavior is preserved,
  and its emitted declarations contain no unresolved project path aliases.
- Bundled and `preserveModules` builds emit matching JavaScript and declaration
  entry graphs.
- ESM-only, CommonJS-only, and dual-format packages each emit declarations
  exactly once.
- A fresh consumer typechecks every mapped public entry.
- No declaration file is moved or rewritten after Rolldown completes.
- Oxc and tsgo remain explicit faster alternatives when project source supports
  them.
