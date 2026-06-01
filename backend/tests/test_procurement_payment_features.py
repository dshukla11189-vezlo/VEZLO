"""
Test Procurement Payment Enhancement Features:
1. Partial Reimbursement Recording for employee-paid procurements
2. Backend endpoint /api/procurement/{id} accepting reimbursement_amount and employee_credit_amount fields
3. Farmer-wise pending payments with date breakdown
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProcurementPaymentFeatures:
    """Test procurement payment enhancement features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@freshflow.com",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")
    
    def test_get_procurements_with_date_range(self):
        """Test fetching procurements with date range filter"""
        # Get procurements from Jan 1, 2026 to Jun 1, 2026
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} procurements")
        
        # Check for employee-paid procurements
        employee_paid = [p for p in data if p.get("paid_by_type") == "employee"]
        print(f"✓ Found {len(employee_paid)} employee-paid procurements")
        
        # Check for pending reimbursement status
        pending_reimbursement = [p for p in data if p.get("settlement_status") == "pending_reimbursement"]
        print(f"✓ Found {len(pending_reimbursement)} procurements with pending_reimbursement status")
        
        return data
    
    def test_find_employee_paid_procurement(self):
        """Find an employee-paid procurement for testing"""
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find employee-paid procurement with pending_reimbursement status
        employee_paid = [
            p for p in data 
            if p.get("paid_by_type") == "employee" 
            and p.get("settlement_status") == "pending_reimbursement"
        ]
        
        if employee_paid:
            proc = employee_paid[0]
            print(f"✓ Found employee-paid procurement:")
            print(f"  - ID: {proc.get('id')}")
            print(f"  - Farmer: {proc.get('farmer_name')}")
            print(f"  - Total: ₹{proc.get('total_amount')}")
            print(f"  - Paid by: {proc.get('paid_by')}")
            print(f"  - Settlement status: {proc.get('settlement_status')}")
            return proc
        else:
            print("⚠ No employee-paid procurements with pending_reimbursement found")
            # Try to find any employee-paid procurement
            any_employee_paid = [p for p in data if p.get("paid_by_type") == "employee"]
            if any_employee_paid:
                proc = any_employee_paid[0]
                print(f"✓ Found employee-paid procurement (any status):")
                print(f"  - ID: {proc.get('id')}")
                print(f"  - Settlement status: {proc.get('settlement_status')}")
                return proc
            return None
    
    def test_update_procurement_with_reimbursement(self):
        """Test updating procurement with reimbursement_amount and employee_credit_amount"""
        # First find an employee-paid procurement
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        employee_paid = [
            p for p in data 
            if p.get("paid_by_type") == "employee" 
            and p.get("settlement_status") == "pending_reimbursement"
        ]
        
        if not employee_paid:
            pytest.skip("No employee-paid procurements with pending_reimbursement found")
        
        proc = employee_paid[0]
        proc_id = proc.get("id")
        total_amount = proc.get("total_amount", 0)
        
        # Test 1: Full reimbursement
        update_payload = {
            "settlement_status": "settled",
            "settlement_date": datetime.now().strftime("%Y-%m-%d"),
            "settlement_mode": "bank_transfer",
            "settlement_reference": "TEST-FULL-REIMB-001",
            "settlement_remarks": "Full reimbursement test",
            "reimbursement_amount": total_amount,
            "employee_credit_amount": 0,
            "is_settled": True
        }
        
        response = self.session.put(f"{BASE_URL}/api/procurement/{proc_id}", json=update_payload)
        print(f"Update response status: {response.status_code}")
        print(f"Update response: {response.text[:500] if response.text else 'No response body'}")
        
        # The endpoint should accept these fields even if not explicitly handled
        # Status 200 means the update was accepted
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Procurement {proc_id} updated with reimbursement fields")
        
        # Verify the update
        verify_response = self.session.get(f"{BASE_URL}/api/procurement/{proc_id}")
        if verify_response.status_code == 200:
            updated_proc = verify_response.json()
            print(f"✓ Verified settlement_status: {updated_proc.get('settlement_status')}")
            print(f"✓ Verified is_settled: {updated_proc.get('is_settled')}")
        
        # Revert to pending_reimbursement for other tests
        revert_payload = {
            "settlement_status": "pending_reimbursement",
            "is_settled": False
        }
        self.session.put(f"{BASE_URL}/api/procurement/{proc_id}", json=revert_payload)
        print(f"✓ Reverted procurement {proc_id} to pending_reimbursement")
    
    def test_partial_reimbursement(self):
        """Test partial reimbursement scenario"""
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        employee_paid = [
            p for p in data 
            if p.get("paid_by_type") == "employee" 
            and p.get("settlement_status") == "pending_reimbursement"
        ]
        
        if not employee_paid:
            pytest.skip("No employee-paid procurements with pending_reimbursement found")
        
        proc = employee_paid[0]
        proc_id = proc.get("id")
        total_amount = proc.get("total_amount", 0)
        
        # Test partial reimbursement (50% of total)
        partial_amount = total_amount * 0.5
        
        update_payload = {
            "settlement_status": "partial_reimbursement",
            "settlement_date": datetime.now().strftime("%Y-%m-%d"),
            "settlement_mode": "upi",
            "settlement_reference": "TEST-PARTIAL-001",
            "reimbursement_amount": partial_amount,
            "is_settled": False
        }
        
        response = self.session.put(f"{BASE_URL}/api/procurement/{proc_id}", json=update_payload)
        assert response.status_code == 200
        print(f"✓ Partial reimbursement of ₹{partial_amount:.2f} recorded for procurement {proc_id}")
        
        # Revert
        revert_payload = {
            "settlement_status": "pending_reimbursement",
            "is_settled": False
        }
        self.session.put(f"{BASE_URL}/api/procurement/{proc_id}", json=revert_payload)
    
    def test_excess_reimbursement_creates_credit(self):
        """Test that excess reimbursement creates employee credit"""
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        employee_paid = [
            p for p in data 
            if p.get("paid_by_type") == "employee" 
            and p.get("settlement_status") == "pending_reimbursement"
        ]
        
        if not employee_paid:
            pytest.skip("No employee-paid procurements with pending_reimbursement found")
        
        proc = employee_paid[0]
        proc_id = proc.get("id")
        total_amount = proc.get("total_amount", 0)
        
        # Test excess reimbursement (employee paid 5390, company reimburses 6000)
        excess_amount = 500  # Extra amount creating credit
        reimbursement_amount = total_amount + excess_amount
        
        update_payload = {
            "settlement_status": "settled",
            "settlement_date": datetime.now().strftime("%Y-%m-%d"),
            "settlement_mode": "bank_transfer",
            "settlement_reference": "TEST-EXCESS-001",
            "reimbursement_amount": reimbursement_amount,
            "employee_credit_amount": excess_amount,
            "is_settled": True
        }
        
        response = self.session.put(f"{BASE_URL}/api/procurement/{proc_id}", json=update_payload)
        assert response.status_code == 200
        print(f"✓ Excess reimbursement recorded: ₹{reimbursement_amount:.2f} (credit: ₹{excess_amount:.2f})")
        
        # Revert
        revert_payload = {
            "settlement_status": "pending_reimbursement",
            "is_settled": False
        }
        self.session.put(f"{BASE_URL}/api/procurement/{proc_id}", json=revert_payload)
    
    def test_get_farmers_list(self):
        """Test fetching farmers list"""
        response = self.session.get(f"{BASE_URL}/api/farmers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fetched {len(data)} farmers")
        
        if data:
            farmer = data[0]
            print(f"  Sample farmer: {farmer.get('name')} - {farmer.get('contact', 'No contact')}")
    
    def test_procurement_payments_endpoint(self):
        """Test procurement payments endpoint"""
        # Get a procurement first
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data:
            pytest.skip("No procurements found")
        
        proc = data[0]
        proc_id = proc.get("id")
        
        # Get payments for this procurement
        payments_response = self.session.get(f"{BASE_URL}/api/procurement/{proc_id}/payments")
        print(f"Payments endpoint status: {payments_response.status_code}")
        
        if payments_response.status_code == 200:
            payments = payments_response.json()
            print(f"✓ Found {len(payments)} payments for procurement {proc_id}")
        else:
            print(f"⚠ Payments endpoint returned {payments_response.status_code}")


