# Relationship routing: turning meaning into readable paths

A scientific relationship such as `activates`, `inhibits`, or `flows_to` has semantic meaning before it has visible geometry. The routing layer converts that relationship into a readable path without asking SVG, Illustrator, or Photoshop to decide where the line should go.

## Named ports

Every route begins and ends at a named box port: `left`, `right`, `top`, or `bottom`. An optional fraction selects a position along that side.

The router first moves outward by a clearance distance. This prevents a path from immediately running along the inside of its source or target object.

## Obstacle inflation

Objects are expanded mathematically by the requested clearance. The router avoids the interiors of those expanded boxes, so the final line remains separated from the visible objects.

This is a configuration-space technique: instead of routing a thick line around an object, the software routes an ideal centerline around a larger forbidden region.

## Rectilinear visibility graph

The router creates candidate x and y coordinates from ports and obstacle boundaries. Their valid intersections become graph nodes. Adjacent nodes connect when the horizontal or vertical segment between them does not enter an obstacle interior.

Dijkstra search then minimizes a weighted cost:

```text
cost = Manhattan distance
     + bend count * bend penalty
     + prior-route intersections * crossing penalty
```

Distance keeps paths short. Bend penalties discourage unnecessary turns. Crossing penalties let relationships be routed sequentially so a later path can choose a longer but clearer alternative.

## Fail-closed behavior

The router rejects:

- Invalid or duplicate box IDs
- Non-finite or non-positive box geometry
- Invalid port names or positions
- Negative cost parameters
- Diagonal prior routes
- Ports trapped inside obstacle-clearance geometry
- Requests for which no orthogonal path exists

It never draws a straight line through an obstacle as a fallback.

## Executable lesson

Run:

```bash
npm run build
npm run geometry:routing-basics
```

The example routes two scientific relationships between opposing source and target objects around a central organelle. Route A is solved first. Route B includes Route A in its crossing cost and takes a longer zero-crossing path.

The semantic relationship records the route algorithm, Manhattan length, bend count, crossing count, and clearance. Its `visualElementIds` connect the assertion to the generated path and arrowhead.

## Current scope

The current router uses rectangular collision bounds and routes relationships sequentially. Later work can add curved corner smoothing, label placement, bundled edges, polygonal obstacles, global multi-route optimization, and domain-specific arrow conventions without changing the semantic relationship model.
