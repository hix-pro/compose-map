import type {
  Analysis,
  ComposeModel,
  ComposePort,
  ComposeService,
  ComposeVolume,
  Finding,
  Severity,
} from '../types'

export interface FieldChange {
  field: string
  before: string
  after: string
}

export interface ServiceChange {
  name: string
  changes: FieldChange[]
}

export interface FindingChange {
  key: string
  before: Finding
  after: Finding
}

export interface ComposeDiff {
  services: {
    added: string[]
    removed: string[]
    changed: ServiceChange[]
  }
  findings: {
    introduced: Finding[]
    resolved: Finding[]
    changed: FindingChange[]
  }
  networks: {
    added: string[]
    removed: string[]
  }
  volumes: {
    added: string[]
    removed: string[]
  }
  counts: {
    servicesAdded: number
    servicesRemoved: number
    servicesChanged: number
    findingsIntroduced: number
    findingsResolved: number
  }
  hasChanges: boolean
}

const SECRET_KEY = /(secret|token|passw|api[_-]?key|private[_-]?key|credential|auth)/i
const VARIABLE = /\$\{[^}]+\}/

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function listChanges(field: string, before: string[], after: string[]): FieldChange[] {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  const changes: FieldChange[] = []
  for (const value of sorted(beforeSet)) {
    if (!afterSet.has(value)) changes.push({ field, before: value, after: '—' })
  }
  for (const value of sorted(afterSet)) {
    if (!beforeSet.has(value)) changes.push({ field, before: '—', after: value })
  }
  return changes
}

function scalarChange(
  field: string,
  before: string | undefined,
  after: string | undefined,
): FieldChange[] {
  if ((before ?? '') === (after ?? '')) return []
  return [{ field, before: before ?? '—', after: after ?? '—' }]
}

function portKey(port: ComposePort): string {
  return [port.hostIp ?? '', port.hostPort ?? '', port.containerPort, port.protocol ?? ''].join(
    '|',
  )
}

function volumeKey(volume: ComposeVolume): string {
  return [volume.kind, volume.source ?? '', volume.target ?? '', volume.mode ?? ''].join('|')
}

function environmentValue(key: string, value: string | null): string {
  if (value === null) return '(from host)'
  if (SECRET_KEY.test(key) && !VARIABLE.test(value) && value.trim()) return '•••• (hidden)'
  return value
}

function serviceChanges(before: ComposeService, after: ComposeService): FieldChange[] {
  const changes: FieldChange[] = [
    ...scalarChange('image', before.image, after.image),
    ...scalarChange('build', before.build, after.build),
    ...scalarChange('command', before.command, after.command),
    ...scalarChange(
      'privileged',
      before.privileged ? 'true' : 'false',
      after.privileged ? 'true' : 'false',
    ),
    ...scalarChange('network_mode', before.networkMode, after.networkMode),
    ...scalarChange('container_name', before.containerName, after.containerName),
    ...scalarChange('restart', before.restart, after.restart),
    ...scalarChange(
      'healthcheck',
      before.healthcheck ? 'configured' : 'none',
      after.healthcheck ? 'configured' : 'none',
    ),
    ...listChanges(
      'ports',
      before.ports.map((port) => port.raw),
      after.ports.map((port) => port.raw),
    ),
    ...listChanges(
      'volumes',
      before.volumes.map((volume) => volume.raw),
      after.volumes.map((volume) => volume.raw),
    ),
    ...listChanges('env_file', sorted(before.envFiles), sorted(after.envFiles)),
    ...listChanges('depends_on', sorted(before.dependsOn), sorted(after.dependsOn)),
    ...listChanges('networks', sorted(before.networks), sorted(after.networks)),
  ]

  // Compare ports and volumes semantically as well, so a long-syntax entry and
  // its short-syntax equivalent do not show up as a change.
  const beforePortKeys = new Set(before.ports.map(portKey))
  const afterPortKeys = new Set(after.ports.map(portKey))
  const portKeysEqual =
    beforePortKeys.size === afterPortKeys.size &&
    [...beforePortKeys].every((key) => afterPortKeys.has(key))
  if (portKeysEqual) {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      if (changes[index].field === 'ports') changes.splice(index, 1)
    }
  }

  const beforeVolumeKeys = new Set(before.volumes.map(volumeKey))
  const afterVolumeKeys = new Set(after.volumes.map(volumeKey))
  const volumeKeysEqual =
    beforeVolumeKeys.size === afterVolumeKeys.size &&
    [...beforeVolumeKeys].every((key) => afterVolumeKeys.has(key))
  if (volumeKeysEqual) {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      if (changes[index].field === 'volumes') changes.splice(index, 1)
    }
  }

  const environmentKeys = sorted(
    new Set([
      ...Object.keys(before.environment),
      ...Object.keys(after.environment),
    ]),
  )
  for (const key of environmentKeys) {
    const had = Object.prototype.hasOwnProperty.call(before.environment, key)
    const has = Object.prototype.hasOwnProperty.call(after.environment, key)
    if (!had) {
      changes.push({
        field: `environment.${key}`,
        before: '—',
        after: environmentValue(key, after.environment[key]),
      })
      continue
    }
    if (!has) {
      changes.push({
        field: `environment.${key}`,
        before: environmentValue(key, before.environment[key]),
        after: '—',
      })
      continue
    }
    const beforeValue = environmentValue(key, before.environment[key])
    const afterValue = environmentValue(key, after.environment[key])
    if (before.environment[key] !== after.environment[key]) {
      changes.push({ field: `environment.${key}`, before: beforeValue, after: afterValue })
    }
  }

  return changes.sort(
    (a, b) =>
      a.field.localeCompare(b.field) ||
      a.before.localeCompare(b.before) ||
      a.after.localeCompare(b.after),
  )
}

