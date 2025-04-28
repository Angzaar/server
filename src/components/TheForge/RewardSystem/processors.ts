import { RewardEntry } from "./types";
import { checkDecentralandWeb3Wallet } from "./index";
import { TokenManager } from "../../TokenManager";
import { getCache, updateCache } from "../../../utils/cache";
import { PROFILES_CACHE_KEY, PROFILES_FILE } from "../../../utils/initializer";
import { Client } from "colyseus";
import { notifyCreatorRooms } from "../Handlers";
import { questRooms } from "..";

// Get or initialize the TokenManager instance
const tokenManager = new TokenManager();

/**
 * Distribute a web2 item (digital code, file download, etc.)
 */
export async function distributeWeb2Reward(reward: RewardEntry): Promise<boolean> {
  const { rewardData } = reward;
  
  try {
    console.log(`[RewardSystem] Distributing Web2 reward: ${rewardData.name} to user ${reward.userId}`);
    
    // Implement based on the fulfillment type
    switch (rewardData.web2?.fulfillment) {
      case 'DIGITAL_CODE':
        // Generate or retrieve a digital code
        // Store in user's profile or send via notification
        break;
        
      case 'FILE_DOWNLOAD':
        // Generate a download link
        // Store in user's profile or send via notification
        break;
        
      case 'SHIP_PHYSICAL':
        // Create shipping request
        // This would normally create a record in a shipping system
        break;
        
      default:
        console.log(`[RewardSystem] Unknown Web2 fulfillment type: ${rewardData.web2?.fulfillment}`);
        return false;
    }
    
    // In this example implementation, we'll just log and simulate success
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing Web2 reward: ${error}`);
    return false;
  }
}

/**
 * Distribute an ERC20 token reward
 */
export async function distributeERC20Reward(reward: RewardEntry): Promise<boolean> {
  if (!reward.userId) {
    console.error(`[RewardSystem] Missing user ETH address for ERC20 reward`);
    return false;
  }
  
  try {
    console.log(`[RewardSystem] Distributing ERC20 reward: ${reward.rewardData.name} (${reward.rewardData.erc20?.amount} tokens) to ${reward.userId}`);
    
    // In a real implementation, you would:
    // 1. Connect to the blockchain network (using ethers.js or similar)
    // 2. Call the token contract's transfer or mint function
    // 3. Wait for transaction confirmation
    // 4. Record the transaction hash
    
    // For this example, we'll just simulate success
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing ERC20 reward: ${error}`);
    return false;
  }
}

/**
 * Distribute an ERC721 NFT reward
 */
export async function distributeERC721Reward(reward: RewardEntry): Promise<boolean> {
  if (!reward.userId) {
    console.error(`[RewardSystem] Missing user ETH address for ERC721 reward`);
    return false;
  }
  
  // Check if the user has a connected Web3 wallet
  const hasWeb3Wallet = await checkDecentralandWeb3Wallet(reward.userId);
  if (!hasWeb3Wallet) {
    return false;
  }
  
  try {
    console.log(`[RewardSystem] Distributing ERC721 NFT: ${reward.rewardData.name} (token ID: ${reward.rewardData.erc721?.tokenId}) to ${reward.userId}`);
    
    // In a real implementation, you would:
    // 1. Connect to the blockchain network
    // 2. Call the NFT contract's transferFrom or mint function
    // 3. Wait for transaction confirmation
    // 4. Record the transaction hash
    
    // For this example, we'll just simulate success
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing ERC721 reward: ${error}`);
    return false;
  }
}

/**
 * Distribute an ERC1155 multi-token reward
 */
export async function distributeERC1155Reward(reward: RewardEntry): Promise<boolean> {
  if (!reward.userId) {
    console.error(`[RewardSystem] Missing user ETH address for ERC1155 reward`);
    return false;
  }
  
  try {
    console.log(`[RewardSystem] Distributing ERC1155 token: ${reward.rewardData.name} (token ID: ${reward.rewardData.erc1155?.tokenId}, amount: ${reward.rewardData.erc1155?.amount}) to ${reward.userId}`);
    
    // In a real implementation, you would:
    // 1. Connect to the blockchain network
    // 2. Call the ERC1155 contract's safeTransferFrom or mint function
    // 3. Wait for transaction confirmation
    // 4. Record the transaction hash
    
    // For this example, we'll just simulate success
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing ERC1155 reward: ${error}`);
    return false;
  }
}

