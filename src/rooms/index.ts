import { Room } from "colyseus";
import { MainRoom } from "./MainRoom";


export let mainRooms:Map<string, MainRoom> = new Map()

export function addRoom(room:MainRoom){
    mainRooms.set(room.roomId, room)
}

export function removeRoom(room:MainRoom){
    mainRooms.delete(room.roomId)
}