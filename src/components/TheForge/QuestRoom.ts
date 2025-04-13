import { Room, Client, ServerError, generateId } from "colyseus";
import { Schema, type, MapSchema } from '@colyseus/schema';
import { getCache, updateCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY, VERSES_CACHE_KEY } from "../../utils/initializer";
import { QuestDefinition, LegacyQuestDefinition, EphemeralCodeData, StepDefinition, CompletionMode } from "./utils/types";
import { getRandomString } from "../../utils/questing";
import { validateAndCreateProfile } from "../../rooms/MainRoomHandlers";
import { sanitizeUserQuestData } from "./utils/functions";  
import { addQuestRoom, removeQuestRoom } from "../../rooms";
import { loadQuest, handleStartQuest, handleQuestAction, handleForceCompleteTask } from "./Handlers";
import { handleCreateVerse, handleEditVerse, handleDeleteVerse } from "./VerseHandlers";
import { handleCreateReward, handleDeleteReward } from "./RewardHandlers";
import { handleQuestOutline, handleQuestStats } from "./DataHandlers";
import { handleCreateQuest, handleEditQuest, handleEndQuest, handleResetQuest } from "./QuestCreatorHandlers";
export const ephemeralCodes: Record<string, EphemeralCodeData> = {};

class QuestState extends Schema {
  @type('string') questId: string = '';
  @type('string') userId: string = '';
}

export class QuestRoom extends Room<QuestState> {
  questDefinition: QuestDefinition | null = null; // raw quest object

  async onAuth(client: Client, options: any, req: any) {
    try {
      console.log('options are', options);
      await validateAndCreateProfile(client, options, req);
      return client.auth;
    } catch (error: any) {
      console.error("Error during onAuth:", error.message);
      throw error;
    }
  }

  onCreate(options: any) {
    this.setState(new QuestState());
    console.log("QuestRoom created with filter questId. Options:", options);

    // The questId will be set in loadQuest anyway, but let's store it here for clarity
    this.state.questId = options.questId;
    addQuestRoom(this)

    if(options.questId !== "creator"){
      loadQuest(this, options.questId);
    }

    this.onMessage("QUEST_CREATE", (client: Client, message: any) =>
      handleCreateQuest(client, message)
    );
    this.onMessage("QUEST_RESET", (client: Client, message: any) =>
      handleResetQuest(this, client, message)
    );
    this.onMessage("QUEST_EDIT", (client: Client, message: any) =>
      handleEditQuest(client, message)
    );
    this.onMessage("QUEST_START", (client: Client, message: any) =>
      handleStartQuest(this, client, message)
    );
    this.onMessage("QUEST_ACTION", (client: Client, message: any) =>
      handleQuestAction(this, client, message)
    );
    this.onMessage("QUEST_REPLAY", (client: Client, message: any) =>
      handleQuestAction(this, client, message)
    );
    this.onMessage("QUEST_END", (client: Client, message: any) =>
      handleEndQuest(this, client, message)
    );

    this.onMessage("QUEST_OUTLINE", (client: Client, message: any) =>
      handleQuestOutline(this, client, message)
    );

    this.onMessage("QUEST_STATS", (client: Client, message: any) =>
      handleQuestStats(this, client, message)
    );

    this.onMessage("FORCE_COMPLETE_TASK", (client: Client, message: any) =>
      handleForceCompleteTask(this, client, message)
    );

    // Verse-related message handlers
    this.onMessage("VERSE_CREATE", (client: Client, message: any) =>
      handleCreateVerse(client, message)
    );
    this.onMessage("VERSE_EDIT", (client: Client, message: any) =>
      handleEditVerse(client, message)
    );
    this.onMessage("VERSE_DELETE", (client: Client, message: any) =>
      handleDeleteVerse(client, message)
    );

    this.onMessage("QUEST_CREATOR", handleCreateQuest.bind(this));
    this.onMessage("QUEST_DELETE", (client: Client, message: any) =>
      handleResetQuest(this, client, message)
    );
    this.onMessage("REWARD_CREATE", (client: Client, message: any) =>
      handleCreateReward(client, message)
    );
    this.onMessage("REWARD_DELETE", (client: Client, message: any) =>
      handleDeleteReward(client, message)
    );
  }

  onJoin(client: Client, options: any) {
    console.log(`Client joined, sessionId=${client.sessionId}, questId=${options.questId}`);

    if(options.questId === "creator"){
      let quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
      let verses = getCache(VERSES_CACHE_KEY)
      let rewards = getCache(REWARDS_CACHE_KEY)
      client.send("QUEST_CREATOR", {
        quests: quests.filter((q:any) => q.creator === client.userData.userId),
        verses: verses.filter((v:any) => v.creator === client.userData.userId),
        rewards: rewards.filter((r:any) => r.creator === client.userData.userId)
      })
      return
    }

    if(!this.questDefinition){
        if(!loadQuest(this, options.questId)){
          client.leave(4011)
          return;
        }
    }

    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    if (!profile) return;

    // console.log('profile is', profile)
    this.state.userId = client.userData.userId;
    this

    let userQuestInfo = profile.questsProgress.find(
      (q: any) =>
        q.questId === options.questId &&
        q.questVersion === this.questDefinition!.version
    );
    // if(userQuestInfo && userQuestInfo.started && !userQuestInfo.completed){
    //   userQuestInfo.startTime = Math.floor(Date.now()/1000)
    // }
    client.send("QUEST_CONNECTION", {connected:true, questId:options.questId})
    client.send("QUEST_DATA", {questId:options.questId, userQuestInfo: sanitizeUserQuestData(this, userQuestInfo)})
    // console.log(this.questDefinition)
  
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Client left: ${client.sessionId} (consented=${consented})`);
    // Clean up if needed

    // 5) Find the user's profile
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    if (!profile || !this.questDefinition) return;

    // 6) Get or create the user's quest progress record (for current version)
    let userQuestInfo = profile.questsProgress.find(
      (q: any) =>
        q.questId === this.state.questId &&
        q.questVersion === this.questDefinition.version
    );
    if (userQuestInfo && userQuestInfo.started && !userQuestInfo.completed) {
      userQuestInfo.elapsedTime += Math.floor(Date.now()/1000) - userQuestInfo.startTime
    }
  }

  onDispose() {
    removeQuestRoom(this)
  }
}