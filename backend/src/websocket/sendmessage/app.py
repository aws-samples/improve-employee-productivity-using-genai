import json
import boto3
import botocore
import os
import time
import base64
from botocore.exceptions import ClientError

def get_images_from_s3_as_base64(image_keys):
    """Download images from S3 and convert to base64."""
    s3 = boto3.client('s3')
    image_data_list = []
    for key in image_keys:
        try:
            response = s3.get_object(Bucket=os.environ['IMAGE_UPLOAD_BUCKET'], Key=key)
            image_data = response['Body'].read()
            image_data_list.append(base64.b64encode(image_data).decode('utf-8'))
        except Exception as e:
            print(f"Error getting object {key}.", str(e))
            image_data_list.append(None)
    return image_data_list

def handler(event, context):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ.get('DYNAMODB_TABLE'))

    # Extract information from the event
    domain_name = event['requestContext']['domainName']
    stage = event['requestContext']['stage']
    connection_id = event['requestContext']['connectionId']

    # Initialize the API Gateway Management API
    api_gateway_management_api = boto3.client('apigatewaymanagementapi', endpoint_url=f'https://{domain_name}/{stage}')

    # Parse the incoming message
    body = json.loads(event['body'])
    action = body.get('action')
    data = body.get('data')

    # Retrieve optional parameters or set default values
    max_tokens_to_sample = body.get('max_tokens_to_sample', 4000)
    temperature = body.get('temperature', 0)
    modelId = body.get('modelId', "anthropic.claude-3-haiku-20240307-v1:0")
    top_k = body.get('top_k', 250)
    top_p = body.get('top_p', 0.999)

    # Extract necessary information
    email = event['requestContext']['authorizer']['principalId']
    source_ip = event['requestContext']['identity']['sourceIp']
    request_id = event['requestContext']['requestId']
    user_agent = event['requestContext']['identity']['userAgent']
    prompt_data = body.get('data', '')
    current_timestamp = str(int(time.time()))

    # Retrieves 'system' if provided, else None
    system_prompt = body.get('system', None)  

    # Extract image keys from the event body
    image_s3_keys = body.get('imageS3Keys', [])

    # Only attempt to process the image is provided
    if image_s3_keys:
        # Make sure the list does not exceed 6 items
        image_s3_keys = image_s3_keys[:6]
        
        images_base64 = get_images_from_s3_as_base64(image_s3_keys)

    # Initialize Bedrock client
    boto3_bedrock = boto3.client('bedrock-runtime')

    # Prepare the request for Bedrock
    if action == 'sendmessage':

        # Prepare the request for Bedrock, including the optional image
        messages_content = [
            {
             "type": "text", 
             "text": data
            }
        ]

        if image_s3_keys:
            for image_base64 in images_base64:
                messages_content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": image_base64}
                })
    
        message = [
            {
                "role": "user", 
                "content": messages_content
            }
        ]
    
        # Prepare the JSON payload for Bedrock
        bedrock_request_dict = {
            "anthropic_version": "bedrock-2023-05-31",
            "messages": message,
            "max_tokens": max_tokens_to_sample,
            "temperature": temperature,
            "top_k": top_k,
            "top_p": top_p
        }

        # Only add 'system' to payload if it was provided
        if system_prompt:
            bedrock_request_dict["system"] = system_prompt

        # Now convert the dictionary to a JSON string
        bedrock_payload = json.dumps(bedrock_request_dict)
        
        accept = "application/json"
        contentType = "application/json"
        
        # Initialize a list to collect text chunks
        text_chunks = []
        
        # Invoke Bedrock model
        try:
            response = boto3_bedrock.invoke_model_with_response_stream(body=bedrock_payload, modelId=modelId, accept=accept, contentType=contentType)
            stream = response.get('body')
            if stream:
                for event in stream:
                    chunk = json.loads(event["chunk"]["bytes"])
                    if chunk['type'] == 'content_block_delta':
                        if chunk['delta']['type'] == 'text_delta':
                            text = chunk['delta'].get('text', '')
                            if text:
                                # Append text to the list
                                text_chunks.append(text)
    
                                # Wrap text in JSON structure
                                response_message = json.dumps({"messages": text})
                                api_gateway_management_api.post_to_connection(
                                    ConnectionId=connection_id,
                                    Data=response_message
                                )

            # Join all text chunks into a single string
            complete_text = ''.join(text_chunks)
            
            
            # Prepare the item to insert into DynamoDB
            item_to_insert = {
                'email': email,
                'timestamp': current_timestamp,
                'requestId': request_id,
                'promptData': prompt_data,
                'modelId': modelId,
                'sourceIp': source_ip,
                'requestBody': json.dumps(body),
                'userAgent': user_agent,
                'completion': complete_text
            }

            # Add the imageS3Key to the item if it exists
            if image_s3_keys:
                item_to_insert['imageS3Keys'] = image_s3_keys
            
            if system_prompt:
                item_to_insert['systemPrompt'] = system_prompt

            # Insert the data into DynamoDB
            response = table.put_item(Item=item_to_insert)

            # After sending all chunks, send the end-of-message signal
            end_of_message_signal = json.dumps({"endOfMessage": True})
            api_gateway_management_api.post_to_connection(
                ConnectionId=connection_id,
                Data=end_of_message_signal
            )

        except botocore.exceptions.ClientError as error:
            error_message = error.response['Error']['Message']
            print(f"Error: {error_message}")
    
            # Construct an error message
            errorMessage = {
                'action': 'error',
                'error': error_message
            }
    
            # Send the error message to the client
            try:
                api_gateway_management_api.post_to_connection(
                    ConnectionId=event['requestContext']['connectionId'],
                    Data=json.dumps(errorMessage)
                )
            except botocore.exceptions.ClientError as e:
                # Handle potential errors in sending the message
                print(f"Error sending message to client: {str(e)}")
    
            return {
                'statusCode': 500,
                'body': f'Error: {error_message}'
            }

    return {
        'statusCode': 200,
        'body': 'Message processed'
    }
