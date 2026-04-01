"""
Test Retailer Inventory Features:
1. Add single inventory item manually (POST /api/retailer-inventory/add-item)
2. Save all inventory items at once (POST /api/retailer-inventory/save-all)
3. Edit inventory items (PUT /api/retailer-inventory/{item_id})
4. Delete inventory items (DELETE /api/retailer-inventory/{item_id})
5. Closing qty auto-calculation: Opening + Received - Sold - Wastage
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
RETAILER_EMAIL = "tamannamart08@gmail.com"
RETAILER_PASSWORD = "admin123"
RETAILER_ID = "a400f104-b0da-475e-af07-dd6d0d8776e9"  # From previous test report

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for retailer"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": RETAILER_EMAIL,
        "password": RETAILER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }

@pytest.fixture(scope="module")
def products(auth_headers):
    """Get list of products"""
    response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
    if response.status_code == 200:
        return response.json()
    return []


class TestRetailerLogin:
    """Test retailer authentication"""
    
    def test_retailer_login_success(self):
        """Test retailer can login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": RETAILER_EMAIL,
            "password": RETAILER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == RETAILER_EMAIL
        assert data["user"]["role"] == "retailer"
        print(f"PASS: Retailer login successful for {RETAILER_EMAIL}")


class TestAddInventoryItem:
    """Test adding single inventory item manually"""
    
    def test_add_inventory_item_success(self, auth_headers, products):
        """Test adding a new inventory item"""
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        test_date = "2026-04-01"
        unique_variant = f"TEST_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "retailer_id": RETAILER_ID,
            "product_id": product["id"],
            "product_name": product["name"],
            "variant_name": unique_variant,
            "date": test_date,
            "opening_qty": 10,
            "received_qty": 5
        }
        
        response = requests.post(
            f"{BASE_URL}/api/retailer-inventory/add-item",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Add item failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert "item" in data
        assert data["item"]["product_name"] == product["name"]
        assert data["item"]["opening_qty"] == 10
        assert data["item"]["received_qty"] == 5
        # Closing qty should be opening + received = 15
        assert data["item"]["closing_qty"] == 15
        print(f"PASS: Added inventory item for {product['name']} with closing_qty=15")
        
        # Store item ID for cleanup
        return data["item"]["id"]
    
    def test_add_duplicate_item_fails(self, auth_headers, products):
        """Test that adding duplicate item fails"""
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        test_date = "2026-04-01"
        
        # First, try to add an item that might already exist
        payload = {
            "retailer_id": RETAILER_ID,
            "product_id": product["id"],
            "product_name": product["name"],
            "variant_name": "",  # No variant
            "date": test_date,
            "opening_qty": 5,
            "received_qty": 3
        }
        
        # First request might succeed or fail depending on existing data
        response1 = requests.post(
            f"{BASE_URL}/api/retailer-inventory/add-item",
            json=payload,
            headers=auth_headers
        )
        
        # Second request should fail with duplicate error
        response2 = requests.post(
            f"{BASE_URL}/api/retailer-inventory/add-item",
            json=payload,
            headers=auth_headers
        )
        
        # Either first succeeded and second fails, or both fail (item already exists)
        if response1.status_code == 200:
            assert response2.status_code == 400, "Duplicate item should fail"
            assert "already exists" in response2.json().get("detail", "").lower()
            print("PASS: Duplicate item correctly rejected")
        else:
            # Item already existed
            assert response1.status_code == 400
            print("PASS: Item already exists, duplicate prevention working")
    
    def test_add_item_missing_fields(self, auth_headers):
        """Test that missing required fields returns error"""
        payload = {
            "retailer_id": RETAILER_ID,
            # Missing product_id and date
            "opening_qty": 10
        }
        
        response = requests.post(
            f"{BASE_URL}/api/retailer-inventory/add-item",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Should fail with missing fields: {response.text}"
        print("PASS: Missing fields correctly rejected")


class TestSaveAllInventory:
    """Test bulk save inventory items"""
    
    def test_save_all_inventory_success(self, auth_headers):
        """Test saving multiple inventory items at once"""
        # First, get existing inventory items
        response = requests.get(
            f"{BASE_URL}/api/retailer-inventory/{RETAILER_ID}?date=2026-04-01",
            headers=auth_headers
        )
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No inventory items to test save-all")
        
        items = response.json()
        if len(items) == 0:
            pytest.skip("No inventory items available")
        
        # Prepare updates for first 2 items
        updates = []
        for item in items[:2]:
            updates.append({
                "id": item["id"],
                "sold_qty": 2,
                "wastage_qty": 1,
                "remarks": "TEST_bulk_save"
            })
        
        response = requests.post(
            f"{BASE_URL}/api/retailer-inventory/save-all",
            json={"items": updates},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Save all failed: {response.text}"
        data = response.json()
        assert "updated" in data
        assert data["updated"] >= 1
        print(f"PASS: Bulk saved {data['updated']} items")
    
    def test_save_all_empty_list(self, auth_headers):
        """Test save-all with empty list returns gracefully"""
        response = requests.post(
            f"{BASE_URL}/api/retailer-inventory/save-all",
            json={"items": []},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["updated"] == 0
        print("PASS: Empty save-all handled gracefully")


class TestEditInventoryItem:
    """Test editing inventory items"""
    
    def test_edit_inventory_item(self, auth_headers):
        """Test editing sold/wastage values"""
        # Get existing inventory
        response = requests.get(
            f"{BASE_URL}/api/retailer-inventory/{RETAILER_ID}?date=2026-04-01",
            headers=auth_headers
        )
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No inventory items to test edit")
        
        items = response.json()
        item = items[0]
        item_id = item["id"]
        
        # Update sold and wastage
        payload = {
            "sold_qty": 5,
            "wastage_qty": 2,
            "remarks": "TEST_edit"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/retailer-inventory/{item_id}",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Edit failed: {response.text}"
        print(f"PASS: Edited inventory item {item_id}")
        
        # Verify the update
        response = requests.get(
            f"{BASE_URL}/api/retailer-inventory/{RETAILER_ID}?date=2026-04-01",
            headers=auth_headers
        )
        updated_items = response.json()
        updated_item = next((i for i in updated_items if i["id"] == item_id), None)
        
        if updated_item:
            assert updated_item["sold_qty"] == 5
            assert updated_item["wastage_qty"] == 2
            # Verify closing qty calculation
            expected_closing = updated_item["opening_qty"] + updated_item["received_qty"] - 5 - 2
            assert updated_item["closing_qty"] == expected_closing
            print(f"PASS: Closing qty correctly calculated as {expected_closing}")


class TestDeleteInventoryItem:
    """Test deleting inventory items"""
    
    def test_delete_inventory_item(self, auth_headers, products):
        """Test deleting an inventory item"""
        if not products:
            pytest.skip("No products available")
        
        # First create a test item to delete
        product = products[0]
        unique_variant = f"DELETE_TEST_{uuid.uuid4().hex[:8]}"
        
        create_payload = {
            "retailer_id": RETAILER_ID,
            "product_id": product["id"],
            "product_name": product["name"],
            "variant_name": unique_variant,
            "date": "2026-04-01",
            "opening_qty": 1,
            "received_qty": 1
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/retailer-inventory/add-item",
            json=create_payload,
            headers=auth_headers
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create test item for deletion")
        
        item_id = create_response.json()["item"]["id"]
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/retailer-inventory/{item_id}",
            headers=auth_headers
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"PASS: Deleted inventory item {item_id}")
        
        # Verify it's gone
        get_response = requests.get(
            f"{BASE_URL}/api/retailer-inventory/{RETAILER_ID}?date=2026-04-01",
            headers=auth_headers
        )
        items = get_response.json()
        deleted_item = next((i for i in items if i["id"] == item_id), None)
        assert deleted_item is None, "Item should be deleted"
        print("PASS: Item confirmed deleted")


class TestClosingQtyCalculation:
    """Test closing qty auto-calculation"""
    
    def test_closing_qty_formula(self, auth_headers, products):
        """Test: Closing = Opening + Received - Sold - Wastage"""
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        unique_variant = f"CALC_TEST_{uuid.uuid4().hex[:8]}"
        
        # Create item with known values
        opening = 10
        received = 5
        
        create_payload = {
            "retailer_id": RETAILER_ID,
            "product_id": product["id"],
            "product_name": product["name"],
            "variant_name": unique_variant,
            "date": "2026-04-01",
            "opening_qty": opening,
            "received_qty": received
        }
        
        response = requests.post(
            f"{BASE_URL}/api/retailer-inventory/add-item",
            json=create_payload,
            headers=auth_headers
        )
        
        if response.status_code != 200:
            pytest.skip("Could not create test item")
        
        item = response.json()["item"]
        item_id = item["id"]
        
        # Initial closing should be opening + received = 15
        assert item["closing_qty"] == 15, f"Initial closing should be 15, got {item['closing_qty']}"
        print(f"PASS: Initial closing = {opening} + {received} = 15")
        
        # Update with sold and wastage
        sold = 3
        wastage = 2
        
        update_response = requests.put(
            f"{BASE_URL}/api/retailer-inventory/{item_id}",
            json={"sold_qty": sold, "wastage_qty": wastage},
            headers=auth_headers
        )
        
        assert update_response.status_code == 200
        
        # Verify closing calculation
        get_response = requests.get(
            f"{BASE_URL}/api/retailer-inventory/{RETAILER_ID}?date=2026-04-01",
            headers=auth_headers
        )
        items = get_response.json()
        updated_item = next((i for i in items if i["id"] == item_id), None)
        
        expected_closing = opening + received - sold - wastage  # 10 + 5 - 3 - 2 = 10
        assert updated_item["closing_qty"] == expected_closing
        print(f"PASS: Closing = {opening} + {received} - {sold} - {wastage} = {expected_closing}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/retailer-inventory/{item_id}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
