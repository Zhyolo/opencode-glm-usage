import { For, Show, createSignal, type JSX } from "solid-js"
import type { TuiPlugin } from "@opencode-ai/plugin/tui"

type ProviderLike = {
  id: string
  name?: string
  key?: string
  options?: { baseURL?: string; apiKey?: string; [key: string]: unknown }
}

type LimitInfo = {
  remaining?: number
  resetLabel?: string
  detail?: string
}

type ModelUsage = { name: string; tokens: number }
type ToolUsage = { name: string; count: number }

type UsageInfo = {
  tokens?: LimitInfo
  mcp?: LimitInfo
  level?: string
  tokens24h?: number
  models?: ModelUsage[]
  tools?: ToolUsage[]
  error?: string
  fetchedAt: number
}

const GLM_HOST_RE = /(api\.z\.ai|open\.bigmodel\.cn|dev\.bigmodel\.cn)/i
const GLM_ID_RE = /zhipu|bigmodel|z\.ai/i

function getProviders(api: any): ProviderLike[] {
  return (api?.state?.provider ?? []) as ProviderLike[]
}

function monitorBaseFrom(baseURL: string): string {
  try {
    const u = new URL(baseURL)
    return `${u.protocol}//${u.host}`
  } catch {
    return baseURL.replace(/\/api\/.*$/i, "")
  }
}

type GlmInfo = { matched: boolean; baseURL?: string; via: string }

function inspectProvider(p: ProviderLike | undefined): GlmInfo {
  if (!p) return { matched: false, via: "none" }
  const bu = p?.options?.baseURL
  if (typeof bu === "string" && GLM_HOST_RE.test(bu)) return { matched: true, baseURL: bu, via: "baseURL" }
  const idName = `${p.id ?? ""} ${p.name ?? ""}`
  if (GLM_ID_RE.test(idName)) {
    const base = typeof bu === "string" && bu ? bu : /z\.ai/i.test(idName) ? "https://api.z.ai/api/anthropic" : "https://open.bigmodel.cn/api/anthropic"
    return { matched: true, baseURL: base, via: "id" }
  }
  return { matched: false, via: "none" }
}

function findGlmProvider(api: any): ProviderLike | undefined {
  return getProviders(api).find((p) => inspectProvider(p).matched)
}

function providerToken(p: ProviderLike | undefined): string | undefined {
  return (p?.options?.apiKey as string) ?? p?.key
}

