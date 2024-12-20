import { getPlazaLocation, getPlazaLocationCurrentReservation, getPlazaReservation, getUserPlazaReservations } from "../utils/reservations";

export function apiRouter(router:any){
    router.get('/api/:location/:action/:id', async (req:any, res:any) => {
      console.log('getting angzaar api router', req.params)
      if(!req.params || !req.params.location || !req.params.action || !req.params.id){
        console.log('invalid parameters')
        res.status(200).send({valid:false, message:"Invalid Parameters"})
        return
      }

      switch(req.params.location){
        case 'plaza':
          let reservation:any
          switch(req.params.action){
            case 'location-reservation':
              console.log('get location reservation', req.params.id)
              reservation = await getPlazaLocationCurrentReservation(parseInt(req.params.id))
              res.status(200).send({valid:true, reservation})
              break;

            case 'reservation':
              console.log('get reservation', req.params.id)
              reservation = await getPlazaReservation(req.params.id)
              res.status(200).send({valid:true, reservation})
              break;

            case 'user-reservation':
              console.log('get user reservations', req.params.id)
              reservation = await getUserPlazaReservations(req.params.id)
              res.status(200).send({valid:true, reservation})
              break;

            case 'locations':
              console.log('get location data', req.params.id)
              let location =  await getPlazaLocation(parseInt(req.params.id))
              res.status(200).send({valid:true, location})
              break;
          }
          break;
      }
  });
}