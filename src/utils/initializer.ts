import dotenv from "dotenv";
import path from "path";
import { cacheSyncToFile, getCache, loadCache, updateCache } from "./cache";
// import cleanupCron from "./cleanupCron";
import { Location, Profile } from "./types";
import { checkDeploymentReservations } from "./deployment";

dotenv.config();

export const DATA_LOCATION = process.env.ENV === "Development" ? process.env.DEV_DATA_DIR : process.env.PROD_DATA_DIR
export const TEMP_LOCATION = process.env.ENV === "Development" ? process.env.TEMP_DIR : path.join(process.env.SERVER_DIR, process.env.TEMP_DIR)
export const DEPLOY_LOCATION = process.env.ENV === "Development" ? process.env.DEPLOY_DIR : path.join(process.env.SERVER_DIR, process.env.DEPLOY_DIR)

export const PROFILES_FILE = path.join(DATA_LOCATION, process.env.PROFILES_FILE )
export const LOCATIONS_FILE = path.join(DATA_LOCATION, process.env.LOCATIONS_FILE)
export const ART_GALLERY_FILE = path.join(DATA_LOCATION, process.env.ART_GALLERY_FILE)
export const DEPLOYMENT_QUEUE_FILE = path.join(DATA_LOCATION, process.env.DEPLOYMENT_QUEUE_FILE)
export const STREAMS_FILE = path.join(DATA_LOCATION, process.env.STREAMS_FILE)
export const CONFERENCE_FILE = path.join(DATA_LOCATION, process.env.CONFERENCE_FILE)
export const SHOPS_FILE = path.join(DATA_LOCATION, process.env.SHOPS_FILE)
export const LOTTERY_FILE = path.join(DATA_LOCATION, process.env.LOTTERY_FILE)
export const NPCS_FILE = path.join(DATA_LOCATION, process.env.NPCS_FILE)

export const PROFILES_CACHE_KEY = process.env.PROFILE_CACHE_KEY
export const LOCATIONS_CACHE_KEY = process.env.LOCATIONS_CACHE_KEY
export const ART_GALLERY_CACHE_KEY = process.env.ART_GALLERY_CACHE_KEY
export const DEPLOYMENT_QUEUE_CACHE_KEY = process.env.DEPLOYMENT_QUEUE_CACHE_KEY
export const STREAMS_FILE_CACHE_KEY = process.env.STREAMS_FILE_CACHE_KEY
export const CONFERENCE_FILE_CACHE_KEY = process.env.CONFERENCE_FILE_CACHE_KEY
export const SHOPS_FILE_CACHE_KEY = process.env.SHOPS_FILE_CACHE_KEY
export const LOTTERY_FILE_CACHE_KEY = process.env.LOTTERY_FILE_CACHE_KEY
export const NPCS_FILE_CACHE_KEY = process.env.NPCS_FILE_CACHE_KEY

export function initServer(){
    // Initialize cache
    loadCache(PROFILES_FILE, PROFILES_CACHE_KEY);
    loadCache(LOCATIONS_FILE, LOCATIONS_CACHE_KEY);
    loadCache(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY);
    loadCache(STREAMS_FILE, STREAMS_FILE_CACHE_KEY);
    loadCache(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY);
    loadCache(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY);
    loadCache(SHOPS_FILE, SHOPS_FILE_CACHE_KEY);
    loadCache(LOTTERY_FILE, LOTTERY_FILE_CACHE_KEY);
    loadCache(NPCS_FILE, NPCS_FILE_CACHE_KEY)

    // Save cache to disk periodically
    setInterval(async () => {
        const profiles = getCache(PROFILES_CACHE_KEY);
        const locations = getCache(LOCATIONS_CACHE_KEY);
        const deployments = getCache(DEPLOYMENT_QUEUE_CACHE_KEY);
        const streams = getCache(STREAMS_FILE_CACHE_KEY);
        const conference = getCache(CONFERENCE_FILE_CACHE_KEY)
        const gallery = getCache(ART_GALLERY_CACHE_KEY)
        const shops = getCache(SHOPS_FILE_CACHE_KEY)
        const lottery = getCache(LOTTERY_FILE_CACHE_KEY)
        const npcs = getCache(NPCS_FILE_CACHE_KEY)

        await cacheSyncToFile(PROFILES_FILE, PROFILES_CACHE_KEY, profiles);
        await cacheSyncToFile(LOCATIONS_FILE, LOCATIONS_CACHE_KEY, locations);
        await cacheSyncToFile(DEPLOYMENT_QUEUE_FILE, DEPLOYMENT_QUEUE_CACHE_KEY, deployments);
        await cacheSyncToFile(STREAMS_FILE, STREAMS_FILE_CACHE_KEY, streams);
        await cacheSyncToFile(CONFERENCE_FILE, CONFERENCE_FILE_CACHE_KEY, conference);
        await cacheSyncToFile(ART_GALLERY_FILE, ART_GALLERY_CACHE_KEY, gallery);
        await cacheSyncToFile(SHOPS_FILE, SHOPS_FILE_CACHE_KEY, shops);
        await cacheSyncToFile(LOTTERY_FILE, LOTTERY_FILE_CACHE_KEY, lottery);
        await cacheSyncToFile(NPCS_FILE, NPCS_FILE_CACHE_KEY, npcs);
    }, Number(process.env.CACHE_REFRESH_INTERVAL_S) * 1000);

    //deployment interval check
    setInterval(()=>{
        checkDeploymentReservations()
    }, 1000)
}