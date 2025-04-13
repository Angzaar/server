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
    }



/* ---------- ENUMS & COMMON TYPES ---------- */
export type RewardKind = 'WEB2_ITEM' | 'ERC20' | 'ERC721' | 'ERC1155' | 'PHYSICAL' | 'DECENTRALAND_ITEM';

export type Currency =
  | { symbol: string; decimals: number }                 // on‑chain (e.g. ETH, MATIC)
  | { iso: string };                                     // fiat  (e.g. USD, EUR)

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

  /* housekeeping */
  createdAt: string;                // ISO‑8601
  updatedAt: string;
}