function formatTimeValue(value: unknown): { label: string; raw: unknown } | undefined {
  if (value == null) return undefined
  let ms: number | undefined
  if (typeof value === "number") {
    ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : value
  } else if (typeof value === "string") {
    const n = Number(value)
    if (!Number.isNaN(n) && value.trim() !== "") {
      ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : n
    } else {
      const t = Date.parse(value)
      if (!Number.isNaN(t)) ms = t
    }
  }
  if (ms === undefined || Number.isNaN(ms)) return { label: String(value), raw: value }
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (x: number) => String(x).padStart(2, "0")
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return { label: sameDay ? hm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`, raw: value }
}

const RESET_KEYS = [
  "resetTime",
  "refreshTime",
  "nextResetTime",
  "resetAt",
  "refreshAt",
  "endTime",
  "windowEnd",
  "expireTime",
  "expiryTime",
  "nextWindowTime",
  "resetTimestamp",
  "refreshTimestamp",
  "windowEndTime",
]

function extractResetTime(item: any, data: any): { label: string; raw: unknown } | undefined {
  if (item && typeof item === "object") {
    for (const key of RESET_KEYS) if (item[key] != null) return formatTimeValue(item[key])
  }
  if (data && typeof data === "object") {
    for (const key of RESET_KEYS) if (data[key] != null) return formatTimeValue(data[key])
  }
  const details = item?.usageDetails ?? data?.usageDetails
  if (details && typeof details === "object") {
    for (const key of RESET_KEYS) if (details[key] != null) return formatTimeValue(details[key])
  }
  return undefined
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

function usageWindow(): string {
  const now = new Date()
  const start = new Date(now.getTime() - 24 * 3600 * 1000)
  const pad = (x: number) => String(x).padStart(2, "0")
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `?startTime=${encodeURIComponent(fmt(start))}&endTime=${encodeURIComponent(fmt(now))}`
}

function BarRow(props: { label: string; limit?: LimitInfo; theme: () => any; colorFor: (r?: number) => any }) {
  const width = 10
  const lim = () => props.limit
  const filled = () => {
    const r = lim()?.remaining == null ? 0 : Math.max(0, Math.min(100, lim()!.remaining as number))
    return Math.round((r / 100) * width)
  }
  return (
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" gap={1}>
        <text fg={props.theme()?.textMuted}>{props.label}</text>
        <text>
          <span style={{ fg: props.colorFor(lim()?.remaining) }}>{"█".repeat(filled())}</span>
          <span style={{ fg: props.theme()?.textMuted }}>{"░".repeat(width - filled())}</span>
        </text>
        <text fg={props.colorFor(lim()?.remaining)}>{lim()?.remaining != null ? `${lim()?.remaining}%` : "?"}</text>
        <Show when={lim()?.resetLabel}>
          <text fg={props.theme()?.textMuted}>{`↻ ${lim()?.resetLabel}`}</text>
        </Show>
      </box>
    </box>
  )
}

function Row(props: { label: string; value: string; theme: () => any }) {
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme()?.textMuted}>{props.label}</text>
      <text fg={props.theme()?.text}>{props.value}</text>
    </box>
  )
}

function Indent(props: { name: string; value: string; theme: () => any }) {
  return (
    <box flexDirection="row" gap={1} paddingLeft={2}>
      <text fg={props.theme()?.textMuted}>· {props.name}</text>
      <text fg={props.theme()?.text}>{props.value}</text>
    </box>
  )
}

function GlmSidebar(props: { api: any; usage: () => UsageInfo | null }): JSX.Element {
  const api = props.api
  const theme = () => api?.theme?.current
  const u = () => props.usage()
  const colorFor = (r: number | undefined) => {
    const t = theme()
    if (!t) return undefined
    if (r == null) return t.warning
    if (r > 40) return t.success
    if (r > 15) return t.warning
    return t.error
  }
  const visible = () => !!findGlmProvider(api) || !!u()

  return (
    <Show when={visible()}>
      <box flexDirection="column" gap={0} paddingTop={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme()?.accent}>
            <b>GLM 用量</b>
          </text>
          <Show when={u()?.level}>
            <text fg={theme()?.textMuted}>[{u()?.level}]</text>
          </Show>
        </box>
        <Show
          when={!u()?.error}
          fallback={
            <text fg={theme()?.warning}>{u()?.error ?? "?"}</text>
          }
        >
          <Show when={u()?.tokens}>
            <BarRow label="5h token" limit={u()?.tokens} theme={theme} colorFor={colorFor} />
          </Show>
          <Show when={u()?.tokens24h != null}>
            <Row label="24h" value={`${fmtTokens(u()?.tokens24h as number)} tokens`} theme={theme} />
          </Show>
          <Show when={u()?.models?.length}>
            <For each={u()?.models}>{(m: ModelUsage) => <Indent name={m.name} value={fmtTokens(m.tokens)} theme={theme} />}</For>
          </Show>
          <Show when={u()?.mcp}>
            <BarRow label="MCP 月度" limit={u()?.mcp} theme={theme} colorFor={colorFor} />
            <Show when={u()?.mcp?.detail}>
              <Indent name="剩余" value={u()?.mcp?.detail as string} theme={theme} />
            </Show>
          </Show>
          <Show when={u()?.tools?.length}>
            <For each={u()?.tools}>{(t: ToolUsage) => <Indent name={t.name} value={String(t.count)} theme={theme} />}</For>
          </Show>
          <Show when={!u()}>
            <text fg={theme()?.textMuted}>加载中…</text>
          </Show>
        </Show>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  const [usage, setUsage] = createSignal<UsageInfo | null>(null)
  let lastFetch = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let loggedRaw = false

  function log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
    const fn = level === "error" ? "error" : level === "warn" ? "warn" : "log"
    try {
      console[fn](`[glm-usage] ${message}`, extra ?? "")
    } catch {
      /* ignore */
    }
    try {
      api?.client?.app?.log?.({ service: "glm-usage", level, message, extra })
    } catch {
      /* ignore */
    }
  }

  function dumpProviders() {
    const list = getProviders(api).map((p) => ({ id: p?.id, baseURL: p?.options?.baseURL, ...inspectProvider(p) }))
    log("info", "provider 扫描", { total: list.length, all: list })
  }

  async function refresh(force = false) {
    const now = Date.now()
    if (!force && now - lastFetch < 30000) return
    const p = findGlmProvider(api)
    const info = inspectProvider(p)
    const token = providerToken(p)
    const baseURL = info.baseURL
    if (!token || !baseURL) {
      setUsage({ error: "无 token/baseURL", fetchedAt: now })
      return
    }
    lastFetch = now
    const base = monitorBaseFrom(baseURL)
    const headers = { Authorization: token, "Accept-Language": "en-US,en", "Content-Type": "application/json" }
    const quotaUrl = `${base}/api/monitor/usage/quota/limit`
    const modelUrl = `${base}/api/monitor/usage/model-usage${usageWindow()}`
    const toolUrl = `${base}/api/monitor/usage/tool-usage${usageWindow()}`
    try {
      const [res, modelRes, toolRes] = await Promise.all([
        fetch(quotaUrl, { method: "GET", headers }),
        fetch(modelUrl, { method: "GET", headers }).catch(() => null),
        fetch(toolUrl, { method: "GET", headers }).catch(() => null),
      ])
      const text = await res.text()
      if (!res.ok) {
        setUsage({ error: `HTTP ${res.status}`, fetchedAt: now })
        log("warn", `quota/limit HTTP ${res.status}`, { url: quotaUrl, body: text.slice(0, 500) })
        return
      }
      let json: any
      try {
        json = JSON.parse(text)
      } catch {
        json = { raw: text }
      }
      if (!loggedRaw) {
        loggedRaw = true
        log("info", "quota/limit 原始响应(仅首次)", { url: quotaUrl, json })
      }
      const data = json?.data ?? json
      const limits = Array.isArray(data?.limits) ? data.limits : []
      const parseLimit = (type: string): LimitInfo | undefined => {
        const l: any = limits.find((x: any) => x?.type === type)
        if (!l) return undefined
        const used = typeof l.percentage === "number" ? l.percentage : undefined
        const remaining = used != null ? Math.max(0, Math.min(100, 100 - used)) : undefined
        const reset = extractResetTime(l, data)
        let detail: string | undefined
        if (typeof l.remaining === "number" && typeof l.usage === "number") {
          detail = `${l.remaining}/${l.usage}`
        }
        return { remaining, resetLabel: reset?.label, detail }
      }
      let tokens24h: number | undefined
      let models: ModelUsage[] | undefined
      if (modelRes && modelRes.ok) {
        try {
          const mj = JSON.parse(await modelRes.text())
          const t = mj?.data?.totalUsage?.totalTokensUsage
          if (typeof t === "number") tokens24h = t
          const ms = mj?.data?.totalUsage?.modelSummaryList
          if (Array.isArray(ms)) {
            models = ms
              .map((m: any) => ({ name: String(m?.modelName ?? "?"), tokens: Number(m?.totalTokens ?? 0) }))
              .filter((m: ModelUsage) => m.tokens > 0)
              .sort((a, b) => b.tokens - a.tokens)
          }
        } catch {
          /* ignore */
        }
      }
      let tools: ToolUsage[] | undefined
      if (toolRes && toolRes.ok) {
        try {
          const tj = JSON.parse(await toolRes.text())
          const ts = tj?.data?.totalUsage?.toolSummaryList
          if (Array.isArray(ts)) {
            tools = ts
              .map((t: any) => ({ name: String(t?.toolNameI18n || t?.toolName || t?.toolCode || "?"), count: Number(t?.totalUsageCount ?? 0) }))
              .filter((t: ToolUsage) => t.count > 0)
              .sort((a, b) => b.count - a.count)
          }
        } catch {
          /* ignore */
        }
      }
      const level = typeof data?.level === "string" ? data.level : undefined
      setUsage({ tokens: parseLimit("TOKENS_LIMIT"), mcp: parseLimit("TIME_LIMIT"), level, tokens24h, models, tools, fetchedAt: now })
    } catch (e: any) {
      setUsage({ error: e?.message ?? String(e), fetchedAt: now })
      log("error", "quota/limit 查询失败", { url: quotaUrl, error: e?.message ?? String(e) })
    }
  }

  dumpProviders()
  void refresh(true)
  timer = setInterval(() => void refresh(), 30000)

  let offIdle: (() => void) | undefined
  try {
    offIdle = api?.event?.on?.("session.idle", () => void refresh())
  } catch {
    /* ignore */
  }

  try {
    api?.lifecycle?.onDispose?.(() => {
      if (timer) clearInterval(timer)
      try {
        offIdle?.()
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }

  api.slots.register({
    order: 50,
    slots: {
      sidebar_content() {
        return <GlmSidebar api={api} usage={usage} />
      },
    },
  })
}

export default { id: "glm-usage", tui }
