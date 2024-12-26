import { Room } from "colyseus";
import { MainRoom } from "./MainRoom";
import { ArtRoom } from "./ArtRoom";


export let mainRooms:Map<string, MainRoom> = new Map()
export let artGalleryRooms:Map<string, ArtRoom> = new Map()

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