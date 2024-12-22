import { handleAdminLocationReset } from "../utils/admin";
import { getCache, updateCache } from "../utils/cache";
import { ADMINS_FILE_CACHE_KEY, PROFILES_FILE } from "../utils/initializer";

export function adminRouter(router:any){
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

    router.get('/admin/plaza-admin/edit/:action/:user/:auth', authentication, (req:any, res:any) => {
        let admins = getCache(ADMINS_FILE_CACHE_KEY)
        if(!req.params.action || !req.params.user){
            res.status(400).send({valid:false, message:"Invalid parameters"})
            return
        }
        let adminIndex = admins.findIndex((admin:any)=> admin.userId === req.params.user.toLowerCase())
        switch(req.params.action){
            case 'add':
                if(adminIndex < 0){
                    admins.push({userId:req.params.user.toLowerCase(), level:0})
                    res.status(200).send({valid:true, message:"admin added"});
                    return
                }else{
                    console.log('user already admin')
                    res.status(200).send({valid:true, message:"user already admin"});
                    return
                }

            case 'delete':
                if(adminIndex >=0){
                    admins.splice(adminIndex, 1)
                    res.status(200).send({valid:true, message:"admin deleted"});
                    return
                }else{
                    res.status(200).send({valid:true, message:"admin doesnt exist"});
                    return
                }

            default:
                return res.status(200).send({valid:true, message:"unavailable route"});
        }
       
    });
}

function authentication(req:any, res:any, next:any){
    if(!req.params.auth || req.params.auth !== process.env.ADMIN_AUTH){
        res.status(400).send({valid:false, message:"Invalid authorization"})
        return
    }
    next()
}