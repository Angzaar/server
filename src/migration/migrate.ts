import * as fs from 'fs';
import * as path from 'path';

// Define interface for QuestDefinition to fix linter error
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

// Utility function to generate random IDs for attempts
function generateRandomId(length: number = 9): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Migrates profiles from legacy format to the new attempts-based format
 */
async function migrateProfiles(options: { dryRun: boolean }) {
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
  let errorCount = 0;
  
  // Process each profile
  for (const profile of profiles) {
    // Skip profiles without quest progress
    if (!profile.questsProgress || profile.questsProgress.length === 0) {
      noQuestsCount++;
      continue;
    }

    // profile.questProgress = profile.questProgress.filter((q:any)=> q.questId === "KsyZNX")
    
    // let questProgress:any
    // if(profile.questProgress.length === 0) continue;

    // questProgress = profile.questProgress[0]
    // Process each quest progress entry
   for (let i = 0; i < profile.questsProgress.length; i++) {
      const questProgress = profile.questsProgress[i];
      
      // Skip if already in the new format with attempts
      if (questProgress.attempts && Array.isArray(questProgress.attempts) && questProgress.attempts.length > 0) {
        console.log('already migrated profile', profile.name)
        alreadyMigratedCount++;
        continue;
      }
      
      try {
        // This is a legacy format quest progress - convert to attempts format
        console.log(`Migrating quest ${questProgress.questId} for user ${profile.name || profile.ethAddress}`);
        
        // Find the quest definition
        const questDef = quests.find((q: QuestDefinition) => q.questId === questProgress.questId);
        if (!questDef) {
          console.warn(`Quest definition not found for quest ${questProgress.questId}`);
          errorCount++;
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
          // Deep clone the steps to avoid reference issues
          steps: questProgress.steps ? JSON.parse(JSON.stringify(questProgress.steps)) : []
        };
        
        // Add attempts array
        questProgress.attempts = [attempt];
        
        migratedCount++;
      } catch (error) {
        console.error(`Error migrating quest ${questProgress.questId} for user ${profile.name || profile.ethAddress}:`, error);
        errorCount++;
      }
    }
    
    // Log migration progress periodically
    if (migratedCount % 100 === 0 && migratedCount > 0) {
      console.log(`Migrated ${migratedCount} quest progress entries so far...`);
    }
  }
  
  // Save updated profiles if not in dry run mode
  if (migratedCount > 0 && !options.dryRun) {
    // Create backup
    const backupPath = `${profilesPath}.backup-${Date.now()}`;
    fs.copyFileSync(profilesPath, backupPath);
    console.log(`Created backup at ${backupPath}`);
    
    // Save updated profiles
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
    console.log(`Saved updated profiles to ${profilesPath}`);
  } else if (options.dryRun) {
    console.log(`DRY RUN: Would have migrated ${migratedCount} quest progress entries`);
  }
  
  console.log(`
Migration complete!
- Total profiles: ${profiles.length}
- Profiles with no quests: ${noQuestsCount}
- Already migrated quest entries: ${alreadyMigratedCount}
- Newly migrated quest entries: ${migratedCount}
- Errors: ${errorCount}
${options.dryRun ? '- DRY RUN: No changes were saved' : ''}
  `);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run') || args.includes('-d')
};

if (options.dryRun) {
  console.log('Running in DRY RUN mode - no changes will be saved');
}

// Run the migration
migrateProfiles(options).catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
}); 