import { Room, Client, generateId, Delayed } from "colyseus";
import { Schema, type, ArraySchema } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";
import { CAR_TYPES, FROGGER_CAR_BODY_GROUP, FROGGER_PLAYER_BODY_GROUP, FroggerCar, FroggerPlayer, FroggerPowerUp, froggerSlug, LANE_POSITIONS, SPAWN_INTERVALS_BY_LEVEL } from "./FroggerConstants";
import { BlitzRoom } from "../../rooms/BlitzRoom";

/** 
 * Weighted random pick utility 
 * Picks an item based on its 'weight' property 
 */
function weightedRandomPick<T extends { weight: number }>(items: T[]): T {
    const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      if (random < item.weight) {
        return item;
      }
      random -= item.weight;
    }
    // Fallback if rounding errors occur
    return items[items.length - 1];
  }


export class FroggerState extends Schema {
    // Cannon world for this game mode
    private world: CANNON.World;

    // Single player (no schema)
    private player: FroggerPlayer;

    // Arrays / maps to store objects
    private cars: Map<string, FroggerCar> = new Map();
    private carBodies: Map<string, CANNON.Body> = new Map();

    private powerUps: Map<string, FroggerPowerUp> = new Map();
    private powerUpBodies: Map<string, CANNON.Body> = new Map();
    private pendingRemovals: CANNON.Body[] = [];

    private playerBody: CANNON.Body;

    // Difficulty
    private level: number = 1;
    private score: number = 0;

    // Timers
    private levelTimer = 0;  // increments each frame, triggers level up
    private lastSpawnTime = 0;
    private spawnInterval = SPAWN_INTERVALS_BY_LEVEL[1];
    private simulationInterval:any

    room:BlitzRoom

