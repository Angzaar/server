const fs = require('fs-extra');
const path = require('path');
import { exec, spawn } from "child_process";
import * as unzipper from "unzipper";
import { getCache, updateCache } from "./cache";
import { DEPLOY_LOCATION, DEPLOYMENT_QUEUE_CACHE_KEY, DEPLOYMENT_QUEUE_FILE, LOCATIONS_CACHE_KEY, LOCATIONS_FILE, TEMP_LOCATION } from "./initializer";
import { prepareLocationReset } from "./admin";
import ignore from "ignore";
import { ChainId, getChainName, EntityType } from '@dcl/schemas'

import { DeploymentBuilder } from "dcl-catalyst-client";
export interface IFile {
    path: string
    content: Buffer
    size: number
}

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

export const npm = /^win/.test(process.platform) ? 'npm.cmd' : 'npm'

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

            if(userReservaton.endDate < Math.floor(Date.now()/1000)){
                console.log('reservation expired, cancel deployment')
                await fs.remove(path.join(TEMP_LOCATION, deployment.file));
                throw new Error("Reservation expired")
            }
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

        console.log('verifying scene...')
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
        
        location.parcels.forEach((parcel:any)=>{
            metadata.scene.parcels.push(parcel)
        })

        metadata.scene.base =  metadata.scene.parcels[0]

        if(deployment.reservationId === "admin" && deployment.userId === process.env.DEPLOY_ADDRESS){}
        else{
            let sortedLocation = sortCoordinatesIntoGrid(metadata.scene.parcels)
            let flattenedGrid = flattenGrid(sortedLocation)

            metadata.scene.parcels = flattenedGrid
            metadata.scene.base =  metadata.scene.parcels[0]
            // metadata.scene.base = getBaseCoordinateInNewGrid(sortedLocation, currentBasePosition[0], currentBasePosition[1]);
        }

        console.log('sceen is', metadata.scene)

        await fs.promises.writeFile(DEPLOY_LOCATION + "/scene.json", JSON.stringify(metadata,null, 2));

        //Testing purposes only
        // console.log('testing and will abort on purpose')
        // await resetDeployment(deployment.id)
        // return

        
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
        // await runCommand(`npm run build`, DEPLOY_LOCATION);

        await buildTypescript({
            workingDir: DEPLOY_LOCATION, 
            watch:false, 
            production: true
          })

           //   // Obtain list of files to deploy//
           const originalFilesToIgnore = await fs.readFile(
            DEPLOY_LOCATION + '/.dclignore',
              'utf8'
            )

          const files: IFile[] = await getFiles({
          ignoreFiles: originalFilesToIgnore,
          skipFileSizeCheck: false,
          }, DEPLOY_LOCATION)
          const contentFiles = new Map(files.map((file) => [file.path, file.content]))

          // Create scene.json
          const sceneJson = await getSceneFile(DEPLOY_LOCATION + "/")

          const { entityId, files: entityFiles } = await DeploymentBuilder.buildEntity({
              type: EntityType.SCENE,
              pointers: findPointers(sceneJson),
              files: contentFiles,
              metadata: sceneJson
          })

        // Force lowercase for the deployment key's derived address
        // This is needed because the linker service expects lowercase addresses
        let deployCommand = "DCL_PRIVATE_KEY=" + process.env.DEPLOY_KEY + " DCL_FORCE_LOWERCASE_ADDRESS=true " + process.env.DEPLOY_CMD
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

            location.reservations = location.reservations.filter(
                (reservation:any) => reservation.endDate >= now
              );

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
                    prepareLocationReset(location.id, "pool")
                }
            }
        })
    }
    catch(e:any){
        console.log('error checking deployment reservations', e.message)
    }
}

export const unzip = async (zipPath:string, destPath:string) => {
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



export function buildTypescript({
    workingDir,
    watch,
    production,
    silence = false
  }: {
    workingDir: string
    watch: boolean
    production: boolean
    silence?: boolean
  }): Promise<void> {
    const command = watch ? 'watch' : 'build -- -p'
    const NODE_ENV = production ? 'production' : ''
  
    return new Promise((resolve, reject) => {
      const child = spawn(npm, ['run', command], {
        shell: true,
        cwd: workingDir,
        env: { ...process.env, NODE_ENV }
      })
  
      if (!silence) {
        child.stdout.pipe(process.stdout)
        child.stderr.pipe(process.stderr)
      }
  
      child.stdout.on('data', (data) => {
        if (
          data.toString().indexOf('The compiler is watching file changes...') !==
          -1
        ) {
          if (!silence) console.log('Project built.')
          return resolve()
        }
      })
  
      child.on('close', (code) => {
        if (code !== 0) {
          const msg = 'Error while building the project'
          if (!silence)  console.log(msg)
          reject(new Error(msg))
        } else {
          if (!silence)  console.log('Project built.')
          return resolve()
        }
      })
    })
  }

  export async function getSceneFile(
    workingDir: string,
    cache: boolean = true
  ): Promise<any> {
    // if (cache && sceneFile) {
    //   return sceneFile
    // }
  
    return await fs.readJSON(path.resolve(workingDir, 'scene.json'))
  
  }

  /**
   * Returns a promise of an array of objects containing the path and the content for all the files in the project.
   * All the paths added to the `.dclignore` file will be excluded from the results.
   * Windows directory separators are replaced for POSIX separators.
   * @param ignoreFile The contents of the .dclignore file
   */
export async function getFiles({
    ignoreFiles = '',
    cache = false,
    skipFileSizeCheck = false,
  }: {
    ignoreFiles?: string
    cache?: boolean
    skipFileSizeCheck?: boolean
  } = {}, bucketDirectory:string): Promise<IFile[]> {

    // console.log('ignored files are ', ignoreFiles)

    const files = await getAllFilePaths(bucketDirectory, bucketDirectory)
    const filteredFiles = (ignore as any)()
      .add(ignoreFiles.split(/\n/g).map(($) => $.trim()))
      .filter(files)
    const data = []

    for (let i = 0; i < filteredFiles.length; i++) {
      const file = filteredFiles[i]
      const filePath = path.resolve(bucketDirectory, file)
      const stat = await fs.stat(filePath)

    //   if (stat.size > Project.MAX_FILE_SIZE_BYTES && !skipFileSizeCheck) {
    //     fail(
    //       ErrorType.UPLOAD_ERROR,
    //       `Maximum file size exceeded: '${file}' is larger than ${
    //         Project.MAX_FILE_SIZE_BYTES / 1e6
    //       }MB`
    //     )
    //   }

      const content = await fs.readFile(filePath)
      // console.log('file is', filePath)

      data.push({
        path: file.replace(/\\/g, '/'),
        content: Buffer.from(content),
        size: stat.size
      })
    }
    // this.files = data
    return data
  }

   /**
   * Returns a promise of an array containing all the file paths for the given directory.
   * @param dir The given directory where to list the file paths.
   */
 async function getAllFilePaths(dir:string, rootFolder:string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir)
      let tmpFiles: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = path.resolve(dir, file)
        const relativePath = path.relative(rootFolder, filePath)
        const stat = await fs.stat(filePath)

        if (stat.isDirectory()) {
          const folderFiles = await getAllFilePaths(
            filePath,
            rootFolder
          )
          tmpFiles = tmpFiles.concat(folderFiles)
        } else {
          tmpFiles.push(relativePath)
        }
      }

      return tmpFiles
    } catch (e) {
      return []
    }
  }

  export function findPointers(sceneJson: any): string[] {
    return sceneJson.scene.parcels
  }
