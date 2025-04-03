import { ethers } from "ethers";
import { Contract, Wallet } from "ethers";
import { getCache } from "../utils/cache";
import { REWARDS_CACHE_KEY } from "../utils/initializer";
import { BasePlayerState } from "./BasePlayerState";
import { generateId } from "colyseus";

export enum RewardType {
    DUST = "DUST",
    SOLANA = "SOLANA",
    ERC721 = "ERC721",
    ERC1155 = "ERC1155",
    ERC20 = "ERC20",
    CUSTOM = "CUSTOM"
  }
  

export class RewardManager {
  // private static ethProvider = new ethers.JsonRpcProvider(config.ethRpcUrl);
  // private static polygonProvider = new ethers.JsonRpcProvider(config.polygonRpcUrl);
  // private static solanaConnection = new Connection(config.solanaRpcUrl, "confirmed");

  // private static ethWallet = new Wallet(config.ethPrivateKey, RewardManager.ethProvider);
  // private static polygonWallet = new Wallet(config.polygonPrivateKey, RewardManager.polygonProvider);
  // private static solanaWallet = Keypair.fromSecretKey(Uint8Array.from(config.solanaPrivateKey));

private static lockedRewards = new Set<string>(); // Rewards being processed

// private static isAuthorized(userAddress: string, reward: any): boolean {
//   // Check if user is an admin or meets custom requirements
//   return config.adminAddresses.includes(userAddress); // Modify as needed
// }

  static async getAvailableRewards() {
    return getCache(REWARDS_CACHE_KEY);
  }

  static async addReward(userAddress: string, newReward: any) {
    // if (!this.isAuthorized(userAddress, newReward)) {
    //     throw new Error("Unauthorized: You do not have permission to add this reward.");
    // }

    // Validate the reward format
    if (!newReward.name || !newReward.type || !newReward.cost) {
        throw new Error("Invalid reward data.");
    }

    let rewards = getCache(REWARDS_CACHE_KEY)
    rewards.id = generateId(7)
    rewards.push(newReward)

    console.log(`Reward added by ${userAddress}:`, newReward);
    return { success: true, rewardId: newReward.id };
}

  static async redeemReward(player:BasePlayerState, rewardId: string) {
    if (this.lockedRewards.has(rewardId)) throw new Error("This reward is being redeemed by another player.");

    // Lock the reward to prevent multiple redemptions
    this.lockedRewards.add(rewardId);

    let rewardData:any[] = getCache(REWARDS_CACHE_KEY)
    const rewardIndex = rewardData.findIndex((r:any) => r.id === rewardId);
    if (rewardIndex < 0) throw new Error("Reward not found");

    const reward = rewardData.splice(rewardIndex, 1)[0]

    //Deduct Dust
    if(player.deductDust(reward.cost)){
        throw new Error("Insufficient Dust"); 
    }

    switch(reward.type){
        case RewardType.DUST:
          break;

        case RewardType.ERC721:
          break;

        case RewardType.ERC1155:
          break;

        case RewardType.ERC20:
          break;

        case RewardType.CUSTOM:
          break;
    }

    // // Check Dust balance
    // const balance = await this.dustContract.balanceOf(userAddress);
    // if (balance < reward.cost) throw new Error("Insufficient Dust");

    // // Deduct Dust
    // const tx = await this.dustContract.transferFrom(userAddress, config.rewardPoolAddress, reward.cost);
    // await tx.wait();

    // // Mint ERC-721, ERC-1155, or send ERC-20 based on reward type
    // if (reward.type === "ERC721") {
    //   const nftContract = new Contract(reward.contractAddress, config.erc721Abi, this.wallet);
    //   await nftContract.mint(userAddress, reward.tokenId);
    // } else if (reward.type === "ERC1155") {
    //   const nftContract = new Contract(reward.contractAddress, config.erc1155Abi, this.wallet);
    //   await nftContract.mint(userAddress, reward.tokenId, reward.amount);
    // } else if (reward.type === "ERC20") {
    //   const tokenContract = new Contract(reward.contractAddress, config.erc20Abi, this.wallet);
    //   await tokenContract.transfer(userAddress, reward.amount);
    // }

    try{
      switch (reward.type) {
        case RewardType.ERC721:
        case RewardType.ERC1155:
        case RewardType.ERC20:
          await this.processEthereumPolygonReward(reward, player.userId);
          break;
        case RewardType.SOLANA:
          await this.processSolanaReward(reward, player.userId);
          break;
        case RewardType.DUST:
          await this.processDustReward(reward, player);
          break;
        case RewardType.CUSTOM:
          await this.processCustomReward(reward, player.userId);
          break;
        default:
          throw new Error("Unsupported reward type");
      }
    }
    catch(e:any){
        
    }
    finally{
        this.lockedRewards.delete(rewardId)
    }

    return { success: true, reward, userId:player.userId };
  }

  private static async processEthereumPolygonReward(reward: any, userAddress: string) {
    // const provider = reward.blockchain === Blockchain.ETHEREUM ? this.ethProvider : this.polygonProvider;
    // const wallet = reward.blockchain === Blockchain.ETHEREUM ? this.ethWallet : this.polygonWallet;
    // const contract = new Contract(reward.contractAddress, config.ercAbi, wallet);

    // if (reward.type === RewardType.ERC721) {
    //   await contract.mint(userAddress, reward.tokenId);
    // } else if (reward.type === RewardType.ERC1155) {
    //   await contract.mint(userAddress, reward.tokenId, reward.amount);
    // } else if (reward.type === RewardType.ERC20) {
    //   await contract.transfer(userAddress, reward.amount);
    // }
  }

  private static async processSolanaReward(reward: any, userAddress: string) {
    // const receiverPublicKey = new PublicKey(userAddress);
    // const senderPublicKey = this.solanaWallet.publicKey;

    // let transaction = new Transaction().add(
    //   {
    //     keys: [
    //       { pubkey: senderPublicKey, isSigner: true, isWritable: true },
    //       { pubkey: receiverPublicKey, isSigner: false, isWritable: true }
    //     ],
    //     programId: new PublicKey(reward.contractAddress) // SPL token program
    //   }
    // );

    // transaction.feePayer = senderPublicKey;
    // transaction.recentBlockhash = (await this.solanaConnection.getLatestBlockhash()).blockhash;

    // const signedTransaction = await this.solanaWallet.signTransaction(transaction);
    // await sendAndConfirmTransaction(this.solanaConnection, signedTransaction, [this.solanaWallet]);
  }

  private static async processDustReward(reward: any, player:BasePlayerState) {
    player.addDust(reward.amount)
  }

  private static async processCustomReward(reward: any, userAddress: string) {
    switch (reward.customHandler) {
      case "grantVipRole":
        await this.grantVipRole(userAddress);
        break;
      case "addArcadeCredits":
        await this.addArcadeCredits(userAddress, reward.amount);
        break;
      default:
        throw new Error("Unknown custom reward handler");
    }
  }

  private static async grantVipRole(userAddress: string) {
    console.log(`Granting VIP role to ${userAddress}`);
  }

  private static async addArcadeCredits(userAddress: string, amount: number) {
    console.log(`Adding ${amount} arcade credits to ${userAddress}`);
  }
}
