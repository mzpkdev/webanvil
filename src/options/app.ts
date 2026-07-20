import { defineOption } from "cmdore"

export const app = defineOption({
    name: "app",
    arity: 0,
    description: "Build a web app (vite build) instead of a library"
})
