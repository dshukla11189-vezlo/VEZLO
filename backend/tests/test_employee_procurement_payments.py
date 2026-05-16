"""
Test Employee Procurement Payments Features
============================================
Tests for:
1. Recording partial payments by employees sets paid_by_type=employee on procurement doc
2. Procurement-payments endpoint returns employee payments for Cashflow
3. View button shows for partially paid cases
4. Purple highlighting for employee-paid procurements with pending_reimbursement
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEmployeeProcurementPayments:
    """Test employee procurement payment features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Test procurement ID from context
        self.test_procurement_id = "76282859-94f3-4a0c-b473-4953206aad91"
    
    def test_health_check(self):
        """Test API health"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
    
    def test_procurement_has_paid_by_type_employee(self):
        """Test that procurement with employee payment has paid_by_type=employee"""
        response = requests.get(
            f"{BASE_URL}/api/procurement?from_date=2025-05-16&to_date=2025-05-16",
            headers=self.headers
        )
        assert response.status_code == 200
        
        procurements = response.json()
        test_proc = next((p for p in procurements if p["id"] == self.test_procurement_id), None)
        
        assert test_proc is not None, f"Test procurement {self.test_procurement_id} not found"
        
        # Verify paid_by_type is set to employee
        assert test_proc.get("paid_by_type") == "employee", \
            f"Expected paid_by_type='employee', got '{test_proc.get('paid_by_type')}'"
        
        # Verify paid_by has employee name
        assert test_proc.get("paid_by") == "Shradha Salunke", \
            f"Expected paid_by='Shradha Salunke', got '{test_proc.get('paid_by')}'"
        
        # Verify settlement_status is pending_reimbursement
        assert test_proc.get("settlement_status") == "pending_reimbursement", \
            f"Expected settlement_status='pending_reimbursement', got '{test_proc.get('settlement_status')}'"
        
        # Verify payment_status is partial
        assert test_proc.get("payment_status") == "partial", \
            f"Expected payment_status='partial', got '{test_proc.get('payment_status')}'"
        
        print("✓ Procurement has correct paid_by_type=employee, paid_by=Shradha Salunke, settlement_status=pending_reimbursement")
    
    def test_procurement_payments_endpoint_returns_employee_payments(self):
        """Test that /api/procurement-payments returns employee payments for Cashflow"""
        response = requests.get(
            f"{BASE_URL}/api/procurement-payments?from_date=2025-05-01&to_date=2025-05-31",
            headers=self.headers
        )
        assert response.status_code == 200
        
        payments = response.json()
        assert len(payments) > 0, "No procurement payments found"
        
        # Find the test payment
        test_payment = next((p for p in payments if p["procurement_id"] == self.test_procurement_id), None)
        assert test_payment is not None, "Test payment not found in procurement-payments"
        
        # Verify payment has correct fields for Cashflow reimbursement tracking
        assert test_payment.get("paid_by_type") == "employee", \
            f"Expected paid_by_type='employee', got '{test_payment.get('paid_by_type')}'"
        
        assert test_payment.get("paid_by") == "Shradha Salunke", \
            f"Expected paid_by='Shradha Salunke', got '{test_payment.get('paid_by')}'"
        
        assert test_payment.get("settlement_status") == "pending_reimbursement", \
            f"Expected settlement_status='pending_reimbursement', got '{test_payment.get('settlement_status')}'"
        
        assert test_payment.get("amount") == 200, \
            f"Expected amount=200, got '{test_payment.get('amount')}'"
        
        print("✓ Procurement-payments endpoint returns employee payment with correct fields for Cashflow")
    
    def test_procurement_individual_payments_endpoint(self):
        """Test that /api/procurement/{id}/payments returns payment history"""
        response = requests.get(
            f"{BASE_URL}/api/procurement/{self.test_procurement_id}/payments",
            headers=self.headers
        )
        assert response.status_code == 200
        
        payments = response.json()
        assert len(payments) > 0, "No payments found for procurement"
        
        # Verify payment details
        payment = payments[0]
        assert payment.get("amount") == 200
        assert payment.get("paid_by_type") == "employee"
        assert payment.get("paid_by") == "Shradha Salunke"
        assert payment.get("settlement_status") == "pending_reimbursement"
        
        print("✓ Individual procurement payments endpoint returns correct payment history")
    
    def test_create_new_employee_payment_sets_procurement_fields(self):
        """Test that creating a new employee payment updates procurement doc correctly"""
        # First, create a new test procurement
        farmers_response = requests.get(f"{BASE_URL}/api/farmers", headers=self.headers)
        assert farmers_response.status_code == 200
        farmers = farmers_response.json()
        assert len(farmers) > 0, "No farmers found"
        farmer = farmers[0]
        
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) > 0, "No products found"
        product = products[0]
        
        # Create procurement
        procurement_data = {
            "date": "2025-05-17T00:00:00",
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "products": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 5,
                "unit": "Kg",
                "rate": 100,
                "total": 500
            }],
            "total_amount": 500,
            "paid_amount": 0,
            "pending_amount": 500,
            "payment_status": "pending",
            "status": "completed"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/procurement",
            headers=self.headers,
            json=procurement_data
        )
        assert create_response.status_code == 201, f"Failed to create procurement: {create_response.text}"
        new_procurement = create_response.json()
        new_procurement_id = new_procurement["id"]
        
        try:
            # Get employees for paid_by_employee_id
            employees_response = requests.get(f"{BASE_URL}/api/employees", headers=self.headers)
            assert employees_response.status_code == 200
            employees = employees_response.json()
            
            # Find Shradha Salunke or use first employee
            employee = next((e for e in employees if "shradha" in e.get("name", "").lower() or "shradha" in e.get("email", "").lower()), None)
            if not employee and len(employees) > 0:
                employee = employees[0]
            
            # Record employee payment
            payment_data = {
                "amount": 200,
                "payment_date": "2025-05-17",
                "payment_mode": "cash",
                "remarks": "Test employee payment",
                "paid_by_type": "employee",
                "paid_by_employee_id": employee["id"] if employee else None
            }
            
            payment_response = requests.post(
                f"{BASE_URL}/api/procurement/{new_procurement_id}/payments",
                headers=self.headers,
                json=payment_data
            )
            assert payment_response.status_code == 200, f"Failed to create payment: {payment_response.text}"
            
            # Verify procurement was updated with paid_by_type=employee
            verify_response = requests.get(
                f"{BASE_URL}/api/procurement?from_date=2025-05-17&to_date=2025-05-17",
                headers=self.headers
            )
            assert verify_response.status_code == 200
            
            procurements = verify_response.json()
            updated_proc = next((p for p in procurements if p["id"] == new_procurement_id), None)
            
            assert updated_proc is not None, "Updated procurement not found"
            assert updated_proc.get("paid_by_type") == "employee", \
                f"Expected paid_by_type='employee' after payment, got '{updated_proc.get('paid_by_type')}'"
            assert updated_proc.get("settlement_status") == "pending_reimbursement", \
                f"Expected settlement_status='pending_reimbursement', got '{updated_proc.get('settlement_status')}'"
            assert updated_proc.get("payment_status") == "partial", \
                f"Expected payment_status='partial', got '{updated_proc.get('payment_status')}'"
            
            print("✓ New employee payment correctly sets paid_by_type=employee on procurement doc")
            
        finally:
            # Cleanup - delete the test procurement
            requests.delete(f"{BASE_URL}/api/procurement/{new_procurement_id}", headers=self.headers)
    
    def test_purple_highlighting_conditions(self):
        """Test that the conditions for purple highlighting are met in the data"""
        response = requests.get(
            f"{BASE_URL}/api/procurement?from_date=2025-05-16&to_date=2025-05-16",
            headers=self.headers
        )
        assert response.status_code == 200
        
        procurements = response.json()
        test_proc = next((p for p in procurements if p["id"] == self.test_procurement_id), None)
        
        assert test_proc is not None
        
        # Check all conditions for purple highlighting:
        # isPendingSettlement = (payment_status === 'paid' || payment_status === 'partial') && 
        #                       paid_by_type === 'employee' && 
        #                       settlement_status !== 'settled'
        
        payment_status = test_proc.get("payment_status")
        paid_by_type = test_proc.get("paid_by_type")
        settlement_status = test_proc.get("settlement_status")
        
        is_paid_or_partial = payment_status in ["paid", "partial"]
        is_employee_paid = paid_by_type == "employee"
        is_not_settled = settlement_status != "settled"
        
        assert is_paid_or_partial, f"payment_status should be 'paid' or 'partial', got '{payment_status}'"
        assert is_employee_paid, f"paid_by_type should be 'employee', got '{paid_by_type}'"
        assert is_not_settled, f"settlement_status should not be 'settled', got '{settlement_status}'"
        
        # All conditions met for purple highlighting
        is_pending_settlement = is_paid_or_partial and is_employee_paid and is_not_settled
        assert is_pending_settlement, "Purple highlighting conditions not met"
        
        print("✓ All conditions for purple highlighting are met:")
        print(f"  - payment_status: {payment_status} (paid or partial: {is_paid_or_partial})")
        print(f"  - paid_by_type: {paid_by_type} (employee: {is_employee_paid})")
        print(f"  - settlement_status: {settlement_status} (not settled: {is_not_settled})")
    
    def test_view_button_conditions(self):
        """Test that conditions for View button are met (paid_amount > 0)"""
        response = requests.get(
            f"{BASE_URL}/api/procurement?from_date=2025-05-16&to_date=2025-05-16",
            headers=self.headers
        )
        assert response.status_code == 200
        
        procurements = response.json()
        test_proc = next((p for p in procurements if p["id"] == self.test_procurement_id), None)
        
        assert test_proc is not None
        
        paid_amount = test_proc.get("paid_amount", 0)
        
        # View button shows when paid_amount > 0
        assert paid_amount > 0, f"paid_amount should be > 0 for View button, got {paid_amount}"
        
        print(f"✓ View button condition met: paid_amount={paid_amount} > 0")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
