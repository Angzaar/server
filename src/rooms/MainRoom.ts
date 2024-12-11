import { Room, Client, ServerError } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { handleCancelReservation, handleConferenceCancel, handleConferenceImageUpdate, handleConferenceReserve, handleConferenceVideoUpdate, handleGetMainGallery, handleGetConference, handleGetLocations, handleGetReservation, handleGetStreams, handleReserve, handleReserveStream, validateAndCreateProfile, handleGetUnitGallery, handleArtGalleryUpdate, handleMainGalleryCancel, handleMainGalleryReserve, handleGetLocationReservations, handleGetDeployments } from "./MainRoomHandlers";
import { getCache, loadCache, updateCache } from "../utils/cache";
import { Profile } from "../utils/types";
import { ART_GALLERY_CACHE_KEY, ART_GALLERY_FILE, CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, PROFILES_CACHE_KEY, PROFILES_FILE, STREAMS_FILE_CACHE_KEY } from "../utils/initializer";

export class Player extends Schema {
  @type("string") userId:string;
  @type("string") name:string 
  client:Client

  constructor(args:any, client:Client){
    super(args)
    this.client = client
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
        await validateAndCreateProfile(options, req);
        return true;
      } catch (error:any) {
        console.error("Error during onAuth:", error.message);
        throw error;
      }
    }

  onCreate(options:any) {
    this.setState(new MainState());
    this.clock.start()

    // Set up a 1-second interval to check reservations
    this.checkConferenceReservations();
    this.checkGalleryReservations();
    this.clock.setInterval(() => {
      this.checkConferenceReservations();
      this.checkGalleryReservations();
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

    
    this.onMessage("get-conference", (client, message) => handleGetConference(client, 'set-conference'));
    this.onMessage("conference_image_update", (client, message) => handleConferenceImageUpdate(client, message));
    this.onMessage("conference_video_update", (client, message) => handleConferenceVideoUpdate(client, message));
    this.onMessage("reserve-conference", (client, message) => handleConferenceReserve(this, client, message));
    this.onMessage("cancel-conference-reservation", (client, message) => handleConferenceCancel(this, client, message));

    this.onMessage("get-art-gallery", (client, message) => handleGetMainGallery(client, 'get-art-gallery'));
    this.onMessage("art-gallery-image-update", (client, message) => handleArtGalleryUpdate(client, message));
    this.onMessage("cancel-art-gallery-reservation", (client, message) => handleMainGalleryCancel(this, client, message));
    this.onMessage("art-gallery-reservation", (client, message) => handleMainGalleryReserve(this, client, message));

    this.onMessage("get-deployments", (client, message) => handleGetDeployments(client, message));

  }

  onJoin(client: Client, options:any) {
    console.log(`${client.sessionId} joined the MainRoom.`);
    try {
      client.userData = options;
      if(!this.state.players.has(options.userId)){
        let player = new Player(options, client)
        this.state.players.set(options.userId, player)
        console.log('setting client data', options)
      }
    } catch (e) {
        console.log('on join error', e)
    }
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left the MainRoom.`);
    this.state.players.delete(client.userData.userId)
  }

  onDispose() {
    console.log("MainRoom disposed!");
  }

  checkConferenceReservations() {
    const now = Math.floor(Date.now() / 1000);
    let conferenceInfo = getCache(CONFERENCE_FILE_CACHE_KEY)
    if(!conferenceInfo){
      return
    }

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

  checkGalleryReservations() {
    const now = Math.floor(Date.now() / 1000);
    let galleryInfo = getCache(ART_GALLERY_CACHE_KEY)
    if(!galleryInfo){
      console.log('no gallery info')
      return
    }

    let mainGallery = galleryInfo.find((g:any) => g.id === "main")
    if(!mainGallery){
      console.log('no main gallery config')
      return
    }

    let currentReservation = mainGallery.reservations.filter(
      (reservation:any) => now >= reservation.startDate && now <= reservation.endDate
    );

    if(currentReservation.length > 0){
      if(mainGallery.currentReservation !== currentReservation[0].id){
        mainGallery.currentReservation = currentReservation[0].id
        updateCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, galleryInfo)

        this.state.players.forEach((player:Player, id:string)=>{
        try{
          handleGetMainGallery(player.client, 'refresh-art-gallery')
        }
        catch(e){
          console.log('error sending message to client', e)
        }
        })
      }
    }else{
      if(mainGallery.currentReservation){
        delete mainGallery.currentReservation
        updateCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, galleryInfo)
        this.broadcast('clear-art-gallery')
      }
    }

    galleryInfo.filter((g:any)=> g.id !== "main").forEach((gallery:any)=>{
      let currentReservation = gallery.reservations.filter(
        (reservation:any) => now >= reservation.startDate && now <= reservation.endDate
      );

      if(currentReservation.length > 0){
        if(gallery.currentReservation !== currentReservation[0].id){
          gallery.currentReservation = currentReservation[0].id
          updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, galleryInfo)

          this.state.players.forEach((player:Player, id:string)=>{
          try{
            handleGetUnitGallery(player.client, 'refresh-unit-gallery')
          }
          catch(e){
            console.log('error sending message to client', e)
          }
          })
        }
      }else{
        if(gallery.currentReservation){
          delete gallery.currentReservation
          updateCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, galleryInfo)
          this.broadcast('clear-unit-gallery', gallery.id)
        }
      }
    })
  }
}