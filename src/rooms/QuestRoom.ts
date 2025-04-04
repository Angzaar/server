import { Room, Client, ServerError, generateId } from "colyseus";
import { Schema, type, MapSchema } from '@colyseus/schema';
import { getCache } from "../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY } from "../utils/initializer";
import { v4 } from "uuid";
import { validateAndCreateProfile } from "./MainRoomHandlers";
import { getRandomString } from "../utils/questing";

interface EphemeralCodeData {
  questId: string;
  expires: number; // a timestamp in ms
}

export interface TaskDefinition {
  taskId: string;
  requiredCount: number;
  description: string;
  metaverse: 'DECENTRALAND' | 'HYPERFY';
  prerequisiteTaskIds: string[];
}

export interface StepDefinition {
  stepId: string;
  name: string;
  tasks: TaskDefinition[];
  
  /**
   * The key to mixing linear and branching:
   * `prerequisiteStepIds` lists which steps
   * must be completed before this step can start.
   *
   * - If empty or undefined => user can do this step anytime (branching).
   * - If it has one step => a simple linear chain from that step.
   * - If it has multiple => you need multiple steps done first.
   */
  prerequisiteStepIds?: string[];
}

export interface QuestDefinition {
    questId: string;
    version: number;
    enabled:boolean,
    questType: 'LINEAR' | 'OPEN_ENDED' | 'ONE_SHOT'; 
    startTrigger: 'EXPLICIT' | 'FIRST_TASK';
    title: string;
    startTime?: number;        // Unix timestamp in ms
    endTime?: number;          // Unix timestamp in ms
    allowReplay?: boolean;
    creator: string;   // e.g. an ethAddress
    // The new field:
    steps: StepDefinition[];        // array of steps in the quest
}

export const ephemeralCodes: Record<string, EphemeralCodeData> = {};

class QuestState extends Schema {
  @type('string') questId: string = '';
}

export class QuestRoom extends Room<QuestState> {
  private questDefinition: QuestDefinition | null = null; // raw quest object

  async onAuth(client: Client, options: any, req: any) {
    try {
      console.log('options are', options);
      await validateAndCreateProfile(client, options, req);
      return client.auth;
    } catch (error: any) {
      console.error("Error during onAuth:", error.message);
      throw error;
    }
  }

  onCreate(options: any) {
    this.setState(new QuestState());
    console.log("QuestRoom created with filter questId. Options:", options);

    // The questId will be set in loadQuest anyway, but let's store it here for clarity
    this.state.questId = options.questId;

    if(options.questId !== "creator"){
      this.loadQuest(options.questId);
    }

    this.onMessage("QUEST_CREATE", (client: Client, message: any) =>
      this.handleCreateQuest(client, message)
    );
    this.onMessage("QUEST_RESET", (client: Client, message: any) =>
      this.handleResetQuest(client, message)
    );
    this.onMessage("QUEST_EDIT", (client: Client, message: any) =>
      this.handleEditQuest(client, message)
    );
    this.onMessage("QUEST_START", (client: Client, message: any) =>
      this.handleStartQuest(client, message)
    );
    this.onMessage("QUEST_ACTION", (client: Client, message: any) =>
      this.handleQuestAction(client, message)
    );
    this.onMessage("QUEST_REPLAY", (client: Client, message: any) =>
      this.handleQuestAction(client, message)
    );
    this.onMessage("QUEST_END", (client: Client, message: any) =>
      this.handleEndQuest(client, message)
    );

    this.onMessage("QUEST_OUTLINE", (client: Client, message: any) =>
      this.handleQuestOutline(client, message)
    );
  }

  onJoin(client: Client, options: any) {
    console.log(`Client joined, sessionId=${client.sessionId}, questId=${options.questId}`);

    if(options.questId === "creator"){
      let quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
      client.send("QUEST_CREATOR", quests.filter((q:any) => q.creator === client.userData.userId))
      return
    }

    if(!this.questDefinition){
        if(!this.loadQuest(options.questId)){
          client.leave(4011)
          return;
        }
    }

    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    if (!profile) return;

    // console.log('profile is', profile)

    let userQuestInfo = profile.questsProgress.find(
      (q: any) =>
        q.questId === options.questId &&
        q.questVersion === this.questDefinition!.version
    );
    if(userQuestInfo && userQuestInfo.started && !userQuestInfo.completed){
      userQuestInfo.startTime = Math.floor(Date.now()/1000)
    }
    client.send("QUEST_CONNECTION", {connected:true, questId:options.questId})
    client.send("QUEST_DATA", userQuestInfo)
    // console.log(this.questDefinition)
  
  }

