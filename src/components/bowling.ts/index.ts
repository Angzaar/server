import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";
import { laneBallContact, lanePinContact, ballPinContact, laneMat, dividerShape, GUTTER_WIDTH, LANE_WIDTH, backWallShape, halfLaneWidth, LANE_LENGTH, gutterShape, halfGutterWidth, laneShape, rowCount, headPinZ, rowSpacing, colSpacing, pinY, PIN_MASS, pinMat, pinShape, BALL_MASS, ballShape, ballMat, WORLD_UP, backGutterShape, halfLaneLength, maxSpeed, minSpeed, bowlingSlug } from "./constants";
import { BlitzRoom } from "../../rooms/BlitzRoom";

export class Frame extends Schema {
    @type(["number"]) knockedDown = new ArraySchema<number>() // e.g. [roll1, roll2]
    @type("number") score: number = 0
  }
  
  export class PlayerState extends Schema {
    @type("string") name: string = ""
    @type([Frame]) frames = resetFrames()

    currentFrameIndex: number = 0
    isDone: boolean = false

    userId:string
  }


export class BowlingObject extends Schema {
    @type("string") id:string;
  
    @type("number") px:number
    @type("number") py:number
    @type("number") pz:number
    @type("number") rx:number
    @type("number") ry:number
    @type("number") rz:number
    @type("number") rw:number
    @type("boolean") enabled:boolean = false
  
    body:any
    parent:any
    entity:any
  
    constructor(args?:any, body?:any){
      super(args)
      if(body){
        this.body = body
      }
    }
  }

export class BowlingLane extends Schema {
  @type("string") id:string;

  @type("number") px:number
  @type("number") py:number
  @type("number") pz:number
  @type("number") rx:number
  @type("number") ry:number
  @type("number") rz:number

  @type("boolean") available:boolean = true
  @type("string") status:string = "available"

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()

  // The turn order
  @type(["string"]) playerOrder = new ArraySchema<string>()

  // Which player is rolling now?
  @type("number") activePlayerIndex: number = -1
  @type("number") countdown:number = 0


  @type({map:BowlingObject}) ball:MapSchema<BowlingObject> = new MapSchema()
  @type({map:BowlingObject}) pins:MapSchema<BowlingObject> = new MapSchema()

  knockedPins:number[] = []
  originalPinPositions:Map<string, any> = new Map()
  gutterBodies:Map<string, CANNON.Body> = new Map()
  laneDividers:Map<string, CANNON.Body> = new Map()
  lane:CANNON.Body

  parent:any
  entity:any
  leftGutterEntity:any
  rightGutterEntity:any
  backWallEntity:any

  playerBowling:boolean = false
  physicsActive:boolean = false

  //player bowling swing inputs
  backSwingY:number = 0

  //timers
  confirmReservationCountdown:any
  finishBowlTimer:Delayed

  room:BlitzRoom

  destroy(){
    // this.finishBowlTimer.clear()
    this.ball.clear()
    this.pins.clear()
    this.gutterBodies.clear()
    this.laneDividers.clear()
    this.lane = null
  }

  constructor(index:number,room:BlitzRoom, offset:number){
    super()
    this.room = room
    this.id = "lane-"+index

    this.px = 45 + offset
    this.py = .2 + 60
    this.pz = 60

    // Add them to the world
    this.room.state.world.addContactMaterial(laneBallContact)
    this.room.state.world.addContactMaterial(lanePinContact)
    this.room.state.world.addContactMaterial(ballPinContact)

    this.createDividers()
    this.createBack()
    this.createGutter('left')
    this.createLane()
    this.createGutter('right')
    this.createPins()
    this.createBall()
  }

