# Illustrator Agent Bridge

Early bridge for connecting an LLM or browser agent to Adobe Illustrator, with two execution paths:

- Native Illustrator Beta MCP: preferred when the latest Illustrator Beta MCP server is available.
- ExtendScript job files: fallback for regular Illustrator installs and for deterministic vector-art generation.

The first practical goal is reliable communication plus bounded iterative artwork refinement. The bridge can discover/call Illustrator MCP tools, or generate `.jsx` jobs that Illustrator can run and report back through a JSON result file.

## Current Status

The bridge has proven no-key Illustrator control on Windows Illustrator from WSL:

- Detects an installed Illustrator desktop app.
- Executes generated JSX through Windows COM with `Illustrator.Application.DoJavaScriptFile`.
- Creates an Illustrator document and draws a named vector circle.
- Creates a multi-element vector probe with polygons, ellipses, lines, text, and curved Bezier paths.
- Can drive the actual Windows mouse against the live Illustrator window from WSL/Windows after measuring and focusing the target window.
- Uses local semantic search to retrieve scientific concepts, visual metaphors, object semantics, and publication constraints before planning complex concept figures.
- Uses shape recipes for concrete objects such as cats, locks, and keys, then runs a local guard that returns a refinement prompt when recognizable parts, spatial grammar, or visual footprint checks fail.
- Runs post-export artwork review that combines export QA, vector/pixel checks, scene composition checks, label-reliance checks, and `nextGoalPrompt` output for the next refinement pass.
- Runs a cross-Adobe SVG proof workflow: natural-language prompt -> semantic/object/scientific plan -> editable Illustrator SVG -> Photoshop COM raster proof PNG -> export QA/artwork review for feedback before accepting the SVG.
- Runs a collaborative Adobe project workflow: Illustrator creates the editable vector source SVG, Photoshop opens that SVG and writes a layered PSD, PNG preview, feedback JSON, and SVG handoff, Illustrator places that Photoshop SVG handoff back into the active document as a named reference layer, and Illustrator exports the final project SVG. With `--visible-mouse-proof`, the bridge also drives the real mouse in Illustrator, then Photoshop, then Illustrator again; Photoshop commits the return SVG after the visible mouse edit.
- Can write a strict ChatGPT Pro/AuraCall external review packet for the final Adobe project SVG, consume the returned verdict JSON, or run an opt-in AuraCall browser reviewer directly, then use blocking findings as the next full Illustrator -> Photoshop -> Illustrator revision prompt until the external reviewer passes.
- Can inspect reviewed SVG, AI, EPS, PDF, or saved bridge scene JSON files and convert detected vector shape combinations into searchable `shape_combination` semantic evidence.
- Reads Illustrator's result JSON back from `var/results/`.
- Exposes the same probe through CLI, HTTP dashboard, and MCP tools for an agent/browser workflow.

The proof command is:

```bash
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait --timeout-ms 30000
```

See [docs/communication-proof.md](docs/communication-proof.md) for the concrete verification output and next engineering steps.

## Quick Start

```bash
npm install
npm run build
npm run illustrator:detect
node dist/src/cli.js photoshop:detect --platform wsl
node dist/src/cli.js chatgpt:detect
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait
node dist/src/cli.js illustrator:probe --method com --draw-complex --wait --mouse-proof --mouse-action click --timeout-ms 30000
npm run illustrator:mouse -- --action move --x 0.5 --y 0.5 --dry-run
npm run photoshop:mouse -- --platform wsl --action drag --x 0.34 --y 0.54 --to-x 0.66 --to-y 0.58 --tool-shortcut b --dry-run
npm run jsx:ping
npm run jsx:cartoon
npm run semantic:search -- "cartoon lab flask"
npm run semantic:search -- "electron transfer membrane" -- --kind scientific_concept
npm run semantic:inspect-vector -- ./examples/cartoon-scene.json
npm run plan:cartoon -- "cartoon lab scientist with flask"
npm run plan:cartoon -- "urban transit system with skyline river solar rooftops and data overlay"
npm run plan:scientific -- "polymer membrane electron transfer catalytic concept"
npm run plan:object -- "full cat icon"
npm run plan:cartoon -- "cartoon lab scientist with flask" -- --planner auto
npm run workflow:cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.pdf
npm run workflow:execute-cartoon -- "cartoon lab scientist with flask" --output ./var/exports/figure.svg --format svg --dry-run
npm run workflow:execute-adobe-svg-proof -- "polymer membrane electron transfer catalytic concept" --output ./var/exports/concept.svg --intent auto --illustrator-run-mode com --platform wsl --photoshop-platform wsl --dry-run
npm run workflow:execute-adobe-project -- "polymer membrane electron transfer catalytic concept" --output ./var/exports/concept-project.svg --intent auto --illustrator-run-mode com --platform wsl --photoshop-platform wsl --dry-run
npm run workflow:execute-adobe-project -- "polymer membrane electron transfer catalytic concept" --output ./var/exports/concept-project-visible.svg --intent auto --illustrator-run-mode com --platform wsl --photoshop-platform wsl --visible-mouse-proof --dry-run
npm run workflow:execute-object -- "full cat icon" --output ./var/exports/cat.png --format png --run-mode com --platform wsl --dry-run
node dist/src/cli.js qa:artwork ./var/exports/cat.png --format png --prompt "full cat icon" --target cat
```

