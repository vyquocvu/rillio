# ZUI

Research-first TypeScript reactive frontend runtime.

**Status: Spike 0 prototype.** This repository currently implements reactive primitives, not the JSX/DOM framework yet. No CI/CD is configured.

## Getting started

```sh
npm install
npm run typecheck
npm test
```

## Example

```ts
import { createEngine } from "./src/index.js";

const engine = createEngine("graph"); // or "scan"
const counter = engine.createStore(0);
const doubled = engine.computed(() => counter.get() * 2);
const dispose = engine.effect(() => console.log(doubled.get()));
counter.set(1);
engine.batch(() => { counter.set(2); counter.set(3); });
dispose();
```

## Architecture

- **ScanEngine**: full visits of active effects on every committed write; does not use reverse dependencies to select effects. Computed nodes still cache results within an epoch.
- **GraphEngine**: dependency-linked invalidation, including runtime updates to dynamic dependencies.
- Both engines expose the same store, computed, effect, batch, owner and flush API.
- State commits are synchronous. Effects flush after commits, and writes made during effects queue another flush round.
- Ownership scopes dispose effects and nested scopes.

## Roadmap

1. Spike 0: conformance oracle and tests, deterministic semantics.
2. Spike A/B: independently implemented Scan and Graph engines, crossover benchmarks.
3. Spike C: mount-once DOM bindings, dynamic regions and keyed lists.
4. Spike D: optional Flat Index experiments with minimal Map + log and keyed-tree baselines.

This is research code, not a production renderer. Do not claim performance wins until the preregistered benchmarks are executed.
