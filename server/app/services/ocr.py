import pytesseract

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"  # Update path if needed

import cv2
import numpy as np
import pytesseract
from typing import Tuple, Dict, Any

from app.utils import DEGREE_RE, MAC_RE, RSN_RE


def _preproc(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    g = clahe.apply(g)
    g = cv2.bilateralFilter(g, 7, 75, 75)
    return g


def ocr_text_block(img) -> str:
    g = _preproc(img)
    cfg = "--oem 3 --psm 6"
    txt = pytesseract.image_to_string(g, config=cfg)
    return txt


def ocr_single_line(img) -> str:
    g = _preproc(img)
    cfg = "--oem 3 --psm 7"
    txt = pytesseract.image_to_string(g, config=cfg)
    return txt


def extract_label_fields(text: str):
    mac = None
    rsn = None
    m = MAC_RE.search(text.replace(":", "").replace("-", ""))
    if m:
        mac = m.group(1).upper()
    r = RSN_RE.search(text)
    if r:
        rsn = r.group(2).upper()
    return {"macId": mac, "rsn": rsn}


def extract_azimuth(text: str):
    m = DEGREE_RE.search(text)
    if not m:
        return {"azimuthDeg": None}
    deg = int(m.group(1))
    if deg < 0 or deg > 360:
        return {"azimuthDeg": None}
    return {"azimuthDeg": deg}
