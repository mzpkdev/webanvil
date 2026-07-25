import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { execa } from "execa"
import { afterEach, describe, expect, it } from "vitest"

import { build } from "../src/commands/build"

const directories: string[] = []
const initialDirectory = process.cwd()
const typescriptCli = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/typescript/bin/tsc")

const createDirectory = async (prefix: string): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), prefix))
    directories.push(directory)
    return directory
}

afterEach(async () => {
    process.chdir(initialDirectory)
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("Node declaration consumers", () => {
    it("resolves renamed root and subpath declarations under Bundler and NodeNext", async () => {
        const library = await createDirectory("webanvil-declaration-library-")
        await mkdir(join(library, "src", "public"), { recursive: true })
        await mkdir(join(library, "src", "features"), { recursive: true })
        await mkdir(join(library, "src", "shared"), { recursive: true })
        await writeFile(join(library, "src", "shared", "model.ts"), "export interface Model { readonly id: string }\n")
        await writeFile(
            join(library, "src", "public", "root.ts"),
            'import type { Model } from "../shared/model"\n' +
                "export const createModel = (id: string): Model => ({ id })\n" +
                'export type { Model } from "../shared/model"\n'
        )
        await writeFile(
            join(library, "src", "features", "named.ts"),
            'import type { Model } from "../shared/model"\n' +
                "export const modelId = (model: Model): string => model.id\n"
        )
        await writeFile(
            join(library, "tsconfig.json"),
            JSON.stringify({
                compilerOptions: {
                    module: "esnext",
                    moduleResolution: "bundler",
                    strict: true,
                    target: "es2022"
                },
                include: ["src/**/*.ts"]
            })
        )
        process.chdir(library)

        await build("node", "src/public/root.ts", "dist", {
            declaration: true,
            entries: {
                ".": "src/public/root.ts",
                "./feature": "src/features/named.ts"
            },
            formats: ["esm"]
        })

        await writeFile(
            join(library, "package.json"),
            JSON.stringify({
                name: "webanvil-declaration-fixture",
                version: "1.0.0",
                type: "module",
                files: ["dist"],
                exports: {
                    ".": {
                        types: "./dist/index.d.ts",
                        import: "./dist/index.js"
                    },
                    "./feature": {
                        types: "./dist/feature.d.ts",
                        import: "./dist/feature.js"
                    }
                }
            })
        )
        const npmEnvironment = { npm_config_cache: join(library, ".npm-cache") }
        const packed = JSON.parse(
            (await execa("npm", ["pack", "--json"], { cwd: library, env: npmEnvironment })).stdout
        ) as Array<{ filename: string }>
        const tarball = join(library, packed[0]!.filename)

        const consumer = await createDirectory("webanvil-declaration-consumer-")
        await writeFile(
            join(consumer, "package.json"),
            JSON.stringify({ name: "consumer", private: true, type: "module" })
        )
        await execa("npm", ["install", "--ignore-scripts", tarball], {
            cwd: consumer,
            env: npmEnvironment
        })
        await writeFile(
            join(consumer, "index.ts"),
            'import { createModel, type Model } from "webanvil-declaration-fixture"\n' +
                'import { modelId } from "webanvil-declaration-fixture/feature"\n' +
                'const model: Model = createModel("one")\n' +
                "modelId(model)\n"
        )

        for (const [name, compilerOptions] of [
            ["bundler", { module: "esnext", moduleResolution: "bundler" }],
            ["nodenext", { module: "nodenext", moduleResolution: "nodenext" }]
        ] as const) {
            const tsconfig = join(consumer, `tsconfig.${name}.json`)
            await writeFile(
                tsconfig,
                JSON.stringify({
                    compilerOptions: {
                        ...compilerOptions,
                        noEmit: true,
                        skipLibCheck: false,
                        strict: true,
                        target: "es2022"
                    },
                    files: ["index.ts"]
                })
            )
            await expect(
                execa(process.execPath, [typescriptCli, "--project", tsconfig], { cwd: consumer })
            ).resolves.toBeDefined()
        }

        expect(await readFile(join(library, "dist", "index.d.ts"), "utf8")).not.toContain("@/")
        expect(await readFile(join(library, "dist", "feature.d.ts"), "utf8")).not.toContain("@/")
    }, 120_000)
})
