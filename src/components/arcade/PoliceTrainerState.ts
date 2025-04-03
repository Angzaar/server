import { Room, Client, generateId, Delayed } from "colyseus";
import { Schema, type, ArraySchema } from "@colyseus/schema";
import { Vec3 } from "../../utils/Vec3";
import { BlitzRoom } from "../../rooms/BlitzRoom";
import { CANNON } from "../../utils/libraries";
import { STAGE_DIFFICULTY, ExcerciseType, arcadeBodyShapes, policeTrainerSlug, POLICE_TRAINER_TARGET_BULLET, POLICE_TRAINER_TARGET_GROUP, bulletMaterial, SPEED_EXERCISE_GRID } from "./constants";
import { GROUP_WORLD } from "../soccer/constants";
import { BasePlayerState } from "../BasePlayerState";
import { PlayerState } from "../soccer/PlayerState";

class Bullet {
    id: string;
    body: CANNON.Body;
    spawnTime: number;
    entity:any
    px:number = 0
    py:number = 0
    pz:number = 0

    constructor(room:BlitzRoom, gameId:string, position: Vec3, direction: Vec3) {
        this.id = generateId(5);
        this.spawnTime = Date.now();

        // Create physics body
        this.body = new CANNON.Body({
            mass: 1, // Small mass so it can hit targets
            material:bulletMaterial,
            shape: arcadeBodyShapes[policeTrainerSlug][ExcerciseType.JUDGEMENT].bullet,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            velocity: new CANNON.Vec3(direction.x * 100, direction.y * 100, direction.z * 100), // Set bullet speed
            collisionFilterGroup: POLICE_TRAINER_TARGET_BULLET, // Group for bullets
            collisionFilterMask: POLICE_TRAINER_TARGET_GROUP | GROUP_WORLD,  // Should collide with targets
        });

        this.px = position.x;
        this.py = position.y;
        this.pz = position.z;

        (this.body as any).gameId = gameId;
        (this.body as any).spawnTime = Date.now();
        (this.body as any).id = this.id;

        room.physicsRefs.set(this.id, { body: this.body, bulletId: this.id });
        room.state.world.addBody(this.body);
    }
}


class Target {
    id:string
    isBadGuy: boolean;
    isUp: boolean = false; // Swivel state
    flipUpSpeed: number;
    flipDownSpeed: number;
    flipDelay: number;
    position: Vec3;
    width: number = 1.5;
    height: number = 2;
    body: CANNON.Body;
    scorePerHit:number = 0

    entity:any
    timeout:any

    constructor(room:BlitzRoom, client:Client, isBadGuy: boolean, flipUpSpeed: number, flipDownSpeed: number, flipDelay: number, position: Vec3, score:number) {
        this.id = generateId(5)
        this.isBadGuy = isBadGuy;
        this.flipUpSpeed = flipUpSpeed;
        this.flipDownSpeed = flipDownSpeed;
        this.flipDelay = flipDelay;
        this.position = position;
        this.scorePerHit = score

        // // // Create physics body
        // this.body = new CANNON.Body({
        //     mass: 0, // Static object (doesn't move on impact)
        //     shape: arcadeBodyShapes[policeTrainerSlug][ExcerciseType.JUDGEMENT].target,
        //     position: new CANNON.Vec3(position.x, position.y, position.z), // Centered
        //     collisionFilterGroup: POLICE_TRAINER_TARGET_GROUP, // Group for bullets
        //     collisionFilterMask: POLICE_TRAINER_TARGET_BULLET,  // Should collide with targets
        //     // type: CANNON.Body.KINEMATIC // Moves but not affected by physics
        // });

        // this.body.quaternion.copy(new CANNON.Quaternion().setFromEuler(0, 0, 0));

        // this.body.addEventListener('collide', (event:any)=>{
        //     console.log('bullet hit target')
        //     // if(!room.state.isGameActive || !room.state.isGamePlaying) return
        //     try{
        //         // handleCollision(room, event.body, event.target)
        //     }
        //     catch(e:any){
        //       console.log('error ball on collide', e)
        //     }
        //   })

        // room.state.world.addBody(this.body);
        // room.physicsRefs.set(this.id, { body: this.body, arcadeId: this.id });
    }
}

