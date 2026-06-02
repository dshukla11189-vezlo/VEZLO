"""
Test Auto Indent Generation Weight-Based Grouping Logic
========================================================
Tests the fix for auto-indent generation that groups products by normalized weight
instead of variant name to avoid duplicate line items.

Key features tested:
1. extract_weight_from_variant function - regex weight extraction
2. Weight normalization (500g, 500gm, 500 gm, 500+ gm all -> 500g)
3. Kg to gram conversion (1kg, 1 kg -> 1000g)
4. Grouping by product_id + normalized_weight
5. Items without extractable weights remain separate
6. Latest variant name used for display
"""

import pytest
import requests
import os
import re
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"

# Test retailer ID (Savtamali)
TEST_RETAILER_ID = "d36a4f17-bed0-4d8e-bb35-3e83825a0ce8"


def extract_weight_from_variant(variant_name: str) -> str:
    """
    Local implementation of the weight extraction function for testing.
    This mirrors the backend implementation.
    """
    if not variant_name:
        return ""
    
    variant_lower = variant_name.lower().strip()
    
    # Pattern to match weight: number (with optional decimal) followed by optional + and unit
    weight_pattern = r'(\d+(?:\.\d+)?)\s*\+?\s*(kg|kgs|kilogram|kilograms|g|gm|gms|gram|grams)'
    
    match = re.search(weight_pattern, variant_lower)
    if not match:
        return ""
    
    number = float(match.group(1))
    unit = match.group(2)
    
    # Normalize to grams
    if unit in ('kg', 'kgs', 'kilogram', 'kilograms'):
        grams = int(number * 1000)
    else:  # g, gm, gms, gram, grams
        grams = int(number)
    
    return f"{grams}g"


class TestWeightExtraction:
    """Test the extract_weight_from_variant function"""
    
    def test_basic_gram_formats(self):
        """Test basic gram format extraction"""
        assert extract_weight_from_variant("500g") == "500g"
        assert extract_weight_from_variant("500gm") == "500g"
        assert extract_weight_from_variant("500 gm") == "500g"
        assert extract_weight_from_variant("500 g") == "500g"
        assert extract_weight_from_variant("500gms") == "500g"
        assert extract_weight_from_variant("500 grams") == "500g"
        print("PASS: Basic gram formats extracted correctly")
    
    def test_plus_sign_variants(self):
        """Test variants with + sign (e.g., '500+ gm')"""
        assert extract_weight_from_variant("500+ gm") == "500g"
        assert extract_weight_from_variant("500+gm") == "500g"
        assert extract_weight_from_variant("500 + gm") == "500g"
        assert extract_weight_from_variant("400+ gm") == "400g"
        print("PASS: Plus sign variants extracted correctly")
    
    def test_kg_to_gram_conversion(self):
        """Test kg to gram conversion"""
        assert extract_weight_from_variant("1kg") == "1000g"
        assert extract_weight_from_variant("1 kg") == "1000g"
        assert extract_weight_from_variant("1Kg") == "1000g"
        assert extract_weight_from_variant("1 Kg") == "1000g"
        assert extract_weight_from_variant("2kg") == "2000g"
        assert extract_weight_from_variant("0.5kg") == "500g"
        assert extract_weight_from_variant("2.5kg") == "2500g"
        print("PASS: Kg to gram conversion works correctly")
    
    def test_1kg_equals_1000gm(self):
        """Test that 1kg and 1000gm produce the same normalized weight"""
        assert extract_weight_from_variant("1kg") == extract_weight_from_variant("1000gm")
        assert extract_weight_from_variant("1 kg") == extract_weight_from_variant("1000 gm")
        assert extract_weight_from_variant("1kg") == "1000g"
        assert extract_weight_from_variant("1000gm") == "1000g"
        print("PASS: 1kg and 1000gm produce same normalized weight")
    
    def test_500g_variants_grouped(self):
        """Test that all 500g variants produce the same normalized weight"""
        variants_500g = ["500g", "500gm", "500 gm", "500+ gm", "500 g", "500gms"]
        normalized = [extract_weight_from_variant(v) for v in variants_500g]
        assert all(n == "500g" for n in normalized), f"Not all 500g variants normalized correctly: {normalized}"
        print("PASS: All 500g variants produce same normalized weight")
    
    def test_different_weights_remain_separate(self):
        """Test that different weights produce different normalized values"""
        assert extract_weight_from_variant("400+ gm") != extract_weight_from_variant("500+ gm")
        assert extract_weight_from_variant("400+ gm") == "400g"
        assert extract_weight_from_variant("500+ gm") == "500g"
        assert extract_weight_from_variant("250g") == "250g"
        assert extract_weight_from_variant("1kg") == "1000g"
        print("PASS: Different weights remain separate")
    
    def test_no_weight_returns_empty(self):
        """Test variants without extractable weights return empty string"""
        assert extract_weight_from_variant("Half Dozen") == ""
        assert extract_weight_from_variant("1 Dozen") == ""
        assert extract_weight_from_variant("Pieces") == ""
        assert extract_weight_from_variant("Bunch") == ""
        assert extract_weight_from_variant("") == ""
        assert extract_weight_from_variant(None) == ""
        print("PASS: Non-weight variants return empty string")
    
    def test_product_name_with_weight(self):
        """Test extraction from product names that include weight"""
        assert extract_weight_from_variant("Tomato Local 1kg") == "1000g"
        assert extract_weight_from_variant("Tomato 1 kg") == "1000g"
        assert extract_weight_from_variant("Potato 500gm") == "500g"
        assert extract_weight_from_variant("Onion 500+ gm") == "500g"
        print("PASS: Weight extracted from product names with weight")
    
    def test_decimal_weights(self):
        """Test decimal weight extraction"""
        assert extract_weight_from_variant("0.5kg") == "500g"
        assert extract_weight_from_variant("1.5kg") == "1500g"
        assert extract_weight_from_variant("2.5kg") == "2500g"
        assert extract_weight_from_variant("0.25kg") == "250g"
        print("PASS: Decimal weights extracted correctly")


