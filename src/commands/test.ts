import { defineCommand } from 'cmdore'

export const test = (): void => {
  console.log('test')
}

export default defineCommand({
  name: 'test',
  run: test,
})
