import fs from 'fs';
import path from 'path';
import { CreatorToken } from './TheForge/utils/types';
import { generateId } from 'colyseus';
import { getCache, loadCache, updateCache, cacheSyncToFile } from '../utils/cache';

// Define the tokens cache key
export const TOKENS_CACHE_KEY = 'tokens';

/**
 * Manages creator tokens in the system
 */
export class TokenManager {
  private tokensFilePath: string;

  constructor() {
    this.tokensFilePath = path.join(__dirname, '../../data/tokens.json');
    this.initTokens();
  }

  /**
   * Initialize tokens from file and set in cache
   */
  private initTokens(): void {
    try {
      if (!fs.existsSync(this.tokensFilePath)) {
        fs.writeFileSync(this.tokensFilePath, JSON.stringify([], null, 2));
      }

      // Load tokens into cache
      loadCache(this.tokensFilePath, TOKENS_CACHE_KEY);
      const tokens = getCache(TOKENS_CACHE_KEY);
      
      console.log(`Loaded ${tokens.length} tokens from storage`);
    } catch (error) {
      console.error('Error initializing tokens:', error);
      // Initialize with empty array if loading fails
      loadCache(this.tokensFilePath, TOKENS_CACHE_KEY);
    }
  }

  /**
   * Get all tokens
   */
  public getAllTokens(): CreatorToken[] {
    return getCache(TOKENS_CACHE_KEY) || [];
  }

  /**
   * Get tokens created by a specific creator
   */
  public getTokensByCreator(creatorAddress: string): CreatorToken[] {
    const tokens = this.getAllTokens();
    return tokens.filter(token => 
      token.creator.toLowerCase() === creatorAddress.toLowerCase()
    );
  }

  /**
   * Get a specific token by ID
   */
  public getTokenById(tokenId: string): CreatorToken | null {
    const tokens = this.getAllTokens();
    return tokens.find(token => token.id === tokenId) || null;
  }

  /**
   * Check if a token with given name or symbol already exists
   */
  public tokenExists(name: string, symbol: string): boolean {
    const tokens = this.getAllTokens();
    return tokens.some(token => 
      token.name.toLowerCase() === name.toLowerCase() || 
      token.symbol.toLowerCase() === symbol.toLowerCase()
    );
  }

  /**
   * Create a new token
   */
  public createToken(tokenData: Partial<CreatorToken>): CreatorToken {
    // Verify token doesn't already exist
    if (this.tokenExists(tokenData.name || '', tokenData.symbol || '')) {
      throw new Error('A token with this name or symbol already exists');
    }

    const now = new Date().toISOString();
    
    // Create new token
    const newToken: CreatorToken = {
      id: generateId(),
      creator: tokenData.creator || '',
      name: tokenData.name || '',
      symbol: tokenData.symbol || '',
      description: tokenData.description || '',
      media: tokenData.media || { image: '' },
      totalSupply: tokenData.totalSupply || 1000000, // Default to 1,000,000 as number
      circulatingSupply: 0, // Starts at zero as number
      initialPrice: tokenData.initialPrice || 0.01, // Default to $0.01 per token as number
      usableAsPayment: true, // Always true for now
      usableAsReward: true, // Always true for now
      createdAt: now,
      updatedAt: now
    };

    // Save to cache and file
    const tokens = this.getAllTokens();
    tokens.push(newToken);
    updateCache(this.tokensFilePath, TOKENS_CACHE_KEY, tokens);
    this.saveTokensToFile();

    return newToken;
  }

  /**
   * Update token circulating supply
   */
  public updateTokenSupply(tokenId: string, circulatingSupply: string | number): boolean {
    const tokens = this.getAllTokens();
    const tokenIndex = tokens.findIndex(token => token.id === tokenId);
    
    if (tokenIndex === -1) return false;
    
    // Store directly as provided type (string or number)
    tokens[tokenIndex].circulatingSupply = circulatingSupply;
    tokens[tokenIndex].updatedAt = new Date().toISOString();
    
    updateCache(this.tokensFilePath, TOKENS_CACHE_KEY, tokens);
    this.saveTokensToFile();
    
    return true;
  }

  /**
   * Save tokens to file
   */
  private saveTokensToFile(): void {
    try {
      cacheSyncToFile(this.tokensFilePath, TOKENS_CACHE_KEY, null);
    } catch (error) {
      console.error('Error saving tokens to file:', error);
    }
  }
} 