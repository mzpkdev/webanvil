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
    - [A Node project](#a-node-project)
- [Configuration](#configuration)
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
wa clean      # remove tracked build output
wa test       # run tests
wa lint       # lint files
wa format      # format files
wa typecheck   # type-check the project
```

What it includes
----------------

| Project job                | WebAnvil command     | Tool              |
| -------------------------- | -------------------- | ----------------- |
| Web builds and development | `wa build`, `wa dev` | Vite              |
| Node builds and watch mode | `wa build`, `wa dev` | Rolldown          |
| Tracked output cleanup     | `wa clean`           | WebAnvil          |
| Tests                      | `wa test`            | Vitest            |
| Linting                    | `wa lint`            | Oxlint            |
| Formatting                 | `wa format`          | Oxfmt             |
| Type checking              | `wa typecheck`       | TypeScript Native |

Getting started
---------------

### Install

Install WebAnvil as a development dependency:

```sh
npm install --save-dev webanvil
```

Add the scripts you want to `package.json`:

```json
{
    "scripts": {
        "dev": "wa dev",
        "build": "wa build",
        "clean": "wa clean",
        "test": "wa test",
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
npm run test
npm run lint
npm run format
npm run typecheck
```

### A web app

Set the build mode to `"web"` and point it at an HTML entry point. `wa dev` starts Vite's development server, and `wa build` produces a production bundle.

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

### A Node project

Node mode is the default. Choose an entry file and add only the output options you need:

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "node",
        entry: "src/server.ts",
        outDir: "dist",
        formats: ["esm", "cjs"],
        declaration: true,
        sourcemap: true
    }
})
```

`wa dev` watches and rebuilds Node output. It does not run or restart the server process.

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

Plain Vite plugins work in web mode. Node builds require plugins created with
`definePlugin()`; raw Rolldown plugins are rejected.

Configuration
-------------

Use `webanvil.config.ts` to keep build, test, lint, and formatting settings together:

```ts
import { defineConfig } from "webanvil"

export default defineConfig({
    build: {
        mode: "web",
        entry: "index.html",
        outDir: "dist"
    },
    test: {
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

### Command-line options

Command-line options override the config file. For example, this writes a build to `preview` without changing `webanvil.config.ts`:

```sh
wa build --out-dir preview
```

Use `build.copy` for static files that should be copied unchanged after either a
web or Node build. Each mapping preserves the path beneath the source glob's
static base. For example, `assets/**` mapped to `assets` copies
`assets/images/logo.svg` to `dist/assets/images/logo.svg`. `--copy` accepts one
or more `source=destination` mappings and replaces configured mappings for that
build:

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

Web builds keep Vite's `publicDir` behavior unchanged. Do not use `copy` for
assets imported by application code; Vite continues to manage those assets.

### Cleaning build output

`wa build` records emitted and copied files in `.webanvil/buildinfo.json`. Run `wa clean` to remove only those files across every build target; source files and other untracked files stay in place. The command leaves `.webanvil/` behind with an empty output list.

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
        "test": "wa test",
        "lint": "wa lint",
        "format": "wa format",
        "typecheck": "wa typecheck"
    }
}
```

For a Node project that follows the defaults, this is enough. WebAnvil reads `src/index.ts`, writes to `dist`, and uses the project's TypeScript configuration when you run `wa typecheck`.

Your existing configuration stays in charge. A `vite.config.*` or `vitest.config.*` takes precedence for its tool. `.oxfmtrc.json` and `.oxlintrc.json` take precedence over the matching sections in `webanvil.config.*`.

That lets a project standardize on `wa` now and move settings into `webanvil.config.ts` later, one part at a time. Start with a build entry when it makes sense, then bring over test, lint, or format settings as you touch them.

Command reference
-----------------

| Command                   | Description                                            | Options                                                                                              |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `wa build [entry]`        | Builds with Vite in web mode or Rolldown in Node mode. | `--mode`, `--out-dir`, `--copy`, `--formats`, `--declaration`, `--sourcemap`, `--minify`, `--target` |
| `wa clean`                | Removes files emitted by prior WebAnvil builds.        | No options                                                                                           |
| `wa dev [entry]`          | Starts a Vite server or a Node build watcher.          | `--mode`, `--out-dir`, `--host`, `--port`                                                            |
| `wa test [filters...]`    | Runs Vitest once.                                      | `--environment`                                                                                      |
| `wa lint [paths...]`      | Runs Oxlint and treats warnings as failures.           | `--fix`                                                                                              |
| `wa format [paths...]`    | Formats with Oxfmt.                                    | `--check`                                                                                            |
| `wa typecheck [paths...]` | Type-checks with TypeScript Native.                    | No options                                                                                           |

Run `wa <command> --help` for the complete reference for a command.