Optional LLM planning uses the OpenAI Responses API with Structured Outputs, then validates the returned scene through the same bridge contract before writing JSX:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-5.5"
npm run plan:cartoon -- "cartoon lab scientist with flask" -- --planner openai
```

The `jsx:*` commands write jobs under `var/jobs/` and expected results under `var/results/`. In Illustrator, run a generated job with `File > Scripts > Other Script`, then inspect the matching result JSON.
On Windows or WSL, the quickest no-API communication proof is COM automation:

```bash
node dist/src/cli.js illustrator:detect
node dist/src/cli.js illustrator:probe --method com --draw-circle --wait --timeout-ms 30000
```

That command creates a JSX scene with one Illustrator vector circle, executes it through `Illustrator.Application.DoJavaScriptFile`, then waits for Illustrator to write `var/results/<job-id>.json` with `ok=true`.

To prove a more complex vector scene and live mouse control, run a dry mouse proof first:

```bash
npm run illustrator:mouse -- --action move --x 0.5 --y 0.5 --dry-run
npm run photoshop:mouse -- --platform wsl --action drag --x 0.34 --y 0.54 --to-x 0.66 --to-y 0.58 --tool-shortcut b --dry-run
node dist/src/cli.js illustrator:probe --method com --draw-complex --wait --mouse-proof --mouse-action click --timeout-ms 30000
```

The mouse driver is intentionally fail-closed: it only runs on Windows/WSL, finds a running Illustrator or Photoshop window, restores and focuses it, measures the window bounds, then moves/clicks/drags using coordinates relative to that window. Pass `--tool-shortcut` when the visible pass should switch tools first; the Adobe project workflow defaults to `\` for Illustrator's line tool and `b` for Photoshop's brush tool.

When the host OS has a JSX file association, or when you pass an Illustrator app name/path, the bridge can also ask the desktop to open the job:

```bash
node dist/src/cli.js job:launch <job-id> --dry-run --platform macos --app "Adobe Illustrator"
node dist/src/cli.js job:launch <job-id> --platform macos --app "Adobe Illustrator"
```

Desktop JSX launch may show Adobe's external-script warning. Use `illustrator:probe --method desktop --auto-confirm-dialog --draw-circle --wait` only when you need to test that route; COM is preferred on Windows/WSL because it bypasses the warning dialog.

After a document exists in Illustrator, generate an export job:

```bash
npm run jsx:export -- --format pdf --output ./var/exports/figure.pdf
```

Check or wait for a job result after the JSX has been run in Illustrator:

```bash
node dist/src/cli.js job:status <job-id>
node dist/src/cli.js job:wait <job-id> --timeout-ms 60000
```

Run structural and PNG visual QA on the exported file:

```bash
node dist/src/cli.js qa:export ./var/exports/figure.png --format png --min-width 360 --min-height 240 --min-nonblank-ratio 0.001
```

Run the higher-level artwork review guard after export QA when a scene plan is available:

```bash
node dist/src/cli.js qa:artwork ./var/exports/figure.svg --format svg --scene ./saved-plan-output.json --prompt "cartoon lab scientist with flask"
```

`qa:artwork` accepts raw scene JSON or full plan/workflow JSON. It returns `review.ok`, `review.issues`, `review.improvements`, and `review.nextGoalPrompt`. Feed `review.nextGoalPrompt` into the next planning or workflow call when the export is too sparse, too small, cropped, overly text-driven, missing named editable parts, or otherwise likely to fail visual acceptance.

Plan and execute a complex scientific concept scene:

```bash
npm run semantic:search -- "polymer membrane electron transfer catalytic concept" -- --kind scientific_concept --limit 5
npm run plan:scientific -- "polymer membrane electron transfer catalytic concept"
node dist/src/cli.js job:run-com <job-id> --platform auto
node dist/src/cli.js job:wait <job-id> --timeout-ms 60000
```

The scientific planner performs several semantic searches, activates matching concept modules, generates validated Illustrator vector elements, and writes a JSX job. Use `job:run-com` on Windows/WSL to execute that generated job through `Illustrator.Application.DoJavaScriptFile`.

Plan and guard a concrete object shape:

```bash
npm run semantic:search -- "cat whiskers tail paws" -- --kind shape_recipe
npm run plan:object -- "full cat icon"
npm run plan:object -- "secure padlock icon"
npm run plan:object -- "simple house key icon"
node dist/src/cli.js guard:object cat ./saved-plan-output.json
```

`plan:object` supports strict guarded `cat`, `lock`, and `key` targets today. The Adobe SVG proof workflow also has a generic object fallback for unsupported object prompts such as microscopes, reactors, instruments, machines, and other complex apparatuses. The strict path retrieves local shape recipes, learned `shape_combination` evidence, object semantics, style, and publication constraints, then builds a named Illustrator vector scene, runs structural scene QA, and runs the object guard. The generic fallback retrieves object/scientific/style evidence, infers a broad archetype, builds named editable components and callouts, and then relies on export QA plus artwork review rather than the cat/lock/key structural guard. The guard rejects missing, invisible, or zero-size required parts, incoherent placement, target-word text labels, and object silhouettes that are too small to read. When `plan.guard.ok` is false, feed `plan.guard.nextGoalPrompt` or `plan.guard.nextPrompt` into the next planning call so the agent keeps iterating until the object is recognizable.

Run a guarded object workflow end-to-end:

```bash
npm run workflow:object -- "full cat icon" --output ./var/exports/cat.png --format png
npm run workflow:execute-object -- "full cat icon" --output ./var/exports/cat.png --format png --run-mode com --platform wsl --max-guard-iterations 3 --dry-run
npm run workflow:execute-object -- "secure padlock icon" --output ./var/exports/lock.svg --format svg --run-mode com --platform wsl
```

`workflow:execute-object` can run a bounded guard refinement loop before Illustrator execution. Pass `--max-guard-iterations 3` so each failed guard attempt feeds `workflow.plan.guard.nextGoalPrompt` into the next object-planning pass until the guard passes or the limit is reached. If the final guard still fails, the workflow stops before Illustrator execution and returns the final `nextGoalPrompt`. With `--run-mode com` on Windows/WSL, it runs the scene and export jobs sequentially through Illustrator COM; with default `--run-mode launch`, it uses the regular desktop launch path.

When an execute workflow waits for Illustrator results and export QA is enabled, it also runs the artwork review guard and includes `artworkReview` in the response. If the review returns an actionable `artworkReview.nextGoalPrompt`, `next` contains that prompt so the agent can revise the Illustrator scene instead of accepting the first export. Pass `--skip-review` only when you intentionally want raw export QA without composition/recognizability review.

Run a prompt-to-Illustrator SVG workflow with Photoshop proofing:

```bash
npm run workflow:adobe-svg-proof -- "core shell emulsion polymerization scientific concept" \
  --output ./var/exports/core-shell.svg \
  --intent auto \
  --proof-width 1400 \
  --proof-height 900

