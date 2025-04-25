import { Reward, MarketplaceData, Promotion } from "../components/TheForge/utils/types";

/**
 * Validates marketplace-related data in a reward
 * @param reward The reward object to validate
 * @returns An object with validation result and error message if invalid
 */
export function validateMarketplaceData(reward: Reward): { valid: boolean; error?: string } {
  try {
    // If not listed on marketplace, no further validation needed
    if (!reward.listing || !reward.listing.listed) {
      return { valid: true };
    }

    // Validate price if item is listed
    if (!reward.listing.price || !reward.listing.price.amount) {
      return { valid: false, error: 'Price is required for marketplace listings' };
    }
      
    // Ensure price is a valid number
    const priceAmount = parseFloat(reward.listing.price.amount);
    if (isNaN(priceAmount) || priceAmount < 0) {
      return { valid: false, error: 'Price must be a valid positive number' };
    }
      
    // Ensure currency is set
    if (!reward.listing.price.currency) {
      return { valid: false, error: 'Currency is required for marketplace listings' };
    }
    
    // Validate promotion if present
    if (reward.promotion && reward.promotion.isOnSale) {
      // Ensure sale price is set
      if (!reward.promotion.salePrice) {
        return { valid: false, error: 'Sale price is required when on sale' };
      }
      
      // Ensure sale price is a valid number
      const salePriceAmount = parseFloat(reward.promotion.salePrice);
      if (isNaN(salePriceAmount) || salePriceAmount < 0) {
        return { valid: false, error: 'Sale price must be a valid positive number' };
      }
      
      // Ensure sale price is less than regular price
      if (salePriceAmount >= priceAmount) {
        return { valid: false, error: 'Sale price must be less than regular price' };
      }
      
      // Validate saleEndDate if provided
      if (reward.promotion.saleEndDate) {
        const endDate = new Date(reward.promotion.saleEndDate);
        if (isNaN(endDate.getTime())) {
          return { valid: false, error: 'Sale end date must be a valid date' };
        }
        
        // Ensure end date is in the future
        if (endDate < new Date()) {
          return { valid: false, error: 'Sale end date must be in the future' };
        }
      }
    }

    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

/**
 * Ensures a reward has all required marketplace fields with proper defaults
 * @param reward The reward object to process
 * @returns The reward with all required marketplace fields initialized
 */
export function ensureMarketplaceFields(reward: Reward): Reward {
  // Ensure marketplaceData exists with defaults
  if (!reward.marketplaceData) {
    reward.marketplaceData = {
      category: '',
      subcategory: '',
      tags: []
    };
  } else {
    // Ensure tags is always an array
    if (!Array.isArray(reward.marketplaceData.tags)) {
      reward.marketplaceData.tags = [];
    }
  }
  
  // Ensure featured is a boolean
  reward.featured = !!reward.featured;
  
  // Ensure promotion exists with defaults
  if (!reward.promotion) {
    reward.promotion = {
      isOnSale: false,
      salePrice: '',
      saleEndDate: ''
    };
  }
  
  // Ensure listing exists with defaults
  if (!reward.listing) {
    reward.listing = {
      listed: false,
      quantity: 1
    };
  }
  
  return reward;
} 