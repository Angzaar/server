import { CANNON } from "../../utils/libraries"
import { BallType } from "./BallState";
import { PowerUpType } from "./PowerupState";

export const GROUP_TEAM_A   = 1 << 0;  // 1
export const GROUP_TEAM_B   = 1 << 1;  // 2
export const GROUP_BALL     = 1 << 2;  // 4
export const GROUP_WORLD    = 1 << 3;  // 8

export const wallMat = new CANNON.Material("wallMaterial");
// Wall dimensions
export const wallHeight = 80;
export const wallThickness = 0.1; // Thin wall
export const fieldWidth = 16 * 4; // Adjust based on your stadium size
export const fieldLength = 16 * 7; // Adjust based on your stadium size


export const MAX_PLAYERS = 10
export const BALL_RADIUS = 2.5  // 15 cm radius
export const BALL_MASS = 5       // mass 1, tweak as desired

export const minSpeed = 5;  // minimum speed (units per second)
export const maxSpeed = 15; // maximum speed

export const WORLD_UP = new CANNON.Vec3(0, 1, 0)

export const groundMat = new CANNON.Material("groundMaterial")

export const ballMat = new CANNON.Material("ballMaterial")
ballMat.friction = 0.
ballMat.restitution = 0.7

export const playerMat = new CANNON.Material("playerMaterial")
playerMat.friction = 0.1
playerMat.restitution = 0.1

// Define Contact Material properties
export const ballWallContact = new CANNON.ContactMaterial(
  ballMat, // First material (player)
  wallMat,   // Second material (ball)
  {
    friction: 0.4,       // Low friction (so ball moves easily)
    restitution: 0.3,    // High restitution (ball bounces off players)
  }
);

// Define Contact Material properties
export const playerBallContactMaterial = new CANNON.ContactMaterial(
    playerMat, // First material (player)
    ballMat,   // Second material (ball)
    {
      friction: 0.1,       // Low friction (so ball moves easily)
      restitution: 0.7,    // High restitution (ball bounces off players)
    }
  );

export const ballGroundContact = new CANNON.ContactMaterial(
    ballMat, 
    groundMat, 
    {
    friction: 0.2,       // Some friction for rolling
    restitution: 0.6,    // Bouncy effect   
    }
);

export const ballBallContact = new CANNON.ContactMaterial(ballMat, ballMat, {
    friction: 0.3,      // Slight friction to allow rolling interaction
    restitution: 0.6,   // High restitution for realistic bounces
  });
  
export const ballShape = new CANNON.Sphere(2.5)
export const goalShape = new CANNON.Box(new CANNON.Vec3(10, 7.5, 0.05));
export const iceWallShape = new CANNON.Box(new CANNON.Vec3(10, 7.5, 1));
export const playerShape =  new CANNON.Sphere(1.5)

// Example weighting
export const ballTypeWeights = [
  { type: BallType.NORMAL, weight: 30 },
  { type: BallType.ICE,    weight: 20 },
  { type: BallType.BOMB,   weight: 15 },
  { type: BallType.LIGHT,  weight: 15 },
  { type: BallType.GHOST,  weight: 20 },
];


// Team A spawn positions (x, y, z)
export const ballSpawnPoints: Array<{ x: number; y: number; z: number, }> = [
  { x: 96, y: 30, z: 55},
  { x: 103, y: 30, z: 55},
  { x: 112, y: 30, z: 55 },
  { x: 121, y: 30, z: 55 },
  { x: 130, y: 30, z: 55 },
];

// Team A spawn positions (x, y, z)
export const teamASpawnPoints: Array<{ x: number; y: number; z: number, cz:number }> = [
  { x: 96, y: 30, z: 22, cz:90 },
  { x: 103, y: 30, z: 22, cz:90  },
  { x: 112, y: 30, z: 22, cz:90  },
  { x: 121, y: 30, z: 22, cz:90  },
  { x: 130, y: 30, z: 22, cz:90  },
];

// Team B spawn positions (x, y, z)
export const teamBSpawnPoints: Array<{ x: number; y: number; z: number, cz:number }> = [
  { x: 96, y: 30, z: 90, cz:22  },
  { x: 103, y: 30, z: 90, cz:22  },
  { x: 112, y: 30, z: 90, cz:22  },
  { x: 121, y: 30, z: 90, cz:22  },
  { x: 130, y: 30, z: 90, cz:22  },
];

export const MIN_SPAWN_DELAY = 10000; // 10s
export const MAX_SPAWN_DELAY = 20000; // 20s

export const arenaMinX = 93; 
export const arenaMaxX = 130;
export const arenaMinZ = 12; 
export const arenaMaxZ = 94;

// Weighted spawn chances (optional)
export const powerUpWeights = [
  { type: PowerUpType.DOUBLE_POINTS, weight: 15 },
  { type: PowerUpType.ICE_GOAL,      weight: 30 },
  { type: PowerUpType.IMMUNITY,      weight: 30 },
  { type: PowerUpType.LIGHTNING,     weight: 15 },
];
