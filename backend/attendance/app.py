import json
import os
import boto3
import pytz
from datetime import datetime
from boto3.dynamodb.conditions import Key

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EMPLOYEES_TABLE = os.environ.get("EMPLOYEES_TABLE", "Employees")
ATTENDANCE_TABLE = os.environ.get("ATTENDANCE_TABLE", "Attendance")
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
IST = pytz.timezone("Asia/Kolkata")

dynamodb = boto3.resource("dynamodb")
employees_table = dynamodb.Table(EMPLOYEES_TABLE)
attendance_table = dynamodb.Table(ATTENDANCE_TABLE)
cognito_client = boto3.client("cognito-idp")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_ist():
    """Return current datetime in Asia/Kolkata."""
    return datetime.now(IST)


def _today_str():
    """Return today's date string YYYY-MM-DD in IST."""
    return _now_ist().strftime("%Y-%m-%d")


def _time_str(dt=None):
    """Return a formatted time string hh:mm AM/PM."""
    if dt is None:
        dt = _now_ist()
    return dt.strftime("%I:%M %p")


def _cors_response(status_code, body):
    """Build an API Gateway response with CORS headers."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def _get_user_info(event):
    """Extract user sub and groups from the Cognito authorizer claims."""
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    sub = claims.get("sub", "")
    groups_str = claims.get("cognito:groups", "")
    # groups may be a comma-separated string or a single value
    if isinstance(groups_str, str):
        groups = [g.strip() for g in groups_str.split(",") if g.strip()]
    else:
        groups = list(groups_str) if groups_str else []
    email = claims.get("email", "")
    name = claims.get("name", claims.get("cognito:username", ""))
    return {
        "employee_id": sub,
        "groups": groups,
        "email": email,
        "name": name,
    }


def _is_admin(user_info):
    """Check if the user belongs to the admin group."""
    return "admin" in user_info.get("groups", [])


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------

def handle_check_in(event, user_info):
    """POST /attendance/check-in"""
    today = _today_str()
    now = _now_ist()

    try:
        attendance_table.put_item(
            Item={
                "employee_id": user_info["employee_id"],
                "date": today,
                "check_in": _time_str(now),
                "check_out": "-",
                "status": "Present",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            },
            ConditionExpression="attribute_not_exists(employee_id) AND attribute_not_exists(#d)",
            ExpressionAttributeNames={"#d": "date"},
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return _cors_response(409, {"error": "Already checked in today."})

    return _cors_response(200, {
        "message": "Checked in successfully.",
        "check_in": _time_str(now),
        "date": today,
    })


def handle_check_out(event, user_info):
    """POST /attendance/check-out"""
    today = _today_str()
    now = _now_ist()

    # Fetch today's attendance
    resp = attendance_table.get_item(
        Key={"employee_id": user_info["employee_id"], "date": today}
    )
    item = resp.get("Item")
    if not item:
        return _cors_response(400, {"error": "You have not checked in today."})

    if item.get("check_out", "-") != "-":
        return _cors_response(409, {"error": "Already checked out today."})

    attendance_table.update_item(
        Key={"employee_id": user_info["employee_id"], "date": today},
        UpdateExpression="SET check_out = :co, updated_at = :ua",
        ExpressionAttributeValues={
            ":co": _time_str(now),
            ":ua": now.isoformat(),
        },
    )

    return _cors_response(200, {
        "message": "Checked out successfully.",
        "check_out": _time_str(now),
        "date": today,
    })


def handle_attendance_history(event, user_info):
    """GET /attendance/history — employee's own attendance."""
    resp = attendance_table.query(
        KeyConditionExpression=Key("employee_id").eq(user_info["employee_id"]),
        ScanIndexForward=False,  # newest first
        Limit=30,
    )
    items = resp.get("Items", [])
    return _cors_response(200, {"history": items})


def handle_attendance_today(event, user_info):
    """GET /attendance/today — admin: all employees' attendance today."""
    if not _is_admin(user_info):
        return _cors_response(403, {"error": "Admin access required."})

    today = _today_str()
    # Query the DateIndex GSI
    resp = attendance_table.query(
        IndexName="DateIndex",
        KeyConditionExpression=Key("date").eq(today),
    )
    attendance_items = resp.get("Items", [])

    # Get all employees
    emp_resp = employees_table.scan()
    employees = emp_resp.get("Items", [])

    # Build a map of employee_id -> employee
    emp_map = {e["employee_id"]: e for e in employees}

    # Build a map of employee_id -> attendance
    att_map = {a["employee_id"]: a for a in attendance_items}

    # Merge: for each employee, attach attendance or mark absent
    result = []
    for emp in employees:
        eid = emp["employee_id"]
        att = att_map.get(eid, {})
        result.append({
            "employee_id": eid,
            "name": emp.get("name", "Unknown"),
            "email": emp.get("email", ""),
            "check_in": att.get("check_in", "-"),
            "check_out": att.get("check_out", "-"),
            "status": att.get("status", "Absent"),
        })

    total = len(employees)
    present = sum(1 for r in result if r["status"] == "Present")
    absent = total - present

    return _cors_response(200, {
        "date": today,
        "total_employees": total,
        "present": present,
        "absent": absent,
        "attendance": result,
    })


