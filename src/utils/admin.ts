import path from "path"
import { getCache, updateCache } from "./cache"
import { ADMINS_FILE_CACHE_KEY, LOCATIONS_CACHE_KEY, LOCATIONS_FILE, LOTTERY_FILE_CACHE_KEY, PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, TEMP_LOCATION } from "./initializer"
import { uuidV4 } from "ethers"
import fs from "fs/promises";
import archiver from "archiver";
import { checkDCLDeploymentQueue, checkDeploymentReservations, deploymentQueue, resetDeployment } from "./deployment";
import { buildDiscordMessage, cancelLottery, LOTTERY_WALLET, lotterySignUp, processNewLottery, processQueueForItem, transferReceived } from "./lottery";
import axios from "axios";
import e from "express";
import { blitzRooms } from "../rooms";
import { BlitzRoom } from "../rooms/BlitzRoom";
import { resetAllBlitzProfiles, resetAllProfiles } from "./profiles";
import { fetchPlayfabMetadata, fetchUserMetaData, fetchPlayfabFile } from "./Playfab";


const { v4: uuidv4 } = require('uuid');

export async function handleAdminLocationReset(body:any){
    let locationIds = body.locations.split(",")
    console.log('locations to reset are ', locationIds)
    for(let i = 0; i < locationIds.length; i++){
        await prepareLocationReset(locationIds[i], body)
    }
    checkDCLDeploymentQueue()
}

