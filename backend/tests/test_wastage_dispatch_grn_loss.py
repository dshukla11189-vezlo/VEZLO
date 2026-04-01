"""
Test: Wastage Distribution using DISPATCH qty (not GRN qty) and GRN LOSS/COMMISSION metrics
=========================================================================================

Features being tested:
1. Wastage distribution uses DISPATCH qty (supplied_qty) not GRN qty (grn_qty_kg)
2. QC sub-dashboard shows GRN LOSS metric next to Wastage
3. QC Net Profit = Gross Profit - GRN Loss - Variable Exp - Fixed Exp
4. Retail sub-dashboard shows COMMISSION metric next to Wastage
5. Palak should use 28kg dispatch qty (not 5.2kg GRN qty) for wastage distribution
6. QC GRN Loss should be positive (dispatched > received)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWastageDispatchAndGRNLoss:
    """Test wastage distribution using dispatch qty and GRN loss metrics"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_pnl_api_returns_grn_loss_for_qc(self):
        """Test that QC vertical includes grn_loss metric"""
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31")
        assert response.status_code == 200, f"PNL API failed: {response.text}"
        
        data = response.json()
        assert "vertical_bifurcation" in data, "Missing vertical_bifurcation in response"
        assert "qc" in data["vertical_bifurcation"], "Missing QC vertical"
        
        qc = data["vertical_bifurcation"]["qc"]
        
        # Verify GRN LOSS field exists
        assert "grn_loss" in qc, "Missing grn_loss field in QC vertical"
        print(f"QC GRN Loss: ₹{qc['grn_loss']}")
        
        # GRN Loss should be >= 0 (dispatched >= received)
        assert qc["grn_loss"] >= 0, f"GRN Loss should be >= 0, got {qc['grn_loss']}"
    
    def test_pnl_api_returns_commission_for_retail(self):
        """Test that Retail vertical includes commission metric"""
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31")
        assert response.status_code == 200, f"PNL API failed: {response.text}"
        
        data = response.json()
        assert "vertical_bifurcation" in data, "Missing vertical_bifurcation in response"
        assert "retail" in data["vertical_bifurcation"], "Missing Retail vertical"
        
        retail = data["vertical_bifurcation"]["retail"]
        
        # Verify COMMISSION field exists
        assert "commission" in retail, "Missing commission field in Retail vertical"
        print(f"Retail Commission: ₹{retail['commission']}")
        
        # Commission should be >= 0
        assert retail["commission"] >= 0, f"Commission should be >= 0, got {retail['commission']}"
    
    def test_qc_net_profit_includes_grn_loss(self):
        """Test that QC Net Profit = Gross Profit - GRN Loss - Variable Exp - Fixed Exp"""
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31")
        assert response.status_code == 200, f"PNL API failed: {response.text}"
        
        data = response.json()
        qc = data["vertical_bifurcation"]["qc"]
        
        gross_profit = qc["gross_profit"]
        grn_loss = qc["grn_loss"]
        variable_exp = qc["variable_exp"]
        fixed_exp = qc["fixed_exp"]
        net_profit = qc["net_profit"]
        
        # Calculate expected net profit
        expected_net_profit = gross_profit - grn_loss - variable_exp - fixed_exp
        
        print(f"QC Gross Profit: ₹{gross_profit}")
        print(f"QC GRN Loss: ₹{grn_loss}")
        print(f"QC Variable Exp: ₹{variable_exp}")
        print(f"QC Fixed Exp: ₹{fixed_exp}")
        print(f"QC Net Profit (actual): ₹{net_profit}")
        print(f"QC Net Profit (expected): ₹{expected_net_profit}")
        
        # Allow small floating point difference
        assert abs(net_profit - expected_net_profit) < 1, \
            f"QC Net Profit mismatch: expected {expected_net_profit}, got {net_profit}"
    
    def test_palak_uses_dispatch_qty_for_wastage(self):
        """Test that Palak uses dispatch qty (28kg) not GRN qty (5.2kg) for wastage distribution"""
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31")
        assert response.status_code == 200, f"PNL API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        
        # Find March 31 data
        march_31_data = None
        for day in daily_pnl:
            if "2026-03-31" in day.get("date", ""):
                march_31_data = day
                break
        
        assert march_31_data is not None, "March 31 data not found"
        
        line_items = march_31_data.get("line_items", [])
        
        # Find Palak items
        palak_items = [item for item in line_items if "palak" in item.get("product", "").lower()]
        
        print(f"Found {len(palak_items)} Palak items on March 31:")
        total_palak_dispatch_kg = 0
        for item in palak_items:
            supplied_kg = item.get("supplied_kg", 0)
            supplied_qty = item.get("supplied_qty", 0)
            customer = item.get("customer", "")
            print(f"  - {customer}: supplied_qty={supplied_qty}, supplied_kg={supplied_kg}kg")
            total_palak_dispatch_kg += supplied_kg
        
        print(f"Total Palak dispatch kg: {total_palak_dispatch_kg}")
        
        # Palak dispatch should be around 28kg (140 units × 200gm = 28kg)
        # Not 5.2kg which was the GRN qty
        assert total_palak_dispatch_kg > 10, \
            f"Palak dispatch kg should be > 10 (expected ~28kg), got {total_palak_dispatch_kg}"
    
    def test_line_items_have_supplied_kg_field(self):
        """Test that line items include supplied_kg field for wastage distribution"""
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31")
        assert response.status_code == 200, f"PNL API failed: {response.text}"
        
        data = response.json()
        daily_pnl = data.get("daily_pnl", [])
        
        if not daily_pnl:
            pytest.skip("No daily PNL data available")
        
        line_items = daily_pnl[0].get("line_items", [])
        
        if not line_items:
            pytest.skip("No line items available")
        
        # Check first few items have supplied_kg
        for item in line_items[:5]:
            assert "supplied_kg" in item, f"Missing supplied_kg in line item: {item}"
            print(f"Product: {item.get('product')}, supplied_kg: {item.get('supplied_kg')}")
    
    def test_vertical_bifurcation_structure(self):
        """Test that vertical bifurcation has correct structure with all metrics"""
        response = self.session.get(f"{BASE_URL}/api/reports/pnl?from_date=2026-03-31&to_date=2026-03-31")
        assert response.status_code == 200, f"PNL API failed: {response.text}"
        
        data = response.json()
        vb = data.get("vertical_bifurcation", {})
        
        # QC should have: sales, purchase, wastage, grn_loss, gross_profit, variable_exp, fixed_exp, net_profit
        qc = vb.get("qc", {})
        qc_required_fields = ["sales", "purchase", "wastage", "grn_loss", "gross_profit", 
                              "variable_exp", "fixed_exp", "net_profit", "net_margin"]
        for field in qc_required_fields:
            assert field in qc, f"Missing {field} in QC vertical"
        
        # Retail should have: sales, purchase, wastage, commission, gross_profit, variable_exp, fixed_exp, net_profit
        retail = vb.get("retail", {})
        retail_required_fields = ["sales", "purchase", "wastage", "commission", "gross_profit",
                                   "variable_exp", "fixed_exp", "net_profit", "net_margin"]
        for field in retail_required_fields:
            assert field in retail, f"Missing {field} in Retail vertical"
        
        print("QC Vertical:")
        for field in qc_required_fields:
            print(f"  {field}: {qc.get(field)}")
        
        print("\nRetail Vertical:")
        for field in retail_required_fields:
            print(f"  {field}: {retail.get(field)}")