  createDividers(){
    let body =  new CANNON.Body({ mass: 0, material:laneMat })
    this.gutterBodies.set('leftDivider', body)
    body.addShape(dividerShape)
    console.log('divider left is', body.id)


    body.position.set(this.px, this.py, this.pz + 0.25)
    this.room.state.world.addBody(body)

    let right =  new CANNON.Body({ mass: 0, material:laneMat })
    this.gutterBodies.set('rihtDivider', right)
    right.addShape(dividerShape)
    console.log('divider right is', right.id)

    right.position.set(this.px + (2*GUTTER_WIDTH) + LANE_WIDTH, this.py, this.pz + 0.25)
    this.room.state.world.addBody(right)
  }

  createBack(){
    let body =  new CANNON.Body({ mass: 0, material:laneMat })
    body.addShape(backWallShape)
    console.log('back id is', body.id)

    body.position.set(this.px + GUTTER_WIDTH + halfLaneWidth, this.py, this.pz + (LANE_LENGTH / 2) + 0.75)

    // Add to the world
    this.room.state.world.addBody(body)


    let backGutter =  new CANNON.Body({ mass: 0, material:laneMat })
    this.gutterBodies.set("" + backGutter.id, backGutter)
    backGutter.addShape(backGutterShape)
    console.log('back gutter is', backGutter.id)

    backGutter.position.set(this.px + GUTTER_WIDTH + halfLaneWidth, this.py - 0.2, this. pz + (LANE_LENGTH / 2) + 0.25)

    // Add to the world
    this.room.state.world.addBody(backGutter)
  }

  createGutter(side:string){
    let body =  new CANNON.Body({ mass: 0, material:laneMat })
    this.gutterBodies.set("" + body.id, body)
    body.addShape(gutterShape)
    console.log('gutter id is', body.id)

    if(side === "left"){
        body.position.set(this.px + halfGutterWidth, this.py - 0.2, this.pz)
    }else{
        body.position.set(this.px + GUTTER_WIDTH + LANE_WIDTH + halfGutterWidth, this.py - 0.2, this.pz)
    }

    // Add to the world
    this.room.state.world.addBody(body)
  }

  createLane(){
    this.lane = new CANNON.Body({
        shape: laneShape,
        mass:0,
        material:laneMat
    })

    // Position so its center is at (x=10, y=0, z=0)
    this.lane.position.set(this.px + GUTTER_WIDTH + halfLaneWidth, this.py, this.pz)
    this.room.state.world.addBody(this.lane)

  }

  createPins(){
    for (let i = 0; i < rowCount; i++) {
        // i-th row => i+1 pins
        const rowZ = 40 + headPinZ + i * rowSpacing
        const pinsInRow = i + 1
      
        // The horizontal span of i+1 pins is (pinsInRow - 1) * colSpacing
        // The leftmost pin X offset from center is -span/2
        // We'll place each pin colSpacing apart
        const span = (pinsInRow - 1) * colSpacing
        for (let j = 0; j < pinsInRow; j++) {
          // the x offset for pin j in row i
          const xOffset = -span / 2 + j * colSpacing
          // final X
          const pinX = this.px + GUTTER_WIDTH + halfLaneWidth + xOffset
      
          let pinBody = this.createPinBody(pinX, pinY, rowZ)
          this.pins.set("" + pinBody.id, new BowlingObject({px:pinX, py:pinY, pz:rowZ}, pinBody))
          this.originalPinPositions.set("" + pinBody.id, {pinX, pinY, rowZ})
        }
    }
    console.log('creating pins')
  }

  createPinBody(x: number, y: number, z: number) {
    // mass = 1, or tweak as desired
    const pinBody = new CANNON.Body({ mass: PIN_MASS, material:pinMat })
  
    // add the shape
    pinBody.addShape(pinShape)
  
    // by default, the cylinder axis is along local Z
    // rotate so it stands upright along Y
    // i.e., rotate π/2 around X
    // const q = new CANNON.Quaternion()
    // q.setFromEuler(Math.PI / 2, 0, 0)
    // pinBody.quaternion.copy(q)

    // pinBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0, 'XYZ')
  
    // // position the pin
    pinBody.position.set(x, y, z)
  
    // add to world
    this.room.state.world.addBody(pinBody)
    pinBody.sleep()

    return pinBody
  }

