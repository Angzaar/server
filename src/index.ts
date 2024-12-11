
import { listen } from "@colyseus/tools";
import app from "./app.config";
import dotenv from "dotenv";

dotenv.config();
listen(app, parseInt(process.env.PORT));
