/**
 * src/client.js — 统一配置面板（浏览器半区, 逐字发布, 不做任何转换）。
 *
 * 被 dsh-web-app 的 client-modules 路由逐字服务, 因此必须是自包含的
 * `window.__ModuleLoader__.load` 惰性 CJS factory（与 dsh-compaction-instant
 * 的 src/client.js 完全同构）。
 *
 * 一张卡片 = 统一配置入口（Settings → Plugins → 「人脑式上下文压缩」）：
 * - 绑定多个 settings namespace（brain-compaction / compaction-instant /
 *   headroom），scope 可用则在卡片内渲染对应小节——一站式调整, 但写入仍走
 *   各插件原生 scope（schema 校验 + live 生效）。
 * - scope 不可用（插件禁用/未安装）自动隐藏对应小节, 底部给出"组合配置"
 *   说明（argp / sgme / vault / mcp-lens / context-doctor 无 settings 命名
 *   空间, 参数在 cordis.patch.yml 的对应行 config 中调整）。
 */
function brainCompactionClientFactory(require) {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var { createSnapshotStore } = require("@deepseek-ai/dsh-client-runtime/client");

  // ── styles ────────────────────────────────────────────────────────────
  var css = [
    ".dsbc_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}",
    ".dsbc_card:hover{border-color:var(--dsw-alias-label-dimmed)}",
    ".dsbc_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
    ".dsbc_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}",
    ".dsbc_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
    ".dsbc_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
    ".dsbc_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}",
    ".dsbc_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
    ".dsbc_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}",
    ".dsbc_chevronOpen{transform:rotate(180deg)}",
    ".dsbc_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
    ".dsbc_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}",
    ".dsbc_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}",
    ".dsbc_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}",
    ".dsbc_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}",
    ".dsbc_discard,.dsbc_save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}",
    ".dsbc_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}",
    ".dsbc_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}",
    ".dsbc_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}",
    ".dsbc_discard:disabled,.dsbc_save:disabled{opacity:.4;cursor:default}",
    ".dsbc_discard:focus-visible,.dsbc_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".dsbc_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}",
    ".dsbc_field+.dsbc_field{border-top:1px solid var(--dsw-alias-border-l2)}",
    ".dsbc_head{align-items:center;gap:8px;display:flex}",
    ".dsbc_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}",
    ".dsbc_badges{align-items:center;gap:8px;display:inline-flex}",
    ".dsbc_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}",
    ".dsbc_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}",
    ".dsbc_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}",
    ".dsbc_reset:disabled{cursor:default}",
    ".dsbc_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;box-sizing:border-box}",
    ".dsbc_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}",
    ".dsbc_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}",
    ".dsbc_inputInvalid{border-color:var(--dsw-alias-label-error)}",
    ".dsbc_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}",
    ".dsbc_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}",
    ".dsbc_toggleRow{align-items:center;gap:10px;display:flex}",
    ".dsbc_toggle{accent-color:var(--dsw-alias-brand-primary);width:16px;height:16px;cursor:pointer}",
    ".dsbc_toggle:disabled{cursor:default}",
    ".dsbc_sectionTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;padding:12px 0 4px;margin:0}",
    ".dsbc_note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin:8px 0 0}"
  ].join("");
  var tagId = "dsh-brain-compaction/settings.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
    var tag = document.createElement("style");
    tag.dataset.plugin = "dsh-brain-compaction";
    tag.dataset.pluginCss = tagId;
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ── locale ────────────────────────────────────────────────────────────
  var NS = "brain-compaction";
  var zh = {
    title: "人脑式上下文压缩",
    description: "统一面板：引擎/阈值/记忆/审计一站式调参（哪个插件在场就调哪个）。",
    engineNote: "引擎互斥：argp / instant / headroom 恰有一个启用（改 cordis.patch.yml 后重启）。",
    instantGroup: "即时压缩引擎（dsh-compaction-instant，激活时）",
    headroomGroup: "Headroom 工具输出压缩（启用时）",
    brainGroup: "统一层（本插件）",
    patchOnly: "组合配置项（可在此查看，修改需编辑 cordis.patch.yml）",
    patchOnlyNote: "argp / sgme / vault / mcp-lens / context-doctor 没有 settings 命名空间：在 cordis.patch.yml 对应行的 config 调整后重启。",
    selfTestAfterBoot: "启动集成自检",
    selfTestAfterBootHint: "启动时输出组件矩阵 warn（缺件不崩）。",
    verifyDetail: "验证粒度",
    verifyDetailHint: "brain_verify 默认输出：summary / developer。",
    auto: "自动压缩",
    autoHint: "步骤间按上下文压力自动压缩；关闭后仅手动。",
    thresholdRatio: "自动压缩比例",
    thresholdRatioHint: "上下文窗口占用达到此比例触发（默认 0.5）。",
    retainTurns: "保留回合数",
    retainTurnsHint: "保留最近 N 个完整回合（默认 1）。",
    retainTokens: "保留 token 上限",
    retainTokensHint: "保留区 token 硬上限（默认 5120）。",
    checkpointCap: "检查点预算上限",
    checkpointCapHint: "一次检查点编译预算（默认 65536）。",
    resultCompressionEnabled: "启用工具输出压缩",
    resultCompressionEnabledHint: "工具输出进入模型前压缩，原文入 CCR store，可 headroom_retrieve 取回。",
    resultCompressionThresholdChars: "压缩阈值（字符）",
    resultCompressionThresholdCharsHint: "超过该长度的工具输出被压缩检查点替换。",
    overridden: "已覆盖",
    reset: "重置",
    invalidNumber: "必须是数字",
    save: "保存",
    saving: "保存中…",
    saveFailed: "保存失败",
    discard: "放弃",
    unsaved: "未保存",
    readOnly: "当前连接为只读，无法修改配置。",
    expand: "展开",
    collapse: "收起",
    unavailable: "未激活（插件禁用或未安装）"
  };
  var en = {
    title: "Brain Compaction",
    description: "One panel: engine / thresholds / memory / audit (tunes whichever plug-ins are present).",
    engineNote: "Engines are exclusive: argp / instant / headroom — exactly one enabled (edit cordis.patch.yml, restart).",
    instantGroup: "Instant engine (dsh-compaction-instant, when active)",
    headroomGroup: "Headroom result compression (when enabled)",
    brainGroup: "Unified layer (this plug-in)",
    patchOnly: "Composition-level keys (read-only here; edit cordis.patch.yml)",
    patchOnlyNote: "argp / sgme / vault / mcp-lens / context-doctor expose no settings namespace: edit their row config in cordis.patch.yml and restart.",
    selfTestAfterBoot: "Boot self-check",
    selfTestAfterBootHint: "Log the component matrix warning at boot (missing parts never crash).",
    verifyDetail: "Verify detail",
    verifyDetailHint: "Default brain_verify level: summary / developer.",
    auto: "Automatic compaction",
    autoHint: "Compress between steps by pressure; manual only when off.",
    thresholdRatio: "Threshold ratio",
    thresholdRatioHint: "Fraction of the context window that triggers auto compaction (default 0.5).",
    retainTurns: "Retained turns",
    retainTurnsHint: "Keep the last N complete turns (default 1).",
    retainTokens: "Retained-token ceiling",
    retainTokensHint: "Hard ceiling for the retained region (default 5120).",
    checkpointCap: "Checkpoint cap",
    checkpointCapHint: "Compiler-token budget for one checkpoint (default 65536).",
    resultCompressionEnabled: "Compress tool output",
    resultCompressionEnabledHint: "Compress tool output before it reaches the model; originals stay in the CCR store (headroom_retrieve).",
    resultCompressionThresholdChars: "Threshold (chars)",
    resultCompressionThresholdCharsHint: "Tool output longer than this is replaced by a compacted checkpoint.",
    overridden: "Overridden",
    reset: "Reset",
    invalidNumber: "Must be a number",
    save: "Save",
    saving: "Saving…",
    saveFailed: "Save failed",
    discard: "Discard",
    unsaved: "Unsaved",
    readOnly: "This connection is read-only.",
    expand: "Expand",
    collapse: "Collapse",
    unavailable: "Inactive (disabled or not installed)"
  };

  // ── per-scope form controller (one controller per settings namespace) ──
  function numberField(field) {
    return {
      field: field,
      format: function (value) { return typeof value === "number" ? String(value) : ""; },
      parse: function (text) {
        var trimmed = String(text).trim();
        if (trimmed === "") return { kind: "clear" };
        var parsed = Number(trimmed);
        return Number.isFinite(parsed) ? { kind: "set", value: parsed } : void 0;
      }
    };
  }
  function booleanField(field) {
    return {
      field: field,
      format: function (value) { return value === true ? "true" : "false"; },
      parse: function (text) { return { kind: "set", value: String(text) === "true" }; }
    };
  }
  function textField(field) {
    return {
      field: field,
      format: function (value) { return typeof value === "string" ? value : ""; },
      parse: function (text) { return { kind: "set", value: String(text) }; }
    };
  }

  function CardController(scope, specs) {
    this.scope = scope;
    this.specs = new Map(specs.map(function (spec) { return [spec.field, spec]; }));
    this.staged = new Map();
    this.listeners = new Set();
    this.saving = false;
    this.failed = false;
    var self = this;
    scope.subscribe(function () { self.publish(); });
  }
  CardController.prototype.bind = function (project) {
    var store = createSnapshotStore(project());
    var self = this;
    this.listeners.add(function () { store.set(project()); });
    return store;
  };
  CardController.prototype.publish = function () {
    var self = this;
    this.listeners.forEach(function (listener) {
      try { listener(); } catch (e) { /* a failing projection must not kill the form */ }
    });
  };
  CardController.prototype.shell = function () {
    var snapshot = this.scope.getSnapshot();
    var plan = this.plan();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: plan.length > 0,
      invalid: plan.some(function (item) { return item.run === void 0; }),
      saving: this.saving,
      failed: this.failed
    };
  };
  CardController.prototype.field = function (field) {
    var staged = this.staged.get(field);
    var spec = this.specs.get(field);
    if (staged === void 0) {
      return {
        text: spec.format(this.sectionValue(field)),
        overridden: this.stored(field),
        invalid: false
      };
    }
    var write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
    return {
      text: staged.text,
      overridden: write != null && write.kind === "set",
      invalid: write === void 0
    };
  };
  CardController.prototype.actions = function () {
    var self = this;
    return {
      edit: function (field, text) { self.stage(field, { text: text, clear: false }); },
      resetField: function (field) { self.stage(field, { text: self.specs.get(field).format(self.baseValue(field)), clear: true }); },
      save: function () { self.save(); },
      discard: function () {
        if (self.staged.size === 0 && !self.failed) return;
        self.staged.clear();
        self.failed = false;
        self.publish();
      }
    };
  };
  CardController.prototype.plan = function () {
    var plan = [];
    var self = this;
    this.staged.forEach(function (staged, field) {
      var spec = self.specs.get(field);
      if (staged.clear) {
        if (self.stored(field)) plan.push({ field: field, run: function () { return self.clear(field); } });
        return;
      }
      if (staged.text === spec.format(self.sectionValue(field))) return;
      var write = spec.parse(staged.text);
      if (write === void 0) plan.push({ field: field, run: void 0 });
      else if (write.kind === "clear") plan.push({ field: field, run: function () { return self.clear(field); } });
      else plan.push({ field: field, run: function () { return self.store(field, write.value); } });
    });
    var ordered = [];
    var byField = {};
    plan.forEach(function (item) { byField[item.field] = item; });
    this.specs.forEach(function (spec, field) { if (byField[field] !== void 0) ordered.push(byField[field]); });
    return ordered;
  };
  CardController.prototype.stage = function (field, edit) {
    this.staged.set(field, edit);
    this.failed = false;
    this.publish();
  };
  CardController.prototype.sectionValue = function (field) {
    var value = this.scope.getSnapshot().value;
    return value == null ? void 0 : value[field];
  };
  CardController.prototype.baseValue = function (field) {
    var base = this.scope.getSnapshot().base;
    return base == null ? void 0 : base[field];
  };
  CardController.prototype.userLayer = function () {
    return this.scope.getSnapshot().user;
  };
  CardController.prototype.stored = function (field) {
    var user = this.userLayer();
    return user !== void 0 && Object.prototype.hasOwnProperty.call(user, field);
  };
  CardController.prototype.clear = function (field) {
    var self = this;
    return this.scope.unset(field).then(function () { return !self.stored(field); });
  };
  CardController.prototype.store = function (field, value) {
    var self = this;
    return this.scope.set(field, value).then(function () {
      var user = self.userLayer();
      return user !== void 0 && user[field] === value;
    });
  };
  CardController.prototype.save = function () {
    var self = this;
    var plan = this.plan();
    var writes = [];
    plan.forEach(function (item) { if (item.run !== void 0) writes.push(item.run); });
    if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    var landed = true;
    var settled = Promise.resolve();
    writes.forEach(function (write) {
      settled = settled.then(write).then(function (ok) { landed = ok && landed; });
    });
    settled.then(function () {
      if (landed) self.staged.clear();
      self.saving = false;
      self.failed = !landed;
      self.publish();
    });
  };

  // ── field components ──────────────────────────────────────────────────
  function ValueField(props) {
    return React.createElement(
      "div", { className: "dsbc_field" },
      React.createElement(
        "div", { className: "dsbc_head" },
        React.createElement("label", { className: "dsbc_label", htmlFor: props.id }, props.label),
        props.overridden
          ? React.createElement(
              "span", { className: "dsbc_badges" },
              React.createElement("span", { className: "dsbc_badge" }, props.overriddenLabel),
              React.createElement("button", {
                type: "button", className: "dsbc_reset", disabled: props.disabled, onClick: props.onReset
              }, props.resetLabel)
            )
          : null
      ),
      React.createElement("input", {
        id: props.id, className: props.invalid ? "dsbc_input dsbc_inputInvalid" : "dsbc_input",
        type: "text", inputMode: props.numeric === true ? "numeric" : void 0,
        "aria-invalid": props.invalid ? true : void 0,
        value: props.text, disabled: props.disabled,
        onChange: function (event) { props.onEdit(event.target.value); }
      }),
      React.createElement("p", { className: props.invalid ? "dsbc_invalid" : "dsbc_hint" },
        props.invalid ? props.invalidLabel : props.hint)
    );
  }
  function ToggleField(props) {
    return React.createElement(
      "div", { className: "dsbc_field" },
      React.createElement(
        "div", { className: "dsbc_head" },
        React.createElement("label", { className: "dsbc_label", htmlFor: props.id }, props.label),
        props.overridden
          ? React.createElement(
              "span", { className: "dsbc_badges" },
              React.createElement("span", { className: "dsbc_badge" }, props.overriddenLabel),
              React.createElement("button", {
                type: "button", className: "dsbc_reset", disabled: props.disabled, onClick: props.onReset
              }, props.resetLabel)
            )
          : null
      ),
      React.createElement(
        "div", { className: "dsbc_toggleRow" },
        React.createElement("input", {
          id: props.id, className: "dsbc_toggle", type: "checkbox",
          checked: props.checked, disabled: props.disabled,
          onChange: function (event) { props.onToggle(event.target.checked); }
        })
      ),
      React.createElement("p", { className: "dsbc_hint" }, props.hint)
    );
  }

  // ── section: one settings namespace, own Save/Discard ─────────────────
  function ConfigSection(props) {
    var state = props.state(function (snapshot) { return snapshot; });
    if (!state.available) return null;
    var blocked = !state.dirty || state.invalid || state.saving;
    return React.createElement(
      "div", { className: "dsbc_body" },
      !state.writable ? React.createElement("p", { className: "dsbc_readOnly", role: "status" }, props.t("readOnly")) : null,
      props.fields.map(function (f) {
        var field = state[f.field];
        if (field === void 0) return null;
        if (f.kind === "toggle") {
          return React.createElement(ToggleField, {
            id: props.idPrefix + "-" + f.field,
            label: props.t(f.label), hint: props.t(f.hint),
            overriddenLabel: props.t("overridden"), resetLabel: props.t("reset"),
            checked: field.text === "true",
            overridden: field.overridden,
            disabled: !state.writable,
            onToggle: function (checked) { props.actions.edit(f.field, checked ? "true" : "false"); },
            onReset: function () { props.actions.resetField(f.field); }
          });
        }
        return React.createElement(ValueField, {
          id: props.idPrefix + "-" + f.field,
          label: props.t(f.label), hint: props.t(f.hint),
          overriddenLabel: props.t("overridden"), resetLabel: props.t("reset"),
          invalidLabel: props.t("invalidNumber"),
          numeric: f.numeric === true,
          disabled: !state.writable,
          text: field.text,
          overridden: field.overridden,
          invalid: field.invalid,
          onEdit: function (text) { props.actions.edit(f.field, text); },
          onReset: function () { props.actions.resetField(f.field); }
        });
      }),
      React.createElement(
        "div", { className: "dsbc_footer" },
        state.failed ? React.createElement("p", { className: "dsbc_failed", role: "status" }, props.t("saveFailed")) : null,
        React.createElement("button", {
          type: "button", className: "dsbc_discard",
          disabled: !state.dirty || state.saving, onClick: props.actions.discard
        }, props.t("discard")),
        React.createElement("button", {
          type: "button", className: "dsbc_save",
          disabled: blocked, onClick: props.actions.save
        }, props.t(state.saving ? "saving" : "save"))
      )
    );
  }

  function BrainCard(props) {
    var open = React.useState(false);
    var isOpen = open[0];
    var setOpen = open[1];
    var t = props.t;
    return React.createElement(
      "li", { className: "dsbc_card" + (isOpen ? " dsbc_cardOpen" : "") },
      React.createElement(
        "button", {
          type: "button", className: "dsbc_header",
          "aria-expanded": isOpen,
          "aria-label": t(isOpen ? "collapse" : "expand") + ": " + t("title"),
          onClick: function () { setOpen(!isOpen); }
        },
        React.createElement(
          "span", { className: "dsbc_headText" },
          React.createElement("span", { className: "dsbc_name" }, t("title")),
          React.createElement("span", { className: "dsbc_description" }, t("description"))
        ),
        React.createElement("span", { className: "dsbc_chevron" + (isOpen ? " dsbc_chevronOpen" : "") }, "▾")
      ),
      isOpen
        ? React.createElement(
            "div", { className: "dsbc_body" },
            React.createElement("p", { className: "dsbc_sectionTitle" }, t("engineNote")),
            props.sections.map(function (sec, index) {
              // 主 scope（统一层）状态驱动整卡可读性；仅渲染当前状态
              return React.createElement(
                "div", null,
                React.createElement("p", { className: "dsbc_sectionTitle" }, t(sec.titleKey)),
                // 先渲染 ConfigSection（内部 self-subscribe）；使用其 state 判断不可用
                React.createElement(ConfigSection, {
                  key: sec.key,
                  idPrefix: sec.key,
                  state: sec.state,
                  actions: sec.actions,
                  fields: sec.fields,
                  t: t
                }),
                React.createElement("p", { className: "dsbc_note" }, sec.unavailable)
              );
            }),
            React.createElement("p", { className: "dsbc_sectionTitle" }, t("patchOnly")),
            React.createElement("p", { className: "dsbc_note" }, t("patchOnlyNote"))
          )
        : null
    );
  }

  // ── plugin body ───────────────────────────────────────────────────────
  var inject = ["slots", "locale", "connection", "settingsScope"];

  function apply(ctx) {
    var t = ctx.locale.bind(NS);
    ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-brain-compaction: settings dictionary");

    // 每个命名空间一个 controller + store；scope 不可用由 ConfigSection 隐藏
    var sections = [
      {
        key: "brain-compaction",
        titleKey: "brainGroup",
        scope: ctx.settingsScope.bind({ namespace: "brain-compaction" }),
        specs: [
          booleanField("selfTestAfterBoot"),
          textField("verifyDetail")
        ],
        fields: [
          { field: "selfTestAfterBoot", kind: "toggle", label: "selfTestAfterBoot", hint: "selfTestAfterBootHint" },
          { field: "verifyDetail", kind: "text", label: "verifyDetail", hint: "verifyDetailHint" }
        ],
        unavailable: ""
      },
      {
        key: "compaction-instant",
        titleKey: "instantGroup",
        scope: ctx.settingsScope.bind({ namespace: "compaction-instant" }),
        specs: [
          booleanField("auto"),
          numberField("thresholdRatio"),
          numberField("retainTurns"),
          numberField("retainTokens"),
          numberField("checkpointCap")
        ],
        fields: [
          { field: "auto", kind: "toggle", label: "auto", hint: "autoHint" },
          { field: "thresholdRatio", kind: "number", label: "thresholdRatio", hint: "thresholdRatioHint", numeric: true },
          { field: "retainTurns", kind: "number", label: "retainTurns", hint: "retainTurnsHint", numeric: true },
          { field: "retainTokens", kind: "number", label: "retainTokens", hint: "retainTokensHint", numeric: true },
          { field: "checkpointCap", kind: "number", label: "checkpointCap", hint: "checkpointCapHint", numeric: true }
        ],
        unavailable: "compaction-instant 未激活"
      },
      {
        key: "headroom",
        titleKey: "headroomGroup",
        scope: ctx.settingsScope.bind({ namespace: "headroom" }),
        specs: [
          booleanField("resultCompressionEnabled"),
          numberField("resultCompressionThresholdChars")
        ],
        fields: [
          { field: "resultCompressionEnabled", kind: "toggle", label: "resultCompressionEnabled", hint: "resultCompressionEnabledHint" },
          { field: "resultCompressionThresholdChars", kind: "number", label: "resultCompressionThresholdChars", hint: "resultCompressionThresholdCharsHint", numeric: true }
        ],
        unavailable: "headroom 未启用（行默认 disabled）"
      }
    ];
    sections.forEach(function (sec) {
      var controller = new CardController(sec.scope, sec.specs);
      sec.state = controller.bind(function () {
        var shell = controller.shell();
        var out = { available: shell.available, writable: shell.writable };
        sec.fields.forEach(function (f) { out[f.field] = controller.field(f.field); });
        return out;
      });
      sec.actions = controller.actions();
    });

    ctx.slots.inject("settings.plugin.item", function* () {
      yield ctx.slots.register({
        name: "settings.plugin.item",
        key: "brain-compaction",
        order: 10,
        locale: NS,
        inject: function () {
          return {
            hooks: { brainCompactionCard: sections[0].state },
            sections: sections,
            t: t
          };
        }
      }, BrainCard);
    });
  }

  exports.apply = apply;
  exports.inject = inject;
  return module.exports;
}

window.__ModuleLoader__.load({
  id: "dsh-brain-compaction",
  factory: brainCompactionClientFactory
});
