import type {
  Analysis,
  ComposeModel,
  ComposeService,
  Finding,
  Severity,
} from '../types'

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const SECRET_KEY =
  /(secret|token|passw|api[_-]?key|private[_-]?key|credential|auth)/i
const PLACEHOLDER =
  /^(changeme|change-me|example|placeholder|password|secret|xxx+|your[-_].*|dev|test)$/i
const URL_WITH_CREDENTIALS = /:\/\/[^/\s:@]+:[^/\s@]+@/

function addFinding(
  findings: Finding[],
  severity: Severity,
  rule: string,
  title: string,
  detail: string,
  fix: string,
  service?: string,
): void {
  const id = [rule, service ?? 'stack', title, detail].join(':')
  if (findings.some((finding) => finding.id === id)) return
  findings.push({ id, rule, severity, service, title, detail, fix })
}

function imageTag(image: string): string | null {
  if (image.includes('@sha256:')) return null
  const lastSlash = image.lastIndexOf('/')
  const lastSegment = image.slice(lastSlash + 1)
  const colon = lastSegment.lastIndexOf(':')
  return colon === -1 ? null : lastSegment.slice(colon + 1)
}

function isPlaceholder(value: string | null): boolean {
  if (value === null) return true
  const trimmed = value.trim()
  if (!trimmed) return true
  if (/\$\{[^}]+\}/.test(trimmed)) return true
  if (/^<.+>$/.test(trimmed)) return true
  return PLACEHOLDER.test(trimmed)
}

