import json
import boto3
import os
from langchain_aws import ChatBedrock
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.messages import HumanMessage
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory
from langchain_core.output_parsers import StrOutputParser

# Function to retrieve and trim session history from DynamoDB
def get_session_history(session_id, email, table_name, max_length=20, max_words=50000):
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)
    composite_key = {"SessionId": session_id, "Email": email}

    response = table.get_item(Key=composite_key)
    messages = response.get('Item', {}).get('History', [])
    
    # Trim history based on constraints
    if len(messages) > max_length:
        messages = messages[-max_length:]

    total_words = sum(len(msg['data']['content'].split()) for msg in messages)
    while total_words > max_words and messages:
        total_words -= len(messages.pop(0)['data']['content'].split())

    # Update the item in DynamoDB if necessary
    if len(messages) < max_length or total_words <= max_words:
        table.update_item(
            Key=composite_key,
            UpdateExpression='SET History = :val',
            ExpressionAttributeValues={':val': messages}
        )
    
    return DynamoDBChatMessageHistory(table_name=table_name, session_id=session_id, key=composite_key)

def handler(event, context):
    table_name = os.environ.get('DYNAMODB_TABLE')

    # Extract information from the event
    email = event['requestContext']['authorizer']['principalId']
    domain_name = event['requestContext']['domainName']
    stage = event['requestContext']['stage']
    connection_id = event['requestContext']['connectionId']

    # Initialize the API Gateway Management API
    api_gateway_management_api = boto3.client('apigatewaymanagementapi', endpoint_url=f'https://{domain_name}/{stage}')

    # Parse the incoming message
    body = json.loads(event['body'])
    action = body.get('action')
    system_prompt = body.get('system_prompt', None)  
    data = body.get('data')

    if action == 'chat':
        # Extract necessary parameters for Langchain Bedrock
        max_tokens_to_sample = body.get('max_tokens_to_sample', 4000)
        temperature = body.get('temperature', 0)
        modelId = body.get('modelId', "anthropic.claude-3-haiku-20240307-v1:0")
        top_k = body.get('top_k', 250)
        top_p = body.get('top_p', 0.999)
        session_id = body.get('session_id')

        my_key = {
            "SessionId": session_id,
            "Email": email
        }

        # Configure the Bedrock model
        chat_model = ChatBedrock(
            model_id=modelId,
            model_kwargs={
                "temperature": temperature,
                "max_tokens": max_tokens_to_sample,
                "top_k": top_k,
                "top_p": top_p
            }
        )

        # Define the chat prompt template for interaction
        if system_prompt:
            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", system_prompt),
                    MessagesPlaceholder(variable_name="history"),
                    ("human", "{question}"),
                ]
            )
        else:
             prompt = ChatPromptTemplate.from_messages(
                [
                    MessagesPlaceholder(variable_name="history"),
                    ("human", "{question}"),
                ]
            )

        # Combine the prompt with the Bedrock chat model and parse the output as a string
        chat_chain = prompt | chat_model | StrOutputParser()

        composite_key = {
            "SessionId": session_id,  # Use your session ID here
            "Email": email       # Use your user's email here
        }

        # Chain with History
        chain_with_history = RunnableWithMessageHistory(
            chat_chain,
            lambda session_id: get_session_history(session_id, email, table_name),
            input_messages_key="question",
            history_messages_key="history",
        )

        configuration = {"configurable": {"session_id": session_id}}

        try:
            # Stream responses
            for response in chain_with_history.stream(input={"question": data}, config=configuration):
                formatted_response = json.dumps({'messages': response})
                api_gateway_management_api.post_to_connection(ConnectionId=connection_id, Data=formatted_response)
            
            final_response = json.dumps({"endOfMessage": True})
            api_gateway_management_api.post_to_connection(ConnectionId=connection_id, Data=final_response)

        except Exception as e:
            error_message = json.dumps({'action': 'error', 'error': str(e)})
            api_gateway_management_api.post_to_connection(ConnectionId=connection_id, Data=error_message)
            return {'statusCode': 500, 'body': error_message}

        return {'statusCode': 200, 'body': 'Chat message processed successfully'}