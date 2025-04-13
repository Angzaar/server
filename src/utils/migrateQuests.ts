import { getCache, updateCache } from "./cache";
import { QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_FILE } from "./initializer";
import { QuestDefinition, CompletionMode, INFINITE } from "../rooms/QuestRoom";

// Old quest format interface
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

/**
 * Convert a legacy quest to new format
 */
function convertQuest(oldQuest: LegacyQuestDefinition): QuestDefinition {
  // Map questType to completionMode
  let completionMode: CompletionMode = 'FINITE';
  let maxCompletions = 1;
  
  if (oldQuest.questType === 'OPEN_ENDED') {
    completionMode = 'REPEATABLE';
    maxCompletions = INFINITE;
  }
  
  // Create the new quest object
  const newQuest: QuestDefinition = {
    questId: oldQuest.questId,
    version: oldQuest.version + 1, // Increment version for migration
    enabled: oldQuest.enabled,
    startTrigger: oldQuest.startTrigger,
    title: oldQuest.title,
    startTime: oldQuest.startTime,
    endTime: oldQuest.endTime,
    creator: oldQuest.creator,
    steps: oldQuest.steps,
    completionMode,
    maxCompletions,
    // Add default values for new fields
    participationScope: 'SOLO',
    progressSharing: 'INDIVIDUAL',
    rewardDistribution: 'PER_PLAYER',
    autoReset: false
  };
  
  return newQuest;
}

/**
 * Run the migration for all quests in the cache
 */
export async function migrateQuests() {
  console.log("Starting quest migration to v2 format...");
  
  // Get all quests from cache
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  let migratedCount = 0;
  
  // Loop through each quest
  for (let i = 0; i < quests.length; i++) {
    const quest = quests[i];
    
    // Only migrate quests that have the old questType property
    if ('questType' in quest) {
      console.log(`Migrating quest "${quest.questId}" (${quest.title})...`);
      
      // Convert to new format
      const newQuest = convertQuest(quest as any);
      
      // Replace in the array
      quests[i] = newQuest;
      migratedCount++;
    }
  }
  
  // Save the updated quests back to cache
  updateCache(QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_FILE, quests);
  
  console.log(`Migration complete. Migrated ${migratedCount} quests.`);
  return migratedCount;
}

// Allow running as a script
if (require.main === module) {
  migrateQuests()
    .then(count => console.log(`Migration completed successfully. Migrated ${count} quests.`))
    .catch(error => console.error("Migration failed:", error));
} 