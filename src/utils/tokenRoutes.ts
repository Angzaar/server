import express from 'express';
import { TokenManager } from '../components/TokenManager';
import { validateAuthentication } from './signatures';
import { ethers } from 'ethers';

const router = express.Router();
const tokenManager = new TokenManager();

// Authentication middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const { signature, message, timestamp, userId } = req.body;
    
    // Validate authentication data
    if (!signature || !message || !timestamp || !userId) {
      return res.status(401).json({ error: 'Authentication data missing' });
    }
    
    // Create options for validation
    const authOptions = {
      signature,
      message,
      timestamp,
      userId,
      realm: 'web-dapp'
    };
    
    // Validate signature
    if (!validateAuthentication(authOptions)) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    // Set user data on request
    (req as any).user = { address: userId };
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Simple admin check middleware
const checkUserPermissions = (roles: string[]) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // For now just check if user is an admin based on address
    // In a real app, you'd check a database
    const adminAddresses = [
      '0xaabe0ecfaf9e028d63cf7ea7e772cf52d662691b'.toLowerCase()
    ];
    
    const userAddress = ((req as any).user?.address || '').toLowerCase();
    const isAdmin = adminAddresses.includes(userAddress);
    
    if (roles.includes('admin') && !isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

/**
 * @route GET /api/tokens
 * @desc Get all tokens
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    const tokens = tokenManager.getAllTokens();
    
    // Handle pagination if needed
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const startIndex = (page - 1) * limit;
    
    const paginatedTokens = tokens.slice(startIndex, startIndex + limit);
    
    res.status(200).json({
      totalTokens: tokens.length,
      totalPages: Math.ceil(tokens.length / limit),
      currentPage: page,
      tokens: paginatedTokens
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

/**
 * @route GET /api/tokens/creator/:address
 * @desc Get tokens by creator
 * @access Public
 */
router.get('/creator/:address', (req, res) => {
  try {
    const { address } = req.params;
    const tokens = tokenManager.getTokensByCreator(address);
    
    res.status(200).json({ tokens });
  } catch (error) {
    console.error('Error fetching creator tokens:', error);
    res.status(500).json({ error: 'Failed to fetch creator tokens' });
  }
});

/**
 * @route GET /api/tokens/:id
 * @desc Get token by ID
 * @access Public
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const token = tokenManager.getTokenById(id);
    
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error fetching token:', error);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

/**
 * @route POST /api/tokens
 * @desc Create a new token
 * @access Private
 */
router.post('/', authenticateToken, (req, res) => {
  try {
    const {
      name,
      symbol,
      description,
      media,
      totalSupply,
      initialPrice,
      usableAsPayment,
      usableAsReward
    } = req.body;
    
    // Validate required fields
    if (!name || !symbol || !totalSupply) {
      return res.status(400).json({ error: 'Name, symbol, and totalSupply are required' });
    }
    
    // Check if token already exists
    if (tokenManager.tokenExists(name, symbol)) {
      return res.status(409).json({ error: 'A token with this name or symbol already exists' });
    }
    
    // Create the token
    const creator = (req as any).user.address;
    const newToken = tokenManager.createToken({
      name,
      symbol,
      description,
      media,
      creator,
      totalSupply,
      initialPrice,
      usableAsPayment,
      usableAsReward
    });
    
    res.status(201).json({ token: newToken });
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({ error: 'Failed to create token' });
  }
});

/**
 * @route PUT /api/tokens/:id/supply
 * @desc Update token circulating supply (admin only)
 * @access Private
 */
router.put('/:id/supply', authenticateToken, checkUserPermissions(['admin']), (req, res) => {
  try {
    const { id } = req.params;
    const { circulatingSupply } = req.body;
    
    if (!circulatingSupply) {
      return res.status(400).json({ error: 'Circulating supply is required' });
    }
    
    const success = tokenManager.updateTokenSupply(id, circulatingSupply);
    
    if (!success) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    res.status(200).json({ message: 'Token supply updated successfully' });
  } catch (error) {
    console.error('Error updating token supply:', error);
    res.status(500).json({ error: 'Failed to update token supply' });
  }
});

export default router; 