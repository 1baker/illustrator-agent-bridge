import { normalizeScene, ValidationError } from "./sceneValidation.js";
import type { Point, ScientificObject, VectorElement, VectorScene } from "./vectorScene.js";

export type ScientificPlotMark = "line" | "scatter" | "bar";
export type ScientificPlotNumberFormat = "auto" | "fixed_0" | "fixed_1" | "fixed_2" | "scientific";

export interface ScientificPlotDatum { x: number; y: number; xError?: number; yError?: number; }
export interface ScientificPlotAxisSpec { label: string; domain?: [number, number]; tickCount?: number; format?: ScientificPlotNumberFormat; grid?: boolean; }
export interface ScientificPlotSeriesSpec {
  id: string;
  label: string;
  mark: ScientificPlotMark;
  data: ScientificPlotDatum[];
  color?: string;
  fillColor?: string;
  strokeWidth?: number;
  pointRadius?: number;
  showPoints?: boolean;
  opacity?: number;
}
export interface ScientificPlotSpec {
  schemaVersion: 1;
  document: { title: string; subtitle?: string; width?: number; height?: number };
  xAxis: ScientificPlotAxisSpec;
  yAxis: ScientificPlotAxisSpec;
  series: ScientificPlotSeriesSpec[];
  legend?: "right" | "none";
}
export interface ScientificPlotScale {
  domain: [number, number];
  range: [number, number];
  ticks: number[];
  tickLabels: string[];
  step: number;
}
export interface ScientificPlotResult {
  spec: ScientificPlotSpec;
  scene: VectorScene;
  plotArea: { x: number; y: number; width: number; height: number };
  scales: { x: ScientificPlotScale; y: ScientificPlotScale };
  seriesSummaries: Array<{ id: string; mark: ScientificPlotMark; pointCount: number; errorBarCount: number; elementIds: string[] }>;
  engine: "software-scientific-plot.v1";
}

const COLORS = ["#2563EB", "#DC2626", "#059669", "#7C3AED", "#EA580C", "#0891B2", "#BE123C", "#4F46E5"];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,119}$/;

