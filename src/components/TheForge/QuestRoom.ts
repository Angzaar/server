import { Room, Client, ServerError, generateId } from "colyseus";
import { Schema, type, MapSchema } from '@colyseus/schema';
import { getCache, updateCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY, VERSES_CACHE_KEY } from "../../utils/initializer";
import { QuestDefinition, LegacyQuestDefinition, EphemeralCodeData, StepDefinition, CompletionMode, QuestAttempt } from "./utils/types";
import { getRandomString } from "../../utils/questing";
import { validateAndCreateProfile } from "../../rooms/MainRoomHandlers";
import { sanitizeUserQuestData, createNewQuestAttempt, canReplayTimeBasedQuest } from "./utils/functions";  
import { addQuestRoom, removeQuestRoom } from "../../rooms";
import { loadQuest, handleStartQuest, handleQuestAction, handleForceCompleteTask, handleSimulateTimeAdvance, handleIncrementTaskCount } from "./Handlers";
import { handleCreateVerse, handleEditVerse, handleDeleteVerse } from "./VerseHandlers";
import { handleCreateReward, handleDeleteReward } from "./RewardHandlers";
import { handleQuestOutline, handleQuestStats } from "./DataHandlers";
import { handleCreateQuest, handleEditQuest, handleEndQuest, handleResetQuest, handleDeleteQuest } from "./QuestCreatorHandlers";
import { handleCreateToken, handleTokenDetails, handleListTokens, handleUpdateTokenSupply } from "./TokenHandlers";
import { TokenManager } from "../TokenManager";

export const ephemeralCodes: Record<string, EphemeralCodeData> = {};

class QuestState extends Schema {
  @type('string') questId: string = '';
  @type('string') userId: string = '';
}

export class QuestRoom extends Room<QuestState> {
  questDefinition: QuestDefinition | null = null; // raw quest object
  autoResetInterval: NodeJS.Timeout | null = null;

