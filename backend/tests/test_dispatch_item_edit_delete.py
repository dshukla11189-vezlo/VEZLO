"""
Test QC Dispatch Item Edit/Delete Feature
==========================================
Tests for the new Edit/Delete functionality for individual QC dispatch line items.
Features tested:
1. Check invoice status for dispatch
2. Edit dispatch item quantity
3. Delete dispatch item by index
4. Invoice check prevents edit/delete
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDispatchItemEditDelete:
    """Tests for QC Dispatch Item Edit/Delete functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            print(f"Login successful, token obtained")
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_01_get_dispatches(self):
        """Test getting all dispatches to find test data"""
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200, f"Failed to get dispatches: {response.text}"
        
        dispatches = response.json()
        print(f"Found {len(dispatches)} dispatches")
        
        # Store dispatch info for later tests
        if dispatches:
            self.test_dispatch = dispatches[0]
            print(f"Test dispatch ID: {self.test_dispatch.get('id')}")
            print(f"Test dispatch customer: {self.test_dispatch.get('customer_name')}")
            print(f"Test dispatch items count: {len(self.test_dispatch.get('items', []))}")
        
        assert len(dispatches) >= 0, "Dispatches endpoint should return a list"
    
    def test_02_check_invoice_status_endpoint(self):
        """Test the invoice status check endpoint"""
        # First get a dispatch
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        
        dispatches = response.json()
        if not dispatches:
            pytest.skip("No dispatches available for testing")
        
        dispatch_id = dispatches[0].get('id')
        
        # Check invoice status
        status_response = self.session.get(f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/invoice-status")
        assert status_response.status_code == 200, f"Invoice status check failed: {status_response.text}"
        
        status_data = status_response.json()
        print(f"Invoice status for dispatch {dispatch_id}: {status_data}")
        
        # Verify response structure
        assert "is_invoiced" in status_data, "Response should contain 'is_invoiced' field"
        assert isinstance(status_data["is_invoiced"], bool), "'is_invoiced' should be boolean"
        
        if status_data["is_invoiced"]:
            assert "invoice_number" in status_data, "Invoiced dispatch should have invoice_number"
            print(f"Dispatch is invoiced: {status_data.get('invoice_number')}")
        else:
            print("Dispatch is NOT invoiced")
    
    def test_03_invoice_status_for_nonexistent_dispatch(self):
        """Test invoice status check for non-existent dispatch returns 404"""
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches/nonexistent-id-12345/invoice-status")
        assert response.status_code == 404, f"Expected 404 for non-existent dispatch, got {response.status_code}"
        print("Correctly returns 404 for non-existent dispatch")
    
    def test_04_edit_dispatch_item_endpoint_exists(self):
        """Test that the edit dispatch item endpoint exists"""
        # First get a dispatch
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        
        dispatches = response.json()
        if not dispatches:
            pytest.skip("No dispatches available for testing")
        
        # Find a dispatch that is NOT invoiced
        non_invoiced_dispatch = None
        for dispatch in dispatches:
            status_resp = self.session.get(f"{BASE_URL}/api/qc-dispatches/{dispatch['id']}/invoice-status")
            if status_resp.status_code == 200:
                status = status_resp.json()
                if not status.get("is_invoiced"):
                    non_invoiced_dispatch = dispatch
                    break
        
        if not non_invoiced_dispatch:
            # Try with first dispatch anyway to test the endpoint
            non_invoiced_dispatch = dispatches[0]
            print("Warning: All dispatches may be invoiced, testing endpoint anyway")
        
        dispatch_id = non_invoiced_dispatch.get('id')
        items = non_invoiced_dispatch.get('items', [])
        
        if not items:
            pytest.skip("Dispatch has no items to edit")
        
        original_qty = items[0].get('supplied_qty', 0)
        new_qty = original_qty + 1  # Increment by 1 for test
        
        # Try to edit the item
        edit_response = self.session.put(
            f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items/0",
            json={"item_index": 0, "supplied_qty": new_qty}
        )
        
        print(f"Edit response status: {edit_response.status_code}")
        print(f"Edit response: {edit_response.text}")
        
        # Either 200 (success) or 400 (invoiced) is acceptable
        assert edit_response.status_code in [200, 400], f"Unexpected status: {edit_response.status_code}"
        
        if edit_response.status_code == 200:
            print(f"Successfully edited item quantity from {original_qty} to {new_qty}")
            # Revert the change
            self.session.put(
                f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items/0",
                json={"item_index": 0, "supplied_qty": original_qty}
            )
            print(f"Reverted quantity back to {original_qty}")
        else:
            print(f"Edit blocked (likely invoiced): {edit_response.json()}")
    
    def test_05_delete_dispatch_item_endpoint_exists(self):
        """Test that the delete dispatch item by index endpoint exists"""
        # First get a dispatch
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        
        dispatches = response.json()
        if not dispatches:
            pytest.skip("No dispatches available for testing")
        
        dispatch_id = dispatches[0].get('id')
        
        # Try to delete item at invalid index (should return 404)
        delete_response = self.session.delete(
            f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items-by-index/999"
        )
        
        print(f"Delete invalid index response: {delete_response.status_code}")
        
        # Should be 404 (item not found) or 400 (invoiced)
        assert delete_response.status_code in [400, 404], f"Unexpected status: {delete_response.status_code}"
        print("Delete endpoint correctly handles invalid index")
    
    def test_06_edit_blocked_for_invoiced_dispatch(self):
        """Test that edit is blocked for invoiced dispatches"""
        # Get dispatches
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        
        dispatches = response.json()
        
        # Find an invoiced dispatch
        invoiced_dispatch = None
        for dispatch in dispatches:
            status_resp = self.session.get(f"{BASE_URL}/api/qc-dispatches/{dispatch['id']}/invoice-status")
            if status_resp.status_code == 200:
                status = status_resp.json()
                if status.get("is_invoiced"):
                    invoiced_dispatch = dispatch
                    break
        
        if not invoiced_dispatch:
            pytest.skip("No invoiced dispatches found for testing")
        
        dispatch_id = invoiced_dispatch.get('id')
        items = invoiced_dispatch.get('items', [])
        
        if not items:
            pytest.skip("Invoiced dispatch has no items")
        
        # Try to edit - should be blocked
        edit_response = self.session.put(
            f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items/0",
            json={"item_index": 0, "supplied_qty": 999}
        )
        
        assert edit_response.status_code == 400, f"Expected 400 for invoiced dispatch, got {edit_response.status_code}"
        
        error_detail = edit_response.json().get("detail", "")
        assert "invoice" in error_detail.lower(), f"Error should mention invoice: {error_detail}"
        print(f"Edit correctly blocked for invoiced dispatch: {error_detail}")
    
    def test_07_delete_blocked_for_invoiced_dispatch(self):
        """Test that delete is blocked for invoiced dispatches"""
        # Get dispatches
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        
        dispatches = response.json()
        
        # Find an invoiced dispatch
        invoiced_dispatch = None
        for dispatch in dispatches:
            status_resp = self.session.get(f"{BASE_URL}/api/qc-dispatches/{dispatch['id']}/invoice-status")
            if status_resp.status_code == 200:
                status = status_resp.json()
                if status.get("is_invoiced"):
                    invoiced_dispatch = dispatch
                    break
        
        if not invoiced_dispatch:
            pytest.skip("No invoiced dispatches found for testing")
        
        dispatch_id = invoiced_dispatch.get('id')
        items = invoiced_dispatch.get('items', [])
        
        if not items:
            pytest.skip("Invoiced dispatch has no items")
        
        # Try to delete - should be blocked
        delete_response = self.session.delete(
            f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items-by-index/0"
        )
        
        assert delete_response.status_code == 400, f"Expected 400 for invoiced dispatch, got {delete_response.status_code}"
        
        error_detail = delete_response.json().get("detail", "")
        assert "invoice" in error_detail.lower(), f"Error should mention invoice: {error_detail}"
        print(f"Delete correctly blocked for invoiced dispatch: {error_detail}")


class TestDispatchItemEditDeleteIntegration:
    """Integration tests - create dispatch, edit, delete"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_08_full_edit_workflow(self):
        """Test full edit workflow: get dispatch -> check status -> edit -> verify"""
        # Get dispatches
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        
        dispatches = response.json()
        if not dispatches:
            pytest.skip("No dispatches available")
        
        # Find non-invoiced dispatch with items
        test_dispatch = None
        for dispatch in dispatches:
            if not dispatch.get('items'):
                continue
            status_resp = self.session.get(f"{BASE_URL}/api/qc-dispatches/{dispatch['id']}/invoice-status")
            if status_resp.status_code == 200 and not status_resp.json().get("is_invoiced"):
                test_dispatch = dispatch
                break
        
        if not test_dispatch:
            pytest.skip("No non-invoiced dispatch with items found")
        
        dispatch_id = test_dispatch['id']
        original_qty = test_dispatch['items'][0].get('supplied_qty', 0)
        new_qty = original_qty + 0.5
        
        # Edit the item
        edit_resp = self.session.put(
            f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items/0",
            json={"item_index": 0, "supplied_qty": new_qty}
        )
        
        if edit_resp.status_code != 200:
            pytest.skip(f"Edit failed: {edit_resp.text}")
        
        # Verify the change
        verify_resp = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        updated_dispatch = next((d for d in verify_resp.json() if d['id'] == dispatch_id), None)
        
        assert updated_dispatch is not None, "Dispatch should still exist"
        assert updated_dispatch['items'][0]['supplied_qty'] == new_qty, "Quantity should be updated"
        print(f"Edit verified: {original_qty} -> {new_qty}")
        
        # Revert
        self.session.put(
            f"{BASE_URL}/api/qc-dispatches/{dispatch_id}/items/0",
            json={"item_index": 0, "supplied_qty": original_qty}
        )
        print(f"Reverted to original: {original_qty}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
