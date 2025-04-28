import { Client } from "colyseus";
import { getCache, updateCache } from "../../utils/cache";
import { getRandomString } from "../../utils/questing";
import { CompletionMode, INFINITE, QuestDefinition, LegacyQuestDefinition } from "./utils/types";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY } from "../../utils/initializer";
import { forceResetQuestData } from "./DataHandlers";
import { syncQuestToCache } from "./utils/functions";
import { QuestRoom } from "./QuestRoom";
import { questRooms } from "./index";


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
    if (quest.completionMode !== 'FINITE') {
      quest.maxCompletions = typeof maxCompletions === 'number' ? maxCompletions : INFINITE;
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
 
    // Update quest in all active quest rooms with matching questId
    updateQuestRooms(questId, 'DEFINITION', { questDefinition: quest });
    
    console.log(`[QuestRoom] user="${client.userData.userId}" edited quest="${questId}"`);
}

/**
 * Unified function to update or broadcast to quest rooms with a specific questId
 * This replaces updateQuestInAllRooms, updateQuestVersionInAllRooms, and broadcastToQuestRooms
 * with a single flexible implementation
 * 
 * @param questId The ID of the quest to update
 * @param updateType The type of update to perform ('DEFINITION', 'VERSION', 'MESSAGE')
 * @param data The data to use for the update
 * @returns The number of rooms that were updated
 */
function updateQuestRooms(
  questId: string, 
  updateType: 'DEFINITION' | 'VERSION' | 'MESSAGE', 
  data: {
    questDefinition?: QuestDefinition,
    messageType?: string,
    messageData?: any,
    newVersion?: number,
    timestamp?: string,
    reason?: string
  }
) {
  let updatedRoomsCount = 0;

  for (const [roomId, room] of questRooms.entries()) {
    // Skip rooms that don't have this quest loaded
    if (!room.questDefinition || room.questDefinition.questId !== questId) {
      continue;
    }

    // Handle different update types
    switch (updateType) {
      case 'DEFINITION':
        // Update quest definition (for edit operations)
        if (data.questDefinition) {
          // Only update if versions differ
          // if (room.questDefinition.version !== data.questDefinition.version) {
            console.log(`[QuestRoom] Updating quest definition in room ${roomId} for quest ${questId}`);
            
            // Keep the same version to avoid disrupting current players
            const currentVersion = room.questDefinition.version;
            
            // Update the room's quest definition
            room.questDefinition = {...data.questDefinition, version: currentVersion};
            
            // Broadcast update to all clients in the room
            room.broadcast("QUEST_UPDATED", data.questDefinition);
          // }
        }
        break;
        
      case 'VERSION':
        // Broadcast version change (for reset/version increment operations)
        if (data.newVersion && data.timestamp) {
          console.log(`[QuestRoom] Updating quest version in room ${roomId} for quest ${questId} to version ${data.newVersion}`);
          
          // Broadcast version change to all clients in the room
          room.broadcast("QUEST_VERSION_INCREMENTED", {
            questId,
            newVersion: data.newVersion,
            reason: data.reason || "Version updated",
            timestamp: data.timestamp
          });
        }
        break;
        
      case 'MESSAGE':
        // Send a generic message to the room
        if (data.messageType && data.messageData) {
          console.log(`[QuestRoom] Broadcasting ${data.messageType} to room ${roomId} for quest ${questId}`);
          
          // Broadcast to all clients in the room
          room.broadcast(data.messageType, data.messageData);
        }
        break;
    }
    
    updatedRoomsCount++;
  }
  
  if (updatedRoomsCount > 0) {
    const actionText = updateType === 'DEFINITION' ? 'Updated quest definition in' : 
                      (updateType === 'VERSION' ? 'Updated quest version in' : 'Broadcast to');
    console.log(`[QuestRoom] ${actionText} ${updatedRoomsCount} active rooms for quest ${questId}`);
  }
  
  return updatedRoomsCount;
}

