let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const envelope = JSON.parse(raw);
const request = envelope.request;
const brief = {
  schemaVersion: 1,
  source: { mode: "text", description: request.prompt, notes: [] },
  brief: { title: "Local adapter pathway", subtitle: "Reference-free fixture", audience: request.profile === "manuscript" ? "journal" : "presentation", intent: "pathway", width: request.dimensions.width, height: request.dimensions.height, direction: "left_to_right", spacing: "normal" },
  components: [
    { id: "ligand", type: "molecule", kind: "signaling_ligand", label: "Ligand", emphasis: "primary" },
    { id: "receptor", type: "receptor", kind: "transmembrane_receptor", label: "Receptor", emphasis: "primary" }
  ],
  relationships: [{ id: "binding", sourceId: "ligand", type: "binds_to", targetId: "receptor", label: "binding" }],
  refinements: [], profile: request.profile, dimensions: request.dimensions, evidence: [],
  claims: [{ id: "hypothesis", text: "The ligand may bind the receptor.", evidenceIds: [], support: "hypothesis", uncertainty: "Fixture hypothesis.", targetIds: ["ligand", "receptor", "binding"] }],
  panels: [{ id: "main", purpose: "pathway" }], requestedAnalysis: []
};
process.stdout.write(JSON.stringify({ schemaVersion: "ScientificBriefPlanResponse.v1", brief, notes: ["fixture adapter"] }));
