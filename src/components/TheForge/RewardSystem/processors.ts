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
    
    // Add to user's artifacts
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (userProfile) {
      // Initialize artifacts array if it doesn't exist
      if (!userProfile.artifacts) {
        userProfile.artifacts = [];
      }
      
      // Add to artifacts array
      const artifactMetadata = {
        id: reward.rewardData.id,
        quantity: 1,
        name: reward.rewardData.name,
        type: 'WEB2',
        description: reward.rewardData.description || '',
        image: reward.rewardData.media?.image || '',
        acquiredAt: new Date().toISOString(),
        sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
        sourceId: reward.questId || reward.rewardData.id,
        fulfillment: rewardData.web2?.fulfillment || 'DIGITAL'
      };
      
      userProfile.artifacts.push(artifactMetadata);
      
      // Save the updated profile
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
      
      // Notify user about the new artifact
      for (const [roomId, questRoom] of questRooms.entries()) {
        try {
          const clients:Client[] = Array.from(questRoom.clients.values());
          
          for (const client of clients) {
            if (client.userData.userId === reward.userId) {
              console.log(`Notifying user ${reward.userId} about updated artifacts`);
              
              client.send("INVENTORY_UPDATE", { 
                artifacts: userProfile.artifacts 
              });
              
              notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                success: true,
                artifacts: userProfile.artifacts,
                userId: reward.userId
              });
            }
          }
        } catch (error) {
          console.error(`Error notifying clients in room ${roomId}:`, error);
        }
      }
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
    
    // Add to user's artifacts
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (userProfile) {
      // Initialize artifacts array if it doesn't exist
      if (!userProfile.artifacts) {
        userProfile.artifacts = [];
      }
      
      // Calculate quantity from amount
      const quantity = parseFloat(reward.rewardData.erc20?.amount || "1");
      
      // Add to artifacts array
      const artifactMetadata = {
        id: reward.rewardData.id,
        quantity: quantity,
        name: reward.rewardData.name,
        type: 'ERC20',
        description: reward.rewardData.description || '',
        image: reward.rewardData.media?.image || '',
        acquiredAt: new Date().toISOString(),
        sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
        sourceId: reward.questId || reward.rewardData.id,
        contractAddress: reward.rewardData.erc20?.contractAddress || '',
        network: reward.rewardData.erc20?.network || 'ethereum'
      };
      
      userProfile.artifacts.push(artifactMetadata);
      
      // Save the updated profile
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
      
      // Notify user about the new artifact
      for (const [roomId, questRoom] of questRooms.entries()) {
        try {
          const clients:Client[] = Array.from(questRoom.clients.values());
          
          for (const client of clients) {
            if (client.userData.userId === reward.userId) {
              console.log(`Notifying user ${reward.userId} about updated artifacts`);
              
              client.send("INVENTORY_UPDATE", { 
                artifacts: userProfile.artifacts 
              });
              
              notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                success: true,
                artifacts: userProfile.artifacts,
                userId: reward.userId
              });
            }
          }
        } catch (error) {
          console.error(`Error notifying clients in room ${roomId}:`, error);
        }
      }
    }
    
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
    
    // Add to user's artifacts
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (userProfile) {
      // Initialize artifacts array if it doesn't exist
      if (!userProfile.artifacts) {
        userProfile.artifacts = [];
      }
      
      // Add to artifacts array
      const artifactMetadata = {
        id: reward.rewardData.id,
        quantity: 1, // NFTs are always quantity 1
        name: reward.rewardData.name,
        type: 'ERC721',
        description: reward.rewardData.description || '',
        image: reward.rewardData.media?.image || '',
        acquiredAt: new Date().toISOString(),
        sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
        sourceId: reward.questId || reward.rewardData.id,
        contractAddress: reward.rewardData.erc721?.contractAddress || '',
        tokenId: reward.rewardData.erc721?.tokenId || '',
        network: reward.rewardData.erc721?.network || 'ethereum'
      };
      
      userProfile.artifacts.push(artifactMetadata);
      
      // Save the updated profile
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
      
      // Notify user about the new artifact
      for (const [roomId, questRoom] of questRooms.entries()) {
        try {
          const clients:Client[] = Array.from(questRoom.clients.values());
          
          for (const client of clients) {
            if (client.userData.userId === reward.userId) {
              console.log(`Notifying user ${reward.userId} about updated artifacts`);
              
              client.send("INVENTORY_UPDATE", { 
                artifacts: userProfile.artifacts 
              });
              
              notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                success: true,
                artifacts: userProfile.artifacts,
                userId: reward.userId
              });
            }
          }
        } catch (error) {
          console.error(`Error notifying clients in room ${roomId}:`, error);
        }
      }
    }
    
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
    
    // Add to user's artifacts
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (userProfile) {
      // Initialize artifacts array if it doesn't exist
      if (!userProfile.artifacts) {
        userProfile.artifacts = [];
      }
      
      // Calculate quantity from amount
      const quantity = parseFloat(reward.rewardData.erc1155?.amount || "1");
      
      // Add to artifacts array
      const artifactMetadata = {
        id: reward.rewardData.id,
        quantity: quantity,
        name: reward.rewardData.name,
        type: 'ERC1155',
        description: reward.rewardData.description || '',
        image: reward.rewardData.media?.image || '',
        acquiredAt: new Date().toISOString(),
        sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
        sourceId: reward.questId || reward.rewardData.id,
        contractAddress: reward.rewardData.erc1155?.contractAddress || '',
        tokenId: reward.rewardData.erc1155?.tokenId || '',
        network: reward.rewardData.erc1155?.network || 'ethereum'
      };
      
      userProfile.artifacts.push(artifactMetadata);
      
      // Save the updated profile
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
      
      // Notify user about the new artifact
      for (const [roomId, questRoom] of questRooms.entries()) {
        try {
          const clients:Client[] = Array.from(questRoom.clients.values());
          
          for (const client of clients) {
            if (client.userData.userId === reward.userId) {
              console.log(`Notifying user ${reward.userId} about updated artifacts`);
              
              client.send("INVENTORY_UPDATE", { 
                artifacts: userProfile.artifacts 
              });
              
              notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                success: true,
                artifacts: userProfile.artifacts,
                userId: reward.userId
              });
            }
          }
        } catch (error) {
          console.error(`Error notifying clients in room ${roomId}:`, error);
        }
      }
    }
    
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
    
    // Add to user's artifacts
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (userProfile) {
      // Initialize artifacts array if it doesn't exist
      if (!userProfile.artifacts) {
        userProfile.artifacts = [];
      }
      
      // Add to artifacts array
      const artifactMetadata = {
        id: reward.rewardData.id,
        quantity: 1,
        name: reward.rewardData.name,
        type: 'PHYSICAL',
        description: reward.rewardData.description || '',
        image: reward.rewardData.media?.image || '',
        acquiredAt: new Date().toISOString(),
        sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
        sourceId: reward.questId || reward.rewardData.id,
        fulfillmentStatus: 'pending', // Could be pending, processing, shipped, delivered
        shippingDetails: reward.rewardData.physical?.shippingDetails || null
      };
      
      userProfile.artifacts.push(artifactMetadata);
      
      // Save the updated profile
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
      
      // Notify user about the new artifact
      for (const [roomId, questRoom] of questRooms.entries()) {
        try {
          const clients:Client[] = Array.from(questRoom.clients.values());
          
          for (const client of clients) {
            if (client.userData.userId === reward.userId) {
              console.log(`Notifying user ${reward.userId} about updated artifacts`);
              
              client.send("INVENTORY_UPDATE", { 
                artifacts: userProfile.artifacts 
              });
              
              notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                success: true,
                artifacts: userProfile.artifacts,
                userId: reward.userId
              });
            }
          }
        } catch (error) {
          console.error(`Error notifying clients in room ${roomId}:`, error);
        }
      }
    }
    
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
    
    // Add to user's artifacts
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
    
    if (userProfile) {
      // Initialize artifacts array if it doesn't exist
      if (!userProfile.artifacts) {
        userProfile.artifacts = [];
      }
      
      // Add to artifacts array
      const artifactMetadata = {
        id: reward.rewardData.id,
        quantity: 1,
        name: reward.rewardData.name,
        type: 'DECENTRALAND_ITEM',
        description: reward.rewardData.description || '',
        image: reward.rewardData.media?.image || '',
        acquiredAt: new Date().toISOString(),
        sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
        sourceId: reward.questId || reward.rewardData.id,
        itemId: reward.rewardData.decentralandItem?.itemId || '',
        rarity: reward.rewardData.decentralandItem?.rarity || 'common',
        category: reward.rewardData.decentralandItem?.category || 'wearable'
      };
      
      userProfile.artifacts.push(artifactMetadata);
      
      // Save the updated profile
      updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
      console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
      
      // Notify user about the new artifact
      for (const [roomId, questRoom] of questRooms.entries()) {
        try {
          const clients:Client[] = Array.from(questRoom.clients.values());
          
          for (const client of clients) {
            if (client.userData.userId === reward.userId) {
              console.log(`Notifying user ${reward.userId} about updated artifacts`);
              
              client.send("INVENTORY_UPDATE", { 
                artifacts: userProfile.artifacts 
              });
              
              notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                success: true,
                artifacts: userProfile.artifacts,
                userId: reward.userId
              });
            }
          }
        } catch (error) {
          console.error(`Error notifying clients in room ${roomId}:`, error);
        }
      }
    }
    
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
      
      // Get the user's profile and update their artifacts
      const profiles = getCache(PROFILES_CACHE_KEY);
      const userProfile = profiles.find((profile: any) => profile.ethAddress === reward.userId);
      
      if (userProfile) {
        // Initialize artifacts array if it doesn't exist
        if (!userProfile.artifacts) {
          userProfile.artifacts = [];
        }
        
        // Add to artifacts array
        const artifactMetadata = {
          id: reward.rewardData.id,
          quantity: 1,
          name: reward.rewardData.name,
          type: 'DECENTRALAND_REWARD',
          description: reward.rewardData.description || '',
          image: reward.rewardData.media?.image || '',
          acquiredAt: new Date().toISOString(),
          sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
          sourceId: reward.questId || reward.rewardData.id,
          transactionData: response.data[0]
        };
        
        userProfile.artifacts.push(artifactMetadata);
        
        // Save the updated profile
        updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
        console.log(`[RewardSystem] Updated artifacts for user ${reward.userId}`);
        
        // Notify user about the new artifact
        for (const [roomId, questRoom] of questRooms.entries()) {
          try {
            const clients:Client[] = Array.from(questRoom.clients.values());
            
            for (const client of clients) {
              if (client.userData.userId === reward.userId) {
                console.log(`Notifying user ${reward.userId} about updated artifacts`);
                
                client.send("INVENTORY_UPDATE", { 
                  artifacts: userProfile.artifacts 
                });
                
                notifyCreatorRooms(null, "INVENTORY_UPDATE", {
                  success: true,
                  artifacts: userProfile.artifacts,
                  userId: reward.userId
                });
              }
            }
          } catch (error) {
            console.error(`Error notifying clients in room ${roomId}:`, error);
          }
        }
      }
      
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

    // Initialize artifacts array if it doesn't exist
    if (!userProfile.artifacts) {
      userProfile.artifacts = [];
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

    // Also add to artifacts array with more complete information
    const artifactMetadata = {
      id: tokenId,
      quantity: amountNumber,
      name: token.name,
      type: 'CREATOR_TOKEN',
      description: token.description,
      image: token.media?.image || '',
      acquiredAt: new Date().toISOString(),
      sourceType: reward.sourceType === 'quest' && reward.questId === 'marketplace' ? 'marketplace' : reward.sourceType,
      sourceId: reward.questId || reward.rewardData.id,
    };

    // Add to artifacts array
    userProfile.artifacts.push(artifactMetadata);
    
    // Save the updated profile
    updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
    console.log(`[RewardSystem] Updated token balance and artifacts for user ${reward.userId}: ${tokenId} = ${newBalance}`);
    
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
              inventory: enrichedTokens,
              artifacts: userProfile.artifacts
            });

              // Check for webapp room and notify
            notifyCreatorRooms(null, "INVENTORY_UPDATE", {
              success: true, 
              tokens: enrichedTokens,
              artifacts: userProfile.artifacts,
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

/**
 * Process a marketplace purchase by calling the appropriate reward distribution function
 */
export async function processMarketplacePurchase(
  userId: string, 
  rewardData: any, 
  quantity: number = 1
): Promise<boolean> {
  try {
    if (!userId || !rewardData || !rewardData.id) {
      console.error(`[MarketplaceSystem] Invalid purchase data`);
      return false;
    }

    console.log(`[MarketplaceSystem] Processing purchase for user ${userId}: ${rewardData.name} (x${quantity})`);
    
    // Create a reward entry from the purchase data
    const rewardEntry: RewardEntry = {
      id: `purchase_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      questId: 'marketplace',
      stepId: 'purchase',
      taskId: 'purchase',
      userId: userId,
      rewardData: {
        ...rewardData,
        quantity: quantity.toString()
      },
      sourceType: 'quest',
      status: 'pending',
      attempts: 0,
      error: null
    };

    // Distribute the reward based on its kind
    let success = false;
    switch (rewardData.kind) {
      case 'CREATOR_TOKEN':
        // Set token ID if not already set
        if (!rewardEntry.rewardData.creatorToken) {
          rewardEntry.rewardData.creatorToken = { tokenId: rewardData.id };
        }
        success = distributeCreatorToken(rewardEntry);
        break;

      case 'WEB2':
        success = await distributeWeb2Reward(rewardEntry);
        break;

      case 'ERC20':
        success = await distributeERC20Reward(rewardEntry);
        break;

      case 'ERC721':
        success = await distributeERC721Reward(rewardEntry);
        break;
        
      case 'ERC1155':
        success = await distributeERC1155Reward(rewardEntry);
        break;
        
      case 'PHYSICAL':
        success = await distributePhysicalReward(rewardEntry);
        break;
        
      case 'DECENTRALAND_ITEM':
        success = await distributeDecentralandItemReward(rewardEntry);
        break;
        
      case 'DECENTRALAND_REWARD':
        success = await distributeDecentralandReward(rewardEntry);
        break;
        
      default:
        console.error(`[MarketplaceSystem] Unsupported reward kind: ${rewardData.kind}`);
        return false;
    }

    if (success) {
      console.log(`[MarketplaceSystem] Successfully processed purchase for user ${userId}: ${rewardData.name}`);
    } else {
      console.error(`[MarketplaceSystem] Failed to process purchase for user ${userId}: ${rewardData.name}`);
    }

    return success;
  } catch (error) {
    console.error(`[MarketplaceSystem] Error processing purchase:`, error);
    return false;
  }
}
