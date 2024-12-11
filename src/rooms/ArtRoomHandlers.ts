import { Client } from "colyseus";
import { cacheSyncToFile, getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, LOCATIONS_CACHE_KEY, PROFILES_CACHE_KEY } from "../utils/initializer";
import { ArtRoom, Gallery, Reservation } from "./ArtRoom";
import { start } from "repl";

export const loadGalleryInfo = (room:ArtRoom)=>{
  let galleryData = loadCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY);
  galleryData.forEach((data:any)=>{
    let gallery = new Gallery(data)
    room.state.galleries.push(gallery)
  })

  // if(galleryData.main.reservation){
  //   console.log('gallery has reservation, load data', galleryData)
  //   room.state.reservation = new Reservation(galleryData.main.reservation)
  // }else{
  //   console.log('gallery doesnt have reservation, load template data')
  // }
}

export const handleArtGalleryReservation = async (room:ArtRoom, client: Client, message: { id:string, startDate: string, length:number }) => {
    const { startDate, length, id} = message;

    console.log("message is", message)
  
    try {
      // Validate input
      if (!client.userData || !client.userData.userId || !startDate || !length) {
        client.send("error", { message: "Invalid message parameters" });
        return;
      }
  
      // Validate profile
      const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
      if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
        client.send("error", { message: "Profile not found. Please create a profile first." });
        return;
      }

      //check if profile already has a gallery reserved
      if(room.state.galleries.find((gallery:Gallery)=> gallery.reservation && gallery.reservation.userId === client.userData.userId)){
        client.send("error", { message: "User has already reserved a gallery."})
        return
      }

      let gallery = room.state.galleries.find((gallery) => gallery.id === id)
      if(!gallery){
        client.send("error", { message: "Gallery not found"})
        return
      }
  
      if (gallery.reservation) {
        client.send("error", { message: "Gallery already reserved." });
        return;
      }

      // Reserve location
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(start.getDate() + length); // Add 14 days to reservation

      gallery.reservation = new Reservation({userId: client.userData.userId, name: client.userData.name, start:start.toString(), end:end.toString()})

      // Update cache and persist to file
      await updateCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, room.state.galleries.toJSON());
      await cacheSyncToFile(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, room.state.galleries.toJSON());
  
      // Send success message to the reserving client
      client.send("success", { message: "Location reserved successfully." });
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