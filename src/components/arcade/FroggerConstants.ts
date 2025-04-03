import { Client } from "colyseus";
import { CANNON } from "../../utils/libraries";

export const froggerSlug = 'frogger'

export const FROGGER_PLAYER_BODY_GROUP    = 1 << 1;
export const FROGGER_CAR_BODY_GROUP   = 1 << 2;

// Hard-coded spawn intervals by level
export const SPAWN_INTERVALS_BY_LEVEL: Record<number, number> = {
    1: 3.0,
    2: 3.8,
    3: 3.6,
    4: 3.4,
    5: 3.2
  };

export interface FroggerPlayer {
    active: boolean;
    x: number;
    y: number;
    z: number;
    width: number;
    length: number;
    height: number;
    client:Client
}

export interface FroggerPowerUp {
    id: string;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    length: number;
  }

export interface FroggerCar {
    id?: string;
    type: string;
    x?: number;
    y?: number;
    z?: number;
    width: number;
    height: number;
    length: number;
    shape?: CANNON.Shape;
    speedModifier?: number;
    speed?:number;
    minLevel: number;  // only spawn this car if level >= minLevel
    weight: number;    // for weighted random spawn
    entity?:any
  }

let xStart = 25
let yStart = 0.1
let zStart = 50

export const LANE_POSITIONS = [
    { x:xStart, y: yStart, z: zStart },
    { x:xStart + 3, y: yStart, z: zStart },
    { x:xStart + 6, y: yStart, z: zStart },
    { x:xStart + 9, y: yStart, z: zStart },
    { x:xStart + 12, y: yStart, z: zStart },
  ];
  
/** 
 * Available car types 
 * Adjust dimensions, shapes, and minLevel as desired 
 */
export const CAR_TYPES: FroggerCar[] = [
    {
      type: "car",
      width: 2,
      height: 2.3,
      length: 3.08,
      speedModifier: 5,
      minLevel: 1,
      weight: 5, // more common
    },
    {
      type: "suv",
      width: 1.4,
      height: 1.2,
      length: 2.6,
      speedModifier: 0.9,
      minLevel: 2,
      weight: 4,
    },
    {
      type: "motorcycle",
      width: 0.5,
      height: 1.0,
      length: 1.5,
      speedModifier: 1.2,
      minLevel: 3,
      weight: 3,
    },
    {
      type: "bus",
      width: 2.24,
      height: 3.27,
      length: 6.89,
      speedModifier: 3,
      minLevel: 1,
      weight: 2, // relatively rare
    },
  ];
  