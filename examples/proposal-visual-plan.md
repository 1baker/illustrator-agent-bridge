# Proposal visual plan example

The narrative can remain ordinary Markdown. Each reviewed declaration below records the exact prompt, the artifact kind, the renderer policy, and any structured scientific data needed to generate the asset without guessing.

```proposal-visual
{
  "id": "signal-mechanism",
  "kind": "figure",
  "renderer": "tikz",
  "prompt": "Create a clean mechanism figure showing a molecular signal activating a measurable response.",
  "caption": "A signal activates the response pathway measured in Aim 1.",
  "generatorKind": "story",
  "content": {
    "schemaVersion": 1,
    "document": { "title": "Aim 1 signal mechanism", "width": 900, "height": 600 },
    "entities": [
      { "id": "signal", "type": "molecule", "label": "Molecular signal" },
      { "id": "response", "type": "process", "label": "Measured response", "emphasis": "primary" }
    ],
    "interactions": [
      { "id": "activation", "sourceId": "signal", "type": "activates", "targetId": "response", "label": "activates" }
    ]
  }
}
```

```proposal-visual
{
  "id": "conversion-trajectory",
  "kind": "plot",
  "renderer": "pgfplots",
  "prompt": "Plot the reviewed expected conversion trajectory with measurement uncertainty.",
  "caption": "Expected conversion over the first eight hours of reaction.",
  "content": {
    "schemaVersion": 1,
    "document": { "title": "Expected conversion trajectory", "width": 900, "height": 620 },
    "xAxis": { "label": "Time (h)", "min": 0, "max": 8 },
    "yAxis": { "label": "Conversion (%)", "min": 0, "max": 100 },
    "series": [
      {
        "id": "conversion",
        "label": "Expected conversion",
        "mark": "line",
        "showPoints": true,
        "data": [
          { "x": 0, "y": 0, "yError": 0 },
          { "x": 2, "y": 38, "yError": 4 },
          { "x": 4, "y": 72, "yError": 5 },
          { "x": 6, "y": 88, "yError": 3 },
          { "x": 8, "y": 94, "yError": 2 }
        ]
      }
    ]
  }
}
```

```proposal-visual
{
  "id": "go-no-go-criteria",
  "kind": "table",
  "renderer": "latex_table",
  "prompt": "Generate the Aim 1 go/no-go criteria table from these reviewed values.",
  "caption": "Quantitative gates used to decide whether the project advances to Aim 2.",
  "content": {
    "schemaVersion": 1,
    "title": "Aim 1 go/no-go criteria",
    "label": "tab:aim1-gates",
    "columns": [
      { "id": "measure", "heading": "Measure", "alignment": "left" },
      { "id": "threshold", "heading": "Threshold", "alignment": "right" },
      { "id": "evidence", "heading": "Required evidence", "alignment": "left" }
    ],
    "rows": [
      { "id": "conversion", "cells": ["Conversion at 8 h", ">= 90%", "Three independent batches"] },
      { "id": "repeatability", "cells": ["Batch-to-batch RSD", "<= 5%", "Mass-balance-closed data"] },
      { "id": "stability", "cells": ["Storage stability", ">= 30 days", "No phase separation"] }
    ],
    "notes": ["Thresholds are proposal inputs and are not inferred by the renderer."]
  }
}
```

```proposal-visual
{
  "id": "adobe-concept-proof",
  "kind": "figure",
  "renderer": "adobe_svg_proof",
  "prompt": "Create a publication-style membrane electron-transfer mechanism with donor and acceptor states, a directional charge-transfer path, and a compact energy-level inset.",
  "caption": "Optional Adobe execution route for an editable Illustrator SVG and Photoshop raster proof."
}
```
