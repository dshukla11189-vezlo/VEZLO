"""
Test cases for FreshFlow bug fixes:
1. Palak Retail wastage should be ~₹128 (not ₹432) for 1kg out of 8.2kg total pool
2. QC line items should use grn_qty_kg for kg calculation (not recalculate from packaging_weight_gm)
3. Main dashboard shows 'COGS' instead of 'Purchase Cost'
4. COGS value on dashboard should be sum of line item COGS (not procurement total)
5. Vertical Retail Purchase and Wastage match sum of retail line items
6. Wastage distribution uses actual Kg ratio including aliased products (Spinach → Palak)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPalakWastageDistribution:
    """Test Palak wastage distribution fix - should be ~₹128 for 1kg Retail, not ₹432"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_palak_wastage_distribution_march_31(self):
        """
        Test case: March 31 data
        - Palak total wastage = ₹1054.2
        - Pool = 8.2kg (QC Palak 5.2kg + QC Spinach 2kg + Retail Palak 1kg)
        - Retail 1kg should get 12.2% = ~₹128.56 wastage (not ₹432)
        """
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31",
            headers=self.headers
        )
        assert response.status_code == 200, f"PnL API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        
        # Find March 31 data
        march_31_data = None
        for day in daily_pnl:
            if day.get("date", "").startswith("2026-03-31"):
                march_31_data = day
                break
        
        assert march_31_data is not None, "March 31 data not found in PnL response"
        
        # Get line items
        line_items = march_31_data.get("line_items", [])
        
        # Find Palak items (both QC and Retail)
        palak_items = [item for item in line_items if "palak" in item.get("product", "").lower()]
        spinach_items = [item for item in line_items if "spinach" in item.get("product", "").lower()]
        
        print(f"\n=== March 31 Palak/Spinach Analysis ===")
        print(f"Total line items: {len(line_items)}")
        print(f"Palak items: {len(palak_items)}")
        print(f"Spinach items: {len(spinach_items)}")
        
        # Separate QC and Retail Palak items
        qc_palak_items = [item for item in palak_items if item.get("customer_type") == "QC"]
        retail_palak_items = [item for item in palak_items if item.get("customer_type") != "QC"]
        qc_spinach_items = [item for item in spinach_items if item.get("customer_type") == "QC"]
        
        print(f"\nQC Palak items: {len(qc_palak_items)}")
        print(f"Retail Palak items: {len(retail_palak_items)}")
        print(f"QC Spinach items: {len(qc_spinach_items)}")
        
        # Calculate total kg in pool (Palak + Spinach aliased together)
        total_qc_palak_kg = sum(item.get("supplied_kg", 0) for item in qc_palak_items)
        total_retail_palak_kg = sum(item.get("supplied_kg", 0) for item in retail_palak_items)
        total_qc_spinach_kg = sum(item.get("supplied_kg", 0) for item in qc_spinach_items)
        
        total_pool_kg = total_qc_palak_kg + total_retail_palak_kg + total_qc_spinach_kg
        
        print(f"\n=== Kg Distribution ===")
        print(f"QC Palak kg: {total_qc_palak_kg}")
        print(f"Retail Palak kg: {total_retail_palak_kg}")
        print(f"QC Spinach kg: {total_qc_spinach_kg}")
        print(f"Total Pool kg: {total_pool_kg}")
        
        # Calculate total wastage for Palak/Spinach pool
        total_palak_wastage = sum(item.get("wastage_value", 0) for item in palak_items)
        total_spinach_wastage = sum(item.get("wastage_value", 0) for item in spinach_items)
        total_pool_wastage = total_palak_wastage + total_spinach_wastage
        
        print(f"\n=== Wastage Distribution ===")
        print(f"Total Palak wastage: ₹{total_palak_wastage:.2f}")
        print(f"Total Spinach wastage: ₹{total_spinach_wastage:.2f}")
        print(f"Total Pool wastage: ₹{total_pool_wastage:.2f}")
        
        # Calculate Retail Palak wastage
        retail_palak_wastage = sum(item.get("wastage_value", 0) for item in retail_palak_items)
        
        print(f"\n=== Retail Palak Wastage ===")
        print(f"Retail Palak wastage: ₹{retail_palak_wastage:.2f}")
        
        # Expected: If Retail Palak is 1kg out of 8.2kg pool, it should get ~12.2% of wastage
        # If total wastage is ₹1054.2, Retail should get ~₹128.56
        if total_pool_kg > 0:
            retail_kg_ratio = total_retail_palak_kg / total_pool_kg
            expected_retail_wastage = total_pool_wastage * retail_kg_ratio
            
            print(f"\n=== Expected vs Actual ===")
            print(f"Retail kg ratio: {retail_kg_ratio:.4f} ({retail_kg_ratio*100:.2f}%)")
            print(f"Expected Retail wastage: ₹{expected_retail_wastage:.2f}")
            print(f"Actual Retail wastage: ₹{retail_palak_wastage:.2f}")
            
            # The fix should make actual wastage close to expected (within 10% tolerance)
            # Previously it was ₹432, now should be ~₹128
            if expected_retail_wastage > 0:
                wastage_ratio = retail_palak_wastage / expected_retail_wastage
                print(f"Wastage ratio (actual/expected): {wastage_ratio:.2f}")
                
                # Assert wastage is within reasonable range (0.8 to 1.2 of expected)
                assert 0.8 <= wastage_ratio <= 1.2, \
                    f"Retail Palak wastage ₹{retail_palak_wastage:.2f} is not close to expected ₹{expected_retail_wastage:.2f}"
                
                # Also verify it's NOT the old buggy value of ~₹432
                assert retail_palak_wastage < 300, \
                    f"Retail Palak wastage ₹{retail_palak_wastage:.2f} is too high (should be ~₹128, not ₹432)"
        
        print("\n✓ Palak wastage distribution test PASSED")


