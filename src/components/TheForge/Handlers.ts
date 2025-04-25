import { CompletionMode, INFINITE, QuestDefinition, TaskDefinition, QuestAttempt } from "./utils/types";
import { Client } from "colyseus";
import { ephemeralCodes, QuestRoom } from "./QuestRoom";
import { getCache, updateCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY } from "../../utils/initializer";
import { StepDefinition } from "./utils/types";
import { questRooms } from "../../rooms";
import { 
  isLegacyQuest, 
  sanitizeUserQuestData, 
  syncQuestToCache, 
  processTaskCompletion,
  canReplayTimeBasedQuest,
  createNewQuestAttempt 
} from "./utils/functions";
import { forceEndQuestForAll } from "./QuestCreatorHandlers";
import { generateId } from 'colyseus';


/**************************************
   * handleQuestAction 
   * increments a particular task in a step, checking prereqs
   **************************************/
export async function handleQuestAction(room:QuestRoom, client: Client, payload: any) {
    console.log('handle quest action',client.userData.userId, payload)
    // console.log(this.questDefinition)
  
    // Check if this request is admin-triggered
    const isAdminTriggered = payload.adminTriggered === true;
    const adminClient = payload.adminClient;
  
    // 1) Validate we have a questDefinition loaded
    if (!room.questDefinition){
      console.warn('no quest definition to handle quest action')
      return;
    }
  
    const { questId, stepId, taskId, metaverse } = payload;
  
    // 2) Check if questId matches the one we loaded
    if (questId !== room.questDefinition.questId) {
      console.warn(`[QuestRoom] Mismatch questId => got="${questId}", expect="${room.questDefinition.questId}".`);
      return;
    }
  
    // 3) If the quest is disabled or ended, reject (skip this check for admin-triggered actions)
    if (!room.questDefinition.enabled && !isAdminTriggered) {
      console.warn(`Quest is disabled or ended ${room.questDefinition.questId}`)
      client.send("QUEST_ERROR", { message: "Quest is disabled or ended." });
      return;
    }
  
    // 4) Optional time checks (startTime / endTime) - skip for admin-triggered actions
    if (!isAdminTriggered) {
      const now = Date.now();
      if (room.questDefinition.startTime && now < room.questDefinition.startTime) {
        console.warn('Quest not yet active.')
        client.send("QUEST_ERROR", { message: "Quest not yet active." });
        return;
      }
      if (room.questDefinition.endTime && now >= room.questDefinition.endTime) {
        console.warn('Quest already over.')
        client.send("QUEST_ERROR", { message: "Quest already over." });
        return;
      }
    }
  
    // 5) Find the user's profile
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    if (!profile) return;
  
    // 6) Get or create the user's quest progress record (for current version)
    let userQuestInfo = profile.questsProgress.find(
      (q: any) =>
        q.questId === questId &&
        q.questVersion === room.questDefinition!.version
    );
    
    // For normal users (not admin-triggered), check if quest can be replayed
    if (!isAdminTriggered && userQuestInfo) {
      // Check if there are attempts and if latest attempt is completed
      const hasAttempts = userQuestInfo.attempts && Array.isArray(userQuestInfo.attempts) && userQuestInfo.attempts.length > 0;
      const latestAttempt = hasAttempts ? userQuestInfo.attempts[userQuestInfo.attempts.length - 1] : null;
      const isCompleted = latestAttempt ? latestAttempt.completed : userQuestInfo.completed;
      
      if(isCompleted && room.questDefinition.completionMode === 'FINITE' && room.questDefinition.maxCompletions === 1){
        console.log(`quest ${questId} already completed by user`, client.userData.userId)
        client.send("QUEST_ERROR", { message: "Quest already completed." });
        return;
      }
      
      // Check if latest attempt is completed and quest has time window
      if (isCompleted && room.questDefinition.timeWindow) {
        console.log('quest is completed and has time window')
        const replayInfo = canReplayTimeBasedQuest(room.questDefinition, userQuestInfo);
        
        if (replayInfo.canReplay) {
          console.log(`Time-based quest ${questId} can be replayed by user ${client.userData.userId}`);
          
          // Create a new attempt for this quest
          const newAttempt = createNewQuestAttempt(room.questDefinition, profile, userQuestInfo);
          
          // Notify the user they're starting a new attempt
          client.send("QUEST_NEW_ATTEMPT", { 
            questId, 
            attemptNumber: newAttempt.attemptNumber,
            message: "Starting a new quest attempt."
          });
          
          // Notify creator rooms about new attempt
          notifyCreatorRooms(room, "QUEST_NEW_ATTEMPT_BY_USER", {
            questId,
            userId: client.userData.userId,
            userName: profile.name || client.userData.userId,
            attemptNumber: newAttempt.attemptNumber,
            attemptId: newAttempt.attemptId,
            startTime: newAttempt.startTime,
            timestamp: Date.now()
          });
        } 
        else if (replayInfo.nextResetTime) {
          // If can't replay yet, notify when they can try again
          
          console.log('quest can not be replayed yet, should we log attempt or not?')
          const resetDate = new Date(replayInfo.nextResetTime * 1000);
          client.send("QUEST_ERROR", { 
            message: `This quest can be replayed after ${resetDate.toLocaleString()}`,
            nextResetTime: replayInfo.nextResetTime 
          });
          return;
        }
      }
    }
    
    // For normal users (not admin-triggered), handle quest starting
    if (!isAdminTriggered) {
      if (!userQuestInfo && room.questDefinition.startTrigger === 'EXPLICIT') {
        console.log(`quest ${questId} is explicit, need to start it first`)
        return;
      }

      if(!userQuestInfo){
        console.log(`quest ${questId} is not started, starting it first time`)
        userQuestInfo = await handleStartQuest(room, client, { questId }, /*autoStart*/ true);
        if (!userQuestInfo) {
          // Create a basic entry if handleStartQuest fails
          console.log(`[QuestRoom] Creating basic quest progress for user ${client.userData.userId}`);
          userQuestInfo = {
            questId,
            questVersion: room.questDefinition.version,
            started: true,
            startTime: Math.floor(Date.now()/1000),
            elapsedTime: 0,
            completed: false,
            steps: []
          };
          profile.questsProgress.push(userQuestInfo);
        }
      }
    } else {
      // For admin-triggered requests, ensure the user has quest info
      if (!userQuestInfo) {
        console.log(`No quest info found for user ${client.userData.userId}, creating basic entry`);
        userQuestInfo = {
          questId,
          questVersion: room.questDefinition.version,
          completionCount: 0,
          attempts: [{
            attemptId: payload.attemptId || generateId(),
            attemptNumber: 1,
            startTime: Math.floor(Date.now()/1000),
            completionTime: 0,
            elapsedTime: 0,
            completed: false,
            started: true,
            steps: []
          }]
        };
        profile.questsProgress.push(userQuestInfo);
      }
    }
  
    // Ensure there's a steps array on userQuestInfo
    if (!userQuestInfo.steps) {
      userQuestInfo.steps = [];
    }
  
    // 7) Find the step definition in the quest
    const stepDef = room.questDefinition.steps.find((s) => s.stepId === stepId);
    if (!stepDef) {
      console.warn(`[QuestRoom] No step="${stepId}" found in quest definition. questId="${questId}"`);
      return;
    }
  
    // 8) Check prerequisites (skip for admin-triggered actions)
    if (!isAdminTriggered && !canUserWorkOnStep(userQuestInfo, stepDef)) {
      client.send("QUEST_ERROR", { message: "You haven't completed the prerequisites for this step." });
      return;
    }
    
    console.log('user can work on step')
  
    // 9) Find or create the user's step record
    let userStep = userQuestInfo.steps.find((s: any) => s.stepId === stepId);
    if (!userStep) {
      // create a new step record for the user
      userStep = {
        stepId,
        completed: false,
        tasks: stepDef.tasks.map((t) => ({
          taskId: t.taskId,
          count: 0
        }))
      };
      userQuestInfo.steps.push(userStep);
    }
  
    // 10) Find the task definition and userTask progress
    const taskDef = stepDef.tasks.find((t) => t.taskId === taskId);
    if (!taskDef) {
      console.warn(`[QuestRoom] No taskId="${taskId}" in step="${stepId}" definition. questId="${questId}"`);
      return;
    }
  
    // 11) Find the user's task progress
    let userTask = userStep.tasks.find((t: any) => t.taskId === taskId);
    if (!userTask) {
      console.warn(`[QuestRoom] No taskId="${taskId}" in step="${stepId}". Possibly old or mismatch?`);
      return;
    }
  
    // Only perform metaverse check for normal user actions
    if (!isAdminTriggered && taskDef.metaverse !== metaverse) {
      client.send("QUEST_ERROR", {
        message: `This task requires ${taskDef.metaverse} environment, but you reported ${metaverse}.`
      });
      return;
    }
  
    // Only check prerequisites for normal user actions
    if (!isAdminTriggered && taskDef.prerequisiteTaskIds.length > 0) {
      for (const prereqId of taskDef.prerequisiteTaskIds) {
        // find the user's progress for that prereq task
        const prereqDef = stepDef.tasks.find((t) => t.taskId === prereqId);
        if (!prereqDef) {
          // Edge case: maybe the definition is invalid or the ID doesn't exist
          client.send("QUEST_ERROR", {
            message: `Task "${taskId}" depends on unknown task "${prereqId}" in step "${stepDef.stepId}".`
          });
          return;
        }
        // find user's progress for that prereq
        const prereqUserTask = userStep.tasks.find((t: any) => t.taskId === prereqId);
        if (!prereqUserTask) {
          // means user hasn't even started that prereq
          client.send("QUEST_ERROR", {
            message: `You must complete task "${prereqId}" before doing "${taskId}".`
          });
          return;
        }
  
        // check if it's "complete", i.e. count >= requiredCount
        const requiredCount = prereqDef.requiredCount ?? 0;
        if (prereqUserTask.count < requiredCount) {
          // not yet done
          client.send("QUEST_ERROR", {
            message: `You must finish task "${prereqId}" (need ${requiredCount} count) before doing "${taskId}".`
          });
          return;
        }
      }
    }
  
    // Find current attempt data before checking task completion status
    let currentAttempt: QuestAttempt | undefined;
    // For admin-triggered actions, use the specified attemptId or latest attempt
    if (isAdminTriggered && payload.attemptId) {
      // If this is admin-triggered and has an attemptId, use that specific attempt
      if (userQuestInfo.attempts && Array.isArray(userQuestInfo.attempts)) {
        currentAttempt = userQuestInfo.attempts.find((a: any) => a.attemptId === payload.attemptId);
        if (!currentAttempt) {
          // If attempt not found but admin action, create it
          currentAttempt = {
            attemptId: payload.attemptId,
            attemptNumber: userQuestInfo.attempts.length + 1,
            startTime: Math.floor(Date.now()/1000),
            completionTime: 0,
            elapsedTime: 0,
            completed: false,
            started: true,
            status: 'in-progress',
            steps: []
          };
          userQuestInfo.attempts.push(currentAttempt);
        }
      }
    } else if (userQuestInfo.attempts && Array.isArray(userQuestInfo.attempts) && userQuestInfo.attempts.length > 0) {
      // Use the latest attempt for normal actions or if no specific attempt specified for admin
      currentAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];
    }
    
    // Initialize taskResult variable at the higher scope
    let taskResult;
    
    // If we have a current attempt, get the task from there instead
    let attemptUserStep = null;
    let attemptUserTask = null;
    
    if (currentAttempt && currentAttempt.steps) {
      // Find or create step in the attempt
      attemptUserStep = currentAttempt.steps.find((s: any) => s.stepId === stepId);
      if (!attemptUserStep) {
        // Create step in the attempt if it doesn't exist
        attemptUserStep = {
          stepId,
          completed: false,
          tasks: []
        };
        currentAttempt.steps.push(attemptUserStep);
      }
      
      // Find or create task in the attempt's step
      attemptUserTask = attemptUserStep.tasks?.find((t: any) => t.taskId === taskId);
      if (!attemptUserTask) {
        // Create the task in the attempt if it doesn't exist
        attemptUserTask = {
          taskId,
          count: 0,
          completed: false,
          requiredCount: taskDef.requiredCount || 1
        };
        attemptUserStep.tasks.push(attemptUserTask);
      }
      
      // Skip completion check for admin-triggered actions
      if (!isAdminTriggered && attemptUserTask.completed) {
        console.log('User already completed that task in current attempt');
        return;
      }
      
      // Store the old count from the attempt's task for comparison
      const oldCount = attemptUserTask.count || 0;
      
      // Use the shared task completion processing function
      taskResult = processTaskCompletion(room, questId, stepId, taskId, profile.ethAddress, userQuestInfo, isAdminTriggered);
      
      if (!taskResult.success) {
        console.warn(`[QuestRoom] Task completion processing failed: ${taskResult.error}`);
        return;
      }
      
      console.log(`[QuestRoom] user="${client.userData.userId}" processed task="${taskId}" in step="${stepId}", quest="${questId}" => now count=${attemptUserTask.count}`);
      
      console.log('current attempt', currentAttempt);
      
      // Send INCREMENT_TASK_RESULT to creator rooms to show natural task progress
      // After processTaskCompletion, the attempt's task count should be updated
      let updatedUserTask = currentAttempt.steps.find((s: any) => s.stepId === stepId)?.tasks?.find((t: any) => t.taskId === taskId);
      
      if (updatedUserTask && updatedUserTask.count > oldCount) {
        console.log(`[QuestRoom] Sending INCREMENT_TASK_RESULT for ${isAdminTriggered ? 'admin' : 'natural'} task progress: user=${client.userData.userId}, task=${taskId}, count=${updatedUserTask.count}`);
        
        // For admin-triggered actions, use the adminClient to send notifications
        const notificationClient = isAdminTriggered ? adminClient : null;
        
        // Notify creator rooms about task increment
        notifyCreatorRooms(room, "INCREMENT_TASK_RESULT", {
          questId,
          stepId,
          taskId,
          userId: client.userData.userId,
          userName: profile.name || client.userData.userId,
          taskDescription: taskDef.description,
          requiredCount: taskDef.requiredCount,
          newCount: updatedUserTask.count,
          success: true,
          taskCompleted: taskResult.taskComplete,
          stepCompleted: taskResult.stepComplete,
          questCompleted: taskResult.questComplete,
          attemptId: currentAttempt.attemptId,
          updatedUserData: {
            stepsCompleted: currentAttempt.steps.filter((s: any) => s.completed).length,
            tasksCompleted: currentAttempt.steps.reduce((count: number, step: any) => {
              return count + step.tasks.filter((t: any) => t.completed).length;
            }, 0),
            elapsedTime: currentAttempt.elapsedTime,
            completed: currentAttempt.completed,
            name: profile.name
          },
          updatedUserQuestInfo: userQuestInfo,
          adminTriggered: isAdminTriggered
        });
      }
    } else {
      // If no current attempt available, fall back to legacy behavior
      if (!isAdminTriggered && userTask.completed) {
        console.log('User already completed that task (legacy check)');
        return;
      }
      
      // Store the old count before updating for comparison
      const oldCount = userTask.count || 0;
      
      // Use the shared task completion processing function
      taskResult = processTaskCompletion(room, questId, stepId, taskId, profile.ethAddress, userQuestInfo, isAdminTriggered);
      
      if (!taskResult.success) {
        console.warn(`[QuestRoom] Task completion processing failed: ${taskResult.error}`);
        return;
      }
      
      console.log(`[QuestRoom] user="${client.userData.userId}" processed task="${taskId}" in step="${stepId}", quest="${questId}" => now count=${userTask.count}`);
    }
  
    // For normal (non-admin) user actions, send task progress notifications
    if (!isAdminTriggered) {
      // Send task progress notification if the task was incremented but not completed
      if (taskResult && !taskResult.taskComplete && ((currentAttempt && attemptUserTask && attemptUserTask.count > 0) || (!currentAttempt && userTask && userTask.count > 0)) && taskDef.requiredCount > 1) {
        client.send("TASK_PROGRESS", {
          questId,
          stepId,
          taskId,
          taskName: taskDef.description,
          count: userTask.count,
          requiredCount: taskDef.requiredCount,
          userQuestInfo: sanitizeUserQuestData(room, userQuestInfo)
        });
        
        // Notify creator rooms about task progress
        notifyCreatorRooms(room, "TASK_PROGRESS_BY_USER", {
          questId,
          stepId,
          taskId,
          taskName: taskDef.description,
          userId: client.userData.userId,
          userName: profile.name || client.userData.userId,
          count: userTask.count,
          requiredCount: taskDef.requiredCount
        });
      }
    
      // Send task completion notification if the task was completed
      if (taskResult.taskComplete) {
        client.send("TASK_COMPLETE", {
          questId, 
          stepId, 
          taskId, 
          taskName: taskResult.taskName, 
          userQuestInfo: sanitizeUserQuestData(room, userQuestInfo),
          reward: taskResult.rewardData
        });
        
        // Notify creator rooms
        notifyCreatorRooms(room, "TASK_COMPLETED_BY_USER", {
          questId,
          stepId,
          taskId,
          taskName: taskResult.taskName,
          userId: client.userData.userId,
          userName: profile.name || client.userData.userId,
          rewardGranted: taskResult.rewardData ? taskResult.rewardData.name : null
        });
      }
    
      // Send step completion notification if the step was completed
      if (taskResult.stepComplete && userStep.completed) {
        client.send("STEP_COMPLETE", { 
          questId, 
          stepId, 
          userQuestInfo: sanitizeUserQuestData(room, userQuestInfo) 
        });
        
        console.log(`[QuestRoom] user="${client.userData.userId}" completed step="${stepId}" in quest="${questId}".`);
        
        // Notify creator rooms
        notifyCreatorRooms(room, "STEP_COMPLETED_BY_USER", {
          questId,
          stepId,
          stepName: taskResult.stepName,
          userId: client.userData.userId,
          userName: profile.name || client.userData.userId
        });
      }
    
      // Send quest completion notification if the quest was completed
      if (taskResult.questComplete && userQuestInfo.completed) {
        room.broadcast("QUEST_COMPLETE", { 
          questId, 
          user: client.userData.userId, 
          userQuestInfo: sanitizeUserQuestData(room, userQuestInfo) 
        });
        
        console.log(`[QuestRoom] user="${client.userData.userId}" completed quest="${questId}" fully!`);
        
        // Notify creator rooms
        notifyCreatorRooms(room, "QUEST_COMPLETED_BY_USER", {
          questId,
          questTitle: room.questDefinition.title,
          userId: client.userData.userId,
          userName: profile.name || client.userData.userId,
          elapsedTime: userQuestInfo.elapsedTime
        });
      
        // === NEW: If it's a one-shot quest with max 1 completion, disable it for everyone ===
        if (room.questDefinition.completionMode === 'ONE_SHOT_GLOBAL') {
          console.log(`[QuestRoom] One-shot quest completed => disabling quest="${questId}"`);
          // 2) Mark quest as disabled so new attempts are blocked
          room.questDefinition.enabled = false;
    
          // === NEW: Now sync changes to the local cache ===
          syncQuestToCache(questId, room.questDefinition);
    
          forceEndQuestForAll(room, questId, room.questDefinition.version);
      
          // 3) Broadcast that the quest was disabled
          room.broadcast("QUEST_DISABLED", { questId, reason: "One-shot completed" });
        }
      }
    } else if (isAdminTriggered && adminClient) {
      // For admin-triggered actions, ensure the real user is notified if they're online
      for (const [roomId, roomInstance] of questRooms.entries()) {
        if (roomInstance.state.questId === questId) {
          // Found a room for this quest, now find the target user's client
          roomInstance.clients.forEach((c: Client) => {
            if (c.userData && c.userData.userId === client.userData.userId) {
              // Found the user, notify them of task progress
              if (currentAttempt && attemptUserTask) {
                c.send("TASK_COUNT_INCREMENTED", {
                  questId,
                  stepId,
                  taskId,
                  taskName: taskDef.description,
                  count: attemptUserTask.count,
                  requiredCount: taskDef.requiredCount,
                  userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                  forcedByAdmin: true
                });
                
                // Also send additional notifications if needed
                if (taskResult.taskComplete) {
                  c.send("TASK_COMPLETE", {
                    questId,
                    stepId,
                    taskId,
                    taskName: taskDef.description,
                    userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                    forcedByAdmin: true
                  });
                }
                
                if (taskResult.stepComplete) {
                  c.send("STEP_COMPLETE", {
                    questId,
                    stepId,
                    userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                    forcedByAdmin: true
                  });
                }
                
                if (taskResult.questComplete) {
                  c.send("QUEST_COMPLETE", {
                    questId,
                    userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                    forcedByAdmin: true
                  });
                }
              }
            }
          });
        }
      }
    }
  }
  
  
  /**************************************
   * canUserWorkOnStep
   * checks if all prerequisite steps are completed
   **************************************/
