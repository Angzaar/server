import { getLeaderboard } from "../components/BasePlayerState";
import { QuestDefinition, StepDefinition, TaskDefinition } from "../rooms/QuestRoom";
import { getCache } from "../utils/cache";
import { PROFILES_CACHE_KEY } from "../utils/initializer";
import { handleQuestData, handleQuestLeaderboard, handleQuestOutline } from "../utils/questing";
import { getPlazaLocation, getPlazaLocationCurrentReservation, getPlazaReservation, getUserPlazaReservations } from "../utils/reservations";

export function apiRouter(router:any){
    router.get('/api/locations/:location/:action/:id', async (req:any, res:any) => {
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
              res.status(200).send({valid:reservation? true : false, reservation})
              break;

            case 'locations':
              console.log('get location data', req.params.id)
              let location =  await getPlazaLocation(parseInt(req.params.id))
              res.status(200).send({valid:true, location})
              break;
          }
          break;

        case 'blitz':
          let [action, args, type] = req.params.action.split("-")

          console.log('blitz action', action, args, type)

          switch(action){
            case 'leaderboard':
              let wins:any[] = []
              let goals:any[] = []

              switch(args){
                case 'all':
                  wins = getLeaderboard('wins')
                  goals = getLeaderboard('goals')
                  res.status(200).send({valid:true, wins, goals})
                  break;

                case 'goals':
                  goals = getLeaderboard('goals')
                  res.status(200).send({valid:true, goals})
                  break;
                
                case 'wins':
                  wins = getLeaderboard('wins')
                  res.status(200).send({valid:true, wins})
                  break;
              }
              
              break;
          }
          break;
      }
  });

  router.get('/api/quests/outline', (req:any, res:any) => {
    handleQuestOutline(req,res)
  });

  router.get('/api/quests/:questId/users', (req:any, res:any) => {
    handleQuestData(req, res)
  })

  router.get('/api/leaderboard', (req:any, res:any) => {
    handleQuestLeaderboard(req, res)
  });
}