// src/schema/BallState.ts
import { Schema, type } from "@colyseus/schema";
import { BlitzRoom } from "../../rooms/BlitzRoom";
import { CANNON } from "../../utils/libraries";
import { BALL_MASS, ballShape, ballMat, GROUP_BALL, GROUP_TEAM_A, GROUP_TEAM_B, GROUP_WORLD, ballSpawnPoints, ballTypeWeights } from "./constants";
import { applyEffectToPlayer, shuffleSpawnPoints } from "./PlayerState";
import { PowerUpType } from "./PowerupState";

export enum BallType {
  NORMAL = "normal",
  ICE = "ice",
  BOMB = "bomb",
  LIGHT = "light",
  GHOST = "ghost"
}

export class BallState extends Schema {
  @type("string")
  id: string;

  @type("string")
  type: string = BallType.NORMAL;

  @type("number")
  px:number

  @type("number")
  py:number

  @type("number")
  pz:number

  @type("number")
  rx:number
  
  @type("number")
  ry:number

  @type("number")
  rz:number

  @type("number")
  rw:number

  @type("boolean")
  enabled:boolean = true

  @type("boolean")
  isVisible: boolean = true;

  scored: boolean = false; // To flag if the ball has been scored
  lastTouchPlayerId: string = ""; // Track the last player who touched the ball

  // Additional states: e.g. isActive, nextRespawnTime, etc.
  

  body:any
  parent:any
  entity:any
  colliderEntity:any
  audioBumpEntity:any

  tweenPosDuration:number
  tweenRotDuration:number
  timeSinceLastTweenPos:number
  timeSinceLastTweenRot:number
  timeToNextTweenPos:number
  timeToNextTweenRot:number

  constructor(args?:any, body?:any){
    super(args)
    if(body){
      this.body = body
    }
    this.type = this.getRandomBallType()
  }

    getRandomBallType(): BallType {
      // 1) Sum the total weights
      const totalWeight = ballTypeWeights.reduce((sum, entry) => sum + entry.weight, 0);

      // 2) Pick a random number from [0, totalWeight)
      let random = Math.random() * totalWeight;

      // 3) Find which bucket this random number falls into
      for (const entry of ballTypeWeights) {
        if (random < entry.weight) {
          return entry.type;
        }
        // otherwise, subtract and keep going
        random -= entry.weight;
      }

      // Fallback (shouldn't happen if weights are set correctly)
      return BallType.NORMAL;
  }
}

export function createBall(room:BlitzRoom, position:any){
    room.ballcount++
    const ballState = new BallState();
    ballState.id = `ball_${room.ballcount}`;
    room.state.balls.push(ballState);

    const ballBody = new CANNON.Body({
      mass: BALL_MASS,
      shape: ballShape,
      material:ballMat,
      linearDamping:0.2,
      angularDamping:0.2
    });

    ballBody.collisionFilterGroup = GROUP_BALL;
    ballBody.collisionFilterMask  = GROUP_BALL |  GROUP_TEAM_A | GROUP_TEAM_B | GROUP_WORLD;

  
    (ballBody as any).isBall = true;
    (ballBody as any).ballId = ballState.id;
    (ballBody as any).ballType = ballState.type;
  
    let {x, y, z} = position
    // x += room.state.xOffset
    // y += room.state.yOffset
  
    // room.state.xOffset += 2
    // room.state.yOffset += 2
  
    ballBody.position.set(x,y,z)
    room.state.world.addBody(ballBody)
    room.physicsRefs.set(ballState.id, { body: ballBody, ballId: ballState.id });
    ballBody.addEventListener('collide', (event:any)=>{
      if(!room.state.isGameActive || !room.state.isGamePlaying) return
      try{
        // if (event.body && event.body.type === CANNON.Body.DYNAMIC) {
          handleCollision(room, event.body, event.target)
        // }
      }
      catch(e:any){
        console.log('error ball on collide', e)
      }
    })
}

function  getBallStart(){
    const x = 112
    const y = 30
    const z = 55
    return {x,y,z}
  }

