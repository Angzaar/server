import { Client, Room } from "colyseus";
import { cacheSyncToFile, getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ADMINS_FILE_CACHE_KEY, ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CUSTOM_ITEMS_FILE_CACHE_KEY, LOCATIONS_CACHE_KEY, NPCS_FILE_CACHE_KEY, PROFILES_CACHE_KEY } from "../utils/initializer";
import { v4 } from "uuid";
import { mainRooms } from ".";
import { addNPC, disableNPC, enableNPC, startWalkingNPC, stopWalkingNPC, updateNPC } from "../utils/npc";
import { MainRoom } from "./MainRoom";

export async function validateAdmin(client:Client){
    if(!client){
        console.log('no admin client')
        throw new Error("unauthorized")
    }

    if (!client.userData || !client.userData.userId) {
        throw new Error("unauthorized")
    }

    const admins = getCache(ADMINS_FILE_CACHE_KEY);
    let adminUser = admins.find((admin:any)=> admin.userId === client.userData.userId)
    if (!adminUser) {
      throw new Error("unauthorized")
    }
}

export const handleGetCustomItems = async (client: Client) => { 
    console.log('getting custom items')
    try {
        await validateAdmin(client)
        client.send('get-custom-items', getCache(CUSTOM_ITEMS_FILE_CACHE_KEY))
    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleAddModel = async (client: Client, model:any) => { 
    console.log('add model file')
    try {
        await validateAdmin(client) 

        let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)
        customItems.Models.push(model)
        client.send('add-custom-model', model)
    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleAddCustomItem = async (client: Client, info:any) => { 
    console.log('add custom item', info)
    let {itemData, transform } = info
    try {
        await validateAdmin(client)

        let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)

        let item:any={
            id:v4(),
            type:itemData.type,
            name:itemData.name,
            model:itemData.model,
            enabled:itemData.status === "Enabled" ? true : false,
            collection:"",
            transform:transform
        }
        customItems.Items.push(item)
        client.send('add-custom-item', item)

        mainRooms.forEach((room:Room)=>{
            room.broadcast('custom-item-add', item)
            })

    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleCustomItemUpdate = async (client: Client, message:any) => { 
    console.log('handle custom item update', message)
    try {
        await validateAdmin(client)

        let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)
        let item = customItems.Items.find((item:any)=> item.id === message.id)
        if(!item){
            console.log('no item found to edit')
            return
        }

        switch(message.action){
            case 'model':
                item.model = message.value
                break;

            case 'status':
                item.enabled = !item.enabled
                break;

            case 'transform':
                console.log('item transform is', item.transform)
                item.transform[message.field][message.axis] += (message.direction * message.modifier)
                console.log('item tranform now is', item.transform)
                break;
        }

        mainRooms.forEach((room:Room)=>{
            room.broadcast('custom-item-update', message)
        })

    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
  };

export const handleDeleteCustomItem = async (client: Client, id:any) => { 
    console.log('delete custom item')
    try {
      // Validate input
      if (!client.userData || !client.userData.userId) {
        client.send("error", { message: "Invalid message parameters" });
        return;
      }
  
      // Validate admin
      const admins = getCache(ADMINS_FILE_CACHE_KEY);
      let adminUser = admins.find((admin:any)=> admin.userId === client.userData.userId)
      if (!adminUser) {
        client.send("error", { message: "Admins not found. Please create a profile first." });
        return;
      }
      let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)
      let itemIndex = customItems.Items.findIndex((item:any)=> item.id === id)
      console.log('item index to delete is', itemIndex)
      if(itemIndex >= 0){
        customItems.Items.splice(itemIndex, 1)
      }
      client.send('custom-item-delete', id)

      mainRooms.forEach((room:Room)=>{
        room.broadcast('custom-item-delete', id)
    })
    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleGetNPCs = async (client: Client) => { 
    console.log('getting npcs')
    try {
      // Validate input
      if (!client.userData || !client.userData.userId) {
        client.send("error", { message: "Invalid message parameters" });
        return;
      }
  
      // Validate admin
      const admins = getCache(ADMINS_FILE_CACHE_KEY);
      let adminUser = admins.find((admin:any)=> admin.userId === client.userData.userId)
      if (!adminUser) {
        client.send("error", { message: "Admins not found. Please create a profile first." });
        return;
      }
      client.send('get-npcs', getCache(NPCS_FILE_CACHE_KEY))
    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleNPCTabSelection = async (client: Client, selection:string) => { 
    console.log('handling npc tab selection', selection)
    try {
      // Validate input
      if (!client.userData || !client.userData.userId) {
        client.send("error", { message: "Invalid message parameters" });
        return;
      }
  
      // Validate admin
      const admins = getCache(ADMINS_FILE_CACHE_KEY);
      let adminUser = admins.find((admin:any)=> admin.userId === client.userData.userId)
      if (!adminUser) {
        client.send("error", { message: "Admins not found. Please create a profile first." });
        return;
      }

      mainRooms.forEach((room:Room)=>{
        let player = room.state.players.get(client.userData.userId)
        if(!player){
            console.log('admin not in world, dont send message')
            return
        }

        let npcData = getCache(NPCS_FILE_CACHE_KEY)
        player.client.send('npc-toggle-selection', {selection, grid:selection === "grid" ? npcData.grid : undefined})
        })

    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleNPCUpdate = async (client: Client, message:any) => { 
    console.log('handle npc update', message)
    try {
      await validateAdmin(client)
      updateNPC(client, message)
    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
  };