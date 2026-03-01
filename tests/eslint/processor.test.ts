import { processor } from '@src/eslint/modules/processor'
import { describe, expect, test } from 'bun:test'

describe('processor.preprocess', () => {
  test('transforms TSX files with destructured props', () => {
    const code = `
      function Component({ size }: { size: string }) {
        return <div>{size}</div>
      }
    `
    const [result] = processor.preprocess(code, 'Component.tsx')
    expect(result).toContain('props.size')
  })

  test('returns original code for non-component files', () => {
    const code = `const x = 1`
    const [result] = processor.preprocess(code, 'utils.ts')
    expect(result).toBe(code)
  })

  test('returns original code for non-matching files', () => {
    const code = `export const config = {}`
    const [result] = processor.preprocess(code, 'config.json')
    expect(result).toBe(code)
  })

  test('returns original code when no destructured component props', () => {
    const code = `
      function helper(props: { x: number }) {
        return props.x + 1
      }
    `
    const [result] = processor.preprocess(code, 'helper.ts')
    expect(result).toBe(code)
  })
})

describe('processor.postprocess', () => {
  test('replaces props.X with original name in messages', () => {
    // First, preprocess to populate the cache
    const code = `
      function Component({ size }: { size: string }) {
        return <div>{size}</div>
      }
    `
    processor.preprocess(code, 'test-post.tsx')

    const messages = [
      [
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable 'props.size' should be used within JSX.",
          line: 3,
          column: 5
        }
      ]
    ]

    const result = processor.postprocess(
      messages as Parameters<typeof processor.postprocess>[0],
      'test-post.tsx'
    )
    expect(result[0].message).toBe("The reactive variable 'size' should be used within JSX.")
  })

  test('handles renamed props in messages', () => {
    const code = `
      function Component({ size: mySize }: { size: string }) {
        return <div>{mySize}</div>
      }
    `
    processor.preprocess(code, 'test-renamed.tsx')

    const messages = [
      [
        {
          ruleId: 'solid/reactivity',
          message: "The reactive variable 'props.size' should be used within JSX.",
          line: 3,
          column: 5
        }
      ]
    ]

    const result = processor.postprocess(
      messages as Parameters<typeof processor.postprocess>[0],
      'test-renamed.tsx'
    )
    expect(result[0].message).toBe("The reactive variable 'mySize' should be used within JSX.")
  })

  test('passes through messages unchanged for non-transformed files', () => {
    const messages = [
      [
        {
          ruleId: 'some/rule',
          message: 'some error',
          line: 1,
          column: 1
        }
      ]
    ]

    const result = processor.postprocess(
      messages as Parameters<typeof processor.postprocess>[0],
      'non-transformed.tsx'
    )
    expect(result).toEqual(messages[0])
  })
})
