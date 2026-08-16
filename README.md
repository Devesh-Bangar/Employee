# 🏢 Employee Attendance Management System

A cloud-native, serverless employee attendance tracking system built on AWS. Employees can check in/out daily and view their attendance history, while admins can monitor all employees in real-time.

> 📐 See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full deep-dive into the system architecture and tech stack.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [AWS Account Setup](#aws-account-setup)
3. [Local Environment Setup](#local-environment-setup)
4. [Deploy the Backend](#deploy-the-backend)
5. [Configure the Frontend](#configure-the-frontend)
6. [Deploy the Frontend](#deploy-the-frontend)
7. [Create Users](#create-users)
8. [Run & Test the App](#run--test-the-app)
9. [Updating the App](#updating-the-app)
10. [API Reference](#api-reference)
11. [Cleanup](#cleanup)

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| AWS CLI | v2+ | [Download](https://aws.amazon.com/cli/) |
| AWS SAM CLI | Latest | [Download](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) |
| Python | 3.11+ | [Download](https://www.python.org/downloads/) |
| Git | Any | [Download](https://git-scm.com/) |

---

## AWS Account Setup

> ⚠️ **Skip this section** if you already have an AWS account with CLI credentials configured.

### Step 1 — Create an AWS Account

1. Go to **[aws.amazon.com](https://aws.amazon.com/)** → click **"Create an AWS Account"**
2. Follow the signup wizard (you'll need: email, phone number, and a credit/debit card for verification)
3. After creation, sign in at **[console.aws.amazon.com](https://console.aws.amazon.com/)**

> 💡 New AWS accounts qualify for the **AWS Free Tier** — most services used by this project are covered under it.

---

### Step 2 — Create an IAM User (for CLI Deployments)

Using your root account directly is a security risk. Create a dedicated IAM user instead:

1. In the AWS Console, search for **"IAM"** and open it
2. In the left panel → **Users** → **Create user**
3. Set **User name**: `sam-deploy-user` → click **Next**
4. Select **"Attach policies directly"**
5. Search for and select **`AdministratorAccess`** → click **Next** → **Create user**

> ⚠️ `AdministratorAccess` is fine for initial setup. In production, use least-privilege IAM policies.

---

### Step 3 — Generate Access Keys

1. In IAM → **Users** → click `sam-deploy-user`
2. Go to the **"Security credentials"** tab
3. Scroll to **"Access keys"** → click **"Create access key"**
4. Choose **"Command Line Interface (CLI)"** → check the confirmation → **Create access key**
5. **🚨 COPY BOTH KEYS NOW** — you cannot view the Secret Access Key again after closing this page!

```
Access Key ID:      AKIAIOSFODNN7EXAMPLE
Secret Access Key:  wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

---

### Step 4 — Configure AWS CLI

Open your terminal and run:

```bash
aws configure
```

Enter the following when prompted:

```
AWS Access Key ID [None]:     → paste your Access Key ID
AWS Secret Access Key [None]: → paste your Secret Access Key
Default region name [None]:   ap-south-1
Default output format [None]: json
```

**Verify it works:**

```bash
aws sts get-caller-identity
```

Expected output:
```json
{
  "UserId": "AIDAIOSFODNN7EXAMPLE",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/sam-deploy-user"
}
```

---

## Local Environment Setup

### Step 1 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/employee-attendance-system.git
cd employee-attendance-system
```

### Step 2 — Verify CLI Tools

```bash
# Check AWS CLI
aws --version
# Expected: aws-cli/2.x.x ...

# Check SAM CLI
sam --version
# Expected: SAM CLI, version 1.x.x

# Check Python
python3 --version
# Expected: Python 3.11.x or higher
```

### Step 3 — Install SAM CLI (if not installed)

```bash
# macOS (Homebrew)
brew install aws-sam-cli

# Windows (MSI Installer)
# Download from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Linux
pip install aws-sam-cli
```

---

## Deploy the Backend

The entire backend infrastructure (Lambda, API Gateway, DynamoDB, Cognito, S3) is defined in `template.yaml` and deployed via AWS SAM.

### Step 1 — Build the SAM Application

```bash
sam build
```

This compiles your Lambda function and packages all dependencies. You should see:
```
Build Succeeded
Built Artifacts  : .aws-sam/build
```

### Step 2 — Deploy (First Time Only)

```bash
sam deploy --guided
```

Answer the prompts as follows:

```
Stack Name [attendance-system]: attendance-system
AWS Region [ap-south-1]: ap-south-1
Confirm changes before deploy [Y/n]: Y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default
```

> The first deployment takes ~3–5 minutes. CloudFormation will create all resources.

### Step 3 — Save the Stack Outputs

After deployment succeeds, the terminal will display the **Outputs** section. **Copy and save all values:**

```
Key                 Value
---                 -----
ApiUrl              https://abc123xyz.execute-api.ap-south-1.amazonaws.com/Prod
UserPoolId          ap-south-1_XXXXXXXXX
UserPoolClientId    xxxxxxxxxxxxxxxxxxxxxxxxxx
FrontendBucketName  attendance-frontend-123456789012
FrontendWebsiteUrl  http://attendance-frontend-123456789012.s3-website.ap-south-1.amazonaws.com
```

> 💡 You can also retrieve outputs anytime by running:
> ```bash
> aws cloudformation describe-stacks --stack-name attendance-system --query "Stacks[0].Outputs"
> ```

### Step 4 — Link the Post-Confirmation Trigger

This step connects the Lambda trigger to Cognito so that a DynamoDB record is auto-created whenever a new user confirms their account.

Replace `YOUR_USER_POOL_ID`, `YOUR_REGION`, and `YOUR_ACCOUNT_ID` with your actual values:

```bash
aws cognito-idp update-user-pool \
  --user-pool-id YOUR_USER_POOL_ID \
  --lambda-config PostConfirmation=arn:aws:lambda:YOUR_REGION:YOUR_ACCOUNT_ID:function:attendance-post-confirmation
```

**Example:**
```bash
aws cognito-idp update-user-pool \
  --user-pool-id ap-south-1_AbCdEfGhI \
  --lambda-config PostConfirmation=arn:aws:lambda:ap-south-1:123456789012:function:attendance-post-confirmation
```

---

## Configure the Frontend

You must inject your AWS resource IDs into the frontend JavaScript files before deploying to S3.

### 1. Update `frontend/js/auth.js`

Open the file and find the `COGNITO_CONFIG` block. Replace with your values:

```javascript
const COGNITO_CONFIG = {
  UserPoolId: "ap-south-1_XXXXXXXXX",          // ← your UserPoolId output
  ClientId: "xxxxxxxxxxxxxxxxxxxxxxxxxx",        // ← your UserPoolClientId output
};
```

### 2. Update `frontend/js/api.js`

Find the `API_BASE_URL` constant and replace it:

```javascript
const API_BASE_URL = "https://abc123xyz.execute-api.ap-south-1.amazonaws.com/Prod";
// ↑ your ApiUrl output (no trailing slash)
```

---

## Deploy the Frontend

After updating the config files, upload the frontend to S3:

```bash
# Replace with your actual bucket name from the outputs
aws s3 sync frontend/ s3://YOUR_FRONTEND_BUCKET_NAME/ --delete
```

**Example:**
```bash
aws s3 sync frontend/ s3://attendance-frontend-123456789012/ --delete
```

Your app is now live at the `FrontendWebsiteUrl`. Open it in your browser to verify.

---

## Create Users

Users are managed via **Amazon Cognito**. Use the following commands to create admin and employee accounts.

### Create an Admin User

```bash
# 1. Create the user
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@company.com \
  --user-attributes \
    Name=email,Value=admin@company.com \
    Name=name,Value="Admin User" \
    Name=email_verified,Value=true \
  --temporary-password "TempPass@123"

# 2. Add to admin group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@company.com \
  --group-name admin
```

### Create an Employee User

```bash
# 1. Create the user
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username rahul@company.com \
  --user-attributes \
    Name=email,Value=rahul@company.com \
    Name=name,Value="Rahul Sharma" \
    Name=email_verified,Value=true \
  --temporary-password "TempPass@123"

# 2. Add to employee group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username rahul@company.com \
  --group-name employee
```

> 💡 On **first login**, users will be prompted to set a permanent password. The temporary password will no longer work after that.

### Bulk Import Users (Optional)

If you have existing users to import in bulk, use the helper script:

```bash
python3 sync_users.py
```

---

## Run & Test the App

### Full Test Flow

1. Open your `FrontendWebsiteUrl` in a browser
2. **Login** with admin credentials → redirected to Admin Dashboard
3. Admin Dashboard shows all employees (0 present, all absent)
4. Open an **incognito window** → login as an employee
5. **Employee Dashboard** → click **Check In** → records current time
6. Switch to Admin Dashboard → **refresh** → employee now shows as **Present**
7. Back in Employee window → click **Check Out** → records time
8. **Attendance History** table now shows today's record with check-in/out times
9. Admin can use the **date filter** to view attendance for any past day

### Local Frontend Development

To iterate on the UI locally without uploading to S3 every time:

```bash
cd frontend
python3 -m http.server 8080
```

Open **[http://localhost:8080/login.html](http://localhost:8080/login.html)** in your browser. The frontend will still call your real AWS backend APIs.

### Run All API Tests via cURL

First, get your ID token by logging in through the app and copying it from `localStorage` (DevTools → Application → Local Storage → `idToken`).

```bash
export TOKEN="eyJraWQi..."   # paste your idToken here
export API="https://abc123xyz.execute-api.ap-south-1.amazonaws.com/Prod"

# Employee: Check In
curl -X POST "$API/attendance/check-in" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json"

# Employee: Check Out
curl -X POST "$API/attendance/check-out" \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json"

# Employee: Attendance History (last 30 days)
curl "$API/attendance/history" \
  -H "Authorization: $TOKEN"

# Admin: Today's Attendance Summary
curl "$API/attendance/today" \
  -H "Authorization: $TOKEN"

# Admin: Attendance for a Specific Date
curl "$API/attendance/all?date=2026-08-15" \
  -H "Authorization: $TOKEN"

# Admin: All Employees List
curl "$API/employees" \
  -H "Authorization: $TOKEN"
```

---

## Updating the App

### Update Backend Code

```bash
# After editing backend/attendance/app.py
sam build
sam deploy   # uses samconfig.toml — no guided prompts needed
```

### Update Frontend

```bash
# After editing any file in frontend/
aws s3 sync frontend/ s3://YOUR_FRONTEND_BUCKET_NAME/ --delete
```

### View Lambda Logs

```bash
# Tail live logs from the main Lambda function
sam logs -n attendance-handler --stack-name attendance-system --tail

# View logs for the post-confirmation trigger
sam logs -n attendance-post-confirmation --stack-name attendance-system --tail
```

---

## API Reference

All endpoints require a valid Cognito `idToken` in the `Authorization` header.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/attendance/check-in` | Employee | Record today's check-in time |
| `POST` | `/attendance/check-out` | Employee | Record today's check-out time |
| `GET` | `/attendance/history` | Employee | Get last 30 days attendance |
| `GET` | `/attendance/today` | Admin | Today's summary (present/absent stats) |
| `GET` | `/attendance/all?date=YYYY-MM-DD` | Admin | Attendance for a specific date |
| `GET` | `/employees` | Admin | List all employees |

---

## Project Structure

```
employee-attendance-system/
├── frontend/
│   ├── login.html          # Login page
│   ├── employee.html       # Employee dashboard
│   ├── admin.html          # Admin dashboard
│   ├── css/
│   │   └── style.css       # Design system & styles
│   └── js/
│       ├── auth.js         # Cognito authentication
│       ├── api.js          # API client (base URL + token)
│       ├── employee.js     # Employee dashboard logic
│       └── admin.js        # Admin dashboard logic
├── backend/
│   └── attendance/
│       └── app.py          # Lambda handler (all routes)
├── template.yaml           # AWS SAM IaC template
├── samconfig.toml          # SAM deployment configuration
├── sync_users.py           # Bulk user import script
├── ARCHITECTURE.md         # System architecture deep-dive
├── README.md               # This file
└── .gitignore
```

---

## Cleanup

To completely remove all AWS resources created by this project:

```bash
# 1. Empty the S3 bucket first (required before stack deletion)
aws s3 rm s3://YOUR_FRONTEND_BUCKET_NAME --recursive

# 2. Delete the CloudFormation stack (removes all AWS resources)
sam delete --stack-name attendance-system
```

> ⚠️ This is **irreversible**. All DynamoDB data, Cognito users, and Lambda functions will be permanently deleted.

---

## Timezone

All dates and times are stored and displayed in **Asia/Kolkata (IST, UTC+5:30)**.

---

## License

MIT

## Architecture

```
User (Browser)
    │
    ▼
Amazon S3 (Static Frontend)
    │
    ▼
API Gateway (REST API + Cognito Authorizer)
    │
    ▼
AWS Lambda (Python 3.12)
    │
    ▼
Amazon DynamoDB
    
Amazon Cognito → Authentication & JWT Tokens
Amazon CloudWatch → Logs & Monitoring
```

## Technology Stack

| Layer          | Technology                |
|----------------|---------------------------|
| Frontend       | HTML, CSS, JavaScript     |
| Backend        | Python 3.12 (AWS Lambda)  |
| API            | Amazon API Gateway (REST) |
| Database       | Amazon DynamoDB           |
| Authentication | Amazon Cognito            |
| Hosting        | Amazon S3                 |
| Monitoring     | Amazon CloudWatch         |
| IaC            | AWS SAM                   |

## Features

### Employee
- Login with email and password
- Check in (once per day)
- Check out (once per day, after check-in)
- View attendance history (last 30 days)

### Admin
- View all employees
- View today's attendance with stats (total, present, absent)
- Filter attendance by date
- Search employees by name or email

## 0. AWS Account & CLI Setup

If you are starting from scratch, follow these steps to set up your AWS environment:

### Step A: Create an AWS Account
1. Go to [aws.amazon.com](https://aws.amazon.com/) and click **"Create an AWS Account"**.
2. Follow the on-screen prompts to sign up (you will need an email, phone number, and a credit/debit card for identity verification).
3. Once created, sign in to the **AWS Management Console** using your root email address.

### Step B: Create an IAM User (For Deployment)
It is best practice not to use your root account for deployments. We will create a dedicated IAM user:
1. In the AWS Console search bar at the top, type **"IAM"** and click on the IAM service.
2. In the left navigation pane, click **"Users"** -> **"Create user"**.
3. **User name**: `sam-deploy-user` (or any name you like) -> Click **Next**.
4. **Permissions**: Select **"Attach policies directly"**.
5. Search for and check the box next to **`AdministratorAccess`** -> Click **Next** -> Click **Create user**.
   *(Note: AdministratorAccess is easiest for initial setup, but in production, you should use least-privilege IAM policies).*

### Step C: Generate Access Keys
1. Still in IAM, click on the name of the user you just created (`sam-deploy-user`).
2. Go to the **"Security credentials"** tab.
3. Scroll down to **"Access keys"** and click **"Create access key"**.
4. Select **"Command Line Interface (CLI)"** -> Check the confirmation box -> Click **Next** -> Click **Create access key**.
5. **CRITICAL:** Copy the **Access Key ID** and **Secret Access Key**. *You will not be able to see the Secret Access Key again after closing this page!*

### Step D: Configure AWS CLI Locally
1. Ensure the AWS CLI is installed on your computer ([Download here](https://aws.amazon.com/cli/)).
2. Open your terminal and run:
   ```bash
   aws configure
   ```
3. When prompted, enter the credentials you got in Step C:
   - **AWS Access Key ID**: Paste your Access Key ID
   - **AWS Secret Access Key**: Paste your Secret Access Key
   - **Default region name**: `ap-south-1` (or your preferred region, e.g., `us-east-1`)
   - **Default output format**: `json`

You are now authenticated and ready to deploy!

## 1. Prerequisites

Before deploying the actual code, make sure you have:

1. **AWS CLI** configured (completed in Step D above)
2. **AWS SAM CLI** installed
   ```bash
   brew install aws-sam-cli    # macOS
   # or visit: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
   ```

## Project Structure

```
employee-attendance/
├── frontend/
│   ├── login.html          # Login page
│   ├── employee.html       # Employee dashboard
│   ├── admin.html          # Admin dashboard
│   ├── css/
│   │   └── style.css       # Design system
│   └── js/
│       ├── auth.js         # Cognito authentication
│       ├── api.js          # API client
│       ├── employee.js     # Employee dashboard logic
│       └── admin.js        # Admin dashboard logic
├── backend/
│   ├── attendance/
│   │   └── app.py          # Lambda handler (all routes)
│   └── requirements.txt    # Python dependencies
├── template.yaml           # AWS SAM template
├── README.md
└── .gitignore
```

## Deployment

### Step 1: Deploy the Backend (SAM)

```bash
# Build the SAM application
sam build

# Deploy (first time — guided)
sam deploy --guided
```

During guided deployment, you'll be asked for:
- **Stack Name**: `attendance-system`
- **AWS Region**: `ap-south-1` (or your preferred region)
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Save arguments to samconfig.toml**: `Y`

After deployment, note the **Outputs**:
- `ApiUrl` — Your API Gateway endpoint
- `UserPoolId` — Cognito User Pool ID
- `UserPoolClientId` — Cognito App Client ID
- `FrontendBucketName` — S3 bucket for frontend
- `FrontendWebsiteUrl` — Your app's URL

### Step 2: Link Cognito Post-Confirmation Trigger

After deploying the SAM stack, link the post-confirmation Lambda trigger to the Cognito User Pool:

```bash
aws cognito-idp update-user-pool \
  --user-pool-id YOUR_USER_POOL_ID \
  --lambda-config PostConfirmation=arn:aws:lambda:REGION:ACCOUNT_ID:function:attendance-post-confirmation
```

### Step 3: Create Users in Cognito

#### Create an Admin User

```bash
# Create the user
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@company.com \
  --user-attributes Name=email,Value=admin@company.com Name=name,Value="Admin User" Name=email_verified,Value=true \
  --temporary-password "TempPass@123"

# Add to admin group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@company.com \
  --group-name admin
```

#### Create an Employee User

```bash
# Create the user
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username rahul@company.com \
  --user-attributes Name=email,Value=rahul@company.com Name=name,Value="Rahul Sharma" Name=email_verified,Value=true \
  --temporary-password "TempPass@123"

# Add to employee group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username rahul@company.com \
  --group-name employee
```

> **Note**: On first login, users will be prompted to set a new password (temporary password flow).

### Step 4: Configure the Frontend

Update the configuration values in the frontend files:

**`frontend/js/auth.js`** — Update these lines:
```javascript
const COGNITO_CONFIG = {
  UserPoolId: "YOUR_USER_POOL_ID",    // from SAM outputs
  ClientId: "YOUR_CLIENT_ID",         // from SAM outputs
};
```

**`frontend/js/api.js`** — Update this line:
```javascript
const API_BASE_URL = "YOUR_API_GATEWAY_URL";  // from SAM outputs (ApiUrl)
```

### Step 5: Deploy the Frontend to S3

```bash
# Upload all frontend files
aws s3 sync frontend/ s3://YOUR_FRONTEND_BUCKET_NAME/ --delete

# Verify
echo "App is live at: YOUR_FRONTEND_WEBSITE_URL"
```

## Testing the Application

### Test Flow

1. Open the S3 website URL in your browser
2. **Login** with the admin credentials → should redirect to Admin Dashboard
3. **Admin Dashboard**: should show 0 present, all absent
4. Open a new incognito window → login as an employee
5. **Employee Dashboard**: click **Check In** → should record time
6. Go back to Admin Dashboard → refresh → employee should show as **Present**
7. **Employee Dashboard**: click **Check Out** → should record time
8. **Employee Dashboard**: verify **Attendance History** table shows today's record
9. **Admin Dashboard**: change date filter → should show empty/different data

### API Testing with cURL

```bash
# Get a token first (login via the app and copy from localStorage)
TOKEN="your-id-token-here"

# Check In
curl -X POST https://YOUR_API/Prod/attendance/check-in \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json"

# Check Out
curl -X POST https://YOUR_API/Prod/attendance/check-out \
  -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json"

# Attendance History
curl https://YOUR_API/Prod/attendance/history \
  -H "Authorization: $TOKEN"

# Today's Attendance (Admin)
curl https://YOUR_API/Prod/attendance/today \
  -H "Authorization: $TOKEN"

# All Employees (Admin)
curl https://YOUR_API/Prod/employees \
  -H "Authorization: $TOKEN"
```

## Cleanup

To delete all AWS resources:

```bash
# Delete the SAM stack
sam delete --stack-name attendance-system

# Empty and delete the S3 bucket (if not auto-deleted)
aws s3 rm s3://YOUR_FRONTEND_BUCKET_NAME --recursive
aws s3 rb s3://YOUR_FRONTEND_BUCKET_NAME
```

## Timezone

All dates and times are displayed in **Asia/Kolkata (IST, UTC+5:30)**.

## License

MIT
