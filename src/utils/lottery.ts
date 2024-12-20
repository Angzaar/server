import { ethers, uuidV4 } from "ethers";
import { LotteryRoom, pendingIntents } from "../rooms/LotteryRoom";
import * as dclTx from "decentraland-transactions";
import { getCache, updateCache } from "./cache";
import { LOTTERY_FILE, LOTTERY_FILE_CACHE_KEY } from "./initializer";
import { Client } from "colyseus";
import { v4 } from "uuid";
import { Player } from "../rooms/MainRoom";

export const MANA_ADDRESS = process.env.MANA_ADDRESS;
export const PRIVATE_KEY = process.env.LOTTERY_PRIVATE_KEY;
export const INFURA_ID = process.env.INFURA_ID;
// export const LOTTERY_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
export const LOTTERY_WALLET = process.env.LOTTERY_WALLET

export const erc20ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

export const erc721ABI = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data) external",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ];  

export interface NFTSendRequest {
    to: string;
    tokenId: string;
    contractAddress:string
}

export let lotteryWallet:any
export let manaContract:any
export let ethereumProvider:any
export let polygonProvider:any

let refundQueue:any = [];
let nftQueue: NFTSendRequest[] = [];
let ercListeners:Map<string, any> = new Map()

export async function connectWeb3(){
    ethereumProvider = new ethers.WebSocketProvider("wss://mainnet.infura.io/ws/v3/" + INFURA_ID, 137)
    polygonProvider = new ethers.WebSocketProvider("wss://polygon-mainnet.infura.io/ws/v3/" + INFURA_ID, 137)
    lotteryWallet = new ethers.Wallet(PRIVATE_KEY, polygonProvider);
    manaContract = new ethers.Contract(MANA_ADDRESS, erc20ABI, polygonProvider);
}

export function enqueueRefund(playerAddress:string, amount:any) {
  refundQueue.push({ playerAddress, amount });
  console.log(`Enqueued refund for ${playerAddress}, amount: ${amount}`);
}

export async function refundParticipant(playerAddress: string, amount: string) {
    try{
        const iface = new ethers.Interface(erc20ABI);
        const refund = ethers.parseEther(amount)
        const data = iface.encodeFunctionData("transfer", [playerAddress, refund]);
        
        console.log("Full transaction data:", data);
    }
    catch(e:any){
        throw new Error("Refund Error")
    }
  }

async function processRefundRequest(request:any) {
  const { playerAddress, amount } = request;
  try {
    const receipt = await refundParticipant(playerAddress, amount);
    console.log(`Refunded ${playerAddress} amount ${amount}. Tx: ${receipt}`);
  } catch (err:any) {
    console.error(`Failed to refund ${playerAddress}: ${amount} -> ${err.message}`);
    // Optionally re-enqueue or mark failed
  }
}

export function startRefundProcessor(room?:LotteryRoom) {
    let interval = setInterval(async () => {
    if (refundQueue.length > 0) {
      console.log(`Processing ${refundQueue.length} refunds...`);
      // Copy and clear the queue so we don't lock it up while processing
      const toProcess = refundQueue;
      refundQueue = [];

      for (const request of toProcess) {
        await processRefundRequest(request);
      }
    }
  }, 1000 * 5)

  if(room){
    room.state.refundInterval = interval
  }
}

export function enqueueNFTSend(contractAddress: string, tokenId: string, to: string) {
    nftQueue.push({ contractAddress, to, tokenId });
    console.log(`Enqueued NFT send: ${contractAddress} to=${to}, tokenId=${tokenId}`);
}

