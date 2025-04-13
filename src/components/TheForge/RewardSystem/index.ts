import { QuestRoom } from "../QuestRoom";
import { getCache } from "../../../utils/cache";
import { REWARDS_CACHE_KEY } from "../../../utils/initializer";
import { RewardEntry } from "./types";
import {
  distributeWeb2Reward,
  distributeERC20Reward,
  distributeERC721Reward,
  distributeERC1155Reward,
  distributePhysicalReward,
  distributeDecentralandItemReward,
  distributeDecentralandReward
} from "./processors";

// In-memory queue for rewards (in production, consider using Redis or similar)
let rewardQueue: RewardEntry[] = [];
let isProcessing = false;
const MAX_RETRY_ATTEMPTS = 3;

// Optional: store failed rewards for analysis
let failedRewards: RewardEntry[] = [];

/**
 * Create a reward data object from a reward ID
 * 
 * @param rewardId The ID of the reward to look up
 * @returns The reward data object or null if not found
 */
export function createRewardData(rewardId: string) {
  if (!rewardId) return null;
  
  const rewards = getCache(REWARDS_CACHE_KEY);
  const reward = rewards.find((r: any) => r.id === rewardId);
  
  if (!reward) return null;
  
  return {
    id: reward.id,
    name: reward.name,
    kind: reward.kind,
    description: reward.description,
    media: reward.media,
    web2: reward.web2,
    erc20: reward.erc20,
    erc721: reward.erc721,
    erc1155: reward.erc1155,
    physical: reward.physical,
    decentralandItem: reward.decentralandItem,
    decentralandReward: reward.decentralandReward
  };
}

/**
 * Process a reward and add it to the queue
 * 
 * @param room The QuestRoom instance
 * @param questId Quest ID
 * @param stepId Step ID (empty string if not a step reward)
 * @param taskId Task ID (empty string if not a task reward)
 * @param userQuestInfo User quest progress information
 * @param rewardData Reward data to process
 * @returns ID of the queued reward (for tracking)
 */
export function processReward(room: QuestRoom, questId: string, stepId: string, taskId: string, userQuestInfo: any, rewardData: any) {
  console.log(`[QuestRoom] Processing reward for task="${taskId}" in step="${stepId}", quest="${questId}"`);
  
  if (!rewardData) return null;
  
  // Create a reward entry for the queue
  const rewardEntry: RewardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Unique ID for tracking
    timestamp: Date.now(),
    questId,
    stepId,
    taskId,
    userId: userQuestInfo.userId || userQuestInfo.ethAddress || '',
    userEthAddress: userQuestInfo.userEthAddress || userQuestInfo.ethAddress,
    rewardData,
    sourceType: taskId ? 'task' : (stepId ? 'step' : 'quest'),
    status: 'pending',
    attempts: 0,
    error: null
  };
  
  // Add to the reward queue
  addToRewardQueue(rewardEntry);
  
  return rewardEntry.id; // Return ID for tracking
}

/**
 * Process a reward by ID and add it to the queue
 * 
 * @param room The QuestRoom instance
 * @param questId Quest ID
 * @param stepId Step ID (empty string if not a step reward)
 * @param taskId Task ID (empty string if not a task reward)
 * @param userQuestInfo User quest progress information
 * @param rewardId The ID of the reward to process
 * @returns ID of the queued reward (for tracking) or null if reward not found
 */
export function processRewardById(room: QuestRoom, questId: string, stepId: string, taskId: string, userQuestInfo: any, rewardId: string) {
  if (!rewardId) return null;
  
  const rewardData = createRewardData(rewardId);
  if (!rewardData) {
    console.warn(`[RewardSystem] Could not find reward with ID ${rewardId}`);
    return null;
  }
  
  return processReward(room, questId, stepId, taskId, userQuestInfo, rewardData);
}

/**
 * Add a reward to the processing queue
 * 
 * @param rewardEntry Reward entry to add to the queue
 */
export function addToRewardQueue(rewardEntry: RewardEntry) {
  // Add to queue
  rewardQueue.push(rewardEntry);
  console.log(`[RewardSystem] Added reward to queue: ${rewardEntry.id}, type: ${rewardEntry.rewardData?.kind}, queue size: ${rewardQueue.length}`);
  
  // Start processing if not already running
  if (!isProcessing) {
    processRewardQueue();
  }
}

/**
 * Process the rewards queue one item at a time
 */
export async function processRewardQueue() {
  if (isProcessing || rewardQueue.length === 0) return;
  
  isProcessing = true;
  console.log(`[RewardSystem] Starting to process reward queue, ${rewardQueue.length} items pending`);
  
  try {
    // Get the next reward to process
    const reward = rewardQueue[0];
    
    // Attempt to distribute the reward
    const success = await distributeReward(reward);
    
    if (success) {
      // Remove from queue if successful
      rewardQueue.shift();
      console.log(`[RewardSystem] Successfully processed reward ${reward.id}, ${rewardQueue.length} items remaining`);
    } else {
      // Increment attempts and move to back of queue if under max retries
      reward.attempts++;
      
      if (reward.attempts < MAX_RETRY_ATTEMPTS) {
        // Move to the end of the queue for retry
        rewardQueue.shift();
        rewardQueue.push(reward);
        console.log(`[RewardSystem] Failed to process reward ${reward.id}, retry ${reward.attempts}/${MAX_RETRY_ATTEMPTS}`);
      } else {
        // Max retries reached, mark as failed and remove
        reward.status = 'failed';
        rewardQueue.shift();
        console.log(`[RewardSystem] Failed to process reward ${reward.id} after ${MAX_RETRY_ATTEMPTS} attempts, removing from queue`);
        
        // Save failed rewards for later analysis or manual processing
        saveFailedReward(reward);
      }
    }
  } catch (error) {
    console.error('[RewardSystem] Error processing reward queue:', error);
  } finally {
    isProcessing = false;
    
    // If more items in queue, continue processing
    if (rewardQueue.length > 0) {
      // Small delay to prevent tight loops
      setTimeout(processRewardQueue, 100);
    } else {
      console.log('[RewardSystem] Reward queue processing complete');
    }
  }
}

