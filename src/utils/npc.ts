import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { MainRoom } from "../rooms/MainRoom";
import { getCache, updateCache } from "./cache";
import { NPCS_FILE_CACHE_KEY } from "./initializer";
import { Client, Room } from "colyseus";
import { mainRooms } from "../rooms";

const pathfinding = require('pathfinding');

const gridWidth = 144;
const gridHeight = 112;
const grid = new pathfinding.Grid(gridWidth, gridHeight);
const AStarFinder = pathfinding.AStarFinder;

const xOffset = 16
const yOffset = 48

export class NPC extends Schema {
  @type("string") id:string;
  @type("string") n:string
  @type("number") x:number
  @type("number") y:number
  @type("number") z:number
  @type("number") rx:number
  @type("number") ry:number
  @type("number") rz:number
  @type("number") sx:number
  @type("number") sy:number
  @type("number") sz:number
  @type("boolean") isMoving:boolean = false
  @type("boolean") canWalk:boolean
  @type("boolean") c:boolean //custom model
  @type("boolean") randomWearables:boolean
  @type(["string"]) wearables:ArraySchema<string> = new ArraySchema()

  path:any
  speed:number 
  entity:any
  room:MainRoom

  updateInterval:any
  dclInterval:any
  config:any

  constructor(args:any, room:MainRoom){
    super(args)
    this.room = room
    this.config = args

    this.x = args.t.p[0]
    this.y = args.t.p[1]
    this.z = args.t.p[2]

    this.rx = args.t.r[0]
    this.ry = args.t.r[1]
    this.rz = args.t.r[2]

    this.sx = args.t.s[0]
    this.sy = args.t.s[1]
    this.sz = args.t.s[2]

    if(args.wearables){
        args.wearables.forEach((wearable:string)=>{
            this.wearables.push(wearable)
        })
    }

    if(this.canWalk){
      this.startWalking()
    }
  }
    // Use A* to find a path to a target location
  moveTo(targetX:number, targetY:number) {
    const finder = new AStarFinder();
    // console.log('got here', this.x, this.z)
    const path = finder.findPath(this.x, this.z, targetX, targetY, grid.clone()); // Clone grid for safe re-use
    // console.log('now got here', path)
    // If a path is found, set it for the NPC
    if (path.length > 0) {
      this.path = path.slice(1); // Remove current position
      this.isMoving = true;
    } else {
    //   console.log(`No path found for NPC ${this.id} to target (${targetX}, ${targetY})`);
    }
  }

  // Move the NPC along the calculated path based on speed
  move(deltaTime:number) {
    if (this.isMoving && this.path.length > 0 && this.canWalk) {
      const nextStep = this.path[0]; // Get the next step in the path
      const targetX = nextStep[0];
      const targetY = nextStep[1];

      // Calculate how much the NPC should move based on speed and deltaTime
      const distanceX = targetX - this.x;
      const distanceY = targetY - this.z;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY); // Euclidean distance

      // Move towards the target position by a fraction of the distance based on speed
      const moveDistance = this.speed * deltaTime; // How much distance to move this frame

      if (moveDistance >= distance) {
        // If the NPC can reach the target in this frame, move directly to it
        this.x = targetX;
        this.z = targetY;
        this.path.shift(); // Remove the step from the path
      } else {
        // Otherwise, move a fraction of the distance towards the target
        const moveFraction = moveDistance / distance;
        this.x += moveFraction * distanceX;
        this.z += moveFraction * distanceY;
      }

      // this.room.broadcast('move-npc', {id:this.id, targetX:targetX, targetY:targetY})

      // If the path is empty, stop moving
      if (this.path.length === 0) {
        this.isMoving = false;
        // console.log(`NPC ${this.id} reached target: (${this.x.toFixed(2)}, ${this.z.toFixed(2)})`);
      }
    }
  }

  // Check if NPC has reached the target and start a new random path
  checkAndRoam() {
    if (!this.isMoving) {
      // Choose a new random target if the NPC has stopped
      let randomX = Math.floor(Math.random() * grid.width);
      let randomY = Math.floor(Math.random() * grid.height);

      // Ensure the random target is walkable
      while (!grid.isWalkableAt(randomX, randomY)) {
        randomX = Math.floor(Math.random() * grid.width);
        randomY = Math.floor(Math.random() * grid.height);
      }

      // console.log('new target', randomX, randomY)

      // Move to the new target
      this.moveTo(randomX, randomY);
    }
  }

  startWalking(){
    this.x += xOffset
    this.z += yOffset
    
    this.updateInterval = setInterval(()=>{
      this.canWalk = true
      const deltaTime = 1;
      this.move(deltaTime);
      this.checkAndRoam();
    }, 50)
  }

  stopWalking(){
    this.canWalk = false
    clearInterval(this.updateInterval)
    this.isMoving = false
    this.x = this.config.t.p[0]
    this.z = this.config.t.p[2]
    
  }
}

