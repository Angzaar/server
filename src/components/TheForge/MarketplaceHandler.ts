import { Client } from "colyseus";
import { getCache, updateCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, PROFILES_FILE, REWARDS_CACHE_KEY } from "../../utils/initializer";
import { TokenManager } from "../TokenManager";
import { generateId } from "colyseus";

const tokenManager = new TokenManager();

/**
 * Handle marketplace purchase requests
 * This function processes token payments for marketplace items
 */
export function handleMarketplacePurchase(client: Client, message: any) {
  console.log("handleMarketplacePurchase", message);
  
  try {
    // Validate required fields
    if (!message.userId || !message.rewardId || !message.payment) {
      console.error("Missing required fields for purchase", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Missing required fields for purchase" 
      });
      return;
    }
    
    // Validate payment fields
    const { amount, currency } = message.payment;
    if (!amount || !currency) {
      console.error("Invalid payment information", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Invalid payment information" 
      });
      return;
    }
    
    // Validate the user exists
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((p: any) => p.ethAddress === message.userId);
    
    if (!userProfile) {
      console.error("User profile not found", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "User profile not found" 
      });
      return;
    }
    
    // Validate the reward exists
    const rewards = getCache(REWARDS_CACHE_KEY);
    const reward = rewards.find((r: any) => r.id === message.rewardId);
    
    if (!reward) {
      console.error("Reward not found", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Reward not found" 
      });
      return;
    }
    
    // Validate that the reward is listed for sale
    if (!reward.listing || !reward.listing.listed) {
      console.error("Reward not listed for sale", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "This item is not available for purchase" 
      });
      return;
    }
    
    // Validate that the reward has a price and it matches the payment amount
    if (!reward.listing.price || 
        !reward.listing.price.amount || 
        Number(reward.listing.price.amount) !== Number(amount)) {
      console.error("Invalid payment amount", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Invalid payment amount" 
      });
      return;
    }
    
    // Validate the currency matches
    const rewardCurrency = reward.listing.price.currency;
    let isValidCurrency = false;
    
    // Handle different currency types
    if (typeof rewardCurrency === 'string' && rewardCurrency === currency) {
      isValidCurrency = true;
    } else if (rewardCurrency.symbol && rewardCurrency.symbol === currency.symbol) {
      isValidCurrency = true;
    } else if (rewardCurrency.iso && rewardCurrency.iso === currency.iso) {
      isValidCurrency = true;
    } else if (rewardCurrency.tokenId && rewardCurrency.tokenId === currency.tokenId) {
      isValidCurrency = true;
    }
    
    if (!isValidCurrency) {
      console.error("Invalid payment currency", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Invalid payment currency" 
      });
      return;
    }
    
    // Handle token payment for creator tokens
    if (rewardCurrency.tokenId) {
      const tokenId = rewardCurrency.tokenId;
      
      // Initialize tokens array if it doesn't exist
      if (!userProfile.tokens) {
        userProfile.tokens = [];
      }
      
      // Find the token in the user's tokens array
      const userTokenIndex = userProfile.tokens.findIndex((t: any) => 
        t.id === tokenId || (t.token && t.token.id === tokenId)
      );
      
      // Check if user has the token and enough balance
      if (userTokenIndex === -1) {
        console.error("Token not found in user inventory", message);
        client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
          success: false, 
          message: "Token not found in your inventory" 
        });
        return;
      }
      
      const userToken = userProfile.tokens[userTokenIndex];
      const userBalance = userToken.balance ? Number(userToken.balance) : 0;
      
      if (userBalance < Number(amount)) {
        console.error("Insufficient token balance", message);
        client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
          success: false, 
          message: "Insufficient token balance" 
        });
        return;
      }
      
      // Deduct tokens from user balance
      userProfile.tokens[userTokenIndex].balance = String(userBalance - Number(amount));
      userProfile.tokens[userTokenIndex].lastUpdate = new Date().toISOString();
      
      // Get token details for notification
      const token = tokenManager.getTokenById(tokenId);
      
      // Add tokens to creator balance
      const creatorProfile = profiles.find((p: any) => p.ethAddress === reward.creator);
      if (creatorProfile) {
        // Initialize tokens array if it doesn't exist
        if (!creatorProfile.tokens) {
          creatorProfile.tokens = [];
        }
        
        // Find the token in the creator's tokens array
        const creatorTokenIndex = creatorProfile.tokens.findIndex((t: any) => 
          t.id === tokenId || (t.token && t.token.id === tokenId)
        );
        
        if (creatorTokenIndex !== -1) {
          // Update existing token balance
          const currentBalance = Number(creatorProfile.tokens[creatorTokenIndex].balance || 0);
          creatorProfile.tokens[creatorTokenIndex].balance = String(currentBalance + Number(amount));
          creatorProfile.tokens[creatorTokenIndex].lastUpdate = new Date().toISOString();
        } else if (token) {
          // Add token to creator's inventory
          creatorProfile.tokens.push({
            id: tokenId,
            balance: String(amount),
            lastUpdate: new Date().toISOString(),
            token: {
              id: tokenId,
              creator: token.creator,
              name: token.name,
              symbol: token.symbol,
              description: token.description,
              media: token.media
            }
          });
        }
      }
    }
    
    // Add the reward to the user's inventory
    if (!userProfile.tokens) {
      userProfile.tokens = [];
    }
    
    // Create a copy of the reward for the user's inventory
    const userReward = {
      id: reward.id,
      instanceId: generateId(), // Unique instance ID for this particular reward copy
      token: {
        ...reward,
        acquisitionInfo: {
          acquiredAt: new Date().toISOString(),
          source: "marketplace",
          price: {
            amount,
            currency: rewardCurrency
          }
        }
      }
    };
    
    // Add to user's inventory
    userProfile.tokens.push(userReward);
    
    // Update the reward's available quantity
    if (reward.listing.quantity !== undefined) {
      reward.listing.quantity = Math.max(0, reward.listing.quantity - 1);
      
      // If quantity reaches 0, mark as not listed
      if (reward.listing.quantity === 0) {
        reward.listing.listed = false;
      }
    }
    
    // Save changes
    updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
    
    // Send success response to client
    client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
      success: true, 
      message: "Purchase successful",
      reward: userReward
    });
    
    // Log the successful purchase
    console.log(`Successful marketplace purchase: User ${message.userId} purchased ${reward.name} for ${amount} ${JSON.stringify(currency)}`);
  } catch (error) {
    console.error("Error processing marketplace purchase:", error);
    client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
      success: false, 
      message: "An error occurred processing your purchase. Please try again."
    });
  }
} 