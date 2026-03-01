import { transformForLinting } from '@src/eslint/modules/transform'
import { describe, expect, test } from 'bun:test'

function transformCode(code: string): string {
  const result = transformForLinting(code)
  if (!result) throw new Error('Expected transform to produce output')
  return result.code
}

function transformMappings(code: string): Map<string, string> {
  const result = transformForLinting(code)
  if (!result) throw new Error('Expected transform to produce output')
  return result.propMappings
}

describe('transformForLinting', () => {
  test('returns null for code without destructuring', () => {
    const result = transformForLinting(`function foo(x) { return x }`)
    expect(result).toBeNull()
  })

  test('returns null for non-component functions', () => {
    const result = transformForLinting(`function helper({ a, b }) { return a + b }`)
    expect(result).toBeNull()
  })

  test('transforms basic destructured props', () => {
    const code = transformCode(`
      function Component({ size }) {
        return <div>{size}</div>
      }
    `)
    expect(code).toContain('function Component(props)')
    expect(code).toContain('props.size')
    expect(code).not.toContain('{ size }')
  })

  test('transforms arrow function components', () => {
    const code = transformCode(`
      const Component = ({ size }) => {
        return <div>{size}</div>
      }
    `)
    expect(code).toContain('(props)')
    expect(code).toContain('props.size')
  })

  test('transforms multiple destructured props', () => {
    const code = transformCode(`
      function Component({ size, color, label }) {
        return <div style={{ color }}>{label}: {size}</div>
      }
    `)
    expect(code).toContain('function Component(props)')
    expect(code).toContain('props.size')
    expect(code).toContain('props.color')
    expect(code).toContain('props.label')
  })

  test('handles renamed props', () => {
    const code = transformCode(`
      function Component({ size: mySize }) {
        return <div>{mySize}</div>
      }
    `)
    expect(code).toContain('props.size')
    expect(code).not.toContain('props.mySize')
  })

  test('provides correct prop mappings for renamed props', () => {
    const mappings = transformMappings(`
      function Component({ size: mySize, color }) {
        return <div>{mySize} {color}</div>
      }
    `)
    expect(mappings.get('mySize')).toBe('size')
    expect(mappings.get('color')).toBe('color')
  })

  test('handles default values (ignores them for linting)', () => {
    const code = transformCode(`
      function Component({ size = 'sm' }) {
        return <div>{size}</div>
      }
    `)
    expect(code).toContain('props.size')
  })

  test('preserves TypeScript type annotations', () => {
    const code = transformCode(`
      function Component({ size }: { size: 'sm' | 'lg' }) {
        return <div>{size}</div>
      }
    `)
    expect(code).toMatch(/props:\s*\{\s*size:\s*'sm'\s*\|\s*'lg'/)
    expect(code).not.toContain('{ size }')
  })

  test('leaves rest elements as-is', () => {
    const code = transformCode(`
      function Component({ size, ...rest }) {
        return <div {...rest}>{size}</div>
      }
    `)
    expect(code).toContain('props.size')
    // rest should not be transformed to props.rest
    expect(code).not.toContain('props.rest')
  })

  test('handles nested destructuring', () => {
    const code = transformCode(`
      function Component({ nested: { a, b } }) {
        return <div>{a} {b}</div>
      }
    `)
    expect(code).toContain('props.nested.a')
    expect(code).toContain('props.nested.b')
  })

  test('provides correct mappings for nested props', () => {
    const mappings = transformMappings(`
      function Component({ nested: { a } }) {
        return <div>{a}</div>
      }
    `)
    expect(mappings.get('a')).toBe('nested.a')
  })

  test('does not transform identifiers in property key positions', () => {
    const code = transformCode(`
      function Component({ size }) {
        const obj = { size: 123 }
        return <div>{size}</div>
      }
    `)
    // The property key 'size' in { size: 123 } should NOT become props.size
    expect(code).toContain('{ size: 123 }')
  })

  test('transforms multiple components in one file', () => {
    const code = transformCode(`
      function CompA({ a }) {
        return <div>{a}</div>
      }
      function CompB({ b }) {
        return <span>{b}</span>
      }
    `)
    expect(code).toContain('props.a')
    expect(code).toContain('props.b')
  })

  test('handles exported components', () => {
    const code = transformCode(`
      export default function Component({ size }) {
        return <div>{size}</div>
      }
    `)
    expect(code).toContain('props.size')
  })
})
