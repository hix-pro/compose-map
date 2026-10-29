import { describe, expect, it } from 'vitest'
import { analyzeCompose } from './analyze'
import { diffCompose, diffLabel } from './diff'
import { parseCompose } from './parse-compose'
import type { Analysis, ComposeModel, Finding } from '../types'

function parse(source: string): ComposeModel {
  const { model, error } = parseCompose(source)
  if (!model) throw new Error(`Fixture did not parse: ${error}`)
  return model
}

function compare(beforeSource: string, afterSource: string) {
  const before = parse(beforeSource)
  const after = parse(afterSource)
  return diffCompose(before, after, analyzeCompose(before), analyzeCompose(after))
}

function finding(rule: string, severity: Finding['severity'], title: string): Finding {
  return {
    id: `${rule}:${title}`,
    rule,
    severity,
    title,
    detail: title,
    fix: 'fix it',
  }
}

const BASE = `services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "127.0.0.1:8080:80"
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
  db:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_USER: app
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`

describe('diffCompose', () => {
  it('reports no changes for identical revisions', () => {
    const diff = compare(BASE, BASE)
    expect(diff.hasChanges).toBe(false)
    expect(diff.counts).toEqual({
      servicesAdded: 0,
      servicesRemoved: 0,
      servicesChanged: 0,
      findingsIntroduced: 0,
      findingsResolved: 0,
    })
    expect(diffLabel(diff)).toBe('No differences')
  })

  it('lists added and removed services', () => {
    const diff = compare(
      BASE,
      `services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "127.0.0.1:8080:80"
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
  cache:
    image: redis:7.4-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
    restart: unless-stopped
`,
    )
    expect(diff.services.added).toEqual(['cache'])
    expect(diff.services.removed).toEqual(['db'])
    expect(diff.counts.servicesAdded).toBe(1)
    expect(diff.counts.servicesRemoved).toBe(1)
    expect(diffLabel(diff)).toBe('1 added · 1 removed')
  })

  it('describes changed images, ports and environment', () => {
    const diff = compare(
      BASE,
      `services:
  web:
    image: nginx:1.28-alpine
    ports:
      - "127.0.0.1:8081:80"
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
  db:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_DB: app
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`,
    )
    const web = diff.services.changed.find((service) => service.name === 'web')
    expect(web?.changes).toEqual(
      expect.arrayContaining([
        { field: 'image', before: 'nginx:1.27-alpine', after: 'nginx:1.28-alpine' },
        { field: 'ports', before: '127.0.0.1:8080:80', after: '—' },
        { field: 'ports', before: '—', after: '127.0.0.1:8081:80' },
      ]),
    )
    const db = diff.services.changed.find((service) => service.name === 'db')
    expect(db?.changes).toContainEqual({
      field: 'environment.POSTGRES_DB',
      before: '—',
      after: 'app',
    })
  })

  it('treats short and long port syntax as the same change', () => {
    const diff = compare(
      BASE,
      `services:
  web:
    image: nginx:1.27-alpine
    ports:
      - target: 80
        published: 8080
        host_ip: 127.0.0.1
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
  db:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_USER: app
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`,
    )
    expect(diff.services.changed).toEqual([])
  })

  it('hides secret-looking environment values', () => {
    const diff = compare(
      `services:
  api:
    image: app:1.0
    environment:
      API_TOKEN: old-token
`,
      `services:
  api:
    image: app:1.0
    environment:
      API_TOKEN: new-token
`,
    )
    const api = diff.services.changed.find((service) => service.name === 'api')
    expect(api?.changes).toContainEqual({
      field: 'environment.API_TOKEN',
      before: '•••• (hidden)',
      after: '•••• (hidden)',
    })
    expect(JSON.stringify(diff)).not.toContain('old-token')
    expect(JSON.stringify(diff)).not.toContain('new-token')
  })

  it('reports findings introduced by the new revision', () => {
    const diff = compare(
      BASE,
      BASE.replace(
        '  web:\n    image: nginx:1.27-alpine',
        '  web:\n    image: nginx:1.27-alpine\n    privileged: true',
      ),
    )
    expect(diff.findings.introduced.map((item) => item.rule)).toContain('privileged')
    expect(diff.findings.introduced[0]?.severity).toBe('critical')
    expect(diff.counts.findingsIntroduced).toBe(1)
  })

  it('reports findings resolved by the new revision', () => {
    const withoutHealthcheck = BASE.replace(
      '    healthcheck:\n      test: ["CMD", "true"]\n    restart: unless-stopped\n  db:',
      '    restart: unless-stopped\n  db:',
    )
    const diff = compare(withoutHealthcheck, BASE)
    expect(diff.findings.resolved.map((item) => item.rule)).toContain('no-healthcheck')
    expect(diff.counts.findingsResolved).toBe(1)
  })

  it('reports finding severity changes without duplicating entries', () => {
    const model = parse(BASE)
    const before: Analysis = {
      findings: [finding('latest-image', 'warning', 'Image uses the latest tag')],
      counts: { critical: 0, warning: 1, info: 0 },
      stats: { services: 2, publishedPorts: 1, images: 2, bindMounts: 0, healthchecks: 2 },
    }
    const after: Analysis = {
      findings: [finding('latest-image', 'critical', 'Image uses the latest tag')],
      counts: { critical: 1, warning: 0, info: 0 },
      stats: before.stats,
    }
    const diff = diffCompose(model, model, before, after)
    expect(diff.findings.changed).toHaveLength(1)
    expect(diff.findings.changed[0]?.before.severity).toBe('warning')
    expect(diff.findings.changed[0]?.after.severity).toBe('critical')
    expect(diff.findings.introduced).toEqual([])
    expect(diff.findings.resolved).toEqual([])
  })

  it('lists top-level network and volume changes', () => {
    const diff = compare(
      BASE,
      `${BASE}networks:
  frontend:
volumes:
  assets:
`,
    )
    expect(diff.networks.added).toEqual(['frontend'])
    expect(diff.volumes.added).toEqual(['assets'])
    expect(diff.hasChanges).toBe(true)
  })
})
