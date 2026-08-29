import { ValidationError } from "../core/sceneValidation.js";
import { escapeLatexText } from "./tikzRenderer.js";

export type LatexTableAlignment = "left" | "center" | "right";

export interface LatexTableColumn {
  id: string;
  heading: string;
  alignment: LatexTableAlignment;
}

export interface LatexTableRow {
  id: string;
  cells: Array<string | number>;
}

export interface LatexTableSpec {
  schemaVersion: 1;
  title: string;
  caption?: string;
  label?: string;
  columns: LatexTableColumn[];
  rows: LatexTableRow[];
  notes?: string[];
}

export interface LatexTableRenderResult {
  latex: string;
  table: LatexTableSpec;
  renderer: "latex-table.v1";
  requiredPackages: ["booktabs", "array"];
  counts: { columns: number; rows: number };
}

/** Render reviewed tabular values without inferring or altering proposal data. */
export function renderLatexTable(input: unknown): LatexTableRenderResult {
  const table = normalizeLatexTableSpec(input);
  const columnShape = table.columns.map((column) => alignmentToken(column.alignment)).join("");
  const heading = table.columns.map((column) => `\\textbf{${escapeLatexText(column.heading)}}`).join(" & ");
  const rows = table.rows.map((row) => `    ${row.cells.map(renderCell).join(" & ")} \\\\`);
  const notes = table.notes?.map((note) => `\\footnotesize ${escapeLatexText(note)}\\par`) ?? [];
  const latex = [
    "% Generated deterministically by illustrator-agent-bridge.",
    "% Reviewed proposal table values are authoritative; no values were inferred.",
    "\\documentclass[border=6pt]{standalone}",
    "\\usepackage{booktabs}",
    "\\usepackage{array}",
    "\\begin{document}",
    "\\begin{minipage}{0.96\\textwidth}",
    `\\textbf{${escapeLatexText(table.title)}}\\par\\medskip`,
    `  \\begin{tabular}{${columnShape}}`,
    "    \\toprule",
    `    ${heading} \\\\`,
    "    \\midrule",
    ...rows,
    "    \\bottomrule",
    "  \\end{tabular}",
    ...(table.caption ? ["\\medskip", `\\small ${escapeLatexText(table.caption)}\\par`] : []),
    ...(notes.length ? ["\\medskip", ...notes] : []),
    ...(table.label ? [`\\label{${table.label}}`] : []),
    "\\end{minipage}",
    "\\end{document}",
    ""
  ].join("\n");

  return {
    latex,
    table,
    renderer: "latex-table.v1",
    requiredPackages: ["booktabs", "array"],
    counts: { columns: table.columns.length, rows: table.rows.length }
  };
}

export function normalizeLatexTableSpec(input: unknown): LatexTableSpec {
  const value = record(input, "LaTeX table");
  exactKeys(value, ["schemaVersion", "title", "caption", "label", "columns", "rows", "notes"], "LaTeX table");
  if (value.schemaVersion !== 1) throw new ValidationError("LaTeX table.schemaVersion must be 1");
  const columnsInput = boundedArray(value.columns, "LaTeX table.columns", 1, 12);
  const columns = columnsInput.map((item, index) => {
    const column = record(item, `LaTeX table.columns[${index}]`);
    exactKeys(column, ["id", "heading", "alignment"], `LaTeX table.columns[${index}]`);
    return {
      id: stableId(column.id, `LaTeX table.columns[${index}].id`),
      heading: text(column.heading, `LaTeX table.columns[${index}].heading`, 160),
      alignment: oneOf(column.alignment, ["left", "center", "right"], `LaTeX table.columns[${index}].alignment`, "left")
    };
  });
  uniqueIds(columns, "LaTeX table.columns");
  const rowsInput = boundedArray(value.rows, "LaTeX table.rows", 1, 200);
  const rows = rowsInput.map((item, index) => {
    const row = record(item, `LaTeX table.rows[${index}]`);
    exactKeys(row, ["id", "cells"], `LaTeX table.rows[${index}]`);
    if (!Array.isArray(row.cells) || row.cells.length !== columns.length) {
      throw new ValidationError(`LaTeX table.rows[${index}].cells must contain exactly ${columns.length} values`);
    }
    return {
      id: stableId(row.id, `LaTeX table.rows[${index}].id`),
      cells: row.cells.map((cell, cellIndex) => cellValue(cell, `LaTeX table.rows[${index}].cells[${cellIndex}]`))
    };
  });
  uniqueIds(rows, "LaTeX table.rows");
  const notes = value.notes === undefined
    ? undefined
    : boundedArray(value.notes, "LaTeX table.notes", 0, 20).map((note, index) => text(note, `LaTeX table.notes[${index}]`, 500));
  return {
    schemaVersion: 1,
    title: text(value.title, "LaTeX table.title", 200),
    ...(value.caption === undefined ? {} : { caption: text(value.caption, "LaTeX table.caption", 800) }),
    ...(value.label === undefined ? {} : { label: latexLabel(value.label) }),
    columns,
    rows,
    ...(notes === undefined ? {} : { notes })
  };
}

function alignmentToken(alignment: LatexTableAlignment): string {
  if (alignment === "center") return "c";
  if (alignment === "right") return "r";
  return "l";
}

function renderCell(value: string | number): string {
  return typeof value === "number" ? Number(value.toPrecision(12)).toString() : escapeLatexText(value);
}

function cellValue(value: unknown, path: string): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return text(value, path, 1000);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], path: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new ValidationError(`${path} contains unsupported field(s): ${extras.join(", ")}`);
}

function boundedArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new ValidationError(`${path} must contain ${minimum} to ${maximum} items`);
  }
  return value;
}

function text(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new ValidationError(`${path} must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

function stableId(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/.test(value)) throw new ValidationError(`${path} must be a stable identifier`);
  return value;
}

function latexLabel(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9:._-]{0,119}$/.test(value)) throw new ValidationError("LaTeX table.label must be a safe LaTeX label");
  return value;
}

function uniqueIds(items: Array<{ id: string }>, path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new ValidationError(`${path} contains duplicate id: ${item.id}`);
    seen.add(item.id);
  }
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string, fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !choices.includes(value as T)) throw new ValidationError(`${path} must be one of ${choices.join(", ")}`);
  return value as T;
}