/** Compile bounded numerical series into a semantic vector scene. */
export function compileScientificPlot(input: unknown): ScientificPlotResult {
  const spec = normalizeSpec(input);
  const width = spec.document.width ?? 1000;
  const height = spec.document.height ?? 680;
  const legend = spec.legend ?? "right";
  const plotArea = { x: 92, y: 132, width: width - (legend === "right" ? 330 : 155), height: height - 235 };
  if (plotArea.width < 280 || plotArea.height < 220) throw new ValidationError("plot document is too small for axes, marks, labels, and legend");

  const xExtent = plotXExtent(spec.series);
  const hasBars = spec.series.some((series) => series.mark === "bar");
  const rawYExtent = dataExtent(spec.series, "y");
  const yExtent = hasBars ? rawYExtent : paddedExtent(rawYExtent);
  const xScale = makeScale(xExtent, spec.xAxis, [plotArea.x, plotArea.x + plotArea.width], false);
  const yScale = makeScale(yExtent, spec.yAxis, [plotArea.y + plotArea.height, plotArea.y], hasBars);
  validateDataVisible(spec, xScale.domain, yScale.domain, hasBars);
  const estimatedElements = estimateElementCount(spec, xScale, yScale);
  if (estimatedElements > 1000) {
    throw new ValidationError(`scientific plot would create ${estimatedElements} vector elements; the scene limit is 1000`);
  }

  const elements: VectorElement[] = [
    rect("plot.background", 0, 0, width, height, { fill: "#F8FAFC", stroke: null }, -20),
    text("plot.title", 40, 34, spec.document.title, 27, "#0F172A"),
    ...(spec.document.subtitle ? [text("plot.subtitle", 40, 69, spec.document.subtitle, 14, "#475569")] : []),
    rect("plot.area", plotArea.x, plotArea.y, plotArea.width, plotArea.height, { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidth: 1 }, -5)
  ];
  const axisIds: string[] = ["plot.area"];
  addAxes(elements, axisIds, plotArea, xScale, yScale, spec.xAxis, spec.yAxis);
  const barGeometry = makeBarGeometry(spec.series, xScale, plotArea);
  const summaries = spec.series.map((series, index) => renderSeries(elements, series, index, xScale, yScale, barGeometry));
  if (legend === "right") addLegend(elements, spec.series, width - 205, plotArea.y);

  const semanticObjects: ScientificObject[] = [
    { id: "plot-axes", kind: "quantitative_axes", label: `${spec.xAxis.label} by ${spec.yAxis.label}`, elementIds: axisIds, properties: { xDomainMin: xScale.domain[0], xDomainMax: xScale.domain[1], yDomainMin: yScale.domain[0], yDomainMax: yScale.domain[1], xTickStep: xScale.step, yTickStep: yScale.step } },
    ...spec.series.map((series, index) => ({
      id: `series-${series.id}`,
      kind: `plot_${series.mark}_series`,
      label: series.label,
      elementIds: summaries[index]!.elementIds,
      properties: { mark: series.mark, pointCount: series.data.length, errorBarCount: summaries[index]!.errorBarCount, color: series.color!, sourceOrderPreserved: true }
    }))
  ];
  const scene = normalizeScene({
    document: { title: spec.document.title, width, height, colorMode: "RGB" },
    groups: [{ id: "plot-marks", name: "Clipped data marks", zIndex: 10, clip: { type: "rect", ...plotArea } }],
    elements,
    semantics: { objects: semanticObjects }
  });
  return { spec, scene, plotArea, scales: { x: xScale, y: yScale }, seriesSummaries: summaries, engine: "software-scientific-plot.v1" };
}

function addAxes(elements: VectorElement[], ids: string[], area: { x: number; y: number; width: number; height: number }, xScale: ScientificPlotScale, yScale: ScientificPlotScale, xAxis: ScientificPlotAxisSpec, yAxis: ScientificPlotAxisSpec): void {
  const bottom = area.y + area.height;
  for (let index = 0; index < xScale.ticks.length; index += 1) {
    const value = xScale.ticks[index]!; const x = map(value, xScale.domain, xScale.range); const label = xScale.tickLabels[index]!;
    if (xAxis.grid) { const id = `x-grid.${index}`; elements.push(line(id, x, area.y, x, bottom, "#E2E8F0", 1, -3)); ids.push(id); }
    const tickId = `x-tick.${index}`; const labelId = `x-tick-label.${index}`;
    elements.push(line(tickId, x, bottom, x, bottom + 7, "#334155", 1.5), text(labelId, x - estimateTextWidth(label, 14) / 2, bottom + 12, label, 14, "#0F172A")); ids.push(tickId, labelId);
  }
  for (let index = 0; index < yScale.ticks.length; index += 1) {
    const value = yScale.ticks[index]!; const y = map(value, yScale.domain, yScale.range); const label = yScale.tickLabels[index]!;
    if (yAxis.grid !== false) { const id = `y-grid.${index}`; elements.push(line(id, area.x, y, area.x + area.width, y, "#E2E8F0", 1, -3)); ids.push(id); }
    const tickId = `y-tick.${index}`; const labelId = `y-tick-label.${index}`;
    elements.push(line(tickId, area.x - 7, y, area.x, y, "#334155", 1.5), text(labelId, area.x - 14 - estimateTextWidth(label, 14), y - 8, label, 14, "#0F172A")); ids.push(tickId, labelId);
  }
  elements.push(
    line("x-axis", area.x, bottom, area.x + area.width, bottom, "#0F172A", 2),
    line("y-axis", area.x, area.y, area.x, bottom, "#0F172A", 2),
    text("x-axis-label", area.x + area.width / 2 - estimateTextWidth(xAxis.label, 15) / 2, bottom + 48, xAxis.label, 15, "#0F172A"),
    text("y-axis-label", area.x, area.y - 32, yAxis.label, 15, "#0F172A")
  );
  ids.push("x-axis", "y-axis", "x-axis-label", "y-axis-label");
}

