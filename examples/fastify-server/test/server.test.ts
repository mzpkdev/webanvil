import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"

import { createServer } from "../src/server"

let server: FastifyInstance | undefined

afterEach(async () => {
    await server?.close()
    server = undefined
})

describe("Fastify server", () => {
    it("responds to health checks", async () => {
        server = createServer()

        const response = await server.inject({ method: "GET", url: "/health" })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ status: "ok" })
    })

    it("renders the welcome template", async () => {
        server = createServer()

        const response = await server.inject({ method: "GET", url: "/welcome" })

        expect(response.statusCode).toBe(200)
        expect(response.body).toBe("Welcome to WebAnvil!\n")
    })
})
