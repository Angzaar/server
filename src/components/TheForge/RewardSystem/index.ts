import { QuestRoom } from "../QuestRoom";
import { getCache, updateCache } from "../../../utils/cache";
import { PROFILES_CACHE_KEY, REWARDS_CACHE_KEY, REWARDS_TRANSACTIONS_CACHE_KEY, REWARDS_TRANSACTIONS_FILE } from "../../../utils/initializer";
import { RewardEntry, RewardHandlers, RewardTransaction } from "./types";
import { RewardKind } from "../utils/types";
import {
  distributeWeb2Reward,
  distributeERC20Reward,
  distributeERC721Reward,
  distributeERC1155Reward,
  distributePhysicalReward,
  distributeDecentralandItemReward,
  distributeDecentralandReward,
  distributeCreatorToken
} from "./processors";
import { questRooms } from "../../../rooms";

// In-memory queue for rewards (in production, consider using Redis or similar)
let rewardQueue: RewardEntry[] = [];
let isProcessing = false;
const MAX_RETRY_ATTEMPTS = 3;

// Optional: store failed rewards for analysis
let failedRewards: RewardEntry[] = [];

// Map the reward handlers to their respective functions
export const rewardHandlers: Partial<RewardHandlers> = {
  'WEB2_ITEM': distributeWeb2Reward,
  'ERC20': distributeERC20Reward,
  'ERC721': distributeERC721Reward,
  'ERC1155': distributeERC1155Reward,
  'PHYSICAL': distributePhysicalReward,
  'DECENTRALAND_ITEM': distributeDecentralandItemReward,
  'DECENTRALAND_REWARD': distributeDecentralandReward,
  'CREATOR_TOKEN': distributeCreatorToken
  // Add other reward handlers as needed
};

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
export function processReward(room: QuestRoom, questId: string, stepId: string, taskId: string, userId: string, userQuestInfo: any, rewardData: any) {
  console.log(`[QuestRoom] Processing reward for task="${taskId}" in step="${stepId}", quest="${questId}"`);
  
  if (!rewardData) return null;
  
  // Create a reward entry for the queue
  const rewardEntry: RewardEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Unique ID for tracking
    timestamp: Date.now(),
    questId,
    stepId,
    taskId,
    userId,
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
export function processRewardById(room: QuestRoom, questId: string, stepId: string, taskId: string, userId: string, userQuestInfo: any, rewardId: string) {
  if (!rewardId) return null;
  
  const rewardData = createRewardData(rewardId);
  if (!rewardData) {
    console.warn(`[RewardSystem] Could not find reward with ID ${rewardId}`);
    return null;
  }
  
  return processReward(room, questId, stepId, taskId, userId, userQuestInfo, rewardData);
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
      
      // if (reward.attempts < MAX_RETRY_ATTEMPTS) {
      //   // Move to the end of the queue for retry
      //   rewardQueue.shift();
      //   rewardQueue.push(reward);
      //   console.log(`[RewardSystem] Failed to process reward ${reward.id}, retry ${reward.attempts}/${MAX_RETRY_ATTEMPTS}`);
      // } else {
        // Max retries reached, mark as failed and remove
        reward.status = 'failed';
        rewardQueue.shift();
        // console.log(`[RewardSystem] Failed to process reward ${reward.id} after ${MAX_RETRY_ATTEMPTS} attempts, removing from queue`);
        
        // Save failed rewards for later analysis or manual processing
        // saveFailedReward(reward);
      // }
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
 * Distribute a reward based on its type
 * 
 * @param reward Reward entry to distribute
 * @returns Whether distribution was successful
 */
async function distributeReward(reward: RewardEntry): Promise<boolean> {
  try {
    if (!reward || !reward.rewardData) {
      console.error(`[RewardSystem] Invalid reward data for ${reward?.id}`);
      reward.error = 'Invalid reward data';
      saveTransactionRecord(reward, false);
      return false;
    }
    
    const { kind } = reward.rewardData;
    console.log(`[RewardSystem] Distributing ${kind} reward to user ${reward.userId}`);
    
    let success = false;
    
    switch (kind) {
      case 'WEB2_ITEM':
        success = await distributeWeb2Reward(reward);
        break;
        
      case 'ERC20':
        success = await distributeERC20Reward(reward);
        break;
        
      case 'ERC721':
        success = await distributeERC721Reward(reward);
        break;
        
      case 'ERC1155':
        success = await distributeERC1155Reward(reward);
        break;
        
      case 'PHYSICAL':
        success = await distributePhysicalReward(reward);
        break;
        
      case 'DECENTRALAND_ITEM':
        success = await distributeDecentralandItemReward(reward);
        break;
        
      case 'DECENTRALAND_REWARD':
        success = await distributeDecentralandReward(reward);
        break;
        
      case 'CREATOR_TOKEN':
        // Find an appropriate QuestRoom for the reward
        let questRoom: QuestRoom | null = null;
        
        if (reward.questId) {
          // Try to find a room for this quest
          for (const [roomId, room] of questRooms.entries()) {
            if (room.state.questId === reward.questId) {
              questRoom = room;
              break;
            }
          }
        }
        
        // If no specific room found, use a creator room as fallback
        if (!questRoom) {
          for (const [roomId, room] of questRooms.entries()) {
            if (room.state.questId === "creator") {
              questRoom = room;
              break;
            }
          }
        }
        
        if (!questRoom) {
          console.error(`[RewardSystem] No suitable QuestRoom found for creator token distribution`);
          reward.error = 'No suitable QuestRoom found';
          return false;
        }
        
        success = await distributeCreatorToken(reward, questRoom);
        break;
        
      default:
        console.error(`[RewardSystem] Unknown reward kind: ${kind}`);
        reward.error = `Unknown reward kind: ${kind}`;
        success = false;
    }
    
    // Log the transaction result
    saveTransactionRecord(reward, success);
    
    return success;
  } catch (error) {
    console.error(`[RewardSystem] Error distributing reward: ${error}`);
    reward.error = `Distribution error: ${error}`;
    
    // Log the failed transaction
    saveTransactionRecord(reward, false);
    
    return false;
  }
}

/**
 * Log a reward transaction to the rewards_transactions file
 * 
 * @param reward The reward entry
 * @param success Whether the distribution was successful
 */
function saveTransactionRecord(reward: RewardEntry, success: boolean) {
  try {
    // Get the current transactions array
    const transactions = getCache(REWARDS_TRANSACTIONS_CACHE_KEY);
    
    // Create a transaction record
    const transaction: RewardTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      userId: reward.userId,
      questId: reward.questId,
      stepId: reward.stepId,
      taskId: reward.taskId,
      rewardType: reward.rewardData?.kind || 'UNKNOWN',
      rewardName: reward.rewardData?.name || 'Unknown Reward',
      status: success ? 'success' : 'failed',
      error: reward.error || null,
      metadata: {
        attempts: reward.attempts,
        sourceType: reward.sourceType,
        rewardData: { 
          id: reward.rewardData?.id,
          name: reward.rewardData?.name,
          kind: reward.rewardData?.kind
        }
      }
    };
    
    // Add the transaction to the array
    transactions.push(transaction);
    
    // Update the cache (writing to disk will happen in the periodic sync)
    updateCache(REWARDS_TRANSACTIONS_FILE, REWARDS_TRANSACTIONS_CACHE_KEY, transactions);
    
    console.log(`[RewardSystem] Logged ${success ? 'successful' : 'failed'} transaction ${transaction.id} for reward ${reward.id}`);
  } catch (error) {
    console.error(`[RewardSystem] Error saving transaction record: ${error}`);
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
  
  // Also log the failed transaction
  saveTransactionRecord(reward, false);
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
 * Get all reward transactions
 * 
 * @returns Array of all reward transactions
 */
export function getRewardTransactions(): RewardTransaction[] {
  try {
    return getCache(REWARDS_TRANSACTIONS_CACHE_KEY) || [];
  } catch (error) {
    console.error('[RewardSystem] Error getting reward transactions:', error);
    return [];
  }
}

/**
 * Get transactions for a specific user
 * 
 * @param userId User ID to filter by
 * @returns Array of reward transactions for the user
 */
export function getUserRewardTransactions(userId: string): RewardTransaction[] {
  try {
    const transactions = getCache(REWARDS_TRANSACTIONS_CACHE_KEY) || [];
    return transactions.filter((tx: RewardTransaction) => tx.userId === userId);
  } catch (error) {
    console.error(`[RewardSystem] Error getting reward transactions for user ${userId}:`, error);
    return [];
  }
}

/**
 * Get transactions for a specific quest
 * 
 * @param questId Quest ID to filter by
 * @returns Array of reward transactions for the quest
 */
export function getQuestRewardTransactions(questId: string): RewardTransaction[] {
  try {
    const transactions = getCache(REWARDS_TRANSACTIONS_CACHE_KEY) || [];
    return transactions.filter((tx: RewardTransaction) => tx.questId === questId);
  } catch (error) {
    console.error(`[RewardSystem] Error getting reward transactions for quest ${questId}:`, error);
    return [];
  }
}

/**
 * Clear old transactions from the log (for maintenance)
 * Keeps transactions from the last 30 days by default
 * 
 * @param daysToKeep Number of days of transaction history to retain
 * @returns Number of transactions removed
 */
export function pruneRewardTransactions(daysToKeep: number = 30): number {
  try {
    const transactions = getCache(REWARDS_TRANSACTIONS_CACHE_KEY) || [];
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const originalCount = transactions.length;
    
    // Filter to keep only transactions newer than the cutoff
    const prunedTransactions = transactions.filter((tx: RewardTransaction) => 
      tx.timestamp >= cutoffTime
    );
    
    // Update the cache
    updateCache(REWARDS_TRANSACTIONS_FILE, REWARDS_TRANSACTIONS_CACHE_KEY, prunedTransactions);
    
    const removedCount = originalCount - prunedTransactions.length;
    console.log(`[RewardSystem] Pruned ${removedCount} old transactions, keeping ${prunedTransactions.length} from the last ${daysToKeep} days`);
    
    return removedCount;
  } catch (error) {
    console.error(`[RewardSystem] Error pruning reward transactions:`, error);
    return 0;
  }
}

/**
 * Check if a user has connected their Web3 wallet in Decentraland
 * 
 * @param userEthAddress The user's Ethereum address to check
 * @returns Promise<boolean> true if user has a connected Web3 wallet, false otherwise
 */
export async function checkDecentralandWeb3Wallet(userEthAddress: string): Promise<boolean> {
  if (!userEthAddress) {
    console.error('[RewardSystem] No user Ethereum address provided to check Web3 wallet');
    return false;
  }

  try{
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === userEthAddress);
    if(!profile){
      console.error(`[RewardSystem] User ${userEthAddress} not found in profiles`);
      return false;
    }

    if(profile.web3){
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[RewardSystem] Error checking if user ${userEthAddress} is a web3 wallet: ${error}`);
    return false;
  }

  // try {
  //   const response = await fetch(`https://realm-provider.decentraland.org/lambdas/profiles/${userEthAddress}`);
  //   const data = await response.json();
    
  //   if (data && data.avatars && data.avatars.length > 0) {
  //     const avatar = data.avatars[0];
  //     if (!avatar.hasConnectedWeb3) {
  //       console.error(`[RewardSystem] User ${userEthAddress} has not connected their web3 wallet`);
  //       return false;
  //     }
  //     return true;
  //   } else {
  //     console.error(`[RewardSystem] User ${userEthAddress} does not have an avatar`);
  //     return false;
  //   }
  // } catch (error) {
  //   console.error(`[RewardSystem] Error checking if user ${userEthAddress} is a web3 wallet: ${error}`);
  //   return false;
  // }
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
export function processMultipleRewardsByIds(room: QuestRoom, questId: string, stepId: string, taskId: string, userId: string, userQuestInfo: any, rewardIds: string[]): string[] {
  if (!rewardIds || !Array.isArray(rewardIds) || rewardIds.length === 0) {
    // Handle legacy single rewardId
    if (typeof rewardIds === 'string') {
      const result = processRewardById(room, questId, stepId, taskId, userId, userQuestInfo, rewardIds);
      return result ? [result] : [];
    }
    return [];
  }
  
  // Process each reward ID and collect the resulting queue IDs
  const results: string[] = [];
  
  for (const rewardId of rewardIds) {
    const result = processRewardById(room, questId, stepId, taskId, userId, userQuestInfo, rewardId);
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
  // if (entity.rewardId) {
  //   return [entity.rewardId];
  // }
  
  return [];
}
