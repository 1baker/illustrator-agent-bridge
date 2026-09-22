import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runScientificAnalysisAdapter, resolveCalibration } from "../src/analysis/adapterProtocol.js";

test("runs a fully hash-pinned JSON-over-stdio adapter and records candidate provenance", async () => {
  const { root, request } = await fixture();
  const result = await runScientificAnalysisAdapter(request, { assetRoot: root });
  assert.equal(result.candidateAnnotations, true);
  assert.equal(result.annotations[0]?.type, "bounding_box");
  assert.equal(result.calibration.status, "pixel_only");
  assert.equal(result.adapter.entrypointSha256, request.adapter.entrypoint.sha256);
  assert.equal(result.adapter.runtimeSha256, request.adapter.runtime.sha256);
});

test("rejects missing and mismatched weights before adapter execution", async () => {
  const { root, request } = await fixture();
  request.weights.sha256 = "0".repeat(64);
  await assert.rejects(() => runScientificAnalysisAdapter(request, { assetRoot: root }), /weights SHA-256 mismatch/);
});

test("rejects substituted adapter entrypoints and runtime identities before launch", async () => {
  const first = await fixture();
  await writeFile(join(first.root, "adapter.mjs"), "throw new Error('substituted')\n");
  await assert.rejects(() => runScientificAnalysisAdapter(first.request, { assetRoot: first.root }), /entrypoint SHA-256 mismatch/);

  const second = await fixture();
  await writeFile(join(second.root, "runtime.lock"), "changed-runtime\n");
  await assert.rejects(() => runScientificAnalysisAdapter(second.request, { assetRoot: second.root }), /runtime identity SHA-256 mismatch/);
});

test("rejects symlinked and non-executable adapter launch identities", async () => {
  const linked = await fixture();
  await symlink(join(linked.root, "adapter.mjs"), join(linked.root, "adapter-link.mjs"));
  linked.request.adapter.entrypoint.path = "adapter-link.mjs";
  await assert.rejects(() => runScientificAnalysisAdapter(linked.request, { assetRoot: linked.root }), /must not use a symlink/);

  const blocked = await fixture();
  const executableCopy = join(blocked.root, "node-copy");
  await writeFile(executableCopy, await readFile(process.execPath));
  await chmod(executableCopy, 0o644);
  blocked.request.adapter.command = executableCopy;
  blocked.request.adapter.commandSha256 = sha(await readFile(executableCopy));
  await assert.rejects(() => runScientificAnalysisAdapter(blocked.request, { assetRoot: blocked.root }), /is not executable/);
});

test("blocks physical units when calibration cannot be verified", () => {
  assert.equal(resolveCalibration({ status: "verified", source: "guess", unitsPerPixel: 2, physicalUnits: "um", evidence: "visual guess" }).status, "pixel_only");
  assert.equal(resolveCalibration({ status: "verified", source: "scale_bar", unitsPerPixel: 0.5, physicalUnits: "um", evidence: "reviewed scale bar" }).status, "verified");
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "analysis-adapter-"));
  const input = Buffer.from("input"), weights = Buffer.from("weights"), runtime = Buffer.from("node-runtime-lock-v1\n");
  const script = Buffer.from(`let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const r=JSON.parse(s);console.log(JSON.stringify({schemaVersion:'scientific-analysis-result.v1',requestId:r.requestId,inputSha256:r.input.sha256,adapter:{id:r.adapter.id,version:r.adapter.version,commandSha256:r.adapter.commandSha256,entrypointSha256:r.adapter.entrypointSha256,runtimeSha256:r.adapter.runtimeSha256,environmentSha256:r.adapter.environmentSha256},weightSha256:r.weights.sha256,environment:{node:process.version},parameters:r.parameters,prompts:r.prompts||[],rois:r.rois||[],calibration:{status:'pixel_only',source:'none',evidence:'No calibration.'},runtimeMs:1,annotations:[{id:'box1',type:'bounding_box',classLabel:'candidate',confidence:.9,box:{x:1,y:2,width:3,height:4}}],outputDigests:{},candidateAnnotations:true}))});\n`);
  await writeFile(join(root, "input.bin"), input);
  await writeFile(join(root, "weights.bin"), weights);
  await writeFile(join(root, "adapter.mjs"), script);
  await writeFile(join(root, "runtime.lock"), runtime);
  const command = process.execPath;
  const request: any = {
    schemaVersion: "scientific-analysis-request.v1", requestId: "analysis1", input: { path: "input.bin", sha256: sha(input) },
    adapter: { id: "fixture_adapter", version: "1", command, commandSha256: sha(await readFile(command)), args: ["adapter.mjs"], entrypoint: { path: "adapter.mjs", sha256: sha(script) }, runtime: { path: "runtime.lock", sha256: sha(runtime) }, environment: {} },
    weights: { path: "weights.bin", sha256: sha(weights) }, parameters: {}, prompts: [], rois: []
  };
  return { root, request };
}

function sha(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
