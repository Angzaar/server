import { Room, Client, ServerError } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import { validateAndCreateProfile } from "./MainRoomHandlers";
import { getCache } from "../utils/cache";
import {  LOTTERY_FILE_CACHE_KEY } from "../utils/initializer";
import { startRefundProcessor, manaContract, connectWeb3, startNFTQueueProcessor, removeNFTListeners, processNewLottery, lotterySignUp, removePlayerFromLotterySignup, transferReceived, setupNFTListeners, cancelLottery } from "../utils/lottery";

export let pendingIntents:any = {};

export class Player extends Schema {
  @type("string") userId:string;
  @type("string") name:string 
  client:Client

  constructor(args:any, client:Client){
    super(args)
    this.client = client
  }
}

class LotteryState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  refundInterval:any
  nftInterval:any
}

export class LotteryRoom extends Room<LotteryState> {
    async onAuth(client: Client, options: { userId: string;  name: string }, req:any) {
      try {
        await validateAndCreateProfile(options, req);
        return true;
      } catch (error:any) {
        console.error("Error during onAuth:", error.message);
        throw error;
      }
    }

  onCreate(options:any) {
    this.setState(new LotteryState());
    this.clock.start()

    connectWeb3().then(()=>{
        startRefundProcessor(this)
        startNFTQueueProcessor(this)
        setupNFTListeners(this)

        manaContract.on("Transfer", async (from:any, to:any, value:any) => {
            transferReceived(from, to, value, this)
        });
    })

    this.onMessage("get-lotteries", (client, message) => {
        console.log('getting lotteries')
        client.send('get-lotteries', getCache(LOTTERY_FILE_CACHE_KEY))
    });

    this.onMessage("setup-lottery", (client, message) => {
        processNewLottery(client, message, this)
    });

    this.onMessage("cancel-lottery", (client, message) => {
      cancelLottery(client, message, this)
  });

    this.onMessage("play-chance", (client, message) => {
        lotterySignUp(client, message, this)
    });
  }

  onJoin(client: Client, options:any) {
    console.log(`${client.sessionId} joined the MainRoom.`);
    try {
      client.userData = options;
      if(!this.state.players.has(options.userId)){
        let player = new Player(options, client)
        this.state.players.set(options.userId, player)
        console.log('setting client data', options)
      }
    } catch (e) {
        console.log('on join error', e)
    }
  }

  onLeave(client: Client) {
    console.log(`${client.sessionId} left the MainRoom.`);
    this.state.players.delete(client.userData.userId)
    removePlayerFromLotterySignup(client.userData.userId)
  }

  onDispose() {
    console.log("MainRoom disposed!");
    manaContract.removeAllListeners()
    removeNFTListeners()
  }
}

  //0xA3FD0758DEE5F999bb52FFFD0325BF489F372156