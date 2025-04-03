
// src/schema/PowerUpState.ts
import { ArraySchema, Schema, type } from "@colyseus/schema";
import { BlitzRoom } from "../../rooms/BlitzRoom";
import { arenaMaxX, arenaMaxZ, arenaMinX, arenaMinZ, GROUP_BALL, iceWallShape, MAX_SPAWN_DELAY, MIN_SPAWN_DELAY, powerUpWeights } from "./constants";
import { Client } from "colyseus";
import { applyEffectToPlayer, PlayerState } from "./PlayerState";
import { TeamState } from "./TeamState";
import { CANNON } from "../../utils/libraries";
import { EffectState } from "./EffectState";

export enum PowerUpType {
  DOUBLE_POINTS = "Double_Points",
  ICE_GOAL = "Ice_Goal",
  IMMUNITY = "Immunity",
  LIGHTNING = "Ghost",
  FROZEN = 'Frozen',
}

export enum PowerUpTarget {
  PLAYER = "player",
  TEAM = "team",
}

export class PowerUpState extends Schema {
  @type("string")
  id: string;

  @type("string")
  type: string = PowerUpType.DOUBLE_POINTS;

  @type("string") 
  target: PowerUpTarget;  // "player" or "team"

  @type("number")
  x: number = 0;
  @type("number")
  y: number = 0;
  @type("number")
  z: number = 0;

  @type("boolean")
  isActive: boolean = true;
  
  // e.g. how long it lasts
  @type("number")
  duration: number = 10; 
}

export function applyPowerUp(room:BlitzRoom, client:Client, info:any){
    console.log('attemping powerup', info.powerupId)
    let player = room.state.players.get(client.userData.userId)
    if(!player || player.isSpectator || !info.powerupId){
        return
    }

    const powerUpIndex = room.state.powerUps.findIndex(p => p.id === info.powerupId);
    if (powerUpIndex === -1) {
      console.log('powerup doesnt exist')
      return; // doesn't exist or invalid ID
    }
  
    const powerUp = room.state.powerUps[powerUpIndex];
    if (!powerUp.isActive) {
      console.log('power up already used')
      return; // power-up was already used or inactive
    }

    room.state.powerUps.splice(powerUpIndex, 1)

    powerUp.isActive = false

    switch(powerUp.type){
      case PowerUpType.ICE_GOAL:
        let team = room.state.teams.find(team => team.teamId === player.teamId)
        if(!team){
          return
        }
        applyTeamPowerUp(room, PowerUpType.ICE_GOAL, team)
        break;

      case PowerUpType.DOUBLE_POINTS:
        // applyPlayerPowerUp(room, PowerUpType.DOUBLE_POINTS, player)
        applyDoublePointsEffect(room, player.userId, 10)
        break;

      case PowerUpType.IMMUNITY:
        applyImmunityEffect(room, player.userId, 10)
        break;

      case PowerUpType.LIGHTNING:
        let team2 = room.state.teams.find(team => team.teamId === player.teamId)
        if(!team2){
          return
        }
        applyTeamPowerUp(room, PowerUpType.LIGHTNING, team2)
        break;
    }

      // Schedule next spawn if we have < 2 power-ups
      const activeCount = room.state.powerUps.filter(p => p.isActive).length;
      if (activeCount < 2) {
        scheduleNextPowerUpSpawn(room)
      }
}

export function applyPlayerPowerUp(room: BlitzRoom, powerUp: PowerUpState, player: PlayerState) {
  // ...
  switch (powerUp.type) {
    case PowerUpType.IMMUNITY:
      player.isImmune = true;
      // player.immuneUntil = Date.now() + (powerUp.duration * 1000);
      applyEffectToPlayer(player, PowerUpType.FROZEN, powerUp.duration)
      break;
    case PowerUpType.DOUBLE_POINTS:
      player.hasDoublePoints = true;
      // player.doubleUntil = Date.now() + (powerUp.duration * 1000);
      applyEffectToPlayer(player, PowerUpType.DOUBLE_POINTS, powerUp.duration)
      break;
  }
  }

