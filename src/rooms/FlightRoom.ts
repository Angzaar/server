// server.ts
import express from "express";
import http from "http";
import { Server } from "colyseus";
import { Room, Client } from "colyseus";
import { Schema, type, MapSchema } from "@colyseus/schema";
import Ammo from "ammojs-typed"; // or another Ammo.js build

/* ======================================
   PLAYER & STATE (with decorators)
====================================== */
class PlayerState extends Schema {
  @type("number") px: number = 25;
  @type("number") py: number = 25;
  @type("number") pz: number = 25;

  // Quaternion rotation (w, x, y, z)
  @type("number") rw: number = 1;
  @type("number") rx: number = 0;
  @type("number") ry: number = 0;
  @type("number") rz: number = 0;
  pitch:number = 0
  throttle:number = 0


  entity:any
}

class FlightState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

/* ======================================
   FLIGHT ROOM (Ammo.js + Colyseus)
====================================== */
export class FlightRoom extends Room<FlightState> {
  // Ammo “classic” bullet objects
  private collisionConfiguration!: Ammo.btDefaultCollisionConfiguration;
  private dispatcher!: Ammo.btCollisionDispatcher;
  private broadphase!: Ammo.btDbvtBroadphase;
  private solver!: Ammo.btSequentialImpulseConstraintSolver;
  private physicsWorld!: Ammo.btDiscreteDynamicsWorld;
  private AmmoLib!: any; // store the reference
  private groundShape:any

  // Track each player's rigid body
  private playerBodies: { [sessionId: string]: Ammo.btRigidBody } = {};

  // Called when room is initialized
  public async onCreate(options: any) {
    console.log("Creating FlightRoom...");
        // Prepare state
        this.setState(new FlightState());

    // Ammo.js is async. We must wait for it to finish loading the WASM module, etc.
    this.AmmoLib = await Ammo();

    // Initialize the bullet/Ammo world
    this.collisionConfiguration = new  this.AmmoLib.btDefaultCollisionConfiguration();
    this.dispatcher = new  this.AmmoLib.btCollisionDispatcher(this.collisionConfiguration);
    this.broadphase = new  this.AmmoLib.btDbvtBroadphase();
    this.solver = new  this.AmmoLib.btSequentialImpulseConstraintSolver();
    this.physicsWorld = new  this.AmmoLib.btDiscreteDynamicsWorld(
      this.dispatcher,
      this.broadphase,
      this.solver,
      this.collisionConfiguration
    );
    // Gravity
    this.physicsWorld.setGravity(new  this.AmmoLib.btVector3(0, -9.81, 0));

        // 1) Create ground shape
    const groundShape = new this.AmmoLib.btBoxShape(new this.AmmoLib.btVector3(100, 0.5, 100));

    // 2) Create transform at Y=0
    const groundTransform = new this.AmmoLib.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new this.AmmoLib.btVector3(0, 0, 0));

    // 3) A motion state for the ground
    const groundMotionState = new this.AmmoLib.btDefaultMotionState(groundTransform);

    // 4) RigidBodyConstructionInfo: mass=0 => static
    const rbInfo = new this.AmmoLib.btRigidBodyConstructionInfo(
    0, 
    groundMotionState,
    groundShape, 
    new this.AmmoLib.btVector3(0, 0, 0) // no inertia for static body
    );

    const groundBody = new this.AmmoLib.btRigidBody(rbInfo);
    this.physicsWorld.addRigidBody(groundBody);

    // (Optional) cleanup
    this.AmmoLib.destroy(groundTransform);
    this.AmmoLib.destroy(groundMotionState);
    this.AmmoLib.destroy(rbInfo);

    // Configure server simulation loop
    // (20ms => ~50 ticks/sec. Adjust as desired.)
    this.setSimulationInterval((deltaTime) => this.updatePhysics( this.AmmoLib, deltaTime));

