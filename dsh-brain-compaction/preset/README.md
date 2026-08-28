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
