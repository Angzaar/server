export // Old quest format interface
interface LegacyQuestDefinition {
  questId: string;
  version: number;
  enabled: boolean;
  questType: 'LINEAR' | 'OPEN_ENDED' | 'ONE_SHOT';
  startTrigger: 'EXPLICIT' | 'FIRST_TASK';
  title: string;
  startTime?: number;
  endTime?: number;
  allowReplay?: boolean;
  creator: string;
  steps: any[]; // Keeping it simple, steps structure is the same
}


export interface EphemeralCodeData {
    questId: string;
    expires: number; // a timestamp in ms
  }
  
  export interface TaskDefinition {
    taskId: string;
    requiredCount: number;
    description: string;
    metaverse: 'DECENTRALAND' | 'HYPERFY';
    prerequisiteTaskIds: string[];
    rewardId?: string; // Deprecated - use rewardIds instead
    rewardIds?: string[]; // Array of reward IDs to grant when task is completed
  }
  
  export interface StepDefinition {
    stepId: string;
    name: string;
    tasks: TaskDefinition[];
    
    /**
     * The key to mixing linear and branching:
     * `prerequisiteStepIds` lists which steps
     * must be completed before this step can start.
     *
     * - If empty or undefined => user can do this step anytime (branching).
     * - If it has one step => a simple linear chain from that step.
     * - If it has multiple => you need multiple steps done first.
     */
    prerequisiteStepIds?: string[];
    
    /**
     * Optional reward given when the entire step is completed
     * Independent from any individual task rewards
     * @deprecated Use rewardIds instead
     */
    rewardId?: string;
    
    /**
     * Array of reward IDs given when the entire step is completed
     * Independent from any individual task rewards
     */
    rewardIds?: string[];
  }
  
  
  /* ─────────────────────────────────────────────
     2.  Enum helpers for the new quest flags
     ──────────────────────────────────────────── */
     export type CompletionMode      = 'FINITE' | 'REPEATABLE' | 'ONE_SHOT_GLOBAL';
     export type ParticipationScope  = 'SOLO' | 'PARTY' | 'GUILD' | 'GLOBAL';
     export type ProgressSharing     = 'INDIVIDUAL' | 'SHARED' | 'POOLED';
     export type RewardDistribution  = 'PER_PLAYER' | 'SPLIT_EVENLY' | 'RANKED';
     
     /* Optional syntactic sugar so callers don't have to remember magic numbers. */
     export const INFINITE = Number.POSITIVE_INFINITY;
  
  /* ─────────────────────────────────────────────
     3.  QuestDefinition v2
     ──────────────────────────────────────────── */
     export interface QuestDefinition {
      /* identity & lifecycle */
      questId: string;
      version: number;
      enabled: boolean;
      startTrigger: 'EXPLICIT' | 'FIRST_TASK';
      title: string;
      startTime?: number;            // Unix ms
      endTime?: number;              // Unix ms
      creator: string;               // e.g. ethAddress
    
      /* NEW — behaviour flags */
      completionMode: CompletionMode;   // FINITE | REPEATABLE
      maxCompletions?: number;          // 1 (default) | N | INFINITE
      timeWindow?: string;              // "daily" | "weekly" | "YYYY‑MM‑DD/YYYY‑MM‑DD"
      autoReset?: boolean;              // wipe progress at end‑of‑window
    
      /* NEW — multiplayer knobs */
      participationScope?: ParticipationScope;  // default: SOLO
      progressSharing?: ProgressSharing;        // default: INDIVIDUAL
      rewardDistribution?: RewardDistribution;  // default: PER_PLAYER
    
      /* NEW — scoring & rewards */
      scoringRule?: string;              // short script e.g. "score += eggsCollected"
      rewardTable?: string;              // id of ranked/flat reward schema
      rewardId?: string;                 // direct reward ID for quest completion (deprecated)
      rewardIds?: string[];              // array of reward IDs for quest completion
    
      /* content */
      steps: StepDefinition[];
    
      /* NEW — version history */
      versionHistory?: VersionHistoryEntry[];
    
      /* NEW — prerequisites */
      prerequisites?: {
        quests?: string[];
        steps?: string[];
        level?: number;
      };
    }

/**
 * Represents a single attempt at completing a quest
 * Used for repeatable quests to track multiple completions
 */
export interface QuestAttempt {
  attemptId: string;           // Unique ID for this attempt
  attemptNumber: number;       // Sequential number for this attempt (1-indexed)
  startTime: number;           // When this attempt started (Unix timestamp)
  completionTime: number;      // When this attempt was completed (Unix timestamp)
  elapsedTime: number;         // Total time spent on this attempt
  completed: boolean;          // Whether this attempt was completed
  started: boolean;            // Whether this attempt was started
  steps: QuestAttemptStep[];   // Progress data for steps in this attempt
  status?: 'in-progress' | 'completed' | 'expired';  // Current status of the attempt
  questVersion?: number;       // The version of the quest this attempt belongs to
}

/**
 * Represents a step within a quest attempt
 */
export interface QuestAttemptStep {
  stepId: string;
  completed: boolean;
  tasks: QuestAttemptTask[];
}

/**
 * Represents a task within a quest attempt step
 */
export interface QuestAttemptTask {
  taskId: string;
  count: number;
  completed?: boolean;
  requiredCount?: number;
}

