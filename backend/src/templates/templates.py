import boto3
import json
import time
import os
from botocore.exceptions import ClientError

# Import DynamoDB SDK from boto3
dynamodb = boto3.resource('dynamodb')
# Set the table name from the environment variable on Lambda
table = dynamodb.Table(os.environ.get('TEMPLATES_TABLE'))

def handler(event, context):
    http_method = event['httpMethod']
    # Retries email from API GW requestContext
    email_from_token = event['requestContext']['authorizer']['claims']['email']

    try:
        # Handel GET Method
        if http_method == 'GET':
            query_params = event.get('queryStringParameters', {})
            if 'createdBy' in query_params and email_from_token == query_params['createdBy']:
                return get_templates_by_createdBy(query_params['createdBy'])
            elif 'visibility' in query_params:
                visibility = query_params['visibility']
                return get_templates_by_visibility(visibility)
            else:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid query parameters'})}
            
        # Handle POST Method
        elif http_method == 'POST':
            eventBody = json.loads(event['body'])
            if 'createdBy' in eventBody and email_from_token == eventBody['createdBy']:
                return create_template(event)
            else:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid body'})}
            
        # Handle PUT Method
        elif http_method == 'PUT':
            eventBody = json.loads(event['body'])
            if 'createdBy' in eventBody and email_from_token == eventBody['createdBy']:
                return update_template(event, email_from_token)
            else:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid body'})}

        # Handle DELETE Method
        elif http_method == 'DELETE':
            eventBody = json.loads(event['body'])
            if 'createdBy' in eventBody and email_from_token == eventBody['createdBy']:
                return delete_template(event, email_from_token)
            else:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid body'})}
        
        # Handle Returning Methods Not Allowed
        else:
            return {
                'statusCode': 405,
                'body': json.dumps({'error': 'Method not allowed'})
            }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def get_templates_by_createdBy(createdBy):
    """
    Retrieves templates from a DynamoDB table based on the 'createdBy' attribute.

    This function performs a DynamoDB scan operation to retrieve all templates where the 'createdBy' attribute matches the provided 'createdBy' parameter. 
    
    The function returns a response dictionary with the following structure:
    - 'statusCode': 200 if the operation is successful, 500 if an exception occurs
    - 'headers': A dictionary of HTTP headers, including CORS settings to allow cross-origin access
    - 'body': A JSON-encoded string containing the list of template items retrieved from the DynamoDB table

    Args:
        createdBy (str): The value of the 'createdBy' attribute to filter the templates by.

    Returns:
        dict: A response dictionary containing the retrieved templates.
    """

    try:
        scan_kwargs = {
            'FilterExpression': boto3.dynamodb.conditions.Attr('createdBy').eq(createdBy)
        }
        
        response = table.scan(**scan_kwargs)

        return {
            'statusCode': 200, 
             "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",  # This allows any origin to access your API. 
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken"
                 },
            'body': json.dumps(response['Items'])}
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

def get_templates_by_visibility(visibility):
    """
    Retrieves templates from a DynamoDB table based on the 'visibility' attribute.

    This function performs a DynamoDB scan operation to retrieve all templates where the 'visibility' attribute matches the provided 'visibility' parameter.

    The function returns a response dictionary with the following structure:
    - 'statusCode': 200 if the operation is successful, 500 if an exception occurs
    - 'headers': A dictionary of HTTP headers, including CORS settings to allow cross-origin access
    - 'body': A JSON-encoded string containing the list of template items retrieved from the DynamoDB table

    Args:
        visibility (str): The value of the 'visibility' attribute to filter the templates by.

    Returns:
        dict: A response dictionary containing the retrieved templates.
    """

    try:
        # Directly use the string values for filtering
        scan_kwargs = {
            'FilterExpression': boto3.dynamodb.conditions.Attr('visibility').eq(visibility)
        }
        response = table.scan(**scan_kwargs)
        return {
            'statusCode': 200, 
             "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",  # This allows any origin to access your API. 
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken"
                 },
            'body': json.dumps(response['Items'])}
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}


def create_template(event):
    """
    Creates a new template in a DynamoDB table.

    This function takes the 'body' data from the provided 'event' parameter, which is expected to contain the template data. It generates a unique 'templateId' based on the current epoch time and adds a 'dateCreated' timestamp to the template data.

    The function then attempts to store the template data in the DynamoDB table using the `put_item` method. If the operation is successful, it returns a response dictionary with the following structure:
    - 'statusCode': 201 (Created)
    - 'headers': A dictionary of HTTP headers, including CORS settings to allow cross-origin access
    - 'body': A JSON-encoded string containing a success message

    If an exception occurs during the DynamoDB `put_item` operation, the function will return a response dictionary with a 'statusCode' of 500 (Internal Server Error) and an error message in the 'body'.

    Args:
        event (dict): A dictionary containing the 'body' data for the new template.

    Returns:
        dict: A response dictionary containing the result of the template creation operation.
    """

    data = json.loads(event['body'])
    data['templateId'] = str(time.time())  # Generate a unique ID based on epoch time
    data['dateCreated'] = str(time.time()) # Add creation date
    try:
        table.put_item(Item=data)
        return {
            'statusCode': 201, 
             "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",  # This allows any origin to access your API. 
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken"
                 },
            'body': json.dumps({'message': 'Template created successfully'})}
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}