    constructor(room:BlitzRoom, client:Client){
        super()

        this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, 0, 0) });

        // 2) Create player
        this.player = {
        active: true,
        x: 0,
        y: -5,
        z: 0,
        width: 1,
        height: 1,
        length: 1,
        client:client
        };

        this.playerBody = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.8, 0.35)),
            position: new CANNON.Vec3(0, -5, 0),
          });
        (this.playerBody as any).isPlayer = true
        this.playerBody.collisionFilterGroup = FROGGER_PLAYER_BODY_GROUP
        this.playerBody.collisionFilterMask = FROGGER_CAR_BODY_GROUP

        // Attach collision listener to the player, not each car
        this.playerBody.addEventListener("collide", this.handleCollision);

        this.world.addBody(this.playerBody);

        this.resetSimulationData()

        this.simulationInterval = setInterval(()=>{this.update(10 / 1000)}, 10)
    }

    private handleCollision = (event: any) => {
        const carBody = (event.body as any).isCar ? event.body : null;
        if (!carBody) return;
      
        console.log('player hit car')
        // remove the event listener so no further collisions are fired
        event.target.removeEventListener("collide", this.handleCollision);
      
        // do not remove the body from the world here
        // just mark it for removal
        // this.pendingRemovals.push(carBody);
      };

    quitGame(){
        clearInterval(this.simulationInterval)
        this.world.bodies.forEach((body:CANNON.Body)=>{
            this.world.removeBody(body)
        })
        this.world.bodies.length = 0
        this.world = null
    }

    resetSimulationData(){
        this.level = 1
        this.score = 0
    }

    update(dt:number){
        this.world.step(1/60, dt, 3)

         // Now remove any queued bodies
        if (this.pendingRemovals.length > 0) {
            for (const body of this.pendingRemovals) {
            // remove from world
            if (body.world) {
                body.world.removeBody(body);
            }
            // also remove from your data structures
            const carId = (body as any).carId;
            this.cars.delete(carId);
            }
            this.pendingRemovals = [];
        }

        this.levelTimer += dt

        if (this.levelTimer >= 20) {
            this.levelTimer = 0;
            this.level++;
        
            // set spawnInterval from the table, or clamp if out of range
            if (SPAWN_INTERVALS_BY_LEVEL[this.level]) {
              this.spawnInterval = SPAWN_INTERVALS_BY_LEVEL[this.level];
            } else {
              // if we exceed the table, you can clamp to the final entry:
              this.spawnInterval = SPAWN_INTERVALS_BY_LEVEL[5]; 
            }
          }

        this.lastSpawnTime += dt

         // Spawn logic
        if (this.lastSpawnTime >= this.spawnInterval) {
            this.spawnCars();
            // this.spawnPowerUp();
            this.lastSpawnTime = 0;
        }

        // Move cars
        this.moveCars(dt);

        // Check collisions
        // this.checkCarCollisions();
        // this.checkPowerUpCollisions();

        // Level up
        // if (this.levelTimer >= 20) {
        // this.levelTimer = 0;
        // this.level += 1;
        // }

        // If you want to send full game updates each tick:
        // this.broadcastStateToClient(); // Or just client.send
        const data = {
            // player: this.player,
            cars: this.cars,
            // powerUps: Array.from(this.powerUps.values()),
            level: this.level,
            score: this.score,
          };

        this.player.client.send(froggerSlug, {action:'frogger-update', data:data})
    }

    private spawnCars() {
        console.log('spawning cars')
        const eligibleCarTypes = CAR_TYPES.filter((ct) => ct.minLevel <= this.level);
        if (eligibleCarTypes.length === 0) return;

        console.log('eligible cars to spawn', eligibleCarTypes)
    
        const carsToSpawn = 1 + Math.floor(Math.random() * this.level);
        for (let i = 0; i < carsToSpawn; i++) {
          const typeDef = weightedRandomPick(eligibleCarTypes);
          const carId = `car_${Date.now()}_${Math.random()}`;

          console.log('spawning car', typeDef.type)

          //choose lane
           // Pick a random lane from the array
        const laneIndex = Math.floor(Math.random() * LANE_POSITIONS.length);
        const lane = LANE_POSITIONS[laneIndex];

       
        console.log('choosing lane', lane)

        // Then use lane.x, lane.y, lane.z for your spawn position
        const xPos = lane.x;
        const yPos = lane.y;
        const zPos = lane.z;
    
          const baseSpeed = 1 + this.level * 0.5 + Math.random() * 0.5;
          const finalSpeed = baseSpeed * typeDef.speedModifier;
    
          // Cannon body (kinematic if mass=0)
          const body = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(typeDef.width / 2, typeDef.height / 2, typeDef.length / 2)),
            position: new CANNON.Vec3(xPos, yPos, zPos),
          });
          (body as any).isCar = true;
          (body as any).carId = carId;
          body.collisionFilterGroup = FROGGER_CAR_BODY_GROUP
          body.collisionFilterMask = FROGGER_PLAYER_BODY_GROUP

          this.world.addBody(body);
    
          // Store references
          this.carBodies.set(carId, body);
          this.cars.set(carId, {
            id: carId,
            type: typeDef.type,
            x: xPos,
            y: yPos,
            z: zPos,
            width: typeDef.width,
            height: typeDef.height,
            length: typeDef.length,
            speed: finalSpeed,
            minLevel: typeDef.minLevel,
            weight:typeDef.weight
          });
        }
      }

    private removeCar(carId:string, body:CANNON.Body){
        this.carBodies.delete(carId);
        this.world.removeBody(body);
        this.cars.delete(carId);
        this.player.client.send(froggerSlug, {action:'remove-car', carId})
    }

    private moveCars(dt: number) {
        this.cars.forEach((car, carId) => {
          const body = this.carBodies.get(carId);
          if (!body) return;
    
          body.position.z -= car.speed * dt;
          // remove if off-screen
           // If it goes behind z < -10, remove or reset
            if (body.position.z < 0) {
                this.removeCar(carId, body)
            } else {
                // Sync local data
                car.x = body.position.x;
                car.y = body.position.y;
                car.z = body.position.z;
            }
        });
      }

      updatePlayerPosition(newPosition:any){
        this.playerBody.position.x = newPosition.x
        this.playerBody.position.y = newPosition.y
        this.playerBody.position.z = newPosition.z
      }
}


export function handleFroggerMessage(room:BlitzRoom, client:Client, info:any){
    // console.log('handling Frogger message', info)
    if(!info.action) return;

    let player = room.state.players.get(client.userData.userId)
    if(!player)  return;

    switch(info.action){
            case 'quit-frogger':
                console.log('player wants to quit frogger')
                player.currentGame = ""
                //need to think of other timers and things to cancel at the main menu level
                let froggerGame = room.state.frogger.get(client.userData.userId)
                if(!froggerGame)    return;
                froggerGame.quitGame()

                room.state.frogger.delete(client.userData.userId)
                break;
    
            case 'start':
                // if(player.currentGame !== "" || room.state.policeTrainer.has(client.userData.userId))   return;
    
                player.currentGame = froggerSlug
    
                let newFroggerGame = new FroggerState(room, client)
                room.state.frogger.set(client.userData.userId, newFroggerGame)
                client.send(froggerSlug, {action:"start"})
                break;

            case 'player-move':
                let playerGame = room.state.frogger.get(client.userData.userId)
                if(!playerGame)  return;

                playerGame.updatePlayerPosition(info.position)
                break;
    
    }
}
