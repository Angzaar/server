import config from "@colyseus/tools";
import {monitor} from "@colyseus/monitor";
import { playground } from "@colyseus/playground";
import { WebSocketTransport } from "@colyseus/ws-transport"
import { MainRoom } from "./rooms/MainRoom";
import cors from 'cors'
import { initServer } from "./utils/initializer";
import { ArtRoom } from "./rooms/ArtRoom";
import { router } from "./router";
import { LotteryRoom } from "./rooms/LotteryRoom";
import { AdminRoom } from "./rooms/AdminRoom";
import { BlitzRoom } from "./rooms/BlitzRoom";
import { TronRoom } from "./components/arcade/TronState";
import { FlightRoom } from "./rooms/FlightRoom";
import { QuestRoom } from "./components/TheForge/QuestRoom";
import { WebAppRoom } from "./components/WebApp/WebAppRoom";
import { migrateQuests } from "./components/TheForge/utils/functions";
export default config({
    initializeGameServer: async (gameServer) => {
        await initServer();
        
        // Migrate quests to the new format if needed
        try {
            const migratedCount = await migrateQuests();
            console.log(`Quest migration completed. Migrated ${migratedCount} quests.`);
        } catch (error) {
            console.error("Error during quest migration:", error);
        }
        
        gameServer.define('angzaar_plaza_conference', MainRoom);
        gameServer.define('angzaar_plaza_colosseum', MainRoom);
        gameServer.define('angzaar_plaza_reservations', MainRoom);
        gameServer.define('angzaar_plaza_dapp', MainRoom);
        gameServer.define('angzaar_plaza_gallery', ArtRoom);
        gameServer.define('angzaar_plaza_admin', AdminRoom);
        gameServer.define('angzaar_plaza_lottery', LotteryRoom);
        gameServer.define('angzaar_blitz', BlitzRoom);
        gameServer.define('angzaar_cycles', TronRoom)
        gameServer.define('angzaar_flight', FlightRoom)
        gameServer.define('angzaar_questing', QuestRoom)
        .filterBy(["questId", "userId"])
        
        // Define the WebApp room for global web app functionality
        gameServer.define('angzaar_webapp', WebAppRoom);
    },

    initializeTransport: function(opts) {
        return new WebSocketTransport({
          ...opts,
          pingInterval: 6000,
          pingMaxRetries: 4,
          maxPayload: 1024 * 1024 * 300, // 300MB Max Payload
        });
      },

    initializeExpress: (app) => {
        // app.use(bodyParser.json({ limit: '300mb' }));
        // app.use(bodyParser.urlencoded({limit: '300mb', extended: true }));
        app.use(cors({origin: true}))
        app.options('*', cors());
        app.use('/colyseus', monitor())
        app.use("/playground", playground);

        // app.use((req:any, res:any, next) => {
        //   console.log("Headers:", req.headers);
        //   console.log("Body:", req.body);
        //   console.log("Files:", req.files);
        //   next();
        // });

        app.use("/", router);
    },

    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});