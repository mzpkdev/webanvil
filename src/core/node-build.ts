import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"

import { dirname, isAbsolute, relative, resolve } from "pathe"
import type { OutputBundle, Plugin as RolldownPlugin, RolldownOutput, rolldown as rolldownBuild } from "rolldown"

import type { BuildConfig, RolldownConfig } from "../config"
import { readBuildInfo, writeBuildInfo } from "./build-info"
import { createDeclarationPlugins } from "./declaration"
import {
    authoredNodeSources,
    generatedNodeFiles,
    nodeOutputPlan,
    type GeneratedNodeFile,
    type NodeOutputPlan
} from "./node-output"
import { resolvePackageOutputOptions } from "./package-options"
import { Toolchain } from "./toolchain"
import {
    assertStaticCopyDestinationsAvailable,
    type CopyFile,
    planStaticCopies,
    staticCopyWatchPaths
} from "./static-copy"

export type NodeBuildOptions = Pick<
    BuildConfig,
    "bundle" | "copy" | "declaration" | "entries" | "formats" | "minify" | "platform" | "sourcemap" | "target"
>

export type NodeBuildPlan = {
    cwd: string
    declarationOutput?: NodeOutputPlan
    options: NodeBuildOptions
    outDir: string
    output: NodeOutputPlan
}

type RolldownFunction = typeof rolldownBuild
type NodeBuildFileSystem = { rename: typeof rename }
type GeneratedNodeBuild = { files: GeneratedNodeFile[]; sources: string[] }
type StagedNodeBuild = { directory: string; next: string; output: string[] }

export type NodeWatchLifecycle = {
    abort: () => void
    complete: () => Promise<string[] | undefined>
    plugin: RolldownPlugin
}

class StaleNodeWatchBuild extends Error {}

export const createNodeBuildPlan = async (
    entry: string,
    outDir: string,
    options: NodeBuildOptions,
    plugins: RolldownPlugin[],
    native: RolldownConfig = {},
    toolchain = new Toolchain(process.cwd())
): Promise<NodeBuildPlan> => {
    const cwd = process.cwd()
    const packageOptions = await resolvePackageOutputOptions(options, cwd)
    const resolvedOptions = { ...options, ...packageOptions }
    const formats = resolvedOptions.formats ?? ["esm"]
    const target = resolve(cwd, outDir)
    const declaration = resolvedOptions.declaration
    const combinedDeclarations =
        declaration !== false && declaration !== undefined && formats.length === 1 && formats[0] === "esm"
    const declarationPlugins =
        declaration === false || declaration === undefined
            ? []
            : await createDeclarationPlugins(declaration, cwd, toolchain, !combinedDeclarations)
    const output = nodeOutputPlan({
        bundle: resolvedOptions.bundle,
        cwd,
        declarationPlugins: combinedDeclarations ? declarationPlugins : [],
        entry,
        entries: resolvedOptions.entries,
        formats,
        minify: resolvedOptions.minify,
        native,
        outDir: target,
        platform: resolvedOptions.platform,
        plugins,
        sourcemap: resolvedOptions.sourcemap,
        target: resolvedOptions.target
    })
    const declarationOutput =
        declarationPlugins.length === 0 || combinedDeclarations
            ? undefined
            : nodeOutputPlan({
                  bundle: resolvedOptions.bundle,
                  cwd,
                  declarationPlugins,
                  entry,
                  entries: resolvedOptions.entries,
                  formats: ["esm"],
                  native,
                  outDir: target,
                  platform: resolvedOptions.platform,
                  plugins,
                  target: resolvedOptions.target
              })

    return {
        cwd,
        ...(declarationOutput === undefined ? {} : { declarationOutput }),
        options: resolvedOptions,
        outDir: target,
        output
    }
}

const bundleOutput = (bundle: OutputBundle): RolldownOutput => ({ output: Object.values(bundle) }) as RolldownOutput

const generatedPaths = (plan: NodeBuildPlan, files: GeneratedNodeFile[]): string[] =>
    files.map(({ fileName }) => resolve(plan.outDir, fileName))

const isInside = (directory: string, target: string): boolean => {
    const path = relative(directory, target)
    return path === "" || (path !== ".." && !path.startsWith("../") && !isAbsolute(path))
}

const displayPath = (path: string, cwd: string): string => relative(cwd, path) || "."

const isDeclarationOutput = (path: string): boolean => /\.d\.[cm]?ts$/.test(path)

const canonicalPath = async (path: string): Promise<string> => {
    try {
        return await realpath(path)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return resolve(path)
        throw error
    }
}