  async createBall(){
    // 2) Body with mass
    const ballBody = new CANNON.Body({
        mass: BALL_MASS,
        shape: ballShape,
        material:ballMat
    })
    
    let {x, y, z} = this.getBallStart()
    
    ballBody.position.set(x, y, z)
    this.ball.set("ball", new BowlingObject({px:x, py:y, pz:z}, ballBody))

    // 5) Add to the d
    // this.room.state.world.addBody(ballBody)

    ballBody.addEventListener("collide", (event:any) => {
      const otherBody = event.body
      if(this.gutterBodies.has("" + otherBody.id)){
        if(this.playerBowling){
          console.log("hit gutter, ending turne")
          this.finishBowlTimer.clear()
          this.finishBowlTimer = this.room.clock.setTimeout(()=>{
            this.calculateBowl()
          }, 1000 * 5)
        }
      }
    })

    this.room.state.world.addBody(ballBody)
  }

  lowerPins(){
    console.log('lowering pins', this.pins.size)
    let interval = 100
    let currentY = pinY
    let lowerInterval = this.room.clock.setInterval(()=>{
        if(currentY >= 0.5 + 60){
          currentY -= 0.1
            this.pins.forEach((pin:BowlingObject, id:string)=>{
                pin.py = pin.py - 0.1
            })
        }else{
            lowerInterval.clear()
            this.pins.forEach((pin:BowlingObject, id:string)=>{
                pin.body.position.set(pin.px, pin.py, pin.pz)
                // pin.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0, "XYZ")
                pin.body.velocity.set(0, 0, 0)
                pin.body.angularVelocity.set(0, 0, 0)
                pin.body.wakeUp()
            })
            this.physicsActive = true
            let ball = this.ball.get('ball')
            ball.enabled = true
        }
    }, interval)
  }

  async calculateBowl(){
    console.log('calculating bowler turn')
    this.finishBowlTimer.clear()
    this.playerBowling = false
    this.physicsActive = false
    let ball = this.ball.get('ball')
    ball.enabled = false

    // 1) Count pins knocked
    await this.countKnockedPins()
    console.log('knocked down', this.knockedPins.length + " pins")

    // 2) Update current player's frame
    await this.updateFrameScore(this.knockedPins.length)

    await this.removePins()

    // 4) Check if we move to next roll or next player
    await this.advanceTurn()
  }

  addBowler(info:any){
    let bowler = new PlayerState()
    bowler.name = info.name
    bowler.userId = info.userId
    this.playerOrder.push(info.userId)
    this.players.set(info.userId, bowler)
  }

  startNewGame(){
    this.activePlayerIndex = 0

    this.players.forEach((player:PlayerState, id:string)=>{
        player.frames.length = 0
        player.frames = resetFrames()
        player.isDone = false
    })

    this.resetPins()
  }

