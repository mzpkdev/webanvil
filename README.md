<div align="center">
  <img src=".github/assets/banner.svg" width="1012" alt="WebAnvil: build the web, forge the backend" />

  <p>
    <strong>WebAnvil</strong> · one CLI for building, testing, linting, formatting, and type-checking JavaScript and TypeScript projects
    <br />
    <br />
    <a href="#getting-started"><strong>Get started »</strong></a>
    <br />
    <br />
    <a href="https://github.com/mzpkdev/webanvil/issues">Report a bug</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="https://github.com/mzpkdev/webanvil/issues">Request a feature</a>
  </p>
</div>

Table of contents
-----------------

- [Why WebAnvil?](#why-webanvil)
- [What it includes](#what-it-includes)
- [Getting started](#getting-started)
    - [Install](#install)
    - [Everyday commands](#everyday-commands)
    - [A web app](#a-web-app)
    - [Storybook](#storybook)
    - [A Node project](#a-node-project)
    - [Browser tests](#browser-tests)
- [Configuration](#configuration)
    - [Tool selection](#tool-selection)
    - [Native tool configuration](#native-tool-configuration)
    - [Node declarations](#node-declarations)
    - [Command-line options](#command-line-options)
- [Migration](#migration)
- [Command reference](#command-reference)

Why WebAnvil?
-------------

JavaScript projects usually need a builder, a development server, a test runner, a linter, a formatter, and a type checker. Each tool has its own command and configuration. That is workable, but it makes the project setup longer than it needs to be.

WebAnvil puts the common jobs behind `wa`. It uses Vite for web projects, Rolldown for Node builds, Vitest for tests, and Oxc for linting and formatting. You keep those tools, but package scripts and the first layer of configuration stay in one place.

```sh
wa dev        # develop a web app or watch a Node build
wa build      # build the project
wa preview    # serve the production web build
wa clean      # remove tracked build output
wa check      # check formatting, linting, and types
wa check --fix # format files and apply safe lint fixes before type checking
wa test       # run tests, watch them, collect coverage, or open the UI
wa e2e        # build, preview, and run browser tests
wa lint       # lint files
wa format      # format files
wa typecheck   # type-check the project
```

What it includes
----------------

| Project job                | WebAnvil command                   | Tool                                              |
| -------------------------- | ---------------------------------- | ------------------------------------------------- |
| Web builds and development | `wa build`, `wa dev`, `wa preview` | Vite                                              |
| Node builds and watch mode | `wa build`, `wa dev`               | Rolldown                                          |
| Design-system Storybook    | `wa build`, `wa dev`, `wa preview` | Storybook                                         |
| Tracked output cleanup     | `wa clean`                         | WebAnvil                                          |
| Static checks              | `wa check`                         | Oxfmt, Oxlint, TypeScript Native, or svelte-check |
| Tests                      | `wa test`                          | Vitest                                            |
| Browser tests              | `wa e2e`                           | Playwright Test and Chromium                      |
| Linting                    | `wa lint`                          | Oxlint                                            |
| Formatting                 | `wa format`                        | Oxfmt                                             |
| Type checking              | `wa typecheck`                     | TypeScript Native or svelte-check                 |

Getting started
---------------

### Install

Install WebAnvil as a development dependency:

```sh
npm install --save-dev webanvil
```

Your package manager remains responsible for dependencies, the lockfile, and
the installed tree. WebAnvil never installs or updates tools. Except for the
bundled Vitest and Playwright test toolchains, WebAnvil uses a compatible tool
declared directly by the active project or containing workspace before its
exact fallback.

Add the scripts you want to `package.json`:

```json
{
    "scripts": {
        "dev": "wa dev",
        "build": "wa build",
        "clean": "wa clean",
        "check": "wa check",
        "test": "wa test",
        "e2e": "wa e2e",
        "lint": "wa lint",
        "format": "wa format",
        "typecheck": "wa typecheck"
    }
}
```

You can start without a config file. WebAnvil defaults to a Node project with `src/index.ts` as its entry and `dist` as its output directory.

### Everyday commands

Run the commands through npm or directly with `wa`:

```sh
npm run dev
npm run build
npm run clean
npm run check
npm run test
npm run e2e
npm run lint
npm run format
npm run typecheck
```

`wa check` checks formatting, linting, and types sequentially, stopping on the
first failure. It is read-only by default. Use `wa check --fix` to format files
and apply safe lint fixes before type checking. Tests stay separate under
`wa test`.

For a Svelte project, add `svelte-check` to the package's `devDependencies`.
Then `wa typecheck` and `wa check` use it for project-wide diagnostics through
the package's `tsconfig.json`. WebAnvil otherwise uses TypeScript Native.
Explicit file paths such as `wa typecheck src/file.ts` always use TypeScript
Native because `svelte-check` checks a project rather than individual files.

### A web app

Set the build mode to `"web"` and point it at an HTML entry point. `wa dev` starts Vite's development server, `wa build` produces a production bundle, and `wa preview` serves that bundle locally.

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "web",
        entry: "index.html",
        outDir: "dist",
        copy: [{ from: "assets/**", to: "assets" }]
    }
})
```

Pass framework plugins through your WebAnvil configuration:

```ts
import react from "@vitejs/plugin-react"
import { defineConfig } from "webanvil"

export default defineConfig({
    build: { mode: "web", entry: "index.html" },
    plugins: [react()]
})
```

### Storybook

WebAnvil includes Storybook, the supported Vite framework adapters, Vitest's
browser support, and Chromium. It exposes that exact Storybook release as a
peer dependency, so package-manager-installed addons resolve against the same
runtime. Add a Storybook configuration, addons, and your project's normal
framework dependencies.

For a Node design-system project, configure Storybook beside the package build:

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "webanvil"

export default defineConfig({
    build: { mode: "node", entries: { ".": "src/index.ts" }, outDir: "dist" },
    storybook: { framework: "svelte", port: 6006, outDir: "storybook-static" },
    vite: { plugins: [svelte()] }
})
```

Then keep `.storybook/main.ts` focused on stories and addons:

```ts
import type { StorybookConfig } from "webanvil/storybook/svelte"

export default {
    stories: ["../src/**/*.stories.@(js|ts|svelte)"],
    addons: ["@storybook/addon-a11y"]
} satisfies StorybookConfig
```

`wa dev` starts the package watcher, waits for its first successful build, then
starts Storybook. `wa build` creates the package output and static Storybook.
`wa preview` serves the static Storybook output. `wa clean` removes both sets of
tracked files. `--host` and `--port` on `wa dev` configure Storybook. The
package build still owns `--out-dir`.

Set `storybook.test: false` to exclude Storybook stories, including `play`
functions, from `wa test`. Chromium is downloaded by
`@playwright/browser-chromium` when your package manager runs install scripts.
Storybook tests use WebAnvil's bundled Vitest and browser provider as one
version-matched toolchain.

### A Node project

Node mode is the default. Declare the package's public roots with `entry` or
`entries`, then choose whether Rolldown should preserve or bundle the reachable
module graph:

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "node",
        entries: {
            ".": "src/index.ts",
            "./feature": "src/internal/implementation.ts"
        },
        outDir: "dist",
        bundle: true,
        formats: ["esm", "cjs"],
        declaration: true,
        sourcemap: true,
        platform: "node",
        target: "es2022"
    }
})
```

Without `bundle`, Rolldown uses `preserveModules` and emits only modules
reachable from the public roots. It does not mirror the source tree, so tests,
examples, setup files, and other unreachable modules are omitted. With
`bundle`, those same roots become bundle entries. An explicit positional entry
overrides configured `entries`.

TypeScript paths, native Rolldown aliases and resolver plugins, and package
export conditions resolve before WebAnvil decides whether an import is a
dependency. Project-local results stay in the graph. Node built-ins and
installed packages remain external with their original portable specifiers,
while unresolved imports fail the build.

`platform` (`node`, `browser`, or `neutral`) is Node-only. `target` is one
syntax target or an array; CLI lists are comma-separated. Node defaults are
`platform: "node"` and `target: "node20"`. Web production forwards only an
explicit target; Vite config wins, and web dev does not apply it.

For Node builds, WebAnvil fills omitted output settings from the nearest
`package.json`: `import` and `require` export conditions enable ESM and CommonJS
respectively, while a top-level `types` field or `types` export condition enables
declarations. Explicit CLI options override `webanvil.config.*`, which overrides
package metadata, which overrides built-in defaults. Package metadata does not
affect web builds.

`wa dev` watches and rebuilds Node output with the same `build` configuration as
`wa build`: bundle mode, entries, formats, declarations, source maps,
minification, platform, target, plugins, static copies, stale-output cleanup, and
build metadata all stay in sync. It does not run or restart the server process.

Node output is transactional. WebAnvil generates every requested format before
writing, rejects filename or copy collisions, and replaces the previous output
only after the complete build succeeds. A failed one-shot build or watch cycle
rolls back to the last successful files and build metadata.

### Node build plugins

Node builds use Rolldown. To use a plugin in both web and Node builds, wrap an
unplugin implementation with `definePlugin()`:

```ts
import { defineConfig, definePlugin } from "webanvil"
import { createUnplugin } from "unplugin"

const replace = createUnplugin<{ from: string; to: string }>((options) => ({
    name: "replace",
    transform: (code) => code.replace(options.from, options.to)
}))

export default defineConfig({
    plugins: [definePlugin(replace, { from: "development", to: "production" })]
})
```

Plain Vite plugins work in effective web mode. Effective Node builds require
plugins created with `definePlugin()`; raw Vite and Rolldown plugins are rejected
during config validation after explicit CLI overrides are applied.

Configuration
-------------

Use `webanvil.config.ts` to keep WebAnvil orchestration and native tool settings
together:

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "web",
        entry: "index.html",
        outDir: "dist"
    },
    vite: {
        base: "/app/"
    },
    test: {
        globals: true,
        environment: "jsdom",
        include: ["test/**/*.test.ts"]
    },
    lint: {
        rules: { "no-console": "deny" }
    },
    format: {
        printWidth: 100,
        semi: false
    }
})
```

For a new WebAnvil project, keep Oxfmt and Oxlint settings in the `format` and
`lint` blocks. `wa format`, `wa lint`, and `wa check` pass those options to the
matching Oxc tool, so you do not need to create `.oxfmtrc.json` or
`.oxlintrc.json`.

Keep a native Oxc config when you are adopting an existing project configuration
or need Oxc's native configuration lookup. A native Oxc config takes precedence
over the matching WebAnvil block.

### Tool selection

WebAnvil selects compatible project and workspace declarations before its own
fallbacks, except for its bundled Vitest and Playwright test toolchains. A
transitive or merely hoisted package is not selected. Each command
preflights the engines it can dispatch before `webanvil.config.*` is loaded or
its plugins are evaluated, so a declared command engine that is missing, has
invalid package identity, or is outside the supported range fails first.

| Tool                         | Supported project/workspace versions | Exact WebAnvil fallback |
| ---------------------------- | ------------------------------------ | ----------------------- |
| Vite                         | `>=8.1.5 <9`                         | `8.1.5`                 |
| Vitest                       | Bundled only                         | `4.1.11`                |
| Playwright Test and Chromium | Bundled only                         | `1.58.2`                |
| Storybook                    | `>=10.5.9 <11`                       | `10.5.9`                |
| Rolldown                     | `>=1.2.0 <2`                         | `1.2.0`                 |
| Oxlint                       | `>=1.75.0 <2`                        | `1.75.0`                |
| Oxfmt                        | `>=0.60.0 <0.61`                     | `0.60.0`                |
| TypeScript (declarations)    | `>=5 <7.1.0`                         | `6.0.3`                 |
| TypeScript Native (`tsgo`)   | `>=7.0.0-dev.20260707.2 <7.0.0`      | `7.0.0-dev.20260707.2`  |

When a tool is first used, the CLI reports its package, version, and source, for
example `Using rolldown 1.2.0 (project)` or
`Using rolldown 1.2.0 (webanvil)`.

The TypeScript compiler is selected only after configuration enables a
declaration build, but before Rolldown starts that build. It follows the same
direct project/workspace declaration and exact-fallback rules.

`wa test` and `wa e2e` always use WebAnvil's bundled Vitest and Playwright
toolchains. This keeps each runner on the same version as its `webanvil/test` or
`webanvil/e2e` API.

### Native tool configuration

The `vite`, `test`, `rolldown`, `lint`, and `format` blocks use the owning
tool's exported TypeScript types. WebAnvil validates them as opaque native
objects and passes compatible upstream options through without duplicating
their schemas.

Precedence is:

1. explicit CLI values for the current run;
2. an existing native `vite.config.*`, `vitest.config.*`, `.oxlintrc.json`, or
   `.oxfmtrc.json`;
3. the matching native block in `webanvil.config.*`;
4. WebAnvil defaults.

A `playwright.config.*` is different: it takes full control of `wa e2e`,
including the server lifecycle and browser configuration. WebAnvil still runs
its bundled Playwright Test binary.

WebAnvil-owned `build`, `copy`, cross-engine `plugins`, and CLI behavior remain
orchestration settings. `rolldown.input` and per-format `rolldown.output`
options extend Node builds; WebAnvil still owns the input roots, output
directory, format, cleanup, and `preserveModules` strategy.

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "node",
        entries: { ".": "src/index.ts", "./feature": "src/feature.ts" },
        formats: ["esm", "cjs"]
    },
    rolldown: {
        input: {
            resolve: { conditionNames: ["source", "node", "import"] }
        },
        output: {
            esm: {
                entryFileNames: "[name].mjs",
                chunkFileNames: "chunks/[name]-[hash].mjs"
            },
            cjs: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js"
            }
        }
    }
})
```

Native `entryFileNames`, `chunkFileNames`, and `assetFileNames` accept the same
strings or callbacks as Rolldown. WebAnvil records the actual emitted paths, so
stale-output removal, rollback, build metadata, and `wa clean` follow customized
names and source maps.

### Node declarations

`build.declaration: true` uses `rolldown-plugin-dts`. TypeScript 5 and 6 use
the full `tsc` generator. TypeScript 7 uses `tsgo` when the project has a
`tsconfig.json`; otherwise it uses Oxc's isolated declaration generator. Pass a
native declaration options object to choose a generator and other plugin
settings explicitly:

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        declaration: {
            generator: "tsc",
            sourcemap: true
        }
    }
})
```

The `tsc` generator selects a compatible project/workspace TypeScript
declaration when present, otherwise WebAnvil's exact TypeScript fallback.
Project-local `ts-patch` and TypeScript emit transforms are honored when they
are directly declared and resolve to that same compiler. They require `tsc`,
which supports TypeScript 5 and 6; use `tsgo` with a `tsconfig.json` or Oxc for
TypeScript 7 declarations.

`rolldown-plugin-dts` owns declaration paths and imports. ESM-only builds attach
one declaration graph; CommonJS-only and dual-format builds use one
declaration-only ESM pass. Because the plugin initializes TypeScript in process,
one process cannot switch to a different compiler path or version after its
first TypeScript declaration build—run builds needing different compilers in
separate processes.

### Command-line options

Command-line options override the config file. For example, this writes a build to `preview` without changing `webanvil.config.ts`:

```sh
wa build --out-dir preview
```

For Node builds and watchers, `--bundle` and `--no-bundle` are explicit
opposites. `--no-bundle` overrides `build.bundle: true` for that run and emits
the reachable module graph with Rolldown `preserveModules`.

Use `build.copy` for static files that should be copied unchanged after either a
web or Node build. Each mapping preserves the path beneath the source glob's
static base. For example, `assets/**` mapped to `assets` copies
`assets/images/logo.svg` to `dist/assets/images/logo.svg`. `--copy` accepts one
or more `source=destination` mappings and replaces configured mappings for that
run:

```sh
wa build --copy "assets/**=assets" "src/templates/**=templates"
```

Both paths are relative to the project root: `from` is a file path or glob and
`to` is an output directory. This is useful for Node runtime files such as Fastify email
or response templates: `{ from: "src/templates/**", to: "templates" }` makes
`src/templates/welcome.txt` available as `dist/templates/welcome.txt`.

Copy destinations must not resolve to the same file as generated output, another
mapping, or an untracked file already in the output directory. WebAnvil fails
instead of overwriting in each case.

Node watch mode re-expands copy globs on every rebuild. Changes and deletions to
currently matched files trigger rebuilds; newly matching files are included on
the next rebuild.

Web builds keep Vite's `publicDir` behavior unchanged. Do not use `copy` for
assets imported by application code; Vite continues to manage those assets.

### Test modes

`wa test` runs once by default. Use `--watch` to rerun affected tests after a
change, `--coverage` to write V8 coverage reports, or `--ui` to start the
Vitest UI:

```sh
wa test --watch
wa test --coverage
wa test --ui
wa test --ui --ui-port 51204
```

These are run-specific modes; keep persistent Vitest configuration in
`vitest.config.*`. `--ui-port` selects a strict loopback port and requires
`--ui`.

Import the bundled test API from WebAnvil so test registration and execution
always use the same Vitest instance:

```ts
import { context, describe, expect, it } from "webanvil/test"

describe("calculator", () => {
    context("with two values", () => {
        it("adds them", () => {
            expect(1 + 1).toBe(2)
        })
    })
})
```

Native Vitest configuration can import `defineConfig` from
`webanvil/test/config`.

### Browser tests

`wa e2e` builds a web project, starts a production preview, and runs Playwright
Test files in `e2e/`. Import the test API from WebAnvil so the runner and test
code use the bundled matching version:

```ts
import { context, describe, expect, it } from "webanvil/e2e"

describe("home page", () => {
    context("when a visitor opens it", () => {
        it("shows its heading", async ({ page }) => {
            await page.goto("/")
            await expect(page.getByRole("heading")).toBeVisible()
        })
    })
})
```

The generated configuration provides a `chromium` project, so `wa e2e --project
chromium` works without a Playwright config. Use `--headed`, `--debug`, or `--ui`
for an interactive run. WebAnvil ships Playwright Test and Chromium, but the host
still needs the browser system libraries. On Linux CI, install them with:

```sh
npx playwright install --with-deps chromium
```

For advanced configuration, add `playwright.config.*`. WebAnvil then delegates
directly to Playwright and does not build or start a server. Configure
Playwright's `webServer` option in that file when the tests need one.

### Cleaning build output

`wa build` records the actual emitted and copied files in
`.webanvil/buildinfo.json`. Run `wa clean` to remove only those files across
every build target; source files and other untracked files stay in place. The
command leaves `.webanvil/` behind with an empty output list.

Migration
---------

Start with WebAnvil without rewriting your project configuration. You do not need `webanvil.config.ts` before you can use the unified CLI, and you do not need to translate existing Vite, Vitest, or Oxc settings first.

Install WebAnvil, then replace the project scripts with the WebAnvil commands:

```json
{
    "scripts": {
        "dev": "wa dev",
        "build": "wa build",
        "clean": "wa clean",
        "check": "wa check",
        "test": "wa test",
        "lint": "wa lint",
        "format": "wa format",
        "typecheck": "wa typecheck"
    }
}
```

For a Node project that follows the defaults, this is enough. WebAnvil reads `src/index.ts`, writes to `dist`, and uses the project's TypeScript configuration when you run `wa typecheck`.

Your existing configuration stays in charge. A `vite.config.*` or
`vitest.config.*` takes precedence over the matching WebAnvil native block.
`.oxfmtrc.json` and `.oxlintrc.json` do the same for Oxc. Explicit CLI values
remain the final run-specific override.

That lets a project standardize on `wa` now and move settings into `webanvil.config.ts` later, one part at a time. New WebAnvil projects should keep Oxfmt and Oxlint settings in the `format` and `lint` blocks; move existing native Oxc configuration there when it makes sense.

Command reference
-----------------

| Command                   | Description                                                                                               | Options                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wa build [entry]`        | Builds with Vite in web mode or Rolldown in Node mode. A configured Storybook builds with a Node project. | `--mode`, `--out-dir`, `--copy`, `--bundle`, `--no-bundle`, `--formats`, `--declaration`, `--sourcemap`, `--minify`, `--platform`, `--target`                     |
| `wa clean`                | Removes files emitted by prior WebAnvil builds.                                                           | No options                                                                                                                                                        |
| `wa check`                | Checks formatting, linting, and types, stopping on the first failure.                                     | `--fix`                                                                                                                                                           |
| `wa dev [entry]`          | Starts Vite or a Node build watcher. A configured Storybook starts with the Node watcher.                 | `--mode`, `--out-dir`, `--host`, `--port`, `--copy`, `--bundle`, `--no-bundle`, `--formats`, `--declaration`, `--sourcemap`, `--minify`, `--platform`, `--target` |
| `wa preview`              | Serves a Vite production build or configured static Storybook output.                                     | `--out-dir`, `--host`, `--port`, `--open`                                                                                                                         |
| `wa test [filters...]`    | Runs Vitest once, in watch mode, with coverage, or UI.                                                    | `--environment`, `--watch`, `--coverage`, `--ui`, `--ui-port`                                                                                                     |
| `wa e2e [filters...]`     | Builds, previews, and runs Playwright browser tests. Native Playwright configuration takes control.       | `--host`, `--port`, `--ui`, `--headed`, `--debug`, `--project`                                                                                                    |
| `wa lint [paths...]`      | Runs Oxlint and treats warnings as failures.                                                              | `--fix`                                                                                                                                                           |
| `wa format [paths...]`    | Formats with Oxfmt.                                                                                       | `--check`                                                                                                                                                         |
| `wa typecheck [paths...]` | Type-checks with TypeScript Native.                                                                       | No options                                                                                                                                                        |

Run `wa <command> --help` for the complete reference for a command.