export function applyGhostEffect(room:BlitzRoom, powerupTeam: string) {
  const ghostDuration = 7; // seconds

  const now = Date.now();
  room.state.players.forEach(player => {
    // We only ghost players on the OPPOSING team
    if (player.teamId !== powerupTeam && !player.isSpectator && player.isReady) {
      applyEffectToPlayer(player, PowerUpType.LIGHTNING, ghostDuration)
      // player.currentEffect = "ghosted";
      // player.ghostUntil = ghostEndTime;
      console.log('player ghosted')
      // Grab the Cannon body
      const ref = room.physicsRefs.get(player.userId);
      if (!ref) return;

      const body = ref.body;
      
      // Save the old mask so we can restore it later
      (body as any).savedCollisionMask = body.collisionFilterMask;

      // Remove the ball bit from collisionFilterMask
      // e.g. if we had something like (TEAM_B | WORLD | BALL), we now remove BALL
      // If `GROUP_BALL` = 4, you can do:
      body.collisionFilterMask = body.collisionFilterMask & ~GROUP_BALL;
      room.broadcast('player-ghosted', {playerId:player.userId, location:room.physicsRefs.get(player.userId).body.position})
    }
  });
}

export function applyImmunityEffect(room:BlitzRoom, playerId: string, durationSeconds: number = 10) {
    const player = room.state.players.get(playerId);
    if (!player) return;
    
    player.isImmune = true;
    applyEffectToPlayer(player, PowerUpType.IMMUNITY, durationSeconds)
    // player.immuneUntil = Date.now() + durationSeconds * 1000;
    // player.currentEffect = "immune";
    room.broadcast("powerup-effect", {type:PowerUpType.IMMUNITY,  playerId, duration: durationSeconds })
}

export function applyDoublePointsEffect(room:BlitzRoom, playerId: string, durationSeconds: number = 10) {
    const player = room.state.players.get(playerId);
    if (!player) return;

    console.log('applying double points!')
    
    // Set an expiration timestamp
    // player.doubleUntil = Date.now() + durationSeconds * 1000;
    // player.currentEffect = "double";
    applyEffectToPlayer(player, PowerUpType.DOUBLE_POINTS, durationSeconds)
    room.broadcast("powerup-effect", {type:PowerUpType.DOUBLE_POINTS,  playerId, duration: durationSeconds })
}

export function applyTeamPowerUp(room: BlitzRoom, powerUp:PowerUpType, team: TeamState) {
  switch (powerUp) {
    case PowerUpType.ICE_GOAL:
      console.log('applying team ice goal powerup')
      team.hasIceGoal = true;
      team.iceGoalUntil = Date.now() + (5 * 1000);
      spawnIceWall(room, team)
      break;

    case PowerUpType.LIGHTNING:
      console.log('applying team ghost powerup')
      applyGhostEffect(room, team.teamId)
      break;
  }
}

export function spawnIceWall(room: BlitzRoom, team: TeamState) {
  let position:CANNON.Vec3
  switch(team.teamId){
    case 'cyberpunks':
      position = new CANNON.Vec3(112,7,2)
      break;

    case 'dunepunks':
      position = new CANNON.Vec3(112,7,103)
      break
  }

  team.iceWallBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: iceWallShape,
    position: position, 
  });
  room.state.world.addBody(team.iceWallBody);
}

export function removeIceWall(room:BlitzRoom, team:TeamState){
  team.hasIceGoal = false;
  team.iceGoalUntil = 0;
  
  try{
    room.state.world.removeBody(team.iceWallBody);
  }
  catch(e:any){
    console.log('error removing team ice wall body', e)
  }
}

