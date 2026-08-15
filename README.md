# Employee Attendance Management System

A simple, cloud-native employee attendance tracking system built on AWS. Employees can check in/out daily and view their attendance history, while admins can monitor all employees' attendance in real-time.

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

## Prerequisites

Before deploying, make sure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
   ```bash
   aws configure
   ```
3. **AWS SAM CLI** installed
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
