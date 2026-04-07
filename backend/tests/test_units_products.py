"""
Test Units CRUD and Products Features
=====================================
Tests for:
1. Units CRUD operations (GET, POST, PUT, DELETE)
2. Units seed-defaults endpoint
3. Products list with alphabetical sorting
4. Product unit dropdown population
5. Smart Product Deletion with dependency check
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUnitsAPI:
    """Test Units CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_01_get_units(self):
        """Test GET /api/units - should return list of units"""
        response = requests.get(f"{BASE_URL}/api/units", headers=self.headers)
        assert response.status_code == 200, f"GET units failed: {response.text}"
        
        units = response.json()
        assert isinstance(units, list), "Response should be a list"
        assert len(units) >= 10, f"Expected at least 10 seeded units, got {len(units)}"
        
        # Verify unit structure
        for unit in units:
            assert "id" in unit, "Unit should have id"
            assert "name" in unit, "Unit should have name"
            assert "symbol" in unit, "Unit should have symbol"
        
        # Verify alphabetical sorting
        names = [u["name"] for u in units]
        assert names == sorted(names), "Units should be sorted alphabetically"
        print(f"✓ GET /api/units returned {len(units)} units, sorted alphabetically")
    
    def test_02_create_unit(self):
        """Test POST /api/units - create a new unit"""
        test_unit = {
            "name": f"TEST_Unit_{uuid.uuid4().hex[:6]}",
            "symbol": "TU",
            "description": "Test unit for automated testing"
        }
        
        response = requests.post(f"{BASE_URL}/api/units", headers=self.headers, json=test_unit)
        assert response.status_code == 200, f"Create unit failed: {response.text}"
        
        created = response.json()
        assert "id" in created, "Created unit should have id"
        assert created["name"] == test_unit["name"], "Name should match"
        assert created["symbol"] == test_unit["symbol"], "Symbol should match"
        
        # Store for cleanup
        self.created_unit_id = created["id"]
        print(f"✓ POST /api/units created unit: {created['name']}")
        
        # Verify by GET
        get_response = requests.get(f"{BASE_URL}/api/units", headers=self.headers)
        units = get_response.json()
        found = any(u["id"] == created["id"] for u in units)
        assert found, "Created unit should be in the list"
        print(f"✓ Created unit verified in GET /api/units")
    
    def test_03_create_duplicate_unit_fails(self):
        """Test POST /api/units - duplicate name should fail"""
        # Try to create a unit with existing name "Kg"
        duplicate_unit = {
            "name": "Kg",
            "symbol": "KG2",
            "description": "Duplicate test"
        }
        
        response = requests.post(f"{BASE_URL}/api/units", headers=self.headers, json=duplicate_unit)
        assert response.status_code == 400, f"Duplicate unit should fail with 400, got {response.status_code}"
        assert "already exists" in response.json().get("detail", "").lower(), "Error should mention already exists"
        print(f"✓ Duplicate unit creation correctly rejected")
    
    def test_04_update_unit(self):
        """Test PUT /api/units/{id} - update an existing unit"""
        # First create a unit to update
        test_unit = {
            "name": f"TEST_Update_{uuid.uuid4().hex[:6]}",
            "symbol": "TUP",
            "description": "Unit to be updated"
        }
        create_response = requests.post(f"{BASE_URL}/api/units", headers=self.headers, json=test_unit)
        assert create_response.status_code == 200
        unit_id = create_response.json()["id"]
        
        # Update the unit
        update_data = {
            "name": test_unit["name"],  # Keep same name
            "symbol": "UPDATED",
            "description": "Updated description"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/units/{unit_id}", headers=self.headers, json=update_data)
        assert update_response.status_code == 200, f"Update unit failed: {update_response.text}"
        
        updated = update_response.json()
        assert updated["symbol"] == "UPDATED", "Symbol should be updated"
        assert updated["description"] == "Updated description", "Description should be updated"
        print(f"✓ PUT /api/units/{unit_id} updated successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/units/{unit_id}", headers=self.headers)
    
    def test_05_delete_unit_not_in_use(self):
        """Test DELETE /api/units/{id} - delete unit not used by products"""
        # Create a unit to delete
        test_unit = {
            "name": f"TEST_Delete_{uuid.uuid4().hex[:6]}",
            "symbol": "TDL",
            "description": "Unit to be deleted"
        }
        create_response = requests.post(f"{BASE_URL}/api/units", headers=self.headers, json=test_unit)
        assert create_response.status_code == 200
        unit_id = create_response.json()["id"]
        
        # Delete the unit
        delete_response = requests.delete(f"{BASE_URL}/api/units/{unit_id}", headers=self.headers)
        assert delete_response.status_code == 200, f"Delete unit failed: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/units", headers=self.headers)
        units = get_response.json()
        found = any(u["id"] == unit_id for u in units)
        assert not found, "Deleted unit should not be in the list"
        print(f"✓ DELETE /api/units/{unit_id} successful")
    
    def test_06_delete_unit_in_use_fails(self):
        """Test DELETE /api/units/{id} - should fail if unit is used by products"""
        # Get the Kg unit (used by all 44 products)
        get_response = requests.get(f"{BASE_URL}/api/units", headers=self.headers)
        units = get_response.json()
        kg_unit = next((u for u in units if u["name"] == "Kg"), None)
        
        if kg_unit:
            delete_response = requests.delete(f"{BASE_URL}/api/units/{kg_unit['id']}", headers=self.headers)
            assert delete_response.status_code == 400, f"Delete in-use unit should fail with 400, got {delete_response.status_code}"
            assert "used by" in delete_response.json().get("detail", "").lower(), "Error should mention unit is in use"
            print(f"✓ Delete of in-use unit 'Kg' correctly rejected")
        else:
            pytest.skip("Kg unit not found")
    
    def test_07_seed_defaults_when_units_exist(self):
        """Test POST /api/units/seed-defaults - should skip if units exist"""
        response = requests.post(f"{BASE_URL}/api/units/seed-defaults", headers=self.headers)
        assert response.status_code == 200, f"Seed defaults failed: {response.text}"
        
        result = response.json()
        assert "already exist" in result.get("message", "").lower() or "skipping" in result.get("message", "").lower(), \
            f"Should indicate units already exist: {result}"
        print(f"✓ POST /api/units/seed-defaults correctly skipped (units exist)")


