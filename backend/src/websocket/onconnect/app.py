import json

def handler(event, context):
    # The onConnect event is triggered when a new WebSocket connection is established.
    # You can perform any connection initialization logic here, such as
    # logging the connection, storing connection details in a database, etc.

    connection_id = event['requestContext']['connectionId']

    # Return a successful response
    return {
        'statusCode': 200,
        'body': json.dumps('Connect successful')
    }