interface BarGeometry { seriesIds: string[]; width: number; groupWidth: number; }
function makeBarGeometry(series: ScientificPlotSeriesSpec[], xScale: ScientificPlotScale, area: { width: number }): BarGeometry {
  const bars = series.filter((item) => item.mark === "bar");
  const values = [...new Set(bars.flatMap((item) => item.data.map((point) => point.x)))].sort((a, b) => a - b);
  const pixelGaps = values.slice(1).map((value, index) => Math.abs(map(value, xScale.domain, xScale.range) - map(values[index]!, xScale.domain, xScale.range)));
  const groupWidth = Math.min(80, (pixelGaps.length ? Math.min(...pixelGaps) : area.width * 0.16) * 0.72);
  return { seriesIds: bars.map((item) => item.id), groupWidth, width: bars.length ? groupWidth / bars.length : 0 };
}

function renderSeries(elements: VectorElement[], series: ScientificPlotSeriesSpec, seriesIndex: number, xScale: ScientificPlotScale, yScale: ScientificPlotScale, bars: BarGeometry): ScientificPlotResult["seriesSummaries"][number] {
  const ids: string[] = []; const color = series.color!; let errorBarCount = 0;
  const mapped = series.data.map((datum) => ({ x: map(datum.x, xScale.domain, xScale.range), y: map(datum.y, yScale.domain, yScale.range) }));
  if (series.mark === "line") {
    const id = `${series.id}.line`; elements.push({ id, type: "path", name: `${series.label} line`, x: 0, y: 0, points: mapped, closed: false, groupId: "plot-marks", zIndex: 10 + seriesIndex, style: { fill: null, stroke: color, strokeWidth: series.strokeWidth, opacity: series.opacity, lineJoin: "round", lineCap: "round" } }); ids.push(id);
  }
  if (series.mark === "bar") {
    const barIndex = bars.seriesIds.indexOf(series.id); const baseline = map(0, yScale.domain, yScale.range);
    series.data.forEach((datum, index) => {
      const center = mapped[index]!.x - bars.groupWidth / 2 + bars.width * (barIndex + 0.5); const y = mapped[index]!.y;
      const id = `${series.id}.bar.${index}`;
      if (Math.abs(baseline - y) < 1e-9) elements.push(line(id, center - bars.width * 0.43, baseline, center + bars.width * 0.43, baseline, color, Math.max(2, series.strokeWidth!), 10 + seriesIndex, "plot-marks", series.opacity));
      else elements.push(rect(id, center - bars.width * 0.43, Math.min(y, baseline), bars.width * 0.86, Math.abs(baseline - y), { fill: series.fillColor, stroke: color, strokeWidth: series.strokeWidth, opacity: series.opacity }, 10 + seriesIndex, "plot-marks"));
      ids.push(id);
    });
  }
  if (series.mark === "scatter" || series.showPoints) {
    mapped.forEach((point, index) => { const id = `${series.id}.point.${index}`; elements.push({ id, type: "ellipse", name: `${series.label} point ${index + 1}`, x: point.x - series.pointRadius!, y: point.y - series.pointRadius!, width: series.pointRadius! * 2, height: series.pointRadius! * 2, groupId: "plot-marks", zIndex: 20 + seriesIndex, style: { fill: series.fillColor, stroke: color, strokeWidth: Math.min(2, series.strokeWidth!), opacity: series.opacity } }); ids.push(id); });
  }
  series.data.forEach((datum, index) => {
    const center = mapped[index]!; const cap = 5;
    if ((datum.yError ?? 0) > 0) {
      const top = map(datum.y + datum.yError!, yScale.domain, yScale.range); const bottom = map(datum.y - datum.yError!, yScale.domain, yScale.range); const prefix = `${series.id}.y-error.${index}`;
      elements.push(line(`${prefix}.stem`, center.x, top, center.x, bottom, color, 1.5, 15 + seriesIndex, "plot-marks", series.opacity), line(`${prefix}.top`, center.x - cap, top, center.x + cap, top, color, 1.5, 15 + seriesIndex, "plot-marks", series.opacity), line(`${prefix}.bottom`, center.x - cap, bottom, center.x + cap, bottom, color, 1.5, 15 + seriesIndex, "plot-marks", series.opacity)); ids.push(`${prefix}.stem`, `${prefix}.top`, `${prefix}.bottom`); errorBarCount += 1;
    }
    if ((datum.xError ?? 0) > 0) {
      const left = map(datum.x - datum.xError!, xScale.domain, xScale.range); const right = map(datum.x + datum.xError!, xScale.domain, xScale.range); const prefix = `${series.id}.x-error.${index}`;
      elements.push(line(`${prefix}.stem`, left, center.y, right, center.y, color, 1.5, 15 + seriesIndex, "plot-marks", series.opacity), line(`${prefix}.left`, left, center.y - cap, left, center.y + cap, color, 1.5, 15 + seriesIndex, "plot-marks", series.opacity), line(`${prefix}.right`, right, center.y - cap, right, center.y + cap, color, 1.5, 15 + seriesIndex, "plot-marks", series.opacity)); ids.push(`${prefix}.stem`, `${prefix}.left`, `${prefix}.right`); errorBarCount += 1;
    }
  });
  return { id: series.id, mark: series.mark, pointCount: series.data.length, errorBarCount, elementIds: ids };
}

