import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";

export const laserTagSlug = "lasertag"

export const laserPlayerShape = new CANNON.Box(new CANNON.Vec3(0.37, 0.87, 0.37));

export class LaserBeamObject extends Schema {
    @type("string") id:string;
  
    @type("number") px:number
    @type("number") py:number
    @type("number") pz:number

    @type("number") rx:number
    @type("number") ry:number
    @type("number") rz:number
    @type("number") rw:number

    @type("number") length:number
  
    entity:any
  
    constructor(args?:any, body?:any){
      super(args)
    }
  }