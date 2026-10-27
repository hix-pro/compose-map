import type { Node } from '@xyflow/react'

export type Severity = 'critical' | 'warning' | 'info'

export interface ComposePort {
  raw: string
  hostIp?: string
  hostPort?: string
  containerPort: string
  protocol?: string
}

export interface ComposeVolume {
  raw: string
  source?: string
  target?: string
  mode?: string
  kind: 'bind' | 'volume' | 'anonymous' | 'unknown'
}

export interface ComposeService {
  name: string
  image?: string
  build?: string
  command?: string
  ports: ComposePort[]
  volumes: ComposeVolume[]
  environment: Record<string, string | null>
  envFiles: string[]
  dependsOn: string[]
  networks: string[]
  healthcheck: boolean
  restart?: string
  privileged: boolean
  networkMode?: string
  containerName?: string
  labels: Record<string, string>
  raw: Record<string, unknown>
}

export interface ComposeModel {
  name?: string
  sourceName?: string
  services: ComposeService[]
  networks: string[]
  volumes: string[]
}

export interface Finding {
  id: string
  rule: string
  severity: Severity
  service?: string
  title: string
  detail: string
  fix: string
}

export interface Analysis {
  findings: Finding[]
  counts: Record<Severity, number>
  stats: {
    services: number
    publishedPorts: number
    images: number
    bindMounts: number
    healthchecks: number
  }
}

export interface ParseResult {
  model: ComposeModel | null
  error: string | null
}

export type ServiceNodeData = {
  service: ComposeService
  findingCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
}

export type ServiceNode = Node<ServiceNodeData, 'service'>
