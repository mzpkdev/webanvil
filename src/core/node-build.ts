import { dirname, resolve } from "pathe"

import { type OutputBundle, type Plugin as RolldownPlugin, rolldown } from "rolldown"

import type { BuildConfig } from "../config"
import {
    applicationInputs,
    applicationOutputPlan,
    bundledOutputPlan,
    type NodeOutputPlan,
    normalizeNodeOutput,
    sourceRoot,
    writeNodeOutput
} from "./node-output"
import { removeOutputsIn, writeBuildInfo } from "./build-info"
import { resolvePackageOutputOptions } from "./package-options"
import {
    assertStaticCopyDestinationsAvailable,
    type CopyFile,
    copyStaticFiles,
    planStaticCopies,
    staticCopyWatchPaths
} from "./static-copy"

export type NodeBuildOptions = Pick<
    BuildConfig,
    "bundle" | "copy" | "declaration" | "entries" | "formats" | "minify" | "sourcemap" | "target"
>

export type NodeBuildPlan = {
    cwd: string
    options: NodeBuildOptions
    outDir: string
    output: NodeOutputPlan
}

type NodeBuildPreparation = { copies: CopyFile[]; retainedOutput: string[] }

export type NodeWatchLifecycle = {
    abort: () => void
    complete: () => Promise<string[]>
    plugin: RolldownPlugin
    start: () => Promise<void>
}

export const createNodeBuildPlan = async (
    entry: string,
    outDir: string,
    options: NodeBuildOptions,
    plugins: RolldownPlugin[]
): Promise<NodeBuildPlan> => {
    if (!options.bundle && options.declaration) throw new Error("Declarations require --bundle")
    if (!options.bundle && options.formats?.some((format) => format !== "esm")) {
        throw new Error("CommonJS output requires --bundle")
    }

    const cwd = process.cwd()
    const packageOptions = options.bundle ? await resolvePackageOutputOptions(options, cwd) : {}
    const resolvedOptions = { ...options, ...packageOptions }
    const target = resolve(cwd, outDir)
    const output = resolvedOptions.bundle
        ? bundledOutputPlan({
              cwd,
              declaration: resolvedOptions.declaration,
              entry,
              entries: resolvedOptions.entries,
              formats: resolvedOptions.formats,
              minify: resolvedOptions.minify,
              outDir: target,
              plugins,
              sourcemap: resolvedOptions.sourcemap,
              target: resolvedOptions.target
          })
        : applicationOutputPlan({
              inputs: await applicationInputs(sourceRoot(entry, cwd)),
              minify: resolvedOptions.minify,
              outDir: target,
              plugins,
              sourcemap: resolvedOptions.sourcemap,
              target: resolvedOptions.target
          })

    return { cwd, options: resolvedOptions, outDir: target, output }
}

const prepareNodeBuild = async (plan: NodeBuildPlan): Promise<NodeBuildPreparation> => {
    const copies = await planStaticCopies(plan.options.copy, plan.outDir, plan.cwd)
    await assertStaticCopyDestinationsAvailable(copies, plan.output.predictedOutput, false)
    const existing = await removeOutputsIn(plan.outDir, plan.cwd)
    await assertStaticCopyDestinationsAvailable(copies)
    return { copies, retainedOutput: existing.output }
}

const finishNodeBuild = async (
    plan: NodeBuildPlan,
    preparation: NodeBuildPreparation,
    output: string[]
): Promise<string[]> => {
    const copied = await copyStaticFiles(preparation.copies, output, plan.cwd)
    await writeBuildInfo([...preparation.retainedOutput, ...output, ...copied], plan.cwd)
    return [...output, ...copied]
}

const emitNodeBuild = async (plan: NodeBuildPlan, bundle: Parameters<typeof writeNodeOutput>[1]): Promise<string[]> => {
    const preparation = await prepareNodeBuild(plan)
    const output = await writeNodeOutput(plan.output, bundle)
    return finishNodeBuild(plan, preparation, output)
}

export const nodeWatchLifecycle = (plan: NodeBuildPlan): NodeWatchLifecycle => {
    let output: string[] = []
    let preparation: Promise<NodeBuildPreparation> | undefined

    return {
        abort: () => {
            // An earlier format may have called writeBundle before a later one
            // fails. Never let those partial paths reach build-info or copies.
            output = []
            preparation = undefined
        },
        plugin: {
            name: "webanvil-node-watch",
            buildStart: async function () {
                if (preparation === undefined) throw new Error("Node watch build started without preparation")
                const prepared = await preparation
                // Rolldown reliably watches resolved files. Registering the
                // static glob bases is best effort for additions; mappings are
                // always re-expanded whenever any rebuild starts.
                for (const path of [
                    ...staticCopyWatchPaths(plan.options.copy, plan.cwd),
                    ...prepared.copies.map(({ from }) => from)
                ]) {
                    this.addWatchFile(path)
                }
            },
            writeBundle: function (options, bundle: OutputBundle) {
                const directory = options.dir ?? dirname(options.file!)
                output.push(...Object.keys(bundle).map((file) => resolve(directory, file)))
            }
        },
        start: async () => {
            output = []
            preparation = prepareNodeBuild(plan)
            await preparation
        },
        complete: async () => {
            if (preparation === undefined) throw new Error("Node watch build completed without being prepared")
            const normalized = await normalizeNodeOutput(plan.output, [...new Set(output)])
            return finishNodeBuild(plan, await preparation, normalized)
        }
    }
}

export const runNodeBuild = async (plan: NodeBuildPlan): Promise<string[]> => {
    const bundle = await rolldown(plan.output.input)
    try {
        return await emitNodeBuild(plan, bundle)
    } finally {
        await bundle.close()
    }
}