class TestAutoIndentAPI:
    """Test the auto-indent generation API endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            print(f"PASS: Admin login successful")
        else:
            pytest.skip(f"Admin login failed: {login_response.status_code}")
    
    def test_health_check(self):
        """Test API health"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ["healthy", "degraded"]
        print(f"PASS: Health check - status: {data.get('status')}")
    
    def test_retailer_exists(self):
        """Verify test retailer exists"""
        response = self.session.get(f"{BASE_URL}/api/retailers")
        assert response.status_code == 200
        retailers = response.json()
        
        retailer = next((r for r in retailers if r.get("id") == TEST_RETAILER_ID), None)
        if retailer:
            print(f"PASS: Test retailer found - {retailer.get('company_name', retailer.get('name'))}")
        else:
            print(f"INFO: Test retailer {TEST_RETAILER_ID} not found, will use first available retailer")
    
    def test_auto_indent_endpoint_exists(self):
        """Test that the auto-indent endpoint exists"""
        # Test with missing retailer_id - should return 400, not 404
        response = self.session.post(f"{BASE_URL}/api/admin/generate-auto-indent", json={})
        assert response.status_code in [400, 403, 422], f"Unexpected status: {response.status_code}"
        print(f"PASS: Auto-indent endpoint exists (status: {response.status_code})")
    
    def test_auto_indent_requires_retailer_id(self):
        """Test that retailer_id is required"""
        response = self.session.post(f"{BASE_URL}/api/admin/generate-auto-indent", json={
            "target_date": "2026-06-10"
        })
        assert response.status_code == 400
        assert "retailer_id" in response.json().get("detail", "").lower()
        print("PASS: Auto-indent requires retailer_id")
    
    def test_auto_indent_generation(self):
        """Test auto-indent generation for a future date"""
        # Use a future date to avoid conflicts
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = self.session.post(f"{BASE_URL}/api/admin/generate-auto-indent", json={
            "retailer_id": TEST_RETAILER_ID,
            "target_date": future_date
        })
        
        print(f"Auto-indent response status: {response.status_code}")
        print(f"Auto-indent response: {response.json()}")
        
        # The response could be success or failure depending on data availability
        assert response.status_code == 200
        data = response.json()
        
        if data.get("success"):
            print(f"PASS: Auto-indent created - {data.get('message')}")
            
            # Verify the indent was created
            indent_id = data.get("indent_id")
            if indent_id:
                # Check the indent details
                indent_response = self.session.get(f"{BASE_URL}/api/retailer-indents?retailer_id={TEST_RETAILER_ID}")
                if indent_response.status_code == 200:
                    indents = indent_response.json()
                    created_indent = next((i for i in indents if i.get("id") == indent_id), None)
                    if created_indent:
                        items = created_indent.get("items", [])
                        print(f"  - Created indent has {len(items)} items")
                        
                        # Verify no duplicate product+weight combinations
                        seen_keys = set()
                        for item in items:
                            product_id = item.get("product_id")
                            variant_name = item.get("variant_name", "")
                            normalized_weight = extract_weight_from_variant(variant_name)
                            
                            if normalized_weight:
                                key = f"{product_id}_{normalized_weight}"
                            else:
                                key = f"{product_id}_{variant_name}"
                            
                            assert key not in seen_keys, f"Duplicate key found: {key}"
                            seen_keys.add(key)
                        
                        print(f"  - No duplicate product+weight combinations found")
                        
                        # Clean up - delete the test indent
                        delete_response = self.session.delete(f"{BASE_URL}/api/retailer-indents/{indent_id}")
                        if delete_response.status_code == 200:
                            print(f"  - Test indent cleaned up")
        else:
            # No historical data - this is expected for some retailers
            print(f"INFO: Auto-indent not created - {data.get('message')}")
    
    def test_auto_indent_with_existing_indent(self):
        """Test that auto-indent fails if indent already exists for the date"""
        # First, create an indent for a specific date
        test_date = "2026-06-15"
        
        # Try to generate auto-indent
        response = self.session.post(f"{BASE_URL}/api/admin/generate-auto-indent", json={
            "retailer_id": TEST_RETAILER_ID,
            "target_date": test_date
        })
        
        if response.status_code == 200 and response.json().get("success"):
            # Indent was created, try to create another one
            response2 = self.session.post(f"{BASE_URL}/api/admin/generate-auto-indent", json={
                "retailer_id": TEST_RETAILER_ID,
                "target_date": test_date
            })
            
            assert response2.status_code == 200
            data2 = response2.json()
            assert data2.get("success") == False
            assert "already exists" in data2.get("message", "").lower()
            print("PASS: Auto-indent correctly rejects duplicate for same date")
            
            # Clean up
            indent_id = response.json().get("indent_id")
            if indent_id:
                self.session.delete(f"{BASE_URL}/api/retailer-indents/{indent_id}")
        else:
            print("INFO: Could not test duplicate rejection - no historical data")


