import { getCache } from "./cache";
import { PROFILES_CACHE_KEY } from "./initializer";
import { Profile } from "./types";

export const profileExists = (options:{ipAddress:string, userId:string}): boolean => {
  const {userId, ipAddress} = options
  const profiles:Profile[] = getCache(PROFILES_CACHE_KEY);
  
  if(profiles.find((profile) => profile.ethAddress === userId && profile.ipAddress === ipAddress)){
    return true
  }else{
    return false
  }
}