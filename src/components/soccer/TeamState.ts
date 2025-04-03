// src/schema/TeamState.ts
import { Schema, type } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";
import { BlitzRoom } from "../../rooms/BlitzRoom";

export class TeamState extends Schema {
  @type("string")
  teamId: string;

  @type("string")
  teamName: string;

  @type("number")
  playerCount:number = 0

  @type("number")
  score: number = 0; // goals in the current match

  @type("boolean")
  hasIceGoal: boolean = false;
  
  iceGoalUntil: number = 0;
  iceWallBody:CANNON.Body
  iceWallEntity:any

  // Additional stats could go here...


  reset(room:BlitzRoom){
    this.playerCount = 0
    this.score = 0
    this.iceGoalUntil = 0

    if(this.hasIceGoal){
      try{
        console.log('removing team ice goal on team reset')
        room.state.world.removeBody(this.iceWallBody)
      }
      catch(e:any){
        console.log('error restting team ice goal', e)
      }
    }
    this.hasIceGoal = false
  }
}

export function removeTeammate(room:BlitzRoom, teamId:string){
  let team = room.state.teams.find(team => team.teamId === teamId)
  if(!team)  return;

  team.playerCount -= 1
}