import { commands, metadata } from "./index"

describe("webanvil", () => {
    context("command registry", () => {
        it("exposes the scaffolded commands in order", () => {
            expect(commands.map((command) => command.name)).toEqual([
                "init",
                "build",
                "bundle",
                "dev",
                "serve",
                "preview",
                "test",
                "typecheck",
                "lint",
                "format",
                "run",
                "clean"
            ])
        })

        it("gives every command a run handler and a description", () => {
            for (const command of commands) {
                expect(typeof command.run).toBe("function")
                expect(command.description).toBeTruthy()
            }
        })

        it("names the program webanvil", () => {
            expect(metadata.name).toBe("webanvil")
        })
    })
})
