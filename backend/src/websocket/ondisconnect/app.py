import json

def handler(event, context):
    # Simply log the disconnection event
    connection_id = event['requestContext']['connectionId']
    # Return a successful response
    return {
        'statusCode': 200,
        'body': json.dumps(f"Disconnect successful for {connection_id}")
    }
