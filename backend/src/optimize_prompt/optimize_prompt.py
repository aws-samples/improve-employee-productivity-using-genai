import boto3
import json
import os
from botocore.exceptions import ClientError

# Initialize Bedrock Agent Runtime client
bedrock_agent = boto3.client('bedrock-agent-runtime')

def handler(event, context):
    http_method = event['httpMethod']
    # Retrieves email from API GW requestContext
    email_from_token = event['requestContext']['authorizer']['claims']['email']

    try:
        # Handle POST Method for prompt optimization
        if http_method == 'POST':
            event_body = json.loads(event['body'])
            if 'prompt' in event_body and 'targetModelId' in event_body:
                return optimize_prompt(event_body)
            else:
                return {
                    'statusCode': 400, 
                    'body': json.dumps({'error': 'Missing required fields: prompt and targetModelId'})
                }
        
        # Handle Returning Methods Not Allowed
        else:
            return {
                'statusCode': 405,
                'body': json.dumps({'error': 'Method not allowed. Only POST is supported.'})
            }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def optimize_prompt(event_body):
    """
    Optimizes a prompt using Amazon Bedrock's prompt optimization feature.
    
    Args:
        event_body (dict): Contains:
            - prompt (str): The prompt text to optimize
            - targetModelId (str): The model ID to optimize the prompt for
            
    Returns:
        dict: Response containing the optimization results or error message
    """
    try:
        # Prepare the input for optimization
        input_data = {
            "textPrompt": {
                "text": event_body['prompt']
            }
        }
        
        # Call Bedrock's optimize_prompt API
        response = bedrock_agent.optimize_prompt(
            input=input_data,
            targetModelId=event_body['targetModelId']
        )
        
        # Process the response stream
        optimization_results = {
            'analysis': None,
            'optimizedPrompt': None
        }
        
        # Extract information from the event stream
        event_stream = response.get('optimizedPrompt', [])
        for event in event_stream:
            if 'analyzePromptEvent' in event:
                optimization_results['analysis'] = event['analyzePromptEvent'].get('message')
            elif 'optimizedPromptEvent' in event:
                optimization_results['optimizedPrompt'] = event['optimizedPromptEvent']

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken'
            },
            'body': json.dumps(optimization_results)
        }
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        
        # Map specific Bedrock error codes to appropriate HTTP status codes
        status_code = {
            'ValidationException': 400,
            'AccessDeniedException': 403,
            'ThrottlingException': 429,
            'InternalServerException': 500,
            'DependencyFailedException': 424,
            'BadGatewayException': 502
        }.get(error_code, 500)
        
        return {
            'statusCode': status_code,
            'body': json.dumps({
                'error': error_message,
                'errorCode': error_code
            })
        }

