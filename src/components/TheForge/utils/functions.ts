import { getCache } from "../../../utils/cache";
import { CompletionMode, INFINITE, LegacyQuestDefinition } from "./types";
import { updateCache } from "../../../utils/cache";
import { QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_FILE, REWARDS_CACHE_KEY } from "../../../utils/initializer";
import { QuestDefinition } from "./types";
import { QuestRoom } from "../QuestRoom";
import { 
  processReward, 
  processRewardById, 
  createRewardData, 
  processMultipleRewardsByIds,
  getNormalizedRewardIds 
} from "../RewardSystem";

// Helper function to sync quest changes to cache
export function syncQuestToCache(questId: string, questDefinition: QuestDefinition) {
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const idx = quests.findIndex((q: QuestDefinition) => q.questId === questId);
  if (idx >= 0) {
    quests[idx] = questDefinition;
    updateCache(QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, quests);
  }
}

// Helper function to check if quest is legacy format
export function isLegacyQuest(quest: any): quest is LegacyQuestDefinition {
  return quest && typeof quest.questType === 'string';
}

/**
 * Convert a legacy quest to new format, ensuring all new fields have appropriate defaults
 */
export function convertQuest(oldQuest: LegacyQuestDefinition): QuestDefinition {
    // Map questType to completionMode
    let completionMode: CompletionMode = 'FINITE';
    let maxCompletions = 1;
    
    if (oldQuest.questType === 'OPEN_ENDED') {
      completionMode = 'REPEATABLE';
      maxCompletions = INFINITE;
    } else if (oldQuest.questType === 'ONE_SHOT') {
      completionMode = 'ONE_SHOT_GLOBAL';
      maxCompletions = 1;
    }
    
    // Preserve any task and step rewards that might exist in the legacy quest
    let steps = oldQuest.steps;
    
    // Check if we need to fix rewardId properties to maintain compatibility
    if (Array.isArray(steps)) {
      steps = steps.map(step => {
        // Handle possible step rewards from legacy quests (if any existed)
        return {
          ...step,
          // Other properties would remain untouched
        };
      });
    }
    
    // Create the new quest object with all required fields and optional fields with defaults
    const newQuest: QuestDefinition = {
      // Basic identity & lifecycle (carry over from old quest)
      questId: oldQuest.questId,
      version: oldQuest.version + 1, // Increment version for migration
      enabled: oldQuest.enabled,
      startTrigger: oldQuest.startTrigger,
      title: oldQuest.title,
      startTime: oldQuest.startTime,
      endTime: oldQuest.endTime,
      creator: oldQuest.creator,
      steps,
      
      // Behavior flags
      completionMode,
      maxCompletions,
      // timeWindow is optional, leaving undefined
      autoReset: false,
      
      // Multiplayer settings
      participationScope: 'SOLO',
      progressSharing: 'INDIVIDUAL',
      rewardDistribution: 'PER_PLAYER',
      
      // Scoring & rewards (optional)
      // scoringRule: undefined,
      // rewardTable: undefined,
      // rewardId: undefined (no direct conversion from legacy format)
    };
    
    // Add allowReplay from legacy if it exists (not part of new schema but might be useful for reference)
    if (oldQuest.allowReplay !== undefined) {
      // Could log or handle this differently if needed
      console.log(`Note: Quest ${oldQuest.questId} had allowReplay=${oldQuest.allowReplay}, mapped to completionMode=${completionMode}`);
    }
    
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
      if (isLegacyQuest(quest)) {
        console.log(`Migrating quest "${quest.questId}" (${quest.title})...`);
        
        // Convert to new format
        const newQuest = convertQuest(quest);
        
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

/**
 * Shared function to process task completion logic for both regular and force-completed tasks
 * @param room The QuestRoom instance
 * @param questId Quest ID
 * @param stepId Step ID
 * @param taskId Task ID
 * @param userQuestInfo User's quest progress data
 * @param forcedByAdmin Whether this task was force-completed by an admin
 * @returns Object containing step completion and quest completion status
 */
export function processTaskCompletion(room: QuestRoom, questId: string, stepId: string, taskId: string, userQuestInfo: any, forcedByAdmin = false) {
  if (!room.questDefinition) {
    return { 
      success: false, 
      error: "Quest definition not found" 
    };
  }
  
  // Find the step definition in the quest
  const stepDef = room.questDefinition.steps.find((s) => s.stepId === stepId);
  if (!stepDef) {
    return { 
      success: false, 
      error: `No step="${stepId}" found in quest definition` 
    };
  }
  
  // Find the task definition
  const taskDef = stepDef.tasks.find((t) => t.taskId === taskId);
  if (!taskDef) {
    return { 
      success: false, 
      error: `No taskId="${taskId}" in step="${stepId}" definition` 
    };
  }
  
  // Find or create the user's step record
  let userStep = userQuestInfo.steps.find((s: any) => s.stepId === stepId);
  if (!userStep) {
    // Create a new step record for the user
    userStep = {
      stepId,
      completed: false,
      tasks: stepDef.tasks.map((t) => ({
        taskId: t.taskId,
        count: 0,
        completed: t.taskId === taskId && forcedByAdmin // Mark only the forced task as completed if forcing
      }))
    };
    userQuestInfo.steps.push(userStep);
  }
  
  // Find or create the user's task record
  let userTask = userStep.tasks.find((t: any) => t.taskId === taskId);
  if (!userTask) {
    // Create a new task record
    userTask = {
      taskId,
      count: forcedByAdmin ? (taskDef.requiredCount || 1) : 1,
      completed: forcedByAdmin ? true : false
    };
    userStep.tasks.push(userTask);
  } else if (!userTask.completed) {
    // Update existing task
    if (forcedByAdmin) {
      userTask.count = taskDef.requiredCount || 1;
      userTask.completed = true;
    } else {
      userTask.count++;
    }
  }
  
  // Track completion states to detect transitions
  const previousTaskState = userTask.completed;
  const previousStepState = userStep.completed;
  const previousQuestState = userQuestInfo.completed;
  
  // Determine if task is now completed
  if (userTask.count >= taskDef.requiredCount && !userTask.completed) {
    userTask.completed = true;
  }
  
  // Check if the step is now completed
  const isStepDone = stepDef.tasks.every((defTask) => {
    const ut = userStep.tasks.find((u: any) => u.taskId === defTask.taskId);
    const reqCount = defTask.requiredCount ?? 0;
    return ut && ((ut.count >= reqCount) || ut.completed === true);
  });
  
  if (isStepDone && !userStep.completed) {
    userStep.completed = true;
  }
  
  // Check if the quest is now completed
  const allStepsDone = room.questDefinition.steps.every((defStep) => {
    const st = userQuestInfo.steps.find((u: any) => u.stepId === defStep.stepId);
    return st && st.completed;
  });
  
  if (allStepsDone && !userQuestInfo.completed) {
    userQuestInfo.completed = true;
    userQuestInfo.elapsedTime += Math.floor(Date.now()/1000) - userQuestInfo.startTime;
  }
  
  // Process rewards if there are completion state transitions
  
  // 1. Task completion reward
  let taskRewardData = null;
  if (!previousTaskState && userTask.completed) {
    // Get normalized array of task reward IDs
    const taskRewardIds = getNormalizedRewardIds(taskDef);
    
    if (taskRewardIds.length > 0) {
      // If we need to return reward data for the first reward (for backward compatibility)
      taskRewardData = createRewardData(taskRewardIds[0]);
      
      // Process all rewards
      processMultipleRewardsByIds(room, questId, stepId, taskId, {
        ...userQuestInfo,
        userId: userQuestInfo.userId || userQuestInfo.ethAddress,
        userEthAddress: userQuestInfo.ethAddress
      }, taskRewardIds);
    }
  }
  
  // 2. Step completion reward
  if (!previousStepState && userStep.completed) {
    // Get normalized array of step reward IDs
    const stepRewardIds = getNormalizedRewardIds(stepDef);
    
    if (stepRewardIds.length > 0) {
      // Process all step rewards
      processMultipleRewardsByIds(room, questId, stepId, '', {
        ...userQuestInfo,
        userId: userQuestInfo.userId || userQuestInfo.ethAddress,
        userEthAddress: userQuestInfo.ethAddress
      }, stepRewardIds);
    }
    // Fallback to the old method of looking for task rewards if no direct step rewards
    else {
      // Use the last task with a reward in the step as a fallback
      const tasksWithRewards = stepDef.tasks.filter(task => getNormalizedRewardIds(task).length > 0);
      const lastRewardTask = tasksWithRewards.length > 0 ? tasksWithRewards[tasksWithRewards.length - 1] : null;
      
      if (lastRewardTask) {
        const lastTaskRewardIds = getNormalizedRewardIds(lastRewardTask);
        
        if (lastTaskRewardIds.length > 0) {
          processMultipleRewardsByIds(room, questId, stepId, '', {
            ...userQuestInfo,
            userId: userQuestInfo.userId || userQuestInfo.ethAddress,
            userEthAddress: userQuestInfo.ethAddress
          }, lastTaskRewardIds);
        }
      }
    }
  }
  
  // 3. Quest completion reward
  if (!previousQuestState && userQuestInfo.completed) {
    // Get combined reward IDs from all sources
    let questRewardIds: string[] = [];
    
    // First check for direct rewardIds/rewardId on the quest (highest priority)
    questRewardIds = getNormalizedRewardIds(room.questDefinition);
    
    // If no direct rewards, check rewardTable 
    if (questRewardIds.length === 0 && room.questDefinition.rewardTable) {
      questRewardIds.push(room.questDefinition.rewardTable);
    }
    
    // If still no rewards, look for rewards assigned to this quest
    if (questRewardIds.length === 0) {
      const rewards = getCache(REWARDS_CACHE_KEY) as Array<{ id: string, assignedTo?: { questId: string, taskId?: string } }>;
      const assignedRewards = rewards.filter((r) => 
        r.assignedTo && r.assignedTo.questId === questId && !r.assignedTo.taskId
      );
      
      if (assignedRewards.length > 0) {
        questRewardIds = assignedRewards.map((r) => r.id);
      }
    }
    
    // Process all quest completion rewards if any were found
    if (questRewardIds.length > 0) {
      processMultipleRewardsByIds(room, questId, '', '', {
        ...userQuestInfo,
        userId: userQuestInfo.userId || userQuestInfo.ethAddress,
        userEthAddress: userQuestInfo.ethAddress
      }, questRewardIds);
    }
  }
  
  return {
    success: true,
    taskComplete: userTask.completed,
    stepComplete: isStepDone,
    questComplete: allStepsDone,
    rewardData: taskRewardData, // Only return the task reward in the result
    taskName: taskDef.description,
    stepName: stepDef.name,
    userQuestInfo
  };
}