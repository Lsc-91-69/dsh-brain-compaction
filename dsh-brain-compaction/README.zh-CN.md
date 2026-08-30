# 人脑式上下文压缩逻辑 · dsh-brain-compaction

一个 DeepSeek Harness 插件（Cordis bundle）。它不是"Hell World 依赖收集器"，而是把
社区里七个人脑式上下文压缩方向的插件**组装成一个统一、协同、可验证的体系**：

| 组件 | 工具（命名空间） | 默认 | 行 id |
|---|---|---|---|
| dsh-argp（原子引用图剪枝 · 0-LLM · 选择性遗忘） | `recall_pruned` / `list_pruned` / `recall` | ✅ 启用 | `dsh-argp` |
| dsh-compaction-instant（VCC 式近无损即时压缩） | `recall` / `search` | ⬜ 禁用（备选引擎） | `brain-compaction-instant` (+`brain-tool-recall`/`brain-command-recall`) |
| @wanyantiande/dsh-headroom（工具输出压缩 + CCR 可逆存储） | `headroom_retrieve` | ⬜ 禁用（需本地代理） | `brain-headroom` |
| dsh-memory-vault（跨会话记忆库） | `memory_remember` / `memory_recall` / `memory_forget` | ✅ 启用 | `brain-memory-vault` |
| dsh-sgme（拾光记忆引擎·多智能体共享） | `memory_search` `wiki_*` `signal_*` `role_*` 等 18 个 | ⬜ 禁用（需原厂网关） | `brain-sgme` |
| dsh-mcp-lens（MCP 工具懒加载） | `mcp_search` / `mcp_call` | ✅ 启用（零服务器） | `brain-mcp-lens` |
| dsh-routing-suite（智能路由 "We Need" 思维链, 0 额外 LLM 调用） | 无模型工具；assemble 注入引导段 + 只读状态 API | ✅ 启用 | `brain-routing-suite` |
| dsh-context-doctor（注入物 token 审计） | `context_audit` | ⬜ 可选（GitHub-only） | `context-doctor` |
| **统一层（本插件）** | `brain_status` / `brain_verify` / `brain_recall` | ✅ | `dsh-brain-compaction` |

## 深度融合 = 组合 + 协调，而不是依赖

- **组装**：`cordis.patch.yml` 用 Cordis 组合机制（insert 行、包名引用、disabled 覆盖）
  把全部组件行一次装入 profile 组合树；profile 用 `nodeLinker: hoisted`，所以子插件
  作为本 bundle 的 `dependencies` 可被 loader 直接按行名解析（无需逐个 `dsh plugin add`）。
- **协调**：`src/host/integration.ts` 运行时零 import 探测——工具注册表
  (`ctx.tools.schemas()`)、服务 (`ctx.get('compaction')` / `tokenMeter`)、引擎类名
  判定当前激活引擎；任何组件缺失/禁用都优雅降级，不会崩。
- **互斥仲裁**：`ctx.compaction` 每上下文只允许一个实现。argp 与 instant 都会注册
  工具 `recall`（重名即抛错），因此 patch 里**恰好一个引擎行启用**（默认 argp）；
  `brain_verify` 会校验这一点。
- **统一面板**：Settings → Plugins → 人脑式上下文压缩。一张卡片绑定多个 settings
  namespace（本插件 + compaction-instant + headroom），哪些在场就渲染哪些小节；
  写入仍走各插件原生 scope（schema 校验 + live 生效）。
- **路由思维链（We-Need）**：`dsh-routing-suite` 是 host 行——**0 次额外 LLM 调用**,
  用正则对首条用户任务分类（修复/排查/审查→检查优先；新建/实现→直接执行并验证）,
  仅在预设 id 恰为 `routing-suite` 的会话注入一句约 90 字符的引导。深度融合 =
  本插件用自研 id `brain-routing-suite` 挂载它（状态 API/策略面可用）, 且把同一套
  We-Need 纪律**固化进 brain 预设的 persona**（任何首任务常驻生效, 不依赖 id 判断）。
  token 节省的真实机理：直接任务免去无谓探索, 维护任务避免跳过根因——减少返工轮次
  与上下文生长; 它不改变注入物的常驻成本, 请勿夸大。
  若你在此前单独安装过 dsh-routing-suite, 请先移除独立 bundle 再使用本插件的组装。

## 安装

```sh
# 构建产物已随包; 用 file: 规格安装（link: 不安装本包的子插件依赖, 组装行会解析失败）
dsh plugin --profile web add "file:D:/deepseek-harness/.plugins/dsh-brain-compaction"
# 重启 dsh web（dsh web 停掉再起, 或使用 GUI 的重启控件）
```

开发迭代时可临时用 `link:` 安装并自行 `pnpm install` 子依赖。

可选组件（Context Doctor，GitHub-only 未发布 npm）：

```sh
dsh plugin --profile web add "github:Zhenyu98/dsh-context-doctor#main"
```

## 从 GitHub 安装与分发（给别人用时）

```sh
# 别人/另一台机器（按需加 #v1.0.0 固定版本）
dsh plugin --profile web add "github:<你的用户名>/dsh-brain-compaction"
# 重启 dsh web
```

- 仓库**必须提交 `lib/`**（构建产物）——GitHub 安装直接按仓库内容安装，不跑构建；
  `test/contract.test.mjs` 的 5d 项会检查它。
- 安装即自动拉取 6 个子插件依赖（npm 版本，`nodeLinker: hoisted` 下按行名可解析）；
  不要额外 `dsh plugin add` 任一子插件，避免行 id 重复。
