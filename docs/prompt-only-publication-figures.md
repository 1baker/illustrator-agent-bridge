# Prompt-only publication figures

The prompt-only workflow turns one scientific prompt into an editable vector candidate without requiring a reference photograph. A model may propose semantics, but deterministic code owns layout, vector geometry, typography, gradients, rendering, provenance, and QA.

The workflow is agentic up to explicit human gates:

1. Normalize `ScientificPromptFigureRequest.v1` and reject requests to fabricate data.
2. Optionally retrieve only approved presentation grammar from the separate publication registry.
3. Plan typed components, coordinate-free depiction roles, relationships, claims, uncertainty, and evidence bindings.
4. Reject coordinates, paths, TeX, colors, and raw geometry in planner semantics.
5. For spatial/material mechanisms, compile coordinated state frames with material fields, molecular motifs, qualitative gradients, interfaces, surfaces, and callouts instead of stock node glyphs.
6. Run a bounded reference-free program search over editable vector density, stroke hierarchy, palette, and layer-depth parameters. Fitness uses scientific depiction coverage, multipart-object richness, learned presentation grammar, palette discipline, spacing, and publication composition; it never compares pixels to a target image.
7. Derive physical-size SVG, 300-dpi PNG, and editable TikZ from the winning semantic scene.
8. Measure stable IDs, semantic references, clipping, label collisions, typography, strokes, contrast, safe inset, scientific-area utilization, depiction-operator coverage, generic-object use, and semantic/recipe consistency.
9. Stop at `brief_pending`. The workflow never approves itself.
10. After human brief and final approval, an additional explicit promotion transaction may add the design to the approved registry.

This is the target-free analogue of an evolutionary image loop. A population is made from mutable figure programs rather than flattened bitmaps; mutations change vector density, stroke widths, palette mappings, gradient depth, and shadow treatment; and the fitness function evaluates scientific obligations, visual hierarchy, occupancy, repetition, label dependence, editability, and export integrity. Every candidate records an additive score breakdown, whether an approved learning prior was used, and which content-stripped signals affected the decision. Public examples may inform a reviewed quality rubric. Only separately human-approved, content-stripped presentation grammar may become a reusable local prior.

The compiler no longer depends on a single latent-diol template. It selects among material cross-sections, cellular cutaways, experimental systems, and mechanism landscapes from coordinate-free semantic roles. Each archetype uses multipart depiction operators such as molecular scaffolds, protein-domain cartoons, membrane bilayers, transmembrane receptors, nucleic-acid compartments, instruments, functional surfaces, and stimulus fields. Unsupported or overly broad briefs fail back to editing rather than pretending that a generic glyph is publication quality.

## Scientific and presentation lanes

Scientific meaning and presentation reuse are isolated. Current-prompt evidence controls entities, predicates, labels, claims, citations, quantities, units, and uncertainty. Registry retrieval can influence only abstract presentation grammar such as primitive mix, topology counts, flow direction, spacing, palette, stroke tiers, type scale, gradient kinds, aspect ratio, and density.

Search results never expose stored TikZ, labels, captions, citations, scientific identities, predicates, measurements, or private paths. The selected registry snapshot and entry revisions are written into project provenance before brief approval, so a selection change invalidates downstream approval.

Approved entries also expose controlled, content-stripped learning features: composition archetype, depiction-operator vocabulary, mean parts per scientific object, density, spacing, flow, palette, strokes, and typography. New prompts retrieve compatible operator priors after semantic planning, and bounded candidate search uses their structural complexity as a fitness prior. The immutable approved TikZ remains available for audit but is never pasted into an unrelated figure.

## Commands

- `npm run scientific:prompt-plan` uses the configured provider and falls back to an editable semantic form when unavailable.
- `scientific:prompt-plan --planner-adapter adapter.json` invokes a local or third-party semantic planner through a bounded, shell-free JSON-over-stdio contract. The adapter receives only the prompt/evidence/profile/dimensions envelope and must return coordinate-free brief semantics; deterministic code still owns all geometry.
- `scripts/auracall-scientific-brief-planner.mjs` is the reference browser-backed adapter for a configured local AuraCall service. It uses the existing authenticated ChatGPT profile, requires an exact conversation URL, checkpoints each response ID before polling, resumes the same durable response after transient service failure, and never retries an uncertain create request. Point a planner-adapter configuration at the absolute Node executable and this script; pass the URL and runtime profile through the adapter's explicit environment map.
- `npm run scientific:prompt-demo` deterministically replays the reviewed latent-diol semantic fixture.
- `npm run scientific:registry-search` searches presentation-only grammar.
- `npm run scientific:registry-rebuild` rebuilds the content-addressed index.
- `scientific:registry-promote` requires a local promotion bundle, a current final approval, passing QA, exact artifact digests, owned or licensed artwork, and explicit retention approval.

Pass `--tectonic-bin PATH` to `scientific:prompt-plan` to compile the editable TikZ into a vector PDF. Unsupported gradient transforms, spread modes, stop opacity, or gradient strokes fail closed. Gradient strokes must first be expanded to filled geometry.

## Approval boundaries

A generated preview is a candidate, not an approved scientific figure. `brief_pending` requires a human to review scientific meaning, evidence classification, uncertainty, caption, alt text, and selected presentation grammar. `final_pending` requires visual and cross-format review. Final figure approval does not grant registry retention, and registry promotion does not grant proposal insertion.

The registry is content-addressed and append-audited. Full approved artifacts remain inspectable as immutable blobs, while retrieval exposes only generalized presentation grammar. Conflicting active revisions fail rather than overwrite prior work.
