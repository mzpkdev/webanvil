import { decorateGreeting } from "./feature"

export const greet = (name: string): string => decorateGreeting(`Hello, ${name}!`)
