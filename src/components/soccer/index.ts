import { Room, Client, Delayed } from "colyseus";
import { BALL_MASS, ballBallContact, ballGroundContact, ballSpawnPoints, ballWallContact, fieldLength, fieldWidth, goalShape, groundMat, GROUP_BALL, GROUP_TEAM_A, GROUP_TEAM_B, GROUP_WORLD, playerBallContactMaterial, playerMat, playerShape, wallHeight, wallMat, wallThickness } from "./constants";
import { CANNON } from "../../utils/libraries";
import { BlitzRoom } from "../../rooms/BlitzRoom";
import { removeTeammate, TeamState } from "./TeamState";
import { BallState, checkCollisions, createBall, removeBall, updateBallPositions } from "./BallState";
import { applyPowerUp, checkPlayerPowerups, checkTeamPowerups, PowerUpState, removeIceWall, scheduleNextPowerUpSpawn } from "./PowerupState";
import { handleCancelJoin, handleJoinTeam, handlePlayerReady, PlayerState, shuffleSpawnPoints, teleportPlayers } from "./PlayerState";
import { getLeaderboard } from "../BasePlayerState";
import { handleSpaceshipListeners } from "./SpaceshipState";
import { RewardManager } from "../RewardManager";
import { updateArcadeObjects } from "../arcade";
import { POLICE_TRAINER_TARGET_BULLET } from "../arcade/constants";
import { updateBilliardsObjects } from "../arcade/BilliardState";
import { updateBowlingObjects } from "../bowling.ts";

export async function createSoccer(room:BlitzRoom){
  initCANNONWorld(room)

   // Start stepping the physics at a fixed rate
   let lastTime = performance.now() / 1000
   room.clock.setInterval(()=>{
    const currentTime = performance.now() / 1000
    const dt = currentTime - lastTime
    lastTime = currentTime
    room.state.world.step(room.state.fixedTimeStep, dt, room.state.maxSubSteps)
      updateBilliardsObjects(room, dt)
      updateArcadeObjects(room, dt);
      updateBlitzObjects(room, dt)
      updateBowlingObjects(room, dt)
  }, room.state.broadcastRate)

   // Create 2 teams by default
   room.state.teams.push(new TeamState().assign({
    teamId: "cyberpunks",
    teamName: "Cyberpunks"
  }));

  room.state.teams.push(new TeamState().assign({
    teamId: "dunepunks",
    teamName: "Dunepunks"
  }));

  blitzHandlers(room)
  // createBalls(room)
}