- 请用 `file:` 而非 `link:` 规格安装本机开发副本（`link:` 不安装子插件依赖）。
- 发布前跑一遍 `npm run verify`（构建 + 15 项契约测试，含可分发性回归断言）。

**Agent 预设一起分发**：本仓库 `preset/` 内是已验证的「人脑式上下文压缩」预设
（persona 压缩纪律 + 会话级 argp 引擎行），复制到 `$DSH_HOME/.agent-presets/brain-compaction/`
即可在预设选择器中见到；详见 `preset/README.md`。

**发布清单**：`git init` 后提交全部（`node_modules/` 已被 .gitignore 排除，
`lib/`、`preset/`、`src/`、`scripts/`、`test/`、`cordis.patch.yml`、README、
LICENSE 都提交），打 tag `v1.0.0`，然后 `dsh plugin add github:<你>/dsh-brain-compaction#v1.0.0`。

重启后新会话里让模型调用 `brain_verify`——组件矩阵 PASS / SKIP / FAIL + token 快照
+ 最近压缩历史 + context_audit 接入点，即验证完成。

## 引擎切换（argp ↔ instant ↔ headroom）

编辑插件的 `cordis.patch.yml`（或你自己的 profile patch 覆盖它）：把当前启用引擎行
加 `disabled: true`，把目标引擎行去掉 `disabled`（instant 还要同时启用
`brain-tool-recall` / `brain-command-recall`），重启。参考文件内注释。

**会话级引擎**：`人脑式上下文压缩` 预设（agent.cordis.yml 的 `compaction` 组）把引擎行
直接放在会话 realm 内（默认 `dsh-argp`）——**该行才是 brain 预设会话真正使用的
压缩引擎**；host 层的引擎行服务于不带压缩组的预设。切换时两处要保持一致（同理把
预设组内的 `compaction-basic` 换成 `dsh-argp`，该预设已替你做）。

## 验证机制（压缩前后 Token 对比）

1. 会话中调用 `brain_verify`（summary）：得到引擎状态 + 组件矩阵 + 当前 token + 最近
   `compaction/summary` 事件叶子字段（shadowed/checkpoint 前后数值）。
2. 若已装 Context Doctor：调用 `context_audit`，得到 AGENTS.md 指令链 / 技能目录 /
   工具 schema / MCP 工具面的逐项 token 成本、重复与冲突（常驻注入物，压缩不降低
   这部分；真正被压缩的是会话历史）。
3. 连续两次手动压缩（`/compact`）后再次 `brain_verify`：比较两次
   `sessionTokens` 与 `compaction/computation` 差值——即压缩前后 Token 对比。
4. `brain_status` 任意时刻快照；`brain_recall(seq|query)` 统一召回被剪内容。
5. 自带契约测试 `node test/contract.test.mjs`：行可解析性 / compaction-basic 禁用 /
   引擎互斥 / 面板 id 一致性（15 项，`npm run test`）。

## 配置矩阵

| 参数 | 层 | 调整方式 |
|---|---|---|
| 引擎选择（argp/instant/headroom） | 组合 | `cordis.patch.yml`（改 disabled，重启） |
| argp maxPasses / recencyGuard | 组合 | 行 `config`（本插件的 patch 默认 256/10） |
| instant thresholdRatio/retainTurns/retainTokens/auto/checkpointCap | 运行时 | 统一面板 / settings `compaction-instant` |
| headroom 压缩开关/阈值/代理参数 | 运行时 | 统一面板（headroom 启用后）/ settings `headroom` |
| 本插件 selfTestAfterBoot / verifyDetail | 运行时 | 统一面板 / settings `brain-compaction` |
| sgme baseUrl/agentKey/…（网关） | 组合 | 行 `config` + 环境变量（patch 注释） |
| vault injectLimit/recallLimit | 组合 | 行 `config`（默认 8/10） |
| mcp-lens servers/allowTools/denyTools | 组合 | 行 `config`（默认空, fail-closed） |
| context-doctor defaultCwd/cacheTtlMs | 组合 | 其自身 patch |

## 目录结构

```
src/host/index.ts       插件入口（apply：settings 注册、工具注册、事件监听、boot 自检）
src/host/config.ts      unified config（brain-compaction namespace + schema）
src/host/integration.ts 组件矩阵/引擎仲裁/验证报告/统一召回（运行时探测, 零 import 耦合）
src/client.js           统一配置面板（逐字发布, ModuleLoader factory）
cordis.patch.yml        组装：组件行 + 引擎互斥 + compaction-basic 禁用
scripts/build.mjs       esbuild 打包（src/host/*.ts → lib/*）
test/contract.test.mjs  契约测试
```

## 开发

```sh
npm run build   # esbuild 打包 host + 逐字复制 client（需要 esbuild 可解析）
npm run test    # 契约测试（15 项）
```

## 常见问题

- **启动报 `tool "recall" is already registered`**：argp 与 instant 同时启用了——把
  引擎互斥恢复到一个启用。
- **启动报行 id 重复**：之前单独 `dsh plugin add` 过子插件——先 `dsh plugin --profile
  web remove dsh-argp` 等，再保留本 bundle 的组装。
- **brain_verify 引擎 FAIL**：profile 的 `cordis.patch.yml` 里 compaction-basic 行被
  其它层重新启用，或被 argp 之外的东西抢占。
- **面板里某小节不见**：对应子插件行处于 disabled（默认禁用项见上表），先启用再重启。

## 许可证

MIT；子插件各自遵循其原始许可证（dsh-argp MIT、dsh-compaction-instant MIT、
dsh-memory-vault MIT、@wanyantiande/dsh-headroom MIT、dsh-mcp-lens MIT(EULA 见包内)、
dsh-sgme MIT、dsh-context-doctor BSD-3-Clause）。
