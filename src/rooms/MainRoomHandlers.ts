import { Client, Room } from "colyseus";
import { getCache, updateCache } from "../utils/cache";
import { Location, Profile } from "../utils/types";
import { ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, DEPLOYMENT_QUEUE_CACHE_KEY, LOCATIONS_CACHE_KEY, LOCATIONS_FILE, PROFILES_CACHE_KEY, PROFILES_FILE, SHOPS_FILE, SHOPS_FILE_CACHE_KEY, STREAMS_FILE, STREAMS_FILE_CACHE_KEY } from "../utils/initializer";
import { MainRoom } from "./MainRoom";
import { addDaysToTimestamp, createFolder } from "../utils/folderUtils";
import path from "path";
import { profileExists } from "../utils/profiles";
import { conferenceImageConfigs, conferenceVideoConfig } from "../utils/conference";
const { v4: uuidv4 } = require('uuid');

const SLOT_DURATION = 2 * 60 * 60; // 2 hours in seconds

export const validateAndCreateProfile = async (
  client:Client,
    options:{
      userId: string,
      name: string,
    },
    req: any
  ): Promise<any> => {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.address().address;
    const {userId, name } = options

    console.log('ip is', ipAddress)

    // console.log('validating options', options)

        // if(isBanned(userId)){
        //   console.log('user is banned')
        //   throw new Error("User Banned");
        // }
        
        // if(!optionsValidated(options)){
        //   throw new Error("Invalid login parameters");
        // }

    // Get profiles from cache with proper typing
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);

    if(profileExists({userId, ipAddress})){
      // console.log('we found the profile already exists, do nothing')
    }else{
      console.log("checking for duplicate information before creating new profile")
      // Check for duplicate userId or ipAddress
      const alreadyUserId = profiles.find((profile) => profile.ethAddress === userId)
      if(alreadyUserId && alreadyUserId.ipAddress === ipAddress){
        console.log('theres already a user with that wallet, check ip')
        throw new Error("User ID or IP address is already in use.");
      }

     // Check for duplicate userId or ipAddress
     const alreadyIPAddress = profiles.find((profile) => profile.ipAddress === ipAddress)
     if(alreadyIPAddress && alreadyIPAddress.ethAddress === userId){
       console.log('theres already a user with that wallet, check ip')
       throw new Error("User ID or IP address is already in use.");
     }

    // Create new profile if no duplicate is found
    if(!profiles.find((profile:Profile) => profile.ethAddress === userId && profile.ipAddress === ipAddress)){
      profiles.push({
        ethAddress: userId,
        ipAddress,
        name: name,
        createdDate: new Date(),
        deployments: 0,
      })
    }
  
      // console.log('profiles are now ', profiles)
  
      // Update cache and sync to file
      await updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
    }

    client.userData = options
    client.userData.ip = ipAddress
  };

  export const isBanned = (user:string) => {
    return false
  }
  
  export const optionsValidated = (options:any) => {
    console.log("validation options", options)
    if(!options || 
        !options.userId || 
        !options.name //|| 
    ){
        return false
    }
  }

