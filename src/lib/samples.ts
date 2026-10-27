import saasStarter from '../../examples/saas-starter.compose.yml?raw'
import leakyStack from '../../examples/leaky-stack.compose.yml?raw'
import mediaHomelab from '../../examples/media-homelab.compose.yml?raw'

export interface ComposeSample {
  id: string
  name: string
  tagline: string
  filename: string
  yaml: string
}

export const samples: ComposeSample[] = [
  {
    id: 'saas',
    name: 'SaaS starter',
    tagline: 'Web, worker, Postgres and Redis. Mostly healthy.',
    filename: 'saas-starter.compose.yml',
    yaml: saasStarter,
  },
  {
    id: 'leaky',
    name: 'Leaky stack',
    tagline: 'A deliberately bad file: secrets, host access, latest tags.',
    filename: 'leaky-stack.compose.yml',
    yaml: leakyStack,
  },
  {
    id: 'homelab',
    name: 'Media homelab',
    tagline: 'Jellyfin, Sonarr and friends, with a few sharp edges.',
    filename: 'media-homelab.compose.yml',
    yaml: mediaHomelab,
  },
]

export const defaultSample =
  samples.find((sample) => sample.id === 'leaky') ?? samples[0]!

export function findSample(id: string): ComposeSample | undefined {
  return samples.find((sample) => sample.id === id)
}
