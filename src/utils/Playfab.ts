import axios from "axios";
import { PlayFabClient, PlayFabServer, PlayFabAdmin, PlayFabData } from "playfab-sdk";
import dotenv from "dotenv";


//Test Data
const playFabTitleId = process.env.PLAYFAB_ID
const playFabSecretKey = process.env.PLAYFAB_KEY

// Initialize the PlayFab client
PlayFabServer.settings.titleId = playFabTitleId;
PlayFabServer.settings.developerSecretKey = playFabSecretKey;

PlayFabData.settings.titleId = playFabTitleId;
PlayFabData.settings.developerSecretKey = playFabSecretKey;

PlayFabAdmin.settings.titleId = playFabTitleId;
PlayFabAdmin.settings.developerSecretKey = playFabSecretKey;


const IWB_PLAYFAB_SERVER = PlayFabServer

// Initialize the PlayFab client iwb
IWB_PLAYFAB_SERVER.settings.titleId = process.env.PLAYFAB_ID_QA;
IWB_PLAYFAB_SERVER.settings.developerSecretKey = process.env.PLAYFAB_KEY_QA;

let eventQueue:any[] = []
let postingEvents:boolean = false
let eventInterval:any

export function initPlayfab(){
  eventInterval = setInterval(async()=>{
    checkEventQueue()
  }, 1000 * 5)
}

export function addPlayfabEvent(event:any){
  if(process.env.ENV === "Production"){
    eventQueue.push(event)
  }
}

async function checkEventQueue(){
  if(!postingEvents && eventQueue.length > 0){
      postingEvents = true
      let event = eventQueue.shift()
      event.PlayFabId = process.env.PLAYFAB_DATA_ACCOUNT
      console.log('event queue has item, post to playfab', event.EventName)
      try{
          await addEvent(event)
          postingEvents = false
      }
      catch(e){
          console.log('error posting event', e)
          postingEvents = false
      }
  }
}

const c = (resolve:any, reject:any) => {
  return (error:any,result:any) => {
      if(error){
          console.log("PlayFab Error", error);
          console.log("PlayFab Result", result);
          reject(error)
      }else{
          resolve(result.data);
      }
  }
}

export const getLimitedItemCount = (request:PlayFabAdminModels.CheckLimitedEditionItemAvailabilityRequest):Promise<PlayFabAdminModels.CheckLimitedEditionItemAvailabilityResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.CheckLimitedEditionItemAvailability( request, c(resolve, reject)) 
  })
}

export const getStoreItems = (request:PlayFabServerModels.GetStoreItemsServerRequest):Promise<PlayFabServerModels.GetStoreItemsResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetStoreItems( request, c(resolve, reject)) 
  })
}

export const getRandomItemFromDropTable = (request:PlayFabServerModels.EvaluateRandomResultTableRequest):Promise<PlayFabServerModels.EvaluateRandomResultTableResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.EvaluateRandomResultTable( request, c(resolve, reject)) 
  })
}

export const getDropTables = (request:PlayFabServerModels.GetRandomResultTablesRequest):Promise<PlayFabServerModels.GetRandomResultTablesResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetRandomResultTables( request, c(resolve, reject)) 
  })
}

export const addEvent = (request:PlayFabServerModels.WriteServerPlayerEventRequest):Promise<PlayFabServerModels.WriteEventResponse> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.WritePlayerEvent( request, c(resolve, reject)) 
  })
}

export const updatePlayerStatisticDefinition = (request:PlayFabAdminModels.UpdatePlayerStatisticDefinitionRequest):Promise<PlayFabAdminModels.UpdatePlayerStatisticDefinitionResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.UpdatePlayerStatisticDefinition( request, c(resolve, reject)) 
  })
}

export const updatePlayerStatistic = (request:PlayFabServerModels.UpdatePlayerStatisticsRequest):Promise<PlayFabServerModels.UpdatePlayerStatisticsResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.UpdatePlayerStatistics( request, c(resolve, reject)) 
  })
}

export const getPlayerFiles = (request:PlayFabDataModels.GetFilesRequest):Promise<PlayFabDataModels.GetFilesResponse> =>{
  return new Promise((resolve, reject)=>{
    PlayFabData.GetFiles( request, c(resolve, reject)) 
  })
}

export const getPlayerStatistics = (request:PlayFabServerModels.GetPlayerStatisticsRequest):Promise<PlayFabServerModels.GetPlayerStatisticVersionsResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetPlayerStatistics( request, c(resolve, reject)) 
  })
}

