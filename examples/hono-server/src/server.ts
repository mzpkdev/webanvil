import { Hono } from "hono"

export const app: Hono = new Hono()

app.get("/health", (context) => context.json({ status: "ok" }))
