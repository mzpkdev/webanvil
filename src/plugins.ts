import type { Plugin as RolldownPlugin } from "rolldown"
import type { PluginOption } from "vite"

import { NODE_PLUGIN_ERROR } from "./plugin-validation"

export type WebAnvilUnplugin<Options> = {
    rolldown: (options: Options) => RolldownPlugin | RolldownPlugin[]
    vite: (options: Options) => PluginOption
}

export type UnpluginAdapter = {
    rolldown: () => RolldownPlugin | RolldownPlugin[]
    vite: () => PluginOption
}

export type WebAnvilPlugin = PluginOption | UnpluginAdapter

export const definePlugin = <Options>(plugin: WebAnvilUnplugin<Options>, options: Options): UnpluginAdapter => ({
    rolldown: () => plugin.rolldown(options),
    vite: () => plugin.vite(options)
})

export const isUnpluginAdapter = (plugin: unknown): plugin is UnpluginAdapter =>
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
    isUnpluginAdapter(plugin)

export const resolveRolldownPlugins = (plugins: WebAnvilPlugin[]): RolldownPlugin[] =>
    plugins.flatMap((plugin) => {
        if (!isUnpluginAdapter(plugin)) {
            throw new Error(NODE_PLUGIN_ERROR)
        }

        return plugin.rolldown()
    })

export const resolveVitePlugins = (plugins: WebAnvilPlugin[]): PluginOption[] =>
    plugins.map((plugin) => (isUnpluginAdapter(plugin) ? plugin.vite() : plugin))
