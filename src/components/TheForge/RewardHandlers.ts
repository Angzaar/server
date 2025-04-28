import { Client } from "colyseus";
import { getCache, updateCache } from "../../utils/cache"
import { REWARDS_CACHE_KEY } from "../../utils/initializer";
import { v4 } from 'uuid';
import { Reward } from "./utils/types";
import { validateMarketplaceData, ensureMarketplaceFields } from "../../utils/marketplaceUtils";

export function getCreatorRewards(creatorId:string){
    let rewards = getCache(REWARDS_CACHE_KEY)
    return rewards.filter((reward:Reward)=>reward.creator === creatorId)
  }
  
export async function handleCreateReward(client: Client, message: any) {
  try {
    console.log('handleCreateReward', message)
    
    // Basic validation
    if (!message.name) {
      throw new Error('Reward name is required');
    }
    
    if (!message.kind) {
      throw new Error('Reward kind is required');
    }
    
    let reward: Reward = {
      ...message,
      id: message.id || v4(),
      // Ensure creator is set - use client.userData.userId if not provided
      creator: message.creator || message.creatorId || client.userData.userId,
      createdAt: message.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Apply marketplace defaults and validation
    reward = ensureMarketplaceFields(reward);
    
    // Validate marketplace data if present
    const validationResult = validateMarketplaceData(reward);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    console.log('Saving reward with creator:', reward.creator)
    
    // Get existing rewards
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    
    // Check if this is an update to an existing reward
    const existingIndex = rewards.findIndex((r: Reward) => r.id === reward.id);
    
    if (existingIndex >= 0) {
      // Update existing reward
      const existing = rewards[existingIndex];
      
      // Security check: only creator can update
      if (existing.creator !== client.userData.userId) {
        throw new Error('Unauthorized: only the creator can update this reward');
      }
      
      // Preserve creation timestamp
      reward.createdAt = existing.createdAt;
      
      // Replace existing with updated
      rewards[existingIndex] = reward;
      console.log(`Updated existing reward: ${reward.id}`);
    } else {
      // Add new reward
      rewards.push(reward);
      console.log(`Created new reward: ${reward.id}`);
    }
    
    // Update cache
    updateCache(REWARDS_CACHE_KEY, REWARDS_CACHE_KEY, rewards);

    // Notify client of success
    client.send("REWARD_CREATED", { success: true, reward });

  } catch (error) {
    console.error("Error creating reward:", error);
    client.send("REWARD_CREATED", { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}

export async function handleDeleteReward(client: Client, message: any) {
  try {
    console.log('handleDeleteReward', message);
    
    // Validate the request
    if (!message.id) {
      throw new Error('Reward ID is required');
    }
    
    // Get existing rewards
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    const reward = rewards.find((r: Reward) => r.id === message.id);
    
    if (!reward) {
      throw new Error('Reward not found');
    }
    
    // Security check: only creator or admin can delete
    if (reward.creator !== client.userData.userId) {
      throw new Error('Unauthorized: only the creator can delete this reward');
    }
    
    // Remove the reward
    const deletedReward = rewards.splice(rewards.indexOf(reward), 1)[0];
    
    // Update cache
    updateCache(REWARDS_CACHE_KEY, REWARDS_CACHE_KEY, rewards);
    
    console.log('Deleted reward:', deletedReward.id);

    // Notify client of success
    client.send("REWARD_DELETED", { 
      success: true, 
      id: deletedReward.id,
      message: `Reward "${deletedReward.name}" has been deleted.`
    });

  } catch (error) {
    console.error("Error deleting reward:", error);
    client.send("REWARD_DELETED", { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}

export async function handleEditReward(client: Client, message: any) {
  try {
    console.log('handleEditReward', message);
    
    // Basic validation
    if (!message.id) {
      throw new Error('Reward ID is required');
    }
    
    if (!message.name) {
      throw new Error('Reward name is required');
    }
    
    if (!message.kind) {
      throw new Error('Reward kind is required');
    }
    
    // Get existing rewards
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    const existingIndex = rewards.findIndex((r: Reward) => r.id === message.id);
    
    if (existingIndex === -1) {
      throw new Error('Reward not found');
    }
    
    const existingReward = rewards[existingIndex];
    
    // Security check: only creator can edit
    if (existingReward.creator !== client.userData.userId) {
      throw new Error('Unauthorized: only the creator can edit this reward');
    }
    
    // Create updated reward object, preserving creator and creation date
    const updatedReward: Reward = {
      ...message,
      creator: existingReward.creator,
      createdAt: existingReward.createdAt,
      updatedAt: new Date().toISOString()
    };
    
    // Apply marketplace defaults and validation
    const reward = ensureMarketplaceFields(updatedReward);
    
    // Validate marketplace data if present
    const validationResult = validateMarketplaceData(reward);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }
    
    // Update the reward
    rewards[existingIndex] = reward;
    
    // Update cache
    updateCache(REWARDS_CACHE_KEY, REWARDS_CACHE_KEY, rewards);
    
    console.log(`Edited reward: ${reward.id}`);

    // Notify client of success
    client.send("REWARD_EDITED", { 
      success: true, 
      reward,
      message: `Reward "${reward.name}" has been updated.`
    });

  } catch (error) {
    console.error("Error editing reward:", error);
    client.send("REWARD_EDITED", { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}