function canUserWorkOnStep(userQuestInfo: any, stepDef: StepDefinition): boolean {
    if (!stepDef.prerequisiteStepIds || stepDef.prerequisiteStepIds.length === 0) {
      return true; // no prereqs => branching step
    }
    // must have all required steps completed
    for (const prereqId of stepDef.prerequisiteStepIds) {
      const userSt = userQuestInfo.steps.find((s: any) => s.stepId === prereqId);
      if (!userSt || !userSt.completed) {
        return false;
      }
    }
    return true;
  }
  
/**************************************
 * handleStartQuest 
 * user tries to start a quest (explicit) or autoStart (FIRST_TASK).
 **************************************/
export async function handleStartQuest(room:QuestRoom, client: Client, payload: any, autoStart = false) {
  if (!room.questDefinition) return null;
  const { questId } = payload;

  if (questId !== room.questDefinition.questId) {
      client.send("QUEST_ERROR", { message: "Quest ID mismatch." });
      return null;
  }
  if (!room.questDefinition.enabled) {
      client.send("QUEST_ERROR", { message: "Quest is disabled or ended." });
      return null;
  }

  // If not autoStart but quest says FIRST_TASK, or vice versa, handle
  if (!autoStart && room.questDefinition.startTrigger === 'FIRST_TASK') {
      client.send("QUEST_ERROR", { message: "This quest auto-starts on first task; no explicit start needed." });
      return null;
  }
  if (autoStart && room.questDefinition.startTrigger !== 'FIRST_TASK') {
      // It's possible the user just forced a start, up to your logic
      // We'll allow it for demonstration
  }

  // time checks
  const now = Date.now();
  if (room.questDefinition.startTime && now < room.questDefinition.startTime) {
      client.send("QUEST_ERROR", { message: "Quest not active yet (startTime not reached)." });
      return null;
  }
  if (room.questDefinition.endTime && now >= room.questDefinition.endTime) {
      client.send("QUEST_ERROR", { message: "Quest already ended." });
      return null;
  }

  // get user profile
  const profiles = getCache(PROFILES_CACHE_KEY);
  const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
  if (!profile) return null;

  // find or create userQuestInfo
  let userQuestInfo = profile.questsProgress.find((q: any) =>
      q.questId === questId && q.questVersion === room.questDefinition!.version
  );

  // Check if this is a time-based quest that's completed but can be replayed
  if (userQuestInfo) {
    // Check if there are attempts and if latest attempt is completed
    const hasAttempts = userQuestInfo.attempts && Array.isArray(userQuestInfo.attempts) && userQuestInfo.attempts.length > 0;
    const latestAttempt = hasAttempts ? userQuestInfo.attempts[userQuestInfo.attempts.length - 1] : null;
    const isCompleted = latestAttempt ? latestAttempt.completed : userQuestInfo.completed;
    
    // Check if latest attempt is completed and quest has time window
    if (isCompleted && room.questDefinition.timeWindow) {
      const replayInfo = canReplayTimeBasedQuest(room.questDefinition, userQuestInfo);
      
      if (replayInfo.canReplay) {
        console.log(`Time-based quest ${questId} can be replayed by user ${client.userData.userId}`);
        
        // Create a new attempt for this quest
        const newAttempt = createNewQuestAttempt(room.questDefinition, profile, userQuestInfo);
        
        // Notify the user they're starting a new attempt
        if (!autoStart) {
          client.send("QUEST_NEW_ATTEMPT", { 
            questId, 
            attemptNumber: newAttempt.attemptNumber,
            message: "Starting a new quest attempt."
          });
        }
        
        // Notify creator rooms about new attempt
        notifyCreatorRooms(room, "QUEST_NEW_ATTEMPT_BY_USER", {
          questId,
          userId: client.userData.userId,
          userName: profile.name || client.userData.userId,
          attemptNumber: newAttempt.attemptNumber,
          attemptId: newAttempt.attemptId,
          startTime: newAttempt.startTime,
          timestamp: Date.now()
        });
      } 
      else if (replayInfo.nextResetTime) {
        // If can't replay yet, notify when they can try again
        const resetDate = new Date(replayInfo.nextResetTime * 1000);
        client.send("QUEST_ERROR", { 
          message: `This quest can be replayed after ${resetDate.toLocaleString()}`,
          nextResetTime: replayInfo.nextResetTime 
        });
        return null;
      }
    }
  }

  // If there's no quest info yet, create it
  if (!userQuestInfo) {
    userQuestInfo = {
      questId,
      questVersion: room.questDefinition.version,
      completionCount: 0,
      attempts: [{
        attemptId: generateId(),
        attemptNumber: 1,
        startTime: Math.floor(Date.now()/1000),
        completionTime: 0,
        elapsedTime: 0,
        completed: false,
        started: true,
        steps: []
      }]
    };
    
    // Add it to the user's quest progress
    profile.questsProgress.push(userQuestInfo);
    console.log(`[QuestRoom] user="${client.userData.userId}" started quest="${questId}", version=${room.questDefinition.version}`);
  } 
  // If there is a quest info but no attempts, create the first attempt
  else if (!userQuestInfo.attempts || userQuestInfo.attempts.length === 0) {
    userQuestInfo.attempts = [{
      attemptId: generateId(),
      attemptNumber: 1,
      startTime: Math.floor(Date.now()/1000),
      completionTime: 0,
      elapsedTime: 0,
      completed: false,
      started: true,
      steps: []
    }];
    
    console.log(`[QuestRoom] user="${client.userData.userId}" started first attempt at quest="${questId}"`);
  }
  // If there is a current attempt that isn't started yet, mark it as started
  else {
    const currentAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];
    if (!currentAttempt.started) {
      currentAttempt.started = true;
      currentAttempt.startTime = Math.floor(Date.now()/1000);
      console.log(`[QuestRoom] user="${client.userData.userId}" re-started quest="${questId}" attempt ${currentAttempt.attemptNumber}.`);
    }
  }
  
  if(!autoStart){
    client.send("QUEST_STARTED", { questId });
  }

  client.send("QUEST_DATA", {questId, userQuestInfo: sanitizeUserQuestData(room, userQuestInfo)});
  return userQuestInfo;
}
  
