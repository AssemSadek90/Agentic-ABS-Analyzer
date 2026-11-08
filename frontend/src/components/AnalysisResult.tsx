"use client"

import {
  CaretDown,
  ChartBar,
  CheckCircle,
  Flag,
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
  XCircle
} from "@phosphor-icons/react"

import { Badge } from "@/components/ui/badge"
import { StatusBadge, type Severity } from "@/components/StatusBadge"
import { formatDateTime, formatEur, formatMonths, formatPct } from "@/lib/format"
import type { AnalyzeResponse, BreakdownDTO, RuleResultDTO } from "@/lib/types"

const STATUS_LABEL: Record<string, string> = {
  success: "Success",
  partial: "Partial",
  failed: "Failed"
}

function SectionHeading({
  icon,
  badge,
  children
}: {
  icon?: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {badge}
    </div>
  )
}

const FAIL_ICON_COLOR: Record<RuleResultDTO["severity"], string> = {
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info"
}

const SEVERITY_RANK: Record<RuleResultDTO["severity"], number> = { error: 0, warning: 1, info: 2 }

// Deterministic compliance checks: failures first (by severity), then passes.
function RuleResults({ rules }: { rules: RuleResultDTO[] }) {
  const sorted = [...rules].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.ruleCode.localeCompare(b.ruleCode)
  })
  const failedCount = rules.filter((r) => !r.passed).length

  return (
    <section>
      <SectionHeading
        icon={<ShieldCheck size={16} className="text-primary" weight="duotone" />}
        badge={<Badge variant="muted">deterministic</Badge>}
      >
        Compliance checks
      </SectionHeading>
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          Threshold checks computed in code, identical for every model.{" "}
          <span className="font-mono">
            {rules.length - failedCount} passed · {failedCount} failed
          </span>
        </div>
        <ul className="divide-y divide-border">
          {sorted.map((rule) => (
            <li key={rule.ruleCode} className="flex items-start gap-3 px-4 py-3">
              {rule.passed ? (
                <CheckCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-success" />
              ) : (
                <XCircle
                  size={18}
                  weight="duotone"
                  className={`mt-0.5 shrink-0 ${FAIL_ICON_COLOR[rule.severity]}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{rule.ruleCode}</span>
                  {!rule.passed && <StatusBadge severity={rule.severity}>{rule.severity}</StatusBadge>}
                </div>
                <p className="mt-1 text-sm text-foreground">{rule.message}</p>
              </div>
              {rule.observedValue !== null && rule.thresholdValue !== null && (
                <div className="shrink-0 text-right font-mono text-xs">
                  <div className={rule.passed ? "text-foreground" : FAIL_ICON_COLOR[rule.severity]}>
                    {formatPct(rule.observedValue)}
                  </div>
                  <div className="text-muted-foreground">limit {formatPct(rule.thresholdValue)}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl text-foreground">{value}</div>
    </div>
  )
}

function BreakdownBars({ title, data }: { title: string; data: Record<string, BreakdownDTO> }) {
  const rows = Object.entries(data).sort((a, b) => b[1].pct - a[1].pct)
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-3">
        {rows.map(([key, b]) => (
          <div key={key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">{key}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {b.count} · {formatPct(b.pct, 1)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, b.pct * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AnalysisResult({ result }: { result: AnalyzeResponse }) {
  const { run, validationErrors, analysis } = result
  const ruleResults = result.ruleResults ?? []
  const errorCount = validationErrors.length

  return (
    <div className="space-y-6">
      {/* Run summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <StatusBadge severity={run.status as Severity}>{STATUS_LABEL[run.status]}</StatusBadge>
          <span className="text-sm text-foreground">{run.filename ?? "Pasted data"}</span>
        </div>
        <div className="flex items-center gap-3">
          {analysis?.model && (
            <Badge variant="muted" className="font-mono" title="Model that produced the qualitative analysis">
              {analysis.model}
            </Badge>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {run.validRowCount}/{run.rowCount} rows valid · {formatDateTime(run.createdAt)}
          </span>
        </div>
      </div>

      {analysis ? (
        <>
          {/* Executive summary */}
          <section className="rounded-lg border border-border bg-card p-5">
            <SectionHeading>Executive summary</SectionHeading>
            <p className="max-w-[70ch] text-[15px] leading-relaxed text-foreground">
              {analysis.executiveSummary}
            </p>
          </section>

          {/* Key metrics */}
          <section>
            <SectionHeading icon={<ChartBar size={16} className="text-primary" weight="duotone" />}>
              Key metrics
            </SectionHeading>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <MetricTile label="Pool volume" value={formatEur(analysis.totalPoolVolume)} />
              <MetricTile label="Weighted avg rate" value={formatPct(analysis.weightedAvgRate)} />
              <MetricTile label="Delinquency rate" value={formatPct(analysis.delinquencyRate)} />
              <MetricTile label="Avg remaining tenor" value={formatMonths(analysis.avgRemainingTenor)} />
              <MetricTile label="Top-5 concentration" value={formatPct(analysis.concentrationTop5)} />
              <MetricTile
                label="Weighted avg LTV"
                value={analysis.weightedAvgLtv === null ? "N/A" : formatPct(analysis.weightedAvgLtv)}
              />
              {analysis.obligorTop1 != null && (
                <MetricTile label="Top obligor" value={formatPct(analysis.obligorTop1)} />
              )}
              {analysis.obligorTop5 != null && (
                <MetricTile label="Top 5 obligors" value={formatPct(analysis.obligorTop5)} />
              )}
            </div>
          </section>

          {/* Deterministic compliance checks (above the AI sections by design) */}
          {ruleResults.length > 0 && <RuleResults rules={ruleResults} />}

          {/* ESMA flags */}
          <section>
            <SectionHeading
              icon={<Flag size={16} className="text-primary" weight="duotone" />}
              badge={<Badge variant="muted">AI assessment</Badge>}
            >
              ESMA compliance flags
            </SectionHeading>
            {analysis.esmaFlags.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
                No ESMA disclosure issues flagged.
              </p>
            ) : (
              <ul className="space-y-2">
                {analysis.esmaFlags.map((flag, i) => (
                  <li
                    key={`${flag.code}-${i}`}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-4"
                  >
                    <StatusBadge severity={flag.severity}>{flag.severity}</StatusBadge>
                    <span className="font-mono text-xs text-muted-foreground">{flag.code}</span>
                    <p className="w-full text-sm text-foreground">{flag.message}</p>
                    <span className="text-xs text-muted-foreground">
                      {flag.affectedRows} {flag.affectedRows === 1 ? "asset" : "assets"} affected
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Risk signals */}
          <section>
            <SectionHeading
              icon={<ShieldWarning size={16} className="text-primary" weight="duotone" />}
              badge={<Badge variant="muted">AI assessment</Badge>}
            >
              Risk signals
            </SectionHeading>
            {analysis.riskSignals.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
                No risk signals identified.
              </p>
            ) : (
              <ul className="space-y-2">
                {analysis.riskSignals.map((signal, i) => (
                  <li key={`${signal.type}-${i}`} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge severity={signal.severity}>{signal.severity}</StatusBadge>
                      <span className="text-sm font-medium text-foreground">{signal.type}</span>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{signal.description}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Recommendation: </span>
                      {signal.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Breakdowns */}
          <section>
            <SectionHeading>Composition</SectionHeading>
            <div className="grid gap-3 md:grid-cols-2">
              <BreakdownBars title="Asset type" data={analysis.assetTypeBreakdown} />
              <BreakdownBars title="Country" data={analysis.countryBreakdown} />
            </div>
          </section>
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-5">
          <WarningCircle size={20} className="mt-0.5 shrink-0 text-destructive" weight="duotone" />
          <div>
            <p className="text-sm font-medium text-foreground">No analysis produced</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every row failed validation, so no metrics or AI analysis were generated. Fix the issues
              below and re-run.
            </p>
          </div>
        </div>
      )}

      {/* Validation report */}
      <section>
        <SectionHeading icon={<WarningCircle size={16} className="text-primary" weight="duotone" />}>
          Validation report
        </SectionHeading>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-foreground">
              <span className="font-mono">{run.validRowCount}</span> valid
            </span>
            <span className="text-muted-foreground">
              <span className="font-mono">{errorCount}</span>{" "}
              {errorCount === 1 ? "error" : "errors"} skipped
            </span>
          </div>

          {errorCount > 0 && (
            <details className="group mt-3">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary">
                <CaretDown size={14} weight="bold" className="transition-transform group-open:rotate-180" />
                Show skipped rows
              </summary>
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {validationErrors.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">row {e.rowNumber}</span>
                    {e.assetId && (
                      <span className="font-mono text-xs text-muted-foreground">{e.assetId}</span>
                    )}
                    <Badge variant="muted">{e.field}</Badge>
                    <span className="text-foreground">{e.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </div>
  )
}
