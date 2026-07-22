import { defineCommand } from 'cmdore'

export const build = (): void => {
  console.log('build')
}

export default defineCommand({
  name: 'build',
  run: build,
})
