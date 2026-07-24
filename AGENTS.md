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
        bundle: true,
        entries: { ".": "src/index.ts" },
        outDir: "dist",
        platform: "node",
        target: "es2022",
        copy: [{ from: "assets/**", to: "assets" }]
    },
    test: {
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

`defineConfig` accepts either an object or a zero-argument function returning an object. `loadConfig()` uses c12 to find `webanvil.config.*`, merges built-in defaults, then validates the root, `build`, `format`, `lint`, and `test` objects. Defined CLI values override config values.

```ts
export default defineConfig({
    format: { printWidth: 120, singleQuote: false, tabWidth: 4 },
    lint: { rules: { "no-console": "deny" } }
})
```

The `format` and `lint` blocks accept Oxfmt and Oxlint configuration respectively. WebAnvil passes them to the underlying tool, so `.oxfmtrc.json` and `.oxlintrc.json` are not needed. When present, `.oxfmtrc.json`, `.oxlintrc.json`, `vite.config.*`, and `vitest.config.*` take precedence over their WebAnvil equivalents.

## CLI and config policy

- Persistent behavior options, such as `mode`, `outDir`, static `copy` mappings, test environment, platform, target, formats, sourcemaps, minification, and plugins, belong in config and may be overridden by explicit CLI options. Test includes remain config-only, matching Vitest.
- `wa build` is the one build command. Web mode uses Vite; unbundled Node mode mirrors the source tree beneath `dirname(entry)` in the selected ESM/CJS formats, with optional declarations. `--bundle` switches Node output to one explicit `entry` or public `build.entries` mappings.
- Validate mode-specific fields and plugins after explicit CLI overrides.
- An explicit positional entry overrides configured `entry` and `entries`.
- Node `platform` defaults to `node`; Node syntax `target` defaults to `node20`.
  Web rejects platform, has no WebAnvil target default, and web dev ignores it.
- Node builds fill omitted `formats` and `declaration` settings from the nearest `package.json`. `import`, `require`, and `types` export conditions map to ESM, CommonJS, and declarations; a top-level `types` field also enables declarations. Precedence is CLI, WebAnvil config, package metadata, then built-in defaults. Package metadata does not affect web builds.
- Static copy mappings use project-relative `{ from, to }` pairs, where `from` is a file path or glob and `to` is an output directory. Preserve paths beneath the glob's static base, reject destinations that resolve to a generated, duplicate, or untracked output file, and record copied files for `wa clean`. Node watch mode re-expands mappings on every rebuild, watches currently matched files, and picks up newly matching files on the next rebuild.
- `wa build` records emitted and statically copied paths in `.webanvil/buildinfo.json`; `wa clean` removes only those paths and leaves the state file with an empty output list.
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

`web` mode runs Vite and uses an HTML entry. Unbundled `node` mode runs Rolldown and emits each JavaScript or TypeScript source module beneath `dirname(entry)` in the selected ESM/CJS formats, with optional mirrored declarations. `--bundle` switches Node mode to one explicit entry or public entry mappings, and declarations follow those public names.

## Development modes

`wa dev` starts Vite's development server in web mode. `--host` and `--port` configure that server. In node mode, it uses the same build plan as `wa build`: entries, formats, declarations, source maps, minification, platform, target, plugins, static copies, stale-output cleanup, and build-info are applied on every successful rebuild. It does not execute or restart the output. Build plugins pass through to Vite or Rolldown in their matching mode. Process supervision, signals, stdio, and port ownership belong to the application runtime. Watch build errors are reported and leave the watcher running.

Future config resolution will merge project config, workspace config, and built-ins through defu, then validate with Zod.

## Test configuration

`wa test` passes `test.environment` and `test.include` to Vitest. Its positional filters and `--environment` option mirror Vitest; the CLI environment overrides config. `--watch`, `--coverage`, and `--ui` expose run-specific Vitest modes. Use `vitest.config.*` for persistent advanced Vitest configuration.

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
- `defineCommand` and `defineOption` from cmdore define commands and shared options.
- `logger` is the shared tagged consola instance.