  async advanceTurn() {
    const playerId = this.playerOrder[this.activePlayerIndex]
    const player = this.players.get(playerId)
    if (!player) return
  
    const frameIndex = player.currentFrameIndex
    const frame = player.frames[frameIndex]
    const rollsSoFar = frame.knockedDown.length

    let frameComplete = false
  
    // If it's the 10th frame (frameIndex == 9)
    if (frameIndex === 9) {
      // up to 3 rolls in the 10th
      // - if strike in first roll => 2 bonus rolls
      // - if spare in first two rolls => 1 bonus roll
      // - else just 2
      if (rollsSoFar >= 3) {
        // done with final frame
        player.isDone = true
      } else if (rollsSoFar === 2) {
        const totalFirstTwo = frame.knockedDown[0] + frame.knockedDown[1]
        if (frame.knockedDown[0] !== 10 && totalFirstTwo < 10) {
          // no spare, no strike => done
          player.isDone = true
        }
      }
    } else {
      // Frames 0..8
      console.log('not in 10th frame, rolls are ', rollsSoFar)
      if (rollsSoFar >= 2 || frame.knockedDown[0] === 10) {
        frameComplete = true
        player.currentFrameIndex++
        if (player.currentFrameIndex >= 10) {
          player.isDone = true
        }
      }
    }
  
    // Now see if this player is done or not
    if (player.isDone) {
      // if all players done => endGame
      if (this.allPlayersDone()) {
        this.endGame()
        return
      } else {
        // move on to the next player
        this.advancePlayer()
      }
    }
    else if(frameComplete){
      this.advancePlayer()
    } 
    else {
      // If we haven't finished the frame but the frame only needs the next roll,
      // you can either let the same player continue or do your normal cycle logic.
      // Some bowling houses let you keep rolling if there's still a roll left in the frame.
      // But your code is rotating players after each roll. It's up to you.
      console.log("Still on same player, waiting for second roll ...")
      // Possibly re-lower pins, etc.
      if (rollsSoFar === 1 && frameIndex < 9 && frame.knockedDown[0] < 10) {
        await this.resetPins()
        this.resetBall(this.getBallStart())
      }
      // If it's 10th frame but you still have bonus rolls, also reset pins *only* if first roll was strike 
      // and you want to keep them up? Real bowling doesn't reset them if you knocked some pins 
      // but not all, but your game might differ. 
    }
  }

  resetPins(){
    this.pins.forEach((pin:BowlingObject, id:string)=>{
      pin.body.velocity.set(0, 0, 0)
      pin.body.angularVelocity.set(0, 0, 0)

      let original:any = this.originalPinPositions.get("" + pin.body.id)
      pin.body.position.set(original.pinX, original.pinY, original.rowZ)
      pin.px = original.pinX
      pin.py = original.pinY
      pin.pz = original.rowZ

      pin.body.quaternion.set(0, 0, 0, 1)
    })

    this.room.clock.setTimeout(()=>{
      console.log('need to lower pins')
      this.pins.forEach((pin:BowlingObject, id:string)=>{
        pin.body.position.set(pin.px, pin.py, pin.pz)
        // pin.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0, "XYZ")
        pin.body.velocity.set(0, 0, 0)
        pin.body.angularVelocity.set(0, 0, 0)
        pin.body.wakeUp()
      })

      this.lowerPins()
    }, 1000 * 1)
  }

  removePins(newPlayer?:boolean){
    this.knockedPins.forEach((id:number)=>{  
      let pin = this.pins.get("" + id)
      if(pin.body){
        this.room.state.world.removeBody(pin.body)
      }
      this.pins.delete("" + id)
    })
    this.knockedPins.length = 0

    if(!newPlayer){
      return
    }
    this.originalPinPositions.clear()
  }

  endGame() {
    console.log("Game Over!")
    // optionally broadcast final scores
  }

  allPlayersDone(): boolean {
    console.log('all players done')
    for (let sessionId of this.playerOrder) {
      const pl = this.players.get(sessionId)
      if (pl && !pl.isDone) return false
    }
    return true
  }

  async advancePlayer(){
    this.pins.forEach((pin:BowlingObject)=>{
        this.knockedPins.push(pin.body.id)
    })
    this.removePins(true)

    this.activePlayerIndex++
    if (this.activePlayerIndex >= this.playerOrder.length) {
      this.activePlayerIndex = 0
    }

    console.log('it is now ' + this.playerOrder[this.activePlayerIndex] + " turn")

    await this.createPins()
    this.lowerPins()
    this.resetBall(this.getBallStart())
  }

