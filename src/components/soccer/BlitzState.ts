import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";
import { PlayerState } from "./PlayerState";
import { TeamState } from "./TeamState";
import { BallState } from "./BallState";
import { PowerUpState } from "./PowerupState";
import { SpaceshipState } from "./SpaceshipState";
import { LightStopperState } from "../arcade/LightStopperState";
import { PoliceTrainerState } from "../arcade/PoliceTrainerState";
import { FroggerState } from "../arcade/FroggerState";
import { BilliardsState } from "../arcade/BilliardState";
import { LaserTagState } from "../tag";
import { BowlingLane } from "../bowling.ts";

export class MainState extends Schema {
  // @type({ map: SoccerGame }) games = new MapSchema<SoccerGame>();
  // @type({ map: Player }) players = new MapSchema<Player>();

  // world: CANNON.World
  // updateInterval: NodeJS.Timer

  //   // Tweak these as desired
  //   fixedTimeStep = 1 / 60
  //   maxSubSteps = 5
  //   broadcastRate = 100 // ms = 10 times per second

}

export class BlitzState extends Schema {
  @type({ map: PlayerState }) 
  players = new MapSchema<PlayerState>();

  @type({ map: SpaceshipState }) 
  spaceships = new MapSchema<SpaceshipState>();


  //Arcade Variables //////////////////////////////////////////////////////////////////////////////////////////
  @type({ map: LightStopperState }) 
  lightStopper = new MapSchema<LightStopperState>();

  @type({ map: PoliceTrainerState }) 
  policeTrainer:MapSchema<PoliceTrainerState> = new MapSchema()

  @type({ map: FroggerState }) 
  frogger:MapSchema<FroggerState> = new MapSchema()

  @type({ map: BilliardsState }) 
  billiards:MapSchema<BilliardsState> = new MapSchema()

  @type({ map: BowlingLane })
  bowlingLanes = new MapSchema<BowlingLane>();
  
  //////////////////////////////////////////////////////////////////////////////////////////


  //Tag Variables //////////////////////////////////////////////////////////////////////////////////////////
  @type({ map: LaserTagState }) 
  laserTag:MapSchema<LaserTagState> = new MapSchema()


  //Blitz Variables //////////////////////////////////////////////////////////////////////////////////////////
  @type([ TeamState ]) 
  teams = new ArraySchema<TeamState>();

  @type([ BallState ])
  balls = new ArraySchema<BallState>();

  @type([ PowerUpState ])
  powerUps = new ArraySchema<PowerUpState>();

  // @type([ PowerUpState ])
  // powerUps = new ArraySchema<PowerUpState>();

  @type("number")
  gameTime: number = 0;

  @type("boolean")
  isGamePlaying: boolean = false;

  @type("boolean")
  isGameActive: boolean = false;

  @type("boolean")
  isGameStarting: boolean = false;
  //////////////////////////////////////////////////////////////////////////////////////////

  world: CANNON.World
  updateInterval: NodeJS.Timer
  powerupTmer: Delayed
  countdownTimer:Delayed
  gameTimer:Delayed

  // Tweak these as desired
  fixedTimeStep = 1 / 60
  maxSubSteps = 10
  broadcastRate = 100 // ms = 10 times per second

  xOffset = 0
  yOffset = 0

  entity:any
  
}