const { CognitoJwtVerifier } = require("aws-jwt-verify");

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: "id", // or "id"
  clientId: process.env.APP_CLIENT_ID,
});

exports.handler = async (event) => {
    // Extract the token from query parameters
    const token = event.queryStringParameters.Authorization || event.queryStringParameters.authorization ;

    try {
        const payload = await verifier.verify(token);
        // Generate and return an IAM policy that allows the WebSocket connection
        return generatePolicy(payload.email, 'Allow', event.methodArn);
    } catch (err) {
        console.error("Authorization failed:", err);
        // Generate and return an IAM policy that denies the WebSocket connection
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

// Helper function to generate an IAM policy
function generatePolicy(principalId, effect, resource) {
    return {
        principalId: principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource
                }
            ]
        }
    };
}