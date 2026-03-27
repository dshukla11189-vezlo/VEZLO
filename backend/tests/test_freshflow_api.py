"""
FreshFlow API Tests - Comprehensive testing for P&L Dashboard, Expenses, Stock Status, and Navigation
Tests: Login, P&L Report, Variable Expenses CRUD, Fixed Expenses CRUD, Stock Status, Quick Commerce, Procurement
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://harvest-hub-384.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"


class TestAuth:
    """Authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful - User: {data['user']['name']}")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Authentication failed")


@pytest.fixture
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestPnLDashboard:
    """P&L Dashboard API tests"""
    
    def test_pnl_report_loads(self, auth_headers):
        """Test P&L report endpoint returns data"""
        today = datetime.now().strftime('%Y-%m-%d')
        first_of_month = datetime.now().replace(day=1).strftime('%Y-%m-%d')
        
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date={first_of_month}&to_date={today}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"P&L report failed: {response.text}"
        data = response.json()
        
        # Verify summary structure
        assert "summary" in data, "Summary not in response"
        summary = data["summary"]
        
        # Check all required summary fields
        required_fields = [
            "total_sales", "total_purchase", "total_wastage_value",
            "gross_profit", "gross_margin", "total_variable_expenses",
            "net_profit", "net_margin"
        ]
        for field in required_fields:
            assert field in summary, f"Missing field: {field}"
        
        print(f"✓ P&L Summary loaded - Sales: ₹{summary['total_sales']}, Gross Profit: ₹{summary['gross_profit']}")
        
        # Verify daily_pnl structure
        assert "daily_pnl" in data, "daily_pnl not in response"
        if len(data["daily_pnl"]) > 0:
            day = data["daily_pnl"][0]
            daily_fields = ["date", "sales", "sales_qty", "purchase", "wastage", "gross_profit", "gross_margin"]
            for field in daily_fields:
                assert field in day, f"Missing daily field: {field}"
            
            # Check for products breakdown with customer info
            if "products" in day and len(day["products"]) > 0:
                prod = day["products"][0]
                assert "customers" in prod, "CUSTOMER column missing in product breakdown"
                print(f"✓ Daily breakdown has CUSTOMER column in product details")
        
        print(f"✓ P&L report structure validated - {len(data['daily_pnl'])} days of data")
    
    def test_pnl_daily_breakdown_columns(self, auth_headers):
        """Verify daily breakdown has correct columns (no NET P/L in daily table)"""
        today = datetime.now().strftime('%Y-%m-%d')
        first_of_month = datetime.now().replace(day=1).strftime('%Y-%m-%d')
        
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date={first_of_month}&to_date={today}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["daily_pnl"]) > 0:
            day = data["daily_pnl"][0]
            # Required columns for daily breakdown
            required_cols = ["date", "sales", "sales_qty", "purchase", "wastage", "gross_profit", "gross_margin", "profit_per_unit"]
            for col in required_cols:
                assert col in day, f"Missing column: {col}"
            print(f"✓ Daily breakdown has all required columns: DATE, SALES, QTY, PURCHASE, WASTAGE, GROSS P/L, MARGIN %, ₹/UNIT")