npm run workflow:execute-adobe-svg-proof -- "core shell emulsion polymerization scientific concept" \
  --output ./var/exports/core-shell.svg \
  --intent auto \
  --illustrator-run-mode com \
  --platform wsl \
  --photoshop-platform wsl \
  --max-review-iterations 3

npm run workflow:execute-adobe-svg-proof -- "complex microscope object with objective lenses and calibration controls" \
  --output ./var/exports/microscope.svg \
  --intent object \
  --illustrator-run-mode com \
  --platform wsl \
  --photoshop-platform wsl \
  --max-review-iterations 3
```

`workflow:execute-adobe-svg-proof` keeps the Illustrator-exported SVG as the editable source of truth, then runs a Photoshop JSX proof job through `Photoshop.Application.DoJavaScriptFile`. Photoshop opens the SVG, writes a PNG proof, and the bridge runs PNG QA plus artwork review against that rasterization. If the review returns an actionable `artworkReview.nextGoalPrompt` and `--max-review-iterations` is greater than 1, the workflow feeds that prompt into the next Illustrator planning pass and regenerates the SVG/proof pair until no actionable review prompt remains or the iteration limit is reached. Use `--dry-run` first to inspect the Illustrator and Photoshop COM commands without opening either app.

Create and run just the Photoshop proof leg for an existing SVG:

```bash
node dist/src/cli.js photoshop:detect --platform wsl
npm run photoshop:proof-svg -- ./var/exports/figure.svg --output ./var/exports/figure.photoshop-proof.png
node dist/src/cli.js job:run-photoshop-com <job-id> --platform wsl --dry-run
```

`photoshop:detect` is read-only. It checks Photoshop COM registration, executable path, running process state, and recent Windows crash events. Run it before a live Photoshop proof or Adobe project pass when `job:run-photoshop-com` fails to create `Photoshop.Application`.

Run a full Illustrator/Photoshop collaborative project pass:

```bash
npm run workflow:execute-adobe-project -- "core shell emulsion polymerization scientific concept" \
  --output ./var/exports/core-shell-project.svg \
  --intent auto \
  --illustrator-run-mode com \
  --platform wsl \
  --photoshop-platform wsl \
  --max-review-iterations 3

