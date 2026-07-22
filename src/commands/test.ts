import { defineCommand } from "cmdore"
import { startVitest } from "vitest/node"

export const test = async (): Promise<void> => {
    const vitest = await startVitest("test", [], { passWithNoTests: true, run: true })
    const failed =
        vitest.state.getFiles().some((file) => file.result?.state === "fail") ||
        vitest.state.getUnhandledErrors().length > 0

    await vitest.close()

    if (failed) throw new Error("Tests failed")
}

export default defineCommand({
    name: "test",
    run: test
})
