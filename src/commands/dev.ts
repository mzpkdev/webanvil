import { defineCommand, defineOption } from "cmdore"
import type { Plugin as RolldownPlugin } from "rolldown"
import type { UserConfig as ViteConfig } from "vite"

import { entry } from "../arguments"
import { hasToolConfig } from "../config-files"
import {
    assertSyntaxTarget,
    type BuildConfig,
    type CopyMapping,
    type RolldownConfig,
    resolveEffectiveBuildConfig,
    withConfig
} from "../config"
import { createNodeBuildPlan, type NodeBuildOptions, nodeWatchLifecycle } from "../core/node-build"
import { runStorybook } from "../core/storybook"
import { Toolchain } from "../core/toolchain"
import { untilTerminated } from "../core/until-terminated"
import { useToolApi } from "../core/use-tool"
import {
    bundle,
    copy,
    declaration,
    formats,
    host,
    minify,
    mode,
    outDir,
    platform,
    port,
    sourcemap,
    target
} from "../options"
import { resolveRolldownPlugins, resolveVitePlugins, type WebAnvilPlugin } from "../plugins"
import { logger } from "../tools"

type DevCommandArguments = {
    bundle?: boolean
    copy?: CopyMapping[]
    declaration?: BuildConfig["declaration"]
    entry?: string
    formats?: Array<"esm" | "cjs">
    host?: string
    minify?: boolean
    mode?: "web" | "node" | "storybook"
    "no-bundle"?: boolean
    "out-dir"?: string
    platform?: "node" | "browser" | "neutral"
    port?: number
    sourcemap?: boolean
    target?: string | string[]
}
const noBundle = defineOption({
    name: "no-bundle",
    description: "Emit the reachable Node graph with preserveModules, overriding configuration that enables bundling.",
    arity: 0
})

const assertStorybookArguments = (explicit: DevCommandArguments): void => {
    const incompatible = [
        "bundle",
        "copy",
        "declaration",
        "entry",
        "formats",
        "minify",
        "no-bundle",
        "out-dir",
        "platform",
        "sourcemap",
        "target"
    ] as const
    const option = incompatible.find((name) => {
        const value = explicit[name]
        return name === "bundle" || name === "no-bundle" ? value === true : value !== undefined
    })
    if (option !== undefined) throw new Error(`--${option} is not available in Storybook mode`)
}

export const dev = async (
    mode: "web" | "node",
    entry: string,
    outDir: string,
    host?: string,
    port?: number,
    plugins: WebAnvilPlugin[] = [],
    options: NodeBuildOptions = {},
    viteConfig: ViteConfig = {},
    rolldownConfig: RolldownConfig = {},
    toolchain = new Toolchain(process.cwd())
): Promise<void> => {
    assertSyntaxTarget(options.target)
    if (mode === "web" && options.platform !== undefined) {
        throw new Error("Web development does not accept platform; platform applies only to Node builds")
    }

    logger.start(`Starting ${mode} development mode`)

    if (mode === "node" && (host !== undefined || port !== undefined)) {
        throw new Error("--host and --port are only available in web development mode")
    }

    if (mode === "web") await dev.web(host, port, plugins, untilTerminated, viteConfig, toolchain)
    else await dev.node(entry, outDir, plugins, untilTerminated, options, rolldownConfig, toolchain)
}

dev.web = async (
    host?: string,
    port?: number,
    plugins: WebAnvilPlugin[] = [],
    waitForTermination: () => Promise<void> = untilTerminated,
    viteConfig: ViteConfig = {},
    toolchain = new Toolchain(process.cwd())
): Promise<void> => {
    const vite = await useToolApi<typeof import("vite")>("vite", undefined, toolchain)
    const webanvilDefaults: ViteConfig = {
        root: process.cwd(),
        plugins: resolveVitePlugins(plugins)
    }
    const explicit: ViteConfig = {
        root: process.cwd(),
        ...(host === undefined && port === undefined ? {} : { server: { host, port } })
    }
    const config = (await hasToolConfig("vite"))
        ? explicit
        : vite.mergeConfig(vite.mergeConfig(webanvilDefaults, viteConfig), explicit)
    const server = await vite.createServer(config)

    try {
        await server.listen()
        server.printUrls()
        await waitForTermination()
    } finally {
        await server.close()
    }
}

