# test_image.py
import sys
from app.services.imaging import load_bgr
from app.services.ocr import extract_azimuth

# Check if a file path was provided
if len(sys.argv) < 2:
    print("Usage: python test_image.py <path_to_your_image.jpeg>")
    sys.exit(1)

file_path = sys.argv[1]
print(f"--- Testing Image: {file_path} ---")

try:
    # Read the file in binary mode, the same way the server gets the bytes
    with open(file_path, "rb") as f:
        image_bytes = f.read()

    # Use the exact same function from your project
    image = load_bgr(image_bytes)

    if image is not None:
        print("✅ SUCCESS: Image loaded successfully by 'load_bgr'!")
        print(f"   - Image Dimensions: {image.shape}")
    else:
        print("❌ FAILURE: The 'load_bgr' function returned None.")
        print("\n   >>> This confirms the issue is with the image file or your OpenCV installation, NOT your web server code.")

except FileNotFoundError:
    print(f"Error: The file '{file_path}' was not found.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")

print("--- Test Complete ---")