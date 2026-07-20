import { existsSync } from "node:fs"
import path from "node:path"
import { loadConfig } from "c12"
import { CmdoreError } from "cmdore"
import { defu } from "defu"
import { z } from "zod"
import { findWorkspaceRoot } from "./workspace"

export type Target = "browser" | "node" | "bun"

/** Per-section settings, each field required. `VialConfig` exposes partial views of these for
 *  the user-facing file; `ResolvedConfig` is the fully-merged result the generators read. */
type BuildConfig = { outDir: string; declaration: boolean; clean: boolean; sourcemap: boolean; minify: boolean }
type BundleConfig = { minify: boolean; sourcemap: boolean }
type DevConfig = { port: number; host: string }
type PreviewConfig = { port: number; host: string }
type TestConfig = { environment: string; globals: boolean; coverage: boolean }
type TypecheckConfig = { compilerOptions: Record<string, unknown> }
type FormatConfig = {
    indentStyle: "space" | "tab"
    indentWidth: number
    lineWidth: number
    quoteStyle: "double" | "single"
    semicolons: "always" | "asNeeded"
}
type LintConfig = { rules: "recommended" | Record<string, unknown> }
/** One Turborepo task (a package.json script vial orchestrates), keyed by task name. */
type TaskConfig = { dependsOn?: string[]; outputs?: string[]; inputs?: string[]; cache?: boolean; persistent?: boolean }

/** The user-facing `vial.config.{json,ts,js}` shape: plain settings in vial's own vocabulary.
 *  Every field is optional; `extends` pulls in c12 layers, including remote presets. */
export type VialConfig = {
    /** JSON Schema reference for editor autocomplete in vial.config.json; ignored when loaded. */
    $schema?: string
    /** c12 layers to inherit, e.g. "./base.json" or a remote "github:org/preset#ref". */
    extends?: string | string[]
    /** Runtime targeted by build and bundle. */
    target?: Target
    build?: Partial<BuildConfig>
    bundle?: Partial<BundleConfig>
    /** Dev server (`vial dev`, aliased `serve`). */
    dev?: Partial<DevConfig>
    preview?: Partial<PreviewConfig>
    test?: Partial<TestConfig>
    /** Passed through to the generated tsconfig's compilerOptions. */
    typecheck?: Partial<TypecheckConfig>
    format?: Partial<FormatConfig>
    lint?: Partial<LintConfig>
    /** Turborepo task pipeline `vial run` orchestrates, keyed by task name. */
    tasks?: Record<string, TaskConfig>
}

/** The merged config every generator consumes: BUILTIN fills any field the user left unset. */
export type ResolvedConfig = {
    target: Target
    build: BuildConfig
    bundle: BundleConfig
    dev: DevConfig
    preview: PreviewConfig
    test: TestConfig
    typecheck: TypecheckConfig
    format: FormatConfig
    lint: LintConfig
    tasks: Record<string, TaskConfig>
}

/** vial's built-in defaults, the lowest-precedence layer. Overridden by `extends` layers, then
 *  the local vial.config, then explicit CLI flags. Kept verbatim from the old hardcoded configs. */
export const BUILTIN: ResolvedConfig = {
    target: "browser",
    build: { outDir: "dist", declaration: true, clean: true, sourcemap: false, minify: false },
    bundle: { minify: false, sourcemap: false },
    dev: { port: 3000, host: "localhost" },
    preview: { port: 3000, host: "localhost" },
    test: { environment: "node", globals: true, coverage: false },
    typecheck: {
        compilerOptions: {
            noEmit: true,
            strict: true,
            target: "esnext",
            module: "esnext",
            moduleResolution: "bundler",
            esModuleInterop: true,
            resolveJsonModule: true,
            skipLibCheck: true,
            jsx: "react-jsx",
            forceConsistentCasingInFileNames: true
        }
    },
    format: { indentStyle: "space", indentWidth: 4, lineWidth: 120, quoteStyle: "double", semicolons: "asNeeded" },
    lint: { rules: "recommended" },
    tasks: {
        build: { dependsOn: ["^build"], outputs: ["dist/**"] },
        bundle: { dependsOn: ["^build"], outputs: ["dist/**"] },
        test: { dependsOn: ["^build"] },
        typecheck: { dependsOn: ["^build"] },
        lint: {},
        format: { cache: false },
        dev: { cache: false, persistent: true },
        preview: { cache: false, persistent: true }
    }
}

/** Runtime shape check for the merged user config (before BUILTIN fills gaps). Strict at the top
 *  level so a mistyped section (e.g. `formatter` for `format`) is a hard error, not silence. */
