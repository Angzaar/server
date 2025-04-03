import { processGenesisUpload, processUpload, upload } from "../utils/upload";
import { pingCatalyst } from "../utils/zip-deployment";


export function uploadRouter(router:any){
    router.post('/upload-scene', upload.single('file'), async (req:any, res:any) => {
      processUpload(req, res)
    });

    router.post('/genesis-deploy', upload.single('file'), async (req:any, res:any) => {
      processGenesisUpload(req, res)
    });

router.post("/genesis-deploy/signature", async function(req:any, res: any) {
  console.log("ping catalyst body is", req.body)
  pingCatalyst(req,res)
  })
}