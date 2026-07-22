import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { beforeAll, describe, it } from "vitest"

const execFileAsync = promisify(execFile)
const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const root = fileURLToPath(new URL("..", import.meta.url))
const example = fileURLToPath(new URL("../examples/wc-spa", import.meta.url))

const runNpm = async (cwd: string, ...args: string[]): Promise<void> => {
    await execFileAsync(npm, args, { cwd })
}

describe("wc-spa", () => {
    beforeAll(async () => {
        await runNpm(example, "ci")
        await runNpm(root, "run", "build")
    }, 60_000)

    it("tests and builds with wa", async () => {
        await runNpm(example, "run", "test")
        await runNpm(example, "run", "build")
    }, 60_000)
})
