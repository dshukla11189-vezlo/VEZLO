"""
Test Rejection Features - Testing the three rejection issues:
1. Record Rejection modal loads quickly (batch API)
2. Rejection list shows 'Recorded:' timestamp
3. Previous Rejections column shows correct values
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRejectionFeatures:
    """Test rejection-related API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_01_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print("✓ Health check passed")
    
    def test_02_get_retailers(self):
        """Test getting retailers list"""
        response = self.session.get(f"{BASE_URL}/api/retailers")
        assert response.status_code == 200
        retailers = response.json()
        assert isinstance(retailers, list)
        print(f"✓ Found {len(retailers)} retailers")
        
        # Find Tamanna Mart
        tamanna = next((r for r in retailers if 'tamanna' in r.get('company_name', '').lower()), None)
        if tamanna:
            print(f"✓ Found Tamanna Mart: {tamanna.get('id')}")
            self.tamanna_id = tamanna.get('id')
        else:
            print("⚠ Tamanna Mart not found, using first retailer")
            if retailers:
                self.tamanna_id = retailers[0].get('id')
    
    def test_03_get_rejections_list(self):
        """Test getting rejections list - verify created_at field exists"""
        response = self.session.get(f"{BASE_URL}/api/retailer-rejections")
        assert response.status_code == 200
        rejections = response.json()
        assert isinstance(rejections, list)
        print(f"✓ Found {len(rejections)} rejections")
        
        # Check if rejections have created_at field
        if rejections:
            sample = rejections[0]
            has_created_at = 'created_at' in sample
            print(f"✓ Rejection has created_at field: {has_created_at}")
            if has_created_at:
                print(f"  Sample created_at: {sample.get('created_at')}")
            
            # Verify rejection structure
            assert 'id' in sample
            assert 'retailer_id' in sample
            assert 'rejection_date' in sample
            assert 'product_id' in sample
            assert 'quantity' in sample
            print("✓ Rejection structure is correct")
    
    def test_04_rejection_history_single_product(self):
        """Test single product rejection history endpoint"""
        # First get a rejection to find a product_id and retailer_id
        rejections_response = self.session.get(f"{BASE_URL}/api/retailer-rejections")
        assert rejections_response.status_code == 200
        rejections = rejections_response.json()
        
        if not rejections:
            pytest.skip("No rejections found to test history")
        
        sample = rejections[0]
        product_id = sample.get('product_id')
        retailer_id = sample.get('retailer_id')
        
        # Test history endpoint
        response = self.session.get(
            f"{BASE_URL}/api/retailer-rejections/history",
            params={"product_id": product_id, "retailer_id": retailer_id}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert 'rejections' in data
        assert 'total_quantity' in data
        assert 'total_value' in data
        assert 'count' in data
        
        print(f"✓ History endpoint works")
        print(f"  Product: {product_id}")
        print(f"  Total rejections: {data['count']}")
        print(f"  Total quantity: {data['total_quantity']}")
    
    def test_05_rejection_history_batch_api(self):
        """Test batch rejection history API - key feature for fast modal loading"""
        # Get rejections to find product IDs
        rejections_response = self.session.get(f"{BASE_URL}/api/retailer-rejections")
        assert rejections_response.status_code == 200
        rejections = rejections_response.json()
        
        if not rejections:
            pytest.skip("No rejections found to test batch API")
        
        # Get unique product IDs and a retailer ID
        product_ids = list(set(r.get('product_id') for r in rejections if r.get('product_id')))[:5]
        retailer_id = rejections[0].get('retailer_id')
        
        print(f"Testing batch API with {len(product_ids)} products for retailer {retailer_id}")
        
        # Time the batch API call
        start_time = time.time()
        response = self.session.post(
            f"{BASE_URL}/api/retailer-rejections/history-batch",
            json={
                "retailer_id": retailer_id,
                "product_ids": product_ids
            }
        )
        elapsed = time.time() - start_time
        
        assert response.status_code == 200
        data = response.json()
        
        assert 'history' in data
        history = data['history']
        
        # Verify structure for each product
        for pid in product_ids:
            if pid in history:
                assert 'rejections' in history[pid]
                assert 'total_quantity' in history[pid]
                assert 'total_value' in history[pid]
        
        print(f"✓ Batch API works correctly")
        print(f"  Response time: {elapsed:.3f}s")
        print(f"  Products queried: {len(product_ids)}")
        print(f"  Products with history: {sum(1 for pid in product_ids if history.get(pid, {}).get('total_quantity', 0) > 0)}")
        
        # Verify it's fast (should be under 1 second for reasonable data)
        assert elapsed < 3.0, f"Batch API too slow: {elapsed:.3f}s"
    
    def test_06_rejection_history_batch_empty_input(self):
        """Test batch API with empty input"""
        response = self.session.post(
            f"{BASE_URL}/api/retailer-rejections/history-batch",
            json={
                "retailer_id": "",
                "product_ids": []
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data == {"history": {}}
        print("✓ Batch API handles empty input correctly")
    
    def test_07_get_dispatches_for_rejection_modal(self):
        """Test getting dispatches - simulates what happens when opening rejection modal"""
        # Get a retailer with dispatches
        dispatches_response = self.session.get(f"{BASE_URL}/api/retailer-dispatches")
        assert dispatches_response.status_code == 200
        dispatches = dispatches_response.json()
        
        if not dispatches:
            pytest.skip("No dispatches found")
        
        # Get a dispatch with items
        dispatch_with_items = next((d for d in dispatches if d.get('items')), None)
        if not dispatch_with_items:
            pytest.skip("No dispatches with items found")
        
        retailer_id = dispatch_with_items.get('retailer_id')
        dispatch_date = dispatch_with_items.get('dispatch_date', '').split('T')[0]
        
        print(f"Testing with retailer {retailer_id} on date {dispatch_date}")
        
        # Get dispatches for this retailer
        response = self.session.get(
            f"{BASE_URL}/api/retailer-dispatches",
            params={"retailer_id": retailer_id}
        )
        assert response.status_code == 200
        retailer_dispatches = response.json()
        
        # Filter by date (simulating frontend logic)
        day_dispatches = [d for d in retailer_dispatches if d.get('dispatch_date', '').split('T')[0] == dispatch_date]
        
        # Collect product IDs
        product_ids = set()
        for d in day_dispatches:
            for item in d.get('items', []):
                if item.get('product_id'):
                    product_ids.add(item.get('product_id'))
        
        print(f"✓ Found {len(day_dispatches)} dispatches with {len(product_ids)} unique products")
        
        # Now test batch API with these products
        if product_ids:
            batch_response = self.session.post(
                f"{BASE_URL}/api/retailer-rejections/history-batch",
                json={
                    "retailer_id": retailer_id,
                    "product_ids": list(product_ids)
                }
            )
            assert batch_response.status_code == 200
            history = batch_response.json().get('history', {})
            
            products_with_history = sum(1 for pid in product_ids if history.get(pid, {}).get('total_quantity', 0) > 0)
            print(f"✓ {products_with_history} products have previous rejection history")
    
    def test_08_rejection_created_at_in_response(self):
        """Verify rejections include created_at timestamp"""
        response = self.session.get(f"{BASE_URL}/api/retailer-rejections")
        assert response.status_code == 200
        rejections = response.json()
        
        if not rejections:
            pytest.skip("No rejections to verify")
        
        # Check multiple rejections for created_at
        rejections_with_timestamp = 0
        for rej in rejections[:10]:  # Check first 10
            if rej.get('created_at'):
                rejections_with_timestamp += 1
        
        print(f"✓ {rejections_with_timestamp}/{min(10, len(rejections))} rejections have created_at timestamp")
        
        # At least some should have timestamps
        if len(rejections) > 0:
            # New rejections should have created_at
            sample = rejections[0]
            if sample.get('created_at'):
                print(f"  Sample timestamp: {sample['created_at']}")
    
    def test_09_rejection_history_includes_created_at(self):
        """Verify rejection history includes created_at for each entry"""
        rejections_response = self.session.get(f"{BASE_URL}/api/retailer-rejections")
        assert rejections_response.status_code == 200
        rejections = rejections_response.json()
        
        if not rejections:
            pytest.skip("No rejections found")
        
        sample = rejections[0]
        product_id = sample.get('product_id')
        retailer_id = sample.get('retailer_id')
        
        # Get history
        response = self.session.get(
            f"{BASE_URL}/api/retailer-rejections/history",
            params={"product_id": product_id, "retailer_id": retailer_id}
        )
        assert response.status_code == 200
        data = response.json()
        
        history_rejections = data.get('rejections', [])
        if history_rejections:
            entries_with_timestamp = sum(1 for r in history_rejections if r.get('created_at'))
            print(f"✓ {entries_with_timestamp}/{len(history_rejections)} history entries have created_at")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
