import { Client } from "colyseus";
import { cacheSyncToFile, getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, LOCATIONS_CACHE_KEY, PROFILES_CACHE_KEY, SHOPS_FILE, SHOPS_FILE_CACHE_KEY } from "../utils/initializer";
import { ArtRoom, Gallery, Reservation } from "./ArtRoom";
import { addDaysToTimestamp } from "../utils/folderUtils";
import { v4 } from "uuid";

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

export const handleArtGalleryReservation = async (room:any, client: Client, message: { id:string, startDate: string, length:number }) => {
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

      let gallery = room.state.galleries.find((gallery:any) => gallery.id === id)
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

export const handleMoveGalleryElevator = async (room:any, client: Client, message: { id:string, direction: number }) => {
  const { id, direction } = message;

  let shops = getCache(SHOPS_FILE_CACHE_KEY)
  let shop = shops.find((shop:any)=> shop.id === id)
  if(!shop){
    console.log('no shop to find elevator')
    return
  }

  if(shop.elevator){
    room.broadcast('move-shop-elevator', {id, direction})
  }

  // let gallery = room.state.galleries.find((gallery:any)=> gallery.id === id)
  // if(!gallery || !gallery.elevator){
  //   console.log('no gallery or elevator found')
  //   return
  // }

  // if(gallery.elevator.enable)

  // if(gallery.elevator.enabled && gallery.elevator.y === 0.3){
  //   console.log('can move elevator off ground')
  //   gallery.elevator.moveInterval = setInterval(()=>{
  //     if(gallery.elevator.y < 7.5){
  //       gallery.elevator.y += .01
  //     }else{
  //       clearInterval(gallery.elevator.moveInterval)
  //       gallery.elevator.y = 7.5
  //       gallery.elevator.moveTimer = setTimeout(()=>{
  //         clearTimeout(gallery.elevator.moveTimer)
  //         gallery.elevator.moveInterval = setInterval(()=>{
  //           if(gallery.elevator.y > 0.3){
  //             gallery.elevator.y -= .01
  //           }else{
  //             clearInterval(gallery.elevator.moveInterval)
  //             gallery.elevator.y = 0.3
  //           }  
  //         }, 10)
  //       }, 2000)
  //     }
  //   }, 10)
  // }
}

export const handleGetMainGallery = (client: Client, message:string) => {
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

    let galleryInfo = getCache(ART_GALLERY_CACHE_KEY)
    let mainGallery:any = galleryInfo.find((r:any)=> r.id === "main")
    if(!mainGallery){
      return
    }

    let userReservation:any = mainGallery.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
    let currentReservation:any = mainGallery.reservations.find((r:any)=> r.id === mainGallery.currentReservation)

    let reservations:any[] = []
    if(mainGallery.reservations.length > 0){
      reservations = mainGallery.reservations.map((res:any) => {
        return {
          id:res.id,
          ethAddress:res.ethAddress,
          startDate:res.startDate,
          endDate:res.endDate
        }
      })
    }

    client.send(message, {current:currentReservation, user:userReservation, reservations:reservations})
  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleGetShops = (client: Client) => {
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

    let shops = getCache(SHOPS_FILE_CACHE_KEY)

    shops.forEach((shop:any, index:number) => {
      let currentReservation:any
      if(shop.currentReservation){
        currentReservation = shop.reservations.find((res:any)=> res.id === shop.currentReservation)
      }

      let userReservation = shop.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
      client.send('update-shop', {action:"refresh", currentReservation, userReservation, reservations:shop.reservations, shopId:shop.id})
    });
  } catch (error) {
    console.error("Error handling get shops:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleMainGalleryReserve = async (room:ArtRoom, client: Client, message: { locationId: number; startDate: number, length:number }) => {
  const galleries = getCache(ART_GALLERY_CACHE_KEY);
  const {startDate, length } = message;
  const endDate = addDaysToTimestamp(startDate, length)

  console.log('handling main gallery reserver', message)

  try {
    // Validate input
    if (!client.userData || !client.userData.userId || !startDate || !length ) {
      console.log('invalid reservation parameters')
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    // Validate profile
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
    if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
      client.send("error", { message: "Profile not found. Please create a profile first." });
      return;
    }

    const mainGallery = galleries.find((g:any)=> g.id === "main")
    if(!mainGallery){
      console.log('main gallery not found, cannot reserve')
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    if(mainGallery.reservations.length > 0){
      // Validate no conflicts
      const hasConflict = mainGallery.reservations.some((reservation:any) => {
        return !(endDate <= reservation.startDate || startDate >= reservation.endDate)
      })

      if (hasConflict) {
        console.log('new reservation overlaps with a reservation')
        client.send("error", { message: "Requested hours overlap" });
        return;
      }

      const hasReservation = mainGallery.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
      if(hasReservation){
        console.log('user already has reservation')
        client.send("error", { message: "user already has reservation" });
        return;
      }
    }

    // No conflicts, create the reservation
    const newReservation:any = {
      id: v4(),
      ethAddress:client.userData.userId,
      startDate: startDate, // Start of the first hour
      endDate: endDate, // End of the last hour
      images:[]
    }
    for(let i = 0; i < parseInt(process.env.MAIN_GALLERY_LOCATIONS); i++){
      newReservation.images.push(
        {
          "id": i + 1,
          "src": "",
          "v": true,
          "ti": "",
          "c": false,
          "desc": "",
          "t": 0,
          "b": 22
        },
      )
    }

    mainGallery.reservations.push(newReservation)

    // Update cache and persist to file
    await updateCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, galleries);

    console.log('new art gallery rservation', newReservation.ethAddress, newReservation.id, newReservation.startDate)
    // Broadcast reservation update to all clients
    room.broadcast("new-art-gallery-reservation", newReservation);
  } catch (error) {
    console.error("Error handling art gallery reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleMainGalleryCancel = async (room:ArtRoom, client: Client, message: {locationId:number}) => {
  try {
    const galleries = getCache(ART_GALLERY_CACHE_KEY);

    // Validate input
    if (!client.userData || !client.userData.userId) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    const mainGallery = galleries.find((g:any) => g.id === "main")
    if (!mainGallery) {
      client.send("error", { message: "Invalid art gallery" });
      return;
    }

    if(mainGallery.reservations.length === 0){
      console.log('no reservations to cancel')
      return
    }

    const hasReservation = mainGallery.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
    console.log('has reservation is', hasReservation)

    if(!hasReservation){
      console.log('no user rservation to cancel')
      client.send("error", { message: "No user reservation to cancel" });
      return;
    }

    const reservationIndex = mainGallery.reservations.findIndex((res:any)=> res.ethAddress === client.userData.userId)
    if(reservationIndex < 0){
      console.log('reservation doesnt exist to cancel')
      return
    }

    mainGallery.reservations.splice(reservationIndex, 1)
    room.broadcast('cancel-art-gallery-reservation', hasReservation.id)
    console.log('canceled reservation for user at main art gallery', client.userData.userId)

  }
  catch(e:any){
    console.error('error getting user reservation', e.message)
  }
};

export const handleArtGalleryUpdate = (client: Client, message:any) => {
  console.log('handling art gallery update', message)
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

    // Validate user reservation
    let galleries = getCache(ART_GALLERY_CACHE_KEY)
    let mainGallery = galleries.find((g:any)=> g.id === "main")
    if(!mainGallery){
      console.log('main gallery doesnt exist')
      return
    }

    let reservation = mainGallery.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

      // Validate reservation image location
      let reservationImage = reservation.images.find((img:any)=> img.id === message.id)
      if(!reservationImage){
        console.log('no image location found', message.id)
        return
      }

      for(let key in message){
        if(reservationImage.hasOwnProperty(key)){
          reservationImage[key] = message[key]
          if(key == "t" && message[key] !== 2){
            delete reservationImage.nft
          }
        }
      }
      if(message.nft){
        reservationImage.nft = message.nft
      }
      console.log('image is now', reservationImage)

      updateCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, galleries)

      client.send('art-gallery-image-update', {reservationImage, reservationId:reservation.id})

  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopReserve = async (room:ArtRoom, client: Client, message: { locationId: number; startDate: number, length:number }) => {
  const shops = getCache(SHOPS_FILE_CACHE_KEY);
  const {startDate, length, locationId } = message;
  const endDate = addDaysToTimestamp(startDate, length)

  console.log('handling shop reserve', message)

  try {
    // Validate input
    if (!client.userData || !client.userData.userId || !startDate || !length ) {
      console.log('invalid reservation parameters')
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    // Validate profile
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
    if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
      client.send("error", { message: "Profile not found. Please create a profile first." });
      return;
    }

    const shop = shops.find((g:any)=> g.id === locationId)
    if(!shop){
      console.log('shop not found, cannot reserve')
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    if(shop.reservations.length > 0){
      // Validate no conflicts
      const hasConflict = shop.reservations.some((reservation:any) => {
        return !(endDate <= reservation.startDate || startDate >= reservation.endDate)
      })

      if (hasConflict) {
        console.log('new reservation overlaps with a reservation')
        client.send("error", { message: "Requested hours overlap" });
        return;
      }

      const hasReservation = shop.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
      if(hasReservation){
        console.log('user already has reservation')
        client.send("error", { message: "user already has reservation" });
        return;
      }
    }

    //make sure user has no other shops reserved
    for(let i = 0; i < shops.length; i++){
      let shop = shops[i]
        const hasReservation = shop.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
        if(hasReservation){
          console.log('user already has reservation on a shop')
          client.send("error", { message: "user already has reservation" });
          return;
        }
    }

    // No conflicts, create the reservation
    const newReservation:any = {
      id: v4(),
      ethAddress:client.userData.userId,
      startDate: startDate, // Start of the first hour
      endDate: endDate, // End of the last hour
      images:[],
      mannequins:[],
      audio:{
        e:false,
        playlist:"",
        volume:0.5
      },
      elevator:true
    }
    for(let i = 0; i < 7; i++){
      newReservation.mannequins.push({
        id:i,
        name:"Mannequin " + (i+1),
        wearables:[],
        skinColor:{r:0,g:0,b:0},
        eyeColor:{r:0,g:0,b:0},
        hairColor:{r:0,g:0,b:0},
        b:"F",
        v:true
      })
    }
    
    for(let i = 0; i < parseInt(process.env.SHOP_IMAGE_LOCATIONS); i++){
      newReservation.images.push(
        {
          "id": i,
          "src": "",
          "v": true,
          "ti": "",
          "c": false,
          "desc": "",
          "t": 0,
          "b": 22,
          m:1,
          a:"1:1"
        },
      )
    }

    shop.reservations.push(newReservation)

    // Update cache and persist to file
    await updateCache(SHOPS_FILE, SHOPS_FILE_CACHE_KEY, shops);

    console.log('new shop rservation', newReservation.ethAddress, newReservation.id, newReservation.startDate)
    // Broadcast reservation update to all clients
    room.broadcast("new-shop-reservation", {newReservation, shopId:locationId});
  } catch (error) {
    console.error("Error handling art gallery reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopCancel = async (room:ArtRoom, client: Client, message:any) => {
  console.log('trying to cancel shop', message)
  try {
    const shops = getCache(SHOPS_FILE_CACHE_KEY);

    // Validate input
    if (!client.userData || !client.userData.userId) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    const shop = shops.find((g:any)=> g.id === message)
    if(!shop){
      console.log('shop not found, cannot reserve')
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    if(shop.reservations.length === 0){
      console.log('no reservations to cancel')
      return
    }

    const hasReservation = shop.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
    console.log('has reservation is', hasReservation)

    if(!hasReservation){
      console.log('no user rservation to cancel')
      client.send("error", { message: "No user reservation to cancel" });
      return;
    }

    const reservationIndex = shop.reservations.findIndex((res:any)=> res.ethAddress === client.userData.userId)
    if(reservationIndex < 0){
      console.log('reservation doesnt exist to cancel')
      return
    }

    shop.reservations.splice(reservationIndex, 1)
    room.broadcast('cancel-shop-reservation', {reservationId:hasReservation.id, shopId:message})
    console.log('canceled reservation for user at their shoppe', client.userData.userId)

  }
  catch(e:any){
    console.error('error getting user reservation', e.message)
  }
};

export const handleShopImageUpdate = (client: Client, message:any) => {
  console.log('handling shop image update', message)
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

    // Validate user reservation
    let shops = getCache(SHOPS_FILE_CACHE_KEY)
    let shop = shops.find((g:any)=> g.id === message.shopId)
    if(!shop){
      console.log('shop  doesnt exist')
      return
    }

    let reservation = shop.reservations.find((r:any)=> r.id === message.reservationId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

      // Validate reservation image location
      let reservationImage = reservation.images.find((img:any)=> img.id === message.id)
      if(!reservationImage){
        console.log('no image location found', message.id)
        return
      }

      for(let key in message){
        if(reservationImage.hasOwnProperty(key)){
          reservationImage[key] = message[key]
          if(key == "t" && message[key] !== 2){
            delete reservationImage.nft
          }
        }
      }
      if(message.nft){
        reservationImage.nft = message.nft
      }
      console.log('image is now', reservationImage)

      // updateCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, galleries)

      client.send('update-shop', {action:'image', reservationImage, shopId:message.shopId, reservationId:reservation.id})

  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopMannequineUpdate = (client: Client, message:any) => {
  console.log('handling shop mannequin update', message)
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

    // Validate user reservation
    let shops = getCache(SHOPS_FILE_CACHE_KEY)
    let shop = shops.find((g:any)=> g.id === message.shopId)
    if(!shop){
      console.log('shop  doesnt exist')
      return
    }

    let reservation = shop.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

    let mannequin = reservation.mannequins[message.manId]
    if(!mannequin){
      console.log('mannequin doesnt exist to edit')
      return
    }

      for(let key in message){
        if(key !== "id"){
          if(mannequin.hasOwnProperty(key)){
            mannequin[key] = message[key]
          }
        }
      }

      console.log('mannequin is now', mannequin)
      client.send('update-shop', {action:'mannequin', manId:message.manId, shopId:message.shopId, man:mannequin, reservationId:reservation.id})

  } catch (error) {
    console.error("Error handling update mannequin:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopAudioUpdate = (client: Client, message:any) => {
  console.log('handling shop audio update', message)
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

    // Validate user reservation
    let shops = getCache(SHOPS_FILE_CACHE_KEY)
    let shop = shops.find((g:any)=> g.id === message.shopId)
    if(!shop){
      console.log('shop  doesnt exist')
      return
    }

    let reservation = shop.reservations.find((r:any)=> r.id === message.reservationId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

      for(let key in message){
        if(reservation.audio.hasOwnProperty(key)){
          reservation.audio[key] = message[key]
        }
      }
      client.send('update-shop', {action:'audio', audio:reservation.audio, shopId:message.shopId, reservationId:reservation.id})

  } catch (error) {
    console.error("Error handling update shop audio:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopWearableUpdate = (client: Client, message:any) => {
  console.log('handling shop mannequin wearable update', message)
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

    // Validate user reservation
    let shops = getCache(SHOPS_FILE_CACHE_KEY)
    let shop = shops.find((g:any)=> g.id === message.shopId)
    if(!shop){
      console.log('shop  doesnt exist')
      return
    }

    let reservation = shop.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

    let mannequin = reservation.mannequins[message.manId]
    if(!mannequin){
      console.log('mannequin doesnt exist to edit')
      return
    }

    mannequin.wearables.push({id:message.wearable})

    console.log('mannequin is now', mannequin)
    client.send('update-shop', {action:'mannequin', manId:message.manId, shopId:message.shopId, man:mannequin, reservationId:reservation.id})

  } catch (error) {
    console.error("Error handling update mannequin:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopWearableRemove = (client: Client, message:any) => {
  console.log('handling shop mannequin wearable update', message)
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

    // Validate user reservation
    let shops = getCache(SHOPS_FILE_CACHE_KEY)
    let shop = shops.find((g:any)=> g.id === message.shopId)
    if(!shop){
      console.log('shop  doesnt exist')
      return
    }

    let reservation = shop.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

    let mannequin = reservation.mannequins[message.manId]
    if(!mannequin){
      console.log('mannequin doesnt exist to edit')
      return
    }

    mannequin.wearables.splice(message.index, 1)

    console.log('mannequin is now', mannequin)
    client.send('update-shop', {action:'mannequin', manId:message.manId, shopId:message.shopId, man:mannequin, reservationId:reservation.id})

  } catch (error) {
    console.error("Error handling update mannequin:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleShopToggleElevator = (client: Client, message:any) => {
  console.log('handling shop toggle elevator', message)
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

    // Validate user reservation
    let shops = getCache(SHOPS_FILE_CACHE_KEY)
    let shop = shops.find((g:any)=> g.id === message.shopId)
    if(!shop){
      console.log('shop  doesnt exist')
      return
    }

    let reservation = shop.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

      reservation.elevator  = !reservation.elevator
    client.send('update-shop', {action:'elevator', shopId:message.shopId, reservationId:reservation.id, elevator:reservation.elevator})

  } catch (error) {
    console.error("Error handling update mannequin:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};
