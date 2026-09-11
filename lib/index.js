// src/host/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/host/config.ts
import z from "@deepseek-ai/schemastery";
var BRAIN_NAMESPACE = "brain-compaction";
var BrainSettingsSchema = z.object({
  /** boot 时执行一次集成自检（组件矩阵），缺失组件打 warn。默认 true。 */
  selfTestAfterBoot: z.boolean().default(true),
  /** brain_verify 输出粒度：summary | developer。默认 summary。 */
  verifyDetail: z.union([z.const("summary"), z.const("developer")]).default("summary")
});
var BRAIN_DEFAULTS = {
  selfTestAfterBoot: true,
  verifyDetail: "summary"
};
function resolveBrainSettings(raw) {
  const source = typeof raw === "object" && raw !== null ? raw : {};
  return {
    selfTestAfterBoot: source.selfTestAfterBoot !== false,
    verifyDetail: source.verifyDetail === "developer" ? "developer" : "summary"
  };
}

// src/host/integration.ts
var COMPONENTS = [
  {
    id: "argp",
    label: "dsh-argp \u539F\u5B50\u5F15\u7528\u56FE\u526A\u679D\uFF080-LLM \u538B\u7F29\u5F15\u64CE\uFF09",
    row: "dsh-argp",
    kinds: ["engine"],
    tools: ["recall_pruned", "list_pruned", "recall"],
    defaultOn: true
  },
  {
    id: "instant",
    label: "dsh-compaction-instant \u5373\u65F6\u8FD1\u65E0\u635F\u5F15\u64CE\uFF08VCC \u5F0F\uFF09",
    row: "brain-compaction-instant",
    kinds: ["engine"],
    tools: ["recall", "search"],
    defaultOn: false
  },
  {
    id: "headroom",
    label: "@wanyantiande/dsh-headroom \u5DE5\u5177\u8F93\u51FA\u538B\u7F29 + CCR \u53EF\u9006\u5B58\u50A8",
    row: "brain-headroom",
    kinds: ["engine", "compression"],
    tools: ["headroom_retrieve"],
    defaultOn: false
  },
  {
    id: "vault",
    label: "dsh-memory-vault \u8DE8\u4F1A\u8BDD\u8BB0\u5FC6\u5E93",
    row: "brain-memory-vault",
    kinds: ["memory"],
    tools: ["memory_remember", "memory_recall", "memory_forget"],
    defaultOn: true
  },
  {
    id: "sgme",
    label: "dsh-sgme \u62FE\u5149\u8BB0\u5FC6\u5F15\u64CE\uFF08\u591A\u667A\u80FD\u4F53\u5171\u4EAB\uFF09",
    row: "brain-sgme",
    kinds: ["memory"],
    tools: [
      "memory_search",
      "memory_get",
      "memory_reject",
      "wiki_search",
      "wiki_pages",
      "wiki_page",
      "wiki_page_update",
      "wiki_page_add",
      "signal_pull",
      "signal_claim",
      "signal_ack",
      "idea_add",
      "demand_create",
      "project_register",
      "role_list",
      "role_assemble",
      "role_active_get",
      "role_active_set"
    ],
    defaultOn: false
  },
  {
    id: "lens",
    label: "dsh-mcp-lens MCP \u5DE5\u5177\u61D2\u52A0\u8F7D\uFF082 \u4E2A\u6A21\u578B\u5DE5\u5177\uFF09",
    row: "brain-mcp-lens",
    kinds: ["mcp"],
    tools: ["mcp_search", "mcp_call"],
    defaultOn: true
  },
  {
    id: "doctor",
    label: "dsh-context-doctor \u6CE8\u5165\u5BA1\u8BA1\uFF08context_audit\uFF09",
    row: "context-doctor",
    pkg: "dsh-context-doctor",
    kinds: ["audit"],
    tools: ["context_audit"],
    defaultOn: false,
    external: true
  },
  {
    id: "routing",
    label: 'dsh-routing-suite \u667A\u80FD\u8DEF\u7531\uFF08"We Need" \u601D\u7EF4\u94FE, 0 \u989D\u5916 LLM \u8C03\u7528\uFF09',
    row: "brain-routing-suite",
    pkg: "dsh-routing-suite",
    kinds: ["routing"],
    tools: [],
    defaultOn: true
  }
];
var BRAIN_TOOLS = ["brain_status", "brain_verify", "brain_recall"];
var ENGINE_CLASS_MAP = {
  ArgpGraphEngine: "argp",
  ArgpT1Engine: "argp",
  ArgpRecallEngine: "argp",
  ArgpProbeEngine: "argp",
  InstantCompactionEngine: "instant",
  HeadroomCompactionEngine: "headroom"
};
function moduleResolvable(spec) {
  try {
    const meta = import.meta;
    if (typeof meta.resolve !== "function") return false;
    meta.resolve(spec);
    return true;
  } catch {
    return false;
  }
}
function detectTools(ctx) {
  const names = /* @__PURE__ */ new Set();
  try {
    const schemas = ctx.tools?.schemas?.() ?? [];
    if (Array.isArray(schemas)) {
      for (const s of schemas) {
        const n = s?.name;
        if (typeof n === "string" && n.length > 0) names.add(n);
      }
    }
  } catch {
  }
  return names;
}
function engineOf(ctx) {
  const engine = ctx.get?.("compaction");
  const className = typeof engine?.constructor?.name === "string" ? engine.constructor.name : "";
  if (className === "") return { id: null, className: "" };
  return { id: ENGINE_CLASS_MAP[className] ?? null, className };
}
function tokenSnapshot(ctx, session) {
  const meter = ctx.get?.("tokenMeter");
  if (meter === void 0 || session === void 0 || session === null) return null;
  try {
    const measured = meter.measure(session);
    if (typeof measured === "number") return { totalTokens: measured };
    if (measured !== null && typeof measured === "object") {
      const v = measured;
      const total = Number(v.totalTokens ?? v.tokens ?? Number.NaN);
      if (Number.isFinite(total)) return { totalTokens: total };
    }
  } catch {
  }
  return null;
}
function pickPrimitives(data) {
  const out = {};
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    }
  }
  return out;
}
function compactionHistory(session, limit = 3) {
  const events = sessionEvents(session);
  const hits = [];
  if (events !== void 0) {
    for (let i = events.length - 1; i >= 0 && hits.length < limit; i -= 1) {
      const evt = events[i];
      if (evt?.type !== "compaction/summary") continue;
      hits.push({
        ...typeof evt.seq === "number" ? { seq: evt.seq } : {},
        data: pickPrimitives(evt.data)
      });
    }
    hits.reverse();
  }
  return { count: countAll(events), last: hits };
}
function sessionEvents(session) {
  const carrier = session;
  if (carrier === null || carrier === void 0 || typeof carrier !== "object") return void 0;
  try {
    if (typeof carrier.snapshotEvents === "function") {
      const events = carrier.snapshotEvents();
      if (Array.isArray(events)) return events;
    }
    if (Array.isArray(carrier.events)) return carrier.events;
  } catch {
  }
  return void 0;
}
function countAll(events) {
  if (!Array.isArray(events)) return 0;
  let n = 0;
  for (const e of events) {
    if (e?.type === "compaction/summary") n += 1;
  }
  return n;
}
function componentMatrix(ctx, toolNames) {
  const activeEngine = engineOf(ctx).id;
  return COMPONENTS.map((c) => {
    const present = c.tools.filter((t) => toolNames.has(t));
    const missing = c.tools.filter((t) => !toolNames.has(t));
    const toolLess = c.tools.length === 0 && c.pkg !== void 0;
    if (toolLess) {
      const installed = moduleResolvable(c.pkg);
      return {
        id: c.id,
        label: c.label,
        row: c.row,
        kinds: c.kinds,
        expected: c.tools,
        present: [],
        missing: [],
        defaultOn: c.defaultOn,
        state: installed ? "active" : "missing"
      };
    }
    const isEngine = c.kinds.includes("engine");
    const isActiveEngine = isEngine && activeEngine === c.id;
    const engineSide = !isEngine ? present.length > 0 : isActiveEngine || present.length > 0 && activeEngine === null;
    const state = engineSide ? "active" : present.length > 0 && !isEngine ? "active" : c.defaultOn ? "missing" : "disabled";
    return {
      id: c.id,
      label: c.label,
      row: c.row,
      kinds: c.kinds,
      expected: c.tools,
      present,
      missing,
      defaultOn: c.defaultOn,
      state
    };
  });
}
function buildStatus(ctx, session) {
  const toolNames = detectTools(ctx);
  const engine = engineOf(ctx);
  const matrix = componentMatrix(ctx, toolNames);
  const tokens = tokenSnapshot(ctx, session);
  const computation = compactionHistory(session, 3);
  const activeEngine = matrix.find((m) => m.kinds.includes("engine") && m.state === "active") ?? null;
  return {
    system: "dsh-brain-compaction \u4EBA\u8111\u5F0F\u4E0A\u4E0B\u6587\u538B\u7F29\u4F53\u7CFB",
    activeEngine: activeEngine === null ? null : { id: activeEngine.id, className: engine.className },
    components: matrix.map((m) => ({
      id: m.id,
      label: m.label,
      row: m.row,
      state: m.state,
      toolsPresent: m.present,
      toolsMissing: m.missing
    })),
    unifiedTools: { expected: BRAIN_TOOLS, present: BRAIN_TOOLS.filter((t) => toolNames.has(t)) },
    sessionTokens: tokens,
    compaction: computation,
    note: "\u5DE5\u5177\u6062\u590D/\u8BB0\u5FC6\u7C7B\u7684\u5BF9\u7B49\u5DE5\u5177\u540D\u89C1 README\u300C\u5DE5\u5177\u547D\u540D\u7A7A\u95F4\u300D\uFF1B\u77E9\u9635\u53EA\u8BFB\uFF0C\u4E0D\u4FEE\u6539\u4EFB\u4F55\u7EC4\u4EF6\u3002"
  };
}
function verifyReport(ctx, session, detail) {
  const toolNames = detectTools(ctx);
  const engine = engineOf(ctx);
  const matrix = componentMatrix(ctx, toolNames);
  const tokens = tokenSnapshot(ctx, session);
  const history = compactionHistory(session, 3);
  const verdicts = matrix.map((m) => {
    const ok = m.state === "active" && m.missing.length === 0;
    const text = ok ? `PASS  ${m.label}\uFF08\u884C ${m.row}\uFF09\u5728\u573A\uFF0C\u5DE5\u5177\u9F50\u5907` : m.state === "disabled" ? `SKIP  ${m.label}\uFF08\u884C ${m.row}\uFF09\u9ED8\u8BA4\u7981\u7528\uFF1A${m.id === "sgme" ? "\u9700\u8981 SGME \u7F51\u5173 + \u5BC6\u94A5" : m.id === "headroom" ? "\u9700\u8981\u672C\u5730 Headroom \u4EE3\u7406" : m.id === "instant" ? "\u4E0E argp \u5F15\u64CE\u4E92\u65A5\uFF08\u5907\u9009\u5F15\u64CE\uFF09" : m.id === "doctor" ? "\u672A\u5B89\u88C5\uFF08GitHub-only\uFF0C\u53EF\u9009\uFF09" : "\u7EC4\u5408\u4E2D\u7981\u7528"}` : `FAIL  ${m.label}\uFF08\u884C ${m.row}\uFF09\u9884\u671F\u5728\u573A\u4F46\u5DE5\u5177\u7F3A\u5931: ${m.missing.join(", ") || "(\u65E0\u6A21\u578B\u5DE5\u5177\u2014\u2014\u5305\u4E0D\u53EF\u89E3\u6790\u6216\u672A\u5B89\u88C5)"}`;
    return { id: m.id, ok, text };
  });
  const engineCheck = {
    ok: engine.id !== null,
    className: engine.className === "" ? null : engine.className,
    text: engine.id ? `PASS  \u538B\u7F29\u5F15\u64CE ctx.compaction = ${engine.className}\uFF08\u2192 ${engine.id}\uFF09` : engine.className === "" ? "FAIL  \u672A\u53D1\u73B0 ctx.compaction \u538B\u7F29\u5F15\u64CE\uFF1A\u8BF7\u68C0\u67E5 profile \u7EC4\u5408\uFF08compaction-basic \u5FC5\u987B\u88AB\u7981\u7528\u4E14\u4EC5\u4E00\u4E2A\u5F15\u64CE\u884C\u542F\u7528\uFF09" : `FAIL  \u53D1\u73B0\u4E86 ctx.compaction = ${engine.className}\uFF0C\u4F46\u8BE5\u5B9E\u73B0\u4E0D\u5728\u5DF2\u77E5\u5F15\u64CE\u8868\u5185\uFF08argp/instant/headroom\uFF09\u2014\u2014\u82E5\u662F\u65B0\u5F15\u64CE\uFF0C\u8BF7\u5728 integration.ts \u7684 ENGINE_CLASS_MAP \u4E2D\u767B\u8BB0`
  };
  const guidance = [
    "1) token \u73B0\u72B6\uFF1A" + (tokens === null ? "\uFF08\u65E0 tokenMeter \u6216\u4F1A\u8BDD\u4E0D\u53EF\u8BA1\u91CF\uFF09" : `\u4F1A\u8BDD\u7EA6 ${tokens.totalTokens} tokens\uFF08tokenMeter \u4F30\u7B97\uFF09`),
    "2) \u538B\u7F29\u524D\u540E\u5BF9\u6BD4\uFF1A\u6700\u8FD1\u4E00\u6B21 compaction/summary \u4E8B\u4EF6\u6570\u636E\u89C1\u4E0A\uFF08shadowed/checkpoint \u5B57\u6BB5\u4E3A\u5F15\u64CE\u5728\u4E8B\u4EF6\u4E2D\u7684\u539F\u6837\u53F6\u5B50\u503C\uFF09\uFF1B\u8FDE\u7EED\u4E24\u6B21 /compact \u540E\u91CD\u65B0\u8C03\u7528 brain_verify \u5373\u4E3A\u538B\u7F29\u524D\u540E Token \u5BF9\u6BD4\u3002",
    "3) \u6CE8\u5165\u7269\u6210\u672C\u5BA1\u8BA1\uFF1A" + (toolNames.has("context_audit") ? "context_audit \u5DF2\u53EF\u7528\uFF0C\u8C03\u7528\u5B83\u83B7\u5F97 AGENTS.md \u6307\u4EE4\u94FE/\u6280\u80FD\u76EE\u5F55/\u5DE5\u5177 schema/MCP \u5DE5\u5177\u9762 token \u6210\u672C\u4E0E\u88C1\u526A\u5EFA\u8BAE\u3002" : 'context_audit \u672A\u5B89\u88C5\uFF1A`dsh plugin --profile web add "github:Zhenyu98/dsh-context-doctor#main"` \u540E\u91CD\u542F\u5373\u53EF\u7EB3\u5165\u672C\u9A8C\u8BC1\u3002'),
    "4) \u82E5\u5F15\u64CE\u884C\u5F02\u5E38\uFF1A\u786E\u8BA4 cordis.patch.yml \u4E2D compaction-basic \u5904\u4E8E disabled\uFF0C\u4E14 argp/instant/headroom \u4E09\u4E2A\u5F15\u64CE\u884C\u6070\u597D\u4E00\u4E2A\u672A disabled\uFF08\u91CD\u540D\u5DE5\u5177 recall \u4F1A\u76F4\u63A5\u629B\u9519\uFF09\u3002"
  ];
  return {
    system: "dsh-brain-compaction \u9A8C\u8BC1\u62A5\u544A",
    at: (/* @__PURE__ */ new Date()).toISOString(),
    engine: engineCheck,
    verdicts,
    sessionTokens: tokens,
    compactionHistory: history,
    guidance: detail === "developer" ? guidance : guidance.slice(0, 2)
  };
}
function recallDispatch(ctx, args) {
  const engine = ctx.get?.("compaction");
  if (engine === void 0) {
    return "brain_recall: \u672A\u53D1\u73B0\u538B\u7F29\u5F15\u64CE\uFF08ctx.compaction\uFF09\u3002\u8BF7\u68C0\u67E5 profile \u7EC4\u5408\uFF1Acompaction-basic \u5E94\u88AB\u7981\u7528\uFF0C\u4E14 argp / instant / headroom \u6070\u6709\u4E00\u4E2A\u5F15\u64CE\u884C\u542F\u7528\u3002";
  }
  const limit = Number.isFinite(args.maxResults) && args.maxResults > 0 ? Math.floor(args.maxResults) : 5;
  if (args.seq !== void 0 && args.seq !== null && typeof engine.recall === "function") {
    try {
      const text = engine.recall(Number(args.seq));
      if (text === null) {
        return `[brain_recall seq=${args.seq}] \u8BE5 seq \u672A\u88AB\u906E\u853D\u6216\u4E0D\u5728\u672C\u5F15\u64CE\u65E5\u5FD7\u4E2D\uFF1B\u53EF\u6539\u7528\u5217\u8868/\u641C\u7D22\u5DE5\u5177\uFF08list_pruned / recall / search\uFF09\uFF0C\u6216\u67E5\u8BE2\u8BB0\u5FC6\u5E93\u3002`;
      }
      return `[brain_recall seq=${args.seq}]\uFF08\u539F\u6837\u53D6\u56DE\uFF09
${text}`;
    } catch (error) {
      return `brain_recall: \u5F15\u64CE recall \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (typeof args.query === "string" && args.query.length > 0 && typeof engine.recallQuery === "function") {
    try {
      return `[brain_recall query=${args.query}]
${engine.recallQuery(args.query, limit)}`;
    } catch (error) {
      return `brain_recall: \u5F15\u64CE recallQuery \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const className = typeof engine?.constructor?.name === "string" ? engine.constructor.name : "unknown";
  const hint = className === "InstantCompactionEngine" ? "recall / search" : className === "HeadroomCompactionEngine" ? "headroom_retrieve" : "recall_pruned / list_pruned / recall";
  return `brain_recall: \u5F53\u524D\u5F15\u64CE\uFF08${className}\uFF09\u4E0D\u66B4\u9732\u7A0B\u5E8F\u5316 recall\uFF1B\u8BF7\u76F4\u63A5\u8C03\u7528\u5B83\u7684\u6A21\u578B\u5DE5\u5177\uFF1A${hint}\u3002`;
}

// src/host/index.ts
var name = "dsh-brain-compaction";
var inject = ["tools"];
function installBrainSection(ctx, namespace, entry, hooks) {
  ctx.settings.installSection(ctx, namespace, BrainSettingsSchema, entry, hooks);
}
function apply(ctx, config = {}) {
  const entry = resolveBrainSettings({ ...BRAIN_DEFAULTS, ...config ?? {} });
  let source = () => entry;
  let settings = entry;
  ctx.inject(["settings"], (scope) => {
    const settingsCtx = scope;
    if (typeof settingsCtx.settings?.installSection !== "function") {
      ctx.logger.warn(
        "[dsh-brain-compaction] settings provider \u672A\u66B4\u9732 installSection\uFF08DSH < 0.1.5\uFF1F\uFF09\uFF1A\u7EDF\u4E00\u9762\u677F\u914D\u7F6E\u4E0D\u53EF\u7528\uFF0C\u7EC4\u5408\u5C42 config \u4ECD\u7136\u751F\u6548"
      );
      return;
    }
    installBrainSection(settingsCtx, BRAIN_NAMESPACE, entry, {
      setSource: (next) => {
        source = next;
      },
      onChange: () => {
        settings = resolveBrainSettings(source());
      },
      validate: (value) => {
        resolveBrainSettings(value);
      }
    });
  });
  ctx.on("session/event", (session, event) => {
    if (event?.type !== "compaction/summary") return;
    try {
      const data = event.data ?? {};
      const leaf = Object.fromEntries(
        Object.entries(data).filter(
          ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        )
      );
      ctx.logger.info("brain-compaction: summary event %s %j", String(event.seq ?? ""), leaf);
    } catch {
    }
  }, "dsh-brain-compaction: compaction summary logger");
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "brain_status",
    description: "\u67E5\u770B\u4EBA\u8111\u5F0F\u4E0A\u4E0B\u6587\u538B\u7F29\u4F53\u7CFB\u7684\u5B9E\u65F6\u72B6\u6001\uFF1A\u6FC0\u6D3B\u7684\u538B\u7F29\u5F15\u64CE\uFF08argp/instant/headroom \u4E4B\u4E00\uFF09\u3001\u5404\u96C6\u6210\u7EC4\u4EF6\uFF08argp/instant/headroom/vault/sgme/lens/doctor\uFF09\u7684\u5728\u573A\u6027\u4E0E\u7F3A\u5931\u5DE5\u5177\u3001\u4F1A\u8BDD token \u5360\u7528\u3001\u6700\u8FD1\u538B\u7F29\u5386\u53F2\u3002\u6000\u7591\u538B\u7F29/\u8BB0\u5FC6\u5C42\u5F02\u5E38\u65F6\u5148\u8C03\u7528\u5B83\u3002",
    parameters: {},
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
    },
    presentCall: () => ({ card: "generic", title: "Brain compaction status", kind: "read", rawInput: "" }),
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      return buildStatus(ctx, exec?.agent?.session);
    }
  })), "dsh-brain-compaction: brain_status");
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "brain_verify",
    description: "\u9A8C\u8BC1\u4E0A\u4E0B\u6587\u538B\u7F29\u4F53\u7CFB\u662F\u5426\u6B63\u5E38\u5DE5\u4F5C\uFF1A\u8F93\u51FA\u7EC4\u4EF6\u77E9\u9635\uFF08PASS/SKIP/FAIL\uFF09\u3001\u5F15\u64CE\u670D\u52A1\u3001\u4F1A\u8BDD token \u5FEB\u7167\u3001\u6700\u8FD1 compaction/summary \u524D\u540E\u5BF9\u6BD4\uFF0C\u5E76\u63A5\u5165 dsh-context-doctor\uFF08\u5982\u5DF2\u88C5\uFF09\u7684\u6CE8\u5165\u7269\u6210\u672C\u5BA1\u8BA1\u3002\u88C5\u914D\u5B8C\u6210\u540E\u3001\u6216\u6392\u67E5\u538B\u7F29\u95EE\u9898\u65F6\u8C03\u7528\u3002",
    parameters: {
      detail: {
        type: "string",
        enum: ["summary", "developer"],
        description: "summary \u7CBE\u7B80\uFF1Bdeveloper \u9644\u5E26\u4FEE\u590D\u6307\u5F15\u3002\u9ED8\u8BA4\u4F7F\u7528\u7EDF\u4E00\u914D\u7F6E\u4E2D\u7684 verifyDetail\u3002"
      }
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
    },
    presentCall: () => ({ card: "generic", title: "Brain compaction verify", kind: "read", rawInput: "" }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const detail = args?.detail === "developer" ? "developer" : args?.detail === "summary" ? "summary" : settings.verifyDetail;
      return verifyReport(ctx, exec?.agent?.session, detail);
    }
  })), "dsh-brain-compaction: brain_verify");
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "brain_recall",
    description: "\u7EDF\u4E00\u53EC\u56DE\u5165\u53E3\uFF1A\u6309 seq \u6216\u5173\u952E\u8BCD\u627E\u56DE\u88AB\u538B\u7F29/\u88AB\u526A\u679D\u7684\u5185\u5BB9\u3002seq \u672A\u77E5\u65F6\u5148 list_pruned\uFF08argp\uFF09/ search\uFF08instant\uFF09\u5B9A\u4F4D\uFF1B\u8DE8\u4F1A\u8BDD\u4E8B\u5B9E\u7528 memory_recall\u3002\u5F53\u524D\u5F15\u64CE\u4E0D\u652F\u6301\u7684\u7A0B\u5E8F\u5316\u53EC\u56DE\u4F1A\u56DE\u9000\u4E3A\u6307\u5F15\u3002",
    parameters: {
      query: { type: "string", description: "\u6309\u5185\u5BB9\u5173\u952E\u8BCD/\u6B63\u5219\u53EC\u56DE\uFF08argp \u5F15\u64CE\u652F\u6301\uFF09" },
      seq: { type: "number", description: "\u6309\u65E5\u5FD7 seq \u7CBE\u786E\u53EC\u56DE\uFF08argp \u5F15\u64CE\u652F\u6301\uFF09" },
      maxResults: { type: "number", description: "\u5173\u952E\u8BCD\u53EC\u56DE\u6700\u5927\u6761\u6570\uFF08\u9ED8\u8BA4 5\uFF09" }
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: String(value ?? "") }]
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Recall content",
      kind: "read",
      rawInput: args?.seq !== void 0 ? `seq ${args.seq}` : args?.query ?? ""
    }),
    async execute(args) {
      return recallDispatch(ctx, {
        query: typeof args?.query === "string" ? args.query : void 0,
        seq: typeof args?.seq === "number" ? args.seq : void 0,
        maxResults: typeof args?.maxResults === "number" ? args.maxResults : void 0
      });
    }
  })), "dsh-brain-compaction: brain_recall");
  if (settings.selfTestAfterBoot !== false) {
    try {
      const names = detectTools(ctx);
      const engine = engineOf(ctx);
      if (engine.id === null) {
        ctx.logger.warn("[dsh-brain-compaction] \u81EA\u68C0\uFF1A\u672A\u68C0\u6D4B\u5230\u538B\u7F29\u5F15\u64CE\uFF08compaction \u670D\u52A1\u7F3A\u5931\uFF09\u2014\u2014\u8BF7\u786E\u8BA4 compaction-basic \u5DF2\u7981\u7528\u4E14 argp/instant/headroom \u6070\u6709\u4E00\u4E2A\u5F15\u64CE\u884C\u542F\u7528");
      }
      for (const expected of BRAIN_TOOLS) {
        if (!names.has(expected)) ctx.logger.warn("[dsh-brain-compaction] \u81EA\u68C0\uFF1A\u7EDF\u4E00\u5DE5\u5177 %s \u672A\u6CE8\u518C", expected);
      }
      if (!names.has("recall_pruned") && !names.has("headroom_retrieve") && !names.has("search")) {
        ctx.logger.warn("[dsh-brain-compaction] \u81EA\u68C0\uFF1A\u672A\u53D1\u73B0\u4EFB\u4F55\u5B50\u63D2\u4EF6\u5DE5\u5177\uFF08argp/instant/headroom/vault/lens\uFF09\u2014\u2014\u4F9D\u8D56\u672A\u5B89\u88C5\u6216\u884C\u672A\u6FC0\u6D3B");
      }
    } catch (error) {
      ctx.logger.warn("[dsh-brain-compaction] \u81EA\u68C0\u5F02\u5E38\uFF08\u4E0D\u5F71\u54CD\u8FD0\u884C\uFF09\uFF1A%s", error instanceof Error ? error.message : String(error));
    }
  }
}
export {
  BrainSettingsSchema as Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