function blitzHandlers(room:BlitzRoom){
  room.onMessage('redeem-reward', async (client:Client, info:any)=>{
    let player = room.state.players.get(client.userData.userId)
    if(!player || !info.rewardId)  return;

    try {
      const result = await RewardManager.redeemReward(player, info.rewardId);
      client.send('dust-update', {new:-result.reward.cost, balance:player.dust})
      room.broadcast("reward-claimed", result);
    } catch (error:any) {
      client.send("redeem-error", { message: error.message });
    }
  })

  room.onMessage('plane-input', (client:Client, info:any)=>{
    // let player = room.state.players.get(client.userData.userId)
    // if(!player){
    //   return
    // }

    // if(player.flying && player.planeBody){
    //   room.applyPlaneControls(player.planeBody, info)
    // }
  })

  room.onMessage('get-leaderboard', (client:Client, info:any)=>{
    if(!info.stat)   return;
    const leaderboard = getLeaderboard(info.stat);
    client.send("get-leaderboard", { stat: info.stat, leaderboard });
  })

  room.onMessage('arcade-beam', (client:Client, info:any)=>{
    room.broadcast('arcade-beam', client.userData.userId)
  })

  room.onMessage('cancel-player-join', (client:Client, info:any)=>{
    handleCancelJoin(room, client, info)
  })

  room.onMessage('choose-blitz-team', (client:Client, info:any)=>{
    handleJoinTeam(room, client, info)
  })

  room.onMessage('player-ready', (client:Client, info:any)=>{
    handlePlayerReady(room, client, info)
  })

  room.onMessage('enable-player', (client:Client, info:any)=>{
    // let player = room.state.players.get(client.userData.userId)
    // if(!player){
    //   return
    // }

    // if(!player.enabled){
    //   player.body = new CANNON.Body({
    //     mass: 0, // Static for now, controlled by movement
    //     shape: new CANNON.Sphere(1),
    //     position: new CANNON.Vec3(100, 1, 0),
    //     material:playerMat
    //   });
    //   player.body.linearDamping = 1
    //   player.body.angularDamping = 1
    //   player.body.collisionResponse = true
    //   player.body.velocity.set(0,0,0)
    //   room.state.world.addBody(player.body)
    // }
    // player.enabled = true
  })

  room.onMessage('disable-player', (client:Client, info:any)=>{
    // let player = room.state.players.get(client.userData.userId)
    // if(!player){
    //   return
    // }

    // if(player.enabled){
    //   room.state.world.removeBody(player.body)
    //   player.body = null
    // }
    // player.enabled = false
  })

  room.onMessage('player-spectating', (client:Client, info:any)=>{
    let player = room.state.players.get(client.userData.userId)
    if(!player) return;

    player.isSpectatingBlitz = room.state.isGamePlaying || room.state.isGameActive || room.state.isGameStarting ? info.spectating : false
  })

  room.onMessage('player-move', (client:Client, info:any)=>{
    let player = room.state.players.get(client.userData.userId)
    if(!player){
      return
    }

    if(!player.isSpectator){
      let physicsRef = room.physicsRefs.get(player.userId)
      if(physicsRef){
        const playerPos = new CANNON.Vec3(info.playerPos.x, info.playerPos.y + 1, info.playerPos.z);
        physicsRef.body.position.set(playerPos.x, playerPos.y, playerPos.z)

        let dist = player.calcDistanceMoved(playerPos)
        if (dist > 10) {
          console.log('is player cheating their position?', player.name, player.userId)
          return
          // Possibly ignore or clamp
          // e.g. skip distanceTraveled increment or revert position
        }

        // Accumulate distance
        player.distanceTraveled += Math.floor(dist);

        // Update "last" position
        player.lastPosition.x = playerPos.x;
        player.lastPosition.z = playerPos.z;
      }
    }
  })

  room.onMessage('player-ball-hit', (client:Client, message:any)=>{
    // console.log('player-ball-hit message received', message)
    // let game = room.state.games.get(message.gameId)
    // if(!game){
    //   return
    // }

    // game.attemptBallHit(message)
  })

  room.onMessage('powerup', (client:Client, info:any)=>{
    applyPowerUp(room, client, info)
  })

  room.onMessage('spaceship-arcade', (client:Client, info:any)=>{
    handleSpaceshipListeners(room,client,info)
  })
}

function initCANNONWorld(room:BlitzRoom){
  // Setup the Cannon world
  room.state.world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
  })


  // Create a ground plane
  const groundShape = new CANNON.Plane()
  const groundBody = new CANNON.Body({ mass: 0, material:groundMat })
  groundBody.addShape(groundShape);
  (groundBody as any).isGround = true

  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  
  room.state.world.addBody(groundBody)

  groundBody.collisionFilterGroup = GROUP_WORLD;
  groundBody.collisionFilterMask  = GROUP_BALL | POLICE_TRAINER_TARGET_BULLET;

  // Define wall shapes
  const longWallShape = new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, fieldLength / 2)); // long walls
  const shortWallShape = new CANNON.Box(new CANNON.Vec3(fieldWidth / 2, wallHeight / 2, wallThickness / 2)); // short walls


  const walls = [
    { position: new CANNON.Vec3(88, 0, 56), shape: longWallShape },  //west
    { position: new CANNON.Vec3(135,0,56), shape: longWallShape }, // east wall
    { position: new CANNON.Vec3(104, 0, 104), shape: shortWallShape },  // north wall
    { position: new CANNON.Vec3(112,0,0.5), shape: shortWallShape }, // south wall
  ];

  walls.forEach((wall) => {
      const wallBody = new CANNON.Body({
          mass: 0, // Static (walls don't move)
          shape: wall.shape,
          position: wall.position,
          material: wallMat, // Optional: define wall properties
      });

      wallBody.collisionFilterGroup = GROUP_WORLD;
      wallBody.collisionFilterMask  = GROUP_BALL;

      room.state.world.addBody(wallBody);
  });

   const teamAGoal = new CANNON.Body({
     type: CANNON.Body.STATIC,
     shape: goalShape,
     position: new CANNON.Vec3(112, 7, 2),
   });
   teamAGoal.collisionFilterGroup = GROUP_WORLD;
   teamAGoal.collisionFilterMask  = GROUP_BALL;

   // Tag it so you know it’s a goal
   (teamAGoal as any).isGoal = true;
   // Maybe also store which team’s goal it is
   (teamAGoal as any).teamId = "cyberpunks";
   room.state.world.addBody(teamAGoal);

   const teamBGoal = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: goalShape,
    position: new CANNON.Vec3(112, 7, 103),
  });
  teamBGoal.collisionFilterGroup = GROUP_WORLD;
  teamBGoal.collisionFilterMask  = GROUP_BALL;

  // Tag it so you know it’s a goal
  (teamBGoal as any).isGoal = true;
  // Maybe also store which team’s goal it is
  (teamBGoal as any).teamId = "dunepunks";
  room.state.world.addBody(teamBGoal);

  room.state.world.addContactMaterial(playerBallContactMaterial)
  room.state.world.addContactMaterial(ballGroundContact)
  room.state.world.addContactMaterial(ballBallContact)
  room.state.world.addContactMaterial(ballWallContact)
}

