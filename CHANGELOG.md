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

No versioned release has been published yet. Release status remains gated by the checks in `ROADMAP.md`.
