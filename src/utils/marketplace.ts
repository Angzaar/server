import { getCache } from "../utils/cache";
import { PROFILES_CACHE_KEY, REWARDS_CACHE_KEY } from "../utils/initializer";

/**
 * Handle marketplace rewards request with filtering, sorting and pagination
 */
export function handleMarketplaceRewards(req: any, res: any) {
  try {
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const startIndex = (page - 1) * limit;
    
    // Filter parameters
    const category = req.query.category as string;
    const subcategory = req.query.subcategory as string;
    const kind = req.query.kind as string;
    const rarity = req.query.rarity as string;
    const tag = req.query.tag as string;
    const creator = req.query.creator as string;
    const featured = req.query.featured === 'true';
    const onSale = req.query.onSale === 'true';
    const search = req.query.search as string;
    const minPrice = parseFloat(req.query.minPrice as string);
    const maxPrice = parseFloat(req.query.maxPrice as string);
    
    // Sort parameter
    const sortBy = req.query.sortBy as string || 'newest';
    
    // Get marketplace items (must be listed and have marketplace data)
    let marketplaceItems = rewards.filter((reward: any) => 
      reward.listing && 
      reward.listing.listed === true
    );
    
    // Apply filters
    if (category) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        item.marketplaceData && item.marketplaceData.category === category
      );
    }
    
    if (subcategory) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        item.marketplaceData && item.marketplaceData.subcategory === subcategory
      );
    }
    
    if (kind) {
      marketplaceItems = marketplaceItems.filter((item: any) => item.kind === kind);
    }
    
    if (rarity) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        (item.decentralandItem && item.decentralandItem.rarity === rarity)
      );
    }
    
    if (tag) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        item.marketplaceData && 
        item.marketplaceData.tags && 
        item.marketplaceData.tags.includes(tag)
      );
    }
    
    if (creator) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        item.creator.toLowerCase() === creator.toLowerCase()
      );
    }
    
    // Filter by featured status
    if (req.query.featured !== undefined) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        item.featured === featured
      );
    }
    
    // Filter by sale status
    if (req.query.onSale !== undefined) {
      marketplaceItems = marketplaceItems.filter((item: any) => 
        item.promotion && 
        item.promotion.isOnSale === onSale
      );
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      marketplaceItems = marketplaceItems.filter((item: any) => 
        (item.name && item.name.toLowerCase().includes(searchLower)) ||
        (item.description && item.description.toLowerCase().includes(searchLower)) ||
        (item.marketplaceData && item.marketplaceData.tags && 
          item.marketplaceData.tags.some((tag: string) => tag.toLowerCase().includes(searchLower)))
      );
    }
    
    if (!isNaN(minPrice)) {
      marketplaceItems = marketplaceItems.filter((item: any) => {
        // Check original price
        const price = parseFloat(item.listing.price.amount);
        
        // If item is on sale, check sale price
        if (item.promotion && item.promotion.isOnSale && item.promotion.salePrice) {
          const salePrice = parseFloat(item.promotion.salePrice);
          return salePrice >= minPrice;
        }
        
        return price >= minPrice;
      });
    }
    
    if (!isNaN(maxPrice)) {
      marketplaceItems = marketplaceItems.filter((item: any) => {
        // Check original price
        const price = parseFloat(item.listing.price.amount);
        
        // If item is on sale, check sale price
        if (item.promotion && item.promotion.isOnSale && item.promotion.salePrice) {
          const salePrice = parseFloat(item.promotion.salePrice);
          return salePrice <= maxPrice;
        }
        
        return price <= maxPrice;
      });
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'newest':
        marketplaceItems.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case 'oldest':
        marketplaceItems.sort((a: any, b: any) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        break;
      case 'priceAsc':
        marketplaceItems.sort((a: any, b: any) => {
          // Get effective prices (sale price if on sale, otherwise regular price)
          const priceA = (a.promotion && a.promotion.isOnSale) ? 
            parseFloat(a.promotion.salePrice) : 
            parseFloat(a.listing.price.amount);
            
          const priceB = (b.promotion && b.promotion.isOnSale) ? 
            parseFloat(b.promotion.salePrice) : 
            parseFloat(b.listing.price.amount);
            
          return priceA - priceB;
        });
        break;
      case 'priceDesc':
        marketplaceItems.sort((a: any, b: any) => {
          // Get effective prices (sale price if on sale, otherwise regular price)
          const priceA = (a.promotion && a.promotion.isOnSale) ? 
            parseFloat(a.promotion.salePrice) : 
            parseFloat(a.listing.price.amount);
            
          const priceB = (b.promotion && b.promotion.isOnSale) ? 
            parseFloat(b.promotion.salePrice) : 
            parseFloat(b.listing.price.amount);
            
          return priceB - priceA;
        });
        break;
      case 'nameAsc':
        marketplaceItems.sort((a: any, b: any) => 
          a.name.localeCompare(b.name)
        );
        break;
      case 'nameDesc':
        marketplaceItems.sort((a: any, b: any) => 
          b.name.localeCompare(a.name)
        );
        break;
      default:
        // Default to newest
        marketplaceItems.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
    
    // Paginate results
    const totalItems = marketplaceItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = marketplaceItems.slice(startIndex, startIndex + limit);
    
    // Get available categories, subcategories and tags for filtering
    const categories = [...new Set(
      rewards
        .filter((reward: any) => reward.listing && reward.listing.listed === true)
        .map((reward: any) => reward.marketplaceData?.category)
        .filter(Boolean)
    )];
    
    const subcategories = [...new Set(
      rewards
        .filter((reward: any) => reward.listing && reward.listing.listed === true)
        .map((reward: any) => reward.marketplaceData?.subcategory)
        .filter(Boolean)
    )];
    
    const rarities = [...new Set(
      rewards
        .filter((reward: any) => reward.listing && reward.listing.listed === true && reward.decentralandItem)
        .map((reward: any) => reward.decentralandItem?.rarity)
        .filter(Boolean)
    )];
    
    const allTags = rewards
      .filter((reward: any) => reward.listing && reward.listing.listed === true)
      .flatMap((reward: any) => reward.marketplaceData?.tags || [])
      .filter(Boolean);
      
    const tags = [...new Set(allTags)];
    
    const kinds = [...new Set(
      rewards
        .filter((reward: any) => reward.listing && reward.listing.listed === true)
        .map((reward: any) => reward.kind)
        .filter(Boolean)
    )];
    
    // Construct response with metadata
    const response = {
      metadata: {
        totalItems,
        itemsPerPage: limit,
        currentPage: page,
        totalPages,
        filters: {
          categories,
          subcategories,
          rarities,
          tags,
          kinds
        }
      },
      items: paginatedItems
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching marketplace rewards:", error);
    res.status(500).json({ 
      error: "Failed to fetch marketplace data", 
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}

/**
 * Handle single marketplace item details
 */
export function handleMarketplaceItemDetails(req: any, res: any) {
  try {
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    const itemId = req.params.id;
    
    // Find the specific reward
    const item = rewards.find((reward: any) => reward.id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    // Check if it's a marketplace item
    if (!item.listing || !item.listing.listed) {
      return res.status(404).json({ error: "Item is not available in marketplace" });
    }
    
    // Get creator profile
    const profiles = getCache(PROFILES_CACHE_KEY) || [];
    const creatorProfile = profiles.find((profile: any) => 
      profile.ethAddress.toLowerCase() === item.creator.toLowerCase()
    );
    
    // Add creator details to the response
    const itemWithCreator = {
      ...item,
      creatorProfile: creatorProfile ? {
        name: creatorProfile.name,
        ethAddress: creatorProfile.ethAddress,
        avatar: creatorProfile.avatar || null
      } : null
    };
    
    res.status(200).json(itemWithCreator);
  } catch (error) {
    console.error("Error fetching marketplace item:", error);
    res.status(500).json({ 
      error: "Failed to fetch item details", 
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}

/**
 * Handle marketplace filters and metadata
 */
export function handleMarketplaceFilters(req: any, res: any) {
  try {
    const rewards = getCache(REWARDS_CACHE_KEY) || [];
    
    // Only include rewards that are listed in marketplace
    const marketplaceItems = rewards.filter((reward: any) => 
      reward.listing && reward.listing.listed === true
    );
    
    // Extract all categories, subcategories and tags
    const categories = [...new Set(
      marketplaceItems
        .map((item: any) => item.marketplaceData?.category)
        .filter(Boolean)
    )];
    
    const subcategories = [...new Set(
      marketplaceItems
        .map((item: any) => item.marketplaceData?.subcategory)
        .filter(Boolean)
    )];
    
    const rarities = [...new Set(
      marketplaceItems
        .filter((item: any) => item.decentralandItem)
        .map((item: any) => item.decentralandItem?.rarity)
        .filter(Boolean)
    )];
    
    const allTags = marketplaceItems
      .flatMap((item: any) => item.marketplaceData?.tags || [])
      .filter(Boolean);
      
    const tags = [...new Set(allTags)];
    
    const kinds = [...new Set(
      marketplaceItems
        .map((item: any) => item.kind)
        .filter(Boolean)
    )];
    
    // Get price range
    const prices = marketplaceItems.map((item: any) => {
      // If item is on sale, use sale price
      if (item.promotion && item.promotion.isOnSale && item.promotion.salePrice) {
        return parseFloat(item.promotion.salePrice);
      }
      // Otherwise use regular price
      return parseFloat(item.listing.price.amount);
    }).filter((price: number) => !isNaN(price));
    
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    
    // Get currencies
    const currencies = [...new Set(
      marketplaceItems
        .map((item: any) => 
          item.listing.price.currency.symbol || 
          item.listing.price.currency.iso
        )
        .filter(Boolean)
    )];
    
    // Count featured and on sale items
    const featuredCount = marketplaceItems.filter((item: any) => 
      item.featured === true
    ).length;
    
    const onSaleCount = marketplaceItems.filter((item: any) => 
      item.promotion && item.promotion.isOnSale === true
    ).length;
    
    // Construct the response
    const response = {
      categories,
      subcategories,
      rarities,
      tags,
      kinds,
      priceRange: {
        min: minPrice,
        max: maxPrice
      },
      currencies,
      counts: {
        total: marketplaceItems.length,
        featured: featuredCount,
        onSale: onSaleCount
      }
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching marketplace filters:", error);
    res.status(500).json({ 
      error: "Failed to fetch filter data", 
      message: error instanceof Error ? error.message : "Unknown error" 
    });
  }
} 