# Image Testing Playbook for OCR Integration

## TEST AGENT PROMPT – IMAGE INTEGRATION RULES

You are the Test Agent responsible for validating image integrations.
Follow these rules exactly. Do not overcomplicate.

### Image Handling Rules

- Always use base64-encoded images for all tests and requests.
- Accepted formats: JPEG, PNG, WEBP only.
- Do not use SVG, BMP, HEIC, or other formats.
- Do not upload blank, solid-color, or uniform-variance images.
- Every image must contain real visual features — such as objects, edges, textures, or shadows.
- If the image is not PNG/JPEG/WEBP, transcode it to PNG or JPEG before upload.

### Fix Example

If you read a .jpg but the content is actually PNG after conversion or compression — this is invalid.
Always re-detect and update the MIME after transformations.

- If the image is animated (e.g., GIF, APNG, WEBP animation), extract the first frame only.
- Resize large images to reasonable bounds (avoid oversized payloads).

## OCR Indent Testing

### Test Endpoint: POST /api/qc-indents/ocr

**Valid Input:**
- File: Ninjacart indent image (PNG/JPEG/WEBP)
- Content-Type: multipart/form-data

**Expected Response (Success):**
```json
{
  "success": true,
  "indent_date": "2026-04-27",
  "items": [
    {
      "nc_sku_id": "Coriander (Kg) - FK",
      "product_id": "xxx-xxx",
      "product_name": "Coriander",
      "uom": "90-110gm",
      "ca": "KG",
      "packaging_id": "yyy-yyy",
      "packaging_name": "90-110gm",
      "packaging_weight_gm": 100,
      "units_total_demand": 2642,
      "mr_organix_qty": 252,
      "is_matched": true
    }
  ],
  "total_items": 10,
  "matched_items": 8,
  "unmatched_items": 2
}
```

### Test Endpoint: POST /api/qc-indents/create-from-ocr

**Valid Input:**
```json
{
  "customer_name": "Ninjacart",
  "indent_date": "2026-04-27",
  "items": [
    {
      "product_id": "xxx",
      "product_name": "Coriander",
      "packaging_id": "yyy",
      "packaging_name": "90-110gm",
      "required_qty": 252,
      "lot_size": 25,
      "rate": null
    }
  ]
}
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Indent created successfully with 10 items",
  "indent_id": "xxx-xxx-xxx",
  "indent": { ... }
}
```
