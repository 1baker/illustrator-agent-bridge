# Shape-built scientific object benchmark

This benchmark deliberately avoids the card-and-arrow composition used by the
first prompt-only material mechanism. It tests whether one scientific object
can communicate its morphology through construction alone.

The default object is a conceptual cutaway of a semicrystalline polymer film.
Its film boundary is a closed cubic path. Crystalline lamellae are layered
polygons containing explicit folded-chain linework. Amorphous regions and tie
molecules are open cubic paths. Protected pendant groups are attached line and
polygon assemblies. A path clip keeps all internal morphology inside the film.

Run:

```bash
npm run build
npm run scientific:shape-benchmark
```

The command writes six deterministic candidates under
`var/exports/shape-built-scientific-object/`. Every candidate includes semantic
scene JSON, editable SVG, editable TikZ, and a derived PNG. `review.html` is the
comparison sheet and `construction-ledger.json` records parameters, scores, and
primitive counts.

The software score checks semantic completeness, morphology legibility,
topology richness, label restraint, palette discipline, and density balance.
It never compares pixels to a target image and never constitutes approval.
Human visual review remains the next gate.

## Approved-direction optimization loop

After a human selects a direction, the loop binds that candidate's complete
program to a SHA-256 digest. The approval applies only to visual direction, not
to final artwork. A stale or altered baseline fails closed.

Run `npm run scientific:shape-loop` to evaluate bounded mutations around the
approved Candidate B baseline. The current loop can mutate geometry density,
chain curvature, stroke scale, fill opacity, line opacity, and gradient depth.
Each generation retains only a score-improving mutation and records every
accepted and rejected descendant in `optimization-lineage.json`.

The loop ends at another human visual-review gate. Semantic-vector fitness is a
deterministic engineering measure; it is not treated as an aesthetic verdict.

## Lifelike vector refinement

After approving the third-generation Candidate B direction, run
`npm run scientific:lifelike-loop`. This second autonomous pass adds volume
without raster painting: separate top/front/side faces, extruded lamella facets,
contact shadows, specular highlights, rim light, and sparse surface texture.
Each feature remains a named path or polygon controlled by bounded numeric
state. The scorer rewards the declared dimensional construction targets and
retains only improving mutations.

FigureLabs' public examples were reviewed solely to identify broad quality
traits such as layered volume, soft occlusion, restrained gradients, and sparse
labels. No source image is copied, traced, embedded, or used as a pixel-fitness
target. The output records this policy and the reviewed public URL in its
lineage file.
