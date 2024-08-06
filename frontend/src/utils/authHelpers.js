import { fetchAuthSession } from 'aws-amplify/auth';

export const fetchTokenIfExpired = async () => {
    const now = new Date().getTime();

    try {
        const { tokens } = await fetchAuthSession();

        if (!tokens || !tokens.idToken) {
            throw new Error('No valid session found');
        }

        const token = tokens.idToken.toString();
        const tokenExpiry = tokens.idToken.payload.exp * 1000;

        // Add a buffer time (e.g., 5 minutes) to refresh the token before it expires
        // const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        if (!token || now > tokenExpiry) {
            // Refresh the session
            const { tokens: newTokens } = await fetchAuthSession({ forceRefresh: true });
            return newTokens.idToken.toString();
        }

        return token;
    } catch (error) {
        console.error('Error fetching auth session:', error);
        throw error;
    }
};