import { Client } from "colyseus"
import { BlitzRoom } from "../../rooms/BlitzRoom"
import { lightStopperSlug, LightStopperState, handleLightStopperMessage } from "./LightStopperState"
import {handlePoliceTrainerMessage } from "./PoliceTrainerState"
import { bulletMaterial, ExcerciseType, policeTrainerSlug } from "./constants"
import { CANNON } from "../../utils/libraries"
import { groundMat } from "../soccer/constants"
import { handleFroggerMessage } from "./FroggerState"
import { froggerSlug } from "./FroggerConstants"
import { billiardsSlug } from "./BilliardsConstants"
import { BilliardsState, handleBilliardsMessage } from "./BilliardState"
import { bowlingSlug } from "../bowling.ts/constants"
import { BowlingLane, handleBowlingMessage } from "../bowling.ts"

export function createArcade(room:BlitzRoom){
    // room.state.lightStopper.set(lightStopperSlug, new LightStopperState())
    // room.state.billiards.set(billiardsSlug, new BilliardsState(room))

    let xOffset = 0
    for(let i = 0; i < 5; i++){
        room.state.bowlingLanes.set("lane-" + i, new BowlingLane(i, room, xOffset))
        xOffset+= 3.1
    }

    room.onMessage(lightStopperSlug, (client:Client, info:any) => handleLightStopperMessage(room, client, info))
    room.onMessage(policeTrainerSlug, (client:Client, info:any) => handlePoliceTrainerMessage(room, client, info))
    room.onMessage(froggerSlug, (client:Client, info:any) => handleFroggerMessage(room, client, info))
    room.onMessage(billiardsSlug, (client:Client, info:any) => handleBilliardsMessage(room, client, info))
    room.onMessage(bowlingSlug, (client:Client, info:any) => handleBowlingMessage(room, client, info))
    
    // Define Contact Material properties
    const bulletGroundMaterial = new CANNON.ContactMaterial(
        bulletMaterial, // First material (player)
        groundMat,   // Second material (ball)
        {
          friction: 0.1,       // Low friction (so ball moves easily)
          restitution: 0.7,    // High restitution (ball bounces off players)
        }
      );
    room.state.world.addContactMaterial(bulletGroundMaterial)
}

export function updateArcadeObjects(room: BlitzRoom, dt: number) {
    const now = Date.now();
    room.physicsRefs.forEach((ref, key) => {
        const { body, arcadeId, bulletId } = ref; // Ensure we check only Arcade objects

        if(bulletId){
            let player = room.state.players.get((body as any).gameId)
            // Handle object removal (bullets should be destroyed after 2s)
            if ((body as any).spawnTime + 5000 < now) {
                room.state.world.removeBody(body);
                room.physicsRefs.delete(key); // Remove from physicsRefs map
                if(player){
                    player.client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'remove-bullet', bulletId})
                }
            }else{
                if(player){
                    player.client.send(policeTrainerSlug, { 
                        exercise: ExcerciseType.JUDGEMENT, 
                        action: 'move-bullet',
                        bulletId:(body as any).id,  
                        position: body.position
                    });
                }
            }
        }

        // if (arcadeId) {
        //     // Find Arcade object in state
        //     const arcadeState = room.state.arcadeObjects.find(obj => obj.id === arcadeId);
        //     if (arcadeState) {
        //         // Sync position
        //         arcadeState.px = body.position.x;
        //         arcadeState.py = body.position.y;
        //         arcadeState.pz = body.position.z;

        //         // Sync rotation
        //         arcadeState.rx = body.quaternion.x;
        //         arcadeState.ry = body.quaternion.y;
        //         arcadeState.rz = body.quaternion.z;
        //         arcadeState.rw = body.quaternion.w;
        //     }

        //     // Handle object removal (bullets should be destroyed after 2s)
        //     if (arcadeState?.type === "bullet" && arcadeState.spawnTime + 2000 < now) {
        //         room.state.world.removeBody(body);
        //         room.state.arcadeObjects.delete(arcadeState.id);
        //         room.physicsRefs.delete(key); // Remove from physicsRefs map
        //     }
        // }
    });
}
