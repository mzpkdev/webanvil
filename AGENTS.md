# CLAUDE.md

## What this is

A unified CLI for every JS/TS project type — frontend apps, libraries, Node.js backends, serverless. Vite builds web apps and Rolldown builds Node projects. One plugin API (unplugin) spans all of them.

## Current stack

| Concern           | Tool              |
| ----------------- | ----------------- |
| Web builds        | Vite              |
| Node builds       | Rolldown          |
| Testing           | Vitest            |
| Linting           | Oxlint            |
| Formatting        | Oxfmt             |
| Type checking     | typescript-native |
| Config loading    | c12 + defu        |
| Config validation | Zod v4            |
| Package discovery | pkg-types         |
| CLI framework     | cmdore            |
| CLI logging       | consola           |

## Commands

```
build [entry] [--mode <web|node>] [--out-dir <dir>]  build a web app or Node module tree
              [--copy <source=destination...>] [--bundle] [--declaration <true|false>] [--formats <esm,cjs>]
              [--sourcemap <true|false>] [--minify <true|false>] [--platform <node|browser|neutral>]
              [--target <target[,target...]>]
check [--fix]                                        check formatting, linting, and types; optionally fix files
clean                                                remove files emitted by prior WebAnvil builds
dev [entry] [--mode <web|node>] [--out-dir <dir>] [--host <host>] [--port <port>]
            [--copy <source=destination...>] [--bundle] [--declaration <true|false>] [--formats <esm,cjs>]
            [--sourcemap <true|false>] [--minify <true|false>] [--platform <node|browser|neutral>]
            [--target <target[,target...]>]
                                                     start a Vite server or Rolldown watcher
preview [--out-dir <dir>] [--host <host>] [--port <port>] [--open]
                                                     serve a Vite production build
test [filters...] [--environment <environment>] [--watch] [--coverage] [--ui] [--ui-port <port>]
                                                     run Vitest once, in watch mode, with coverage, or UI
lint [paths...] [--fix]                                lint with Oxlint
format [paths...] [--check]                            format with Oxfmt
typecheck [paths...]                                   type check a project or explicit files with TypeScript Native Preview
```

`webanvil` and `wa` are equivalent package binaries.

## Config

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        entries: { ".": "src/index.ts" },
        outDir: "dist",
        platform: "node",
        target: "es2022",
        copy: [{ from: "assets/**", to: "assets" }]
    },
    rolldown: {
        output: {
            esm: { entryFileNames: "[name].mjs" },
            cjs: { entryFileNames: "[name].js" }
        }
    },
    test: {
        globals: true,
        environment: "node",
        include: ["test/**/*.test.ts"]
    }
})
```

Use `definePlugin()` to run one unplugin implementation in both Vite and
Rolldown builds:

```ts
import { createUnplugin } from "unplugin"
import { definePlugin, defineConfig } from "webanvil"

const replace = createUnplugin<{ from: string; to: string }>((options) => ({
    name: "replace",
    transform: (code) => code.replace(options.from, options.to)
}))