    // Listen for input messages
    this.onMessage("flight-sim", (client, data) => {
        if (data.action !== "input") return;
      
        const { throttle, pitch, direction } = data;
        const body = this.playerBodies[client.sessionId];
        const player = this.state.players.get(client.sessionId);
        if (!body || !player) return;
      
        const motionState = body.getMotionState();
        if (!motionState) return;
      
        player.pitch = pitch;
      
        const transform = new this.AmmoLib.btTransform();
        motionState.getWorldTransform(transform);
        const rotation = transform.getRotation();
      
        const forwardLocal = new this.AmmoLib.btVector3(0, 0, 1);
        const rightLocal = new this.AmmoLib.btVector3(1, 0, 0);
        const upLocal = new this.AmmoLib.btVector3(0, 1, 0);
      
        const forwardWorld = this.transformVecByQuat(forwardLocal, rotation);
        const rightWorld = this.transformVecByQuat(rightLocal, rotation);
        const upWorld = this.transformVecByQuat(upLocal, rotation);
      
        const pitchTorque = 0.5;
        const bankTorque = 0.5;
        const yawTorque = 0.5; // Increased slightly to ensure turning
        const maxAngVel = 2.0;
        const minPitchDeg = -45;
        const maxPitchDeg = 45;
        const minRollDeg = -60;
        const maxRollDeg = 60;
      
        const throttleStep = 0.1;
        if (throttle === 1) {
          player.throttle = Math.min(5, player.throttle + throttleStep);
        } else if (throttle === -1) {
          player.throttle = Math.max(0, player.throttle - throttleStep);
        }
      
        const pitchAngle = this.getPitchAngle(this.AmmoLib, rotation);
        const rollAngle = this.getRollAngle(this.AmmoLib, rotation);
      
        let canPitchUp = pitchAngle < maxPitchDeg;
        let canPitchDown = pitchAngle > minPitchDeg;
        let canRollRight = rollAngle < maxRollDeg;
        let canRollLeft = rollAngle > minRollDeg;
      
        const angVel = body.getAngularVelocity();
        let newX = angVel.x();
        let newY = angVel.y();
        let newZ = angVel.z();
      
        if (pitch === -1 && canPitchDown) {
          newX += rightWorld.x() * pitchTorque;
          newY += rightWorld.y() * pitchTorque;
          newZ += rightWorld.z() * pitchTorque;
        } else if (pitch === 1 && canPitchUp) {
          newX -= rightWorld.x() * pitchTorque;
          newY -= rightWorld.y() * pitchTorque;
          newZ -= rightWorld.z() * pitchTorque;
        }
      
        if (direction === -1 && canRollLeft) {
          newX += forwardWorld.x() * bankTorque;
          newY += forwardWorld.y() * bankTorque;
          newZ += forwardWorld.z() * bankTorque;
          newX -= upWorld.x() * yawTorque;
          newY -= upWorld.y() * yawTorque;
          newZ -= upWorld.z() * yawTorque;
        } else if (direction === 1 && canRollRight) {
          newX -= forwardWorld.x() * bankTorque;
          newY -= forwardWorld.y() * bankTorque;
          newZ -= forwardWorld.z() * bankTorque;
          newX += upWorld.x() * yawTorque;
          newY += upWorld.y() * yawTorque;
          newZ += upWorld.z() * yawTorque;
        }
      
        // Cap angular velocity
        const mag = Math.sqrt(newX * newX + newY * newY + newZ * newZ);
        if (mag > maxAngVel) {
          const scale = maxAngVel / mag;
          newX *= scale;
          newY *= scale;
          newZ *= scale;
        }
      
        // console.log(`Before Set - YawTorque: ${upWorld.x() * yawTorque}, ${upWorld.y() * yawTorque}, ${upWorld.z() * yawTorque}`);
        // console.log(`Pre-Set AngVel: ${newX.toFixed(2)}, ${newY.toFixed(2)}, ${newZ.toFixed(2)}`);
        angVel.setValue(newX, newY, newZ);
        body.setAngularVelocity(angVel);
        // console.log(`After Set - AngVel: ${newX.toFixed(2)}, ${newY.toFixed(2)}, ${newZ.toFixed(2)}`);
      
        this.clampPitch(body, minPitchDeg, maxPitchDeg);
        this.clampRoll(body, minRollDeg, maxRollDeg);
      
        // Log post-clamp
        const postClampAngVel = body.getAngularVelocity();
        console.log(`Post-Clamp AngVel: ${postClampAngVel.x().toFixed(2)}, ${postClampAngVel.y().toFixed(2)}, ${postClampAngVel.z().toFixed(2)}`);
      
        this.AmmoLib.destroy(angVel);
        this.AmmoLib.destroy(transform);
        this.AmmoLib.destroy(rotation);
        this.AmmoLib.destroy(forwardLocal);
        this.AmmoLib.destroy(rightLocal);
        this.AmmoLib.destroy(upLocal);
        this.AmmoLib.destroy(forwardWorld);
        this.AmmoLib.destroy(rightWorld);
        this.AmmoLib.destroy(upWorld);
      });
  }


