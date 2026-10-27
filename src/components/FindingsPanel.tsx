import {
  ArrowRight,
  Check,
  CircleCheck,
  Container,
  HeartPulse,
  Info,
  Network,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Analysis, ComposeModel, ComposeService, Severity } from '../types'

type Filter = 'all' | Severity

const SEVERITY: Record<
  Severity,
  {
    label: string
    icon: LucideIcon
    text: string
    bg: string
    border: string
    dot: string
    bar: string
  }
> = {
  critical: {
    label: 'Critical',
    icon: ShieldAlert,
    text: 'text-crit',
    bg: 'bg-crit/10',
    border: 'border-crit/25',
    dot: 'bg-crit',
    bar: 'bg-crit',
  },
  warning: {
    label: 'Warning',
    icon: TriangleAlert,
    text: 'text-warn',
    bg: 'bg-warn/10',
    border: 'border-warn/25',
    dot: 'bg-warn',
    bar: 'bg-warn',
  },
  info: {
    label: 'Info',
    icon: Info,
    text: 'text-info',
    bg: 'bg-info/10',
    border: 'border-info/25',
    dot: 'bg-info',
    bar: 'bg-info',
  },
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[54px_minmax(0,1fr)] items-start gap-2 py-[3px]">
      <span className="pt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">
        {label}
      </span>
      <div className="min-w-0 font-mono text-[10px] leading-relaxed text-slate-400">
        {children}
      </div>
    </div>
  )
}

