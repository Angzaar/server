import { Client } from "colyseus";
import { getCache, updateCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, PROFILES_FILE, REWARDS_CACHE_KEY, REWARDS_FILE } from "../../utils/initializer";
import { TokenManager } from "../TokenManager";
import { generateId } from "colyseus";
import { processMarketplacePurchase } from "./RewardSystem/processors";

const tokenManager = new TokenManager();

/**
 * Handle marketplace purchase requests
 * This function processes token payments for marketplace items
 * @param client The client making the purchase
 * @param message The purchase message data
 * @param broadcastRoom Optional room to broadcast inventory changes to
 */
export async function handleMarketplacePurchase(client: Client, message: any, broadcastRoom?: any) {
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
      // Get the balance correctly regardless of token structure
      const userBalance = typeof userToken.balance === 'number'
        ? userToken.balance
        : (userToken.balance 
          ? Number(userToken.balance) 
          : (userToken.token && userToken.token.balance 
            ? Number(userToken.token.balance) 
            : 0));
      
      const paymentAmount = Number(amount);
      
      if (userBalance < paymentAmount) {
        console.error("Insufficient token balance", message);
        client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
          success: false, 
          message: "Insufficient token balance" 
        });
        return;
      }
      
      // Deduct tokens from user balance - handle both token formats
      console.log("Before token deduction:", {
        tokenId,
        userTokenIndex,
        userToken,
        userBalance,
        amount: paymentAmount,
        hasDirectBalance: userToken.balance !== undefined,
        hasNestedBalance: userToken.token && userToken.token.balance !== undefined
      });
      
      if (userToken.balance !== undefined) {
        userProfile.tokens[userTokenIndex].balance = userBalance - paymentAmount; // Store as number
        console.log("Updated direct balance:", userProfile.tokens[userTokenIndex].balance);
      } else if (userToken.token && userToken.token.balance !== undefined) {
        userProfile.tokens[userTokenIndex].token.balance = userBalance - paymentAmount; // Store as number
        console.log("Updated nested balance:", userProfile.tokens[userTokenIndex].token.balance);
      }
      userProfile.tokens[userTokenIndex].lastUpdate = new Date().toISOString();
      
      // Save the profile changes for token payments - Moved earlier to ensure it happens
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log("After token deduction, updated profile in cache");
      
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
          const creatorToken = creatorProfile.tokens[creatorTokenIndex];
          // Get the balance correctly regardless of token structure
          const currentBalance = typeof creatorToken.balance === 'number'
            ? creatorToken.balance
            : (creatorToken.balance !== undefined
              ? Number(creatorToken.balance)
              : (creatorToken.token && creatorToken.token.balance !== undefined
                ? Number(creatorToken.token.balance)
                : 0));
              
          // Update balance based on token structure
          if (creatorToken.balance !== undefined) {
            creatorProfile.tokens[creatorTokenIndex].balance = currentBalance + paymentAmount; // Store as number
          } else if (creatorToken.token && creatorToken.token.balance !== undefined) {
            creatorProfile.tokens[creatorTokenIndex].token.balance = currentBalance + paymentAmount; // Store as number
          }
          creatorProfile.tokens[creatorTokenIndex].lastUpdate = new Date().toISOString();
        } else if (token) {
          // Add token to creator's inventory
          creatorProfile.tokens.push({
            id: tokenId,
            balance: paymentAmount, // Store as number
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
    
    // Use the reward system to handle the distribution
    // This will add to artifacts array and maintain consistency
    const rewardData = {
      id: reward.id,
      name: reward.name,
      kind: reward.kind || 'WEB2',
      description: reward.description,
      media: reward.media,
      creatorToken: reward.kind === 'CREATOR_TOKEN' ? { tokenId: reward.id } : undefined
    };
    
    // Process the purchase through our unified reward system
    const quantity = 1; // Default to 1 for most items
    const success = await processMarketplacePurchase(message.userId, rewardData, quantity);
    
    if (!success) {
      console.error("Failed to process reward distribution", message);
      client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
        success: false, 
        message: "Failed to add item to your inventory" 
      });
      return;
    }
    
    // Update the reward's available quantity
    if (reward.listing.quantity !== undefined) {
      reward.listing.quantity = Math.max(0, reward.listing.quantity - 1);
      
      // If quantity reaches 0, mark as not listed
      if (reward.listing.quantity === 0) {
        reward.listing.listed = false;
      }
      
      // Make sure we update the rewards cache with the updated quantity
      const rewards = getCache(REWARDS_CACHE_KEY);
      const rewardIndex = rewards.findIndex((r: any) => r.id === reward.id);
      if (rewardIndex !== -1) {
        rewards[rewardIndex] = reward;
        // Update the rewards in cache
        updateCache(REWARDS_FILE, REWARDS_CACHE_KEY, rewards);
        console.log(`Updated reward in cache: ${reward.id}, new quantity: ${reward.listing.quantity}`);
      }
      
      // Broadcast inventory change if broadcast room is provided
      if (broadcastRoom && typeof broadcastRoom.broadcastInventoryChange === 'function') {
        broadcastRoom.broadcastInventoryChange(reward.id, reward.listing.quantity);
      }
    }
    
    // Send success response to client
    client.send("MARKETPLACE_PURCHASE_RESPONSE", { 
      success: true, 
      message: "Purchase successful",
      reward: rewardData
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