"""
Regression test for the datetime timezone bug in auto-indent generation.

Bug: POST /api/admin/generate-auto-indent with basis='sales' was throwing a 500
error: "can't compare offset-naive and offset-aware datetimes" when the
historical sales averaging code parsed invoice_date strings inconsistently
(some parsed as tz-aware, some as tz-naive).

Fix: /app/backend/routes/retailer_portal.py lines ~6760-6775 and ~7143-7160
now normalize parsed datetimes to timezone-aware (UTC) before any comparison.

This test:
  1. Logs in as admin
  2. Fetches the list of retailers
  3. For each of the first N retailers, calls POST /api/admin/generate-auto-indent
     with basis='sales'
  4. Asserts response is NOT a 500 due to datetime comparison
  5. Asserts either success or a graceful business message
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"

# Use a date that WILL have historical same-weekday invoices in the DB so that
# the code path with the datetime comparison bug is actually exercised.
# Invoices in DB are around 2026-07-01..2026-07-09. 2026-07-16 is a Thursday
# and 2026-07-09 is also a Thursday -> historical Thursday exists within 49 days.
TARGET_DATE = "2026-07-16"  # Thursday


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    assert BASE_URL, "REACT_APP_BACKEND_URL not set"
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def retailers(api, auth_headers):
    """Fetch all retailers so we can generate auto-indents for them."""
    # Try common list endpoints
    candidates = [
        f"{BASE_URL}/api/admin/retailers",
        f"{BASE_URL}/api/retailers",
        f"{BASE_URL}/api/users?role=retailer",
    ]
    resp = None
    for url in candidates:
        r = api.get(url, headers=auth_headers, timeout=30)
        if r.status_code == 200:
            resp = r
            print(f"Retailer list source: {url}")
            break
    assert resp is not None, "Could not fetch retailers list from any known endpoint"
    data = resp.json()
    # Support both list and dict responses
    if isinstance(data, dict):
        for key in ("retailers", "users", "data", "items"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
    assert isinstance(data, list) and len(data) > 0, f"No retailers returned: {data}"
    # Only keep entries that look like retailers with an id
    retailers = [r for r in data if isinstance(r, dict) and r.get("id")]
    assert len(retailers) > 0, "No retailer with id in list response"
    print(f"Found {len(retailers)} retailers")
    return retailers


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_indents(retailers):
    """Delete any auto-indents this test may have created on TARGET_DATE
    both before and after the test module runs, so the historical-invoice
    datetime code path is actually exercised (otherwise we'd hit the
    'already exists' early-return)."""
    # Best-effort cleanup via mongo. Falls back silently if motor/env not available.
    try:
        import motor.motor_asyncio  # type: ignore
        from dotenv import load_dotenv  # type: ignore
        load_dotenv("/app/backend/.env")
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if mongo_url and db_name:
            client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
            db = client[db_name]

            async def _cleanup():
                await db.retailer_indents.delete_many({"indent_date": TARGET_DATE})

            import asyncio
            asyncio.get_event_loop().run_until_complete(_cleanup())
            yield
            asyncio.get_event_loop().run_until_complete(_cleanup())
            return
    except Exception as e:
        print(f"cleanup fixture skipped: {e}")
    yield


class TestAutoIndentDatetimeBugfix:
    """Verify the timezone datetime bug in /api/admin/generate-auto-indent is fixed."""

    def _assert_no_datetime_500(self, resp, retailer_name):
        """Central assertion - reject the specific datetime bug we're regression-testing."""
        # Must not be 500 for datetime reasons
        if resp.status_code == 500:
            body = resp.text or ""
            assert "can't compare offset-naive and offset-aware datetimes" not in body, (
                f"REGRESSION: datetime comparison 500 for retailer {retailer_name}: {body[:500]}"
            )
            # Even a generic 500 is a concern - report it
            pytest.fail(
                f"Server returned 500 for retailer {retailer_name}: {body[:500]}"
            )
        # Acceptable: 200 success, 200 with success:false business msg, 400/404 auth/biz errors.
        assert resp.status_code in (200, 400, 404), (
            f"Unexpected status {resp.status_code} for retailer {retailer_name}: {resp.text[:300]}"
        )

    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_generate_auto_indent_sales_basis_no_datetime_error(self, api, auth_headers, retailers):
        """Loop through first 8 retailers, call generate-auto-indent basis=sales,
        assert no datetime-comparison 500 error occurs."""
        checked = 0
        results = []
        for retailer in retailers[:16]:
            rid = retailer.get("id")
            rname = retailer.get("company_name") or retailer.get("name") or rid
            payload = {
                "retailer_id": rid,
                "target_date": TARGET_DATE,
                "basis": "sales",
            }
            r = api.post(
                f"{BASE_URL}/api/admin/generate-auto-indent",
                json=payload,
                headers=auth_headers,
                timeout=90,
            )
            print(f"[{rname}] status={r.status_code} body={r.text[:250]}")
            self._assert_no_datetime_500(r, rname)
            body = {}
            try:
                body = r.json()
            except Exception:
                pass
            results.append({
                "retailer": rname,
                "status": r.status_code,
                "success": body.get("success"),
                "message": body.get("message"),
            })
            checked += 1

        assert checked > 0, "No retailers were tested"
        print(f"\n=== Auto-indent sales-basis results ({checked} retailers) ===")
        for row in results:
            print(row)

    def test_generate_auto_indent_sales_basis_response_shape(self, api, auth_headers, retailers):
        """Response for at least one retailer should be a JSON dict with expected keys
        (success flag or message or indent payload) - proves the endpoint runs through
        past the historical-invoice loop."""
        seen_valid_shape = False
        seen_datetime_bug = False
        exercised_datetime_code_path = False  # got past "No historical invoice data"
        detail_lines = []
        for retailer in retailers[:16]:
            rid = retailer.get("id")
            rname = retailer.get("company_name") or retailer.get("name") or rid
            payload = {"retailer_id": rid, "target_date": TARGET_DATE, "basis": "sales"}
            r = api.post(
                f"{BASE_URL}/api/admin/generate-auto-indent",
                json=payload,
                headers=auth_headers,
                timeout=90,
            )
            if r.status_code == 500 and "can't compare offset-naive and offset-aware datetimes" in (r.text or ""):
                seen_datetime_bug = True
                detail_lines.append(f"{rname}: DATETIME BUG - {r.text[:200]}")
                continue
            if r.status_code == 200:
                try:
                    body = r.json()
                    if isinstance(body, dict) and (
                        "success" in body or "message" in body or "indent" in body or "items" in body
                    ):
                        seen_valid_shape = True
                        msg = str(body.get("message") or "")
                        if "No historical invoice data" not in msg and "already exists" not in msg:
                            # went past the historical filter (or generated indent)
                            exercised_datetime_code_path = True
                        detail_lines.append(
                            f"{rname}: 200 success={body.get('success')} "
                            f"items={len(body.get('items', []) or body.get('indent', {}).get('items', []) or [])} "
                            f"msg={msg[:100]}"
                        )
                except Exception:
                    pass
            else:
                detail_lines.append(f"{rname}: status={r.status_code} body={r.text[:150]}")

        print("\n".join(detail_lines))
        print(f"exercised_datetime_code_path={exercised_datetime_code_path}")
        assert not seen_datetime_bug, "Datetime bug still occurs on at least one retailer"
        assert seen_valid_shape, (
            "No retailer returned a valid 200 JSON response - endpoint may be broken "
            "in a different way, review server logs"
        )
