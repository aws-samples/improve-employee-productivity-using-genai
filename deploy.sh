#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Parse command line flags
RUN_BACKEND=false
RUN_FRONTEND=false
USE_CONTAINER=false 

initial_dir=$(pwd)

for arg in "$@"
do
    case $arg in
        --backend)
        RUN_BACKEND=true
        shift # Remove --backend from processing
        ;;
        --frontend)
        RUN_FRONTEND=true
        shift # Remove --frontend from processing
        ;;
        --delete)
        DELETE_STACK=true
        shift # Remove --delete from processing
        ;;
        --region=*)
        AWS_REGION="${arg#*=}"
        shift # Remove --region from processing
        ;;
        --email=*)
        USER_EMAIL="${arg#*=}"
        shift # Remove --email from processing
        ;;
        --container)
        USE_CONTAINER=true
        shift # Remove --container from processing
        ;;
    esac
done

# Deletion function
delete_stack() {
    # Define default stack name
    DEFAULT_STACK_NAME="Employee-Productivity-GenAI-AssistantExample"
    # Read stack name from the first script argument, use default if not provided
    STACK_NAME=${1:-$DEFAULT_STACK_NAME}
    WAF_STACK_NAME=${DEFAULT_STACK_NAME}WAFWebACLv2us-east-1
    # S3 BUCKET Variable
    S3_BUCKET_NAME=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" --output text)
    S3_IMAGE_BUCKET_NAME=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='ImageS3BucketName'].OutputValue" --output text)
    read -p "Are you sure you want to delete the stack $STACK_NAME? This action cannot be undone. (yes/no): " confirmation
    if [[ $confirmation == "yes" ]]; then
        echo "Deleting objects on bucket $S3_BUCKET_NAME and $SE_IMAGE_BUCKET_NAME..."
        for bucket in "$S3_BUCKET_NAME" "$S3_IMAGE_BUCKET_NAME"; do
            aws s3api list-object-versions --bucket "$bucket" --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json | jq -c '.Objects[]' | while read -r obj; do
                key=$(echo "$obj" | jq -r .Key)
                versionId=$(echo "$obj" | jq -r .VersionId)
                aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$versionId"
            done
            # Delete all delete markers
            aws s3api list-object-versions --bucket "$bucket" --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' --output json | jq -c '.Objects[]' | while read -r obj; do
                key=$(echo "$obj" | jq -r .Key)
                versionId=$(echo "$obj" | jq -r .VersionId)
                aws s3api delete-object --bucket "$bucket" --key "$key" --version-id "$versionId"
            done
        done
        echo "Deleting stack $STACK_NAME..."
        # Deleting main SAM template
        sam delete --stack-name "$STACK_NAME" --region "$AWS_REGION"
        echo "Deleting stack $WAF_STACK_NAME..."
        # Deleting WebACL WAFv2 template on us-east-1
        sam delete --stack-name "$WAF_STACK_NAME" --region us-east-1

        echo "Stack deletion finalized."
    else
        echo "Stack deletion cancelled."
    fi
}

# Check if AWS region is set
if [ -z "$AWS_REGION" ]; then
    echo "Error: AWS region is required. Use the --region flag to specify it."
    exit 1
fi

# Check if email is provided
if [ -z "$USER_EMAIL" ]; then
    echo "Error: Email is required. Use the --email flag to specify it."
    exit 1
fi

# Main script body
if [ "$DELETE_STACK" = true ]; then
    delete_stack
    exit 0
fi


# Define default stack name
DEFAULT_STACK_NAME="Employee-Productivity-GenAI-AssistantExample"

# Read stack name from the first script argument, use default if not provided
STACK_NAME=${1:-$DEFAULT_STACK_NAME}
WAF_STACK_NAME=${DEFAULT_STACK_NAME}WAFWebACLv2us-east-1


# Define variables
SAM_TEMPLATE="backend/template.yaml" # Adjust this to the path of your SAM template
FRONTEND_DIR="frontend"

# Define unique dummy value
DUMMY_VALUE=$(date +%s)

# Check prerequisites
echo "Step 1. Checking prerequisites..."

# Node.js version check
NODE_VERSION=$(node -v | cut -d'.' -f1 | cut -d'v' -f2)
if [[ $NODE_VERSION -lt 16 ]]; then
    echo "Error: Node.js version 16 or higher is required."
    exit 1
fi

# Python version check
PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d'.' -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d'.' -f2)

