import { getCache } from "./cache";
import { LOCATIONS_CACHE_KEY } from "./initializer";

export function getUserPlazaReservations(user:string):any{
    let userReservation:any

    let locations = getCache(LOCATIONS_CACHE_KEY)
    if(!locations){
        console.log('no locations on db')
        return userReservation
    }

    locations.forEach((location:any)=>{
        if(!userReservation || userReservation === undefined){
            let foundReservation = location.reservations.find((res:any)=> res.ethAddress === user.toLowerCase())
            if(foundReservation && location.currentReservation === foundReservation.id){
                userReservation = {
                    size: location.parcels.length,
                    ...foundReservation,
                    locationId:location.id
                }
            }
        }
    })
    return userReservation
}

export function getPlazaLocationCurrentReservation(id:number):any{
    let reservation:any
    let locations = getCache(LOCATIONS_CACHE_KEY)
    if(!locations){
        console.log('no locations on db')
        return reservation
    }

    let location = locations.find((loc:any)=> loc.id === id)
    if(!location){
        return reservation
    }

    if(!location.currentReservation){
        return reservation
    }

    let currentReservation = location.reservations.find((res:any)=> res.id === location.currentReservation)
    if(!currentReservation){
        return reservation
    }
    return  {...currentReservation}
}

export function getPlazaReservation(id:string):any{
    let reservation:any
    let locations = getCache(LOCATIONS_CACHE_KEY)
    if(!locations){
        console.log('no locations on db')
        return undefined
    }

    locations.forEach((location:any)=>{
        if(!reservation || reservation === undefined){
            let foundReservation = location.reservations.find((res:any)=> res.id === id)
            if(foundReservation){
                reservation = {...foundReservation}
                if(location.currentReservation && location.currentReservation === foundReservation.id){
                    reservation.current = true
                }
            }
        }
    })
    return reservation
}

export function getPlazaLocation(id:number){
    let locations = getCache(LOCATIONS_CACHE_KEY)
    if(!locations){
        console.log('no locations on db')
        return
    }

    let location = locations.find((loc:any)=> loc.id === id)
    if (location) {
        const { id, parcels, currentReservation } = {...location};
        return { id, parcels, currentReservation};
      }
}