class EnemyShooterExercise {
    stageNumber: number = 1;
    totalStages:number = 6;
    targets:Target[] = []
    ammo:number = 36
    quota:number = 900
    score:number = 0
    timeout:any

    policeTrainerState:PoliceTrainerState

    constructor(parent:PoliceTrainerState){
        this.policeTrainerState = parent
    }

    startStage(room:BlitzRoom, client:Client, stageNumber: number) {
        this.stageNumber = stageNumber;
        this.targets.length = 0;
        client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'update-stage', totalStages:this.totalStages, stage:this.stageNumber})

        const { targets, scorePerHit, badGuyChance, flipUpSpeed, flipDownSpeed, flipDelay, minBadGuys } = STAGE_DIFFICULTY[ExcerciseType.JUDGEMENT][stageNumber];
        let targetList = [];

         // ✅ Ensure at least `minBadGuys` are assigned randomly
         let badGuyIndexes = new Set();
         while (badGuyIndexes.size < minBadGuys) {
             badGuyIndexes.add(Math.floor(Math.random() * targets.length));
         }

        for (let i = 0; i < targets.length; i++) {
            const isBadGuy = badGuyIndexes.has(i);
            let target = new Target(room, client, isBadGuy, flipUpSpeed, flipDownSpeed, flipDelay, targets[i].position,scorePerHit)
            targetList.push(target);
            this.sendTargetToClient(client, target);
        }

        // Randomize target order
        this.targets = [...targetList.sort(() => Math.random() - 0.5)]

        this.timeout = setTimeout(()=>{
            this.flipTargetsIndividually(room, client)
        }, 1000 * 3)
    }

    sendTargetToClient(client:Client, target:Target){
        // Remove `body` from the target object
        const targetData = { ...target };
        delete targetData.body;

        // Send to client
        client.send(policeTrainerSlug, { 
            exercise: ExcerciseType.JUDGEMENT, 
            action: 'create-target', 
            target: targetData 
        });
    }

    sendBulletToClient(client:Client, bullet:Bullet){
        const bulletData = {...bullet}
        delete bulletData.body;

        // Send to client
        client.send(policeTrainerSlug, { 
            exercise: ExcerciseType.JUDGEMENT, 
            action: 'create-bullet', 
            bullet: bulletData 
        });
    }

    flipTargetsIndividually(room:BlitzRoom, client:Client) {
        let flippedCount = 0;
        let delay = 0
        this.targets.forEach((target, index) => {
            target.timeout = setTimeout(() => {
                target.isUp = true;
                client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'target-up', index, isBadGuy:target.isBadGuy, speed:target.flipUpSpeed, stage:this.stageNumber})

                target.timeout = setTimeout(() => {
                    target.isUp = false;
                    client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'target-down', index, stage:this.stageNumber})

                    flippedCount++;

                    if (flippedCount === this.targets.length) {
                        this.clearTargetsAndProceed(room, client);
                    }
                }, 1500); // Flip down after 0.5s
            }, delay);
            delay += target.flipDelay
        });
    }

    clearTargetsAndProceed(room:BlitzRoom, client:Client) {
        this.timeout = setTimeout(() => {
            this.targets.length = 0

            if (this.stageNumber < 6) {
                console.log('starting new stage', this.stageNumber + 1)
                setTimeout(()=>{
                    this.startStage(room, client, this.stageNumber + 1);
                }, 1000)
                
                client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'clear-stage'})
                // room.broadcast("newStageStarted", { stage: this.stageNumber });
            } else {
                console.log('exercise complete')
                client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'clear-stage'})
                this.endExercise(room, client)
                // room.broadcast("exerciseCompleted", { finalScore: this.score });
            }
        }, 1000); // Short pause before proceeding to the next stage
    }

    endExercise(room:BlitzRoom, client:Client){
        let player = room.state.players.get(client.userData.userId)
        this.clearTimeouts()

        this.timeout = setTimeout(()=>{
            this.policeTrainerState.internalEndExercise(client, ExcerciseType.JUDGEMENT,  this.score >= this.quota)
        }, 1000 * 5)
    }

    clearGame(room:BlitzRoom, player?:PlayerState){
       this.clearTimeouts()

        if(player){
            player.client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'end-exercise'})

            room.state.policeTrainer.delete(player.userId)

            if(!player)  return;
            player.currentGame = ""
        }
    }

    clearTimeouts(){
        this.targets.forEach((target:Target)=>{
            clearTimeout(target.timeout)
        })
        clearTimeout(this.timeout)
    }

    handleShoot(room:BlitzRoom, player:PlayerState, info:any){
        let target = this.targets.find(target => target.id === info.targetId)
        // console.log('target is', target)
        // if(!target || !target.isUp || this.ammo <= 0) return;

        if(this.ammo - 1 < 0){
            this.ammo = 0
        }else{
            this.ammo--
        }

        player.client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'ammo-update', ammo:this.ammo})

        if(this.ammo <= 0){
            console.log('no more ammo or lives, need to end game')
            this.endExercise(room, player.client)
            return;
        }

        if(info.targetId === "none"){
            console.log('no target hit')
            return
        }

        if(!target){
            console.log('invalid target, cheating?')
            return
        }

        if(target.isBadGuy){
            this.score += target.scorePerHit
        }else{
            this.score -= target.scorePerHit
            if(this.score < 0){
                this.score = 0
            }
        }

        console.log('hit target')

        player.client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'hit-target', targetId:target.id})
        player.client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'score-update', score:this.score})
    }

    // handleRaycast(room:BlitzRoom, client:Client, info:any) {
    //     let rayOrigin:Vec3 = Vec3.create(info.rayOrigin.x, info.rayOrigin.y, info.rayOrigin.z)
    //     let rayDirection:Vec3 = Vec3.create(info.rayDirection.x, info.rayDirection.y, info.rayDirection.z)
    //     // Ensure shotDirection is normalized before use
    //     rayDirection = rayDirection.normalize();

    //     // console.log(rayOrigin)
    //     // console.log(rayDirection)

    //     const bullet = new Bullet(room, client.userData.userId, rayOrigin, rayDirection)
    //     this.sendBulletToClient(client, bullet)
    //     // Make sure Y component isn't too negative
    //     // if (rayDirection.y < 0) {
    //     //     rayDirection.y = 0; // Prevent downward bias
    //     // }

    //     let closestTargetIndex = -1;
    //     let closestDistance = Infinity;
        
    //     const shotLength = 25; // Max length of the shot
    //     const shotEnd = rayOrigin.add(rayDirection.scale(shotLength));



    //     // // ✅ Perform raycast check
    //     // const hitTarget = checkRaycastHit(room, rayOrigin, shotEnd, this.targets);
    //     // if (hitTarget) {
    //     //     console.log(`Hit detected on target ${hitTarget.id}`);

    //     //     // Process hit (score update, animation, etc.)
    //     //     // processTargetHit(hitTarget);
    //     // }

    //     // console.log('shot end', shotEnd)

    //     // for (let i = 0; i < this.targets.length; i++) {
    //     //     const target = this.targets[i];
    //     //     if (!target.isUp) continue;
    
    //     //     // Rectangle bounds
    //     //     const rectMinX = target.position.x - 0.75; // Left edge
    //     //     const rectMaxX = target.position.x + 0.75; // Right edge
    //     //     const rectMinY = target.position.y;        // Bottom edge
    //     //     const rectMaxY = target.position.y + 2;    // Top edge

    //     //     // Check if shot line intersects the rectangle
    //     //     if (this.lineIntersectsRectangle(rayOrigin, shotEnd, rectMinX, rectMaxX, rectMinY, rectMaxY, target.position.z)) {
    //     //         console.log('line hits plane')
    //     //         const distanceToShooter = Vec3.distance(rayOrigin, target.position);
    //     //         if (distanceToShooter < closestDistance) {
    //     //             closestDistance = distanceToShooter;
    //     //             closestTargetIndex = i;
    //     //         }
    //     //     }
    //     // }

    //     // if (closestTargetIndex !== -1) {
    //     //     console.log('hit target')
    //     //     this.processHit(closestTargetIndex, room);
    //     // }
    // }

    // lineIntersectsRectangle(start: Vec3, end: Vec3, rectMinX: number, rectMaxX: number, rectMinY: number, rectMaxY: number, planeZ: number): boolean {
    //     // Ensure the shot crosses the target's Z-plane
    //     // if ((start.z < planeZ && end.z < planeZ) || (start.z > planeZ && end.z > planeZ)) {
    //     //     return false; // The shot never reaches the target plane
    //     // }
    
    //     // Solve for t where the line reaches the Z-plane
    //     const t = (planeZ - start.z) / (end.z - start.z);
    //     if (t < 0 || t > 1) return false; // No valid intersection within the segment
    
    //     // Compute the intersection point at Z-plane
    //     const hitX = start.x + t * (end.x - start.x);
    //     const hitY = start.y + t * (end.y - start.y);

    //     console.log('minx', rectMinX)
    //     console.log('hitx', hitX)
    //     // console.log('hity', hitY)
    //     console.log('maxx', rectMaxX)

    //     console.log(hitX >= rectMinX && hitX <= rectMaxX)


    
    //     // Check if hit point falls inside the rectangle bounds
    //     return hitX >= rectMinX && hitX <= rectMaxX && hitY >= rectMinY && hitY <= rectMaxY;
    // }

    // processHit(index: number, room:BlitzRoom) {
    //     // const target = this.targets[index];
    //     // const { score, penalty } = STAGE_DIFFICULTY[this.stageNumber];

    //     // if (target.isBadGuy) {
    //     //     this.score += score;
    //     //     room.broadcast("targetHit", { index, isBadGuy: true, score: this.score });
    //     // } else {
    //     //     this.score += penalty;
    //     //     room.broadcast("targetHit", { index, isBadGuy: false, score: this.score });
    //     // }
    // }
}

