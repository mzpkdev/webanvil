import { access, readFile, readdir } from "node:fs/promises"
import { createRequire } from "node:module"
import { join, resolve } from "pathe"

const typescript = createRequire(import.meta.url)("typescript") as typeof import("typescript")

export const hasFile = async (path: string): Promise<boolean> =>
    access(path)
        .then(() => true)
        .catch(() => false)

export const hasToolConfig = async (name: "vite" | "vitest", cwd = process.cwd()): Promise<boolean> => {
    const files: string[] = await readdir(cwd).catch(() => [])
    const extensions = ["js", "mjs", "cjs", "ts", "mts", "cts"]

    return extensions.some((extension) => files.includes(`${name}.config.${extension}`))
}

export const hasConfiguredStorybookMode = async (cwd = process.cwd()): Promise<boolean> => {
    const extensions = ["js", "ts", "mjs", "cjs", "mts", "cts", "json", "jsonc", "json5", "yaml", "yml", "toml"]
    const locations = [
        ...extensions.map((extension) => join(cwd, `webanvil.config.${extension}`)),
        ...extensions.map((extension) => join(cwd, ".config", `webanvil.${extension}`)),
        ...extensions.map((extension) => join(cwd, ".config", `webanvil.config.${extension}`))
    ]
    const file = (
        await Promise.all(locations.map(async (candidate) => ((await hasFile(candidate)) ? candidate : undefined)))
    ).find((candidate) => candidate !== undefined)
    if (file === undefined) return false

    if (/\.(json|jsonc|json5|yaml|yml|toml)$/.test(file)) {
        const contents = await readFile(file, "utf8")
        const extension = file.slice(file.lastIndexOf(".") + 1)
        const config: { build?: { mode?: unknown } } =
            extension === "json"
                ? JSON.parse(contents)
                : extension === "jsonc"
                  ? (await import("confbox/jsonc")).parseJSONC(contents)
                  : extension === "json5"
                    ? (await import("confbox/json5")).parseJSON5(contents)
                    : extension === "toml"
                      ? (await import("confbox/toml")).parseTOML(contents)
                      : (await import("confbox/yaml")).parseYAML(contents)
        return config.build?.mode === "storybook"
    }

    const source = typescript.createSourceFile(
        file,
        await readFile(file, "utf8"),
        typescript.ScriptTarget.Latest,
        false,
        typescript.ScriptKind.TS
    )
    let storybook = false
    const inspectConfig = (node: import("typescript").Node): void => {
        if (typescript.isObjectLiteralExpression(node)) {
            const build = node.properties.find(
                (property) => typescript.isPropertyAssignment(property) && property.name.getText(source) === "build"
            )
            if (
                build !== undefined &&
                typescript.isPropertyAssignment(build) &&
                typescript.isObjectLiteralExpression(build.initializer)
            ) {
                storybook = build.initializer.properties.some(
                    (property) =>
                        typescript.isPropertyAssignment(property) &&
                        property.name.getText(source) === "mode" &&
                        property.initializer.getText(source).replace(/["']/g, "") === "storybook"
                )
            }
        }
        if (!storybook) typescript.forEachChild(node, inspectConfig)
    }
    inspectConfig(source)
    return storybook
}

export const hasOxcConfig = (name: "oxfmt" | "oxlint", cwd = process.cwd()): Promise<boolean> =>
    hasFile(join(cwd, name === "oxfmt" ? ".oxfmtrc.json" : ".oxlintrc.json"))

export const hasStorybookConfig = async (configDir = ".storybook", cwd = process.cwd()): Promise<boolean> => {
    const files: string[] = await readdir(resolve(cwd, configDir)).catch(() => [])
    const extensions = ["js", "mjs", "cjs", "ts", "mts", "cts"]
    return extensions.some((extension) => files.includes(`main.${extension}`))
}
