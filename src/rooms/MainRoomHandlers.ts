import { Client, Room } from "colyseus";
import { getCache, updateCache } from "../utils/cache";
import { Location, Profile } from "../utils/types";
import { ADMINS_FILE_CACHE_KEY, ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, CUSTOM_ITEMS_FILE_CACHE_KEY, DEPLOYMENT_QUEUE_CACHE_KEY, LOCATIONS_CACHE_KEY, LOCATIONS_FILE, NPCS_FILE_CACHE_KEY, PROFILES_CACHE_KEY, PROFILES_FILE, QUEST_TEMPLATES_CACHE_KEY, SHOPS_FILE, SHOPS_FILE_CACHE_KEY, STREAMS_FILE, STREAMS_FILE_CACHE_KEY } from "../utils/initializer";
import { MainRoom } from "./MainRoom";
import { addDaysToTimestamp, createFolder } from "../utils/folderUtils";
import path from "path";
import { profileExists } from "../utils/profiles";
import { conferenceImageConfigs, conferenceVideoConfig } from "../utils/conference";
import { setNPCGrid } from "../utils/npc";
import { start } from "repl";
import { validateAuthentication } from '../utils/signatures';
import { validateGoogleToken } from "../utils/auth";
import { isDecentralandRealm } from "../utils/realm";
const { v4: uuidv4 } = require('uuid');

const SLOT_DURATION = 2 * 60 * 60; // 2 hours in seconds

