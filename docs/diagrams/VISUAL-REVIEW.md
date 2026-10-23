# Diagram visual review

This is the perceptual review record for the delivered HTML files. Automated browser measurements remain in the matching `*.visual-check.json` sidecars; those receipts correctly keep `visualReview` as `pending` because automation does not make this judgment.

## Review scope

I inspected light and dark screenshots at 1440×900 and 2048×1320 for each artifact. I also captured and inspected each artifact at 1600×1000 and 1920×1080 in dark mode using Chrome. The automated browser receipts separately confirm containment and readability at all four sizes and capture both endpoint themes. The desktop review covered the default READ view, node and card fit, label placement, arrow corridors, and theme contrast.

## Artifact-bound observations

| Diagram | Spec SHA-256 / bytes | HTML SHA-256 / bytes | Review |
| --- | --- | --- | --- |
| [Runtime architecture](architecture.html) | `60a9d28efe8208c9d1304251283b9ec14f0f3d47ce567c1d9c3164106fc3315b` / 3145 | `ea98c2ba24a0378de193abe30d9c79cffe7af75ef5d4f83c656570855655d891` / 810186 | All three public surfaces converge through the transaction and patch engine; labels and cards remain legible in both themes. |
| [Reactive data flow](reactive-dataflow.html) | `c74e37537f77b3087d0acd63fd75759f5d95cf501491e1cf14bb1d7adb0b33cd` / 2214 | `adc5b41506bbfa0d328acc9f288360ee372069153d064c779f4ddcba664891ca` / 801797 | The store-to-DOM path and its stage labels are visible with the explanatory cards; no arrow or label overlaps a node. |
| [Transaction workflow](transaction-workflow.html) | `8ed0b743e8af8f3d66cf8802906a9bc83cf036789c226c8581d6c7f771202e9d` / 2891 | `59c6d6830b240d74cb3a8b2765293ccb2951444ab1a79f64b15eca396b5e3fdf` / 806735 | The main commit path, same-root rollback branch, cross-root rejection, and both explanatory cards fit in the reviewed viewports. |
| [Node and owner lifecycle](node-owner-lifecycle.html) | `235e709a70b51a3d5edfa02c31bac01482c21e1d8d4984ab5c5f6714f52622ab` / 2207 | `3bcf0fd5a4a1f8bd9c97fe8c5ee02b63e3b43dd67ae8ce6cc8595740a1f3828f` / 805222 | Allocation through tombstone retention is visible; the iterative child-first cleanup path is distinct and the labels clear their nodes. |
| [Performance research](performance-research.html) | `93d2caf6590c8f5dc73974dc7763afaf470d316e9619f99491c767edcc10621b` / 2346 | `4e9a54db9e61f0c7d1382dea6e35879b47cd56311c68db164d9d7d9e482d50ff` / 803159 | Chromium measurements and planner research read as separate flows; the research boundary and output cards remain clear in both themes. |

**Perceptual review: passed** for the inspected artifact hashes and scope above. **Automated browser evidence: passed** for all four desktop viewport measurements and the 1440×900 / 2048×1320 light and dark captures, as recorded in each matching receipt.