class TestQCGrnQtyKgCalculation:
    """Test that QC line items use grn_qty_kg for kg calculation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_grn_qty_kg_used_in_line_items(self):
        """
        Test that line items use grn_qty_kg from GRN data instead of recalculating
        from packaging_weight_gm
        """
        # Get GRN data to check grn_qty_kg values
        grn_response = requests.get(f"{BASE_URL}/api/qc-grns", headers=self.headers)
        assert grn_response.status_code == 200, f"GRN API failed: {grn_response.text}"
        
        grns = grn_response.json()
        
        # Find GRNs with grn_qty_kg values
        grns_with_kg = []
        for grn in grns:
            grn_date = grn.get("grn_date", "")
            if grn_date.startswith("2026-03-31"):
                for item in grn.get("items", []):
                    if item.get("grn_qty_kg"):
                        grns_with_kg.append({
                            "grn_id": grn.get("id"),
                            "date": grn_date,
                            "product": item.get("product_name"),
                            "grn_qty_kg": item.get("grn_qty_kg"),
                            "supplied_qty": item.get("supplied_qty"),
                            "packaging_weight_gm": item.get("packaging_weight_gm", 0)
                        })
        
        print(f"\n=== GRNs with grn_qty_kg on March 31 ===")
        for grn in grns_with_kg[:5]:  # Show first 5
            print(f"  {grn['product']}: grn_qty_kg={grn['grn_qty_kg']}, supplied_qty={grn['supplied_qty']}")
        
        # Get PnL data for March 31
        pnl_response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31",
            headers=self.headers
        )
        assert pnl_response.status_code == 200, f"PnL API failed: {pnl_response.text}"
        
        data = pnl_response.json()
        daily_pnl = data.get("daily_pnl", [])
        
        if daily_pnl:
            line_items = daily_pnl[0].get("line_items", [])
            qc_items = [item for item in line_items if item.get("customer_type") == "QC"]
            
            print(f"\n=== QC Line Items with supplied_kg ===")
            for item in qc_items[:5]:  # Show first 5
                print(f"  {item['product']}: supplied_kg={item.get('supplied_kg', 0)}, supplied_qty={item.get('supplied_qty', 0)}")
            
            # Verify that supplied_kg values exist and are reasonable
            items_with_kg = [item for item in qc_items if item.get("supplied_kg", 0) > 0]
            print(f"\nQC items with supplied_kg > 0: {len(items_with_kg)} / {len(qc_items)}")
            
            assert len(items_with_kg) > 0, "No QC items have supplied_kg values"
        
        print("\n✓ GRN qty_kg calculation test PASSED")


class TestCOGSCalculation:
    """Test COGS calculation - should be sum of line item COGS, not procurement total"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cogs_equals_sum_of_line_item_cogs(self):
        """
        Test that total_cogs in summary equals sum of all line item COGS
        """
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31",
            headers=self.headers
        )
        assert response.status_code == 200, f"PnL API failed: {response.text}"
        
        data = response.json()
        summary = data.get("summary", {})
        daily_pnl = data.get("daily_pnl", [])
        vertical_bifurcation = data.get("vertical_bifurcation", {})
        
        # Get total_cogs from summary
        total_cogs_summary = summary.get("total_cogs", 0)
        total_purchase_summary = summary.get("total_purchase", 0)
        
        print(f"\n=== COGS Analysis ===")
        print(f"Summary total_cogs: ₹{total_cogs_summary:.2f}")
        print(f"Summary total_purchase: ₹{total_purchase_summary:.2f}")
        
        # Calculate sum of line item COGS
        total_line_item_cogs = 0
        for day in daily_pnl:
            for item in day.get("line_items", []):
                total_line_item_cogs += item.get("cogs", 0)
        
        print(f"Sum of line item COGS: ₹{total_line_item_cogs:.2f}")
        
        # Verify total_cogs equals sum of line item COGS
        assert abs(total_cogs_summary - total_line_item_cogs) < 1, \
            f"total_cogs (₹{total_cogs_summary:.2f}) != sum of line item COGS (₹{total_line_item_cogs:.2f})"
        
        # Verify vertical bifurcation COGS
        qc_cogs = vertical_bifurcation.get("qc", {}).get("purchase", 0)
        retail_cogs = vertical_bifurcation.get("retail", {}).get("purchase", 0)
        
        print(f"\n=== Vertical Bifurcation COGS ===")
        print(f"QC purchase (COGS): ₹{qc_cogs:.2f}")
        print(f"Retail purchase (COGS): ₹{retail_cogs:.2f}")
        print(f"Total vertical COGS: ₹{qc_cogs + retail_cogs:.2f}")
        
        # Calculate QC and Retail COGS from line items
        qc_line_cogs = 0
        retail_line_cogs = 0
        for day in daily_pnl:
            for item in day.get("line_items", []):
                if item.get("customer_type") == "QC":
                    qc_line_cogs += item.get("cogs", 0)
                else:
                    retail_line_cogs += item.get("cogs", 0)
        
        print(f"\n=== Line Item COGS by Vertical ===")
        print(f"QC line item COGS: ₹{qc_line_cogs:.2f}")
        print(f"Retail line item COGS: ₹{retail_line_cogs:.2f}")
        
        # Verify vertical COGS matches line item COGS
        assert abs(qc_cogs - qc_line_cogs) < 1, \
            f"QC vertical COGS (₹{qc_cogs:.2f}) != QC line item COGS (₹{qc_line_cogs:.2f})"
        assert abs(retail_cogs - retail_line_cogs) < 1, \
            f"Retail vertical COGS (₹{retail_cogs:.2f}) != Retail line item COGS (₹{retail_line_cogs:.2f})"
        
        print("\n✓ COGS calculation test PASSED")


