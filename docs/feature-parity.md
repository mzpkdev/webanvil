# WebAnvil feature parity

WebAnvil is a single-project CLI that combines Vite for web applications,
Rolldown for Node builds, Vitest, Oxlint, Oxfmt, and TypeScript Native Preview.
It covers the daily application loop and explicit package builds. Its main
remaining gaps are package metadata validation and workspace orchestration.

## Scope

- **WebAnvil** is assessed from the current implementation and automated tests.
- **unbuild** is the comparison point for JavaScript and TypeScript package
  builds.
- **obuild** is a small, zero-config package builder that itself uses Rolldown.
- **Vite+** is the comparison point for a unified web-development toolchain.
- "Partial" means the outcome exists but its configuration or behavior is
  narrower than the comparator's documented offering.

## Parity matrix

| Capability                          | WebAnvil                                    | unbuild                              | obuild                 | Vite+                             | Gap for WebAnvil                                  |
| ----------------------------------- | ------------------------------------------- | ------------------------------------ | ---------------------- | --------------------------------- | ------------------------------------------------- |
| Web application build               | Yes, Vite                                   | No                                   | No                     | Yes, `vp build`                   | None for the core case                            |
| Web development server              | Yes, Vite                                   | No                                   | No                     | Yes, `vp dev`                     | None for the core case                            |
| Node package build                  | Yes, preserved graph or bundled output      | Yes                                  | Yes                    | Yes, `vp pack`                    | Package metadata validation                       |
| Type declarations                   | Yes, opt-in `rolldown-plugin-dts`           | Yes, package-aware modes             | Yes, `dts` options     | Yes, `pack.dts`                   | Validate declared package type exports            |
| Multiple entries                    | Yes, explicit public mappings               | Yes                                  | Yes                    | Yes                               | Package entry inference                           |
| Bundleless output                   | Yes, reachable graph with `preserveModules` | Yes, `mkdist`                        | Yes, transform entries | Partial, via `pack` features      | File transforms                                   |
| Platform and syntax targets         | Yes, independently routed                   | Yes                                  | Yes                    | Yes                               | None                                              |
| Native engine configuration         | Yes, typed passthrough blocks               | Partial                              | Yes                    | Yes                               | None for integrated tools                         |
| Project/workspace tool selection    | Yes, compatible declaration or fallback     | N/A                                  | N/A                    | Yes                               | No installation management by design              |
| Package entry inference             | No, explicit entries                        | Yes, from `package.json`             | No                     | Config-driven                     | Infer and validate `exports`, `main`, and `types` |
| Package build validation            | No                                          | Missing and unused dependency checks | No                     | N/A                               | Detect invalid exports and dependency mistakes    |
| Stub development build              | No                                          | Yes                                  | Yes                    | No                                | Lower-priority developer convenience              |
| Build watch                         | Yes, transactional Node rebuilds            | Yes                                  | No documented mode     | Yes, `pack --watch`               | Config reload and richer diagnostics              |
| Package hooks                       | No                                          | No                                   | Yes                    | No                                | Build lifecycle extension points                  |
| Test                                | Yes, Vitest                                 | No                                   | No                     | Yes, `vp test`                    | None for the core case                            |
| Lint, format, typecheck             | Yes, direct and via `wa check`              | No                                   | No                     | Yes, direct and `vp check`        | None                                              |
| Production preview                  | Yes, Vite                                   | No                                   | No                     | Yes, `vp preview`                 | None for the core case                            |
| Workspace task runner               | No                                          | No                                   | No                     | Yes, cached `vp run`              | Dependency-aware workspace execution              |
| Monorepo configuration              | No                                          | No                                   | No                     | Yes, root config and overrides    | Workspace config inheritance                      |
| Project scaffolding and migration   | No                                          | No                                   | No                     | Yes, `vp create` and `vp migrate` | Templates first, migration later                  |
| Runtime and package-manager control | External by design                          | No                                   | No                     | Yes                               | None planned                                      |

## Current WebAnvil evidence

