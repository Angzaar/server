import express, { Request, Response } from "express";
import { uploadRouter } from "./upload";
import { adminRouter } from "./admin";

export const router = express.Router();
uploadRouter(router)
adminRouter(router)

router.get("/hello-world", async function(req: express.Request, res: express.Response) {
  console.log('hello world')
  res.status(200).json({result: "hello world"})
})