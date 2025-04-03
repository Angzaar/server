import { CANNON } from "../../utils/libraries"

export const bowlingSlug:string = "bowling"

export const MAX_PLAYERS = 6
// Example: setting a random linear speed for the ball
export const minSpeed = 5;  // minimum speed (units per second)
export const maxSpeed = 15; // maximum speed

export const WORLD_UP = new CANNON.Vec3(0, 1, 0)

// Convert feet/inches to meters as needed
// Lane width = 42 inches => ~1.07 m
export const LANE_WIDTH = 2
// Each gutter ~9 inches => 0.23 m
export const GUTTER_WIDTH = 0.5

// So total "bed" + gutters ~1.07 + (0.23 * 2) = ~1.53 m
// A real lane with both gutters is about 5 ft wide => ~1.524 m. Close enough.

// Lane length: We'll pick ~18.3 m. 
// This might represent ~60 ft from foul line to pins (ignoring approach).
export const LANE_LENGTH = 19

// We'll make each shape a BOX, so we need half-extents:
export const halfLaneWidth = LANE_WIDTH / 2  // ~0.535 m
export const halfGutterWidth = GUTTER_WIDTH / 2  // ~0.115 m

export const halfLaneLength = LANE_LENGTH / 2  // ~9.15 m

// We'll keep the thickness of each box at 0.1 m, so halfThickness = 0.05
export const halfThickness = 0.05

// Pin dimensions
export const PIN_HEIGHT = 0.4
export const PIN_WIDTH = 0.2
export const PIN_RADIUS = 0.07 // approximate radius
export const rowCount = 4
export const rowSpacing = 0.31  // distance between successive rows
export const colSpacing = 0.31  // distance between pins in the same row
export const halfHeight = PIN_HEIGHT / 2  // 0.2
export const halfWidth = PIN_WIDTH / 2    // 0.05

// We'll define the "head pin" z
export const headPinZ = LANE_LENGTH + (LANE_LENGTH / 2) - 0.2
// We'll place all pins at y = 0.2 so they're slightly above the lane (or exactly on it)
export const pinY = 1.5 + 60
export const PIN_MASS = 1

// For example:
export const BALL_RADIUS = 0.15  // 15 cm radius
export const BALL_MASS = 10       // mass 1, tweak as desired

 // A constant to tune the effect.
export const MAGNUS_COEFFICIENT = 0.1; // Adjust based on desired curve

// 1) Lane material
export const laneMat = new CANNON.Material("laneMaterial")
// We'll assign friction & restitution here, or via ContactMaterial
// (Often we keep these minimal and let ContactMaterial do the heavy lifting)
laneMat.friction = 0.1
laneMat.restitution = 0.0

// 2) Pin material
export const pinMat = new CANNON.Material("pinMaterial")
pinMat.friction = 0.3
pinMat.restitution = 0.1

// 3) Ball material
export const ballMat = new CANNON.Material("ballMaterial")
ballMat.friction = 0.05
ballMat.restitution = 0.05


// Lane-Ball
export const laneBallContact = new CANNON.ContactMaterial(laneMat, ballMat, {
    friction: 0.1,         // friction coefficient between lane and ball
    restitution: 0.05,     // how bouncy the ball is off the lane
  })
  
  // Lane-Pin
  export   const lanePinContact = new CANNON.ContactMaterial(laneMat, pinMat, {
    friction: 0.2,
    restitution: 0.1,
  })
  
  // Ball-Pin
  export   const ballPinContact = new CANNON.ContactMaterial(ballMat, pinMat, {
    friction: 0.3,
    restitution: 0.2,
  })


  export const laneShape = new CANNON.Box(
    new CANNON.Vec3(halfLaneWidth, halfThickness, halfLaneLength)
)

// Gutter shape
export const gutterShape = new CANNON.Box(
    new CANNON.Vec3(halfGutterWidth, halfThickness, halfLaneLength)
)

export const pinShape = new CANNON.Cylinder(PIN_RADIUS, PIN_RADIUS, PIN_HEIGHT, 8)
// const pinShape = new CANNON.Box(new CANNON.Vec3(halfWidth, halfHeight, halfWidth))

export const ballShape = new CANNON.Sphere(BALL_RADIUS)

// divider shape
export const dividerShape = new CANNON.Box(
  new CANNON.Vec3(0.05, 0.25, halfLaneLength + 0.25)
)

// backwall shape
export const backWallShape = new CANNON.Box(
  new CANNON.Vec3(((GUTTER_WIDTH * 2) + LANE_WIDTH) / 2, 1.5, 0.25)
)

// back gutter shape
export const backGutterShape = new CANNON.Box(
    new CANNON.Vec3(((GUTTER_WIDTH * 2) + LANE_WIDTH) / 2, 0.1 /2, 0.25)
  )
