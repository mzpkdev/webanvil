# Webanvil

Webanvil is the command surface for running a modern Node.js project. One CLI takes a project from a local dev server to a production build, checks it before release, and keeps the toolchain out of your way.

It brings Vite, Vitest, unbuild, TypeScript, Biome, and Turborepo under commands that work together. Use it when you want a small, predictable workflow instead of a collection of tool-specific scripts and configuration files.

```sh
webanvil init
webanvil dev
webanvil test
webanvil typecheck
webanvil lint
webanvil format --check
webanvil build
```

## Why Webanvil

- **One workflow for every project.** Start, build, test, lint, format, preview, and clean with the same command shape.
- **Useful without configuration.** Built-in defaults let a new project run immediately.
- **A quality gate built in.** Format code and prose, lint for problems, and use `--check` in CI without adding separate scripts.
- **Control when you need it.** A `webanvil.config` shares project settings, while native Vite, Vitest, unbuild, and Biome configs still take precedence for their own tools.
- **Works for apps and libraries.** `webanvil build` detects an `index.html` and builds an app with Vite; otherwise it compiles a library with unbuild.
- **Built for workspaces.** `webanvil run` uses Turborepo to run package tasks in dependency order with caching.

## Commands

| Command | What it does |
| --- | --- |
| `webanvil init` | Scaffold `webanvil.config`, `tsconfig.json`, and `.gitignore`. Use `--ts` for a typed config. |
| `webanvil dev [root]` | Start a Vite development server with hot reload. `serve` is an alias. |
| `webanvil build [entry]` | Build an app or library. Use `--watch` to rebuild on changes. |
| `webanvil bundle <entry>` | Bundle an entry point into one file with Vite. |
| `webanvil preview [dir]` | Serve a production build locally. |
| `webanvil test [patterns]` | Run Vitest. |
| `webanvil typecheck` | Type-check without emitting files. |
| `webanvil lint [paths]` | Check code and style with Biome. |
| `webanvil format [paths]` | Format code and prose with Biome. |
| `webanvil run <task>` | Run a workspace task through Turborepo. |
| `webanvil clean` | Remove build artifacts and tool caches. `--deep` also removes `node_modules`. |

Arguments after `--` pass through to the underlying tool.

## Keep the codebase clean

`webanvil format` writes consistent formatting across code and prose. Use `webanvil format --check` in CI to report files that need formatting without changing them.

`webanvil lint` finds lint and style issues. It reports by default; add `--fix` to apply safe fixes. Both commands accept paths, so `webanvil lint src` and `webanvil format README.md` stay scoped to the files you are working on.

Both commands use a project's `biome.json` or `biome.jsonc` when present. Without one, they use the `format` and `lint` settings in `webanvil.config`, falling back to Webanvil's defaults.

## Project configuration

Webanvil runs with no config. Add `webanvil.config.json`, or a `.ts` or `.js` variant, when the project needs shared settings:

```json
{
    "$schema": "./node_modules/@crazy-pocs/webanvil/webanvil.schema.json",
    "target": "browser",
    "build": { "outDir": "dist", "sourcemap": true },
    "test": { "environment": "node", "coverage": true },
    "typecheck": { "compilerOptions": { "strict": true } },
    "format": { "lineWidth": 120 }
}
```

Settings resolve in this order: explicit command flags, the nearest `webanvil.config`, its `extends` layers, then Webanvil's defaults. `extends` also supports remote GitHub presets such as `github:org/preset#ref`; JSON presets are data only and do not execute code.

Webanvil detects native `vite.config.*`, `vitest.config.*`, `build.config.*`, and `biome.json` files. When found, that tool uses its native config, so a project can adopt Webanvil without giving up existing setup.

## Apps, libraries, and workspaces

For an app, put `index.html` at the project root and run `webanvil dev` or `webanvil build`. Webanvil uses Vite, detects React, Vue, Svelte, Solid, or Preact from project dependencies, and uses the matching installed Vite plugin.

For a library, run `webanvil build src/index.ts`; Webanvil compiles it with unbuild. Use `webanvil preview` after an app build to serve the resulting output.

For a workspace, define the task pipeline in `webanvil.config` and run it across packages:

```json
{
    "tasks": {
        "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
        "test": { "dependsOn": ["^build"] }
    }
}
```

```sh
webanvil run build
webanvil run test --filter @acme/ui
```
