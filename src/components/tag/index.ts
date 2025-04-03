import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { BlitzRoom } from "../../rooms/BlitzRoom"
import { LaserBeamObject, laserTagSlug } from "./constants";
import { addPlayerBody, LaserPlayerState } from "./LaserPlayerState";
import { CANNON } from "../../utils/libraries";


export class LaserTagState extends Schema {
    @type("number")
    gameTime: number = 0;
  
    @type("boolean")
    isGamePlaying: boolean = false;
  
    @type("boolean")
    isGameActive: boolean = false;
  
    @type("boolean")
    isGameStarting: boolean = false;

    @type({ map: LaserPlayerState }) 
    players = new MapSchema<LaserPlayerState>();

    // @type({map:LaserBeamObject})
    // laserBeams:MapSchema<LaserBeamObject> = new MapSchema()

    playerBodies: { [id: string]: CANNON.Body } = {};
    projectileBodies: { [id: string]: CANNON.Body } = {};

    room:BlitzRoom

    constructor(room:BlitzRoom){
        super()
        this.room = room
    }

    raycastProjectile(
        startPosition:CANNON.Vec3,
        direction: { x: number; y: number; z: number },
        // shooterTeam: "red" | "blue"
      ): { endPos: CANNON.Vec3; height: number; hitPlayerId: string | null } {
        const start = new CANNON.Vec3(startPosition.x, startPosition.y + 1, startPosition.z);
        // Normalize direction (Z is forward, Y is up, X is lateral)
        const dirVec = new CANNON.Vec3(direction.x, direction.y, direction.z);
        dirVec.normalize();

        // Scale to max distance (120 units)
        const end = start.clone().vadd(dirVec.scale(100));

        const ray = new CANNON.Ray(start, end);
        const result = new CANNON.RaycastResult();

        console.log('start and end ray is', start, end)
       ray.intersectBodies(Object.values(this.playerBodies), result);

       if (result.hasHit) {
        const hitBody = result.body;
        const hitPlayerId = Object.keys(this.playerBodies).find(
          (id) => this.playerBodies[id] === hitBody
        );
        // if (hitPlayerId && this.state.players[hitPlayerId]?.team !== shooterTeam) {
          const hitPoint = result.hitPointWorld;
          const height = start.distanceTo(hitPoint);
          console.log('hit body', hitPlayerId, hitPoint)
          return { endPos: hitPoint, height, hitPlayerId };
        // }
        // return { endPos: hitPoint, height, hitPlayerId };
      }
  
      return { endPos: end, height: 120, hitPlayerId: null };
    }

    createStaticProjectile(
        startPos: CANNON.Vec3,
        endPos: CANNON.Vec3,
        height: number,
        direction: { x: number; y: number; z: number },
        // team: "red" | "blue",
        id: string,
        userId:string
      ) {
        const radius = 0.2;
        const shape = new CANNON.Cylinder(radius, radius, height, 16);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(shape);
    
        const midX = (startPos.x + endPos.x) / 2;
        const midY = (startPos.y + endPos.y) / 2;
        const midZ = (startPos.z + endPos.z) / 2;
        body.position.set(midX, midY, midZ);

        // Normalize direction (Z is forward, Y is up)
        const forward = new CANNON.Vec3(direction.x, direction.y, direction.z);
        forward.normalize();
        const cannonUp = new CANNON.Vec3(0, 1, 0);
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromVectors(cannonUp, forward);
        body.quaternion.copy(quaternion);
    
        this.room.state.world.addBody(body);

        const beamData = {
            px: midX,
            py: midY,
            pz: midZ,
            rx: body.quaternion.x,
            ry: body.quaternion.y,
            rz: body.quaternion.z,
            rw: body.quaternion.w,
            length: height,
            direction: { x: forward.x, y: forward.y, z: forward.z },
            userId: userId // Include shooter’s userId
          };

        // Broadcast to all clients
        this.room.broadcast(laserTagSlug, {
            action: "shoot-beam",
            beamId: id,
            ...beamData
        });
        // this.laserBeams.set(id, new LaserBeamObject({
        //     px:midX,
        //     py:midY,
        //     pz:midZ,
        //     rx:body.quaternion.x,
        //     ry:body.quaternion.y,
        //     rz:body.quaternion.z,
        //     rw:body.quaternion.w,
        //     length:height
        // }))
    
        // this.projectiles[id] = {
        //   x: midX,
        //   y: midY,
        //   z: midZ,
        //   quaternion: {
        //     x: body.quaternion.x,
        //     y: body.quaternion.y,
        //     z: body.quaternion.z,
        //     w: body.quaternion.w,
        //   },
        //   height,
        //   team,
        //   owner: id.split("-")[0],
        // };
    
        this.projectileBodies[id] = body;

        // Remove after 100ms
        setTimeout(() => this.removeProjectile(id), 100);
      }
    