export function respawnBall(room:BlitzRoom, ballBody: CANNON.Body) {
    removeBall(room, ballBody)
    const shuffledB = shuffleSpawnPoints(ballSpawnPoints)
    createBall(room, shuffledB[0])
}

export function removeBall(room:BlitzRoom, ballBody: CANNON.Body){
    room.physicsRefs.delete((ballBody as any).ballId)
    let ballIndex = room.state.balls.findIndex(ball => ball.id === (ballBody as any).ballId)
    console.log('ball index is', ballIndex)
    if(ballIndex >= 0){
        room.state.balls.deleteAt(ballIndex)
    }
    room.state.world.removeBody(ballBody)
}

export function applyBombEffect(room:BlitzRoom, scoringTeamId: string) {
    room.state.players.forEach(player => {
      if (player.teamId !== scoringTeamId && !player.isSpectator) {
        if(!player.isImmune){
            player.client.send('ball-effect', {effect:BallType.BOMB})
        }
      }
    });
}

export function applyIceEffect(room:BlitzRoom, scoringTeamId: string) {
    let frozenPlayers:any[] = []
    room.state.players.forEach(player => {
      console.log(player.teamId, scoringTeamId)
      if (player.teamId !== scoringTeamId && !player.isSpectator) {
        if(!player.isImmune){
          applyEffectToPlayer(player, PowerUpType.FROZEN, 5)

            const bodyRef = room.physicsRefs.get(player.userId);
            if (bodyRef) {
                frozenPlayers.push({userId:player.userId, position:bodyRef.body.position})
                bodyRef.body.type = CANNON.Body.STATIC;
                bodyRef.body.updateMassProperties();
            }
        }
      }
    });
    room.broadcast('ball-effect', {effect:BallType.ICE, players:frozenPlayers})
  }

function toggleGhostBallVisibility(room:BlitzRoom) {
  room.state.balls.forEach((ball) => {
    if (ball.type === BallType.GHOST) {
      ball.isVisible = !ball.isVisible;
    }
  });
}

export function applyLightEffect(room:BlitzRoom, scoringTeamId: string) {
    room.state.players.forEach(player => {
      if (player.teamId !== scoringTeamId && !player.isSpectator && player.isReady) {
        if(!player.isImmune){
            player.client.send('ball-effect', {effect:BallType.LIGHT})
        }
      }
    });
  }

export function updateBallPositions(room:BlitzRoom, now:number, dt:number){
  room.physicsRefs.forEach((ref, key) => {
    const { body, playerId, ballId } = ref;

    if (ballId) {
      // Update BallState
      const ballState = room.state.balls.find(b => b.id === ballId);
      if (ballState) {
        ballState.px = body.position.x;
        ballState.py = body.position.y;
        ballState.pz = body.position.z;

        ballState.rx = body.quaternion.x
        ballState.ry = body.quaternion.y
        ballState.rz = body.quaternion.z
        ballState.rw = body.quaternion.w
      }
    }
  });

    // Accumulate time
    room.ghostBallTimer += dt;

    // Check if we hit 3000 ms (3 seconds)
    if (room.ghostBallTimer >= 3) {
      toggleGhostBallVisibility(room);
      room.ghostBallTimer = 0; 
    }
}

export function checkCollisions(room:BlitzRoom, now:number, dt:number){
    // For each contact in the world, see what collided
    const contacts = room.state.world.contacts;
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const bodyA = contact.bi;
      const bodyB = contact.bj;
      
      // handleCollision(room, bodyA, bodyB);
    }  
}

