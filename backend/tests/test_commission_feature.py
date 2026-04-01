"""
Test Commission Feature for Retail Products
============================================
Tests that commission is correctly calculated and displayed at all levels:
- Product level: commission = revenue * commission_pct / 100
- Customer level: sum of product commissions
- Vertical level: sum of customer commissions
- Date level: sum of vertical commissions

Test date: 2026-03-18 (has retail data with 20% commission)
Retailer: Ghisendra Choudhary (company: Tamanna Mart) with 20% commission
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCommissionFeature:
    """Test commission calculations for retail products"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_01_retailer_has_commission_percentage(self):
        """Verify retailer Ghisendra Choudhary has 20% commission"""
        response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        assert response.status_code == 200
        
        users = response.json()
        ghisendra = next((u for u in users if "Ghisendra" in u.get("name", "")), None)
        
        assert ghisendra is not None, "Retailer Ghisendra Choudhary not found"
        assert ghisendra.get("commission_percentage") == 20, f"Expected 20% commission, got {ghisendra.get('commission_percentage')}"
        assert ghisendra.get("company_name") == "Tamanna Mart", f"Expected company Tamanna Mart, got {ghisendra.get('company_name')}"
        print(f"PASS: Retailer {ghisendra['name']} has {ghisendra['commission_percentage']}% commission")
    
    def test_02_pnl_api_returns_commission_in_line_items(self):
        """Verify P&L API returns commission field in each retail line item"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        assert len(daily_pnl) > 0, "No daily P&L data found for 2026-03-18"
        
        day = daily_pnl[0]
        line_items = day.get("line_items", [])
        assert len(line_items) > 0, "No line items found"
        
        # Check each line item has commission field
        for item in line_items:
            assert "commission" in item, f"Commission field missing in line item: {item}"
            assert item["customer_type"] == "Retail", f"Expected Retail customer type, got {item['customer_type']}"
        
        print(f"PASS: All {len(line_items)} line items have commission field")
    
    def test_03_product_commission_equals_revenue_times_commission_pct(self):
        """Verify each product commission = revenue * 20%"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        line_items = data["daily_pnl"][0]["line_items"]
        
        commission_pct = 20  # 20% commission for this retailer
        
        for item in line_items:
            expected_commission = item["revenue"] * commission_pct / 100
            actual_commission = item["commission"]
            
            # Allow small floating point differences
            assert abs(actual_commission - expected_commission) < 0.01, \
                f"Product {item['product']}: Expected commission {expected_commission}, got {actual_commission}"
            
            print(f"  {item['product']}: Revenue ₹{item['revenue']} × 20% = Commission ₹{actual_commission}")
        
        print(f"PASS: All {len(line_items)} products have correct commission (revenue × 20%)")
    
    def test_04_product_gross_profit_includes_commission_deduction(self):
        """Verify Gross P/L = Revenue - COGS - Wastage - Commission"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        line_items = data["daily_pnl"][0]["line_items"]
        
        for item in line_items:
            expected_gross = item["revenue"] - item["cogs"] - item["wastage_value"] - item["commission"]
            actual_gross = item["gross_profit"]
            
            assert abs(actual_gross - expected_gross) < 0.01, \
                f"Product {item['product']}: Expected gross profit {expected_gross}, got {actual_gross}"
        
        print(f"PASS: All products have correct Gross P/L = Revenue - COGS - Wastage - Commission")
    
    def test_05_product_gross_margin_calculated_correctly(self):
        """Verify GM% = (Gross P/L / Revenue) * 100"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        line_items = data["daily_pnl"][0]["line_items"]
        
        for item in line_items:
            if item["revenue"] > 0:
                expected_margin = (item["gross_profit"] / item["revenue"]) * 100
                actual_margin = item["gross_margin"]
                
                assert abs(actual_margin - expected_margin) < 0.1, \
                    f"Product {item['product']}: Expected GM% {expected_margin:.1f}, got {actual_margin}"
        
        print(f"PASS: All products have correct GM% = (Gross P/L / Revenue) × 100")
    
    def test_06_sum_of_product_commissions_equals_customer_commission(self):
        """Verify sum of all product commissions equals customer-level commission"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        line_items = data["daily_pnl"][0]["line_items"]
        
        # Sum all product commissions
        total_product_commission = sum(item["commission"] for item in line_items)
        
        # Get day-level retail commission
        day_retail_commission = data["daily_pnl"][0]["retail_commission"]
        
        assert abs(total_product_commission - day_retail_commission) < 0.01, \
            f"Sum of product commissions ({total_product_commission}) != day retail commission ({day_retail_commission})"
        
        print(f"PASS: Sum of product commissions (₹{total_product_commission}) = Day retail commission (₹{day_retail_commission})")
    
    def test_07_customer_commission_equals_vertical_commission(self):
        """Verify customer-level commission equals retail vertical commission"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        day_retail_commission = data["daily_pnl"][0]["retail_commission"]
        vertical_commission = data["vertical_bifurcation"]["retail"]["commission"]
        summary_commission = data["summary"]["total_retail_commission"]
        
        assert abs(day_retail_commission - vertical_commission) < 0.01, \
            f"Day retail commission ({day_retail_commission}) != Vertical commission ({vertical_commission})"
        
        assert abs(vertical_commission - summary_commission) < 0.01, \
            f"Vertical commission ({vertical_commission}) != Summary commission ({summary_commission})"
        
        print(f"PASS: All commission levels match: ₹{day_retail_commission}")
    
    def test_08_vertical_gross_profit_includes_commission(self):
        """Verify vertical-level Gross Profit = Sales - Purchase - Wastage - Rejection - Commission"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        retail = data["vertical_bifurcation"]["retail"]
        
        expected_gross = retail["sales"] - retail["purchase"] - retail["wastage"] - retail["rejection"] - retail["commission"]
        actual_gross = retail["gross_profit"]
        
        assert abs(actual_gross - expected_gross) < 0.01, \
            f"Expected vertical gross profit {expected_gross}, got {actual_gross}"
        
        print(f"PASS: Vertical Gross Profit = Sales - Purchase - Wastage - Rejection - Commission")
        print(f"  ₹{retail['sales']} - ₹{retail['purchase']} - ₹{retail['wastage']} - ₹{retail['rejection']} - ₹{retail['commission']} = ₹{actual_gross}")
    
    def test_09_summary_gross_profit_includes_commission(self):
        """Verify summary-level Gross Profit includes commission deduction"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        
        expected_gross = (
            summary["total_sales"] - 
            summary["total_purchase"] - 
            summary["total_wastage_value"] - 
            summary["total_retail_rejection"] - 
            summary["total_retail_commission"]
        )
        actual_gross = summary["gross_profit"]
        
        assert abs(actual_gross - expected_gross) < 0.01, \
            f"Expected summary gross profit {expected_gross}, got {actual_gross}"
        
        print(f"PASS: Summary Gross Profit includes commission deduction")
        print(f"  Total Sales: ₹{summary['total_sales']}")
        print(f"  Total Purchase: ₹{summary['total_purchase']}")
        print(f"  Total Wastage: ₹{summary['total_wastage_value']}")
        print(f"  Total Rejection: ₹{summary['total_retail_rejection']}")
        print(f"  Total Commission: ₹{summary['total_retail_commission']}")
        print(f"  Gross Profit: ₹{actual_gross}")
    
    def test_10_commission_only_applies_to_retail_not_qc(self):
        """Verify commission is only applied to retail items, not QC"""
        response = requests.get(
            f"{BASE_URL}/api/reports/pnl?from_date=2026-03-18&to_date=2026-03-18",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        qc = data["vertical_bifurcation"]["qc"]
        
        # QC should not have commission field or it should be 0
        qc_commission = qc.get("commission", 0)
        assert qc_commission == 0, f"QC should not have commission, got {qc_commission}"
        
        print(f"PASS: QC vertical has no commission (as expected)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