/**************************************
 * handleIterateQuest 
 * increments version (force-ends old version for all)
 **************************************/
// function handleIterateQuest(client: Client, payload: any) {
// if (!this.questDefinition) return;

// const { questId, enabled } = payload;
// if (questId !== this.questDefinition.questId) {
//     client.send("QUEST_ERROR", { message: "Quest ID mismatch." });
//     return;
// }
// if (client.userData.userId !== this.questDefinition.creator) {
//     client.send("QUEST_ERROR", { message: "Only the creator can iterate this quest." });
//     return;
// }

// //disable the quest before the iteration
// this.questDefinition.enabled = false
// syncQuestToCache(questId, this.questDefinition);

// // 1) end old version
// this.forceEndQuestForAll(questId, this.questDefinition.version);

// // 2) increment version in TEMPLATES_FILE_CACHE_KEY
// const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
// const idx = quests.findIndex((q: QuestDefinition) => q.questId === questId);
// if (idx < 0) {
//     client.send("QUEST_ERROR", { message: `Quest '${questId}' not found.` });
//     return;
// }
// quests[idx].version++;
// this.questDefinition.version = quests[idx].version;

// //enable or disable the quest after we have iterated it
// this.questDefinition.enabled = enabled
// syncQuestToCache(questId, this.questDefinition);