export function stopWalkingNPC(room:MainRoom, id:string){
  console.log('stop walking npc', id)
  let npc = room.state.npcs.get(id)
  if(!npc){
    return
  }
  npc.stopWalking()
  room.broadcast('npc-stop-walking', {id, pos:npc.config.t.p})
}

export function startWalkingNPC(room:MainRoom, id:string){
  console.log('start walking npc', id)
  let npc = room.state.npcs.get(id)
  if(!npc){
    return
  }
  npc.startWalking()
}

export function stopNPCPaths(room:MainRoom){
  room.state.npcs.forEach((npc:NPC)=>{
    npc.stopWalking()
  })
}

export function updateNPC(client:Client, message:any){
  let npcData = getCache(NPCS_FILE_CACHE_KEY)
  let npc = npcData.npcs.find((item:any)=> item.id === message.id)
  if(!npc){
    console.log('no item found to edit')
    return
  }
  
  switch(message.action){
    case 'display-name':
      npc.dn = message.value
      mainRooms.forEach((room:MainRoom)=>{    
        room.broadcast('npc-update', message)
    })
      break;

    case 'model':
        npc.m = message.value
        break;

    case 'walking':
        npc.p.e = message.value
        mainRooms.forEach((room:MainRoom)=>{    
            if(message.value){
                startWalkingNPC(room, npc.id)
            }else{
                stopWalkingNPC(room, npc.id)
            }
        })
        break;

    case 'status':
        npc.en = message.value
        mainRooms.forEach((room:MainRoom)=>{
            if(message.value){
                enableNPC(room, npc)
            }else{
                disableNPC(room, npc)
            }
        })
        break;

    case 'transform':
        npc.t[message.field][message.axis] += (message.direction * message.modifier)

        mainRooms.forEach((room:MainRoom)=>{
            let roomNPC = room.state.npcs.get(npc.id)
            if(!roomNPC){
                return
            }
            roomNPC.x = npc.t.p[0]
            roomNPC.y = npc.t.p[1]
            roomNPC.z = npc.t.p[2]

            roomNPC.rx = npc.t.r[0]
            roomNPC.ry = npc.t.r[1]
            roomNPC.rz = npc.t.r[2]

            roomNPC.sx = npc.t.s[0]
            roomNPC.sy = npc.t.s[1]
            roomNPC.sz = npc.t.s[2]

            room.broadcast('npc-update', message)
        })
        break;
  }
}

export function enableNPC(room:MainRoom, config:any){
  addNPC(room, config)
}

export function disableNPC(room:MainRoom, config:any){
  let npc = room.state.npcs.get(config.id)
  if(!npc){
    return
  }
  npc.stopWalking()
  room.state.npcs.delete(config.id)
} 

export async function createNPCs(room:MainRoom){
    await createGrid()
    // await addNPCs(room)

    let npcData = getCache(NPCS_FILE_CACHE_KEY)
    let enabledNPCs = [...npcData.npcs.filter((npc:any)=> npc.en)]
    console.log('enabled npcs are ', enabledNPCs)
    addNPCs(room, enabledNPCs)

}

export function addNPC(room:MainRoom, config:any){
  console.log('adding npc', config.n)
  let newConfig = {...config}
  if(!config.w.r){
      newConfig.wearables = config.w.i
  }
  newConfig.canWalk = config.p.e
  const newNPC = new NPC(newConfig, room);
  room.state.npcs.set(config.id, newNPC)
}

function addNPCs(room:MainRoom, npcs:any[]){
  if(npcs.length > 0){
    let nextNPC = npcs.shift()
    addNPC(room, nextNPC)
    setTimeout(()=>{
      addNPCs(room, npcs)
    }, Math.random() * 1000)
  }
}

function createGrid(){
  let npcData = getCache(NPCS_FILE_CACHE_KEY)
  let gridInfo = npcData.grid
  if(!gridInfo){
    console.log('no grid info to set enabled',)
    return
  }
//     markStores()
//     markArtGallery()
//     markLandscaping()
    gridInfo.forEach((item:any)=>{
      setNPCGrid(item.x, item.y, item.enabled)
    })
}