export const incrementPlayerStatistic = (request:PlayFabAdminModels.IncrementPlayerStatisticVersionRequest):Promise<PlayFabAdminModels.IncrementLimitedEditionItemAvailabilityResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.IncrementPlayerStatisticVersion( request, c(resolve, reject)) 
  })
}

export const grantUserItem = (request:PlayFabServerModels.GrantItemsToUserRequest):Promise<PlayFabServerModels.GrantItemsToUserResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.GrantItemsToUser( request, c(resolve, reject)) 
  })
}

export const updateItemUses = (request:PlayFabServerModels.ModifyItemUsesRequest):Promise<PlayFabServerModels.ModifyItemUsesResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.ModifyItemUses( request, c(resolve, reject)) 
  })
}

export const consumeItem = (request:PlayFabClientModels.ConsumeItemRequest):Promise<PlayFabClientModels.ConsumeItemResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabClient.ConsumeItem( request, c(resolve, reject)) 
  })
}

export const revokeUserItem = (request:PlayFabServerModels.RevokeInventoryItemRequest):Promise<PlayFabServerModels.RevokeInventoryResult> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.RevokeInventoryItem( request, c(resolve, reject)) 
  })
}

export const addItem = (request:PlayFabAdminModels.UpdateCatalogItemsRequest):Promise<PlayFabAdminModels.UpdateCatalogItemsResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.UpdateCatalogItems( request, c(resolve, reject)) 
  })
}

export const updatePlayerItem = (request:PlayFabServerModels.UpdateUserInventoryItemDataRequest):Promise<PlayFabServerModels.EmptyResponse> =>{
  return new Promise((resolve, reject)=>{
    PlayFabServer.UpdateUserInventoryItemCustomData( request, c(resolve, reject)) 
  })
}

export const getItem = (request:PlayFabServerModels.GetCatalogItemsRequest):Promise<PlayFabServerModels.GetCatalogItemsRequest> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetCatalogItems( request, c(resolve, reject)) 
  })
}

export const getEnemies = (request:PlayFabServerModels.GetCatalogItemsRequest):Promise<PlayFabServerModels.GetCatalogItemsRequest> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetCatalogItems( request, c(resolve, reject)) 
  })
}

export const getTitleData = (request:PlayFabServerModels.GetTitleDataRequest):Promise<PlayFabServerModels.GetTitleDataResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetTitleData( request, c(resolve, reject)) 
  })
}

export const setTitleData = (request:PlayFabServerModels.SetTitleDataRequest):Promise<PlayFabServerModels.SetTitleDataResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.SetTitleData( request, c(resolve, reject)) 
  })
}

export const getCatalogItems = (request:PlayFabServerModels.GetCatalogItemsRequest):Promise<PlayFabServerModels.GetCatalogItemsResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetCatalogItems( request, c(resolve, reject)) 
  })
}

export const setCatalogItems = (request:PlayFabAdminModels.UpdateCatalogItemsRequest):Promise<PlayFabAdminModels.UpdateCatalogItemsResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.SetCatalogItems( request, c(resolve, reject)) 
  })
}

export const UpdateCatalogItems = (request:PlayFabAdminModels.UpdateCatalogItemsRequest):Promise<PlayFabAdminModels.UpdateCatalogItemsResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.UpdateCatalogItems( request, c(resolve, reject)) 
  })
}

export const playerLogin = (request:PlayFabServerModels.LoginWithServerCustomIdRequest, playFabServer:any):Promise<PlayFabServerModels.ServerLoginResult> => {
  return new Promise((resolve, reject)=>{
    playFabServer ? playFabServer.LoginWithServerCustomId( request, c(resolve, reject)) : PlayFabServer.LoginWithServerCustomId( request, c(resolve, reject)) 
  })
}

export const updatePlayerData = (request:PlayFabServerModels.UpdateUserDataRequest):Promise<PlayFabServerModels.UpdateUserDataResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.UpdateUserData( request, c(resolve, reject)) 
  })
}

export const getPlayerData = (request:PlayFabServerModels.GetUserDataRequest):Promise<PlayFabServerModels.GetUserDataResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetUserData( request, c(resolve, reject)) 
  })
}

