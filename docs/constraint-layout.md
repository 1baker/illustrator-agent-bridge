# Constraint layout: relationships become coordinates

Manual coordinates are useful for roots and fixed publication regions, but they do not scale to an image generator. A generator should express why an object belongs somewhere and let a solver calculate the final position.

## Box model

The first solver represents each layout object as a rectangular box:

```text
id, width, height, optional x, optional y
```

The box is a layout abstraction. Its rendered object may be rectangular, elliptical, or composed of many paths.

## Constraint vocabulary

Three equality and boundary constraints establish the foundation:

- `align` aligns the start, center, or end of one box with another along the x or y axis.
- `gap` places a box left, right, above, or below another box with an exact non-negative separation.
- `contain` requires a child box to remain inside a container with optional padding.

If containment is the only rule for a missing coordinate, the solver centers the child along that dimension. This gives a useful deterministic fallback without pretending to perform aesthetic optimization.

## Dependency graph

Each derived coordinate depends on another coordinate. For example:

```text
reaction.x = sample.x + sample.width + 70
reaction.y = center(sample.y, sample.height, reaction.height)
analysis.x = reaction.x + reaction.width + 70
```

The solver follows these dependencies recursively, so declarations may use forward references. It rejects dependency cycles rather than guessing.

## Failure rules

The solver fails when:

- A node or constraint ID is duplicated or malformed.
- A constraint references an unknown node.
- A coordinate has neither an explicit value nor a rule.
- Two rules attempt to assign the same coordinate.
- An explicit coordinate and a derived rule both assign the same coordinate.
- A dependency graph contains a cycle.
- A resolved child violates its containment boundary.

Failing on contradiction is important for scientific figures. Quietly nudging objects until the diagram looks plausible could hide a flawed specification.

## Executable lesson

Run:

```bash
npm run build
npm run geometry:constraint-basics
```

The output demonstrates:

1. A `sample -> reaction -> analysis` workflow in which only the sample and outer panel are positioned manually. Exact gaps and center alignment determine the remaining boxes.
2. A cell in which containment centers the nucleus, then gap and alignment constraints position a vesicle while containment verifies it remains inside.

The final SVG contains only resolved geometry. The semantic metadata records each object's calculated coordinates and layout mode.

## Current scope

This is a deterministic equality solver, not yet an optimization engine. It does not choose among many aesthetically equivalent layouts, route around arbitrary obstacles, or minimize crossings. Those are later graph-layout and objective-function layers built on this validated foundation.
