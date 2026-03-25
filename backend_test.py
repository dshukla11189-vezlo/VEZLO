import requests
import sys
import json
from datetime import datetime, timezone
import io

class FreshFlowAPITester:
    def __init__(self, base_url="https://harvest-hub-384.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.retailer_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.created_product_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        default_headers = {'Content-Type': 'application/json'}
        
        if headers:
            default_headers.update(headers)
        
        # Remove Content-Type for file uploads
        if files:
            default_headers.pop('Content-Type', None)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=default_headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, headers=default_headers)
                else:
                    response = requests.post(url, json=data, headers=default_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=default_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=default_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.json()}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_admin_login(self):
        """Test admin login and get token"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@freshflow.com", "password": "admin123"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_retailer_login(self):
        """Test retailer login and get token"""
        success, response = self.run_test(
            "Retailer Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "retailer@test.com", "password": "retailer123"}
        )
        if success and 'token' in response:
            self.retailer_token = response['token']
            print(f"   Retailer token obtained: {self.retailer_token[:20]}...")
            return True
        return False

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        success, _ = self.run_test(
            "Invalid Login",
            "POST",
            "api/auth/login",
            401,
            data={"email": "invalid@test.com", "password": "wrongpass"}
        )
        return success

    def test_get_admin_profile(self):
        """Test getting admin profile"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        success, response = self.run_test(
            "Get Admin Profile",
            "GET",
            "api/auth/me",
            200,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        if success and response.get('role') == 'admin':
            print(f"   Admin profile: {response.get('name')} ({response.get('email')})")
            return True
        return False

    def test_get_products(self):
        """Test getting products list"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        success, response = self.run_test(
            "Get Products",
            "GET",
            "api/products",
            200,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        if success:
            print(f"   Found {len(response)} products")
            return True
        return False

    def test_create_product(self):
        """Test creating a new product"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        product_data = {
            "name": "Test Tomato",
            "category": "Vegetables",
            "unit": "Kg",
            "current_stock": 100.0,
            "price_per_kg": 50.0,
            "price_per_packet": 25.0
        }
        
        success, response = self.run_test(
            "Create Product",
            "POST",
            "api/products",
            200,  # Backend returns 200 instead of 201
            data=product_data,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        if success and 'id' in response:
            self.created_product_id = response['id']
            print(f"   Created product ID: {self.created_product_id}")
            return True
        return False

    def test_update_product(self):
        """Test updating a product"""
        if not self.admin_token or not self.created_product_id:
            print("❌ No admin token or product ID available")
            return False
            
        update_data = {
            "price_per_kg": 55.0,
            "current_stock": 150.0
        }
        
        success, response = self.run_test(
            "Update Product",
            "PUT",
            f"api/products/{self.created_product_id}",
            200,
            data=update_data,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        if success and response.get('price_per_kg') == 55.0:
            print(f"   Updated product price to ₹{response.get('price_per_kg')}")
            return True
        return False

    def test_retailer_access_products(self):
        """Test retailer can access products"""
        if not self.retailer_token:
            print("❌ No retailer token available")
            return False
            
        success, response = self.run_test(
            "Retailer Access Products",
            "GET",
            "api/products",
            200,
            headers={"Authorization": f"Bearer {self.retailer_token}"}
        )
        if success:
            print(f"   Retailer can view {len(response)} products")
            return True
        return False

    def test_retailer_cannot_create_product(self):
        """Test retailer cannot create products"""
        if not self.retailer_token:
            print("❌ No retailer token available")
            return False
            
        product_data = {
            "name": "Unauthorized Product",
            "category": "Test",
            "unit": "Kg",
            "current_stock": 10.0
        }
        
        success, _ = self.run_test(
            "Retailer Cannot Create Product",
            "POST",
            "api/products",
            403,
            data=product_data,
            headers={"Authorization": f"Bearer {self.retailer_token}"}
        )
        return success

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        success, response = self.run_test(
            "Dashboard Statistics",
            "GET",
            "api/reports/dashboard",
            200,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        if success:
            stats = ['total_products', 'total_stock_value', 'today_qc_orders', 'today_retailer_orders', 'pending_payments', 'today_wastage']
            missing_stats = [stat for stat in stats if stat not in response]
            if not missing_stats:
                print(f"   All dashboard stats present: {list(response.keys())}")
                return True
            else:
                print(f"   Missing stats: {missing_stats}")
        return False

    def test_ocr_endpoint(self):
        """Test OCR endpoint with a dummy image"""
        if not self.admin_token:
            print("❌ No admin token available")
            return False
            
        # Create a dummy image file
        dummy_image = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\nIDATx\x9cc\xf8\x00\x00\x00\x01\x00\x01\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test.png', io.BytesIO(dummy_image), 'image/png')}
        
        success, response = self.run_test(
            "OCR Upload Endpoint",
            "POST",
            "api/qc-orders/ocr",
            200,  # Expecting success even if OCR fails
            files=files,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        return success

    def test_unauthorized_access(self):
        """Test accessing protected endpoints without token"""
        success, _ = self.run_test(
            "Unauthorized Access",
            "GET",
            "api/products",
            401
        )
        return success

    def cleanup_test_data(self):
        """Clean up test data"""
        if self.admin_token and self.created_product_id:
            print(f"\n🧹 Cleaning up test product: {self.created_product_id}")
            success, _ = self.run_test(
                "Delete Test Product",
                "DELETE",
                f"api/products/{self.created_product_id}",
                200,
                headers={"Authorization": f"Bearer {self.admin_token}"}
            )
            if success:
                print("   Test product deleted successfully")

def main():
    print("🚀 Starting FreshFlow API Testing...")
    print("=" * 50)
    
    tester = FreshFlowAPITester()
    
    # Authentication Tests
    print("\n📋 AUTHENTICATION TESTS")
    print("-" * 30)
    if not tester.test_admin_login():
        print("❌ Admin login failed, stopping tests")
        return 1
    
    if not tester.test_retailer_login():
        print("❌ Retailer login failed, stopping tests")
        return 1
    
    tester.test_invalid_login()
    tester.test_get_admin_profile()
    tester.test_unauthorized_access()
    
    # Product Management Tests
    print("\n📦 PRODUCT MANAGEMENT TESTS")
    print("-" * 30)
    tester.test_get_products()
    tester.test_create_product()
    tester.test_update_product()
    
    # Role-based Access Tests
    print("\n🔐 ROLE-BASED ACCESS TESTS")
    print("-" * 30)
    tester.test_retailer_access_products()
    tester.test_retailer_cannot_create_product()
    
    # Dashboard & Analytics Tests
    print("\n📊 DASHBOARD & ANALYTICS TESTS")
    print("-" * 30)
    tester.test_dashboard_stats()
    
    # OCR Tests
    print("\n🖼️ OCR FUNCTIONALITY TESTS")
    print("-" * 30)
    tester.test_ocr_endpoint()
    
    # Cleanup
    tester.cleanup_test_data()
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 FINAL RESULTS: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())