// // 3) broadcast
// this.broadcast("QUEST_VERSION_INCREMENTED", {
//     questId,
//     newVersion: this.questDefinition.version
// });
// console.log(`[QuestRoom] user="${client.userData.userId}" iterated quest="${questId}" to version=${this.questDefinition.version}`);
// }
    
export function handleForceCompleteTask(room:QuestRoom, client: Client, message: any) {
    const { questId, stepId, taskId, userId } = message;
    
    console.log(`[QuestRoom] handleForceCompleteTask: questId=${questId}, stepId=${stepId}, taskId=${taskId}, userId=${userId}`);
    
    const quests:QuestDefinition[] = getCache(QUEST_TEMPLATES_CACHE_KEY)
    const quest = quests.find((q: QuestDefinition) => q.questId === questId);
    if(!quest){
      console.log("Quest not found")
      client.send("QUEST_ERROR", { message: `Quest ${questId} not found` });
      return;
    }
    
    // 1. Check if the client is the creator of the quest
    if (client.userData.userId !== quest.creator) {
      console.log("Not the creator")
      client.send("QUEST_ERROR", { message: "Only the quest creator can force complete tasks" });
      return;
    }
    
    // 2. Get the step and task from the quest definition
    const stepDef = quest.steps.find(s => s.stepId === stepId);
    if (!stepDef) {
      console.log("Step not found")
      client.send("QUEST_ERROR", { message: `Step ${stepId} not found in quest` });
      return;
    }
    
    const taskDef = stepDef.tasks.find(t => t.taskId === taskId);
    if (!taskDef) { 
      console.log("Task not found")
      client.send("QUEST_ERROR", { message: `Task ${taskId} not found in step ${stepId}` });
      return;
    }
    
    // 3. Get the user profile
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === userId);
    
    if (!profile) {
      console.log("User not found")
      client.send("QUEST_ERROR", { message: `User ${userId} not found` });
      return;
    }
    
    // 4. Get the user's quest progress
    let userQuestInfo = profile.questsProgress?.find(
      (q: any) => q.questId === questId && q.questVersion === quest.version
    );
    
    if (!userQuestInfo) {
      client.send("QUEST_ERROR", { message: `User ${userId} has not started this quest` });
      return;
    }

    // Use the shared task completion processing function with forcedByAdmin=true
    // Pass the quest definition as the last parameter since we're in a creator room
    const taskResult = processTaskCompletion(room, questId, stepId, taskId, profile.ethAddress, userQuestInfo, true, quest);
    
    if (!taskResult.success) {
      console.warn(`[QuestRoom] Force task completion processing failed: ${taskResult.error}`);
      client.send("QUEST_ERROR", { message: taskResult.error });
      return;
    }
    
    // Notify the client of success
    client.send("FORCE_COMPLETE_SUCCESS", { 
      questId, 
      stepId, 
      taskId, 
      userId, 
      message: `Task ${taskId} has been force completed for user ${userId}`
    });
    
    // Find the target user's client in any QuestRoom instance and notify them
    for (const [roomId, roomInstance] of questRooms.entries()) {
      if (roomInstance.state.questId === questId) {
        // Found a room for this quest, now find the client
        roomInstance.clients.forEach((c: Client) => {
          if (c.userData && c.userData.userId === userId) {
            // Found the user, notify them
            console.log("NOTIFYING USER of force complete task", userId)
            
            // Send task completion notification
            c.send("TASK_COMPLETE", {
              questId, 
              stepId, 
              taskId, 
              taskName: taskResult.taskName,
              userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
              forcedByAdmin: true,
              reward: taskResult.rewardData
            });
            
            // If step was completed, notify of that too
            if (taskResult.stepComplete) {
              c.send("STEP_COMPLETE", { 
                questId, 
                stepId,
                userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                forcedByAdmin: true
              });
            }
            
            // If quest was completed, notify of that too
            if (taskResult.questComplete) {
              c.send("QUEST_COMPLETE", { 
                questId, 
                userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                forcedByAdmin: true
              });
            }
          }
        });
      }
    }
}

