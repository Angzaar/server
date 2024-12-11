import { processUpload, upload } from "../utils/upload";


export function uploadRouter(router:any){
    router.post('/upload-scene', upload.single('file'), async (req:any, res:any) => {
      processUpload(req, res)
  });
}