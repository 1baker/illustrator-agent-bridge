import test from "node:test";
import assert from "node:assert/strict";
import { planScientificBrief } from "../src/planner/scientificBriefPlanner.js";

const request = { prompt: "Ligand activates a receptor", evidence: [{ id: "ev1", text: "Reviewed mechanism evidence" }], profile: "manuscript" as const, dimensions: { width: 800, height: 520 } };

test("returns an editable manual form when the provider is unavailable", async () => {
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try { const result = await planScientificBrief(request, "auto"); assert.equal(result.mode, "manual"); assert.match(result.notes.join(" "), /fallback/i); }
  finally { if (previous) process.env.OPENAI_API_KEY = previous; }
});

test("uses strict Responses JSON schema and validates model semantics", async () => {
  let sent: any;
  const brief = { schemaVersion: 1, source: { mode: "text", description: request.prompt, notes: ["ev1"] }, brief: { title: "Activation", audience: "journal", intent: "mechanism", width: 800, height: 520, direction: "left_to_right", spacing: "normal" }, components: [{ id: "ligand", type: "molecule", label: "Ligand" }, { id: "receptor", type: "receptor", label: "Receptor" }], relationships: [{ id: "activation", sourceId: "ligand", type: "activates", targetId: "receptor" }], refinements: [] };
  const fetchImpl: typeof fetch = async (_url, init) => { sent = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: "resp_1", model: "gpt-test", output_text: JSON.stringify(brief) }), { status: 200 }); };
  const result = await planScientificBrief(request, "openai", { apiKey: "test", model: "gpt-test", fetch: fetchImpl });
  assert.equal(result.mode, "openai"); assert.equal(sent.text.format.type, "json_schema"); assert.equal(sent.text.format.strict, true); assert.match(sent.instructions, /deterministic software owns geometry/);
});
