import { Client } from "colyseus";
import { getCache, updateCache } from "../../utils/cache";
import { QUEST_TEMPLATES_CACHE_KEY, VERSES_CACHE_KEY, VERSES_FILE } from "../../utils/initializer";
import { v4 } from "uuid";
    
    export function handleCreateVerse(client: Client, message: any) {
        console.log("handleCreateVerse", message)
        // Ensure only the verse creator can create it
        const clientId = client.userData?.userId;
        if (!clientId || (clientId !== message.creator && clientId !== "Admin")) {
          client.send("VERSE_ERROR", { message: "Not authorized to create verse" });
          return;
        }
    
        const verse = message;
        verse.id = v4();
    
        // Get existing verses
        const verses = getCache(VERSES_CACHE_KEY)
        verses.push(verse);
    
        // Send to client
        client.send("VERSE_CREATED", verse);
      }
    
      export function handleEditVerse(client: Client, message: any) {
        // Ensure only the verse creator can edit it
        const clientId = client.userData?.userId;
        if (!clientId || (clientId !== message.creator && clientId !== "Admin")) {
          client.send("VERSE_ERROR", { message: "Not authorized to edit this verse" });
          return;
        }
    
        // Get existing verses
        const verses = getCache(VERSES_CACHE_KEY) || [];
        const idx = verses.findIndex((v: any) => v.id === message.id);
    
        if (idx === -1) {
          client.send("VERSE_ERROR", { message: "Verse not found" });
          return;
        }
    
        // Update verse
        verses[idx] = message;
    
        // Update cache
        // updateCache(VERSES_CACHE_KEY, VERSES_FILE, verses);
    
        // Send to client
        client.send("VERSE_EDITED", message);
      }
    
      export function handleDeleteVerse(client: Client, message: any) {
        // Ensure only the verse creator can delete it
        const clientId = client.userData?.userId;
        
        // Get existing verses
        let verses = getCache(VERSES_CACHE_KEY) || [];
        const verse = verses.find((v: any) => v.id === message.id);
        
        if (!verse) {
          client.send("VERSE_ERROR", { message: "Verse not found" });
          return;
        }
        
        if (!clientId || (clientId !== verse.creator && clientId !== "Admin")) {
          client.send("VERSE_ERROR", { message: "Not authorized to delete this verse" });
          return;
        }
    
        // Check if verse is used in any quests
        const quests = getCache(QUEST_TEMPLATES_CACHE_KEY) || [];
        const verseInUse = quests.some((quest: any) => {
          return quest.verses && quest.verses.includes(message.id);
        });
    
        if (verseInUse) {
          client.send("VERSE_ERROR", { message: "Cannot delete verse as it is used in one or more quests" });
          return;
        }
    
        // Remove verse
        let newVerses = verses.filter((v: any) => v.id !== message.id);
        updateCache(VERSES_CACHE_KEY, VERSES_FILE, newVerses);
    
        // Send to client
        client.send("VERSE_DELETED", { id: message.id });
      }
    
