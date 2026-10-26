# Rillio v0.5 preregistration (2026-10-09)

This document freezes research intent before official benchmarking. No performance measurements have been reported.

## Confirmatory comparisons

- C1: 1,000 active subscriptions; 1% affected per update. Required lower bound of adjusted 95% CI for median latency ratio Scan / Graph: >= 2.
- C2: 10,000 active subscriptions; 0.1% affected. Required lower bound: >= 3.
- Use Holm family-wise error correction for the two confirmatory comparisons.
- All other configurations are exploratory: subscriptions = 10, 100, 1,000, 10,000; affected fractions = 0.1%, 1%, 10%, 100%.
- Distinguish static dependencies, dynamic dependencies, computed chains and diamonds.

## Measurements and execution

- 5 warmups, minimum 30 independent measured repetitions per configuration.
- Separate processes, counterbalanced engine execution order.
- Record runtime/browser version, CPU, machine, operating system, energy profile, JIT/GC effects.
- Median, p95, raw samples and bootstrapped confidence intervals. No post-hoc outlier removal.
- Time initialization and steady-state updates separately; report retained heap and garbage collection.
- Upper CI bounds for memory ratio (Graph <= 2x Scan), Index mount overhead (<= 15%) and retained heap overhead (<= 25%).

## Spike D baseline definitions

- B0: Map<ElementId, Node> + operation log, no children index. DOM traversal permitted for subtree operations and counted in performance.
- B1: B0 features plus ordered children/parent indexes and lifecycle tracking.
- B2: full JSON UI tree replacement with keyed reconciliation.
- All implement the same observable patch operations, validation, versions, replay and ownership conflicts.
- B1 retention gate: >=30% lower median latency versus B0 for preregistered 10k-element subtree move/remove workload, with mount overhead and heap caps above.
- Additional evaluation: patch bytes, focus/scroll preservation and real-agent valid transaction / task success rate; distinguish model, protocol and runtime failures.

## Interpretation

Failing a confirmatory performance threshold does not imply correctness failure or invalidate exploratory research. Any material protocol change creates a new preregistration revision, and previous results become exploratory.
