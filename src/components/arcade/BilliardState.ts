import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { BlitzRoom } from "../../rooms/BlitzRoom";
import { CANNON } from "../../utils/libraries";
import { Vec3 } from "cannon-es";
import { billiardsSlug } from "./BilliardsConstants";

class BallState extends Schema {
    @type('number') px = 0;
    @type('number') py = 0; // Vertical
    @type('number') pz = 0;
    @type('number') rx = 0;
    @type('number') ry = 0; // Vertical
    @type('number') rz = 0;
    @type('number') rw = 0;
    @type('number') vx = 0;
    @type('number') vy = 0;
    @type('number') vz = 0;
    @type('boolean') pocketed = false;

    entity:any

    constructor(position:Vec3){
        super()
        this.px = position.x
        this.py = position.y
        this.pz = position.z
    }
   
  }

  class WallState extends Schema {
    @type('number') px = 0;
    @type('number') py = 0; // Vertical
    @type('number') pz = 0;

    @type('number') sx = 0;
    @type('number') sy = 0; // Vertical
    @type('number') sz = 0;

    @type('number') rx = 0;
    @type('number') ry = 0; // Vertical
    @type('number') rz = 0;
    @type('number') rw = 0;
    @type('number') vx = 0;
    @type('number') vy = 0;
    @type('number') vz = 0;
    @type('boolean') pocketed = false;

    entity:any

    constructor(position:Vec3, size:Vec3){
        super()
        this.px = position.x
        this.py = position.y
        this.pz = position.z

        this.sx = size.x
        this.sy = size.y
        this.sz = size.z
    }

  }


// Define a billiards-specific state schema
export class BilliardsState extends Schema {
@type(['string']) team1Mates = new ArraySchema<string>();
@type(['string']) team2Mates = new ArraySchema<string>();
  @type([BallState]) balls = new ArraySchema<BallState>();
  @type([WallState]) walls = new ArraySchema<WallState>();
  @type([BallState]) pockets = new ArraySchema<BallState>();

  @type('number') team1Score = 0;
  @type('number') team2Score = 0;
  @type('number') shotTimeRemaining = 20;

  @type('string') team1Type = ''; // 'solids', 'stripes', or ''
  @type('string') team2Type = ''; // 'solids', 'stripes', or ''
  @type('string') winner = ''; // 'team1', 'team2', or ''

  @type('boolean') playing = false;
  @type('boolean') scratched = false;
  @type('boolean') isTeam1Turn = true;
  @type('boolean') gameOver = false;

  room:BlitzRoom

  shotTimer:any

  tablePosition = new CANNON.Vec3(25, 0.9, 25); // x, y (vertical), z
  tableLength = 2.54;
  tableWidth = 1.27;
  wallHeight = 0.1;
  wallThickness = 0.05;
  pocketRadius = 0.08;

  constructor(room:BlitzRoom){
    super()
    this.room = room

    const ballMaterial = new CANNON.Material('billiard-ball');
    const wallMaterial = new CANNON.Material('billiard-wall');
    const pocketMaterial = new CANNON.Material('billiard-pocket');
    const tableMaterial = new CANNON.Material('billiard-table');

    this.room.state.world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, ballMaterial, { friction: 0.1, restitution: 0.50 }));
    this.room.state.world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, wallMaterial, { friction: 0.3, restitution: 0.5 }));
    this.room.state.world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, pocketMaterial, { friction: 0, restitution: 0 }));
    this.room.state.world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, tableMaterial, { friction: 0.1, restitution: 0 }));

    // Table
    const table = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), position:this.tablePosition, material: tableMaterial });
    table.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    table.position.set(this.tablePosition.x, this.tablePosition.y, this.tablePosition.z);

    this.room.state.world.addBody(table);
    this.room.physicsRefs.set('billiards_table', { body: table });