// function handleCollision(room:BlitzRoom, a:CANNON.Body, b:CANNON.Body){
  function handleCollision(room:BlitzRoom, a:CANNON.Body, b:CANNON.Body){
  const ballBody = (a as any).isBall ? a : ((b as any).isBall ? b : null);
  const goalBody = (a as any).isGoal ? a : ((b as any).isGoal ? b : null);
  const playerBody = (a as any).isPlayer ? a : ((b as any).isPlayer ? b : null);
  const groundBody = (a as any).isGround ? a : ((b as any).isGround ? b : null);

  if (!ballBody) return;

  const ballId = (ballBody as any).ballId;
  const ballIndex = room.state.balls.findIndex(b => b.id === ballId);

  // If we already removed or flagged the ball, skip.
  if (ballIndex === -1) {
    // means the ball is no longer in the array, so do nothing
    return;
  }

  const ballState = room.state.balls.find(b => b.id === ballId);

  if(groundBody !== null){
    room.broadcast('ball-collision', {ballId:ballState.id})
  }


    // If the collision involved a player, update the last player who touched the ball
  if (playerBody !== null) {
    // console.log('colldied with player')
    const playerId = (playerBody as any).playerId;  // Unique player ID
    
    // Find the ball and update the last touch player
    if (ballState) {
      // console.log('last to touch is', playerId)
      ballState.lastTouchPlayerId = playerId;  // Track the player who last touched the ball
    }

    // Apply some force or velocity to the ball
    // ballBody.velocity.set(10, 0, 10);  // Example: apply velocity to the ball
  }

  // If the ball collided with a goal, process the goal
  if (goalBody) {
    console.log('collided with the goal')
    // If the ball has already been scored, return early
    if (ballState?.scored) return;

    // Mark the ball as scored
    ballState.scored = true;

    // Process the goal
    onGoalScored(room, ballBody, goalBody);
    // return;
  }
}

function onGoalScored(room:BlitzRoom, ballBody: CANNON.Body, goalBody: CANNON.Body) {
  const ballId = (ballBody as any).ballId;
  const ballState = room.state.balls.find(b => b.id === ballId);
  const ballType = (ballBody as any).ballType;

  if (!ballState) return;

  if(!room.state.isGameActive || !room.state.isGamePlaying){
    console.log('scored a goal when game isnt active, dont count')
    removeBall(room, ballBody)
    return;
  }

  const lastTouchPlayerId = ballState.lastTouchPlayerId;
  const scorer = room.state.players.get(lastTouchPlayerId);

  // Determine which team's goal was scored
  const teamGoalId = (goalBody as any).teamId;
  let scoredForTeamId = teamGoalId === 'cyberpunks' ? 'dunepunks' : 'cyberpunks'; // Assign to the other team

  console.log('scored a goal on the net', teamGoalId)

  let score = 1
  if (scorer){
    console.log("player scored!", scorer.userId)
    let player = room.state.players.get(scorer.userId)
    if(player){
      if(player.effects.find(effect => effect.type === PowerUpType.DOUBLE_POINTS)){
        score = 2
      }

      let goal = 1
      if(player.teamId === teamGoalId){
        console.log('player scored own goal')
        goal = -1
      }
      player.score += goal * score
    }

    // if(player && player.currentEffect === "double"){
    //   score = 2
    // }
  }
  // // If the player scored on their own team, assign the goal to the opposing team
  // if (scoringTeamId === playerTeamId) {
  //   // This is an own goal
  //   console.log(`${scorer.name} scored an own goal for ${scoringTeamId}`);
  //   scoredForTeamId = scoringTeamId === 'cyberpunks' ? 'dunepunks' : 'cyberpunks'; // Assign to the other team
  // } else {
  //   console.log(`${scorer.name} scored a goal for ${scoringTeamId}`);
  // }

  // Increment the opposing team's score (in case of an own goal)
  const scoringTeam = room.state.teams.find(t => t.teamId === scoredForTeamId);
  if (scoringTeam) {
    scoringTeam.score += score;
  }

  // 3) Apply special effect based on ball type
  switch (ballType) {
    case "bomb": 
      applyBombEffect(room, scoredForTeamId);
      break;
    case "ice":
      applyIceEffect(room, scoredForTeamId);
      break;
    case "light":
      applyLightEffect(room, scoredForTeamId);
      break;
    // ...
    default:
      break;
  }
   // Optionally broadcast the goal event to clients
   room.broadcast("goal", { playerId: lastTouchPlayerId, teamId: scoredForTeamId });
    respawnBall(room, ballBody);
}