def update_template(event, email_from_token):
    """
    Updates an existing template in a DynamoDB table.

    This function takes the 'body' data from the provided 'event' parameter, which is expected to contain the updated template data. It first retrieves the existing template item from the DynamoDB table using the 'templateId' provided in the 'body' data.

    The function then checks if the existing template item belongs to the user making the request (identified by the 'email_from_token' parameter). If the item does not exist or the requesting user is not the owner, the function returns a 403 Forbidden response.

    If the requesting user is the owner of the template, the function proceeds to update the template data in the DynamoDB table using the `update_item` method. The updated fields include 'createdBy', 'templateName', 'templateDescription', 'modelversion', 'templatePrompt', 'visibility', 'templateGuidance', and 'systemPrompt'.

    If the update operation is successful, the function returns a response dictionary with the following structure:
    - 'statusCode': 200 (OK)
    - 'headers': A dictionary of HTTP headers, including CORS settings to allow cross-origin access
    - 'body': A JSON-encoded string containing a success message

    If an exception occurs during the DynamoDB `update_item` operation, the function will return a response dictionary with a 'statusCode' of 500 (Internal Server Error) and an error message in the 'body'.

    Args:
        event (dict): A dictionary containing the 'body' data for the updated template.
        email_from_token (str): The email address of the user making the request, extracted from the authorization token.

    Returns:
        dict: A response dictionary containing the result of the template update operation.
    """

    data = json.loads(event['body'])
    template_id = data['templateId']

    # First, retrieve the item to check ownership
    response = table.get_item(Key={'templateId': template_id})
    item = response.get('Item', {})

    # Check if the item exists and if the requesting user is the owner
    if not item or item.get('createdBy') != email_from_token:
        return {'statusCode': 403, 'body': json.dumps({'error': 'Access denied'})}

    try:
        # Update the item in DynamoDB
        response = table.update_item(
            Key={'templateId': template_id},
            UpdateExpression="set createdBy=:cb, templateName=:tn, templateDescription=:td, modelversion=:mv, templatePrompt=:tp, visibility=:v, templateGuidance=:tg, systemPrompt=:sp",
            ExpressionAttributeValues={
                ':cb': data['createdBy'],
                ':tn': data['templateName'],
                ':td': data['templateDescription'],
                ':mv': data['modelversion'],
                ':tp': data['templatePrompt'],
                ':v': data['visibility'],
                ':tg': data['templateGuidance'],
                ':sp': data['systemPrompt']
            },
            ReturnValues="UPDATED_NEW"
        )
        return {
            'statusCode': 200, 
             "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",  # This allows any origin to access your API. 
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken"
                 },
            'body': json.dumps({'message': 'Template updated successfully'})}
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

def delete_template(event, email_from_token):
    """
    Deletes an existing template from a DynamoDB table.

    This function takes the 'body' data from the provided 'event' parameter, which is expected to contain the 'templateId' of the template to be deleted. It first retrieves the existing template item from the DynamoDB table using the provided 'templateId'.

    The function then checks if the existing template item belongs to the user making the request (identified by the 'email_from_token' parameter). If the item does not exist or the requesting user is not the owner, the function returns a 403 Forbidden response.

    If the requesting user is the owner of the template, the function proceeds to delete the template item from the DynamoDB table using the `delete_item` method.

    If the delete operation is successful, the function returns a response dictionary with the following structure:
    - 'statusCode': 200 (OK)
    - 'headers': A dictionary of HTTP headers, including CORS settings to allow cross-origin access
    - 'body': A JSON-encoded string containing a success message

    If an exception occurs during the DynamoDB `delete_item` operation, the function will return a response dictionary with a 'statusCode' of 500 (Internal Server Error) and an error message in the 'body'.

    Args:
        event (dict): A dictionary containing the 'body' data, which is expected to include the 'templateId' of the template to be deleted.
        email_from_token (str): The email address of the user making the request, extracted from the authorization token.

    Returns:
        dict: A response dictionary containing the result of the template deletion operation.
    """
    template_id = json.loads(event['body'])['templateId']

    # First, retrieve the item to check ownership
    response = table.get_item(Key={'templateId': template_id})
    item = response.get('Item', {})

    # Check if the item exists and if the requesting user is the owner
    if not item or item.get('createdBy') != email_from_token:
        return {'statusCode': 403, 'body': json.dumps({'error': 'Access denied'})}

    try:
        table.delete_item(Key={'templateId': template_id})
        return {
            'statusCode': 200, 
             "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",  # This allows any origin to access your API. 
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken"
                 },
            'body': json.dumps({'message': 'Template deleted successfully'})}
    except ClientError as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

