import { describe, expect, it } from 'vitest'
import { analyzeCompose } from './analyze'
import { buildGraph, NODE_HEIGHT, NODE_WIDTH } from './layout'
import { parseCompose } from './parse-compose'

function graphFor(source: string) {
  const { model, error } = parseCompose(source)
  if (!model) throw new Error(error ?? 'fixture did not parse')
  const analysis = analyzeCompose(model)
  return buildGraph(model, analysis.findings)
}

describe('buildGraph', () => {
  it('creates one node per service and an edge per dependency', () => {
    const graph = graphFor(`services:
  web:
    image: nginx:1.27-alpine
    depends_on:
      - api
  api:
    image: node:22-alpine
    depends_on:
      - db
  db:
    image: postgres:16.4-alpine
`)
    expect(graph.nodes.map((node) => node.id)).toEqual(['web', 'api', 'db'])
    expect(graph.edges.map((edge) => edge.id)).toEqual(['web->api', 'api->db'])
    expect(graph.edges.every((edge) => edge.source && edge.target)).toBe(true)
  })

  it('positions every node with finite coordinates', () => {
    const graph = graphFor(`services:
  a:
    image: alpine:3.20
  b:
    image: alpine:3.20
  c:
    image: alpine:3.20
`)
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
      expect(node.position.y).toBeGreaterThanOrEqual(0)
    }
    const positions = new Set(
      graph.nodes.map((node) => `${node.position.x}:${node.position.y}`),
    )
    expect(positions.size).toBe(3)
  })

  it('ignores dependencies that point at undefined services', () => {
    const graph = graphFor(`services:
  web:
    image: nginx:1.27-alpine
    depends_on:
      - ghost
`)
    expect(graph.edges).toHaveLength(0)
  })

  it('adds severity counts to node data', () => {
    const graph = graphFor(`services:
  bad:
    image: redis:latest
    privileged: true
`)
    const node = graph.nodes[0]
    expect(node?.data.criticalCount).toBe(1)
    expect(node?.data.warningCount).toBe(2)
    expect(node?.data.infoCount).toBe(1)
    expect(node?.data.findingCount).toBe(4)
  })

  it('uses the fixed card dimensions expected by the SVG export', () => {
    const graph = graphFor(`services:
  a:
    image: alpine:3.20
`)
    expect(graph.nodes).toHaveLength(1)
    expect(NODE_WIDTH).toBe(270)
    expect(NODE_HEIGHT).toBe(138)
  })

  it('lays out dependency cycles without throwing', () => {
    const graph = graphFor(`services:
  a:
    image: alpine:3.20
    depends_on: [b]
  b:
    image: alpine:3.20
    depends_on: [a]
`)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toHaveLength(2)
  })
})
