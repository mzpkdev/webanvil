# Webanvil

One development and CI contract for Vite apps, TypeScript libraries, and workspaces.

As a codebase grows, its projects tend to drift. Scripts acquire different names, tool versions and defaults diverge, and every repository develops its own idea of how to build, test, type-check, and format. The tools still work; the shared development contract disappears.

Webanvil packages that contract into one toolchain dependency and one CLI. It combines Vite, Vitest, unbuild, TypeScript, Biome, and Turborepo behind sensible defaults, layered configuration, and the same lifecycle from a single package to a workspace. Teams get a repeatable path for local development and CI without hiding the native tools underneath.

```sh
webanvil init
webanvil dev
webanvil test
webanvil typecheck
webanvil lint
webanvil format --check
webanvil build
```

## More than shared script names

`package.json` aliases can standardize what a command is called. Webanvil also standardizes what the command does:

- **Defaults that run immediately.** Start an app, test a package, or check a codebase without first assembling several configuration files.
- **Policy that can be shared.** Put build, test, TypeScript, formatting, linting, and workspace defaults in `webanvil.config`, then layer project and package overrides on top.
- **Less configuration drift.** Apps and libraries use the same command surface and can inherit the same preset instead of maintaining parallel toolchain setup.
- **Gradual adoption.** Native tool configuration can replace Webanvil-generated configuration where supported. Adopt one Webanvil command without converting the rest of the project.
- **Native escape hatches.** Pass arguments through to the underlying tool, select an explicit native config, or invoke the tool directly when a project needs its full interface.
- **Continuity at workspace scale.** Carry the same workflow into a monorepo, where Turborepo adds dependency ordering and caching for package scripts.

Webanvil fits best when a team maintains several projects that should feel alike: a family of applications, a set of TypeScript packages, or a workspace containing both. It provides a maintained convention without requiring every project to become identical.

## Adopt it at your own pace

Webanvil works without a config file. Run a command to use its built-in defaults, or scaffold a starting point:

```sh
webanvil init        # webanvil.config.json, tsconfig.json, and .gitignore
webanvil init --ts   # use a typed webanvil.config.ts instead
```

Existing files are not overwritten unless `--force` is supplied.

Add `webanvil.config.json`, or a `.ts` or `.js` variant, when the project needs explicit policy:

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

Configuration resolves from workspace to package: package `webanvil.config` values override workspace values, each config may extend local or remote presets, and Webanvil's built-ins fill any remaining settings. `extends` accepts local layers and remote GitHub presets such as `github:org/preset#ref`; JSON presets are data only and do not execute code. When Webanvil generates a native tool config, Webanvil CLI flags override these resolved settings.

For Vite, Vitest, unbuild, and Biome, a detected native `vite.config.*`, `vitest.config.*`, `build.config.*`, `biome.json`, or `biome.jsonc` replaces Webanvil's generated config for that tool. An explicit `--config` selects a native config instead. TypeScript is different: an existing `tsconfig.json` is used automatically only when there is no local `webanvil.config`; use `--config` to select one explicitly. Arguments after `--` provide one-off native overrides directly to the underlying tool:

```sh
webanvil test -- --reporter=verbose
webanvil dev -- --open
```

This lets a project share the common path while keeping tool-specific configuration and direct tool usage available.

## Apps, libraries, and workspaces

### Apps

Put `index.html` at the project root and Webanvil treats the project as an app. Development and production builds run through Vite. When React, Vue, Svelte, Solid, or Preact and its Vite plugin are already installed, Webanvil uses the matching plugin.

```sh
webanvil dev
webanvil test src/menu.test.ts
webanvil build
webanvil preview
```

### Libraries

Give `build` a public entry point and Webanvil compiles the library with unbuild. The surrounding development contract stays the same as it is for an app.

```sh
webanvil typecheck
webanvil lint src
webanvil format --check
webanvil build src/index.ts
```

Use `webanvil bundle <entry>` when the output should be a single file instead.

### Workspaces

A workspace can combine applications, libraries, and shared packages. Define the task pipeline in the root `webanvil.config`:

```json
{
    "tasks": {
        "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
        "test": { "dependsOn": ["^build"] }
    }
}
```

`webanvil run` sends matching package scripts through Turborepo with dependency ordering and caching. For packages without a matching script, it can directly run Webanvil's argument-free `test`, `typecheck`, `lint`, `format`, and `clean` commands. These scriptless fallback runs are a convenience outside Turborepo's cache and dependency graph.

```json
{ "scripts": { "build": "webanvil build", "test": "webanvil test" } }
```

```sh
webanvil run build
webanvil run test --filter cosmic-canteen
webanvil run lint
```

## Command reference

| Command | What it does |
| --- | --- |
| `webanvil init` | Scaffold `webanvil.config`, `tsconfig.json`, and `.gitignore`. Use `--ts` for a typed config. |
| `webanvil dev [root]` | Start a Vite development server with hot reload. `serve` is an alias. |
| `webanvil build [entry]` | Build an app or compile a library entry. Use `--watch` to rebuild on changes. |
| `webanvil bundle <entry>` | Bundle an entry point into one file with Vite. |
| `webanvil preview [dir]` | Serve a production build locally. |
| `webanvil test [patterns]` | Run Vitest. |
| `webanvil typecheck` | Type-check without emitting files. |
| `webanvil lint [paths]` | Check code and style with Biome. Add `--fix` to apply safe fixes. |
| `webanvil format [paths]` | Format code and prose with Biome. Add `--check` to report differences without writing. |
| `webanvil run <task>` | Run matching package scripts through Turborepo; scriptless fallback checks run outside its cache and dependency graph. |
| `webanvil clean` | Remove build artifacts and tool caches. `--deep` also removes `node_modules`. |
