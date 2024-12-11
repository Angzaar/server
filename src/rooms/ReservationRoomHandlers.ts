import { Client } from "colyseus";
import { cacheSyncToFile, getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, LOCATIONS_CACHE_KEY, PROFILES_CACHE_KEY } from "../utils/initializer";
import { ArtRoom, Gallery, Reservation } from "./ArtRoom";
import { start } from "repl";

export const handleGetReservations = async (room:ArtRoom, client: Client) => { 
    try {
      // Validate input
      if (!client.userData || !client.userData.userId) {
        client.send("error", { message: "Invalid message parameters" });
        return;
      }
  
      // Validate profile
      const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
      if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
        client.send("error", { message: "Profile not found. Please create a profile first." });
        return;
      }

      client.send('get-reservations', getCache(LOCATIONS_CACHE_KEY))
    } catch (error) {
      console.error("Error handling reservation:", error);
      client.send("error", { message: "Internal server error. Please try again later." });
    }
  };

export const handleMoveGalleryElevator = async (room:ArtRoom, client: Client, message: { id:string, action: string }) => {
  const { id, action } = message;

  let gallery = room.state.galleries.find((gallery)=> gallery.id === id)
  if(!gallery || !gallery.elevator){
    console.log('no gallery or elevator found')
    return
  }

  if(gallery.elevator.enabled && gallery.elevator.y === 0.3){
    console.log('can move elevator off ground')
    gallery.elevator.moveInterval = setInterval(()=>{
      if(gallery.elevator.y < 7.5){
        gallery.elevator.y += .01
      }else{
        clearInterval(gallery.elevator.moveInterval)
        gallery.elevator.y = 7.5
        gallery.elevator.moveTimer = setTimeout(()=>{
          clearTimeout(gallery.elevator.moveTimer)
          gallery.elevator.moveInterval = setInterval(()=>{
            if(gallery.elevator.y > 0.3){
              gallery.elevator.y -= .01
            }else{
              clearInterval(gallery.elevator.moveInterval)
              gallery.elevator.y = 0.3
            }  
          }, 10)
        }, 2000)
      }
    }, 10)
  }
}