def handle_attendance_all(event, user_info):
    """GET /attendance/all — admin: attendance for a specific date."""
    if not _is_admin(user_info):
        return _cors_response(403, {"error": "Admin access required."})

    # Get date from query string, default to today
    params = event.get("queryStringParameters") or {}
    target_date = params.get("date", _today_str())

    # Query the DateIndex GSI
    resp = attendance_table.query(
        IndexName="DateIndex",
        KeyConditionExpression=Key("date").eq(target_date),
    )
    attendance_items = resp.get("Items", [])

    # Get all employees
    emp_resp = employees_table.scan()
    employees = emp_resp.get("Items", [])
    emp_map = {e["employee_id"]: e for e in employees}

    att_map = {a["employee_id"]: a for a in attendance_items}

    result = []
    for emp in employees:
        eid = emp["employee_id"]
        att = att_map.get(eid, {})
        result.append({
            "employee_id": eid,
            "name": emp.get("name", "Unknown"),
            "email": emp.get("email", ""),
            "check_in": att.get("check_in", "-"),
            "check_out": att.get("check_out", "-"),
            "status": att.get("status", "Absent"),
        })

    total = len(employees)
    present = sum(1 for r in result if r["status"] == "Present")
    absent = total - present

    return _cors_response(200, {
        "date": target_date,
        "total_employees": total,
        "present": present,
        "absent": absent,
        "attendance": result,
    })


def handle_employees(event, user_info):
    """GET /employees — admin: list all employees."""
    if not _is_admin(user_info):
        return _cors_response(403, {"error": "Admin access required."})

    resp = employees_table.scan()
    employees = resp.get("Items", [])
    return _cors_response(200, {"employees": employees})


def handle_create_employee(event, user_info):
    """POST /employees — admin: create a new Cognito user and employee record."""
    if not _is_admin(user_info):
        return _cors_response(403, {"error": "Admin access required."})

    if not USER_POOL_ID:
        return _cors_response(500, {"error": "USER_POOL_ID not configured."})

    try:
        body = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return _cors_response(400, {"error": "Invalid JSON body."})

    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    role = body.get("role", "employee").strip().lower()
    temp_password = body.get("temp_password", "TempPass@123").strip()

    if not name or not email:
        return _cors_response(400, {"error": "name and email are required."})

    if role not in ("admin", "employee"):
        return _cors_response(400, {"error": "role must be 'admin' or 'employee'."})

    # 1. Create the Cognito user
    try:
        cognito_resp = cognito_client.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=email,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "name", "Value": name},
                {"Name": "email_verified", "Value": "true"},
            ],
            TemporaryPassword=temp_password,
            MessageAction="SUPPRESS",  # don't send a Cognito welcome email
        )
    except cognito_client.exceptions.UsernameExistsException:
        return _cors_response(409, {"error": f"A user with email '{email}' already exists."})
    except cognito_client.exceptions.InvalidPasswordException as e:
        return _cors_response(400, {"error": f"Invalid temporary password: {str(e)}"})
    except Exception as e:
        print(f"Cognito create_user error: {e}")
        return _cors_response(500, {"error": "Failed to create Cognito user."})

    # Extract the new user's sub (UUID)
    user_attrs = cognito_resp["User"]["Attributes"]
    user_sub = next((a["Value"] for a in user_attrs if a["Name"] == "sub"), None)
    if not user_sub:
        return _cors_response(500, {"error": "Could not retrieve user sub from Cognito."})

    # 2. Add to the correct Cognito group
    try:
        cognito_client.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=email,
            GroupName=role,
        )
    except Exception as e:
        print(f"Cognito add_to_group error: {e}")
        # Non-fatal — continue

    # 3. Create the DynamoDB employee record
    now = _now_ist()
    try:
        employees_table.put_item(
            Item={
                "employee_id": user_sub,
                "name": name,
                "email": email,
                "role": role,
                "created_at": now.isoformat(),
            },
            ConditionExpression="attribute_not_exists(employee_id)",
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        pass  # record already exists (post-confirmation trigger beat us)
    except Exception as e:
        print(f"DynamoDB put_item error: {e}")
        return _cors_response(500, {"error": "User created in Cognito but failed to save employee record."})

    return _cors_response(201, {
        "message": f"Employee '{name}' created successfully.",
        "employee_id": user_sub,
        "name": name,
        "email": email,
        "role": role,
        "temp_password": temp_password,
    })


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------

# Route table: (method, path) → handler
ROUTES = {
    ("POST", "/attendance/check-in"): handle_check_in,
    ("POST", "/attendance/check-out"): handle_check_out,
    ("GET", "/attendance/history"): handle_attendance_history,
    ("GET", "/attendance/today"): handle_attendance_today,
    ("GET", "/attendance/all"): handle_attendance_all,
    ("GET", "/employees"): handle_employees,
    ("POST", "/employees"): handle_create_employee,
}


def lambda_handler(event, context):
    """Main Lambda handler — routes requests to the appropriate function."""
    # Handle CORS preflight
    http_method = event.get("httpMethod", "")
    if http_method == "OPTIONS":
        return _cors_response(200, {"message": "OK"})

    path = event.get("path", "")

    # Strip stage prefix if present (e.g., /Prod/attendance/check-in → /attendance/check-in)
    resource = event.get("resource", path)

    handler = ROUTES.get((http_method, resource))
    if not handler:
        return _cors_response(404, {"error": f"Route not found: {http_method} {resource}"})

    user_info = _get_user_info(event)
    if not user_info["employee_id"]:
        return _cors_response(401, {"error": "Unauthorized. Invalid token."})

    try:
        return handler(event, user_info)
    except Exception as e:
        print(f"Error handling {http_method} {resource}: {str(e)}")
        return _cors_response(500, {"error": "Internal server error."})
