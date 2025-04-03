import { Client, Room } from "colyseus";
import { cacheSyncToFile, getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ADMINS_FILE_CACHE_KEY, ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CUSTOM_ITEMS_FILE_CACHE_KEY, LOCATIONS_CACHE_KEY, NPCS_FILE_CACHE_KEY, PROFILES_CACHE_KEY } from "../utils/initializer";
import { v4 } from "uuid";
import { addNPC, disableNPC, enableNPC, setNPCGrid, startWalkingNPC, stopWalkingNPC, updateNPC } from "../utils/npc";
import { artGalleryRooms } from "./";
import { ArtRoom } from "./ArtRoom";

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

// export const handleGetCustomItems = async (client: Client) => { 
//     console.log('getting custom items')
//     try {
//         await validateAdmin(client)
//         client.send('get-custom-items', getCache(CUSTOM_ITEMS_FILE_CACHE_KEY))
//     } catch (error) {
//       console.error("Error handling getting custom items:", error);
//       client.send("error", { message: "Internal server error. Please try again later." });
//     }
// };

export const handleAddModel = async (client: Client, model:any) => { 
    console.log('add model file')
    try {
        await validateAdmin(client) 

        let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)
        customItems.Models.push(model)
        client.send('add-custom-model', model)
    } catch (error) {
      console.error("Error handling add custom model:", error);
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

        artGalleryRooms.forEach((room:ArtRoom)=>{
            room.broadcast('custom-item-add', item)
            })

    } catch (error) {
      console.error("Error handling add custom item:", error);
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

        artGalleryRooms.forEach((room:Room)=>{
            room.broadcast('custom-item-update', message)
        })

    } catch (error) {
      console.error("Error handling custom item update:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
  };

export const handleDeleteCustomItem = async (client: Client, id:any) => { 
    console.log('delete custom item')
    try {
      await validateAdmin(client)

      let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)
      let itemIndex = customItems.Items.findIndex((item:any)=> item.id === id)
      console.log('item index to delete is', itemIndex)
      if(itemIndex >= 0){
        customItems.Items.splice(itemIndex, 1)
      }
      client.send('custom-item-delete', id)

      artGalleryRooms.forEach((room:Room)=>{
        room.broadcast('custom-item-delete', id)
    })
    } catch (error) {
      console.error("Error handling delete custom item:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleCustomItemCopy = async (client: Client, id:any) => { 
  console.log('handle npc update', id)
  try {
    await validateAdmin(client)
    let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)
    let customItem = customItems.Items.find((item:any)=> item.id === id)
    if(!customItem){
      console.log('no item found to copy')
      return
    }

    let newItem = {...customItem}
    newItem.id = v4()
    newItem.name += " C"
    customItems.Items.push(newItem)
    client.send('custom-item-copy', newItem)

    artGalleryRooms.forEach((artRoom:ArtRoom)=>{
      artRoom.broadcast('get-custom-items', [newItem])
    })

  } catch (error) {
    console.error("Error handling custom item copy:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleGetNPCs = async (client: Client) => { 
    console.log('getting npcs')
    try {
      await validateAdmin(client)
      client.send('get-npcs', getCache(NPCS_FILE_CACHE_KEY))
    } catch (error) {
      console.error("Error handling get npcs:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleNPCTabSelection = async (client: Client, selection:string) => { 
    console.log('handling npc tab selection', selection)
    try {
      await validateAdmin(client)

      artGalleryRooms.forEach((room:Room)=>{
        let player = room.state.players.get(client.userData.userId)
        if(!player){
            console.log('admin not in world, dont send message')
            return
        }

        let npcData = getCache(NPCS_FILE_CACHE_KEY)
        player.client.send('npc-toggle-selection', {selection, grid:selection === "grid" ? npcData.grid : undefined})
        })

    } catch (error) {
      console.error("Error handling npc tab selection:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export async function handleCopyNPC(client:Client, id:string){
  console.log('handle npc copy', id)
  try {
    await validateAdmin(client)
    let npcData = getCache(NPCS_FILE_CACHE_KEY)
    let npc = npcData.npcs.find((item:any)=> item.id === id)
    if(!npc){
      console.log('no item found to copy')
      return
    }

    let newNPC = {...npc}
    newNPC.id = v4()
    newNPC.n += " C"
    npcData.npcs.push(newNPC)

    client.send('npc-copy', newNPC)

    artGalleryRooms.forEach((artRoom:ArtRoom)=>{
      addNPC(artRoom, newNPC)
    })

  } catch (error) {
    console.error("Error handling npc copy:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
}

export const handleNPCUpdate = async (client: Client, message:any) => { 
    console.log('handle npc update', message)
    try {
      await validateAdmin(client)
      updateNPC(client, message)
    } catch (error) {
      console.error("Error handling npc update:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
};

export const handleGetCustomItems = async (client: Client) => { 
  console.log('getting custom items')
  try {
    // Validate input
    if (!client.userData || !client.userData.userId) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    let customItems = getCache(CUSTOM_ITEMS_FILE_CACHE_KEY)

    client.send('get-custom-items', customItems)
  } catch (error) {
    console.error("Error handling reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleAdminToggleNPCObstacleScene = async (client: Client, message:any) => { 
console.log('admin toggling npc obstacle in scene')
let {x,y} = message

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

  let npcData = getCache(NPCS_FILE_CACHE_KEY)
  let position = npcData.grid.find((position:any)=> position.x === x && position.y === y)
  if(!position){
    console.log('no npc obstacle position found')
    return
  }
  position.enabled = !position.enabled
  setNPCGrid(x,y, position.enabled)
  client.send('toggle-npc-grid', {x,y, enabled:position.enabled})
} catch (error) {
  console.error("Error handling reservation:", error);
  client.send("error", { message: "Internal server error. Please try again later." });
}
};