import { logger } from "../tools"
import { Toolchain, formatResolvedTool, type OptionalToolName, type ResolvedTool, type ToolName } from "./toolchain"

const announced = new Set<string>()

export const useTool = async (name: ToolName, toolchain = new Toolchain(process.cwd())): Promise<ResolvedTool> => {
    const tool = await toolchain.resolve(name)
    const identity = `${tool.packageRoot}:${tool.version}`

    if (!announced.has(identity)) {
        announced.add(identity)
        logger.info(`Using ${formatResolvedTool(tool)}`)
    }

    return tool
}

export const useOptionalTool = async (
    name: OptionalToolName,
    toolchain = new Toolchain(process.cwd())
): Promise<ResolvedTool | undefined> => {
    const tool = await toolchain.resolveOptional(name)
    if (tool === undefined) return

    const identity = `${tool.packageRoot}:${tool.version}`
    if (!announced.has(identity)) {
        announced.add(identity)
        logger.info(`Using ${formatResolvedTool(tool)}`)
    }
    return tool
}

export const useToolApi = async <T>(
    name: ToolName,
    subpath?: string,
    toolchain = new Toolchain(process.cwd())
): Promise<T> => (await useTool(name, toolchain)).import<T>(subpath)

export const useToolExecutable = async (
    name: ToolName | OptionalToolName,
    toolchain = new Toolchain(process.cwd())
): Promise<string> => {
    const tool = name === "svelte-check" ? await useOptionalTool(name, toolchain) : await useTool(name, toolchain)
    if (tool === undefined) throw new Error(`${name} is not declared by the active project or workspace`)
    if (tool.executable === undefined) throw new Error(`${tool.packageName} does not expose an executable`)
    return tool.executable
}