PYTHON3_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
PYTHON3_MAJOR=$(echo "$PYTHON3_VERSION" | cut -d'.' -f1)
PYTHON3_MINOR=$(echo "$PYTHON3_VERSION" | cut -d'.' -f2)

if [[ $PYTHON_MAJOR -lt 3 ]]; then
    if [[ $PYTHON3_MAJOR -lt 3 ]]; then
        echo "Error: Python 3 or higher is required."
        exit 1
    fi
fi

if [[ "$USE_CONTAINER" = false && $PYTHON_MAJOR -eq 3 && $PYTHON_MINOR -lt 11 ]]; then
    echo "Error: Python 3.11 or newer is required."
    echo "This is your Python version: $PYTHON_VERSION"
    exit 1
fi

# SAM CLI check
if ! command -v sam &> /dev/null; then
    echo "Error: SAM CLI is not installed."
    exit 1
fi

# AWS CLI check
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed."
    exit 1
fi

# jq check
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed."
    exit 1
fi

# AWS authentication check
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS CLI is not properly authenticated."
    exit 1
fi

# AWS Cloud 9 Resize
# Set variables
C9_PID=${C9_PID}
C9_PROJECT=${C9_PROJECT}

if [ -z "$C9_PROJECT" ]; then
    echo "Cloud 9 is not being used."
else
    echo "Checking if required to increase Cloud9 Disk size"
    
    # Find the EC2 instance ID that has the C9_PID as part of the Name tag
    INSTANCE_ID=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=*${C9_PID}*" \
        --query "Reservations[].Instances[].InstanceId" \
        --output text)

    if [ -z "$INSTANCE_ID" ]; then
        echo "No EC2 instance found with the specified C9_PID: $C9_PID"
        exit 1
    fi

    # Find the EBS volume ID attached to the EC2 instance
    VOLUME_ID=$(aws ec2 describe-volumes \
        --filters "Name=attachment.instance-id,Values=${INSTANCE_ID}" \
        --query "Volumes[].VolumeId" \
        --output text)

    if [ -z "$VOLUME_ID" ]; then
        echo "No EBS volume found for the EC2 instance: $INSTANCE_ID"
        exit 1
    fi

    # Retrieve the size of the EBS volume
    EBSSIZE=$(aws ec2 describe-volumes \
        --volume-ids "${VOLUME_ID}" \
        --query "Volumes[].Size" \
        --output text)

    if [ "$EBSSIZE" -lt 50 ]; then
        echo "Cloud9 Disk size is: $EBSSIZE GB, will increase now to required 50 GB"
        ERROR=$(./backend/utils/cloud9-resize.sh 2>&1)
        if [ $? -ne 0 ]; then
            echo "Failed to increase Cloud9 Disk Size, see error: $ERROR"
            exit 1
        fi
    else
        echo "Cloud9 instance already meets disk size requirement with $EBSSIZE GB"
    fi
fi




echo "All prerequisites installed!"

