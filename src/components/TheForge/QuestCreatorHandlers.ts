import { Client } from "colyseus";
import { getCache } from "../../utils/cache";
import { getRandomString } from "../../utils/questing";
import { CompletionMode, INFINITE, QuestDefinition } from "./utils/types";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY } from "../../utils/initializer";
import { forceResetQuestData } from "./DataHandlers";
import { syncQuestToCache } from "./utils/functions";
import { QuestRoom } from "./QuestRoom";


/**
 * handleCreateQuest => create a brand new quest template in memory (and not yet saved to disk).
 * Using a random UUID for questId. This is optional - you could let the user pick an ID.
 */
export function handleCreateQuest(client: Client, payload: any) {
    const { 
      completionMode, 
      maxCompletions, 
      enabled, 
      steps, 
      title, 
      startTime, 
      endTime, 
      timeWindow, 
      autoReset 
    } = payload;
    
    if (!steps) {
      client.send("QUEST_ERROR", { message: "Missing required fields (steps)." });
      return;
    }

    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const questId = getRandomString(6)

    const existingQuest = quests.find((q: QuestDefinition) => q.questId === questId);
    if (existingQuest) {
      client.send("QUEST_ERROR", { message: `Quest '${questId}' already exists.` });
      return;
    }

    // For FINITE quests, always set maxCompletions to 1
    const finalMaxCompletions = completionMode === 'FINITE' ? 1 : maxCompletions;

    const newQuest: QuestDefinition = {
      questId,
      version: 1, 
      enabled: enabled,
      startTrigger: payload.startTrigger ?? 'EXPLICIT',
      title: title ?? "Untitled Quest",
      creator: client.userData.userId,
      steps: steps || [],
      startTime,
      endTime,
      completionMode,
      maxCompletions: finalMaxCompletions,
      // Add repeatable quest fields
      timeWindow,
      autoReset
    };

    quests.push(newQuest);
    client.send("QUEST_CREATED", newQuest);
    console.log(`[QuestRoom] user="${client.userData.userId}" created quest="${questId}" version=1`);
}

/**************************************
 * handleEditQuest 
 * partial updates: e.g. editing title, steps, times
 **************************************/
export function handleEditQuest(client: Client, payload: any) {
    console.log('handle queset edit', payload)
    const { 
      questId, 
      questType, 
      startTrigger, 
      title, 
      steps, 
      enabled, 
      allowReplay, 
      startTime, 
      endTime,
      completionMode,
      maxCompletions,
      timeWindow,
      autoReset,
      rewardIds
    } = payload;

    // 1) find in TEMPLATES_FILE_CACHE_KEY
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const quest = quests.find((q: QuestDefinition) => q.questId === questId);
    if (!quest) {
      client.send("QUEST_ERROR", { message: `Quest '${questId}' not found in cache.` });
      return;
    }

    // Only creator can edit
    if (client.userData.userId !== quest.creator) {
      client.send("QUEST_ERROR", { message: "Only the quest creator can edit this quest." });
      return;
    }

    console.log('applying quest partial changes')

    // 2) apply partial changes
    if (typeof title === 'string') {
      quest.title = title;
    }
    if (typeof questType === 'string') {
      quest.questType = questType;
    }
    if (typeof startTrigger === 'string') {
      quest.startTrigger = startTrigger;
    }
    if (Array.isArray(steps)) {
      quest.steps = steps;
    }
    if (typeof enabled === 'boolean') {
      quest.enabled = enabled;
    }
    if (typeof allowReplay === 'boolean') {
      quest.allowReplay = allowReplay;
    }
    
    // Add rewardIds handling
    if (Array.isArray(rewardIds)) {
      quest.rewardIds = rewardIds;
    }
    
    // Add completionMode handling
    if (typeof completionMode === 'string') {
      quest.completionMode = completionMode as CompletionMode;
      
      // If completionMode is FINITE, set maxCompletions to 1
      if (completionMode === 'FINITE') {
        quest.maxCompletions = 1;
      }
    }
    
    // Add maxCompletions handling (only for non-FINITE quests)
    if (typeof maxCompletions === 'number' && quest.completionMode !== 'FINITE') {
      quest.maxCompletions = maxCompletions;
    }
    
    // Add timeWindow handling
    if (payload.hasOwnProperty("timeWindow")) {
      quest.timeWindow = timeWindow;
    }
    
    // Add autoReset handling
    if (payload.hasOwnProperty("autoReset")) {
      quest.autoReset = autoReset;
    }

    if(payload.hasOwnProperty("startTime")){
      quest.startTime = startTime
    }else{
      delete quest.startTime 
    }

    if(payload.hasOwnProperty("endTime")){
      quest.endTime = payload.endTime
    }else{
      quest.endTime = endTime
    }

    // Save changes to both cache and file
    syncQuestToCache(questId, quest);

    // 3) confirm
    client.send("QUEST_EDITED", quest);
    console.log(`[QuestRoom] user="${client.userData.userId}" edited quest="${questId}"`);
}

