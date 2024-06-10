import boto3
import json
import time
import os
from botocore.exceptions import ClientError

# Set up DynamoDB client
dynamodb = boto3.resource('dynamodb')
# Set up DynamoDB table
table = dynamodb.Table(os.environ.get('DYNAMODB_TABLE'))

def handler(event, context):
    http_method = event['httpMethod']
    # extract email value from the requestContext (provided by API GW input)
    email_from_token = event['requestContext']['authorizer']['claims']['email']

    try:
        # Handle GET requests
        if http_method == 'GET':
            query_params = event.get('queryStringParameters', {})
            last_key_email = query_params.get('last_key_email')
            last_key_timestamp = query_params.get('last_key_timestamp')
            limit = query_params.get('limit', 10)  # Default to 10 items per page
        
            # Make sure the user requesting is the same user authenticated (security check)
            if 'email' in query_params and email_from_token == query_params['email']:
                return get_history_by_createdBy(query_params['email'], last_key_email, last_key_timestamp, limit)
            else:
                # If not, return an error
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid query parameters'})}

        # Handle DELETE requests
        elif http_method == 'DELETE':
            eventBody = json.loads(event['body'])
            # Make sure the user requesting is the same user authenticated (security check)
            if 'email' in eventBody and email_from_token == eventBody['email']:
                return delete_history(event, email_from_token)
            else:
                # If not, return an error
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid body'})}
        else:
            # Handle other HTTP methods, which are not supported
            return {
                'statusCode': 405,
                'body': json.dumps({'error': 'Method not allowed'})
            }
    except Exception as e:
        # Handle any other errors
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

# Function to get history by email (createdBy) field
def get_history_by_createdBy(email, last_key_email=None, last_key_timestamp=None, limit=10):
    """
    Retrieves the history items for the specified user, with optional pagination.

    This function queries the DynamoDB table to retrieve the history items for the specified user. If the `last_key_email` and `last_key_timestamp` parameters are provided, the function uses them to continue the pagination from the last retrieved page.

    Args:
        email (str): The email address of the user whose history should be retrieved.
        last_key_email (str, optional): The email address of the last evaluated key, used for pagination.
        last_key_timestamp (str, optional): The timestamp of the last evaluated key, used for pagination.
        limit (int, optional): The maximum number of history items to retrieve, defaults to 10.

    Returns:
        dict: A response object containing the status code, headers, and the retrieved history items, along with the last evaluated key for pagination.
    """
    try:
        query_kwargs = {
            'KeyConditionExpression': boto3.dynamodb.conditions.Key('email').eq(email),
            'Limit': limit
        }

        # Check if both parts of the last evaluated key are provided and use them
        if last_key_email and last_key_timestamp:
            query_kwargs['ExclusiveStartKey'] = {
                'email': last_key_email,
                'timestamp': last_key_timestamp
            }

        # Query the DynamoDB table with arguments of user
        response = table.query(**query_kwargs)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', 
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken'
            },
            'body': json.dumps({
                'items': response['Items'],
                'last_evaluated_key': response.get('LastEvaluatedKey')  # Can be used for subsequent queries
            })
        }
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}


# Function to delete history by email (createdBy) field
def delete_history(event, email_from_token):
    """
    Deletes a user's history item from the DynamoDB table.

    This function first retrieves the item from the table to check if the requesting user is the owner of the item.
    If the item exists and the requesting user is the owner, the function deletes the item from the table.
    If the item does not exist or the requesting user is not the owner, the function returns a 403 Forbidden response.
    If an exception occurs during the operation, the function returns a 500 Internal Server Error response.

    Args:
        event (dict): The event object containing the request data, including the email and timestamp of the history item to be deleted.
        email_from_token (str): The email of the user making the request, extracted from the authorization token.

    Returns:
        dict: A response object containing the status code and, if successful, a message indicating that the history was deleted successfully.
    """

    body = json.loads(event['body'])
    email = body.get('email')
    timestamp = body.get('timestamp')
    
    try:
        # Retrieve the item to check ownership and existence
        response = table.get_item(Key={'email': email, 'timestamp': timestamp})
        item = response.get('Item', {})

        # Check if the item exists and if the requesting user is the owner
        if not item or item.get('email') != email_from_token:
            return {'statusCode': 403, 'body': json.dumps({'error': 'Access denied'})}

        # Delete the item
        table.delete_item(Key={'email': email, 'timestamp': timestamp})
        return {
            'statusCode': 200, 
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', 
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken'
            },
            'body': json.dumps({'message': 'History deleted successfully'})}
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

