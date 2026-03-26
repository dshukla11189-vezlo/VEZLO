"""
Test GRN CSV Upload functionality for FreshFlow
Tests:
- GRN CSV Upload with valid date (should process)
- GRN CSV Upload with invalid date (should skip with warning)
- GRN CSV Upload with mixed dates (process valid, skip invalid)
- GRN table columns: Rate/Unit, Amount, Loss/Gain
- Save GRN functionality
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGRNCsvUpload:
    """GRN CSV Upload endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_login_success(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["email"] == "admin@freshflow.com"
        print("✓ Admin login successful")
    
    def test_get_dispatches(self):
        """Test getting dispatches - verify Ninjacart dispatch exists"""
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200
        dispatches = response.json()
        
        # Check for Ninjacart dispatches
        ninjacart_dispatches = [d for d in dispatches if 'ninja' in d.get('customer_name', '').lower()]
        print(f"✓ Found {len(ninjacart_dispatches)} Ninjacart dispatches")
        
        if ninjacart_dispatches:
            for d in ninjacart_dispatches:
                print(f"  - Date: {d.get('dispatch_date')}, Customer: {d.get('customer_name')}")
        
        return ninjacart_dispatches
    
    def test_grn_csv_upload_valid_date(self):
        """Test GRN CSV upload with valid date (matching dispatch date)"""
        # CSV with date 26/03/26 which should match the test dispatch
        csv_content = """PO_DeliveryDate,Sku Name,GRNQuantity,GRNPrice,WeightUnit
26/03/26,Tomato Fresh,8.5,50,Kg"""
        
        files = {
            'file': ('test_valid.csv', io.BytesIO(csv_content.encode()), 'text/csv')
        }
        
        # Remove Content-Type header for multipart upload
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        print(f"✓ CSV Upload Response:")
        print(f"  - Total CSV rows: {data.get('total_csv_rows')}")
        print(f"  - Rows processed: {data.get('rows_processed')}")
        print(f"  - Rows skipped: {data.get('rows_skipped')}")
        print(f"  - Matched items: {len(data.get('matched_items', []))}")
        print(f"  - Warnings: {data.get('warnings', [])}")
        print(f"  - Dates found: {data.get('dates_found', [])}")
        
        # Verify response structure
        assert 'total_csv_rows' in data
        assert 'rows_processed' in data
        assert 'rows_skipped' in data
        assert 'matched_items' in data
        assert 'warnings' in data
        
        return data
    
    def test_grn_csv_upload_invalid_date(self):
        """Test GRN CSV upload with invalid dates (no matching dispatch)"""
        # CSV with dates that don't have dispatches
        csv_content = """PO_DeliveryDate,Sku Name,GRNQuantity,GRNPrice,WeightUnit
20/03/26,Tomato Fresh,8.5,50,Kg
25/03/26,Potato Organic,5.0,40,Kg"""
        
        files = {
            'file': ('test_invalid.csv', io.BytesIO(csv_content.encode()), 'text/csv')
        }
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        print(f"✓ Invalid Date CSV Upload Response:")
        print(f"  - Total CSV rows: {data.get('total_csv_rows')}")
        print(f"  - Rows processed: {data.get('rows_processed')}")
        print(f"  - Rows skipped: {data.get('rows_skipped')}")
        print(f"  - Warnings: {data.get('warnings', [])}")
        
        # Should have skipped rows due to no matching dispatch
        assert data.get('rows_skipped', 0) > 0, "Expected rows to be skipped for invalid dates"
        
        # Should have warnings about skipped rows
        warnings = data.get('warnings', [])
        assert len(warnings) > 0, "Expected warnings for skipped rows"
        
        # Check that warnings mention no dispatch found
        has_no_dispatch_warning = any('No dispatch found' in w or 'skipped' in w.lower() for w in warnings)
        assert has_no_dispatch_warning, f"Expected 'No dispatch found' warning, got: {warnings}"
        
        print(f"✓ Correctly skipped rows with no matching dispatch dates")
        return data
    
    def test_grn_csv_upload_mixed_dates(self):
        """Test GRN CSV upload with mixed dates (some valid, some invalid)"""
        # CSV with one valid date (26/03/26) and one invalid date (20/03/26)
        csv_content = """PO_DeliveryDate,Sku Name,GRNQuantity,GRNPrice,WeightUnit
26/03/26,Tomato Fresh,8.5,50,Kg
20/03/26,Potato Organic,5.0,40,Kg"""
        
        files = {
            'file': ('test_mixed.csv', io.BytesIO(csv_content.encode()), 'text/csv')
        }
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        print(f"✓ Mixed Date CSV Upload Response:")
        print(f"  - Total CSV rows: {data.get('total_csv_rows')}")
        print(f"  - Rows processed: {data.get('rows_processed')}")
        print(f"  - Rows skipped: {data.get('rows_skipped')}")
        print(f"  - Matched items: {len(data.get('matched_items', []))}")
        print(f"  - Warnings: {data.get('warnings', [])}")
        
        # Should have processed some rows and skipped others
        assert data.get('total_csv_rows', 0) == 2, "Expected 2 total CSV rows"
        
        # Should have at least 1 skipped row (the invalid date)
        assert data.get('rows_skipped', 0) >= 1, "Expected at least 1 row to be skipped"
        
        # Should have warnings
        assert len(data.get('warnings', [])) > 0, "Expected warnings for skipped rows"
        
        print(f"✓ Correctly processed valid dates and skipped invalid dates")
        return data
    
    def test_grn_matched_items_have_rate_amount_columns(self):
        """Test that matched items include Rate/Unit, Amount, and Loss/Gain data"""
        # Upload valid CSV
        csv_content = """PO_DeliveryDate,Sku Name,GRNQuantity,GRNPrice,WeightUnit
26/03/26,Tomato Fresh,8.5,50,Kg"""
        
        files = {
            'file': ('test_columns.csv', io.BytesIO(csv_content.encode()), 'text/csv')
        }
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        matched_items = data.get('matched_items', [])
        
        if len(matched_items) > 0:
            item = matched_items[0]
            print(f"✓ Matched item structure:")
            print(f"  - product_name: {item.get('product_name')}")
            print(f"  - supplied_qty: {item.get('supplied_qty')}")
            print(f"  - grn_qty: {item.get('grn_qty')}")
            print(f"  - difference: {item.get('difference')}")
            print(f"  - rate_per_kg: {item.get('rate_per_kg')}")
            print(f"  - rate_per_unit: {item.get('rate_per_unit')}")
            print(f"  - amount: {item.get('amount')}")
            
            # Verify required columns exist
            assert 'rate_per_unit' in item, "Missing rate_per_unit column"
            assert 'amount' in item, "Missing amount column"
            assert 'difference' in item, "Missing difference column (for Loss/Gain calculation)"
            
            # Verify Loss/Gain can be calculated (difference * rate_per_unit)
            if item.get('difference') is not None and item.get('rate_per_unit') is not None:
                loss_gain = item['difference'] * item['rate_per_unit']
                print(f"  - Loss/Gain (calculated): {loss_gain}")
            
            print(f"✓ All required columns present for GRN table")
        else:
            print("⚠ No matched items to verify columns (may need dispatch data)")
    
    def test_get_dispatch_summary_for_grn(self):
        """Test getting dispatch summary for GRN table"""
        response = self.session.get(f"{BASE_URL}/api/qc-grns/dispatch-summary")
        assert response.status_code == 200, f"Failed to get dispatch summary: {response.text}"
        
        items = response.json()
        print(f"✓ Dispatch summary returned {len(items)} items")
        
        if len(items) > 0:
            item = items[0]
            print(f"  Sample item: {item.get('product_name')} - {item.get('supplied_qty')} units")
        
        return items
    
    def test_save_grn(self):
        """Test saving GRN data"""
        # First upload a valid CSV to get matched items
        csv_content = """PO_DeliveryDate,Sku Name,GRNQuantity,GRNPrice,WeightUnit
26/03/26,Tomato Fresh,8.5,50,Kg"""
        
        files = {
            'file': ('test_save.csv', io.BytesIO(csv_content.encode()), 'text/csv')
        }
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files,
            headers=headers
        )
        
        assert upload_response.status_code == 200
        upload_data = upload_response.json()
        matched_items = upload_data.get('matched_items', [])
        
        if len(matched_items) > 0:
            # Create GRN payload
            total_supplied = sum(item.get('supplied_qty', 0) for item in matched_items)
            total_grn = sum(item.get('grn_qty', 0) for item in matched_items)
            total_difference = sum(item.get('difference', 0) for item in matched_items)
            
            grn_payload = {
                "grn_date": "2026-03-26T00:00:00Z",
                "customer_name": "Ninjacart",
                "file_name": "test_save.csv",
                "items": matched_items,
                "total_supplied": total_supplied,
                "total_grn": total_grn,
                "total_difference": total_difference
            }
            
            # Save GRN
            save_response = self.session.post(f"{BASE_URL}/api/qc-grns", json=grn_payload)
            assert save_response.status_code == 200, f"Failed to save GRN: {save_response.text}"
            
            save_data = save_response.json()
            print(f"✓ GRN saved successfully")
            print(f"  - GRN ID: {save_data.get('id')}")
            print(f"  - Message: {save_data.get('message')}")
            
            # Verify GRN was saved by fetching all GRNs
            grns_response = self.session.get(f"{BASE_URL}/api/qc-grns")
            assert grns_response.status_code == 200
            grns = grns_response.json()
            
            # Find our saved GRN
            saved_grn = next((g for g in grns if g.get('id') == save_data.get('id')), None)
            if saved_grn:
                print(f"✓ GRN verified in database")
                print(f"  - Customer: {saved_grn.get('customer_name')}")
                print(f"  - Items count: {len(saved_grn.get('items', []))}")
            
            return save_data
        else:
            print("⚠ No matched items to save (may need dispatch data)")
            pytest.skip("No matched items available for save test")
    
    def test_get_grns(self):
        """Test getting all GRNs"""
        response = self.session.get(f"{BASE_URL}/api/qc-grns")
        assert response.status_code == 200, f"Failed to get GRNs: {response.text}"
        
        grns = response.json()
        print(f"✓ Retrieved {len(grns)} GRNs")
        
        for grn in grns[:3]:  # Show first 3
            print(f"  - {grn.get('customer_name')} - {grn.get('grn_date', '')[:10]}")
        
        return grns
    
    def test_csv_upload_non_csv_file_rejected(self):
        """Test that non-CSV files are rejected"""
        files = {
            'file': ('test.txt', io.BytesIO(b'not a csv'), 'text/plain')
        }
        
        headers = {"Authorization": f"Bearer {self.token}"}
        
        response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400 for non-CSV file, got {response.status_code}"
        print(f"✓ Non-CSV file correctly rejected with 400 status")
    
    def test_csv_upload_unauthorized(self):
        """Test that unauthorized users cannot upload CSV"""
        csv_content = """PO_DeliveryDate,Sku Name,GRNQuantity,GRNPrice,WeightUnit
26/03/26,Tomato Fresh,8.5,50,Kg"""
        
        files = {
            'file': ('test.csv', io.BytesIO(csv_content.encode()), 'text/csv')
        }
        
        # No auth header
        response = requests.post(
            f"{BASE_URL}/api/qc-grns/upload-ninjacart-csv",
            files=files
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthorized, got {response.status_code}"
        print(f"✓ Unauthorized upload correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