- Commands select a compatible tool declared directly by the project or its
  containing workspace. Undeclared tools use WebAnvil's exact fallback; merely
  hoisted tools do not become project selections. Missing or incompatible
  command-engine declarations fail before WebAnvil configuration loads, and the
  CLI reports the selected package, version, and source.
- Native `vite`, `test`, `rolldown`, `lint`, and `format` blocks retain their
  upstream TypeScript types. Native Vite, Vitest, and Oxc files take precedence
  over matching WebAnvil blocks, while explicit CLI values remain the final
  run-specific override.
- Node `entry` and `entries` are public roots in bundled and unbundled modes.
  Unbundled builds use `preserveModules` for the reachable graph rather than
  mirroring the source tree.
- TypeScript paths, native resolver aliases and plugins, export conditions, and
  explicit external settings resolve before package externalization. Local
  results remain internal, installed packages retain their original external
  specifier, and unresolved imports fail.
- Per-format native Rolldown naming supports strings and callbacks. One-shot and
  watch builds generate all formats before committing, detect generated/copy
  collisions, retain or restore the last successful output after failure, and
  record actual emitted paths for stale cleanup and `wa clean`.
- Declarations use `rolldown-plugin-dts`. TypeScript is the default generator;
  Oxc and `tsgo` are explicit alternatives. Directly declared `ts-patch` and
  TypeScript declaration transforms use the selected project compiler, subject
  to the one-compiler-identity-per-process constraint.
- Published-package tests install the packed tarball into TypeScript consumers
  and verify the public configuration types under Bundler and NodeNext
  resolution. Declaration consumer tests do the same for root and subpath type
  exports.
- `wa dev` starts Vite for web projects. Node watch mode shares the one-shot
  build plan, including entries, formats, declarations, native naming, static
  copies, stale-output cleanup, and build-info. It does not execute or restart
  Node output.
- `wa preview` serves web output through Vite. `wa test` exposes native Vitest
  configuration plus one-shot, watch, V8 coverage, and UI modes. `wa check`
  runs formatting, linting, and type checking sequentially and stops at the
  first failure; tests remain a separate workflow.

## Next package-build gap

Keep one `wa build` command and add package metadata validation around its
existing explicit public roots:

- infer entries when the project opts into package inference;
- validate generated files against `exports`, `main`, `module`, and `types`;
- detect missing and unused dependency declarations;
- report output files, formats, and exports in one-shot and watch summaries.

Rolldown remains the low-level build engine. obuild is a useful reference for
package validation, transform entries, hooks, and stub mode, but it does not
replace WebAnvil's Vite application or development-server workflows.

## Workspace execution

Workspace-aware tool discovery is implemented only for selecting directly
declared compatible tools. Dependency ordering, root configuration inheritance,
cached tasks, and multi-project execution remain future work. Adding them would
change WebAnvil from a project CLI into a workspace task runner.

Package-manager lifecycle remains external. npm, pnpm, Yarn, and Bun own
dependency declarations, lockfiles, installation, and global runtime state;
WebAnvil only selects and executes compatible installed tools.

## Verification scope

Repository unit, end-to-end, package-manager, packed-package, and typed-consumer
tests are automated acceptance evidence. Pokécards, Questline, Argvex, Cmdore,
and Stageplay are external projects used for manual compatibility checks; this
repository does not claim automated acceptance for them.

## Source material

- [unbuild documentation](https://unjs.io/packages/unbuild/) documents inferred
  entries, ESM/CJS builds, declaration modes, `mkdist`, stubs, and build checks.
- [obuild README](https://github.com/unjs/obuild#readme) documents its
  Rolldown-backed bundle and transform entries, declaration options, hooks, and
  stub mode.
- [Vite+ guide](https://viteplus.dev/guide/) documents its lifecycle commands,
  including create, dev, check, test, build, pack, and workspace task execution.
- [Vite+ pack guide](https://viteplus.dev/guide/pack) documents library builds,
  declaration output, formats, watch mode, CSS bundling, and executables.
- [Vite+ run guide](https://viteplus.dev/guide/run) documents cached,
  dependency-aware workspace task execution.
