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
build [entry] [--mode <web|node>] [--out-dir <dir>]  build a web or Node project
              [--declaration <true|false>] [--sourcemap <true|false>] [--minify <true|false>]
              [--formats <esm,cjs>] [--target <node20|browser|neutral>]
dev [entry] [--mode <web|node>] [--out-dir <dir>] [--host <host>] [--port <port>]
                                                     start a Vite server or Rolldown watcher
test [filters...] [--environment <environment>]       run Vitest
lint [paths...] [--fix]                                lint with Oxlint
format [paths...] [--check]                            format with Oxfmt
```

`webanvil` and `wa` are equivalent package binaries.

## Config

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "node",
        entry: "src/index.ts",
        outDir: "dist"
    },
    test: {
        environment: "node",
        include: ["test/**/*.test.ts"]
    }
})
```

`defineConfig` accepts either an object or a zero-argument function returning an object. `loadConfig()` uses c12 to find `webanvil.config.*`, merges built-in defaults, then validates the root, `build`, `format`, `lint`, and `test` objects. Defined CLI values override config values.

```ts
export default defineConfig({
    format: { printWidth: 120, singleQuote: false, tabWidth: 4 },
    lint: { rules: { "no-console": "deny" } }
})
```

The `format` and `lint` blocks accept Oxfmt and Oxlint configuration respectively. WebAnvil passes them to the underlying tool, so `.oxfmtrc.json` and `.oxlintrc.json` are not needed. When present, `.oxfmtrc.json`, `.oxlintrc.json`, `vite.config.*`, and `vitest.config.*` take precedence over their WebAnvil equivalents.

## CLI and config policy

- Persistent behavior options, such as `mode`, `outDir`, test environment, target, formats, sourcemaps, minification, and plugins, belong in config and may be overridden by explicit CLI options. Test includes remain config-only, matching Vitest.
- A configured build entry is the default; an explicit positional entry overrides it.
- Meta-options such as `--config`, `--help`, and `--version`, plus one-off command inputs, remain CLI-only.

## Test conventions

- Unit suites live in `test/` with the `.test.ts` extension; end-to-end suites live in `e2e/` with the `.e2e.ts` extension.
- Use `describe` for the subject and `context` for nested conditions. Import the latter with `describe as context` from Vitest.
- Write examples in RSpec-style language: `context("with ...")` and `it("...")`.

## Build modes

`web` mode runs Vite and uses an HTML entry. `node` mode runs Rolldown and uses a JavaScript or TypeScript entry. Framework detection, declarations, and the unplugin API belong to later phases.

## Development modes

`wa dev` starts Vite's development server in web mode. `--host` and `--port` configure that server. In node mode, it watches and rebuilds the configured entry with Rolldown; it does not execute or restart the output. Process supervision, signals, stdio, and port ownership belong to the application runtime. Watch build errors are reported and leave the watcher running.

Future config resolution will merge project config, workspace config, and built-ins through defu, then validate with Zod.

## Test configuration

`wa test` passes `test.environment` and `test.include` to Vitest. Its positional filters and `--environment` option mirror Vitest; the CLI environment overrides config. Use `vitest.config.*` only for advanced Vitest configuration that WebAnvil does not expose.

## Project structure

```
src/
  cli.ts           #!/usr/bin/env node, calls main()
  index.ts         public exports
  main.ts          parse argv, delegate to cmdore
  config.ts        UserConfig, ResolvedConfig, loadConfig()
  tools.ts         shared consola logger
  commands/        build, dev, test, lint, and format commands
  arguments/       positional command arguments
  options/         shared command options
```

## Key patterns

- `defineConfig` accepts object and zero-argument function configs.
- `loadConfig()` loads `webanvil.config.*` through c12.
- `defineCommand` and `defineOption` from cmdore define commands and shared options.
- `logger` is the shared tagged consola instance.