export const getPlayerInternalData = (request:PlayFabServerModels.GetUserDataRequest):Promise<PlayFabServerModels.GetUserDataResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetUserInternalData( request, c(resolve, reject)) 
  })
}

export const updatePlayerDisplayName = (request:PlayFabAdminModels.UpdateUserTitleDisplayNameRequest):Promise<PlayFabAdminModels.UpdateUserTitleDisplayNameResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabAdmin.UpdateUserTitleDisplayName( request, c(resolve, reject)) 
  })
}

export const updatePlayerInternalData = (request:PlayFabServerModels.UpdateUserInternalDataRequest):Promise<PlayFabServerModels.UpdateUserDataResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.UpdateUserInternalData( request, c(resolve, reject)) 
  })
}

export const getAllPlayers = (request:PlayFabServerModels.GetPlayersInSegmentRequest):Promise<PlayFabServerModels.GetPlayersInSegmentResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetPlayersInSegment( request, c(resolve, reject)) 
  })
}

export const executeCloudScript = (request:PlayFabServerModels.ExecuteCloudScriptServerRequest):Promise<PlayFabServerModels.ExecuteCloudScriptResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.ExecuteCloudScript( request, c(resolve, reject)) 
  })
}

export const getLeaderboard = (request:PlayFabServerModels.GetLeaderboardRequest):Promise<PlayFabServerModels.GetLeaderboardResult> => {
  return new Promise((resolve, reject)=>{
    PlayFabServer.GetLeaderboard( request, c(resolve, reject)) 
  })
}


export async function fetchPlayfabMetadata(user:string){
  try{
    let userData = await playfabLogin(user)
    return await fetchUserMetaData(userData)
  }
  catch(e){
    console.log("error logging into playfab", e)
  }
}

export async function playfabLogin(user:string){
  try{
    const playfabInfo = await playerLogin(
      {
        CreateAccount: false, 
        ServerCustomId: user,
        InfoRequestParameters:{
          "UserDataKeys":[], "UserReadOnlyDataKeys":[],
          "GetUserReadOnlyData":false,
          "GetUserInventory":false,
          "GetUserVirtualCurrency":true,
          "GetPlayerStatistics":false,
          "GetCharacterInventories":false,
          "GetCharacterList":false,
          "GetPlayerProfile":true,
          "GetTitleData":false,
          "GetUserAccountInfo":true,
          "GetUserData":false,
      }
      },
      IWB_PLAYFAB_SERVER
      )

    if(playfabInfo.error){
      console.log('playfab login error => ', playfabInfo.error)
      return null
    }
    else{
      // console.log('playfab login success, initiate realm')
      return playfabInfo
    }
  }
  catch(e){
    console.log('playfab connection error', e)
    return null
  }
}

export async function fetchUserMetaData(realmData:any){
  try{
    let response = await axios.post("https://" + process.env.PLAYFAB_ID_QA + ".playfabapi.com/File/GetFiles", 
    {Entity: {Id: realmData.EntityToken.Entity.Id, Type: realmData.EntityToken.Entity.Type}},
    {headers:{
        'content-type': 'application/json',
        'X-EntityToken': realmData.EntityToken.EntityToken}}
    )
    return response.data
  }
  catch(e:any){
    console.log('error fetching user metadata, maybe they dont have the file?', e.message)//
    return null
  }
}

export function getDownloadURL(metadata:any, fileKey:string){
  let url:any
  if(metadata.code === 200){
    let version = metadata.data.ProfileVersion
    if(version > 0){
        let data = metadata.data.Metadata
        let count = 0
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                count++
            }
        }

        if(count > 0){
          if(data[fileKey]){
            url = data[fileKey].DownloadUrl
          }
        }
    }
  }
  return url
}

export async function fetchPlayfabFile(metadata:any, fileKey:string, returnNull?:boolean){
  if(metadata.code === 200){
      let version = metadata.data.ProfileVersion
      if(version > 0){
          let data = metadata.data.Metadata
          let count = 0
          for (const key in data) {
              if (data.hasOwnProperty(key)) {
                  count++
              }
          }

          if(count > 0){
            if(data[fileKey]){
              let res = await fetch(data[fileKey].DownloadUrl)
              let json = await res.json()
              return json
            }else{
              return returnNull ? undefined : []
            }

          }else{
            return returnNull ? undefined : []
          }
          
      }else{
        console.log('no profile')
        return returnNull ? undefined : []
      }
  }else{
    return returnNull ? undefined : []
  }
}