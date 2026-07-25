import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const binary = fileURLToPath(new URL("../bin/webanvil", import.meta.url))

describe("CLI help", () => {
    it.each(["build", "dev"])(
        "describes Node public roots and the reachable unbundled graph for %s",
        async (command) => {
            const { stdout } = await execFileAsync(binary, [command, "--help"])

            expect(stdout).toContain(
                "Web entry or Node public root; unbundled Node builds emit its reachable graph with preserveModules."
            )
            expect(stdout).toContain(
                "Bundle the Node public roots; without it, emit their reachable graph with preserveModules."
            )
            expect(stdout).toContain(
                "Emit the reachable Node graph with preserveModules, overriding configuration that enables bundling."
            )
            expect(stdout).not.toContain("source-tree anchor")
            expect(stdout).not.toContain("source module tree")
        }
    )
})
