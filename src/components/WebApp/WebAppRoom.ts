import { Room, Client, generateId } from "colyseus";
import { Schema, type, MapSchema } from '@colyseus/schema';
import { getCache, updateCache } from "../../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY, VERSES_CACHE_KEY } from "../../utils/initializer";
import { TokenManager } from "../TokenManager";
import { validateAndCreateProfile } from "../../rooms/MainRoomHandlers";
import { handleMarketplacePurchase } from "../TheForge/MarketplaceHandler";
import { handleInventoryRequest, handleCreateToken, handleTokenDetails, handleListTokens, handleUpdateTokenSupply } from "../TheForge/TokenHandlers";
import { handleCreateVerse, handleEditVerse, handleDeleteVerse } from "../TheForge/VerseHandlers";
import { handleCreateReward, handleDeleteReward, handleEditReward } from "../TheForge/RewardHandlers";
import { handleQuestOutline, handleQuestStats } from "../TheForge/DataHandlers";
import { handleCreateQuest, handleEditQuest, handleEndQuest, handleResetQuest, handleDeleteQuest } from "../TheForge/QuestCreatorHandlers";
import { handleForceCompleteTask, handleIncrementTaskCount } from "../TheForge/Handlers";
import { setWebAppRoom, removeWebAppRoom } from "../TheForge/index";
// State object for the WebAppRoom
class WebAppState extends Schema {
  @type('string') roomId: string = 'webapp';
  @type('number') connectedClients: number = 0;
}

export class WebAppRoom extends Room<WebAppState> {
  tokenManager: TokenManager = new TokenManager();
  
  async onAuth(client: Client, options: any, req: any) {
    try {
      let ip = req.headers['x-forwarded-for'] || req.socket.address().address;
      console.log('WebApp room auth:', options, ip);
      await validateAndCreateProfile(client, options, req);
      return client.auth;
    } catch (error: any) {
      console.error("Error during WebAppRoom onAuth:", error.message);
      throw error;
    }
  }

  onCreate(options: any) {
    this.setState(new WebAppState());
    console.log("WebAppRoom created. This room handles global web app functionality.");
    setWebAppRoom(this)
    // Creator dashboard data handlers
    this.onMessage("GET_CREATOR_DATA", (client: Client, message: any) => {
      // this.handleGetCreatorData(client, message);
      this.sendInitialData(client);
    });
    
    // Quest creator handlers
    this.onMessage("QUEST_CREATE", (client: Client, message: any) =>
      handleCreateQuest(client, message)
    );
    this.onMessage("QUEST_RESET", (client: Client, message: any) =>
      handleResetQuest(null, client, message)
    );
    this.onMessage("QUEST_EDIT", (client: Client, message: any) =>
      handleEditQuest(client, message)
    );
    this.onMessage("QUEST_DELETE", (client: Client, message: any) =>
      handleDeleteQuest(null, client, message)
    );
    this.onMessage("QUEST_END", (client: Client, message: any) =>
      handleEndQuest(null, client, message)
    );
    
    // Quest data handlers
    this.onMessage("QUEST_OUTLINE", (client: Client, message: any) =>
      handleQuestOutline(null, client, message)
    );
    this.onMessage("QUEST_STATS", (client: Client, message: any) =>
      handleQuestStats(null, client, message)
    );
    
    // Add task management handlers
    this.onMessage("FORCE_COMPLETE_TASK", (client: Client, message: any) =>
      handleForceCompleteTask(null, client, message)
    );
    
    this.onMessage("INCREMENT_TASK_COUNT", (client: Client, message: any) =>
      handleIncrementTaskCount(null, client, message)
    );
    
    // Verse handlers
    this.onMessage("VERSE_CREATE", (client: Client, message: any) =>
      handleCreateVerse(client, message)
    );
    this.onMessage("VERSE_EDIT", (client: Client, message: any) =>
      handleEditVerse(client, message)
    );
    this.onMessage("VERSE_DELETE", (client: Client, message: any) =>
      handleDeleteVerse(client, message)
    );
    
    // Reward handlers
    this.onMessage("QUEST_CREATOR", handleCreateQuest);
    this.onMessage("REWARD_CREATE", (client: Client, message: any) =>
      handleCreateReward(client, message)
    );
    this.onMessage("REWARD_EDIT", (client: Client, message: any) =>
      handleEditReward(client, message)
    );
    this.onMessage("REWARD_DELETE", (client: Client, message: any) =>
      handleDeleteReward(client, message)
    );
    
    // Token handlers
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
    
    // Inventory handler
    this.onMessage("INVENTORY_REQUEST", (client: Client, message: any) =>
      handleInventoryRequest(client, message)
      // this.sendInventoryData(client)
    );
    
    // Marketplace handler
    this.onMessage("MARKETPLACE_PURCHASE", (client: Client, message: any) =>
      handleMarketplacePurchase(client, message, this)
    );
  }

