import { Plugin } from 'vite'
import { traverseComponentProps } from '../modules/babel'
import { transformPropsDestructuring } from './modules/transform'

/**
 * Vite plugin that transforms Solid.js component prop destructuring into reactive prop access.
 * This ensures that props remain reactive by using mergeProps and splitProps instead of
 * direct destructuring, which would break Solid's reactivity system.
 */
export default (): Plugin => ({
  name: 'solid-undestructure',
  enforce: 'pre',
  transform(code: string, id: string) {
    // Only process TypeScript/JavaScript files in components
    if (!/\.(tsx?|jsx?)$/.test(id)) {
      return null
    }

    // Skip node_modules
    if (id.includes('node_modules')) {
      return null
    }

    try {
      return traverseComponentProps(code, transformPropsDestructuring)
    } catch (error) {
      console.warn(`Failed to transform ${id}:`, error)
      return null
    }
  }
})
