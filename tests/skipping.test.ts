import { describe, expect, test } from 'bun:test'
import { transform } from './helpers'

describe('skipping', () => {
  test('returns null for non-tsx/jsx files', () => {
    expect(transform('const x = 1', 'file.css')).toBeNull()
  })

  test('returns null for node_modules', () => {
    const code = `function Foo({ a }) { return <div>{a}</div> }`
    expect(transform(code, 'node_modules/pkg/index.tsx')).toBeNull()
  })

  test('returns null when there is no destructuring pattern', () => {
    const code = `function Foo(props) { return <div>{props.a}</div> }`
    expect(transform(code, 'Foo.tsx')).toBeNull()
  })

  test('does not transform non-component functions', () => {
    const code = `function helper({ a, b }) { return a + b }`
    const out = transform(code, 'utils.ts')
    // Plugin still parses/generates but should NOT add mergeProps/splitProps
    expect(out).not.toContain('_$mergeProps')
    expect(out).not.toContain('_$splitProps')
  })
})