  onJoin(client: Client, options: any) {
    console.log(`WebApp Room: Client joined, userId=${client.userData?.userId}`);
    this.state.connectedClients++;
    
    // Send initial data to client
    this.sendInitialData(client);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`WebApp Room: Client left: ${client.userData?.userId} (consented=${consented})`);
    this.state.connectedClients--;
  }

  onDispose() {
    console.log("WebApp Room disposed");
    removeWebAppRoom()
  }

  // Helper to broadcast inventory changes to all connected clients
  broadcastInventoryChange(itemId: string, newQuantity: any) {
    this.broadcast("INVENTORY_CHANGE_BROADCAST", {
      itemId: itemId,
      newQuantity: newQuantity,
      timestamp: Date.now()
    });
  }

  // Method to send the initial data to a client when they join
  private sendInitialData(client: Client) {
    if (!client.userData?.userId) return;
    
    // Get creator data (if applicable)
    let quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    let verses = getCache(VERSES_CACHE_KEY);
    let rewards = getCache(REWARDS_CACHE_KEY);
    const tokens = this.tokenManager.getTokensByCreator(client.userData.userId);
    
    // Send creator data
    // client.send("WEBAPP_CONNECTED", {
    //   connected: true,
    //   userId: client.userData.userId
    // });
    
    // Send marketplace data if user is a creator
    if (tokens.length > 0 || 
        quests.some((q: any) => q.creator === client.userData.userId) ||
        verses.some((v: any) => v.creator === client.userData.userId) ||
        rewards.some((r: any) => r.creator === client.userData.userId)) {
      
      client.send("QUEST_CREATOR", {
        quests: quests.filter((q: any) => q.creator === client.userData.userId),
        verses: verses.filter((v: any) => v.creator === client.userData.userId || v.public === true),
        rewards: rewards.filter((r: any) => r.creator === client.userData.userId),
        tokens: tokens
      });
    }
    
    // Send inventory data
    this.sendInventoryData(client);
  }
  
  // Method to send inventory data to a specific client
  private sendInventoryData(client: Client) {
    if (!client.userData?.userId) return;
    
    // Get the user's inventory/token balances
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    
    if (profile) {
      // Get tokens and token balances from the profile
      const tokens = profile.tokens || [];
      
      // Enrich token data if needed
      const enrichedTokens = tokens.map((token: any) => {
        if (token.token && token.token.kind === 'CREATOR_TOKEN') {
          const fullTokenData = this.tokenManager.getTokenById(token.id);
          if (fullTokenData) {
            return {
              ...token,
              token: {
                ...fullTokenData,
                kind: 'CREATOR_TOKEN'
              }
            };
          }
        }
        return token;
      });
      
      // Send inventory update
      client.send("INVENTORY_UPDATE", { 
        inventory: enrichedTokens 
      });
    }
  }
  
  // Handler for GET_CREATOR_DATA
  private handleGetCreatorData(client: Client, message: any) {
    console.log("Handling GET_CREATOR_DATA request for userId:", client.userData.userId);
    
    // Get all needed data for the dashboard
    let quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    let verses = getCache(VERSES_CACHE_KEY);
    let rewards = getCache(REWARDS_CACHE_KEY);
    const tokens = this.tokenManager.getTokensByCreator(client.userData.userId);
  
    // Filter data for the current user
    client.send("QUEST_CREATOR", {
      quests: quests.filter((q: any) => q.creator === client.userData.userId),
      verses: verses.filter((v: any) => v.creator === client.userData.userId || v.public === true),
      rewards: rewards.filter((r: any) => r.creator === client.userData.userId),
      tokens: tokens
    });
  }
} 