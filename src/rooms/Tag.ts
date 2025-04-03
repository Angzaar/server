import { Room, Client } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { validateAndCreateProfile } from "./MainRoomHandlers";
import { CANNON } from "../utils/libraries";
// import * as RAPIER from "@dimforge/rapier3d";
import { PlayerState } from "../components/soccer/PlayerState";
import { BasePlayerState } from "../components/BasePlayerState";

// Physics World Setup
// const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); // Gravity (adjust as needed)

// // Schema for Game State
// class PlayerState extends Schema {
//   @type("number") x = 0;
//   @type("number") y = 0;
//   @type("number") z = 0;
//   @type("number") rotation = 0;
// }

class BulletState extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") vx = 0; // Velocity
  @type("number") vy = 0;
  @type("number") vz = 0;
}

class TagState extends Schema {
    @type({ map: BasePlayerState }) players = new Map<string, BasePlayerState>();
    @type({ map: BulletState }) bullets = new Map<string, BulletState>();
}

export class TagRoom extends Room<TagState> {
    fixedTimeStep = 1 / 60; // 60 FPS physics update


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
    this.setState(new TagState());
    this.clock.start()

    this.setSimulationInterval(() => this.updatePhysics(), 1000 * this.fixedTimeStep);
  }

  onJoin(client: Client, options:any) {
    console.log(`${client.sessionId} joined the MainRoom.`, options, client.auth);
    try {
      client.userData = { ...client.userData, ...options };

      if(!this.state.players.has(options.userId)){
        client.auth.profile.isClient = true
        let player = new BasePlayerState({})
        this.state.players.set(options.userId, player)
      }
    } catch (e) {
        console.log('on join error', e)
    }
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left the MainRoom.`);
    // let player = this.state.players.get(client.userData.userId)
    // GlobalDustManager.removePlayer(player.userId)

    // // if(player.flying){
    // //   this.state.world.removeBody(player.planeBody)
    // // }

    // deletePlayerPhysicsObjects(this, player)
    // player.saveGameData()

    //  if(player.currentGame !== ""){
    //       let currentGame:any
    //       switch(player.currentGame){
    //         case lightStopperSlug:
    //           break;
    
    //         case policeTrainerSlug:
    //           currentGame = this.state.policeTrainer.get(client.userData.userId)
    //           if(currentGame){
    //             currentGame.clearGame(this, player)
    //           }
    //           break;
    //       }
    //     }
        
    // this.state.players.delete(client.userData.userId)

    // checkGameState(this, player)

    // // addPlayfabEvent({
    // //   EventName: 'Player_Leave',
    // //   Body:{
    // //     'room': 'Main_Room',
    // //     'player':client.userData.userId,
    // //     'name':client.userData.name,
    // //     'playTime': Math.floor(Date.now()/1000) - player.startTime
    // //   }
    // // })
  }

  onDispose() {
    console.log("Disposing physics world and removing all bodies...");
    // checkGameState(this)

    // this.state.world.bodies.forEach((body:CANNON.Body) => {
    //   try{
    //     if (body) {
    //       this.state.world.removeBody(body);
    //       console.log('removing body')
    //   }
    //   }
    //   catch(e:any){
    //     console.log('error removing body at on dispose', e)
    //   }
    // });
    // this.state.world.bodies.length = 0
    // this.state.world = null;

    // try{
    //   this.physicsRefs.clear()
    // }
    // catch(e:any){
    //   console.log('error clearing physics ref on dispose', e)
    // }
   

    // console.log("Physics world disposed successfully!");
    // removeBlitzRoom(this)
  }
  updatePhysics() {
    // Step the physics world
    // physicsWorld.step();

    // // Sync players
    // this.state.players.forEach((player, id) => {
    //   const rigidBody = physicsWorld.getRigidBody(id); // Assuming player has a rigid body
    //   if (rigidBody) {
    //     const pos = rigidBody.translation();
    //     player.lastPosition = pos
    //     // player.rotation = rigidBody.rotation().angle(); // Simplified
    //   }
    // });

    // Sync bullets (with CCD)
    // this.state.bullets.forEach((bullet, id) => {
    //   const rigidBody = physicsWorld.getRigidBody(id);
    //   if (rigidBody) {
    //     const pos = rigidBody.translation();
    //     bullet.x = pos.x;
    //     bullet.y = pos.y;
    //     bullet.z = pos.z;

    //     // // Check collisions (Rapier handles CCD automatically)
    //     // physicsWorld.contactsWith(rigidBody, (collider) => {
    //     //   // Handle hit (e.g., player or wall)
    //     //   this.removeBullet(id);
    //     // });
    //   }
    // });
  }
}