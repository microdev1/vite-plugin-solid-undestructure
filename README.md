# SolidJS Props Transform Plugin

A Vite plugin that automatically transforms props destructuring in SolidJS components to use `mergeProps` and `splitProps`, preserving reactivity.

## Why?

In SolidJS, destructuring props directly breaks reactivity because it converts reactive getters into static values:

```tsx
// ❌ Breaks reactivity
function Component({ name, count }) {
  return (
    <div>
      {name}: {count}
    </div>
  )
}
```

The correct approach is to use `splitProps` and `mergeProps`:

```tsx
// ✅ Maintains reactivity
import { splitProps } from 'solid-js'

function Component(_props) {
  const [{ name, count }] = splitProps(_props, ['name', 'count'])
  // ...
}
```

This plugin performs that transformation automatically.

## Features

- ✨ Automatically transforms destructured props to `splitProps`/`mergeProps`
- 🎯 Handles default values using `mergeProps`
- 🔄 Preserves spread parameters with `splitProps`
- 📦 Auto-imports `mergeProps` and `splitProps` from 'solid-js'
- ⚡ Skips non-component functions

## Installation

```bash
bun add -D vite-plugin-solid-undestructure
```

## Usage

```typescript
import solidUndestructure from './plugins/solid-undestructure'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidUndestructure(), solid() /* other plugins */]
})
```

## Examples

### Basic Destructuring

```tsx
// Before
function Greeting({ name, age }) {
  return (
    <div>
      Hello {name}, you are {age} years old
    </div>
  )
}

// After
function Greeting(_props) {
  return (
    <div>
      Hello {_props.name}, you are {_props.age} years old
    </div>
  )
}
```

### Default Values

```tsx
// Before
function Button({ label = 'Click me', disabled = false }) {
  return <button disabled={disabled}>{label}</button>
}

// After
import { mergeProps } from 'solid-js'

function Button(_props) {
  const _merged = mergeProps({ label: 'Click me', disabled: false }, _props)
  return <button disabled={_merged.disabled}>{_merged.label}</button>
}
```

### Spread Properties

```tsx
// Before
function Card({ title, description, ...props }) {
  return (
    <div {...props}>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

// After
import { splitProps } from 'solid-js'

function Card(_props) {
  const [, props] = splitProps(_props, ['title', 'description'])
  return (
    <div {...props}>
      <h2>{_props.title}</h2>
      <p>{_props.description}</p>
    </div>
  )
}
```

### TestComponent (Defaults + Nested Destructuring + Spread)

```tsx
// Before
import { For } from 'solid-js'

function TestComponent({
  name = 'World',
  count = 0,
  avatar = '/default.png',
  items,
  nested: { a, b },
  ...props
}: {
  name?: string
  count?: number
  avatar?: string
  items: string[]
  nested: { a: number; b: number }
  class?: string
  onClick?: () => void
}) {
  return (
    <div {...props}>
      <p>{props.class}</p>
      <pre>{a}</pre>
      <pre>{b}</pre>
      <img src={avatar} alt={name} />
      <h1>Hello {name}!</h1>
      <p>Count: {count}</p>
      <ul>
        <For each={items}>{(item) => <li>{item}</li>}</For>
      </ul>
    </div>
  )
}

// After
import { For, mergeProps, splitProps } from 'solid-js'

function TestComponent(_props) {
  const _merged = mergeProps({ name: 'World', count: 0, avatar: '/default.png' }, _props)
  const [, props] = splitProps(_merged, ['name', 'count', 'avatar', 'items', 'nested'])
  return (
    <div {...props}>
      <p>{props.class}</p>
      <pre>{_merged.nested.a}</pre>
      <pre>{_merged.nested.b}</pre>
      <img src={_merged.avatar} alt={_merged.name} />
      <h1>Hello {_merged.name}!</h1>
      <p>Count: {_merged.count}</p>
      <ul>
        <For each={_merged.items}>{(item) => <li>{item}</li>}</For>
      </ul>
    </div>
  )
}
```

## How It Works

1. **Parse** — Uses `@babel/parser` to parse TypeScript/JSX files into an AST
2. **Detect** — Identifies functions with destructured props that return JSX
3. **Transform** — Rewrites destructuring into `mergeProps`/`splitProps` calls and replaces all references to destructured identifiers with property accesses on the merged/props object
4. **Import** — Adds necessary imports from `solid-js` if not already present
5. **Generate** — Outputs transformed code with source maps

## Notes

- Only transforms functions that return JSX (regular functions are left untouched)
- Requires the first parameter to be an object pattern (destructuring)
- Skips files in `node_modules`

## Testing

```bash
bun test
```

## ESLint Integration

Since `eslint-plugin-solid`'s `solid/reactivity` rule doesn't know about this plugin, it will flag destructured props as non-reactive. The bundled ESLint processor fixes this by teaching the rule about destructured props.

### Setup

Install `eslint-plugin-solid`:

```bash
bun add -D eslint-plugin-solid
```

Add the processor to your ESLint config:

```js
// eslint.config.js
import solid from 'eslint-plugin-solid'
import solidUndestructure from 'vite-plugin-solid-undestructure/eslint'

export default [
  solidUndestructure.configs.recommended,
  solid.configs['flat/typescript'],
  {
    rules: {
      'solid/no-destructure': 'off'
    }
  }
]
```

### How it works

The processor transparently rewrites destructured props into `props.X` member expressions before the linter runs, so the existing `solid/reactivity` rule can correctly identify untracked reactive usages. Error messages are adjusted to reference the original destructured name.

```tsx
// Without the processor, solid/reactivity ignores `size` (not recognized as reactive)
// With the processor, it correctly warns:
function ExampleComponent({ size }: { size: 'sm' | 'lg' }) {
  const dimensions =
    // ↓ The reactive variable 'size' should be used within JSX, a tracked scope
    //   (like createEffect), or inside an event handler. [solid/reactivity]
    size === 'sm' ? { width: 4, height: 4 } : { width: 8, height: 8 }

  // Correct usages that don't cause warnings:
  // const dimensions = () => size === 'sm' ? ...
  // const dimensions = createMemo(() => size === 'sm' ? ...)

  return <img src="..." alt="..." {...dimensions()} />
}
```