function addLegend(elements: VectorElement[], series: ScientificPlotSeriesSpec[], x: number, y: number): void {
  elements.push(text("legend.title", x, y, "Series", 15, "#0F172A"));
  series.forEach((item, index) => {
    const cy = y + 34 + index * 38; const color = item.color!;
    if (item.mark === "bar") elements.push(rect(`legend.${item.id}.mark`, x, cy - 7, 24, 14, { fill: item.fillColor, stroke: color, strokeWidth: 2 }, 30));
    else if (item.mark === "line") elements.push(line(`legend.${item.id}.mark`, x, cy, x + 26, cy, color, item.strokeWidth!, 30));
    else elements.push({ id: `legend.${item.id}.mark`, type: "ellipse", x: x + 7, y: cy - 7, width: 14, height: 14, zIndex: 30, style: { fill: item.fillColor, stroke: color, strokeWidth: 2 } });
    elements.push(text(`legend.${item.id}.label`, x + 36, cy - 9, item.label, 13, "#334155"));
  });
}

function makeScale(extent: [number, number], axis: ScientificPlotAxisSpec, range: [number, number], includeZero: boolean): ScientificPlotScale {
  let [min, max] = axis.domain ?? extent;
  if (includeZero && axis.domain === undefined) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { const padding = Math.abs(min) * 0.05 || 1; min -= padding; max += padding; }
  const desired = axis.tickCount ?? 6;
  let step = niceNumber((max - min) / Math.max(1, desired - 1));
  if (axis.domain === undefined) { min = floorClean(min / step) * step; max = ceilClean(max / step) * step; }
  step = niceNumber((max - min) / Math.max(1, desired - 1));
  const ticks: number[] = [];
  const start = Math.ceil((min - Math.abs(step) * 1e-10) / step) * step;
  for (let value = start, guard = 0; value <= max + Math.abs(step) * 1e-9 && guard < 50; value += step, guard += 1) ticks.push(clean(value));
  if (ticks.length < 2) { ticks.length = 0; ticks.push(clean(min), clean(max)); step = max - min; }
  return { domain: [clean(min), clean(max)], range, ticks, tickLabels: ticks.map((value) => formatNumber(value, axis.format ?? "auto", step)), step: clean(step) };
}

