import { Client } from "colyseus";
import { ephemeralCodes, QuestRoom } from "./QuestRoom";
import { QuestDefinition, StepDefinition, TaskDefinition, QuestAttempt } from "./utils/types";
import { QUEST_TEMPLATES_CACHE_KEY, PROFILES_CACHE_KEY, REWARDS_CACHE_KEY, VERSES_CACHE_KEY } from "../../utils/initializer";
import { getCache } from "../../utils/cache";
import { v4 } from "uuid";
import { sanitizeUserQuestData } from "./utils/functions";
import { TokenManager } from "../TokenManager";

export function handleQuestOutline(room:QuestRoom, client:Client, payload:any){
    console.log('handling quest outline', payload)

    const { questId, taskId, enabled } = payload;

    if(room.state.questId === "creator"){
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
    let quest:QuestDefinition = quests.find((q:QuestDefinition)=> q.questId === questId)
    if(!quest){
        console.log('no quest found in creator room to end or disable')
        return
    }

    if (client.userData.userId !== quest.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
    }

    // 2) generate a random code
    const code = v4().slice(0, 8); // e.g. 8-char code
    
    // 3) store in ephemeral map
    ephemeralCodes[code] = {
        questId,
        expires: Date.now() + 60 * 1000 // 60 seconds from now
    };

    client.send("QUEST_OUTLINE", quest)
    } else {
        // If not in creator room, this is a player request
        if (!room.questDefinition) {
            client.send("QUEST_ERROR", { message: "No quest loaded" });
            return;
        }
        
        if (questId !== room.questDefinition.questId) {
            client.send("QUEST_ERROR", { message: "Quest ID mismatch" });
            return;
        }
        
        // Find the user's profile
        const profiles = getCache(PROFILES_CACHE_KEY);
        const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
        if (!profile) {
            client.send("QUEST_ERROR", { message: "User profile not found" });
            return;
        }
        
        // Get user quest info
        const userQuestInfo = profile.questsProgress?.find(
            (q: any) => q.questId === questId && q.questVersion === room.questDefinition!.version
        );
        
        // Sanitize the user quest info using the same function from Handlers.ts
        const sanitizedUserQuestInfo = userQuestInfo 
            ? sanitizeUserQuestData(room, userQuestInfo) 
            : null;
            
        // Sanitize quest data to remove IDs
        const sanitizedQuest = {
            questId: room.questDefinition.questId,
            title: room.questDefinition.title,
            completionMode: room.questDefinition.completionMode,
            enabled: room.questDefinition.enabled,
            maxCompletions: room.questDefinition.maxCompletions,
            startTime: room.questDefinition.startTime,
            endTime: room.questDefinition.endTime,
            version: room.questDefinition.version,
            versionHistory: room.questDefinition.versionHistory || [],
            steps: room.questDefinition.steps.map((step: StepDefinition) => ({
                stepId: step.stepId,
                name: step.name,
                tasks: step.tasks.map((task: TaskDefinition) => ({
                    taskId: task.taskId,
                    description: task.description,
                    requiredCount: task.requiredCount,
                    metaverse: task.metaverse
                }))
            }))
        };
        
        // Send the quest and user info back to the client
        client.send("QUEST_OUTLINE", { 
            questId, 
            quest: sanitizedQuest, 
            userQuestInfo: sanitizedUserQuestInfo 
        });
    }
}
  
/**
 * handleQuestStats
 * Generates quest stats data similar to the API endpoint
 * and sends it back to the client
 */
