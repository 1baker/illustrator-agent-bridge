#!/usr/bin/env python3
"""JSON-over-stdio TorchVision-compatible detection reference adapter."""
from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
from pathlib import Path


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(2)


def digest(path: str) -> str:
    value = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    started = time.perf_counter()
    request = json.load(sys.stdin)
    source, weights = request["input"], request["weights"]
    if digest(source["path"]) != source["sha256"] or digest(weights["path"]) != weights["sha256"]:
        fail("input or weight digest mismatch")
    try:
        import torch
        from PIL import Image
        from torchvision.transforms.functional import pil_to_tensor
    except ImportError as error:
        fail(f"TorchVision runtime is not installed: {error}")
    # The checkpoint must be a TorchScript detector so architecture code is not guessed.
    model = torch.jit.load(weights["path"], map_location=request.get("parameters", {}).get("device", "cpu"))
    model.eval()
    image = pil_to_tensor(Image.open(source["path"]).convert("RGB")).float() / 255.0
    threshold = float(request.get("parameters", {}).get("confidenceThreshold", 0.5))
    labels = request.get("parameters", {}).get("classLabels", {})
    with torch.inference_mode():
        prediction = model([image])[0]
    annotations = []
    for index, (box, score, label) in enumerate(zip(prediction["boxes"], prediction["scores"], prediction["labels"])):
        confidence = float(score)
        if confidence < threshold:
            continue
        x1, y1, x2, y2 = [float(item) for item in box]
        class_id = int(label)
        annotations.append({"id": f"detection-{index + 1}", "type": "bounding_box", "classLabel": str(labels.get(str(class_id), class_id)), "confidence": confidence, "box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}})
    print(json.dumps({
        "schemaVersion": "scientific-analysis-result.v1", "requestId": request["requestId"], "inputSha256": source["sha256"],
        "adapter": {"id": request["adapter"]["id"], "version": request["adapter"]["version"], "commandSha256": request["adapter"]["commandSha256"], "entrypointSha256": request["adapter"].get("entrypointSha256"), "runtimeSha256": request["adapter"]["runtimeSha256"], "environmentSha256": request["adapter"]["environmentSha256"]}, "weightSha256": weights["sha256"],
        "environment": {"python": platform.python_version(), "platform": platform.platform(), "torch": torch.__version__},
        "parameters": request.get("parameters", {}), "prompts": request.get("prompts", []), "rois": request.get("rois", []),
        "calibration": request.get("calibration") if isinstance(request.get("calibration"), dict) else {"status": "pixel_only", "source": "none", "evidence": "No verified calibration."},
        "runtimeMs": round((time.perf_counter() - started) * 1000, 3), "annotations": annotations, "outputDigests": {}, "candidateAnnotations": True,
    }))


if __name__ == "__main__":
    main()
