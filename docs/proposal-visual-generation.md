# Proposal-driven figure and table generation

Proposal authors can declare required visual assets directly in Markdown with fenced `proposal-visual` JSON blocks. Ordinary narrative remains untouched. Each declaration preserves the exact prompt and carries enough reviewed structure for deterministic generation.

## Routing contract

- `figure` plus structured content routes to editable TikZ, semantic SVG, PNG, and compiled PDF. `generatorKind` selects `brief`, `story`, `text`, or `figure` input.
- `plot` routes reviewed numerical data to PGFPlots, semantic SVG, PNG, and compiled PDF.
- `table` routes reviewed columns and rows to an editable LaTeX table and compiled PDF.
- A prompt-only `figure` routes to `adobe_svg_proof`, where Illustrator produces the editable SVG and Photoshop produces a raster proof. The default `prepare` mode creates inspectable JSX jobs without launching desktop applications; `dry_run` proves both COM command paths; `execute` performs the live Adobe workflow.
- `auto` chooses the compatible route above. Incompatible renderer/kind combinations fail closed.

Plots and tables require reviewed structured values. The generator never invents numerical data or table cells from a prose prompt. Adobe applications are execution and editing adapters; the proposal declaration, semantic scene, plot specification, or table specification remains the authoritative software record.

## Command

Run `npm run proposal:visuals` for the checked-in example, or use `proposal:visuals PATH --output-dir DIR --adobe-mode prepare|dry_run|execute`. The command writes one package manifest plus per-asset sources and outputs. TikZ, PGFPlots, and table routes compile to real PDFs through Tectonic.

The same operation is available through `POST /v1/proposal/visuals` and the MCP tool `generate_proposal_visuals`, allowing a browser agent or another software client to submit proposal text without automating an Adobe UI.
