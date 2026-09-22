import { compileScientificFigureBrief } from "../scientific/figureBrief.js";

export type ScientificBriefPlannerMode = "manual" | "openai" | "auto";

export interface ScientificBriefPlanRequest {
  prompt: string;
  evidence: Array<{ id: string; title?: string; text: string; citation?: string }>;
  profile: "manuscript" | "proposal";
  dimensions: { width: number; height: number };
}

export interface ScientificBriefPlan {
  mode: "manual" | "openai";
  brief: unknown;
  provider?: { name: "openai" | "stdio"; model: string; responseId?: string };
  notes: string[];
}

export interface ScientificBriefPlanner {
  readonly id: string;
  plan(request: ScientificBriefPlanRequest): Promise<ScientificBriefPlan>;
}

export class ScientificBriefPlannerError extends Error {
  constructor(message: string) { super(message); this.name = "ScientificBriefPlannerError"; }
}

export class ManualScientificBriefPlanner implements ScientificBriefPlanner {
  readonly id = "manual-form.v1";
  async plan(request: ScientificBriefPlanRequest): Promise<ScientificBriefPlan> {
    const title = request.prompt.trim().slice(0, 120) || "Untitled scientific figure";
    return {
      mode: "manual",
      brief: {
        schemaVersion: 1,
        source: { mode: "text", description: request.prompt, notes: request.evidence.map((item) => `${item.id}: ${item.title ?? item.text.slice(0, 80)}`) },
        brief: { title, audience: request.profile === "manuscript" ? "journal" : "presentation", intent: "mechanism", width: request.dimensions.width, height: request.dimensions.height, direction: "left_to_right", spacing: "normal" },
        components: [], relationships: [], refinements: []
      },
      notes: ["Provider unavailable or manual mode selected. Complete the editable brief form before approval."]
    };
  }
}

export interface OpenAiScientificBriefPlannerOptions {
  apiKey?: string; model?: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch;
}

export class OpenAiScientificBriefPlanner implements ScientificBriefPlanner {
  readonly id = "openai-responses-structured-output.v1";
  constructor(private readonly options: OpenAiScientificBriefPlannerOptions = {}) {}

