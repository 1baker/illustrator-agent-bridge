# Scientific Figure Studio v1

`ScientificFigureProject.v1` is the semantic source of truth for manuscript and proposal figures. It composes schematic, reviewed plot, immutable supplied-image, and candidate analysis-overlay panels into one deterministic artifact family: SVG, PDF, PNG, semantic JSON, editable LaTeX, analysis JSON, manifest, and QA report. Illustrator and Photoshop remain optional downstream editors.

## Approval and lifecycle

Projects move through `discovered`, `researching`, `brief_pending`, `brief_approved`, `rendering_analysis`, `final_pending`, `final_approved`, and `inserted`. The versioned `scientific-figure-approval-preimage.v2` brief preimage includes the publication profile and dimensions, layout, exact research/evidence records and source digests, typed claim-to-semantic-target bindings, source assets and PDF-page selections, adapter/weight/runtime identities, parameters, prompts, ROIs, calibration, and reviewed candidate analysis. Rendering refuses stale approval. The final preimage additionally binds every artifact digest, the complete manifest-file digest, the QA policy/result digest, and the analysis digest. A mutation in any decision-relevant field invalidates downstream approval.

`ScientificImageRequest.v1` and its CLI, HTTP, and MCP entrypoints remain unchanged. The additive project interfaces are:

- CLI: `scientific:project`
- HTTP: `POST /v1/scientific/figure-project`
- MCP: `generate_scientific_figure_project`

## Planner boundary

`ScientificBriefPlanner` is provider-neutral. `OpenAiScientificBriefPlanner` uses the Responses API with strict JSON Schema output; OpenAI documents Structured Outputs as schema-adherent model output ([official guide](https://developers.openai.com/api/docs/guides/structured-outputs)). `ManualScientificBriefPlanner` returns an editable form when no provider is configured. A planner proposes components, relationships, claims, evidence links, uncertainty, panel intent, and analysis requests. Deterministic code alone owns coordinates, sizing, routing, and rendering.

## Supplied media and analysis

PNG, JPEG, TIFF, SVG, and selected PDF pages are accepted only beneath the configured asset root. The declared SHA-256 must match before rendering. Raw bytes are never overwritten; crops, channel choices, overlays, and measurements are derived artifacts. Supplied SVG is never composed directly: the original stays immutable while a separately hashed rendering derivative is stripped of comments and rejected if it contains scripts, event handlers, `foreignObject`, XML entities, unsafe CSS, external/file references, unsafe data URIs, or other active constructs.

Analysis adapters use JSON over standard input/output. Before process launch, the host resolves and hash-verifies the executable, adapter entrypoint, reviewed runtime identity, image, and weights; it rejects symlinks, non-files, non-executable launchers, path escapes, digest mismatches, and launch-environment drift. These identities are echoed in analysis JSON, the manifest, and approval preimages. No weights are bundled or downloaded. Reference adapters are provided for SAM 2 image prompting and TorchVision-compatible TorchScript detection. Meta's official SAM 2 repository documents image prediction and prompted masks ([official repository](https://github.com/facebookresearch/sam2)). Ultralytics is intentionally not a baseline dependency because its published licensing requires an AGPL or Enterprise choice ([official licensing page](https://www.ultralytics.com/license)).

Calibration is physical only when reviewed embedded metadata or scale-bar evidence supplies units and units-per-pixel. Otherwise analysis is explicitly pixel-only and physical-unit claims fail QA. Every model output is labeled `candidateAnnotations: true`; final figure approval is the human acceptance boundary.

## Publication QA

QA verifies profile dimensions, physical-size typography and strokes, panel framing and labels, legend identity, contrast, red-green color-vision simulation, grayscale differentiation, raster resolution, cross-format dimensions, reviewed plot inputs, analysis provenance, calibration, and current approvals. Every claim-bearing object, relationship, or quantitative series must have a typed binding to an exact approved LitScout record, reviewed supplied-data record, or explicitly labeled hypothesis. Irrelevant citations, orphaned mechanisms, unsupported planner assertions, and contradicted support types fail closed. Errors fail closed; warnings remain visible in the QA report.
