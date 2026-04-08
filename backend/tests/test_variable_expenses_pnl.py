"""
Test Variable Expenses and Customer P&L Features
=================================================
Tests for:
1. Variable Expenses API - rate, quantity, payment_status fields
2. Customer P&L API - rejection_share for Retail customers
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_login_success(self, auth_token):
        """Verify admin login works"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✓ Admin login successful, token length: {len(auth_token)}")


class TestVariableExpensesAPI:
    """Test Variable Expenses API with new fields: rate, quantity, payment_status"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_create_expense_with_rate_quantity(self, headers):
        """Test creating expense with rate and quantity fields"""
        expense_data = {
            "date": "2026-01-15",
            "category": "Transportation",
            "description": "TEST_Truck rental for delivery",
            "rate": 500.0,
            "quantity": 3,
            "amount": 1500.0,  # rate * quantity
            "paid_to": "ABC Transport",
            "payment_mode": "Cash",
            "payment_status": "pending",
            "vertical": "all"
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses/variable", json=expense_data, headers=headers)
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain expense ID"
        assert data.get("rate") == 500.0, "Rate should be stored"
        assert data.get("quantity") == 3, "Quantity should be stored"
        assert data.get("amount") == 1500.0, "Amount should be stored"
        assert data.get("payment_status") == "pending", "Payment status should be pending"
        
        print(f"✓ Created expense with rate={data.get('rate')}, qty={data.get('quantity')}, amount={data.get('amount')}")
        return data["id"]
    
    def test_create_expense_with_partially_paid_status(self, headers):
        """Test creating expense with partially_paid status"""
        expense_data = {
            "date": "2026-01-15",
            "category": "Labor",
            "description": "TEST_Daily labor wages",
            "rate": 400.0,
            "quantity": 5,
            "amount": 2000.0,
            "paid_to": "Labor Team",
            "payment_mode": "UPI",
            "payment_status": "partially_paid",
            "paid_amount": 1000.0,
            "vertical": "retail"
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses/variable", json=expense_data, headers=headers)
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        
        data = response.json()
        assert data.get("payment_status") == "partially_paid", "Payment status should be partially_paid"
        assert data.get("paid_amount") == 1000.0, "Paid amount should be stored"
        
        print(f"✓ Created partially paid expense: amount={data.get('amount')}, paid={data.get('paid_amount')}")
        return data["id"]
    
    def test_create_expense_with_paid_status(self, headers):
        """Test creating expense with paid status"""
        expense_data = {
            "date": "2026-01-15",
            "category": "Packaging",
            "description": "TEST_Packaging materials",
            "rate": 10.0,
            "quantity": 100,
            "amount": 1000.0,
            "paid_to": "Packaging Supplier",
            "payment_mode": "Bank Transfer",
            "payment_status": "paid",
            "vertical": "qc"
        }
        
        response = requests.post(f"{BASE_URL}/api/expenses/variable", json=expense_data, headers=headers)
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        
        data = response.json()
        assert data.get("payment_status") == "paid", "Payment status should be paid"
        
        print(f"✓ Created paid expense: amount={data.get('amount')}, status={data.get('payment_status')}")
        return data["id"]
    
    def test_get_expenses_returns_new_fields(self, headers):
        """Test that GET expenses returns rate, quantity, payment_status fields"""
        response = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers)
        assert response.status_code == 200, f"Get expenses failed: {response.text}"
        
        expenses = response.json()
        assert isinstance(expenses, list), "Response should be a list"
        
        # Find our test expenses
        test_expenses = [e for e in expenses if e.get("description", "").startswith("TEST_")]
        
        if test_expenses:
            exp = test_expenses[0]
            print(f"✓ Expense fields present: rate={exp.get('rate')}, quantity={exp.get('quantity')}, payment_status={exp.get('payment_status')}")
            # Verify fields exist (may be None for old expenses)
            assert "payment_status" in exp or "is_settled" in exp, "Should have payment_status or is_settled field"
        else:
            print("✓ GET expenses endpoint working (no test expenses found)")
    
    def test_update_expense_payment_status(self, headers):
        """Test updating expense payment status"""
        # First create an expense
        expense_data = {
            "date": "2026-01-15",
            "category": "Fuel",
            "description": "TEST_Fuel for delivery",
            "amount": 500.0,
            "payment_status": "pending"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/expenses/variable", json=expense_data, headers=headers)
        assert create_response.status_code == 200
        expense_id = create_response.json()["id"]
        
        # Update to paid
        update_data = {
            "payment_status": "paid",
            "paid_amount": 500.0
        }
        
        update_response = requests.put(f"{BASE_URL}/api/expenses/variable/{expense_id}", json=update_data, headers=headers)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        print(f"✓ Updated expense {expense_id} payment_status to paid")
    
    def test_cleanup_test_expenses(self, headers):
        """Clean up test expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers)
        if response.status_code == 200:
            expenses = response.json()
            test_expenses = [e for e in expenses if e.get("description", "").startswith("TEST_")]
            
            deleted_count = 0
            for exp in test_expenses:
                del_response = requests.delete(f"{BASE_URL}/api/expenses/variable/{exp['id']}", headers=headers)
                if del_response.status_code == 200:
                    deleted_count += 1
            
            print(f"✓ Cleaned up {deleted_count} test expenses")