export async function sendNFTToWinner(contractAddress:string, to: string, tokenId: string) {
    try{
        let contractConfig:dclTx.ContractData
        let contractInterface:any
        let isOffchainContract = false

        contractConfig = dclTx.getContract(dclTx.ContractName.ERC721CollectionV2, 137);
        contractConfig.address = contractAddress
        contractInterface = new ethers.Interface(contractConfig.abi);

        const functionSignature:any = contractInterface.encodeFunctionData("transferFrom(address,address,uint256)", [LOTTERY_WALLET, to, tokenId]);

        // const nonce = await polygonProvider.getTransactionCount(LOTTERY_WALLET);

        const nonce = await getNonce(
          polygonProvider,
          LOTTERY_WALLET,
          contractConfig.address
        )
        // const nonce = "2"
        // console.log('nonce is', nonce)

        const salt = getSalt(contractConfig.chainId)
        const domainData = getDomainData(salt, contractConfig)
        // console.log('domain data is', domainData)

        const dataToSign = getDataToSign(
            LOTTERY_WALLET,
            nonce,
            functionSignature,
            domainData,
            isOffchainContract
          )

        const { domain, types, message } = dataToSign; // Extract from your data structure
        const { MetaTransaction } = types;

        // console.log("domain", dataToSign)

        // Sign the transaction with your private key (through the wallet)
        const signature = await lotteryWallet.signTypedData(domain, { MetaTransaction }, message);
        console.log(domain, {MetaTransaction}, message)

        console.log("Signed Transaction:", signature);

        // const getMetaTransactionData = isOffchainContract
            // // ? getOffchainExecuteMetaTransactionData
            // : getExecuteMetaTransactionData

        const getMetaTransactionData = getExecuteMetaTransactionData

        const txData = getMetaTransactionData(LOTTERY_WALLET, signature, functionSignature)
        // console.log('tx data is', txData)

        const response: Response = await fetch(
        `https://transactions-api.decentraland.org/v1/transactions`,
        {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            transactionData: {
                from: LOTTERY_WALLET,
                params: [contractAddress, txData]
            }
            }),
            method: 'POST'
        }
        )

        // console.log('respoinse', response)

        console.log('response.status', response.status)

        const body:
        | { ok: false; message: string; code: dclTx.ErrorCode }
        | { ok: true; txHash: string } = await response.json()

        if (body.ok === false) {
        if (body.message && body.code) {
            throw new dclTx.MetaTransactionError(body.message, body.code)
        }

        throw new Error(`HTTP Error. Status: ${response.status}.`)
        }

        return body.txHash
    }
    catch(e:any){
        console.log('sending nft error', e.message)
        throw new Error("Send NFT Error")
    }
}

async function processNFTSendRequest(request: NFTSendRequest) {
    const { to, tokenId, contractAddress } = request;
    try {
      // console.log('proccessed nft', contractAddress, tokenId, to)
      const receipt:any = await sendNFTToWinner(contractAddress, to, tokenId);
      console.log(`Sent NFT tokenId ${tokenId} to ${to}. Tx: ${receipt}`);
    } catch (err: any) {
      console.error(`Failed to send NFT ${contractAddress} tokenId ${tokenId} to ${to}: ${err.message}`);
      // Consider re-queuing, logging, or notifying an admin
    }
}

export function startNFTQueueProcessor(room?:LotteryRoom) {
    let interval = setInterval(async () => {
      if (nftQueue.length > 0) {
        console.log(`Processing ${nftQueue.length} NFT sends...`);
        const toProcess = nftQueue;
        nftQueue = [];
  
        for (const request of toProcess) {
          await processNFTSendRequest(request);
        }
      }
    }, 1000 * 5);
    if(room){
        room.state.nftInterval = interval
    }
}

export function cancelLottery(client:Client, message:any, room:LotteryRoom){
  let lotteries = getCache(LOTTERY_FILE_CACHE_KEY)

  let lottery = lotteries.find((lot:any)=> lot.id === message.id)
  if(!lottery){
    console.log('lottery doesnt exist to cancel', message.id)
    return
  }

  if(lottery.processing){
    client.send('cancel-lottery', {valid:false, message:"Cannot cancel CHANCE, someone currently in process"})
  }else{
    let priorStatus = lottery.status
    lottery.status = "finished"

    if(priorStatus === "active"){
      room.broadcast('lottery-finished', lottery.id)

      lottery.items.forEach((item:any)=>{
        let [contract, tokenId] = item.split(":")
        enqueueNFTSend(contract, tokenId, lottery.owner)
      })
    }
  }

}

