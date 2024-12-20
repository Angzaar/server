import { Room, Client } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { handleArtGalleryReservation, handleMoveGalleryElevator, loadGalleryInfo } from "./ArtRoomHandlers";
import { loadCache } from "../utils/cache";
import { ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY } from "../utils/initializer";
import { validateAndCreateProfile } from "./MainRoomHandlers";
import { addPlayfabEvent } from "../utils/Playfab";
import { Player } from "./MainRoom";

export class Vector3 extends Schema {
    @type("number") x: number
    @type("number") y: number
    @type("number") z: number
  
    subtract(other: Vector3): Vector3 {
      return new Vector3(
          this.x - other.x,
          this.y - other.y,
          this.z - other.z
      );
    }
  }

class Item extends Schema {
    @type("string") id:string
    @type("string") title:string
    @type("string") artist:string
    @type("string") url:string;
    @type("string") contract:string;
    @type("string") contractType:string;
    @type("string") tokenId:string;

    @type("boolean") onSale:boolean
    
    @type("number") price:number
    @type("number") type:number // 0 - nft, 1 - image, 2 - video, 3 - wearable
    @type("number") delta:number = 0

    @type(Vector3) p: Vector3
    @type(Vector3) r: Vector3
    @type(Vector3) s:Vector3

}

export class Reservation extends Schema {
    @type("string") userId:string
    @type("string") name:string
    @type("string") start:string
    @type("string") end:string;
    constructor(data:any){
        super(data)
    }
}

export class Elevator extends Schema {
    @type("boolean") enabled:boolean
    @type("number") y:number = 0.3
    moveTimer:any
    moveInterval:any
    constructor(data:any){
        super(data)
    }
}


export class Gallery extends Schema {
    @type("string") id:string
    @type(Elevator) elevator:Elevator
    @type(Reservation) reservation:Reservation;
    @type([Item]) objects = new ArraySchema<Item>();

    constructor(data:any){
        super(data)
        console.log('gallery data is', data)
        if(data.elevator){
            this.elevator = new Elevator(data.elevator)
        }

        if(data.reservation){
            this.reservation = new Reservation(data.reservation)
        }
    }
}

class ArtRoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
    @type([Gallery]) galleries = new ArraySchema<Gallery>();
}

export class ArtRoom extends Room<ArtRoomState> {

    // Authentication and validation logic
    async onAuth(client: Client, options: { userId: string;  name: string }, req:any) {
      try {
        await validateAndCreateProfile(client, options, req);
      } catch (error:any) {
        console.error("Error during onAuth:", error.message);
        throw error;
      }
    }

  onCreate(options:any) {
    console.log("ArtRoom created!");
    this.setState(new ArtRoomState());

    loadGalleryInfo(this)

    // Attach message handlers
    this.onMessage("reserve", (client, message) => handleArtGalleryReservation(this, client, message));
    this.onMessage("gallery-elevator", (client, message) => handleMoveGalleryElevator(this, client, message));
}

  onJoin(client: Client, options:any) {
    console.log(`${client.sessionId} joined the ArtRoom.`);
    try {
      client.userData = options;
      console.log('setting client data', options)

      let player = new Player(options, client)
      this.state.players.set(options.userId, player)

      addPlayfabEvent({
      EventName: 'Player_Joined',
      Body:{
        'room': 'Art_Gallery',
        'player':options.userId,
        'name':options.name,
        'ip': client.userData.ip
      }
      })
  } catch (e) {
      console.log('on join error', e)
  }
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left the ArtRoom.`);
    let player = this.state.players.get(client.userData.userId)
    this.state.players.delete(client.userData.userId)
    addPlayfabEvent({
      EventName: 'Player_Leave',
      Body:{
        'room': 'Art_Gallery',
        'player':client.userData.userId,
        'name':client.userData.name,
        'playTime': Math.floor(Date.now()/1000) - player.startTime
      }
    })
  }

  onDispose() {
    console.log("ArtRoom disposed!");
  }
}