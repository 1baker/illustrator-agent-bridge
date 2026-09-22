#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

const terminalStates = new Set(["completed", "failed", "cancelled", "expired"]);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const split = line.indexOf("=");
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    if (!new Set(["AURACALL_API_KEY", "AURACALL_BASE_URL"]).has(key) || process.env[key]) continue;
    let value = line.slice(split + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const parts = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("");
}

function parseJsonText(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

async function requestJson(baseUrl, route, options = {}, retryCount = 0) {
  let lastError;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${route}`, {
        ...options,
        headers: {
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(process.env.AURACALL_API_KEY ? { authorization: `Bearer ${process.env.AURACALL_API_KEY}` } : {}),
        },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`AuraCall ${route} failed with ${response.status}: ${text.slice(0, 500)}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

function checkpointPath(input, conversationUrl, model, runtimeProfile) {
  const digest = crypto.createHash("sha256").update(JSON.stringify({ input, conversationUrl, model, runtimeProfile })).digest("hex");
  return path.join(process.env.AURACALL_PLANNER_STATE_DIR || path.join(os.homedir(), ".auracall", "scientific-brief-planner"), `${digest}.json`);
}

function legacyCheckpointPath(input, conversationUrl, model) {
  const digest = crypto.createHash("sha256").update(JSON.stringify({ input, conversationUrl, model })).digest("hex");
  return path.join(process.env.AURACALL_PLANNER_STATE_DIR || path.join(os.homedir(), ".auracall", "scientific-brief-planner"), `${digest}.json`);
}

function saveCheckpoint(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, filePath);
}

function plannerInstructions() {
  return `You are a scientific-figure semantic planner. Return exactly one JSON object and no markdown. Do not use coordinates, paths, colors, TeX, fabricated data, physical measurements, or references not supplied by the request. Use stable ASCII ids. Every relationship endpoint and claim target must name an existing component or relationship. Unsupported scientific statements must be hypotheses with explicit uncertainty.

Required object: {"schemaVersion":1,"source":{"mode":"text","description":"...","notes":[]},"brief":{"title":"...","subtitle":"...","audience":"journal|presentation","intent":"mechanism|pathway|workflow|experimental_setup","width":1,"height":1,"direction":"left_to_right|top_to_bottom","spacing":"compact|normal|open"},"components":[{"id":"...","type":"generic|cell|nucleus|receptor|molecule|protein|process|dna|rna|membrane|organelle|particle|apparatus|material|transformation|interface|surface|stimulus|inset","kind":"stable_subtype","label":"...","emphasis":"primary|secondary"}],"relationships":[{"id":"...","sourceId":"...","type":"activates|inhibits|binds_to|converts_to|transports_to|associates_with|regulates|contains|measures|flows_to|illuminates|captures","targetId":"...","label":"..."}],"refinements":[],"claims":[{"id":"...","text":"...","evidenceIds":[],"support":"evidence|hypothesis","uncertainty":"...","targetIds":["..."]}]}. Prefer a coherent integrated scientific scene over a row of generic icons.`;
}

async function main() {
  loadEnvFile(process.env.AURACALL_API_ENV || path.join(os.homedir(), ".auracall", "api.env"));
  const input = JSON.parse(await new Promise((resolve, reject) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { body += chunk; if (body.length > 2_000_000) reject(new Error("planner input too large")); });
    process.stdin.on("end", () => resolve(body));
    process.stdin.on("error", reject);
  }));
  if (input?.schemaVersion !== "ScientificBriefPlanRequest.v1" || !input.request?.prompt) throw new Error("ScientificBriefPlanRequest.v1 with a prompt is required");
  const configuredBaseUrl = (process.env.AURACALL_BASE_URL || "http://127.0.0.1:18095").replace(/\/+$/, "");
  const baseUrl = configuredBaseUrl.endsWith("/v1") ? configuredBaseUrl.slice(0, -3) : configuredBaseUrl;
  const conversationUrl = process.env.AURACALL_CHATGPT_CONVERSATION_URL;
  if (!conversationUrl) throw new Error("AURACALL_CHATGPT_CONVERSATION_URL is required");
  const model = process.env.AURACALL_MODEL || "gpt-5.2";
  const runtimeProfile = process.env.AURACALL_RUNTIME_PROFILE || "agent-browser-chatgpt";
  const statePath = checkpointPath(input, conversationUrl, model, runtimeProfile);
  const legacyStatePath = legacyCheckpointPath(input, conversationUrl, model);
  let response;
  let responseId;
  const availableStatePath = fs.existsSync(statePath) ? statePath : fs.existsSync(legacyStatePath) ? legacyStatePath : null;
  if (availableStatePath) {
    const checkpoint = JSON.parse(fs.readFileSync(availableStatePath, "utf8"));
    if (typeof checkpoint.responseId === "string") {
      response = await requestJson(baseUrl, `/v1/responses/${encodeURIComponent(checkpoint.responseId)}`, {}, 10);
      const checkpointProfile = response?.metadata?.runtimeProfile;
      const profileMatches = availableStatePath === statePath || checkpointProfile === runtimeProfile;
      if (profileMatches && (!terminalStates.has(String(response.status).toLowerCase()) || String(response.status).toLowerCase() === "completed")) {
        responseId = checkpoint.responseId;
        if (availableStatePath !== statePath) saveCheckpoint(statePath, { schemaVersion: "ScientificBriefPlannerCheckpoint.v1", responseId, runtimeProfile });
      }
    }
  }
  if (!responseId) {
    response = await requestJson(baseUrl, "/v1/responses", {
      method: "POST",
      body: JSON.stringify({
        model,
        instructions: plannerInstructions(),
        input: JSON.stringify(input.request),
        metadata: { workflow: "scientific-brief-planner", schemaVersion: "ScientificBriefPlanRequest.v1", conversation_url: conversationUrl },
        auracall: { service: "chatgpt", transport: "browser", runtimeProfile, chatgptConversationUrl: conversationUrl },
      }),
    });
    responseId = response.id;
    if (!responseId) throw new Error("AuraCall did not return a response id");
    saveCheckpoint(statePath, { schemaVersion: "ScientificBriefPlannerCheckpoint.v1", responseId, runtimeProfile });
  }
  const deadline = Date.now() + Number(process.env.AURACALL_TIMEOUT_MS || 300000);
  while (!terminalStates.has(String(response.status).toLowerCase())) {
    if (Date.now() >= deadline) throw new Error(`AuraCall response ${responseId} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await requestJson(baseUrl, `/v1/responses/${encodeURIComponent(responseId)}`, {}, 10);
  }
  if (String(response.status).toLowerCase() !== "completed") throw new Error(`AuraCall response ${responseId} ended as ${response.status}`);
  const brief = parseJsonText(outputText(response));
  process.stdout.write(`${JSON.stringify({ schemaVersion: "ScientificBriefPlanResponse.v1", brief, notes: [`Semantics proposed by ChatGPT through AuraCall response ${responseId}.`] })}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
