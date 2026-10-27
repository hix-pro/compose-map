import { describe, expect, it } from 'vitest'
import { parseCompose } from './parse-compose'

describe('parseCompose', () => {
  it('normalizes services, ports, volumes, env and dependencies', () => {
    const { model, error } = parseCompose(
      `name: demo
services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "127.0.0.1:8080:80"
      - "3000-3005:3000-3005"
      - "8443:443/tcp"
      - target: 9000
        published: 9001
        protocol: udp
    environment:
      NODE_ENV: production
      EMPTY:
      FLAG: true
    env_file:
      - .env.web
    volumes:
      - ./src:/app
      - data:/var/lib/data:ro
      - /anonymous
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "true"]
    restart: unless-stopped
    networks:
      - frontend
  db:
    image: postgres:16.4-alpine
    volumes:
      - type: volume
        source: data
        target: /var/lib/postgresql/data
        read_only: true
networks:
  frontend:
volumes:
  data:
`,
      'docker-compose.yml',
    )

    expect(error).toBeNull()
    expect(model?.name).toBe('demo')
    expect(model?.sourceName).toBe('docker-compose.yml')
    expect(model?.services).toHaveLength(2)

    const web = model?.services[0]
    expect(web?.image).toBe('nginx:1.27-alpine')
    expect(web?.ports).toEqual([
      {
        raw: '127.0.0.1:8080:80',
        hostIp: '127.0.0.1',
        hostPort: '8080',
        containerPort: '80',
        protocol: undefined,
      },
      {
        raw: '3000-3005:3000-3005',
        hostIp: undefined,
        hostPort: '3000-3005',
        containerPort: '3000-3005',
        protocol: undefined,
      },
      {
        raw: '8443:443/tcp',
        hostIp: undefined,
        hostPort: '8443',
        containerPort: '443',
        protocol: 'tcp',
      },
      {
        raw: '9001:9000',
        hostIp: undefined,
        hostPort: '9001',
        containerPort: '9000',
        protocol: 'udp',
      },
    ])
    expect(web?.environment).toEqual({
      NODE_ENV: 'production',
      EMPTY: null,
      FLAG: 'true',
    })
    expect(web?.envFiles).toEqual(['.env.web'])
    expect(web?.volumes).toEqual([
      { raw: './src:/app', source: './src', target: '/app', kind: 'bind' },
      { raw: 'data:/var/lib/data:ro', source: 'data', target: '/var/lib/data', mode: 'ro', kind: 'volume' },
      { raw: '/anonymous', target: '/anonymous', kind: 'anonymous' },
    ])
    expect(web?.dependsOn).toEqual(['db'])
    expect(web?.healthcheck).toBe(true)
    expect(web?.restart).toBe('unless-stopped')
    expect(web?.networks).toEqual(['frontend'])
    expect(web?.raw).toHaveProperty('image')

    const db = model?.services[1]
    expect(db?.volumes).toEqual([
      {
        raw: 'data:/var/lib/postgresql/data',
        source: 'data',
        target: '/var/lib/postgresql/data',
        mode: 'ro',
        kind: 'volume',
      },
    ])
    expect(db?.networks).toEqual(['default'])
  })

  it('normalizes environment and labels provided as lists', () => {
    const { model } = parseCompose(`services:
  app:
    image: alpine:3.20
    environment:
      - A=1
      - BETA
    labels:
      - com.example.role=api
      - standalone
`)
    expect(model?.services[0]?.environment).toEqual({ A: '1', BETA: null })
    expect(model?.services[0]?.labels).toEqual({
      'com.example.role': 'api',
      standalone: '',
    })
  })

  it('treats a disabled healthcheck as missing', () => {
    const { model } = parseCompose(`services:
  app:
    image: alpine:3.20
    healthcheck:
      disable: true
`)
    expect(model?.services[0]?.healthcheck).toBe(false)

    const { model: noneModel } = parseCompose(`services:
  app:
    image: alpine:3.20
    healthcheck:
      test: ["NONE"]
`)
    expect(noneModel?.services[0]?.healthcheck).toBe(false)
  })

  it('reads a build context object', () => {
    const { model } = parseCompose(`services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
`)
    expect(model?.services[0]?.build).toBe('./app')
  })

  it('rejects empty, non-object, invalid and serviceless documents', () => {
    expect(parseCompose('   ').error).toMatch(/Paste a Compose file/)
    expect(parseCompose('- one\n- two').error).toMatch(/YAML object/)
    expect(parseCompose('services:\n  web: [unclosed').error).toBeTruthy()
    expect(parseCompose('version: "3"').error).toMatch(/No services/)
    expect(parseCompose('services: {}').error).toMatch(/No services/)
  })
})