dev.node = async (
    entry: string,
    outDir: string,
    plugins: WebAnvilPlugin[] = [],
    waitForTermination: () => Promise<void> = untilTerminated,
    options: NodeBuildOptions = {},
    rolldownConfig: RolldownConfig = {},
    toolchain = new Toolchain(process.cwd())
): Promise<void> => {
    assertSyntaxTarget(options.target)
    const rolldown = await useToolApi<typeof import("rolldown")>("rolldown", undefined, toolchain)
    const plan = await createNodeBuildPlan(
        entry,
        outDir,
        options,
        resolveRolldownPlugins(plugins),
        rolldownConfig,
        toolchain
    )
    const lifecycle = nodeWatchLifecycle(plan, rolldown.rolldown)
    const watcher = rolldown.watch({
        ...plan.output.input,
        plugins: [...((plan.output.input.plugins ?? []) as RolldownPlugin[]), lifecycle.plugin],
        watch: {
            ...(typeof plan.output.input.watch === "object" ? plan.output.input.watch : {}),
            skipWrite: true
        },
        output: plan.output.output
    })
    let failed = false

    watcher.on("event", async (event) => {
        if (event.code === "START") {
            failed = false
            lifecycle.abort()
        }

        if (event.code === "BUNDLE_END") {
            await event.result.close()
        }

        if (event.code === "END" && !failed) {
            try {
                const output = await lifecycle.complete()
                if (output !== undefined) logger.success(`Built ${entry} to ${outDir}`)
            } catch (error) {
                logger.error(error)
            }
        }

        if (event.code === "ERROR") {
            failed = true
            lifecycle.abort()
            await event.result.close()
            logger.error(event.error)
        }
    })

    try {
        await waitForTermination()
    } finally {
        lifecycle.abort()
        await watcher.close()
    }
}

const commandRun = (toolchain: Toolchain) =>
    withConfig<BuildConfig, DevCommandArguments, void>(
        (config) => config.build,
        (
            {
                copy,
                declaration,
                formats,
                minify,
                mode,
                entry,
                "out-dir": outDir,
                host,
                platform,
                port,
                sourcemap,
                target
            },
            buildConfig,
            resolvedConfig,
            explicit
        ) => {
            if (explicit.mode === "storybook") {
                assertStorybookArguments(explicit)
                return runStorybook("dev", resolvedConfig.storybook, { host, port }, toolchain)
            }
            if (explicit.bundle && explicit["no-bundle"]) {
                throw new Error("--bundle and --no-bundle cannot be used together")
            }
            const effectiveBundle = explicit["no-bundle"] ? false : explicit.bundle ? true : buildConfig.bundle
            const effectiveMode = mode === "storybook" ? undefined : mode
            const effective = resolveEffectiveBuildConfig(
                resolvedConfig,
                {
                    bundle: effectiveBundle,
                    copy,
                    declaration,
                    entries: buildConfig.entries,
                    entry,
                    formats,
                    minify,
                    mode: effectiveMode,
                    outDir,
                    platform,
                    sourcemap,
                    target
                },
                explicit.entry !== undefined
            )

            return dev(
                effective.mode!,
                effective.entry!,
                effective.outDir!,
                host,
                port,
                resolvedConfig.plugins ?? [],
                effective,
                resolvedConfig.vite,
                resolvedConfig.rolldown,
                toolchain
            )
        }
    )

export default defineCommand({
    name: "dev",
    arguments: [entry],
    options: [
        mode,
        outDir,
        host,
        port,
        bundle,
        noBundle,
        copy,
        declaration,
        sourcemap,
        minify,
        formats,
        platform,
        target
    ],
    run: async (arguments_) => {
        const toolchain = new Toolchain(process.cwd())
        if (arguments_.mode === "storybook") await toolchain.resolve("storybook")
        else await Promise.all([toolchain.resolve("vite"), toolchain.resolve("rolldown")])
        return commandRun(toolchain)(arguments_)
    }
})
