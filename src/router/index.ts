import express, { Request, Response } from "express";
import { uploadRouter } from "./upload";
import { adminRouter } from "./admin";
import { apiRouter } from "./api";
import { pendingIntents } from "../rooms/LotteryRoom";
import { getCache } from "../utils/cache";
import { LOTTERY_FILE_CACHE_KEY } from "../utils/initializer";
import { LOTTERY_WALLET, transferReceived } from "../utils/lottery";

export const router = express.Router();
uploadRouter(router)
adminRouter(router)
apiRouter(router)

router.get("/hello-world", async function(req: express.Request, res: express.Response) {
  console.log('hello world')
  res.status(200).json({result: "hello world"})
})

// Endpoint to initiate play
router.get('/lottery/get-lotteries', (req, res) => {
  res.status(200).send({value:true, lotteries:getCache(LOTTERY_FILE_CACHE_KEY)})
})