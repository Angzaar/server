import { OAuth2Client } from 'google-auth-library';

// // Replace with your actual Google Client ID
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Validates a Google OAuth token
 * @param token The Google OAuth ID token
 * @returns The validated user data
 */
export async function validateGoogleToken(token: string) {
  if (!token) {
    throw new Error('No Google token provided');
  }

  try {
    // Verify the token with Google
    const ticket = await googleAuthClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google token payload');
    }
    
    const userId = payload.sub; // Unique Google user ID
    const email = payload.email; 
    const name = payload.name || email?.split('@')[0] || 'User';
    const picture = payload.picture;
    
    return {
      userId,
      email,
      name,
      picture,
      authType: 'google'
    };
  } catch (err) {
    console.error('Google token validation error:', err);
    throw new Error('Invalid Google token');
  }
}

/**
 * Validates a MetaMask signature
 * @param address The user's Ethereum address
 * @param signature The signature to validate
 * @param message The original message that was signed
 * @param timestamp The timestamp when the message was created
 * @returns The validated user data
 */
export async function validateMetaMaskSignature(
  address: string,
  signature: string,
  message: string,
  timestamp: number
) {
  if (!address || !signature || !message) {
    throw new Error('Missing MetaMask authentication parameters');
  }
  
  try {
    // You can implement actual signature validation here
    // For now, we'll just return the user data
    
    return {
      userId: address,
      name: `MetaMask User (${address.slice(0, 6)}...)`,
      authType: 'metamask'
    };
  } catch (err) {
    console.error('MetaMask signature validation error:', err);
    throw new Error('Invalid MetaMask signature');
  }
}

/**
 * Master authentication function that handles different auth types
 * @param options Authentication options from the client
 * @returns Validated user data
 */
export async function authenticateUser(options: any) {
  const { authType } = options;
  
  if (authType === 'google') {
    return validateGoogleToken(options.token);
  } else if (authType === 'metamask') {
    return validateMetaMaskSignature(
      options.userId,
      options.signature,
      options.message,
      options.timestamp
    );
  } else {
    throw new Error(`Unsupported authentication type: ${authType}`);
  }
}

/**
 * Validates user credentials and creates/updates a profile if needed
 * This function is intended to be used in the Colyseus onAuth method
 */
export async function validateAndCreateProfile(client: any, options: any, req: any) {
  try {
    // Authenticate user with the appropriate method
    const userData = await authenticateUser(options);
    
    // Set user data on the client
    client.userData = userData;
    client.auth = {
      ...userData,
      realm: options.realm || 'web-dapp',
      questId: options.questId
    };
    
    // You might want to save/update the user in a database here
    
    return client.auth;
  } catch (error: any) {
    console.error("Auth error:", error.message);
    throw new Error(`Authentication failed: ${error.message}`);
  }
} 