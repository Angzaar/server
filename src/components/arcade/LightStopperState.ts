import { Room, Client, Delayed } from "colyseus";
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { CANNON } from "../../utils/libraries";
import axios from "axios";
import { BlitzRoom } from "../../rooms/BlitzRoom";

export const lightStopperSlug = 'light-stopper'
const NUM_LIGHTS = 50 // Number of lights in the circle
const INITIAL_LIGHT_SPEED = 25; // Initial milliseconds per step
const WINNING_INDEX = 0; // Example winning index
const WINNING_RANGE = 5; // Acceptable range for partial prizes
const GAME_COST = 10; // Cost in Dust to play
const JACKPOT_REWARD = 50; // Dust reward for jackpot
const SMALL_PRIZE_REWARD = 20; // Dust reward for small prize

export class LightStopperState extends Schema {
    @type("string")
    currentPlayer = "";

    @type("number")
    activeLightIndex = 0;

    @type("boolean")
    isGameRunning = true;

    @type("boolean")
    isGamePlaying = false;

    currentLightSpeed:number = INITIAL_LIGHT_SPEED
    lightTimer:any

    startGame(room:BlitzRoom, userId:string){
        if(this.isGamePlaying) return

        let player = room.state.players.get(userId);
        if(!player) return

        if (!player.deductDust(GAME_COST)) {
            player.client.send(lightStopperSlug, {action:'invalid-dust-amount'});
            return;
        }
        
        player.client.send('dust-update', {new:-GAME_COST, balance:player.dust });

        this.isGamePlaying = true
        this.isGameRunning = true
        this.currentLightSpeed = INITIAL_LIGHT_SPEED

        const updateLight = () => {
            this.activeLightIndex = (this.activeLightIndex + 1) % NUM_LIGHTS;
            // this.currentLightSpeed = Math.max(10, this.currentLightSpeed + (Math.random() * 10 - 5));
            this.lightTimer = setTimeout(updateLight, this.currentLightSpeed);
            console.log(this.activeLightIndex)
        }
        updateLight()
    }

    stopGame(room:BlitzRoom) {
        if(!this.isGamePlaying || !this.isGameRunning) return
        clearTimeout(this.lightTimer)

        const result = this.checkWin(this.activeLightIndex);
        room.broadcast(lightStopperSlug, {action:"stop", result });

        let winAmount = 0;
        
        if (result === "jackpot") {
            winAmount = JACKPOT_REWARD;
        } else if (result === "small prize") {
            winAmount = SMALL_PRIZE_REWARD;
        }
        
        if (winAmount > 0) {
            let player = room.state.players.get(this.currentPlayer)
            if(player){
                player.addDust(winAmount)
                player.client.send('dust-update', { new:winAmount, balance:player.dust});
            }
        }

        this.isGamePlaying = false;
        this.isGameRunning = false;
        this.currentLightSpeed = INITIAL_LIGHT_SPEED; // Reset speed for next round
        
        // Blink the stopped light for 3 seconds
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            room.broadcast(lightStopperSlug, {action:"blink", index: this.activeLightIndex, state: blinkCount % 2 === 0 });
            blinkCount++;
            if (blinkCount >= 15) { // Blink for 3 seconds (6 times at 500ms intervals)
                clearInterval(blinkInterval);
                this.resetGame(room);
            }
        }, 300);
    }

    resetGame(room: BlitzRoom) {
        this.activeLightIndex = 0;
        room.broadcast(lightStopperSlug, {action:'reset', index: this.activeLightIndex });
        this.isGameRunning = true;
    }

    checkWin(selectedIndex: number): string {
        if (selectedIndex === WINNING_INDEX) {
            return "jackpot";
        } else if (Math.abs(selectedIndex - WINNING_INDEX) <= WINNING_RANGE) {
            return "small prize";
        } else {
            return "no win";
        }
    }
}

export function handleLightStopperMessage(room:BlitzRoom, client:Client, info:any){
    console.log('handling light stopper message', info)
    if(!info.action) return

    let lightStopper = room.state.lightStopper.get(lightStopperSlug)
    if(!lightStopper) return

    switch(info.action){
        case 'start':
            lightStopper.startGame(room, client.userData.userId)
            break;

        case 'stop':
            console.log('stopped light index is', lightStopper.activeLightIndex)
            lightStopper.stopGame(room);
            break;
    }
}
