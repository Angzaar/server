import { CompletionMode, INFINITE, QuestDefinition, TaskDefinition } from "./utils/types";
import { Client } from "colyseus";
import { ephemeralCodes, QuestRoom } from "./QuestRoom";
import { getCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY } from "../../utils/initializer";
import { StepDefinition } from "./utils/types";
import { questRooms } from "../../rooms";
import { isLegacyQuest, sanitizeUserQuestData, syncQuestToCache } from "./utils/functions";
import { forceEndQuestForAll } from "./QuestCreatorHandlers";


/**************************************
   * handleQuestAction 
   * increments a particular task in a step, checking prereqs
   **************************************/
export async function handleQuestAction(room:QuestRoom, client: Client, payload: any) {
    console.log('handle quest action', payload)
    // console.log(this.questDefinition)
  
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
  
    // 3) If the quest is disabled or ended, reject
    if (!room.questDefinition.enabled) {
      console.warn('Quest is disabled or ended.')
      client.send("QUEST_ERROR", { message: "Quest is disabled or ended." });
      return;
    }
  
    // 4) Optional time checks (startTime / endTime)
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
    if (!userQuestInfo) {
      // Possibly auto-start if FIRST_TASK or bail if the quest requires explicit start
      userQuestInfo = await handleStartQuest(room, client, { questId }, /*autoStart*/ true);
      if (!userQuestInfo) return;
    }
  
    if(userQuestInfo.completed && room.questDefinition.completionMode === 'FINITE' && room.questDefinition.maxCompletions === 1){
      client.send("QUEST_ERROR", { message: "Quest already completed." });
      return;
    }
  
    // 7) Find the step definition in the quest
    const stepDef = room.questDefinition.steps.find((s) => s.stepId === stepId);
    if (!stepDef) {
      console.warn(`[QuestRoom] No step="${stepId}" found in quest definition.`);
      return;
    }
  
    // 8) Check prerequisites
    if (!canUserWorkOnStep(userQuestInfo, stepDef)) {
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
      console.warn(`[QuestRoom] No taskId="${taskId}" in step="${stepId}" definition.`);
      return;
    }
  
    console.log('task exists')
  
  
    // 11) Find the user's task progress
    let userTask = userStep.tasks.find((t: any) => t.taskId === taskId);
    if (!userTask) {
      console.warn(`[QuestRoom] No taskId="${taskId}" in step="${stepId}". Possibly old or mismatch?`);
      return;
    }
  
    if (taskDef.metaverse !== metaverse) {
      client.send("QUEST_ERROR", {
        message: `This task requires ${taskDef.metaverse} environment, but you reported ${metaverse}.`
      });
      return;
    }
  
    console.log('task is in current metaverse, contiue')
  
    if (taskDef.prerequisiteTaskIds.length > 0) {
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
  
    if(userTask.completed){
      console.log('user already completed that task')
      return
    }
  
    console.log('user can complete task')
  
    // 12) Increment the count (count-only approach)
    userTask.count++;
    console.log(`[QuestRoom] user="${client.userData.userId}" incremented task="${taskId}" in step="${stepId}", quest="${questId}" => now count=${userTask.count}`);
  
  
    if(userTask.count >= taskDef.requiredCount){
      userTask.completed = true
      
      // Get reward information if task has a rewardId
      let rewardData = null;
      if (taskDef.rewardId) {
        const rewards = getCache(REWARDS_CACHE_KEY);
        const reward = rewards.find((r: any) => r.id === taskDef.rewardId);
        if (reward) {
          rewardData = {
            id: reward.id,
            name: reward.name,
            kind: reward.kind,
            description: reward.description,
            media: reward.media
          };
        }
      }
      
      client.send("TASK_COMPLETE", {
        questId, 
        stepId, 
        taskId, 
        taskName: taskDef.description, 
        userQuestInfo: sanitizeUserQuestData(room, userQuestInfo),
        reward: rewardData
      });
      
      // Notify creator rooms
      notifyCreatorRooms(room, "TASK_COMPLETED_BY_USER", {
        questId,
        stepId,
        taskId,
        taskName: taskDef.description,
        userId: client.userData.userId,
        userName: profile.name || client.userData.userId,
        rewardGranted: rewardData ? rewardData.name : null
      });
    }
  
    // 13) Check if this step is now completed
    //     A step is complete if all tasks in stepDef have userTask.count >= requiredCount
    const isStepDone = stepDef.tasks.every((defTask) => {
      const ut = userStep.tasks.find((u: any) => u.taskId === defTask.taskId);
      const reqCount = defTask.requiredCount ?? 0;
      // If user hasn't recorded the task or count < req => not done
      return ut && ((ut.count >= reqCount) || ut.completed === true);
    });
  
    if (isStepDone && !userStep.completed) {
      userStep.completed = true;
      // Optionally broadcast so front-end knows a step is done
      client.send("STEP_COMPLETE", { questId, stepId, userQuestInfo: sanitizeUserQuestData(room, userQuestInfo) });
      console.log(`[QuestRoom] user="${client.userData.userId}" completed step="${stepId}" in quest="${questId}".`);
      
      // Notify creator rooms
      notifyCreatorRooms(room, "STEP_COMPLETED_BY_USER", {
        questId,
        stepId,
        stepName: stepDef.name,
        userId: client.userData.userId,
        userName: profile.name || client.userData.userId
      });
    }
  
    // 13) Check if all steps are done => quest complete
    const allStepsDone = room.questDefinition.steps.every((defStep) => {
      const st = userQuestInfo.steps.find((u: any) => u.stepId === defStep.stepId);
      return st && st.completed;
    });
  
    if (allStepsDone && !userQuestInfo.completed) {
      userQuestInfo.completed = true;
      userQuestInfo.elapsedTime += Math.floor(Date.now()/1000) - userQuestInfo.startTime
      room.broadcast("QUEST_COMPLETE", { questId, user: client.userData.userId, userQuestInfo: sanitizeUserQuestData(room, userQuestInfo) });
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
if (!userQuestInfo) {
    userQuestInfo = {
    questId,
    questVersion: room.questDefinition.version,
    started: true,
    startTime:Math.floor(Date.now()/1000),
    elapsedTime:0,
    completed: false,
    steps: []
    };
    // If you want to pre-populate steps, you can do so here
    profile.questsProgress.push(userQuestInfo);
    console.log(`[QuestRoom] user="${client.userData.userId}" started quest="${questId}", version=${room.questDefinition.version}`);
} else {
    if (!userQuestInfo.started) {
    userQuestInfo.started = true;
    console.log(`[QuestRoom] user="${client.userData.userId}" re-started quest="${questId}" (already had a record).`);
    }
}
if(!autoStart){
    client.send("QUEST_STARTED", { questId });
}

client.send("QUEST_DATA", {questId, userQuestInfo: sanitizeUserQuestData(room, userQuestInfo)})
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
    
    // 5. Get or create the step progress
    let userStep = userQuestInfo.steps.find((s: any) => s.stepId === stepId);
    if (!userStep) {
    userStep = {
        stepId,
        completed: false,
        tasks: stepDef.tasks.map((t) => ({
        taskId: t.taskId,
        count: 0,
        completed: t.taskId === taskId // Mark only the forced task as completed
        }))
    };
    userQuestInfo.steps.push(userStep);
    }
    
    // 6. Get or create the task progress
    let userTask = userStep.tasks.find((t: any) => t.taskId === taskId);
    if (!userTask) {
    userTask = {
        taskId,
        count: taskDef.requiredCount || 1,
        completed: true
    };
    userStep.tasks.push(userTask);
    } else {
    // Update the task to be completed
    userTask.count = taskDef.requiredCount || 1;
    userTask.completed = true;
    }
    
    // 7. Check if the step is now completed
    const isStepDone = stepDef.tasks.every((defTask) => {
    const ut = userStep.tasks.find((u: any) => u.taskId === defTask.taskId);
    const reqCount = defTask.requiredCount ?? 0;
    return ut && ((ut.count >= reqCount) || ut.completed === true);
    });
    
    if (isStepDone && !userStep.completed) {
    userStep.completed = true;
    }
    
    // 8. Check if the quest is now completed
    const allStepsDone = quest.steps.every((defStep) => {
    const st = userQuestInfo.steps.find((u: any) => u.stepId === defStep.stepId);
    return st && st.completed;
    });
    
    if (allStepsDone && !userQuestInfo.completed) {
    userQuestInfo.completed = true;
    userQuestInfo.elapsedTime += Math.floor(Date.now()/1000) - userQuestInfo.startTime;
    }
    
    // 13. Notify the client of success
    client.send("FORCE_COMPLETE_SUCCESS", { 
    questId, 
    stepId, 
    taskId, 
    userId, 
    message: `Task ${taskId} has been force completed for user ${userId}`
    });
    
    // 14. Find the target user's client in any QuestRoom instance and notify them

    for (const [roomId, roomInstance] of questRooms.entries()) {
    if (roomInstance.state.questId === questId) {
        // Found a room for this quest, now find the client
        roomInstance.clients.forEach((c: Client) => {
        if (c.userData && c.userData.userId === userId) {
            // Found the user, notify them
            console.log("NOTIFYING USER of force complete task", userId)
            
            // Get reward information if task has a rewardId
            let rewardData = null;
            if (taskDef.rewardId) {
            const rewards = getCache(REWARDS_CACHE_KEY);
            const reward = rewards.find((r: any) => r.id === taskDef.rewardId);
            if (reward) {
                rewardData = {
                id: reward.id,
                name: reward.name,
                kind: reward.kind,
                description: reward.description,
                media: reward.media
                };
            }
            }
            
            c.send("TASK_COMPLETE", {
            questId, 
            stepId, 
            taskId, 
            taskName: taskDef.description,
            userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
            forcedByAdmin: true,
            reward: rewardData
            });
            
            // If step was completed, notify of that too
            if (isStepDone) {
            c.send("STEP_COMPLETE", { 
                questId, 
                stepId,
                userQuestInfo: sanitizeUserQuestData(roomInstance, userQuestInfo),
                forcedByAdmin: true
            });
            }
            
            // If quest was completed, notify of that too
            if (allStepsDone) {
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
    console.log('this quest id does not exist in the system');
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