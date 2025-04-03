import path from "path"
import { getCache, updateCache } from "./cache"
import { ADMINS_FILE_CACHE_KEY, LOCATIONS_CACHE_KEY, LOCATIONS_FILE, LOTTERY_FILE_CACHE_KEY, PROFILES_CACHE_KEY, TEMP_LOCATION } from "./initializer"
import { uuidV4 } from "ethers"
import fs from "fs/promises";
import archiver from "archiver";
import { checkDCLDeploymentQueue, checkDeploymentReservations, deploymentQueue } from "./deployment";
import { buildDiscordMessage, cancelLottery, LOTTERY_WALLET, lotterySignUp, processNewLottery, processQueueForItem, transferReceived } from "./lottery";
import axios from "axios";
import e from "express";
import { blitzRooms } from "../rooms";
import { BlitzRoom } from "../rooms/BlitzRoom";
import { resetAllBlitzProfiles, resetAllProfiles } from "./profiles";


const { v4: uuidv4 } = require('uuid');

export async function handleAdminLocationReset(locations:string, type?:string, sceneId?:string){
    let locationIds = locations.split(",")
    console.log('locations to reset are ', locationIds)
    for(let i = 0; i < locationIds.length; i++){
        await prepareLocationReset(locationIds[i], type, sceneId)
    }
    checkDCLDeploymentQueue()
}

export async function prepareLocationReset(id:string, type:string, sceneId?:string){
    let locationId = parseInt(id)
    let locations = getCache(LOCATIONS_CACHE_KEY)
    let location = locations.find((loc:any) => loc.id === locationId)
    if(!location){
        console.log('location doesnt exist to reset')
        return
    }

    console.log('location to be reset is', location)

    if(type === "pool"){
        try{
            let scenePoolResults = await axios.post((process.env.ENV === "Development" ? process.env.DEV_IWB_SERVER : process.env.PROD_IWB_SERVER) + "scene-pools", {
                action:'get',
                type:'all'
            },{
                headers:{"IWB-Auth": process.env.IWB_AUTH}
            })
            console.log('scene pool results', scenePoolResults.data)

            if(scenePoolResults.data.valid){
                let adminScenes = scenePoolResults.data.scenes.filter((scene:any)=> scene.w === "BuilderWorld.dcl.eth")
                if(adminScenes.length > 0){
                    let scene:any
                    if(sceneId){
                        scene = scenePoolResults.data.scenes.find((scene:any)=> scene.id === sceneId)
                        if(!scene){
                            let random = getRandomIntInclusive(0, adminScenes.length - 1)
                            scene = adminScenes[random]
                        }
                    }else{
                        let random = getRandomIntInclusive(0, adminScenes.length - 1)
                        scene = adminScenes[random]
                    }
                    
                    try{

                        let assetIds:any[] = []
                        for(let key in scene){
                            if(key === "IWB"){
                                for(let aid in scene[key]){
                                    let iwb = scene[key][aid]
                                    assetIds.push({id:iwb.id, ugc:iwb.ugc, type:iwb.type})
                                }
                            }
                        }

                        console.log('asset ids',assetIds)

                        let res = await fetch((process.env.ENV === "Development" ? process.env.DEPLOYMENT_SERVER_DEV : process.env.DEPLOYMENT_SERVER_PROD) + "scene/deploy", {
                            method:"POST",
                            headers:{
                                "Content-type": "application/json",
                                "Auth": "" + process.env.IWB_DEPLOYMENT_AUTH
                            },
                            body: JSON.stringify({
                                scene:scene,
                                metadata:{
                                    title: scene.metadata.n,
                                    description: scene.metadata.d,
                                    owner: scene.metadata.ona,
                                    image: scene.metadata.im
                                },
                                assetIds:assetIds,
                                spawns:scene.sp,
                                dest:"angzaar",
                                worldName:scene.w,
                                user: scene.metadata.o,
                                parcels: scene.pcls,
                                sceneId: scene.id,
                                target: 'interconnected.online',
                                locationId:id,
                                angzaarReset:true
                            })
                        })
                        let json = await res.json()
                        console.log('angzaar scene poole deploynment server json is', json)
                        if(!json.valid){
                            deployEmptyScene(locations, location, locationId)
                        }
                    }
                    catch(e){
                        console.log('error pinging deploy server', e)
                        deployEmptyScene(locations, location, locationId)
                    }

                }else{
                    deployEmptyScene(locations, location, locationId)
                }
            }else{
                deployEmptyScene(locations, location, locationId)
            }
        }
        catch(e:any){
            console.log('error getting scene pool', e.message)
            deployEmptyScene(locations, location, locationId)
        }
    }else{
        deployEmptyScene(locations, location, locationId)
    }
}

