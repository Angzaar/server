import * as fs from 'fs';
import * as path from 'path';

// Fix for the quest.id error
interface QuestDefinition {
  questId: string;
  version: number;
  steps: {
    stepId: string;
    name: string;
    tasks: {
      taskId: string;
      description: string;
      requiredCount: number;
      metaverse: string;
    }[];
  }[];
}

function generateRandomId(length: number = 9): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function migrateProfiles() {
  console.log('Starting profile migration...');
  
  // Load profiles
  const profilesPath = path.join(__dirname, '../../data/profiles.json');
  const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  
  // Load quests for reference
  const questsPath = path.join(__dirname, '../../data/quests.json');
  const quests = JSON.parse(fs.readFileSync(questsPath, 'utf8'));
  
  console.log(`Loaded ${profiles.length} profiles and ${quests.length} quests.`);
  
  let migratedCount = 0;
  let alreadyMigratedCount = 0;
  let noQuestsCount = 0;
  let removedDuplicatesCount = 0;
  
  // Process each profile
  for (const profile of profiles) {
    // Skip profiles without quest progress
    if (!profile.questsProgress || profile.questsProgress.length === 0) {
      noQuestsCount++;
      continue;
    }
    
    let profileModified = false;
    
    // Process each quest progress entry
    for (let i = 0; i < profile.questsProgress.length; i++) {
      const questProgress = profile.questsProgress[i];
      
      // Check for duplicated data (has both top-level steps and attempts array)
      if (questProgress.steps && questProgress.attempts && Array.isArray(questProgress.attempts) && questProgress.attempts.length > 0) {
        // Remove top-level steps if they're already in attempts
        delete questProgress.steps;
        profileModified = true;
        removedDuplicatesCount++;
        continue;
      }
      
      // Skip if already in the new format with attempts
      if (questProgress.attempts && Array.isArray(questProgress.attempts) && questProgress.attempts.length > 0) {
        alreadyMigratedCount++;
        continue;
      }
      
      // This is a legacy format quest progress - convert to attempts format
      console.log(`Migrating quest ${questProgress.questId} for user ${profile.name || profile.ethAddress}`);
      
      // Find the quest definition
      const questDef = quests.find((q: QuestDefinition) => q.questId === questProgress.questId);
      if (!questDef) {
        console.warn(`Quest definition not found for quest ${questProgress.questId}`);
        continue;
      }
      
      // Create attempt object
      const attempt = {
        attemptId: generateRandomId(),
        attemptNumber: 1,
        startTime: questProgress.startTime || 0,
        completionTime: questProgress.completed ? (questProgress.timeCompleted || questProgress.startTime || 0) : 0,
        elapsedTime: questProgress.elapsedTime || 0,
        completed: !!questProgress.completed,
        started: !!questProgress.started,
        status: questProgress.completed ? 'completed' : 'in-progress',
        steps: questProgress.steps ? JSON.parse(JSON.stringify(questProgress.steps)) : []
      };
      
      // Add attempts array
      questProgress.attempts = [attempt];
      
      // Remove top-level steps property after migration
      delete questProgress.steps;
      
      profileModified = true;
      migratedCount++;
    }
    
    // Log migration progress periodically
    if (migratedCount % 100 === 0 && migratedCount > 0) {
      console.log(`Migrated ${migratedCount} quest progress entries so far...`);
    }
  }
  
  // Save updated profiles
  if (migratedCount > 0 || removedDuplicatesCount > 0) {
    const backupPath = `${profilesPath}.backup-${Date.now()}`;
    fs.copyFileSync(profilesPath, backupPath);
    console.log(`Created backup at ${backupPath}`);
    
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
    console.log(`Saved updated profiles to ${profilesPath}`);
  }
  
  console.log(`
Migration complete!
- Total profiles: ${profiles.length}
- Profiles with no quests: ${noQuestsCount}
- Already migrated quest entries: ${alreadyMigratedCount}
- Migrated quest entries: ${migratedCount}
- Removed duplicate steps: ${removedDuplicatesCount}
  `);
}

// Run the migration
migrateProfiles().catch(error => {
  console.error('Migration failed:', error);
}); 