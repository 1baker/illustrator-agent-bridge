import { compileScientificPlot, type ScientificPlotResult, type ScientificPlotSeriesSpec } from "../core/scientificPlot.js";
import { escapeLatexText } from "./tikzRenderer.js";

export interface PgfplotsRenderResult {
  latex: string;
  plot: ScientificPlotResult;
  renderer: "pgfplots-1.18.v1";
  compat: "1.18";
  requiredPackages: ["pgfplots", "xcolor"];
}

/** Compile a validated scientific plot specification into standalone PGFPlots LaTeX. */
export function renderScientificPlotToPgfplots(input: unknown): PgfplotsRenderResult {
  const plot = compileScientificPlot(input);
  const colors = plot.spec.series.map((series, index) => ({ series, name: `seriescolor${index + 1}`, fillName: `seriesfill${index + 1}` }));
  const aspect = plot.plotArea.width / plot.plotArea.height;
  const widthCm = 14;
  const heightCm = Math.max(7, Math.min(12, widthCm / aspect));
  const axisOptions = [
    `width=${num(widthCm)}cm`,
    `height=${num(heightCm)}cm`,
    `title={${plot.spec.document.subtitle
      ? `\\shortstack{${escapeLatexText(plot.spec.document.title)}\\\\{\\small ${escapeLatexText(plot.spec.document.subtitle)}}}`
      : escapeLatexText(plot.spec.document.title)}}`,
    `xlabel={${escapeLatexText(plot.spec.xAxis.label)}}`,
    `ylabel={${escapeLatexText(plot.spec.yAxis.label)}}`,
    `xmin=${num(plot.scales.x.domain[0])}`,
    `xmax=${num(plot.scales.x.domain[1])}`,
    `ymin=${num(plot.scales.y.domain[0])}`,
    `ymax=${num(plot.scales.y.domain[1])}`,
    `xtick={${plot.scales.x.ticks.map(num).join(",")}}`,
    `xticklabels={${plot.scales.x.tickLabels.map((label) => `{${escapeLatexText(label)}}`).join(",")}}`,
    `ytick={${plot.scales.y.ticks.map(num).join(",")}}`,
    `yticklabels={${plot.scales.y.tickLabels.map((label) => `{${escapeLatexText(label)}}`).join(",")}}`,
    `xmajorgrids=${plot.spec.xAxis.grid === true ? "true" : "false"}`,
    `ymajorgrids=${plot.spec.yAxis.grid === false ? "false" : "true"}`,
    "axis lines=left",
    "clip=true",
    "scaled ticks=false",
    "legend cell align=left",
    ...(plot.spec.legend === "none" ? [] : ["legend pos=outer north east"])
  ];

  const seriesLines = colors.flatMap(({ series, name, fillName }) => renderSeries(series, name, fillName, plot.spec.legend !== "none"));
  const latex = [
    "% Generated deterministically by illustrator-agent-bridge.",
    "% The validated numerical plot specification is authoritative.",
    "\\documentclass[tikz,border=3pt]{standalone}",
    "\\usepackage{xcolor}",
    "\\usepackage{pgfplots}",
    "\\pgfplotsset{compat=1.18}",
    ...colors.flatMap(({ series, name, fillName }) => [
      `\\definecolor{${name}}{HTML}{${series.color!.slice(1)}}`,
      `\\definecolor{${fillName}}{HTML}{${series.fillColor!.slice(1)}}`
    ]),
    "\\begin{document}",
    "\\begin{tikzpicture}",
    "  \\begin{axis}[%",
    ...axisOptions.map((option) => `    ${option},`),
    "  ]",
    ...seriesLines,
    "  \\end{axis}",
    "\\end{tikzpicture}",
    "\\end{document}",
    ""
  ].join("\n");

  return { latex, plot, renderer: "pgfplots-1.18.v1", compat: "1.18", requiredPackages: ["pgfplots", "xcolor"] };
}

function renderSeries(series: ScientificPlotSeriesSpec, color: string, fill: string, includeLegend: boolean): string[] {
  const hasXError = series.data.some((datum) => (datum.xError ?? 0) > 0);
  const hasYError = series.data.some((datum) => (datum.yError ?? 0) > 0);
  const options = [
    `color=${color}`,
    `line width=${num(series.strokeWidth!)}pt`,
    `opacity=${num(series.opacity! / 100)}`
  ];
  if (series.mark === "line") options.push(series.showPoints ? "mark=*" : "mark=none");
  if (series.mark === "scatter") options.push("only marks", "mark=*", `mark size=${num(series.pointRadius!)}pt`, `mark options={draw=${color},fill=${fill}}`);
  if (series.mark === "bar") options.push("ybar", `bar width=${num(Math.max(2, series.pointRadius! * 2.5))}pt`, `fill=${fill}`);
  if (hasXError || hasYError) {
    options.push("error bars/.cd");
    if (hasXError) options.push("x dir=both", "x explicit");
    if (hasYError) options.push("y dir=both", "y explicit");
  }
  const coordinates = series.data.map((datum) => {
    const point = `(${num(datum.x)},${num(datum.y)})`;
    return hasXError || hasYError ? `${point} +- (${num(datum.xError ?? 0)},${num(datum.yError ?? 0)})` : point;
  }).join(" ");
  return [
    `    % series ${safeComment(series.id)} (${series.mark})`,
    `    \\addplot+[${options.join(", ")}] coordinates {${coordinates}};`,
    ...(includeLegend ? [`    \\addlegendentry{${escapeLatexText(series.label)}}`] : [])
  ];
}

function num(value: number): string { return Number(value.toPrecision(12)).toString(); }
function safeComment(value: string): string { return value.replace(/[\r\n%]/g, " "); }
