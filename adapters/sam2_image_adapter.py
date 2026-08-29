#!/usr/bin/env python3
"""JSON-over-stdio SAM 2 reference adapter. Weights are caller-supplied and hash-pinned."""
from __future__ import annotations

import hashlib
import json
import os
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
    if request.get("schemaVersion") != "scientific-analysis-request.v1":
        fail("unsupported request schema")
    weights = request["weights"]
    source = request["input"]
    if digest(weights["path"]) != weights["sha256"]:
        fail("weight digest mismatch")
    if digest(source["path"]) != source["sha256"]:
        fail("input digest mismatch")
    config = request.get("parameters", {}).get("modelConfig")
    if not isinstance(config, str) or not Path(config).is_file():
        fail("parameters.modelConfig must name an existing local SAM 2 config")
    try:
        import numpy as np
        from PIL import Image
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
    except ImportError as error:
        fail(f"SAM 2 runtime is not installed: {error}")
    model = build_sam2(config, weights["path"], device=request.get("parameters", {}).get("device", "cpu"))
    predictor = SAM2ImagePredictor(model)
    image = np.asarray(Image.open(source["path"]).convert("RGB"))
    predictor.set_image(image)
    annotations = []
    for index, prompt in enumerate(request.get("prompts", [])):
        if prompt.get("kind") == "point":
            point = prompt["value"]
            masks, scores, _ = predictor.predict(
                point_coords=np.array([[point["x"], point["y"]]], dtype=np.float32),
                point_labels=np.array([point.get("label", 1)], dtype=np.int32),
                multimask_output=False,
            )
            mask_path = f"{source['path']}.sam2-mask-{index + 1}.npy"
            np.save(mask_path, masks[0].astype(np.uint8), allow_pickle=False)
            annotations.append({"id": f"mask-{index + 1}", "type": "mask", "confidence": float(scores[0]), "pixels": int(masks[0].sum()), "maskPath": mask_path})
    output_digests = {Path(item["maskPath"]).name: digest(item["maskPath"]) for item in annotations}
    calibration = request.get("calibration") if isinstance(request.get("calibration"), dict) else {"status": "pixel_only", "source": "none", "evidence": "No verified calibration."}
    print(json.dumps({
        "schemaVersion": "scientific-analysis-result.v1", "requestId": request["requestId"], "inputSha256": source["sha256"],
        "adapter": {"id": request["adapter"]["id"], "version": request["adapter"]["version"], "commandSha256": request["adapter"]["commandSha256"], "entrypointSha256": request["adapter"].get("entrypointSha256"), "runtimeSha256": request["adapter"]["runtimeSha256"], "environmentSha256": request["adapter"]["environmentSha256"]}, "weightSha256": weights["sha256"],
        "environment": {"python": platform.python_version(), "platform": platform.platform(), "torch": torch.__version__, "sam2": "local-install", "device": str(next(model.parameters()).device)},
        "parameters": request.get("parameters", {}), "prompts": request.get("prompts", []), "rois": request.get("rois", []), "calibration": calibration,
        "runtimeMs": round((time.perf_counter() - started) * 1000, 3), "annotations": annotations, "outputDigests": output_digests, "candidateAnnotations": True,
    }))


if __name__ == "__main__":
    main()