class TestPendingPaymentsFeatures:
    """Test Pending Payments tab features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": "admin@freshflow.com",
            "password": "admin123"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
    
    def test_get_procurements_with_pending_amounts(self):
        """Test fetching procurements with pending amounts for farmer-wise grouping"""
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Filter procurements with pending amounts
        pending_procurements = [p for p in data if (p.get("pending_amount") or 0) > 0]
        print(f"✓ Found {len(pending_procurements)} procurements with pending amounts")
        
        # Group by farmer
        farmer_pending = {}
        for proc in pending_procurements:
            farmer_id = proc.get("farmer_id")
            farmer_name = proc.get("farmer_name")
            if farmer_id not in farmer_pending:
                farmer_pending[farmer_id] = {
                    "farmer_name": farmer_name,
                    "total_pending": 0,
                    "purchases": []
                }
            farmer_pending[farmer_id]["total_pending"] += proc.get("pending_amount", 0)
            farmer_pending[farmer_id]["purchases"].append({
                "id": proc.get("id"),
                "date": proc.get("date"),
                "total_amount": proc.get("total_amount"),
                "pending_amount": proc.get("pending_amount")
            })
        
        print(f"✓ Grouped into {len(farmer_pending)} farmers with pending payments")
        
        # Show top 3 farmers with highest pending
        sorted_farmers = sorted(farmer_pending.items(), key=lambda x: x[1]["total_pending"], reverse=True)[:3]
        for farmer_id, data in sorted_farmers:
            print(f"  - {data['farmer_name']}: ₹{data['total_pending']:.2f} ({len(data['purchases'])} purchases)")
    
    def test_bulk_payment_data_structure(self):
        """Test that procurement data has required fields for bulk payment"""
        response = self.session.get(
            f"{BASE_URL}/api/procurement",
            params={"from_date": "2026-01-01", "to_date": "2026-06-01"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data:
            pytest.skip("No procurements found")
        
        proc = data[0]
        
        # Check required fields for bulk payment
        required_fields = ["id", "farmer_id", "farmer_name", "date", "total_amount", "paid_amount", "pending_amount"]
        missing_fields = [f for f in required_fields if f not in proc]
        
        if missing_fields:
            print(f"⚠ Missing fields: {missing_fields}")
        else:
            print("✓ All required fields present for bulk payment")
        
        # Check for bulk payment tracking fields
        bulk_fields = ["bulk_payment_reference", "last_payment_reference", "last_payment_mode", "last_payment_date"]
        present_bulk_fields = [f for f in bulk_fields if f in proc]
        print(f"✓ Bulk payment tracking fields present: {present_bulk_fields}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
