# WebAnvil feature parity

WebAnvil is a single-project CLI that combines Vite for web applications,
Rolldown for Node builds, Vitest, Oxlint, Oxfmt, and TypeScript Native Preview.
It already covers the daily app loop. Its main gaps are library packaging depth
and workspace orchestration.

## Scope

- **WebAnvil** is assessed from the current implementation, not its README.
- **unbuild** is the comparison point for JavaScript and TypeScript package
  builds.
- **obuild** is a small, zero-config package builder that itself uses Rolldown.
- **Vite+** is the comparison point for a unified web-development toolchain.
- "Partial" means the outcome exists but its configuration or behavior is
  narrower than the comparator's documented offering.

## Parity matrix

| Capability                          | WebAnvil                        | unbuild                              | obuild                 | Vite+                             | Gap for WebAnvil                                  |
| ----------------------------------- | ------------------------------- | ------------------------------------ | ---------------------- | --------------------------------- | ------------------------------------------------- |
| Web application build               | Yes, Vite                       | No                                   | No                     | Yes, `vp build`                   | None for the core case                            |
| Web development server              | Yes, Vite                       | No                                   | No                     | Yes, `vp dev`                     | None for the core case                            |
| Node package build                  | Yes, mirrored or bundled output | Yes                                  | Yes                    | Yes, `vp pack`                    | Package validation                                |
| Type declarations                   | Partial, opt-in Rolldown output | Yes, package-aware modes             | Yes, `dts` options     | Yes, `pack.dts`                   | Package export-aware declaration layout           |
| Multiple entries                    | Yes, explicit mappings          | Yes                                  | Yes                    | Yes                               | Package entry inference                           |
| Bundleless output                   | Yes, mirrors dirname(entry)     | Yes, `mkdist`                        | Yes, transform entries | Partial, via `pack` features      | File transforms                                   |
| Platform and syntax targets         | Yes, independently routed       | Yes                                  | Yes                    | Yes                               | None                                              |
| Package entry inference             | No, explicit entries            | Yes, from `package.json`             | No                     | Config-driven                     | Infer and validate `exports`, `main`, and `types` |
| Package build validation            | No                              | Missing and unused dependency checks | No                     | N/A                               | Detect invalid exports and dependency mistakes    |
| Stub development build              | No                              | Yes                                  | Yes                    | No                                | Lower priority developer convenience              |
| Build watch                         | Yes, full configured Node build | Yes                                  | No documented mode     | Yes, `pack --watch`               | Config reload and richer recovery diagnostics     |
| Package hooks                       | No                              | No                                   | Yes                    | No                                | Build lifecycle extension points                  |
| Test                                | Yes, Vitest                     | No                                   | No                     | Yes, `vp test`                    | None for the core case                            |
| Lint, format, typecheck             | Yes, direct and via `wa check`  | No                                   | No                     | Yes, direct and `vp check`        | None                                              |
| Production preview                  | Yes, Vite                       | No                                   | No                     | Yes, `vp preview`                 | None for the core case                            |
| Workspace task runner               | No                              | No                                   | No                     | Yes, cached `vp run`              | Dependency-aware workspace execution              |
| Monorepo configuration              | No                              | No                                   | No                     | Yes, root config and overrides    | Workspace config inheritance                      |
| Project scaffolding and migration   | No                              | No                                   | No                     | Yes, `vp create` and `vp migrate` | Templates first, migration later                  |
| Runtime and package-manager control | No                              | No                                   | No                     | Yes                               | Do not copy into WebAnvil initially               |

## Current WebAnvil evidence

- `wa build` delegates web builds to Vite and Node builds to Rolldown.
- Node builds accept ESM/CJS formats, sourcemaps, minification, an independent
  platform and syntax target, and an experimental declaration plugin.
- `wa dev` starts Vite for web projects. Node watch mode shares the one-shot
  build plan, including entries, formats, declarations, static copies,
  stale-output cleanup, and build-info. It does not execute or restart the Node
  output.
- `wa preview` serves web build output through Vite. `wa test` exposes Vitest
  one-shot, watch, V8 coverage, and UI modes; lint, format, and typecheck invoke
  Oxlint, Oxfmt, and `tsgo` directly.
- `wa check` runs formatting, linting, and type checking sequentially and stops
  at the first failure; `--fix` writes formatting changes and applies safe lint
  fixes. Tests remain a separate `wa test` workflow.
- Its config has one `build` block plus tool config passthrough. It has no
  package, preview, workspace, task, or project-generation block.

## What to build first

### 1. Bundled `wa build`

Keep one build command. Node output preserves source modules by default;
`--bundle` switches to explicit library entries. Start with:

- use the passed entry or explicit `build.entries` mappings;
- accept multiple entries;
- emit ESM, CJS, compatible declaration files, sourcemaps, and minified output;
- validate that generated files satisfy `exports`, `main`, `module`, and `types`;
- report output files, formats, and exports in one-shot and watch summaries.

This closes the highest-value unbuild gap and gives WebAnvil a clear library
story alongside its existing application build.

### Why not replace Rolldown with obuild

obuild is a good reference implementation for bundled `wa build`: it has bundle and
transform entries, declaration configuration, hooks, and stub mode. It is not a
replacement for the current engine because it is itself powered by Rolldown and
does not cover WebAnvil's Vite application or development-server workflows.

Keep Rolldown as the low-level build engine. WebAnvil can borrow obuild's
library configuration shape without taking a runtime
dependency on another CLI wrapper.

### 2. Workspace execution

Add workspace discovery, root configuration, dependency ordering, and cached
tasks only after package builds are reliable. This is the Vite+ differentiator,
but it changes WebAnvil from a project CLI into a workspace tool.

### Deliberately out of scope for the first parity phase

Vite+'s Node-runtime and package-manager lifecycle should remain external.
WebAnvil can work with npm, pnpm, Yarn, and Bun projects without owning their
installation or global runtime state.

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
