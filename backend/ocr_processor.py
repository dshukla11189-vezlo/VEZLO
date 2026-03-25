import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
from typing import List, Dict

async def process_excel_image(image_bytes: bytes) -> List[Dict]:
    """
    Process uploaded excel/table image and extract data using OCR.
    Returns list of extracted rows.
    """
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        # Preprocess image
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply thresholding
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        
        # Convert to PIL Image for pytesseract
        pil_img = Image.fromarray(thresh)
        
        # Extract text using pytesseract
        text = pytesseract.image_to_string(pil_img, config='--psm 6')
        
        # Parse text into structured data
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        extracted_data = []
        for line in lines:
            # Split by multiple spaces or tabs
            parts = [p.strip() for p in line.split() if p.strip()]
            if len(parts) >= 3:
                extracted_data.append({
                    "product_name": " ".join(parts[:-2]),
                    "quantity": parts[-2] if parts[-2].replace('.', '', 1).isdigit() else "0",
                    "rate": parts[-1] if parts[-1].replace('.', '', 1).isdigit() else "0"
                })
        
        return extracted_data
    
    except Exception as e:
        raise Exception(f"OCR processing error: {str(e)}")