export function processNewLottery(client:Client, lotteryData:any, room:LotteryRoom, ){
  console.log('creating new lottery', lotteryData)
  //validate lottery data

  let lotteries = getCache(LOTTERY_FILE_CACHE_KEY)

  // let lotteryExists = lotteries.find((lot:any)=> lot.id === lotteryData.id)
  // if(lotteryExists){
  //   console.log('lottery already exists for lottery', lotteryData)
  //   //send wss mesaage
  //   return
  // }

  let id = v4()
  lotteries.push({
    id: id,
    items:lotteryData.items,
    name: lotteryData.name,
    "owner": lotteryData.owner,
    "chanceToWin": lotteryData.chanceToWin,
    "costToPlay": lotteryData.costToPlay,
    "status": "pending",
    "queue": [],
    "processing": false,
    itemsReceived:[],
    chances:0
  })
  room.broadcast('new-lottery', lotteries.find((lottery:any)=> lottery.id === id))
  updateCache(LOTTERY_FILE, LOTTERY_FILE_CACHE_KEY, lotteries)
  setupNFTListener(lotteries, lotteries.find((lottery:any)=> lottery.id === id), room)
}

export function lotterySignUp(client:Client, lotteryData:any, room:LotteryRoom){
  if(pendingIntents[client.userData.userId.toLowerCase()]){
    console.log('player is already trying to play lotto', client.userData.userId)
    return
  }

  let lotteries = getCache(LOTTERY_FILE_CACHE_KEY)
  // let lotteryId = lotteryData + ":" + 
  let lottery = lotteries.find((lot:any)=> lot.id === lotteryData.id && lot.status === "active")
  if(!lottery){
    console.log('lottery does not exist')
    client.send("lottery-no-exist", lotteryData)
    return
  }

  pendingIntents[client.userData.userId.toLowerCase()] = {
    id:lotteryData.id,
    amount: lottery.costToPlay
  };

  client.send('play-chance', lottery.costToPlay)

  if(lottery.costToPlay === 0){
    transferReceived(client.userData.userId, LOTTERY_WALLET, lottery.costToPlay.toString(), room)
  }
}

export function removePlayerFromLotterySignup(user:string){
  delete pendingIntents[user.toLowerCase()]
}

export function setupNFTListeners(room:LotteryRoom){
  let lotteries = getCache(LOTTERY_FILE_CACHE_KEY)
  let pendingLotteries = lotteries.filter((lot:any)=> lot.status === "pending")
  pendingLotteries.forEach((lottery:any)=>{
    setupNFTListener(lotteries, lottery, room)
  })
}

export function removeNFTListeners(){
  ercListeners.forEach((listener:any, id:string)=>{
    listener.removeAllListeners()
      ercListeners.delete(id)
  })
}

function setupNFTListener(lotteries:any, lottery:any, room:LotteryRoom){
  lottery.items.forEach((item:any)=>{
    console.log('setting up nft listener for', item)
    try{
      let [contract, tokenId] = item.split(":")
      let ercListener =  new ethers.Contract(contract, erc721ABI, polygonProvider);
      ercListeners.set(item, ercListener)
      updateCache(LOTTERY_FILE, LOTTERY_FILE_CACHE_KEY, lotteries)
  
      ercListener.on("Transfer", async (from:any, to:any, receivedTokenId:any) => {
        console.log("nft transfer received", from, to, tokenId)
        if(to.toLowerCase() === LOTTERY_WALLET && from.toLowerCase() === lottery.owner && receivedTokenId.toString() === tokenId){
          console.log('Lottery wallet received nft for pending setup', from, receivedTokenId.toString())
    
          ercListener.removeAllListeners()
          ercListeners.delete(item)
  
          lottery.itemsReceived.push(contract + ":" + receivedTokenId)
  
          if(lottery.itemsReceived.length === lottery.items.length){
            lottery.status = "active"
            room.broadcast('lottery-active', lottery.id)
          }
          updateCache(LOTTERY_FILE, LOTTERY_FILE_CACHE_KEY, lotteries)
        }
      });
    }
    catch(e){
      console.log('error setting up nft listener', item)
    }
  })
}

