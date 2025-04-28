import { Room } from "colyseus";
import { QuestRoom } from "./QuestRoom";
import { WebAppRoom } from "../WebApp/WebAppRoom";

export let webAppRoom:WebAppRoom | null = null
export let questRooms:Map<string, QuestRoom> = new Map()

export function setWebAppRoom(room:WebAppRoom){
    webAppRoom = room
}

export function removeWebAppRoom(){
    webAppRoom = null
}

export function addQuestRoom(room:QuestRoom){
    questRooms.set(room.roomId, room)
}

export function removeQuestRoom(room:QuestRoom){
    questRooms.delete(room.roomId)
}