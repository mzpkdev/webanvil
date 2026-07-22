import { describe, expect, it } from "vitest"

import { app } from "../src/server"

describe("Hono server", () => {
    it("returns its health status", async () => {
        const response = await app.request("/health")

        expect(await response.json()).toEqual({ status: "ok" })
    })
})