class TestStockStatus:
    """Stock Status API tests"""
    
    def test_stock_status_today_loads(self, auth_headers):
        """Test stock status today endpoint"""
        response = requests.get(f"{BASE_URL}/api/stock-status/today", headers=auth_headers)
        assert response.status_code == 200, f"Stock status failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Stock status should return a list"
        print(f"✓ Stock status loaded - {len(data)} products")
        
        if len(data) > 0:
            item = data[0]
            required_fields = ["product_id", "product_name", "opening_qty", "purchase_qty", "dispatch_qty", "status"]
            for field in required_fields:
                assert field in item, f"Missing field: {field}"
            print(f"✓ Stock status structure validated")
    
    def test_stock_status_history(self, auth_headers):
        """Test stock status history endpoint"""
        today = datetime.now().strftime('%Y-%m-%d')
        response = requests.get(
            f"{BASE_URL}/api/stock-status/history?from_date={today}&to_date={today}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Stock history failed: {response.text}"
        print("✓ Stock status history endpoint works")


class TestVariableExpenses:
    """Variable Expenses CRUD tests"""
    
    def test_get_variable_expenses(self, auth_headers):
        """Test getting variable expenses list"""
        response = requests.get(f"{BASE_URL}/api/expenses/variable", headers=auth_headers)
        assert response.status_code == 200, f"Get expenses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✓ Variable expenses loaded - {len(data)} entries")
    
    def test_create_variable_expense(self, auth_headers):
        """Test creating a variable expense"""
        expense_data = {
            "date": datetime.now().strftime('%Y-%m-%d'),
            "category": "Transportation",
            "description": "TEST_Delivery fuel cost",
            "amount": 500,
            "paid_to": "Test Vendor",
            "payment_mode": "Cash",
            "paid_by": "Company",
            "is_settled": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/expenses/variable",
            headers=auth_headers,
            json=expense_data
        )
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        data = response.json()
        assert "id" in data, "ID not returned"
        print(f"✓ Variable expense created - ID: {data['id']}")
        return data["id"]
    
    def test_update_variable_expense(self, auth_headers):
        """Test updating a variable expense"""
        # First create an expense
        expense_data = {
            "date": datetime.now().strftime('%Y-%m-%d'),
            "category": "Packaging",
            "description": "TEST_Update test expense",
            "amount": 300,
            "paid_by": "Company",
            "is_settled": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/expenses/variable",
            headers=auth_headers,
            json=expense_data
        )
        assert create_response.status_code == 200
        expense_id = create_response.json()["id"]
        
        # Update the expense
        update_data = {"amount": 350, "description": "TEST_Updated description"}
        update_response = requests.put(
            f"{BASE_URL}/api/expenses/variable/{expense_id}",
            headers=auth_headers,
            json=update_data
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        print(f"✓ Variable expense updated - ID: {expense_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/expenses/variable/{expense_id}", headers=auth_headers)
    
    def test_delete_variable_expense(self, auth_headers):
        """Test deleting a variable expense"""
        # First create an expense
        expense_data = {
            "date": datetime.now().strftime('%Y-%m-%d'),
            "category": "Labor",
            "description": "TEST_Delete test expense",
            "amount": 200,
            "paid_by": "Company",
            "is_settled": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/expenses/variable",
            headers=auth_headers,
            json=expense_data
        )
        assert create_response.status_code == 200
        expense_id = create_response.json()["id"]
        
        # Delete the expense
        delete_response = requests.delete(
            f"{BASE_URL}/api/expenses/variable/{expense_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Variable expense deleted - ID: {expense_id}")


class TestFixedExpenses:
    """Fixed Expenses CRUD tests"""
    
    def test_get_fixed_expenses(self, auth_headers):
        """Test getting fixed expenses list"""
        current_month = datetime.now().month - 1  # 0-indexed
        current_year = datetime.now().year
        
        response = requests.get(
            f"{BASE_URL}/api/expenses/fixed?month={current_month}&year={current_year}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Get fixed expenses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✓ Fixed expenses loaded - {len(data)} entries for month {current_month + 1}/{current_year}")
    
    def test_create_fixed_expense(self, auth_headers):
        """Test creating a fixed expense"""
        current_month = datetime.now().month - 1  # 0-indexed
        current_year = datetime.now().year
        
        expense_data = {
            "month": current_month,
            "year": current_year,
            "category": "Rent",
            "description": "TEST_Warehouse rent",
            "amount": 15000,
            "due_date": 5,
            "status": "Pending",
            "is_recurring": True,
            "paid_by": "Company",
            "is_settled": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/expenses/fixed",
            headers=auth_headers,
            json=expense_data
        )
        assert response.status_code == 200, f"Create fixed expense failed: {response.text}"
        data = response.json()
        assert "id" in data, "ID not returned"
        print(f"✓ Fixed expense created - ID: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/expenses/fixed/{data['id']}", headers=auth_headers)
    
    def test_update_fixed_expense(self, auth_headers):
        """Test updating a fixed expense"""
        current_month = datetime.now().month - 1
        current_year = datetime.now().year
        
        # Create expense
        expense_data = {
            "month": current_month,
            "year": current_year,
            "category": "Utilities",
            "description": "TEST_Electricity bill",
            "amount": 5000,
            "due_date": 10,
            "status": "Pending",
            "is_recurring": True,
            "paid_by": "Company",
            "is_settled": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/expenses/fixed",
            headers=auth_headers,
            json=expense_data
        )
        assert create_response.status_code == 200
        expense_id = create_response.json()["id"]
        
        # Update
        update_data = {"amount": 5500, "status": "Paid"}
        update_response = requests.put(
            f"{BASE_URL}/api/expenses/fixed/{expense_id}",
            headers=auth_headers,
            json=update_data
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        print(f"✓ Fixed expense updated - ID: {expense_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/expenses/fixed/{expense_id}", headers=auth_headers)
    
    def test_delete_fixed_expense(self, auth_headers):
        """Test deleting a fixed expense"""
        current_month = datetime.now().month - 1
        current_year = datetime.now().year
        
        # Create expense
        expense_data = {
            "month": current_month,
            "year": current_year,
            "category": "Insurance",
            "description": "TEST_Vehicle insurance",
            "amount": 8000,
            "due_date": 15,
            "status": "Pending",
            "is_recurring": False,
            "paid_by": "Company",
            "is_settled": True
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/expenses/fixed",
            headers=auth_headers,
            json=expense_data
        )
        assert create_response.status_code == 200
        expense_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(
            f"{BASE_URL}/api/expenses/fixed/{expense_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ Fixed expense deleted - ID: {expense_id}")


class TestQuickCommerce:
    """Quick Commerce module tests"""
    
    def test_get_qc_indents(self, auth_headers):
        """Test getting QC indents"""
        response = requests.get(f"{BASE_URL}/api/qc-indents", headers=auth_headers)
        assert response.status_code == 200, f"Get indents failed: {response.text}"
        print(f"✓ QC Indents loaded - {len(response.json())} entries")
    
    def test_get_qc_dispatches(self, auth_headers):
        """Test getting QC dispatches"""
        response = requests.get(f"{BASE_URL}/api/qc-dispatches", headers=auth_headers)
        assert response.status_code == 200, f"Get dispatches failed: {response.text}"
        print(f"✓ QC Dispatches loaded - {len(response.json())} entries")
    
    def test_get_qc_invoices(self, auth_headers):
        """Test getting QC invoices"""
        response = requests.get(f"{BASE_URL}/api/qc-invoices", headers=auth_headers)
        assert response.status_code == 200, f"Get invoices failed: {response.text}"
        print(f"✓ QC Invoices loaded - {len(response.json())} entries")
    
    def test_get_qc_grns(self, auth_headers):
        """Test getting QC GRNs"""
        response = requests.get(f"{BASE_URL}/api/qc-grns", headers=auth_headers)
        assert response.status_code == 200, f"Get GRNs failed: {response.text}"
        print(f"✓ QC GRNs loaded - {len(response.json())} entries")
    
    def test_get_qc_customers(self, auth_headers):
        """Test getting QC customers"""
        response = requests.get(f"{BASE_URL}/api/qc-customers", headers=auth_headers)
        assert response.status_code == 200, f"Get customers failed: {response.text}"
        print(f"✓ QC Customers loaded - {len(response.json())} entries")


class TestProcurement:
    """Procurement module tests"""
    
    def test_get_farmers(self, auth_headers):
        """Test getting farmers list"""
        response = requests.get(f"{BASE_URL}/api/farmers", headers=auth_headers)
        assert response.status_code == 200, f"Get farmers failed: {response.text}"
        print(f"✓ Farmers loaded - {len(response.json())} entries")
    
    def test_get_procurements(self, auth_headers):
        """Test getting procurements list"""
        response = requests.get(f"{BASE_URL}/api/procurement", headers=auth_headers)
        assert response.status_code == 200, f"Get procurements failed: {response.text}"
        print(f"✓ Procurements loaded - {len(response.json())} entries")
    
    def test_get_products(self, auth_headers):
        """Test getting products list"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200, f"Get products failed: {response.text}"
        print(f"✓ Products loaded - {len(response.json())} entries")


class TestDashboardStats:
    """Dashboard statistics tests"""
    
    def test_dashboard_stats(self, auth_headers):
        """Test dashboard stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        required_fields = ["total_products", "total_stock_value", "today_qc_orders", "pending_payments"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Dashboard stats loaded - Products: {data['total_products']}, Stock Value: ₹{data['total_stock_value']}")


class TestWastageDashboard:
    """Wastage dashboard tests"""
    
    def test_wastage_dashboard(self, auth_headers):
        """Test wastage dashboard endpoint"""
        response = requests.get(f"{BASE_URL}/api/stock-status/wastage-dashboard?days=7", headers=auth_headers)
        assert response.status_code == 200, f"Wastage dashboard failed: {response.text}"
        print("✓ Wastage dashboard loaded")


# Cleanup test data after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data(auth_token):
    """Cleanup TEST_ prefixed data after tests"""
    yield
    
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    
    # Cleanup variable expenses with TEST_ prefix
    try:
        response = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers)
        if response.status_code == 200:
            for exp in response.json():
                if exp.get("description", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/expenses/variable/{exp['id']}", headers=headers)
    except:
        pass
    
    # Cleanup fixed expenses with TEST_ prefix
    try:
        current_month = datetime.now().month - 1
        current_year = datetime.now().year
        response = requests.get(
            f"{BASE_URL}/api/expenses/fixed?month={current_month}&year={current_year}",
            headers=headers
        )
        if response.status_code == 200:
            for exp in response.json():
                if exp.get("description", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/expenses/fixed/{exp['id']}", headers=headers)
    except:
        pass
    
    print("✓ Test data cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
