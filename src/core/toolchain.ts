import { access, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { resolvePath as resolveModulePath } from "mlly"
import { glob } from "tinyglobby"
import { parse } from "yaml"

const { satisfies } = createRequire(import.meta.url)("semver") as {
    satisfies(version: string, range: string): boolean
}

export type ToolName =
    | "vite"
    | "vitest"
    | "playwright"
    | "rolldown"
    | "oxlint"
    | "oxfmt"
    | "storybook"
    | "typescript"
    | "typescript-native"
export type OptionalToolName = "svelte-check"
type AnyToolName = ToolName | OptionalToolName
export type ToolSource = "project" | "webanvil"

export type ResolvedTool = {
    name: AnyToolName
    packageName: string
    version: string
    source: ToolSource
    packageRoot: string
    import<T>(subpath?: string): Promise<T>
    executable?: string
}

type ToolDefinition = {
    allowProjectOverride?: boolean
    packageName: string
    range: string
    bin?: string
}

export const supportedTools = {
    vite: { packageName: "vite", range: ">=8.1.5 <9" },
    vitest: { packageName: "vitest", range: ">=4.1.11 <5", allowProjectOverride: false },
    playwright: {
        packageName: "@playwright/test",
        range: ">=1.58.2 <2",
        bin: "playwright",
        allowProjectOverride: false
    },
    storybook: { packageName: "storybook", range: ">=10.5.9 <11", bin: "storybook" },
    rolldown: { packageName: "rolldown", range: ">=1.2.0 <2" },
    oxlint: { packageName: "oxlint", range: ">=1.75.0 <2", bin: "oxlint" },
    oxfmt: { packageName: "oxfmt", range: ">=0.60.0 <0.61", bin: "oxfmt" },
    typescript: { packageName: "typescript", range: ">=5 <7.1.0" },
    "typescript-native": {
        packageName: "@typescript/native-preview",
        range: ">=7.0.0-dev.20260707.2 <7.0.0",
        bin: "tsgo"
    }
} as const satisfies Record<ToolName, ToolDefinition>

export const optionalTools = {
    "svelte-check": { packageName: "svelte-check", range: ">=4 <5", bin: "svelte-check" }
} as const satisfies Record<OptionalToolName, ToolDefinition>

type PackageManifest = {
    name?: unknown
    version?: unknown
    workspaces?: unknown
    dependencies?: unknown
    devDependencies?: unknown
    optionalDependencies?: unknown
    peerDependencies?: unknown
    bin?: unknown
}

type DeclaringManifest = {
    directory: string
    path: string
}

export type ResolvedDeclaredPackage = {
    declarationDirectory: string
    packageRoot: string
    version: string
}

const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const

const readManifest = async (path: string): Promise<PackageManifest> => {
    const contents = await readFile(path, "utf8")
    const manifest: unknown = JSON.parse(contents)
    if (manifest === null || typeof manifest !== "object" || manifest instanceof Array) {
        throw new Error(`Invalid package manifest at ${path}`)
    }
    return manifest as PackageManifest
}

const hasOwnDeclaration = (manifest: PackageManifest, packageName: string): boolean =>
    dependencyFields.some((field) => {
        const dependencies = manifest[field]
        return (
            dependencies !== null &&
            typeof dependencies === "object" &&
            !Array.isArray(dependencies) &&
            Object.hasOwn(dependencies, packageName)
        )
    })

const parentDirectories = function* (start: string): Generator<string> {
    let directory = resolve(start)
    while (true) {
        yield directory
        const parent = dirname(directory)
        if (parent === directory) return
        directory = parent
    }
}

const findNearestManifest = async (cwd: string): Promise<DeclaringManifest | undefined> => {
    for (const directory of parentDirectories(cwd)) {
        const path = join(directory, "package.json")
        try {
            await access(path)
            return { directory, path }
        } catch {
            // Continue towards the filesystem root.
        }
    }
}

const manifestWorkspacePatterns = (manifest: PackageManifest): string[] => {
    if (Array.isArray(manifest.workspaces)) {
        return manifest.workspaces.filter((pattern): pattern is string => typeof pattern === "string")
    }
    if (
        manifest.workspaces !== null &&
        typeof manifest.workspaces === "object" &&
        !Array.isArray(manifest.workspaces) &&
        Array.isArray((manifest.workspaces as { packages?: unknown }).packages)
    ) {
        return (manifest.workspaces as { packages: unknown[] }).packages.filter(
            (pattern): pattern is string => typeof pattern === "string"
        )
    }
    return []
}

const pnpmWorkspacePatterns = async (directory: string): Promise<string[]> => {
    const path = join(directory, "pnpm-workspace.yaml")
    let contents: string
    try {
        contents = await readFile(path, "utf8")
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
        throw error
    }

    let manifest: unknown
    try {
        manifest = parse(contents)
    } catch (error) {
        throw new Error(`Invalid pnpm workspace manifest at ${path}`, { cause: error })
    }

    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error(`Invalid pnpm workspace manifest at ${path}: expected a mapping`)
    }

    const packages = (manifest as { packages?: unknown }).packages
    if (packages === undefined) return []
    if (!Array.isArray(packages) || packages.some((pattern) => typeof pattern !== "string")) {
        throw new Error(`Invalid pnpm workspace manifest at ${path}: packages must be an array of strings`)
    }

    return packages
}

