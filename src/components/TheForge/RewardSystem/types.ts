import { RewardKind } from "../utils/types";

/**
 * Interface representing an entry in the reward processing queue
 */
export interface RewardEntry {
  id: string;                     // Unique identifier for the reward processing entry
  timestamp: number;              // When this reward was queued
  questId: string;                // Associated quest ID
  stepId: string;                 // Step ID (if applicable)
  taskId: string;                 // Task ID (if applicable)
  userId: string;                 // User who earned the reward
  rewardData: {                   // Reward details
    id: string;
    name: string;
    kind: RewardKind;
    description?: string;
    media?: { image: string; video?: string };
    web2?: any;                   // Web2-specific reward data
    erc20?: any;                  // ERC20-specific reward data
    erc721?: any;                 // ERC721-specific reward data
    erc1155?: any;                // ERC1155-specific reward data
    physical?: any;               // Physical reward data
    decentralandItem?: any;       // Decentraland item-specific data
    decentralandReward?: any;     // Decentraland reward-specific data
  };
  sourceType: 'task' | 'step' | 'quest';  // What triggered this reward
  status: 'pending' | 'processing' | 'completed' | 'failed';  // Current processing status
  attempts: number;               // Number of distribution attempts
  error: string | null;           // Error message if failed
}

/**
 * Type for reward handlers by kind
 */
export type RewardHandlers = {
  [key in RewardKind]: (reward: RewardEntry) => Promise<boolean>;
};

/**
 * Interface representing a reward transaction record
 */
export interface RewardTransaction {
  id: string;                     // Unique transaction ID
  // rewardEntryId: string;          // ID of the original reward entry
  timestamp: number;              // When the transaction occurred
  userId: string;                 // User who received/attempted to receive the reward
  questId: string;                // Associated quest ID
  stepId: string;                 // Step ID (if applicable)
  taskId: string;                 // Task ID (if applicable)
  rewardType: string;             // Type of reward (uses RewardKind)
  rewardName: string;             // Name of the reward
  status: 'success' | 'failed';   // Whether the transaction succeeded
  error: string | null;           // Error message if failed
  metadata: {                     // Additional metadata about the transaction
    attempts: number;             // How many attempts were made
    sourceType: 'task' | 'step' | 'quest';  // What triggered this reward
    rewardData: {                 // Simplified reward data for reference
      id?: string;
      name?: string;
      kind?: string;
    }
  }
}
