import { processor } from './modules/processor'

const plugin = {
  meta: {
    name: 'eslint-plugin-solid-undestructure',
    version: '0.1.1'
  },
  processors: {
    'solid-undestructure': processor
  },
  configs: {} as Record<string, { plugins: Record<string, unknown>; processor: string }>
}

plugin.configs['recommended'] = {
  plugins: {
    'solid-undestructure': plugin
  },
  processor: 'solid-undestructure/solid-undestructure'
}

export default plugin
