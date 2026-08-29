import type {
  BridgeCommand,
  CartoonScene,
  ElementStyle,
  ExportCommand,
  GeneratedJob,
  PathPoint,
  PlaceFileReferenceCommand,
  SceneElement
} from "./types.js";

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 480;

export interface GenerateOptions {
  id: string;
  resultPath: string;
}

export function generateJsx(command: BridgeCommand, options: GenerateOptions): string {
  if (command.kind === "ping") {
    return generatePingJsx(command.message ?? "hello from illustrator-agent-bridge", options);
  }

  if (command.kind === "cartoon_scene") {
    return generateCartoonSceneJsx(command.scene, options);
  }

  if (command.kind === "place_image_reference" || command.kind === "place_file_reference") {
    return generatePlaceFileReferenceJsx(command, options);
  }

  if (command.kind === "export") {
    return generateExportJsx(command, options);
  }

  throw new Error(`Unsupported Illustrator command kind: ${(command as BridgeCommand).kind}`);
}

function generatePingJsx(message: string, options: GenerateOptions): string {
  return [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"ping","message":' + jsonString(${jsonLiteral(message)}) + ',"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generateCartoonSceneJsx(scene: CartoonScene, options: GenerateOptions): string {
  if (scene.paints?.length) {
    throw new Error("The optional Illustrator adapter does not yet support reusable gradient paints; render the authoritative scene to SVG or PNG first.");
  }
  const unsupportedComposition = scene.groups?.length || scene.elements.some((element) => element.groupId !== undefined || element.zIndex !== undefined || element.visible !== undefined);
  if (unsupportedComposition) {
    throw new Error("The optional Illustrator adapter does not yet support groups, clipping, z-order, or visibility; render SVG or flatten the composition first.");
  }
  const document = scene.document ?? {};
  const width = document.width ?? DEFAULT_WIDTH;
  const height = document.height ?? DEFAULT_HEIGHT;
  const colorMode = document.colorMode ?? "RGB";
  const title = document.title ?? "Illustrator Agent Scene";

  const lines = [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    `    var doc = app.documents.add(DocumentColorSpace.${colorMode}, ${numberLiteral(width)}, ${numberLiteral(height)});`,
    "    doc.rulerUnits = RulerUnits.Points;",
    "    var layer = doc.activeLayer;",
    `    layer.name = ${jsonLiteral(`Agent Bridge - ${title}`)};`,
    `    var docHeight = ${numberLiteral(height)};`,
    ...scene.elements.map((element, index) => drawElement(element, index, elementSemanticNote(scene, element))),
    "    app.redraw();",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"cartoon_scene","documentName":' + jsonString(doc.name) + ',"elementCount":${scene.elements.length},"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ];

  return lines.join("\n");
}

function generateExportJsx(command: ExportCommand, options: GenerateOptions): string {
  return [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    "    if (app.documents.length === 0) {",
    "      throw new Error('No active Illustrator document to export.');",
    "    }",
    "    var doc = app.activeDocument;",
    `    var outputFile = new File(${jsonLiteral(command.outputPath)});`,
    "    ensureParent(outputFile);",
    exportStatement(command),
    "    app.redraw();",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"export","format":${jsonLiteral(command.format)},"outputPath":${jsonLiteral(command.outputPath)},"documentName":' + jsonString(doc.name) + ',"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generatePlaceFileReferenceJsx(command: PlaceFileReferenceCommand, options: GenerateOptions): string {
  const layerName = command.layerName ?? "Photoshop project reference";
  const placedName = command.name ?? "photoshop-reference-pass";
  const x = command.x ?? 0;
  const y = command.y ?? 0;
  const opacity = command.opacity ?? 35;
  const locked = command.locked ?? true;
  const embed = command.embed ?? false;

  return [
    "#target illustrator",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    "    if (app.documents.length === 0) {",
    "      throw new Error('No active Illustrator document to place a Photoshop reference file into.');",
    "    }",
    "    var doc = app.activeDocument;",
    `    var inputFile = new File(${jsonLiteral(command.inputPath)});`,
    "    if (!inputFile.exists) {",
      "      throw new Error('Photoshop reference file does not exist: ' + inputFile.fsName);",
    "    }",
    "    var layer = doc.layers.add();",
    `    layer.name = ${jsonLiteral(layerName)};`,
    `    var placementMode = placeReferenceFile(doc, layer, inputFile, ${jsonLiteral(placedName)}, ${numberLiteral(x)}, ${numberLiteral(
      y
    )}, ${command.width === undefined ? "null" : numberLiteral(command.width)}, ${
      command.height === undefined ? "null" : numberLiteral(command.height)
    }, ${numberLiteral(opacity)}, ${embed ? "true" : "false"});`,
    locked ? "    layer.locked = true;" : "",
    "    app.redraw();",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":${jsonLiteral(command.kind)},"inputPath":${jsonLiteral(command.inputPath)},"layerName":${jsonLiteral(layerName)},"placedName":${jsonLiteral(placedName)},"mode":' + jsonString(placementMode) + ',"embedded":${embed ? "true" : "false"},"locked":${locked ? "true" : "false"},"app":"Adobe Illustrator","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function runtimeFunctions(options: GenerateOptions): string {
  return [
    `  var jobId = ${jsonLiteral(options.id)};`,
    `  var resultPath = ${jsonLiteral(options.resultPath)};`,
    "  function ensureParent(file) {",
    "    if (file.parent && !file.parent.exists) {",
    "      file.parent.create();",
    "    }",
    "  }",
    "  function writeText(path, text) {",
    "    var file = new File(path);",
    "    ensureParent(file);",
    "    file.encoding = 'UTF-8';",
    "    file.open('w');",
    "    file.write(text);",
    "    file.close();",
    "  }",
    "  function writeResult(text) {",
    "    writeText(resultPath, text);",
    "  }",
    "  function jsonString(value) {",
    "    var text = String(value);",
    "    text = text.replace(/\\\\/g, '\\\\\\\\');",
    "    text = text.replace(/\"/g, '\\\\\"');",
    "    text = text.replace(/\\r/g, '\\\\r');",
    "    text = text.replace(/\\n/g, '\\\\n');",
    "    text = text.replace(/\\t/g, '\\\\t');",
    "    return '\"' + text + '\"';",
    "  }",
    "  function writeFailure(error) {",
    `    writeResult('{"ok":false,"jobId":${jsonLiteral(options.id)},"error":' + jsonString(error && error.toString ? error.toString() : error) + '}');`,
    "  }",
    "  function rgb(hex) {",
    "    var color = new RGBColor();",
    "    color.red = parseInt(hex.substring(1, 3), 16);",
    "    color.green = parseInt(hex.substring(3, 5), 16);",
    "    color.blue = parseInt(hex.substring(5, 7), 16);",
    "    return color;",
    "  }",
    "  function applyPathStyle(item, fill, stroke, strokeWidth, opacity) {",
    "    if (fill === null) {",
    "      item.filled = false;",
    "    } else {",
    "      item.filled = true;",
    "      item.fillColor = rgb(fill);",
    "    }",
    "    if (stroke === null) {",
    "      item.stroked = false;",
    "    } else {",
    "      item.stroked = true;",
    "      item.strokeColor = rgb(stroke);",
    "      item.strokeWidth = strokeWidth;",
    "    }",
    "    item.opacity = opacity;",
    "  }",
    "  function applyStrokeDetails(item, lineCap, lineJoin, dashArray, dashOffset, miterLimit) {",
    "    if (!item.stroked) return;",
    "    if (lineCap !== null) item.strokeCap = lineCap;",
    "    if (lineJoin !== null) item.strokeJoin = lineJoin;",
    "    if (dashArray !== null) item.strokeDashes = dashArray;",
    "    if (dashOffset !== null) item.strokeDashOffset = dashOffset;",
    "    if (miterLimit !== null) item.strokeMiterLimit = miterLimit;",
    "  }",
    "  function readTextFile(file) {",
    "    file.encoding = 'UTF-8';",
    "    file.open('r');",
    "    var text = file.read();",
    "    file.close();",
    "    return text;",
    "  }",
    "  function isSvgFile(file) {",
    "    return /\\.svg$/i.test(String(file.fsName));",
    "  }",
    "  function svgNumber(svgText, pattern, fallback) {",
    "    var match = pattern.exec(svgText);",
    "    if (!match) {",
    "      return fallback;",
    "    }",
    "    var value = Number(match[1]);",
    "    return isNaN(value) ? fallback : value;",
    "  }",
    "  function setTextStyle(textFrame, size, fill, opacity) {",
    "    textFrame.textRange.characterAttributes.size = size;",
    "    textFrame.textRange.characterAttributes.fillColor = rgb(fill);",
    "    textFrame.opacity = opacity;",
    "  }",
    "  function placeReferenceFile(doc, layer, inputFile, placedName, x, y, width, height, opacity, embed) {",
    "    if (isSvgFile(inputFile)) {",
    "      return placeSvgReference(doc, layer, inputFile, placedName, x, y, width, height, opacity);",
    "    }",
    "    var placed = layer.placedItems.add();",
    "    placed.file = inputFile;",
    "    placed.name = placedName;",
    "    placed.left = x;",
    "    placed.top = doc.height - y;",
    "    if (width !== null) {",
    "      placed.width = width;",
    "    }",
    "    if (height !== null) {",
    "      placed.height = height;",
    "    }",
    "    placed.opacity = opacity;",
    "    if (embed) {",
    "      try { placed.embed(); } catch (embedError) {}",
    "    }",
    "    return 'linked_file';",
    "  }",
    "  function placeSvgReference(doc, layer, inputFile, placedName, x, y, width, height, opacity) {",
    "    var svgText = readTextFile(inputFile);",
    "    var svgWidth = svgNumber(svgText, /<svg[^>]*\\bwidth=\"([0-9.]+)/i, width || doc.width);",
    "    var svgHeight = svgNumber(svgText, /<svg[^>]*\\bheight=\"([0-9.]+)/i, height || doc.height);",
    "    var targetWidth = width || svgWidth;",
    "    var targetHeight = height || svgHeight;",
    "    var scaleX = targetWidth / svgWidth;",
    "    var scaleY = targetHeight / svgHeight;",
    "    function sx(value) { return x + value * scaleX; }",
    "    function sy(value) { return doc.height - (y + value * scaleY); }",
    "    function rect(name, rx, ry, rw, rh, fill, stroke, strokeWidth, itemOpacity) {",
    "      var item = layer.pathItems.rectangle(sy(ry), sx(rx), rw * scaleX, rh * scaleY);",
    "      item.name = name;",
    "      applyPathStyle(item, fill, stroke, strokeWidth, itemOpacity);",
    "      return item;",
    "    }",
    "    rect(placedName + ' frame', 0, 0, svgWidth, svgHeight, null, '#0F766E', 4, opacity);",
    "    rect(placedName + ' note panel', 32, 32, Math.max(120, svgWidth - 64), 112, '#ECFDF5', '#0F766E', 2, Math.min(100, opacity + 15));",
    "    var title = /<text[^>]*>([^<]*)<\\/text>/i.exec(svgText);",
    "    var titleText = title ? title[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'Photoshop SVG handoff';",
    "    var textFrame = layer.textFrames.add();",
    "    textFrame.name = placedName + ' title';",
    "    textFrame.contents = titleText;",
    "    textFrame.left = sx(56);",
    "    textFrame.top = sy(72);",
    "    setTextStyle(textFrame, Math.max(10, 26 * Math.min(scaleX, scaleY)), '#134E4A', Math.min(100, opacity + 25));",
    "    var trace = /id=\"photoshop-visible-mouse-stroke\"[^>]*d=\"M\\s*([0-9.]+)\\s+([0-9.]+)\\s+Q\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)/i.exec(svgText);",
    "    var startX = trace ? Number(trace[1]) : svgWidth * 0.34;",
    "    var startY = trace ? Number(trace[2]) : svgHeight * 0.54;",
    "    var controlX = trace ? Number(trace[3]) : svgWidth * 0.5;",
    "    var controlY = trace ? Number(trace[4]) : svgHeight * 0.47;",
    "    var endX = trace ? Number(trace[5]) : svgWidth * 0.66;",
    "    var endY = trace ? Number(trace[6]) : svgHeight * 0.58;",
    "    var stroke = layer.pathItems.add();",
    "    stroke.name = placedName + ' visible mouse stroke';",
    "    stroke.setEntirePath([[sx(startX), sy(startY)], [sx(controlX), sy(controlY)], [sx(endX), sy(endY)]]);",
    "    applyPathStyle(stroke, null, '#14B8A6', 10, Math.min(100, opacity + 35));",
    "    rect(placedName + ' start marker', startX - 18, startY - 18, 36, 36, '#CCFBF1', '#0F766E', 3, Math.min(100, opacity + 35));",
    "    rect(placedName + ' end marker', endX - 18, endY - 18, 36, 36, '#CCFBF1', '#0F766E', 3, Math.min(100, opacity + 35));",
    "    return 'svg_rebuilt_reference';",
    "  }"
  ].join("\n");
}

function drawElement(element: SceneElement, index: number, semanticNote: string | undefined): string {
  const name = element.name ?? element.id ?? `${element.type}_${index + 1}`;
  const style = withStyleDefaults(element.style);
  const noteLine = semanticNote ? `    item${index}.note = ${jsonLiteral(semanticNote)};` : "";

  if (element.type === "rect") {
    return [
      `    var item${index} = layer.pathItems.rectangle(docHeight - ${numberLiteral(element.y)}, ${numberLiteral(element.x)}, ${numberLiteral(element.width)}, ${numberLiteral(element.height)});`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      noteLine,
      styleLine(index, style)
    ].filter(Boolean).join("\n");
  }

  if (element.type === "ellipse") {
    return [
      `    var item${index} = layer.pathItems.ellipse(docHeight - ${numberLiteral(element.y)}, ${numberLiteral(element.x)}, ${numberLiteral(element.width)}, ${numberLiteral(element.height)});`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      noteLine,
      styleLine(index, style)
    ].filter(Boolean).join("\n");
  }

  if (element.type === "line") {
    const stroke = style.stroke ?? "#111111";
    return [
      `    var item${index} = layer.pathItems.add();`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      noteLine,
      `    item${index}.setEntirePath([[${numberLiteral(element.x)}, docHeight - ${numberLiteral(element.y)}], [${numberLiteral(element.x2)}, docHeight - ${numberLiteral(element.y2)}]]);`,
      `    applyPathStyle(item${index}, null, ${jsonLiteral(stroke)}, ${numberLiteral(style.strokeWidth)}, ${numberLiteral(style.opacity)});`,
      strokeDetailsLine(index, style)
    ].filter(Boolean).join("\n");
  }

  if (element.type === "polygon") {
    const points = element.points
      .map((point) => `[${numberLiteral(point.x)}, docHeight - ${numberLiteral(point.y)}]`)
      .join(", ");
    return [
      `    var item${index} = layer.pathItems.add();`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      noteLine,
      `    item${index}.setEntirePath([${points}]);`,
      `    item${index}.closed = true;`,
      styleLine(index, style)
    ].join("\n");
  }

  if (element.type === "path") {
    const points = element.points
      .map((point) => `[${numberLiteral(point.x)}, docHeight - ${numberLiteral(point.y)}]`)
      .join(", ");
    return [
      `    var item${index} = layer.pathItems.add();`,
      `    item${index}.name = ${jsonLiteral(name)};`,
      noteLine,
      `    item${index}.setEntirePath([${points}]);`,
      `    item${index}.closed = ${element.closed === false ? "false" : "true"};`,
      ...element.points.map((point, pointIndex) => pathPointLines(index, pointIndex, point)),
      styleLine(index, style)
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (element.type === "compound_path") {
    throw new Error("Illustrator JSX adapter does not yet support compound_path; render this scene through the software-native SVG or PNG path");
  }

  const fill = style.fill ?? "#111111";
  return [
    `    var item${index} = layer.textFrames.add();`,
    `    item${index}.name = ${jsonLiteral(name)};`,
    noteLine,
    `    item${index}.contents = ${jsonLiteral(element.text)};`,
    `    item${index}.left = ${numberLiteral(element.x)};`,
    `    item${index}.top = docHeight - ${numberLiteral(element.y)};`,
    `    item${index}.textRange.characterAttributes.size = ${numberLiteral(element.size ?? 18)};`,
    `    item${index}.textRange.characterAttributes.fillColor = rgb(${jsonLiteral(fill)});`,
    `    item${index}.opacity = ${numberLiteral(style.opacity)};`,
    element.font ? `    try { item${index}.textRange.characterAttributes.textFont = app.textFonts.getByName(${jsonLiteral(element.font)}); } catch (fontError) {}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function elementSemanticNote(scene: CartoonScene, element: SceneElement): string | undefined {
  if (!element.id) {
    return undefined;
  }

  const objects = (scene.semantics?.objects ?? [])
    .filter((object) => object.elementIds.includes(element.id!))
    .map((object) => ({ id: object.id, kind: object.kind }));
  const relationships = (scene.semantics?.relationships ?? [])
    .filter((relationship) => relationship.visualElementIds?.includes(element.id!))
    .map((relationship) => ({ id: relationship.id, predicate: relationship.predicate }));

  return JSON.stringify({
    schema: "scientific-image-generator.element-semantics.v1",
    elementId: element.id,
    objects,
    relationships
  });
}

function pathPointLines(itemIndex: number, pointIndex: number, point: PathPoint): string {
  const lines: string[] = [];

  if (point.leftX !== undefined && point.leftY !== undefined) {
    lines.push(
      `    item${itemIndex}.pathPoints[${pointIndex}].leftDirection = [${numberLiteral(point.leftX)}, docHeight - ${numberLiteral(point.leftY)}];`
    );
  }

  if (point.rightX !== undefined && point.rightY !== undefined) {
    lines.push(
      `    item${itemIndex}.pathPoints[${pointIndex}].rightDirection = [${numberLiteral(point.rightX)}, docHeight - ${numberLiteral(point.rightY)}];`
    );
  }

  if (point.pointType !== undefined) {
    lines.push(`    item${itemIndex}.pathPoints[${pointIndex}].pointType = PointType.${point.pointType === "smooth" ? "SMOOTH" : "CORNER"};`);
  }

  return lines.join("\n");
}

function exportStatement(command: ExportCommand): string {
  if (command.format === "pdf") {
    return [
      "    var pdfOptions = new PDFSaveOptions();",
      "    pdfOptions.preserveEditability = true;",
      "    doc.saveAs(outputFile, pdfOptions);"
    ].join("\n");
  }

  if (command.format === "svg") {
    return [
      "    var svgOptions = new ExportOptionsSVG();",
      "    svgOptions.embedRasterImages = true;",
      "    doc.exportFile(outputFile, ExportType.SVG, svgOptions);"
    ].join("\n");
  }

  if (command.format === "png") {
    return [
      "    var pngOptions = new ExportOptionsPNG24();",
      "    pngOptions.antiAliasing = true;",
      "    pngOptions.transparency = true;",
      "    pngOptions.artBoardClipping = true;",
      "    doc.exportFile(outputFile, ExportType.PNG24, pngOptions);"
    ].join("\n");
  }

  return [
    "    var jpgOptions = new ExportOptionsJPEG();",
    "    jpgOptions.antiAliasing = true;",
    "    jpgOptions.qualitySetting = 90;",
    "    jpgOptions.artBoardClipping = true;",
    "    doc.exportFile(outputFile, ExportType.JPEG, jpgOptions);"
  ].join("\n");
}

type ResolvedElementStyle = Required<Pick<ElementStyle, "fill" | "stroke" | "strokeWidth" | "opacity">> &
  Pick<ElementStyle, "lineCap" | "lineJoin" | "dashArray" | "dashOffset" | "miterLimit">;

function withStyleDefaults(style: ElementStyle | undefined): ResolvedElementStyle {
  return {
    fill: style?.fill === undefined ? "#FFFFFF" : style.fill,
    stroke: style?.stroke === undefined ? "#111111" : style.stroke,
    strokeWidth: style?.strokeWidth ?? 2,
    opacity: style?.opacity ?? 100,
    lineCap: style?.lineCap,
    lineJoin: style?.lineJoin,
    dashArray: style?.dashArray,
    dashOffset: style?.dashOffset,
    miterLimit: style?.miterLimit
  };
}

function styleLine(index: number, style: ResolvedElementStyle): string {
  return [
    `    applyPathStyle(item${index}, ${nullableString(style.fill)}, ${nullableString(style.stroke)}, ${numberLiteral(style.strokeWidth)}, ${numberLiteral(style.opacity)});`,
    strokeDetailsLine(index, style)
  ].join("\n");
}

function strokeDetailsLine(index: number, style: ResolvedElementStyle): string {
  const cap = style.lineCap === undefined ? "null" : `StrokeCap.${style.lineCap === "round" ? "ROUNDENDCAP" : style.lineCap === "square" ? "PROJECTINGENDCAP" : "BUTTENDCAP"}`;
  const join = style.lineJoin === undefined ? "null" : `StrokeJoin.${style.lineJoin === "round" ? "ROUNDENDJOIN" : style.lineJoin === "bevel" ? "BEVELENDJOIN" : "MITERENDJOIN"}`;
  const dashes = style.dashArray === undefined ? "null" : `[${style.dashArray.map(numberLiteral).join(", ")}]`;
  return `    applyStrokeDetails(item${index}, ${cap}, ${join}, ${dashes}, ${style.dashOffset === undefined ? "null" : numberLiteral(style.dashOffset)}, ${style.miterLimit === undefined ? "null" : numberLiteral(style.miterLimit)});`;
}

function nullableString(value: string | null): string {
  return value === null ? "null" : jsonLiteral(value);
}

function jsonLiteral(value: string): string {
  return JSON.stringify(value);
}

function numberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot emit non-finite number: ${value}`);
  }

  return String(value);
}

export function generatedJobSummary(job: GeneratedJob): Record<string, string> {
  return {
    id: job.id,
    jobPath: job.jobPath,
    resultPath: job.resultPath,
    illustratorJobPath: job.illustratorJobPath,
    illustratorResultPath: job.illustratorResultPath
  };
}