const assertNoSymlinkDestination = async (path: string, cwd: string): Promise<void> => {
    let directory = dirname(path)
    while (directory !== resolve(cwd)) {
        if (!isInside(cwd, directory)) throw new Error(`Node output is outside the project root: ${path}`)
        try {
            if ((await lstat(directory)).isSymbolicLink()) {
                throw new Error(`Refusing to write Node output through symbolic link: ${path}`)
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        directory = dirname(directory)
    }
}

const preflightBuild = async (
    plan: NodeBuildPlan,
    files: GeneratedNodeFile[],
    copies: CopyFile[],
    sources: string[]
): Promise<{ previous: string[]; retained: string[] }> => {
    const info = await readBuildInfo(plan.cwd)
    const tracked = new Set(info.output.map((file) => resolve(plan.cwd, file)))
    const authoredInputs = new Set(
        [...plan.output.authoredInputs, ...(plan.declarationOutput?.authoredInputs ?? [])].map((file) => resolve(file))
    )
    const canonicalSources = new Map<string, string>()
    for (const source of sources) canonicalSources.set(await canonicalPath(source), source)

    const destinations = [
        ...generatedPaths(plan, files).map((path) => ({ kind: "generated", path })),
        ...copies.map(({ to }) => ({ kind: "copied", path: to }))
    ]
    for (const destination of destinations) {
        if (!isInside(plan.outDir, destination.path) || !isInside(plan.cwd, destination.path)) {
            throw new Error(`Node output is outside the build output directory: ${destination.path}`)
        }

        const source = canonicalSources.get(await canonicalPath(destination.path))
        await assertNoSymlinkDestination(destination.path, plan.cwd)
        let exists = false
        try {
            await lstat(destination.path)
            exists = true
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }

        const generatedDeclarationAlias =
            destination.kind === "generated" &&
            source !== undefined &&
            resolve(source) === resolve(destination.path) &&
            isDeclarationOutput(destination.path) &&
            !authoredInputs.has(resolve(source)) &&
            (!exists || tracked.has(destination.path))
        if (source !== undefined && !generatedDeclarationAlias) {
            throw new Error(
                `Node ${destination.kind} output ${displayPath(destination.path, plan.cwd)} aliases authored source ${displayPath(source, plan.cwd)}`
            )
        }

        if (exists && !tracked.has(destination.path)) {
            throw new Error(
                `Node ${destination.kind} output already exists and is not tracked by WebAnvil: ${displayPath(destination.path, plan.cwd)}`
            )
        }
    }

    return {
        previous: info.output.filter((file) => isInside(plan.outDir, resolve(plan.cwd, file))),
        retained: info.output.filter((file) => !isInside(plan.outDir, resolve(plan.cwd, file)))
    }
}

const stageBuild = async (
    plan: NodeBuildPlan,
    files: GeneratedNodeFile[],
    copies: CopyFile[]
): Promise<StagedNodeBuild> => {
    await mkdir(resolve(plan.cwd, ".webanvil"), { recursive: true })
    const directory = await mkdtemp(resolve(plan.cwd, ".webanvil", "node-output-"))
    const next = resolve(directory, "next")
    const generated = generatedPaths(plan, files)

    try {
        await assertStaticCopyDestinationsAvailable(copies, generated, false)
        for (const file of files) {
            const target = resolve(next, file.fileName)
            if (!isInside(next, target)) {
                throw new Error(`Node output is outside the build output directory: ${file.fileName}`)
            }
            await mkdir(dirname(target), { recursive: true })
            await writeFile(target, file.source)
        }
        for (const copy of copies) {
            const target = resolve(next, relative(plan.outDir, copy.to))
            await mkdir(dirname(target), { recursive: true })
            await copyFile(copy.from, target)
        }
        return { directory, next, output: [...generated, ...copies.map(({ to }) => to)] }
    } catch (error) {
        await rm(directory, { force: true, recursive: true })
        throw error
    }
}

const restoreBuildInfo = async (cwd: string, contents: string | undefined): Promise<void> => {
    const path = resolve(cwd, ".webanvil", "buildinfo.json")
    await rm(`${path}.tmp`, { force: true })
    if (contents === undefined) {
        await rm(path, { force: true })
        return
    }
    const temporary = `${path}.rollback`
    await writeFile(temporary, contents)
    await rename(temporary, path)
}

const readBuildInfoContents = async (cwd: string): Promise<string | undefined> => {
    try {
        return await readFile(resolve(cwd, ".webanvil", "buildinfo.json"), "utf8")
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
        throw error
    }
}

const commitBuild = async (
    plan: NodeBuildPlan,
    files: GeneratedNodeFile[],
    copies: CopyFile[],
    sources: string[],
    fileSystem: NodeBuildFileSystem = { rename },
    isCurrent: () => boolean = () => true
): Promise<string[]> => {
    const assertCurrent = (): void => {
        if (!isCurrent()) throw new StaleNodeWatchBuild()
    }

    assertCurrent()
    const { previous, retained } = await preflightBuild(plan, files, copies, sources)
    assertCurrent()
    const previousBuildInfo = await readBuildInfoContents(plan.cwd)
    const staged = await stageBuild(plan, files, copies)
    const moved: Array<{ backup: string; target: string }> = []
    const installed: string[] = []
    try {
        assertCurrent()
        for (const file of previous) {
            assertCurrent()
            const target = resolve(plan.cwd, file)
            const backup = resolve(staged.directory, "previous", file)
            await mkdir(dirname(backup), { recursive: true })
            try {
                await fileSystem.rename(target, backup)
                moved.push({ backup, target })
                assertCurrent()
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
            }
        }

        for (const output of staged.output) {
            assertCurrent()
            const target = resolve(output)
            const source = resolve(staged.next, relative(plan.outDir, target))
            await mkdir(dirname(target), { recursive: true })
            await fileSystem.rename(source, target)
            installed.push(target)
            assertCurrent()
        }
        assertCurrent()
        await writeBuildInfo([...retained, ...staged.output], plan.cwd)
        assertCurrent()
        return staged.output
    } catch (error) {
        const rollbackErrors: unknown[] = []
        for (const target of installed.reverse()) {
            try {
                await rm(target, { force: true })
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError)
            }
        }
        for (const previous of moved.reverse()) {
            try {
                await mkdir(dirname(previous.target), { recursive: true })
                await fileSystem.rename(previous.backup, previous.target)
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError)
            }
        }
        try {
            await restoreBuildInfo(plan.cwd, previousBuildInfo)
        } catch (rollbackError) {
            rollbackErrors.push(rollbackError)
        }
        if (rollbackErrors.length > 0) {
            throw new AggregateError([error, ...rollbackErrors], "Node build commit failed and rollback was incomplete")
        }
        throw error
    } finally {
        await rm(staged.directory, { force: true, recursive: true })
    }
}