export async function transferReceived(from:string, to:string, value:any, room:LotteryRoom){
  if (to.toLowerCase() === LOTTERY_WALLET.toLowerCase()) {
      let manaSent = ethers.toNumber(value)

      const pending = pendingIntents[from.toLowerCase()];
      console.log('pending intent is', pending)
      if (pending && pending.amount === manaSent) {
        let lotteries = getCache(LOTTERY_FILE_CACHE_KEY)

        const lottery = lotteries.find((i:any) => i.id === pending.id);
        if (lottery && lottery.status === "active" && lottery.costToPlay === manaSent) {
          lottery.queue.push({ playerAddress: from, amountSent: value.toString() });
            console.log(`Added ${from} to queue for lottery ${lottery.id}.`);
    
            delete pendingIntents[from.toLowerCase()];
    
            if (!lottery.processing) {
              lottery.processing = true;
              await processQueueForItem(lottery, from, value.toString(), room);
            }
        } else {
            console.warn(`Item ${pending.itemId} not active or not found.`, from, value.toString());
        }
      } else {
      console.warn("Received MANA with no matching pending intent or amount mismatch.", from, value.toString());
      }
  }
}

export async function processQueueForItem(lottery:any, user:string, amount:string, room:LotteryRoom) {
  if(lottery.queue.length === 0){
      return
  }

  lottery.processing = true

  const oldQueue = lottery.queue;
  lottery.queue = [];

  for (let i = 0; i < oldQueue.length; i++) {
    const participant = oldQueue[i];
    const player = participant.playerAddress;

    // Decide if this participant wins
    const wins = Math.random() < lottery.chanceToWin / 100;
    if (wins) {
      console.log(`${player} won the lottery!!` + lottery);
      room.broadcast('lottery-finished', lottery.id)
      
      lottery.status = "finished"

      lottery.items.forEach((item:any)=>{
        let [contract, tokenId] = item.split(":")
        enqueueNFTSend(contract, tokenId, player)
      })
      
      // Refund everyone after the winner if amount to play is > 0
      if(lottery.costToPlay > 0){
        for (let j = i + 1; j < oldQueue.length; j++) {
          console.log('j is', j)
          const p = oldQueue[j];
          console.log(`Refunding ${p.playerAddress} their MANA (never got processed)`);
          enqueueRefund(p.playerAddress, p.amountSent)
        } 
      }

      let winnerOnline:Player = room.state.players.get(player)
      if(winnerOnline){
        winnerOnline.client.send("lottery-won", {name:lottery.name})
      }
      lottery.chances += 1
      break; // Stop processing after winner
    } else {
      console.log(`${player} lost, removed from queue with no refund.`);
      lottery.chances += 1

      let winnerOnline:Player = room.state.players.get(player)
      if(winnerOnline){
        winnerOnline.client.send("lottery-lost", {image:"", name:lottery.name})
      }
    }
  }
  lottery.processing = false
}

  function getDataToSign(
    account: string,
    nonce: string,
    functionSignature: string,
    domainData: dclTx.DomainData,
    isOffchainContract = false
  ): dclTx.DataToSign {
    return {
      types: {
        EIP712Domain: dclTx.DOMAIN_TYPE,
        MetaTransaction: isOffchainContract
          ? dclTx.OFFCHAIN_META_TRANSACTION_TYPE
          : dclTx.META_TRANSACTION_TYPE
      },
      domain: domainData,
      primaryType: 'MetaTransaction',
      message: {
        nonce: parseInt(nonce, 16),
        from: account,
        ...(isOffchainContract
          ? { functionData: functionSignature }
          : { functionSignature })
      }
    }
  }

  function getDomainData(salt: string, contractData: dclTx.ContractData): dclTx.DomainData {
    return {
      name: contractData.name,
      version: contractData.version,
      verifyingContract: contractData.address,
      salt
    }
  }