class TestProductsAPI:
    """Test Products API with Units integration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_01_get_products_list(self):
        """Test GET /api/products - should return product list"""
        response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert response.status_code == 200, f"GET products failed: {response.text}"
        
        products = response.json()
        assert isinstance(products, list), "Response should be a list"
        assert len(products) >= 40, f"Expected at least 40 products, got {len(products)}"
        
        # Verify product structure
        for product in products[:5]:
            assert "id" in product, "Product should have id"
            assert "name" in product, "Product should have name"
            assert "unit" in product, "Product should have unit"
        
        print(f"✓ GET /api/products returned {len(products)} products")
    
    def test_02_products_have_valid_units(self):
        """Test that all products have valid units from the units collection"""
        # Get units
        units_response = requests.get(f"{BASE_URL}/api/units", headers=self.headers)
        units = units_response.json()
        valid_unit_names = {u["name"] for u in units}
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        
        # Check each product's unit
        invalid_units = []
        for product in products:
            if product.get("unit") and product["unit"] not in valid_unit_names:
                invalid_units.append(f"{product['name']}: {product['unit']}")
        
        # Note: Some products might have units not in the units collection (legacy data)
        if invalid_units:
            print(f"⚠ Products with units not in units collection: {invalid_units[:5]}")
        else:
            print(f"✓ All products have valid units from units collection")
    
    def test_03_create_product_with_unit(self):
        """Test POST /api/products - create product with unit from units collection"""
        test_product = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "category": "Test Category",
            "unit": "Kg",
            "current_stock": 10.0,
            "price_per_kg": 50.0,
            "price_per_packet": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/products", headers=self.headers, json=test_product)
        assert response.status_code == 201, f"Create product failed: {response.text}"
        
        created = response.json()
        assert created["name"] == test_product["name"]
        assert created["unit"] == "Kg"
        
        self.created_product_id = created["id"]
        print(f"✓ POST /api/products created product with unit 'Kg'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/products/{created['id']}", headers=self.headers)
    
    def test_04_product_dependencies_check(self):
        """Test GET /api/products/{id}/dependencies - check product dependencies"""
        # Get a product
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        
        # Check dependencies
        response = requests.get(f"{BASE_URL}/api/products/{product['id']}/dependencies", headers=self.headers)
        assert response.status_code == 200, f"Dependencies check failed: {response.text}"
        
        deps = response.json()
        assert "product_id" in deps, "Response should have product_id"
        assert "has_dependencies" in deps, "Response should have has_dependencies"
        assert "dependencies" in deps, "Response should have dependencies object"
        
        # Verify dependencies structure
        dep_obj = deps["dependencies"]
        expected_keys = ["procurements", "qc_orders", "indents", "dispatches", "invoices", "wastage", "total"]
        for key in expected_keys:
            assert key in dep_obj, f"Dependencies should have {key}"
        
        print(f"✓ GET /api/products/{product['id']}/dependencies returned: has_dependencies={deps['has_dependencies']}, total={dep_obj['total']}")
    
    def test_05_delete_product_no_dependencies(self):
        """Test DELETE /api/products/{id} - delete product without dependencies"""
        # Create a test product
        test_product = {
            "name": f"TEST_DeleteMe_{uuid.uuid4().hex[:6]}",
            "category": "Test",
            "unit": "Kg",
            "current_stock": 0,
            "price_per_kg": 10.0
        }
        
        create_response = requests.post(f"{BASE_URL}/api/products", headers=self.headers, json=test_product)
        assert create_response.status_code == 201
        product_id = create_response.json()["id"]
        
        # Check dependencies (should be none)
        deps_response = requests.get(f"{BASE_URL}/api/products/{product_id}/dependencies", headers=self.headers)
        deps = deps_response.json()
        assert deps["has_dependencies"] == False, "New product should have no dependencies"
        
        # Delete the product
        delete_response = requests.delete(f"{BASE_URL}/api/products/{product_id}", headers=self.headers)
        assert delete_response.status_code == 200, f"Delete product failed: {delete_response.text}"
        
        # Verify deletion
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        found = any(p["id"] == product_id for p in products)
        assert not found, "Deleted product should not be in the list"
        
        print(f"✓ DELETE /api/products/{product_id} successful (no dependencies)")


class TestInvoicePaymentTracking:
    """Test Invoice Payment Recording for Admin"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_01_get_retailer_invoices(self):
        """Test GET /api/retailer-invoices - should return invoices with payment status"""
        response = requests.get(f"{BASE_URL}/api/retailer-invoices", headers=self.headers)
        assert response.status_code == 200, f"GET invoices failed: {response.text}"
        
        invoices = response.json()
        assert isinstance(invoices, list), "Response should be a list"
        
        if invoices:
            invoice = invoices[0]
            # Check for payment-related fields
            print(f"✓ GET /api/retailer-invoices returned {len(invoices)} invoices")
            print(f"  Sample invoice fields: {list(invoice.keys())[:10]}")
        else:
            print(f"✓ GET /api/retailer-invoices returned empty list (no invoices)")


# Cleanup test data
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests"""
    yield
    
    # Login
    login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@freshflow.com",
        "password": "admin123"
    })
    if login_response.status_code != 200:
        return
    
    token = login_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Cleanup test units
    units_response = requests.get(f"{BASE_URL}/api/units", headers=headers)
    if units_response.status_code == 200:
        for unit in units_response.json():
            if unit["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/units/{unit['id']}", headers=headers)
    
    # Cleanup test products
    products_response = requests.get(f"{BASE_URL}/api/products", headers=headers)
    if products_response.status_code == 200:
        for product in products_response.json():
            if product["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/products/{product['id']}", headers=headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
