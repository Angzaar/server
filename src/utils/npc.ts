import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { MainRoom } from "../rooms/MainRoom";
import { getCache } from "./cache";
import { NPCS_FILE_CACHE_KEY } from "./initializer";

const pathfinding = require('pathfinding');

const gridWidth = 144;
const gridHeight = 112;
const grid = new pathfinding.Grid(gridWidth, gridHeight);
const AStarFinder = pathfinding.AStarFinder;

export class NPC extends Schema {
  @type("string") id:string;
  @type("string") n:string
  @type("number") x:number
  @type("number") y:number
  @type("number") z:number
  @type("boolean") isMoving:boolean = false
  @type("boolean") c:boolean //custom model
  @type("boolean") randomWearables:boolean
  @type(["string"]) wearables:ArraySchema<string> = new ArraySchema()

  path:any
  speed:number 
  entity:any
  room:MainRoom

  constructor(args:any, room:MainRoom){
    super(args)
    this.room = room

    const position = getRandomWalkablePosition();
    this.x = position.x
    this.y = position.y

    if(args.wearables){
        args.wearables.forEach((wearable:string)=>{
            this.wearables.push(wearable)
        })
    }

  }
    // Use A* to find a path to a target location
  moveTo(targetX:number, targetY:number) {
    const finder = new AStarFinder();
    // console.log('got here', this.x, this.y)
    const path = finder.findPath(this.x, this.y, targetX, targetY, grid.clone()); // Clone grid for safe re-use
    // console.log('now got here')
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
    if (this.isMoving && this.path.length > 0) {
      const nextStep = this.path[0]; // Get the next step in the path
      const targetX = nextStep[0];
      const targetY = nextStep[1];

      // Calculate how much the NPC should move based on speed and deltaTime
      const distanceX = targetX - this.x;
      const distanceY = targetY - this.y;
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY); // Euclidean distance

      // Move towards the target position by a fraction of the distance based on speed
      const moveDistance = this.speed * deltaTime; // How much distance to move this frame

      if (moveDistance >= distance) {
        // If the NPC can reach the target in this frame, move directly to it
        this.x = targetX;
        this.y = targetY;
        this.path.shift(); // Remove the step from the path
      } else {
        // Otherwise, move a fraction of the distance towards the target
        const moveFraction = moveDistance / distance;
        this.x += moveFraction * distanceX;
        this.y += moveFraction * distanceY;
      }

      this.room.broadcast('move-npc', {id:this.id, targetX:targetX, targetY:targetY})

      // If the path is empty, stop moving
      if (this.path.length === 0) {
        this.isMoving = false;
        // console.log(`NPC ${this.id} reached target: (${this.x.toFixed(2)}, ${this.y.toFixed(2)})`);
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

    //   console.log('new target', randomX, randomY)

      // Move to the new target
      this.moveTo(randomX, randomY);
    }
  }
}

export function updateNPCs(room:MainRoom) {
    const deltaTime = 1; // Fixed time step for 50ms updates

    room.state.npcs.forEach((npc:NPC) => {
      npc.move(deltaTime); // Move each NPC
      npc.checkAndRoam(); // Check if each NPC needs to pick a new target
    //   console.log(`NPC ${npc.id} Position: (${npc.x.toFixed(2)}, ${npc.y.toFixed(2)})`);
    });
  }

export async function createNPCs(room:MainRoom){
    await createGrid()
    await addNPCs(room)
}

function addNPCs(room:MainRoom){
    let npcData = getCache(NPCS_FILE_CACHE_KEY)
    npcData.npcs.filter((npc:any)=> npc.l === "Cyberpunk City").forEach((npc:any)=>{
        let newConfig = {...npc}
        newConfig.speed = 0.4
        if(!npc.w.r){
            newConfig.wearables = npc.w.i
        }
        const newNPC = new NPC(newConfig, room);
        room.state.npcs.set(npc.id, newNPC)
    })
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