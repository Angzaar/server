import { Room, Client } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { getCache } from "../utils/cache";
import { PROFILES_CACHE_KEY } from "../utils/initializer";

export class BasePlayerState extends Schema {
  @type("string")
  userId:string;

  @type("string")
  name:string 

  ipAddress:any
  startTime:any
  web3:boolean = false

  //player stats - these are not synced for now
  lastMoveTimestamp: number = Date.now();
  lastDustEarnTimestamp: number = Date.now();
  dust:number = 0

  blitzPlays:number = 0
  arcadePlays:number = 0
  distanceTraveled:number = 0
  goals:number = 0
  wins:number = 0
  losses:number = 0

  currentPosition:any = {x:0, y:0, z:0}
  lastPosition:any = {x:0, y:0, z:0}

  isPlayingBlitz:boolean = false
  isSpectatingBlitz:boolean = false

  args:any
  

  constructor(args:any){
    super()
    this.args = args
    this.web3 = args.web3
    this.ipAddress = args.ipAddress
    this.userId = args.ethAddress
    this.name = args.name ? args.name : "Guest"
    this.startTime = Math.floor(Date.now()/1000)

    //set player stats
    this.blitzPlays = args.blitzPlays
    this.arcadePlays = args.arcadePlays
    this.goals = args.goals
    this.wins = args.wins
    this.losses = args.losses
    this.distanceTraveled = args.distance
    this.dust = args.dust
  }

  async saveGameData(){
    let profiles = getCache(PROFILES_CACHE_KEY)
    let profile = profiles.find((p:any) => p.ethAddress === this.userId && p.ipAddress === this.ipAddress)
    if(!profile)  return

    profile.arcadePlays = this.arcadePlays
    profile.blitzPlays = this.blitzPlays
    profile.dust = this.dust
    profile.goals = this.goals
    profile.wins = this.wins
    profile.losses = this.losses
    profile.distance = this.distanceTraveled
  }

  deductDust(amount: number): boolean {
    if (this.dust >= amount) {
        this.dust -= amount;
        return true;
    }
        return false;
    }

    addDust(amount: number, client?:Client) {
      console.log('adding dust', amount)
        this.dust += amount;
        if(client){
          client.send('dust-update', {new:amount, balance:this.dust})
        }
        console.log('player dust is', this.dust)
    }

    calcDistanceMoved(position:any){
      if(this.lastPosition){
        const dx = position.x - this.lastPosition.x;
        const dz = position.z - this.lastPosition.z;
        return Math.sqrt(dx*dx + dz*dz);
      }
      return 0
    }
}

export function getLeaderboard(sortKey: string, limit: number = 10) {
  return [...getCache(PROFILES_CACHE_KEY).values()]
      .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
      .slice(0, limit)
      .map(profile => ({ name: profile.name, stat: profile[sortKey] }));
}

