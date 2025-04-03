import express from 'express'
import { Server, Room, generateId } from 'colyseus'
import { Schema, ArraySchema, type } from '@colyseus/schema'
import * as CANNON from 'cannon-es'

// Define Trail schema
class Trail extends Schema {
    @type('number') x: number = 0
    @type('number') z: number = 0
    @type('string') userId: string = ''
    @type('number') dx: number = 0
    @type('number') dz: number = 0
    @type('number') timestamp: number = 0
    entity:any
}

// Define Cycle schema
class Cycle extends Schema {
    id:string = ""
    @type('number') x: number = 0
    @type('number') y: number = 0
    @type('number') z: number = 0
    @type('number') vx: number = 0
    @type('number') vz: number = 0
    @type('number') facing: number = 0

    entity:any
}

// Define Room state
class TronState extends Schema {
    @type({ map: Cycle }) cycles = new Map<string, Cycle>()
    @type([Trail]) trails:ArraySchema = new ArraySchema<Trail>()

    simulationInterval:any
}

export class TronRoom extends Room<TronState> {
    maxClients = 8
    startingPoints: { x: number; z: number; facing: number }[] = [
        // { x: -230, z: -230, facing: 0 },
        // { x: -230, z: 230, facing: 0 },
        // { x: 230, z: -230, facing: Math.PI },
        // { x: 230, z: 230, facing: Math.PI },
        // { x: -230, z: 0, facing: 0 },
        // { x: 230, z: 0, facing: Math.PI },
        // { x: 0, z: -230, facing: Math.PI / 2 },
        // { x: 0, z: 230, facing: -Math.PI / 2 }
        { x: 5, z: 5, facing: 0 },
    ]
    private world!: CANNON.World | undefined
    private trailBodies: { trail: Trail; body: CANNON.Body }[] = []
    private usedStartingPoints = new Set<number>()
    private cycleBodies: { [key: string]: CANNON.Body } = {}
    