const isWorkspaceMember = async (
    manifest: PackageManifest,
    workspaceDirectory: string,
    projectDirectory: string
): Promise<boolean> => {
    const patterns = [...manifestWorkspacePatterns(manifest), ...(await pnpmWorkspacePatterns(workspaceDirectory))]
    if (patterns.length === 0) return false

    const members = await glob(patterns, {
        absolute: true,
        cwd: workspaceDirectory,
        onlyDirectories: true
    })
    const project = resolve(projectDirectory)
    return members.some((member) => resolve(member) === project)
}

const findDeclaration = async (cwd: string, packageName: string): Promise<DeclaringManifest | undefined> => {
    const project = await findNearestManifest(cwd)
    if (project !== undefined) {
        const manifest = await readManifest(project.path)
        if (hasOwnDeclaration(manifest, packageName)) return project
    }

    const workspaceSearchRoot = project === undefined ? cwd : dirname(project.directory)
    for (const directory of parentDirectories(workspaceSearchRoot)) {
        const path = join(directory, "package.json")
        let manifest: PackageManifest
        try {
            manifest = await readManifest(path)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
            throw error
        }

        if (
            project !== undefined &&
            (await isWorkspaceMember(manifest, directory, project.directory)) &&
            hasOwnDeclaration(manifest, packageName)
        ) {
            return { directory, path }
        }
    }
}

const findContainingManifest = async (entryPath: string): Promise<string> => {
    for (const directory of parentDirectories(dirname(entryPath))) {
        const path = join(directory, "package.json")
        try {
            await access(path)
            return path
        } catch {
            // Package entry points can be nested several directories below their manifest.
        }
    }
    throw new Error(`Could not find the package manifest containing ${entryPath}`)
}

const resolveInstalledManifest = (packageName: string, anchor: string): string => {
    const require = createRequire(join(anchor, "package.json"))
    try {
        return require.resolve(`${packageName}/package.json`)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error
        return require.resolve(packageName)
    }
}

export const resolveDeclaredPackage = async (
    packageName: string,
    cwd = process.cwd()
): Promise<ResolvedDeclaredPackage> => {
    const declaration = await findDeclaration(cwd, packageName)
    if (declaration === undefined) {
        throw new Error(
            `${packageName} must be declared in the active project or workspace package.json before WebAnvil can use it`
        )
    }

    let resolvedPath: string
    try {
        resolvedPath = resolveInstalledManifest(packageName, declaration.directory)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
            throw new Error(`${packageName} is declared by ${declaration.path} but is not installed`, {
                cause: error
            })
        }
        throw error
    }

    const manifestPath = resolvedPath.endsWith("package.json")
        ? resolvedPath
        : await findContainingManifest(resolvedPath)
    const manifest = await readManifest(manifestPath)
    if (manifest.name !== packageName || typeof manifest.version !== "string") {
        throw new Error(`The resolved ${packageName} package at ${dirname(manifestPath)} has invalid package metadata`)
    }
    return {
        declarationDirectory: declaration.directory,
        packageRoot: dirname(manifestPath),
        version: manifest.version
    }
}

