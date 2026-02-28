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

This plugin performs that transformation automatically at build time.

## Features

- ✨ Automatically transforms destructured props to `splitProps`/`mergeProps`
- 🎯 Handles default values using `mergeProps`
- 🔄 Preserves rest parameters with `splitProps`
- 📦 Auto-imports `mergeProps` and `splitProps` from 'solid-js'
- 🚀 Only processes JSX components (checks for JSX in function body)
- ⚡ Skips non-component functions for performance

## Installation

```bash
bun add -d @babel/parser @babel/traverse @babel/generator @babel/types
bun add -d @types/babel__traverse @types/babel__generator @types/babel__core
```

## Usage

```typescript
import solidDestructure from './plugins/solid-destructure'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidDestructure(), solid() /* other plugins */]
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

### Rest Properties

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
  const [, rest] = splitProps(_props, ['title', 'description'])
  return (
    <div {...props}>
      <h2>{_props.title}</h2>
      <p>{_props.description}</p>
    </div>
  )
}
```

### TestComponent (Defaults + Nested Destructuring + Rest)

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
      <p>{rest.class}</p>
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
  const [, rest] = splitProps(_merged, ['name', 'count', 'avatar', 'items', 'nested'])
  return (
    <div {...props}>
      <p>{rest.class}</p>
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
4. **Import** — Adds necessary imports from `solid-js` (appends to existing import if present)
5. **Generate** — Outputs transformed code with source maps

## Limitations

- Only transforms functions that return JSX (regular functions are left untouched)
- Requires the first parameter to be an object pattern (destructuring)
- Skips files in `node_modules`

## Testing

```bash
bun test apps/frontend/plugins/solid-destructure
```
