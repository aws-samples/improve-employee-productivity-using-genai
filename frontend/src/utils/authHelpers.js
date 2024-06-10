import { Auth } from 'aws-amplify';

export const fetchTokenIfExpired = async () => {
    const now = new Date().getTime();
    const currentSession = await Auth.currentSession();

    if (!currentSession) {
        // Handle the case where there's no session.
        throw new Error('No current session found');
    }

    const token = currentSession.idToken.jwtToken;
    const tokenExpiry = currentSession.idToken.payload.exp * 1000;

    // Here, you might need a threshold to decide when to refresh the token.
    // Just checking if the token has expired might be too late.
    // You could subtract a few minutes (in ms) to ensure you refresh before it actually expires.
    if (!token || now > tokenExpiry) {
        // Assuming Auth.currentSession() would refresh the token
        const currentUser = await Auth.currentAuthenticatedUser({ bypassCache: true });
        return currentUser.signInUserSession.idToken.jwtToken;
    }
    return token;
};