function createBalls(room:BlitzRoom){
  // if(room.state.balls.length < 5){
  //   createBall(room)
  //   room.clock.setTimeout(()=>{
  //     createBalls(room)
  //   }, 2000)
  // }
  // // while(room.state.balls.length < 5){
  // //   // room.clock.setTimeout(()=>{
  // //     createBall(room)
  // //   // }, 1000)
  // // }
  const shuffledB = shuffleSpawnPoints(ballSpawnPoints);
  for (let i = 0; i < 5; i++) {
    createBall(room, shuffledB[i])
  }
}

function updateBlitzObjects(room:BlitzRoom, dt:number){
  if(room.state.isGameActive || room.state.isGamePlaying || room.state.isGameStarting ){
    const now = Date.now();
    updateBallPositions(room, now, dt)
    // checkCollisions(room, now, dt)
    checkPlayerPowerups(room, now, dt)
    checkTeamPowerups(room, now, dt)
  }
}

function applyPlaneControls(planeBody:CANNON.Body, input: { pitch: number, roll: number, thrust: number, yaw: number }) {
  planeBody.torque.set(0, 0, 0); // Reset torque

  // const pitchTorque = input.pitch * 5;
  // const rollTorque = input.roll * 5;
  // const yawTorque = input.yaw * 3;

  // // Apply roll & pitch
  // planeBody.torque.set(-pitchTorque, 0, -rollTorque); // Reverse for DCL

  // // Apply yaw using angular velocity
  // planeBody.angularVelocity.y -= yawTorque * 0.05;

  // // Slow down any unwanted spin over time
  // planeBody.angularVelocity.y *= 0.98;

  // planeBody.angularVelocity.set(0, planeBody.angularVelocity.y * 0.9, 0); // Reduce spin


  if (input.thrust !== 0) {
    let forward = new CANNON.Vec3(0, 0, 1); // +Z forward for DCL
    let rotatedForward = new CANNON.Vec3();
    planeBody.quaternion.vmult(forward, rotatedForward);

    rotatedForward.scale(input.thrust * 40, rotatedForward);

    // ✅ Apply force at an offset (move it behind the plane)
    let enginePosition = new CANNON.Vec3(0, 0, 0); // Move thrust point 2 meters behind the center
    planeBody.quaternion.vmult(enginePosition, enginePosition); // Rotate correctly

    let thrustPoint = planeBody.position.vadd(enginePosition); // Offset position

    planeBody.applyForce(rotatedForward, thrustPoint);

    console.log("✈️  Plane's Actual Forward (After Rotation):", rotatedForward);

}



}

export function startMatch(room:BlitzRoom){
  console.log('all players ready, start countdown')
  room.state.gameTime = 10
  room.state.countdownTimer = room.clock.setInterval(()=>{
    if(room.state.gameTime > 0){
      room.state.gameTime--
    }else{
      room.state.countdownTimer.clear()
      loadNewGame(room)
    }
  }, 1000)
}

