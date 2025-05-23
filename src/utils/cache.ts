import fs from "fs";
import path from "path";

const cache = new Map<string, any>();

// Utility to load data into cache
export const loadCache = (filePath: string, key: string) => {
  try {
    if (fs.existsSync(path.resolve(filePath))) {
      const data = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf-8"));
      cache.set(key, data);
      return data;
    } else {
      console.log(`File not found at ${filePath}, initializing empty cache for ${key}`);
      // Initialize with empty array or object depending on the key
      const initialData = key.includes('TRANSACTIONS') ? [] : {};
      cache.set(key, initialData);
      // Create the file with empty data
      fs.writeFileSync(path.resolve(filePath), JSON.stringify(initialData, null, 2));
      return initialData;
    }
  } catch (error) {
    console.error(`Error loading cache for ${key} from ${filePath}:`, error);
    throw new Error("Failed to initialize cache.");
  }
};

// Utility to get data from cache
export const getCache = (key: string) => {
  if (!cache.has(key)) {
    throw new Error(`Cache miss for key: ${key}`);
  }
  return cache.get(key);
};

// Utility to update cache and sync to file
export const updateCache = async (filePath: string, key: string, data: any): Promise<void> => {
  cache.set(key, data); // Update cache
};

export const cacheSyncToFile = async (filePath: string, key: string, data: any): Promise<void> => {
  try {
    if (cache.has(key)) {
      const data = cache.get(key);
      fs.writeFileSync(path.resolve(filePath), JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error(`Error writing ${key} to file: ${filePath}`, error);
    throw new Error("Failed to sync cache to file.");
  }
}