function Chips({
  values,
  max = 4,
  empty = 'none',
  title,
}: {
  values: string[]
  max?: number
  empty?: string
  title?: (value: string) => string
}) {
  if (values.length === 0) return <span className="text-slate-600">{empty}</span>
  const visible = values.slice(0, max)
  const rest = values.length - visible.length
  return (
    <span className="flex flex-wrap gap-1">
      {visible.map((value) => (
        <span
          key={value}
          title={title?.(value) ?? value}
          className="max-w-full truncate rounded border border-white/[0.07] bg-white/[0.035] px-1.5 py-0.5 text-[9.5px] text-slate-400"
        >
          {value}
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded px-1 py-0.5 text-[9.5px] text-slate-600">+{rest}</span>
      )}
    </span>
  )
}

function ServiceCard({
  service,
  analysis,
  onClear,
}: {
  service: ComposeService
  analysis: Analysis
  onClear: () => void
}) {
  const findings = analysis.findings.filter((finding) => finding.service === service.name)
  const counts = {
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    warning: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  }
  const envKeys = Object.keys(service.environment)

  return (
    <div className="mx-4 mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025]">
      <div className="flex items-start gap-2.5 border-b border-white/[0.06] px-3 py-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04]">
          <Container size={14} className="text-acid/80" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[12.5px] font-semibold text-slate-100">
              {service.name}
            </h3>
            {service.privileged && (
              <span className="rounded border border-crit/25 bg-crit/10 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide text-crit">
                privileged
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-[9.5px] text-slate-500">
            {service.image ?? (service.build ? `build: ${service.build}` : 'no image')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear service selection"
          className="rounded p-1 text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2">
        <DetailRow label="Ports">
          <Chips
            values={service.ports.map((port) => port.raw)}
            max={3}
            empty="none published"
          />
        </DetailRow>
        <DetailRow label="Volumes">
          <Chips
            values={service.volumes.map((volume) => volume.raw)}
            max={3}
            empty="none"
            title={(value) => value}
          />
        </DetailRow>
        <DetailRow label="Env">
          <Chips
            values={envKeys}
            max={6}
            empty="none"
            title={(value) => `${value} (value hidden)`}
          />
        </DetailRow>
        <DetailRow label="Needs">
          <Chips values={service.dependsOn} max={5} empty="no dependencies" />
        </DetailRow>
        <DetailRow label="Networks">
          <Chips values={service.networks} max={3} empty="default" />
        </DetailRow>
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.06] px-3 py-2 text-[9.5px]">
        <span
          className={`inline-flex items-center gap-1 ${
            service.healthcheck ? 'text-acid/80' : 'text-warn/80'
          }`}
        >
          <HeartPulse size={10} />
          {service.healthcheck ? 'healthcheck' : 'no healthcheck'}
        </span>
        <span className="inline-flex items-center gap-1 text-slate-500">
          <RotateCcw size={10} />
          {service.restart ?? 'no restart'}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {counts.critical > 0 && (
            <span className="inline-flex items-center gap-1 text-crit">
              <span className="h-1 w-1 rounded-full bg-crit" />
              {counts.critical}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="inline-flex items-center gap-1 text-warn">
              <span className="h-1 w-1 rounded-full bg-warn" />
              {counts.warning}
            </span>
          )}
          {counts.info > 0 && (
            <span className="inline-flex items-center gap-1 text-info">
              <span className="h-1 w-1 rounded-full bg-info" />
              {counts.info}
            </span>
          )}
          {findings.length === 0 && <span className="text-acid/70">clean</span>}
        </span>
      </div>
    </div>
  )
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Warning' },
  { id: 'info', label: 'Info' },
]

interface FindingsPanelProps {
  analysis: Analysis | null
  model: ComposeModel | null
  selectedService: string | null
  onClearService: () => void
}

export function FindingsPanel({
  analysis,
  model,
  selectedService,
  onClearService,
}: FindingsPanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const service = useMemo(
    () => model?.services.find((candidate) => candidate.name === selectedService) ?? null,
    [model, selectedService],
  )

  const scoped = useMemo(() => {
    if (!analysis) return []
    return service
      ? analysis.findings.filter((finding) => finding.service === service.name)
      : analysis.findings
  }, [analysis, service])

  const visible = filter === 'all' ? scoped : scoped.filter((finding) => finding.severity === filter)

  return (
    <aside className="flex h-full min-h-0 flex-col border-t border-white/[0.06] bg-panel/40 lg:border-t-0 lg:border-l">
      <div className="shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-4 xl:px-5 xl:pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Review
          </h2>
          {analysis && (
            <span className="font-mono text-[10px] text-slate-600">
              {analysis.findings.length} finding{analysis.findings.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-slate-600">
          {service
            ? `Focused on ${service.name}. Click the canvas to clear.`
            : 'Ports, secrets, startup order and the settings that bite in production.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const active = filter === item.id
            const count =
              item.id === 'all'
                ? scoped.length
                : scoped.filter((finding) => finding.severity === item.id).length
            const dot = item.id === 'all' ? 'bg-slate-500' : SEVERITY[item.id].dot
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
                  active
                    ? 'border-white/20 bg-white/[0.08] text-slate-100'
                    : 'border-transparent bg-white/[0.025] text-slate-500 hover:bg-white/[0.05] hover:text-slate-300',
                ].join(' ')}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                {item.label}
                <span className="font-mono text-[9px] text-slate-600">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto pb-5">
        {service && analysis && (
          <ServiceCard service={service} analysis={analysis} onClear={onClearService} />
        )}

        {!analysis ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025]">
              <Network size={18} className="text-slate-600" strokeWidth={1.6} />
            </div>
            <p className="mt-3 text-[11.5px] font-medium text-slate-400">No review yet</p>
            <p className="mt-1 max-w-[220px] text-[10.5px] leading-relaxed text-slate-600">
              Fix the YAML or open a sample to see the service review.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-acid/20 bg-acid/[0.05]">
              <CircleCheck size={19} className="text-acid/80" strokeWidth={1.7} />
            </div>
            <p className="mt-3 text-[11.5px] font-medium text-slate-300">
              {scoped.length === 0
                ? 'No findings from these rules'
                : 'Nothing at this severity'}
            </p>
            <p className="mt-1 max-w-[230px] text-[10.5px] leading-relaxed text-slate-600">
              {scoped.length === 0
                ? 'The stack is tidy. This is a static check, not a security audit.'
                : 'Switch the filter to see the rest of the review.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 px-4 pt-3 xl:px-5">
            {visible.map((finding) => {
              const severity = SEVERITY[finding.severity]
              const Icon = severity.icon
              return (
                <article
                  key={finding.id}
                  className="group relative overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 pl-3.5 transition-colors hover:border-white/[0.11] hover:bg-white/[0.035]"
                >
                  <span className={`absolute inset-y-0 left-0 w-[2px] ${severity.bar} opacity-70`} />
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${severity.border} ${severity.bg}`}
                    >
                      <Icon size={11} className={severity.text} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h3 className="min-w-0 flex-1 text-[11.5px] font-semibold leading-snug text-slate-200">
                          {finding.title}
                        </h3>
                        {finding.service && (
                          <span className="shrink-0 rounded border border-white/[0.07] bg-black/20 px-1.5 py-px font-mono text-[8.5px] text-slate-500">
                            {finding.service}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                        {finding.detail}
                      </p>
                      <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-relaxed text-slate-400">
                        <ArrowRight
                          size={10}
                          className={`mt-[3px] shrink-0 ${severity.text} opacity-70`}
                        />
                        <span>
                          <span className="font-medium text-slate-500">Fix: </span>
                          {finding.fix}
                        </span>
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {analysis && analysis.findings.length > 0 && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 xl:mx-5">
            <Check size={11} className="mt-0.5 shrink-0 text-slate-600" />
            <p className="text-[9.5px] leading-relaxed text-slate-600">
              Static review of common footguns. Lock contention, image CVEs and runtime
              behaviour depend on your host and workload.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