export async function handleResetQuest(room:QuestRoom, client: Client, payload: any) {
    if (!room.questDefinition) return;

    const { questId, enabled, userId = null } = payload;

    if (client.userData.userId !== room.questDefinition.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can reset this quest." });
        return;
    }

    room.questDefinition.enabled = enabled
    syncQuestToCache(questId, room.questDefinition)

    await forceEndQuestForAll(room, questId, room.questDefinition.version)
    
    // If userId is specified and not "all", reset only for that user
    if (userId && userId !== "all") {
        forceResetQuestData(room, questId, false, userId);
        client.send("QUEST_RESET", { 
            questId, 
            userId,
            message: `Quest reset for user ${userId}`
        });
    } else {
        // Reset for all users
        forceResetQuestData(room, questId, true);
        client.send("QUEST_RESET", { 
            questId, 
            message: "Quest reset for all users"
        });
    }
    
    return;
}
 
export function handleEndQuest(room:QuestRoom, client: Client, payload: any) {
    console.log('handling quest end', payload)

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

    quest.enabled = enabled
    forceEndQuestForAll(room, questId, quest.version);
    }else{

    if (client.userData.userId !== room.questDefinition.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
    }

    if(!room.questDefinition){
        console.log("Creator trying to cancel a quest with no definition")
        return
    }
    room.questDefinition.enabled = enabled
    syncQuestToCache(questId, room.questDefinition)
    forceEndQuestForAll(room, questId, room.questDefinition.version);
    }

    client.send("QUEST_ENDED", { questId });
    return;
}

export function handleDeleteQuest(room:QuestRoom, client: Client, payload: any) {
    console.log("Handling quest delete:", payload);
    const { questId } = payload;

    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const quest = quests.find((q: QuestDefinition) => q.questId === questId);
    if (!quest) {
        client.send("QUEST_ERROR", { message: `Quest '${questId}' not found in cache.` });
        return; 
    }

    if (client.userData.userId !== quest.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can delete this quest." });
        return;
    }

    if (quest.enabled) {
        client.send("QUEST_ERROR", { message: "Cannot delete an active quest. Please disable the quest first before deleting." });
        return;
    }

    quests.splice(quests.indexOf(quest), 1);
    syncQuestToCache(questId, quest);

    client.send("QUEST_DELETE", { questId });
    return;
}

export function forceEndQuestForAll(room:QuestRoom, questId: string, version: number) {
    if (!room.questDefinition) return;

    const profiles = getCache(PROFILES_CACHE_KEY);
    for (const profile of profiles) {
    if (!profile.questsProgress) continue;
    // find quest record by questId + version
    const userQuestInfo = profile.questsProgress.find(
        (q: any) => q.questId === questId && q.questVersion === version
    );
    if (!userQuestInfo) continue;

    // if (!userQuestInfo.completed) {
    //     userQuestInfo.completed = true;
    // }
    }

    room.broadcast("QUEST_ENDED", { questId, endedBy: room.questDefinition.creator });
    console.log(`[QuestRoom] The quest "${questId}" was forcibly ended by creator="${room.questDefinition.creator}" for all participants.`);
}