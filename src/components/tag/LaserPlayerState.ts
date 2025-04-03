import { Room, Client } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";
import { BlitzRoom } from "../../rooms/BlitzRoom";
import axios from "axios";
import { BasePlayerState } from "../BasePlayerState";
import { laserPlayerShape } from "./constants";


export class LaserPlayerState extends BasePlayerState {
  @type("string")
  teamId: string = "";

  @type("boolean")
  isReady:boolean = false

  @type("boolean")
  isSpectator: boolean = true;

  @type("boolean")
  isImmune:boolean = false

  @type("boolean")
  hasDoublePoints:boolean = false

  @type("boolean")
  inSpaceship:boolean = false

  @type("boolean")
  flying:boolean = false

  @type("number")
  px: number = 0;
  @type("number")
  py: number = 0;
  @type("number")
  pz: number = 0;

  // Could track score, e.g. how many goals or assists
  @type("number")
  score: number = 0;
  //////////////////////////////////////////////////////////////////////////////////////////

  room:BlitzRoom
  client:Client
  ipAddress:any

  startTime:any

  isSpectatingBlitz:boolean
  isClient:boolean = false

  entity:any

  constructor(room:BlitzRoom, args:any, client:Client){
    super(args)
    this.room = room
    this.isClient = args.isClient
    this.client = client
    this.client.send('dust-update', {balance:this.dust });
  }

  async reset(room:BlitzRoom){
    if(!this.isSpectator){
      try{
        let playerBody = room.physicsRefs.get(this.userId)
        if(playerBody){
          console.log('removing player body on game reset')
          room.state.world.removeBody(playerBody.body)
          room.physicsRefs.delete(this.userId)
        }
      }
      catch(e:any){
        console.log('error resetting player body', e)
      }
    }
    this.teamId = ""
    this.isReady = false
    this.isSpectator = true
    this.isImmune = false
    this.hasDoublePoints = false
    // this.currentEffect = ""
    this.score = 0
    this.client.send('spawn-lobby')
  }

}

export function handleCancelJoin(room:BlitzRoom,  client: Client, message: any) {
  console.log('player cancelin team', message)
  const player = room.state.players.get(client.userData.userId);
  if (!player || !player.isClient) return;

  let desiredTeam = room.state.teams.find(team => team.teamId === player.teamId)
  if(!desiredTeam){
    console.log('team doesnt exist')
    return
  }
  desiredTeam.playerCount--

  player.teamId = ""
  player.isSpectator = true
  player.isReady = false
}

export function handleJoinTeam(room:BlitzRoom,  client: Client, message: any) {
  console.log('player joining team', message)
  const player = room.state.players.get(client.userData.userId);
  if (!player || player.teamId === message.teamId || player.isReady) return;

  const desiredTeamId = message.teamId;

  if (desiredTeamId !== "cyberpunks" && desiredTeamId !== "dunepunks") {
    console.log('invalid team id')
    return
  }

  let desiredTeam = room.state.teams.find(team => team.teamId === desiredTeamId)
  if(!desiredTeam){
    console.log('team doesnt exist')
    return
  }

  if(desiredTeam.playerCount === 5){
    console.log('desired team is full', desiredTeam.teamId)
    return
  }

  if(player.teamId !== ""){
    let currentTeam = room.state.teams.find(team => team.teamId === player.teamId)
    console.log('current team is', currentTeam.teamId)
    if(!currentTeam){
      return
    }
    currentTeam.playerCount--
  }

  console.log('adding player to team', desiredTeamId)

  desiredTeam.playerCount++

  player.teamId = desiredTeamId;
  player.isReady = false;
  player.isSpectator = false

  // let playerBody = addPlayerBody(room, client)
  // playerBody.collisionFilterGroup = desiredTeamId === "cyberpunks" ? GROUP_TEAM_A : GROUP_TEAM_B;
  // playerBody.collisionFilterMask  = GROUP_BALL;
}

export function handlePlayerReady(room:BlitzRoom, client:Client, info:any){
  const player = room.state.players.get(client.userData.userId);
  if (!player || room.state.isGameActive || room.state.isGamePlaying) return;

  player.isReady = info.isReady;
  checkAllPlayersReady(room)
}