function loadNewGame(room:BlitzRoom){
  room.state.gameTime = 10
  room.state.isGameActive = true
  room.state.isGameStarting = false

  room.state.teams.forEach((team) => (team.score = 0));

  teleportPlayers(room)
  createBalls(room)  

  room.state.countdownTimer = room.clock.setInterval(()=>{
    if(room.state.gameTime > 0){
      room.state.gameTime--
    }else{
      room.state.countdownTimer.clear()
      startNewGame(room)
    }
  }, 1000)
}

function startNewGame(room:BlitzRoom){
  room.state.gameTime = 360
  room.state.isGameActive = true
  room.state.isGamePlaying = true

  scheduleNextPowerUpSpawn(room)

  room.state.gameTimer = room.clock.setInterval(()=>{
    if(room.state.gameTime > 0){
      room.state.gameTime--
    }else{
      room.state.gameTimer.clear()
      endGame(room)      
    }
  }, 1000)
}

function endGame(room:BlitzRoom, force?:boolean){
  room.state.isGamePlaying = false
  room.state.isGameActive = false

  room.state.balls.forEach((ballState:BallState)=>{
    let ball = room.physicsRefs.get(ballState.id)
    removeBall(room, ball.body)
  })

  room.state.powerupTmer.clear()
  room.state.powerUps.clear()

  if(!force){
    const teamA = room.state.teams.find(t => t.teamId === "cyberpunks");
    const teamB = room.state.teams.find(t => t.teamId === "dunepunks");

    if (!teamA || !teamB) return;

    if(teamA.score === teamB.score){
      console.log('tie game!')
      room.state.players.forEach((player:PlayerState)=>{
        player.blitzPlays += 1
      })

      room.broadcast('blitz-end-game', {winner:"TIED"})
    }
    else if(teamA.score > teamB.score){
      concludeMatch(room, teamA, teamB.playerCount)
    }else{
      concludeMatch(room, teamB, teamA.playerCount)
    }

  }else{
    room.state.countdownTimer.clear()
    resetGame(room)
    return
  }

  room.state.gameTime = 15
  room.state.countdownTimer = room.clock.setInterval(()=>{
    if(room.state.gameTime > 0){
      room.state.gameTime--
    }else{
      room.state.countdownTimer.clear()
      resetGame(room)
    }
  }, 1000)
}

function concludeMatch(room:BlitzRoom, winningTeam:TeamState, opposingCount:number){
  console.log('conlcuding match')

  let moH:PlayerState
  let moHG = 0
  room.state.players.forEach(async(player:PlayerState)=>{
    if(player.isReady && player.teamId === winningTeam.teamId){
      player.client.send('teleport', {position:{x:112, y:2, z:55}, freeze:true})

      if(opposingCount >= 2){
        player.wins += 1
        player.goals += player.score
        player.addDust(10, player.client);
        
        if(player.score > moHG){
          moH = player
          moHG = player.score
        }
      }
    }else{
      if(winningTeam.playerCount >= 2){
        player.losses += 1
        player.goals += player.score
      }
      player.client.send('teleport', {position:{x:92, y:2, z:55}, freeze:true})
    }

    player.blitzPlays += 1
    await player.saveGameData()
  })

  if(moH){
    moH.addDust(5, moH.client)
    room.broadcast('man-on-match', {userId:moH.userId})
  }  

  room.broadcast('blitz-end-game', {winner:winningTeam.teamName})
}

export function resetGame(room:BlitzRoom){
  room.state.players.forEach(async (player:PlayerState)=>{
    if(!player.isSpectator && player.isReady && player.teamId !== ""){
      player.reset(room)
    }
  })

  room.state.teams.forEach((team:TeamState)=>{
    team.reset(room)
  })
  room.broadcast('reset-game', {freeze:false})
}

export function checkGameState(room:BlitzRoom, player?:PlayerState){
  if(player){
    if(player.teamId !== ""){
      console.log('player left game whle having a team, need to clean up team info')
      removeTeammate(room, player.teamId)
    }
  }

  if(room.state.isGameActive){
    let count = 0
    room.state.players.forEach((player:PlayerState)=>{
      if(player.isReady && !player.isSpectator && player.teamId !== ""){
        count++
      }
    })

    if(count === 0){
      endGame(room, true)
    }
  }
}