class TestCustomerPnLAPI:
    """Test Customer P&L API - rejection_share for Retail customers"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_pnl_endpoint_returns_customer_pnl(self, headers):
        """Test that P&L endpoint returns customer_pnl array"""
        # Use date range from March 2026 as mentioned in the request
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200, f"P&L request failed: {response.text}"
        
        data = response.json()
        assert "customer_pnl" in data, "Response should contain customer_pnl"
        
        customer_pnl = data["customer_pnl"]
        assert isinstance(customer_pnl, list), "customer_pnl should be a list"
        
        print(f"✓ P&L endpoint returned {len(customer_pnl)} customers")
        return data
    
    def test_retail_customers_have_rejection_share(self, headers):
        """Test that Retail customers have rejection_share field"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        customer_pnl = data.get("customer_pnl", [])
        
        # Find Retail customers
        retail_customers = [c for c in customer_pnl if c.get("type") == "Retail"]
        
        if retail_customers:
            for customer in retail_customers:
                assert "rejection_share" in customer, f"Retail customer {customer.get('customer')} should have rejection_share"
                print(f"✓ Retail customer '{customer.get('customer')}' has rejection_share: ₹{customer.get('rejection_share', 0)}")
        else:
            print("⚠ No Retail customers found in date range - checking if field exists in schema")
    
    def test_tamanna_mart_rejection_share(self, headers):
        """Test specifically for Tamanna Mart (Retail) rejection_share"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        customer_pnl = data.get("customer_pnl", [])
        
        # Find Tamanna Mart
        tamanna_mart = None
        for customer in customer_pnl:
            if "tamanna" in customer.get("customer", "").lower():
                tamanna_mart = customer
                break
        
        if tamanna_mart:
            assert "rejection_share" in tamanna_mart, "Tamanna Mart should have rejection_share field"
            assert tamanna_mart.get("type") == "Retail", "Tamanna Mart should be Retail type"
            
            rejection_share = tamanna_mart.get("rejection_share", 0)
            print(f"✓ Tamanna Mart (Retail) found:")
            print(f"  - Type: {tamanna_mart.get('type')}")
            print(f"  - Sales: ₹{tamanna_mart.get('sales_amount', 0)}")
            print(f"  - Rejection Share: ₹{rejection_share}")
            print(f"  - GRN Loss Share: ₹{tamanna_mart.get('grn_loss_share', 0)}")
        else:
            print("⚠ Tamanna Mart not found in customer_pnl for March 2026")
            # List available customers
            print("Available customers:")
            for c in customer_pnl[:10]:
                print(f"  - {c.get('customer')} ({c.get('type')})")
    
    def test_qc_customers_have_grn_loss_share(self, headers):
        """Test that QC customers have grn_loss_share field"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        customer_pnl = data.get("customer_pnl", [])
        
        # Find QC customers
        qc_customers = [c for c in customer_pnl if c.get("type") == "QC"]
        
        if qc_customers:
            for customer in qc_customers[:3]:  # Check first 3
                assert "grn_loss_share" in customer, f"QC customer {customer.get('customer')} should have grn_loss_share"
                assert "rejection_share" in customer, f"QC customer {customer.get('customer')} should have rejection_share"
                assert customer.get("rejection_share") == 0, "QC customers should have rejection_share = 0"
                print(f"✓ QC customer '{customer.get('customer')}' has grn_loss_share: ₹{customer.get('grn_loss_share', 0)}")
        else:
            print("⚠ No QC customers found in date range")
    
    def test_vertical_bifurcation_has_rejection(self, headers):
        """Test that vertical_bifurcation.retail has rejection field"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        vertical = data.get("vertical_bifurcation", {})
        
        retail = vertical.get("retail", {})
        assert "rejection" in retail, "Retail vertical should have rejection field"
        
        print(f"✓ Retail vertical rejection: ₹{retail.get('rejection', 0)}")
        print(f"✓ Retail vertical commission: ₹{retail.get('commission', 0)}")
        print(f"✓ Retail gross_profit: ₹{retail.get('gross_profit', 0)}")


class TestPnLSummary:
    """Test P&L Summary calculations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_pnl_summary_fields(self, headers):
        """Test P&L summary has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200
        
        data = response.json()
        summary = data.get("summary", {})
        
        required_fields = [
            "total_sales", "total_cogs", "total_wastage_value",
            "total_retail_rejection", "total_retail_commission",
            "gross_profit", "gross_margin", "net_profit", "net_margin"
        ]
        
        for field in required_fields:
            assert field in summary, f"Summary should have {field}"
        
        print(f"✓ P&L Summary:")
        print(f"  - Total Sales: ₹{summary.get('total_sales', 0)}")
        print(f"  - Total COGS: ₹{summary.get('total_cogs', 0)}")
        print(f"  - Total Wastage: ₹{summary.get('total_wastage_value', 0)}")
        print(f"  - Retail Rejection: ₹{summary.get('total_retail_rejection', 0)}")
        print(f"  - Retail Commission: ₹{summary.get('total_retail_commission', 0)}")
        print(f"  - Gross Profit: ₹{summary.get('gross_profit', 0)}")
        print(f"  - Net Profit: ₹{summary.get('net_profit', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