if [ "$RUN_BACKEND" = true ] || { [ "$RUN_BACKEND" = false ] && [ "$RUN_FRONTEND" = false ]; }; then
    # Installing Lambda Layer Dependencies
    echo "Step 2 (Backend). Installing Lambda Layer Dependencies..."
    npm ci --prefix backend/layer/authorizer/nodejs/

    echo "Step 3 (Backend). Lambda Layer Dependencies installed."

    # Build SAM template
    echo "Step 4 (Backend). Building SAM template..."
    if [ "$USE_CONTAINER" = true ]; then
        sam build --template "$SAM_TEMPLATE" --parallel --cached --use-container
    else
        sam build --template "$SAM_TEMPLATE" --parallel --cached
    fi

    # Deploy SAM template
    echo "Step 5 (Backend). Deploying SAM template..."
    echo "Region =  $AWS_REGION"

    # Deploying the WebWAF v2 ACL for CloudFront in the us-east-1 region (must be in this region as described in the documentation)
    sam deploy --template-file backend/waf_cloudfront.yaml --stack-name "$WAF_STACK_NAME" --no-confirm-changeset --no-fail-on-empty-changeset --resolve-s3  --region "us-east-1" --capabilities CAPABILITY_IAM
    
    # Grab the Arn of WAFv2 WebACL from the stack
    WAFv2_WEB_ACL_ARN=$(aws cloudformation describe-stacks --region "us-east-1" --stack-name "$WAF_STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='WAFv2WebACL'].OutputValue" --output text)

    # Deploys main SAM template in the region of choice of the user
    sam deploy --stack-name "$STACK_NAME" --no-confirm-changeset --no-fail-on-empty-changeset --region "$AWS_REGION" --resolve-s3 --parameter-overrides DummyParameter="$DUMMY_VALUE" WAFv2WebACL="$WAFv2_WEB_ACL_ARN"  --capabilities CAPABILITY_IAM

    # Steps to deploy API Gateway to Prod Stage
    # Step 1: Get the RestApiId of your deployed API Gateway
    restApiId=$(aws apigateway get-rest-apis --query "items[?name=='EmployeeProductivityGenAIAssistantExampleRESTAPIGW'].id" --output text --region "$AWS_REGION")
    webSocketApiId=$(aws apigatewayv2 get-apis --query "Items[?Name=='EmployeeProductivityGenAIAssistantExampleAPIGWWebSocket'].ApiId" --output text --region "$AWS_REGION")
    
    # Step 2: Create a new deployment
    deploymentId=$(aws apigateway create-deployment --rest-api-id "$restApiId" --stage-name 'Prod' --query 'id' --output text --region "$AWS_REGION")
    webSocketDeploymentId=$(aws apigatewayv2 create-deployment --api-id "$webSocketApiId" --query 'DeploymentId' --output text --region "$AWS_REGION")

    # Step 3: Update the stage to point to the new deployment
    echo "Step 6 (Backend). Deploying API Gateway (REST and WebSocket) Stages"
    aws apigateway update-stage --rest-api-id "$restApiId" --stage-name 'Prod' --patch-operations op='replace',path='/deploymentId',value="$deploymentId" --region "$AWS_REGION" > /dev/null
    aws apigatewayv2 update-stage --api-id "$webSocketApiId" --stage-name 'Prod' --deployment-id "$webSocketDeploymentId" --region "$AWS_REGION" > /dev/null

fi

if [ "$RUN_FRONTEND" = true ] || { [ "$RUN_BACKEND" = false ] && [ "$RUN_FRONTEND" = false ]; }; then
    # Fetching outputs from deployed stack
    echo "Step 7 (Frontend). Fetching stack outputs..."
    API_URL=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='AppApiEndpoint'].OutputValue" --output text)
    WEBSOCKET_URL=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='WebSocketURI'].OutputValue" --output text)
    COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='MyCognitoUserPoolId'].OutputValue" --output text)
    COGNITO_USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolClientId'].OutputValue" --output text)
    S3_BUCKET_NAME=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" --output text)
    CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" --output text)
    COGNITO_URL=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolURL'].OutputValue" --output text)

    # Overwrite or create .env file
    echo "Step 8 (Frontend). Creating or overwriting .env file..."
    cat > "$FRONTEND_DIR/.env" <<EOL
    REACT_APP_API_URL=$API_URL
    REACT_APP_WEBSOCKET_URL=$WEBSOCKET_URL
EOL

    # Overwrite or create aws-exports.json file
    echo "Step 9 (Frontend). Creating or overwriting aws-exports.json file..."
    cat > "$FRONTEND_DIR/src/aws-exports.json" <<EOL
    {

        "aws_project_region": "$AWS_REGION",
        "aws_cognito_region": "$AWS_REGION",
        "aws_user_pools_id": "$COGNITO_USER_POOL_ID",
        "aws_user_pools_web_client_id": "$COGNITO_USER_POOL_CLIENT_ID",
        "federationTarget": "COGNITO_USER_POOLS"
    }