/**
 * Save failed rewards for later analysis
 * 
 * @param reward Failed reward entry
 */
function saveFailedReward(reward: RewardEntry) {
  // In a real system, persist this to a database
  console.log(`[RewardSystem] Saving failed reward for later analysis: ${reward.id}`);
  failedRewards.push(reward);
  // Example implementation: updateCache('FAILED_REWARDS_CACHE_KEY', 'failed_rewards.json', failedRewards);
}

/**
 * Distribute a reward based on its type
 * 
 * @param reward Reward entry to distribute
 * @returns Whether distribution was successful
 */
async function distributeReward(reward: RewardEntry): Promise<boolean> {
  try {
    if (!reward || !reward.rewardData) {
      console.error(`[RewardSystem] Invalid reward data for ${reward?.id}`);
      return false;
    }
    
    const { kind } = reward.rewardData;
    console.log(`[RewardSystem] Distributing ${kind} reward to user ${reward.userId}`);
    
    switch (kind) {
      case 'WEB2_ITEM':
        return await distributeWeb2Reward(reward);
        
      case 'ERC20':
        return await distributeERC20Reward(reward);
        
      case 'ERC721':
        return await distributeERC721Reward(reward);
        
      case 'ERC1155':
        return await distributeERC1155Reward(reward);
        
      case 'PHYSICAL':
        return await distributePhysicalReward(reward);
        
      case 'DECENTRALAND_ITEM':
        return await distributeDecentralandItemReward(reward);
        
      case 'DECENTRALAND_REWARD':
        return await distributeDecentralandReward(reward);
        
      default:
        console.error(`[RewardSystem] Unknown reward kind: ${kind}`);
        reward.error = `Unknown reward kind: ${kind}`;
        return false;
    }
  } catch (error) {
    console.error(`[RewardSystem] Error distributing reward: ${error}`);
    reward.error = `Distribution error: ${error}`;
    return false;
  }
}

/**
 * Get the current reward queue (for admin purposes)
 * 
 * @returns The current reward queue
 */
export function getRewardQueue() {
  return [...rewardQueue];
}

/**
 * Get the failed rewards (for admin purposes)
 * 
 * @returns The failed rewards
 */
export function getFailedRewards() {
  return [...failedRewards];
}

/**
 * Manually retry a failed reward (for admin purposes)
 * 
 * @param rewardId ID of the failed reward to retry
 * @returns Whether the reward was found and requeued
 */
export function retryFailedReward(rewardId: string): boolean {
  const index = failedRewards.findIndex(r => r.id === rewardId);
  if (index >= 0) {
    const reward = failedRewards[index];
    reward.attempts = 0;
    reward.status = 'pending';
    reward.error = null;
    
    // Remove from failed rewards
    failedRewards.splice(index, 1);
    
    // Add to queue
    addToRewardQueue(reward);
    
    return true;
  }
  return false;
}

/**
 * Process multiple rewards by ID and add them to the queue
 * 
 * @param room The QuestRoom instance
 * @param questId Quest ID
 * @param stepId Step ID (empty string if not a step reward)
 * @param taskId Task ID (empty string if not a task reward)
 * @param userQuestInfo User quest progress information
 * @param rewardIds Array of reward IDs to process
 * @returns Array of queued reward IDs (for tracking)
 */
export function processMultipleRewardsByIds(room: QuestRoom, questId: string, stepId: string, taskId: string, userQuestInfo: any, rewardIds: string[]): string[] {
  if (!rewardIds || !Array.isArray(rewardIds) || rewardIds.length === 0) {
    // Handle legacy single rewardId
    if (typeof rewardIds === 'string') {
      const result = processRewardById(room, questId, stepId, taskId, userQuestInfo, rewardIds);
      return result ? [result] : [];
    }
    return [];
  }
  
  // Process each reward ID and collect the resulting queue IDs
  const results: string[] = [];
  
  for (const rewardId of rewardIds) {
    const result = processRewardById(room, questId, stepId, taskId, userQuestInfo, rewardId);
    if (result) {
      results.push(result);
    }
  }
  
  return results;
}

/**
 * Helper method to get and normalize reward IDs from various sources
 * Handles backwards compatibility with single rewardId properties
 * 
 * @param entity Object that might have rewardId or rewardIds properties
 * @returns Array of reward IDs or empty array if none found
 */
export function getNormalizedRewardIds(entity: any): string[] {
  if (!entity) return [];
  
  // Check for the new array property first
  if (entity.rewardIds && Array.isArray(entity.rewardIds) && entity.rewardIds.length > 0) {
    return entity.rewardIds;
  }
  
  // Fall back to legacy single rewardId if available
  if (entity.rewardId) {
    return [entity.rewardId];
  }
  
  return [];
}