/**
 * Distribute a physical reward (requires shipping)
 */
export async function distributePhysicalReward(reward: RewardEntry): Promise<boolean> {
  const { rewardData } = reward;
  
  try {
    console.log(`[RewardSystem] Processing physical reward: ${rewardData.name} for user ${reward.userId}`);
    
    // In a real implementation, you would:
    // 1. Create a shipping order in your fulfillment system
    // 2. Record the shipping details
    // 3. Notify the user about shipping status
    
    // Physical rewards often require address information
    // This would normally check if we have shipping details
    
    // For this example, we'll just simulate success
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error processing physical reward: ${error}`);
    return false;
  }
}

/**
 * Distribute a Decentraland item reward
 */
export async function distributeDecentralandItemReward(reward: RewardEntry): Promise<boolean> {
  if (!reward.userId) {
    console.error(`[RewardSystem] Missing user ETH address for DECENTRALAND_ITEM reward`);
    return false;
  }

   // Check if the user has a connected Web3 wallet
  const hasWeb3Wallet = await checkDecentralandWeb3Wallet(reward.userId);
  if (!hasWeb3Wallet) {
    return false;
  }
  
  try {
    console.log(`[RewardSystem] Distributing Decentraland item: ${reward.rewardData.name} to ${reward.userId}`);
    
    // In a real implementation, you would:
    // 1. Connect to the Decentraland marketplace or item distribution API
    // 2. Grant the item to the user's account
    // 3. Verify the item was successfully added to the user's inventory
    // 4. Record the transaction details
    
    // For this example, we'll just simulate success
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing Decentraland item reward: ${error}`);
    return false;
  }
}

/**
 * Distribute a Decentraland reward
 */
export async function distributeDecentralandReward(reward: RewardEntry): Promise<boolean> {
  if (!reward.userId || !reward.rewardData.decentralandReward?.campaignKey) {
    console.error(`[RewardSystem] Missing user ETH address or campaign key for DECENTRALAND_REWARD`);
    reward.status = 'failed';
    reward.error = `Missing user ETH address or campaign key for DECENTRALAND_REWARD`;
    return false;
  }

  // Check if the user has a connected Web3 wallet
  const hasWeb3Wallet = await checkDecentralandWeb3Wallet(reward.userId);
  if (!hasWeb3Wallet) {
    reward.status = 'failed';
    reward.error = `User does not have a connected Web3 wallet`;
    return false;
  }

  //todo: check if user has already claimed the reward
  //todo: if yes, return false
  //todo: if no, continue
  
  try {
    console.log(`[RewardSystem] Distributing Decentraland reward: ${reward.rewardData.name} (type: ${reward.rewardData.kind}) to ${reward.userId}`);

    const request = await fetch('https://rewards.decentraland.org/api/rewards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        campaign_key: reward.rewardData.decentralandReward?.campaignKey,
        beneficiary: reward.userId,
      }),
    })
    
    const response = await request.json()
    console.log('distributeDecentralandReward', response)
    if(response.ok){
      console.log(`[RewardSystem] Decentraland reward distributed successfully: ${response.data[0].status}`);
      // reward.transactionData = response.data[0]
      return true;
    }else{
      console.error(`[RewardSystem] Error distributing Decentraland reward: ${response.error}`);
      reward.error = `${response.error}`;
      return false;
    }
  } catch (error) { 
    console.error(`[RewardSystem] Error distributing Decentraland reward: ${error}`);
    reward.error = `${error}`;
    reward.status = 'failed';
    return false;
  }
}

/**
 * Distribute a creator token reward
 */
