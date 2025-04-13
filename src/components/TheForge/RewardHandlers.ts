import { Client } from "colyseus";
import { getCache, updateCache } from "../../utils/cache"
import { REWARDS_CACHE_KEY } from "../../utils/initializer";
import { v4 } from 'uuid';
import { Reward } from "./utils/types";

export function getCreatorRewards(creatorId:string){
    let rewards = getCache(REWARDS_CACHE_KEY)
    return rewards.filter((reward:Reward)=>reward.creator === creatorId)
  }
  
export async function handleCreateReward(client: Client, message: any) {
  try {
    console.log('handleCreateReward', message)
    
    const reward: Reward = {
      ...message,
      id: v4(),
      // Ensure creator is set - use client.userData.userAddress if not provided
      creator: message.creator || message.creatorId || client.userData.userAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('Saving reward with creator:', reward.creator)
    
    // Get existing rewards
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    
    // Add new reward
    rewards.push(reward);
    
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
    
    // Find the reward to delete
    const rewardIndex = rewards.findIndex((r: Reward) => r.id === message.id);
    
    if (rewardIndex === -1) {
      throw new Error('Reward not found');
    }
    
    // Security check: only creator or admin can delete
    if (rewards[rewardIndex].creator !== client.userData.userAddress) {
      throw new Error('Unauthorized: only the creator can delete this reward');
    }
    
    // Remove the reward
    const deletedReward = rewards.splice(rewardIndex, 1)[0];
    
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