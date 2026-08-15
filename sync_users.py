import boto3
from datetime import datetime

cognito = boto3.client('cognito-idp', region_name='ap-south-1')
dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
table = dynamodb.Table('Employees')

USER_POOL_ID = 'ap-south-1_AeTWB26mZ'

response = cognito.list_users(UserPoolId=USER_POOL_ID)
users = response.get('Users', [])

for user in users:
    attrs = {attr['Name']: attr['Value'] for attr in user['Attributes']}
    sub = attrs.get('sub')
    email = attrs.get('email', '')
    name = attrs.get('name', '')
    
    if sub:
        # Check groups to determine role
        group_resp = cognito.admin_list_groups_for_user(
            UserPoolId=USER_POOL_ID,
            Username=user['Username']
        )
        groups = [g['GroupName'] for g in group_resp.get('Groups', [])]
        role = 'admin' if 'admin' in groups else 'employee'
        
        table.put_item(
            Item={
                'employee_id': sub,
                'name': name,
                'email': email,
                'role': role,
                'created_at': datetime.utcnow().isoformat() + "Z"
            }
        )
        print(f"Added {name} ({email}) to DynamoDB")

print("Done syncing users.")