  async plan(request: ScientificBriefPlanRequest): Promise<ScientificBriefPlan> {
    if (!request.prompt.trim()) throw new ScientificBriefPlannerError("Scientific brief planner prompt is required");
    const apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ScientificBriefPlannerError("OPENAI_API_KEY is not configured");
    const model = this.options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
    try {
      const response = await (this.options.fetch ?? fetch)(`${(this.options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/responses`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model, store: false, reasoning: { effort: "low" },
          text: { verbosity: "low", format: { type: "json_schema", name: "scientific_figure_brief", strict: true, schema: scientificBriefSchema() } },
          instructions: "Propose scientific semantics and coordinate-free depiction roles only. Never choose coordinates, paths, colors, TeX, data values, or physical measurements. Prefer material, transformation, interface, surface, stimulus, and inset roles when the prompt describes spatial or material mechanisms; use kind for a concise scientific subtype. Copy only supplied evidence ids and citations. Bind every claim to exact semantic target ids. Unsupported statements must be explicit hypotheses with uncertainty. Return a typed figure brief; deterministic software owns geometry and rendering.",
          input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(request) }] }]
        }),
        signal: controller.signal
      });
      const responseText = await response.text();
      if (!response.ok) throw new ScientificBriefPlannerError(`OpenAI Responses API failed with ${response.status}: ${responseText.slice(0, 1000)}`);
      const body = JSON.parse(responseText) as Record<string, unknown>;
      const brief = JSON.parse(extractOutputText(body)) as unknown;
      compileScientificFigureBrief(brief);
      return { mode: "openai", brief, provider: { name: "openai", model: String(body.model ?? model), ...(typeof body.id === "string" ? { responseId: body.id } : {}) }, notes: ["The provider proposed semantics; deterministic validation retained geometry authority."] };
    } catch (error) {
      if (error instanceof ScientificBriefPlannerError) throw error;
      throw new ScientificBriefPlannerError(`Scientific brief planner failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally { clearTimeout(timeout); }
  }
}

export async function planScientificBrief(request: ScientificBriefPlanRequest, mode: ScientificBriefPlannerMode, options: OpenAiScientificBriefPlannerOptions = {}): Promise<ScientificBriefPlan> {
  if (mode === "manual") return new ManualScientificBriefPlanner().plan(request);
  try { return await new OpenAiScientificBriefPlanner(options).plan(request); }
  catch (error) {
    if (mode === "openai") throw error;
    const fallback = await new ManualScientificBriefPlanner().plan(request);
    return { ...fallback, notes: [...fallback.notes, `Automatic planner fallback: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = response.output;
  if (!Array.isArray(output)) throw new ScientificBriefPlannerError("OpenAI response did not include output items");
  const parts: string[] = [];
  for (const item of output) if (isObject(item) && Array.isArray(item.content)) for (const content of item.content) if (isObject(content)) {
    if (content.type === "refusal" && typeof content.refusal === "string") throw new ScientificBriefPlannerError(`OpenAI planner refused the request: ${content.refusal}`);
    if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
  }
  if (!parts.length) throw new ScientificBriefPlannerError("OpenAI response did not include output_text");
  return parts.join("");
}

function scientificBriefSchema(): Record<string, unknown> {
  const stableId = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_.:-]{0,119}$" };
  return {
    type: "object", additionalProperties: false, required: ["schemaVersion", "source", "brief", "components", "relationships", "refinements", "profile", "dimensions", "claims", "evidence", "panels", "requestedAnalysis"],
    properties: {
      schemaVersion: { type: "integer", const: 1 },
      source: { type: "object", additionalProperties: false, required: ["mode", "description", "notes"], properties: { mode: { type: "string", enum: ["text", "sketch_notes", "reference_notes"] }, description: { type: "string" }, notes: { type: "array", items: { type: "string" } } } },
      brief: { type: "object", additionalProperties: false, required: ["title", "subtitle", "audience", "intent", "width", "height", "direction", "spacing"], properties: { title: { type: "string" }, subtitle: { type: "string" }, audience: { type: "string", enum: ["journal", "presentation"] }, intent: { type: "string", enum: ["mechanism", "pathway", "workflow", "experimental_setup"] }, width: { type: "number" }, height: { type: "number" }, direction: { type: "string", enum: ["left_to_right", "top_to_bottom"] }, spacing: { type: "string", enum: ["compact", "normal", "open"] } } },
      components: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "type", "kind", "label", "emphasis"], properties: { id: stableId, type: { type: "string", enum: ["generic", "cell", "nucleus", "receptor", "molecule", "protein", "process", "dna", "rna", "membrane", "organelle", "particle", "apparatus", "material", "transformation", "interface", "surface", "stimulus", "inset"] }, kind: stableId, label: { type: "string" }, emphasis: { type: "string", enum: ["primary", "secondary"] } } } },
      relationships: { type: "array", maxItems: 60, items: { type: "object", additionalProperties: false, required: ["id", "sourceId", "type", "targetId", "label"], properties: { id: stableId, sourceId: stableId, type: { type: "string", enum: ["activates", "inhibits", "binds_to", "converts_to", "transports_to", "associates_with", "regulates", "contains", "measures", "flows_to", "illuminates", "captures"] }, targetId: stableId, label: { type: "string" } } } },
      refinements: { type: "array", maxItems: 0, items: { type: "object", additionalProperties: false, required: [], properties: {} } },
      profile: { type: "string", enum: ["manuscript", "proposal"] },
      dimensions: { type: "object", additionalProperties: false, required: ["width", "height"], properties: { width: { type: "number" }, height: { type: "number" } } },
      evidence: { type: "array", maxItems: 200, items: { type: "object", additionalProperties: false, required: ["id", "citation"], properties: { id: stableId, citation: { type: "string" } } } },
      claims: { type: "array", minItems: 1, maxItems: 200, items: { type: "object", additionalProperties: false, required: ["id", "text", "evidenceIds", "support", "uncertainty", "targetIds"], properties: { id: stableId, text: { type: "string" }, evidenceIds: { type: "array", maxItems: 100, items: stableId }, support: { type: "string", enum: ["evidence", "hypothesis"] }, uncertainty: { type: "string" }, targetIds: { type: "array", minItems: 1, maxItems: 100, items: stableId } } } },
      panels: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "purpose"], properties: { id: stableId, purpose: { type: "string" } } } },
      requestedAnalysis: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "type"], properties: { id: stableId, type: { type: "string", enum: ["none", "segmentation", "detection"] } } } }
    }
  };
}

function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
