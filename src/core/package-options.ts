import { readFile } from "node:fs/promises"

import type { PackageJson, PackageJsonExports } from "pkg-types"
import { resolvePackageJSON } from "pkg-types"

import type { BuildConfig } from "../config"

export type PackageOutputOptions = Pick<BuildConfig, "declaration" | "formats">

const collectExportConditions = (
    exports: PackageJsonExports | undefined,
    conditions = new Set<string>()
): Set<string> => {
    if (exports === undefined || exports === null || typeof exports === "string") return conditions

    if (Array.isArray(exports)) {
        for (const entry of exports) collectExportConditions(entry, conditions)
        return conditions
    }

    for (const [condition, value] of Object.entries(exports)) {
        conditions.add(condition)
        collectExportConditions(value, conditions)
    }
    return conditions
}

export const inferPackageOutputOptions = (packageJson: PackageJson): PackageOutputOptions => {
    const conditions = collectExportConditions(packageJson.exports)
    const formats: NonNullable<BuildConfig["formats"]> = []
    if (conditions.has("import")) formats.push("esm")
    if (conditions.has("require")) formats.push("cjs")

    return {
        ...(packageJson.types || conditions.has("types") ? { declaration: true } : {}),
        ...(formats.length > 0 ? { formats } : {})
    }
}

export const resolvePackageOutputOptions = async (
    options: PackageOutputOptions,
    cwd = process.cwd()
): Promise<PackageOutputOptions> => {
    const packagePath = await resolvePackageJSON(cwd).catch(() => undefined)
    const packageJson =
        packagePath === undefined ? undefined : (JSON.parse(await readFile(packagePath, "utf8")) as PackageJson)
    const resolved: PackageOutputOptions = packageJson === undefined ? {} : inferPackageOutputOptions(packageJson)

    if (options.declaration !== undefined) resolved.declaration = options.declaration
    if (options.formats !== undefined) resolved.formats = options.formats
    return resolved
}