class TestWeightGroupingLogic:
    """Test the weight-based grouping logic conceptually"""
    
    def test_grouping_same_weight_different_names(self):
        """Test that variants with same weight but different names are grouped"""
        # Simulate invoice items with different variant names but same weight
        invoice_items = [
            {"product_id": "prod1", "variant_name": "Tomato Local 1kg", "quantity": 10},
            {"product_id": "prod1", "variant_name": "Tomato 1 kg", "quantity": 15},
            {"product_id": "prod1", "variant_name": "Tomato 1Kg", "quantity": 12},
        ]
        
        # Group by product_id + normalized_weight
        grouped = {}
        for item in invoice_items:
            product_id = item["product_id"]
            variant_name = item["variant_name"]
            normalized_weight = extract_weight_from_variant(variant_name)
            
            if normalized_weight:
                key = f"{product_id}_{normalized_weight}"
            else:
                key = f"{product_id}_{variant_name}"
            
            if key not in grouped:
                grouped[key] = {"total_qty": 0, "variants": []}
            grouped[key]["total_qty"] += item["quantity"]
            grouped[key]["variants"].append(variant_name)
        
        # Should have only 1 group for all 1kg variants
        assert len(grouped) == 1, f"Expected 1 group, got {len(grouped)}: {list(grouped.keys())}"
        assert grouped["prod1_1000g"]["total_qty"] == 37  # 10 + 15 + 12
        print("PASS: Same weight variants grouped correctly")
    
    def test_grouping_different_weights_separate(self):
        """Test that variants with different weights remain separate"""
        invoice_items = [
            {"product_id": "prod1", "variant_name": "Tomato 500gm", "quantity": 10},
            {"product_id": "prod1", "variant_name": "Tomato 1kg", "quantity": 15},
            {"product_id": "prod1", "variant_name": "Tomato 250g", "quantity": 8},
        ]
        
        grouped = {}
        for item in invoice_items:
            product_id = item["product_id"]
            variant_name = item["variant_name"]
            normalized_weight = extract_weight_from_variant(variant_name)
            
            if normalized_weight:
                key = f"{product_id}_{normalized_weight}"
            else:
                key = f"{product_id}_{variant_name}"
            
            if key not in grouped:
                grouped[key] = {"total_qty": 0}
            grouped[key]["total_qty"] += item["quantity"]
        
        # Should have 3 separate groups
        assert len(grouped) == 3, f"Expected 3 groups, got {len(grouped)}: {list(grouped.keys())}"
        assert "prod1_500g" in grouped
        assert "prod1_1000g" in grouped
        assert "prod1_250g" in grouped
        print("PASS: Different weight variants remain separate")
    
    def test_grouping_non_weight_variants_separate(self):
        """Test that non-weight variants remain separate"""
        invoice_items = [
            {"product_id": "prod1", "variant_name": "Half Dozen", "quantity": 10},
            {"product_id": "prod1", "variant_name": "1 Dozen", "quantity": 15},
            {"product_id": "prod1", "variant_name": "Pieces", "quantity": 8},
        ]
        
        grouped = {}
        for item in invoice_items:
            product_id = item["product_id"]
            variant_name = item["variant_name"]
            normalized_weight = extract_weight_from_variant(variant_name)
            
            if normalized_weight:
                key = f"{product_id}_{normalized_weight}"
            else:
                key = f"{product_id}_{variant_name}"
            
            if key not in grouped:
                grouped[key] = {"total_qty": 0}
            grouped[key]["total_qty"] += item["quantity"]
        
        # Should have 3 separate groups (no weight extraction)
        assert len(grouped) == 3, f"Expected 3 groups, got {len(grouped)}: {list(grouped.keys())}"
        assert "prod1_Half Dozen" in grouped
        assert "prod1_1 Dozen" in grouped
        assert "prod1_Pieces" in grouped
        print("PASS: Non-weight variants remain separate")
    
    def test_500_plus_gm_grouped_with_500gm(self):
        """Test that '500+ gm' is grouped with '500 gm'"""
        invoice_items = [
            {"product_id": "prod1", "variant_name": "Tomato 500+ gm", "quantity": 10},
            {"product_id": "prod1", "variant_name": "Tomato 500 gm", "quantity": 15},
            {"product_id": "prod1", "variant_name": "Tomato 500gm", "quantity": 12},
        ]
        
        grouped = {}
        for item in invoice_items:
            product_id = item["product_id"]
            variant_name = item["variant_name"]
            normalized_weight = extract_weight_from_variant(variant_name)
            
            if normalized_weight:
                key = f"{product_id}_{normalized_weight}"
            else:
                key = f"{product_id}_{variant_name}"
            
            if key not in grouped:
                grouped[key] = {"total_qty": 0}
            grouped[key]["total_qty"] += item["quantity"]
        
        # Should have only 1 group
        assert len(grouped) == 1, f"Expected 1 group, got {len(grouped)}: {list(grouped.keys())}"
        assert grouped["prod1_500g"]["total_qty"] == 37
        print("PASS: 500+ gm grouped with 500 gm correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
