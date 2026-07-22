import { fileURLToPath } from "node:url"

import Fastify from "fastify"

export const createServer = () => {
    const server = Fastify()

    server.get("/health", () => ({ status: "ok" }))

    return server
}

export const start = async () => {
    const server = createServer()

    await server.listen({ host: "0.0.0.0", port: 3000 })
    return server
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await start()