  async handleRollBall(client: Client, data: any) {
    // 1) Check if it's actually this client's turn
    const currentId = this.playerOrder[this.activePlayerIndex]
    if (client.userData.userId !== currentId) {
      console.log("Not your turn!")
      return
    }

    if(this.playerBowling){
      console.log('player already bowling turn')
      return
    }

    console.log('rolling ball for lane',)
    await this.resetBall(data.playerPosition)
    let ball = this.ball.get('ball')

    let horizontalVelocity = calculateVelocity(data.direction, 10)
    let verticalVelocity = Math.max(1, Math.min(data.pos - this.backSwingY, 5));

    ball.body.velocity.set(horizontalVelocity.x, verticalVelocity, horizontalVelocity.z)
    ball.body.angularVelocity.set(0,5, 0)

    this.playerBowling = true
    this.startBowlingTimer()

    // Possibly store that we are "in rolling state"
  }

  resetBall(position:any){
    let ball = this.ball.get('ball')

    ball.body.velocity.set(0, 0, 0)
    ball.body.angularVelocity.set(0, 0, 0)
    // ball.body.quaternion.set(0, 0, 0, 1)

    let {x, y, z} = this.getBallStart()

    ball.body.position.set(position.x,y,z)
    ball.px = position.x
    ball.py = y
    ball.pz = z

    ball.enabled = true
  }

  getBallStart(){
    const x = this.px + GUTTER_WIDTH + halfLaneWidth       // If lane center is x=10
    const y = 1 + 60  // So the ball sits just on top of the lane at y=0
    const z = this.pz - halfLaneLength // + (halfLaneLength / 2)     // If lane extends from z=-12.5 to z=+12.5 for a 25m lane
    return {x,y,z}
  }

  startBowlingTimer(){
    this.finishBowlTimer = this.room.clock.setTimeout(()=>{
      this.calculateBowl()
    }, 1000 * 15)
  }

  countKnockedPins() {
    this.pins.forEach((pin:BowlingObject)=>{
        if (this.hasFallen(pin.body)) {
          this.knockedPins.push(pin.body.id)
        }
    })
  }

  updateFrameScore(knocked: number) {
    // 1) Identify the current player
    const playerId = this.playerOrder[this.activePlayerIndex]
    const player = this.players.get(playerId)
    if (!player) return

    // 2) Current frame
    const frameIndex = player.currentFrameIndex
    const frame = player.frames[frameIndex]

    // 3) Record the knocked pins in this “roll”
    frame.knockedDown.push(knocked)

     // 4) Recalculate *all* frames for this player
    recalcScoresForPlayer(player)

      // If you want, you can log the partial results here:
    console.log(`Frame #${frameIndex + 1} rolls = ${frame.knockedDown} => frame score ${frame.score}`)
  }

  hasFallen(body:any){
    // 1. Compute the pin's up vector in world space
    const pinUp = new CANNON.Vec3(0, 1, 0);
    body.quaternion.vmult(pinUp, pinUp);
  
    // 2. Compare dot product of pinUp with the global world up
    const dot = pinUp.dot(WORLD_UP); 
    // If the pin is perfectly upright, dot ~ 1.0
    // If the pin is lying sideways, dot ~ 0.0 or negative
  
    // 3. Decide a threshold for "fallen."
    // For instance, if the pin’s angle from upright is more than ~45°, 
    // the dot product will be less than cos(45°) = 0.707.
    const threshold = Math.cos(Math.PI / 4); // ~0.707
  
      // Check if it's not spinning too much
    const angularSpeed = body.angularVelocity.length();
    const isSettled = angularSpeed < 0.5; // tweak threshold as needed
  
    return dot < threshold && isSettled;
  }

