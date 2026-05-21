"""
Test Payment Details API for Retailer Portal
Tests the new /api/retailer-payment-details endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://harvest-hub-384.preview.emergentagent.com').rstrip('/')

# Test credentials for retailer
RETAILER_EMAIL = "bhaveshdewasi803@gmail.com"
RETAILER_PASSWORD = "admin123"


class TestPaymentDetailsAPI:
    """Test the Payment Details API endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as retailer and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as retailer
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": RETAILER_EMAIL,
            "password": RETAILER_PASSWORD
        })
        
        if login_response.status_code == 200:
            self.token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.retailer_info = login_response.json().get("user")
        else:
            pytest.skip(f"Failed to login as retailer: {login_response.status_code}")
    
    def test_health_check(self):
        """Test health endpoint is working"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("PASS: Health check endpoint working")
    
    def test_retailer_login_success(self):
        """Test retailer can login successfully"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": RETAILER_EMAIL,
            "password": RETAILER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "retailer"
        print(f"PASS: Retailer login successful - {data['user']['name']}")
    
    def test_payment_details_endpoint_exists(self):
        """Test that payment details endpoint exists and returns data"""
        response = self.session.get(f"{BASE_URL}/api/retailer-payment-details")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "dates" in data
        assert "totals" in data
        assert "commission_percentage" in data
        print(f"PASS: Payment details endpoint returns valid structure")
    
    def test_payment_details_totals_structure(self):
        """Test that totals have correct structure"""
        response = self.session.get(f"{BASE_URL}/api/retailer-payment-details")
        assert response.status_code == 200
        data = response.json()
        
        totals = data.get("totals", {})
        assert "upfront_50_total" in totals
        assert "final_payment_total" in totals
        assert "grand_total" in totals
        assert "total_pending" in totals
        
        # Verify grand_total = upfront_50_total + final_payment_total
        expected_grand = totals["upfront_50_total"] + totals["final_payment_total"]
        assert abs(totals["grand_total"] - expected_grand) < 0.01
        print(f"PASS: Totals structure correct - Grand Total: {totals['grand_total']}")
    
    def test_payment_details_date_entry_structure(self):
        """Test that each date entry has correct structure"""
        response = self.session.get(f"{BASE_URL}/api/retailer-payment-details")
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("dates", [])) > 0:
            date_entry = data["dates"][0]
            
            # Check required fields
            assert "date" in date_entry
            assert "upfront_50_total" in date_entry
            assert "final_payment_total" in date_entry
            assert "total_pending" in date_entry
            assert "invoice_count" in date_entry
            assert "invoices" in date_entry
            
            print(f"PASS: Date entry structure correct - Date: {date_entry['date']}")
        else:
            print("SKIP: No payment dates available to test structure")
    
    def test_payment_details_invoice_structure(self):
        """Test that invoice entries have correct structure with items"""
        response = self.session.get(f"{BASE_URL}/api/retailer-payment-details")
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("dates", [])) > 0 and len(data["dates"][0].get("invoices", [])) > 0:
            invoice = data["dates"][0]["invoices"][0]
            
            # Check invoice fields
            assert "invoice_id" in invoice
            assert "invoice_number" in invoice
            assert "gross_value" in invoice
            assert "rejection_amount" in invoice
            assert "net_value" in invoice
            assert "commission_amount" in invoice
            assert "final_payable" in invoice
            assert "paid_amount" in invoice
            assert "pending_amount" in invoice
            assert "items" in invoice
            
            # Verify net_value = gross_value - rejection_amount
            expected_net = invoice["gross_value"] - invoice["rejection_amount"]
            assert abs(invoice["net_value"] - expected_net) < 0.01
            
            print(f"PASS: Invoice structure correct - Invoice: {invoice['invoice_number']}")
        else:
            print("SKIP: No invoices available to test structure")
    
    def test_payment_details_item_structure(self):
        """Test that item entries have correct structure for modal display"""
        response = self.session.get(f"{BASE_URL}/api/retailer-payment-details")
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("dates", [])) > 0:
            for date_entry in data["dates"]:
                for invoice in date_entry.get("invoices", []):
                    if len(invoice.get("items", [])) > 0:
                        item = invoice["items"][0]
                        
                        # Check item fields for modal display
                        assert "product_name" in item
                        assert "supplied_qty" in item or "quantity" in item
                        assert "mrp" in item
                        
                        print(f"PASS: Item structure correct - Product: {item['product_name']}")
                        return
        
        print("SKIP: No items available to test structure")
    
    def test_payment_details_with_date_filter(self):
        """Test date filtering works correctly"""
        # Test with date range
        response = self.session.get(
            f"{BASE_URL}/api/retailer-payment-details",
            params={"start_date": "2026-05-01", "end_date": "2026-05-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all dates are within range
        for date_entry in data.get("dates", []):
            date_str = date_entry["date"]
            assert date_str >= "2026-05-01"
            assert date_str <= "2026-05-31"
        
        print(f"PASS: Date filter working - {len(data.get('dates', []))} dates in range")
    
    def test_payment_details_empty_date_filter(self):
        """Test with date range that has no data"""
        response = self.session.get(
            f"{BASE_URL}/api/retailer-payment-details",
            params={"start_date": "2020-01-01", "end_date": "2020-01-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return empty dates array
        assert data.get("dates") == []
        assert data["totals"]["grand_total"] == 0
        
        print("PASS: Empty date filter returns empty results correctly")
    
    def test_payment_details_non_retailer_access(self):
        """Test that non-retailer users cannot access this endpoint"""
        # Login as admin
        admin_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@freshflow.com",
            "password": "admin123"
        })
        
        if admin_response.status_code == 200:
            admin_token = admin_response.json().get("token")
            
            # Try to access payment details as admin
            response = self.session.get(
                f"{BASE_URL}/api/retailer-payment-details",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            # Should return 403 Forbidden
            assert response.status_code == 403
            print("PASS: Non-retailer access correctly blocked")
        else:
            print("SKIP: Could not login as admin to test access control")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