/**
 * Increments a task count by 1 for a specific user in a quest
 * Similar to force complete but only increases the count instead of marking it complete
 */
export function handleIncrementTaskCount(room: QuestRoom, client: Client, message: any) {
    const { questId, stepId, taskId, userId, attemptId, taskDescription } = message;
    
    console.log(`[QuestRoom] handleIncrementTaskCount: questId=${questId}, stepId=${stepId}, taskId=${taskId}, userId=${userId}`);
    
    const quests: QuestDefinition[] = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const quest = quests.find((q: QuestDefinition) => q.questId === questId);
    if (!quest) {
      console.log("Quest not found");
      client.send("QUEST_ERROR", { message: `Quest ${questId} not found` });
      return;
    }
    
    // 1. Check if the client is the creator of the quest
    if (client.userData.userId !== quest.creator) {
      console.log("Not the creator");
      client.send("QUEST_ERROR", { message: "Only the quest creator can increment task counts" });
      return;
    }
    
    // Create a mock client with the target user's data
    // This allows us to reuse the handleQuestAction function
    const mockClient = {
      userData: {
        userId: userId
      },
      send: (type: string, data: any) => {
        // Forward user notifications to the admin client if needed
        if (type === "QUEST_ERROR") {
          client.send(type, data);
        }
        // Other messages are ignored as we'll handle notifications separately
      }
    };
    
    // Create a message for handleQuestAction that includes the admin flag
    const actionMessage = {
      questId,
      stepId,
      taskId,
      metaverse: message.metaverse || 'DECENTRALAND', // Default to DECENTRALAND if not specified
      attemptId,
      adminTriggered: true,                           // Flag to indicate this was triggered by an admin
      adminClient: client                             // Pass the original admin client for notifications
    };
    
    // Call handleQuestAction with the mock client and message
    handleQuestAction(room, mockClient as Client, actionMessage)
      .then(() => {
        // Send confirmation to admin client
        client.send("INCREMENT_TASK_RESULT", {
          success: true,
          questId,
          stepId,
          taskId,
          userId,
          taskDescription: taskDescription,
          message: `Task count incremented for user ${userId}`
        });
      })
      .catch((error) => {
        console.error(`[QuestRoom] Error incrementing task:`, error);
        client.send("QUEST_ERROR", { 
          message: `Error incrementing task: ${error.message || "Unknown error"}` 
        });
      });
}
  
