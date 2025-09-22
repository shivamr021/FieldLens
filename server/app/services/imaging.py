import cv2
import numpy as np
from typing import Tuple


def load_bgr(data: bytes):
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def to_gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def variance_of_laplacian(img):
    gray = to_gray(img)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def largest_quadrilateral_skew_deg(img) -> float | None:
    gray = to_gray(img)
    gray = cv2.bilateralFilter(gray, 5, 75, 75)
    edges = cv2.Canny(gray, 50, 150)
    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    quad = None
    area_best = 0
    for c in cnts:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.03 * peri, True)
        if len(approx) == 4:
            area = cv2.contourArea(approx)
            if area > area_best:
                area_best = area
                quad = approx
    if quad is None:
        return None
    pts = quad.reshape(-1,2).astype(np.float32)

    # Compute angles of edges vs horizontal, take average deviation
    def angle(p, q):
        v = q - p
        ang = np.degrees(np.arctan2(v[1], v[0]))
        return abs(((ang + 90) % 90) - 45)  # rough rect skew-ness

    a = angle(pts[0], pts[1]); b = angle(pts[1], pts[2]); c = angle(pts[2], pts[3]); d = angle(pts[3], pts[0])
    return float(np.mean([a, b, c, d]))


def has_big_circle(img) -> bool:
    g = to_gray(img)
    g = cv2.medianBlur(g, 5)
    circles = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1.2, minDist=80,
                               param1=80, param2=40, minRadius=40, maxRadius=0)
    return circles is not None
