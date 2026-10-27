import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import { useEffect, useMemo, useRef } from 'react'
import type { ComposeModel, Finding, ServiceNode, ServiceNodeData } from '../types'
import { buildGraph } from '../lib/layout'
import { ServiceNodeCard } from './ServiceNode'

const nodeTypes = {
  service: ServiceNodeCard,
} satisfies NodeTypes

interface GraphCanvasProps {
  model: ComposeModel
  findings: Finding[]
  selectedService: string | null
  onSelectService: (name: string | null) => void
}

function severityColor(data: ServiceNodeData): string {
  if (data.criticalCount > 0) return '#ff6b6b'
  if (data.warningCount > 0) return '#ffb454'
  if (data.infoCount > 0) return '#7dd3fc'
  return '#c6f56e'
}

function Flow({
  model,
  findings,
  selectedService,
  onSelectService,
}: GraphCanvasProps) {
  const graph = useMemo(() => buildGraph(model, findings), [model, findings])
  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceNode>(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges)
  const { fitView } = useReactFlow()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void fitView({ padding: 0.08, duration: 260, minZoom: 0.7, maxZoom: 1 })
    }, 60)
    return () => window.clearTimeout(timer.current)
  }, [graph, setNodes, setEdges, fitView])

  const visibleNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.selected === (node.id === selectedService)
          ? node
          : { ...node, selected: node.id === selectedService },
      ),
    [nodes, selectedService],
  )

  return (
    <ReactFlow
      nodes={visibleNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectService(node.id)}
      onPaneClick={() => onSelectService(null)}
      fitView
      fitViewOptions={{ padding: 0.08, minZoom: 0.7, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.8}
      proOptions={{ hideAttribution: false }}
      className="compose-flow"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1.1}
        color="#1a2330"
      />
      <Controls
        position="bottom-left"
        showInteractive={false}
        aria-label="Graph controls"
      />
      {model.services.length > 6 && (
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          aria-label="Graph minimap"
          style={{ width: 132, height: 86, marginBottom: 20 }}
          maskColor="rgba(4, 6, 9, 0.72)"
          nodeStrokeWidth={2}
          nodeColor={(node: Node) => severityColor((node as ServiceNode).data)}
          nodeClassName="compose-minimap-node"
        />
      )}
    </ReactFlow>
  )
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}
