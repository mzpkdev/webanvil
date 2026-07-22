# CLAUDE.md

## What this is

A unified CLI for every JS/TS project type — frontend apps, libraries, Node.js backends, serverless. One bundler (Rolldown) for all builds. One plugin API (unplugin) across all of them.

## Current stack

| Concern | Tool |
|---|---|
| All builds | Rolldown |
| Testing | Vitest |
| Linting and formatting | Biome |
| Type checking | typescript-native |
| Config loading | c12 + defu |
| Package discovery | pkg-types |
| CLI framework | cmdore |
| CLI logging | consola |

## Commands

```
build <entry> --out-dir <dir>  bundle a library entry with Rolldown
test                            run Vitest
```

`webanvil` and `wa` are equivalent package binaries.

## Config

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        entry: "src/index.ts",
        outDir: "dist"
    }
})
```

`defineConfig` accepts either an object or a zero-argument function returning an object. `loadConfig()` uses c12 to find `webanvil.config.*`; configuration is not applied to build commands yet.

## Planned build modes

`index.html` will select app mode through Vite; an explicit entry will select library mode through Rolldown. Framework detection, declarations, and the unplugin API belong to this later phase.

Future config resolution will merge CLI flags, project config, workspace config, and built-ins through defu, then validate with Zod.

## Project structure

```
src/
  cli.ts           #!/usr/bin/env node, calls main()
  index.ts         public exports
  main.ts          parse argv, delegate to cmdore
  config.ts        UserConfig, ResolvedConfig, loadConfig()
  tools.ts         shared consola logger
  commands/        build and test commands
  arguments/       positional command arguments
  options/         shared command options
```

## Key patterns

- `defineConfig` accepts object and zero-argument function configs.
- `loadConfig()` loads `webanvil.config.*` through c12.
- `defineCommand` and `defineOption` from cmdore define commands and shared options.
- `logger` is the shared tagged consola instance.