  async onAuth(client: Client, options: any, req: any) {
    try {
      let ip = req.headers['x-forwarded-for'] || req.socket.address().address;
      console.log('quest room options are', options, ip);
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
      
      // Set up auto-reset check every hour (for time-based quests)
      if (this.questDefinition && 
          this.questDefinition.timeWindow && 
          this.questDefinition.autoReset) {
        this.setupAutoResetCheck();
      }
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
    this.onMessage("QUEST_DELETE", (client: Client, message: any) =>
      handleDeleteQuest(this, client, message)
    );
    this.onMessage("QUEST_START", (client: Client, message: any) =>
      handleStartQuest(this, client, message)
    );
    this.onMessage("QUEST_ACTION", (client: Client, message: any) =>
      handleQuestAction(this, client, message)
    );
    this.onMessage("QUEST_REPLAY", (client: Client, message: any) => {
      // Add forceReplay flag to message
      message.forceReplay = true;
      handleQuestAction(this, client, message)
    });
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
    
    this.onMessage("INCREMENT_TASK_COUNT", (client: Client, message: any) =>
      handleIncrementTaskCount(this, client, message)
    );

    // Add the time simulation handler for testing purposes
    this.onMessage("SIMULATE_TIME_ADVANCE", (client: Client, message: any) =>
      handleSimulateTimeAdvance(this, client, message)
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
    this.onMessage("REWARD_CREATE", (client: Client, message: any) =>
      handleCreateReward(client, message)
    );
    this.onMessage("REWARD_DELETE", (client: Client, message: any) =>
      handleDeleteReward(client, message)
    );

    // Register token message handlers
    this.onMessage("TOKEN_CREATE", (client: Client, message: any) =>
      handleCreateToken(client, message)
    );
    this.onMessage("TOKEN_DETAILS", (client: Client, message: any) =>
      handleTokenDetails(client, message)
    );
    this.onMessage("TOKEN_LIST", (client: Client, message: any) =>
      handleListTokens(client, message)
    );
    this.onMessage("TOKEN_UPDATE_SUPPLY", (client: Client, message: any) =>
      handleUpdateTokenSupply(client, message)
    );
  }

  /**
   * Sets up a periodic check for time-based quests that need auto-reset
   */
  setupAutoResetCheck() {
    // Check every hour for quests that need reset
    this.autoResetInterval = setInterval(() => {
      this.checkForAutoReset();
    }, 60 * 60 * 1000); // 1 hour interval
  }

  /**
   * Checks if time-based quests need to be auto-reset and processes them
   */
  checkForAutoReset() {
    if (!this.questDefinition || 
        !this.questDefinition.timeWindow || 
        !this.questDefinition.autoReset) {
      return;
    }

    console.log(`[QuestRoom] Checking auto-reset for quest "${this.questDefinition.questId}"`);
    
    const profiles = getCache(PROFILES_CACHE_KEY);
    const now = Math.floor(Date.now() / 1000);
    
    // Get all users who have progress in this quest
    for (const profile of profiles) {
      // Check if profile has questsProgress array
      if (!profile.questsProgress || !Array.isArray(profile.questsProgress)) {
        continue; // Skip this profile if questsProgress doesn't exist or isn't an array
      }
      
      // Find this quest in user progress
      const userQuestInfoIndex = profile.questsProgress.findIndex(
        (q: any) => q.questId === this.questDefinition!.questId && 
                   q.questVersion === this.questDefinition!.version
      );
      
      if (userQuestInfoIndex >= 0) {
        const userQuestInfo = profile.questsProgress[userQuestInfoIndex];
        
        // Initialize attempts array if it doesn't exist
        if (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts)) {
          userQuestInfo.attempts = [];
          
          // If there's existing quest progress, migrate it to the first attempt
          if (userQuestInfo.completed || userQuestInfo.started) {
            const initialAttempt: QuestAttempt = {
              attemptId: generateId(),
              startTime: userQuestInfo.startTime || 0,
              completionTime: userQuestInfo.completionTime || 0,
              elapsedTime: userQuestInfo.elapsedTime || 0,
              completed: userQuestInfo.completed || false,
              started: userQuestInfo.started || false,
              steps: Array.isArray(userQuestInfo.steps) ? userQuestInfo.steps : [],
              attemptNumber: 1,
              status: userQuestInfo.completed ? 'completed' : 'in-progress'
            };
            
            userQuestInfo.attempts.push(initialAttempt);
            
            // Remove deprecated fields after migration
            delete userQuestInfo.startTime;
            delete userQuestInfo.completionTime;
            delete userQuestInfo.elapsedTime;
            delete userQuestInfo.completed;
            delete userQuestInfo.started;
            delete userQuestInfo.steps;
          }
        }
        
        // Get the latest attempt
        const latestAttempt = userQuestInfo.attempts.length > 0 
          ? userQuestInfo.attempts[userQuestInfo.attempts.length - 1] 
          : null;
        
        // Handle in-progress attempts that need to be expired
        if (latestAttempt && !latestAttempt.completed && latestAttempt.started) {
          // Check if the time window has passed
          const replayInfo = canReplayTimeBasedQuest(this.questDefinition, userQuestInfo);
          
          if (replayInfo.canReplay) {
            console.log(`[QuestRoom] Expiring in-progress quest attempt for "${this.questDefinition.questId}" for user ${profile.ethAddress}`);
            
            // Mark the attempt as expired
            latestAttempt.status = 'expired';
            
            // Calculate elapsed time up to now
            latestAttempt.elapsedTime += (now - latestAttempt.startTime);
            
            // Notify the user if they're connected
            this.clients.forEach((client: Client) => {
              if (client.userData && client.userData.userId === profile.ethAddress) {
                client.send("QUEST_ATTEMPT_EXPIRED", { 
                  questId: this.questDefinition!.questId,
                  message: `Your in-progress attempt for "${this.questDefinition!.title}" has expired due to time window passing.`,
                  userQuestInfo: sanitizeUserQuestData(this, userQuestInfo)
                });
              }
            });
          }
        }
      }
    }
    
    // Save the updated profiles back to cache
    updateCache(PROFILES_CACHE_KEY, PROFILES_CACHE_KEY, profiles);
  }

  onJoin(client: Client, options: any) {
    console.log(`Quest Room ${this.state.questId} Client joined, userId=${options.userId}`);

    if(options.questId === "creator"){
      let quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
      let verses = getCache(VERSES_CACHE_KEY)
      let rewards = getCache(REWARDS_CACHE_KEY)
      const tokenManager = new TokenManager();
      const tokens = tokenManager.getTokensByCreator(client.userData.userId);
      
      client.send("QUEST_CREATOR", {
        quests: quests.filter((q:any) => q.creator === client.userData.userId),
        verses: verses.filter((v:any) => v.creator === client.userData.userId),
        rewards: rewards.filter((r:any) => r.creator === client.userData.userId),
        tokens: tokens
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

    // Initialize attempts array if necessary
    if (userQuestInfo && (!userQuestInfo.attempts || !Array.isArray(userQuestInfo.attempts))) {
      userQuestInfo.attempts = [];
      
      // If there's existing quest progress, migrate it to the first attempt
      if (userQuestInfo.completed || userQuestInfo.started) {
        const initialAttempt: QuestAttempt = {
          attemptId: generateId(),
          startTime: userQuestInfo.startTime || 0,
          completionTime: userQuestInfo.completionTime || 0,
          elapsedTime: userQuestInfo.elapsedTime || 0,
          completed: userQuestInfo.completed || false,
          started: userQuestInfo.started || false,
          steps: Array.isArray(userQuestInfo.steps) ? userQuestInfo.steps : [],
          attemptNumber: 1,
          status: userQuestInfo.completed ? 'completed' : 'in-progress'
        };
        
        userQuestInfo.attempts.push(initialAttempt);
        
        // Remove deprecated fields after migration
        delete userQuestInfo.startTime;
        delete userQuestInfo.completionTime;
        delete userQuestInfo.elapsedTime;
        delete userQuestInfo.completed;
        delete userQuestInfo.started;
        delete userQuestInfo.steps;
      }
    }

    // Update current attempt's startTime if it's started but not completed
    if (userQuestInfo && userQuestInfo.attempts && userQuestInfo.attempts.length > 0) {
      const currentAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];
      if (currentAttempt.started && !currentAttempt.completed) {
        currentAttempt.startTime = Math.floor(Date.now()/1000);
      }
    }

    client.send("QUEST_CONNECTION", {connected:true, questId:options.questId})
    client.send("QUEST_DATA", {questId:options.questId, userQuestInfo: sanitizeUserQuestData(this, userQuestInfo)})
    // console.log(this.questDefinition)
  
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Quest Room ${this.state.questId} Client left: ${client.userData.userId} (consented=${consented})`);
    // Clean up if needed

    // Find the user's profile
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    if (!profile || !this.questDefinition) return;

    // Get the user's quest progress record
    let userQuestInfo = profile.questsProgress.find(
      (q: any) =>
        q.questId === this.state.questId &&
        q.questVersion === this.questDefinition.version
    );
    
    // Update elapsed time for current attempt if it's in progress
    if (userQuestInfo && userQuestInfo.attempts && userQuestInfo.attempts.length > 0) {
      const currentAttempt = userQuestInfo.attempts[userQuestInfo.attempts.length - 1];
      if (currentAttempt.started && !currentAttempt.completed) {
        currentAttempt.elapsedTime += (Math.floor(Date.now()/1000) - currentAttempt.startTime);
      }
    }
  }

  onDispose() {
    // Clear the auto-reset interval if it exists
    if (this.autoResetInterval) {
      clearInterval(this.autoResetInterval);
      this.autoResetInterval = null;
    }
    
    removeQuestRoom(this)
  }
}