  private loadQuest(questId: string) {
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const quest = quests.find((q: any) => q.questId === questId);
    if (!quest) {
      console.log('this quest id does not exist in the system');
      return false;
    }

    this.state.questId = questId;
    this.questDefinition = quest;

    console.log(`Loaded quest "${questId}" allowReplay=${this.questDefinition.allowReplay}`);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Client left: ${client.sessionId} (consented=${consented})`);
    // Clean up if needed

    // 5) Find the user's profile
    const profiles = getCache(PROFILES_CACHE_KEY);
    const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
    if (!profile || !this.questDefinition) return;

    // 6) Get or create the user's quest progress record (for current version)
    let userQuestInfo = profile.questsProgress.find(
      (q: any) =>
        q.questId === this.state.questId &&
        q.questVersion === this.questDefinition.version
    );
    if (userQuestInfo) {
      userQuestInfo.elapsedTime += Math.floor(Date.now()/1000) - userQuestInfo.startTime
    }
  }

/**************************************
   * handleQuestAction 
   * increments a particular task in a step, checking prereqs
   **************************************/
async handleQuestAction(client: Client, payload: any) {
  console.log('handle quest action', payload)
  // console.log(this.questDefinition)

  // 1) Validate we have a questDefinition loaded
  if (!this.questDefinition){
    console.warn('no quest definition to handle quest action')
    return;
  }

  const { questId, stepId, taskId, metaverse } = payload;

  // 2) Check if questId matches the one we loaded
  if (questId !== this.questDefinition.questId) {
    console.warn(`[QuestRoom] Mismatch questId => got="${questId}", expect="${this.questDefinition.questId}".`);
    return;
  }

  // 3) If the quest is disabled or ended, reject
  if (!this.questDefinition.enabled) {
    console.warn('Quest is disabled or ended.')
    client.send("QUEST_ERROR", { message: "Quest is disabled or ended." });
    return;
  }

  // 4) Optional time checks (startTime / endTime)
  const now = Date.now();
  if (this.questDefinition.startTime && now < this.questDefinition.startTime) {
    console.warn('Quest not yet active.')
    client.send("QUEST_ERROR", { message: "Quest not yet active." });
    return;
  }
  if (this.questDefinition.endTime && now >= this.questDefinition.endTime) {
    console.warn('Quest already over.')
    client.send("QUEST_ERROR", { message: "Quest already over." });
    return;
  }

  // 5) Find the user's profile
  const profiles = getCache(PROFILES_CACHE_KEY);
  const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
  if (!profile) return;

  // 6) Get or create the user's quest progress record (for current version)
  let userQuestInfo = profile.questsProgress.find(
    (q: any) =>
      q.questId === questId &&
      q.questVersion === this.questDefinition!.version
  );
  if (!userQuestInfo) {
    // Possibly auto-start if FIRST_TASK or bail if the quest requires explicit start
    userQuestInfo = await this.handleStartQuest(client, { questId }, /*autoStart*/ true);
    if (!userQuestInfo) return;
  }

  // 7) Find the step definition in the quest
  const stepDef = this.questDefinition.steps.find((s) => s.stepId === stepId);
  if (!stepDef) {
    console.warn(`[QuestRoom] No step="${stepId}" found in quest definition.`);
    return;
  }

  // 8) Check prerequisites
  if (!this.canUserWorkOnStep(userQuestInfo, stepDef)) {
    client.send("QUEST_ERROR", { message: "You haven't completed the prerequisites for this step." });
    return;
  }
  
  console.log('user can work on step')

  // 9) Find or create the user's step record
  let userStep = userQuestInfo.steps.find((s: any) => s.stepId === stepId);
  if (!userStep) {
    // create a new step record for the user
    userStep = {
      stepId,
      completed: false,
      tasks: stepDef.tasks.map((t) => ({
        taskId: t.taskId,
        count: 0
      }))
    };
    userQuestInfo.steps.push(userStep);
  }

  // 10) Find the task definition and userTask progress
  const taskDef = stepDef.tasks.find((t) => t.taskId === taskId);
  if (!taskDef) {
    console.warn(`[QuestRoom] No taskId="${taskId}" in step="${stepId}" definition.`);
    return;
  }

  console.log('task exists')


  // 11) Find the user's task progress
  let userTask = userStep.tasks.find((t: any) => t.taskId === taskId);
  if (!userTask) {
    console.warn(`[QuestRoom] No taskId="${taskId}" in step="${stepId}". Possibly old or mismatch?`);
    return;
  }

  if (taskDef.metaverse !== metaverse) {
    client.send("QUEST_ERROR", {
      message: `This task requires ${taskDef.metaverse} environment, but you reported ${metaverse}.`
    });
    return;
  }

  console.log('task is in current metaverse, contiue')

  if (taskDef.prerequisiteTaskIds.length > 0) {
    for (const prereqId of taskDef.prerequisiteTaskIds) {
      // find the user's progress for that prereq task
      const prereqDef = stepDef.tasks.find((t) => t.taskId === prereqId);
      if (!prereqDef) {
        // Edge case: maybe the definition is invalid or the ID doesn't exist
        client.send("QUEST_ERROR", {
          message: `Task "${taskId}" depends on unknown task "${prereqId}" in step "${stepDef.stepId}".`
        });
        return;
      }
      // find user's progress for that prereq
      const prereqUserTask = userStep.tasks.find((t: any) => t.taskId === prereqId);
      if (!prereqUserTask) {
        // means user hasn't even started that prereq
        client.send("QUEST_ERROR", {
          message: `You must complete task "${prereqId}" before doing "${taskId}".`
        });
        return;
      }

      // check if it's "complete", i.e. count >= requiredCount
      const requiredCount = prereqDef.requiredCount ?? 0;
      if (prereqUserTask.count < requiredCount) {
        // not yet done
        client.send("QUEST_ERROR", {
          message: `You must finish task "${prereqId}" (need ${requiredCount} count) before doing "${taskId}".`
        });
        return;
      }
    }
  }

  if(userTask.completed){
    console.log('user already completed that task')
    return
  }

  console.log('user can complete task')

  // 12) Increment the count (count-only approach)
  userTask.count++;
  console.log(`[QuestRoom] user="${client.userData.userId}" incremented task="${taskId}" in step="${stepId}", quest="${questId}" => now count=${userTask.count}`);


  if(userTask.count >= taskDef.requiredCount){
    userTask.completed = true
    client.send("TASK_COMPLETE", {questId, stepId, taskId, taskName:taskDef.description})
  }

  // 13) Check if this step is now completed
  //     A step is complete if all tasks in stepDef have userTask.count >= requiredCount
  const isStepDone = stepDef.tasks.every((defTask) => {
    const ut = userStep.tasks.find((u: any) => u.taskId === defTask.taskId);
    const reqCount = defTask.requiredCount ?? 0;
    // If user hasn't recorded the task or count < req => not done
    return ut && (ut.count >= reqCount);
  });

  if (isStepDone && !userStep.completed) {
    userStep.completed = true;
    // Optionally broadcast so front-end knows a step is done
    client.send("STEP_COMPLETE", { questId, stepId});
    console.log(`[QuestRoom] user="${client.userData.userId}" completed step="${stepId}" in quest="${questId}".`);
  }

  // 13) Check if all steps are done => quest complete
  const allStepsDone = this.questDefinition.steps.every((defStep) => {
    const st = userQuestInfo.steps.find((u: any) => u.stepId === defStep.stepId);
    return st && st.completed;
  });

  if (allStepsDone && !userQuestInfo.completed) {
    userQuestInfo.completed = true;
    userQuestInfo.elapsedTime += Math.floor(Date.now()/1000) - userQuestInfo.startTime
    this.broadcast("QUEST_COMPLETE", { questId, user: client.userData.userId });
    console.log(`[QuestRoom] user="${client.userData.userId}" completed quest="${questId}" fully!`);
  
    // === NEW: If it's a ONE_SHOT quest, disable it for everyone ===
    if (this.questDefinition.questType === "ONE_SHOT") {
      console.log(`[QuestRoom] ONE_SHOT quest completed => disabling quest="${questId}"`);
      // 2) Mark quest as disabled so new attempts are blocked
      this.questDefinition.enabled = false;

      // === NEW: Now sync changes to the local cache ===
      syncQuestToCache(questId, this.questDefinition);

      this.forceEndQuestForAll(questId, this.questDefinition.version);
  
      // 3) Broadcast that the quest was disabled
      this.broadcast("QUEST_DISABLED", { questId, reason: "ONE_SHOT completed" });
    }
  }
}


/**************************************
 * canUserWorkOnStep
 * checks if all prerequisite steps are completed
 **************************************/
private canUserWorkOnStep(userQuestInfo: any, stepDef: StepDefinition): boolean {
  if (!stepDef.prerequisiteStepIds || stepDef.prerequisiteStepIds.length === 0) {
    return true; // no prereqs => branching step
  }
  // must have all required steps completed
  for (const prereqId of stepDef.prerequisiteStepIds) {
    const userSt = userQuestInfo.steps.find((s: any) => s.stepId === prereqId);
    if (!userSt || !userSt.completed) {
      return false;
    }
  }
  return true;
}

/**************************************
   * handleStartQuest 
   * user tries to start a quest (explicit) or autoStart (FIRST_TASK).
   **************************************/
async handleStartQuest(client: Client, payload: any, autoStart = false) {
  if (!this.questDefinition) return null;
  const { questId } = payload;

  if (questId !== this.questDefinition.questId) {
    client.send("QUEST_ERROR", { message: "Quest ID mismatch." });
    return null;
  }
  if (!this.questDefinition.enabled) {
    client.send("QUEST_ERROR", { message: "Quest is disabled or ended." });
    return null;
  }

  // If not autoStart but quest says FIRST_TASK, or vice versa, handle
  if (!autoStart && this.questDefinition.startTrigger === 'FIRST_TASK') {
    client.send("QUEST_ERROR", { message: "This quest auto-starts on first task; no explicit start needed." });
    return null;
  }
  if (autoStart && this.questDefinition.startTrigger !== 'FIRST_TASK') {
    // It's possible the user just forced a start, up to your logic
    // We'll allow it for demonstration
  }

  // time checks
  const now = Date.now();
  if (this.questDefinition.startTime && now < this.questDefinition.startTime) {
    client.send("QUEST_ERROR", { message: "Quest not active yet (startTime not reached)." });
    return null;
  }
  if (this.questDefinition.endTime && now >= this.questDefinition.endTime) {
    client.send("QUEST_ERROR", { message: "Quest already ended." });
    return null;
  }

  // get user profile
  const profiles = getCache(PROFILES_CACHE_KEY);
  const profile = profiles.find((p: any) => p.ethAddress === client.userData.userId);
  if (!profile) return null;

  // find or create userQuestInfo
  let userQuestInfo = profile.questsProgress.find((q: any) =>
    q.questId === questId && q.questVersion === this.questDefinition!.version
  );
  if (!userQuestInfo) {
    userQuestInfo = {
      questId,
      questVersion: this.questDefinition.version,
      started: true,
      startTime:Math.floor(Date.now()/1000),
      elapsedTime:0,
      completed: false,
      steps: []
    };
    // If you want to pre-populate steps, you can do so here
    profile.questsProgress.push(userQuestInfo);
    console.log(`[QuestRoom] user="${client.userData.userId}" started quest="${questId}", version=${this.questDefinition.version}`);
  } else {
    if (!userQuestInfo.started) {
      userQuestInfo.started = true;
      console.log(`[QuestRoom] user="${client.userData.userId}" re-started quest="${questId}" (already had a record).`);
    }
  }
  if(!autoStart){
    client.send("QUEST_STARTED", { questId });
  }

  client.send("QUEST_DATA", userQuestInfo)
  return userQuestInfo;
}

  /**
   * handleCreateQuest => create a brand new quest template in memory (and not yet saved to disk).
   * Using a random UUID for questId. This is optional - you could let the user pick an ID.
   */
  private handleCreateQuest(client: Client, payload: any) {
    const { questType, enabled, steps, title, startTime, endTime } = payload;
    if (!questType || !steps) {
      client.send("QUEST_ERROR", { message: "Missing required fields (questType, steps)." });
      return;
    }

    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const questId = getRandomString(6)

    const existingQuest = quests.find((q: QuestDefinition) => q.questId === questId);
    if (existingQuest) {
      client.send("QUEST_ERROR", { message: `Quest '${questId}' already exists.` });
      return;
    }

    const newQuest: QuestDefinition = {
      questId,
      version: 1, 
      enabled: enabled,
      questType,
      startTrigger: payload.startTrigger ?? 'EXPLICIT',
      title: title ?? "Untitled Quest",
      allowReplay: payload.allowReplay ?? false,
      creator: client.userData.userId,
      steps: steps || [],
      startTime,
      endTime,
    };

    quests.push(newQuest);
    client.send("QUEST_CREATED", newQuest);
    console.log(`[QuestRoom] user="${client.userData.userId}" created quest="${questId}" version=1`);
  }

  handleEndQuest(client: Client, payload: any) {
    console.log('handling quest end', payload)

    const { questId, taskId, enabled } = payload;

    if(this.state.questId === "creator"){
      const quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
      let quest:QuestDefinition = quests.find((q:QuestDefinition)=> q.questId === questId)
      if(!quest){
        console.log('no quest found in creator room to end or disable')
        return
      }

      if (client.userData.userId !== quest.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
      }

      quest.enabled = enabled
      this.forceEndQuestForAll(questId, quest.version);
    }else{

      if (client.userData.userId !== this.questDefinition.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
      }

      if(!this.questDefinition){
        console.log("Creator trying to cancel a quest with no definition")
        return
      }
      this.questDefinition.enabled = enabled
      syncQuestToCache(questId, this.questDefinition)
      this.forceEndQuestForAll(questId, this.questDefinition.version);
    }

    client.send("QUEST_ENDED", { questId });
      return;
  }

  async handleResetQuest(client: Client, payload: any) {
    if (!this.questDefinition) return;
  
    const { questId, enabled } = payload;

    if (client.userData.userId !== this.questDefinition.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
    }

    this.questDefinition.enabled = enabled
    syncQuestToCache(questId, this.questDefinition)

    await this.forceEndQuestForAll(questId, this.questDefinition.version)
    this.forceResetQuestData(questId, true)
    return;
  }

  /**************************************
   * handleEditQuest 
   * partial updates: e.g. editing title, steps, times
   **************************************/
  private handleEditQuest(client: Client, payload: any) {
    console.log('handle queset edit', payload)
    const { questId, questType, startTrigger, title, steps, enabled, allowReplay, startTime, endTime } = payload;

    // 1) find in TEMPLATES_FILE_CACHE_KEY
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
    const quest = quests.find((q: QuestDefinition) => q.questId === questId);
    if (!quest) {
      client.send("QUEST_ERROR", { message: `Quest '${questId}' not found in cache.` });
      return;
    }

    // Only creator can edit
    if (client.userData.userId !== quest.creator) {
      client.send("QUEST_ERROR", { message: "Only the quest creator can edit this quest." });
      return;
    }

    console.log('applying quest partial changes')

    // 2) apply partial changes
    if (typeof title === 'string') {
      quest.title = title;
    }
    if (typeof questType === 'string') {
      quest.questType = questType;
    }
    if (typeof startTrigger === 'string') {
      quest.startTrigger = startTrigger;
    }
    if (Array.isArray(steps)) {
      quest.steps = steps;
    }
    if (typeof enabled === 'boolean') {
      quest.enabled = enabled;
    }
    if (typeof allowReplay === 'boolean') {
      quest.allowReplay = allowReplay;
    }
    if (typeof startTime === 'number') {
      quest.startTime = startTime;
    }
    if (typeof endTime === 'number') {
      quest.endTime = endTime;
    }

    // 3) confirm
    client.send("QUEST_EDITED", quest);
    console.log(`[QuestRoom] user="${client.userData.userId}" edited quest="${questId}"`);
  }

  private handleQuestOutline(client:Client, payload:any){
    console.log('handling quest outline', payload)

    const { questId, taskId, enabled } = payload;

    if(this.state.questId === "creator"){
      const quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
      let quest:QuestDefinition = quests.find((q:QuestDefinition)=> q.questId === questId)
      if(!quest){
        console.log('no quest found in creator room to end or disable')
        return
      }

      if (client.userData.userId !== quest.creator) {
        client.send("QUEST_ERROR", { message: "Only the quest creator can end this quest." });
        return;
      }

      // 2) generate a random code
      const code = v4().slice(0, 8); // e.g. 8-char code
    
      // 3) store in ephemeral map
      ephemeralCodes[code] = {
        questId,
        expires: Date.now() + 60 * 1000 // 60 seconds from now
      };

      client.send("QUEST_OUTLINE", {questId:questId, code:code})
    }
  }

/**************************************
   * handleIterateQuest 
   * increments version (force-ends old version for all)
   **************************************/
private handleIterateQuest(client: Client, payload: any) {
  if (!this.questDefinition) return;

  const { questId, enabled } = payload;
  if (questId !== this.questDefinition.questId) {
    client.send("QUEST_ERROR", { message: "Quest ID mismatch." });
    return;
  }
  if (client.userData.userId !== this.questDefinition.creator) {
    client.send("QUEST_ERROR", { message: "Only the creator can iterate this quest." });
    return;
  }

  //disable the quest before the iteration
  this.questDefinition.enabled = false
  syncQuestToCache(questId, this.questDefinition);

  // 1) end old version
  this.forceEndQuestForAll(questId, this.questDefinition.version);

  // 2) increment version in TEMPLATES_FILE_CACHE_KEY
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const idx = quests.findIndex((q: QuestDefinition) => q.questId === questId);
  if (idx < 0) {
    client.send("QUEST_ERROR", { message: `Quest '${questId}' not found.` });
    return;
  }
  quests[idx].version++;
  this.questDefinition.version = quests[idx].version;

  //enable or disable the quest after we have iterated it
  this.questDefinition.enabled = enabled
  syncQuestToCache(questId, this.questDefinition);

  // 3) broadcast
  this.broadcast("QUEST_VERSION_INCREMENTED", {
    questId,
    newVersion: this.questDefinition.version
  });
  console.log(`[QuestRoom] user="${client.userData.userId}" iterated quest="${questId}" to version=${this.questDefinition.version}`);
}
  
  private forceEndQuestForAll(questId: string, version: number) {
    if (!this.questDefinition) return;

    const profiles = getCache(PROFILES_CACHE_KEY);
    for (const profile of profiles) {
      if (!profile.questsProgress) continue;
      // find quest record by questId + version
      const userQuestInfo = profile.questsProgress.find(
        (q: any) => q.questId === questId && q.questVersion === version
      );
      if (!userQuestInfo) continue;
  
      if (!userQuestInfo.completed) {
        userQuestInfo.completed = true;
      }
    }

    this.broadcast("QUEST_ENDED", { questId, endedBy: this.questDefinition.creator });
    console.log(`[QuestRoom] The quest "${questId}" was forcibly ended by creator="${this.questDefinition.creator}" for all participants.`);
  }

  private forceResetQuestData(questId: string, forAll?:boolean, userId?:string) {
    if (!this.questDefinition) return;

    const profiles = getCache(PROFILES_CACHE_KEY);

    if(forAll){
        for(let i = 0; i < profiles.length; i++){
            let profile = profiles[i]
            if(!profile || !profile.hasOwnProperty("questsProgress")) continue;
    
    
          // 2) Find the quest record, if any
          const userQuestIndex = profile.questsProgress.findIndex((q: any) => q.questId === questId);
          if (userQuestIndex < 0) continue;

          profile.questsProgress.splice(userQuestIndex, 1)
        }
    }
    else{
        let profile = profiles.find((p:any)=> p.ethAddress === userId)
        if(!profile || !profile.hasOwnProperty("questsProgress")) return;


        // 2) Find the quest record, if any
        const userQuestIndex = profile.questsProgress.findIndex((q: any) => q.questId === questId);
        if (userQuestIndex < 0) return;

        profile.questsProgress.splice(userQuestIndex, 1)
    }
    console.log(`[QuestRoom] The quest data "${questId}" was forcibly reset by creator="${this.questDefinition.creator}" for all participants.`);
  }
  
}

function syncQuestToCache(questId: string, updatedQuest: QuestDefinition) {
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const questIndex = quests.findIndex((q: QuestDefinition) => q.questId === questId);
  if (questIndex >= 0) {
    quests[questIndex] = updatedQuest;
  }
}

//