function dataExtent(series: ScientificPlotSeriesSpec[], axis: "x" | "y"): [number, number] {
  let min = Number.POSITIVE_INFINITY; let max = Number.NEGATIVE_INFINITY;
  for (const item of series) for (const datum of item.data) { const value = datum[axis]; const error = datum[axis === "x" ? "xError" : "yError"] ?? 0; min = Math.min(min, value - error); max = Math.max(max, value + error); }
  return [min, max];
}

function plotXExtent(series: ScientificPlotSeriesSpec[]): [number, number] {
  const extent = dataExtent(series, "x");
  const values = [...new Set(series.filter((item) => item.mark === "bar").flatMap((item) => item.data.map((point) => point.x)))].sort((a, b) => a - b);
  if (values.length === 0) return paddedExtent(extent);
  const spacing = values.length === 1 ? Math.max(Math.abs(values[0]!) * 0.2, 2) : Math.min(...values.slice(1).map((value, index) => value - values[index]!));
  const padding = spacing * 0.45;
  return [Math.min(extent[0], values[0]! - padding), Math.max(extent[1], values.at(-1)! + padding)];
}

function paddedExtent(extent: [number, number]): [number, number] {
  const span = extent[1] - extent[0];
  const padding = span > 0 ? span * 0.03 : Math.abs(extent[0]) * 0.05 || 1;
  return [extent[0] - padding, extent[1] + padding];
}

function validateDataVisible(spec: ScientificPlotSpec, xDomain: [number, number], yDomain: [number, number], hasBars: boolean): void {
  if (hasBars && !(yDomain[0] <= 0 && yDomain[1] >= 0)) throw new ValidationError("bar plots require a y-axis domain containing zero");
  const x = plotXExtent(spec.series); const y = dataExtent(spec.series, "y");
  if (x[0] < xDomain[0] || x[1] > xDomain[1]) throw new ValidationError("x-axis domain would clip data or uncertainty extents");
  if (y[0] < yDomain[0] || y[1] > yDomain[1]) throw new ValidationError("y-axis domain would clip data or uncertainty extents");
}

function estimateElementCount(spec: ScientificPlotSpec, xScale: ScientificPlotScale, yScale: ScientificPlotScale): number {
  let count = 3 + (spec.document.subtitle ? 1 : 0);
  count += xScale.ticks.length * (2 + (spec.xAxis.grid ? 1 : 0));
  count += yScale.ticks.length * (2 + (spec.yAxis.grid === false ? 0 : 1));
  count += 4;
  for (const series of spec.series) {
    if (series.mark === "line") count += 1;
    if (series.mark === "bar") count += series.data.length;
    if (series.mark === "scatter" || series.showPoints) count += series.data.length;
    for (const datum of series.data) {
      if ((datum.xError ?? 0) > 0) count += 3;
      if ((datum.yError ?? 0) > 0) count += 3;
    }
  }
  if ((spec.legend ?? "right") === "right") count += 1 + spec.series.length * 2;
  return count;
}