export const distributeCreatorToken = (
  reward: RewardEntry
): boolean => {
  console.log('distributeCreatorToken', reward)
  if (!reward.userId || !reward.rewardData.id) {
    console.error(`[RewardSystem] Missing required data for CREATOR_TOKEN reward`);
    return false;
  }
  
  try {
    // First, we need to find the creator token ID and amount from the reward data
    const tokenId = reward.rewardData.creatorToken?.tokenId; // Using the reward ID as token ID
    
    // Try to find amount in different possible locations, default to 10 if not found
    let amount = "10"; // Default amount
    
    // Use type assertion to access potential fields
    const rewardDataAny = reward.rewardData as any;
    if (rewardDataAny.quantity) {
      amount = rewardDataAny.quantity.toString();
    } else if (reward.rewardData.erc20?.amount) {
      amount = reward.rewardData.erc20.amount;
    } else if (reward.rewardData.erc1155?.amount) {
      amount = reward.rewardData.erc1155.amount;
    }
    
    console.log(`[RewardSystem] Distributing creator token: ${reward.rewardData.name} (tokenId: ${tokenId}, amount: ${amount}) to ${reward.userId}`);
    
    // Get the token
    const token = tokenManager.getTokenById(tokenId);
    if (!token) {
      console.error(`[RewardSystem] Creator token with ID ${tokenId} not found`);
      return false;
    }
    
    // Get the user's profile and update their token balance
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (!userProfile) {
      console.error(`[RewardSystem] User profile for ${reward.userId} not found`);
      return false;
    }
    
    // Update the token balance
    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber)) {
      console.error(`[RewardSystem] Invalid amount: ${amount}`);
      return false;
    }
    
    // Initialize tokens array if it doesn't exist
    if (!userProfile.tokens) {
      userProfile.tokens = [];
    }
    
    // Check if token metadata already exists
    const existingTokenIndex = userProfile.tokens.findIndex((t: any) => t.id === tokenId);
    
    // Calculate the new balance
    let newBalance: string;
    if (existingTokenIndex >= 0) {
      // Get existing balance from tokens array
      const existingBalance = parseFloat(userProfile.tokens[existingTokenIndex].balance) || 0;
      newBalance = (existingBalance + amountNumber).toString();
    } else {
      newBalance = amount;
    }
    
    const tokenMetadata = {
      id: tokenId,
      balance: newBalance,
      name: token.name,
      symbol: token.symbol,
    };
    
    if (existingTokenIndex >= 0) {
      // Update existing token metadata
      userProfile.tokens[existingTokenIndex] = tokenMetadata;
    } else {
      // Add new token metadata
      userProfile.tokens.push(tokenMetadata);
    }
    
    // Save the updated profile
    updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
    console.log(`[RewardSystem] Updated token balance for user ${reward.userId}: ${tokenId} = ${newBalance}`);
    
    // Calculate new circulating supply
    const currentSupply = parseFloat(token.circulatingSupply) || 0;
    const amountToAdd = amountNumber;
    const newSupply = (currentSupply + amountToAdd).toString();
    
    // Update the token's circulating supply
    const updated = tokenManager.updateTokenSupply(tokenId, newSupply);
    if (!updated) {
      console.error(`[RewardSystem] Failed to update circulating supply for token ${tokenId}`);
      return false;
    }
    
    // Get the updated token after the circulating supply change
    const updatedToken = tokenManager.getTokenById(tokenId);
    if (!updatedToken) {
      console.error(`[RewardSystem] Failed to get updated token information`);
      return false;
    }
    
    // Notify all quest rooms about the token distribution
    // Find all creator rooms and notify the token creator
    for (const [roomId, questRoom] of questRooms.entries()) {
      try {
        // Find all clients that should be notified
        const clients:Client[] = Array.from(questRoom.clients.values());
        
        // For each client in any room
        for (const client of clients) {
          
          // Notify the user who received the token with an inventory update
          if (client.userData.userId === reward.userId) {
            console.log(`Notifying user ${reward.userId} about updated inventory`);
            
            // Send the enriched token data
            const enrichedTokens = userProfile.tokens.map((token: any) => {
              if (token.id === tokenId) {
                const fullTokenData = tokenManager.getTokenById(token.id);
                if (fullTokenData) {
                  return {
                    ...token,
                    token: {
                      ...fullTokenData,
                      kind: 'CREATOR_TOKEN'
                    }
                  };
                }
              }
              return token;
            });
            
            // Send inventory update to the user
            client.send("INVENTORY_UPDATE", { 
              inventory: enrichedTokens 
            });

              // Check for webapp room and notify
            notifyCreatorRooms(null, "INVENTORY_UPDATE", {
              success: true, 
              tokens: enrichedTokens,
              userId: reward.userId
            });
          }
        }
      } catch (error) {
        console.error(`Error notifying clients in room ${roomId}:`, error);
      }
    }

    
    console.log(`[RewardSystem] Successfully distributed ${amount} creator tokens (${tokenId}) to ${reward.userId}`);
    return true;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing creator token reward:`, error);
    return false;
  }
}
