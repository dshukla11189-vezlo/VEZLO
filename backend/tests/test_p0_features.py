"""
Test P0 Features for FreshFlow:
1. Retailer Invoice with Rejection Details
2. Procurement Previous Day Auto-populate
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"
RETAILER_ID = "8422de6a-9b10-4c67-a072-eb0411f57c91"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestProcurementPreviousDay:
    """Test Procurement Previous Day API - P0 Feature"""
    
    def test_previous_day_endpoint_exists(self, api_client):
        """Test that /api/procurement/previous-day endpoint exists and returns 200"""
        response = api_client.get(f"{BASE_URL}/api/procurement/previous-day")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"Previous day endpoint returned: {response.json()}")
    
    def test_previous_day_returns_list(self, api_client):
        """Test that previous-day returns a list"""
        response = api_client.get(f"{BASE_URL}/api/procurement/previous-day")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Previous day procurements count: {len(data)}")
    
    def test_previous_day_data_structure(self, api_client):
        """Test that previous-day data has correct structure"""
        response = api_client.get(f"{BASE_URL}/api/procurement/previous-day")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            item = data[0]
            # Check required fields
            assert "farmer_id" in item, "Missing farmer_id"
            assert "farmer_name" in item, "Missing farmer_name"
            assert "products" in item, "Missing products"
            assert "total_amount" in item, "Missing total_amount"
            assert "date" in item, "Missing date"
            print(f"First item structure: {item.keys()}")
            print(f"Farmer: {item.get('farmer_name')}, Products: {len(item.get('products', []))}")
        else:
            print("No previous day procurements found (expected if no data from yesterday)")


class TestRetailerInvoiceWithRejections:
    """Test Retailer Invoice API with Rejection Details - P0 Feature"""
    
    def test_get_retailer_rejections(self, api_client):
        """Test that rejections can be fetched for a retailer"""
        response = api_client.get(f"{BASE_URL}/api/retailer-rejections?retailer_id={RETAILER_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Rejections count for retailer: {len(data)}")
        if len(data) > 0:
            print(f"First rejection: {data[0]}")
    
    def test_get_uninvoiced_dispatches(self, api_client):
        """Test that uninvoiced dispatches can be fetched"""
        response = api_client.get(f"{BASE_URL}/api/retailer-dispatches/uninvoiced?retailer_id={RETAILER_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Uninvoiced dispatches count: {len(data)}")
    
    def test_get_retailer_invoices(self, api_client):
        """Test that invoices can be fetched"""
        response = api_client.get(f"{BASE_URL}/api/retailer-invoices?retailer_id={RETAILER_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Invoices count: {len(data)}")
        
        if len(data) > 0:
            invoice = data[0]
            # Check invoice structure
            assert "invoice_number" in invoice, "Missing invoice_number"
            assert "items" in invoice, "Missing items"
            assert "total_mrp_value" in invoice, "Missing total_mrp_value"
            assert "net_payable" in invoice, "Missing net_payable"
            print(f"Invoice: {invoice.get('invoice_number')}, Items: {len(invoice.get('items', []))}")
            
            # Check if items have rejection fields
            if len(invoice.get("items", [])) > 0:
                item = invoice["items"][0]
                print(f"Invoice item fields: {item.keys()}")
                # Check for rejection-related fields
                has_rejected_qty = "rejected_qty" in item
                has_supplied_qty = "supplied_qty" in item
                print(f"Has rejected_qty: {has_rejected_qty}, Has supplied_qty: {has_supplied_qty}")


class TestRetailerDispatchesAPI:
    """Test Retailer Dispatches API"""
    
    def test_get_dispatches(self, api_client):
        """Test that dispatches can be fetched"""
        response = api_client.get(f"{BASE_URL}/api/retailer-dispatches?retailer_id={RETAILER_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Dispatches count: {len(data)}")
        
        if len(data) > 0:
            dispatch = data[0]
            print(f"Dispatch date: {dispatch.get('dispatch_date')}")
            print(f"Items: {len(dispatch.get('items', []))}")


class TestProcurementAPI:
    """Test Procurement API"""
    
    def test_get_procurements(self, api_client):
        """Test that procurements can be fetched"""
        response = api_client.get(f"{BASE_URL}/api/procurement")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Procurements count: {len(data)}")
        
        if len(data) > 0:
            proc = data[0]
            print(f"Procurement date: {proc.get('date')}")
            print(f"Farmer: {proc.get('farmer_name')}")
            print(f"Products: {len(proc.get('products', []))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