export function handleQuestStats(room:QuestRoom, client: Client, payload: any) {
    console.log('handling quest stats', payload);
    
    const { questId, sortBy = 'elapsedTime', order = 'asc', limit = 100, completedOnly = false } = payload;
    
    if(room.state.questId === "creator") {
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const quest = quests.find((q: QuestDefinition) => q.questId === questId && q.creator === client.userData.userId);
    
    if(!quest) {
        console.log('no quest found in creator room for stats');
        client.send("QUEST_ERROR", { message: "Quest not found" });
        return;
    }
    
    // Generate stats data
    const profiles = getCache(PROFILES_CACHE_KEY);
    let userData: any[] = [];
    
    for (const profile of profiles) {
        if (!profile.questsProgress) continue;
        
        // find if the user has this quest
        const info = profile.questsProgress.find((q: any) => q.questId === questId);
        if (!info) continue;
        
        if (completedOnly && !info.completed) {
          continue;
        }
        
        // compute elapsedTime
        let elapsedTime = info.elapsedTime;
        
        // count how many steps completed
        let stepsCompleted = 0;
        let totalSteps = info.steps?.length || 0;
        if (info.steps) {
          for (const step of info.steps) {
            if (step.completed) stepsCompleted++;
          }
        }
        
        // Get the attempts data if available
        const attempts = info.attempts || [];
        
        // Get latest attempt information
        const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
        
        // Use latest attempt data if available
        if (latestAttempt) {
          // Override values with latest attempt if available
          elapsedTime = latestAttempt.elapsedTime || elapsedTime;
          
          // If latest attempt has its own steps, count them
          if (latestAttempt.steps) {
            stepsCompleted = 0;
            totalSteps = latestAttempt.steps.length;
            for (const step of latestAttempt.steps) {
              if (step.completed) stepsCompleted++;
            }
          }
        }
        
        userData.push({
          userId: profile.ethAddress,
          name: profile.name,
          completed: info.completed,
          startTime: info.startTime,
          timeCompleted: info.timeCompleted,
          elapsedTime,
          stepsCompleted,
          totalSteps,
          // Include attempts array for new attempt-based tracking
          attempts: attempts.map((attempt: any) => ({
            questVersion: attempt.questVersion,
            attemptId: attempt.attemptId,
            attemptNumber: attempt.attemptNumber,
            startTime: attempt.startTime,
            completionTime: attempt.completionTime,
            elapsedTime: attempt.elapsedTime,
            completed: attempt.completed,
            started: attempt.started,
            status: attempt.status,
            steps: attempt.steps?.map((step: any) => {
              // Find matching step in quest definition
              const stepDef = quest.steps.find((s: StepDefinition) => s.stepId === step.stepId);
              if (!stepDef) return null;
              
              return {
                stepId: step.stepId,
                name: stepDef.name,
                completed: step.completed,
                tasks: step.tasks?.map((task: any) => {
                  // Find matching task in step definition
                  const taskDef = stepDef.tasks.find((t: TaskDefinition) => t.taskId === task.taskId);
                  if (!taskDef) return null;
                  
                  return {
                    taskId: task.taskId,
                    description: taskDef.description,
                    count: task.count,
                    requiredCount: taskDef.requiredCount,
                    completed: task.completed,
                    metaverse: taskDef.metaverse
                  };
                }).filter(Boolean) // Remove any null entries
              };
            }).filter(Boolean) // Remove any null entries
          })),
          steps: info.steps?.map((step: any) => {
              // Find matching step in quest definition
              const stepDef = quest.steps.find((s: StepDefinition) => s.stepId === step.stepId);
              if (!stepDef) return null;
              
              return {
                name: stepDef.name,
                completed: step.completed,
                stepId: step.stepId,
                tasks: step.tasks?.map((task: any) => {
                    // Find matching task in step definition
                    const taskDef = stepDef.tasks.find((t: TaskDefinition) => t.taskId === task.taskId);
                    if (!taskDef) return null;
                    
                    return {
                      taskId: task.taskId,
                      description: taskDef.description,
                      count: task.count,
                      requiredCount: taskDef.requiredCount,
                      completed: task.completed,
                      metaverse: taskDef.metaverse
                    };
                }).filter(Boolean) // Remove any null entries
              };
          }).filter(Boolean) // Remove any null entries
        });
    }
    
    // Sort by the requested field
    userData.sort((a, b) => {
        if (order === 'asc') return a[sortBy] - b[sortBy];
        else return b[sortBy] - a[sortBy];
    });
    
    // Limit
    userData = userData.slice(0, limit);
    
    // Sanitize quest data to remove IDs
    const sanitizedQuest = {
        title: quest.title,
        completionMode: quest.completionMode,
        enabled: quest.enabled,
        maxCompletions: quest.maxCompletions,
        startTime: quest.startTime,
        endTime: quest.endTime,
        version: quest.version,
        versionHistory: quest.versionHistory || [],
        steps: quest.steps.map((step: StepDefinition) => ({
        name: step.name,
        stepId:step.stepId,
        tasks: step.tasks.map((task: TaskDefinition) => ({
            taskId: task.taskId,
            description: task.description,
            requiredCount: task.requiredCount,
            metaverse: task.metaverse
        }))
        }))
    };
    
    // Send sanitized stats to client
    client.send("QUEST_STATS", { questId, quest: sanitizedQuest, userData });
    return;
    } 
    else {
    if (!room.questDefinition) {
        client.send("QUEST_ERROR", { message: "No quest loaded" });
        return;
    }
    
    if (questId !== room.questDefinition.questId) {
        client.send("QUEST_ERROR", { message: "Quest ID mismatch" });
        return;
    }
    
    // Generate stats data - same as above but for loaded quest
    const profiles = getCache(PROFILES_CACHE_KEY);
    let userData: any[] = [];
    
    for (const profile of profiles) {
        if (!profile.questsProgress) continue;
        
        // find if the user has this quest
        const info = profile.questsProgress.find((q: any) => q.questId === questId);
        if (!info) continue;
        
        if (completedOnly && !info.completed) {
          continue;
        }
        
        // compute elapsedTime
        let elapsedTime = info.elapsedTime;
        
        // count how many steps completed
        let stepsCompleted = 0;
        let totalSteps = info.steps?.length || 0;
        if (info.steps) {
          for (const step of info.steps) {
            if (step.completed) stepsCompleted++;
          }
        }
        
        // Get the attempts data if available
        const attempts = info.attempts || [];
        
        // Get latest attempt information
        const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
        
        // Use latest attempt data if available
        if (latestAttempt) {
          // Override values with latest attempt if available
          elapsedTime = latestAttempt.elapsedTime || elapsedTime;
          
          // If latest attempt has its own steps, count them
          if (latestAttempt.steps) {
            stepsCompleted = 0;
            totalSteps = latestAttempt.steps.length;
            for (const step of latestAttempt.steps) {
              if (step.completed) stepsCompleted++;
            }
          }
        }
        
        userData.push({
          userId: profile.ethAddress,
          name: profile.name,
          completed: info.completed,
          startTime: info.startTime,
          timeCompleted: info.timeCompleted,
          elapsedTime,
          stepsCompleted,
          totalSteps,
          // Include attempts array for new attempt-based tracking
          attempts: attempts.map((attempt: QuestAttempt) => ({
            attemptId: attempt.attemptId,
            attemptNumber: attempt.attemptNumber,
            startTime: attempt.startTime,
            completionTime: attempt.completionTime,
            elapsedTime: attempt.elapsedTime,
            completed: attempt.completed,
            started: attempt.started,
            status: attempt.status,
            steps: attempt.steps?.map((step: any) => {
              // Find matching step in quest definition
              const stepDef = room.questDefinition!.steps.find((s: StepDefinition) => s.stepId === step.stepId);
              if (!stepDef) return null;
              
              return {
                stepId: step.stepId,
                name: stepDef.name,
                completed: step.completed,
                tasks: step.tasks?.map((task: any) => {
                  // Find matching task in step definition
                  const taskDef = stepDef.tasks.find((t: TaskDefinition) => t.taskId === task.taskId);
                  if (!taskDef) return null;
                  
                  return {
                    taskId: task.taskId,
                    description: taskDef.description,
                    count: task.count,
                    requiredCount: taskDef.requiredCount,
                    completed: task.completed,
                    metaverse: taskDef.metaverse
                  };
                }).filter(Boolean) // Remove any null entries
              };
            }).filter(Boolean) // Remove any null entries
          })),
          steps: info.steps?.map((step: any) => {
              // Find matching step in quest definition
              const stepDef = room.questDefinition!.steps.find((s: StepDefinition) => s.stepId === step.stepId);
              if (!stepDef) return null;
              
              return {
                name: stepDef.name,
                completed: step.completed,
                stepId: step.stepId,
                tasks: step.tasks?.map((task: any) => {
                    // Find matching task in step definition
                    const taskDef = stepDef.tasks.find((t: TaskDefinition) => t.taskId === task.taskId);
                    if (!taskDef) return null;
                    
                    return {
                      taskId: task.taskId,
                      description: taskDef.description,
                      count: task.count,
                      requiredCount: taskDef.requiredCount,
                      completed: task.completed,
                      metaverse: taskDef.metaverse
                    };
                }).filter(Boolean) // Remove any null entries
              };
          }).filter(Boolean) // Remove any null entries
        });
    }
    
    // Sort by the requested field
    userData.sort((a, b) => {
        if (order === 'asc') return a[sortBy] - b[sortBy];
        else return b[sortBy] - a[sortBy];
    });
    
    // Limit
    userData = userData.slice(0, limit);
    
    // Sanitize quest data to remove IDs
    const sanitizedQuest = {
        title: room.questDefinition.title,
        completionMode: room.questDefinition.completionMode,
        enabled: room.questDefinition.enabled,
        maxCompletions: room.questDefinition.maxCompletions,
        startTime: room.questDefinition.startTime,
        endTime: room.questDefinition.endTime,
        version: room.questDefinition.version,
        versionHistory: room.questDefinition.versionHistory || [],
        steps: room.questDefinition.steps.map((step: StepDefinition) => ({
        name: step.name,
        stepId: step.stepId,
        tasks: step.tasks.map((task: TaskDefinition) => ({
            taskId: task.taskId,
            description: task.description,
            requiredCount: task.requiredCount,
            metaverse: task.metaverse
        }))
        }))
    };
    
    // Send sanitized stats to client
    client.send("QUEST_STATS", { questId, quest: sanitizedQuest, userData });
    }
}

