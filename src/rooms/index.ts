import { Room } from "colyseus";


export let mainRooms:Map<string, Room> = new Map()

export function addRoom(room:Room){
    mainRooms.set(room.roomId, room)
}

export function removeRoom(room:Room){
    mainRooms.delete(room.roomId)
}