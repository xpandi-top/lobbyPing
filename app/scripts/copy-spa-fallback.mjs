import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')

await copyFile(
  resolve(appRoot, 'dist', 'index.html'),
  resolve(appRoot, 'dist', '404.html')
)