/**
 * Notifies all creator rooms about quest progress events
 * This allows quest creators to get real-time updates when their quests are being interacted with
 */
function notifyCreatorRooms(room:QuestRoom, messageType: string, data: any) {
    const { questId } = data;
    if (!questId) return;

    // Loop through all quest rooms to find creator rooms
    for (const [roomId, room] of questRooms.entries()) {
    // Skip if not a creator room
    if (room.state.questId !== "creator") continue;
    
    try {
        // Get the room's private questDefinition property using reflection
        // We need to access the questDefinition to check if the room's creator owns this quest
        const creatorQuests = getCache(QUEST_TEMPLATES_CACHE_KEY);
        const creatorClients:Client[] = Array.from(room.clients.values());
        
        // For each client in the creator room
        for (const creatorClient of creatorClients) {
        // Check if this client is the creator of the quest
        const isCreatorOfQuest = creatorQuests.some((quest: QuestDefinition) => 
            quest.questId === questId && quest.creator === creatorClient.userData.userId
        );
        
        // Only send the notification to the creator of the quest
        if (isCreatorOfQuest) {
            console.log(`Notifying creator ${creatorClient.userData.userId} about ${messageType} for quest ${questId}`);
            creatorClient.send(messageType, data);
        }
        }
    } catch (error) {
        console.error(`Error notifying creator room ${roomId}:`, error);
    }
    }
}