const GET_NONCE_FUNCTION_SELECTOR = '2d0335ab'
const EXECUTE_META_TRANSACTION_FUNCTION_SELECTOR = '0c53c51c'
const OFFCHAIN_EXECUTE_META_TRANSACTION_FUNCTION_SELECTOR = 'd8ed1acc'
const ZERO_ADDRESS = hexZeroPad('0x')
let rpcId = 0
  export function getExecuteMetaTransactionData(
    account: string,
    fullSignature: string,
    functionSignature: string
  ): string {
    const signature = fullSignature.replace('0x', '')
    const r = signature.substring(0, 64)
    const s = signature.substring(64, 128)
    const v = normalizeVersion(signature.substring(128, 130))
  
    const method = functionSignature.replace('0x', '')
    const signatureLength = (method.length / 2).toString(16)
    const signaturePadding = Math.ceil(method.length / 64)
  
    return [
      '0x',
      EXECUTE_META_TRANSACTION_FUNCTION_SELECTOR,
      to32Bytes(account),
      to32Bytes('a0'),
      r,
      s,
      to32Bytes(v),
      to32Bytes(signatureLength),
      method.padEnd(64 * signaturePadding, '0')
    ].join('')
  }
  
  export function getSalt(chainId: number | string): string {
    if (typeof chainId === 'number') {
      return `0x${to32Bytes(chainId.toString(16))}`
    }
  
    return `0x${to32Bytes(chainId)}`
  }

  export function normalizeVersion(version: string) {
    /*
      This is a fix for an issue with Ledger, where `v` is returned as 0 or 1 and we expect it to be 27 or 28.
      See issue #26 of decentraland-transactions for more details: https://github.com/decentraland/decentraland-transactions/issues/26
    */
    let parsed = parseInt(version, 16)
    if (parsed < 27) {
      // this is because Ledger returns 0 or 1
      parsed += 27
    }
    if (parsed !== 27 && parsed !== 28) {
      throw Error(`Invalid signature version "${version}" (parsed: ${parsed})`)
    }
    return parsed.toString(16)
  }

  function to32Bytes(value: number | string): string {
    return value
      .toString()
      .replace('0x', '')
      .padStart(64, '0')
  }

  export function hexZeroPad(hex: string) {
    if (!/^0x[0-9a-f]*$/gi.test(hex)) {
      throw new Error(`Not a valid hex string "${hex}"`)
    }
  
    let padded = hex.slice(2)
    while (padded.length < 40) {
      padded = '0' + padded
    }
    return '0x' + padded
  }
  
  export function isZeroAddress(address: string) {
    return hexZeroPad(address.toLowerCase()) === ZERO_ADDRESS
  }

  export function getOffchainExecuteMetaTransactionData(
    account: string,
    fullSignature: string,
    functionSignature: string
  ): string {
    const functionData = functionSignature.replace('0x', '')
    const signature = fullSignature.replace('0x', '')
    // Calculate offsets
    const firstOffset = 96 // 0x60 (4 + 32 + 32 + 32)
    const secondOffset = firstOffset + 32 + functionData.length / 2
    const signaturePadding = Math.ceil(signature.length / 64)
  
    const txData = [
      '0x',
      OFFCHAIN_EXECUTE_META_TRANSACTION_FUNCTION_SELECTOR,
      to32Bytes(account), // address parameter
      to32Bytes('60'), // offset to functionData
      to32Bytes(secondOffset.toString(16)), // offset to signature
      to32Bytes((functionData.length / 2).toString(16)), // length of functionData
      functionData, // functionData without padding since it has to match its length
      to32Bytes((signature.length / 2).toString(16)), // length of signature
      signature.padEnd(64 * signaturePadding, '0') // padded signature
    ]
  
    return txData.join('')
  }

  export async function getNonce(
    provider: any,
    account: string,
    contractAddress: string
  ): Promise<string> {
    const hexSigner = to32Bytes(account)
  
    const nonce: string = await send(provider, 'eth_call', [
      {
        data: `0x${GET_NONCE_FUNCTION_SELECTOR}${hexSigner}`,
        to: contractAddress
      },
      'latest'
    ])
    return to32Bytes(nonce)
  }

  async function send<T>(
    provider: any,
    method: string,
    params: any[]
  ): Promise<T> {
    let data: T | { result: T } | undefined
    let args = {
      jsonrpc: '2.0',
      id: ++rpcId,
      method,
      params
    }
  
    if ((provider as dclTx.EIPProvider)['request'] !== undefined) {
      data = await (provider as dclTx.EIPProvider).request(args)
    } else if (provider['sendAsync'] !== undefined) {
      data = await provider.sendAsync(args)
    } else if (provider['send'] !== undefined) {
      data = await provider.send(method, params)
    }
  
    if (data) {
      return (data as { result: any })['result'] || data
    } else {
      throw new Error(
        `Could not send the transaction correcty. Either the provider does not support the method "${method}" or is missing a proper send/request.`
      )
    }
  }

////0xA3FD0758DEE5F999bb52FFFD0325BF489F372156