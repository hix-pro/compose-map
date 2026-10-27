import { describe, expect, it } from 'vitest'
import { analyzeCompose } from './analyze'
import { parseCompose } from './parse-compose'
import {
  reportFilename,
  toJsonReport,
  toMarkdown,
  toMermaid,
  toSvg,
} from './export'
import { defaultSample, samples } from './samples'

function reportFor(source: string) {
  const { model, error } = parseCompose(source, 'docker-compose.yml')
  if (!model) throw new Error(error ?? 'fixture did not parse')
  return { model, analysis: analyzeCompose(model) }
}

const FIXTURE = `name: demo stack
services:
  web:
    image: nginx:latest
    privileged: true
    ports:
      - "8080:80"
    depends_on:
      - db
  db:
    image: postgres
`

describe('exports', () => {
  it('writes a Mermaid flowchart with nodes, edges and severity classes', () => {
    const { model, analysis } = reportFor(FIXTURE)
    const mermaid = toMermaid(model, analysis.findings)
    expect(mermaid).toContain('flowchart LR')
    expect(mermaid).toContain('s_0["web')
    expect(mermaid).toContain('s_1["db')
    expect(mermaid).toContain('s_0 -->|needs| s_1')
    expect(mermaid).toContain('classDef critical')
    expect(mermaid).toContain('classDef clean')
    expect(mermaid.endsWith('\n')).toBe(true)
  })

  it('keeps Mermaid labels safe when names contain quotes', () => {
    const { model, analysis } = reportFor(`services:
  'web"api':
    image: alpine:3.20
`)
    const mermaid = toMermaid(model, analysis.findings)
    expect(mermaid).toContain('web#quot;api')
    expect(mermaid).not.toContain('"web"api"')
  })

  it('writes a Markdown report with a summary, service table and fixes', () => {
    const { model, analysis } = reportFor(FIXTURE)
    const markdown = toMarkdown(model, analysis)
    expect(markdown).toContain('# ComposeMap report — demo stack')
    expect(markdown).toContain('| Services | Published ports |')
    expect(markdown).toContain('| `web` | nginx:latest |')
    expect(markdown).toContain('### Critical')
    expect(markdown).toContain('**Fix:**')
    expect(markdown).toContain('ComposeMap')
  })

  it('escapes Markdown table content', () => {
    const { model, analysis } = reportFor(`services:
  'pipe|name':
    image: alpine:3.20
`)
    const markdown = toMarkdown(model, analysis)
    expect(markdown).toContain('`pipe\\|name`')
    expect(markdown).not.toContain('| `pipe|name` |')
  })

  it('writes a stable JSON report without exposing environment values', () => {
    const { model, analysis } = reportFor(`services:
  app:
    image: alpine:3.20
    environment:
      API_TOKEN: super-secret-value
`)
    const report = JSON.parse(toJsonReport(model, analysis)) as {
      tool: string
      version: number
      name: string
      services: { name: string; environment: string[] }[]
      findings: { rule: string; severity: string }[]
    }
    expect(report.tool).toBe('compose-map')
    expect(report.version).toBe(1)
    expect(report.name).toBe('docker-compose')
    expect(report.services[0]?.environment).toEqual(['API_TOKEN'])
    expect(report.findings.some((finding) => finding.rule === 'literal-secret')).toBe(true)
    expect(JSON.stringify(report)).not.toContain('super-secret-value')
  })

  it('renders a standalone SVG graph with all services', () => {
    const { model, analysis } = reportFor(FIXTURE)
    const svg = toSvg(model, analysis.findings)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('</svg>')
    expect(svg).toContain('web')
    expect(svg).toContain('db')
    expect(svg).toContain('demo stack')
    expect(svg).toContain('marker-end="url(#arrow)"')
    expect(svg).toMatch(/width="\d+"/)
    expect(svg).toMatch(/height="\d+"/)
  })

  it('escapes XML in the SVG export', () => {
    const { model, analysis } = reportFor(`services:
  'api&web':
    image: 'alpine:3.20'
`)
    const svg = toSvg(model, analysis.findings)
    expect(svg).toContain('api&amp;web')
    expect(svg).not.toContain('api&web')
  })

  it('renders a friendly SVG fallback for an empty model', () => {
    const svg = toSvg({ services: [], networks: [], volumes: [] }, [])
    expect(svg).toContain('No services to render')
    expect(svg).toContain('#07090c')
  })

  it('builds a safe filename from the project name', () => {
    const { model } = reportFor(FIXTURE)
    expect(reportFilename(model, 'md')).toBe('demo-stack-report.md')
    expect(reportFilename({ ...model, name: undefined, sourceName: undefined }, 'svg')).toBe(
      'compose-report.svg',
    )
  })

  it('parses every bundled sample', () => {
    expect(samples).toHaveLength(3)
    for (const sample of samples) {
      const { model } = parseCompose(sample.yaml, sample.filename)
      expect(model, sample.id).not.toBeNull()
      expect(model?.services.length, sample.id).toBeGreaterThan(1)
    }
  })

  it('keeps the default sample useful for the demo', () => {
    const { model } = parseCompose(defaultSample.yaml, defaultSample.filename)
    expect(model?.services.map((service) => service.name)).toEqual([
      'gateway',
      'api',
      'db',
      'metrics',
    ])
    const analysis = analyzeCompose(model!)
    expect(analysis.counts.critical).toBeGreaterThan(0)
    expect(analysis.counts.warning).toBeGreaterThan(0)
  })
})