const generateOutput = async (plan: NodeOutputPlan, rolldown: RolldownFunction): Promise<RolldownOutput[]> => {
    const bundle = await rolldown(plan.input)
    try {
        return await Promise.all(plan.output.map((output) => bundle.generate(output)))
    } finally {
        await bundle.close()
    }
}

const generatedBuild = (
    plan: NodeBuildPlan,
    outputs: RolldownOutput[],
    declarationOutputs: RolldownOutput[] = []
): GeneratedNodeBuild => ({
    files: generatedNodeFiles([...outputs, ...declarationOutputs]),
    sources: [
        ...new Set([
            ...authoredNodeSources(plan.output, outputs),
            ...(plan.declarationOutput === undefined
                ? []
                : authoredNodeSources(plan.declarationOutput, declarationOutputs))
        ])
    ]
})

export const runNodeBuild = async (
    plan: NodeBuildPlan,
    rolldown: RolldownFunction,
    fileSystem: NodeBuildFileSystem = { rename }
): Promise<string[]> => {
    const outputs = await generateOutput(plan.output, rolldown)
    const declarationOutputs =
        plan.declarationOutput === undefined ? [] : await generateOutput(plan.declarationOutput, rolldown)
    const { files, sources } = generatedBuild(plan, outputs, declarationOutputs)
    const copies = await planStaticCopies(plan.options.copy, plan.outDir, plan.cwd)
    return commitBuild(plan, files, copies, sources, fileSystem)
}

export const nodeWatchLifecycle = (plan: NodeBuildPlan, rolldown?: RolldownFunction): NodeWatchLifecycle => {
    let generation = 0
    let outputs: RolldownOutput[] = []
    let copies: CopyFile[] = []
    let commits = Promise.resolve()

    return {
        abort: () => {
            generation += 1
            outputs = []
            copies = []
        },
        plugin: {
            name: "webanvil-node-watch",
            async buildStart() {
                copies = await planStaticCopies(plan.options.copy, plan.outDir, plan.cwd)
                for (const path of [
                    ...staticCopyWatchPaths(plan.options.copy, plan.cwd),
                    ...copies.map(({ from }) => from)
                ]) {
                    this.addWatchFile(path)
                }
            },
            generateBundle(_options, bundle) {
                outputs.push(bundleOutput(bundle))
            }
        },
        complete: async () => {
            const completedGeneration = generation
            const completedOutputs = outputs
            const completedCopies = copies
            if (plan.declarationOutput !== undefined && rolldown === undefined) {
                throw new Error("The declaration-only watch graph requires the selected Rolldown API")
            }
            const declarationOutputs =
                plan.declarationOutput === undefined ? [] : await generateOutput(plan.declarationOutput, rolldown!)
            const build = generatedBuild(plan, completedOutputs, declarationOutputs)
            const commit = async (): Promise<string[] | undefined> => {
                if (completedGeneration !== generation) return undefined
                try {
                    return await commitBuild(
                        plan,
                        build.files,
                        completedCopies,
                        build.sources,
                        undefined,
                        () => completedGeneration === generation
                    )
                } catch (error) {
                    if (error instanceof StaleNodeWatchBuild) return undefined
                    throw error
                }
            }
            const pending = commits.then(commit, commit)
            commits = pending.then(
                () => undefined,
                () => undefined
            )
            return pending
        }
    }
}
