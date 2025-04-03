import { Schema, type } from "@colyseus/schema";
import { Client, Delayed, generateId } from "colyseus";
import { BlitzRoom } from "../../rooms/BlitzRoom";

let arcadePosition:any = {x:28, y:100, z:98}
let groundPosition:any = {x:44.5, y:1, z:98.5}

export class SpaceshipState extends Schema {
  @type("string") status = "arriving"; // ["waiting", "ascending", "arrived", "departing"]
  @type("number") px = 44.5;
  @type("number") py = 500;
  @type("number") pz = 98.5;
  @type("number") rotationY = 0; // Rotation angle around Y-axis

  @type("number") time = 0

  room:BlitzRoom
  flyingInterval:Delayed

  currentManifest:string[] = []
  newManifest:string[] = []

  entity:any
  clickEntity:any
  rotationEntity:any
  floorEntity:any
  textShape:any

  constructor(room:BlitzRoom){
    super()
    this.room = room
    this.flyToGround()
  }

  startFlyToArcadeCountdown(){
    console.log('starting flying countdown')
    let startTime = Date.now();
    let waitTime = 1000 * 10
    this.flyingInterval = this.room.clock.setInterval(() => {
        let progress = (Date.now() - startTime) / waitTime;
      if (progress >= 1) {
        this.time = 0
        this.status = "flying";
        this.currentManifest = [...this.newManifest]
        this.newManifest.length = 0
        this.flyingInterval.clear()
        this.flyingToArcade()
      }else{
        if(progress >= 0.2){
          this.currentManifest.forEach((userId:string)=>{
            let player = this.room.state.players.get(userId)
            if(player){
    
              player.client.send('land-ground')
            }
          })
          this.currentManifest.length = 0
        }

        this.time = progress * 10
      }
    }, 100);
  }

  flyingToArcade() {
    console.log('flyng to arcade')

    this.currentManifest.forEach((userId:string)=>{
      let player = this.room.state.players.get(userId)
      if(player){
        player.inSpaceship = false
      }
    })

    this.status = "ascending";

    let startPos:any = {...groundPosition}
    let targetPos:any = {...arcadePosition}

    let startRotation = this.rotationY;
    let targetRotation = this.rotationY + 180; // Rotate another 180° when flying up

    let flightTime = 1000 * 7;
    let rotationTime = 1000 * 1;

    let startTime = this.room.clock.elapsedTime; // Use Colyseus clock for accuracy
    this.flyingInterval = this.room.clock.setInterval(() => {
      let elapsed = this.room.clock.elapsedTime - startTime;
      let progress = Math.min(elapsed / flightTime, 1); // Progress for position
      let rotationProgress = elapsed / rotationTime;

      if (progress >= 1) {
        this.time = 0
        this.px = targetPos.x;
        this.py = targetPos.y;
        this.pz = targetPos.z;

        this.status = "arrived";
        this.flyingInterval.clear()
        this.waitAtArcade();
      } else {
        this.px = startPos.x + progress * (targetPos.x - startPos.x);
        this.py = startPos.y + progress * (targetPos.y - startPos.y);
        this.pz = startPos.z + progress * (targetPos.z - startPos.z);
        // this.time = progress * 10
      }

      // Interpolate rotation over 2 seconds
      if (rotationProgress < 1) {
        this.rotationY = startRotation + rotationProgress * (targetRotation - startRotation);
      } else {
          this.rotationY = targetRotation % 360; // Final rotation after 2 seconds
      }

    }, 100);
    }

    flyToGround() {
      console.log('flying to ground')
        this.status = "descending";

        let startPos:any = {...arcadePosition}
        let targetPos:any = {...groundPosition}

        let startRotation = this.rotationY;
        let targetRotation = 0; // Rotate another 180° when flying up
    
        let flightTime = 1000 * 10; // 5 seconds
        let rotationTime = 1000 * 1;

        
        let startTime = this.room.clock.elapsedTime; // Use Colyseus clock for accuracy

        this.flyingInterval = this.room.clock.setInterval(() => {
          let elapsed = this.room.clock.elapsedTime - startTime;
          let progress = elapsed / flightTime;
          let rotationProgress = elapsed / rotationTime;

          if (progress >= 1) {
            this.time = 0
            this.px = targetPos.x;
            this.py = targetPos.y;
            this.pz = targetPos.z;
            // this.rotationY = targetRotation % 360; // Keep rotation within 0-360°
            this.status = "waiting";
            this.flyingInterval.clear()
            this.startFlyToArcadeCountdown();
          } else {
            this.px = startPos.x + progress * (targetPos.x - startPos.x);
            this.py = startPos.y + progress * (targetPos.y - startPos.y);
            this.pz = startPos.z + progress * (targetPos.z - startPos.z);
          }

          // Interpolate rotation over 2 seconds
          if (rotationProgress < 1) {
            this.rotationY = startRotation + rotationProgress * (targetRotation - startRotation);
          } else {
              this.rotationY = targetRotation % 360; // Final rotation after 2 seconds
          }

        }, 100);
        }

    waitAtArcade(){
      console.log('waiting at arcade')
        let startTime = Date.now();
        let waitTime = 1000 * 10
        this.flyingInterval = this.room.clock.setInterval(() => {
            let progress = (Date.now() - startTime) / waitTime;
          if (progress >= 1) {
            this.time = 0
            this.status = "descending";
            this.flyingInterval.clear()
            this.currentManifest = [...this.newManifest]
            this.newManifest.length = 0
            this.flyToGround()
          }else{
            if(progress >= 0.2){
              this.currentManifest.forEach((userId:string)=>{
                let player = this.room.state.players.get(userId)
                if(player){
        
                  player.client.send('land-arcade')
                }
              })
              this.currentManifest.length = 0
            }

            this.time = progress * 10
          }
        }, 100);
      }
}

export function addSpaceship(room:BlitzRoom){
    let id = generateId(5)
    room.state.spaceships.set(id, new SpaceshipState(room))
}

function attemptArcadeCountdown(room:BlitzRoom, client:Client){
    let spaceship:SpaceshipState
    let destination = "init-fly-arcade"

    room.state.spaceships.forEach((ship:SpaceshipState, id:string)=>{
        if(ship.status === "waiting"){
            spaceship = ship
        }

        if(ship.status === "arrived"){
          spaceship = ship
          destination = 'init-fly-ground'
        }
    })

    if(spaceship){
      let player = room.state.players.get(client.userData.userId)
      if(!player) return;
        spaceship.newManifest.push(player.userId)
        player.inSpaceship = true
        client.send(destination)
        return
    }

    console.log('no spaceship at ground')
}

export function handleSpaceshipListeners(room:BlitzRoom, client:Client, info:any){
    switch(info.action){
        case 'init':
            attemptArcadeCountdown(room, client)
            break;
    }
}