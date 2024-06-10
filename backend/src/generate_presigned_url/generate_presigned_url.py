import boto3
import os
import json
from http import HTTPStatus

def handler(event, context):
    # Parse the request body
    body = json.loads(event['body'])

    # Get bucket name from environment variables
    bucket_name = os.environ['IMAGE_UPLOAD_BUCKET']

    # Get the file name and file type from the request
    file_name = body['fileName']
    file_type = body['fileType']

    # Get the AWS region from environment variables
    region = os.environ['AWS_REGION']

    # Initialize S3 client
    s3_client = boto3.client('s3', region_name=region)

    try:
        # Generate a pre-signed URL for the PUT operation with a 5-minute expiration
        presigned_url = s3_client.generate_presigned_url('put_object',
                                                         Params={'Bucket': bucket_name,
                                                                 'Key': file_name,
                                                                 'ContentType': file_type},
                                                         ExpiresIn=120)

        # Modify the URL to include the region if not already present
        if "s3.amazonaws.com" in presigned_url:
            presigned_url = presigned_url.replace("s3.amazonaws.com", f"s3.{region}.amazonaws.com")

        # Return the pre-signed URL in the response
        return {
            'statusCode': HTTPStatus.OK,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',  # Adjust the CORS policy as needed
                 "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,authorizationtoken"
            },
            'body': json.dumps({
                'uploadUrl': presigned_url
            })
        }

    except Exception as e:
        # Log and return error
        print(e)
        return {
            'statusCode': HTTPStatus.INTERNAL_SERVER_ERROR,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'message': 'Error generating pre-signed URL'
            })
        }
