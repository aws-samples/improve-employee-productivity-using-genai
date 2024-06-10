#!/bin/bash

# Define the user pool ID and the initial password
USER_POOL_ID="COGNITO_USER_POOL_ID"
INITIAL_PASSWORD='TEMPORARY_PASSWORD'

# Array of user emails
declare -a USER_EMAILS=("user1@amazon.com" "user1@amazon.com" "user1@amazon.com")

# Loop through each email and create a user
for EMAIL in "${USER_EMAILS[@]}"
do
  echo "Creating user: $EMAIL"

  # Create the user with the initial password and set them to change password at first login
  aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name="email",Value="$EMAIL" Name="email_verified",Value="true" \
    --temporary-password "$INITIAL_PASSWORD" \
    --message-action "SUPPRESS" \
    --force-alias-creation

  # Check if user creation was successful before attempting to set password
  if [ $? -eq 0 ]; then
    echo "User  $EMAIL created"
  
  else
    echo "Failed to create user $EMAIL"
  fi
done

echo "User creation process completed."