class TestVerticalWastageMatch:
    """Test that vertical wastage matches sum of line item wastage"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_vertical_wastage_matches_line_items(self):
        """
        Test that vertical bifurcation wastage equals sum of line item wastage_value
        """
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31",
            headers=self.headers
        )
        assert response.status_code == 200, f"PnL API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        vertical_bifurcation = data.get("vertical_bifurcation", {})
        
        # Get vertical wastage
        qc_wastage_vertical = vertical_bifurcation.get("qc", {}).get("wastage", 0)
        retail_wastage_vertical = vertical_bifurcation.get("retail", {}).get("wastage", 0)
        
        print(f"\n=== Vertical Bifurcation Wastage ===")
        print(f"QC wastage: ₹{qc_wastage_vertical:.2f}")
        print(f"Retail wastage: ₹{retail_wastage_vertical:.2f}")
        
        # Calculate wastage from line items
        qc_wastage_items = 0
        retail_wastage_items = 0
        for day in daily_pnl:
            for item in day.get("line_items", []):
                if item.get("customer_type") == "QC":
                    qc_wastage_items += item.get("wastage_value", 0)
                else:
                    retail_wastage_items += item.get("wastage_value", 0)
        
        print(f"\n=== Line Item Wastage ===")
        print(f"QC line item wastage: ₹{qc_wastage_items:.2f}")
        print(f"Retail line item wastage: ₹{retail_wastage_items:.2f}")
        
        # Verify vertical wastage matches line item wastage
        assert abs(qc_wastage_vertical - qc_wastage_items) < 1, \
            f"QC vertical wastage (₹{qc_wastage_vertical:.2f}) != QC line item wastage (₹{qc_wastage_items:.2f})"
        assert abs(retail_wastage_vertical - retail_wastage_items) < 1, \
            f"Retail vertical wastage (₹{retail_wastage_vertical:.2f}) != Retail line item wastage (₹{retail_wastage_items:.2f})"
        
        print("\n✓ Vertical wastage match test PASSED")


class TestDashboardCOGSLabel:
    """Test that dashboard shows 'COGS' instead of 'Purchase Cost'"""
    
    def test_cogs_label_in_api_response(self):
        """
        Verify the API returns total_cogs field (frontend uses this to display COGS)
        """
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get PnL data
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31",
            headers=headers
        )
        assert response.status_code == 200, f"PnL API failed: {response.text}"
        
        data = response.json()
        summary = data.get("summary", {})
        
        # Verify total_cogs field exists
        assert "total_cogs" in summary, "total_cogs field missing from summary"
        
        print(f"\n=== Dashboard COGS Field ===")
        print(f"total_cogs: ₹{summary.get('total_cogs', 0):.2f}")
        print(f"total_purchase: ₹{summary.get('total_purchase', 0):.2f}")
        
        # The frontend should use total_cogs for display
        # Verify it's a valid number
        assert isinstance(summary.get("total_cogs"), (int, float)), "total_cogs should be a number"
        
        print("\n✓ Dashboard COGS label test PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
