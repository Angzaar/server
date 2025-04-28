import { Client } from "colyseus";
import { QuestDefinition, StepDefinition, TaskDefinition, QuestAttempt } from "./utils/types";
import { QUEST_TEMPLATES_CACHE_KEY, PROFILES_CACHE_KEY, PROFILES_FILE, REWARDS_CACHE_KEY, VERSES_CACHE_KEY } from "../../utils/initializer";
import { getCache, updateCache } from "../../utils/cache";
import { v4 } from "uuid";
import { sanitizeWebAppQuestData } from "./utils/functions";
import { TokenManager } from "../TokenManager";
import { WebAppRoom } from "../WebApp/WebAppRoom";

export function handleQuestOutline(room: WebAppRoom | null, client: Client, payload: any) {
    console.log('handling quest outline', payload);

    const { questId, taskId, enabled } = payload;

    // Only handle web app room case
    // if (room?.roomId === "webapp") {
        const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
        let quest: QuestDefinition = quests.find((q: QuestDefinition) => q.questId === questId);
        
        if (!quest) {
            console.log('no quest found in web app room');
            client.send("QUEST_ERROR", { message: "Quest not found" });
            return;
        }
        
        // Find the user's profile
        const profiles = getCache(PROFILES_CACHE_KEY);
        const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
        
        // Get user quest info if profile exists
        const userQuestInfo = profile?.questsProgress?.find(
            (q: any) => q.questId === questId && q.questVersion === quest.version
        );
        
        // Sanitize the user quest info if it exists
        const sanitizedUserQuestInfo = userQuestInfo 
            ? sanitizeWebAppQuestData(quest, userQuestInfo) 
            : null;
        
        // Get token manager to fetch token details
        const tokenManager = new TokenManager();
        
        // Fetch and add reward data for the client side
        const rewards = getCache(REWARDS_CACHE_KEY);
        let questRewards: any[] = [];
        
        // Function to process and enhance a reward with token information if needed
        const processReward = (rewardId: string) => {
            const reward = rewards.find((r: any) => r.id === rewardId);
            if (!reward) return;
            
            // Make a copy of the reward to enhance
            const enhancedReward:any = {
              name: reward.name,
              description: reward.description,
              kind: reward.kind,
              amount: reward.amount,
            }
            
            // If this is a creator token, fetch additional token details
            if (reward.kind === 'CREATOR_TOKEN' || reward.type === 'CREATOR_TOKEN') {
                // Check if the reward has a tokenId or itemId
                const tokenId = reward.creatorToken?.tokenId;
                if (tokenId) {
                    const tokenDetails = tokenManager.getTokenById(tokenId);
                    if (tokenDetails) {
                        enhancedReward.amount = reward.creatorToken?.amount;
                        enhancedReward.tokenSymbol = tokenDetails.symbol;
                        enhancedReward.tokenName = tokenDetails.name;
                        // Check if decimals exists before assigning
                        if ('decimals' in tokenDetails) {
                            enhancedReward.tokenDecimals = tokenDetails.decimals;
                        }
                    }
                }
            }
            
            // Add to rewards array if not already present
            if (!questRewards.some(r => r.id === enhancedReward.id)) {
                questRewards.push(enhancedReward);
            }
        };
        
        // Add quest-level rewards
        if (quest.rewardIds && Array.isArray(quest.rewardIds)) {
            quest.rewardIds.forEach(rewardId => processReward(rewardId));
        } else if (quest.rewardId) {
            // Legacy support for single rewardId
            processReward(quest.rewardId);
        }
        
        // Add step rewards
        if (quest.steps && Array.isArray(quest.steps)) {
            quest.steps.forEach(step => {
                if (step.rewardIds && Array.isArray(step.rewardIds)) {
                    step.rewardIds.forEach(rewardId => processReward(rewardId));
                } else if (step.rewardId) {
                    processReward(step.rewardId);
                }
                
                // Add task rewards
                if (step.tasks && Array.isArray(step.tasks)) {
                    step.tasks.forEach(task => {
                        if (task.rewardIds && Array.isArray(task.rewardIds)) {
                            task.rewardIds.forEach(rewardId => processReward(rewardId));
                        } else if (task.rewardId) {
                            processReward(task.rewardId);
                        }
                    });
                }
            });
        }
        
        // Create a modified quest object with rewards for the client
        const questWithRewards = {
            ...quest,
            rewards: questRewards
        };
        
        // Send the quest and user info back to the client
        client.send("QUEST_OUTLINE", { 
            questId, 
            quest: questWithRewards, 
            userQuestInfo: sanitizedUserQuestInfo 
        });
    // } else {
    //     client.send("QUEST_ERROR", { message: "Invalid room type for this operation" });
    // }
}
  
/**
 * handleQuestStats
 * Generates quest stats data similar to the API endpoint
 * and sends it back to the client
 */
export function handleQuestStats(room: WebAppRoom | null, client: Client, payload: any) {
    console.log('handling quest stats', payload);
    
    const { questId, sortBy = 'elapsedTime', order = 'asc', limit = 100, completedOnly = false } = payload;
    
    // Only handle web app room case
    // if (room?.roomId === "webapp") {
        const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
        const quest = quests.find((q: QuestDefinition) => q.questId === questId);
        
        if (!quest) {
            console.log('no quest found in web app room for stats');
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
        
        // For web app, send the complete quest data
        client.send("QUEST_STATS", { questId, quest, userData });
    // } else {
    //     client.send("QUEST_ERROR", { message: "Invalid room type for this operation" });
    // }
}

/**
 * Force reset quest data for all users or a specific user
 * This version gets called from handleResetQuest when room is not available
 */
export function forceResetQuestData(questId: string, oldVersion: number, newVersion: number) {
    console.log(`[forceResetQuestData] Resetting quest=${questId} from version=${oldVersion} to version=${newVersion}`);
    
    // Get all profiles
    const profiles = getCache(PROFILES_CACHE_KEY);
    let updateNeeded = false;
    
    // Process each profile
    for (const profile of profiles) {
        if (!profile.questsProgress || !Array.isArray(profile.questsProgress)) {
            continue;
        }
        
        // Find existing quest progress
        const questProgressIndex = profile.questsProgress.findIndex(
            (q: any) => q.questId === questId && q.questVersion === oldVersion
        );
        
        if (questProgressIndex >= 0) {
            // This user has progress for this quest, mark it as obsolete
            profile.questsProgress[questProgressIndex].questVersion = oldVersion;
            profile.questsProgress[questProgressIndex].obsolete = true;
            
            // Optionally create a fresh entry for the new version
            profile.questsProgress.push({
                questId: questId,
                questVersion: newVersion,
                attempts: [],
                obsolete: false,
                created: Math.floor(Date.now()/1000)
            });
            
            updateNeeded = true;
        }
    }
    
    // Save changes if needed
    if (updateNeeded) {
        updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
        console.log(`[forceResetQuestData] Updated profiles cache for quest=${questId}`);
    }
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