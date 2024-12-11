import { ethers, TypedDataEncoder } from "ethers";
import fs from 'fs';
import { checkDCLDeploymentQueue, deploymentQueue } from "../utils/deployment";
import { messageDeployType, messageDomain } from "../utils/types";
import path from "path";

const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: function (req:any, file:any, cb:any) {
        if (!fs.existsSync(process.env.TEMP_DIR)) {
          fs.mkdirSync(process.env.TEMP_DIR, { recursive: true });
        } 
        cb(null, process.env.TEMP_DIR);
    },
    filename: function (req:any, file:any, cb:any) {
      let id = uuidv4()
      req.fileId = id
      cb(null, id + ".zip");
    },
  });

export const upload = multer({ storage: storage });

export const processUpload = async(req:any, res:any) =>{
    try {
        const body = {...req.body}
        const { signature, hash, userId, locationId, reservationId } = body;
    
        console.log('authentication body', body)
    
        // Validate input
        if (!signature || !hash || !userId) {
          console.log('missing some information', body)
          removeTempFile(path.join(process.env.TEMP_DIR, req.fileId + ".zip"))
          return res.status(400).json({ error: "Missing signature, deployHash, or ethAddress." });
        }
    
        // const domain = {
        //     name: "AngzaarPlazaDeployment",
        //     version: "1",
        //     chainId: 1,
        //   };
        
        //   const types = {
        //     Deploy: [
        //       { name: "message", type: "string" },
        //       { name: "deployHash", type: "string" },
        //     ],
        //   };

        //   const value = {
        //     message: "Sign to upload your content",
        //     deployHash:hash,
        //   };

        //   const ver = ethers.verifyTypedData(domain, types, value, signature)
        //   console.log('ver is', ver)

        // const digest = ethers.TypedDataEncoder.hash(domain, types, value)
        // const recoveredAddress = ethers.recoverAddress(digest, signature)
        // console.log('recovered address is', recoveredAddress)

        const recoveredAddress = ethers.verifyMessage(hash, signature)
    
        // Verify the recovered address matches the provided ethAddress
        if (recoveredAddress.toLowerCase() !== userId.toLowerCase()) {
            removeTempFile(path.join(process.env.TEMP_DIR, req.fileId + ".zip"))
          return res.status(401).json({ error: "Invalid signature." });
        }
    
        // Signature is valid; proceed to the next middleware
        const file = req.file;

        if (!file) {
          console.log('no file uploaded')
          removeTempFile(path.join(process.env.TEMP_DIR, req.fileId + ".zip"))
          return res.status(400).json({ error: "No file uploaded" });
        }
      
        console.log("Uploaded file details:", {
          fileId: req.fileId,
          storedPath: file.path,
        });

        let deploymentId = uuidv4()

        deploymentQueue.push({file:req.fileId + ".zip", userId:userId, locationId:parseInt(locationId), id:deploymentId, reservationId:reservationId})
        checkDCLDeploymentQueue()
      
        // Respond to the client
        res.status(200).json({
          message: "File uploaded successfully",
          fileId: req.fileId,
          storedPath: file.path,
          success:true,
          deploymentId:deploymentId
        });
      } catch (error) {
        console.error("Authentication error:", error);
        res.status(500).json({ error: "Internal server error during authentication." });
        removeTempFile(path.join(process.env.TEMP_DIR, req.fileId + ".zip"))
      }
}

const removeTempFile = (path:string)=>{
    fs.unlink(path, (unlinkError) => {
        if (unlinkError) {
          console.error("Failed to delete file:", unlinkError);
        } else {
          console.log("Deleted file:", path);
        }
      });
}