const configSchema = z.strictObject({
    // Allowed so a vial.config.json can carry a `$schema` for editor tooling; not consumed like
    // `extends` (which c12 strips before validation), so it must be a known key here.
    $schema: z.string().optional(),
    target: z.enum(["browser", "node", "bun"]).optional(),
    build: z
        .object({
            outDir: z.string().optional(),
            declaration: z.boolean().optional(),
            clean: z.boolean().optional(),
            sourcemap: z.boolean().optional(),
            minify: z.boolean().optional()
        })
        .optional(),
    bundle: z.object({ minify: z.boolean().optional(), sourcemap: z.boolean().optional() }).optional(),
    dev: z.object({ port: z.number().optional(), host: z.string().optional() }).optional(),
    preview: z.object({ port: z.number().optional(), host: z.string().optional() }).optional(),
    test: z
        .object({
            environment: z.string().optional(),
            globals: z.boolean().optional(),
            coverage: z.boolean().optional()
        })
        .optional(),
    typecheck: z.object({ compilerOptions: z.record(z.string(), z.unknown()).optional() }).optional(),
    format: z
        .object({
            indentStyle: z.enum(["space", "tab"]).optional(),
            indentWidth: z.number().optional(),
            lineWidth: z.number().optional(),
            quoteStyle: z.enum(["double", "single"]).optional(),
            semicolons: z.enum(["always", "asNeeded"]).optional()
        })
        .optional(),
    lint: z
        .object({ rules: z.union([z.literal("recommended"), z.record(z.string(), z.unknown())]).optional() })
        .optional(),
    tasks: z
        .record(
            z.string(),
            z.strictObject({
                dependsOn: z.array(z.string()).optional(),
                outputs: z.array(z.string()).optional(),
                inputs: z.array(z.string()).optional(),
                cache: z.boolean().optional(),
                persistent: z.boolean().optional()
            })
        )
        .optional()
})

/** vial.config as a JSON Schema, generated from the same zod schema that validates it at load time
 *  so editor hints and the runtime check never drift. Shipped in the package (see src/schema.ts)
 *  and referenced by a vial.config.json via `$schema`. */
export const configJsonSchema = (): Record<string, unknown> => ({
    ...(z.toJSONSchema(configSchema) as Record<string, unknown>),
    title: "vial.config",
    description: "Configuration for the vial CLI. Every field is optional."
})

const cache = new Map<string, Promise<ResolvedConfig>>()

/** Directories from `cwd` up to and including the workspace root, nearest first. Outside a
 *  workspace it is just `[cwd]`, so single-package resolution is unchanged. */
const configChain = (cwd: string): string[] => {
    const root = findWorkspaceRoot(cwd)
    const chain = [cwd]
    if (root && root !== cwd) {
        let dir = cwd
        while (dir !== root) {
            dir = path.dirname(dir)
            chain.push(dir)
        }
    }
    return chain
}

/** Load and merge the vial.config chain from the command's cwd up to the workspace root, over
 *  vial's built-ins. Precedence high to low: `overrides` (explicit CLI flags) > nearest package's
 *  vial.config > ... > workspace-root vial.config > BUILTIN. Each level still resolves its own
 *  `extends` (remote presets included) through c12. Memoized per cwd+overrides key. */
export const loadVialConfig = (overrides: VialConfig = {}, cwd: string = process.cwd()): Promise<ResolvedConfig> => {
    const key = `${cwd} ${JSON.stringify(overrides)}`
    const cached = cache.get(key)
    if (cached) {
        return cached
    }
    const loaded = (async (): Promise<ResolvedConfig> => {
        const partials: VialConfig[] = []
        for (const dir of configChain(cwd)) {
            if (!hasVialConfig(dir)) {
                continue
            }
            const { config } = await loadConfig<VialConfig>({ name: "vial", cwd: dir, rcFile: false })
            const result = configSchema.safeParse(config)
            if (!result.success) {
                throw new CmdoreError(`invalid vial.config in ${dir}:\n${z.prettifyError(result.error)}`, {
                    exitCode: 1
                })
            }
            partials.push(result.data)
        }
        return defu(overrides, ...partials, BUILTIN) as ResolvedConfig
    })()
    cache.set(key, loaded)
    return loaded
}

/** Extensions c12 would load a vial.config from, most-preferred first. */
const CONFIG_EXTENSIONS = ["json", "jsonc", "ts", "mts", "cts", "js", "mjs", "cjs"]

/** Whether the project has a vial.config file in `cwd` (pure fs check, no c12 load so it never
 *  touches the network). Drives tsconfig ownership: present means vial owns and rewrites the
 *  root tsconfig; absent keeps the scaffold-once/never-clobber behavior. */
export const hasVialConfig = (cwd: string = process.cwd()): boolean =>
    CONFIG_EXTENSIONS.some((ext) => existsSync(path.join(cwd, `vial.config.${ext}`)))
