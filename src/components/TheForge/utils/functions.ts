import { getCache } from "../../../utils/cache";
import { CompletionMode, INFINITE, LegacyQuestDefinition, QuestAttempt, QuestDefinition } from "./types";
import { updateCache, cacheSyncToFile } from "../../../utils/cache";
import { QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_FILE, REWARDS_CACHE_KEY } from "../../../utils/initializer";
import { StepDefinition, TaskDefinition } from "./types";
import { QuestRoom } from "../QuestRoom";
import { generateId } from "colyseus";
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
    // Update both the in-memory cache and write to the file
    updateCache(QUEST_TEMPLATES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, quests);
    // Force immediate sync to file
    cacheSyncToFile(QUEST_TEMPLATES_FILE, QUEST_TEMPLATES_CACHE_KEY, quests);
  }
}

/**
 * Checks if a user can replay a time-based quest based on the timeWindow setting
 * Returns an object with canReplay and nextResetTime properties
 */
export function canReplayTimeBasedQuest(questDefinition: QuestDefinition, userQuestInfo: any): { canReplay: boolean, nextResetTime?: number } {
  // If no timeWindow, or not a repeatable quest, users can't replay based on time
  if (!questDefinition.timeWindow || questDefinition.completionMode !== 'REPEATABLE') {
    return { canReplay: false };
  }

  // If there are no attempts or no attempt array, they can always play it
  if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts) || userQuestInfo.attempts.length === 0) {
    return { canReplay: true };
  }

  // Get the latest attempt
  const latestAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];

  // If the latest attempt is not completed, they can continue playing it
  if (!latestAttempt.completed) {
    return { canReplay: true };
  }

  const now = Math.floor(Date.now() / 1000); // current time in seconds
  const lastCompletionTime = latestAttempt.completionTime || now; // use current time as fallback
  
  let nextResetTime: number | undefined;

  // Handle different timeWindow formats
  if (questDefinition.timeWindow === 'daily') {
    // Calculate the start of the next day (UTC)
    const nextDay = new Date();
    nextDay.setUTCHours(0, 0, 0, 0);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextResetTime = Math.floor(nextDay.getTime() / 1000);
    
    // Check if we're in a new day since last completion
    const lastCompletionDate = new Date(lastCompletionTime * 1000);
    const currentDate = new Date();
    const isSameDay = 
      lastCompletionDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
      lastCompletionDate.getUTCMonth() === currentDate.getUTCMonth() &&
      lastCompletionDate.getUTCDate() === currentDate.getUTCDate();
    
    return { canReplay: !isSameDay, nextResetTime };
  } 
  else if (questDefinition.timeWindow === 'weekly') {
    // Calculate the start of the next week (UTC, starting Monday)
    const nextWeek = new Date();
    const daysUntilMonday = (1 + 7 - nextWeek.getUTCDay()) % 7;
    nextWeek.setUTCHours(0, 0, 0, 0);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + daysUntilMonday);
    nextResetTime = Math.floor(nextWeek.getTime() / 1000);
    
    // Check if we're in a new week since last completion
    const lastCompletionDate = new Date(lastCompletionTime * 1000);
    const currentDate = new Date();
    
    // Get week number of year for both dates
    const getWeekNumber = (d: Date) => {
      const firstJan = new Date(d.getUTCFullYear(), 0, 1);
      return Math.ceil((((d.getTime() - firstJan.getTime()) / 86400000) + firstJan.getUTCDay() + 1) / 7);
    };
    
    const isSameWeek = 
      lastCompletionDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
      getWeekNumber(lastCompletionDate) === getWeekNumber(currentDate);
    
    return { canReplay: !isSameWeek, nextResetTime };
  }
  else if (questDefinition.timeWindow.includes('/')) {
    // Custom date range format: "YYYY-MM-DD/YYYY-MM-DD"
    const [startDateStr, endDateStr] = questDefinition.timeWindow.split('/');
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);
    
    // If we're outside the date range, can't replay
    if (now < startTimestamp || now > endTimestamp) {
      return { canReplay: false };
    }
    
    // For custom ranges, you can only replay if maxCompletions allows it
    return { 
      canReplay: questDefinition.maxCompletions === INFINITE || 
                (userQuestInfo.completionCount || 0) < (questDefinition.maxCompletions || 1),
      nextResetTime: endTimestamp 
    };
  }
  
  // Default: can't replay if format is not understood
  return { canReplay: false };
}

