"""
Test Wastage Distribution and Retail Dashboard Mismatch Fix
============================================================
Tests for:
1. Wastage should be distributed proportionally by actual Kg supplied (not by sales %)
2. Retail dashboard values should match sum of line item values instead of proportional allocation

Key assertions:
- vertical_bifurcation.retail.purchase === sum(retail_items.cogs)
- vertical_bifurcation.retail.wastage === sum(retail_items.wastage_value)
- vertical_bifurcation.qc.purchase === sum(qc_items.cogs)
- vertical_bifurcation.qc.wastage === sum(qc_items.wastage_value)
- Wastage distribution uses actual Kg ratio (line_kg / total_kg) not sales ratio
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWastageDistributionFix:
    """Test wastage distribution and vertical bifurcation calculations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_qc_only_date_vertical_bifurcation(self):
        """
        Test date 2026-03-29 (QC only) - QC dashboard values should match sum of QC line items
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-29&to_date=2026-03-29")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        
        # Get vertical bifurcation
        vertical = data.get("vertical_bifurcation", {})
        qc_vertical = vertical.get("qc", {})
        retail_vertical = vertical.get("retail", {})
        
        # Get line items from daily_pnl
        daily_pnl = data.get("daily_pnl", [])
        
        # Calculate sum of QC and Retail line items
        qc_cogs_sum = 0
        qc_wastage_sum = 0
        retail_cogs_sum = 0
        retail_wastage_sum = 0
        
        for day in daily_pnl:
            for item in day.get("line_items", []):
                if item.get("customer_type") == "QC":
                    qc_cogs_sum += item.get("cogs", 0)
                    qc_wastage_sum += item.get("wastage_value", 0)
                else:  # Retail
                    retail_cogs_sum += item.get("cogs", 0)
                    retail_wastage_sum += item.get("wastage_value", 0)
        
        # Assert QC vertical matches sum of QC line items
        qc_purchase_vertical = qc_vertical.get("purchase", 0)
        qc_wastage_vertical = qc_vertical.get("wastage", 0)
        
        print(f"\n=== QC Only Date (2026-03-29) ===")
        print(f"QC Vertical Purchase: {qc_purchase_vertical}")
        print(f"Sum of QC Line Item COGS: {round(qc_cogs_sum, 2)}")
        print(f"QC Vertical Wastage: {qc_wastage_vertical}")
        print(f"Sum of QC Line Item Wastage: {round(qc_wastage_sum, 2)}")
        
        # QC purchase should equal sum of QC line item COGS
        assert abs(qc_purchase_vertical - qc_cogs_sum) < 0.01, \
            f"QC purchase mismatch: vertical={qc_purchase_vertical}, sum={qc_cogs_sum}"
        
        # QC wastage should equal sum of QC line item wastage
        assert abs(qc_wastage_vertical - qc_wastage_sum) < 0.01, \
            f"QC wastage mismatch: vertical={qc_wastage_vertical}, sum={qc_wastage_sum}"
        
        print("PASS: QC vertical bifurcation matches sum of line items")
    
    def test_retail_only_date_vertical_bifurcation(self):
        """
        Test date 2026-03-18 (Retail only with no procurement/wastage)
        Retail dashboard values should match sum of retail line items
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        
        # Get vertical bifurcation
        vertical = data.get("vertical_bifurcation", {})
        retail_vertical = vertical.get("retail", {})
        
        # Get line items from daily_pnl
        daily_pnl = data.get("daily_pnl", [])
        
        # Calculate sum of Retail line items
        retail_cogs_sum = 0
        retail_wastage_sum = 0
        
        for day in daily_pnl:
            for item in day.get("line_items", []):
                if item.get("customer_type") == "Retail":
                    retail_cogs_sum += item.get("cogs", 0)
                    retail_wastage_sum += item.get("wastage_value", 0)
        
        # Assert Retail vertical matches sum of Retail line items
        retail_purchase_vertical = retail_vertical.get("purchase", 0)
        retail_wastage_vertical = retail_vertical.get("wastage", 0)
        
        print(f"\n=== Retail Only Date (2026-03-18) ===")
        print(f"Retail Vertical Purchase: {retail_purchase_vertical}")
        print(f"Sum of Retail Line Item COGS: {round(retail_cogs_sum, 2)}")
        print(f"Retail Vertical Wastage: {retail_wastage_vertical}")
        print(f"Sum of Retail Line Item Wastage: {round(retail_wastage_sum, 2)}")
        
        # Retail purchase should equal sum of retail line item COGS
        assert abs(retail_purchase_vertical - retail_cogs_sum) < 0.01, \
            f"Retail purchase mismatch: vertical={retail_purchase_vertical}, sum={retail_cogs_sum}"
        
        # Retail wastage should equal sum of retail line item wastage
        assert abs(retail_wastage_vertical - retail_wastage_sum) < 0.01, \
            f"Retail wastage mismatch: vertical={retail_wastage_vertical}, sum={retail_wastage_sum}"
        
        print("PASS: Retail vertical bifurcation matches sum of line items")
    
    def test_mixed_date_vertical_bifurcation(self):
        """
        Test a date range with both QC and Retail data
        Both QC and Retail dashboard values should match sum of respective line items
        """
        # Use a date range that likely has both QC and Retail
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        
        # Get vertical bifurcation
        vertical = data.get("vertical_bifurcation", {})
        qc_vertical = vertical.get("qc", {})
        retail_vertical = vertical.get("retail", {})
        
        # Get line items from daily_pnl
        daily_pnl = data.get("daily_pnl", [])
        
        # Calculate sum of QC and Retail line items
        qc_cogs_sum = 0
        qc_wastage_sum = 0
        retail_cogs_sum = 0
        retail_wastage_sum = 0
        
        for day in daily_pnl:
            for item in day.get("line_items", []):
                if item.get("customer_type") == "QC":
                    qc_cogs_sum += item.get("cogs", 0)
                    qc_wastage_sum += item.get("wastage_value", 0)
                else:  # Retail
                    retail_cogs_sum += item.get("cogs", 0)
                    retail_wastage_sum += item.get("wastage_value", 0)
        
        # Get vertical values
        qc_purchase_vertical = qc_vertical.get("purchase", 0)
        qc_wastage_vertical = qc_vertical.get("wastage", 0)
        retail_purchase_vertical = retail_vertical.get("purchase", 0)
        retail_wastage_vertical = retail_vertical.get("wastage", 0)
        
        print(f"\n=== Mixed Date Range (March 2026) ===")
        print(f"QC Vertical Purchase: {qc_purchase_vertical}, Sum of Line Items: {round(qc_cogs_sum, 2)}")
        print(f"QC Vertical Wastage: {qc_wastage_vertical}, Sum of Line Items: {round(qc_wastage_sum, 2)}")
        print(f"Retail Vertical Purchase: {retail_purchase_vertical}, Sum of Line Items: {round(retail_cogs_sum, 2)}")
        print(f"Retail Vertical Wastage: {retail_wastage_vertical}, Sum of Line Items: {round(retail_wastage_sum, 2)}")
        
        # QC assertions
        assert abs(qc_purchase_vertical - qc_cogs_sum) < 0.01, \
            f"QC purchase mismatch: vertical={qc_purchase_vertical}, sum={qc_cogs_sum}"
        assert abs(qc_wastage_vertical - qc_wastage_sum) < 0.01, \
            f"QC wastage mismatch: vertical={qc_wastage_vertical}, sum={qc_wastage_sum}"
        
        # Retail assertions
        assert abs(retail_purchase_vertical - retail_cogs_sum) < 0.01, \
            f"Retail purchase mismatch: vertical={retail_purchase_vertical}, sum={retail_cogs_sum}"
        assert abs(retail_wastage_vertical - retail_wastage_sum) < 0.01, \
            f"Retail wastage mismatch: vertical={retail_wastage_vertical}, sum={retail_wastage_sum}"
        
        print("PASS: Both QC and Retail vertical bifurcation match sum of line items")
    
    def test_wastage_distribution_uses_kg_ratio(self):
        """
        Test that wastage is distributed proportionally by actual Kg supplied (not by sales %)
        
        For a product with multiple line items:
        - If line A supplies 50 kg and line B supplies 30 kg
        - Total wastage should be distributed as 50:30 ratio (62.5% : 37.5%)
        - NOT by sales percentage
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        
        # Find a product that has multiple line items on the same day
        # Group line items by date and product
        product_groups = {}  # {(date, product): [items]}
        
        for day in daily_pnl:
            date = day.get("date")
            for item in day.get("line_items", []):
                product = item.get("product")
                key = (date, product)
                if key not in product_groups:
                    product_groups[key] = []
                product_groups[key].append(item)
        
        # Find groups with multiple items and non-zero wastage
        multi_item_groups = {k: v for k, v in product_groups.items() 
                           if len(v) > 1 and sum(i.get("wastage_value", 0) for i in v) > 0}
        
        print(f"\n=== Wastage Distribution by Kg Ratio ===")
        print(f"Found {len(multi_item_groups)} product groups with multiple line items and wastage")
        
        if not multi_item_groups:
            print("No multi-item groups with wastage found - skipping detailed ratio check")
            pytest.skip("No multi-item groups with wastage to verify ratio")
        
        # Verify wastage distribution for each group
        for (date, product), items in list(multi_item_groups.items())[:3]:  # Check first 3
            total_kg = sum(i.get("supplied_kg", 0) for i in items)
            total_wastage = sum(i.get("wastage_value", 0) for i in items)
            
            if total_kg == 0 or total_wastage == 0:
                continue
            
            print(f"\nProduct: {product} on {date}")
            print(f"Total Kg: {total_kg}, Total Wastage: {total_wastage}")
            
            for item in items:
                kg = item.get("supplied_kg", 0)
                wastage = item.get("wastage_value", 0)
                revenue = item.get("revenue", 0)
                customer = item.get("customer", "Unknown")
                
                expected_kg_ratio = kg / total_kg if total_kg > 0 else 0
                expected_wastage = expected_kg_ratio * total_wastage
                actual_wastage_ratio = wastage / total_wastage if total_wastage > 0 else 0
                
                print(f"  {customer}: {kg} kg ({expected_kg_ratio*100:.1f}%), wastage={wastage} (expected={expected_wastage:.2f})")
                
                # Verify wastage is distributed by kg ratio (with small tolerance for rounding)
                if total_wastage > 0:
                    assert abs(wastage - expected_wastage) < 0.1, \
                        f"Wastage not distributed by kg ratio: actual={wastage}, expected={expected_wastage}"
        
        print("\nPASS: Wastage is distributed proportionally by Kg supplied")
    
    def test_vertical_bifurcation_structure(self):
        """
        Test that vertical_bifurcation has correct structure with purchase and wastage fields
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-29&to_date=2026-03-29")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        vertical = data.get("vertical_bifurcation", {})
        
        # Check QC structure
        qc = vertical.get("qc", {})
        assert "purchase" in qc, "QC vertical missing 'purchase' field"
        assert "wastage" in qc, "QC vertical missing 'wastage' field"
        assert "sales" in qc, "QC vertical missing 'sales' field"
        assert "gross_profit" in qc, "QC vertical missing 'gross_profit' field"
        
        # Check Retail structure
        retail = vertical.get("retail", {})
        assert "purchase" in retail, "Retail vertical missing 'purchase' field"
        assert "wastage" in retail, "Retail vertical missing 'wastage' field"
        assert "sales" in retail, "Retail vertical missing 'sales' field"
        assert "gross_profit" in retail, "Retail vertical missing 'gross_profit' field"
        assert "commission" in retail, "Retail vertical missing 'commission' field"
        assert "rejection" in retail, "Retail vertical missing 'rejection' field"
        
        print("\n=== Vertical Bifurcation Structure ===")
        print(f"QC: {qc}")
        print(f"Retail: {retail}")
        print("PASS: Vertical bifurcation has correct structure")
    
    def test_line_items_have_required_fields(self):
        """
        Test that line items have cogs and wastage_value fields
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-29&to_date=2026-03-29")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        
        line_item_count = 0
        for day in daily_pnl:
            for item in day.get("line_items", []):
                line_item_count += 1
                assert "cogs" in item, f"Line item missing 'cogs' field: {item}"
                assert "wastage_value" in item, f"Line item missing 'wastage_value' field: {item}"
                assert "customer_type" in item, f"Line item missing 'customer_type' field: {item}"
                assert "supplied_kg" in item, f"Line item missing 'supplied_kg' field: {item}"
        
        print(f"\n=== Line Items Structure ===")
        print(f"Checked {line_item_count} line items")
        print("PASS: All line items have required fields (cogs, wastage_value, customer_type, supplied_kg)")


class TestSummaryTotalsMatch:
    """Test that summary totals match sum of line items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_total_purchase_equals_sum_of_cogs(self):
        """
        Test that total_purchase in summary equals sum of all line item COGS
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        summary = data.get("summary", {})
        daily_pnl = data.get("daily_pnl", [])
        vertical = data.get("vertical_bifurcation", {})
        
        # Sum all line item COGS
        total_cogs_from_items = 0
        for day in daily_pnl:
            for item in day.get("line_items", []):
                total_cogs_from_items += item.get("cogs", 0)
        
        # Get vertical totals
        qc_purchase = vertical.get("qc", {}).get("purchase", 0)
        retail_purchase = vertical.get("retail", {}).get("purchase", 0)
        vertical_total = qc_purchase + retail_purchase
        
        print(f"\n=== Total Purchase Verification ===")
        print(f"Sum of all line item COGS: {round(total_cogs_from_items, 2)}")
        print(f"QC Purchase + Retail Purchase: {round(vertical_total, 2)}")
        
        # Vertical total should equal sum of line items
        assert abs(vertical_total - total_cogs_from_items) < 0.01, \
            f"Vertical total mismatch: {vertical_total} vs {total_cogs_from_items}"
        
        print("PASS: Vertical purchase totals match sum of line item COGS")
    
    def test_total_wastage_equals_sum_of_wastage_values(self):
        """
        Test that total wastage in verticals equals sum of all line item wastage_value
        """
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-01&to_date=2026-03-31")
        assert response.status_code == 200, f"P&L API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        vertical = data.get("vertical_bifurcation", {})
        
        # Sum all line item wastage
        total_wastage_from_items = 0
        for day in daily_pnl:
            for item in day.get("line_items", []):
                total_wastage_from_items += item.get("wastage_value", 0)
        
        # Get vertical totals
        qc_wastage = vertical.get("qc", {}).get("wastage", 0)
        retail_wastage = vertical.get("retail", {}).get("wastage", 0)
        vertical_total = qc_wastage + retail_wastage
        
        print(f"\n=== Total Wastage Verification ===")
        print(f"Sum of all line item wastage_value: {round(total_wastage_from_items, 2)}")
        print(f"QC Wastage + Retail Wastage: {round(vertical_total, 2)}")
        
        # Vertical total should equal sum of line items
        assert abs(vertical_total - total_wastage_from_items) < 0.01, \
            f"Vertical wastage mismatch: {vertical_total} vs {total_wastage_from_items}"
        
        print("PASS: Vertical wastage totals match sum of line item wastage_value")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
