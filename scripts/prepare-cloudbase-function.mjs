import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'apps/api/dist')
const target = resolve(root, 'functions/zkgl-api')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, resolve(target, 'dist'), { recursive: true })
await writeFile(resolve(target, 'index.js'), "export { main } from './dist/cloud-function.js'\n", 'utf8')
await writeFile(resolve(target, 'package.json'), JSON.stringify({
  name: 'zkgl-api-cloud-function', version: '0.1.0', private: true, type: 'module', main: 'index.js',
  engines: { node: '>=18.15.0' }, dependencies: { mysql2: '^3.15.3', zod: '^4.4.3' }
}, null, 2) + '\n', 'utf8')

console.log(`CloudBase function package prepared: ${target}`)
