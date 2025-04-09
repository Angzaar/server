import { ethers } from 'ethers';

/**
 * Verifies an Ethereum signature to confirm the user owns the wallet address
 * 
 * @param message - The original message that was signed
 * @param signature - The signature produced by the wallet
 * @param address - The wallet address claiming to have signed the message
 * @returns Boolean indicating if the signature is valid
 */
export const verifySignature = (
  message: string,
  signature: string,
  address: string
): boolean => {
  try {
    // Recover the address from the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    // Compare with lowercase to avoid case sensitivity issues
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
};

/**
 * Verifies signature and checks that the timestamp is recent
 * 
 * @param options - The authentication options object
 * @returns Boolean indicating if the signature is valid and recent
 */
export const validateAuthentication = (options: any): boolean => {
  // If we don't have signature data, reject for web-dapp clients
  if (options.realm === 'web-dapp' && (!options.signature || !options.message || !options.timestamp)) {
    console.log('Missing signature data for web-dapp client');
    return false;
  }
  
  // Skip signature check for non-web-dapp clients for backwards compatibility
  if (options.realm !== 'web-dapp') {
    return true;
  }
  
  // Verify the timestamp isn't too old (prevent replay attacks)
  const now = Date.now();
  const messageTime = parseInt(options.timestamp);
  const fiveMinutesMs = 5 * 60 * 1000;
  
  if (isNaN(messageTime) || now - messageTime > fiveMinutesMs) {
    console.log('Signature timestamp too old or invalid');
    return false;
  }
  
  // Verify the signature matches the expected message format
  const expectedMessage = `The Forge Authentication: ${options.timestamp}`;
  if (options.message !== expectedMessage) {
    console.log('Message format invalid');
    return false;
  }
  
  // Verify the signature itself
  return verifySignature(options.message, options.signature, options.userId);
}; 