npm run workflow:execute-adobe-project -- "core shell emulsion polymerization scientific concept" \
  --output ./var/exports/core-shell-project.svg \
  --intent auto \
  --illustrator-run-mode com \
  --platform wsl \
  --photoshop-platform wsl \
  --external-review-packet ./var/exports/core-shell-project.external-review.json \
  --review-report ./var/exports/core-shell-project.review.json \
  --require-external-review

npm run workflow:execute-adobe-project -- "core shell emulsion polymerization scientific concept" \
  --output ./var/exports/core-shell-project.svg \
  --intent auto \
  --illustrator-run-mode com \
  --platform wsl \
  --photoshop-platform wsl \
  --external-review-provider auracall \
  --external-review-packet ./var/exports/core-shell-project.external-review.json \
  --external-review-output ./var/exports/core-shell-project.external-verdict.txt \
  --review-report ./var/exports/core-shell-project.review.json \
  --external-review-model gpt-5.2 \
  --max-review-iterations 3

npm run workflow:execute-adobe-project -- "core shell emulsion polymerization scientific concept" \
  --output ./var/exports/core-shell-project-visible.svg \
  --intent auto \
  --illustrator-run-mode com \
  --platform wsl \
  --photoshop-platform wsl \
  --visible-mouse-proof \
  --visible-mouse-duration-ms 1200 \
  --max-review-iterations 3
