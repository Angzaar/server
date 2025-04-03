import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";

export class EffectState extends Schema {
  @type("string") type: string;             // e.g. "double_points"
  @type("number") expirationTime: number;   // server timestamp (in ms)
  @type("number") value: number = 0;        // e.g. multiplier, or freeze severity
}