class SpeedExercise {
    stageNumber: number = 1;
    totalStages:number = 1;
    targets:Target[] = []
    ammo:number = 36
    quota:number = 1200
    score:number = 0
    badGuyCount:number = 0
    targetIndex:number = 0
    timeout:any

    policeTrainerState:PoliceTrainerState

    constructor(parent:PoliceTrainerState){
        this.policeTrainerState = parent
    }

    clearGame(room:BlitzRoom, player?:PlayerState){
        this.clearTimeouts()
 
         if(player){
             player.client.send(policeTrainerSlug, {exercise:ExcerciseType.SPEED, action:'end-exercise'})
 
             room.state.policeTrainer.delete(player.userId)
 
             if(!player)  return;
             player.currentGame = ""
         }
     }

    startStage(room:BlitzRoom, client:Client, stageNumber: number) {
        this.stageNumber = stageNumber;
        this.targets.length = 0;
        client.send(policeTrainerSlug, {exercise:ExcerciseType.JUDGEMENT, action:'update-stage', totalStages:this.totalStages, stage:this.stageNumber})

        this.timeout = setTimeout(()=>{
            this.spawnNextTarget(14,0, room, client)
        }, 1000 * 3)
    }

    endExercise(room:BlitzRoom, client:Client){
        let player = room.state.players.get(client.userData.userId)
        this.clearTimeouts()

        // this.timeout = setTimeout(()=>{
        this.policeTrainerState.internalEndExercise(client, ExcerciseType.SPEED,  this.score >= this.quota)
        // }, 1000 * 5)
    }