export default defineConfig({
    plugins: [definePlugin(replace, { from: "development", to: "production" })]
})
```

Plain Vite plugins remain valid for web builds. Node builds require
`definePlugin()` because they need a Rolldown adapter.

`defineConfig` accepts either an object or a zero-argument function returning an
object. `loadConfig()` uses c12 to find `webanvil.config.*`, merges built-in
defaults, then validates WebAnvil-owned structure. The `vite`, `test`,
`rolldown`, `format`, and `lint` blocks retain the owning package's types and are
opaque to Zod. Defined CLI values override config values.

```ts
export default defineConfig({
    format: { printWidth: 120, singleQuote: false, tabWidth: 4 },
    lint: { rules: { "no-console": "deny" } }
})
```

The `vite`, `test`, `rolldown`, `format`, and `lint` blocks accept native
configuration from Vite, Vitest, Rolldown, Oxfmt, and Oxlint respectively.
`build.declaration` accepts native `rolldown-plugin-dts` options. When present,
`.oxfmtrc.json`, `.oxlintrc.json`, `vite.config.*`, and `vitest.config.*` take
precedence over their WebAnvil equivalents; explicit CLI values still win for
that run.

## Tool selection

- Vite, Vitest, Rolldown, Oxlint, Oxfmt, TypeScript, and TypeScript Native are
  selected from a compatible direct project declaration first, then a
  compatible declaration from a workspace containing the project. An
  undeclared or merely hoisted tool does not become the selected project tool;
  WebAnvil uses its exact fallback.
- Preflight every engine a command can dispatch before loading
  `webanvil.config.*` or evaluating its plugins. A declared but missing,
  misidentified, or incompatible command engine fails first. Select the
  TypeScript declaration compiler after configuration enables declarations but
  before starting Rolldown.
- Announce the selected package, version, and source once on first use:
  `<package> <version> (<project|webanvil>)`.
- Package managers own dependency installation, lockfiles, and installed state.
  WebAnvil must never install, update, or rewrite package-manager state.

## CLI and config policy

- Persistent behavior options, such as `mode`, `outDir`, static `copy` mappings, test environment, platform, target, formats, sourcemaps, minification, and plugins, belong in config and may be overridden by explicit CLI options. Test includes remain config-only, matching Vitest.
- `wa build` is the one build command. Web mode uses Vite. Node `entry` and
  `entries` are public roots in both modes: unbundled builds use Rolldown
  `preserveModules` for only the reachable graph, while `--bundle` bundles the
  same roots. Never restore source-tree globbing or mirroring.
- Validate mode-specific fields and plugins after explicit CLI overrides.
- An explicit positional entry overrides configured `entry` and `entries`.
- Resolve TypeScript paths, native Rolldown aliases/plugins, export conditions,
  and explicit native external settings before WebAnvil's package
  externalization. Keep local results internal, built-ins and installed package
  results external with their original specifier, and reject unresolved
  imports.
- Node `platform` defaults to `node`; Node syntax `target` defaults to `node20`.
  Web rejects platform, has no WebAnvil target default, and web dev ignores it.
- Node builds fill omitted `formats` and `declaration` settings from the nearest `package.json`. `import`, `require`, and `types` export conditions map to ESM, CommonJS, and declarations; a top-level `types` field also enables declarations. Precedence is CLI, WebAnvil config, package metadata, then built-in defaults. Package metadata does not affect web builds.
- Static copy mappings use project-relative `{ from, to }` pairs, where `from` is a file path or glob and `to` is an output directory. Preserve paths beneath the glob's static base, reject destinations that resolve to a generated, duplicate, or untracked output file, and record copied files for `wa clean`. Node watch mode re-expands mappings on every rebuild, watches currently matched files, and picks up newly matching files on the next rebuild.
- Native per-format Rolldown output naming accepts strings and callbacks.
  WebAnvil owns output directories, format, cleanup, and the preserve-modules
  strategy. Generate every format first, reject generated/copy collisions, then
  commit atomically. Failed builds and watch cycles retain or restore the last
  successful output and build-info.
- `wa build` records actual emitted and statically copied paths in
  `.webanvil/buildinfo.json`; `wa clean` removes only those paths, including
  customized names and maps, and leaves the state file with an empty output
  list.
- `rolldown-plugin-dts` owns declaration paths and imports. Its default
  generator is `tsc`; `oxc` and `tsgo` are explicit alternatives. Use a directly
  declared project/workspace TypeScript or the exact fallback, honor directly
  declared `ts-patch` plus TypeScript emit transforms only when they resolve to
  the same compiler, and require `tsc` for transforms. One process cannot
  switch the compiler identity after the plugin initializes it.
- ESM-only Node builds attach declarations to that graph. CJS-only and
  dual-format builds run one declaration-only ESM graph. Do not relocate or
  rewrite declaration files after Rolldown.
- `wa preview` serves the resolved web build output through Vite. `--host`, `--port`, `--out-dir`, and `--open` are run-specific CLI overrides.
- `wa check` runs formatting, linting, and type checking sequentially and stops on the first failure. It is read-only by default; `--fix` writes formatting changes and applies safe lint fixes. It never runs tests.
- `wa test` runs once by default; `--watch`, `--coverage`, and `--ui` are CLI-only Vitest modes. `--ui-port` selects a strict loopback port and requires `--ui`. Keep persistent advanced testing configuration in `vitest.config.*`.
- Meta-options such as `--config`, `--help`, and `--version`, plus one-off command inputs, remain CLI-only.

## Test conventions

- `npm test` builds the CLI through its `pretest` hook, so the `bin/webanvil` binary is available to integration tests.
- Unit suites live in `test/` with the `.test.ts` extension; end-to-end suites live in `e2e/` with the `.e2e.ts` extension.
- Use `describe` for the subject and `context` for nested conditions. Import the latter with `describe as context` from Vitest.
- Write examples in RSpec-style language: `context("with ...")` and `it("...")`.

## Build modes

`web` mode runs Vite and uses an HTML entry. Unbundled `node` mode runs
Rolldown with `preserveModules` and emits the graph reachable from one explicit
entry or public entry mappings. Bundled Node mode uses those same public roots.
Unreachable source, test, setup, example, and fixture files are not output.
Declarations follow public names and the final Rolldown graph.

## Development modes

`wa dev` starts Vite's development server in web mode. `--host` and `--port` configure that server. In node mode, it uses the same build plan as `wa build`: entries, formats, declarations, source maps, minification, platform, target, plugins, static copies, stale-output cleanup, and build-info are applied on every successful rebuild. It does not execute or restart the output. Build plugins pass through to Vite or Rolldown in their matching mode. Process supervision, signals, stdio, and port ownership belong to the application runtime. Watch build errors are reported and leave the watcher running.

Future config resolution will merge project config, workspace config, and built-ins through defu, then validate with Zod.

## Test configuration

`wa test` passes the native `test` block to Vitest, including options such as
`globals`, `setupFiles`, `env`, `environment`, and `include`. Its positional
filters and `--environment` option mirror Vitest; CLI modes and environment
override config. `--watch`, `--coverage`, and `--ui` expose run-specific Vitest
modes. When present, use `vitest.config.*` instead of the WebAnvil native block.

## Project structure

```
src/
  cli.ts           #!/usr/bin/env node, calls main()
  index.ts         public exports
  main.ts          parse argv, delegate to cmdore
  config.ts        UserConfig, ResolvedConfig, loadConfig()
  tools.ts         shared consola logger
  commands/        build, check, dev, test, lint, format, and typecheck commands
  arguments/       positional command arguments
  options/         shared command options
```

## Key patterns

- `defineConfig` accepts object and zero-argument function configs.
- `loadConfig()` loads `webanvil.config.*` through c12.
- Command entrypoints preflight every engine they can dispatch before
  `loadConfig()`.
- `defineCommand` and `defineOption` from cmdore define commands and shared options.
- `logger` is the shared tagged consola instance.
