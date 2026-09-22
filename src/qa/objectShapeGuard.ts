import type { CartoonScene, SceneElement } from "../bridge/types.js";

export type ObjectShapeTarget = "cat" | "lock" | "key";

export interface ObjectShapeGuardCheck {
  id: string;
  status: "pass" | "fail";
  message: string;
  matchedElements: string[];
}

export interface ObjectShapeGuardReport {
  ok: boolean;
  target: ObjectShapeTarget;
  confidence: number;
  checks: ObjectShapeGuardCheck[];
  issues: string[];
  nextPrompt: string | null;
  nextGoalPrompt: string | null;
}

interface ShapeRequirement {
  id: string;
  description: string;
  namePattern: RegExp;
  excludeNamePattern?: RegExp;
  minCount: number;
  types?: SceneElement["type"][];
}

interface Box {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const REQUIREMENTS: Record<ObjectShapeTarget, ShapeRequirement[]> = {
  cat: [
    {
      id: "body",
      description: "large torso/body oval",
      namePattern: /\b(cat )?(body|torso|belly)\b/i,
      minCount: 1,
      types: ["ellipse"]
    },
    {
      id: "head",
      description: "separate head",
      namePattern: /\b(cat )?head\b/i,
      minCount: 1,
      types: ["ellipse"]
    },
    {
      id: "ears",
      description: "two triangular ears",
      namePattern: /\b(cat )?(left |right )?(ear)\b/i,
      minCount: 2,
      types: ["polygon"]
    },
    {
      id: "eyes",
      description: "two eyes with pupils or eye shapes",
      namePattern: /\b(cat )?(left |right )?(eye|pupil)\b/i,
      minCount: 2,
      types: ["ellipse"]
    },
    {
      id: "nose",
      description: "small nose centered on the face",
      namePattern: /\b(cat )?nose\b/i,
      minCount: 1
    },
    {
      id: "whiskers",
      description: "multiple left and right whiskers",
      namePattern: /\b(cat )?(left |right )?whisker\b/i,
      minCount: 6,
      types: ["line", "path"]
    },
    {
      id: "tail",
      description: "curved tail attached to the body",
      namePattern: /\b(cat )?tail\b/i,
      minCount: 1,
      types: ["path", "line"]
    },
    {
      id: "paws",
      description: "four legs or paws so it reads as a full cat",
      namePattern: /\b(cat )?(front |rear |back |left |right )?(paw|leg)\b/i,
      minCount: 4,
      types: ["ellipse", "rect", "path", "line"]
    }
  ],
  lock: [
    {
      id: "body",
      description: "solid lock body",
      namePattern: /\b(lock )?(body|case|housing)\b/i,
      excludeNamePattern: /\b(edge|highlight|shine|shadow)\b/i,
      minCount: 1,
      types: ["rect", "path"]
    },
    {
      id: "shackle",
      description: "U-shaped shackle above the body",
      namePattern: /\b(lock )?(outer |inner )?shackle\b/i,
      minCount: 1,
      types: ["path", "line"]
    },
    {
      id: "keyhole",
      description: "round keyhole and slot",
      namePattern: /\b(lock )?keyhole\b/i,
      minCount: 2,
      types: ["ellipse", "rect", "path"]
    },
    {
      id: "pin",
      description: "shackle pins or sockets on the lock body",
      namePattern: /\b(lock )?(pin|socket|latch)\b/i,
      minCount: 2,
      types: ["ellipse", "rect"]
    },
    {
      id: "highlight",
      description: "visual highlight that gives the body readable volume",
      namePattern: /\b(lock )?(highlight|shine|edge)\b/i,
      minCount: 1
    }
  ],
  key: [
    {
      id: "bow",
      description: "large bow or ring end",
      namePattern: /\b(key )?(bow|ring)\b/i,
      minCount: 1,
      types: ["ellipse"]
    },
    {
      id: "hole",
      description: "open hole inside the bow",
      namePattern: /\b(key )?(hole|inner ring)\b/i,
      minCount: 1,
      types: ["ellipse"]
    },
    {
      id: "shaft",
      description: "long shaft connecting bow to teeth",
      namePattern: /\b(key )?(shaft|stem|blade)\b/i,
      minCount: 1,
      types: ["rect", "line", "path"]
    },
    {
      id: "shoulder",
      description: "shoulder or collar near the bow",
      namePattern: /\b(key )?(shoulder|collar)\b/i,
      minCount: 1,
      types: ["rect", "polygon"]
    },
    {
      id: "teeth",
      description: "three distinct teeth or bit protrusions",
      namePattern: /\b(key )?(tooth|teeth|bit)\b/i,
      minCount: 3,
      types: ["rect", "polygon"]
    },
    {
      id: "ridge",
      description: "center ridge or groove along the shaft",
      namePattern: /\b(key )?(ridge|groove|center line)\b/i,
      minCount: 1,
      types: ["line", "rect", "path"]
    }
  ]
};

export function guardObjectShapeScene(target: ObjectShapeTarget, scene: CartoonScene, prompt?: string): ObjectShapeGuardReport {
  const checks = [
    ...checkVisualReadability(target, scene),
    ...REQUIREMENTS[target].map((requirement) => checkRequirement(scene.elements, requirement)),
    ...checkGeometry(target, scene.elements)
  ];
  const failures = checks.filter((check) => check.status === "fail");
  const confidence = checks.length === 0 ? 0 : roundTo(checks.filter((check) => check.status === "pass").length / checks.length, 3);
  const issues = failures.map((check) => check.message);
  const nextPrompt = failures.length === 0 ? null : makeNextPrompt(target, failures, prompt);

  return {
    ok: failures.length === 0,
    target,
    confidence,
    checks,
    issues,
    nextPrompt,
    nextGoalPrompt: nextPrompt
  };
}

function checkGeometry(target: ObjectShapeTarget, elements: SceneElement[]): ObjectShapeGuardCheck[] {
  if (target === "cat") {
    return checkCatGeometry(elements);
  }

  if (target === "lock") {
    return checkLockGeometry(elements);
  }

  return checkKeyGeometry(elements);
}

function checkVisualReadability(target: ObjectShapeTarget, scene: CartoonScene): ObjectShapeGuardCheck[] {
  const elements = scene.elements;
  const visualBoxes = elements
    .filter((element) => element.type !== "text" && !isBackgroundElement(element) && isDrawableElement(element))
    .map(elementBox)
    .filter((box): box is Box => Boolean(box));
  const targetText = elements
    .filter((element): element is Extract<SceneElement, { type: "text" }> => element.type === "text")
    .filter(isDrawableElement)
    .filter((element) => targetTextPattern(target).test(element.text));
  const visualBounds = unionBox("object visual footprint", visualBoxes);
  const documentBox = makeDocumentBox(scene, visualBounds);

  return [
    geometryCheck(
      "visual-not-text-label",
      targetText.map(elementBox).filter((box): box is Box => Boolean(box)),
      `Object scene must not rely on text labels that spell out ${target}.`,
      () => targetText.length === 0
    ),
    geometryCheck(
      "visual-footprint-readable",
      [documentBox, visualBounds],
      "Object vector silhouette must occupy enough of the artboard to be recognizable.",
      () => {
        if (!documentBox || !visualBounds) return false;
        return hasReadableFootprint(target, documentBox, visualBounds);
      }
    )
  ];
}

function checkCatGeometry(elements: SceneElement[]): ObjectShapeGuardCheck[] {
  const checks: ObjectShapeGuardCheck[] = [];
  const body = firstBox(elements, /\b(cat )?(body|torso|belly)\b/i, ["ellipse"]);
  const head = firstBox(elements, /\b(cat )?head\b/i, ["ellipse"]);
  const ears = boxes(elements, /\b(cat )?(left |right )?ear\b/i, ["polygon"]);
  const eyes = boxes(elements, /\b(cat )?(left |right )?(eye|pupil)\b/i, ["ellipse"]);
  const nose = firstBox(elements, /\b(cat )?nose\b/i);
  const whiskers = boxes(elements, /\b(cat )?(left |right )?whisker\b/i, ["line", "path"]);
  const tails = boxes(elements, /\b(cat )?tail\b/i, ["path", "line"]);
  const paws = boxes(elements, /\b(cat )?(front |rear |back |left |right )?(paw|leg)\b/i, ["ellipse", "rect", "path", "line"]);

  checks.push(geometryCheck("cat-head-above-body", [body, head], "Cat head must sit above and overlap the body silhouette.", () => {
    if (!body || !head) return false;
    return centerY(head) < centerY(body) && horizontalOverlap(head, body) > Math.min(head.width, body.width) * 0.25;
  }));

  checks.push(geometryCheck("cat-ears-on-head", [head, ...ears], "Cat ears must be above the head and attached near the head silhouette.", () => {
    if (!head || ears.length < 2) return false;
    return ears.slice(0, 2).every((ear) => centerY(ear) < centerY(head) && verticalOverlap(expand(head, 0.18), ear) > 0);
  }));

  checks.push(geometryCheck("cat-face-inside-head", [head, ...eyes.slice(0, 2), nose], "Cat eyes and nose must sit inside the head.", () => {
    if (!head || eyes.length < 2 || !nose) return false;
    return eyes.slice(0, 2).every((eye) => containsPoint(expand(head, 0.08), centerX(eye), centerY(eye))) && containsPoint(expand(head, 0.08), centerX(nose), centerY(nose));
  }));

  checks.push(geometryCheck("cat-whiskers-on-both-sides", [head, ...whiskers], "Cat whiskers must extend from both sides of the face.", () => {
    if (!head || whiskers.length < 6) return false;
    const left = whiskers.filter((whisker) => centerX(whisker) < centerX(head));
    const right = whiskers.filter((whisker) => centerX(whisker) > centerX(head));
    return left.length >= 3 && right.length >= 3 && whiskers.every((whisker) => verticalOverlap(expand(head, 0.35), whisker) > 0);
  }));

  checks.push(geometryCheck("cat-tail-attached", [body, ...tails], "Cat tail must attach to or overlap the body silhouette.", () => {
    if (!body || tails.length < 1) return false;
    return tails.some((tail) => intersects(expand(body, 0.12), tail));
  }));

  checks.push(geometryCheck("cat-paws-under-body", [body, ...paws], "Cat paws or legs must sit below the body center to read as a full animal.", () => {
    if (!body || paws.length < 4) return false;
    return paws.filter((paw) => centerY(paw) > centerY(body)).length >= 4;
  }));

  return checks;
}

function checkLockGeometry(elements: SceneElement[]): ObjectShapeGuardCheck[] {
  const checks: ObjectShapeGuardCheck[] = [];
  const body = firstBox(elements, /\b(lock )?(body|case|housing)\b/i, ["rect", "path"]);
  const shackles = boxes(elements, /\b(lock )?(outer |inner )?shackle\b/i, ["path", "line"]);
  const keyholes = boxes(elements, /\b(lock )?keyhole\b/i, ["ellipse", "rect", "path"]);
  const pins = boxes(elements, /\b(lock )?(pin|socket|latch)\b/i, ["ellipse", "rect"]);
  const highlights = boxes(elements, /\b(lock )?(highlight|shine|edge)\b/i);

  checks.push(geometryCheck("lock-shackle-above-body", [body, ...shackles], "Lock shackle must sit above and overlap the body top.", () => {
    if (!body || shackles.length < 1) return false;
    return shackles.some((shackle) => centerY(shackle) < centerY(body) && horizontalOverlap(expand(body, 0.15), shackle) > body.width * 0.25 && shackle.bottom >= body.top - body.height * 0.25);
  }));

  checks.push(geometryCheck("lock-keyhole-inside-body", [body, ...keyholes], "Lock keyhole must be centered inside the body.", () => {
    if (!body || keyholes.length < 2) return false;
    return keyholes.slice(0, 2).every((keyhole) => containsPoint(expand(body, 0.02), centerX(keyhole), centerY(keyhole)));
  }));

  checks.push(geometryCheck("lock-pins-near-top", [body, ...pins], "Lock pins or sockets must sit near the top of the body where the shackle enters.", () => {
    if (!body || pins.length < 2) return false;
    const topBand = { ...body, bottom: body.top + body.height * 0.28, height: body.height * 0.28 };
    return pins.filter((pin) => intersects(expand(topBand, 0.18), pin)).length >= 2;
  }));

  checks.push(geometryCheck("lock-highlight-on-body", [body, ...highlights], "Lock highlight or edge must be on the body so the object has readable volume.", () => {
    if (!body || highlights.length < 1) return false;
    return highlights.some((highlight) => intersects(expand(body, 0.08), highlight));
  }));

  return checks;
}

function checkKeyGeometry(elements: SceneElement[]): ObjectShapeGuardCheck[] {
  const checks: ObjectShapeGuardCheck[] = [];
  const bow = firstBox(elements, /\b(key )?(bow|ring)\b/i, ["ellipse"]);
  const hole = firstBox(elements, /\b(key )?(hole|inner ring)\b/i, ["ellipse"]);
  const shaft = firstBox(elements, /\b(key )?(shaft|stem|blade)\b/i, ["rect", "line", "path"]);
  const shoulder = firstBox(elements, /\b(key )?(shoulder|collar)\b/i, ["rect", "polygon"]);
  const teeth = boxes(elements, /\b(key )?(tooth|teeth|bit)\b/i, ["rect", "polygon"]);
  const ridges = boxes(elements, /\b(key )?(ridge|groove|center line)\b/i, ["line", "rect", "path"]);

  checks.push(geometryCheck("key-bow-left-of-shaft", [bow, shaft], "Key bow must sit at one end and connect into a long shaft.", () => {
    if (!bow || !shaft) return false;
    return centerX(bow) < centerX(shaft) && horizontalGap(bow, shaft) < bow.width * 0.35 && verticalOverlap(expand(bow, 0.2), shaft) > 0;
  }));

  checks.push(geometryCheck("key-hole-inside-bow", [bow, hole], "Key bow must contain an inner hole.", () => {
    if (!bow || !hole) return false;
    return containsPoint(expand(bow, 0.02), centerX(hole), centerY(hole)) && hole.width < bow.width && hole.height < bow.height;
  }));

  checks.push(geometryCheck("key-teeth-right-of-shaft", [shaft, ...teeth], "Key teeth must sit at the far end of the shaft.", () => {
    if (!shaft || teeth.length < 3) return false;
    return teeth.filter((tooth) => centerX(tooth) > centerX(shaft) && verticalOverlap(expand(shaft, 0.8), tooth) > 0).length >= 3;
  }));

  checks.push(geometryCheck("key-ridge-on-shaft", [shaft, ...ridges], "Key ridge or groove must run along the shaft.", () => {
    if (!shaft || ridges.length < 1) return false;
    return ridges.some((ridge) => containsPoint(expand(shaft, 0.2), centerX(ridge), centerY(ridge)));
  }));

  checks.push(geometryCheck("key-shoulder-between-bow-and-shaft", [bow, shaft, shoulder], "Key shoulder must bridge the bow and shaft.", () => {
    if (!bow || !shaft || !shoulder) return false;
    return centerX(shoulder) > centerX(bow) && centerX(shoulder) < centerX(shaft) && verticalOverlap(expand(shaft, 1.2), shoulder) > 0;
  }));

  return checks;
}

function checkRequirement(elements: SceneElement[], requirement: ShapeRequirement): ObjectShapeGuardCheck {
  const matched = elements.filter((element) => {
    const name = element.name ?? "";
    if (!requirement.namePattern.test(name)) {
      return false;
    }

    if (requirement.excludeNamePattern?.test(name)) {
      return false;
    }

    return (requirement.types === undefined || requirement.types.includes(element.type)) && isDrawableElement(element);
  });

  if (matched.length >= requirement.minCount) {
    return {
      id: requirement.id,
      status: "pass",
      message: `Found ${matched.length} visible ${requirement.description} element(s).`,
      matchedElements: matched.map((element) => element.name ?? element.type)
    };
  }

  return {
    id: requirement.id,
    status: "fail",
    message: `Missing visible ${requirement.description}; expected at least ${requirement.minCount}, found ${matched.length}.`,
    matchedElements: matched.map((element) => element.name ?? element.type)
  };
}

function geometryCheck(id: string, candidates: Array<Box | undefined>, message: string, predicate: () => boolean): ObjectShapeGuardCheck {
  const matchedElements = candidates.filter((box): box is Box => Boolean(box)).map((box) => box.name);
  const passed = predicate();

  return {
    id,
    status: passed ? "pass" : "fail",
    message: passed ? message : `Geometry issue: ${message}`,
    matchedElements
  };
}

function firstBox(elements: SceneElement[], namePattern: RegExp, types?: SceneElement["type"][]): Box | undefined {
  return boxes(elements, namePattern, types)[0];
}

function boxes(elements: SceneElement[], namePattern: RegExp, types?: SceneElement["type"][]): Box[] {
  return elements
    .filter((element) => namePattern.test(element.name ?? "") && (types === undefined || types.includes(element.type)) && isDrawableElement(element))
    .map(elementBox)
    .filter((box): box is Box => Boolean(box));
}

function isDrawableElement(element: SceneElement): boolean {
  return isVisibleElement(element) && hasDrawableExtent(element);
}

function isVisibleElement(element: SceneElement): boolean {
  const style = element.style;
  if (!style) {
    return true;
  }

  if (style.opacity !== undefined && style.opacity <= 0.02) {
    return false;
  }

  const fillSpecified = style.fill !== undefined;
  const strokeSpecified = style.stroke !== undefined;
  if (!fillSpecified && !strokeSpecified) {
    return true;
  }

  const fillVisible = isPaintVisible(style.fill);
  const strokeVisible = isPaintVisible(style.stroke) && (style.strokeWidth ?? 1) > 0;
  return fillVisible || strokeVisible;
}

function isPaintVisible(value: string | null | undefined): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "none" || normalized === "transparent") {
    return false;
  }

  return !/^#[0-9a-f]{6}00$/i.test(normalized);
}