```

Run `node dist/src/cli.js workflow:preflight-adobe-project --platform wsl --photoshop-platform wsl` before the heavier project workflow when you need a read-only readiness check. By default, preflight treats a currently responding Photoshop process as usable even if Windows still has recent Photoshop crash events; pass `--photoshop-crash-lookback-minutes N` when you want strict crash-history blocking. Add `--require-chatgpt-browser` or `--external-review-provider auracall` to include AuraCall/ChatGPT browser readiness in the same result. The same preflight is exposed over HTTP as `GET /v1/workflows/adobe-project/preflight` and through MCP as `preflight_adobe_project_workflow`.

`workflow:execute-adobe-project` is the heavier back-and-forth path. It runs Illustrator first to build the editable vector scene and export a source `.illustrator-source.svg`, then runs Photoshop through COM to open that SVG and save a layered `.photoshop-working.psd`, a `.photoshop-reference.png` preview, a `.photoshop-handoff.svg`, and a `.photoshop-feedback.json` file. The workflow then returns to Illustrator, places the Photoshop SVG handoff as a named reference layer in the still-open vector document, exports the final SVG, and runs QA/review. If review returns `nextGoalPrompt` and `--max-review-iterations` is greater than 1, the next pass repeats the full Illustrator -> Photoshop -> Illustrator loop instead of only rechecking the same export.

Pass `--review-report ./var/exports/name.review.json` on final or dry-run project executions when you need an acceptance audit record. The report records whether the run was a dry-run, whether the final SVG was locally accepted, the Illustrator/Photoshop artifact paths, local Codex QA/artwork review status, ChatGPT browser verdict status, review-loop stop reason, per-iteration scores, repeated-feedback detection, and any next prompt required before accepting the SVG. For the full user goal, inspect `reviewReport.goalAcceptance.accepted`: it is true only when the real Adobe round trip, Codex local review, and ChatGPT browser review have all passed. If local review or ChatGPT returns the same actionable feedback on a later round, the loop stops as `stalled` instead of spending more Adobe launches on an unchanged required fix.

With `--visible-mouse-proof`, the project workflow expands to a visible Illustrator -> Photoshop -> Illustrator UI pass. It draws with the real mouse in Illustrator before the source SVG export, opens the source SVG in Photoshop and keeps the document active, drives the real mouse in Photoshop, then sends Escape and runs a Photoshop post-mouse commit job that overwrites the PSD, PNG preview, feedback JSON, and `.photoshop-handoff.svg`. Photoshop saves WSL-hosted PSD/PNG artifacts through a host temp file before copying them back, so Windows Photoshop does not fail on `\\wsl.localhost` save paths. Illustrator then consumes that post-mouse Photoshop SVG handoff as an editable rebuilt reference layer, avoiding fragile linked SVG placement dialogs, receives one more visible mouse return pass, and exports the final SVG. Use `--dry-run` first to inspect all PowerShell COM and mouse commands without opening or moving the apps.

The visible project path also waits briefly before each mouse pass so newly opened Adobe windows expose a measurable target, retries transient Photoshop COM busy responses, and runs final SVG artwork review after export. If review returns `nextGoalPrompt` and `--max-review-iterations` is greater than 1, each next pass uses the original concept text for the scene title instead of nesting guard prompts into the artwork.

For a ChatGPT browser judgment loop, run `node dist/src/cli.js chatgpt:detect` first. It wraps `auracall doctor --target chatgpt --json --local-only --prune-browser-state` and reports whether the managed ChatGPT browser is ready, blocked by Cloudflare/manual-clear, or not running without kicking off a reviewer run. Then run the Adobe project workflow with either `--external-review-provider auracall` or the manual `--external-review-packet` path after local QA is enabled. The AuraCall provider writes a review packet, attaches any existing final/source/handoff/feedback artifacts, preflights browser readiness by default, runs one waited ChatGPT browser reviewer call with `auracall --engine browser --browser-target chatgpt --wait`, parses the saved assistant response as strict JSON, and fails closed if the browser is not live or the verdict is malformed. Use `--external-review-packet` and `--external-review-output` to keep stable audit files, `--external-review-model` plus `--external-review-timeout-seconds` to tune the reviewer run, and `--no-external-review-preflight` only when you intentionally want to skip the readiness gate. The manual packet contains `reviewerPrompt`, final/source/handoff artifact paths, artifact evidence with existence status, byte counts, and SHA-256 hashes, local QA status, prior review-history summaries, concrete previous local issues, and previous ChatGPT blocking findings, plus the exact JSON schema ChatGPT Pro must return; submit it through AuraCall/ChatGPT browser, save the strict JSON response, then rerun with `--external-review-verdict ./path/to/verdict.json --max-review-iterations 3`. A missing required artifact, missing hash, failing verdict, or verdict with `blocking_findings` becomes the next full Illustrator -> Photoshop -> Illustrator revision prompt; a pass requires `pass: true`, score at least 90, no blocking findings, and resolution of any previous blocking findings recorded in the review history.

Inspect reviewed vector assets and turn their shape combinations into searchable evidence:

```bash
npm run semantic:inspect-vector -- ./examples/cartoon-scene.json ./path/to/reviewed-artwork.svg
npm run semantic:learn-vector -- ./path/to/reviewed-artwork.svg --corpus ./data/semantic-corpus.json --output ./var/learned-semantic-corpus.json
npm run semantic:search -- "shape combination path circle text" -- --kind shape_combination --corpus ./var/learned-semantic-corpus.json
```

Use this after reviewing Drive-discovered Illustrator/vector assets. `semantic:inspect-vector` is read-only and reports shape counts, named parts, SVG or bridge-scene spatial part relationships, colors, inferred tags, and a semantic item. `semantic:learn-vector` writes a merged corpus file, so keep generated or experimental corpora under `var/` unless you explicitly want to update the committed seed corpus.

### Google Drive Desktop Vector Learning

The hosted Google Drive connector is useful when authenticated, but the bridge can also learn from the local Google Drive Desktop app. On Windows/WSL, inspect Google Drive DriveFS metadata and copy only reviewed vector assets into a generated staging folder under `var/`, then learn shape-combination records from those staged files:

```bash
npm run semantic:inspect-vector -- ./var/drive-vector-search/staged-vector-context --limit 500
npm run semantic:learn-vector -- ./var/drive-vector-search/staged-vector-context \
  --corpus ./data/semantic-corpus.json \
  --output ./var/drive-vector-search/learned-semantic-corpus.json \
  --limit 500
