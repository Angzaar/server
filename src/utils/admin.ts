import path from "path"
import { getCache, updateCache } from "./cache"
import { LOCATIONS_CACHE_KEY, LOCATIONS_FILE, TEMP_LOCATION } from "./initializer"
import { uuidV4 } from "ethers"
import fs from "fs/promises";
import archiver from "archiver";
import { checkDCLDeploymentQueue, checkDeploymentReservations, deploymentQueue } from "./deployment";


const { v4: uuidv4 } = require('uuid');

export async function handleAdminLocationReset(locations:string){
    let locationIds = locations.split(",")
    console.log('locations to reset are ', locationIds)
    for(let i = 0; i < locationIds.length; i++){
        await prepareLocationReset(locationIds[i])
    }
    checkDCLDeploymentQueue()
}

export async function prepareLocationReset(id:string){
    let locationId = parseInt(id)
    let locations = getCache(LOCATIONS_CACHE_KEY)
    let location = locations.find((loc:any) => loc.id === locationId)
    if(!location){
        console.log('location doesnt exist to reset')
        return
    }

    console.log('location to be reset is', location)

    try{
        let fileName = uuidv4()
        const directoryPath = path.resolve(TEMP_LOCATION, "empty-scene"); // Adjust to your directory path
        const outputZipPath = path.resolve(TEMP_LOCATION, fileName + ".zip"); // Path to save the zip file
        const jsonFileName = "scene.json"

        // Check if the directory exists
        await fs.access(directoryPath);

        // Create a write stream to save the zip file
        const output = await fs.open(outputZipPath, "w");
        const archive = archiver("zip", {
            zlib: { level: 9 }, // Best compression
        });

        // Pipe the zip archive data to the write stream
        const stream = output.createWriteStream();
        archive.pipe(stream);

        // Read directory recursively
        const addFilesToArchive = async (dir: string) => {
            const items = await fs.readdir(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = path.join(dir, item.name);

                if (item.isDirectory()) {
                    // Recursively add subdirectory
                    await addFilesToArchive(fullPath);
                } else if (item.name === jsonFileName && dir === directoryPath) {
                    // Modify and add the JSON file if it's in the root directory
                    const jsonContent = await fs.readFile(fullPath, "utf-8");
                    const jsonObject = JSON.parse(jsonContent);

                    // Modify the JSON object in memory
                    jsonObject.scene.parcels = location.parcels
                    jsonObject.scene.base = [location.parcels[0]]
                    jsonObject.iwb = Math.sqrt(location.parcels.length)

                    // Add the modified JSON to the zip
                    const relativePath = path.relative(directoryPath, fullPath);
                    archive.append(JSON.stringify(jsonObject, null, 2), { name: relativePath });
                } else {
                    // Add other files to the zip
                    const relativePath = path.relative(directoryPath, fullPath);
                    archive.file(fullPath, { name: relativePath });
                }
            }
        };

        // Start adding files from the root directory
        await addFilesToArchive(directoryPath);

        // Finalize the archive
        await archive.finalize();

        // Close the stream when done
        await new Promise<void>((resolve, reject) => {
            stream.on("close", ()=>{
                console.log(`Zip file created at: ${outputZipPath}`);
                delete location.reservation
                updateCache(LOCATIONS_FILE, LOCATIONS_CACHE_KEY, locations)
                deploymentQueue.push({file:fileName + ".zip", userId:process.env.DEPLOY_ADDRESS, locationId:locationId, id:uuidv4(), reservationId:'admin'})
                checkDCLDeploymentQueue()
                resolve()
            });
            stream.on("error", reject);
        });
    }
    catch(e){
        console.log('error handling admin location reset', e)
    }
}