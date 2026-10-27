import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Boxes,
  Braces,
  Check,
  Container,
  Database,
  Globe2,
  HardDrive,
  HeartPulse,
  Info,
  Network,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import type { ServiceNode } from '../types'

const TONE = {
  critical: {
    bar: 'bg-crit',
    dot: 'bg-crit',
    dotRing: 'shadow-[0_0_0_4px_rgba(255,107,107,0.12)]',
    pill: 'bg-crit/10 text-crit border-crit/25',
    border: 'border-crit/45',
  },
  warning: {
    bar: 'bg-warn',
    dot: 'bg-warn',
    dotRing: 'shadow-[0_0_0_4px_rgba(255,180,84,0.12)]',
    pill: 'bg-warn/10 text-warn border-warn/25',
    border: 'border-warn/40',
  },
  info: {
    bar: 'bg-info',
    dot: 'bg-info',
    dotRing: 'shadow-[0_0_0_4px_rgba(125,211,252,0.12)]',
    pill: 'bg-info/10 text-info border-info/25',
    border: 'border-info/35',
  },
  clean: {
    bar: 'bg-acid/70',
    dot: 'bg-acid',
    dotRing: 'shadow-[0_0_0_4px_rgba(198,245,110,0.10)]',
    pill: 'bg-acid/10 text-acid border-acid/25',
    border: 'border-white/10',
  },
} as const

function serviceIcon(image?: string, build?: string): LucideIcon {
  const value = `${image ?? ''} ${build ?? ''}`.toLowerCase()
  if (/postgres|mysql|maria|mongo|redis|valkey|clickhouse|sqlite|database/.test(value)) {
    return Database
  }
  if (/nginx|traefik|caddy|httpd|haproxy|envoy/.test(value)) return Globe2
  if (/worker|queue|rabbit|kafka|sidekiq|consumer/.test(value)) return Boxes
  return Container
}

export function ServiceNodeCard({ data, selected }: NodeProps<ServiceNode>) {
  const { service, criticalCount, warningCount, infoCount } = data
  const tone =
    criticalCount > 0
      ? TONE.critical
      : warningCount > 0
        ? TONE.warning
        : infoCount > 0
          ? TONE.info
          : TONE.clean
  const Icon = serviceIcon(service.image, service.build)
  const subtitle = service.image ?? (service.build ? `build: ${service.build}` : 'no image')

  return (
    <div
      style={{ width: 270, height: 138 }}
      className={[
        'group relative overflow-hidden rounded-[14px] border bg-node/95 backdrop-blur-sm',
        'transition-[border-color,box-shadow] duration-150',
        selected
          ? 'border-acid/70 shadow-[0_0_0_1px_rgba(198,245,110,0.35),0_20px_50px_-16px_rgba(198,245,110,0.35)]'
          : `${tone.border} shadow-[0_14px_34px_-20px_rgba(0,0,0,0.9)] hover:border-white/25`,
      ].join(' ')}
    >
      <div className={`absolute inset-x-0 top-0 h-[2px] ${tone.bar}`} />
      <div className="flex h-full flex-col px-[14px] pt-[15px] pb-[12px]">
        <div className="flex items-center gap-2">
          <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone.dot} ${tone.dotRing}`} />
          <Icon size={13} className="shrink-0 text-slate-500" strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-slate-50">
            {service.name}
          </span>
          {criticalCount + warningCount + infoCount > 0 ? (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${tone.pill}`}
              title={`${criticalCount} critical, ${warningCount} warning, ${infoCount} info`}
            >
              {criticalCount > 0 ? (
                <ShieldAlert size={9} strokeWidth={2.2} />
              ) : warningCount > 0 ? (
                <TriangleAlert size={9} strokeWidth={2.2} />
              ) : (
                <Info size={9} strokeWidth={2.2} />
              )}
              {criticalCount + warningCount + infoCount}
            </span>
          ) : (
            <Check size={12} className="shrink-0 text-acid/80" strokeWidth={2.4} />
          )}
        </div>

        <div className="mt-[6px] truncate pl-[21px] font-mono text-[10px] leading-none text-slate-500">
          {subtitle}
        </div>

        <div className="my-[10px] h-px w-full bg-white/[0.06]" />

        <div className="flex items-center gap-3 text-[9.5px] text-slate-500">
          {service.ports.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Network size={10} strokeWidth={1.8} />
              {service.ports.length} port{service.ports.length === 1 ? '' : 's'}
            </span>
          )}
          {service.volumes.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <HardDrive size={10} strokeWidth={1.8} />
              {service.volumes.length} vol{service.volumes.length === 1 ? '' : 's'}
            </span>
          )}
          {Object.keys(service.environment).length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Braces size={10} strokeWidth={1.8} />
              {Object.keys(service.environment).length} env
            </span>
          )}
          {service.ports.length + service.volumes.length + Object.keys(service.environment).length === 0 && (
            <span className="inline-flex items-center gap-1">
              <Boxes size={10} strokeWidth={1.8} />
              no inputs
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2.5 text-[9.5px]">
          <span
            className={`inline-flex min-w-0 items-center gap-1 ${
              service.healthcheck ? 'text-slate-400' : 'text-warn/80'
            }`}
          >
            <HeartPulse size={10} strokeWidth={1.9} className="shrink-0" />
            <span className="truncate">{service.healthcheck ? 'healthcheck' : 'no healthcheck'}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 text-slate-500">
            <RotateCcw size={10} strokeWidth={1.9} className="shrink-0" />
            <span className="truncate">{service.restart ?? 'no restart'}</span>
          </span>
          {service.dependsOn.length > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-slate-500">
              <Waypoints size={10} strokeWidth={1.9} />
              {service.dependsOn.length}
            </span>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}