function findCycle(services: ComposeService[]): string[] | null {
  const names = new Set(services.map((service) => service.name))
  const dependencies = new Map(
    services.map((service) => [
      service.name,
      service.dependsOn.filter((dependency) => names.has(dependency)),
    ]),
  )
  const visited = new Set<string>()
  const stack: string[] = []
  const onStack = new Set<string>()

  function visit(name: string): string[] | null {
    if (onStack.has(name)) {
      const start = stack.indexOf(name)
      return [...stack.slice(start), name]
    }
    if (visited.has(name)) return null
    visited.add(name)
    onStack.add(name)
    stack.push(name)
    for (const dependency of dependencies.get(name) ?? []) {
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    stack.pop()
    onStack.delete(name)
    return null
  }

  for (const service of services) {
    const cycle = visit(service.name)
    if (cycle) return cycle
  }
  return null
}

export function analyzeCompose(model: ComposeModel): Analysis {
  const findings: Finding[] = []
  const names = new Set(model.services.map((service) => service.name))

  for (const service of model.services) {
    if (!service.image && !service.build) {
      addFinding(
        findings,
        'critical',
        'no-image',
        'Service has no image or build',
        `${service.name} cannot start without an image or a build context.`,
        'Add an image tag or a build: section.',
        service.name,
      )
    }

    if (service.image) {
      const tag = imageTag(service.image)
      if (tag === null && !service.image.includes('@sha256:')) {
        addFinding(
          findings,
          'warning',
          'unpinned-image',
          'Image has no tag',
          `${service.image} defaults to the latest tag, so the next pull can change the running code.`,
          'Pin a version or digest, for example postgres:16.4 or name@sha256:…',
          service.name,
        )
      } else if (tag === 'latest') {
        addFinding(
          findings,
          'warning',
          'latest-image',
          'Image uses the latest tag',
          `${service.image} can change without a Compose file change, making deploys non-reproducible.`,
          'Pin a version or digest, for example nginx:1.27-alpine.',
          service.name,
        )
      }
    }

    if (service.privileged) {
      addFinding(
        findings,
        'critical',
        'privileged',
        'Container runs privileged',
        `${service.name} has privileged: true, which gives it almost all host capabilities.`,
        'Remove privileged: true and add only the specific capabilities the service needs.',
        service.name,
      )
    }

    if (service.networkMode === 'host') {
      addFinding(
        findings,
        'warning',
        'host-network',
        'Container uses host networking',
        `${service.name} shares the host network namespace, bypassing Compose network isolation.`,
        'Use a named network and publish only the ports that must be reachable.',
        service.name,
      )
      if (service.ports.length > 0) {
        addFinding(
          findings,
          'warning',
          'host-network-ports',
          'Ports are ignored in host mode',
          `The ports: entry on ${service.name} does nothing while network_mode is host.`,
          'Remove the ports: entry or switch to a bridge network.',
          service.name,
        )
      }
    }

    for (const volume of service.volumes) {
      if (volume.source?.includes('/var/run/docker.sock')) {
        addFinding(
          findings,
          'critical',
          'docker-socket',
          'Docker socket is mounted',
          `${service.name} can control the Docker daemon through ${volume.source}. A compromise of this container is a host compromise.`,
          'Avoid mounting docker.sock; use a narrow API proxy or a rootless builder if possible.',
          service.name,
        )
      }
    }

    for (const [key, value] of Object.entries(service.environment)) {
      if (value === null) continue
      const looksSecret = SECRET_KEY.test(key) || URL_WITH_CREDENTIALS.test(value)
      if (looksSecret && !isPlaceholder(value)) {
        addFinding(
          findings,
          'critical',
          'literal-secret',
          'Secret is hard-coded',
          `${service.name} stores ${key} directly in the Compose file. Compose files are often committed and shared.`,
          'Move the value to an ignored .env file or a secret manager, then reference it with ${VAR}.',
          service.name,
        )
      }
    }

    if (!service.healthcheck) {
      addFinding(
        findings,
        'warning',
        'no-healthcheck',
        'No healthcheck',
        `${service.name} has no healthcheck, so Compose cannot tell a running container from a ready one.`,
        'Add a healthcheck and let dependants wait for service_healthy.',
        service.name,
      )
    }

    if (!service.restart || service.restart === 'no') {
      addFinding(
        findings,
        'info',
        'no-restart',
        'No restart policy',
        `${service.name} will stay stopped after a crash or host reboot.`,
        'Set restart: unless-stopped for long-running services.',
        service.name,
      )
    }

    for (const port of service.ports) {
      if (!port.hostPort) continue
      if (!port.hostIp || port.hostIp === '0.0.0.0') {
        addFinding(
          findings,
          'info',
          'all-interfaces',
          'Port is published on all interfaces',
          `${service.name} publishes ${port.hostPort} → ${port.containerPort} on every host interface.`,
          'Bind to 127.0.0.1 when the port only needs to be local, or remove the host port.',
          service.name,
        )
      }
    }

    for (const dependency of service.dependsOn) {
      if (!names.has(dependency)) {
        addFinding(
          findings,
          'critical',
          'missing-dependency',
          'depends_on points at a missing service',
          `${service.name} depends on "${dependency}", but that service is not defined.`,
          'Add the service or remove it from depends_on.',
          service.name,
        )
      }
    }

    if (service.containerName) {
      addFinding(
        findings,
        'info',
        'container-name',
        'Fixed container name',
        `${service.name} fixes its container name to "${service.containerName}", which prevents scaling to more than one replica.`,
        'Remove container_name unless another tool requires it.',
        service.name,
      )
    }
  }

  const cycle = findCycle(model.services)
  if (cycle) {
    addFinding(
      findings,
      'critical',
      'dependency-cycle',
      'Circular depends_on',
      `The dependency graph contains a cycle: ${cycle.join(' → ')}.`,
      'Remove one depends_on edge or use a shared network instead of a startup dependency.',
    )
  }

  findings.sort((a, b) => {
    return (
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.service ?? '').localeCompare(b.service ?? '') ||
      a.title.localeCompare(b.title)
    )
  })

  const counts: Record<Severity, number> = {
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    warning: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  }

  return {
    findings,
    counts,
    stats: {
      services: model.services.length,
      publishedPorts: model.services.reduce(
        (total, service) =>
          total + service.ports.filter((port) => Boolean(port.hostPort)).length,
        0,
      ),
      images: model.services.filter((service) => Boolean(service.image)).length,
      bindMounts: model.services.reduce(
        (total, service) =>
          total + service.volumes.filter((volume) => volume.kind === 'bind').length,
        0,
      ),
      healthchecks: model.services.filter((service) => service.healthcheck).length,
    },
  }
}
