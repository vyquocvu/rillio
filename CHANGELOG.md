# Changelog

All notable changes to ZUI are documented here.

## Unreleased

- Refactor the production DOM runtime around a Flat Index with stable node, root, and owner ids.
- Route JSX and explicit reactive rendering through one transactional Patch Engine.
- Add randomized index consistency, repeated lifecycle, addressable registry, and flat-index benchmark coverage.
- Publish the `zui/flat` entry point for runtime authors.
- Harden the JSX runtime's root reuse, hook validation, effect flushing, and mount rollback.
- Make reactive owner cleanup untracked and resilient to cleanup failures.
- Normalize legacy `onDoubleClick` handling to the native `dblclick` event.
- Add release packaging configuration for ESM JavaScript and TypeScript declarations.
- Add regression coverage for root isolation, lifecycle disposal, hook failures, and partial mounts.
- Bound and scrub disposed registry tombstones; reject conflicting roots across JSX/reactive APIs.
- Add best-effort commit rollback, block HTML/active URL/inline-string event sinks, and minimize keyed `For` moves.
- Improve Input/Progress accessibility; add baseline typed HTML/SVG JSX props, tag-aware common event targets, and consumer checks for both JSX runtime type entry points.
- Optimize stable-order, tail-update, rotation, text-only commit, and fresh-node rollback paths; allocate listener/style state lazily and add Playwright React timing/CPU-profile tools.
- Add Playwright keyed-list comparisons for React, Preact, and Vue; optimize keyed LIS, primitive reconciliation, and batched same-parent move validation/rollback.
- Add a dependency-free `zui/zustand` hook for vanilla and bound Zustand stores, with selector equality and lifecycle-managed subscriptions.
- Reduce large-list mount work by applying inert initial data/ARIA attributes to detached native nodes and attaching completed host subtrees once; preserve custom-element callback timing and mounted-ref semantics.
- Pre-resolve keyed move-batch records during validation to avoid repeated id lookups in the DOM move loop; reject cross-root owner assignments and discard transaction-created records when no patch is scheduled.

No versioned release has been published yet. Release status remains gated by the checks in `ROADMAP.md`.