    onCreate(options: any): void {
        this.world = new CANNON.World()
        this.world.gravity.set(0, 0, 0)
        const groundBody = new CANNON.Body({ mass: 0 })
        groundBody.addShape(new CANNON.Box(new CANNON.Vec3(248, 0.05, 248)))
        groundBody.position.set(0, 0, 0)
        this.world.addBody(groundBody)
        const lobbyBody = new CANNON.Body({ mass: 0 })
        lobbyBody.addShape(new CANNON.Box(new CANNON.Vec3(16, 1, 16)))
        lobbyBody.position.set(0, 0.5, 0)
        this.world.addBody(lobbyBody)

        this.setState(new TronState())
        this.state.simulationInterval = setInterval(()=>{this.updatePhysics(10 / 1000)}, 10)

        this.onMessage('tron', (client: { sessionId: string }, message: { action: string; direction: string }) =>{
            const cycle = this.state.cycles.get(client.sessionId)
            if (!cycle) return
            if (message.action === 'move') {
                console.log(`Move for ${client.sessionId}: ${message.direction}, current facing: ${cycle.facing}`)
                const speed = 15 // Constant speed
                if (message.direction === 'forward') {
                    // Move forward in current direction
                    // cycle.vx = speed * Math.cos(cycle.facing)
                    cycle.vz = speed * Math.sin(cycle.facing)
                }
                if (message.direction === 'back') {
                    // Move backward in current direction (optional: could stop instead)
                    cycle.vx = -speed * Math.cos(cycle.facing)
                    cycle.vz = -speed * Math.sin(cycle.facing)
                }
                if (message.direction === 'left') {
                    // Turn left 90 degrees
                    cycle.facing = (cycle.facing + Math.PI / 2) % (2 * Math.PI)
                    cycle.vx = speed * Math.cos(cycle.facing)
                    cycle.vz = speed * Math.sin(cycle.facing)
                }
                if (message.direction === 'right') {
                    // Turn right 90 degrees
                    cycle.facing = (cycle.facing - Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
                    cycle.vx = speed * Math.cos(cycle.facing)
                    cycle.vz = speed * Math.sin(cycle.facing)
                }
                console.log(`Cycle ${client.sessionId} updated: vx=${cycle.vx}, vz=${cycle.vz}, facing=${cycle.facing}`)
            }
            console.log(cycle.facing)
        })
    }

    onJoin(client: { sessionId: string }): void {
        console.log('joined cycles')
        let startPointIndex = this.usedStartingPoints.size % 8
        for (let i = 0; i < 8; i++) {
            const index = (startPointIndex + i) % 8
            if (!this.usedStartingPoints.has(index)) {
                startPointIndex = index
                break
            }
        }
        this.usedStartingPoints.add(startPointIndex)
        const start = this.startingPoints[startPointIndex]
        const cycleBody = new CANNON.Body({ mass: 1 })
        cycleBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 1, 2)))
        cycleBody.position.set(start.x, 0.5, start.z)
        cycleBody.linearDamping = 0 // Disable damping
        cycleBody.angularDamping = 0 // No rotational slowdown
        
        this.world.addBody(cycleBody)
        const cycle = new Cycle()
        cycle.id = client.sessionId
        cycle.x = start.x
        cycle.z = start.z
        cycle.vx = 0
        cycle.vz = 15
        cycle.facing = start.facing
        this.state.cycles.set(cycle.id, cycle)
        this.cycleBodies[cycle.id] = cycleBody

            // Add initial trail
    const initialTrail = new Trail()
    initialTrail.x = start.x
    initialTrail.z = start.z
    initialTrail.userId = client.sessionId
    initialTrail.dx = 0
    initialTrail.dz = 0
    initialTrail.timestamp = Date.now()
    this.state.trails.push(initialTrail)
    const trailBody = new CANNON.Body({ mass: 0 })
    trailBody.addShape(new CANNON.Box(new CANNON.Vec3(0.05, 0.25, 0.05)))
    trailBody.position.set(start.x, 0.25, start.z)
    this.world.addBody(trailBody)
    this.trailBodies.push({ trail: initialTrail, body: trailBody })
    }

    updatePhysics(dt: number): void {
        this.world.step(dt)
        const currentTime = Date.now()
        for (const [id, cycle] of this.state.cycles) {
            const body = this.cycleBodies[id]
            body.velocity.set(cycle.vx, 0, cycle.vz)

            cycle.x = body.position.x
            cycle.y = 0.5
            cycle.z = body.position.z

            const lastTrail = this.state.trails.filter(t => t.userId === id).slice(-1)[0] || { x: cycle.x, z: cycle.z }
            // console.log(Math.hypot(cycle.x - lastTrail.x, cycle.z - lastTrail.z) )
            if (Math.hypot(cycle.x - lastTrail.x, cycle.z - lastTrail.z) > 0.1) {
                const trailBody = new CANNON.Body({ mass: 0 })
                trailBody.addShape(new CANNON.Box(new CANNON.Vec3(0.05, 0.25, 0.05)))
                trailBody.position.set(cycle.x, 0.25, cycle.z)
                this.world.addBody(trailBody)

                const speed = Math.hypot(cycle.vx, cycle.vz)
                const dx = speed > 0 ? cycle.vx / speed : 0
                const dz = speed > 0 ? cycle.vz / speed : 0
                const trail = new Trail()
                trail.x = cycle.x
                trail.z = cycle.z
                trail.userId = id
                trail.dx = dx
                trail.dz = dz
                trail.timestamp = currentTime
                this.state.trails.push(trail)
                // this.trailBodies.push({ trail, body: trailBody })
            }
            // body.addEventListener('collide', () => {
            //     console.log(`${id} crashed!`)
            //     cycle.vx = 0
            //     cycle.vz = 0
            // })
        }
        const lifetime = 1000 * 10

        //  Remove expired trails in-place
         for (let i = this.state.trails.length - 1; i >= 0; i--) {
            const trail = this.state.trails[i]
            const age = currentTime - trail.timestamp
            if (age > lifetime) {
                const trailBodyIndex = this.trailBodies.findIndex(tb => tb.trail === trail)
                if (trailBodyIndex !== -1) {
                    this.world.removeBody(this.trailBodies[trailBodyIndex].body)
                    this.trailBodies.splice(trailBodyIndex, 1)
                }
                this.state.trails.splice(i, 1)
            }
        }
    }

    onLeave(client: { sessionId: string }): void {
        this.world.removeBody(this.cycleBodies[client.sessionId])
        const startIndex = Array.from(this.state.cycles.entries()).findIndex(([id]) => id === client.sessionId)
        this.usedStartingPoints.delete(startIndex)
        this.state.cycles.delete(client.sessionId)
        delete this.cycleBodies[client.sessionId]
    }

    onDispose(): void | Promise<any> {
        clearInterval(this.state.simulationInterval)

        this.world.bodies.forEach((body:CANNON.Body)=>{
            this.world.removeBody(body)
        })
        this.world.bodies.length = 0
        this.world = null
    }
}