// ------------------------------------------------------------------------
// HELPER FUNCTION to measure pitch relative to the horizontal plane
// (You can refine or replace with a direct axis-based approach.)
// ------------------------------------------------------------------------
getPitchAngle(AmmoLib: any, rotation: any): number {
    // local forward
    const forwardLocal = new AmmoLib.btVector3(0, 0, -1);
    const forwardWorld = this.transformVecByQuat(forwardLocal, rotation);
  
    // We'll create a horizontal-forward reference by zeroing out the y-component
    const horizontalForward = new AmmoLib.btVector3(forwardWorld.x(), 0, forwardWorld.z());
    const lenHF = horizontalForward.length();
  
    let angleDeg = 0;
  
    // If length is big enough to avoid dividing by zero
    if (lenHF > 0.0001) {
      // normalize
      horizontalForward.normalize();
  
      // dot product => cos(theta)
      // but we only removed y from horizontalForward, so it's approximate
      const dot = forwardWorld.x() * horizontalForward.x() +
                  forwardWorld.y() * horizontalForward.y() +
                  forwardWorld.z() * horizontalForward.z();
      const cosTheta = Math.min(Math.max(dot, -1), 1);
      const theta = Math.acos(cosTheta); // in radians
  
      // plane pitched up => forwardWorld.y() > 0 => angle is positive
      // pitched down => angle is negative
      angleDeg = (theta * 180) / Math.PI;
      if (forwardWorld.y() < 0) {
        angleDeg = -angleDeg;
      }
    }
  
    AmmoLib.destroy(forwardLocal);
    AmmoLib.destroy(forwardWorld);
    AmmoLib.destroy(horizontalForward);
  
    return angleDeg;
  }

  // Called when a client joins
  public onJoin(client: Client) {
    console.log(`Client joined: ${client.sessionId}`);

    // Create a new player
    const player = new PlayerState();
    this.state.players.set(client.sessionId, player)

    // Create a body for the player in Ammo
    // Example: a small sphere
    const A =  this.AmmoLib;
      const mass = 1;
      const shape = new A.btBoxShape(new A.btVector3(1, 0.5, 2)); // an approximate “plane” shape
      const localInertia = new A.btVector3(0, 0, 0);
      shape.calculateLocalInertia(mass, localInertia);

      const startTransform = new A.btTransform();
      startTransform.setIdentity();
      // Start above ground
      startTransform.setOrigin(new A.btVector3(25, 0, 25));

      const motionState = new A.btDefaultMotionState(startTransform);
      const rbInfo = new A.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
      const body = new A.btRigidBody(rbInfo);

      // Optional: Dampening
      body.setDamping(0.1, 0.2);

      // ********************
      // *** CCD Settings ***
      // ********************
      // Use smaller threshold if objects are small / move quickly
    //   body.setCcdMotionThreshold(0.01);
      // The radius of the bounding sphere for swept collision
    //   body.setCcdSweptSphereRadius(0.5);

      // Add the body to the world
      this.physicsWorld.addRigidBody(body);

      // Store reference
      this.playerBodies[client.sessionId] = body;

      // Clean up temporary Ammo objects
      A.destroy(localInertia);
      A.destroy(startTransform);
      A.destroy(rbInfo);
  }

  // Called when a client leaves
  public onLeave(client: Client) {
    console.log(`Client left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId)

    const body = this.playerBodies[client.sessionId];
    if (body) {
      // Remove from physics world
      this.physicsWorld.removeRigidBody(body);
      // In Ammo, you also want to manually destroy
      this.AmmoLib.destroy(body.getMotionState());
      this.AmmoLib.destroy(body);
    }
    delete this.playerBodies[client.sessionId];
  }

  private updatePhysics(AmmoLib: any, deltaTime: number) {
    const dt = deltaTime / 1000;
    this.physicsWorld.stepSimulation(dt, 10);
  
    for (const sessionId in this.playerBodies) {
      const body = this.playerBodies[sessionId];
      const player = this.state.players.get(sessionId);
      if (!body || !player) continue;
  
      const motionState = body.getMotionState();
      if (!motionState) continue;
      const transform = new AmmoLib.btTransform();
      motionState.getWorldTransform(transform);
  
      const origin = transform.getOrigin();
      player.px = origin.x();
      player.py = origin.y();
      player.pz = origin.z();
  
      const rotation = transform.getRotation();
      player.rw = rotation.w();
      player.rx = rotation.x();
      player.ry = rotation.y();
      player.rz = rotation.z();
  
      const velocity = body.getLinearVelocity();
      const forwardLocal = new this.AmmoLib.btVector3(0, 0, 1);
      const forwardWorld = this.transformVecByQuat(forwardLocal, rotation);
      const rightLocal = new this.AmmoLib.btVector3(1, 0, 0);
      const rightWorld = this.transformVecByQuat(rightLocal, rotation);
      const upLocal = new this.AmmoLib.btVector3(0, 1, 0);
      const upWorld = this.transformVecByQuat(upLocal, rotation);
  
      const throttleForce = 5;
      if (player.throttle > 0) {
        const rollAngle = this.getRollAngle(this.AmmoLib, rotation);
        const speed = velocity.length();
        const yawFactor = Math.sin((rollAngle * Math.PI) / 180) * Math.min(speed * 0.1, 1.0);
        const thrustVector = new this.AmmoLib.btVector3(
          forwardWorld.x() + rightWorld.x() * yawFactor,
          forwardWorld.y() + rightWorld.y() * yawFactor,
          forwardWorld.z() + rightWorld.z() * yawFactor
        );
        thrustVector.normalize();
        body.applyCentralForce(
          new this.AmmoLib.btVector3(
            thrustVector.x() * throttleForce * player.throttle,
            thrustVector.y() * throttleForce * player.throttle,
            thrustVector.z() * throttleForce * player.throttle
          )
        );
        this.AmmoLib.destroy(thrustVector);
      }
  
      const forwardSpeed =
        velocity.x() * forwardWorld.x() +
        velocity.y() * forwardWorld.y() +
        velocity.z() * forwardWorld.z();
      const pitchValue = player.pitch || 0;
      if (pitchValue > 0 && forwardSpeed > 1) {
        const liftCoefficient = 0.2;
        const localUp = new this.AmmoLib.btVector3(0, 1, 0);
        const upWorld = this.transformVecByQuat(localUp, rotation);
        const liftForce = forwardSpeed * pitchValue * liftCoefficient;
        body.applyCentralForce(
          new this.AmmoLib.btVector3(
            upWorld.x() * liftForce,
            upWorld.y() * liftForce,
            upWorld.z() * liftForce
          )
        );
        this.AmmoLib.destroy(localUp);
        this.AmmoLib.destroy(upWorld);
      }
  
      const angVel = body.getAngularVelocity();
      const yawVel = angVel.dot(upWorld);
      const rollVel = angVel.dot(forwardWorld);
      const pitchVel = angVel.dot(rightWorld);
      const damping = 0.95; // Lighter damping
      console.log(`Before Damp - YawVel: ${yawVel.toFixed(2)}, RollVel: ${rollVel.toFixed(2)}, PitchVel: ${pitchVel.toFixed(2)}`);
      angVel.setValue(
        angVel.x() - (upWorld.x() * yawVel + forwardWorld.x() * rollVel + rightWorld.x() * pitchVel) * (1 - damping),
        angVel.y() - (upWorld.y() * yawVel + forwardWorld.y() * rollVel + rightWorld.y() * pitchVel) * (1 - damping),
        angVel.z() - (upWorld.z() * yawVel + forwardWorld.z() * rollVel + rightWorld.z() * pitchVel) * (1 - damping)
      );
      body.setAngularVelocity(angVel);
  
      console.log(`Roll: ${this.getRollAngle(AmmoLib, rotation).toFixed(2)}, Yaw: ${this.getYawAngle(AmmoLib, rotation).toFixed(2)}, YawVel: ${yawVel.toFixed(2)}, Pos: ${player.px.toFixed(2)}, ${player.pz.toFixed(2)}`);
  
      this.AmmoLib.destroy(angVel);
      this.AmmoLib.destroy(velocity);
      this.AmmoLib.destroy(transform);
      this.AmmoLib.destroy(rotation);
      this.AmmoLib.destroy(origin);
      AmmoLib.destroy(forwardLocal);
      AmmoLib.destroy(rightLocal);
      AmmoLib.destroy(rightWorld);
      AmmoLib.destroy(upLocal);
      AmmoLib.destroy(upWorld);
    }
  }

    // We’ll define local directions (forward, up) and transform them
    // by the body’s orientation for yaw/roll
    transformVecByQuat = (v: Ammo.btVector3, q: Ammo.btQuaternion) => {
    // We'll manually rotate v by q => q * v * q^-1
    // or we can build a transform matrix. 
    // For simplicity, let's do the manual quaternion transform:

    const x = q.x(), y = q.y(), z = q.z(), w = q.w();
    const vx = v.x(), vy = v.y(), vz = v.z();

    // q * v
    const ix = w * vx + y * vz - z * vy;
    const iy = w * vy + z * vx - x * vz;
    const iz = w * vz + x * vy - y * vx;
    const iw = -x * vx - y * vy - z * vz;

    // (q*v) * q^-1
    const fx = ix * w - iw * x - iy * z + iz * y;
    const fy = iy * w - iw * y - iz * x + ix * z;
    const fz = iz * w - iw * z - ix * y + iy * x;

    return new this.AmmoLib.btVector3(fx, fy, fz);
    };

    clampPitch(body: Ammo.btRigidBody, minPitchDeg: number, maxPitchDeg: number) {
        const motionState = body.getMotionState();
        if (!motionState) return;
      
        const transform = new this.AmmoLib.btTransform();
        motionState.getWorldTransform(transform);
        const rotation = transform.getRotation();
      
        const pitchAngle = this.getPitchAngle(this.AmmoLib, rotation);
      
        if (pitchAngle > maxPitchDeg || pitchAngle < minPitchDeg) {
          const q = new this.AmmoLib.btQuaternion(rotation.x(), rotation.y(), rotation.z(), rotation.w());
          const rightLocal = new this.AmmoLib.btVector3(1, 0, 0);
          const forwardLocal = new this.AmmoLib.btVector3(0, 0, 1);
          const upLocal = new this.AmmoLib.btVector3(0, 1, 0);
      
          const rightWorld = this.transformVecByQuat(rightLocal, q);
      
          const clampedPitchRad = Math.max(
            (minPitchDeg * Math.PI) / 180,
            Math.min((maxPitchDeg * Math.PI) / 180, (pitchAngle * Math.PI) / 180)
          );
      
          const clampedQuat = new this.AmmoLib.btQuaternion();
          clampedQuat.setRotation(rightWorld, clampedPitchRad);
      
          transform.setRotation(clampedQuat);
          motionState.setWorldTransform(transform);
      
          // Only damp if at limit
          const angVel = body.getAngularVelocity();
          const pitchVel = angVel.dot(rightWorld);
          if ((pitchAngle >= maxPitchDeg && pitchVel > 0) || (pitchAngle <= minPitchDeg && pitchVel < 0)) {
            angVel.op_sub(rightWorld.op_mul(pitchVel));
            body.setAngularVelocity(angVel);
            console.log(`Pitch Clamped - AngVel Adjusted: ${angVel.x().toFixed(2)}, ${angVel.y().toFixed(2)}, ${angVel.z().toFixed(2)}`);
          }
      
          this.AmmoLib.destroy(angVel);
          this.AmmoLib.destroy(rightWorld);
          this.AmmoLib.destroy(clampedQuat);
          this.AmmoLib.destroy(rightLocal);
          this.AmmoLib.destroy(forwardLocal);
          this.AmmoLib.destroy(upLocal);
        }
      
        this.AmmoLib.destroy(transform);
        this.AmmoLib.destroy(rotation);
      }

      getRollAngle(AmmoLib: any, rotation: any): number {
        // Local right vector (pitch axis, typically x-axis for a plane)
        const rightLocal = new AmmoLib.btVector3(1, 0, 0);
        const rightWorld = this.transformVecByQuat(rightLocal, rotation);
      
        // Project onto the horizontal plane (zero out y-component)
        const horizontalRight = new AmmoLib.btVector3(rightWorld.x(), 0, rightWorld.z());
        const lenHR = horizontalRight.length();
      
        let angleDeg = 0;
      
        if (lenHR > 0.0001) {
          horizontalRight.normalize();
          const dot = rightWorld.x() * horizontalRight.x() +
                      rightWorld.z() * horizontalRight.z(); // Ignore y for horizontal
          const cosTheta = Math.min(Math.max(dot, -1), 1);
          const theta = Math.acos(cosTheta); // in radians
      
          // Roll direction: if rightWorld.y() < 0, plane is rolled right (positive roll)
          angleDeg = (theta * 180) / Math.PI;
          if (rightWorld.y() < 0) {
            angleDeg = -angleDeg; // Right roll is positive, left roll is negative
          }
        }
      
        AmmoLib.destroy(rightLocal);
        AmmoLib.destroy(rightWorld);
        AmmoLib.destroy(horizontalRight);
      
        return angleDeg;
      }

      clampRoll(body: Ammo.btRigidBody, minRollDeg: number, maxRollDeg: number) {
        const motionState = body.getMotionState();
        if (!motionState) return;
      
        const transform = new this.AmmoLib.btTransform();
        motionState.getWorldTransform(transform);
        const rotation = transform.getRotation();
      
        const rollAngle = this.getRollAngle(this.AmmoLib, rotation);
      
        if (rollAngle > maxRollDeg || rollAngle < minRollDeg) {
          const q = new this.AmmoLib.btQuaternion(rotation.x(), rotation.y(), rotation.z(), rotation.w());
          const forwardLocal = new this.AmmoLib.btVector3(0, 0, 1);
          const forwardWorld = this.transformVecByQuat(forwardLocal, q);
      
          const clampedRollRad = Math.max(
            (minRollDeg * Math.PI) / 180,
            Math.min((maxRollDeg * Math.PI) / 180, (rollAngle * Math.PI) / 180)
          );
      
          const clampedQuat = new this.AmmoLib.btQuaternion();
          clampedQuat.setRotation(forwardWorld, clampedRollRad);
      
          transform.setRotation(clampedQuat);
          motionState.setWorldTransform(transform);
      
          // Only damp if at limit
          const angVel = body.getAngularVelocity();
          const rollVel = angVel.dot(forwardWorld);
          if ((rollAngle >= maxRollDeg && rollVel > 0) || (rollAngle <= minRollDeg && rollVel < 0)) {
            angVel.op_sub(forwardWorld.op_mul(rollVel));
            body.setAngularVelocity(angVel);
            console.log(`Roll Clamped - AngVel Adjusted: ${angVel.x().toFixed(2)}, ${angVel.y().toFixed(2)}, ${angVel.z().toFixed(2)}`);
          }
      
          this.AmmoLib.destroy(angVel);
          this.AmmoLib.destroy(forwardWorld);
          this.AmmoLib.destroy(clampedQuat);
          this.AmmoLib.destroy(forwardLocal);
        }
      
        this.AmmoLib.destroy(transform);
        this.AmmoLib.destroy(rotation);
      }

      getYawAngle(AmmoLib: any, rotation: any): number {
        const forwardLocal = new AmmoLib.btVector3(0, 0, 1);
        const forwardWorld = this.transformVecByQuat(forwardLocal, rotation);
        const horizontalForward = new AmmoLib.btVector3(forwardWorld.x(), 0, forwardWorld.z());
        const lenHF = horizontalForward.length();
      
        let angleDeg = 0;
        if (lenHF > 0.0001) {
          horizontalForward.normalize();
          const dot = forwardWorld.x() * horizontalForward.x() + forwardWorld.z() * horizontalForward.z();
          const cosTheta = Math.min(Math.max(dot, -1), 1);
          angleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
          const crossY = forwardWorld.x() * horizontalForward.z() - forwardWorld.z() * horizontalForward.x();
          if (crossY < 0) angleDeg = -angleDeg; // Yaw direction
        }
      
        AmmoLib.destroy(forwardLocal);
        AmmoLib.destroy(forwardWorld);
        AmmoLib.destroy(horizontalForward);
        return angleDeg;
      }
}

