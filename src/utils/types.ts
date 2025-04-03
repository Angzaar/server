export interface Reservation {
    ethAddress: string; // User's Ethereum address
    startDate: number;    // Reservation start date
    endDate: number;      // Reservation end date
    id:string
  }
  
  export interface Location {
    id: number;
    parcels:string[],
    reservations: Reservation[] | null; // Reservation data or null if unreserved
  }
  
  export interface Profile {
    ethAddress: string; // Ethereum address
    ipAddress: string;  // User's IP address
    name: string;       // User's name
    createdDate: Date;  // When the profile was created
    deployments: number; // Number of deployments made by the user
    dust:number; //angzaar currency
    goals:number //blitz goals
    distance:number, // blitz distance
    wins:number, //blitz wins
    losses:number //blitz losses
  }
  

// Define the domain and types for EIP-712
export const messageDomain = {
  name: "AngzaarPlazaDeployment",
  version: "1",
  chainId: 1,
};

export const messageDeployType = {
  Deploy: [
    { name: "message", type: "string" },
    { name: "deployHash", type: "string" },
  ],
};

export enum Blockchain {
  ETHEREUM = "ethereum",
  POLYGON = "matic",
  SOLANA = "solana"
}
