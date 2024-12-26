const fs = require('fs-extra');
const path = require('path');
import { exec } from "child_process";
import * as unzipper from "unzipper";
import { getCache, updateCache } from "./cache";
import { DEPLOY_LOCATION, DEPLOYMENT_QUEUE_CACHE_KEY, DEPLOYMENT_QUEUE_FILE, LOCATIONS_CACHE_KEY, LOCATIONS_FILE, TEMP_LOCATION } from "./initializer";
import { prepareLocationReset } from "./admin";

export type Deployment = {
    file:string,
    locationId:number,
    userId:string,
    id:string,
    reservationId:string,
    started?:number
    ended?:number
    status?:string
    finished?:boolean
    error?:any
}

export let deploymentQueue:Deployment[] = []

export let deploymentStatus:any = {
    status:"free",
    enabled:true,
    user:"",
    locationId:0,
    started:0,
    finished:0
}

export function checkDCLDeploymentQueue(){
    console.log(deploymentQueue)
    if(deploymentQueue.length > 0 && deploymentStatus.status === "free" && deploymentStatus.enabled){
        deploymentStatus.status = "in-use"
        let pendingDeployment:Deployment = deploymentQueue.shift()
        processDeployment(pendingDeployment)
    }
}

export async function processDeployment(deployment:Deployment){
    console.log('Processing deployment:' + deployment);
    try{
        console.log('Processing deployment:' + deployment.locationId);

        let locations = getCache(LOCATIONS_CACHE_KEY)
        let location = locations.find((loc:any)=> loc.id === deployment.locationId)

        if(!location){
            console.log('no location found for this deployment', deployment)
            return
        }

        //check admin deployment
        if(deployment.reservationId === "admin" && deployment.userId === process.env.DEPLOY_ADDRESS){
            console.log('we have an admin deployment')
        }else{
            let userReservaton = location.reservations.find((res:any)=> res.ethAddress === deployment.userId && res.id === deployment.reservationId)
            if(!userReservaton){
                console.log('no reservation for user, cancel deployment')
                await fs.remove(path.join(TEMP_LOCATION, deployment.file));
                throw new Error("No reservation for user")
            }
    
            if(location.id !== deployment.locationId){
                console.log("deployment location doesnt match reservation")
                await fs.remove(path.join(TEMP_LOCATION, deployment.file));
                throw new Error("Location not found for deployment")
            }

             //TODO - check reservation times still valid
        }

        deploymentStatus.status = "Unzipping Scene Content"
        deploymentStatus.started = Math.floor(Date.now()/1000)

        let deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        let currentDeployment = deployments.find((d:Deployment)=> d.id === deployment.id)
        if(!currentDeployment){
            deployment.started = deploymentStatus.started
            deployment.status = deploymentStatus.status
            deployments.push(deployment)
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }

        //make sure nothing is in deploy directory
        await fs.emptyDir(DEPLOY_LOCATION)

        // Step 1: Unzip the file
        await fs.ensureDir(TEMP_LOCATION);
        await unzip(path.join(TEMP_LOCATION, deployment.file), DEPLOY_LOCATION);
        console.log(`Unzipped to deploy directory`);

        //Delete the zip file
        await fs.remove(path.join(TEMP_LOCATION, deployment.file));
        console.log(`Deleted temp zip ${TEMP_LOCATION}`);

        deploymentStatus.status = "Verifying Scene..."
        deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        currentDeployment = deployments.find((d:Deployment)=> d.id === deployment.id)
        if(currentDeployment){
            deployment.status = deploymentStatus.status
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }else{
            console.log('no deploymeent found')
        }

        let fileData = await fs.promises.readFile(DEPLOY_LOCATION + "/scene.json")
        let metadata = JSON.parse(fileData.toString())

        
        let currentParcelsSorted = sortCoordinatesIntoGrid(metadata.scene.parcels)
        let currentBasePosition = findRowColInGrid(currentParcelsSorted, metadata.scene.base)

        metadata.scene.parcels = []
        metadata.scene.base = location.parcels[0]

        location.parcels.forEach((parcel:any)=>{
            metadata.scene.parcels.push(parcel)
        })

        if(deployment.reservationId === "admin" && deployment.userId === process.env.DEPLOY_ADDRESS){}
        else{
            let sortedLocation = sortCoordinatesIntoGrid(metadata.scene.parcels)
            let flattenedGrid = flattenGrid(sortedLocation)

            metadata.scene.parcels = flattenedGrid
            metadata.scene.base = getBaseCoordinateInNewGrid(sortedLocation, currentBasePosition[0], currentBasePosition[1]);
        }

        await fs.promises.writeFile(DEPLOY_LOCATION + "/scene.json", JSON.stringify(metadata,null, 2));

        
        // Step 2: Run `npm install` in the directory
        deploymentStatus.status = "Installing Dependencies"
        await runCommand(`npm install`, DEPLOY_LOCATION);
        console.log(`Installed dependencies in ${DEPLOY_LOCATION}`);

        deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        currentDeployment = deployments.find((d:Deployment)=> d.id === deployment.id)
        if(currentDeployment){
            deployment.status = deploymentStatus.status
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }

        // Step 2: Run `npm install` in the directory
        deploymentStatus.status = "Building Scene"
        deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        currentDeployment = deployments.find((d:Deployment)=> d.id === deployment.id)
        if(currentDeployment){
            deployment.status = deploymentStatus.status
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }
        console.log(`Building scene in ${DEPLOY_LOCATION}`);
        await runCommand(`npm run build`, DEPLOY_LOCATION);

        let deployCommand = "DCL_PRIVATE_KEY=" + process.env.DEPLOY_KEY + " " + process.env.DEPLOY_CMD
        console.log('deploying scene ', deployment.id, deployCommand)
        deploymentStatus.status = "Deploying Scene"
        deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);

        currentDeployment = deployments.find((d:Deployment)=> d.id === deployment.id)
        if(currentDeployment){
            deployment.status = deploymentStatus.status
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }
        
        //deploy scene
        await runCommand(deployCommand, DEPLOY_LOCATION);

        deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        currentDeployment = deployments.find((d:Deployment)=> d.id === deployment.id)
        if(currentDeployment){
            deployment.status = "Finished"
            deployment.ended = Math.floor(Date.now()/1000)
            deployment.finished = true
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }

        console.log('deployment finished')
        await resetDeployment(deployment.id)
    }
    catch(e:any){
        console.log('error processing deployment', e.message)
        failDeployment(deployment.id, e.message)
    }
}

