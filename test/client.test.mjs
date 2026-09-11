/**
 * test/client.test.mjs — 浏览器半区烟雾测试（无需浏览器）。
 *
 * 为什么需要它：0.1.5 的客户端模块表（`@deepseek-ai/dsh-client-web` 的
 * PLATFORM_MODULES / seed.ts）发生了**收窄**：
 *   react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
 *   @deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots,
 *   @deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-dockkit
 * 旧写法 `require("@deepseek-ai/dsh-client-runtime/client")` 在 0.1.5 上必然抛
 * "require(...) missed the module table"，而且整个 factory 是在
 * `materialize()` 里同步求值的——一抛就把**卡片连同 CSS 一起**丢掉，
 * 浏览器控制台之外没有任何提示。本测试用桩 require 真的把 factory 跑一遍，
 * 断言：
 *   1. lib/client.js 以正确的 ModuleLoader id 注册；
 *   2. factory 可同步执行（0.1.5 的 require 词表全部命中）；
 *   3. 只从平台 seed 词表里 require（不碰已删除的 dsh-client-runtime）;
 *   4. inject 声明的服务都是 0.1.5 真实存在的客户端服务；
 *   5. 注册进 settings.plugin.item，且 key 与 Host 端 settings namespace 一致。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const failures = []
let checks = 0
const ok = (name) => { checks += 1; console.log(`PASS  ${name}`) }
const bad = (name, detail) => { checks += 1; failures.push(`${name}: ${detail}`); console.error(`FAIL  ${name}: ${detail}`) }

// ── 0.1.5 浏览器模块表（平台 seed 词）──────────────────────────────────
const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

// ── 0.1.5 客户端服务面 ─────────────────────────────────────────────────
const CLIENT_SERVICES = new Set([
  'slots', 'locale', 'settingsScope', 'remote', 'connection', 'uiRenderer',
  'resources', 'titleBar', 'inputTrigger', 'conversation', 'sessionList',
])

const source = readFileSync(resolve('lib/client.js'), 'utf8')

// ── 1. ModuleLoader 注册 id ────────────────────────────────────────────
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(entry) { registration = entry },
  },
}

// ── 2. 桩 require（严格按平台词表裁决）────────────────────────────────
const requested = []
const createSnapshotStoreCalls = []
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
}
const stubStore = {
  createSnapshotStore: (init, opts) => {
    createSnapshotStoreCalls.push({ init, opts })
    return {
      getSnapshot: () => init,
      subscribe: () => () => {},
      set: () => {},
      update: () => {},
    }
  },
}
const SEED = {
  'react': stubReact,
  'react/jsx-runtime': {},
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/cordis': {},
  '@deepseek-ai/dsh-client-store': stubStore,
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-primitives': {},
  '@deepseek-ai/dsh-client-ui-dockkit': {},
}

function stubRequire(spec) {
  requested.push(spec)
  if (!PLATFORM_MODULES.has(spec)) {
    throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory`)
  }
  return SEED[spec]
}

try {
  // 求值 lib/client.js：它应当自己完成 load() 注册。
  const run = new Function('window', 'document', 'structuredClone', source)
  run(globalThis.window, undefined, (v) => v)
  if (registration === undefined) {
    bad('ModuleLoader 注册', 'lib/client.js 执行后没有调用 window.__ModuleLoader__.load')
  } else {
    registration.id === 'dsh-brain-compaction'
      ? ok('ModuleLoader id = dsh-brain-compaction（与包名一致）')
      : bad('ModuleLoader id', `id=${JSON.stringify(registration.id)}`)
    typeof registration.factory === 'function'
      ? ok('factory 是函数（惰性 CJS）')
      : bad('factory', typeof registration.factory)
  }
} catch (error) {
  bad('lib/client.js 求值', error instanceof Error ? error.message : String(error))
}

// ── 3. factory 同步执行（0.1.5 require 词表）────────────────────────────
let exports
if (registration?.factory !== undefined) {
  try {
    exports = registration.factory(stubRequire)
    ok('factory 同步执行成功（require 全部命中 0.1.5 平台词表）')
  } catch (error) {
    bad('factory 执行', error instanceof Error ? error.message : String(error))
  }
}

requested.includes('@deepseek-ai/dsh-client-store')
  ? ok('从 @deepseek-ai/dsh-client-store 取 createSnapshotStore（0.1.5 平台词）')
  : bad('client-store require', `实际 require: ${requested.join(', ') || '(无)'}`)
requested.some(spec => spec.startsWith('@deepseek-ai/dsh-client-runtime'))
  ? bad('已删除的模块', '仍在 require @deepseek-ai/dsh-client-runtime（0.1.5 已不存在）')
  : ok('不再 require 已删除的 @deepseek-ai/dsh-client-runtime')

// ── 4. exports.inject 的服务存在 ────────────────────────────────────────
const declared = Array.isArray(exports?.inject) ? exports.inject : []
declared.length > 0
  ? ok(`exports.inject 已声明（${declared.join(', ')}）`)
  : bad('exports.inject', '未声明任何服务')
for (const service of declared) {
  CLIENT_SERVICES.has(service)
    ? ok(`inject 服务存在: ${service}`)
    : bad('inject 服务', `${service} 不在 0.1.5 客户端服务面`)
}
declared.includes('settingsScope')
  ? ok('声明 settingsScope（卡片读写配置必需）')
  : bad('settingsScope', '未声明 settingsScope')

// ── 5. 面板注册契约 ────────────────────────────────────────────────────
if (typeof exports?.apply === 'function') {
  const slotRegistrations = []
  const styleTags = []
  const localeRegistrations = []
  const fakeCtx = {
    locale: {
      bind: () => (key) => key,
      register: (ns, dict) => { localeRegistrations.push({ ns, dict }); return () => {} },
    },
    settingsScope: {
      bind: (spec) => {
        createSnapshotStoreCalls.push({ scope: spec })
        return {
          getSnapshot: () => ({ status: 'ready', writable: true, value: {}, base: {}, user: {} }),
          subscribe: () => () => {},
          set: () => Promise.resolve(),
          unset: () => Promise.resolve(),
          mutate: () => Promise.resolve(),
        }
      },
    },
    slots: {
      register: (options, component) => { slotRegistrations.push({ options, component }); return () => {} },
      // 真实契约：inject(name, generator) —— 生成器被驱动时才算注册。
      inject: (name, fn) => {
        const produced = fn()
        if (produced !== undefined && typeof produced[Symbol.iterator] === 'function') {
          for (const entry of produced) slotRegistrations.push({ options: entry?.options ?? entry, component: entry?.component })
        }
        return () => {}
      },
    },
    effect: (fn) => { fn(); return () => {} },
  }
  // 浏览器侧 document 桩：只记录 <style> 注入，不触碰真实 DOM。
  const fakeDocument = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag) => { styleTags.push(tag) } },
  }
  const runFactoryAgain = () => {
    const holder = {}
    globalThis.window.__ModuleLoader__ = { load: (entry) => { holder.entry = entry } }
    const run = new Function('window', 'document', 'structuredClone', source)
    run(globalThis.window, fakeDocument, (v) => v)
    return holder.entry.factory(stubRequire)
  }
  try {
    const fresh = runFactoryAgain()
    fresh.apply(fakeCtx)
    ok('apply 可在 0.1.5 客户端服务面上执行')
    const panel = slotRegistrations.find(r => r.options?.name === 'settings.plugin.item')
    if (panel === undefined) {
      bad('settings.plugin.item', '未注册进插件配置页插槽（卡片不会出现）')
    } else {
      ok('已注册进 settings.plugin.item 插槽')
      panel.options.key === 'brain-compaction'
        ? ok('卡片 key = brain-compaction（与 Host settings namespace 对齐）')
        : bad('卡片 key', `key=${JSON.stringify(panel.options.key)}（tab-store 只渲染 key ∩ Host 已服务 namespace 的交集）`)
      typeof panel.component === 'function'
        ? ok('卡片组件是函数组件')
        : bad('卡片组件', typeof panel.component)
    }
    styleTags.length > 0
      ? ok(`样式随 factory 注入（${styleTags.length} 个 <style>）`)
      : bad('样式注入', '未注入任何 style（卡片会裸奔）')
    localeRegistrations.some(r => r.ns === 'brain-compaction')
      ? ok('locale 字典已注册（zh + en）')
      : bad('locale 注册', '未注册 brain-compaction 字典')
  } catch (error) {
    bad('apply 执行', error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
  }
} else {
  bad('exports.apply', '未导出 apply（客户端插件契约）')
}

// ── 汇总 ────────────────────────────────────────────────────────────────
console.log(`\n${checks - failures.length}/${checks} 客户端检查通过`)
if (failures.length > 0) {
  console.error('\n客户端失败:')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}