EOL

    # Always build the React app
    echo "Step 10 (Frontend). Building the React app..."
    cd "$FRONTEND_DIR"
    npm ci
    npm run build

    # Deploy the build to S3 if not already synced
    echo "Step 11 (Frontend). Deploying the React app to S3..."
    aws s3 sync build/ s3://"$S3_BUCKET_NAME" --region "$AWS_REGION"

    # Invalidate CloudFront distribution cache
    echo "Step 12 (Frontend). Invalidating CloudFront distribution cache..."
    aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/*" > /dev/null
fi

#  Step 13 Cognito User and Group Creation/Management
echo "Step 13. Managing Cognito User Group and User..."
COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='MyCognitoUserPoolId'].OutputValue" --output text)

# Create Cognito User Group "Admin" if it doesn't exist
if ! aws cognito-idp list-groups --user-pool-id "$COGNITO_USER_POOL_ID" --query "Groups[?GroupName=='Admin']" --output text --region "$AWS_REGION" | grep -q 'Admin'; then
    aws cognito-idp create-group --user-pool-id "$COGNITO_USER_POOL_ID" --group-name Admin --region "$AWS_REGION"
    echo "Admin group created in Cognito."
else
    echo "Admin group already exists in Cognito."
fi

# Check if user already exists
if ! aws cognito-idp admin-get-user --user-pool-id "$COGNITO_USER_POOL_ID" --username "$USER_EMAIL" --region "$AWS_REGION" &> /dev/null; then
    # Create user with verified email and temporary password
    aws cognito-idp admin-create-user --user-pool-id "$COGNITO_USER_POOL_ID" --username "$USER_EMAIL" --user-attributes Name=email,Value="$USER_EMAIL" Name=email_verified,Value=true --temporary-password 'T&st12345!' --message-action SUPPRESS --region "$AWS_REGION" &> /dev/null
    echo "User $USER_EMAIL created with temporary password 'T&st12345!'."
else
    echo "User $USER_EMAIL already exists in Cognito."
fi
# Check if user is part of the Admin group
GROUP_MEMBERSHIP=$(aws cognito-idp admin-list-groups-for-user --user-pool-id "$COGNITO_USER_POOL_ID" --username "$USER_EMAIL" --region "$AWS_REGION" --query "Groups[?GroupName=='Admin'].GroupName" --output text)
if [ "$GROUP_MEMBERSHIP" != "Admin" ]; then
    # Add user to the Admin group
    aws cognito-idp admin-add-user-to-group --user-pool-id "$COGNITO_USER_POOL_ID" --username "$USER_EMAIL" --group-name Admin --region "$AWS_REGION" &> /dev/null
    echo "User $USER_EMAIL added to the Admin group."
else
    echo "User $USER_EMAIL is already a member of the Admin group."
fi

# Step 14: Modify and Upload items to DynamoDB
echo "Step 14. Uploading default Templates to DynamoDB..."

# Returning to initial directory folder if not there yet
if [ "$PWD" != "$initial_dir" ]; then
    echo "Changing directory back to the initial directory $initial_dir."
    cd "$initial_dir"
else
    echo "Already in the initial directory $initial_dir."
fi

# The JSON file with your DynamoDB data
json_file="default_templates.json"

# Fetch the TemplatesTable name
TEMPLATES_TABLE_NAME=$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='TemplatesTableName'].OutputValue" --output text)

while IFS= read -r item; do
    # Extract templateId from the current item
    templateId=$(jq -r '.templateId.S' <<< "$item")

    # Check if the item already exists in the DynamoDB table
    existingItem=$(aws dynamodb get-item --table-name "$TEMPLATES_TABLE_NAME" --key "{\"templateId\": {\"S\": \"$templateId\"}}" --region "$AWS_REGION")

    # If the item does not exist, proceed with uploading
    if [ -z "$(jq -r '.Item' <<< "$existingItem")" ]; then
        # Get the current epoch time in milliseconds
        current_epoch=$(date +%s)

        # Update the item with unique templateId, dateCreated, and createdBy
        jq --arg userEmail "$USER_EMAIL" --arg epoch "$current_epoch" '.dateCreated.S = $epoch | (.createdBy.S) |= $userEmail' <<< "$item" > temp_item.json
    
        # Upload the item to DynamoDB
        aws dynamodb put-item --table-name "$TEMPLATES_TABLE_NAME" --item file://temp_item.json --region "$AWS_REGION"

        echo "Uploaded new item with templateId $templateId to DynamoDB."

        # Remove the temporary file
        rm temp_item.json

    else
        echo "Item with templateId $templateId already exists, skipping upload."
    fi

    # Wait for a short period to avoid throttling
    sleep 1
done < <(jq -c '.Items[]' "$json_file")



echo "Items updated and uploaded to DynamoDB table $TEMPLATES_TABLE_NAME."


# Renumber the final completion message
echo " "
echo " "
echo " "
echo "🎉🎉🎉"
echo "Deployment completed successfully! 🚀"
echo "🎉🎉🎉"

if [ "$RUN_FRONTEND" = true ] || { [ "$RUN_BACKEND" = false ] && [ "$RUN_FRONTEND" = false ]; }; then
    echo " "
    echo " "
    echo "🔗 Access your app at $CLOUDFRONT_URL"
    echo " "
    echo "👤 Admin User Email: $USER_EMAIL"
    echo "🔐 Temporary Password: T&st12345!"
    echo " "
    echo " "
    echo " "
    echo "👍 Have fun using Employee Productivity GenAI Assistant Example!"
fi