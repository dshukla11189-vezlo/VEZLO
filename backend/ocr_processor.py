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
            # Try PIL as fallback
            try:
                pil_img = Image.open(io.BytesIO(image_bytes))
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception as pil_error:
                raise ValueError(f"Failed to decode image: {str(pil_error)}")
        
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
            # Skip header-like lines
            if 'product' in line.lower() or 'quantity' in line.lower() or 'rate' in line.lower():
                continue
                
            # Split by multiple spaces or tabs
            parts = [p.strip() for p in line.split() if p.strip()]
            if len(parts) >= 3:
                # Try to identify numeric values for quantity and rate
                numeric_parts = []
                text_parts = []
                
                for part in parts:
                    if part.replace('.', '', 1).replace(',', '').isdigit():
                        numeric_parts.append(part.replace(',', ''))
                    else:
                        text_parts.append(part)
                
                if len(numeric_parts) >= 2:
                    extracted_data.append({
                        "product_name": " ".join(text_parts),
                        "quantity": numeric_parts[0],
                        "rate": numeric_parts[1]
                    })
        
        return extracted_data
    
    except Exception as e:
        raise Exception(f"OCR processing error: {str(e)}")