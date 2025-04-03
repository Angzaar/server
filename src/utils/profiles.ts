import { getCache } from "./cache";
import { PROFILES_CACHE_KEY } from "./initializer";
import { Profile } from "./types";

export const profileExists = (options:{ipAddress:string, userId:string}) => {
  const {userId, ipAddress} = options
  const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
  return profiles.find((profile) => profile.ethAddress === userId)// && profile.ipAddress === ipAddress)
}

export function resetAllProfiles(){
  let profiles = getCache(PROFILES_CACHE_KEY)
  profiles.forEach((profile:any)=>{
    profile.deployments = 0,
    profile.dust = 0,
    profile.goals = 0,
    profile.wins = 0,
    profile.losses = 0,
    profile.distance = 0,
    profile.blitzPlays = 0,
    profile.arcadePlays = 0
  })
}

export function resetAllBlitzProfiles(){
  let profiles = getCache(PROFILES_CACHE_KEY)
  profiles.forEach((profile:any)=>{
    profile.goals = 0,
    profile.wins = 0,
    profile.losses = 0,
    profile.distance = 0,
    profile.blitzPlays = 0,
    profile.arcadePlays = 0
  })
}