npm run semantic:search -- "SABER powder coating pitch asset" \
  --kind shape_combination \
  --corpus ./var/drive-vector-search/learned-semantic-corpus.json
```

The local Drive workflow should stay reviewed and selective:

- Keep generated manifests, copied vectors, exports, and learned corpora under `var/`.
- Do not commit staged Google Drive artwork, generated corpora, result JSON, or exported user artwork.
- Prefer small scientific, figure, pitch, or design assets; exclude legal, tax, finance, invoice, HR, confidential, and administrative folders unless explicitly requested.
- Preserve original Drive account and logical path provenance in learned records so semantic search results can point back to the source.

To run the HTTP/MCP bridge against a learned local corpus, set `ILLUSTRATOR_SEMANTIC_CORPUS` before starting the server:

```bash
ILLUSTRATOR_SEMANTIC_CORPUS=/absolute/path/to/var/drive-vector-search/learned-semantic-corpus.json npm start
```

Then browser or ChatGPT tool calls to semantic search, scientific planning, object planning, and guarded object workflows will use that corpus by default.

For the native MCP path, copy the server URL and key from Illustrator Beta `MCP & Tools`, then:

```bash
export ILLUSTRATOR_MCP_URL="http://localhost:18412/v1/mcp"
export ILLUSTRATOR_MCP_TOKEN="replace_with_your_key"
npm run mcp:list-tools
```

Start the local HTTP job bridge for an LLM/browser agent:

```bash
npm start
```

Then open `http://127.0.0.1:4317/dashboard` for the local browser control surface.

Expose the bridge itself as an MCP server over stdio:

```bash
npm run mcp:serve
```

That server exposes tools to create Illustrator JSX jobs and to proxy Illustrator Beta MCP calls when `ILLUSTRATOR_MCP_URL` and `ILLUSTRATOR_MCP_TOKEN` are configured.
It also exposes `semantic_search_visual_knowledge` so an agent can retrieve object semantics and publication constraints before mutating Illustrator.
Use `inspect_vector_shape_files` on local reviewed vector files when a browser agent needs shape-combination evidence before updating a corpus.
Use `detect_illustrator_desktop` and `probe_illustrator_communication` first to prove local no-key Illustrator communication. On Windows/WSL, pass `method: "com"`, `drawCircle: true`, and `waitForResult: true` to prove Illustrator can draw a circle and report completion.
Pass `drawComplex: true` and `mouseProof: true` to prove multi-element vector drawing plus actual pointer control. Use `drive_illustrator_mouse` or `drive_photoshop_mouse` directly when an agent needs a measured move, click, double-click, or drag against the live Adobe window.
Use `plan_cartoon_scene_job` for the current one-call fallback workflow: prompt -> semantic evidence -> scene plan -> static QA -> generated Illustrator JSX. The deterministic fallback now handles broad prompts with richer editable archetypes for lab scenes, urban/transit systems, workflows/processes, ecosystems/landscapes, and generic explainer diagrams instead of returning a sparse placeholder.
Use `plan_scientific_concept_scene_job` when the prompt is an abstract or complex scientific concept. It retrieves scientific concepts and visual metaphors before creating the Illustrator scene job.
Use `plan_object_shape_scene_job` when the prompt asks for a concrete cat, lock, or key. It returns `plan.guard`, including `guard.nextGoalPrompt` / `guard.nextPrompt` for the next refinement pass if the object is missing required recognizable parts.
Use `guard_object_shape_scene` to check a proposed scene before or after a refinement step.
Use `prepare_object_shape_workflow` or `execute_object_shape_workflow` when the browser agent should create and optionally execute a guarded object scene plus export in one tool call. Pass `maxGuardIterations: 3` when the browser should let Codex reprompt itself with guard feedback before launching Illustrator, and pass `runMode: "com"` on Windows/WSL for the no-warning Illustrator COM path.
Use `bridge_run_job_via_com` to execute any generated JSX job through Windows Illustrator COM without desktop script-warning prompts.
Use `prepare_cartoon_publication_workflow` when the agent needs both a scene job and a follow-up export job with an ordered runbook.
Use `execute_cartoon_publication_workflow` when the agent should prepare that workflow, launch scene/export JSX jobs, wait for results, and run export artifact QA. Pass `dryRun: true` first to verify the launch commands.
Use `execute_adobe_svg_proof_workflow` when a browser/ChatGPT agent should take a prompt, create editable Illustrator SVG artwork, ask Photoshop to rasterize that SVG into a PNG proof, and return QA/review feedback for the next Illustrator refinement pass.
Use `execute_adobe_project_workflow` when the agent should run a true shared project handoff where Illustrator sends source SVG to Photoshop, Photoshop creates PSD/PNG/feedback plus a return SVG handoff, and Illustrator consumes that Photoshop SVG before final SVG export. Pass `visibleMouseProof: true` when the agent should also drive the visible mouse in Illustrator, Photoshop, and Illustrator again; in that mode Photoshop writes the return SVG after the Photoshop mouse edit.
Use `bridge_launch_job` to open a generated JSX job from an MCP client, then `bridge_wait_for_job_result` to prove Illustrator wrote the result JSON.
Use `qa_export_artifact` after export to check file size, format signature, dimensions, SVG/PDF structure, and PNG nonblank pixel content.
Use `review_artwork_quality` after export when an agent needs a semantic visual critique and `review.nextGoalPrompt` for the next revision pass.

