/**
 * Checks if a realm URL belongs to the decentraland.org domain
 * @param realmUrl The realm URL to check
 * @returns true if the realm URL belongs to decentraland.org, false otherwise
 */
export function isDecentralandRealm(realmUrl: string): boolean {
  if (!realmUrl) return false;
  
  try {
    const url = new URL(realmUrl);
    return url.hostname.endsWith('decentraland.org');
  } catch (e) {
    console.error('[isDecentralandRealm] Invalid URL:', e);
    return false;
  }
} 