export async function resetDeployment(deploymentId:string, reason?:string){
    try{
        await fs.emptyDir(DEPLOY_LOCATION)
        console.log('finished emptying deploy directory')
        deploymentStatus.enabled = true
        deploymentStatus.status = "free"
        deploymentStatus.user = ""
        deploymentStatus.locationId = 0
        deploymentStatus.started = 0
        deploymentStatus.finished = 0
        checkDCLDeploymentQueue()
    }
    catch(e){
        console.log('error resetting bucket', e)
        failDeployment(deploymentId, reason)
    }

}

export async function failDeployment(deploymentId:string, reason:string){
    try{
        let deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        let currentDeployment = deployments.find((d:Deployment)=> d.id === deploymentId)
        if(currentDeployment){
            currentDeployment.status = "Failed"
            currentDeployment.error = reason
            currentDeployment.ended = Math.floor(Date.now()/1000)
            currentDeployment.finished = true
            await updateCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        }

        resetDeployment(deploymentId)
    }
    catch(e:any){
        console.log('error failing bucket', e)
        disableDeployments(e.message)
    }
}

export function disableDeployments(reason:string){
    deploymentStatus.enabled = false
    deploymentStatus.status = reason
    deploymentStatus.user = ""
    deploymentStatus.locationId = 0
    deploymentStatus.started = 0
    deploymentStatus.finished = 0
}

export function checkDeploymentReservations(){
    const now = Math.floor(Date.now() / 1000);
    let locations = getCache(LOCATIONS_CACHE_KEY)
    try{
        if(!locations){
            console.log('no locations to review deployments')
            return
        }
    
        locations.forEach((location:any)=>{
            let currentReservations = location.reservations.filter(
                (reservation:any) => now >= reservation.startDate && now <= reservation.endDate
            );
        
            if(currentReservations.length > 0){
                if(location.currentReservation !== currentReservations[0].id){
                    location.currentReservation = currentReservations[0].id
                    updateCache(LOCATIONS_FILE, LOCATIONS_CACHE_KEY, locations)
                }
            }else{
                if(location.currentReservation){
                    console.log('there is a reservation, need to deploy blank land')

                    location.reservations = location.reservations.filter((reservation:any)=> reservation.startDate > now)
                    delete location.currentReservation
                    
                    updateCache(LOCATIONS_FILE, LOCATIONS_CACHE_KEY, locations)
                    prepareLocationReset(location.id)
                }
            }
        })
    }
    catch(e:any){
        console.log('error checking deployment reservations', e.message)
    }
}

const unzip = async (zipPath:string, destPath:string) => {
    return new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destPath }))
        .on("close", resolve)
        .on("error", reject);
    });
  };

const runCommand = async (command:any, cwd:any) => {
    return new Promise((resolve, reject) => {
      exec(command, { cwd }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error running command "${command}":`, stderr);
          reject(error);
        } else {
          console.log(`Command output: ${stdout}`);
          resolve(stdout);
        }
      });
    });
  };

function sortCoordinatesIntoGrid(coords:any) {
    // Parse the coordinates into numerical tuples
    const parsedCoords = coords.map((coord:any) => {
      const [x, y] = coord.split(',').map(Number);
      return { x, y, original: coord };
    });
    
    // Get unique and sorted x and y values
    const uniqueX = [...new Set(parsedCoords.map((coord:any) => coord.x))].sort((a:any, b:any) => a - b);
    const uniqueY = [...new Set(parsedCoords.map((coord:any) => coord.y))].sort((a:any, b:any) => a - b);
    
    // Create a 3x3 grid
    const grid = [];
    for (let i = uniqueY.length - 1; i >= 0; i--) { // Reverse the rows for north-positive
      const row = [];
      for (let j = 0; j < uniqueX.length; j++) { // Keep columns in ascending order for east-positive
          // Find the coordinate matching the current x and y
          const match = parsedCoords.find((coord:any) => coord.x === uniqueX[j] && coord.y === uniqueY[i]);
          row.push(match.original);
      }
      grid.push(row);
    }
    
    return grid;
}

function findRowColInGrid(grid:any, base:any) {
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            if (grid[row][col] === base) {
                return [row, col];
            }
        }
    }
    return null; // Base coordinate not found in the grid
  }

function getBaseCoordinateInNewGrid(newGrid:any, oldRow:any, oldCol:any) {
  // Validate the grid dimensions
  if (newGrid.length !== 3 || !newGrid.every((row:any) => row.length === 3)) {
      console.error("The new grid must be a 3x3 grid.");
      return null;
  }

  // Access the coordinate value at the given row and column
  return newGrid[oldRow][oldCol] || null;
}

function flattenGrid(grid:any) {
    // Validate that the input is a 2D array
    if (!Array.isArray(grid) || !grid.every(row => Array.isArray(row))) {
        console.error("The input must be a 2D array.");
        return [];
    }

    // Flatten the grid
    return grid.reduce((flatArray, row) => flatArray.concat(row), []);
}