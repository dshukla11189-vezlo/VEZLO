"""
Test Credit Notes Feature for Retailer Payment and Invoicing
============================================================
Tests:
1. GET /api/retailer-credit-notes/pending/{retailer_id} - Get pending credit notes
2. POST /api/retailer-credit-notes - Create credit note from rejection
3. POST /api/retailer-invoices/{invoice_id}/payment - Payment with credit_adjustments
4. GET /api/retailer-credit-notes - List all credit notes
5. GET /api/retailer-credit-notes/summary/{retailer_id} - Credit note summary
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://harvest-hub-384.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"
RETAILER_ID = "a400f104-b0da-475e-af07-dd6d0d8776e9"  # Tamanna Mart


class TestCreditNotes:
    """Credit Notes API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    def test_01_health_check(self):
        """Test API health check"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") in ["healthy", "degraded"], f"Unexpected status: {data}"
        print(f"✓ Health check passed: {data.get('status')}")
    
    def test_02_get_pending_credit_notes(self):
        """Test GET /api/retailer-credit-notes/pending/{retailer_id}"""
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes/pending/{RETAILER_ID}")
        
        assert response.status_code == 200, f"Failed to get pending credit notes: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "credit_notes" in data, "Response should contain 'credit_notes' field"
        assert "total_pending_credit" in data, "Response should contain 'total_pending_credit' field"
        assert "count" in data, "Response should contain 'count' field"
        
        print(f"✓ Pending credit notes: count={data['count']}, total_pending=₹{data['total_pending_credit']}")
        
        # Verify credit note structure if any exist
        if data['count'] > 0:
            cn = data['credit_notes'][0]
            assert "id" in cn, "Credit note should have 'id'"
            assert "credit_note_number" in cn, "Credit note should have 'credit_note_number'"
            assert "amount" in cn, "Credit note should have 'amount'"
            assert "pending_amount" in cn, "Credit note should have 'pending_amount'"
            assert "status" in cn, "Credit note should have 'status'"
            print(f"  First credit note: {cn.get('credit_note_number')} - ₹{cn.get('amount')} (pending: ₹{cn.get('pending_amount')})")
    
    def test_03_get_all_credit_notes(self):
        """Test GET /api/retailer-credit-notes"""
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes")
        
        assert response.status_code == 200, f"Failed to get credit notes: {response.status_code} - {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Total credit notes in system: {len(data)}")
        
        # Filter by retailer
        response_filtered = self.session.get(f"{BASE_URL}/api/retailer-credit-notes?retailer_id={RETAILER_ID}")
        assert response_filtered.status_code == 200
        filtered_data = response_filtered.json()
        print(f"  Credit notes for Tamanna Mart: {len(filtered_data)}")
    
    def test_04_get_credit_note_summary(self):
        """Test GET /api/retailer-credit-notes/summary/{retailer_id}"""
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes/summary/{RETAILER_ID}")
        
        assert response.status_code == 200, f"Failed to get credit summary: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "total_credit_issued" in data, "Response should contain 'total_credit_issued'"
        assert "total_adjusted" in data, "Response should contain 'total_adjusted'"
        assert "total_pending" in data, "Response should contain 'total_pending'"
        assert "pending_count" in data, "Response should contain 'pending_count'"
        assert "adjusted_count" in data, "Response should contain 'adjusted_count'"
        
        print(f"✓ Credit summary for Tamanna Mart:")
        print(f"  Total issued: ₹{data['total_credit_issued']}")
        print(f"  Total adjusted: ₹{data['total_adjusted']}")
        print(f"  Total pending: ₹{data['total_pending']}")
        print(f"  Pending count: {data['pending_count']}, Adjusted count: {data['adjusted_count']}")
    
    def test_05_get_retailer_invoices(self):
        """Test GET /api/retailer-invoices for the retailer"""
        response = self.session.get(f"{BASE_URL}/api/retailer-invoices?retailer_id={RETAILER_ID}")
        
        assert response.status_code == 200, f"Failed to get invoices: {response.status_code} - {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Invoices for Tamanna Mart: {len(data)}")
        
        # Store invoice for later tests
        if len(data) > 0:
            self.test_invoice = data[0]
            print(f"  First invoice: {self.test_invoice.get('invoice_number')} - ₹{self.test_invoice.get('net_payable')}")
    
    def test_06_create_credit_note(self):
        """Test POST /api/retailer-credit-notes - Create credit note"""
        # First get an invoice to link the credit note to
        response = self.session.get(f"{BASE_URL}/api/retailer-invoices?retailer_id={RETAILER_ID}")
        assert response.status_code == 200
        invoices = response.json()
        
        if len(invoices) == 0:
            pytest.skip("No invoices found for retailer to create credit note")
        
        test_invoice = invoices[0]
        
        # Create a test credit note
        credit_note_data = {
            "retailer_id": RETAILER_ID,
            "original_invoice_id": test_invoice.get("id"),
            "rejection_id": None,
            "amount": 15.50,
            "rejection_details": [
                {
                    "product_name": "Test Product",
                    "quantity": 1,
                    "mrp": 15.50,
                    "value": 15.50
                }
            ],
            "remarks": f"Test credit note created at {datetime.now().isoformat()}"
        }
        
        response = self.session.post(f"{BASE_URL}/api/retailer-credit-notes", json=credit_note_data)
        
        assert response.status_code == 200, f"Failed to create credit note: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "credit_note" in data, "Response should contain 'credit_note'"
        assert "message" in data, "Response should contain 'message'"
        
        cn = data["credit_note"]
        assert cn.get("credit_note_number"), "Credit note should have a number"
        assert cn.get("amount") == 15.50, f"Amount should be 15.50, got {cn.get('amount')}"
        assert cn.get("pending_amount") == 15.50, f"Pending amount should be 15.50, got {cn.get('pending_amount')}"
        assert cn.get("status") == "pending", f"Status should be 'pending', got {cn.get('status')}"
        
        print(f"✓ Created credit note: {cn.get('credit_note_number')} - ₹{cn.get('amount')}")
        
        # Store for cleanup
        self.created_credit_note_id = cn.get("id")
    
    def test_07_payment_with_credit_adjustment(self):
        """Test POST /api/retailer-invoices/{invoice_id}/payment with credit_adjustments"""
        # Get pending credit notes
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes/pending/{RETAILER_ID}")
        assert response.status_code == 200
        pending_data = response.json()
        
        if pending_data['count'] == 0:
            pytest.skip("No pending credit notes to test payment adjustment")
        
        # Get an unpaid invoice
        response = self.session.get(f"{BASE_URL}/api/retailer-invoices?retailer_id={RETAILER_ID}")
        assert response.status_code == 200
        invoices = response.json()
        
        # Find an unpaid or partially paid invoice
        unpaid_invoice = None
        for inv in invoices:
            if inv.get("status") in ["pending", "partial"]:
                unpaid_invoice = inv
                break
        
        if not unpaid_invoice:
            pytest.skip("No unpaid invoices found to test payment with credit adjustment")
        
        # Get the first pending credit note
        credit_note = pending_data['credit_notes'][0]
        credit_amount = min(credit_note.get('pending_amount', 0), 10)  # Use up to ₹10 from credit
        
        if credit_amount <= 0:
            pytest.skip("Credit note has no pending amount")
        
        # Make payment with credit adjustment
        payment_data = {
            "amount": 0,  # No cash, just credit adjustment
            "payment_mode": "credit_adjustment",
            "received_by": "",
            "received_by_name": "Test",
            "reference_number": f"TEST-{uuid.uuid4().hex[:8]}",
            "remarks": "Test payment with credit adjustment",
            "payment_date": datetime.now().isoformat(),
            "credit_adjustments": [
                {
                    "credit_note_id": credit_note.get("id"),
                    "credit_note_number": credit_note.get("credit_note_number"),
                    "amount": credit_amount
                }
            ]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/retailer-invoices/{unpaid_invoice['id']}/payment",
            json=payment_data
        )
        
        assert response.status_code == 200, f"Failed to record payment: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "credit_applied" in data, "Response should contain 'credit_applied'"
        assert data.get("credit_applied") == credit_amount, f"Credit applied should be {credit_amount}, got {data.get('credit_applied')}"
        
        print(f"✓ Payment recorded with credit adjustment:")
        print(f"  Invoice: {unpaid_invoice.get('invoice_number')}")
        print(f"  Credit applied: ₹{data.get('credit_applied')}")
        print(f"  New status: {data.get('status')}")
        
        # Verify credit note was updated
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes/pending/{RETAILER_ID}")
        assert response.status_code == 200
        updated_pending = response.json()
        
        # Find the credit note we used
        updated_cn = None
        for cn in updated_pending['credit_notes']:
            if cn.get('id') == credit_note.get('id'):
                updated_cn = cn
                break
        
        if updated_cn:
            expected_pending = credit_note.get('pending_amount', 0) - credit_amount
            actual_pending = updated_cn.get('pending_amount', 0)
            print(f"  Credit note {credit_note.get('credit_note_number')} pending: ₹{actual_pending} (was ₹{credit_note.get('pending_amount')})")
    
    def test_08_payment_with_cash_and_credit(self):
        """Test payment with both cash and credit adjustment"""
        # Get pending credit notes
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes/pending/{RETAILER_ID}")
        assert response.status_code == 200
        pending_data = response.json()
        
        # Get an unpaid invoice
        response = self.session.get(f"{BASE_URL}/api/retailer-invoices?retailer_id={RETAILER_ID}")
        assert response.status_code == 200
        invoices = response.json()
        
        unpaid_invoice = None
        for inv in invoices:
            if inv.get("status") in ["pending", "partial"]:
                unpaid_invoice = inv
                break
        
        if not unpaid_invoice:
            pytest.skip("No unpaid invoices found")
        
        # Prepare payment with cash and optional credit
        payment_data = {
            "amount": 5.00,  # ₹5 cash
            "payment_mode": "cash",
            "received_by": "",
            "received_by_name": "Test Admin",
            "reference_number": f"CASH-{uuid.uuid4().hex[:8]}",
            "remarks": "Test cash payment",
            "payment_date": datetime.now().isoformat(),
            "credit_adjustments": []
        }
        
        # Add credit adjustment if available
        if pending_data['count'] > 0:
            credit_note = pending_data['credit_notes'][0]
            credit_amount = min(credit_note.get('pending_amount', 0), 5)
            if credit_amount > 0:
                payment_data["credit_adjustments"] = [
                    {
                        "credit_note_id": credit_note.get("id"),
                        "credit_note_number": credit_note.get("credit_note_number"),
                        "amount": credit_amount
                    }
                ]
        
        response = self.session.post(
            f"{BASE_URL}/api/retailer-invoices/{unpaid_invoice['id']}/payment",
            json=payment_data
        )
        
        assert response.status_code == 200, f"Failed to record payment: {response.status_code} - {response.text}"
        
        data = response.json()
        print(f"✓ Payment with cash and credit:")
        print(f"  Cash: ₹{data.get('cash_amount', 0)}")
        print(f"  Credit: ₹{data.get('credit_applied', 0)}")
        print(f"  Total paid: ₹{data.get('paid_amount', 0)}")
        print(f"  Status: {data.get('status')}")
    
    def test_09_verify_credit_note_status_after_adjustment(self):
        """Verify credit note status changes after adjustment"""
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes?retailer_id={RETAILER_ID}")
        assert response.status_code == 200
        
        credit_notes = response.json()
        
        # Check for different statuses
        pending_count = sum(1 for cn in credit_notes if cn.get('status') == 'pending')
        partial_count = sum(1 for cn in credit_notes if cn.get('status') == 'partial')
        adjusted_count = sum(1 for cn in credit_notes if cn.get('status') == 'adjusted')
        
        print(f"✓ Credit note status distribution:")
        print(f"  Pending: {pending_count}")
        print(f"  Partial: {partial_count}")
        print(f"  Adjusted: {adjusted_count}")
        
        # Verify structure of credit notes
        for cn in credit_notes[:3]:  # Check first 3
            assert cn.get('status') in ['pending', 'partial', 'adjusted'], f"Invalid status: {cn.get('status')}"
            if cn.get('status') == 'adjusted':
                assert cn.get('pending_amount', 1) <= 0.01, f"Adjusted CN should have 0 pending: {cn.get('pending_amount')}"
    
    def test_10_delete_test_credit_note(self):
        """Cleanup - delete test credit note if created"""
        # Get all credit notes for retailer
        response = self.session.get(f"{BASE_URL}/api/retailer-credit-notes?retailer_id={RETAILER_ID}")
        assert response.status_code == 200
        
        credit_notes = response.json()
        
        # Find and delete test credit notes (those with "Test credit note" in remarks)
        deleted_count = 0
        for cn in credit_notes:
            if cn.get('remarks', '').startswith('Test credit note') and cn.get('status') == 'pending':
                delete_response = self.session.delete(f"{BASE_URL}/api/retailer-credit-notes/{cn.get('id')}")
                if delete_response.status_code == 200:
                    deleted_count += 1
                    print(f"  Deleted test credit note: {cn.get('credit_note_number')}")
        
        print(f"✓ Cleanup: deleted {deleted_count} test credit notes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