function hasDrawableExtent(element: SceneElement): boolean {
  if (element.type === "rect" || element.type === "ellipse") {
    return element.width > 1 && element.height > 1;
  }

  if (element.type === "line") {
    return distance(element.x, element.y, element.x2, element.y2) > 1;
  }

  if (element.type === "polygon") {
    const box = rawPointBox(element.points);
    return element.points.length >= 3 && box !== undefined && boxDiagonal(box) > 1;
  }

  if (element.type === "path") {
    const box = rawPointBox(element.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point)));
    return element.points.length >= 2 && box !== undefined && boxDiagonal(box) > 1;
  }

  if (element.type === "compound_path") {
    const points = element.subpaths.flatMap((subpath) => subpath.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point)));
    const box = rawPointBox(points);
    return points.length >= 3 && box !== undefined && boxDiagonal(box) > 1;
  }

  return element.text.trim().length > 0 && (element.size ?? 18) > 1;
}

function elementBox(element: SceneElement): Box | undefined {
  if (element.type === "rect" || element.type === "ellipse") {
    return makeBox(element.name ?? element.type, element.x, element.y, element.x + element.width, element.y + element.height);
  }

  if (element.type === "line") {
    return makeBox(element.name ?? element.type, Math.min(element.x, element.x2), Math.min(element.y, element.y2), Math.max(element.x, element.x2), Math.max(element.y, element.y2));
  }

  if (element.type === "polygon") {
    return pointBox(element.name ?? element.type, element.points);
  }

  if (element.type === "path") {
    return pointBox(element.name ?? element.type, element.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point)));
  }

  if (element.type === "compound_path") {
    return pointBox(element.name ?? element.type, element.subpaths.flatMap((subpath) => subpath.points.flatMap((point) => [
      { x: point.x, y: point.y },
      point.leftX === undefined || point.leftY === undefined ? undefined : { x: point.leftX, y: point.leftY },
      point.rightX === undefined || point.rightY === undefined ? undefined : { x: point.rightX, y: point.rightY }
    ]).filter((point): point is { x: number; y: number } => Boolean(point))));
  }

  const size = element.size ?? 18;
  return makeBox(element.name ?? element.type, element.x, element.y - size, element.x + element.text.length * size * 0.55, element.y);
}

