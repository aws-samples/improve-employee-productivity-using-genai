import json
import boto3
import botocore
import os
import time
import base64
from botocore.exceptions import ClientError

def get_images_from_s3_as_base64(image_keys):
    """Download images from S3 and return raw bytes."""
    s3 = boto3.client('s3')
    image_data_list = []
    for key in image_keys:
        try:
            response = s3.get_object(Bucket=os.environ['IMAGE_UPLOAD_BUCKET'], Key=key)
            image_data = response['Body'].read()  # Get raw bytes
            # Get the file extension and normalize jpg to jpeg
            image_format = key.split('.')[-1].lower()
            if image_format == 'jpg':
                image_format = 'jpeg'
            
            # Store both the raw bytes and the normalized format
            image_data_list.append({
                'data': image_data,  # Store raw bytes instead of base64
                'format': image_format
            })
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
    
    # Retrieve thinking mode parameters
    thinking_enabled = body.get('thinking_enabled', False)
    print("Thinking enabled:", thinking_enabled)
    thinking_budget_tokens = body.get('thinking_budget_tokens', 16000)
    print("Thinking budget tokens:", thinking_budget_tokens)
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
        messages_content = []

        if data:
            messages_content.append({"text": data})

        if image_s3_keys:
            for image_info in images_base64:
                if image_info:  # Check if image was successfully retrieved
                    messages_content.append({
                        "image": {
                            "format": image_info['format'],
                            "source": {
                                "bytes": image_info['data']  # Raw bytes
                            }
                        }
                    })

        message = [
            {
                "role": "user",
                "content": messages_content
            }
        ]

        # Initialize lists to collect text chunks and thinking chunks
        text_chunks = []
        thinking_chunks = []
        current_thinking = ""
        
        # Initialize token usage and latency tracking
        input_tokens = 0
        output_tokens = 0
        latency_ms = 0

        # Prepare inference config
        inference_config = {
            "maxTokens": max_tokens_to_sample,
            "temperature": temperature,
            "topP": top_p
        }

        # Prepare additional model request fields for Claude 3.7 Sonnet thinking mode
        additional_model_request_fields = None
        if thinking_enabled and "claude-3-7" in modelId:
            print("Thinking enabled for Claude 3.7 model")
            additional_model_request_fields = {
                "reasoning_config": {
                    "type": "enabled",
                    "budget_tokens": thinking_budget_tokens
                }
            }
        elif thinking_enabled and modelId == "us.anthropic.claude-3-7-sonnet-20250219-v1:0":
            # This is for backward compatibility
            print("Thinking enabled for Claude 3.7 Sonnet")
            additional_model_request_fields = {
                "reasoning_config": {
                    "type": "enabled",
                    "budget_tokens": thinking_budget_tokens
                }
            }

        # Invoke Bedrock model using ConverseStream
        try:
            # Prepare the API call arguments
            converse_args = {
                "modelId": modelId,
                "messages": message,
                "inferenceConfig": inference_config
            }
            
            # Add additionalModelRequestFields only if thinking is enabled
            if additional_model_request_fields:
                converse_args["additionalModelRequestFields"] = additional_model_request_fields
                
            # Add system prompt if provided
            if system_prompt:
                converse_args["system"] = system_prompt
                
            # Make the API call
            response = boto3_bedrock.converse_stream(**converse_args)
            
            stream = response.get('stream')
            if stream:
                for chunk in stream:
                    # Track token usage and latency if available in metadata
                    if 'metadata' in chunk:
                        if 'usage' in chunk['metadata']:
                            if 'inputTokens' in chunk['metadata']['usage']:
                                input_tokens = chunk['metadata']['usage']['inputTokens']
                                print(f"Input tokens: {input_tokens}")
                            if 'outputTokens' in chunk['metadata']['usage']:
                                output_tokens = chunk['metadata']['usage']['outputTokens']
                                print(f"Output tokens: {output_tokens}")
                        
                        # Track latency metrics
                        if 'metrics' in chunk['metadata']:
                            if 'latencyMs' in chunk['metadata']['metrics']:
                                latency_ms = chunk['metadata']['metrics']['latencyMs']
                                print(f"Latency (ms): {latency_ms}")
                            
                        # Send token usage and latency info to client
                        if input_tokens > 0 or output_tokens > 0 or latency_ms > 0:
                            metrics_message = json.dumps({
                                "metrics": {
                                    "tokenUsage": {
                                        "inputTokens": input_tokens,
                                        "outputTokens": output_tokens
                                    },
                                    "latency": {
                                        "latencyMs": latency_ms
                                    }
                                }
                            })
                            api_gateway_management_api.post_to_connection(
                                ConnectionId=connection_id,
                                Data=metrics_message
                            )
                                
                    if "contentBlockDelta" in chunk:
                        delta = chunk["contentBlockDelta"]["delta"]
                        
                        # Handle text delta
                        if "text" in delta:
                            text = delta["text"]
                            if text:
                                # Append text to the list
                                text_chunks.append(text)

                                # Wrap text in JSON structure
                                response_message = json.dumps({"messages": text})
                                api_gateway_management_api.post_to_connection(
                                    ConnectionId=connection_id,
                                    Data=response_message
                                )
                        
                        # Handle reasoning content for Claude 3.7
                        elif "reasoningContent" in delta and "text" in delta["reasoningContent"]:
                            thinking_text = delta["reasoningContent"]["text"]
                            if thinking_text:
                                print("Reasoning text:", thinking_text)
                                # Append thinking to the list
                                thinking_chunks.append(thinking_text)
                                current_thinking += thinking_text
                                
                                # Send thinking separately
                                thinking_message = json.dumps({"thinking": thinking_text})
                                print("Thinking message:", thinking_message)
                                api_gateway_management_api.post_to_connection(
                                    ConnectionId=connection_id,
                                    Data=thinking_message
                                )
                                
                    # Legacy thinking content handling
                    elif "thinking" in chunk:
                        thinking_text = chunk["thinking"].get("thinking_delta")
                        if thinking_text:
                            print("Thinking text:", thinking_text)
                            # Append thinking to the list
                            thinking_chunks.append(thinking_text)
                            current_thinking += thinking_text
                            
                            # Send thinking separately
                            thinking_message = json.dumps({"thinking": thinking_text})
                            print("Thinking message:", thinking_message)
                            api_gateway_management_api.post_to_connection(
                                ConnectionId=connection_id,
                                Data=thinking_message
                            )
                    
                    # Handle redacted thinking (for safety filtered content)
                    elif "redacted_thinking" in chunk:
                        # Just send a notification that thinking was redacted
                        print("Redacted thinking detected")
                        redacted_message = json.dumps({"redacted_thinking": True})
                        api_gateway_management_api.post_to_connection(
                            ConnectionId=connection_id,
                            Data=redacted_message
                        )

            # Join all text chunks into a single string
            complete_text = ''.join(text_chunks)
            complete_thinking = ''.join(thinking_chunks)
            
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
            
            # Add token usage to the database item
            if input_tokens > 0 or output_tokens > 0:
                item_to_insert['tokenUsage'] = {
                    'inputTokens': input_tokens,
                    'outputTokens': output_tokens
                }
                
            # Add latency to the database item
            if latency_ms > 0:
                item_to_insert['latency'] = {
                    'latencyMs': latency_ms
                }

            # Add thinking if available
            if complete_thinking:
                print("Adding thinking to item:", complete_thinking)
                item_to_insert['thinking'] = complete_thinking

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