    clearTimeouts(){
        clearInterval(this.timeout)
    }

    spawnNextTarget(totalBadGuys:number, spawnedBadGuys:number, room:BlitzRoom, client:Client){
        if (this.targetIndex >= SPEED_EXERCISE_GRID.length) {
            this.endExercise(room, client);
            return;
        }

        const position = ({...SPEED_EXERCISE_GRID[this.targetIndex], z:0} as Vec3);

        // ✅ Ensure we spawn at least 14 bad targets across all 9 positions
        let isBadGuy = Math.random() < 0.5;
        if (spawnedBadGuys < totalBadGuys) {
            isBadGuy = true;
        }

        if (isBadGuy) {
            this.badGuyCount++;
            spawnedBadGuys++;
        }

         // ✅ Create target
         const target = new Target(room, client, isBadGuy, 200, 200, 0, position, 100)
         this.targets.push(target);
        this.sendTargetToClient(client, target)
        this.targetIndex++

        this.timeout = // ✅ Hide target after 1 second
        setTimeout(() => {
            target.isUp = false;
            client.send(policeTrainerSlug, {exercise:ExcerciseType.SPEED, action:'hide-target', targetId:target.id})

            // ✅ Spawn the next target after hiding the current one
            setTimeout(() => this.spawnNextTarget(totalBadGuys, spawnedBadGuys, room, client), 150);
        }, 1000);
         
    }