export async function prepareLocationReset(id:string, body:any){
    let locationId = parseInt(id)
    let locations = getCache(LOCATIONS_CACHE_KEY)
    let location = locations.find((loc:any) => loc.id === locationId)
    if(!location){
        console.log('location doesnt exist to reset')
        return
    }

    if(location.reservation){
        console.log('location is reserved, skipping')
        return
    }

    console.log('location to be reset is', location)

    if(body.deployType === "pool"){
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
                    if(body.sceneId){
                        scene = scenePoolResults.data.scenes.find((scene:any)=> scene.id === body.sceneId)
                        if(!scene){
                            let random = getRandomIntInclusive(0, adminScenes.length - 1)
                            scene = adminScenes[random]
                        }
                    }else{
                        let random = getRandomIntInclusive(0, adminScenes.length - 1)
                        scene = adminScenes[random]
                    }
                    processsIWBScene(location, locations, locationId, scene)
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
    }else if(body.deployType === "world"){
        console.log('deploying a custom world scene for location', locationId, body.worldName)


        try{
            let worldSceneResults = await axios.post((process.env.ENV === "Development" ? process.env.DEV_IWB_SERVER : process.env.PROD_IWB_SERVER) + "world-scenes", {
                action:'get',
                type:'scene',
                world:body.worldName,
                userId:body.userId,
                sceneId:body.sceneId
            },{
                headers:{"IWB-Auth": process.env.IWB_AUTH}
            })
            console.log('scene pool results', worldSceneResults.data)

            if(worldSceneResults.data.valid && worldSceneResults.data.scene){
                processsIWBScene(location, locations, locationId, worldSceneResults.data.scene)
            }else{
                deployEmptyScene(locations, location, locationId)
            }
        }
        catch(e:any){
            console.log('error getting specific world scene', e.message)
            deployEmptyScene(locations, location, locationId)
        }

        try{
            let metadata = await fetchPlayfabMetadata(body.userId)
            let scenes = await fetchPlayfabFile(metadata, `${body.worldName}-scenes.json`)
            let scene = scenes.find((scene:any)=> scene.id === body.sceneId)
            if(!scene){
                console.log('scene not found, deploying empty scene')
                deployEmptyScene(locations, location, locationId)
                return
            }
            console.log('deploying a scene from a custom world', body, scene)
            processsIWBScene(location, locations, locationId, scene)
        }
        catch(e){
            console.log('error deploying custom world scene', e)
            deployEmptyScene(locations, location, locationId)
        }
    }
    else{
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
        case 'nudge':
            console.log('nudging angzaar plaza deployment')
            checkDCLDeploymentQueue()
            return res.status(200).send({valid:true});

        case 'empty-bucket':
            console.log('emptying angzaar plaza bucket')
            resetDeployment('admin', 'admin forced action')
            return res.status(200).send({valid:true});

        case 'reset':
            console.log('handling reset deployment admin action for locations', req.body.locations)
            handleAdminLocationReset(req.body)
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

async function processsIWBScene(location:any, locations:any, locationId:any, scene:any){
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
                locationId:locationId,
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
}

/**
 * Generates HTML view for admin data
 * @param dataType Type of data to display (quests, profiles, etc.)
 * @param data The actual data to display
 * @returns HTML string
 */
export function generateAdminHtml(dataType: string, data: any): string {
    if (dataType === 'quests') {
        return generateQuestsHtml(data);
    } else if (dataType === 'profiles') {
        return generateProfilesHtml(data);
    } else if (dataType === 'locations') {
        return generateLocationsHtml(data);
    } else if (dataType === 'rewards') {
        return generateRewardsHtml(data);
    } else if (dataType === 'rewards_transactions') {
        return generateRewardTransactionsHtml(data);
    } else if (dataType === 'conference') {
        return generateConferenceHtml(data);
    } else {
        return generateGenericHtml(dataType, data);
    }
}

/**
 * Generates HTML view for quests with collapsible sections
 * @param quests Array of quest objects
 * @returns HTML string
 */
function generateQuestsHtml(quests: any[]): string {
    const questsArray = quests || [];
    
    // Identify daily quests
    const dailyQuests = questsArray.filter(quest => 
        quest.completionMode === 'REPEATABLE' && quest.timeWindow === 'daily'
    );
    
    // Simple summary of quest types
    const questTypeSummary = `
    <div class="summary-section quest-summary">
        <h2>Quest Summary</h2>
        <div class="stats-grid">
            <div class="stat-item"><strong>Total Quests:</strong> ${questsArray.length}</div>
            <div class="stat-item"><strong>Daily Quests:</strong> ${dailyQuests.length}</div>
            <div class="stat-item"><strong>Regular Quests:</strong> ${questsArray.length - dailyQuests.length}</div>
        </div>
    </div>
    `;
    
    // Existing quest HTML generation
    const generateQuestHtml = (quest: any, index: number) => {        
        // Generate steps HTML (initially hidden)
        const stepsHtml = quest.steps ? quest.steps.map((step: any, stepIndex: number) => {
            // Generate tasks HTML for this step
            const tasksHtml = step.tasks ? step.tasks.map((task: any) => `
                <div class="task">
                    <div class="task-header">
                        <h4>${task.description}</h4>
                        <span class="task-id">ID: ${task.taskId}</span>
                    </div>
                    <div class="task-details">
                        <div class="task-detail"><strong>Required Count:</strong> ${task.requiredCount}</div>
                        <div class="task-detail"><strong>Metaverse:</strong> ${task.metaverse || 'DECENTRALAND'}</div>
                        ${task.rewardId ? `<div class="task-detail"><strong>Reward ID:</strong> ${task.rewardId}</div>` : ''}
                        ${task.rewardIds && task.rewardIds.length > 0 ? 
                            `<div class="task-detail"><strong>Reward IDs:</strong> ${task.rewardIds.join(', ')}</div>` : ''
                        }
                    </div>
                </div>
            `).join('') : '<p>No tasks defined for this step</p>';
            
            return `
                <div class="step">
                    <div class="step-header">
                        <h3>Step ${stepIndex + 1}: ${step.name}</h3>
                        <span class="step-id">ID: ${step.stepId}</span>
                    </div>
                    ${step.prerequisiteStepIds && step.prerequisiteStepIds.length > 0 ? 
                        `<div class="step-prereq"><strong>Prerequisites:</strong> ${step.prerequisiteStepIds.join(', ')}</div>` : ''
                    }
                    ${step.rewardId ? `<div class="step-reward"><strong>Reward ID:</strong> ${step.rewardId}</div>` : ''}
                    ${step.rewardIds && step.rewardIds.length > 0 ? 
                        `<div class="step-reward"><strong>Reward IDs:</strong> ${step.rewardIds.join(', ')}</div>` : ''
                    }
                    <div class="tasks-container">
                        <h4>Tasks</h4>
                        <div class="tasks">
                            ${tasksHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('') : '<p>No steps defined for this quest</p>';
        
        return `
            <div class="quest" id="quest-${index}">
                <div class="quest-header" onclick="toggleQuest(${index})">
                    <h2>${quest.title}</h2>
                    <div class="quest-actions">
                        <div class="quest-status ${quest.enabled ? 'enabled' : 'disabled'}">
                            ${quest.enabled ? 'Enabled' : 'Disabled'}
                        </div>
                        <span class="expand-icon" id="expand-icon-${index}">+</span>
                    </div>
                </div>
                
                <div class="quest-content" id="quest-content-${index}" style="display: none;">
                    <div class="quest-meta">
                        <div class="quest-meta-item"><strong>Quest ID:</strong> ${quest.questId}</div>
                        <div class="quest-meta-item"><strong>Version:</strong> ${quest.version}</div>
                        <div class="quest-meta-item"><strong>Creator:</strong> ${quest.creator}</div>
                        <div class="quest-meta-item"><strong>Completion Mode:</strong> ${quest.completionMode || 'FINITE'}</div>
                        
                        ${quest.startTime ? 
                            `<div class="quest-meta-item"><strong>Start Time:</strong> ${new Date(quest.startTime).toLocaleString()}</div>` : ''
                        }
                        ${quest.endTime ? 
                            `<div class="quest-meta-item"><strong>End Time:</strong> ${new Date(quest.endTime).toLocaleString()}</div>` : ''
                        }
                        ${quest.maxCompletions ? 
                            `<div class="quest-meta-item"><strong>Max Completions:</strong> ${quest.maxCompletions}</div>` : ''
                        }
                        ${quest.timeWindow ? 
                            `<div class="quest-meta-item"><strong>Time Window:</strong> ${quest.timeWindow}</div>` : ''
                        }
                        ${quest.autoReset !== undefined ? 
                            `<div class="quest-meta-item"><strong>Auto Reset:</strong> ${quest.autoReset ? 'Yes' : 'No'}</div>` : ''
                        }
                        ${quest.participationScope ? 
                            `<div class="quest-meta-item"><strong>Participation:</strong> ${quest.participationScope}</div>` : ''
                        }
                        ${quest.progressSharing ? 
                            `<div class="quest-meta-item"><strong>Progress Sharing:</strong> ${quest.progressSharing}</div>` : ''
                        }
                        ${quest.rewardDistribution ? 
                            `<div class="quest-meta-item"><strong>Reward Distribution:</strong> ${quest.rewardDistribution}</div>` : ''
                        }
                        ${quest.rewardId ? 
                            `<div class="quest-meta-item"><strong>Reward ID:</strong> ${quest.rewardId}</div>` : ''
                        }
                        ${quest.rewardIds && quest.rewardIds.length > 0 ? 
                            `<div class="quest-meta-item"><strong>Reward IDs:</strong> ${quest.rewardIds.join(', ')}</div>` : ''
                        }
                    </div>
                    
                    <div class="steps-container">
                        <h3>Steps</h3>
                        <div class="steps">
                            ${stepsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    };
    
    const questsHtml = questsArray.length > 0 
        ? questsArray.map(generateQuestHtml).join('<hr class="quest-divider">') 
        : '<p>No quests found</p>';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Quest Data</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1, h2, h3, h4 {
                color: #2c3e50;
                margin-top: 0;
            }
            h1 {
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .container {
                background: white;
                border-radius: 8px;
                padding: 25px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            .timestamp {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 20px;
            }
            .info {
                color: #2980b9;
                margin-bottom: 15px;
                font-weight: bold;
            }
            .summary-section {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 15px;
                margin: 15px 0;
            }
            .stat-item {
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 6px;
                border-left: 3px solid #3498db;
            }
            .quest {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
            }
            .quest-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .quest-header:hover {
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .quest-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .quest-status {
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: bold;
            }
            .expand-icon {
                font-size: 24px;
                font-weight: bold;
                color: #3498db;
                transition: transform 0.3s ease;
            }
            .enabled {
                background-color: #2ecc71;
                color: white;
            }
            .disabled {
                background-color: #e74c3c;
                color: white;
            }
            .quest-meta {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 10px;
                margin: 15px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .quest-meta-item {
                margin-bottom: 5px;
            }
            .step {
                background-color: #f8f9fa;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
                border-left: 4px solid #3498db;
            }
            .step-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .step-id, .task-id {
                font-size: 0.85em;
                color: #7f8c8d;
                font-family: monospace;
            }
            .task {
                background-color: white;
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 10px;
                border: 1px solid #e1e1e1;
            }
            .task-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .task-header h4 {
                margin: 0;
            }
            .task-details {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 10px;
            }
            .tasks-container, .steps-container {
                margin-top: 15px;
            }
            .quest-divider {
                border: 0;
                height: 1px;
                background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0));
                margin: 30px 0;
            }
            @media (max-width: 768px) {
                .quest-meta, .task-details {
                    grid-template-columns: 1fr;
                }
            }
        </style>
        <script>
            function toggleQuest(index) {
                const content = document.getElementById('quest-content-' + index);
                const icon = document.getElementById('expand-icon-' + index);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.innerHTML = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.innerHTML = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        </script>
    </head>
    <body>
        <h1>Quest Definitions</h1>
        <p class="timestamp">Generated on: ${new Date().toLocaleString()}</p>
        <div class="info">Total quests: ${questsArray.length}</div>
        
        ${questTypeSummary}
        
        ${questsHtml}
    </body>
    </html>
    `;
}

/**
 * Generates HTML view for profiles with collapsible sections
 * @param profiles Array of profile objects
 * @returns HTML string
 */
function generateProfilesHtml(profiles: any[]): string {
    const profilesArray = profiles || [];
    
    // Get quests data for reference
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY) || [];
    
    // Find daily quests for reference
    const dailyQuests = quests.filter((quest: any) => 
        quest.completionMode === 'REPEATABLE' && quest.timeWindow === 'daily'
    );
    
    // Helper to find quest information by ID
    const getQuestInfo = (questId: string) => {
        return quests.find((q: any) => q.questId === questId) || { title: 'Unknown Quest', completionMode: 'UNKNOWN' };
    };
    
    // For each profile, calculate quest statistics
    profilesArray.forEach(profile => {
        // Initialize quest stats
        profile.questStats = {
            totalAttempts: 0,
            completedQuests: 0,
            dailyQuestCompletions: 0,
            inProgressQuests: 0,
            mostRecentCompletion: null
        };
        
        // Process quest progress data if available
        if (profile.questsProgress && Array.isArray(profile.questsProgress)) {
            profile.questsProgress.forEach((progress: any) => {
                // Count this attempt
                profile.questStats.totalAttempts++;
                
                // Get quest info
                const questInfo = getQuestInfo(progress.questId);
                
                // Count completed vs in-progress
                if (progress.completed) {
                    profile.questStats.completedQuests++;
                    
                    // Check if it's a daily quest
                    if (questInfo.completionMode === 'REPEATABLE' && questInfo.timeWindow === 'daily') {
                        profile.questStats.dailyQuestCompletions++;
                    }
                    
                    // Track most recent completion
                    if (progress.completedAt && (!profile.questStats.mostRecentCompletion || 
                        progress.completedAt > profile.questStats.mostRecentCompletion)) {
                        profile.questStats.mostRecentCompletion = progress.completedAt;
                    }
                } else if (progress.started) {
                    profile.questStats.inProgressQuests++;
                }
            });
        }
    });
    
    const generateProfileHtml = (profile: any, index: number) => {
        // Generate quest progress HTML
        let questProgressHtml = '';
        
        if (profile.questsProgress && profile.questsProgress.length > 0) {
            // Create a section for daily quests first
            let dailyQuestsHtml = '';
            let regularQuestsHtml = '';
            
            profile.questsProgress.forEach((progress: any) => {
                const questInfo = getQuestInfo(progress.questId);
                const isDaily = questInfo.completionMode === 'REPEATABLE' && questInfo.timeWindow === 'daily';
                
                // Format elapsed time nicely
                const formatElapsedTime = (seconds: number) => {
                    if (!seconds) return 'N/A';
                    
                    const hours = Math.floor(seconds / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    const remainingSeconds = seconds % 60;
                    
                    return `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${remainingSeconds}s`;
                };
                
                // Get the latest attempt (if using new structure)
                const hasAttempts = progress.attempts && Array.isArray(progress.attempts) && progress.attempts.length > 0;
                const latestAttempt = hasAttempts ? progress.attempts[progress.attempts.length - 1] : null;
                
                // Determine quest status from either latest attempt or legacy fields
                const isStarted = latestAttempt ? latestAttempt.started : progress.started;
                const isCompleted = latestAttempt ? latestAttempt.completed : progress.completed;
                const elapsedTime = latestAttempt ? latestAttempt.elapsedTime : progress.elapsedTime;
                const completedAt = latestAttempt ? latestAttempt.completionTime : progress.completedAt;
                const attemptCount = progress.completionCount || (hasAttempts ? progress.attempts.length : 1);
                
                // Generate progress row
                const questRow = `
                    <tr class="${isCompleted ? 'completed-quest' : 'in-progress-quest'}">
                        <td>${questInfo.title}</td>
                        <td>${progress.questId}</td>
                        <td>${questInfo.completionMode || 'FINITE'}</td>
                        <td>${isStarted ? 'Yes' : 'No'}</td>
                        <td>${isCompleted ? 'Yes' : 'No'}</td>
                        <td>${formatElapsedTime(elapsedTime)}</td>
                        <td>${completedAt ? new Date(completedAt * 1000).toLocaleString() : 'N/A'}</td>
                        <td>${attemptCount}</td>
                        <td>
                            ${hasAttempts ? 
                                `<button class="toggle-attempts" onclick="toggleAttempts('${progress.questId}-${index}')">
                                    Show Attempts (${progress.attempts.length})
                                </button>` 
                                : 'N/A'
                            }
                        </td>
                    </tr>
                `;
                
                // Generate attempts history HTML if available
                let attemptsHtml = '';
                if (hasAttempts && progress.attempts.length > 1) {
                    attemptsHtml = `
                        <tr class="attempts-history" id="attempts-${progress.questId}-${index}" style="display: none;">
                            <td colspan="9">
                                <table class="attempts-table">
                                    <thead>
                                        <tr>
                                            <th>Attempt #</th>
                                            <th>Started</th>
                                            <th>Completed</th>
                                            <th>Start Time</th>
                                            <th>Completion Time</th>
                                            <th>Elapsed Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${progress.attempts.map((attempt: any, attemptIdx: number) => `
                                            <tr>
                                                <td>${attempt.attemptNumber || attemptIdx + 1}</td>
                                                <td>${attempt.started ? 'Yes' : 'No'}</td>
                                                <td>${attempt.completed ? 'Yes' : 'No'}</td>
                                                <td>${attempt.startTime ? new Date(attempt.startTime * 1000).toLocaleString() : 'N/A'}</td>
                                                <td>${attempt.completionTime ? new Date(attempt.completionTime * 1000).toLocaleString() : 'N/A'}</td>
                                                <td>${formatElapsedTime(attempt.elapsedTime)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    `;
                }
                
                // Add to appropriate section
                if (isDaily) {
                    dailyQuestsHtml += questRow + attemptsHtml;
                } else {
                    regularQuestsHtml += questRow + attemptsHtml;
                }
            });
            
            // Add JavaScript for toggling attempts visibility
            const toggleAttemptsScript = `
                <script>
                    function toggleAttempts(id) {
                        const attemptsRow = document.getElementById('attempts-' + id);
                        if (attemptsRow) {
                            attemptsRow.style.display = attemptsRow.style.display === 'none' ? 'table-row' : 'none';
                        }
                    }
                </script>
            `;
            
            // Combine daily and regular quest sections
            if (dailyQuestsHtml) {
                questProgressHtml += `
                    <div class="quest-progress-section">
                        <h3>Daily Quests</h3>
                        <table class="quest-progress-table">
                            <thead>
                                <tr>
                                    <th>Quest</th>
                                    <th>ID</th>
                                    <th>Mode</th>
                                    <th>Started</th>
                                    <th>Completed</th>
                                    <th>Elapsed Time</th>
                                    <th>Completed At</th>
                                    <th>Attempts</th>
                                    <th>History</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${dailyQuestsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            if (regularQuestsHtml) {
                questProgressHtml += `
                    <div class="quest-progress-section">
                        <h3>Regular Quests</h3>
                        <table class="quest-progress-table">
                            <thead>
                                <tr>
                                    <th>Quest</th>
                                    <th>ID</th>
                                    <th>Mode</th>
                                    <th>Started</th>
                                    <th>Completed</th>
                                    <th>Elapsed Time</th>
                                    <th>Completed At</th>
                                    <th>Attempts</th>
                                    <th>History</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${regularQuestsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            // Add the toggle script at the end
            questProgressHtml += toggleAttemptsScript;
        } else {
            questProgressHtml = '<p>No quest progress data available</p>';
        }
        
        // Calculate quest statistics with attempt support
        const calculateQuestStats = (profile: any) => {
            let stats = {
                totalAttempts: 0,
                completedQuests: 0,
                dailyQuestCompletions: 0,
                inProgressQuests: 0,
                mostRecentCompletion: 0
            };
            
            if (profile.questsProgress && Array.isArray(profile.questsProgress)) {
                profile.questsProgress.forEach((progress: any) => {
                    const questInfo = getQuestInfo(progress.questId);
                    const isDaily = questInfo.completionMode === 'REPEATABLE' && questInfo.timeWindow === 'daily';
                    
                    // Count attempts if using new structure
                    if (progress.attempts && Array.isArray(progress.attempts)) {
                        stats.totalAttempts += progress.attempts.length;
                        
                        // Check each attempt
                        progress.attempts.forEach((attempt: any) => {
                            if (attempt.completed) {
                                stats.completedQuests++;
                                
                                if (isDaily) {
                                    stats.dailyQuestCompletions++;
                                }
                                
                                // Track most recent completion
                                if (attempt.completionTime && attempt.completionTime > stats.mostRecentCompletion) {
                                    stats.mostRecentCompletion = attempt.completionTime;
                                }
                            } else if (attempt.started && !attempt.completed) {
                                stats.inProgressQuests++;
                            }
                        });
                    } else {
                        // Legacy structure
                        stats.totalAttempts++;
                        
                        if (progress.completed) {
                            stats.completedQuests++;
                            
                            if (isDaily) {
                                stats.dailyQuestCompletions++;
                            }
                            
                            // Track most recent completion
                            if (progress.completedAt && progress.completedAt > stats.mostRecentCompletion) {
                                stats.mostRecentCompletion = progress.completedAt;
                            }
                        } else if (progress.started && !progress.completed) {
                            stats.inProgressQuests++;
                        }
                    }
                });
            }
            
            return stats;
        };
        
        // Use the calculated stats
        const questStats = calculateQuestStats(profile);
        
        // Create HTML for profile
        return `
            <div class="profile" id="profile-${index}">
                <div class="profile-header" onclick="toggleProfile(${index})">
                    <h2>${profile.name || profile.ethAddress || 'Unnamed User'}</h2>
                    <span class="expand-icon" id="profile-expand-icon-${index}">+</span>
                </div>
                
                <div class="profile-content" id="profile-content-${index}" style="display: none;">
                    <div class="profile-meta">
                        <div class="profile-meta-item"><strong>Ethereum Address:</strong> ${profile.ethAddress}</div>
                        ${profile.registrationDate ? 
                            `<div class="profile-meta-item"><strong>Registration Date:</strong> ${new Date(profile.registrationDate).toLocaleString()}</div>` : ''
                        }
                        ${profile.lastLoginDate ? 
                            `<div class="profile-meta-item"><strong>Last Login:</strong> ${new Date(profile.lastLoginDate).toLocaleString()}</div>` : ''
                        }
                    </div>
                    
                    <div class="quest-stats-summary">
                        <h3>Quest Statistics</h3>
                        <div class="stats-grid">
                            <div class="stat-item"><strong>Total Quest Attempts:</strong> ${questStats.totalAttempts}</div>
                            <div class="stat-item"><strong>Completed Quests:</strong> ${questStats.completedQuests}</div>
                            <div class="stat-item"><strong>Daily Quest Completions:</strong> ${questStats.dailyQuestCompletions}</div>
                            <div class="stat-item"><strong>In-Progress Quests:</strong> ${questStats.inProgressQuests}</div>
                            ${questStats.mostRecentCompletion ? 
                                `<div class="stat-item"><strong>Last Completion:</strong> ${new Date(questStats.mostRecentCompletion * 1000).toLocaleString()}</div>` : ''
                            }
                        </div>
                    </div>
                    
                    <div class="quest-progress">
                        <h3>Quest Progress</h3>
                        ${questProgressHtml}
                    </div>

                    ${profile.inventory ? `
                    <div class="inventory-section">
                        <h3>Inventory</h3>
                        <div class="inventory-items">
                            ${Object.entries(profile.inventory).map(([key, value]) => `
                                <div class="inventory-item">
                                    <strong>${key}:</strong> ${value}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    };
    
    const profilesHtml = profilesArray.length > 0 
        ? profilesArray.map(generateProfileHtml).join('<hr class="profile-divider">') 
        : '<p>No profiles found</p>';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Profile Data</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1, h2, h3, h4 {
                color: #2c3e50;
                margin-top: 0;
            }
            h1 {
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .profile {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
            }
            .profile-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .profile-header:hover {
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .expand-icon {
                font-size: 24px;
                font-weight: bold;
                color: #3498db;
                transition: transform 0.3s ease;
            }
            .profile-meta {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 10px;
                margin: 15px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .profile-meta-item {
                margin-bottom: 5px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 15px;
                margin: 15px 0;
            }
            .stat-item {
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 6px;
                border-left: 3px solid #3498db;
            }
            .quest-progress-section {
                margin-bottom: 20px;
            }
            .quest-progress-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            .quest-progress-table th, .quest-progress-table td {
                padding: 10px;
                border: 1px solid #ddd;
                text-align: left;
            }
            .quest-progress-table th {
                background-color: #f2f2f2;
                font-weight: bold;
            }
            .quest-progress-table tr:nth-child(even) {
                background-color: #f9f9f9;
            }
            .quest-progress-table tr:hover {
                background-color: #f0f0f0;
            }
            .completed-quest {
                background-color: #d5f5e3 !important;
            }
            .in-progress-quest {
                background-color: #fdebd0 !important;
            }
            .inventory-section {
                margin-top: 20px;
            }
            .inventory-items {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 10px;
                margin-top: 10px;
            }
            .inventory-item {
                padding: 10px;
                background-color: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #e1e1e1;
            }
            .profile-divider {
                border: 0;
                height: 1px;
                background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0));
                margin: 30px 0;
            }
        </style>
        <script>
            function toggleProfile(index) {
                const content = document.getElementById('profile-content-' + index);
                const icon = document.getElementById('profile-expand-icon-' + index);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.innerHTML = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.innerHTML = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        </script>
    </head>
    <body>
        <h1>User Profiles</h1>
        <p class="timestamp">Generated on: ${new Date().toLocaleString()}</p>
        <div class="info">Total profiles: ${profilesArray.length}</div>
        
        ${profilesHtml}
    </body>
    </html>
    `;
}

/**
 * Generates HTML view for locations with collapsible sections
 * @param locations Array of location objects
 * @returns HTML string
 */
function generateLocationsHtml(locations: any[]): string {
    const locationsArray = locations || [];
    
    const generateLocationHtml = (location: any, index: number) => {
        // Generate parcels HTML
        const parcelsHtml = location.parcels && location.parcels.length > 0 
            ? `<div class="parcels-list">
                ${location.parcels.map((parcel: string) => `
                    <div class="parcel-item">${parcel}</div>
                `).join('')}
               </div>`
            : '<p>No parcels defined for this location</p>';
            
        // Generate reservations HTML
        const reservationsHtml = location.reservations && location.reservations.length > 0 
            ? location.reservations.map((reservation: any, resIndex: number) => {
                const startDate = reservation.startDate ? new Date(reservation.startDate * 1000).toLocaleString() : 'Unknown';
                const endDate = reservation.endDate ? new Date(reservation.endDate * 1000).toLocaleString() : 'Unknown';
                
                return `
                    <div class="reservation" id="reservation-${index}-${resIndex}">
                        <div class="reservation-header" onclick="toggleReservation(${index}, ${resIndex}, event)">
                            <h4>Reservation: ${reservation.id.substring(0, 8)}...</h4>
                            <span class="expand-icon" id="reservation-expand-icon-${index}-${resIndex}">+</span>
                        </div>
                        
                        <div class="reservation-content" id="reservation-content-${index}-${resIndex}" style="display: none;">
                            <div class="reservation-grid">
                                <div class="reservation-detail"><strong>ID:</strong> ${reservation.id}</div>
                                <div class="reservation-detail"><strong>ETH Address:</strong> ${reservation.ethAddress}</div>
                                <div class="reservation-detail"><strong>Start Date:</strong> ${startDate}</div>
                                <div class="reservation-detail"><strong>End Date:</strong> ${endDate}</div>
                                <div class="reservation-detail"><strong>Location ID:</strong> ${reservation.locationId}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('') 
            : '<p>No reservations for this location</p>';
            
        // Calculate state based on whether there are active reservations
        const hasActiveReservation = location.reservations && location.reservations.length > 0 && 
            location.reservations.some((res: any) => {
                const now = Math.floor(Date.now() / 1000);
                return res.startDate <= now && res.endDate >= now;
            });

        // Calculate upcoming reservations
        const hasUpcomingReservation = location.reservations && location.reservations.length > 0 && 
            location.reservations.some((res: any) => {
                const now = Math.floor(Date.now() / 1000);
                return res.startDate > now;
            });
            
        let statusClass = 'available';
        let statusText = 'Available';
        
        if (hasActiveReservation) {
            statusClass = 'reserved';
            statusText = 'Currently Reserved';
        } else if (hasUpcomingReservation) {
            statusClass = 'upcoming';
            statusText = 'Upcoming Reservation';
        }
        
        return `
            <div class="location" id="location-${index}">
                <div class="location-header" onclick="toggleLocation(${index})">
                    <h2>Location ID: ${location.id}</h2>
                    <div class="location-actions">
                        <div class="location-status ${statusClass}">
                            ${statusText}
                        </div>
                        <span class="expand-icon" id="location-expand-icon-${index}">+</span>
                    </div>
                </div>
                
                <div class="location-content" id="location-content-${index}" style="display: none;">
                    <div class="location-section">
                        <h3>Parcels (${location.parcels ? location.parcels.length : 0})</h3>
                        ${parcelsHtml}
                    </div>
                    
                    <div class="location-section">
                        <h3>Reservations (${location.reservations ? location.reservations.length : 0})</h3>
                        <div class="reservations-container">
                            ${reservationsHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    };
    
    const locationsHtml = locationsArray.length > 0 
        ? locationsArray.map(generateLocationHtml).join('<hr class="location-divider">') 
        : '<p>No locations found</p>';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Location Data</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1, h2, h3, h4, h5 {
                color: #2c3e50;
                margin-top: 0;
            }
            h1 {
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .container {
                background: white;
                border-radius: 8px;
                padding: 25px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            .timestamp {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 20px;
            }
            .info {
                color: #2980b9;
                margin-bottom: 15px;
                font-weight: bold;
            }
            .location {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
            }
            .location-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .location-header:hover {
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .location-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .location-status {
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: bold;
            }
            .expand-icon {
                font-size: 24px;
                font-weight: bold;
                color: #3498db;
                transition: transform 0.3s ease;
            }
            .available {
                background-color: #2ecc71;
                color: white;
            }
            .reserved {
                background-color: #e74c3c;
                color: white;
            }
            .upcoming {
                background-color: #f39c12;
                color: white;
            }
            .location-section {
                margin: 20px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .parcels-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 10px;
                margin-top: 10px;
            }
            .parcel-item {
                background-color: white;
                padding: 8px;
                border-radius: 4px;
                text-align: center;
                border: 1px solid #e1e1e1;
                font-family: monospace;
            }
            .reservation {
                background-color: white;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
                border: 1px solid #e1e1e1;
            }
            .reservation-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .reservation-header:hover {
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .reservation-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 10px;
                margin-top: 15px;
            }
            .reservation-detail {
                padding: 8px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .location-divider {
                margin: 30px 0;
                border: 0;
                height: 1px;
                background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));
            }
            .total-locations {
                background-color: #34495e;
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                display: inline-block;
                margin-bottom: 20px;
            }
            .reservations-container {
                margin-top: 15px;
            }
        </style>
        <script>
            function toggleLocation(index) {
                const content = document.getElementById('location-content-' + index);
                const icon = document.getElementById('location-expand-icon-' + index);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
            
            function toggleReservation(locationIndex, resIndex, event) {
                // Stop event propagation to prevent parent toggle from firing
                event.stopPropagation();
                
                const content = document.getElementById('reservation-content-' + locationIndex + '-' + resIndex);
                const icon = document.getElementById('reservation-expand-icon-' + locationIndex + '-' + resIndex);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        </script>
    </head>
    <body>
        <h1>Location Data</h1>
        <div class="container">
            <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
            <div class="info">Displaying location data</div>
            <div class="total-locations">Total Locations: ${locationsArray.length}</div>
            <div class="locations-container">
                ${locationsHtml}
            </div>
        </div>
    </body>
    </html>
    `;
}

/**
 * Generates HTML view for rewards with collapsible sections
 * @param rewards Array of reward objects
 * @returns HTML string
 */
function generateRewardsHtml(rewards: any[]): string {
    const rewardsArray = rewards || [];
    
    const generateRewardHtml = (reward: any, index: number) => {
        // Format dates
        const createdDate = reward.createdAt ? new Date(reward.createdAt).toLocaleString() : 'Unknown';
        const updatedDate = reward.updatedAt ? new Date(reward.updatedAt).toLocaleString() : 'Unknown';
        
        // Handle media section
        const mediaHtml = reward.media ? `
            <div class="reward-section">
                <h3>Media</h3>
                <div class="reward-detail-grid">
                    ${reward.media.image ? `
                        <div class="reward-detail">
                            <strong>Image:</strong> 
                            <a href="${reward.media.image}" target="_blank">${reward.media.image}</a>
                        </div>` : '<div class="reward-detail"><strong>Image:</strong> Not provided</div>'}
                    ${reward.media.video ? `
                        <div class="reward-detail">
                            <strong>Video:</strong> 
                            <a href="${reward.media.video}" target="_blank">${reward.media.video}</a>
                        </div>` : '<div class="reward-detail"><strong>Video:</strong> Not provided</div>'}
                </div>
            </div>
        ` : '';
        
        // Handle web2 section if exists
        const web2Html = reward.web2 ? `
            <div class="reward-section">
                <h3>Web2 Details</h3>
                <div class="reward-detail-grid">
                    <div class="reward-detail"><strong>SKU:</strong> ${reward.web2.sku || 'None'}</div>
                    <div class="reward-detail"><strong>Fulfillment:</strong> ${reward.web2.fulfillment || 'None'}</div>
                    <div class="reward-detail"><strong>Quantity:</strong> ${reward.web2.quantity || 'None'}</div>
                    <div class="reward-detail"><strong>Redemption Instructions:</strong> ${reward.web2.redemptionInstructions || 'None'}</div>
                </div>
            </div>
        ` : '';
        
        // Handle Decentraland section based on reward type
        let decentralandHtml = '';
        if (reward.decentraland) {
            decentralandHtml = `
                <div class="reward-section">
                    <h3>Decentraland Details</h3>
                    <div class="reward-detail-grid">
                        <div class="reward-detail"><strong>Campaign Key:</strong> ${reward.decentraland.campaignKey || 'None'}</div>
                    </div>
                </div>
            `;
        } else if (reward.decentralandItem) {
            decentralandHtml = `
                <div class="reward-section">
                    <h3>Decentraland Item Details</h3>
                    <div class="reward-detail-grid">
                        <div class="reward-detail"><strong>Item ID:</strong> ${reward.decentralandItem.itemId || 'None'}</div>
                        <div class="reward-detail"><strong>Asset Contract:</strong> ${reward.decentralandItem.assetContractAddress || 'None'}</div>
                        <div class="reward-detail"><strong>Token ID:</strong> ${reward.decentralandItem.tokenId || 'None'}</div>
                        <div class="reward-detail"><strong>Quantity:</strong> ${reward.decentralandItem.quantity || 'None'}</div>
                        <div class="reward-detail"><strong>Rarity:</strong> ${reward.decentralandItem.rarity || 'None'}</div>
                        <div class="reward-detail"><strong>Category:</strong> ${reward.decentralandItem.category || 'None'}</div>
                        <div class="reward-detail"><strong>Campaign Key:</strong> ${reward.decentralandItem.campaignKey || 'None'}</div>
                    </div>
                </div>
            `;
        } else if (reward.decentralandReward) {
            decentralandHtml = `
                <div class="reward-section">
                    <h3>Decentraland Reward Details</h3>
                    <div class="reward-detail-grid">
                        <div class="reward-detail"><strong>Campaign Key:</strong> ${reward.decentralandReward.campaignKey || 'None'}</div>
                    </div>
                </div>
            `;
        }
        
        // Handle listing section
        const listingHtml = reward.listing ? `
            <div class="reward-section">
                <h3>Listing Details</h3>
                <div class="reward-detail-grid">
                    <div class="reward-detail"><strong>Listed:</strong> ${reward.listing.listed ? 'Yes' : 'No'}</div>
                    <div class="reward-detail"><strong>Marketplace ID:</strong> ${reward.listing.marketplaceId || 'None'}</div>
                    <div class="reward-detail"><strong>Quantity:</strong> ${reward.listing.quantity || 'None'}</div>
                    ${reward.listing.price ? `
                        <div class="reward-detail"><strong>Price:</strong> 
                            ${reward.listing.price.amount || '0'} 
                            ${reward.listing.price.currency ? reward.listing.price.currency.symbol : 'ETH'}
                        </div>
                        <div class="reward-detail"><strong>Chain ID:</strong> ${reward.listing.price.chainId || 'None'}</div>
                    ` : ''}
                </div>
            </div>
        ` : '';
        
        // Create the full reward HTML
        return `
            <div class="reward" id="reward-${index}">
                <div class="reward-header" onclick="toggleReward(${index})">
                    <h2>${reward.name || 'Unnamed Reward'}</h2>
                    <div class="reward-actions">
                        <div class="reward-type">${reward.kind || 'Unknown Type'}</div>
                        <span class="expand-icon" id="reward-expand-icon-${index}">+</span>
                    </div>
                </div>
                
                <div class="reward-content" id="reward-content-${index}" style="display: none;">
                    <div class="reward-section">
                        <h3>Basic Information</h3>
                        <div class="reward-detail-grid">
                            <div class="reward-detail"><strong>ID:</strong> ${reward.id}</div>
                            <div class="reward-detail"><strong>Creator:</strong> ${reward.creator}</div>
                            <div class="reward-detail"><strong>Created:</strong> ${createdDate}</div>
                            <div class="reward-detail"><strong>Updated:</strong> ${updatedDate}</div>
                            <div class="reward-detail"><strong>Allow External Creators:</strong> ${reward.allowExternalCreators ? 'Yes' : 'No'}</div>
                        </div>
                    </div>
                    
                    <div class="reward-section">
                        <h3>Description</h3>
                        <div class="reward-description">
                            ${reward.description || 'No description provided'}
                        </div>
                    </div>
                    
                    ${mediaHtml}
                    ${web2Html}
                    ${decentralandHtml}
                    ${listingHtml}
                </div>
            </div>
        `;
    };
    
    const rewardsHtml = rewardsArray.length > 0 
        ? rewardsArray.map(generateRewardHtml).join('<hr class="reward-divider">') 
        : '<p>No rewards found</p>';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Reward Data</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1, h2, h3, h4, h5 {
                color: #2c3e50;
                margin-top: 0;
            }
            h1 {
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .container {
                background: white;
                border-radius: 8px;
                padding: 25px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            .timestamp {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 20px;
            }
            .info {
                color: #2980b9;
                margin-bottom: 15px;
                font-weight: bold;
            }
            .reward {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
            }
            .reward-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .reward-header:hover {
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .reward-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .reward-type {
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: bold;
                background-color: #3498db;
                color: white;
            }
            .expand-icon {
                font-size: 24px;
                font-weight: bold;
                color: #3498db;
                transition: transform 0.3s ease;
            }
            .reward-section {
                margin: 20px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .reward-detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 10px;
            }
            .reward-detail {
                padding: 8px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .reward-description {
                padding: 15px;
                background-color: white;
                border-radius: 4px;
                border: 1px solid #e1e1e1;
                margin-top: 10px;
                min-height: 40px;
            }
            .reward-divider {
                margin: 30px 0;
                border: 0;
                height: 1px;
                background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));
            }
            .total-rewards {
                background-color: #34495e;
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                display: inline-block;
                margin-bottom: 20px;
            }
        </style>
        <script>
            function toggleReward(index) {
                const content = document.getElementById('reward-content-' + index);
                const icon = document.getElementById('reward-expand-icon-' + index);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        </script>
    </head>
    <body>
        <h1>Reward Data</h1>
        <div class="container">
            <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
            <div class="info">Displaying reward data</div>
            <div class="total-rewards">Total Rewards: ${rewardsArray.length}</div>
            <div class="rewards-container">
                ${rewardsHtml}
            </div>
        </div>
    </body>
    </html>
    `;
}

/**
 * Generates HTML view for reward transactions with collapsible sections
 * @param transactions Array of reward transaction objects
 * @returns HTML string
 */
function generateRewardTransactionsHtml(transactions: any[]): string {
    const transactionsArray = transactions || [];
    
    const generateTransactionHtml = (transaction: any, index: number) => {
        // Format timestamp
        const timestamp = transaction.timestamp ? new Date(transaction.timestamp).toLocaleString() : 'Unknown';
        
        // Determine status class for coloring
        const statusClass = transaction.status === 'success' ? 'success' : 
                           transaction.status === 'pending' ? 'pending' : 'failed';
        
        // Handle metadata section
        const metadataHtml = transaction.metadata ? `
            <div class="transaction-section">
                <h3>Metadata</h3>
                <div class="transaction-detail-grid">
                    <div class="transaction-detail"><strong>Attempts:</strong> ${transaction.metadata.attempts || 0}</div>
                    <div class="transaction-detail"><strong>Source Type:</strong> ${transaction.metadata.sourceType || 'Unknown'}</div>
                    ${transaction.metadata.rewardData ? `
                        <div class="transaction-detail-full">
                            <strong>Reward Data:</strong>
                            <div class="nested-data">
                                <div class="nested-item"><strong>ID:</strong> ${transaction.metadata.rewardData.id || 'None'}</div>
                                <div class="nested-item"><strong>Name:</strong> ${transaction.metadata.rewardData.name || 'None'}</div>
                                <div class="nested-item"><strong>Kind:</strong> ${transaction.metadata.rewardData.kind || 'None'}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : '';
        
        // Handle quest section if available
        const questHtml = transaction.questId ? `
            <div class="transaction-section">
                <h3>Quest Information</h3>
                <div class="transaction-detail-grid">
                    <div class="transaction-detail"><strong>Quest ID:</strong> ${transaction.questId}</div>
                    ${transaction.stepId ? `<div class="transaction-detail"><strong>Step ID:</strong> ${transaction.stepId}</div>` : ''}
                    ${transaction.taskId ? `<div class="transaction-detail"><strong>Task ID:</strong> ${transaction.taskId}</div>` : ''}
                </div>
            </div>
        ` : '';
        
        // Create the full transaction HTML
        return `
            <div class="transaction" id="transaction-${index}">
                <div class="transaction-header" onclick="toggleTransaction(${index})">
                    <div class="transaction-title">
                        <h2>${transaction.rewardName || 'Unnamed Reward'}</h2>
                        <span class="transaction-id">${transaction.id}</span>
                    </div>
                    <div class="transaction-actions">
                        <div class="transaction-status ${statusClass}">
                            ${transaction.status || 'Unknown'}
                        </div>
                        <span class="expand-icon" id="transaction-expand-icon-${index}">+</span>
                    </div>
                </div>
                
                <div class="transaction-content" id="transaction-content-${index}" style="display: none;">
                    <div class="transaction-section">
                        <h3>Basic Information</h3>
                        <div class="transaction-detail-grid">
                            <div class="transaction-detail"><strong>ID:</strong> ${transaction.id}</div>
                            <div class="transaction-detail"><strong>Reward Entry ID:</strong> ${transaction.rewardEntryId || 'None'}</div>
                            <div class="transaction-detail"><strong>User ID:</strong> ${transaction.userId}</div>
                            <div class="transaction-detail"><strong>Timestamp:</strong> ${timestamp}</div>
                            <div class="transaction-detail"><strong>Reward Type:</strong> ${transaction.rewardType || 'Unknown'}</div>
                            <div class="transaction-detail"><strong>Reward Name:</strong> ${transaction.rewardName || 'Unknown'}</div>
                        </div>
                    </div>
                    
                    ${questHtml}
                    
                    <div class="transaction-section">
                        <h3>Status Information</h3>
                        <div class="transaction-detail-grid">
                            <div class="transaction-detail"><strong>Status:</strong> <span class="${statusClass}-text">${transaction.status || 'Unknown'}</span></div>
                            ${transaction.error ? `
                                <div class="transaction-detail-full">
                                    <strong>Error:</strong>
                                    <div class="error-message">${transaction.error}</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    ${metadataHtml}
                </div>
            </div>
        `;
    };
    
    const transactionsHtml = transactionsArray.length > 0 
        ? transactionsArray.map(generateTransactionHtml).join('<hr class="transaction-divider">') 
        : '<p>No reward transactions found</p>';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Reward Transactions</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1, h2, h3, h4, h5 {
                color: #2c3e50;
                margin-top: 0;
            }
            h1 {
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .container {
                background: white;
                border-radius: 8px;
                padding: 25px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            .timestamp {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 20px;
            }
            .info {
                color: #2980b9;
                margin-bottom: 15px;
                font-weight: bold;
            }
            .transaction {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
            }
            .transaction-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .transaction-header:hover {
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .transaction-title {
                display: flex;
                flex-direction: column;
            }
            .transaction-id {
                font-size: 0.8em;
                color: #7f8c8d;
                font-family: monospace;
            }
            .transaction-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .transaction-status {
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: bold;
            }
            .success {
                background-color: #2ecc71;
                color: white;
            }
            .failed {
                background-color: #e74c3c;
                color: white;
            }
            .pending {
                background-color: #f39c12;
                color: white;
            }
            .success-text {
                color: #2ecc71;
                font-weight: bold;
            }
            .failed-text {
                color: #e74c3c;
                font-weight: bold;
            }
            .pending-text {
                color: #f39c12;
                font-weight: bold;
            }
            .expand-icon {
                font-size: 24px;
                font-weight: bold;
                color: #3498db;
                transition: transform 0.3s ease;
            }
            .transaction-section {
                margin: 20px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .transaction-detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 10px;
            }
            .transaction-detail {
                padding: 8px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .transaction-detail-full {
                grid-column: 1 / -1;
                padding: 8px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .error-message {
                background-color: #ffeeee;
                padding: 10px;
                border-radius: 4px;
                border-left: 4px solid #e74c3c;
                margin-top: 5px;
                font-family: monospace;
            }
            .nested-data {
                background-color: white;
                border-radius: 4px;
                padding: 10px;
                margin-top: 5px;
                border: 1px solid #e1e1e1;
            }
            .nested-item {
                padding: 5px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .nested-item:last-child {
                border-bottom: none;
            }
            .transaction-divider {
                margin: 30px 0;
                border: 0;
                height: 1px;
                background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));
            }
            .total-transactions {
                background-color: #34495e;
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                display: inline-block;
                margin-bottom: 20px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 15px;
                margin: 20px 0;
            }
            .stat-card {
                background-color: white;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                text-align: center;
            }
            .stat-value {
                font-size: 24px;
                font-weight: bold;
                margin: 10px 0;
            }
            .success-bg {
                background-color: rgba(46, 204, 113, 0.1);
                border-left: 4px solid #2ecc71;
            }
            .failed-bg {
                background-color: rgba(231, 76, 60, 0.1);
                border-left: 4px solid #e74c3c;
            }
            .pending-bg {
                background-color: rgba(243, 156, 18, 0.1);
                border-left: 4px solid #f39c12;
            }
            .total-bg {
                background-color: rgba(52, 152, 219, 0.1);
                border-left: 4px solid #3498db;
            }
        </style>
        <script>
            function toggleTransaction(index) {
                const content = document.getElementById('transaction-content-' + index);
                const icon = document.getElementById('transaction-expand-icon-' + index);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        </script>
    </head>
    <body>
        <h1>Reward Transactions</h1>
        <div class="container">
            <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
            <div class="info">Displaying reward transaction data</div>
            
            <!-- Stats Section -->
            <div class="stats-grid">
                <div class="stat-card total-bg">
                    <div>Total Transactions</div>
                    <div class="stat-value">${transactionsArray.length}</div>
                </div>
                <div class="stat-card success-bg">
                    <div>Successful</div>
                    <div class="stat-value">${transactionsArray.filter(t => t.status === 'success').length}</div>
                </div>
                <div class="stat-card failed-bg">
                    <div>Failed</div>
                    <div class="stat-value">${transactionsArray.filter(t => t.status === 'failed').length}</div>
                </div>
                <div class="stat-card pending-bg">
                    <div>Pending</div>
                    <div class="stat-value">${transactionsArray.filter(t => t.status === 'pending').length}</div>
                </div>
            </div>
            
            <div class="transactions-container">
                ${transactionsHtml}
            </div>
        </div>
    </body>
    </html>
    `;
}

/**
 * Generates HTML view for generic data types
 * @param dataType Type of data
 * @param data The data to display
 * @returns HTML string 
 */
function generateGenericHtml(dataType: string, data: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Admin Data: ${dataType}</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1 {
                color: #2c3e50;
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
            }
            .container {
                background: white;
                border-radius: 5px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            pre {
                background-color: #f8f9fa;
                border-radius: 4px;
                padding: 15px;
                overflow: auto;
                font-family: monospace;
                font-size: 14px;
                line-height: 1.4;
                border: 1px solid #ddd;
            }
            .timestamp {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 20px;
            }
            .info {
                color: #2980b9;
                margin-bottom: 15px;
            }
        </style>
    </head>
    <body>
        <h1>Admin Data: ${dataType}</h1>
        <div class="container">
            <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
            <div class="info">Displaying data from cache key: ${dataType}</div>
            <pre>${JSON.stringify(data, null, 2)}</pre>
        </div>
    </body>
    </html>
    `;
}

/**
 * Generates HTML view for conference data with collapsible sections
 * @param conference Conference data object
 * @returns HTML string
 */
function generateConferenceHtml(conference: any): string {
    if (!conference) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Conference Data</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                h1 {
                    color: #2c3e50;
                    border-bottom: 2px solid #3498db;
                    padding-bottom: 10px;
                }
                .container {
                    background: white;
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .timestamp {
                    color: #7f8c8d;
                    font-size: 0.9em;
                    margin-bottom: 20px;
                }
                .info {
                    color: #2980b9;
                    margin-bottom: 15px;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <h1>Conference Data</h1>
            <div class="container">
                <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
                <div class="info">No conference data found</div>
            </div>
        </body>
        </html>
        `;
    }
    
    const reservations = conference.reservations || [];
    
    const generateReservationHtml = (reservation: any, index: number) => {
        // Format dates
        const startDate = reservation.startDate ? new Date(reservation.startDate * 1000).toLocaleString() : 'Not set';
        const endDate = reservation.endDate ? new Date(reservation.endDate * 1000).toLocaleString() : 'Not set';
        
        // Calculate status based on time
        const now = Math.floor(Date.now() / 1000);
        let statusClass = 'upcoming';
        let statusText = 'Upcoming';
        
        if (reservation.startDate <= now && reservation.endDate >= now) {
            statusClass = 'active';
            statusText = 'Active Now';
        } else if (reservation.endDate < now) {
            statusClass = 'past';
            statusText = 'Past';
        }
        
        // Generate images HTML
        const imagesHtml = reservation.images && reservation.images.length > 0 
            ? `
            <div class="reservation-section">
                <h3>Images (${reservation.images.length})</h3>
                <div class="images-grid">
                    ${reservation.images.map((image: any) => `
                        <div class="image-item">
                            <div class="image-header">
                                <span>Image #${image.id}</span>
                                <span class="${image.v ? 'visible' : 'hidden'}">${image.v ? 'Visible' : 'Hidden'}</span>
                            </div>
                            ${image.src ? 
                                `<div class="image-preview">
                                    <img src="${image.src}" alt="Image ${image.id}" />
                                </div>` : 
                                `<div class="no-image">No image source provided</div>`
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : '<div class="reservation-section"><h3>Images</h3><p>No images configured</p></div>';
        
        // Generate video HTML
        const videoHtml = reservation.video ? `
            <div class="reservation-section">
                <h3>Video Configuration</h3>
                <div class="video-details">
                    <div class="video-detail"><strong>URL:</strong> ${reservation.video.url || 'Not set'}</div>
                    <div class="video-detail"><strong>Auto Play:</strong> ${reservation.video.auto ? 'Yes' : 'No'}</div>
                    <div class="video-detail"><strong>Live Stream:</strong> ${reservation.video.live ? 'Yes' : 'No'}</div>
                    <div class="video-detail"><strong>Sync Playback:</strong> ${reservation.video.sync ? 'Yes' : 'No'}</div>
                    <div class="video-detail"><strong>Start Time:</strong> ${reservation.video.start ? new Date(reservation.video.start * 1000).toLocaleString() : 'Not set'}</div>
                </div>
                ${reservation.video.url ? 
                    `<div class="video-preview">
                        <h4>Preview:</h4>
                        <video controls width="320" height="180">
                            <source src="${reservation.video.url}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                    </div>` : ''
                }
            </div>
        ` : '<div class="reservation-section"><h3>Video</h3><p>No video configured</p></div>';
        
        return `
            <div class="reservation" id="reservation-${index}">
                <div class="reservation-header" onclick="toggleReservation(${index})">
                    <div class="reservation-title">
                        <h2>Reservation ${index + 1}</h2>
                        <span class="reservation-id">${reservation.id}</span>
                    </div>
                    <div class="reservation-actions">
                        <div class="reservation-status ${statusClass}">
                            ${statusText}
                        </div>
                        <span class="expand-icon" id="reservation-expand-icon-${index}">+</span>
                    </div>
                </div>
                
                <div class="reservation-content" id="reservation-content-${index}" style="display: none;">
                    <div class="reservation-section">
                        <h3>Basic Information</h3>
                        <div class="reservation-detail-grid">
                            <div class="reservation-detail"><strong>ID:</strong> ${reservation.id}</div>
                            <div class="reservation-detail"><strong>ETH Address:</strong> ${reservation.ethAddress}</div>
                            <div class="reservation-detail"><strong>Start Date:</strong> ${startDate}</div>
                            <div class="reservation-detail"><strong>End Date:</strong> ${endDate}</div>
                            <div class="reservation-detail"><strong>Duration:</strong> ${Math.floor((reservation.endDate - reservation.startDate) / 60)} minutes</div>
                        </div>
                    </div>
                    
                    ${imagesHtml}
                    ${videoHtml}
                </div>
            </div>
        `;
    };
    
    const reservationsHtml = reservations.length > 0 
        ? reservations.map(generateReservationHtml).join('<hr class="reservation-divider">') 
        : '<p>No reservations found</p>';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Conference Data</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            h1, h2, h3, h4, h5 {
                color: #2c3e50;
                margin-top: 0;
            }
            h1 {
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            .container {
                background: white;
                border-radius: 8px;
                padding: 25px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            .timestamp {
                color: #7f8c8d;
                font-size: 0.9em;
                margin-bottom: 20px;
            }
            .info {
                color: #2980b9;
                margin-bottom: 15px;
                font-weight: bold;
            }
            .conference-info {
                background-color: #f8f9fa;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 20px;
                border-left: 4px solid #3498db;
            }
            .reservation {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                transition: all 0.3s ease;
            }
            .reservation-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 10px;
                border-bottom: 1px solid #e1e1e1;
                cursor: pointer;
            }
            .reservation-header:hover {
                background-color: #f8f9fa;
                border-radius: 8px;
            }
            .reservation-title {
                display: flex;
                flex-direction: column;
            }
            .reservation-id {
                font-size: 0.8em;
                color: #7f8c8d;
                font-family: monospace;
            }
            .reservation-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .reservation-status {
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: bold;
            }
            .active {
                background-color: #2ecc71;
                color: white;
            }
            .past {
                background-color: #7f8c8d;
                color: white;
            }
            .upcoming {
                background-color: #3498db;
                color: white;
            }
            .visible {
                color: #2ecc71;
                font-weight: bold;
            }
            .hidden {
                color: #e74c3c;
                font-weight: bold;
            }
            .expand-icon {
                font-size: 24px;
                font-weight: bold;
                color: #3498db;
                transition: transform 0.3s ease;
            }
            .reservation-section {
                margin: 20px 0;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 6px;
            }
            .reservation-detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 10px;
            }
            .reservation-detail {
                padding: 8px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .images-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            .image-item {
                background-color: white;
                border-radius: 6px;
                padding: 10px;
                border: 1px solid #e1e1e1;
            }
            .image-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 5px;
                margin-bottom: 5px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .image-preview {
                width: 100%;
                height: 120px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                background-color: #f8f9fa;
                border-radius: 4px;
            }
            .image-preview img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            .no-image {
                width: 100%;
                height: 120px;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: #f8f9fa;
                color: #7f8c8d;
                font-size: 0.9em;
                border-radius: 4px;
            }
            .video-details {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 10px;
                margin-bottom: 15px;
            }
            .video-detail {
                padding: 8px;
                border-bottom: 1px dashed #e1e1e1;
            }
            .video-preview {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #e1e1e1;
            }
            .reservation-divider {
                margin: 30px 0;
                border: 0;
                height: 1px;
                background-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));
            }
            .total-reservations {
                background-color: #34495e;
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                display: inline-block;
                margin-bottom: 20px;
            }
        </style>
        <script>
            function toggleReservation(index) {
                const content = document.getElementById('reservation-content-' + index);
                const icon = document.getElementById('reservation-expand-icon-' + index);
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '-';
                    icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        </script>
    </head>
    <body>
        <h1>Conference Data</h1>
        <div class="container">
            <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
            <div class="info">Displaying conference data</div>
            
            <div class="conference-info">
                <h2>Conference ID: ${conference.id || 'Unknown'}</h2>
            </div>
            
            <div class="total-reservations">Total Reservations: ${reservations.length}</div>
            
            <div class="reservations-container">
                ${reservationsHtml}
            </div>
        </div>
    </body>
    </html>
    `;
}