/**
 * Creates a new attempt for a time-based repeatable quest
 * This allows tracking multiple completions while preserving history
 */
export function createNewQuestAttempt(questDefinition: QuestDefinition, profile: any, userQuestInfo: any): any {
  console.log('creating new quest attempt')
  // Initialize attempts array if it doesn't exist yet
  if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts)) {
    userQuestInfo.attempts = [];
  }
  
  // Get the attempt number (either from latest attempt or start at 1)
  const attemptNumber = userQuestInfo.attempts.length > 0 
    ? userQuestInfo.attempts[userQuestInfo.attempts.length - 1].attemptNumber + 1 
    : 1;
  
  // Create a new attempt with a clean slate
  const newAttempt: QuestAttempt = {
    attemptId: generateId(), // Generate a unique ID for this attempt
    attemptNumber: attemptNumber,
    startTime: Math.floor(Date.now()/1000),
    elapsedTime: 0,
    completionTime: 0,
    completed: false,
    started: true,
    steps: [], // Ensure steps is always initialized as an array
    status: 'in-progress',
    questVersion: questDefinition.version // Store the current quest version with the attempt
  };

  console.log('new attempt', newAttempt)
  
  // Add new attempt to the attempts array
  userQuestInfo.attempts.push(newAttempt);
  
  // Update the current attempt properties in the main userQuestInfo for compatibility
  // with existing code that expects these properties
  userQuestInfo.currentAttemptId = newAttempt.attemptId;
  
  // Also track completion count
  if (!userQuestInfo.completionCount) {
    userQuestInfo.completionCount = 0;
  }
  
  return newAttempt;
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
  
  // Initialize attempts array if it doesn't exist
  if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts)) {
    userQuestInfo.attempts = [];
    
    // If there's existing quest progress, migrate it to the first attempt
    if (userQuestInfo.completed || userQuestInfo.started || (userQuestInfo.steps && userQuestInfo.steps.length > 0)) {
      const initialAttempt = {
        attemptId: generateId(),
        attemptNumber: 1,
        startTime: userQuestInfo.startTime || Math.floor(Date.now()/1000),
        completionTime: userQuestInfo.completionTime || 0,
        elapsedTime: userQuestInfo.elapsedTime || 0,
        completed: userQuestInfo.completed || false,
        started: userQuestInfo.started || true,
        steps: userQuestInfo.steps || [],
        status: userQuestInfo.completed ? 'completed' : 'in-progress'
      };
      
      userQuestInfo.attempts.push(initialAttempt);
      
      // For backward compatibility, keep the old fields referencing current attempt
      userQuestInfo.currentAttemptId = initialAttempt.attemptId;
    }
  }
  
  // Get the current/latest attempt (may be null if no attempts)
  const currentAttempt = userQuestInfo.attempts.length > 0
    ? userQuestInfo.attempts[userQuestInfo.attempts.length - 1]
    : null;
  
  // Calculate progress metrics for the current attempt
  const totalSteps = room.questDefinition.steps.length;
  let stepsCompleted = 0;
  
  let steps: any[] = [];
  if (currentAttempt) {
    // Ensure steps is always an array
    steps = Array.isArray(currentAttempt.steps) ? currentAttempt.steps : [];
    if (steps && steps.length > 0) {
      for (const step of steps) {
      if (step.completed) stepsCompleted++;
      }
    }
  }
  
  // Calculate total tasks and completed tasks
  let totalTasks = 0;
  let tasksCompleted = 0;
  
  room.questDefinition.steps.forEach(stepDef => {
    totalTasks += stepDef.tasks.length;
    
    // Find matching user step in current attempt
    if (currentAttempt && currentAttempt.steps) {
      const userStep = currentAttempt.steps.find((s: any) => s.stepId === stepDef.stepId);
    if (userStep && userStep.tasks) {
      userStep.tasks.forEach((t: any) => {
        const taskDef = stepDef.tasks.find(td => td.taskId === t.taskId);
        if (taskDef && (t.completed || (t.count >= taskDef.requiredCount))) {
          tasksCompleted++;
        }
      });
      }
    }
  });
  
  // Calculate progress percentages
  const progressPercent = totalSteps > 0 ? (stepsCompleted / totalSteps) * 100 : 0;
  const taskProgressPercent = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0;
  
  // Create time-based quest information
  let timeBasedInfo: {
    isTimeBased: boolean;
    timeWindow: string;
    completionCount: number;
    attemptNumber: number;
    nextResetTime?: number;
    attempts: any[];
  } | null = null;
  
  if (room.questDefinition.timeWindow) {
    timeBasedInfo = {
      isTimeBased: true,
      timeWindow: room.questDefinition.timeWindow,
      completionCount: userQuestInfo.completionCount || 0,
      attemptNumber: currentAttempt?.attemptNumber || 1,
      attempts: userQuestInfo.attempts.map((attempt: any) => ({
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber || 1,
        startTime: attempt.startTime,
        completionTime: attempt.completionTime,
        elapsedTime: attempt.elapsedTime,
        completed: attempt.completed,
        status: attempt.status || (attempt.completed ? 'completed' : 'in-progress')
      }))
    };
    
    // Add next reset time for daily/weekly quests if current attempt is completed
    if (currentAttempt?.completed && room.questDefinition.completionMode === 'REPEATABLE') {
      if (room.questDefinition.timeWindow === 'daily') {
        const nextDay = new Date();
        nextDay.setUTCHours(0, 0, 0, 0);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        timeBasedInfo.nextResetTime = Math.floor(nextDay.getTime() / 1000);
      } 
      else if (room.questDefinition.timeWindow === 'weekly') {
        const nextWeek = new Date();
        const daysUntilMonday = (1 + 7 - nextWeek.getUTCDay()) % 7;
        nextWeek.setUTCHours(0, 0, 0, 0);
        nextWeek.setUTCDate(nextWeek.getUTCDate() + daysUntilMonday);
        timeBasedInfo.nextResetTime = Math.floor(nextWeek.getTime() / 1000);
      }
      else if (room.questDefinition.timeWindow.includes('/')) {
        const [_, endDateStr] = room.questDefinition.timeWindow.split('/');
        const endDate = new Date(endDateStr);
        timeBasedInfo.nextResetTime = Math.floor(endDate.getTime() / 1000);
      }
    }
  }
  
  // Create a deep copy with descriptive fields but without IDs
  const sanitized = {
    ...userQuestInfo,
    title: room.questDefinition.title || 'Untitled Quest',
    
    // Add attempt data
    currentAttempt: currentAttempt ? {
      attemptId: currentAttempt.attemptId,
      attemptNumber: currentAttempt.attemptNumber || 1,
      started: currentAttempt.started,
      completed: currentAttempt.completed,
      startTime: currentAttempt.startTime,
      completionTime: currentAttempt.completionTime,
      elapsedTime: currentAttempt.elapsedTime,
      status: currentAttempt.status || (currentAttempt.completed ? 'completed' : 'in-progress')
    } : null,
    
    // Add progress data
    totalSteps,
    stepsCompleted,
    progress: progressPercent,
    totalTasks, 
    tasksCompleted,
    taskProgress: taskProgressPercent,
    
    // Add time-based quest info if applicable
    timeBasedInfo,
    
    // Map step data for current attempt
    steps: currentAttempt && currentAttempt.steps ? currentAttempt.steps.map((step: any) => {
      // Find matching step in quest definition to get name
      const stepDef = room.questDefinition!.steps.find(s => s.stepId === step.stepId);
      
      return {
        stepId: step.stepId,
        completed: step.completed,
        completedAt: step.completedAt,
        name: stepDef?.name || '',
        tasks: step.tasks ? step.tasks.map((task: any) => {
          // Find matching task in quest definition to get description and metaverse
          const taskDef = stepDef?.tasks.find(t => t.taskId === task.taskId);
          
          return {
            taskId: task.taskId,
            count: task.count,
            completed: task.completed,
            completedAt: task.completedAt,
            description: taskDef?.description || '',
            metaverse: taskDef?.metaverse || 'DECENTRALAND'
          };
        }) : []
      };
    }) : [],
    
    // Add quest template for complete structure
    template: {
      title: room.questDefinition.title,
      completionMode: room.questDefinition.completionMode,
      maxCompletions: room.questDefinition.maxCompletions,
      timeWindow: room.questDefinition.timeWindow,
      autoReset: room.questDefinition.autoReset,
      steps: room.questDefinition.steps.map(step => ({
        stepId: step.stepId,
        name: step.name || '',
        tasks: step.tasks.map(task => ({
          taskId: task.taskId,
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
 * @param taskId Task ID
 * @param userQuestInfo User's quest progress data
 * @param forcedByAdmin Whether this task was force-completed by an admin
 * @param creatorRoomQuest Optional quest definition to use when call comes from creator room
 * @returns Object containing step completion and quest completion status
 */
export function processTaskCompletion(room: QuestRoom, questId: string, stepId: string, taskId: string, userId: string, userQuestInfo: any, forcedByAdmin = false, creatorRoomQuest?: any) {
  // Use the provided quest definition if available (for creator room calls)
  const questDefinition = creatorRoomQuest || room.questDefinition;
  
  if (!questDefinition) {
    return { 
      success: false, 
      error: "Quest definition not found" 
    };
  }
  
  // Find the step definition in the quest
  const stepDef = questDefinition.steps.find((s: StepDefinition) => s.stepId === stepId);
  if (!stepDef) {
    return { 
      success: false, 
      error: `No step="${stepId}" found in quest definition` 
    };
  }
  
  // Find the task definition
  const taskDef = stepDef.tasks.find((t: TaskDefinition) => t.taskId === taskId);
  if (!taskDef) {
    return { 
      success: false, 
      error: `No taskId="${taskId}" in step="${stepId}" definition` 
    };
  }
  
  // Initialize attempts array if it doesn't exist
  if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts)) {
    userQuestInfo.attempts = [];
    
    // If there's existing quest progress, migrate it to the first attempt
    if (userQuestInfo.completed || userQuestInfo.started || (userQuestInfo.steps && userQuestInfo.steps.length > 0)) {
      const initialAttempt = {
        attemptId: generateId(),
        attemptNumber: 1,
        startTime: userQuestInfo.startTime || Math.floor(Date.now()/1000),
        completionTime: userQuestInfo.completionTime || 0,
        elapsedTime: userQuestInfo.elapsedTime || 0,
        completed: userQuestInfo.completed || false,
        started: userQuestInfo.started || true,
        steps: userQuestInfo.steps || [],
        status: userQuestInfo.completed ? 'completed' : 'in-progress'
      };
      
      userQuestInfo.attempts.push(initialAttempt);
      
      // For backward compatibility, keep the old fields referencing current attempt
      userQuestInfo.currentAttemptId = initialAttempt.attemptId;
    }
  }
  
  // If no attempts exist yet, create the first one
  if (userQuestInfo.attempts.length === 0) {
    const firstAttempt: QuestAttempt = {
      attemptId: generateId(),
      attemptNumber: 1,
      startTime: Math.floor(Date.now()/1000),
      completionTime: 0,
      elapsedTime: 0, 
      completed: false,
      started: true,
      steps: [],
      status: 'in-progress',
      questVersion: userQuestInfo.questVersion // Use the questVersion from userQuestInfo
    };
    
    userQuestInfo.attempts.push(firstAttempt);
    userQuestInfo.currentAttemptId = firstAttempt.attemptId;
  }
  
  // Get the current attempt (always the last one in the array)
  const currentAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];
  
  // Initialize steps array if it doesn't exist
  if (!currentAttempt.steps) {
    currentAttempt.steps = [];
  } else if (!Array.isArray(currentAttempt.steps)) {
    // Convert to array if not already one
    currentAttempt.steps = [];
  }
  
  // Find or create the user's step record in the current attempt
  let userStep = currentAttempt.steps.find((s: any) => s.stepId === stepId);
  if (!userStep) {
    // Create a new step record for the user
    userStep = {
      stepId,
      completed: false,
      tasks: stepDef.tasks.map((t: TaskDefinition) => ({
        taskId: t.taskId,
        count: 0,
        completed: t.taskId === taskId && forcedByAdmin // Mark only the forced task as completed if forcing
      }))
    };
    currentAttempt.steps.push(userStep);
  }
  
  // Find or create the user's task record in the current attempt
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
  const previousQuestState = currentAttempt.completed;
  
  // Determine if task is now completed
  if (userTask.count >= taskDef.requiredCount && !userTask.completed) {
    userTask.completed = true;
    userTask.completedAt = Math.floor(Date.now()/1000); // Record task completion time
  }
  
  // Check if the step is now completed
  const isStepDone = stepDef.tasks.every((defTask: TaskDefinition) => {
    const ut = userStep.tasks.find((u: any) => u.taskId === defTask.taskId);
    const reqCount = defTask.requiredCount ?? 0;
    return ut && ((ut.count >= reqCount) || ut.completed === true);
  });
  
  if (isStepDone && !userStep.completed) {
    userStep.completed = true;
    userStep.completedAt = Math.floor(Date.now()/1000); // Record step completion time
  }
  
  // Check if the quest is now completed
  const allStepsDone = questDefinition.steps.every((defStep: StepDefinition) => {
    const st = currentAttempt.steps.find((u: any) => u.stepId === defStep.stepId);
    return st && st.completed;
  });
  
  if (allStepsDone && !currentAttempt.completed) {
    currentAttempt.completed = true;
    currentAttempt.completionTime = Math.floor(Date.now()/1000); // Record quest completion time
    currentAttempt.elapsedTime += (Math.floor(Date.now()/1000) - currentAttempt.startTime);
    currentAttempt.status = 'completed'; // Update the status
    
    // If this is a repeatable quest with a time window, increment the completion count
    if (questDefinition.completionMode === 'REPEATABLE' && questDefinition.timeWindow) {
      userQuestInfo.completionCount = (userQuestInfo.completionCount || 0) + 1;
    }
    
    // For backward compatibility, also set these fields on the main userQuestInfo
    userQuestInfo.completed = true;
    userQuestInfo.completionTime = currentAttempt.completionTime;
    userQuestInfo.elapsedTime = currentAttempt.elapsedTime;
  }
  
  // Process rewards if there are completion state transitions
  
  // 1. Task completion reward
  let taskRewardData = null;
  if (!previousTaskState && userTask.completed) {
    console.log("processing task reward")
    // Get normalized array of task reward IDs
    const taskRewardIds = getNormalizedRewardIds(taskDef);
    
    if (taskRewardIds.length > 0) {
      // If we need to return reward data for the first reward (for backward compatibility)
      taskRewardData = createRewardData(taskRewardIds[0]);
      
      // Process all rewards
      processMultipleRewardsByIds(room, questId, stepId, taskId, userId, userQuestInfo, taskRewardIds);
    }
  }
  
  // 2. Step completion reward
  if (!previousStepState && userStep.completed) {
    // Get normalized array of step reward IDs
    const stepRewardIds = getNormalizedRewardIds(stepDef);
    
    if (stepRewardIds.length > 0) {
      console.log("processing step reward")
      // Process all step rewards
      processMultipleRewardsByIds(room, questId, stepId, taskId, userId, userQuestInfo, stepRewardIds);
    }
  }
  
  // 3. Quest completion reward
  if (!previousQuestState && currentAttempt.completed) {
    // Get combined reward IDs from all sources
    let questRewardIds: string[] = [];
    
    // First check for direct rewardIds/rewardId on the quest (highest priority)
    questRewardIds = getNormalizedRewardIds(questDefinition);
    
    // If no direct rewards, check rewardTable 
    if (questRewardIds.length === 0 && questDefinition.rewardTable) {
      questRewardIds.push(questDefinition.rewardTable);
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
      processMultipleRewardsByIds(room, questId, stepId, taskId, userId, userQuestInfo, questRewardIds);
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

// Sanitize user quest data for the WebApp room case (without a loaded quest definition)
export function sanitizeWebAppQuestData(quest: any, userQuestInfo: any) {
  if (!userQuestInfo || !quest) return null;
  
  // Initialize attempts array if it doesn't exist
  if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts)) {
    userQuestInfo.attempts = [];
    
    // If there's existing quest progress, migrate it to the first attempt
    if (userQuestInfo.completed || userQuestInfo.started || (userQuestInfo.steps && userQuestInfo.steps.length > 0)) {
      const initialAttempt = {
        attemptId: generateId(),
        attemptNumber: 1,
        startTime: userQuestInfo.startTime || Math.floor(Date.now()/1000),
        completionTime: userQuestInfo.completionTime || 0,
        elapsedTime: userQuestInfo.elapsedTime || 0,
        completed: userQuestInfo.completed || false,
        started: userQuestInfo.started || true,
        steps: userQuestInfo.steps || [],
        status: userQuestInfo.completed ? 'completed' : 'in-progress'
      };
      
      userQuestInfo.attempts.push(initialAttempt);
      
      // For backward compatibility, keep the old fields referencing current attempt
      userQuestInfo.currentAttemptId = initialAttempt.attemptId;
    }
  }
  
  // Get the current/latest attempt (may be null if no attempts)
  const currentAttempt = userQuestInfo.attempts.length > 0
    ? userQuestInfo.attempts[userQuestInfo.attempts.length - 1]
    : null;
  
  // Calculate progress metrics for the current attempt
  const totalSteps = quest.steps.length;
  let stepsCompleted = 0;
  
  let steps: any[] = [];
  if (currentAttempt) {
    // Ensure steps is always an array
    steps = Array.isArray(currentAttempt.steps) ? currentAttempt.steps : [];
    if (steps && steps.length > 0) {
      for (const step of steps) {
      if (step.completed) stepsCompleted++;
      }
    }
  }
  
  // Calculate total tasks and completed tasks
  let totalTasks = 0;
  let tasksCompleted = 0;
  
  quest.steps.forEach((stepDef: any) => {
    totalTasks += stepDef.tasks.length;
    
    // Find matching user step in current attempt
    if (currentAttempt && currentAttempt.steps) {
      const userStep = currentAttempt.steps.find((s: any) => s.stepId === stepDef.stepId);
    if (userStep && userStep.tasks) {
      userStep.tasks.forEach((t: any) => {
        const taskDef = stepDef.tasks.find((td: any) => td.taskId === t.taskId);
        if (taskDef && (t.completed || (t.count >= taskDef.requiredCount))) {
          tasksCompleted++;
        }
      });
      }
    }
  });
  
  // Calculate progress percentages
  const progressPercent = totalSteps > 0 ? (stepsCompleted / totalSteps) * 100 : 0;
  const taskProgressPercent = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0;
  
  // Create time-based quest information
  let timeBasedInfo: {
    isTimeBased: boolean;
    timeWindow: string;
    completionCount: number;
    attemptNumber: number;
    nextResetTime?: number;
    attempts: any[];
  } | null = null;
  
  if (quest.timeWindow) {
    timeBasedInfo = {
      isTimeBased: true,
      timeWindow: quest.timeWindow,
      completionCount: userQuestInfo.completionCount || 0,
      attemptNumber: currentAttempt?.attemptNumber || 1,
      attempts: userQuestInfo.attempts.map((attempt: any) => ({
        attemptId: attempt.attemptId,
        attemptNumber: attempt.attemptNumber || 1,
        startTime: attempt.startTime,
        completionTime: attempt.completionTime,
        elapsedTime: attempt.elapsedTime,
        completed: attempt.completed,
        status: attempt.status || (attempt.completed ? 'completed' : 'in-progress')
      }))
    };
    
    // Add next reset time for daily/weekly quests if current attempt is completed
    if (currentAttempt?.completed && quest.completionMode === 'REPEATABLE') {
      if (quest.timeWindow === 'daily') {
        const nextDay = new Date();
        nextDay.setUTCHours(0, 0, 0, 0);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        timeBasedInfo.nextResetTime = Math.floor(nextDay.getTime() / 1000);
      } 
      else if (quest.timeWindow === 'weekly') {
        const nextWeek = new Date();
        const daysUntilMonday = (1 + 7 - nextWeek.getUTCDay()) % 7;
        nextWeek.setUTCHours(0, 0, 0, 0);
        nextWeek.setUTCDate(nextWeek.getUTCDate() + daysUntilMonday);
        timeBasedInfo.nextResetTime = Math.floor(nextWeek.getTime() / 1000);
      }
      else if (quest.timeWindow.includes('/')) {
        const [_, endDateStr] = quest.timeWindow.split('/');
        const endDate = new Date(endDateStr);
        timeBasedInfo.nextResetTime = Math.floor(endDate.getTime() / 1000);
      }
    }
  }
  
  // Create a deep copy with descriptive fields but without IDs
  const sanitized = {
    ...userQuestInfo,
    title: quest.title || 'Untitled Quest',
    
    // Add attempt data
    currentAttempt: currentAttempt ? {
      attemptId: currentAttempt.attemptId,
      attemptNumber: currentAttempt.attemptNumber || 1,
      started: currentAttempt.started,
      completed: currentAttempt.completed,
      startTime: currentAttempt.startTime,
      completionTime: currentAttempt.completionTime,
      elapsedTime: currentAttempt.elapsedTime,
      status: currentAttempt.status || (currentAttempt.completed ? 'completed' : 'in-progress')
    } : null,
    
    // Add progress data
    totalSteps,
    stepsCompleted,
    progress: progressPercent,
    totalTasks, 
    tasksCompleted,
    taskProgress: taskProgressPercent,
    
    // Add time-based quest info if applicable
    timeBasedInfo,
    
    // Map step data for current attempt
    steps: currentAttempt && currentAttempt.steps ? currentAttempt.steps.map((step: any) => {
      // Find matching step in quest definition to get name
      const stepDef = quest.steps.find((s: any) => s.stepId === step.stepId);
      
      return {
        stepId: step.stepId,
        completed: step.completed,
        completedAt: step.completedAt,
        name: stepDef?.name || '',
        tasks: step.tasks ? step.tasks.map((task: any) => {
          // Find matching task in quest definition to get description and metaverse
          const taskDef = stepDef?.tasks.find((t: any) => t.taskId === task.taskId);
          
          return {
            taskId: task.taskId,
            count: task.count,
            completed: task.completed,
            completedAt: task.completedAt,
            description: taskDef?.description || '',
            metaverse: taskDef?.metaverse || 'DECENTRALAND'
          };
        }) : []
      };
    }) : [],
    
    // Add quest template for complete structure
    template: {
      title: quest.title,
      completionMode: quest.completionMode,
      maxCompletions: quest.maxCompletions,
      timeWindow: quest.timeWindow,
      autoReset: quest.autoReset,
      steps: quest.steps.map((step: any) => ({
        stepId: step.stepId,
        name: step.name || '',
        tasks: step.tasks.map((task: any) => ({
          taskId: task.taskId,
          description: task.description || '',
          requiredCount: task.requiredCount,
          metaverse: task.metaverse
        }))
      }))
    }
  };
  
  return sanitized;
}