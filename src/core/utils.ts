import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { execa } from "execa"
import { isAbsolute, join, relative, resolve } from "pathe"

import { hasOxcConfig } from "../config-files"
import { useToolExecutable } from "./use-tool"

type Tool = "oxfmt" | "oxlint" | "tsgo" | "svelte-check"

type JsonConfig = Record<string, unknown>

const rebasePath = (path: string, cwd: string, configDirectory: string): string => {
    if (isAbsolute(path)) return path

    const rebased = relative(configDirectory, resolve(cwd, path))
    return rebased.startsWith(".") ? rebased : `./${rebased}`
}

const rebaseTailwind = (value: unknown, cwd: string, configDirectory: string): unknown => {
    if (typeof value !== "object" || value === null || value instanceof Array) return value

    const tailwind = { ...(value as JsonConfig) }
    for (const key of ["config", "stylesheet"] as const) {
        if (typeof tailwind[key] === "string") tailwind[key] = rebasePath(tailwind[key], cwd, configDirectory)
    }
    return tailwind
}

const rebaseOxfmtConfig = (config: JsonConfig, cwd: string, configDirectory: string): JsonConfig => ({
    ...config,
    ...(config.sortTailwindcss === undefined
        ? {}
        : { sortTailwindcss: rebaseTailwind(config.sortTailwindcss, cwd, configDirectory) }),
    ...(config.overrides instanceof Array
        ? {
              overrides: config.overrides.map((override: unknown) => {
                  if (typeof override !== "object" || override === null || override instanceof Array) return override
                  const value = override as JsonConfig
                  const overrideOptions =
                      typeof value.options === "object" && value.options !== null && !(value.options instanceof Array)
                          ? (value.options as JsonConfig)
                          : undefined
                  const options =
                      overrideOptions === undefined
                          ? value.options
                          : {
                                ...overrideOptions,
                                ...(overrideOptions.sortTailwindcss === undefined
                                    ? {}
                                    : {
                                          sortTailwindcss: rebaseTailwind(
                                              overrideOptions.sortTailwindcss,
                                              cwd,
                                              configDirectory
                                          )
                                      })
                            }
                  return {
                      ...value,
                      ...(options === undefined ? {} : { options })
                  }
              })
          }
        : {})
})

const rebasePlugin = (plugin: unknown, cwd: string, configDirectory: string): unknown => {
    if (typeof plugin === "string") {
        return plugin.startsWith(".") ? rebasePath(plugin, cwd, configDirectory) : plugin
    }
    if (typeof plugin !== "object" || plugin === null || plugin instanceof Array) return plugin

    const value = plugin as JsonConfig
    return typeof value.specifier === "string" && value.specifier.startsWith(".")
        ? { ...value, specifier: rebasePath(value.specifier, cwd, configDirectory) }
        : value
}

const rebaseOxlintConfig = (config: JsonConfig, cwd: string, configDirectory: string): JsonConfig => ({
    ...config,
    ...(config.extends instanceof Array
        ? {
              extends: config.extends.map((path) =>
                  typeof path === "string" ? rebasePath(path, cwd, configDirectory) : path
              )
          }
        : {}),
    ...(config.jsPlugins instanceof Array
        ? { jsPlugins: config.jsPlugins.map((plugin) => rebasePlugin(plugin, cwd, configDirectory)) }
        : {}),
    ...(config.overrides instanceof Array
        ? {
              overrides: config.overrides.map((override: unknown) => {
                  if (typeof override !== "object" || override === null || override instanceof Array) return override
                  const value = override as JsonConfig
                  return {
                      ...value,
                      ...(value.jsPlugins instanceof Array
                          ? {
                                jsPlugins: value.jsPlugins.map((plugin) => rebasePlugin(plugin, cwd, configDirectory))
                            }
                          : {})
                  }
              })
          }
        : {})
})

export const runTool = async (name: Tool, arguments_: string[], config?: object): Promise<void> => {
    if ((name === "oxfmt" || name === "oxlint") && (await hasOxcConfig(name))) config = undefined

    const executable = await useToolExecutable(name === "tsgo" ? "typescript-native" : name)
    const cwd = process.cwd()
    const configDirectory = join(cwd, ".webanvil")
    const configPath = config === undefined ? undefined : join(configDirectory, `${name}-${randomUUID()}.json`)
    const sourceConfig = config as JsonConfig | undefined
    const ignorePatterns =
        sourceConfig?.ignorePatterns instanceof Array
            ? sourceConfig.ignorePatterns.filter((pattern): pattern is string => typeof pattern === "string")
            : []
    const configWithoutIgnores =
        sourceConfig === undefined
            ? undefined
            : Object.fromEntries(Object.entries(sourceConfig).filter(([key]) => key !== "ignorePatterns"))
    const generatedConfig =
        configWithoutIgnores === undefined || configPath === undefined
            ? configWithoutIgnores
            : name === "oxfmt"
              ? rebaseOxfmtConfig(configWithoutIgnores, cwd, configDirectory)
              : rebaseOxlintConfig(configWithoutIgnores, cwd, configDirectory)
    const ignoreArguments =
        name === "oxfmt"
            ? ignorePatterns.map((pattern) => (pattern.startsWith("!") ? pattern.slice(1) : `!${pattern}`))
            : ignorePatterns.flatMap((pattern) => ["--ignore-pattern", pattern])
    const internalIgnoreArguments = name === "oxfmt" ? ["!**/.webanvil/**"] : ["--ignore-pattern", ".webanvil/**"]
    const toolArguments =
        name === "tsgo" || name === "svelte-check"
            ? arguments_
            : [
                  ...(configPath === undefined ? [] : ["--config", configPath]),
                  ...ignoreArguments,
                  ...internalIgnoreArguments,
                  ...(name === "oxfmt" && arguments_.length === 0 ? ["."] : arguments_)
              ]

    if (configPath !== undefined) {
        await mkdir(configDirectory, { recursive: true })
        await writeFile(configPath, `${JSON.stringify(generatedConfig)}\n`)
    }

    try {
        const result = await execa(executable, toolArguments, {
            reject: false,
            stdio: "inherit"
        })

        if (result.exitCode !== 0) throw new Error(`${name} exited with code ${result.exitCode ?? "unknown"}`)
    } finally {
        if (configPath !== undefined) await rm(configPath, { force: true })
    }
}