// Pockets
const pocketPositions = [
    new CANNON.Vec3(-this.tableLength / 2, 0, -this.tableWidth / 2),
    new CANNON.Vec3(-this.tableLength / 2, 0, this.tableWidth / 2),
    new CANNON.Vec3(this.tableLength / 2, 0, -this.tableWidth / 2),
    new CANNON.Vec3(this.tableLength / 2, 0, this.tableWidth / 2),
    new CANNON.Vec3(0, 0, -this.tableWidth / 2 - this.pocketRadius / 2 - .1),
    new CANNON.Vec3(0, 0, this.tableWidth / 2 + this.pocketRadius / 2 + .1),
  ];

  pocketPositions.forEach((pos, i) => {
    const pocket = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Cylinder(this.pocketRadius, this.pocketRadius, 0.05, 16),
      material: pocketMaterial,
      position: new CANNON.Vec3(
        this.tablePosition.x + pos.x,
        this.tablePosition.y + pos.y,
        this.tablePosition.z + pos.z
      ),
    });
    this.pockets.push(new BallState(pocket.position))
    this.room.state.world.addBody(pocket);
    this.room.physicsRefs.set(`billiards_pocket_${i}`, { body: pocket });

    pocket.addEventListener('collide', (event: any) => {
        this.handlePocketCollision((event.body as any).ballId)
    });
  });

  // Walls
  const wallSegments = [
    { pos: new CANNON.Vec3(-this.tableLength / 4, this.wallHeight / 2, this.tableWidth / 2 + this.wallThickness), size: new CANNON.Vec3(this.tableLength / 4 - this.pocketRadius, this.wallHeight,this.wallThickness) },
    { pos: new CANNON.Vec3(this.tableLength / 4, this.wallHeight / 2, this.tableWidth / 2 + this.wallThickness), size: new CANNON.Vec3(this.tableLength / 4 - this.pocketRadius, this.wallHeight, this.wallThickness) },
    { pos: new CANNON.Vec3(-this.tableLength / 4, this.wallHeight / 2, -this.tableWidth / 2 - this.wallThickness), size: new CANNON.Vec3(this.tableLength / 4 - this.pocketRadius, this.wallHeight, this.wallThickness) },
    { pos: new CANNON.Vec3(this.tableLength / 4, this.wallHeight / 2, -this.tableWidth / 2 - this.wallThickness), size: new CANNON.Vec3(this.tableLength / 4 - this.pocketRadius, this.wallHeight, this.wallThickness) },
    { pos: new CANNON.Vec3(-this.tableLength / 2 - this.wallThickness, this.wallHeight / 2, 0), size: new CANNON.Vec3(this.wallThickness, this.wallHeight, this.tableWidth / 2 - this.pocketRadius * 2) },
    { pos: new CANNON.Vec3(this.tableLength / 2 + this.wallThickness, this.wallHeight / 2, 0), size: new CANNON.Vec3(this.wallThickness, this.wallHeight,this. tableWidth / 2 - this.pocketRadius * 2) },
  ];

  wallSegments.forEach((segment, i) => {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Box(segment.size), material: wallMaterial, position: new CANNON.Vec3(
        this.tablePosition.x + segment.pos.x,
        this.tablePosition.y + segment.pos.y,
        this.tablePosition.z + segment.pos.z
      ), 
    });
    this.walls.push(new WallState(wall.position, segment.size))
    this.room.state.world.addBody(wall);
    this.room.physicsRefs.set(`billiards_wall_${i}`, { body: wall });
  });

  // Balls
  const ballRadius = 0.057;
  const ballDiameter = ballRadius;
  const footSpotX = -this.tableLength / 4;
  const yPos = ballRadius;

  // Cue ball (index 0)
  const cueBall = new CANNON.Body({
    mass: 2,
    shape: new CANNON.Sphere(ballRadius),
    material: ballMaterial,
    linearDamping: 0.2,
    angularDamping: 0.2,
  });
  cueBall.position.set(
    this.tablePosition.x + this.tableLength / 4 + 0.2,
    this.tablePosition.y + yPos,
    this.tablePosition.z
  );
  (cueBall as any).ballId = 0

  this.room.state.world.addBody(cueBall);
  this.balls.push(new BallState(cueBall.position));
  this.room.physicsRefs.set('billiards_ball_0', { body: cueBall });

  // Racked balls (indices 1-15)
  const trianglePositions = [
    { x: footSpotX, z: 0 }, // Ball 1
    { x: footSpotX - ballDiameter - (ballDiameter/5), z: -ballDiameter * 0.8 }, // Ball 2
    { x: footSpotX - ballDiameter - (ballDiameter/5), z: ballDiameter * 0.8 }, // Ball 3
    { x: footSpotX - 2 * ballDiameter, z: -2 * ballRadius * Math.sqrt(3) }, // Ball 4
    { x: footSpotX - 2 * ballDiameter, z: 0 }, // Ball 5
    { x: footSpotX - 2 * ballDiameter, z: 2 * ballRadius * Math.sqrt(3) }, // Ball 6
    { x: footSpotX - 3 * ballDiameter, z: -3 * ballRadius * Math.sqrt(3) }, // Ball 7
    { x: footSpotX - 3 * ballDiameter, z: -ballRadius * Math.sqrt(3) }, // Ball 8 (8-ball)
    { x: footSpotX - 3 * ballDiameter, z: ballRadius * Math.sqrt(3) }, // Ball 9
    { x: footSpotX - 3 * ballDiameter, z: 3 * ballRadius * Math.sqrt(3) }, // Ball 10
    { x: footSpotX - 4 * ballDiameter, z: -4 * ballRadius * Math.sqrt(3) }, // Ball 11
    { x: footSpotX - 4 * ballDiameter, z: -2 * ballRadius * Math.sqrt(3) }, // Ball 12
    { x: footSpotX - 4 * ballDiameter, z: 0 }, // Ball 13
    { x: footSpotX - 4 * ballDiameter, z: 2 * ballRadius * Math.sqrt(3) }, // Ball 14
    { x: footSpotX - 4 * ballDiameter, z: 4 * ballRadius * Math.sqrt(3) }, // Ball 15
  ];

    for (let i = 0; i < 15; i++) {
        const ball = new CANNON.Body({
        mass: 0.17,
        shape: new CANNON.Sphere(ballRadius),
        material: ballMaterial,
        linearDamping: 0.2,
        angularDamping: 0.2,
        });
        ball.position.set(
            this.tablePosition.x + trianglePositions[i].x,
            this.tablePosition.y + yPos,
            this.tablePosition.z + trianglePositions[i].z
          );
        (ball as any).ballId = i + 1
        this.room.state.world.addBody(ball);
        this.balls.push(new BallState(ball.position));
        this.room.physicsRefs.set(`billiards_ball_${i + 1}`, { body: ball });
    }
    }

    clearBilliards(){
        clearInterval(this.shotTimer)
        this.playing = false
        this.team1Mates.clear()
        this.team2Mates.clear()
        this.team1Score = 0
        this.team2Score = 0
        this.shotTimeRemaining = 20
        this.team1Type = ''
        this.team2Type = ''
        this.balls.clear()
    }

    handlePocketCollision(ballIndex: number) {
        const ballState = this.balls[ballIndex];
        if (!ballState.pocketed) {
          ballState.pocketed = true;
          let cannonBall = this.room.physicsRefs.get(`billiards_ball_${ballIndex}`)
          if(cannonBall){
            cannonBall.body.velocity.set(0,0,0)
            cannonBall.body.position.set(0, -1, 0);
            
            let ballState = this.balls[ballIndex]
            ballState.px = cannonBall.body.position.x
            ballState.py = cannonBall.body.position.y
            ballState.pz = cannonBall.body.position.z

          }
          console.log(`Ball ${ballIndex} pocketed!`);
    
          if (ballIndex === 0) {
            this.handleScratch();
          } else if (ballIndex === 8) {
            this.handle8BallPocketed();
          } else {
            if (this.team1Type === '' && this.team2Type === '') {
              if (ballIndex <= 7) {
                this.team1Type = this.isTeam1Turn ? 'solids' : 'stripes';
                this.team2Type = this.isTeam1Turn ? 'stripes' : 'solids';
              } else {
                this.team1Type = this.isTeam1Turn ? 'stripes' : 'solids';
                this.team2Type = this.isTeam1Turn ? 'solids' : 'stripes';
              }
            }
            this.scoreBall(ballIndex);
          }
        }
      }

      handleScratch() {
        this.scratched = true;
        console.log('Scratch detected! Cue ball pocketed.');
        this.switchTurn();
    
        const cueBall = this.room.physicsRefs.get(`billiards_ball_${0}`)
        if(cueBall){
            const ballState = this.balls[0]
            cueBall.body.position.set(-this.tableLength / 4, 0.057, 0);
            cueBall.body.velocity.set(0, 0, 0);
            ballState.pocketed = false;
            ballState.px = cueBall.body.position.x;
            ballState.py = cueBall.body.position.y;
            ballState.pz = cueBall.body.position.z;
            ballState.vx = 0;
            ballState.vy = 0;
            ballState.vz = 0;
        }
    
        setTimeout(() => {
          this.scratched = false;
        }, 1000);
      }
    
      scoreBall(ballIndex: number) {
        const isSolid = ballIndex <= 7;
        const currentTeamType = this.isTeam1Turn ? this.team1Type : this.team2Type;
        const scoredOwnType = (isSolid && currentTeamType === 'solids') || (!isSolid && currentTeamType === 'stripes');
    
        if (scoredOwnType) {
          if (this.isTeam1Turn) this.team1Score += 1;
          else this.team2Score += 1;
        } else {
          this.switchTurn();
        }
      }
    
      handle8BallPocketed() {
        const currentTeamType = this.isTeam1Turn ? this.team1Type : this.team2Type;
        const teamScore = this.isTeam1Turn ? this.team1Score : this.team2Score;
        const allBallsPocketed = teamScore === 7;
    
        if (allBallsPocketed) {
          this.gameOver = true;
          this.winner = this.isTeam1Turn ? 'team1' : 'team2';
          console.log(`${this.winner} wins by pocketing the 8-ball!`);
        } else {
          this.gameOver = true;
          this.winner = this.isTeam1Turn ? 'team2' : 'team1';
          console.log(`${this.winner} wins due to early 8-ball pocket!`);
        }
        if (this.shotTimer) clearInterval(this.shotTimer);
      }

      startShotTimer(client: Client) {
        if (this.shotTimer) clearInterval(this.shotTimer);
        this.shotTimeRemaining = 20;
    
        this.shotTimer = setInterval(() => {
          this.shotTimeRemaining -= 1;
          if (this.shotTimeRemaining <= 0) {
            clearInterval(this.shotTimer);
            this.switchTurn();
            console.log('Shot timer expired, switching turn');
          }
        }, 1000);
      }
    
      switchTurn() {
        if (!this.gameOver) {
          this.isTeam1Turn = !this.isTeam1Turn;
          this.startShotTimer(null);
        }
      }
    
      handleShot(client: Client, message: { force: number; angleX: number; angleZ: number }) {
        if (!this.gameOver && !this.balls[0].pocketed && 
            (this.isTeam1Turn === this.team1Mates.includes(client.userData.userId))) {
          const forceVector = new CANNON.Vec3(
            message.force * Math.cos(message.angleX),
            0,
            message.force * Math.sin(message.angleZ)
          );
          let cueB = this.room.physicsRefs.get(`billiards_ball_${0}`)
          if(cueB){
            cueB.body.applyImpulse(forceVector, cueB.body.position);
          }

          clearInterval(this.shotTimer);
        } else {
          console.log('Not your turn, cue ball pocketed, or game over!');
        }
      }

      handlePlayerLeft(client:Client){
        let team1Index = this.team1Mates.findIndex(value => value === client.userData.userId)
        if(team1Index >=0){
            this.team1Mates.splice(team1Index,1)
        }

        let team2Index = this.team2Mates.findIndex(value => value === client.userData.userId)
        if(team2Index >=0){
            this.team1Mates.splice(team2Index,1)
        }

        if(this.team1Mates.length === 0 || this.team2Mates.length === 0){
            console.log('one team has no more players, force end game')
            //todo
        }
      }

       // Test method to apply a head-on impulse to the cue ball
  testCueBallImpulse() {
    const cueBall = this.room.physicsRefs.get('billiards_ball_0');
    if (cueBall && !this.balls[0].pocketed) {
        // for (let i = 1; i <= 15; i++) {
        //     const ballRef = this.room.physicsRefs.get(`billiards_ball_${i}`);
        //     const ball = ballRef.body;
            
        //     // Store current position and quaternion
        //     const position = ball.position.clone();
        //     const quaternion = ball.quaternion.clone();
            
        //     // Remove from world
        //     this.room.state.world.removeBody(ball);
            
        //     // Create new dynamic body
        //     const newBall = new CANNON.Body({
        //       mass: 0.17, // Now dynamic
        //       shape: new CANNON.Sphere(0.057),
        //       material: ball.material,
        //       linearDamping: 0.2,
        //       angularDamping: 0.2,
        //     });
        //     newBall.position.copy(position);
        //     newBall.quaternion.copy(quaternion);
        //     newBall.velocity.set(0, 0, 0);
        //     newBall.angularVelocity.set(0, 0, 0);
        //     (newBall as any).ballId = i;
            
        //     // Add back to world and update reference
        //     this.room.state.world.addBody(newBall);
        //     ballRef.body = newBall;
        //   }
      const force = -0.5; // Adjust force magnitude as needed (e.g., 5-10 for a strong break)
      const impulse = new CANNON.Vec3(force, 0, 0); // Head-on along +x toward the rack
      cueBall.body.applyImpulse(impulse, cueBall.body.position);
      console.log('Applied head-on impulse to cue ball!');
    } else {
      console.log('Cue ball not found or pocketed!');
    }
  }
    
}


