/**
 * scripts/build.mjs — 构建 dsh-brain-compaction。
 * - src/host/*.ts → lib/index.js（esbuild 打包, 外部化 @deepseek-ai/* / dsh-*）
 * - src/client.js  → lib/client.js（逐字复制：浏览器 factory 不做任何转换）
 *
 * 依赖 esbuild, 经部署根 node_modules 解析（.plugins/node_modules 链）。
 *
 * 双重路径说明：esbuild 的 JS API 通过 stdio **管道**拉起子进程服务。某些受限
 * 执行环境（例如 DSH 自身的文件沙箱）禁止打开命名管道，`import('esbuild')`
 * 之后调用 build() 会抛 `Error: spawn EPERM`。这不是配置错误，而是环境边界，
 * 因此这里在 EPERM 时回落到 esbuild 官方 CLI 二进制（原生进程、无管道），
 * 打包参数与 API 路径逐字一致，产物完全相同。
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = join(root, 'lib/index.js')
const entry = join(root, 'src/host/index.ts')
mkdirSync(join(root, 'lib'), { recursive: true })

/** 打包参数（API 与 CLI 两条路径共用，保证产物一致）。 */
const externals = ['@deepseek-ai/*', 'dsh-*', '@wanyantiande/*', 'node:*']

/** 定位 esbuild 官方 CLI 二进制（安装时按平台落到 @esbuild/<platform>）。 */
function findEsbuildBinary() {
  const candidates = [
    join(root, 'node_modules', '@esbuild', `win32-${process.arch}`, 'esbuild.exe'),
    join(root, 'node_modules', '@esbuild', `win32-${process.arch}`, 'esbuild'),
    join(root, 'node_modules', '@esbuild', `linux-${process.arch}`, 'bin', 'esbuild'),
    join(root, 'node_modules', '@esbuild', `darwin-${process.arch}`, 'bin', 'esbuild'),
  ]
  return candidates.find(candidate => existsSync(candidate))
}

/** 回落到 CLI 二进制（无 stdio 管道）。 */
async function buildViaCli(reason) {
  const binary = findEsbuildBinary()
  if (binary === undefined) {
    throw new Error(
      `esbuild JS API 不可用（${reason}），且找不到平台 CLI 二进制；`
      + '请用 `npm install --force esbuild` 安装完整依赖（不要加 --omit=optional，'
      + 'esbuild 的二进制就在 optionalDependencies 里）',
    )
  }
  const result = spawnSync(binary, [
    entry,
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--target=node22',
    `--outfile=${outfile}`,
    '--sourcemap',
    ...externals.flatMap(name => [`--external:${name}`]),
  ], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`esbuild CLI 失败（exit ${String(result.status)}）`)
  console.log(`[dsh-brain-compaction] built via esbuild CLI（${reason}）`)
}

let built = false
try {
  const { build } = await import('esbuild')
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile,
    sourcemap: true,
    logLevel: 'info',
    external: externals,
  })
  built = true
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const code = error?.code ?? error?.cause?.code
  if (code !== 'EPERM' && !/EPERM|spawn/i.test(message)) {
    throw new Error(`esbuild 构建失败：${message}`)
  }
  await buildViaCli(`spawn EPERM: ${message}`)
  built = true
}

if (!built) throw new Error('构建未产出 lib/index.js')

copyFileSync(join(root, 'src/client.js'), join(root, 'lib/client.js'))
console.log('[dsh-brain-compaction] built lib/index.js + lib/client.js')