export function setNPCGrid(x:number, y:number, enabled:boolean){
  if (grid.isInside(x, y)) {
    // console.log('x y inside grid, mark unwalkable', x, y)
    grid.setWalkableAt(x, y, enabled);
}
}

function getRandomWalkablePosition() {
    let x, y;
  
    do {
      x = Math.floor(Math.random() * gridWidth);
      y = Math.floor(Math.random() * gridHeight);
    } while (!grid.isWalkableAt(x, y)); // Repeat until a walkable position is found
  
    return { x, y };
  }

function markStores(){
    markRectangleAsUnwalkable(grid, 0, 0, 16, 32, gridHeight);
    markRectangleAsUnwalkable(grid, 0, 32, 50, 32, gridHeight);
    markRectangleAsUnwalkable(grid, 32, 0, 16, 50, gridHeight);
    markRectangleAsUnwalkable(grid, 0, 48, 16, 16, gridHeight);
    markRectangleAsUnwalkable(grid, 32, 0, 32, 16, gridHeight);
    markRectangleAsUnwalkable(grid, 32, 32, 32, 16, gridHeight);
    markRectangleAsUnwalkable(grid, 80, 0, 32, 16, gridHeight);
    markRectangleAsUnwalkable(grid, 128, 0, 16, 32, gridHeight);
    markRectangleAsUnwalkable(grid, 0, 64, 16, 48, gridHeight);

    //dominos
    markRectangleAsUnwalkable(grid, 59, 56, 4, 4, gridHeight);
}

function markArtGallery(){
    markRectangleAsUnwalkable(grid, 17, 72, 13, 2, gridHeight);
    markRectangleAsUnwalkable(grid, 29, 72, 2, 8, gridHeight);
    markRectangleAsUnwalkable(grid, 29, 77, 20, 2, gridHeight);
    markRectangleAsUnwalkable(grid, 48, 72, 2, 8, gridHeight);
    markRectangleAsUnwalkable(grid, 48, 68, 33, 8, gridHeight);
    markRectangleAsUnwalkable(grid, 81, 68, 2, 8, gridHeight);
    markRectangleAsUnwalkable(grid, 81, 77, 20, 2, gridHeight);
    markRectangleAsUnwalkable(grid, 101, 72, 2, 8, gridHeight);
    markRectangleAsUnwalkable(grid, 101, 72, 13, 2, gridHeight);
    markRectangleAsUnwalkable(grid, 101, 72, 2, 40, gridHeight);
}
function markLandscaping(){
    //small tree lawns
    markRectangleAsUnwalkable(grid, 26, 50, 10, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 51, 50, 10, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 75, 50, 10, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 100, 50, 10, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 125, 50, 10, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 86, 72, 10, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 34, 72, 10, 4, gridHeight);

    //vertical small tree lawns
    markRectangleAsUnwalkable(grid, 18, 72, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 138, 54, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 138, 74, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 138, 94, 4, 10, gridHeight);

    markRectangleAsUnwalkable(grid, 126, 54, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 126, 74, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 126, 94, 4, 10, gridHeight);

    markRectangleAsUnwalkable(grid, 114, 54, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 114, 74, 4, 10, gridHeight);
    markRectangleAsUnwalkable(grid, 114, 94, 4, 10, gridHeight);

    markCircleAsUnwalkable(grid, 122, 66, 4)
    

    //large tree lawns
    markRectangleAsUnwalkable(grid, 74, 61, 18, 4, gridHeight);
    markRectangleAsUnwalkable(grid, 48, 61, 18, 4, gridHeight);
}

function markRectangleAsUnwalkable(grid:any, startX:number, startY:number, width:number, height:number, gridHeight:number) {
    const adjustedY = gridHeight - startY - height; // Adjust bottom-left y-coordinate to top-left
    for (let x = startX; x <= startX + width; x++) {
      for (let y = startY; y <= startY + height; y++) {
        if (grid.isInside(x, y)) {
            // console.log('x y inside grid, mark unwalkable', x, y)
            grid.setWalkableAt(x, y, false);
        }
      }
    }
}
  
function markCircleAsUnwalkable(grid:any, centerX:number, centerY:number, radius:number) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let y = centerY - radius; y <= centerY + radius; y++) {
        // Check if the cell is within the circle's radius and inside the grid
        if (
          grid.isInside(x, y) &&
          Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2) <= radius
        ) {
          grid.setWalkableAt(x, y, false);
        }
      }
    }
}