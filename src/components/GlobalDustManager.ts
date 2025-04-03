import { BasePlayerState } from "./BasePlayerState";

export class GlobalDustManager {
    static players = new Map<string, any>();

    static addPlayer(player:any) {
        if (!this.players.has(player.userId)) {
            this.players.set(player.userId, player);
        }
    }

    static removePlayer(userId:string){
        this.players.delete(userId)
    }

    static updatePlayerState(playerId: string, data: Partial<any>) {
        let player = this.players.get(playerId);
        if (player) {
            Object.assign(player, data);
        }
    }

    static startDustEarningLoop() {
        setInterval(() => {
            const now = Date.now();
            for (const player of this.players.values()) {
                if ((now - player.lastDustEarnTimestamp) >= 1000 * 5) {
                    if(player.isSpectatingBlitz){
                        player.addDust(1, player.client);
                        player.lastDustEarnTimestamp = now;
                        continue;
                    }

                    if(player.isPlayingBlitz){
                        continue;
                    }
                    
                }
            }
        }, 1000 * 10);
    }
}