const normalizeSubpath = (subpath: string): string => subpath.replace(/^\.?\//, "")

const resolveExecutable = async (
    definition: ToolDefinition,
    manifest: PackageManifest,
    packageRoot: string
): Promise<string | undefined> => {
    if (definition.bin === undefined) return

    const relativeExecutable =
        typeof manifest.bin === "string"
            ? manifest.bin
            : manifest.bin !== null && typeof manifest.bin === "object" && !Array.isArray(manifest.bin)
              ? (manifest.bin as Record<string, unknown>)[definition.bin]
              : undefined
    if (typeof relativeExecutable !== "string") {
        throw new Error(`${definition.packageName} does not provide its expected ${definition.bin} executable`)
    }

    const executable = resolve(packageRoot, relativeExecutable)
    const packageRelativePath = relative(packageRoot, executable)
    if (packageRelativePath.startsWith("..") || isAbsolute(packageRelativePath)) {
        throw new Error(`${definition.packageName} has an invalid ${definition.bin} executable path`)
    }
    try {
        await access(executable)
    } catch {
        throw new Error(`${definition.packageName}'s ${definition.bin} executable is missing at ${executable}`)
    }
    return executable
}

const loadResolvedTool = async (
    name: AnyToolName,
    definition: ToolDefinition,
    anchor: string,
    source: ToolSource
): Promise<ResolvedTool> => {
    let resolvedPath: string
    try {
        resolvedPath = resolveInstalledManifest(definition.packageName, anchor)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
            throw new Error(
                `${definition.packageName} is declared by ${join(anchor, "package.json")} but is not installed`,
                { cause: error }
            )
        }
        throw error
    }

    const manifestPath = resolvedPath.endsWith("package.json")
        ? resolvedPath
        : await findContainingManifest(resolvedPath)
    const packageRoot = dirname(manifestPath)
    const manifest = await readManifest(manifestPath)
    if (manifest.name !== definition.packageName) {
        throw new Error(
            `Expected ${definition.packageName} at ${packageRoot}, but its package manifest identifies as ${String(manifest.name)}`
        )
    }
    if (typeof manifest.version !== "string") {
        throw new Error(`${definition.packageName} at ${packageRoot} does not declare a valid version`)
    }
    if (!satisfies(manifest.version, definition.range)) {
        throw new Error(
            `${definition.packageName} ${manifest.version} is incompatible with WebAnvil; supported versions are ${definition.range}`
        )
    }

    const importPackage = async <T>(subpath?: string): Promise<T> => {
        const specifier =
            subpath === undefined || subpath === ""
                ? definition.packageName
                : `${definition.packageName}/${normalizeSubpath(subpath)}`
        const entry = await resolveModulePath(specifier, {
            conditions: ["node", "import", "default"],
            url: pathToFileURL(manifestPath)
        })
        return import(pathToFileURL(entry).href) as Promise<T>
    }

    return {
        name,
        packageName: definition.packageName,
        version: manifest.version,
        source,
        packageRoot,
        import: importPackage,
        executable: await resolveExecutable(definition, manifest, packageRoot)
    }
}

export class Toolchain {
    readonly cwd: string
    readonly #tools = new Map<ToolName, Promise<ResolvedTool>>()
    readonly #optionalTools = new Map<OptionalToolName, Promise<ResolvedTool | undefined>>()

    constructor(cwd = process.cwd()) {
        this.cwd = resolve(cwd)
    }

    resolve(name: ToolName): Promise<ResolvedTool> {
        const existing = this.#tools.get(name)
        if (existing !== undefined) return existing

        const selected = this.#resolve(name)
        this.#tools.set(name, selected)
        return selected
    }

    resolveOptional(name: OptionalToolName): Promise<ResolvedTool | undefined> {
        const existing = this.#optionalTools.get(name)
        if (existing !== undefined) return existing

        const selected = this.#resolveOptional(name)
        this.#optionalTools.set(name, selected)
        return selected
    }

    async #resolve(name: ToolName): Promise<ResolvedTool> {
        const definition: ToolDefinition = supportedTools[name]
        const declaration =
            definition.allowProjectOverride === false
                ? undefined
                : await findDeclaration(this.cwd, definition.packageName)
        if (declaration !== undefined) {
            return loadResolvedTool(name, definition, declaration.directory, "project")
        }
        const webanvilPackageRoot = dirname(await findContainingManifest(fileURLToPath(import.meta.url)))
        return loadResolvedTool(name, definition, webanvilPackageRoot, "webanvil")
    }

    async #resolveOptional(name: OptionalToolName): Promise<ResolvedTool | undefined> {
        const definition: ToolDefinition = optionalTools[name]
        const declaration = await findDeclaration(this.cwd, definition.packageName)
        if (declaration === undefined) return
        return loadResolvedTool(name, definition, declaration.directory, "project")
    }
}

export const resolveTool = (name: ToolName, cwd = process.cwd()): Promise<ResolvedTool> =>
    new Toolchain(cwd).resolve(name)

export const resolveOptionalTool = (name: OptionalToolName, cwd = process.cwd()): Promise<ResolvedTool | undefined> =>
    new Toolchain(cwd).resolveOptional(name)

export const formatResolvedTool = (tool: ResolvedTool): string => `${tool.packageName} ${tool.version} (${tool.source})`
