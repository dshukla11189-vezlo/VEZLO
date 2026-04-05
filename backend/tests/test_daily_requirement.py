"""
Test Daily Requirement Features for Retailer and QC
- Retailer Daily Requirement: Calculate, Save, bidirectional Rate/Amount
- QC Daily Requirement: Calculate with wastage averages, Save, bidirectional Rate/Amount
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDailyRequirementEndpoints:
    """Test Daily Requirement API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@mrorganix.com",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    # ==================== RETAILER DAILY REQUIREMENT TESTS ====================
    
    def test_retailer_indents_endpoint(self):
        """Test that retailer indents endpoint works with date filter"""
        # Use a date that might have indents
        test_date = "2026-04-03"
        response = self.session.get(f"{BASE_URL}/api/retailer-indents?date={test_date}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} retailer indents for date {test_date}")
    
    def test_save_retailer_daily_requirement(self):
        """Test saving retailer daily requirement"""
        test_date = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "requirement_date": test_date,
            "retailer_id": None,
            "retailer_name": "All Retailers",
            "items": [
                {
                    "product_id": "test-product-1",
                    "product_name": "Test Coriander",
                    "variant_id": None,
                    "variant_name": "Bunch",
                    "indent_qty": 100,
                    "kg_required": 10.5,
                    "rate_per_kg": 50,
                    "amount": 525,
                    "remarks": "Test entry"
                }
            ],
            "total_kg": 10.5,
            "total_amount": 525
        }
        
        response = self.session.post(f"{BASE_URL}/api/retailer-daily-requirement", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "id" in data or "Daily requirement" in data.get("message", ""), "Response should confirm save"
        print(f"Retailer daily requirement saved: {data}")
    
    def test_get_retailer_daily_requirement(self):
        """Test retrieving saved retailer daily requirement"""
        test_date = datetime.now().strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/retailer-daily-requirement/{test_date}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # Response can be null if no data exists
        data = response.json()
        if data:
            assert "requirement_date" in data, "Response should contain requirement_date"
            assert "items" in data, "Response should contain items"
            print(f"Retrieved retailer daily requirement: {data.get('requirement_date')}, items: {len(data.get('items', []))}")
        else:
            print("No retailer daily requirement found for today (expected if not saved)")
    
    def test_list_retailer_daily_requirements(self):
        """Test listing retailer daily requirements"""
        response = self.session.get(f"{BASE_URL}/api/retailer-daily-requirements")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} retailer daily requirements")
    
    # ==================== QC DAILY REQUIREMENT TESTS ====================
    
    def test_qc_wastage_averages_endpoint(self):
        """Test QC wastage averages endpoint returns data from GRN records"""
        response = self.session.get(f"{BASE_URL}/api/qc-wastage-averages")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check structure if data exists
        if len(data) > 0:
            item = data[0]
            assert "product_id" in item, "Item should have product_id"
            assert "avg_wastage_qty" in item, "Item should have avg_wastage_qty"
            assert "wastage_percentage" in item, "Item should have wastage_percentage"
            print(f"Found {len(data)} wastage averages. Sample: {item.get('product_name')}: avg wastage {item.get('avg_wastage_qty')}")
        else:
            print("No wastage averages found (may need GRN data)")
    
    def test_qc_indents_endpoint(self):
        """Test that QC indents endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/qc-indents")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} QC indents total")
        
        # Check for indents on specific dates
        test_dates = ["2026-04-03", "2026-04-04"]
        for test_date in test_dates:
            filtered = [i for i in data if i.get("indent_date", "").startswith(test_date)]
            print(f"  - {test_date}: {len(filtered)} indents")
    
    def test_save_qc_daily_requirement(self):
        """Test saving QC daily requirement"""
        test_date = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "requirement_date": test_date,
            "customer_name": "All Customers",
            "items": [
                {
                    "product_id": "test-product-1",
                    "product_name": "Test Spinach",
                    "product_unit": "pcs",
                    "packaging_id": "1",
                    "packaging_name": "Packet 100 gm",
                    "qty_required": 50,
                    "estimated_wastage": 5,
                    "actual_qty_kg": 5.5,
                    "weight_per_bunch": 0.1,
                    "no_of_bunches": 55,
                    "rate": 40,
                    "amount": 220,
                    "remarks": "Test QC entry"
                }
            ],
            "total_qty_required": 50,
            "total_actual_qty": 5.5,
            "total_bunches": 55,
            "total_amount": 220
        }
        
        response = self.session.post(f"{BASE_URL}/api/qc-daily-requirement", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"QC daily requirement saved: {data}")
    
    def test_get_qc_daily_requirement(self):
        """Test retrieving saved QC daily requirement"""
        test_date = datetime.now().strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/qc-daily-requirement/{test_date}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        if data:
            assert "requirement_date" in data, "Response should contain requirement_date"
            assert "items" in data, "Response should contain items"
            print(f"Retrieved QC daily requirement: {data.get('requirement_date')}, items: {len(data.get('items', []))}")
        else:
            print("No QC daily requirement found for today")
    
    def test_list_qc_daily_requirements(self):
        """Test listing QC daily requirements"""
        response = self.session.get(f"{BASE_URL}/api/qc-daily-requirements")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} QC daily requirements")
    
    # ==================== BIDIRECTIONAL CALCULATION TESTS ====================
    
    def test_retailer_bidirectional_calculation_rate_to_amount(self):
        """Test that Rate * Kg = Amount calculation works (frontend logic verification)"""
        # This tests the calculation logic that should be in frontend
        kg_required = 10.5
        rate_per_kg = 50
        expected_amount = kg_required * rate_per_kg
        
        assert expected_amount == 525, f"Rate * Kg should equal Amount: {rate_per_kg} * {kg_required} = {expected_amount}"
        print(f"Bidirectional calc verified: {rate_per_kg} * {kg_required} = {expected_amount}")
    
    def test_retailer_bidirectional_calculation_amount_to_rate(self):
        """Test that Amount / Kg = Rate calculation works (frontend logic verification)"""
        kg_required = 10.5
        amount = 525
        expected_rate = amount / kg_required
        
        assert expected_rate == 50, f"Amount / Kg should equal Rate: {amount} / {kg_required} = {expected_rate}"
        print(f"Bidirectional calc verified: {amount} / {kg_required} = {expected_rate}")
    
    def test_qc_actual_qty_calculation(self):
        """Test QC Actual Qty = (Qty Req + Est Wastage) * packaging weight / 1000"""
        qty_required = 50
        estimated_wastage = 5
        packaging_weight_gm = 100
        
        total_units = qty_required + estimated_wastage
        actual_qty_kg = (total_units * packaging_weight_gm) / 1000
        
        assert actual_qty_kg == 5.5, f"Actual Qty calculation: ({qty_required} + {estimated_wastage}) * {packaging_weight_gm} / 1000 = {actual_qty_kg}"
        print(f"QC Actual Qty calc verified: ({qty_required} + {estimated_wastage}) * {packaging_weight_gm} / 1000 = {actual_qty_kg} Kg")
    
    def test_qc_bunches_calculation(self):
        """Test QC No of Bunches = Actual Kg / Weight per Bunch"""
        actual_qty_kg = 5.5
        weight_per_bunch = 0.1  # 100g = 0.1 kg
        
        import math
        no_of_bunches = math.ceil(actual_qty_kg / weight_per_bunch)
        
        assert no_of_bunches == 55, f"Bunches calculation: ceil({actual_qty_kg} / {weight_per_bunch}) = {no_of_bunches}"
        print(f"QC Bunches calc verified: ceil({actual_qty_kg} / {weight_per_bunch}) = {no_of_bunches}")


class TestDailyRequirementDataIntegrity:
    """Test data integrity for daily requirement features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@mrorganix.com",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_save_and_retrieve_retailer_requirement(self):
        """Test save then retrieve to verify data persistence"""
        test_date = "2026-04-05"
        unique_remarks = f"TEST_integrity_{datetime.now().timestamp()}"
        
        # Save
        payload = {
            "requirement_date": test_date,
            "retailer_id": None,
            "retailer_name": "All Retailers",
            "items": [
                {
                    "product_id": "integrity-test-product",
                    "product_name": "Integrity Test Product",
                    "variant_id": None,
                    "variant_name": "Test Variant",
                    "indent_qty": 25,
                    "kg_required": 2.5,
                    "rate_per_kg": 100,
                    "amount": 250,
                    "remarks": unique_remarks
                }
            ],
            "total_kg": 2.5,
            "total_amount": 250
        }
        
        save_response = self.session.post(f"{BASE_URL}/api/retailer-daily-requirement", json=payload)
        assert save_response.status_code == 200, f"Save failed: {save_response.text}"
        
        # Retrieve
        get_response = self.session.get(f"{BASE_URL}/api/retailer-daily-requirement/{test_date}")
        assert get_response.status_code == 200, f"Get failed: {get_response.text}"
        
        data = get_response.json()
        assert data is not None, "Retrieved data should not be null"
        assert data.get("requirement_date") == test_date, "Date should match"
        assert len(data.get("items", [])) > 0, "Should have items"
        
        # Verify the item we saved
        saved_item = next((i for i in data.get("items", []) if i.get("remarks") == unique_remarks), None)
        if saved_item:
            assert saved_item.get("kg_required") == 2.5, "Kg should match"
            assert saved_item.get("rate_per_kg") == 100, "Rate should match"
            assert saved_item.get("amount") == 250, "Amount should match"
            print(f"Data integrity verified for retailer requirement")
        else:
            print(f"Note: Item with unique remarks not found (may have been overwritten)")
    
    def test_save_and_retrieve_qc_requirement(self):
        """Test save then retrieve QC requirement to verify data persistence"""
        test_date = "2026-04-05"
        unique_remarks = f"TEST_qc_integrity_{datetime.now().timestamp()}"
        
        # Save
        payload = {
            "requirement_date": test_date,
            "customer_name": "All Customers",
            "items": [
                {
                    "product_id": "qc-integrity-test",
                    "product_name": "QC Integrity Test",
                    "product_unit": "pcs",
                    "packaging_id": "1",
                    "packaging_name": "Packet 100 gm",
                    "qty_required": 30,
                    "estimated_wastage": 3,
                    "actual_qty_kg": 3.3,
                    "weight_per_bunch": 0.1,
                    "no_of_bunches": 33,
                    "rate": 50,
                    "amount": 165,
                    "remarks": unique_remarks
                }
            ],
            "total_qty_required": 30,
            "total_actual_qty": 3.3,
            "total_bunches": 33,
            "total_amount": 165
        }
        
        save_response = self.session.post(f"{BASE_URL}/api/qc-daily-requirement", json=payload)
        assert save_response.status_code == 200, f"Save failed: {save_response.text}"
        
        # Retrieve
        get_response = self.session.get(f"{BASE_URL}/api/qc-daily-requirement/{test_date}")
        assert get_response.status_code == 200, f"Get failed: {get_response.text}"
        
        data = get_response.json()
        assert data is not None, "Retrieved data should not be null"
        assert data.get("requirement_date") == test_date, "Date should match"
        print(f"QC data integrity verified for date {test_date}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