The planner defaults to `deterministic`. Set `--planner auto` or pass `planner: "auto"` to use the OpenAI planner when `OPENAI_API_KEY` is configured, with deterministic fallback when it is not. Set `--planner openai` to require OpenAI planning. `OPENAI_MODEL` defaults to `gpt-5.5`, and `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. The dashboard exposes the same planner and model controls.

Create a job over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs \
  -H 'content-type: application/json' \
  -d '{"kind":"ping","message":"hello Illustrator"}'
```

Launch a generated job over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/jobs/<job-id>/launch \
  -H 'content-type: application/json' \
  -d '{"dryRun":true,"platform":"macos","appPath":"Adobe Illustrator"}'
```

Execute a cartoon workflow dry-run over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/workflows/cartoon/execute \
  -H 'content-type: application/json' \
  -d '{"prompt":"cartoon lab scientist with flask","outputPath":"var/exports/figure.svg","format":"svg","dryRun":true,"platform":"macos"}'
```

Review an exported artifact over HTTP:

```bash
curl -sS http://127.0.0.1:4317/v1/qa/artwork \
  -H 'content-type: application/json' \
  -d '{"path":"var/exports/figure.svg","format":"svg","prompt":"cartoon lab scientist with flask","scene":{"elements":[{"type":"rect","name":"main-shape","x":120,"y":120,"width":360,"height":240,"style":{"fill":"#88c0d0","stroke":"#2e3440","strokeWidth":4}}]}}'
```

## Why This Shape

Adobe documents current Illustrator scripting support through JavaScript/ExtendScript, AppleScript, VBScript, and `File > Scripts`. Adobe also documents a new Illustrator Beta MCP server for tools such as Codex, Claude Code, and Cursor. This repo supports both because the Beta MCP path is the clean future-facing interface, while ExtendScript remains the lowest-friction automation path for installed Illustrator.

Useful references:

- Adobe Illustrator developer page: https://developer.adobe.com/illustrator/
- Install and run scripts in Illustrator: https://helpx.adobe.com/illustrator/desktop/automate-visualize-data/automate-actions/install-and-run-scripts.html
- Illustrator Beta MCP overview: https://helpx.adobe.com/uk/illustrator/desktop/connect-with-other-apps-and-tools/about-using-ai-tools-with-illustrator.html
- Connect Illustrator Beta to AI tools: https://helpx.adobe.com/uk/illustrator/desktop/connect-with-other-apps-and-tools/connect-illustrator-to-ai-tools.html

## Security Notes

Keep the HTTP bridge bound to `127.0.0.1`. Do not commit `.env`, MCP bearer keys, generated jobs, result files, or user artwork.
