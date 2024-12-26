import { Room, Client, ServerError } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { getCache, } from "../utils/cache";
import { ADMINS_FILE_CACHE_KEY } from "../utils/initializer";
import { addPlayfabEvent } from "../utils/Playfab";
import { handleAddCustomItem, handleAddModel, handleCopyNPC, handleCustomItemCopy, handleCustomItemUpdate, handleDeleteCustomItem, handleGetCustomItems, handleGetNPCs, handleNPCTabSelection, handleNPCUpdate } from "./AdminRoomHandlers";
import { mainRooms } from ".";
import { Player } from "./MainRoom";

class MainState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

export class AdminRoom extends Room<MainState> {
  async onAuth(client: Client, options: { userId: string;  name: string }, req:any) {
    try {
        let admins = getCache(ADMINS_FILE_CACHE_KEY)
        let adminUser = admins.find((admin:any)=> admin.userId === options.userId)
        if(!adminUser){
            console.log('user not admin, do not continue to admin login')
            throw new Error("Not Admin")
        }

        if(this.state.players.size > 0){
          throw new Error("Admin already logged in")
        }
        client.auth = adminUser.level
        return true
    } catch (error:any) {
      console.error("Error during onAuth:", error.message);
      throw error;
    }
    }

  onCreate(options:any) {
    this.setState(new MainState());
    this.clock.start()

    this.onMessage("get-custom-items", (client:Client, message:any) => {handleGetCustomItems(client)})
    this.onMessage("add-custom-model", (client:Client, message:any) => {handleAddModel(client, message)})
    this.onMessage("add-custom-item", (client:Client, message:any) => {handleAddCustomItem(client, message)})
    this.onMessage("custom-item-update", (client, message) => handleCustomItemUpdate(client, message));
    this.onMessage("custom-item-delete", (client, message) => handleDeleteCustomItem(client, message));
    this.onMessage("custom-item-copy", (client, message) => handleCustomItemCopy(client, message));
    this.onMessage("get-npcs", (client, message) => handleGetNPCs(client));
    this.onMessage("npc-tab-selection", (client, message) => handleNPCTabSelection(client, message));
    this.onMessage("npc-update", (client, message) => handleNPCUpdate(client, message));
    this.onMessage("npc-copy", (client, message) => handleCopyNPC(client, message));
  }

  onJoin(client: Client, options:any) {
    console.log(`${client.sessionId} joined the MainRoom.`, options);
    try {
      client.userData = { ...client.userData, ...options };

      if(!this.state.players.has(options.userId)){
        let player = new Player(options, client)
        this.state.players.set(options.userId, player)
        console.log('setting client data', client.userData)

        addPlayfabEvent({
          EventName: 'Admin_Joined',
          Body:{
            'player':options.userId,
            'name':options.name,
            'ip': client.userData.ip
          }
        })
      }
    } catch (e) {
        console.log('on join error', e)
    }
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left the MainRoom.`);
    let player = this.state.players.get(client.userData.userId)
    this.state.players.delete(client.userData.userId)

    addPlayfabEvent({
      EventName: 'Admin_Leave',
      Body:{
        'player':client.userData.userId,
      }
    })
  }

  onDispose() {
    console.log("Admin Room disposed!");
    mainRooms.forEach((room:Room)=>{
        room.state.players.forEach((player:Player)=>{
            player.client.send('npc-toggle-selection', {selection:'npcs'})
        })
    })
  }
}