  updateLanePhysicsObjects(){
    if(!this.physicsActive){
        return
    }

    this.pins.forEach((pin:BowlingObject, id:string)=>{
        // console.log('positions is', pin.body.position)
        if (pin.body){
            // positions
            pin.px = pin.body.position.x
            pin.py = pin.body.position.y
            pin.pz = pin.body.position.z

            // full quaternion
            pin.rx = pin.body.quaternion.x
            pin.ry = pin.body.quaternion.y
            pin.rz = pin.body.quaternion.z
            pin.rw = pin.body.quaternion.w
        }
    })

    let ball = this.ball.get("ball")
    if(ball && ball.enabled){

      // if (
      //   isNaN(ball.body.velocity.x) ||
      //   isNaN(ball.body.velocity.y) ||
      //   isNaN(ball.body.velocity.z) ||
      //   isNaN(ball.body.angularVelocity.x) ||
      //   isNaN(ball.body.angularVelocity.y) ||
      //   isNaN(ball.body.angularVelocity.z)
      // ) {
      //   console.log("Ball velocity or angular velocity contains NaN:", ball.body.velocity, ball.body.angularVelocity);
      //   // Optionally, skip applying the force this update:
      //   return;
      // }

      // const MAGNUS_COEFFICIENT = 0.01

      // // Create a temporary vector to hold the force.
      // const magnusForce = new CANNON.Vec3()

      // // Compute the cross product: angularVelocity x linearVelocity.
      // // This produces a vector perpendicular to both, which is our Magnus force direction.
      // ball.body.angularVelocity.cross(ball.body.velocity, magnusForce)
      
      // // Scale the force by our coefficient.
      // magnusForce.scale(MAGNUS_COEFFICIENT, magnusForce)
      
      // // Apply the force at the ball's current position.
      // ball.body.applyForce(magnusForce, ball.body.position)


      ball.px = ball.body.position.x
      ball.py = ball.body.position.y
      ball.pz = ball.body.position.z
  
      ball.rx = ball.body.quaternion.rx
      ball.ry = ball.body.quaternion.ry
      ball.rz = ball.body.quaternion.rz
      ball.rw = ball.body.quaternion.rw
    }
  }

  startReservationCountdown(time:number){
    if(time >= 0){
      this.countdown = time
      this.finishBowlTimer = this.room.clock.setTimeout(()=>{
        this.startReservationCountdown(time-1)
      }, 1000)
    }else{
      this.finishBowlTimer.clear()
      this.status = "playing"
      this.startNewGame()
    }
  }

  async removeUser(userId:string){
    let playerIndex = this.playerOrder.findIndex((user:string)=> user === userId)
    if(playerIndex >=0){
      if(this.status === "pending"){
        this.playerOrder.splice(playerIndex, 1)
        this.players.delete(userId)
        if(this.playerOrder.length === 0){
          this.finishBowlTimer.clear()
          this.status = "available"
          this.countdown = 20
        }
      }else{
        if(this.activePlayerIndex === playerIndex){
          this.finishBowlTimer.clear()
          await this.advancePlayer()
          this.playerOrder.splice(playerIndex, 1)
          this.players.delete(userId)
        }
      }
      
    }
  }
}

export function resetLane(room:BlitzRoom, id:string){
    let lane = room.state.bowlingLanes.get('lane-' + id)
    if(!lane){
        return
    }

    //clean up pins
    //remove pins,
    //add new pins
    //lower pins
    //remove guard

    lane.lowerPins()
}

export function handleBowlingMessage(room:BlitzRoom, client:Client, info:any){
  if(!info.action) return;

  let player = room.state.players.get(client.userData.userId)
  if(!player)  return;

  let bowlingLane = room.state.bowlingLanes.get(info.laneId)
  if(!bowlingLane)  return;

  switch(info.action){
      case 'reserve-lane':
        // if(!bowlingLane.available) return
        if(bowlingLane.status === "playing")  return;

        if(player.currentGame === bowlingSlug)  return;
        
        player.currentGame = bowlingSlug

        // bowlingLane.available = false
        bowlingLane.addBowler({userId:client.userData.userId, name:"" + player.name})

        //begin countdown to confirm reservation
        if(bowlingLane.status === "available"){
          bowlingLane.status = "pending"

          let timer = 20
          bowlingLane.startReservationCountdown(timer)
        }
        
          break;

      case 'cancel-reservation':
        console.log('removing player from pending lane setup')
        bowlingLane.removeUser(client.userData.userId)
        player.currentGame = ""
        break;

      case 'confirm-reservation':
        if(!bowlingLane.available) return

        bowlingLane.available = false
        bowlingLane.playerOrder.push(client.userData.userId)
          break;

        case 'backswing':
          bowlingLane.backSwingY = info.point
          break;
        
        case 'bowl':
          bowlingLane.handleRollBall(client, info)
          break;
  }
}

