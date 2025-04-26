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
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Missing required fields for purchase" 
      });
      return;
    }
    
    // Validate payment fields
    const { amount, currency } = message.payment;
    if (!amount || !currency) {
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
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Reward not found" 
      });
      return;
    }
    
    // Validate that the reward is listed for sale
    if (!reward.listing || !reward.listing.listed) {
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
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Invalid payment currency" 
      });
      return;
    }
    
    // Handle token payment for creator tokens
    if (rewardCurrency.tokenId) {
      // Check if user has enough token balance
      if (!userProfile.tokenBalances) {
        userProfile.tokenBalances = {};
      }
      
      const tokenId = rewardCurrency.tokenId;
      const userBalance = userProfile.tokenBalances[tokenId] || "0";
      
      if (Number(userBalance) < Number(amount)) {
        client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
          success: false, 
          message: "Insufficient token balance" 
        });
        return;
      }
      
      // Deduct tokens from user balance
      userProfile.tokenBalances[tokenId] = String(Number(userBalance) - Number(amount));
      
      // Get token details for notification
      const token = tokenManager.getTokenById(tokenId);
      
      // Add tokens to creator balance
      const creatorProfile = profiles.find((p: any) => p.ethAddress === reward.creator);
      if (creatorProfile) {
        if (!creatorProfile.tokenBalances) {
          creatorProfile.tokenBalances = {};
        }
        
        // Add payment to creator's balance
        const creatorBalance = creatorProfile.tokenBalances[tokenId] || "0";
        creatorProfile.tokenBalances[tokenId] = String(Number(creatorBalance) + Number(amount));
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