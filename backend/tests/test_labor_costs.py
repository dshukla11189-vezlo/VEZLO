"""
Test suite for Daily Variable Labour Costs feature
Tests: Labour CRUD, Attendance marking, Costs summary
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLabourManagement:
    """Tests for Labour CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Store created labour IDs for cleanup
        self.created_labour_ids = []
        yield
        
        # Cleanup: Delete test labourers
        for labour_id in self.created_labour_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/labours/{labour_id}")
            except:
                pass
    
    def test_list_labours(self):
        """Test GET /api/labours - List all labourers"""
        response = self.session.get(f"{BASE_URL}/api/labours")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ List labours: Found {len(data)} labourers")
    
    def test_create_labour(self):
        """Test POST /api/labours - Create new labourer"""
        unique_name = f"TEST_Labour_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique_name,
            "phone": "9876543210",
            "default_daily_rate": 500,
            "default_overtime_rate": 50
        }
        
        response = self.session.post(f"{BASE_URL}/api/labours", json=payload)
        assert response.status_code == 200, f"Create labour failed: {response.text}"
        
        data = response.json()
        assert data["name"] == unique_name
        assert data["phone"] == "9876543210"
        assert data["default_daily_rate"] == 500
        assert data["default_overtime_rate"] == 50
        assert "id" in data
        
        self.created_labour_ids.append(data["id"])
        print(f"✓ Create labour: {unique_name} with ID {data['id']}")
        return data
    
    def test_create_labour_duplicate_name(self):
        """Test POST /api/labours - Duplicate name should fail"""
        unique_name = f"TEST_Duplicate_{uuid.uuid4().hex[:6]}"
        payload = {"name": unique_name, "default_daily_rate": 400}
        
        # Create first
        response1 = self.session.post(f"{BASE_URL}/api/labours", json=payload)
        assert response1.status_code == 200
        self.created_labour_ids.append(response1.json()["id"])
        
        # Try to create duplicate
        response2 = self.session.post(f"{BASE_URL}/api/labours", json=payload)
        assert response2.status_code == 400
        assert "already exists" in response2.json().get("detail", "").lower()
        print("✓ Duplicate labour name correctly rejected")
    
    def test_update_labour(self):
        """Test PUT /api/labours/{id} - Update labourer"""
        # First create a labour
        labour = self.test_create_labour()
        labour_id = labour["id"]
        
        # Update it
        update_payload = {
            "name": f"TEST_Updated_{uuid.uuid4().hex[:4]}",
            "default_daily_rate": 600,
            "default_overtime_rate": 75
        }
        
        response = self.session.put(f"{BASE_URL}/api/labours/{labour_id}", json=update_payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["default_daily_rate"] == 600
        assert data["default_overtime_rate"] == 75
        print(f"✓ Update labour: Daily rate updated to 600")
    
    def test_delete_labour_no_attendance(self):
        """Test DELETE /api/labours/{id} - Hard delete when no attendance"""
        # Create a labour
        labour = self.test_create_labour()
        labour_id = labour["id"]
        
        # Delete it
        response = self.session.delete(f"{BASE_URL}/api/labours/{labour_id}")
        assert response.status_code == 200
        
        # Verify it's deleted
        list_response = self.session.get(f"{BASE_URL}/api/labours?include_inactive=true")
        labour_ids = [l["id"] for l in list_response.json()]
        assert labour_id not in labour_ids
        
        # Remove from cleanup list since already deleted
        self.created_labour_ids.remove(labour_id)
        print("✓ Delete labour (hard delete): Labour removed")
    
    def test_toggle_labour_active_status(self):
        """Test PUT /api/labours/{id} - Toggle active/inactive"""
        labour = self.test_create_labour()
        labour_id = labour["id"]
        
        # Deactivate
        response = self.session.put(f"{BASE_URL}/api/labours/{labour_id}", json={"is_active": False})
        assert response.status_code == 200
        assert response.json()["is_active"] == False
        
        # Reactivate
        response = self.session.put(f"{BASE_URL}/api/labours/{labour_id}", json={"is_active": True})
        assert response.status_code == 200
        assert response.json()["is_active"] == True
        print("✓ Toggle active status: Deactivate and reactivate works")


class TestLabourAttendance:
    """Tests for Labour Attendance operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as staff and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as staff
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "samrathsalunke2@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Create a test labour for attendance tests
        admin_session = requests.Session()
        admin_session.headers.update({"Content-Type": "application/json"})
        admin_response = admin_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        admin_token = admin_response.json().get("token")
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        self.test_labour_name = f"TEST_Attendance_{uuid.uuid4().hex[:6]}"
        labour_response = admin_session.post(f"{BASE_URL}/api/labours", json={
            "name": self.test_labour_name,
            "default_daily_rate": 500,
            "default_overtime_rate": 50
        })
        self.test_labour = labour_response.json()
        self.admin_session = admin_session
        
        yield
        
        # Cleanup
        try:
            self.admin_session.delete(f"{BASE_URL}/api/labours/{self.test_labour['id']}")
        except:
            pass
    
    def test_get_attendance_for_date(self):
        """Test GET /api/labour-attendance - Get attendance for a date"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/labour-attendance?date={today}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Should include our test labour
        labour_ids = [a["labour_id"] for a in data]
        assert self.test_labour["id"] in labour_ids
        print(f"✓ Get attendance: Found {len(data)} labourers for {today}")
    
    def test_save_single_attendance(self):
        """Test POST /api/labour-attendance - Save single attendance"""
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today,
            "labour_id": self.test_labour["id"],
            "labour_name": self.test_labour["name"],
            "present": True,
            "overtime_hours": 2,
            "daily_rate": 500,
            "overtime_rate": 50
        }
        
        response = self.session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["present"] == True
        assert data["overtime_hours"] == 2
        assert data["total_payment"] == 600  # 500 + (2 * 50)
        print(f"✓ Save attendance: Total payment = ₹{data['total_payment']}")
    
    def test_save_bulk_attendance(self):
        """Test POST /api/labour-attendance/bulk - Save multiple attendance records"""
        test_date = "2026-04-10"  # Use a specific test date
        payload = {
            "date": test_date,
            "records": [
                {
                    "labour_id": self.test_labour["id"],
                    "labour_name": self.test_labour["name"],
                    "present": True,
                    "overtime_hours": 1.5,
                    "daily_rate": 500,
                    "overtime_rate": 50
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/labour-attendance/bulk", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["saved_count"] == 1
        print(f"✓ Bulk save attendance: Saved {data['saved_count']} records")
        
        # Verify by fetching
        get_response = self.session.get(f"{BASE_URL}/api/labour-attendance?date={test_date}")
        attendance = get_response.json()
        test_record = next((a for a in attendance if a["labour_id"] == self.test_labour["id"]), None)
        assert test_record is not None
        assert test_record["present"] == True
        assert test_record["overtime_hours"] == 1.5
        assert test_record["total_payment"] == 575  # 500 + (1.5 * 50)
        print(f"✓ Verified attendance: Overtime 1.5 hrs, Total ₹{test_record['total_payment']}")
    
    def test_attendance_absent_no_payment(self):
        """Test that absent labourers have zero payment"""
        test_date = "2026-04-11"
        payload = {
            "date": test_date,
            "records": [
                {
                    "labour_id": self.test_labour["id"],
                    "labour_name": self.test_labour["name"],
                    "present": False,
                    "overtime_hours": 0,
                    "daily_rate": 500,
                    "overtime_rate": 50
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/labour-attendance/bulk", json=payload)
        assert response.status_code == 200
        
        # Verify
        get_response = self.session.get(f"{BASE_URL}/api/labour-attendance?date={test_date}")
        attendance = get_response.json()
        test_record = next((a for a in attendance if a["labour_id"] == self.test_labour["id"]), None)
        assert test_record["present"] == False
        assert test_record["total_payment"] == 0
        print("✓ Absent labourer: Total payment = ₹0")


class TestLabourCostsSummary:
    """Tests for Labour Costs Summary API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_costs_summary(self):
        """Test GET /api/labour-costs/summary - Get costs summary"""
        response = self.session.get(
            f"{BASE_URL}/api/labour-costs/summary?from_date=2026-04-01&to_date=2026-04-30"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "summary" in data
        assert "daily_breakdown" in data
        assert "labour_breakdown" in data
        
        summary = data["summary"]
        assert "total_payment" in summary
        assert "total_days" in summary
        assert "total_man_days" in summary
        assert "total_overtime_hours" in summary
        assert "daily_avg_cost" in summary
        
        print(f"✓ Costs summary: Total ₹{summary['total_payment']}, {summary['total_man_days']} man-days")
    
    def test_costs_summary_empty_range(self):
        """Test costs summary for date range with no data"""
        response = self.session.get(
            f"{BASE_URL}/api/labour-costs/summary?from_date=2020-01-01&to_date=2020-01-31"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["summary"]["total_payment"] == 0
        assert data["summary"]["total_days"] == 0
        print("✓ Empty date range: Returns zero totals")


class TestSidebarNavigation:
    """Tests to verify sidebar navigation changes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_admin_can_access_labor_costs(self):
        """Test admin can access /api/labour-costs/summary"""
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@freshflow.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Access labor costs
        response = self.session.get(
            f"{BASE_URL}/api/labour-costs/summary?from_date=2026-04-01&to_date=2026-04-30"
        )
        assert response.status_code == 200
        print("✓ Admin can access labor costs API")
    
    def test_staff_can_access_attendance(self):
        """Test staff can access /api/labour-attendance"""
        # Login as staff
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "samrathsalunke2@gmail.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Access attendance
        today = datetime.now().strftime("%Y-%m-%d")
        response = self.session.get(f"{BASE_URL}/api/labour-attendance?date={today}")
        assert response.status_code == 200
        print("✓ Staff can access attendance API")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
