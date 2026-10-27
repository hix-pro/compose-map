import { parse } from 'yaml'
import type {
  ComposePort,
  ComposeService,
  ComposeVolume,
  ParseResult,
} from '../types'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function normalizeEnvironment(value: unknown): Record<string, string | null> {
  const environment: Record<string, string | null> = {}
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue
      const separator = entry.indexOf('=')
      if (separator === -1) {
        environment[entry] = null
      } else {
        environment[entry.slice(0, separator)] = entry.slice(separator + 1)
      }
    }
    return environment
  }

  const record = asRecord(value)
  if (!record) return environment
  for (const [key, raw] of Object.entries(record)) {
    environment[key] = raw === null || raw === undefined ? null : String(raw)
  }
  return environment
}

function normalizeLabels(value: unknown): Record<string, string> {
  const labels: Record<string, string> = {}
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') continue
      const separator = entry.indexOf('=')
      if (separator === -1) labels[entry] = ''
      else labels[entry.slice(0, separator)] = entry.slice(separator + 1)
    }
    return labels
  }
  const record = asRecord(value)
  if (!record) return labels
  for (const [key, raw] of Object.entries(record)) {
    labels[key] = raw === null || raw === undefined ? '' : String(raw)
  }
  return labels
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  const record = asRecord(value)
  return record ? Object.keys(record) : []
}

function parseShortPort(raw: string): ComposePort {
  let text = raw.trim()
  let protocol: string | undefined
  const slash = text.lastIndexOf('/')
  if (slash > 0) {
    protocol = text.slice(slash + 1)
    text = text.slice(0, slash)
  }

  let hostIp: string | undefined
  if (text.startsWith('[')) {
    const close = text.indexOf(']')
    if (close > 0) {
      hostIp = text.slice(1, close)
      text = text.slice(close + 1).replace(/^:/, '')
    }
  }

  const parts = text.split(':')
  let hostPort: string | undefined
  let containerPort = text
  if (parts.length === 2) {
    hostPort = parts[0]
    containerPort = parts[1]
  } else if (parts.length >= 3) {
    if (!hostIp) hostIp = parts.slice(0, -2).join(':')
    hostPort = parts.at(-2)
    containerPort = parts.at(-1) ?? text
  }

  return {
    raw,
    hostIp,
    hostPort,
    containerPort,
    protocol,
  }
}

function normalizePort(value: unknown): ComposePort {
  if (typeof value === 'number') {
    return { raw: String(value), containerPort: String(value) }
  }
  if (typeof value === 'string') return parseShortPort(value)

  const record = asRecord(value)
  if (record) {
    const target = asString(record.target) ?? 'unknown'
    const published = asString(record.published)
    const hostIp = asString(record.host_ip)
    const protocol = asString(record.protocol)
    return {
      raw: `${hostIp ? `${hostIp}:` : ''}${published ? `${published}:` : ''}${target}`,
      hostIp,
      hostPort: published,
      containerPort: target,
      protocol,
    }
  }

  return { raw: String(value), containerPort: String(value) }
}

function parseShortVolume(raw: string): ComposeVolume {
  const parts = raw.split(':')
  if (parts.length === 1) {
    return { raw, target: parts[0], kind: 'anonymous' }
  }
  if (parts.length === 2) {
    const [source, target] = parts
    const kind =
      source.startsWith('.') || source.startsWith('/') || source.startsWith('~')
        ? 'bind'
        : 'volume'
    return { raw, source, target, kind }
  }
  const [source, target, ...rest] = parts
  const kind =
    source.startsWith('.') || source.startsWith('/') || source.startsWith('~')
      ? 'bind'
      : 'volume'
  return { raw, source, target, mode: rest.join(':'), kind }
}

function normalizeVolume(value: unknown): ComposeVolume {
  if (typeof value === 'string') return parseShortVolume(value)

  const record = asRecord(value)
  if (record) {
    const type = asString(record.type)
    const source = asString(record.source)
    const target = asString(record.target)
    const readOnly = asBoolean(record.read_only)
    let kind: ComposeVolume['kind'] = 'unknown'
    if (type === 'bind') kind = 'bind'
    else if (type === 'volume') kind = source ? 'volume' : 'anonymous'
    else if (source?.startsWith('.') || source?.startsWith('/')) kind = 'bind'
    return {
      raw: [source, target].filter(Boolean).join(':'),
      source,
      target,
      mode: readOnly ? 'ro' : undefined,
      kind,
    }
  }

  return { raw: String(value), kind: 'unknown' }
}

function parseService(name: string, value: unknown): ComposeService {
  const record = asRecord(value) ?? {}
  const buildValue = record.build
  const buildRecord = asRecord(buildValue)
  const build = buildRecord
    ? asString(buildRecord.context) ?? 'build'
    : asString(buildValue)

  const healthcheckRecord = asRecord(record.healthcheck)
  const healthcheckTest = healthcheckRecord?.test
  const disabled =
    asBoolean(healthcheckRecord?.disable) ||
    (Array.isArray(healthcheckTest) && healthcheckTest[0] === 'NONE')

  const networks = normalizeList(record.networks)

  return {
    name,
    image: asString(record.image),
    build,
    command: Array.isArray(record.command)
      ? record.command.map(String).join(' ')
      : asString(record.command),
    ports: Array.isArray(record.ports) ? record.ports.map(normalizePort) : [],
    volumes: Array.isArray(record.volumes)
      ? record.volumes.map(normalizeVolume)
      : [],
    environment: normalizeEnvironment(record.environment),
    envFiles: normalizeList(record.env_file),
    dependsOn: normalizeList(record.depends_on),
    networks: networks.length > 0 ? networks : ['default'],
    healthcheck: Boolean(healthcheckRecord) && !disabled,
    restart: asString(record.restart),
    privileged: asBoolean(record.privileged),
    networkMode: asString(record.network_mode),
    containerName: asString(record.container_name),
    labels: normalizeLabels(record.labels),
    raw: record,
  }
}

export function parseCompose(text: string, sourceName?: string): ParseResult {
  if (!text.trim()) {
    return { model: null, error: 'Paste a Compose file or drop one to get started.' }
  }

  let document: unknown
  try {
    document = parse(text, { strict: true, uniqueKeys: true })
  } catch (error) {
    return {
      model: null,
      error: error instanceof Error ? error.message : 'Could not parse this YAML file.',
    }
  }

  const root = asRecord(document)
  if (!root) {
    return { model: null, error: 'A Compose file must be a YAML object.' }
  }

  const serviceMap = asRecord(root.services)
  if (!serviceMap || Object.keys(serviceMap).length === 0) {
    return {
      model: null,
      error: 'No services found. Add a services: block with at least one service.',
    }
  }

  const services = Object.entries(serviceMap).map(([name, value]) =>
    parseService(name, value),
  )

  return {
    model: {
      name: asString(root.name),
      sourceName,
      services,
      networks: normalizeList(root.networks),
      volumes: normalizeList(root.volumes),
    },
    error: null,
  }
}
