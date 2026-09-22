import type {
  GeneratedPhotoshopJob,
  PhotoshopCommand,
  PhotoshopProjectCommitCommand,
  PhotoshopProjectPassCommand,
  PhotoshopSvgProofCommand
} from "./photoshopTypes.js";

export interface GeneratePhotoshopOptions {
  id: string;
  resultPath: string;
}

export function generatePhotoshopJsx(command: PhotoshopCommand, options: GeneratePhotoshopOptions): string {
  if (command.kind === "ping") {
    return generatePingJsx(command.message ?? "hello from illustrator-agent-bridge Photoshop leg", options);
  }

  if (command.kind === "svg_proof") {
    return generateSvgProofJsx(command, options);
  }

  if (command.kind === "project_pass") {
    return generateProjectPassJsx(command, options);
  }

  return generateProjectCommitJsx(command, options);
}

export function generatedPhotoshopJobSummary(job: GeneratedPhotoshopJob) {
  return {
    id: job.id,
    jobPath: job.jobPath,
    resultPath: job.resultPath,
    photoshopJobPath: job.photoshopJobPath,
    photoshopResultPath: job.photoshopResultPath
  };
}

function generatePingJsx(message: string, options: GeneratePhotoshopOptions): string {
  return [
    "#target photoshop",
    "(function () {",
    runtimeFunctions(options),
    "  try {",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"ping","message":' + jsonString(${jsonLiteral(message)}) + ',"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generateSvgProofJsx(command: PhotoshopSvgProofCommand, options: GeneratePhotoshopOptions): string {
  return [
    "#target photoshop",
    "(function () {",
    runtimeFunctions(options),
    "  var previousDialogs = null;",
    "  var doc = null;",
    "  try {",
    "    previousDialogs = app.displayDialogs;",
    "    app.displayDialogs = DialogModes.NO;",
    `    var inputFile = new File(${jsonLiteral(command.inputPath)});`,
    "    if (!inputFile.exists) {",
    "      throw new Error('Input SVG/proof file does not exist: ' + inputFile.fsName);",
    "    }",
    `    var outputTarget = saveTarget(${jsonLiteral(command.outputPath)}, 'svg-proof.png');`,
    "    var outputFile = outputTarget.finalFile;",
    "    doc = app.open(inputFile);",
    resizeStatement(command),
    "    var proofWidth = dimensionPixels(doc.width);",
    "    var proofHeight = dimensionPixels(doc.height);",
    "    var pngOptions = new PNGSaveOptions();",
    "    doc.saveAs(outputTarget.saveFile, pngOptions, true, Extension.LOWERCASE);",
    "    copyBackTarget(outputTarget);",
    "    doc.close(SaveOptions.DONOTSAVECHANGES);",
    "    doc = null;",
    "    app.displayDialogs = previousDialogs;",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"svg_proof","inputPath":${jsonLiteral(command.inputPath)},"outputPath":${jsonLiteral(command.outputPath)},"width":' + proofWidth + ',"height":' + proofHeight + ',"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    try { if (doc !== null) { doc.close(SaveOptions.DONOTSAVECHANGES); } } catch (closeError) {}",
    "    try { if (previousDialogs !== null) { app.displayDialogs = previousDialogs; } } catch (dialogError) {}",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generateProjectPassJsx(command: PhotoshopProjectPassCommand, options: GeneratePhotoshopOptions): string {
  const passName = command.passName ?? "Photoshop project pass";
  const prompt = command.prompt ?? "Illustrator and Photoshop collaborative project";
  const note =
    "Photoshop pass: layered raster working file, contrast/texture check, and SVG handoff for the next Illustrator pass.";

  return [
    "#target photoshop",
    "(function () {",
    runtimeFunctions(options),
    "  var previousDialogs = null;",
    "  var doc = null;",
    "  try {",
    "    previousDialogs = app.displayDialogs;",
    "    app.displayDialogs = DialogModes.NO;",
    `    var inputFile = new File(${jsonLiteral(command.inputPath)});`,
    "    if (!inputFile.exists) {",
    "      throw new Error('Input SVG/project file does not exist: ' + inputFile.fsName);",
    "    }",
    `    var outputPngTarget = saveTarget(${jsonLiteral(command.outputPngPath)}, 'project-reference.png');`,
    `    var outputSvgFile = new File(${jsonLiteral(command.outputSvgPath)});`,
    `    var outputPsdTarget = saveTarget(${jsonLiteral(command.outputPsdPath)}, 'project-working.psd');`,
    `    var feedbackFile = new File(${jsonLiteral(command.feedbackPath)});`,
    "    var outputPngFile = outputPngTarget.finalFile;",
    "    var outputPsdFile = outputPsdTarget.finalFile;",
    "    ensureParent(outputSvgFile);",
    "    ensureParent(feedbackFile);",
    "    doc = app.open(inputFile);",
    resizeStatement(command),
    "    var proofWidth = dimensionPixels(doc.width);",
    "    var proofHeight = dimensionPixels(doc.height);",
    "    var washLayer = doc.artLayers.add();",
    "    washLayer.name = 'Photoshop tonal pass';",
    "    var washColor = new SolidColor();",
    "    washColor.rgb.red = 246;",
    "    washColor.rgb.green = 248;",
    "    washColor.rgb.blue = 252;",
    "    var washInset = Math.min(24, Math.floor(Math.min(proofWidth, proofHeight) / 12));",
    "    doc.selection.select([[washInset, washInset], [proofWidth - washInset, washInset], [proofWidth - washInset, proofHeight - washInset], [washInset, proofHeight - washInset]]);",
    "    doc.selection.fill(washColor, ColorBlendMode.NORMAL, 100, false);",
    "    doc.selection.deselect();",
    "    washLayer.opacity = 10;",
    "    var noteLayer = doc.artLayers.add();",
    "    noteLayer.name = 'Photoshop project notes';",
    "    noteLayer.kind = LayerKind.TEXT;",
    `    noteLayer.textItem.contents = ${jsonLiteral(passName)} + '\\r' + ${jsonLiteral(note)};`,
    "    noteLayer.textItem.position = [24, 36];",
    "    noteLayer.textItem.size = 16;",
    "    var noteColor = new SolidColor();",
    "    noteColor.rgb.red = 24;",
    "    noteColor.rgb.green = 37;",
    "    noteColor.rgb.blue = 58;",
    "    noteLayer.textItem.color = noteColor;",
    "    var psdOptions = new PhotoshopSaveOptions();",
    "    psdOptions.layers = true;",
    "    doc.saveAs(outputPsdTarget.saveFile, psdOptions, true, Extension.LOWERCASE);",
    "    copyBackTarget(outputPsdTarget);",
    "    var pngOptions = new PNGSaveOptions();",
    "    doc.saveAs(outputPngTarget.saveFile, pngOptions, true, Extension.LOWERCASE);",
    "    copyBackTarget(outputPngTarget);",
    `    var handoffTitle = ${jsonLiteral(passName)};`,
    `    var handoffNote = ${jsonLiteral(note)};`,
    "    var safeInnerWidth = Math.max(120, proofWidth - 64);",
    "    var svgText = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + proofWidth + '\" height=\"' + proofHeight + '\" viewBox=\"0 0 ' + proofWidth + ' ' + proofHeight + '\">';",
    "    svgText += '<rect x=\"0\" y=\"0\" width=\"' + proofWidth + '\" height=\"' + proofHeight + '\" fill=\"none\" stroke=\"#2563EB\" stroke-width=\"12\" opacity=\"0.45\"/>';",
    "    svgText += '<rect x=\"32\" y=\"32\" width=\"' + safeInnerWidth + '\" height=\"112\" fill=\"#EFF6FF\" stroke=\"#1D4ED8\" stroke-width=\"4\" opacity=\"0.88\"/>';",
    "    svgText += '<text x=\"56\" y=\"78\" font-size=\"30\" fill=\"#1E3A8A\" font-family=\"Arial, sans-serif\">' + xmlText(handoffTitle) + '</text>';",
    "    svgText += '<text x=\"56\" y=\"116\" font-size=\"20\" fill=\"#1E40AF\" font-family=\"Arial, sans-serif\">' + xmlText(handoffNote) + '</text>';",
    "    svgText += '<path d=\"M 56 168 C ' + Math.round(proofWidth * 0.33) + ' 116, ' + Math.round(proofWidth * 0.66) + ' 220, ' + (proofWidth - 56) + ' 168\" fill=\"none\" stroke=\"#2563EB\" stroke-width=\"8\" stroke-linecap=\"round\" opacity=\"0.5\"/>';",
    "    svgText += '<circle cx=\"56\" cy=\"168\" r=\"18\" fill=\"#DBEAFE\" stroke=\"#1D4ED8\" stroke-width=\"5\" opacity=\"0.92\"/>';",
    "    svgText += '<circle cx=\"' + (proofWidth - 56) + '\" cy=\"168\" r=\"18\" fill=\"#DBEAFE\" stroke=\"#1D4ED8\" stroke-width=\"5\" opacity=\"0.92\"/>';",
    "    svgText += '</svg>';",
    "    writeText(outputSvgFile.fsName, svgText);",
    "    var feedbackText = '{\"ok\":true,\"kind\":\"photoshop_project_pass\",\"prompt\":' + jsonString(" +
      jsonLiteral(prompt) +
      ") + ',\"passName\":' + jsonString(" +
      jsonLiteral(passName) +
      ") + ',\"inputPath\":" +
      jsonLiteral(command.inputPath) +
      ",\"outputPngPath\":" +
      jsonLiteral(command.outputPngPath) +
      ",\"outputSvgPath\":" +
      jsonLiteral(command.outputSvgPath) +
      ",\"outputPsdPath\":" +
      jsonLiteral(command.outputPsdPath) +
      ",\"width\":' + proofWidth + ',\"height\":' + proofHeight + ',\"recommendedIllustratorAction\":' + jsonString('Place the Photoshop SVG handoff as a named reference layer, keep the vector source editable, and export the final project SVG after the return pass.') + ',\"notes\":[' + jsonString(" +
      jsonLiteral(note) +
      ") + ']}';",
    "    writeText(feedbackFile.fsName, feedbackText);",
    command.keepOpen ? "    // Keep the Photoshop document open for a visible mouse edit pass." : "    doc.close(SaveOptions.DONOTSAVECHANGES);",
    command.keepOpen ? "" : "    doc = null;",
    "    app.displayDialogs = previousDialogs;",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"project_pass","inputPath":${jsonLiteral(command.inputPath)},"outputPngPath":${jsonLiteral(command.outputPngPath)},"outputSvgPath":${jsonLiteral(command.outputSvgPath)},"outputPsdPath":${jsonLiteral(command.outputPsdPath)},"feedbackPath":${jsonLiteral(command.feedbackPath)},"width":' + proofWidth + ',"height":' + proofHeight + ',"keepOpen":${command.keepOpen ? "true" : "false"},"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    try { if (doc !== null) { doc.close(SaveOptions.DONOTSAVECHANGES); } } catch (closeError) {}",
    "    try { if (previousDialogs !== null) { app.displayDialogs = previousDialogs; } } catch (dialogError) {}",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function generateProjectCommitJsx(command: PhotoshopProjectCommitCommand, options: GeneratePhotoshopOptions): string {
  const passName = command.passName ?? "Photoshop visible mouse commit";
  const prompt = command.prompt ?? "Illustrator and Photoshop collaborative project";
  const note = "Photoshop commit: active document was edited through measured visible mouse control, then saved as PSD/PNG/SVG handoff.";
  const closeDocument = command.closeDocument ?? true;

  return [
    "#target photoshop",
    "(function () {",
    runtimeFunctions(options),
    "  var previousDialogs = null;",
    "  var doc = null;",
    "  try {",
    "    previousDialogs = app.displayDialogs;",
    "    app.displayDialogs = DialogModes.NO;",
    `    var inputPath = ${jsonLiteral(command.inputPath ?? "")};`,
    "    if (app.documents.length > 0) {",
    "      doc = app.activeDocument;",
    "    } else {",
    "      if (inputPath.length === 0) {",
    "        throw new Error('No active Photoshop document is open for project commit.');",
    "      }",
    "      var inputFile = new File(inputPath);",
    "      if (!inputFile.exists) {",
    "        throw new Error('Input SVG/project file does not exist: ' + inputFile.fsName);",
    "      }",
    "      doc = app.open(inputFile);",
    "    }",
    `    var outputPngTarget = saveTarget(${jsonLiteral(command.outputPngPath)}, 'project-reference.png');`,
    `    var outputSvgFile = new File(${jsonLiteral(command.outputSvgPath)});`,
    `    var outputPsdTarget = saveTarget(${jsonLiteral(command.outputPsdPath)}, 'project-working.psd');`,
    `    var feedbackFile = new File(${jsonLiteral(command.feedbackPath)});`,
    "    var outputPngFile = outputPngTarget.finalFile;",
    "    var outputPsdFile = outputPsdTarget.finalFile;",
    "    ensureParent(outputSvgFile);",
    "    ensureParent(feedbackFile);",
    "    var proofWidth = dimensionPixels(doc.width);",
    "    var proofHeight = dimensionPixels(doc.height);",
    "    var psdOptions = new PhotoshopSaveOptions();",
    "    psdOptions.layers = true;",
    "    doc.saveAs(outputPsdTarget.saveFile, psdOptions, true, Extension.LOWERCASE);",
    "    copyBackTarget(outputPsdTarget);",
    "    var pngOptions = new PNGSaveOptions();",
    "    doc.saveAs(outputPngTarget.saveFile, pngOptions, true, Extension.LOWERCASE);",
    "    copyBackTarget(outputPngTarget);",
    `    var handoffTitle = ${jsonLiteral(passName)};`,
    `    var handoffNote = ${jsonLiteral(note)};`,
    "    var strokeStartX = Math.round(proofWidth * 0.34);",
    "    var strokeStartY = Math.round(proofHeight * 0.54);",
    "    var strokeEndX = Math.round(proofWidth * 0.66);",
    "    var strokeEndY = Math.round(proofHeight * 0.58);",
    "    var strokeControlX = Math.round(proofWidth * 0.50);",
    "    var strokeControlY = Math.round(proofHeight * 0.47);",
    "    var safeInnerWidth = Math.max(120, proofWidth - 64);",
    "    var svgText = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"' + proofWidth + '\" height=\"' + proofHeight + '\" viewBox=\"0 0 ' + proofWidth + ' ' + proofHeight + '\">';",
    "    svgText += '<rect x=\"0\" y=\"0\" width=\"' + proofWidth + '\" height=\"' + proofHeight + '\" fill=\"none\" stroke=\"#0F766E\" stroke-width=\"12\" opacity=\"0.45\"/>';",
    "    svgText += '<rect x=\"32\" y=\"32\" width=\"' + safeInnerWidth + '\" height=\"112\" fill=\"#ECFDF5\" stroke=\"#0F766E\" stroke-width=\"4\" opacity=\"0.88\"/>';",
    "    svgText += '<text x=\"56\" y=\"78\" font-size=\"30\" fill=\"#134E4A\" font-family=\"Arial, sans-serif\">' + xmlText(handoffTitle) + '</text>';",
    "    svgText += '<text x=\"56\" y=\"116\" font-size=\"20\" fill=\"#115E59\" font-family=\"Arial, sans-serif\">' + xmlText(handoffNote) + '</text>';",
    "    svgText += '<path id=\"photoshop-visible-mouse-stroke\" d=\"M ' + strokeStartX + ' ' + strokeStartY + ' Q ' + strokeControlX + ' ' + strokeControlY + ' ' + strokeEndX + ' ' + strokeEndY + '\" fill=\"none\" stroke=\"#14B8A6\" stroke-width=\"14\" stroke-linecap=\"round\" opacity=\"0.82\"/>';",
    "    svgText += '<circle cx=\"' + strokeStartX + '\" cy=\"' + strokeStartY + '\" r=\"18\" fill=\"#CCFBF1\" stroke=\"#0F766E\" stroke-width=\"5\" opacity=\"0.92\"/>';",
    "    svgText += '<circle cx=\"' + strokeEndX + '\" cy=\"' + strokeEndY + '\" r=\"18\" fill=\"#CCFBF1\" stroke=\"#0F766E\" stroke-width=\"5\" opacity=\"0.92\"/>';",
    "    svgText += '</svg>';",
    "    writeText(outputSvgFile.fsName, svgText);",
    "    var feedbackText = '{\"ok\":true,\"kind\":\"photoshop_project_commit\",\"prompt\":' + jsonString(" +
      jsonLiteral(prompt) +
      ") + ',\"passName\":' + jsonString(" +
      jsonLiteral(passName) +
      ") + ',\"inputPath\":' + jsonString(inputPath) + ',\"outputPngPath\":" +
      jsonLiteral(command.outputPngPath) +
      ",\"outputSvgPath\":" +
      jsonLiteral(command.outputSvgPath) +
      ",\"outputPsdPath\":" +
      jsonLiteral(command.outputPsdPath) +
      ",\"width\":' + proofWidth + ',\"height\":' + proofHeight + ',\"visibleMouseTrace\":{\"relativeStart\":[0.34,0.54],\"relativeEnd\":[0.66,0.58]},\"recommendedIllustratorAction\":' + jsonString('Place this post-mouse Photoshop SVG handoff as a named reference layer, then run the final Illustrator export.') + ',\"notes\":[' + jsonString(" +
      jsonLiteral(note) +
      ") + ']}';",
    "    writeText(feedbackFile.fsName, feedbackText);",
    closeDocument ? "    doc.close(SaveOptions.DONOTSAVECHANGES);" : "    // Keep the Photoshop document open after the visible mouse commit.",
    closeDocument ? "    doc = null;" : "",
    "    app.displayDialogs = previousDialogs;",
    `    writeResult('{"ok":true,"jobId":${jsonLiteral(options.id)},"kind":"project_commit","inputPath":' + jsonString(inputPath) + ',"outputPngPath":${jsonLiteral(command.outputPngPath)},"outputSvgPath":${jsonLiteral(command.outputSvgPath)},"outputPsdPath":${jsonLiteral(command.outputPsdPath)},"feedbackPath":${jsonLiteral(command.feedbackPath)},"width":' + proofWidth + ',"height":' + proofHeight + ',"closed":${closeDocument ? "true" : "false"},"app":"Adobe Photoshop","version":' + jsonString(app.version) + '}');`,
    "  } catch (e) {",
    "    try { if (doc !== null) { doc.close(SaveOptions.DONOTSAVECHANGES); } } catch (closeError) {}",
    "    try { if (previousDialogs !== null) { app.displayDialogs = previousDialogs; } } catch (dialogError) {}",
    "    writeFailure(e);",
    "    throw e;",
    "  }",
    "}());",
    ""
  ].join("\n");
}

function runtimeFunctions(options: GeneratePhotoshopOptions): string {
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
    "  function isWslPath(path) {",
    "    var text = String(path).replace(/\\\\/g, '/').toLowerCase();",
    "    return text.indexOf('//wsl.localhost/') === 0 || text.indexOf('//wsl$/') === 0;",
    "  }",
    "  function saveTarget(path, suffix) {",
    "    var finalFile = new File(path);",
    "    ensureParent(finalFile);",
    "    if (!isWslPath(path)) {",
    "      return { finalFile: finalFile, saveFile: finalFile, copyBack: false };",
    "    }",
    "    var tempFile = new File(Folder.temp.fsName + '/illustrator-agent-bridge-' + jobId + '-' + suffix);",
    "    try { if (tempFile.exists) { tempFile.remove(); } } catch (removeTempError) {}",
    "    return { finalFile: finalFile, saveFile: tempFile, copyBack: true };",
    "  }",
    "  function copyBackTarget(target) {",
    "    if (!target.copyBack) {",
    "      return;",
    "    }",
    "    try { if (target.finalFile.exists) { target.finalFile.remove(); } } catch (removeFinalError) {}",
    "    if (!target.saveFile.copy(target.finalFile.fsName)) {",
    "      throw new Error('Unable to copy Photoshop artifact back to ' + target.finalFile.fsName);",
    "    }",
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
    "  function xmlText(value) {",
    "    var text = String(value);",
    "    text = text.replace(/&/g, '&amp;');",
    "    text = text.replace(/</g, '&lt;');",
    "    text = text.replace(/>/g, '&gt;');",
    "    text = text.replace(/\"/g, '&quot;');",
    "    return text;",
    "  }",
    "  function dimensionPixels(value) {",
    "    try {",
    "      return Math.round(value.as('px'));",
    "    } catch (e) {",
    "      return Math.round(Number(value));",
    "    }",
    "  }",
    "  function writeFailure(error) {",
    `    writeResult('{"ok":false,"jobId":${jsonLiteral(options.id)},"error":' + jsonString(error && error.toString ? error.toString() : error) + '}');`,
    "  }"
  ].join("\n");
}

function resizeStatement(command: PhotoshopSvgProofCommand | PhotoshopProjectPassCommand): string {
  if (command.width === undefined && command.height === undefined && command.resolution === undefined) {
    return "    // Keep Photoshop's native SVG rasterization size for proofing.";
  }

  const width = command.width === undefined ? "null" : `UnitValue(${numberLiteral(command.width)}, 'px')`;
  const height = command.height === undefined ? "null" : `UnitValue(${numberLiteral(command.height)}, 'px')`;
  const resolution = command.resolution === undefined ? "null" : numberLiteral(command.resolution);

  return `    doc.resizeImage(${width}, ${height}, ${resolution}, ResampleMethod.BICUBIC);`;
}

function jsonLiteral(value: string): string {
  return JSON.stringify(value);
}

function numberLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for Photoshop JSX generation: ${value}`);
  }

  return String(Math.round(value * 1000) / 1000);
}
