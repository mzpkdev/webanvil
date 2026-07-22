# CLAUDE.md

## What this is

A unified CLI for every JS/TS project type — frontend apps, libraries, Node.js backends, serverless. One bundler (Rolldown) for all builds. One plugin API (unplugin) across all of them.

## Stack

| Concern | Tool |
|---|---|
| All builds | Rolldown |
| Dev server + HMR | Vite 8 |
| Plugin API | unplugin |
| Testing | Vitest |
| Linting | Oxlint |
| Formatting | Oxfmt |
| Type checking | typescript-native |
| Config loading | c12 + defu |
| Config validation | Zod v4 |
| CLI framework | cmdore |

## Commands

```
build [entry]    app mode if index.html present, lib mode if entry provided
dev [root]       Vite 8 (FE) or tsx watch (BE)
bundle <entry>   single-file output, no splitting
test             Vitest
typecheck        typescript-native
lint             Oxlint
format           Oxfmt
run <task>       Vite Task (monorepo)
init             scaffold config + tsconfig + .gitignore
clean            remove build artifacts
```

## Build mode detection

```
index.html present       → app mode: Rolldown via Vite 8, code splitting, hashed assets, framework plugin auto-detected
entry provided, no html  → lib mode: Rolldown, ESM + CJS, .d.ts via rolldown-plugin-dts
neither                  → error, require explicit entry
```

Framework auto-detection reads `package.json` deps → auto-wires the right Vite plugin for React/Vue/Solid/Svelte/Preact. Warn if plugin not installed, don't error.

## Plugin API

```ts
// my-plugin.ts
import { createUnplugin } from 'unplugin'

export const myPlugin = createUnplugin((options) => ({
  name: 'my-plugin',
  transform(code, id) { ... },
  resolveId(id) { ... },
}))
```

CLI passes plugins to Rolldown for `build`/`bundle`, to Vite via unplugin's vite adapter for `dev`. Same plugin, both paths.

## Config

```ts
export default defineConfig({
  build: {
    outDir: 'dist',
    entry: 'src/index.ts',
    declaration: true,      // lib mode only
    sourcemap: true,
    minify: false,
    formats: ['esm', 'cjs'], // lib mode only
    target: 'node20',        // or 'browser', 'neutral'
  },
  plugins: [],
})
```

Loaded by c12, merged by defu (CLI flags → project config → workspace config → builtins), validated by Zod at load time. Same Zod schema generates JSON Schema for editor autocomplete.

## Project structure

```
src/
  cli.ts           #!/usr/bin/env node, calls main()
  index.ts         parse argv, delegate to cmdore
  config.ts        UserConfig, ResolvedConfig, loadConfig()
  tools.ts         binOf(), run(), exec(), shared helpers
  frameworks.ts    detectFramework() → Vite plugin
  workspace.ts     monorepo package discovery
  schema.ts        Zod schema + JSON Schema generation
  commands/        one file per command
  options/         one file per shared option (watch, target, config, minify)
```

## Key patterns

- `binOf(tool)` — resolve binaries from this package's own `node_modules`, never PATH
- `whenProvided` — CLI flags only override config when explicitly passed
- `z.strictObject` on config — mistyped keys are hard errors at load time
- `hasConfig()` — fs check to detect project ownership in monorepos
- `defineCommand` / `defineOption` from cmdore for every command and shared option