export const handleReserve = async (room:MainRoom, client: Client, message: { locationId: number; startDate: number, length:number }) => {
  const locations = getCache(LOCATIONS_CACHE_KEY);
  const { locationId, startDate, length } = message;
  const endDate = addDaysToTimestamp(startDate, length)


  try {
    // Validate input
    if (!client.userData || !client.userData.userId || !startDate || !locationId || !length) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    // Validate profile
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
    if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
      client.send("error", { message: "Profile not found. Please create a profile first." });
      return;
    }

    // Validate location
    const location = locations.find((loc:Location) => loc.id === locationId);

    if (!location) {
      client.send("error", { message: "Location not found." });
      return;
    }

    if (location.reservations.length > 0) {
      const hasConflict = location.reservations.some((reservation:any) => {
          // Check if the requested range overlaps with any existing reservation
          return !(endDate <= reservation.endDate || startDate >= reservation.endDate)
        })

      if (hasConflict) {
        client.send("error", { message: "Requested hours overlap" });
        return;
      }

      let hasReservation:any
      locations.forEach((location:any)=>{
        if(!hasReservation){
          hasReservation = location.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
        }
      })

      if(hasReservation){
        client.send("error", { message: "user already has reservation" });
        return;
      }
    }

    // No conflicts, create the reservation
    const newReservation = {
      id: uuidv4(),
      ethAddress:client.userData.userId,
      startDate: startDate, // Start of the first hour
      endDate: endDate,
    }
    location.reservations.push(newReservation)

    // Update cache and persist to file
    await updateCache(LOCATIONS_FILE, LOCATIONS_CACHE_KEY, locations);

    // Broadcast reservation update to all clients
    room.broadcast("reservation-confirmed", {locationId:location.id, reservation:newReservation});

    // // Send success message to the reserving client
    // client.send("success", { message: "Location reserved successfully.", location });
  } catch (error) {
    console.error("Error handling reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleReserveStream = async (room:MainRoom, client: Client, message: { locationId: number; timestamp: number, name:string, url:string }) => {
  const streams = getCache(STREAMS_FILE_CACHE_KEY);
  const { locationId, timestamp, url, name } = message;

  console.log('trying to handle reservation stream', message)

  try {
    // Validate input
    if (!client.userData || !client.userData.userId || !timestamp) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    // Validate profile
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
    if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
      client.send("error", { message: "Profile not found. Please create a profile first." });
      return;
    }

    // Validate location
    const streamLocation = streams.find((stream:any) => stream.id === locationId);

    if (!streamLocation) {
      client.send("error", { message: "Location not found." });
      return;
    }

    if (!streamLocation.reservations) {
      streamLocation.reservations = []
    }

    if (isSlotReserved(streamLocation.reservations, timestamp, locationId)) {
      client.send("error", { message: "Stream slot already reserved." });
      return;
    }

    // Add the new reservation
    const newReservation = { id:uuidv4(), url:"", name:name, ethAddress: client.userData.userId, timestamp };
    streamLocation.reservations.push(newReservation)

    // Update cache and persist to file
    await updateCache(STREAMS_FILE, STREAMS_FILE_CACHE_KEY, streams);

    // Broadcast reservation update to all clients
    room.broadcast("reservation-stream-confirmed", {locationId, newReservation});
  } catch (error) {
    console.error("Error handling reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

// export const handlePaidReserve = (client: Client, message: any, room: any) => {
//   const reservations = getCachedReservations();
//   const locations = getCachedLocations();
//   const { locationId, ethAddress, startDate, endDate, paymentHash } = message;

//   if (!paymentHash) {
//     client.send("error", { message: "Payment verification failed!" });
//     return;
//   }

//   if (reservations.find((r) => r.locationId === locationId)) {
//     client.send("error", { message: "Location already reserved!" });
//     return;
//   }

//   const location = locations.find((l) => l.id === locationId);
//   if (!location) {
//     client.send("error", { message: "Location not found!" });
//     return;
//   }

//   reservations.push({ locationId, ethAddress, startDate, endDate, paid: true });
//   saveReservations(reservations);

//   room.broadcast("reservationUpdate", { locationId, ethAddress, paid: true });
// };

export const handleGetLocations = (client: Client) => {
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

    let locations = getCache(LOCATIONS_CACHE_KEY)
    let userReservation:any
    locations.forEach((location:any)=>{
      if(!userReservation){
        userReservation = location.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
        if(userReservation){
          console.log('found user reservation')
          userReservation.locationId = location.id
        }
      }
    })

    console.log('user reservation is', userReservation)

    client.send('get-locations', {locations:locations.map((loc:any)=> {return {id:loc.id, parcels:loc.parcels}}), user:userReservation})
  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleGetLocationReservations = (client: Client, message: {locationId:string}) => {
  try {
    const {locationId} = message

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

    let locations = getCache(LOCATIONS_CACHE_KEY)
    let location = locations.find((loc:any)=> loc.id === locationId)
    if(!location){
      console.log('no location to get reservations')
      return
    }

    client.send('get-location-reservations', location.reservations)
  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleGetStreams = (client: Client) => {
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

    client.send('get-streams', getCache(STREAMS_FILE_CACHE_KEY))
  } catch (error) {
    console.error("Error handling get-streams:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleGetReservation = async (room:MainRoom, client: Client, message: any) => {
  console.log('getting user reservation', client.userData.userId, message)
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

    //Load cached locations
    const locations:Location[] = getCache(LOCATIONS_CACHE_KEY);
    if(!locations){
      console.log('couldnt access location info')
      return
    }

    let userReservation:any
    locations.forEach((location:any)=>{
      if(!userReservation || userReservation === undefined){
        userReservation = location.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
        if(userReservation){
          userReservation.locationId = location.id
        }
      }
    })

    if(!userReservation){
      console.log('no reservation for user', client.userData.userId)
      client.send("no-reservation", {});
      return;
    }

    let filteredLocation:any = {...locations.find((loc:any)=> loc.id === userReservation.locationId)}
    delete filteredLocation.reservations

    // Validate location
    const deployments:any[] = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
    client.send('user-reservation', {location:filteredLocation, userReservation})
    handleGetDeployments(client, {reservationId: userReservation.id})
  }
  catch(e:any){
    console.error('error getting user reservation', e.message)
  }
};

export const handleCancelReservation = async (room:MainRoom, client: Client, message: {locationId:number}) => {
  try {
    console.log("handling cancel reservation", client.userData.userId, message.locationId)
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

    // Validate location
    const locations:Location[] = getCache(LOCATIONS_CACHE_KEY);
    if (!locations) {
      client.send("error", { message: "Location not found." });
      return;
    }

    const location = locations.find((loc:Location) => loc.id === message.locationId);
    if (!locations) {
      client.send("error", { message: "Location not found." });
      return;
    }

    const reservation = location.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
    if(!reservation){
      console.log('user does not have rservation to cancel')
      client.send("error", { message: "Reservation not found." });
      return
    }
    
    const reservationIndex = location.reservations.findIndex((res:any)=> res.ethAddress === client.userData.userId)
    if(reservationIndex < 0){
      console.log('reservation doesnt exist to cancel')
      return
    }
    location.reservations.splice(reservationIndex, 1)

    //cancel reservation
    room.broadcast('cancel-reservation', {locationId:location.id, reservation:reservation})
    console.log('canceled reservation for user at location', message.locationId, client.userData.userId)

  }
  catch(e:any){
    console.error('error getting user reservation', e.message)
  }
};

// Check if the timestamp is already reserved
function isSlotReserved(reservations: any[], newTimestamp: number, locationId: number): boolean {
  return reservations.some((res: any) => {
    // Ensure the reservation is for the same location
    if (res.locationId !== locationId) return false;

    // Check if the new timestamp overlaps with the existing reservation
    const existingStart = res.timestamp;
    const existingEnd = existingStart + SLOT_DURATION;
    const newEnd = newTimestamp + SLOT_DURATION;

    // Overlap occurs if:
    // (newTimestamp is within the range [existingStart, existingEnd]) OR
    // (newEnd is within the range [existingStart, existingEnd]) OR
    // (newTimestamp starts before existingStart but newEnd extends beyond existingStart)
    return (
      (newTimestamp >= existingStart && newTimestamp < existingEnd) || // Overlap at the start
      (newEnd > existingStart && newEnd <= existingEnd) || // Overlap at the end
      (newTimestamp <= existingStart && newEnd >= existingEnd) // Fully overlaps
    );
  });
}

export const handleGetConference = (client: Client, message:string) => {
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

    let conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY)
    let currentReservation:any = conferenceInfo.reservations.find((r:any)=> r.id === conferenceInfo.currentReservation)
    let userReservation:any = conferenceInfo.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
    
    let reservations:any[] = []
    if(conferenceInfo.reservations.length > 0){
      reservations = conferenceInfo.reservations.map((res:any) => {
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

export const handleConferenceImageUpdate = (client: Client, message:any) => {
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
    let conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY)
    let reservation = conferenceInfo.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
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

      reservationImage.v = message.v
      reservationImage.src = message.src

      updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, conferenceInfo)

      client.send('conference_image_update', message)

  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleConferenceVideoUpdate = (client: Client, message:any) => {
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

    // Validate reservation
    let conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY)
    let reservation = conferenceInfo.reservations.find((r:any)=> r.ethAddress === client.userData.userId)
      if(!reservation){
        console.log('couldnt find user reservation in reservation pool', client.userData.userId)
        return
      }

      let video = reservation.video
      for(let key in message){
        if(video.hasOwnProperty(key)){
          console.log('updatign vdieo property', key, message[key])
          video[key] = message[key]
        }
      }

      updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, conferenceInfo)

      client.send('conference_video_update', message)

  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleConferenceReserve = async (room:MainRoom, client: Client, message: {day:string, hours:number[] }) => {
  const conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY);
  const { day, hours } = message;

  try {
    // Validate input
    if (!client.userData || !client.userData.userId || !day || !hours) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    // Validate profile
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
    if (!profiles.some((profile) => profile.ethAddress === client.userData.userId)) {
      client.send("error", { message: "Profile not found. Please create a profile first." });
      return;
    }

    const requestedTimestamps = hours.map((hour) => {
      const start = new Date(`${day} ${hour}:00:00 UTC`).getTime() / 1000 // Start of the hour in Unix seconds
      const end = new Date(`${day} ${hour + 1}:00:00 UTC`).getTime() / 1000 // End of the hour in Unix seconds
      return { start, end }
    })

    if(conferenceInfo.reservations.length > 0){
      // Validate no conflicts
      const hasConflict = conferenceInfo.reservations.some((reservation:any) => {
        return requestedTimestamps.some(({ start, end }) => {
          // Check if the requested range overlaps with any existing reservation
          return !(end <= reservation.endDate || start >= reservation.endDate)
        })
      })

      if (hasConflict) {
        client.send("error", { message: "Requested hours overlap" });
        return;
      }

      const hasReservation = conferenceInfo.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
      if(hasReservation){
        client.send("error", { message: "user already has reservation" });
        return;
      }
    }

    // No conflicts, create the reservation
    const newReservation = {
      id: uuidv4(),
      ethAddress:client.userData.userId,
      startDate: requestedTimestamps[0].start, // Start of the first hour
      endDate: requestedTimestamps[requestedTimestamps.length - 1].end, // End of the last hour
      images:[...conferenceImageConfigs],
      video: {...conferenceVideoConfig}
    }
    newReservation.video.start = newReservation.startDate

    conferenceInfo.reservations.push(newReservation)

    // Update cache and persist to file
    await updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, conferenceInfo);

    console.log('new conference rservation', newReservation.ethAddress, newReservation.id, newReservation.startDate)
    // Broadcast reservation update to all clients
    room.broadcast("new-conference-reservation", newReservation);

    // Send success message to the reserving client
    // client.send("success", { message: "Location reserved successfully.", location });
  } catch (error) {
    console.error("Error handling conference reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleConferenceCancel = async (room:MainRoom, client: Client, message: {locationId:number}) => {
  try {
    const conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY);

    console.log("handling cancel conference reservation", client.userData.userId)
    // Validate input
    if (!client.userData || !client.userData.userId) {
      client.send("error", { message: "Invalid message parameters" });
      return;
    }

    if(conferenceInfo.reservations.length === 0){
      console.log('no reservations to cancel')
      return
    }

    const hasReservation = conferenceInfo.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
    if(!hasReservation){
      console.log('no user rservation to cancel')
      client.send("error", { message: "No user reservation to cancel" });
      return;
    }

    const reservationIndex = conferenceInfo.reservations.findIndex((res:any)=> res.ethAddress === client.userData.userId)
    if(reservationIndex < 0){
      console.log('reservation doesnt exist to cancel')
      return
    }
    conferenceInfo.reservations.splice(reservationIndex, 1)

    room.broadcast('cancel-conference-reservation', hasReservation)
    console.log('canceled reservation for user at conference center', client.userData.userId)

  }
  catch(e:any){
    console.error('error getting user reservation', e.message)
  }
};

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

    shops.forEach((shop:any, shopId:number) => {
      let currentReservation:any
      if(shop.currentReservation){
        currentReservation = shop.reservations.find((res:any)=> res.id === shop.currentReservation)
      }

      let userReservation = shop.reservations.find((res:any)=> res.ethAddress === client.userData.userId)
      client.send('update-shop', {action:"refresh", currentReservation, userReservation, shopId})
    });
  } catch (error) {
    console.error("Error handling get shops:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleMainGalleryReserve = async (room:MainRoom, client: Client, message: { locationId: number; startDate: number, length:number }) => {
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
      id: uuidv4(),
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

export const handleMainGalleryCancel = async (room:MainRoom, client: Client, message: {locationId:number}) => {
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


export const handleShopReserve = async (room:MainRoom, client: Client, message: { locationId: number; startDate: number, length:number }) => {
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
      id: uuidv4(),
      ethAddress:client.userData.userId,
      startDate: startDate, // Start of the first hour
      endDate: endDate, // End of the last hour
      images:[],
      man:{}
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
          "b": 22
        },
      )
    }

    shop.reservations.push(newReservation)

    // Update cache and persist to file
    await updateCache(SHOPS_FILE, SHOPS_FILE_CACHE_KEY, shops);

    console.log('new shop rservation', newReservation.ethAddress, newReservation.id, newReservation.startDate)
    // Broadcast reservation update to all clients
    room.broadcast("new-shop-reservation", {newReservation, locationId});
  } catch (error) {
    console.error("Error handling art gallery reservation:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};

export const handleGetDeployments = ( client: Client, message:{reservationId:string}) => {
  console.log('handle get deployments', message)
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

    let deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY)
    let userDeployments = deployments.filter((dep:any)=> dep.reservationId === message.reservationId && dep.userId === client.userData.userId)

    // console.log('user deployments are', userDeployments)

    client.send('get-deployments', userDeployments)
  } catch (error) {
    console.error("Error handling get-locations:", error);
    client.send("error", { message: "Internal server error. Please try again later." });
  }
};
