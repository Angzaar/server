import { handleAdminChance, handleAdminLocationReset, handlePlazaAdmin } from "../utils/admin";
import { getCache, updateCache } from "../utils/cache";
import { ADMINS_FILE_CACHE_KEY, PROFILES_FILE } from "../utils/initializer";

export function adminRouter(router:any){
    router.post('/admin/:auth', authentication, (req:any, res:any) => {
        console.log('admin router - ', req.body)
        if(!req.body){
            res.status(200).send({valid:false});
            return 
        }
        switch(req.body.type){
            case 'plaza-admin':
                handlePlazaAdmin(req, res)
                break;

            case 'chance':
                handleAdminChance(req, res)
                break;
                
            default:
            return res.status(200).send({valid:true, message:"unavailable route"});
        }
        res.status(200).send({valid:true});
    });

    router.get('/admin/deployments/:location/:action/:auth', authentication, (req:any, res:any) => {
        console.log('admin router - ', req.params.location, req.params.action, req.params.auth)

        switch(req.params.action){
            case 'reset':
                handleAdminLocationReset(req.params.location)
                break;
        }
        res.status(200).send({valid:true});
    });

    router.get('/admin/:data/:auth', authentication, (req:any, res:any) => {
        console.log('admin data router - ', req.params.data, req.params.auth)
        res.status(200).send({valid:true, [req.params.data]: getCache(req.params.data)});
    });

    router.get('/admin/clear/:data/:auth', authentication, (req:any, res:any) => {
        console.log('admin data router - ', req.params.data, req.params.auth)

        let file:any
        let data:any
        switch(req.params.data){
            case 'profiles':
                file = PROFILES_FILE
                data = []
                break;
        }

        updateCache(file, req.params.data, data)
        res.status(200).send({valid:true, [req.params.data]:getCache(req.params.data)});
    });
}

function authentication(req:any, res:any, next:any){
    if(!req.params.auth || req.params.auth !== process.env.ADMIN_AUTH){
        res.status(400).send({valid:false, message:"Invalid authorization"})
        return
    }
    next()
}