export function forceResetQuestData(room:QuestRoom, questId: string, forAll?:boolean, userId?:string) {
    if (!room.questDefinition) return;

    const profiles = getCache(PROFILES_CACHE_KEY);

    if(forAll){
        for(let i = 0; i < profiles.length; i++){
            let profile = profiles[i]
            if(!profile || !profile.hasOwnProperty("questsProgress")) continue;
    
    
        // 2) Find the quest record, if any
        const userQuestIndex = profile.questsProgress.findIndex((q: any) => q.questId === questId);
        if (userQuestIndex < 0) continue;

        profile.questsProgress.splice(userQuestIndex, 1)
        }
    }
    else{
        let profile = profiles.find((p:any)=> p.ethAddress === userId)
        if(!profile || !profile.hasOwnProperty("questsProgress")) return;


        // 2) Find the quest record, if any
        const userQuestIndex = profile.questsProgress.findIndex((q: any) => q.questId === questId);
        if (userQuestIndex < 0) return;

        profile.questsProgress.splice(userQuestIndex, 1)
    }
    console.log(`[QuestRoom] The quest data "${questId}" was forcibly reset by creator="${room.questDefinition.creator}" for all participants.`);
}

/**
 * Handle GET_CREATOR_DATA message - sent when returning to dashboard from marketplace
 * Returns all creator data without filtering
 */
export function handleGetCreatorData(client: Client, message: any) {
  console.log(`Handling GET_CREATOR_DATA message from ${client.userData.userId}`);
  
  // Get all necessary data
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const verses = getCache(VERSES_CACHE_KEY);
  const rewards = getCache(REWARDS_CACHE_KEY);
  const tokenManager = new TokenManager();
  const tokens = tokenManager.getAllTokens();
  
  // Send all data back to client - don't filter by creator
  client.send("QUEST_CREATOR", {
    quests: quests,
    verses: verses,
    rewards: rewards,
    tokens: tokens
  });
}