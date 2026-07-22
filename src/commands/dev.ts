import { defineCommand } from 'cmdore'

export const dev = (): void => {
  console.log('dev')
}

export default defineCommand({
  name: 'dev',
  run: dev,
})
