# app/services/ocr.py
from __future__ import annotations
import re
from typing import Dict, Optional, Tuple, Any, List

import cv2
import numpy as np

# --- Prefer pytesseract, fallback to EasyOCR ---
try:
    import pytesseract
except Exception:
    pytesseract = None

_easyocr_reader = None  # lazy-cached instance


def _easyocr():
    """Lazy-load EasyOCR reader."""
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr  # import only if needed
        _easyocr_reader = easyocr.Reader(["en"], gpu=False)
    return _easyocr_reader


# ---------- Low-level imaging ----------
def load_bgr_from_path(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Could not read image: {path}")
    return img


def laplacian_blur_score(bgr: np.ndarray) -> float:
    """Higher is sharper. Typical threshold ~100–200; tune per device."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


# ---------- OCR ----------
def ocr_text(bgr: np.ndarray) -> str:
    """
    Generic OCR: try pytesseract first; if missing/fails, fallback to EasyOCR.
    """
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    # 1) Try pytesseract
    if pytesseract is not None:
        try:
            txt = pytesseract.image_to_string(rgb)
            return txt or ""
        except Exception:
            pass  # fallback

    # 2) Fallback to EasyOCR
    reader = _easyocr()
    lines = reader.readtext(rgb, detail=0) or []
    return "\n".join(lines)


def ocr_lines_easy(bgr: np.ndarray) -> List[str]:
    """
    Explicit EasyOCR line mode (matches your working Colab flow).
    IMPORTANT: feed RGB to EasyOCR.
    """
    reader = _easyocr()
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return reader.readtext(rgb, detail=0) or []


# ---------- Text extract helpers ----------
# Base MAC (colon form) for quick checks  <-- add dot support
MAC_RE = re.compile(r"\b([0-9A-Fa-f]{2}[:\-\.]){5}[0-9A-Fa-f]{2}\b")

# Keyword-anchored MAC (captures value after labels)  <-- allow dots too
MAC_KEYWORD = re.compile(
    r"\b(MAC(?:\s*ID)?|WLAN\s*MAC|WIFI\s*MAC|LAN\s*MAC|ETH(?:ERNET)?\s*MAC)\b[:\-\s]*([0-9A-Fa-f:\-\.\s]{12,48})",
    re.IGNORECASE
)
# Lines that actually mention MAC (so we only recover pairs on those)
MAC_LINE_HINT = re.compile(
    r"\b(MAC(?:\s*ID)?|WLAN\s*MAC|WIFI\s*MAC|LAN\s*MAC|ETH(?:ERNET)?\s*MAC)\b",
    re.IGNORECASE
)

# Accept colon, hyphen, or bare 12 hex  <-- add a pattern with dots; keep bare-12
MAC_PATTERNS = [
    re.compile(r"\b([0-9A-Fa-f]{2}[:\-\.]){5}[0-9A-Fa-f]{2}\b"),  # CC:54:FE:E3:26:F8 / CC-54-... / CC.54....
    re.compile(r"\b[0-9A-Fa-f]{12}\b"),                           # CC54FEE326F8
]
HEX_PAIR = re.compile(r"[0-9A-Fa-f]{2}")

# Exactly two hex chars with non-hex boundaries (prevents grabbing "AC" from "MAC")
HEX_PAIR_BOUNDARY = re.compile(r"(?<![0-9A-Fa-f])[0-9A-Fa-f]{2}(?![0-9A-Fa-f])")

# OUIs you expect in the field (prefer these when multiple candidates exist)
OUI_PREFER = {
    "CC:54:FE",  # add more as you encounter them
}

# RSN: labeled patterns like RSN, S/N, SERIAL, SRN, ASN
RSN_LABELED_RE = re.compile(
    r"\b(?:RSN|S\/N|SERIAL|SRN|ASN)\s*[:#\-]?\s*([A-Z0-9\-]{6,24})\b",
    re.IGNORECASE,
)
# Generic alnum candidate (fallback)
RSN_TOKEN_RE = re.compile(r"[A-Z0-9\-]{6,24}")
# Very common words to exclude when unlabeled (uppercased compare)
RSN_STOPWORDS = {
    "COMMODITY", "INDIA", "MADEININDIA", "WARRANTY", "MODEL",
    "MANUFACTURED", "EXPIRY", "BATCH", "ADDRESS", "CONTACT",
    "SUPPORT", "SERVICE", "HELPLINE", "SERIES", "PRODUCT",
    "POWER", "VOLT", "AMPS", "HERTZ", "DATE", "CODE",
}


def _normalize_mac(raw: str) -> Optional[str]:
    if not raw:
        return None
    # strip everything to hex pairs
    hexes = HEX_PAIR.findall(raw)
    if len(hexes) < 6:
        return None
    # take first 6 pairs
    pairs = [h.upper() for h in hexes[:6]]
    return ":".join(pairs)


def _extract_mac_from_lines(lines: List[str]) -> Optional[str]:
    """
    Return the best MAC by preference:
      1) strict (colon/hyphen/bare) on a line that contains a MAC label
      2) strict anywhere
      3) recovered spaced pairs after MAC label, as a last resort
    Preference scoring favours known OUIs.
    """
    def score(mac: str, mac_line: bool) -> tuple[int, int]:
        """
        Higher is better:
          - +1 if OUI is in OUI_PREFER
          - +1 if it came from a MAC-labeled line
        We return as (pref_total, has_colons) so colon-form wins over bare.
        """
        oui = mac[:8]
        prefer = (1 if oui in OUI_PREFER else 0) + (1 if mac_line else 0)
        has_colons = 1 if ":" in mac else 0
        return (prefer, has_colons)

    candidates: List[tuple[str, bool]] = []  # (mac, from_mac_line)

    # Pass A: keyword-anchored extraction (most reliable)
    for ln in lines:
        if "EAN" in ln.upper():
            continue
        mac_line = bool(MAC_LINE_HINT.search(ln))
        if not mac_line:
            continue
        # try "MAC ...: <value>" first
        m = MAC_KEYWORD.search(ln)
        if m:
            norm = _normalize_mac(m.group(2))
            if norm:
                candidates.append((norm, True))
                continue
        # if no annotated value, still scan for strict patterns on this line
        for pat in MAC_PATTERNS:
            mm = pat.search(ln)
            if mm:
                norm = _normalize_mac(mm.group(0))
                if norm:
                    candidates.append((norm, True))

    # Pass B: strict patterns anywhere (safe)
    if not candidates:
        for ln in lines:
            if "EAN" in ln.upper():
                continue
            for pat in MAC_PATTERNS:
                mm = pat.search(ln)
                if mm:
                    norm = _normalize_mac(mm.group(0))
                    if norm:
                        candidates.append((norm, False))

    # Pass C: LAST RESORT – recover spaced pairs, only on MAC-labeled lines,
    # and only from the text AFTER the MAC keyword.
    if not candidates:
        for ln in lines:
            U = ln.upper()
            if "EAN" in U:
                continue
            hint = MAC_LINE_HINT.search(ln)
            if not hint:
                continue
            tail = ln[hint.end():]  # only after 'MAC...'
            pairs = HEX_PAIR_BOUNDARY.findall(tail)
            for i in range(0, max(0, len(pairs) - 5)):
                window = pairs[i:i+6]
                # require 6 pairs and at least 4 pairs containing a digit
                digitful = sum(any(ch.isdigit() for ch in p) for p in window)
                if digitful < 4:
                    continue
                cand = ":".join(window)
                norm = _normalize_mac(cand)
                if norm:
                    candidates.append((norm, True))

    if not candidates:
        return None

    # Pick the best by score; tie-breaker: colon form preferred.
    candidates.sort(key=lambda t: score(t[0], t[1]), reverse=True)
    return candidates[0][0]


def extract_mac(text: str) -> Optional[str]:
    """Simple text-wide MAC; kept for compatibility, but we prefer _extract_mac_from_lines()."""
    m = MAC_RE.search(text or "")
    return m.group(0).upper() if m else None


def _is_probable_rsn(token: str) -> bool:
    """
    Heuristics to keep RSN-like tokens:
    - length 8..24
    - contains at least 3 digits (exclude pure words like 'COMMODITY')
    - not a MAC
    - not a common stopword
    """
    if not token:
        return False
    s = token.strip().upper()
    if len(s) < 8 or len(s) > 24:
        return False
    if MAC_RE.match(s):
        return False
    if s in RSN_STOPWORDS:
        return False
    # require at least 3 digits
    digits = sum(ch.isdigit() for ch in s)
    if digits < 3:
        return False
    return True


def extract_rsn(text: str, lines: Optional[List[str]] = None) -> Optional[str]:
    """
    Prefer labeled RSN hits; otherwise pick best unlabeled candidate by heuristics.
    """
    if not text:
        return None

    # 1) Prefer explicit label in full text
    m = RSN_LABELED_RE.search(text)
    if m:
        cand = m.group(1).upper()
        if _is_probable_rsn(cand):
            return cand

    # 2) If lines are available (EasyOCR), search each line for labeled first
    if lines:
        for ln in lines:
            m2 = RSN_LABELED_RE.search(ln)
            if m2:
                cand = m2.group(1).upper()
                if _is_probable_rsn(cand):
                    return cand

    # 3) Fallback: scan tokens in full text, filter with heuristics (+ per-line)
    tokens = [t.upper() for t in RSN_TOKEN_RE.findall(text.upper())]
    candidates = [t for t in tokens if _is_probable_rsn(t)]
    if lines:
        for ln in lines:
            tokens_l = [t.upper() for t in RSN_TOKEN_RE.findall(ln.upper())]
            candidates.extend([t for t in tokens_l if _is_probable_rsn(t)])

    if not candidates:
        return None

    # Pick the "best" by simple score: more digits & longer token rank higher
    def score(tok: str) -> tuple[int, int]:
        return (sum(ch.isdigit() for ch in tok), len(tok))

    candidates.sort(key=score, reverse=True)
    return candidates[0]


ANGLE_RE = re.compile(
    r"\b(?P<deg>\d{1,3})\s*°?\s*(?P<dir>N|NE|E|SE|S|SW|W|NW)?\b",
    re.IGNORECASE,
)


def extract_angle(text: str) -> Tuple[Optional[int], Optional[str]]:
    """
    Returns (deg, dir). Prefers matches with direction.
    """
    if not text:
        return (None, None)
    fallback = None
    for m in ANGLE_RE.finditer(text):
        deg = int(m.group("deg"))
        if 0 <= deg <= 360:
            direction = (m.group("dir") or "").upper() or None
            if direction:
                return (deg, direction)
            if fallback is None:
                fallback = (deg, None)
    return fallback if fallback else (None, None)


# ---------- High-level analyzers (legacy) ----------
def analyze_label_from_path(path: str, blur_threshold: float = 120.0) -> Dict[str, Any]:
    """
    Blur check + OCR + MAC/RSN extraction.
    Uses EasyOCR line mode to mirror your working Colab behavior.
    """
    bgr = load_bgr_from_path(path)
    score = laplacian_blur_score(bgr)
    if score < blur_threshold:
        return {"status": "blur", "blurScore": score}

    # Prefer EasyOCR lines for label photos (your working flow)
    lines = ocr_lines_easy(bgr)
    text = "\n".join(lines)

    mac = _extract_mac_from_lines(lines)
    rsn = extract_rsn(text, lines=lines)

    return {
        "status": "ok",
        "blurScore": score,
        "text": text,
        "mac_id": mac,
        "rsn_id": rsn,
    }


def analyze_angle_from_path(path: str, blur_threshold: float = 100.0) -> Dict[str, Any]:
    """
    Blur (tolerant) + OCR + angle extraction.
    Generic OCR is fine here.
    """
    bgr = load_bgr_from_path(path)
    score = laplacian_blur_score(bgr)

    text = ocr_text(bgr)  # tesseract or easyocr fallback
    deg, direction = extract_angle(text)
    return {"status": "ok", "blurScore": score, "text": text, "angleDeg": deg, "angleDir": direction}


# ---------- TEAM API shims expected by validate.py ----------
def _prefer_easyocr_lines(img: np.ndarray) -> list[str]:
    """Return OCR lines using EasyOCR when available; fall back to pytesseract."""
    try:
        # EasyOCR expects RGB
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        reader = _easyocr()
        lines = reader.readtext(rgb, detail=0) or []
        # normalize to strings & strip empties
        return [str(x).strip() for x in lines if str(x).strip()]
    except Exception:
        # fallback: pytesseract block split into lines
        txt = ocr_text(img) or ""
        return [ln.strip() for ln in txt.splitlines() if ln.strip()]

def ocr_text_block(img: np.ndarray) -> str:
    """
    TEAM API: return a single text block from the image.
    validate.py concatenates this with ocr_single_line.
    """
    lines = _prefer_easyocr_lines(img)
    return " ".join(lines).strip()

def ocr_single_line(img: np.ndarray) -> str:
    """
    TEAM API: return the most informative single line (longest line heuristic).
    """
    lines = _prefer_easyocr_lines(img)
    if not lines:
        return ""
    # pick the longest line (often the MAC/RSN row)
    return max(lines, key=len)

def extract_label_fields(text: str) -> Dict[str, Optional[str]]:
    """
    TEAM API: from OCR text, return {'macId': ..., 'rsn': ...}
    (validate.py and CSV expect 'rsn', not 'rsnId')
    """
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]

    # MAC: prefer line-aware extractor; fall back to whole-text pattern
    mac = _extract_mac_from_lines(lines) if lines else None
    if not mac:
        mac = extract_mac(text)

    # RSN: use labeled/heuristic extractor
    rsn = extract_rsn(text, lines=lines)

    return {"macId": mac, "rsn": rsn}

def extract_azimuth(text: str) -> Dict[str, Optional[object]]:
    """
    TEAM API: from OCR text, return {'azimuthDeg': int|None, 'azimuthDir': str|None}
    """
    deg, ddir = extract_angle(text or "")
    return {"azimuthDeg": deg, "azimuthDir": ddir}
