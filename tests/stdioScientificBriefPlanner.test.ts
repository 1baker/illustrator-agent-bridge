import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { StdioScientificBriefPlanner } from "../src/planner/stdioScientificBriefPlanner.js";

const request = { prompt: "Show a ligand binding a receptor.", evidence: [], profile: "proposal" as const, dimensions: { width: 1240, height: 759 } };

test("runs a provider-neutral semantic planner through bounded JSON over stdio", async () => {
  const planner = new StdioScientificBriefPlanner({ command: process.execPath, args: [resolve("tests/fixtures/stdioScientificBriefPlanner.mjs")], adapterId: "fixture-local.v1" });
  const result = await planner.plan(request);
  assert.equal(result.mode, "openai");
  assert.equal(result.provider?.name, "stdio");
  assert.equal((result.brief as any).components[1].kind, "transmembrane_receptor");
});

test("rejects shell commands and malformed adapter output", async () => {
  assert.throws(() => new StdioScientificBriefPlanner({ command: "node; touch /tmp/unsafe" }), /absolute path/);
  const planner = new StdioScientificBriefPlanner({ command: process.execPath, args: ["-e", "process.stdout.write('not-json')"] });
  await assert.rejects(planner.plan(request), /invalid JSON/);
});
