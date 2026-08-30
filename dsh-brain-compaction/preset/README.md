# preset/ — `人脑式上下文压缩` Agent 预设（随仓库分发）

复制本目录到 `$DSH_HOME/.agent-presets/brain-compaction/`（Windows 示例：
`D:\DeepSeekHarness\.dsh\.agent-presets\brain-compaction\`），重启 dsh web 后
在预设选择器中即可看到「人脑式上下文压缩」。

- `agent.cordis.yml` 由「标准模式」预设派生：persona 追加了压缩纪律提示词；
  `compaction` 隔离组内的引擎行已替换为 `dsh-argp`（会话级引擎）。
- 若你的部署标准模式构成不同（dsh 版本升级），建议在 dsh web 的预设管理里
  用「复制」重新派生，再按本文件差异手动合并（主要改动点：persona 文本 +
  compaction 组的 `compaction-basic` → `dsh-argp` 行）。
- 预设 ID `brain-compaction` 在本机唯一时直接可用；重名请改目录名与
  `preset.yml`（目录名即 ID）。
- 预设 ID `brain-compaction` 在本机唯一时直接可用；重名请改目录名与
  `preset.yml`（目录名即 ID）。

## routing-suite/ — dsh-routing-suite 原生智能路由模式（可选, MIT）

来自 npm 包 `dsh-routing-suite@0.1.2` 的官方预设（源自 DSH 标准模式, MIT 许可,
归属见 https://github.com/dragonbaba/dsh-routing-suite）。把它复制到
`$DSH_HOME/.agent-presets/routing-suite/` 后, 仅当会话预设 id 恰为 `routing-suite`
时, 路由插件的 host 层才会按首条用户任务注入一句路由引导（0 次额外 LLM 调用）。
`brain-compaction` 预设已内嵌同一套 We-Need 纪律（任何首任务常驻生效）,
两者任选其一, 不要同时宣传; 若同时启用两者也在功能上不冲突（引导措辞相近）。

## 发布注意

`agent.cordis.yml` 由 DSH 标准模式预设派生, 直接分发的是某一版本快照;
不同 dsh 版本的标准模式构成可能有差异, 文档内给出手动合并差异的要点。