      removeProjectile(id: string) {
        try{
            const body = this.projectileBodies[id];
            if (body) {
              this.room.state.world.removeBody(body);
              delete this.projectileBodies[id];
            //   this.laserBeams.delete(id)
            }
        }
        catch(e:any){
            console.log('error removing laser beam body', e)
        }
      }
}

export function createLaserTag(room:BlitzRoom){
    room.state.laserTag.set(laserTagSlug, new LaserTagState(room))
    room.onMessage(laserTagSlug, (client:Client, info:any) => {
        if(!info.action) return;

        let laserTagGame = room.state.laserTag.get(laserTagSlug)
        if(!laserTagGame)   return;

        let player:any

        switch(info.action){
            case 'start':
                let basePlayer = room.state.players.get(client.userData.userId)
                if(!basePlayer) return;

                let newLaserTagPlayer = new LaserPlayerState(room, basePlayer.args, client)
                let playerBody = addPlayerBody(room, client)

                laserTagGame.players.set(client.userData.userId, newLaserTagPlayer)
                laserTagGame.playerBodies[client.sessionId] = playerBody;
                console.log('player joined laser tag')
                break;

            case 'player-move':
                player = laserTagGame.players.get(client.userData.userId)
                if(!player)  return;

                // if(!player.isSpectator){
                    let physicsRef = room.physicsRefs.get(player.userId)
                    if(physicsRef){
                        const playerPos = new CANNON.Vec3(info.playerPos.x, info.playerPos.y + 1, info.playerPos.z);
                        physicsRef.body.position.set(playerPos.x, playerPos.y, playerPos.z)
            
                        let dist = player.calcDistanceMoved(playerPos)
                        if (dist > 10) {
                        console.log('is player cheating their position?', player.name, player.userId)
                        // return
                        // Possibly ignore or clamp
                        // e.g. skip distanceTraveled increment or revert position
                        }
            
                        // Accumulate distance
                        player.distanceTraveled += Math.floor(dist);
            
                        // Update "last" position
                        player.px = playerPos.x
                        player.py = playerPos.y
                        player.pz = playerPos.z

                        player.lastPosition.x = playerPos.x;
                        player.lastPosition.y = playerPos.y;
                        player.lastPosition.z = playerPos.z;

                        // console.log('player position', player.lastPosition)
                    // }
                    }
                break;

            case 'shoot':
                // console.log('shooting beam', info)
                const projectileId = `${client.sessionId}-${Date.now()}`;

                 // *** Here is where raycastProjectile is called ***
                const { endPos, height, hitPlayerId } = laserTagGame.raycastProjectile(
                    info.position,
                    info.direction,
                    // player.team
                );

                // Create projectile as a long cylinder
                const projectileBody = laserTagGame.createStaticProjectile(
                info.position,
                endPos,
                height,
                info.direction,
                // player.team,
                projectileId,
                client.userData.userId
                );
                break;

            case 'reload':
                break;
        }
  })
}

// export function updateTagObjects(room: BlitzRoom, dt: number) {
//     const now = Date.now();
//     room.physicsRefs.forEach((ref, key) => {
//         const { body, laserTagBeam } = ref; // Ensure we check only Arcade objects

//         if(bulletId){
//             let player = room.state.players.get((body as any).gameId)
//             // Handle object removal (bullets should be destroyed after 2s)
//             if ((body as any).spawnTime + 5000 < now) {
//                 room.state.world.removeBody(body);
//                 room.physicsRefs.delete(key); // Remove from physicsRefs map
//                 if(player){
//                     player.client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'remove-bullet', bulletId})
//                 }
//             }else{
//                 if(player){
//                     player.client.send(policeTrainerSlug, { 
//                         exercise: ExcerciseType.JUDGEMENT, 
//                         action: 'move-bullet',
//                         bulletId:(body as any).id,  
//                         position: body.position
//                     });
//                 }
//             }
//         }

//         // if (arcadeId) {
//         //     // Find Arcade object in state
//         //     const arcadeState = room.state.arcadeObjects.find(obj => obj.id === arcadeId);
//         //     if (arcadeState) {
//         //         // Sync position
//         //         arcadeState.px = body.position.x;
//         //         arcadeState.py = body.position.y;
//         //         arcadeState.pz = body.position.z;

//         //         // Sync rotation
//         //         arcadeState.rx = body.quaternion.x;
//         //         arcadeState.ry = body.quaternion.y;
//         //         arcadeState.rz = body.quaternion.z;
//         //         arcadeState.rw = body.quaternion.w;
//         //     }

//         //     // Handle object removal (bullets should be destroyed after 2s)
//         //     if (arcadeState?.type === "bullet" && arcadeState.spawnTime + 2000 < now) {
//         //         room.state.world.removeBody(body);
//         //         room.state.arcadeObjects.delete(arcadeState.id);
//         //         room.physicsRefs.delete(key); // Remove from physicsRefs map
//         //     }
//         // }
//     });
// }