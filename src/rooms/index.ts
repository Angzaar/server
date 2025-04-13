import { Room } from "colyseus";
import { MainRoom } from "./MainRoom";
import { ArtRoom } from "./ArtRoom";
import { BlitzRoom } from "./BlitzRoom";
import { QuestRoom } from "../components/TheForge/QuestRoom";

export let mainRooms:Map<string, MainRoom> = new Map()
export let artGalleryRooms:Map<string, ArtRoom> = new Map()
export let blitzRooms:Map<string, BlitzRoom> = new Map()
export let questRooms:Map<string, QuestRoom> = new Map()

export function addRoom(room:MainRoom){
    mainRooms.set(room.roomId, room)
}

export function removeRoom(room:MainRoom){
    mainRooms.delete(room.roomId)
}

export function addArtRoom(room:ArtRoom){
    artGalleryRooms.set(room.roomId, room)
}

export function removeArtRoom(room:ArtRoom){
    artGalleryRooms.delete(room.roomId)
}


export function addBlitzRoom(room:BlitzRoom){
    blitzRooms.set(room.roomId, room)
}

export function removeBlitzRoom(room:BlitzRoom){
    blitzRooms.delete(room.roomId)
}

export function addQuestRoom(room:QuestRoom){
    questRooms.set(room.roomId, room)
}

export function removeQuestRoom(room:QuestRoom){
    questRooms.delete(room.roomId)
}