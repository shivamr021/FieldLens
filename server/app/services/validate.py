from typing import Dict, List

from app.services.imaging import variance_of_laplacian, largest_quadrilateral_skew_deg
from app.services.ocr import ocr_text_block, ocr_single_line, extract_label_fields, extract_azimuth
from app.services.classify import classify
from app.services.dedupe import phash, hamming

DEFAULTS = {
    "blur_min": 140.0,
    "dup_hamming_max": 5,
    "label_skew_max": 20.0,
}


def run_pipeline(img, job_ctx, existing_phashes: list[str]) -> Dict:
    """
    job_ctx = {
      "expectedType": "LABEL"|"AZIMUTH" (or None),
      "thresholds": { ... } (optional)
    }
    """
    th = {**DEFAULTS, **job_ctx.get("thresholds", {})}
    issues: List[str] = []
    checks = {}

    # Blur
    blur = variance_of_laplacian(img)
    checks["blurScore"] = blur
    if blur < th["blur_min"]:
        issues.append("Image is blurry")

    # OCR (generic fast pass)
    text_block = ocr_text_block(img)
    text_line = ocr_single_line(img)
    ocr_hint = (text_block + " " + text_line).strip()

    # Classification
    ptype = job_ctx.get("expectedType")
    if not ptype:
        ptype = classify(img, ocr_hint=ocr_hint)

    # Duplicate
    cur_phash = phash(img)
    is_dup = any(hamming(cur_phash, prev) <= th["dup_hamming_max"] for prev in existing_phashes)
    checks["isDuplicate"] = is_dup
    if is_dup:
        issues.append("Duplicate image of a previously submitted photo")

    fields = {}
    skew = None

    if ptype == "LABEL":
        # geometric skew
        skew = largest_quadrilateral_skew_deg(img)
        checks["skewDeg"] = skew
        if skew is not None and skew > th["label_skew_max"]:
            issues.append("Label angle too skewed")
        # OCR
        fields = extract_label_fields(ocr_hint)
        if not fields.get("macId") and not fields.get("rsn"):
            issues.append("Could not read MAC/RSN from label")

    else:  # AZIMUTH
        fields = extract_azimuth(ocr_hint)
        if not fields.get("azimuthDeg") and "Image is blurry" not in issues:
            issues.append("Could not read compass/azimuth value")

    status = "PASS" if len(issues) == 0 else "FAIL"
    return {
        "type": ptype,
        "phash": cur_phash,
        "ocrText": ocr_hint,
        "fields": fields,
        "checks": checks,
        "status": status,
        "reason": issues,
    }