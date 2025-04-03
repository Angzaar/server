import { Schema, type, MapSchema } from "@colyseus/schema";

export class PlaneState extends Schema {
  @type("number") px = 42;
  @type("number") py = 10;
  @type("number") pz = 91;
  @type("number") rx = 0;
  @type("number") ry = 0;
  @type("number") rz = 0;

  entity:any

  constructor(){
    super()
  }
}