export function updateBilliardsObjects(room:BlitzRoom, dt:number){
    const now = Date.now();

    room.state.billiards.forEach((billiards:BilliardsState)=>{
        billiards.balls.forEach((ballState:BallState, index:number) => {
            if (!ballState.pocketed) {

              const ball = room.physicsRefs.get(`billiards_ball_${index}`)
              if(ball){
                if(index === 0){
                    // console.log(ball.body.position)
                }
                ballState.px = ball.body.position.x;
                ballState.py = ball.body.position.y;
                ballState.pz = ball.body.position.z;

                ballState.rx = ball.body.quaternion.x;
                ballState.ry = ball.body.quaternion.y;
                ballState.rz = ball.body.quaternion.z;
                ballState.rw = ball.body.quaternion.w;

                ballState.vx = ball.body.velocity.x;
                ballState.vy = ball.body.velocity.y;
                ballState.vz = ball.body.velocity.z;
              }
              }
          });
    })
  }

  export function handleBilliardsMessage(room:BlitzRoom, client:Client, info:any){
    if(!info.action) return;

    let player = room.state.players.get(client.userData.userId)
    if(!player)  return;

    let billiards = room.state.billiards.get(billiardsSlug)
    if(!billiards)  return;

    switch(info.action){
        case 'shoot':
            break;

        case 'test':
            billiards.testCueBallImpulse()
            break;
    }

  }