function normalizeSpec(input: unknown): ScientificPlotSpec {
  const value = object(input, "scientific plot");
  if (value.schemaVersion !== 1) throw new ValidationError("scientific plot.schemaVersion must be 1");
  const document = object(value.document, "scientific plot.document");
  const width = optionalRange(document.width, "document.width", 640, 14400); const height = optionalRange(document.height, "document.height", 480, 14400);
  const xAxis = normalizeAxis(value.xAxis, "xAxis"); const yAxis = normalizeAxis(value.yAxis, "yAxis");
  if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 12) throw new ValidationError("scientific plot.series must contain 1 to 12 series");
  let total = 0; const ids = new Set<string>();
  const series = value.series.map((raw, index) => { const result = normalizeSeries(raw, index); if (ids.has(result.id)) throw new ValidationError(`scientific plot series id must be unique: ${result.id}`); ids.add(result.id); total += result.data.length; return result; });
  if (total > 5000) throw new ValidationError("scientific plot cannot contain more than 5000 data points");
  if (value.legend !== undefined && value.legend !== "right" && value.legend !== "none") throw new ValidationError("scientific plot.legend must be right or none");
  return { schemaVersion: 1, document: { title: string(document.title, "document.title", 160), ...(document.subtitle === undefined ? {} : { subtitle: string(document.subtitle, "document.subtitle", 300) }), ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) }, xAxis, yAxis, series, ...(value.legend === undefined ? {} : { legend: value.legend }) };
}
function normalizeAxis(input: unknown, path: string): ScientificPlotAxisSpec {
  const value = object(input, path); let domain: [number, number] | undefined;
  if (value.domain !== undefined) { if (!Array.isArray(value.domain) || value.domain.length !== 2) throw new ValidationError(`${path}.domain must contain [minimum, maximum]`); domain = [coordinate(value.domain[0], `${path}.domain[0]`), coordinate(value.domain[1], `${path}.domain[1]`)]; if (domain[0] >= domain[1]) throw new ValidationError(`${path}.domain minimum must be less than maximum`); }
  const format = value.format === undefined ? undefined : string(value.format, `${path}.format`, 20) as ScientificPlotNumberFormat;
  if (format !== undefined && !["auto", "fixed_0", "fixed_1", "fixed_2", "scientific"].includes(format)) throw new ValidationError(`${path}.format is unsupported`);
  if (value.grid !== undefined && typeof value.grid !== "boolean") throw new ValidationError(`${path}.grid must be boolean`);
  return { label: string(value.label, `${path}.label`, 120), ...(domain ? { domain } : {}), ...(value.tickCount === undefined ? {} : { tickCount: integer(value.tickCount, `${path}.tickCount`, 2, 12) }), ...(format ? { format } : {}), ...(value.grid === undefined ? {} : { grid: value.grid }) };
}

function normalizeSeries(input: unknown, index: number): ScientificPlotSeriesSpec {
  const path = `series[${index}]`; const value = object(input, path);
  if (value.mark !== "line" && value.mark !== "scatter" && value.mark !== "bar") throw new ValidationError(`${path}.mark must be line, scatter, or bar`);
  if (!Array.isArray(value.data) || value.data.length < (value.mark === "line" ? 2 : 1) || value.data.length > 1000) throw new ValidationError(`${path}.data has an invalid point count for ${value.mark}`);
  const data = value.data.map((raw, pointIndex) => { const point = object(raw, `${path}.data[${pointIndex}]`); return { x: coordinate(point.x, `${path}.data[${pointIndex}].x`), y: coordinate(point.y, `${path}.data[${pointIndex}].y`), ...(point.xError === undefined ? {} : { xError: nonnegative(point.xError, `${path}.data[${pointIndex}].xError`, 1e12) }), ...(point.yError === undefined ? {} : { yError: nonnegative(point.yError, `${path}.data[${pointIndex}].yError`, 1e12) }) }; });
  if (value.mark === "bar" && new Set(data.map((point) => point.x)).size !== data.length) throw new ValidationError(`${path} bar x values must be unique within a series`);
  const color = value.color === undefined ? COLORS[index % COLORS.length]! : hex(value.color, `${path}.color`); const fillColor = value.fillColor === undefined ? color : hex(value.fillColor, `${path}.fillColor`);
  if (value.showPoints !== undefined && typeof value.showPoints !== "boolean") throw new ValidationError(`${path}.showPoints must be boolean`);
  return { id: stableId(value.id, `${path}.id`), label: string(value.label, `${path}.label`, 120), mark: value.mark, data, color, fillColor, strokeWidth: value.strokeWidth === undefined ? (value.mark === "bar" ? 1.5 : 3) : positive(value.strokeWidth, `${path}.strokeWidth`, 20), pointRadius: value.pointRadius === undefined ? 5 : positive(value.pointRadius, `${path}.pointRadius`, 30), showPoints: value.showPoints ?? false, opacity: value.opacity === undefined ? 100 : range(value.opacity, `${path}.opacity`, 0, 100) };
}