function resetFrames(){
  return new ArraySchema<Frame>(
    ...Array.from({ length: 10 }, () => new Frame())
  )
}



interface Vector3 {
  x: number
  y: number
  z: number
}
// Helper function to get a random number between min and max
function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function calculateVelocity(direction:Vector3, speed:number){
  return scaleVector(direction, speed)
}

function scaleVector(v: Vector3, scalar: number): Vector3 {
  return {
    x: v.x * scalar,
    y: v.y * scalar,
    z: v.z * scalar
  }
}

export function updateBowlingObjects(room:BlitzRoom, dt:number){
  room.state.bowlingLanes.forEach((bowlingLane:BowlingLane)=>{
    bowlingLane.updateLanePhysicsObjects()
  })
}

/**
 * Takes the list of *all rolls* from frames 0..9 (and possibly a 3rd roll in the 10th),
 * and returns an array of length 10 with each frame's total, including strike/spare bonuses.
 *
 * Example:
 *   rolls = [10, 7, 2, 10, 4, 6, 3, 3, ... ] => array of raw pin counts in the order they were thrown.
 *
 * The returned array has 10 numbers, one for each frame's final total, NOT cumulative. 
 * You can always convert to a cumulative scoreboard if you want.
 */
export function calculateBowlingScores(rolls: number[]): number[] {
  const frameScores: number[] = new Array(10).fill(0)
  let rollIndex = 0

  for (let frame = 0; frame < 10; frame++) {
    // If the 10th frame (frame == 9), handle differently
    if (frame === 9) {
      // All remaining rolls in the array belong to the 10th frame
      const tenthFrameRolls = rolls.slice(rollIndex)
      // Basic sum
      frameScores[frame] = tenthFrameRolls.reduce((acc, r) => acc + r, 0)
      break
    }

    // Normal frames 0..8
    const firstRoll = rolls[rollIndex] ?? 0
    if (firstRoll === 10) {
      // STRIKE
      frameScores[frame] = 10 + (rolls[rollIndex + 1] ?? 0) + (rolls[rollIndex + 2] ?? 0)
      rollIndex += 1 // strike uses only one roll in frames 0..8
      continue
    } else {
      // check second roll
      const secondRoll = rolls[rollIndex + 1] ?? 0
      const frameTotal = firstRoll + secondRoll
      if (frameTotal === 10) {
        // SPARE
        frameScores[frame] = 10 + (rolls[rollIndex + 2] ?? 0)
      } else {
        // OPEN FRAME
        frameScores[frame] = frameTotal
      }
      rollIndex += 2
    }
  }

  return frameScores
}


export function toCumulative(frameScores: number[]): number[] {
  const cumulative = new Array(10).fill(0)
  let runningTotal = 0
  for (let i = 0; i < 10; i++) {
    runningTotal += frameScores[i]
    cumulative[i] = runningTotal
  }
  return cumulative
}


function recalcScoresForPlayer(player: PlayerState) {
  // 1) Flatten all frames' knockedDown into a single array
  const rolls: number[] = []
  for (let f = 0; f < 10; f++) {
    const frame = player.frames[f]
    if (frame) {
      for (const r of frame.knockedDown) {
        rolls.push(r)
      }
    }
  }

  // 2) Use the scoring helper
  const perFrame = calculateBowlingScores(rolls)

  // 3) Write scores back to each frame
  for (let f = 0; f < 10; f++) {
    player.frames[f].score = perFrame[f] ?? 0
  }
}


export function destroyAllBowlingLanes(room:BlitzRoom){
  room.state.bowlingLanes.forEach((bowlingLane:BowlingLane)=>{
    bowlingLane.destroy()
  })
}