import { describe, expect, it } from 'vitest'
import { analyzeCompose } from './analyze'
import { parseCompose } from './parse-compose'
import type { Analysis } from '../types'

function analyze(source: string): Analysis {
  const { model, error } = parseCompose(source)
  if (!model) throw new Error(`Fixture did not parse: ${error}`)
  return analyzeCompose(model)
}

function rules(analysis: Analysis): string[] {
  return analysis.findings.map((finding) => finding.rule)
}

const SAFE = `services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "127.0.0.1:8080:80"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
    restart: unless-stopped
`

describe('analyzeCompose', () => {
  it('reports a clean, well-pinned stack without findings', () => {
    const analysis = analyze(SAFE)
    expect(analysis.findings).toEqual([])
    expect(analysis.counts).toEqual({ critical: 0, warning: 0, info: 0 })
    expect(analysis.stats).toEqual({
      services: 1,
      publishedPorts: 1,
      images: 1,
      bindMounts: 0,
      healthchecks: 1,
    })
  })

  it('flags missing images, latest tags and untagged images', () => {
    const analysis = analyze(`services:
  noimage:
    command: echo hi
  floating:
    image: postgres
  latest:
    image: redis:latest
  digest:
    image: nginx@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`)
    expect(rules(analysis)).toEqual(
      expect.arrayContaining(['no-image', 'unpinned-image', 'latest-image']),
    )
    const digestRules = analysis.findings
      .filter((finding) => finding.service === 'digest')
      .map((finding) => finding.rule)
    expect(digestRules).not.toContain('latest-image')
    expect(digestRules).not.toContain('unpinned-image')
  })

  it('flags privileged containers and the Docker socket', () => {
    const analysis = analyze(`services:
  dangerous:
    image: alpine:3.20
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    expect(rules(analysis)).toEqual(expect.arrayContaining(['privileged', 'docker-socket']))
    expect(analysis.counts.critical).toBe(2)
  })

  it('flags host networking and explains ignored ports', () => {
    const analysis = analyze(`services:
  proxy:
    image: traefik:v3.1
    network_mode: host
    ports:
      - "80:80"
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    expect(rules(analysis)).toEqual(
      expect.arrayContaining(['host-network', 'host-network-ports']),
    )
    expect(analysis.counts.warning).toBeGreaterThanOrEqual(2)
  })

  it('detects literal secrets but allows references and placeholders', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:3.20
    environment:
      API_TOKEN: sk_live_123456
      DATABASE_URL: postgres://user:password@db:5432/app
      SAFE_URL: postgres://user:\${DB_PASSWORD}@db:5432/app
      SESSION_SECRET: \${SESSION_SECRET}
      POSTGRES_PASSWORD: changeme
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    const secrets = analysis.findings.filter((finding) => finding.rule === 'literal-secret')
    expect(secrets).toHaveLength(2)
    expect(secrets.map((finding) => finding.detail).join(' ')).toContain('API_TOKEN')
    expect(secrets.map((finding) => finding.detail).join(' ')).toContain('DATABASE_URL')
    expect(analysis.findings.some((finding) => finding.detail.includes('sk_live_123456'))).toBe(false)
  })

  it('does not flag a URL without credentials', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:3.20
    environment:
      DATABASE_URL: postgres://db:5432/app
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    expect(rules(analysis)).not.toContain('literal-secret')
  })

  it('warns about missing healthchecks, restart policies and public bindings', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:3.20
    ports:
      - "8080:80"
`)
    expect(rules(analysis)).toEqual(
      expect.arrayContaining(['no-healthcheck', 'no-restart', 'all-interfaces']),
    )
    expect(analysis.counts.warning).toBe(1)
    expect(analysis.counts.info).toBe(2)
  })

  it('treats a localhost binding as private', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:3.20
    ports:
      - "127.0.0.1:8080:80"
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    expect(rules(analysis)).not.toContain('all-interfaces')
  })

  it('flags fixed container names and missing dependencies', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:3.20
    container_name: only-one
    depends_on:
      - ghost
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    expect(rules(analysis)).toEqual(
      expect.arrayContaining(['missing-dependency', 'container-name']),
    )
  })

  it('detects dependency cycles once', () => {
    const analysis = analyze(`services:
  a:
    image: alpine:3.20
    depends_on:
      - b
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
  b:
    image: alpine:3.20
    depends_on:
      - a
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    const cycles = analysis.findings.filter((finding) => finding.rule === 'dependency-cycle')
    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.detail).toContain('a')
    expect(cycles[0]?.detail).toContain('b')
  })

  it('sorts findings by severity and counts them', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:latest
    privileged: true
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
`)
    expect(analysis.findings[0]?.severity).toBe('critical')
    expect(analysis.counts).toEqual({ critical: 1, warning: 1, info: 0 })
  })

  it('counts bind mounts and published ports', () => {
    const analysis = analyze(`services:
  app:
    image: alpine:3.20
    ports:
      - "127.0.0.1:8080:80"
      - "443:443"
    volumes:
      - ./data:/data
      - named:/named
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
volumes:
  named:
`)
    expect(analysis.stats.publishedPorts).toBe(2)
    expect(analysis.stats.bindMounts).toBe(1)
  })
})