/* ---------- ENUMS & COMMON TYPES ---------- */
export type RewardKind = 'WEB2_ITEM' | 'ERC20' | 'ERC721' | 'ERC1155' | 'PHYSICAL' | 'DECENTRALAND_ITEM' | 'DECENTRALAND_REWARD' | 'CREATOR_TOKEN';

export type Currency =
  | { symbol: string; decimals: number }                 // on‑chain (e.g. ETH, MATIC)
  | { iso: string }
  | { tokenId: string };                                 // creator token

export interface Price {
  amount: string;           // keep as string to avoid JS float issues
  currency: Currency;
  chainId?: number;         // only for crypto prices
}

export interface Listing {
  listed: boolean;
  marketplaceId?: string;   // null when unlisted
  price?: Price;            // required when listed = true
  quantity?: number;        // for fungible / multi‑supply
}

/* ---------- MAIN REWARD RECORD ---------- */

// Add interface for MarketplaceData
export interface MarketplaceData {
  category: string;         // main category (e.g. Clothing, Weapons)
  subcategory: string;      // sub-category (e.g. T-Shirts, Swords)
  tags: string[];           // searchable tags
}

// Add interface for Promotion
export interface Promotion {
  isOnSale: boolean;        // whether the item is on sale
  salePrice: string;        // sale price if on sale 
  saleEndDate: string;      // when the sale ends
}

export interface Reward {
  /* identity & metadata */
  id: string;                       // global unique
  creator: string;                  // who minted / registered it in The Forge
  name: string;
  description?: string;
  media?: { image: string; video?: string };

  kind: RewardKind;

  /* type‑specific payload (only ONE populated) */
  web2?: {
    sku: string;
    fulfillment: 'DIGITAL_CODE' | 'FILE_DOWNLOAD' | 'SHIP_PHYSICAL';
    quantity?: number;              // stock count if finite
    redemptionInstructions?: string;
  };

  erc20?: {
    blockchain: string;             // 'ethereum', 'polygon', …
    chainId: number;
    contract: string;
    decimals: number;
    amount: string;                 // how many tokens are awarded
  };

  erc721?: {
    blockchain: string;
    chainId: number;
    contract: string;
    tokenId: string | number;
    metadataUri?: string;
  };

  erc1155?: {
    blockchain: string;
    chainId: number;
    contract: string;
    tokenId: string | number;
    amount: string;
    metadataUri?: string;
  };

  physical?: {
    dimensions?: string;            // "30 × 20 cm"
    weightGrams?: number;
    shippingFrom?: string;          // ISO country code or free‑text
    quantity?: number;
  };

  decentralandItem?: {
    itemId: string;                 // Decentraland item identifier
    assetContractAddress?: string;  // Contract address if item is on blockchain
    tokenId?: string;               // Token ID if applicable
    quantity?: number;              // Number of items to grant
    rarity?: string;                // Rarity level (e.g. 'common', 'rare', 'epic', 'legendary')
    category?: string;              // Item category (e.g. 'wearable', 'emote', 'scene')
  };

  decentralandReward?: {
    rewardId: string;               // Decentraland reward identifier
    type: string;                   // Type of reward (e.g. 'mana', 'catalyst', 'names', 'badges')
    amount?: string;                // Amount for numerical rewards
    expiresAt?: string;             // ISO date for time-limited rewards
    metadata?: Record<string, any>; // Additional reward-specific metadata
  };
  
  creatorToken?: {
    tokenId: string;                // Reference to the creator token
    amount: string;                 // How many tokens to reward
  }; 

  /* usage & permissions */
  allowExternalCreators: boolean;   // can others attach this reward to their quests?
  allowedCreatorIds?: string[];     // whitelist (used only if allowExternalCreators=false)

  /* quest linkage – NOT embedded; keeps reward reusable */
  assignedTo?: {
    questId: string;
    taskId?: string;                // null means entire quest
    conditions?: { key: string; op: string; value: any }[];
  };

  /* marketplace listing (optional) */
  listing?: Listing;
  
  /* marketplace metadata */
  marketplaceData?: MarketplaceData; // category, subcategory, tags

  /* featured status */
  featured?: boolean;               // highlighted in marketplace

  /* sale promotion */
  promotion?: Promotion;            // sale information

  /* housekeeping */
  createdAt: string;                // ISO‑8601
  updatedAt: string;
}

/**
 * Represents a creator token in the system
 */
export interface CreatorToken {
  /* identity & metadata */
  id: string;                     // unique token identifier
  creator: string;                // creator's address
  name: string;                   // display name
  symbol: string;                 // token symbol (e.g. "SLICE")
  description?: string;           // token description
  media?: { image: string };      // token logo/image
  
  /* supply info */
  totalSupply: string | number;            // total supply (string or number)
  circulatingSupply: string | number;      // amount in circulation (string or number)
  
  /* token economics */
  initialPrice?: string | number;          // initial price in USD (string or number)
  
  /* permissions */
  usableAsPayment: boolean;       // whether token can be used as payment
  usableAsReward: boolean;        // whether token can be used as reward

  /* housekeeping */
  createdAt: string;              // ISO‑8601
  updatedAt: string;
}

// Add a new interface for version history entries
export interface VersionHistoryEntry {
  version: number;
  createdAt: string; // ISO date string
  reason: string;    // Why the version was incremented
}