import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const brief = {
  schemaVersion: 1,
  source: { mode: "text", description: "test", notes: [] },
  brief: { title: "Test", subtitle: "", audience: "presentation", intent: "mechanism", width: 1, height: 1, direction: "left_to_right", spacing: "open" },
  components: [{ id: "material", type: "material", kind: "coating", label: "Coating", emphasis: "primary" }],
  relationships: [], refinements: [],
  claims: [{ id: "claim", text: "Conceptual coating.", evidenceIds: [], support: "hypothesis", uncertainty: "Unverified.", targetIds: ["material"] }]
};

test("AuraCall stdio script reuses a completed response only for the same runtime profile", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "auracall-figure-planner-"));
  let creates = 0, reads = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/v1/responses") creates += 1;
    else if (request.method === "GET" && request.url === "/v1/responses/resp_fixture") reads += 1;
    else { response.writeHead(404).end(); return; }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ id: "resp_fixture", status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(brief) }] }] }));
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const payload = JSON.stringify({ schemaVersion: "ScientificBriefPlanRequest.v1", request: { prompt: "Show a coating", evidence: [], profile: "proposal", dimensions: { width: 1, height: 1 } } });
  const env = { ...process.env, AURACALL_BASE_URL: `http://127.0.0.1:${address.port}`, AURACALL_API_ENV: join(stateDir, "missing.env"), AURACALL_CHATGPT_CONVERSATION_URL: "https://chatgpt.com/c/fixture", AURACALL_PLANNER_STATE_DIR: stateDir };
  try {
    const first = await runScript(payload, env);
    const second = await runScript(payload, env);
    const alternateProfile = { ...env, AURACALL_RUNTIME_PROFILE: "alternate-retained-profile" };
    const third = await runScript(payload, alternateProfile);
    const fourth = await runScript(payload, alternateProfile);
    assert.equal(JSON.parse(first).schemaVersion, "ScientificBriefPlanResponse.v1");
    assert.equal(JSON.parse(second).brief.components[0].id, "material");
    assert.equal(JSON.parse(third).brief.components[0].id, "material");
    assert.equal(JSON.parse(fourth).brief.components[0].id, "material");
    assert.equal(creates, 2);
    assert.equal(reads, 2);
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    await rm(stateDir, { recursive: true, force: true });
  }
});

function runScript(input: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/auracall-scientific-brief-planner.mjs")], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise(stdout) : reject(new Error(`adapter exited ${code}: ${stderr}`)));
    child.stdin.end(`${input}\n`);
  });
}