function niceNumber(value: number): number { const exponent = Math.floor(Math.log10(value)); const fraction = value / 10 ** exponent; const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10; return nice * 10 ** exponent; }
function formatNumber(value: number, format: ScientificPlotNumberFormat, step: number): string { if (format === "scientific") return value.toExponential(2).replace("e+", "e"); if (format === "fixed_0") return value.toFixed(0); if (format === "fixed_1") return value.toFixed(1); if (format === "fixed_2") return value.toFixed(2); const abs = Math.abs(value); if ((abs >= 10000 || (abs > 0 && abs < 0.001))) return value.toExponential(2).replace("e+", "e"); const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(Math.abs(step))) + (Math.abs(step) < 1 ? 0 : 0))); return value.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"); }
function map(value: number, domain: [number, number], range: [number, number]): number { return clean(range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0])); }
function estimateTextWidth(value: string, size: number): number { return value.length * size * 0.57; }
function rect(id: string, x: number, y: number, width: number, height: number, style: VectorElement["style"], zIndex = 0, groupId?: string): VectorElement { return { id, type: "rect", x, y, width, height, zIndex, ...(groupId ? { groupId } : {}), style }; }
function line(id: string, x: number, y: number, x2: number, y2: number, stroke: string, strokeWidth: number, zIndex = 0, groupId?: string, opacity?: number): VectorElement { return { id, type: "line", x, y, x2, y2, zIndex, ...(groupId ? { groupId } : {}), style: { fill: null, stroke, strokeWidth, ...(opacity === undefined ? {} : { opacity }) } }; }
function text(id: string, x: number, y: number, value: string, size: number, fill: string): VectorElement { return { id, type: "text", x, y, text: value, size, style: { fill, stroke: null } }; }
function object(input: unknown, path: string): Record<string, unknown> { if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ValidationError(`${path} must be an object`); return input as Record<string, unknown>; }
function string(input: unknown, path: string, max: number): string { if (typeof input !== "string" || input.length < 1 || input.length > max) throw new ValidationError(`${path} must contain 1 to ${max} characters`); return input; }
function stableId(input: unknown, path: string): string { const value = string(input, path, 120); if (!ID.test(value)) throw new ValidationError(`${path} is not a stable id`); return value; }
function coordinate(input: unknown, path: string): number { return range(input, path, -1e12, 1e12); }
function range(input: unknown, path: string, min: number, max: number): number { if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) throw new ValidationError(`${path} must be finite and between ${min} and ${max}`); return input; }
function optionalRange(input: unknown, path: string, min: number, max: number): number | undefined { return input === undefined ? undefined : range(input, path, min, max); }
function positive(input: unknown, path: string, max: number): number { const value = range(input, path, Number.MIN_VALUE, max); if (value <= 0) throw new ValidationError(`${path} must be positive`); return value; }
function nonnegative(input: unknown, path: string, max: number): number { return range(input, path, 0, max); }
function integer(input: unknown, path: string, min: number, max: number): number { const value = range(input, path, min, max); if (!Number.isInteger(value)) throw new ValidationError(`${path} must be an integer`); return value; }
function hex(input: unknown, path: string): string { const value = string(input, path, 7); if (!HEX.test(value)) throw new ValidationError(`${path} must be a #RRGGBB color`); return value.toUpperCase(); }
function clean(value: number): number { const rounded = Number(value.toPrecision(12)); return Object.is(rounded, -0) ? 0 : rounded; }
function floorClean(value: number): number { return Math.floor(value + 1e-12); }
function ceilClean(value: number): number { return Math.ceil(value - 1e-12); }