function findingKey(finding: Finding): string {
  return [finding.rule, finding.service ?? 'stack', finding.title].join('|')
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.service ?? '').localeCompare(b.service ?? '') ||
      a.title.localeCompare(b.title),
  )
}

export function diffCompose(
  beforeModel: ComposeModel,
  afterModel: ComposeModel,
  beforeAnalysis: Analysis,
  afterAnalysis: Analysis,
): ComposeDiff {
  const beforeServices = new Map(
    beforeModel.services.map((service) => [service.name, service]),
  )
  const afterServices = new Map(
    afterModel.services.map((service) => [service.name, service]),
  )

  const added = sorted(
    [...afterServices.keys()].filter((name) => !beforeServices.has(name)),
  )
  const removed = sorted(
    [...beforeServices.keys()].filter((name) => !afterServices.has(name)),
  )
  const changed: ServiceChange[] = []
  for (const name of sorted(
    [...beforeServices.keys()].filter((key) => afterServices.has(key)),
  )) {
    const changes = serviceChanges(
      beforeServices.get(name) as ComposeService,
      afterServices.get(name) as ComposeService,
    )
    if (changes.length > 0) changed.push({ name, changes })
  }

  const beforeFindings = new Map(
    beforeAnalysis.findings.map((finding) => [findingKey(finding), finding]),
  )
  const afterFindings = new Map(
    afterAnalysis.findings.map((finding) => [findingKey(finding), finding]),
  )
  const introduced = sortFindings(
    [...afterFindings.entries()]
      .filter(([key]) => !beforeFindings.has(key))
      .map(([, finding]) => finding),
  )
  const resolved = sortFindings(
    [...beforeFindings.entries()]
      .filter(([key]) => !afterFindings.has(key))
      .map(([, finding]) => finding),
  )
  const changedFindings: FindingChange[] = []
  for (const [key, after] of afterFindings) {
    const before = beforeFindings.get(key)
    if (before && before.severity !== after.severity) {
      changedFindings.push({ key, before, after })
    }
  }
  changedFindings.sort((a, b) => a.key.localeCompare(b.key))

  const networkBefore = sorted(beforeModel.networks)
  const networkAfter = sorted(afterModel.networks)
  const volumeBefore = sorted(beforeModel.volumes)
  const volumeAfter = sorted(afterModel.volumes)
  const networkAdded = networkAfter.filter((name) => !networkBefore.includes(name))
  const networkRemoved = networkBefore.filter((name) => !networkAfter.includes(name))
  const volumeAdded = volumeAfter.filter((name) => !volumeBefore.includes(name))
  const volumeRemoved = volumeBefore.filter((name) => !volumeAfter.includes(name))

  return {
    services: { added, removed, changed },
    findings: { introduced, resolved, changed: changedFindings },
    networks: { added: networkAdded, removed: networkRemoved },
    volumes: { added: volumeAdded, removed: volumeRemoved },
    counts: {
      servicesAdded: added.length,
      servicesRemoved: removed.length,
      servicesChanged: changed.length,
      findingsIntroduced: introduced.length,
      findingsResolved: resolved.length,
    },
    hasChanges:
      added.length > 0 ||
      removed.length > 0 ||
      changed.length > 0 ||
      introduced.length > 0 ||
      resolved.length > 0 ||
      changedFindings.length > 0 ||
      networkAdded.length > 0 ||
      networkRemoved.length > 0 ||
      volumeAdded.length > 0 ||
      volumeRemoved.length > 0,
  }
}

/** Human-readable change count, used by the compare dialog. */
export function diffLabel(diff: ComposeDiff): string {
  if (!diff.hasChanges) return 'No differences'
  const parts: string[] = []
  if (diff.counts.servicesAdded) parts.push(`${diff.counts.servicesAdded} added`)
  if (diff.counts.servicesRemoved) parts.push(`${diff.counts.servicesRemoved} removed`)
  if (diff.counts.servicesChanged) parts.push(`${diff.counts.servicesChanged} changed`)
  if (diff.counts.findingsIntroduced) {
    parts.push(
      `${diff.counts.findingsIntroduced} new finding${
        diff.counts.findingsIntroduced === 1 ? '' : 's'
      }`,
    )
  }
  if (diff.counts.findingsResolved) {
    parts.push(`${diff.counts.findingsResolved} resolved`)
  }
  return parts.join(' · ')
}
