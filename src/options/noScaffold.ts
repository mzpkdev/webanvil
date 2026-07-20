import { defineOption } from "cmdore"

export const noScaffold = defineOption({
    name: "no-scaffold",
    arity: 0,
    description: "Skip writing a default tsconfig.json; use a throwaway config instead"
})
