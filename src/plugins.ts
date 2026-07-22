import type { Plugin as RolldownPlugin } from "rolldown"
import type { UnpluginInstance } from "unplugin"
import type { PluginOption } from "vite"

type UnpluginAdapter = {
    rolldown: () => RolldownPlugin | RolldownPlugin[]
    vite: () => PluginOption
}

export type WebAnvilPlugin = PluginOption | UnpluginAdapter

export const definePlugin = <Options>(plugin: UnpluginInstance<Options>, options: Options): UnpluginAdapter => ({
    rolldown: () => plugin.rolldown(options),
    vite: () => plugin.vite(options)
})

const isUnpluginAdapter = (plugin: WebAnvilPlugin): plugin is UnpluginAdapter =>
    typeof plugin === "object" &&
    plugin !== null &&
    "rolldown" in plugin &&
    typeof plugin.rolldown === "function" &&
    "vite" in plugin &&
    typeof plugin.vite === "function"

export const isWebAnvilPlugin = (plugin: unknown): plugin is WebAnvilPlugin =>
    Array.isArray(plugin) ||
    typeof plugin === "function" ||
    (typeof plugin === "object" && plugin !== null && "name" in plugin) ||
    (typeof plugin === "object" &&
        plugin !== null &&
        "rolldown" in plugin &&
        typeof plugin.rolldown === "function" &&
        "vite" in plugin &&
        typeof plugin.vite === "function")

export const resolveRolldownPlugins = (plugins: WebAnvilPlugin[]): RolldownPlugin[] =>
    plugins.flatMap((plugin) => {
        if (!isUnpluginAdapter(plugin)) {
            throw new Error("Node builds require plugins created with definePlugin()")
        }

        return plugin.rolldown()
    })

export const resolveVitePlugins = (plugins: WebAnvilPlugin[]): PluginOption[] =>
    plugins.map((plugin) => (isUnpluginAdapter(plugin) ? plugin.vite() : plugin))
