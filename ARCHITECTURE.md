# 🏛️ System Architecture — Employee Attendance Management System

A detailed breakdown of every architectural decision, AWS service, data model, and security layer that powers this application.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Tech Stack](#tech-stack)
4. [AWS Services Deep Dive](#aws-services-deep-dive)
5. [Data Models](#data-models)
6. [API Flow](#api-flow)
7. [Authentication & Authorization](#authentication--authorization)
8. [Infrastructure as Code (IaC)](#infrastructure-as-code-iac)
9. [Security Model](#security-model)
10. [Cost Estimate](#cost-estimate)
11. [Scalability Notes](#scalability-notes)

---

## High-Level Overview

This system is a **fully serverless, event-driven application** built entirely on AWS managed services. There are no servers to manage, no OS patches, and no infrastructure to babysit.

| Characteristic | Detail |
|---|---|
| Architecture Style | Serverless / Event-Driven |
| Deployment Model | AWS SAM (CloudFormation) |
| Region | `ap-south-1` (Mumbai) |
| Runtime | Python 3.13 on AWS Lambda |
| Authentication | JWT tokens via Amazon Cognito |
| Storage | Amazon DynamoDB (NoSQL) |
| Frontend Hosting | Amazon S3 Static Website |
| API Layer | Amazon API Gateway (REST) |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER (Browser)                            │
│                   HTML + CSS + Vanilla JavaScript                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Amazon S3 (Static Hosting)                      │
│              login.html / employee.html / admin.html                │
│                  js/auth.js / js/api.js / css/                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  API Calls (HTTPS + JWT)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Amazon API Gateway (REST API)                     │
│                    Stage: Prod  |  Auth: Cognito                    │
│                                                                     │
│  POST /attendance/check-in        GET /attendance/today             │
│  POST /attendance/check-out       GET /attendance/all?date=         │
│  GET  /attendance/history         GET /employees                    │
└──────────────┬───────────────────────────────────┬──────────────────┘
               │  Validates JWT token              │
               ▼                                   │
┌──────────────────────────┐                       │
│   Amazon Cognito         │                       │
│   User Pool              │                       │
│   ┌──────────────────┐   │                       │
│   │ Group: admin     │   │                       │
│   │ Group: employee  │   │                       │
│   └──────────────────┘   │                       │
│   Post-Confirmation      │                       │
│   Lambda Trigger ────────┼──────────────┐        │
└──────────────────────────┘              │        │
                                          │        ▼
                                          │  ┌─────────────────────────────┐
                                          │  │  AWS Lambda (Python 3.13)   │
                                          │  │  attendance-handler         │
                                          │  │                             │
                                          │  │  Routes:                    │
                                          │  │  • check_in()               │
                                          │  │  • check_out()              │
                                          │  │  • get_history()            │
                                          │  │  • get_today()              │
                                          │  │  • get_all_attendance()     │
                                          │  │  • get_employees()          │
                                          │  └──────────────┬──────────────┘
                                          │                 │
                                          │                 ▼
                                          │  ┌─────────────────────────────┐
                                          └─▶│    Amazon DynamoDB          │
                                             │                             │
                                             │  ┌─────────────────────┐   │
                                             │  │  Table: Employees   │   │
                                             │  │  PK: employee_id    │   │
                                             │  └─────────────────────┘   │
                                             │                             │
                                             │  ┌─────────────────────┐   │
                                             │  │  Table: Attendance  │   │
                                             │  │  PK: employee_id    │   │
                                             │  │  SK: date           │   │
                                             │  │  GSI: DateIndex     │   │
                                             │  └─────────────────────┘   │
                                             └─────────────────────────────┘

Amazon CloudWatch ──────────────────── Logs & Metrics from all services
```

---

## Tech Stack

### Frontend

| Technology | Purpose | Why Chosen |
|---|---|---|
| **HTML5** | Page structure | Semantic, lightweight, no build step |
| **Vanilla CSS** | Styling & animations | Full control, no framework overhead |
| **Vanilla JavaScript** | UI logic & API calls | No build toolchain needed |
| **Amazon Cognito JS SDK** | Auth token management | Direct integration with Cognito User Pools |

### Backend

| Technology | Purpose | Why Chosen |
|---|---|---|
| **Python 3.13** | Lambda runtime | Fast cold starts, readable, excellent AWS SDK support |
| **boto3** | AWS SDK for Python | Official, well-maintained AWS SDK |
| **AWS Lambda** | Compute layer | Serverless, pay-per-use, auto-scaling |

### AWS Infrastructure

| Service | Role | Configuration |
|---|---|---|
| **Amazon API Gateway** | REST API + routing | Stage: `Prod`, Cognito authorizer on all routes |
| **Amazon Cognito** | Auth & user management | User Pool with `admin` & `employee` groups |
| **Amazon DynamoDB** | NoSQL database | On-demand billing, GSI for date queries |
| **Amazon S3** | Static frontend hosting | Public read, S3 Website endpoint |
| **Amazon CloudWatch** | Logs & monitoring | Auto-enabled for Lambda & API Gateway |
| **AWS SAM** | Infrastructure as Code | CloudFormation transform for serverless resources |
| **AWS IAM** | Permissions & roles | Least-privilege policies per Lambda function |

---

## AWS Services Deep Dive

### Amazon Cognito (Authentication)

- **User Pool**: `attendance-user-pool`
  - Sign-in with email + password
  - Custom attribute: `name` (required)
  - Password policy: min 8 chars, uppercase + lowercase + numbers
- **App Client**: `attendance-app-client`
  - Auth flows: `USER_PASSWORD_AUTH`, `USER_SRP_AUTH`, `REFRESH_TOKEN_AUTH`
  - No client secret (public SPA)
- **Groups**:
  - `admin` — can view all employee data and today's attendance
  - `employee` — can only check in/out and view their own history
- **Post-Confirmation Trigger**: Lambda function that auto-creates a DynamoDB record in the `Employees` table when a new user is created via the console or CLI

---

### AWS Lambda

- **Function**: `attendance-handler`
  - Runtime: Python 3.13
  - Memory: 256 MB
  - Timeout: 30 seconds
  - Single function handles all 6 API routes (monolith-per-function pattern)
  - IAM Policy: `DynamoDBCrudPolicy` on both tables
  - Environment variables: `EMPLOYEES_TABLE`, `ATTENDANCE_TABLE`

- **Function**: `attendance-post-confirmation`
  - Runtime: Python 3.13
  - Memory: 128 MB
  - Timeout: 10 seconds
  - Triggered automatically by Cognito on every user confirmation
  - Creates an employee record in DynamoDB with `attribute_not_exists` guard (idempotent)

---

### Amazon API Gateway

- **Type**: REST API (not HTTP API — REST used for Cognito authorizer support)
- **Stage**: `Prod`
- **Authorizer**: Cognito User Pool authorizer — validates the JWT `idToken` on every request
- **CORS**: Enabled for all routes (`GET`, `POST`, `OPTIONS`)
  - `AllowOrigin: *`
  - `AllowHeaders: Content-Type, Authorization`
- **Endpoints**:

| Method | Path | Lambda Handler Function |
|--------|------|------------------------|
| `POST` | `/attendance/check-in` | `check_in()` |
| `POST` | `/attendance/check-out` | `check_out()` |
| `GET` | `/attendance/history` | `get_history()` |
| `GET` | `/attendance/today` | `get_today_attendance()` |
| `GET` | `/attendance/all` | `get_all_attendance()` |
| `GET` | `/employees` | `get_employees()` |

---

### Amazon DynamoDB

Two tables with **on-demand (pay-per-request) billing** — no capacity provisioning needed.

#### Table: `Employees`

| Attribute | Type | Key |
|-----------|------|-----|
| `employee_id` | String (UUID) | Partition Key (PK) |
| `name` | String | — |
| `email` | String | — |
| `role` | String | — |
| `created_at` | String (ISO 8601) | — |

#### Table: `Attendance`

| Attribute | Type | Key |
|-----------|------|-----|
| `employee_id` | String (UUID) | Partition Key (PK) |
| `date` | String (`YYYY-MM-DD`) | Sort Key (SK) |
| `check_in_time` | String (ISO 8601) | — |
| `check_out_time` | String (ISO 8601) | — |
| `status` | String (`present`) | — |

#### Global Secondary Index: `DateIndex`

Used by admin queries to fetch all attendance for a specific date.

| Attribute | Key |
|-----------|-----|
| `date` | Partition Key (PK) |
| `employee_id` | Sort Key (SK) |

---

### Amazon S3 (Frontend Hosting)

- **Bucket name**: `attendance-frontend-{AWS_ACCOUNT_ID}` (unique per account)
- **Website configuration**: `IndexDocument: login.html`, `ErrorDocument: login.html`
- **Public access**: Enabled via Bucket Policy (`s3:GetObject` for `Principal: *`)
- **No CloudFront** in this MVP (can be added for HTTPS + CDN in production)

---

### Amazon CloudWatch

Auto-configured for all Lambda functions:
- **Log Group**: `/aws/lambda/attendance-handler`
- **Log Group**: `/aws/lambda/attendance-post-confirmation`
- **API Gateway Execution Logs**: Available via stage settings
- Retention: AWS default (no expiry unless configured)

---

## Data Models

### Cognito JWT Token Claims (decoded `idToken`)

```json
{
  "sub": "uuid-of-the-user",
  "email": "user@company.com",
  "name": "Rahul Sharma",
  "cognito:groups": ["employee"],
  "cognito:username": "user@company.com",
  "iss": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_XXXXX",
  "exp": 1720000000,
  "iat": 1720000000
}
```

The Lambda function reads `cognito:groups` from the token claims to determine role-based access.

---

### DynamoDB Item Examples

**Employees table:**
```json
{
  "employee_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Rahul Sharma",
  "email": "rahul@company.com",
  "role": "employee",
  "created_at": "2026-08-15T10:00:00Z"
}
```

**Attendance table:**
```json
{
  "employee_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "date": "2026-08-16",
  "check_in_time": "2026-08-16T03:30:00Z",
  "check_out_time": "2026-08-16T12:00:00Z",
  "status": "present"
}
```

> All times are stored in **UTC** and converted to **IST (UTC+5:30)** for display in the frontend.

---

## API Flow

### Employee Check-In Flow

```
Browser (employee.js)
    │
    │  POST /attendance/check-in
    │  Authorization: <idToken>
    ▼
API Gateway
    │  Validates JWT with Cognito
    ▼
Lambda (attendance-handler)
    │  Extracts employee_id from token claims
    │  Checks if attendance record exists for today (DynamoDB GetItem)
    │  If not → creates record with check_in_time (DynamoDB PutItem)
    │  If already checked in → returns 400 "Already checked in"
    ▼
Response: 200 { "message": "Checked in", "time": "09:00:00 IST" }
```

### Admin View Today Flow

```
Browser (admin.js)
    │
    │  GET /attendance/today
    │  Authorization: <idToken>
    ▼
API Gateway
    │  Validates JWT with Cognito
    ▼
Lambda (attendance-handler)
    │  Checks cognito:groups — must contain "admin"
    │  Queries AttendanceTable GSI: DateIndex with today's date (DynamoDB Query)
    │  Queries EmployeesTable to get all employees (DynamoDB Scan)
    │  Merges results → marks each employee as Present/Absent
    ▼
Response: 200 { "employees": [...], "stats": { "total": 5, "present": 3, "absent": 2 } }
```

---

## Authentication & Authorization

### Authentication Flow

```
1. User enters email + password on login.html
2. Cognito SDK calls InitiateAuth (USER_PASSWORD_AUTH flow)
3. Cognito validates credentials
4. Returns: idToken, accessToken, refreshToken
5. Tokens stored in localStorage
6. idToken attached as Authorization header on every API call
```

### Authorization (Role-Based)

The Lambda function checks the `cognito:groups` claim from the decoded JWT:

```python
groups = claims.get("cognito:groups", [])

if "admin" not in groups:
    return { "statusCode": 403, "body": "Forbidden" }
```

| Endpoint | Required Group |
|---|---|
| `/attendance/check-in` | Any authenticated user |
| `/attendance/check-out` | Any authenticated user |
| `/attendance/history` | Any authenticated user (own data only) |
| `/attendance/today` | `admin` |
| `/attendance/all` | `admin` |
| `/employees` | `admin` |

---

## Infrastructure as Code (IaC)

All AWS resources are defined in [`template.yaml`](./template.yaml) using **AWS SAM** (Serverless Application Model).

### Resources Created by SAM

```
CloudFormation Stack: attendance-system
│
├── AWS::Cognito::UserPool            → attendance-user-pool
├── AWS::Cognito::UserPoolClient      → attendance-app-client
├── AWS::Cognito::UserPoolGroup       → admin
├── AWS::Cognito::UserPoolGroup       → employee
│
├── AWS::DynamoDB::Table              → Employees
├── AWS::DynamoDB::Table              → Attendance (+ DateIndex GSI)
│
├── AWS::Serverless::Api              → attendance-api (Prod stage)
├── AWS::Serverless::Function         → attendance-handler
├── AWS::Serverless::Function         → attendance-post-confirmation
│
├── AWS::Lambda::Permission           → Cognito → PostConfirmation invoke
│
├── AWS::S3::Bucket                   → attendance-frontend-{accountId}
└── AWS::S3::BucketPolicy             → Public read access
```

### SAM Configuration (`samconfig.toml`)

```toml
[default.deploy.parameters]
stack_name    = "attendance-system"
region        = "ap-south-1"
capabilities  = "CAPABILITY_IAM"
resolve_s3    = true              # SAM auto-creates deployment S3 bucket
confirm_changeset = true          # Shows diff before each deploy
```

---

## Security Model

| Concern | Mitigation |
|---|---|
| Authentication | JWT tokens via Cognito — short-lived (1hr expiry), signed with RS256 |
| API Authorization | API Gateway enforces Cognito authorizer on all non-OPTIONS routes |
| Role-based access | Lambda checks `cognito:groups` claim; admins cannot be self-promoted |
| DynamoDB access | Lambda has IAM role with `DynamoDBCrudPolicy` — scoped to specific tables only |
| Secrets | No secrets in code — all config via environment variables injected by SAM |
| Frontend | No server-side secrets exposed — Cognito Client ID is public by design (no client secret) |
| CORS | Wildcard `*` origin for MVP — restrict to your S3 URL in production |
| Public S3 | Frontend files are public (static HTML/CSS/JS) — no sensitive data stored there |

### Production Hardening Checklist

- [ ] Replace `AdministratorAccess` IAM policy with least-privilege custom policy
- [ ] Enable MFA for the IAM deploy user
- [ ] Add CloudFront in front of S3 for HTTPS + custom domain + CDN
- [ ] Restrict CORS `AllowOrigin` to your CloudFront domain
- [ ] Enable DynamoDB Point-in-Time Recovery (PITR)
- [ ] Set CloudWatch log retention (e.g., 30 days)
- [ ] Enable AWS WAF on API Gateway for rate limiting & IP blocking
- [ ] Enable Cognito advanced security features (risk-based adaptive auth)

---

## Cost Estimate

All costs assume **AWS Free Tier** is active (first 12 months after account creation).

| Service | Free Tier | Estimated Monthly Cost (post free tier) |
|---|---|---|
| AWS Lambda | 1M requests/month free | ~$0.00 for low traffic |
| Amazon DynamoDB | 25 GB storage + 25 WCU/RCU free | ~$0.00 for small teams |
| Amazon API Gateway | 1M API calls/month free | ~$0.00 for low traffic |
| Amazon S3 | 5 GB storage + 20K GET free | ~$0.023/GB/month |
| Amazon Cognito | 50,000 MAU free | ~$0.00 for small teams |
| Amazon CloudWatch | 5 GB logs free | ~$0.50/GB beyond free tier |
| **Total** | | **~$0–$2/month for teams < 50 employees** |

---

## Scalability Notes

This architecture scales automatically with zero configuration changes:

- **Lambda**: Scales to 1,000 concurrent executions by default (can be increased via AWS quota request)
- **DynamoDB**: On-demand mode scales read/write throughput instantly — no pre-provisioning
- **API Gateway**: Handles up to 10,000 requests/second by default
- **Cognito**: Handles millions of users out of the box
- **S3**: Unlimited storage, 99.999999999% durability

The only scaling concern at large scale would be **DynamoDB Scan operations** used in some admin queries — these should be replaced with paginated queries or DynamoDB Streams + caching for very large employee counts (10,000+).

---

*Last updated: August 2026*
