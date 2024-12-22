import { Room, Client, ServerError } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { handleCancelReservation, handleConferenceCancel, handleConferenceImageUpdate, handleConferenceReserve, handleConferenceVideoUpdate, handleGetMainGallery, handleGetConference, handleGetLocations, handleGetReservation, handleGetStreams, handleReserve, handleReserveStream, validateAndCreateProfile, handleArtGalleryUpdate, handleMainGalleryCancel, handleMainGalleryReserve, handleGetLocationReservations, handleGetDeployments, handleGetShops } from "./MainRoomHandlers";
import { getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ADMINS_FILE_CACHE_KEY, ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, PROFILES_CACHE_KEY, PROFILES_FILE, STREAMS_FILE_CACHE_KEY } from "../utils/initializer";
import { createNPCs, NPC, updateNPCs } from "../utils/npc";
import { addPlayfabEvent } from "../utils/Playfab";
import { handleAddCustomItem, handleAddModel, handleCustomItemUpdate, handleDeleteCustomItem, handleGetCustomItems, handleGetNPCs, handleNPCTabSelection } from "./AdminRoomHandlers";

export class Player extends Schema {
  @type("string") userId:string;
  @type("string") name:string 
  client:Client
  startTime:any

  constructor(args:any, client:Client){
    super(args)
    this.client = client
    this.startTime = Math.floor(Date.now()/1000)
  }
}

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
    this.onMessage("get-npcs", (client, message) => handleGetNPCs(client));
    this.onMessage("npc-tab-selection", (client, message) => handleNPCTabSelection(client, message));
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
          EventName: 'Player_Joined',
          Body:{
            'room': 'Art_Gallery',
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
    console.log("MainRoom disposed!");
  }
}