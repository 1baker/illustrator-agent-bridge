# Scientific connector grammar

Scientific relationships are not interchangeable arrows. The figure compiler separates the semantic predicate from a validated visual role, then builds each connector from software-native path geometry and a terminator rule.

## Conventions

| Visual role | Path style | Terminator | Story interactions |
| --- | --- | --- | --- |
| activation | blue stroke | arrowhead | `activates` |
| inhibition | magenta stroke | perpendicular bar | `inhibits` |
| association | neutral gray stroke | none | `binds_to`, `associates_with` |
| transport | teal stroke | arrowhead | `transports_to` |
| conversion | violet stroke | arrowhead | `converts_to` |

The predicate remains in semantic metadata even when two predicates share a visual role. For example, binding and association both use a neutral line, but the scene graph still records `binds_to` or `associates_with` exactly.

## Software contract

Connector generation is separated into four concerns:

1. The story planner maps an interaction type to a visual role.
2. The orthogonal router computes an obstacle-aware path between inferred ports.
3. The scientific theme maps the role to a validated stroke token with sufficient contrast.
4. The compiler passes the routed path to the shared marker service, which adds an oriented arrowhead, perpendicular inhibition bar, or no terminator according to the role.

All parts remain editable vector elements with stable IDs. Marker tangents and geometry are calculated in TypeScript; no renderer or desktop application decides relationship meaning. See [path-markers.md](path-markers.md).

## Executable example

`examples/scientific-interaction-grammar.json` uses all five roles in one coordinate-free story. Run `npm run scientific:interaction-grammar` to write its inferred figure JSON, resolved scene JSON, and editable SVG under `var/exports/`.