    sendTargetToClient(client:Client, target:Target){
        // Remove `body` from the target object
        const targetData = { ...target };
        delete targetData.body;

        // Send to client
        client.send(policeTrainerSlug, { 
            exercise: ExcerciseType.SPEED, 
            action: 'create-target', 
            target: targetData 
        });
    }

    handleShoot(room:BlitzRoom, player:PlayerState, info:any){
        let target = this.targets.find(target => target.id === info.targetId)
        // console.log('target is', target)
        // if(!target || !target.isUp || this.ammo <= 0) return;

        if(this.ammo - 1 < 0){
            this.ammo = 0
        }else{
            this.ammo--
        }

        player.client.send(policeTrainerSlug, {exercise:ExcerciseType.SPEED, action:'ammo-update', ammo:this.ammo})

        if(this.ammo <= 0){
            console.log('no more ammo or lives, need to end game')
            this.endExercise(room, player.client)
            return;
        }

        if(info.targetId === "none"){
            console.log('no target hit')
            return
        }

        if(!target){
            console.log('invalid target, cheating?')
            return
        }

        if(target.isBadGuy){
            this.score += target.scorePerHit
        }else{
            this.score -= target.scorePerHit
            if(this.score < 0){
                this.score = 0
            }
        }

        console.log('hit target')

        player.client.send(policeTrainerSlug, {exercise:ExcerciseType.SPEED, action:'hit-target', targetId:target.id})
        player.client.send(policeTrainerSlug, {exercise:ExcerciseType.SPEED, action:'score-update', score:this.score})
    }
}

export class PoliceTrainerState extends Schema {
    currentExercise: ExcerciseType | null = null;
    exerciseInstance: any = null;
    lives:number = 3

    completedExercises:Map<ExcerciseType, boolean> = new Map()

    // bullets:Map<string, Bullet> = new Map()

    startExercise(room:BlitzRoom, client:Client, exerciseType: ExcerciseType) {
        this.currentExercise = exerciseType;

        switch (exerciseType) {
            case ExcerciseType.SPEED:
                this.exerciseInstance = new SpeedExercise(this);
                break;
            case ExcerciseType.JUDGEMENT:
                this.exerciseInstance = new EnemyShooterExercise(this);
                break;
            // Add other exercises here later
            default:
                console.error("Unknown exercise type:", exerciseType);
                return;
        }

        console.log(`Starting exercise: ${exerciseType}`);
        client.send(policeTrainerSlug, {exercise:exerciseType, action:'start', ammo:this.exerciseInstance.ammo, quota:this.exerciseInstance.quota})

        this.exerciseInstance.startStage(room, client, 1); // Start at stage 1
    }

    internalEndExercise(client:Client, exercise:ExcerciseType, completed:boolean){
        console.log("player completed exercise", completed)
        if(completed){
            this.completedExercises.set(ExcerciseType.JUDGEMENT, true)
        }else{
            this.lives--
        }
        client.send(policeTrainerSlug, {action:'complete-exercise', exercise:exercise, completed:completed, lives:this.lives})
    }

    clearGame(player?:PlayerState){
        if(this.exerciseInstance){
            this.exerciseInstance.clearGame(player)
        }
    }
}

