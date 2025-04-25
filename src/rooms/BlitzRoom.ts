import { Room, Client } from "colyseus";
import { validateAndCreateProfile } from "./MainRoomHandlers";
import { CANNON } from "../utils/libraries";
import { checkGameState, createSoccer, resetGame } from "../components/soccer";
import { BlitzState } from "../components/soccer/BlitzState";
import { checkIsClient, deletePlayerPhysicsObjects, PlayerState } from "../components/soccer/PlayerState";
import { addBlitzRoom, removeBlitzRoom } from ".";
import { GlobalDustManager } from "../components/GlobalDustManager";
import { addSpaceship } from "../components/soccer/SpaceshipState";
import { createArcade } from "../components/arcade";
import { lightStopperSlug } from "../components/arcade/LightStopperState";
import { policeTrainerSlug } from "../components/arcade/constants";
import { BilliardsState } from "../components/arcade/BilliardState";
import { createLaserTag } from "../components/tag";
import { destroyAllBowlingLanes } from "../components/bowling.ts";

interface PhysicsBodyRef {
  body: CANNON.Body;
  playerId?: string;
  ballId?: string;
  arcadeId?:string,
  bulletId?:string
}

export class BlitzRoom extends Room<BlitzState> {
  ballcount = 0
  physicsRefs: Map<string, PhysicsBodyRef> = new Map();
  ghostBallTimer: number = 0;

  async onAuth(client: Client, options:any, req:any) {
    try {
      console.log('options are', options)
      await validateAndCreateProfile(client, options, req);
      return client.auth
    } catch (error:any) {
      console.error("Error during onAuth:", error.message);
      throw error;
    }
    }

  onCreate(options:any) {
    this.setState(new BlitzState());
    this.clock.start()
    addBlitzRoom(this)

    // addSpaceship(this)
    createSoccer(this)
    createArcade(this)
    // createLaserTag(this)
  }

  onJoin(client: Client, options:any) {
    console.log(`${client.sessionId} joined the MainRoom.`, options, client.auth);
    try {
      client.userData = { ...client.userData, ...options };

      if(!this.state.players.has(options.userId)){
        client.auth.profile.isClient = true
        let player = new PlayerState(this,client.auth.profile, client)
        this.state.players.set(options.userId, player)
        console.log('setting client data', client.userData)

        GlobalDustManager.addPlayer(player)

        // checkIsClient(options.userId).then((isClient:boolean)=>{
        //   options.isClient = isClient
        //   let player = new PlayerState(this,options, client)
        //   this.state.players.set(options.userId, player)
        //   console.log('setting client data', client.userData)
  
        //   // player.createPlane()
  
        //   // addPlayfabEvent({
        //   //   EventName: 'Player_Joined',
        //   //   Body:{
        //   //     'room': 'Main_Room',
        //   //     'player':options.userId,
        //   //     'name':options.name,
        //   //     'ip': client.userData.ip
        //   //   }
        //   // })
  
        //   // resetLane(this, '0')
        // })
      }
    } catch (e) {
        console.log('on join error', e)
    }
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left the MainRoom.`);
    let player = this.state.players.get(client.userData.userId)
    GlobalDustManager.removePlayer(player.userId)

    // if(player.flying){
    //   this.state.world.removeBody(player.planeBody)
    // }

    deletePlayerPhysicsObjects(this, player)
    player.saveGameData()

     if(player.currentGame !== ""){
          let currentGame:any
          switch(player.currentGame){
            case lightStopperSlug:
              break;
    
            case policeTrainerSlug:
              currentGame = this.state.policeTrainer.get(client.userData.userId)
              if(currentGame){
                currentGame.clearGame(this, player)
              }
              break;
          }
        }
        
    this.state.players.delete(client.userData.userId)

    checkGameState(this, player)

    // addPlayfabEvent({
    //   EventName: 'Player_Leave',
    //   Body:{
    //     'room': 'Main_Room',
    //     'player':client.userData.userId,
    //     'name':client.userData.name,
    //     'playTime': Math.floor(Date.now()/1000) - player.startTime
    //   }
    // })
  }

  onDispose() {
    console.log("Disposing physics world and removing all bodies...");
    checkGameState(this)

    this.state.world.bodies.forEach((body:CANNON.Body) => {
      try{
        if (body) {
          this.state.world.removeBody(body);
          // console.log('removing body')
      }
      }
      catch(e:any){
        console.log('error removing body at on dispose', e.message)
      }
    });
    this.state.world.bodies.length = 0
    this.state.world = null;

    try{
      this.physicsRefs.clear()
    }
    catch(e:any){
      console.log('error clearing physics ref on dispose', e)
    }

    this.state.billiards.forEach((billiardState:BilliardsState)=>{
      billiardState.clearBilliards()
    })

    destroyAllBowlingLanes(this)

    console.log("Physics world disposed successfully!");
    removeBlitzRoom(this)
  }
}