class TestDispatchDataVerification:
    """Verify dispatch data for Palak on March 31"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_qc_dispatches_for_march_31(self):
        """Verify QC dispatches exist for March 31"""
        response = self.session.get(f"{BASE_URL}/api/qc-dispatches")
        assert response.status_code == 200, f"QC Dispatches API failed: {response.text}"
        
        dispatches = response.json()
        
        # Filter for March 31
        march_31_dispatches = [d for d in dispatches if "2026-03-31" in str(d.get("dispatch_date", ""))]
        
        print(f"Found {len(march_31_dispatches)} QC dispatches on March 31")
        
        # Look for Palak items
        palak_dispatch_qty = 0
        for dispatch in march_31_dispatches:
            for item in dispatch.get("items", []):
                product_name = item.get("product_name", "").lower()
                if "palak" in product_name:
                    supplied_qty = item.get("supplied_qty", 0)
                    palak_dispatch_qty += supplied_qty
                    print(f"  Palak dispatch: {supplied_qty} units from {dispatch.get('customer_name')}")
        
        print(f"Total Palak dispatch qty (units): {palak_dispatch_qty}")
        
        # Palak should have dispatch qty around 140 units
        assert palak_dispatch_qty > 0, "No Palak dispatches found on March 31"
    
    def test_qc_grns_for_march_31(self):
        """Verify QC GRNs exist for March 31"""
        response = self.session.get(f"{BASE_URL}/api/qc-grns")
        assert response.status_code == 200, f"QC GRNs API failed: {response.text}"
        
        grns = response.json()
        
        # Filter for March 31
        march_31_grns = [g for g in grns if "2026-03-31" in str(g.get("grn_date", ""))]
        
        print(f"Found {len(march_31_grns)} QC GRNs on March 31")
        
        # Look for Palak items
        palak_grn_qty = 0
        for grn in march_31_grns:
            for item in grn.get("items", []):
                product_name = item.get("product_name", "").lower()
                if "palak" in product_name:
                    grn_qty = item.get("grn_qty", 0)
                    palak_grn_qty += grn_qty
                    print(f"  Palak GRN: {grn_qty} from {grn.get('customer_name')}")
        
        print(f"Total Palak GRN qty: {palak_grn_qty}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