async function deployEmptyScene(locations:any, location:any, locationId:any){
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

export function handlePlazaAdmin(req:any, res:any){
    let admins = getCache(ADMINS_FILE_CACHE_KEY)
    let adminIndex = admins.findIndex((admin:any)=> admin.userId === req.body.userId.toLowerCase())

    switch(req.body.action){
        case 'add':
            if(adminIndex < 0){
                admins.push({userId:req.body.userId.toLowerCase(), level:0})
                res.status(200).send({valid:true, message:"admin added"});
                return
            }else{
                console.log('user already admin')
                res.status(200).send({valid:true, message:"user already admin"});
                return
            }

        case 'delete':
            if(adminIndex >=0){
                admins.splice(adminIndex, 1)
                res.status(200).send({valid:true, message:"admin deleted"});
                return
            }else{
                res.status(200).send({valid:true, message:"admin doesnt exist"});
                return
            }
    }
}

export async function handleAdminChance(req:any, res:any){
    console.log('handling admin chance', req.body)
    let lotteries = getCache(LOTTERY_FILE_CACHE_KEY)
    let lottery = lotteries.find((lottery:any)=> lottery.id === req.body.lotteryId)

    switch(req.body.action){
        case 'play-lottery':
            lotterySignUp({userData:{userId:req.body.userId}}, lottery, undefined, true)
            break;

        case 'create-lottery':
            processNewLottery(undefined, req.body, undefined, true)
            break;

        case 'process-queue':
            if(!lottery){
                return
            }

            await processQueueForItem(lottery, undefined);
            break;

        case 'cancel':
            cancelLottery(null, {id:req.body.id}, null, true)
            break;

        case 'test-discord':
            if(!lottery){
                return
            }

            buildDiscordMessage(req.body.setup, lottery, req.body.user)
            break;
    }
}

export function handleAdminDeployments(req:any, res:any){
    switch(req.body.action){
        case 'reset':
            console.log('handling reset deployment admin action for locations', req.body.locations)
            handleAdminLocationReset(req.body.locations, req.body.deployType, req.body.sceneId)
            return res.status(200).send({valid:true});

        default:
            return res.status(200).send({valid:true, message:"unavailable route"});
    }
    
}

export function getRandomIntInclusive(min:number, max:number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive
  }
  

export function handleServerAdmin(action:string, res:any){
    const memUsage = process.memoryUsage();

    switch(action){
        case 'reset-blitz-all':
            let [bReset, blitzKey, blitzType] = action.split("-")
            switch(blitzType){
                case "all":
                    resetAllBlitzProfiles()
                    res.status(200).send({valid:true});
                    break;
            }
            break;

        case 'reset-profile-all':
            let [reset, resetKey, resetType] = action.split("-")
            switch(resetType){
                case "all":
                    resetAllProfiles()
                    res.status(200).send({valid:true});
                    break;
            }
            break;
        case 'stats':
            res.status(200).send({valid:true, heapTotal:memUsage.heapTotal, rss:memUsage.rss, heapUsed:memUsage.heapUsed, external:memUsage.external});
        break;

        case 'blitz-stats':
            let blitzStats:any
            if(blitzRooms.size > 0){
                blitzRooms.forEach((room:BlitzRoom, id:string)=>{
                    blitzStats = room.state.world.bodies.length
                })
            }
            res.status(200).send({valid:true, blitzStats:blitzStats, heapTotal:memUsage.heapTotal, rss:memUsage.rss, heapUsed:memUsage.heapUsed, external:memUsage.external});
        break;
    }
}