export function checkPlayerPowerups(room:BlitzRoom, now:number, dt:number){
    room.state.players.forEach(player => {

      const stillActive = new ArraySchema<EffectState>();
      player.effects.forEach((effect:EffectState, i:number)=>{
        switch(effect.type){
            case PowerUpType.FROZEN:
              if(now < effect.expirationTime){
                stillActive.push(effect)
              }
              else{
                const ref = room.physicsRefs.get(player.userId);
                if (ref) {
                  ref.body.type = CANNON.Body.DYNAMIC;
                  ref.body.mass = 0; // original mass
                  ref.body.updateMassProperties();
                }
              }
              break;

            case PowerUpType.LIGHTNING:
              if(now < effect.expirationTime){
                stillActive.push(effect)
              }
              else{
                console.log('player no longer ghosted')
          
                const ref = room.physicsRefs.get(player.userId);
                if (!ref) return;
                const body = ref.body;
        
                // Restore the old collision mask
                if ((body as any).savedCollisionMask !== undefined) {
                  body.collisionFilterMask = (body as any).savedCollisionMask;
                }
                room.broadcast('player-visible', {playerId:player.userId})
              }
              break;

            case PowerUpType.IMMUNITY:
              if(now < effect.expirationTime){
                stillActive.push(effect)
              }
              else{
                player.isImmune = false;
                room.broadcast('remove-effect', {playerId:player.userId})
              }
              break;

            case PowerUpType.DOUBLE_POINTS:
              if(now < effect.expirationTime){
                stillActive.push(effect)
              }
              else{
                room.broadcast('remove-effect', {playerId:player.userId})
              }
              break;
        }
      })

      player.effects = stillActive
    });
}

export function checkTeamPowerups(room:BlitzRoom, now:number, dt:number){
  // check each team for iceGoal expiration
  for (const team of room.state.teams) {
    if (team.hasIceGoal && now >= team.iceGoalUntil) {
      removeIceWall(room, team)
    }
  }
}

function getRandomArenaPosition() {
  const x = Math.random() * (arenaMaxX - arenaMinX) + arenaMinX;
  const z = Math.random() * (arenaMaxZ - arenaMinZ) + arenaMinZ;
  // Y might be 0 if it's on the ground
  const y = 0;
  return { x, y, z };
}

function getWeightedRandomPowerUpType(): PowerUpType {
  const total = powerUpWeights.reduce((sum, w) => sum + w.weight, 0);
  let rand = Math.random() * total;

  for (const entry of powerUpWeights) {
    if (rand < entry.weight) {
      return entry.type;
    }
    rand -= entry.weight;
  }
  // fallback
  return PowerUpType.DOUBLE_POINTS;
}

function spawnRandomPowerUp(room: BlitzRoom) {
  // If already 2 power-ups in the arena, skip
  const activeCount = Array.from(room.state.powerUps).filter(p => p.isActive).length;
  if (activeCount >= 2) return;

  console.log('spawning power up')

  // Create a new PowerUpState
  const powerUp = new PowerUpState();
  powerUp.id = "powerUp_" + Math.random().toString(36).slice(2);
  powerUp.type = getWeightedRandomPowerUpType();
  const { x, y, z } = getRandomArenaPosition();
  powerUp.x = x;
  powerUp.y = y;
  powerUp.z = z;
  powerUp.isActive = true; // remains until picked up

  room.state.powerUps.push(powerUp);
  // Optionally broadcast to clients
  room.broadcast("powerUpSpawned", { id: powerUp.id, type: powerUp.type, x, y, z });

    // 3) Re-check how many are active after spawn
    const newCount = room.state.powerUps.filter((p) => p.isActive).length;
    // If still < 2, we schedule another
    if (newCount < 2) {
      spawnRandomPowerUp(room)
    }
}

export function scheduleNextPowerUpSpawn(room:BlitzRoom) {
  const delay = Math.floor(Math.random() * (MAX_SPAWN_DELAY - MIN_SPAWN_DELAY + 1)) + MIN_SPAWN_DELAY;
  console.log('spawning powerups in ', delay)

  // Use Colyseus clock to schedule
  room.state.powerupTmer = room.clock.setTimeout(() => {
    spawnRandomPowerUp(room)
  }, delay);
}