function pointBox(name: string, points: Array<{ x: number; y: number }>): Box | undefined {
  if (points.length === 0) {
    return undefined;
  }

  const box = rawPointBox(points);
  return box ? makeBox(name, box.left, box.top, box.right, box.bottom) : undefined;
}

function rawPointBox(points: Array<{ x: number; y: number }>): Omit<Box, "name"> | undefined {
  if (points.length === 0) {
    return undefined;
  }

  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function makeBox(name: string, left: number, top: number, right: number, bottom: number): Box {
  if (left === right) {
    left -= 0.5;
    right += 0.5;
  }

  if (top === bottom) {
    top -= 0.5;
    bottom += 0.5;
  }

  return {
    name,
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function expand(box: Box, ratio: number): Box {
  const dx = box.width * ratio;
  const dy = box.height * ratio;
  return makeBox(box.name, box.left - dx, box.top - dy, box.right + dx, box.bottom + dy);
}

function centerX(box: Box): number {
  return (box.left + box.right) / 2;
}

function centerY(box: Box): number {
  return (box.top + box.bottom) / 2;
}

function horizontalOverlap(left: Box, right: Box): number {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
}

function verticalOverlap(top: Box, bottom: Box): number {
  return Math.max(0, Math.min(top.bottom, bottom.bottom) - Math.max(top.top, bottom.top));
}

function horizontalGap(left: Box, right: Box): number {
  if (left.right < right.left) {
    return right.left - left.right;
  }

  if (right.right < left.left) {
    return left.left - right.right;
  }

  return 0;
}

function intersects(left: Box, right: Box): boolean {
  return horizontalOverlap(left, right) > 0 && verticalOverlap(left, right) > 0;
}

function containsPoint(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

function boxDiagonal(box: Pick<Box, "width" | "height">): number {
  return Math.hypot(box.width, box.height);
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

function hasReadableFootprint(target: ObjectShapeTarget, documentBox: Box, visualBounds: Box): boolean {
  if (target === "key") {
    return visualBounds.width >= documentBox.width * 0.45 && visualBounds.height >= documentBox.height * 0.16;
  }

  return visualBounds.width >= documentBox.width * 0.28 && visualBounds.height >= documentBox.height * 0.28;
}

function targetTextPattern(target: ObjectShapeTarget): RegExp {
  if (target === "cat") {
    return /\b(cat|kitten|feline)\b/i;
  }

  if (target === "lock") {
    return /\b(lock|padlock)\b/i;
  }

  return /\b(key|keys|house[- ]?key)\b/i;
}

function isBackgroundElement(element: SceneElement): boolean {
  return /\b(background|backdrop|ground shadow|shadow)\b/i.test(element.name ?? "");
}

function makeDocumentBox(scene: CartoonScene, fallback: Box | undefined): Box | undefined {
  const width = scene.document?.width;
  const height = scene.document?.height;
  if (typeof width === "number" && width > 0 && typeof height === "number" && height > 0) {
    return makeBox("document", 0, 0, width, height);
  }

  return fallback;
}

function unionBox(name: string, boxesToUnion: Box[]): Box | undefined {
  if (boxesToUnion.length === 0) {
    return undefined;
  }

  return makeBox(
    name,
    Math.min(...boxesToUnion.map((box) => box.left)),
    Math.min(...boxesToUnion.map((box) => box.top)),
    Math.max(...boxesToUnion.map((box) => box.right)),
    Math.max(...boxesToUnion.map((box) => box.bottom))
  );
}

function makeNextPrompt(target: ObjectShapeTarget, failures: ObjectShapeGuardCheck[], prompt?: string): string {
  const missing = failures.map((failure) => failure.id).join(", ");
  const original = prompt?.trim() ? ` Original prompt: "${prompt.trim()}".` : "";
  return [
    `Revise the Illustrator vector scene so the ${target} is recognizable without relying on text labels.`,
    `Keep any correct existing parts, then add or repair these missing components: ${missing}.`,
    "Use named vector elements for every required part so the guard can verify the next iteration.",
    original
  ]
    .filter(Boolean)
    .join(" ");
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
