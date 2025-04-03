import { CANNON } from "../../utils/libraries";
import { Vec3 } from "../../utils/Vec3";

export const policeTrainerSlug = 'police-trainer'

export enum ExcerciseType {
    JUDGEMENT = "Judgement",
    SPEED = "Speed"
}

export const POLICE_TRAINER_TARGET_GROUP    = 1 << 4;
export const POLICE_TRAINER_TARGET_BULLET   = 1 << 5;

export const bulletMaterial = new CANNON.Material("bulletMaterial")

export let clientTrainerParentCenterX:number = 47
export let clientTrainerParentY:number = 80 + 0.1
export let clientTrainerParentZ:number = 45

export const STAGE_DIFFICULTY:any = {
    [ExcerciseType.JUDGEMENT]:{
        1: {scorePerHit:100,minBadGuys: 2,  targets:[{position: Vec3.create(clientTrainerParentCenterX - 2.6, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX - 0.9, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 0.8, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 2.5, clientTrainerParentY, clientTrainerParentZ + 30)}], badGuyChance: 0.5, flipDelay: 300, flipUpSpeed: 200, flipDownSpeed: 200, score: 10, penalty: -5 },
        2: { scorePerHit:100,minBadGuys: 2, targets:[{position: Vec3.create(clientTrainerParentCenterX - 2.6, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX - 0.9, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 0.8, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 2.5, clientTrainerParentY, clientTrainerParentZ + 30)}], badGuyChance: 0.6, flipDelay: 250, flipUpSpeed: 180, flipDownSpeed: 180, score: 15, penalty: -10 },
        3: { scorePerHit:100,minBadGuys: 2, targets:[{position: Vec3.create(clientTrainerParentCenterX - 2.6, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX - 0.9, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 0.8, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 2.5, clientTrainerParentY, clientTrainerParentZ + 30)}], badGuyChance: 0.7, flipDelay: 200, flipUpSpeed: 160, flipDownSpeed: 160, score: 20, penalty: -15 },
        4: { scorePerHit:100,minBadGuys: 2, targets:[{position: Vec3.create(clientTrainerParentCenterX - 2.6, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX - 0.9, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 0.8, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 2.5, clientTrainerParentY, clientTrainerParentZ + 30)}], badGuyChance: 0.8, flipDelay: 150, flipUpSpeed: 140, flipDownSpeed: 140, score: 25, penalty: -20 },
        5: { scorePerHit:100,minBadGuys: 2, targets:[{position: Vec3.create(clientTrainerParentCenterX - 2.6, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX - 0.9, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 0.8, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 2.5, clientTrainerParentY, clientTrainerParentZ + 30)}], badGuyChance: 0.9, flipDelay: 100, flipUpSpeed: 120, flipDownSpeed: 120, score: 30, penalty: -25 },
        6: { scorePerHit:100,minBadGuys: 1, targets:[{position: Vec3.create(clientTrainerParentCenterX - 2.6, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX - 0.9, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 0.8, clientTrainerParentY, clientTrainerParentZ + 30)}, {position: Vec3.create(clientTrainerParentCenterX + 2.5, clientTrainerParentY, clientTrainerParentZ + 30)}], badGuyChance: 1.0, flipDelay: 75, flipUpSpeed: 100, flipDownSpeed: 100, score: 40, penalty: -30 },
    },
    [ExcerciseType.SPEED]:{

        
    }
};

export const SPEED_EXERCISE_GRID = [
    { x: -1.8, y: 5.8, }, { x: 0.7, y: 5.8 }, { x: 3.2, y: 5.8 },
    { x: 3.2, y: 3.3 }, { x: 0.7, y: 3.3 }, { x: -1.8, y: 3.3 }, 
    { x: -1.8, y: 0.8 },{ x: 0.7, y: 0.8  }, { x: 3.2, y:  0.8  }, 
    { x: 3.2, y: 3.3 }, 
    { x: 3.2, y: 5.8 }, 
    { x: 0.7, y: 5.8 }, 
    { x: 0.7, y: 3.3 }, 
    { x: 0.7, y:  0.8  }, 
    { x: -1.8, y:  0.8  }, 
    { x: -1.8, y: 3.3 }, 
    { x: -1.8, y: 5.8 }, 
];


// export const STAGE_DIFFICULTY:any = {
//     1: { scorePerHit:100,minBadGuys: 2, targets:[{position: Vec3.create(63.4, 1, 98)}], badGuyChance: 0.5, flipDelay: 300, flipUpSpeed: 200, flipDownSpeed: 200, score: 10, penalty: -5 },
//     2: { scorePerHit:100,minBadGuys: 2, targets:[{position: Vec3.create(63.4, 1, 98)}], badGuyChance: 0.6, flipDelay: 250, flipUpSpeed: 180, flipDownSpeed: 180, score: 15, penalty: -10 },
//     3: { scorePerHit:100,minBadGuys: 1,targets:[{position: Vec3.create(63.4, 1, 98)}], badGuyChance: 0.7, flipDelay: 200, flipUpSpeed: 160, flipDownSpeed: 160, score: 20, penalty: -15 },
//     4: { scorePerHit:100,minBadGuys: 2,targets:[{position: Vec3.create(63.4, 1, 98)}], badGuyChance: 0.8, flipDelay: 150, flipUpSpeed: 140, flipDownSpeed: 140, score: 25, penalty: -20 },
//     5: { scorePerHit:100,minBadGuys: 1,targets:[{position: Vec3.create(63.4, 1, 98)}], badGuyChance: 0.9, flipDelay: 100, flipUpSpeed: 120, flipDownSpeed: 120, score: 30, penalty: -25 },
//     6: { scorePerHit:100,minBadGuys: 1,targets:[{position: Vec3.create(63.4, 1, 98)}], badGuyChance: 1.0, flipDelay: 75, flipUpSpeed: 100, flipDownSpeed: 100, score: 40, penalty: -30 },
// };

export let arcadeBodyShapes:any = {
    [policeTrainerSlug]:{
        [ExcerciseType.JUDGEMENT]:{
            target:new CANNON.Box(new CANNON.Vec3(0.75, 1, 0.05)),
            bullet: new CANNON.Sphere(0.05)
        }
    }
}