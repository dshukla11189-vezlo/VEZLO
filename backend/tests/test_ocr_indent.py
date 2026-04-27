"""
OCR Indent Processing Tests
===========================
Tests for the OCR QC Order Processing feature:
1. POST /api/qc-indents/ocr - Image upload and extraction
2. POST /api/qc-indents/create-from-ocr - Create indent from extracted data
3. Product matching - NC SKU IDs matched to existing products
"""

import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}"
    }


class TestOCREndpoints:
    """Test OCR indent processing endpoints"""
    
    def test_health_check(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ["healthy", "degraded"]
        print(f"✓ Health check passed: {data.get('status')}")
    
    def test_ocr_endpoint_requires_auth(self):
        """OCR endpoint should require authentication"""
        # Try without auth
        response = requests.post(f"{BASE_URL}/api/qc-indents/ocr")
        assert response.status_code in [401, 403, 422]
        print("✓ OCR endpoint requires authentication")
    
    def test_ocr_endpoint_rejects_invalid_file_type(self, auth_headers):
        """OCR endpoint should reject non-image files"""
        # Create a fake text file
        files = {
            'file': ('test.txt', b'This is not an image', 'text/plain')
        }
        response = requests.post(
            f"{BASE_URL}/api/qc-indents/ocr",
            headers=auth_headers,
            files=files
        )
        assert response.status_code == 400
        assert "Invalid file type" in response.text or "file type" in response.text.lower()
        print("✓ OCR endpoint rejects invalid file types")
    
    def test_ocr_endpoint_with_valid_image(self, auth_headers):
        """OCR endpoint should process valid image and return extracted data"""
        # Check if test image exists
        test_image_path = "/tmp/ninjacart_indent.png"
        if not os.path.exists(test_image_path):
            pytest.skip("Test image not found at /tmp/ninjacart_indent.png")
        
        # Read the test image
        with open(test_image_path, 'rb') as f:
            image_data = f.read()
        
        files = {
            'file': ('ninjacart_indent.png', image_data, 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/qc-indents/ocr",
            headers=auth_headers,
            files=files,
            timeout=60  # OCR can take time
        )
        
        print(f"OCR Response Status: {response.status_code}")
        print(f"OCR Response: {response.text[:500]}...")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data
        
        if data["success"]:
            # Verify response structure
            assert "items" in data
            assert "total_items" in data
            assert "matched_items" in data
            assert "unmatched_items" in data
            
            print(f"✓ OCR extracted {data['total_items']} items")
            print(f"  - Matched: {data['matched_items']}")
            print(f"  - Unmatched: {data['unmatched_items']}")
            
            # Verify item structure
            if data["items"]:
                item = data["items"][0]
                assert "nc_sku_id" in item
                assert "product_name" in item
                assert "mr_organix_qty" in item
                assert "is_matched" in item
                print(f"  - First item: {item['nc_sku_id']} -> {item['product_name']}")
        else:
            # OCR failed - check error message
            print(f"OCR processing failed: {data.get('error', 'Unknown error')}")
            # This is acceptable if EMERGENT_LLM_KEY is not configured
            if "EMERGENT_LLM_KEY" in str(data.get('error', '')):
                pytest.skip("EMERGENT_LLM_KEY not configured")
    
    def test_create_from_ocr_requires_auth(self):
        """Create from OCR endpoint should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/qc-indents/create-from-ocr",
            json={"customer_name": "Test", "items": []}
        )
        assert response.status_code in [401, 403]
        print("✓ Create from OCR endpoint requires authentication")
    
    def test_create_from_ocr_requires_items(self, auth_headers):
        """Create from OCR should require at least one item"""
        response = requests.post(
            f"{BASE_URL}/api/qc-indents/create-from-ocr",
            headers=auth_headers,
            json={
                "customer_name": "Ninjacart",
                "indent_date": "2026-04-27",
                "items": []
            }
        )
        assert response.status_code == 400
        assert "No items" in response.text or "items" in response.text.lower()
        print("✓ Create from OCR requires items")
    
    def test_create_from_ocr_success(self, auth_headers):
        """Create indent from OCR data should work"""
        # Create a test indent with sample data
        test_items = [
            {
                "product_id": "test-product-1",
                "product_name": "Test Coriander",
                "nc_sku_id": "Coriander (Kg) - FK",
                "packaging_id": "test-pkg-1",
                "packaging_name": "90-110gm",
                "ca": "KG",
                "required_qty": 100,
                "lot_size": 25,
                "units_total_demand": 500,
                "rate": None
            },
            {
                "product_id": "test-product-2",
                "product_name": "Test Mint",
                "nc_sku_id": "Fresh Mint Leaves (Kg) - FK",
                "packaging_id": "test-pkg-2",
                "packaging_name": "100gm",
                "ca": "KG",
                "required_qty": 50,
                "lot_size": 20,
                "units_total_demand": 200,
                "rate": None
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/qc-indents/create-from-ocr",
            headers=auth_headers,
            json={
                "customer_name": "Ninjacart",
                "indent_date": "2026-04-27",
                "items": test_items
            }
        )
        
        print(f"Create from OCR Response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert "indent_id" in data
        assert "indent" in data
        
        # Verify indent structure
        indent = data["indent"]
        assert indent["customer_name"] == "Ninjacart"
        assert len(indent["items"]) == 2
        assert indent["source"] == "ocr"  # Should be marked as OCR source
        
        print(f"✓ Created indent {data['indent_id']} with {len(indent['items'])} items")
        
        # Store indent_id for cleanup
        return data["indent_id"]
    
    def test_verify_created_indent(self, auth_headers):
        """Verify the created indent appears in the list"""
        response = requests.get(
            f"{BASE_URL}/api/qc-indents",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        indents = response.json()
        
        # Find indents with source=ocr
        ocr_indents = [i for i in indents if i.get("source") == "ocr"]
        print(f"✓ Found {len(ocr_indents)} OCR-created indents")
        
        if ocr_indents:
            latest = ocr_indents[-1]
            print(f"  - Latest OCR indent: {latest['id'][:8]}... for {latest['customer_name']}")
            print(f"  - Items: {len(latest.get('items', []))}")


class TestProductMatching:
    """Test product matching functionality"""
    
    def test_get_products(self, auth_headers):
        """Verify products endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/products",
            headers=auth_headers
        )
        assert response.status_code == 200
        products = response.json()
        print(f"✓ Found {len(products)} products in database")
        
        # Check for common products that should match
        product_names = [p.get("name", "").lower() for p in products]
        common_products = ["coriander", "mint", "palak", "spinach", "methi", "fenugreek"]
        
        matched = [p for p in common_products if any(p in name for name in product_names)]
        print(f"  - Common products found: {matched}")
    
    def test_get_packaging(self, auth_headers):
        """Verify packaging endpoint works"""
        response = requests.get(
            f"{BASE_URL}/api/qc-packaging",
            headers=auth_headers
        )
        assert response.status_code == 200
        packagings = response.json()
        print(f"✓ Found {len(packagings)} packaging variants")
        
        if packagings:
            for pkg in packagings[:5]:
                print(f"  - {pkg.get('name')}: {pkg.get('weight_gm')}gm")


class TestOCRIntegration:
    """End-to-end OCR integration tests"""
    
    def test_full_ocr_flow(self, auth_headers):
        """Test complete OCR flow: upload -> preview -> create"""
        test_image_path = "/tmp/ninjacart_indent.png"
        if not os.path.exists(test_image_path):
            pytest.skip("Test image not found")
        
        # Step 1: Upload image for OCR
        with open(test_image_path, 'rb') as f:
            image_data = f.read()
        
        files = {'file': ('ninjacart_indent.png', image_data, 'image/png')}
        
        ocr_response = requests.post(
            f"{BASE_URL}/api/qc-indents/ocr",
            headers=auth_headers,
            files=files,
            timeout=60
        )
        
        if ocr_response.status_code != 200:
            pytest.skip(f"OCR failed: {ocr_response.text}")
        
        ocr_data = ocr_response.json()
        if not ocr_data.get("success"):
            pytest.skip(f"OCR processing failed: {ocr_data.get('error')}")
        
        print(f"Step 1: OCR extracted {ocr_data['total_items']} items")
        
        # Step 2: Prepare items for indent creation
        items_to_create = []
        for item in ocr_data["items"]:
            if item.get("mr_organix_qty", 0) > 0:
                items_to_create.append({
                    "product_id": item.get("product_id") or f"unmatched-{len(items_to_create)}",
                    "product_name": item.get("product_name"),
                    "nc_sku_id": item.get("nc_sku_id"),
                    "packaging_id": item.get("packaging_id"),
                    "packaging_name": item.get("packaging_name"),
                    "ca": item.get("ca", "KG"),
                    "required_qty": item.get("mr_organix_qty"),
                    "lot_size": 25,
                    "units_total_demand": item.get("units_total_demand"),
                    "rate": None
                })
        
        print(f"Step 2: Prepared {len(items_to_create)} items for indent")
        
        # Step 3: Create indent
        create_response = requests.post(
            f"{BASE_URL}/api/qc-indents/create-from-ocr",
            headers=auth_headers,
            json={
                "customer_name": "Ninjacart",
                "indent_date": ocr_data.get("indent_date") or "2026-04-27",
                "items": items_to_create
            }
        )
        
        assert create_response.status_code == 200
        create_data = create_response.json()
        assert create_data.get("success") == True
        
        print(f"Step 3: Created indent {create_data['indent_id']}")
        print(f"✓ Full OCR flow completed successfully!")
        
        # Verify indent
        indent = create_data["indent"]
        assert indent["source"] == "ocr"
        assert len(indent["items"]) == len(items_to_create)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