export function loadQuest(room:QuestRoom, questId: string) {
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const quest = quests.find((q: any) => q.questId === questId);
  if (!quest) {
    console.log('this quest id does not exist in the system to load', questId);
    return false;
  }

  room.state.questId = questId;
  
//   // Handle quest format conversion if needed
//   if (isLegacyQuest(quest)) {
//     room.questDefinition = convertLegacyQuest(quest);
//     console.log(`Converted legacy quest "${questId}" (${quest.questType}) to new format (${room.questDefinition.completionMode})`);
//   } else {
//     room.questDefinition = quest as QuestDefinition;
//     console.log(`Loaded quest "${questId}" in new format`);
//   }

  room.questDefinition = quest as QuestDefinition;
  
  return true;
}

/**
 * Test utility: Simulate advancing time for a quest to test reset functionality
 * This function allows developers to test time-based quest reset features
 * without waiting for actual time to pass
 */
export function handleSimulateTimeAdvance(room: QuestRoom, client: Client, message: any) {
  const { questId, userId, daysToAdvance = 1 } = message;
  
  console.log(`[QuestRoom] handleSimulateTimeAdvance: questId=${questId}, userId=${userId}, days=${daysToAdvance}`);
  
  // Validate quest
  if (!room.questDefinition) {
    client.send("QUEST_ERROR", { message: "Quest definition not found" });
    return;
  }
  
  // Only allow in test environments
  if (process.env.ENV !== 'Development') {
    client.send("QUEST_ERROR", { message: "Time simulation only available in development/test environments" });
    return;
  }
  
  // Find the user's profile
  const profiles = getCache(PROFILES_CACHE_KEY);
  const profile = profiles.find((p: any) => p.ethAddress === userId);
  
  if (!profile) {
    client.send("QUEST_ERROR", { message: `User ${userId} not found` });
    return;
  }
  
  // Get the user's quest progress
  let userQuestInfo = profile.questsProgress?.find(
    (q: any) => q.questId === questId && q.questVersion === room.questDefinition!.version
  );
  
  if (!userQuestInfo) {
    client.send("QUEST_ERROR", { message: `User ${userId} has not started this quest` });
    return;
  }

  // Initialize attempts array if it doesn't exist
  if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts) || userQuestInfo.attempts.length === 0) {
    client.send("QUEST_ERROR", { message: "No quest attempts found for this user" });
    return;
  }

  // Get the latest attempt
  const latestAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];
  
  // Only allow time advancement for completed quests with time windows
  if (!latestAttempt.completed || !room.questDefinition.timeWindow) {
    client.send("QUEST_ERROR", { 
      message: "Can only advance time for completed time-based quests" 
    });
    return;
  }
  
  // Simulate completed time being in the past
  const secondsInDay = 86400;
  const advanceSeconds = daysToAdvance * secondsInDay;
  
  // Update the completion timestamp to be in the past
  if (latestAttempt.completionTime) {
    latestAttempt.completionTime -= advanceSeconds;
    console.log(`[QuestRoom] Advanced time for quest ${questId}, user ${userId} by ${daysToAdvance} days`);
    
    // For backward compatibility, also update the root-level completedAt if it exists
    if (userQuestInfo.completedAt) {
      userQuestInfo.completedAt -= advanceSeconds;
    }
    
    // Check if the quest can now be replayed
    const replayInfo = canReplayTimeBasedQuest(room.questDefinition, userQuestInfo);
    
    // Send response with updated status
    client.send("TIME_ADVANCE_RESULT", {
      questId,
      userId,
      daysAdvanced: daysToAdvance,
      canReplay: replayInfo.canReplay,
      nextResetTime: replayInfo.nextResetTime,
      message: replayInfo.canReplay 
        ? "Time advanced successfully. Quest can now be replayed."
        : "Time advanced, but quest still cannot be replayed yet."
    });
    
    // If the quest should auto-reset, trigger that check now
    if (room.questDefinition.autoReset) {
      room.checkForAutoReset();
    }
  } else {
    client.send("QUEST_ERROR", { message: "Cannot advance time - quest completion timestamp not found" });
  }
}