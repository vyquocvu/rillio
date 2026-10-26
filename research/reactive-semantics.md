# Reactive semantics — Spike 0

## Observable rules

1. Store writes commit synchronously, use Object.is equality, and update get() immediately.
2. Effects run once at registration. After writes, observers see settled computed values, not intermediate diamond nodes.
3. A batch of writes flushes observers only after the outermost batch exits.
4. Writes triggered within an effect do not recursively flush; they schedule the next round.
5. A runaway effect-write cycle exceeds maxRounds and throws RILLIO_MAX_FLUSH_ROUNDS.
6. Computed values detect recursive self-evaluation with RILLIO_REACTIVE_CYCLE.
7. Dependencies are re-collected on evaluation; branch changes remove stale subscriptions.
8. Owner disposal is idempotent, disposes children before parent callbacks, and skips disposed queued effects.
9. Explicit flush is synchronous; automatic writes outside batch trigger synchronous flush. DOM scheduler policies are intentionally out of scope.
10. Exceptions propagate to callers. Transactional rollback of store writes is NOT implemented in Spike 0.

## Scan constraint

A write makes the scan engine visit every active effect at the next flush. It must not use reverse dependency links to skip visiting effects. Computed dependency bookkeeping used for cache invalidation is permitted, not for filtering the set of visited effects. Diagnostics distinguish effect visits from actual expression evaluations.

## Graph scheduling

GraphEngine maintains a dirty-effects queue. It invalidates transitive computed dependents but evaluates only dirty effects during a flush. Nested writes occurring while an effect evaluates leave that effect dirty for the next flush round. The ScanEngine is intentionally not allowed to use the dirty queue for effect selection.

## Limits

This preliminary implementation shares lifecycle / evaluation mechanics between strategies. It is NOT an independent reference oracle and therefore does not yet establish cross-implementation conformance. Property-based oracle tests and external semantic comparisons remain necessary before official benchmarks.
