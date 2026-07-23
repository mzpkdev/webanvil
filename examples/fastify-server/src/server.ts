import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { FastifyInstance } from "fastify"
import Fastify from "fastify"

export const createServer = (): FastifyInstance => {
    const server = Fastify()

    server.get("/health", () => ({ status: "ok" }))
    server.get("/welcome", async (_request, reply) => {
        const template = await readFile(new URL("./templates/welcome.txt", import.meta.url), "utf8")
        return reply.type("text/plain").send(template)
    })

    return server
}

export const start = async (): Promise<FastifyInstance> => {
    const server = createServer()

    await server.listen({ host: "0.0.0.0", port: 3000 })
    return server
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void start()
