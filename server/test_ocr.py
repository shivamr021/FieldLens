import cv2
import pytesseract

# If needed, set the path again here
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

img = cv2.imread("sample_label.jpg")  # replace with one of your photos
text = pytesseract.image_to_string(img)
print("OCR Output:")
print(text)
