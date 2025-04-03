import { Room, Client, ServerError } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { handleCancelReservation, handleConferenceCancel, handleConferenceImageUpdate, handleConferenceReserve, handleConferenceVideoUpdate, handleGetConference, handleGetLocations, handleGetReservation, handleGetStreams, handleReserve, handleReserveStream, validateAndCreateProfile, handleGetLocationReservations, handleGetDeployments } from "./MainRoomHandlers";
import { getCache, loadCache, updateCache } from "../utils/cache";
import { ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, PROFILES_CACHE_KEY, PROFILES_FILE, STREAMS_FILE_CACHE_KEY } from "../utils/initializer";
import { createNPCs, NPC, stopNPCPaths } from "../utils/npc";
import { addPlayfabEvent } from "../utils/Playfab";
import { addRoom, removeRoom } from ".";

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

export class StreamReserveration extends Schema {
  @type("number") id:number
  @type("string") ethAddress:string;
  @type("string") url:string 
  constructor(args:any){
    super(args)
  }
}

class MainState extends Schema {
  @type(StreamReserveration) colosseumStream:StreamReserveration
  @type({ map: Player }) players = new MapSchema<Player>();
}

export class MainRoom extends Room<MainState> {
  async onAuth(client: Client, options: { userId: string;  name: string }, req:any) {
    try {
      await validateAndCreateProfile(client, options, req);
      return true
    } catch (error:any) {
      console.error("Error during onAuth:", error.message);
      throw error;
    }
    }

  onCreate(options:any) {
    this.setState(new MainState());
    addRoom(this)

    // Set up a 1-second interval to check reservations
    this.checkConferenceReservations();
    this.clock.setInterval(() => {
      this.checkConferenceReservations();
    }, 1000);

    let streams = getCache(STREAMS_FILE_CACHE_KEY)
    this.state.colosseumStream = new StreamReserveration(streams.find((stream:any)=>stream.id === 0))

    this.onMessage("reserve-stream", (client, message) => handleReserveStream(this, client, message));
    this.onMessage("get-streams", (client, message) => handleGetStreams(client));
    this.onMessage("reserve", (client, message) => handleReserve(this, client, message));
    this.onMessage("get-reservation", (client, message) => handleGetReservation(this, client, message));
    this.onMessage("cancel-reservation", (client, message) => handleCancelReservation(this, client, message));
    this.onMessage("get-locations", (client, message) => handleGetLocations(client));
    this.onMessage("get-location-reservations", (client, message) => handleGetLocationReservations(client, message));
    this.onMessage("get-deployments", (client, message) => handleGetDeployments(client, message));
    
    this.onMessage("get-conference", (client, message) => handleGetConference(client, 'set-conference'));
    this.onMessage("conference_image_update", (client, message) => handleConferenceImageUpdate(client, message));
    this.onMessage("conference_video_update", (client, message) => handleConferenceVideoUpdate(client, message));
    this.onMessage("reserve-conference", (client, message) => handleConferenceReserve(this, client, message));
    this.onMessage("cancel-conference-reservation", (client, message) => handleConferenceCancel(this, client, message));
    
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
            'room': 'Main_Room',
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
      EventName: 'Player_Leave',
      Body:{
        'room': 'Main_Room',
        'player':client.userData.userId,
        'name':client.userData.name,
        'playTime': Math.floor(Date.now()/1000) - player.startTime
      }
    })
  }

  onDispose() {
    console.log("MainRoom disposed!");
    removeRoom(this)
   
  }

  checkConferenceReservations() {
    const now = Math.floor(Date.now() / 1000);
    let conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY)
    if(!conferenceInfo){
      return
    }

    conferenceInfo.reservations = conferenceInfo.reservations.filter(
      (reservation:any) => reservation.endDate >= now
    );

    let currentReservation = conferenceInfo.reservations.filter(
      (reservation:any) => now >= reservation.startDate && now <= reservation.endDate
    );
    if(currentReservation.length > 0){
      if(conferenceInfo.currentReservation !== currentReservation[0].id){
        conferenceInfo.currentReservation = currentReservation[0].id
        updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, conferenceInfo)

        this.state.players.forEach((player:Player, id:string)=>{
        try{
          handleGetConference(player.client, 'refresh-conference')
        }
        catch(e){
          console.log('error sending message to client', e)
        }
        })
      }
    }else{
      if(conferenceInfo.currentReservation){
        delete conferenceInfo.currentReservation
        updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, conferenceInfo)
        this.broadcast('clear-conference')
      }
    }
  }
}