import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * scripts/build.mjs — 构建 dsh-brain-compaction。
 * - src/host/*.ts → lib/index.js（esbuild 打包, 外部化 @deepseek-ai/* / dsh-*）
 * - src/client.js  → lib/client.js（逐字复制：浏览器 factory 不做任何转换）
 * 依赖 esbuild, 经部署根 node_modules 解析（.plugins/node_modules 链）。
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'lib'), { recursive: true })

await build({
  entryPoints: [join(root, 'src/host/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: join(root, 'lib/index.js'),
  sourcemap: true,
  logLevel: 'info',
  external: ['@deepseek-ai/*', 'dsh-*', '@wanyantiande/*', 'node:*'],
})
copyFileSync(join(root, 'src/client.js'), join(root, 'lib/client.js'))
console.log('[dsh-brain-compaction] built lib/index.js + lib/client.js')