export function handleResetQuest(room: QuestRoom | null, client: Client, message: any) {
  // Make sure the user is the creator of the quest
  if (!client.userData || !client.userData.userId) {
    client.send("QUEST_ERROR", { message: "Not authenticated" });
    return;
  }

  const { questId } = message;
  
  // Get the quest templates
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const questIndex = quests.findIndex((q: QuestDefinition) => q.questId === questId);
  
  if (questIndex === -1) {
    client.send("QUEST_ERROR", { message: "Quest not found" });
    return;
  }
  
  // Check if the client is the creator of the quest
  if (quests[questIndex].creator !== client.userData.userId) {
    client.send("QUEST_ERROR", { message: "You are not authorized to reset this quest" });
    return;
  }
  
  try {
    // Increment the quest version
    const quest = quests[questIndex];
    const currentVersion = quest.version || 1;
    const newVersion = currentVersion + 1;
    
    console.log(`[QuestRoom] Quest "${questId}" resetting from version ${currentVersion} to ${newVersion}`);
    
    // Create version history entry
    const historyEntry = {
      version: newVersion,
      createdAt: new Date().toISOString(),
      reason: message.reason || "Manual reset by creator"
    };
    
    // Initialize or update version history
    if (!quest.versionHistory) {
      // If no history exists yet, create it with both versions
      quest.versionHistory = [
        {
          version: currentVersion,
          createdAt: new Date(Date.now() - 86400000).toISOString(), // Default to yesterday for initial version
          reason: "Initial version"
        },
        historyEntry
      ];
    } else {
      // Add the new version to existing history
      quest.versionHistory.push(historyEntry);
    }
    
    // Update quest version
    quest.version = newVersion;
    
    // Force reset quest data
    forceResetQuestData(questId, currentVersion, newVersion);
    
    // Save the updated quest to cache and file
    syncQuestToCache(questId, quest);
    
    // If we have a room reference, update its quest definition
    if (room && room.questDefinition && room.questDefinition.questId === questId) {
      room.questDefinition = quest;
      
      // Broadcast to all clients
      room.broadcast("QUEST_VERSION_INCREMENTED", {
        questId,
        newVersion,
        reason: message.reason || "Manual reset by creator",
        timestamp: historyEntry.createdAt
      });
    }
    
    // Update version in all quest rooms
    updateQuestRooms(questId, 'VERSION', {
      newVersion,
      timestamp: historyEntry.createdAt,
      reason: message.reason || "Manual reset by creator"
    });
    
    // Send success response to client
    client.send("QUEST_RESET_SUCCESS", {
      questId,
      newVersion,
      quest
    });
    
  } catch (error) {
    console.error("Error resetting quest:", error);
    client.send("QUEST_ERROR", { message: "Failed to reset quest" });
  }
}

export function handleEndQuest(room: QuestRoom | null, client: Client, payload: any) {
    console.log('handling quest end', payload)

    const { questId, taskId, enabled } = payload;

    if(room?.state.questId === "creator"){
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

    if (!room || !room.questDefinition) {
        console.log("Creator trying to cancel a quest with no definition")
        return
    }

    if (client.userData.userId !== room.questDefinition.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
    }

    room.questDefinition.enabled = enabled
    syncQuestToCache(questId, room.questDefinition)
    forceEndQuestForAll(room, questId, room.questDefinition.version);
    }

    client.send("QUEST_ENDED", { questId });

    // Broadcast to all quest rooms with this questId
    updateQuestRooms(questId, 'MESSAGE', {
      messageType: "QUEST_ENDED",
      messageData: {
        questId,
        status: "ended",
        endedAt: new Date().toISOString()
      }
    });

    return;
}

export function handleDeleteQuest(room: QuestRoom | null, client: Client, payload: any) {
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

    // Broadcast to all quest rooms with this questId
    updateQuestRooms(questId, 'MESSAGE', {
      messageType: "QUEST_DELETED",
      messageData: {
        questId,
        deletedAt: new Date().toISOString()
      }
    });

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