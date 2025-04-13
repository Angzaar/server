import { getCache } from "../../../utils/cache";
import { CompletionMode, INFINITE, LegacyQuestDefinition } from "./types";
import { updateCache } from "../../../utils/cache";
import { QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_FILE } from "../../../utils/initializer";
import { QuestDefinition } from "./types";
import { QuestRoom } from "../QuestRoom";

// Helper function to sync quest changes to cache
export function syncQuestToCache(questId: string, questDefinition: QuestDefinition) {
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const idx = quests.findIndex((q: QuestDefinition) => q.questId === questId);
  if (idx >= 0) {
    quests[idx] = questDefinition;
    updateCache(QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, quests);
  }
}

// Helper function to convert legacy quest to new format
export function convertLegacyQuest(legacy: LegacyQuestDefinition): QuestDefinition {
  const newQuest: QuestDefinition = {
    questId: legacy.questId,
    version: legacy.version,
    enabled: legacy.enabled,
    startTrigger: legacy.startTrigger,
    title: legacy.title,
    startTime: legacy.startTime,
    endTime: legacy.endTime,
    creator: legacy.creator,
    steps: legacy.steps,
    completionMode: legacy.questType === 'OPEN_ENDED' ? 'REPEATABLE' : 'FINITE',
    maxCompletions: legacy.questType === 'OPEN_ENDED' ? INFINITE : 1
  };
  
  return newQuest;
}

// Helper function to check if quest is legacy format
export function isLegacyQuest(quest: any): quest is LegacyQuestDefinition {
  return quest && typeof quest.questType === 'string';
}

/**
import { QuestDefinition } from "./types";
 * Convert a legacy quest to new format
 */
export function convertQuest(oldQuest: LegacyQuestDefinition): QuestDefinition {
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


  // Sanitize user quest data by removing IDs but keeping descriptive information
export function sanitizeUserQuestData(room:QuestRoom, userQuestInfo: any) {
    if (!userQuestInfo || !room.questDefinition) return null;
    
    // Calculate progress metrics
    const totalSteps = room.questDefinition.steps.length;
    let stepsCompleted = 0;
    
    if (userQuestInfo.steps) {
      for (const step of userQuestInfo.steps) {
        if (step.completed) stepsCompleted++;
      }
    }
    
    // Calculate total tasks and completed tasks
    let totalTasks = 0;
    let tasksCompleted = 0;
    
    room.questDefinition.steps.forEach(stepDef => {
      totalTasks += stepDef.tasks.length;
      
      // Find matching user step
      const userStep = userQuestInfo.steps.find((s: any) => s.stepId === stepDef.stepId);
      if (userStep && userStep.tasks) {
        userStep.tasks.forEach((t: any) => {
          const taskDef = stepDef.tasks.find(td => td.taskId === t.taskId);
          if (taskDef && (t.completed || (t.count >= taskDef.requiredCount))) {
            tasksCompleted++;
          }
        });
      }
    });
    
    // Calculate progress percentages
    const progressPercent = totalSteps > 0 ? (stepsCompleted / totalSteps) * 100 : 0;
    const taskProgressPercent = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0;
    
    // Create a deep copy with descriptive fields but without IDs
    const sanitized = {
      ...userQuestInfo,
      title: room.questDefinition.title || 'Untitled Quest',
      // Add progress data
      totalSteps,
      stepsCompleted,
      progress: progressPercent,
      totalTasks, 
      tasksCompleted,
      taskProgress: taskProgressPercent,
      steps: userQuestInfo.steps ? userQuestInfo.steps.map((step: any) => {
        // Find matching step in quest definition to get name
        const stepDef = room.questDefinition!.steps.find(s => s.stepId === step.stepId);
        
        return {
          completed: step.completed,
          name: stepDef?.name || '',
          tasks: step.tasks ? step.tasks.map((task: any) => {
            // Find matching task in quest definition to get description and metaverse
            const taskDef = stepDef?.tasks.find(t => t.taskId === task.taskId);
            
            return {
              count: task.count,
              completed: task.completed,
              description: taskDef?.description || '',
              metaverse: taskDef?.metaverse || 'DECENTRALAND'
              // We're deliberately not including IDs and prerequisiteTaskIds
            };
          }) : []
        };
      }) : [],
      
      // Add quest template for complete structure
      template: {
        title: room.questDefinition.title,
        completionMode: room.questDefinition.completionMode,
        maxCompletions: room.questDefinition.maxCompletions,
        steps: room.questDefinition.steps.map(step => ({
          name: step.name || '',
          tasks: step.tasks.map(task => ({
            description: task.description || '',
            requiredCount: task.requiredCount,
            metaverse: task.metaverse
          }))
        }))
      }
    };
    
    return sanitized;
  }