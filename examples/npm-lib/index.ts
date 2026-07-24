import { decorateGreeting } from "./src/internal/implementation"

export const greet = (name: string): string => decorateGreeting(`Hello, ${name}!`)