function checkAllPlayersReady(room:BlitzRoom) {
  // If you want to only consider players who joined teams (not spectators), filter them out://

//   const teamAPlayersReady  = Array.from(room.state.players.values())
//   .filter((p) => !p.isSpectator && p.teamId === 'cyberpunks' && p.isReady);

//   const teamBPlayersReady  = Array.from(room.state.players.values())
//   .filter((p) => !p.isSpectator && p.teamId === 'dunepunks' && p.isReady);

//   if (teamAPlayersReady.length < 1 || teamBPlayersReady.length < 1) {
//     console.log('not enough pplayes ready', teamAPlayersReady.length, teamBPlayersReady.length)
//     if(room.state.gameTime > 0){
//       room.state.isGameStarting = false
//       room.state.countdownTimer.clear()
//       room.state.gameTime = 0
//     }
//     return; // or handle the case if no players are on teams
//   }

//   if(!room.state.isGameStarting){
//     room.state.isGameStarting = true
//     room.state.teams[0].playerCount = teamAPlayersReady.length
//     room.state.teams[1].playerCount = teamBPlayersReady.length
//     startMatch(room);
//   }

}

export function addPlayerBody(room:BlitzRoom, client:Client){
   // Create a physics body for the player
   const playerBody = new CANNON.Body({
    mass: 0, // static, controlled by client
    shape: laserPlayerShape, // approximate bounding volume
    position: new CANNON.Vec3(0, 500, 0), // spawn position
  });
  (playerBody as any).isPlayer = true;
  (playerBody as any).playerId = client.userData.userId;

  room.state.world.addBody(playerBody);

  // Store in our Map
  room.physicsRefs.set(client.userData.userId, { body: playerBody, playerId: client.userData.userId });
  return playerBody
}

export function deletePlayerPhysicsObjects(room:BlitzRoom, player:LaserPlayerState){
      // Remove physics body
    const ref = room.physicsRefs.get(player.userId);
    if (ref) {
      room.state.world.removeBody(ref.body);
      room.physicsRefs.delete(player.userId);
    }
}

export function teleportPlayers(room:BlitzRoom){
  // Assign spawn points for Team A
//   const teamAPlayers = Array.from(room.state.players.values())
//     .filter((p) => p.teamId === "cyberpunks" && !p.isSpectator && p.isReady);

//   // Shuffle or randomize the spawn array
//   const shuffledA = shuffleSpawnPoints(teamASpawnPoints);

//   // Assign spawn points to each player
//   teamAPlayers.forEach((player, index) => {
//     const spawnPos = shuffledA[index % shuffledA.length];
//     room.broadcast('spawn-player', {position:spawnPos, player:player.userId})
//     addPlayerBody(room, player.client)
//     player.lastPosition = spawnPos
//     player.currentPosition = spawnPos
//   });

//   // Same for Team B
//   const teamBPlayers = Array.from(room.state.players.values())
//     .filter((p) => p.teamId === "dunepunks" && !p.isSpectator && p.isReady);

//   const shuffledB = shuffleSpawnPoints(teamBSpawnPoints);

//   teamBPlayers.forEach((player, index) => {
//     const spawnPos = shuffledB[index % shuffledB.length];
//     room.broadcast('spawn-player', {position:spawnPos, player:player.userId})
//     addPlayerBody(room, player.client)
//     console.log('added player body')
//   });
}

export function shuffleSpawnPoints<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function checkIsClient(userId:string){
  if(process.env.ENV === "Development"){
    return true
  }

  try{
    let res = await axios.get('https://archipelago-stats.decentraland.org/peers')
    if(res.data.ok){
      return !res.data.peers.find((user:any)=> user.id === userId)
    }else{
      return false
    }
  }
  catch(e:any){
    console.log('error getting browser information',e)
    return false
  }
}

export function applyEffectToPlayer(player: LaserPlayerState, type: string, durationSec: number, value: number = 0) {
//   const now = Date.now();
//   const newExpiration = now + durationSec * 1000;

//   // 1) See if the effect already exists
//   let existingEffect = player.effects.find(e => e.type === type);

//   if (existingEffect) {
//     // refresh the expiration or update as needed
//     existingEffect.expirationTime = newExpiration;
//     existingEffect.value = value;
//   } else {
//     // add new effect
//     const effect = new EffectState();
//     effect.type = type;
//     effect.expirationTime = newExpiration;
//     effect.value = value;
//     player.effects.push(effect);
//   }
}