export function handlePoliceTrainerMessage(room:BlitzRoom, client:Client, info:any){
    console.log('handling police trainer message', info)
    if(!info.action) return;

    let player = room.state.players.get(client.userData.userId)
    if(!player)  return;

    switch(info.action){
        case 'quit-academy':
            console.log('player wants to quit academy')
            player.currentGame = ""
            //need to think of other timers and things to cancel at the main menu level
            room.state.policeTrainer.delete(client.userData.userId)
            break;


        case 'start':
            // if(player.currentGame !== "" || room.state.policeTrainer.has(client.userData.userId))   return;

            player.currentGame = policeTrainerSlug

            let policeTrainer = new PoliceTrainerState()
            room.state.policeTrainer.set(client.userData.userId, policeTrainer)
            client.send(policeTrainerSlug, {exercise:"start-academy"})


            // 
            break;

        case 'choose-exercise':
            //check if they've already won this one
            let userGame = room.state.policeTrainer.get(client.userData.userId)
            if(!userGame)   return;

            if(userGame.completedExercises.has(info.exercise)){
                console.log('already completed ')
                return
            }

            userGame.startExercise(room, client, info.exercise)
            break;

        case 'shoot':
            if(player.currentGame !== policeTrainerSlug)    return;

            let game = room.state.policeTrainer.get(client.userData.userId)
            if(!game)   return;

            game.exerciseInstance.handleShoot(room, player, info)
            // game.exerciseInstance.handleRaycast(room, client, info)
            break;
    }
}

// function checkRaycastHit(room: BlitzRoom, rayOrigin: Vec3, rayEnd: Vec3 ,targets:any[]) {
//     let closestTarget: any = null;
//     let closestDistance = Infinity;

//     for(let i = 0; i < targets.length; i++){
//         let target = targets[i]
//         // if (!target.isUp) continue;

//         // ✅ Get target bounding box
//         const halfWidth = target.width / 2;
//         const halfHeight = target.height / 2;
//         const minX = target.px - halfWidth;
//         const maxX = target.px + halfWidth;
//         const minY = target.py - halfHeight;
//         const maxY = target.py + halfHeight;
//         const minZ = target.pz - 0.05; // Thin Z-plane
//         const maxZ = target.pz + 0.05;

//         // ✅ Find intersection
//         const intersection = rayIntersectsBox(rayOrigin, rayEnd, { minX, maxX, minY, maxY, minZ, maxZ });
//         console.log('intersection', intersection)

//         if (intersection){//} && intersection.distance < closestDistance) {
//             closestDistance = intersection.distance;
//             closestTarget = target;
//         }
//     }

//     return closestTarget;
// }

// function rayIntersectsBox(rayOrigin: Vec3, rayEnd: Vec3, box: any) {
//     let tMin = -Infinity;
//     let tMax = Infinity;

//     const rayDirection = new Vec3(
//         rayEnd.x - rayOrigin.x,
//         rayEnd.y - rayOrigin.y,
//         rayEnd.z - rayOrigin.z
//     ).normalize(); // ✅ Normalize to prevent scaling issues

//     // ✅ Check X-axis
//     if (rayDirection.x !== 0) {
//         const t1 = (box.minX - rayOrigin.x) / rayDirection.x;
//         const t2 = (box.maxX - rayOrigin.x) / rayDirection.x;
//         tMin = Math.max(tMin, Math.min(t1, t2));
//         tMax = Math.min(tMax, Math.max(t1, t2));
//     }

//     // ✅ Check Y-axis
//     if (rayDirection.y !== 0) {
//         const t1 = (box.minY - rayOrigin.y) / rayDirection.y;
//         const t2 = (box.maxY - rayOrigin.y) / rayDirection.y;
//         tMin = Math.max(tMin, Math.min(t1, t2));
//         tMax = Math.min(tMax, Math.max(t1, t2));
//     }

//     // ✅ Check Z-axis
//     if (rayDirection.z !== 0) {
//         const t1 = (box.minZ - rayOrigin.z) / rayDirection.z;
//         const t2 = (box.maxZ - rayOrigin.z) / rayDirection.z;
//         tMin = Math.max(tMin, Math.min(t1, t2));
//         tMax = Math.min(tMax, Math.max(t1, t2));
//     }

//     // ✅ If tMin is greater than tMax, no hit
//     if (tMin > tMax) return null;

//     return { distance: tMin };
// }