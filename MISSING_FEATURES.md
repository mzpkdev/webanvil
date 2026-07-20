# vial roadmap

vial's command surface and config engine, tracked against a Bun-style all-in-one for Node.
Checked items ship today; the rest are ordered by impact.

## Shipped

- [x] Commands: `init`, `build`, `bundle`, `dev`/`serve`, `preview`, `test`, `typecheck`, `lint`, `format`
- [x] `dev` / `serve`: Vite HMR dev server, serving source from `root`; `serve` is a name alias sharing dev's handler
- [x] `init`: scaffold `vial.config.json` (`--ts` for a typed `vial.config.ts`), owned `tsconfig`, and `.gitignore`; never clobbers without `--force`, `--dry-run` lists targets. Ships a JSON Schema (generated from the zod config) at the package root, referenced by the scaffolded config's `$schema`
- [x] `--watch` for `build` and `bundle`: `bundle` maps to `vite build --watch` (native); `build` drives vial's own zero-dep, cross-platform file watcher (unbuild has none), debounced and ignoring `outDir` so it never retriggers itself
- [x] `clean`: remove the current package's build artifacts (`build.outDir` plus each task's `outputs` bases) and tool caches (`.turbo`, `coverage`, `node_modules/.cache`, `node_modules/.vite`); `--deep` also removes `node_modules`, `--dry-run` lists targets. Scoped by exact path; spares `src`, `package.json`, and vial-owned `tsconfig`/`turbo.json`
- [x] `run`: workspace task orchestration with caching (Turborepo)
- [x] `vial.config` engine: c12 load, remote `extends` presets (giget), defu merge, zod validation (hard-fail)
- [x] Precedence: explicit flags > `vial.config` > `extends` > built-in defaults, with `--config` and native configs as per-tool escapes
- [x] Owned root `tsconfig.json` (regenerated from `vial.config`, `--check` for CI) and `turbo.json`
- [x] `.json`, `.ts`, and `.js` config formats
- [x] Workspace awareness: `vial.config` resolves per package (walk-up merge from the package dir to the workspace root over `BUILTIN`); `vial run <task>` delegates scripted packages to Turborepo and runs vial's no-arg commands (`test`, `typecheck`, `lint`, `format`, `clean`) directly in scriptless packages

## Next (highest impact)

_All shipped. Remaining work is in Later._

## Later

_Nothing queued._
