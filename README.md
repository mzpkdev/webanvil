# vial

A unified CLI that brings Bun's all-in-one command surface to Node.js projects, powered by Vite,
Vitest, unbuild, TypeScript, and Biome.

## Commands

- `vial init` — scaffold a starter `vial.config`, `tsconfig`, and `.gitignore` (`--ts` for a typed config)
- `vial build [entry]` — build a web app when an `index.html` is present (or `--app`), else compile the library entry into a directory (unbuild); `--watch` to rebuild on change
- `vial bundle <entry>` — bundle an entry into a single file (Vite); `--watch` to rebuild on change
- `vial dev [root]` — start a dev server with hot module reloading (Vite)
- `vial serve [root]` — alias for `dev`
- `vial preview [dir]` — locally preview a production build (Vite preview)
- `vial test [patterns]` — run the test suite (Vitest)
- `vial typecheck` — type-check without emitting (TypeScript)
- `vial lint [paths]` — flag lint and style issues (Biome)
- `vial format [paths]` — format code and prose (Biome)
- `vial run <task>` — run a task across the workspace with caching (Turborepo)
- `vial clean` — remove build artifacts and tool caches (`--deep` also removes `node_modules`, `--dry-run` lists targets)

Everything after `--` is forwarded verbatim to the underlying tool.

## Configuration

vial works with zero config: each command generates the underlying tool's config from vial's
built-in defaults.

To share settings across a project or team, add a `vial.config.json` (`.ts`/`.js` also work) written
in vial's own vocabulary. `vial init` scaffolds one for you, plus a `tsconfig.json` and `.gitignore`;
it writes a `vial.config.json` by default (or `vial.config.ts`, typed against `VialConfig`, with
`--ts`), and never overwrites existing files unless you pass `--force`.

The scaffolded `vial.config.json` carries a `"$schema"` pointing at vial's bundled JSON Schema
(`./node_modules/@crazy-pocs/vial/vial.schema.json`, generated from the same rules that validate the
config), so editors give autocomplete and validation as you type:

```json
{
    "extends": "github:my-org/vial-preset",
    "target": "browser",
    "build": { "outDir": "dist", "sourcemap": true },
    "test": { "environment": "node", "coverage": true },
    "typecheck": { "compilerOptions": { "strict": true, "jsx": "react-jsx" } },
    "format": { "lineWidth": 120, "quoteStyle": "double", "semicolons": "asNeeded" },
    "lint": { "rules": "recommended" }
}
```

`extends` pulls in one or more layers, including remote presets by `github:owner/repo#ref` (fetched
with giget). Prefer `.json` presets: they are pure data, so nothing from a remote repo is executed.

### Precedence

Merged config values, highest to lowest:

`explicit CLI flag  >  vial.config  >  extends layers  >  vial's built-in defaults`

Which config file each tool actually runs with:

`--config <file>  >  a native config in the project root  >  the config vial generates from the merged values above`

A native `vite.config.ts`, `vitest.config.ts`, `build.config.ts`, or `biome.json` in the project
root is used verbatim for its own tool, overriding vial.config for that tool only. Detection is
per-tool: a `vite.config` diverts only the Vite-backed commands (`bundle`, `dev`/`serve`, `preview`,
and `build` in app mode), never the others.

### App builds

`vial build` picks its mode from what it sees: with an `index.html` in the project root (or when you
pass `--app`), it runs a real `vite build`, emitting hashed, code-split assets anchored on that
`index.html`; otherwise it compiles the given library entry into a directory (unbuild). App builds
honor `build.outDir`, so `vial preview` serves exactly what `build` produced and `vial clean` removes
it — one `dev → build → preview → clean` loop.

When building an app, vial auto-wires the Vite plugin for a UI framework it detects among your
project's own dependencies — React, Vue, Svelte, Solid, or Preact — resolving that plugin from your
own `node_modules` (it never installs one for you). A framework that is present without its Vite
plugin is reported as a warning and skipped, and the build proceeds without it.

### tsconfig.json

TypeScript config has to be a real on-disk file so editors, esbuild, and type-aware tooling can find
it by walking up from source. So tsconfig is the one exception to the rule above:

- **With a `vial.config`:** vial owns the root `tsconfig.json`, regenerating it from the merged
  `typecheck.compilerOptions` on every `vial typecheck` (a header comment marks it generated).
  `vial typecheck --check` verifies the file is in sync and exits non-zero otherwise, for CI. A
  detected `tsconfig.json` is not honored here; pass `--config` to point tsc elsewhere.
- **Without a `vial.config`:** vial scaffolds a default `tsconfig.json` once when run interactively
  (a throwaway temp config in CI or under `--no-scaffold`), then never clobbers it. It is yours to edit.

### Tasks (`vial run`)

`vial run <task>` delegates to Turborepo: it runs the `<task>` script across workspace packages
with caching. The pipeline comes from a `tasks` block in `vial.config`, merged over vial's defaults
for `build`, `test`, `lint`, and the rest, and vial writes the root `turbo.json` from it the same
way it owns `tsconfig.json` (Turborepo reads `turbo.json` only from the root). `--filter <pkg>`
scopes to matching packages; arguments after `--` are forwarded to the script.

```json
{
    "tasks": {
        "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
        "test": { "dependsOn": ["^build"] }
    }
}
```

In a workspace, `vial run <task>` runs packages that declare a matching `package.json` script
through Turborepo (cached, dependency-ordered) and, for vial's own no-argument commands (`test`,
`typecheck`, `lint`, `format`, `clean`), runs `vial <task>` directly in any package that lacks the
script (uncached). `vial.config` resolves per package: settings layer from the workspace-root
`vial.config` down to the package's own, nearest winning.
