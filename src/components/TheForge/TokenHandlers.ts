import { Client } from "colyseus";
import { TokenManager } from "../TokenManager";
import { updateCache } from "../../utils/cache";
import { TOKENS_FILE, TOKENS_CACHE_KEY, PROFILES_CACHE_KEY, PROFILES_FILE } from "../../utils/initializer";
import { getCache } from "../../utils/cache";
import { CreatorToken } from "./utils/types";

// Create a singleton token manager
const tokenManager = new TokenManager();

/**
 * Handle token creation
 */
export function handleCreateToken(client: Client, message: any) {
  console.log("handleCreateToken", message);
  
  // Ensure only the token creator can create it
  const clientId = client.userData?.userId;
  if (!clientId || (clientId !== message.creator && clientId !== "Admin")) {
    client.send("TOKEN_ERROR", { message: "Not authorized to create token" });
    return;
  }

  try {
    // Ensure message has required fields
    if (!message.name || !message.symbol || !message.totalSupply) {
      client.send("TOKEN_ERROR", { message: "Missing required fields (name, symbol, totalSupply)" });
      return;
    }

    // Check if token with this name/symbol already exists
    if (tokenManager.tokenExists(message.name, message.symbol)) {
      client.send("TOKEN_ERROR", { message: "A token with this name or symbol already exists" });
      return;
    }

    // Create the token
    const token = tokenManager.createToken({
      creator: clientId,
      name: message.name,
      symbol: message.symbol,
      description: message.description,
      media: message.media,
      totalSupply: message.totalSupply,
      initialPrice: message.initialPrice,
      usableAsPayment: message.usableAsPayment || false,
      usableAsReward: message.usableAsReward || false
    });

    // Send success response to client
    client.send("TOKEN_CREATED", { success: true, token });
  } catch (error: any) {
    console.error("Error creating token:", error);
    client.send("TOKEN_ERROR", { message: error.message || "Failed to create token" });
  }
}

/**
 * Handle token details request
 */
export function handleTokenDetails(client: Client, message: any) {
  console.log("handleTokenDetails", message);
  
  try {
    const tokenId = message.id;
    if (!tokenId) {
      client.send("TOKEN_ERROR", { message: "Token ID is required" });
      return;
    }

    const token = tokenManager.getTokenById(tokenId);
    if (!token) {
      client.send("TOKEN_ERROR", { message: "Token not found" });
      return;
    }

    // Send token details to client
    client.send("TOKEN_DETAILS", { success: true, token });
  } catch (error: any) {
    console.error("Error getting token details:", error);
    client.send("TOKEN_ERROR", { message: error.message || "Failed to get token details" });
  }
}

/**
 * Handle listing all tokens
 */
export function handleListTokens(client: Client, message: any) {
  console.log("handleListTokens", message);
  
  try {
    const creatorAddress = message.creator;
    let tokens;
    
    if (creatorAddress) {
      // Get tokens created by the specified address
      tokens = tokenManager.getTokensByCreator(creatorAddress);
    } else {
      // Get all tokens
      tokens = tokenManager.getAllTokens();
    }

    // Send tokens to client
    client.send("TOKENS_LIST", { success: true, tokens });
  } catch (error: any) {
    console.error("Error listing tokens:", error);
    client.send("TOKEN_ERROR", { message: error.message || "Failed to list tokens" });
  }
}

/**
 * Handle updating token circulating supply
 */
export function handleUpdateTokenSupply(client: Client, message: any) {
  console.log("handleUpdateTokenSupply", message);
  
  // Check if admin or token creator
  const clientId = client.userData?.userId;
  const token = tokenManager.getTokenById(message.id);
  
  if (!token) {
    client.send("TOKEN_ERROR", { message: "Token not found" });
    return;
  }
  
  if (!clientId || (clientId !== token.creator && clientId !== "Admin")) {
    client.send("TOKEN_ERROR", { message: "Not authorized to update this token" });
    return;
  }

  try {
    const { id, circulatingSupply } = message;
    
    if (!id || circulatingSupply === undefined) {
      client.send("TOKEN_ERROR", { message: "Token ID and circulating supply are required" });
      return;
    }

    // Update token supply
    const success = tokenManager.updateTokenSupply(id, circulatingSupply);
    
    if (!success) {
      client.send("TOKEN_ERROR", { message: "Failed to update token supply" });
      return;
    }

    // Get updated token
    const updatedToken = tokenManager.getTokenById(id);
    
    // Send success response
    client.send("TOKEN_UPDATED", { success: true, token: updatedToken });
  } catch (error: any) {
    console.error("Error updating token supply:", error);
    client.send("TOKEN_ERROR", { message: error.message || "Failed to update token supply" });
  }
}

/**
 * Handle user inventory request
 */
export function handleInventoryRequest(client: Client, message: any) {
  console.log("handleInventoryRequest", message);
  
  try {
    const requestingUserId = client.userData?.userId;
    const targetUserId = message.userId || requestingUserId;
    
    // If requesting data for another user, check permissions
    if (targetUserId !== requestingUserId && requestingUserId !== "Admin") {
      client.send("INVENTORY_ERROR", { message: "Not authorized to view other user's inventory" });
      return;
    }

    // Find user profile
    const profiles = getCache(PROFILES_CACHE_KEY);
    const userProfile = profiles.find((profile: any) => profile.ethAddress === targetUserId);
    
    if (!userProfile) {
      client.send("INVENTORY_ERROR", { message: "User profile not found" });
      return;
    }

    // Get token balances from profile
    const tokens = userProfile.tokens || [];

    // Enrich token data with full token details
    const enrichedTokens = [];
    
    for (const userToken of tokens) {
      const token:any | null = tokenManager.getTokenById(userToken.id);
      if(!token) continue;

      enrichedTokens.push({
        ...userToken,
        token: {
          ...token,
          kind: 'CREATOR_TOKEN' // Ensure kind is set
        }
      });

      // For CREATOR_TOKENs, get the latest data from the TokenManager
      // For other item types, use the data already in the profile
      // if (token.kind === 'CREATOR_TOKEN') {
      //   const fullTokenData = tokenManager.getTokenById(token.id);
      //   if (fullTokenData) {
      //     // If we found the token in TokenManager, use that data
      //     enrichedTokens.push({
      //       ...userToken,
      //       token: {
      //         ...fullTokenData,
      //         kind: 'CREATOR_TOKEN' // Ensure kind is set
      //       }
      //     });
      //   } else {
      //     // If token not found in TokenManager but exists in profile, keep original data
      //     enrichedTokens.push(token);
      //   }
      // } else {
      //   // For non-CREATOR_TOKEN items, use the data already in the profile
      //   enrichedTokens.push(token);
      // }
    }

    // Send inventory to client
    client.send("INVENTORY_UPDATE", { 
      success: true, 
      tokens: enrichedTokens,
      userId: targetUserId
    });
  } catch (error: any) {
    console.error("Error getting user inventory:", error);
    client.send("INVENTORY_ERROR", { message: error.message || "Failed to get inventory" });
  }
} 