export const validateAndCreateProfile = async (
  client:Client,
    options:any,
    req: any
  ): Promise<any> => {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.address().address;
    const origin = req.headers['origin'] || req.headers['host'];
    const {userId, name } = options
    options.ip = ipAddress

    // For web-dapp clients, verify the signature
    if (options.realm === "web-dapp") {
      // Verify signature for web-dapp clients
      if (!validateAuthentication(options)) {
        console.log('Signature validation failed for user:', userId);
        throw new Error("Invalid authentication signature");
      }
      console.log('Signature validated successfully for user:', userId);
    }

    // Verify that the request origin is from an allowed domain
    const isAllowedOrigin = origin && (
      origin.includes('decentraland.org') || 
      origin.includes('web-dapp') || 
      origin.includes('hyperfy') ||
      origin.includes('worlds-server') ||
      origin.includes('lastslice.co') ||
      origin.includes('dcl-iwb.co') ||
      (process.env.ENV === "Development") // Allow in development environment
    );

    // if(options.authType === "google"){
    //   console.log('google auth type')
    //   let googleProfile = await validateGoogleToken(options.token)
    //   console.log('google profile', googleProfile)
    // }

    // console.log('ip is', ipAddress)

    // console.log('validating options', options)

        // if(isBanned(userId)){
        //   console.log('user is banned')t
        //   throw new Error("User Banned");
        // }
        
        // if(!optionsValidated(options)){
        //   throw new Error("Invalid login parameters");
        // }

    // Get profiles from cache with proper typing
    const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);

    let profile:any = profiles.find((profile) => profile.ethAddress === userId)// profileExists({userId, ipAddress})
    if(profile){
      // console.log('we found the profile already exists')
      // console.log("checking for duplicate information")
      // Check for duplicate userId or ipAddress
      // const alreadyUserId = profiles.find((profile) => profile.ethAddress === userId)
      // if(alreadyUserId && alreadyUserId.ipAddress !== ipAddress){
      //   console.log('theres already a user with that wallet, check ip')
      //   throw new Error("User ID or IP address is already in use.");
      // }

     // Check for duplicate userId or ipAddress
    //  const alreadyIPAddress = profiles.filter((profile) => profile.ethAddress === userId)
    //  if(alreadyIPAddress.length > 3){
    //    console.log('that user has used too many ip')
    //    throw new Error("Too Many IP");
    //  }

    //  console.log('profile is good to log in, see if they have dust created, if not create it with 0')
     if(!profile.hasOwnProperty('dust')){
      profile.dust = 0
     }
     if(!profile.hasOwnProperty("questsProgress")){
      profile.questsProgress = []
     }
    }else{
      // Create new profile if no duplicate is found
      profile = {
        ethAddress: userId,
        ipAddress,
        name: name,
        createdDate: new Date(),
        lastLogin: new Date(),
        deployments: 0,
        dust:0,
        goals:0,
        wins:0,
        losses:0,
        distance:0,
        blitzPlays:0,
        arcadePlays:0,
        web3:false,
        questsProgress:[]
      }
      profiles.push(profile)
      console.log('created new profile!', profile)
      // Update cache and sync to file
      // await updateCache(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
    }

    client.userData = options
    client.userData.ip = ipAddress

    if(!options.realm && !options.reservationDapp){
      console.log('no realm or reservation dapp', options)
      throw new Error("Invalid realm info")
    }

    if(options.realm === 'local-testing' && options.questId !== "creator"){
      let quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
      let quest = quests.find((quest:any)=> quest.questId === options.questId && quest.creator === options.userId)
      if(!quest){
        console.log('no quest found for creator local testing', options)
        throw new Error("Invalid Quest Creator for local testing")
      }
    }

    if(options.realm.includes("127.0.0.1") || options.realm.includes("localhost")){
      console.log('user is local, are they creator? or a scammer?', options)
      throw new Error("Invalid Parameters - Local Mode")
    }

    if(options.realm === "web-dapp" && options.questId === "creator"){
      // console.log("using web dapp realm")
      client.userData.web3 = true
      profile.web3 =true
      // profile.name = client.userData.name
    }

    else if(process.env.ENV === "Development" || (options.realm === "https://worlds.dcl-iwb.co")){
      client.userData.web3 = true
      profile.web3 =true
      profile.name = client.userData.name
    }

    else if (!isAllowedOrigin && !options.reservationDapp) {
      console.log('Request from unauthorized origin:', origin);
      throw new Error("Unauthorized origin");
    }
    
    else if(options.realm === "hyperfy"){
      // console.log("hyperfy realm login incoming")
      client.userData.web3 = true
      profile.web3 =true
      profile.name = client.userData.name
    }
    else{
      if (!isDecentralandRealm(options.realm)) {
        console.log('Invalid realm domain:', options);
        throw new Error("Invalid realm domain - must be from decentraland.org");
      }
      try{
        // let data:any = await fetch(`${options.realm}/lambdas/profiles/${options.userId}`)
        let data:any = await fetch(`https://realm-provider.decentraland.org/lambdas/profiles/${options.userId}`)
        let profileData = await data.json()
        // console.log('profile data is', profileData)
        if(profileData.error){
          console.log('remote profile error', profileData)
          throw new Error("Invalid remote profile")
        }
        client.userData.name = profileData.avatars[0].name
        client.userData.web3 = profileData.avatars[0].hasConnectedWeb3
        profile.web3 = profileData.avatars[0].hasConnectedWeb3
        profile.name = profileData.avatars[0].name
  
        // let comms:any = await fetch(`${options.realm}/comms/peers`)
        // let commsData = await comms.json()
        // if(commsData.ok){
        //   if(!commsData.peers.find((data:any)=> data.address === client.userData.userId.toLowerCase())){
        //     throw new Error("User not found on realm server")
        //   }
        // }else{
        //   throw new Error("Error fetching realm peer status")
        // }
      }
      catch(error:any){
        console.log('error fetching remote profile first time, trying different realm provider', error.message)
        try{
          let data:any = await fetch(`https://realm-provider.decentraland.org/lambdas/profiles/${options.userId}`)
          let profileData = await data.json()
          // console.log('profile data is', profileData)
          if(profileData.error){
            console.log('remote profile error second time', profileData)
            throw new Error("Invalid remote profile")
          }
          client.userData.name = profileData.avatars[0].name
          client.userData.web3 = profileData.avatars[0].hasConnectedWeb3
          profile.web3 = profileData.avatars[0].hasConnectedWeb3
          profile.name = profileData.avatars[0].name
    
          let comms:any = await fetch(`${options.realm}/comms/peers`)
          let commsData = await comms.json()
          if(commsData.ok){
            if(!commsData.peers.find((data:any)=> data.address === client.userData.userId.toLowerCase())){
              throw new Error("User not found on realm server")
            }
          }else{
            throw new Error("Error fetching realm peer status")
          }
        }
        catch(e:any){
          console.log('error fetching remote profile', e.message)
          return false
        }
      }
      
    }
    
    client.auth = {} 
    client.auth.profile = {...profile}
    // console.log('we have full auth')
  };

  async function getProfileData(){

  }

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

    console.log('deployment reservation confirmed', newReservation)

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
  console.log('handling get locations', client.userData)
  try {
    // Validate input
    if (!client.userData || !client.userData.userId) {
      console.log('invalid message parameters', client.userData)
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
      console.log('no location to get reservations', locationId)
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
  console.log('handling conference image update', message)
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

  console.log('conference center reserve request', day, hours)

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

    console.log('requested timestamps', requestedTimestamps)

    if(conferenceInfo.reservations.length > 0){
      // Validate no conflicts
      const hasConflict = conferenceInfo.reservations.some((reservation:any) => {
        return requestedTimestamps.some(({ start, end }) => {
          console.log(reservation.startDate, reservation.endDate)
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