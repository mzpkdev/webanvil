import { defineCommand } from "cmdore"
import { loadWebanvilConfig } from "../config"
import { filter } from "../options"
import { exec, execWebanvilIn, getPassthrough, resolveTurboConfig } from "../tools"
import { findWorkspaceRoot, workspacePackages } from "../workspace"

/** Webanvil commands that run across a workspace with no required arguments. `build`/`bundle` need an
 *  entry and `dev`/`preview` are long-lived servers, so they are not auto-run in scriptless
 *  packages. */
const WORKSPACE_TASKS = new Set(["test", "typecheck", "lint", "format", "clean"])

/** Basic package-name match for the direct-run path: no filter matches all; otherwise an exact
 *  name, the bare last segment, or a "*" glob. Turbo's richer filter grammar governs only the
 *  turbo path. */
const matchesFilter = (name: string, filter?: string): boolean => {
    if (!filter) {
        return true
    }
    if (filter.includes("*")) {
        const pattern = filter.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
        return new RegExp(`^${pattern}$`).test(name)
    }
    return name === filter || name.split("/").pop() === filter
}

export const runCommand = defineCommand({
    name: "run",
    description: "Run a task across the workspace with caching, via Turborepo",
    examples: ["build --filter web", "test -- --coverage"],
    arguments: [
        { name: "task", description: "Task (a package.json script, or a webanvil command) to run", required: true }
    ],
    options: [filter],
    run: async ({ task, filter }) => {
        const { tasks } = await loadWebanvilConfig()
        await resolveTurboConfig(tasks)
        const forwarded = getPassthrough()

        const turboArgs = ["run", task]
        if (filter) {
            turboArgs.push("--filter", filter)
        }
        if (forwarded.length > 0) {
            turboArgs.push("--", ...forwarded)
        }

        // Outside a workspace, delegate wholesale to turbo exactly as before.
        const root = findWorkspaceRoot()
        if (!root) {
            await exec("turbo")(turboArgs)
            return
        }

        const packages = workspacePackages(root)
        // Turbo runs the packages that declare the script (cached, ^dependsOn). Invoke it only
        // when at least one does, to skip an empty, confusing `turbo run` when none match.
        if (packages.some((pkg) => pkg.scripts[task])) {
            await exec("turbo")(turboArgs)
        }

        // Cover the packages turbo skipped by running `webanvil <task>` in each, when the task is one
        // webanvil can run without arguments. These run uncached and outside turbo's dependency order.
        if (!WORKSPACE_TASKS.has(task)) {
            return
        }
        const missing = packages.filter((pkg) => !pkg.scripts[task] && matchesFilter(pkg.name, filter))
        for (const pkg of missing) {
            await execWebanvilIn(pkg.dir, forwarded.length > 0 ? [task, "--", ...forwarded] : [task])
        }
    }
})
