import dagre from '@dagrejs/dagre'
import type { Edge } from '@xyflow/react'
import type { ComposeModel, Finding, ServiceNode } from '../types'

export const NODE_WIDTH = 270
export const NODE_HEIGHT = 138

export interface Graph {
  nodes: ServiceNode[]
  edges: Edge[]
}

export function buildGraph(model: ComposeModel, findings: Finding[]): Graph {
  const names = new Set(model.services.map((service) => service.name))
  const graph = new dagre.graphlib.Graph()

  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 44,
    ranksep: 90,
    marginx: 24,
    marginy: 24,
  })

  for (const service of model.services) {
    graph.setNode(service.name, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  const edges: Edge[] = []
  for (const service of model.services) {
    for (const dependency of service.dependsOn) {
      if (!names.has(dependency)) continue
      graph.setEdge(service.name, dependency)
      edges.push({
        id: `${service.name}->${dependency}`,
        source: service.name,
        target: dependency,
        type: 'smoothstep',
        animated: false,
        style: { stroke: 'rgba(198, 245, 110, 0.35)', strokeWidth: 1.5 },
      })
    }
  }

  dagre.layout(graph)

  const nodes: ServiceNode[] = model.services.map((service) => {
    const position = graph.node(service.name) as { x: number; y: number }
    const serviceFindings = findings.filter(
      (finding) => finding.service === service.name,
    )
    return {
      id: service.name,
      type: 'service',
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
      data: {
        service,
        findingCount: serviceFindings.length,
        criticalCount: serviceFindings.filter(
          (finding) => finding.severity === 'critical',
        ).length,
        warningCount: serviceFindings.filter(
          (finding) => finding.severity === 'warning',
        ).length,
        infoCount: serviceFindings.filter(
          (finding) => finding.severity === 'info',
        ).length,
      },
    }
  })

  return { nodes, edges }
}
