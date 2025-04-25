import { getCache } from "./cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY } from "./initializer";
import { QuestDefinition, StepDefinition, TaskDefinition } from "../components/TheForge/utils/types";

export function handleQuestOutline(req:any, res:any){
    const questId = req.query.questId as string;
    const code = req.query.code as string;
    const format = req.query.format; // e.g. 'html'

    let ip = req.headers['x-forwarded-for'] || req.socket.address().address;
    console.log('handleQuestOutline', questId, code, format, ip)

    if (!questId){//} || !code) {
      return res.status(400).json({ error: 'Missing questId or code' });
    }
  
    // // 1) check ephemeralCodes to see if code is valid
    // const record = ephemeralCodes[code];
    // if (!record) {
    //   return res.status(401).json({ error: 'Invalid or expired code' });
    // }
  
    // // 2) check if it has expired
    // if (Date.now() > record.expires) {
    //   // If expired, remove it from map
    //   delete ephemeralCodes[code];
    //   return res.status(401).json({ error: 'Code has expired' });
    // }
  
    // // 3) check if record.questId matches the requested questId
    // if (record.questId !== questId) {
    //   return res.status(403).json({ error: 'Code does not match this questId' });
    // }
  
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY)

    // 4) The code is valid, so fetch the quest outline
    const quest = quests.find((q:any) => q.questId === questId);
    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }
  
    // 5) Build an "outline" with just step & task IDs, names, etc.
    const outline:QuestDefinition = {
      version:quest.version,
      enabled:quest.enabled,
      questId: quest.questId,
      startTrigger:quest.startTrigger,
      creator:quest.creator,
      title: quest.title,
      completionMode:quest.completionMode,
      steps: quest.steps.map((step:StepDefinition) => ({
        stepId: step.stepId,
        name: step.name,
        prerequisiteStepIds: step.prerequisiteStepIds ?? [],
        tasks: step.tasks.map((t:TaskDefinition) => ({
          taskId: t.taskId,
          description: t.description,
          metaverse: t.metaverse,
          requiredCount: t.requiredCount,
          prerequisiteTaskIds: t.prerequisiteTaskIds ?? []
        }))
      }))
    };

  if (format === 'html') {
    const markdown = buildQuestOutlineHTML(outline);
    // Return as text
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(markdown);
  } else {
    // default = JSON
    return res.json(outline);;
  }
}

export function handleQuestData(req:any, res:any){
    const questId = req.params.questId;
    const sortBy = req.query.sortBy || 'elapsedTime'; 
    const order = req.query.orderBy || 'asc';
    const limit = parseInt(req.query.limit as string) || 25;
    const completedOnly = req.query.completed === 'true' || req.query.completed === true;
    const format = req.query.format; // e.g. 'html'

    let ip = req.headers['x-forwarded-for'] || req.socket.address().address;
    // console.log('handleQuestData', questId, ip)

    // console.log('Query params:', { questId, sortBy, order, limit, completedOnly });
  
    // 1) load all profiles from cache
    const profiles = getCache(PROFILES_CACHE_KEY);
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
    const quest = quests.find((q:QuestDefinition)=> q.questId === questId)
    if(!quest){
      return res.send([])
    }

    let totalTasks = 0;
    for(const step of quest.steps){
      totalTasks += step.tasks.length;
    }
    // console.log('totalTasks', totalTasks)
  
    // 2) build an array of userQuest data
    let userData: any[] = [];
  
    for (const profile of profiles) {
      if (!profile.questsProgress) continue;
  
      // find if the user has this quest
      const info = profile.questsProgress.find((q: any) => q.questId === questId);
      if (!info) continue;

      if (completedOnly && !info.completed) {
        console.log('completedOnly', completedOnly, info.completed)
        continue;
      }
  
      // compute elapsedTime
      let elapsedTime = info.elapsedTime
  
      // count how many steps completed
      let stepsCompleted = 0;
      let tasksCompleted = 0;
      let progress = 0;
      let totalSteps = info.steps.length; // or from quest definition
      for (const step of info.steps) {
        if (step.completed) stepsCompleted++;
        for(const task of step.tasks){
          if(task.completed) tasksCompleted++;
        }
      }
      progress = totalTasks > 0 ? Math.floor(tasksCompleted / totalTasks * 100) : 0;

      userData.push({
        userId: profile.ethAddress,
        name: profile.name,
        completed: info.completed,
        startTime: info.startTime,
        timeCompleted: info.timeCompleted,
        elapsedTime,
        stepsCompleted,
        totalSteps,
        tasksCompleted,
        totalTasks,
        progress
      });
    }

    // Validate sortBy field - ensure it exists on the data objects
    const validSortFields = ['elapsedTime', 'stepsCompleted', 'progress', 'tasksCompleted', 'startTime', 'timeCompleted'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'elapsedTime';

    // console.log('Before sorting:', userData.map(u => ({ name: u.name, [sortField]: u[sortField] })));
  
    // 3) sort by the requested field - handle numeric fields properly
    userData.sort((a, b) => {
      // Ensure values exist and are numbers
      const aValue = typeof a[sortField] === 'number' ? a[sortField] : 0;
      const bValue = typeof b[sortField] === 'number' ? b[sortField] : 0;
      
      if (order === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    // console.log('After sorting:', userData.map(u => ({ name: u.name, [sortField]: u[sortField] })));
  
    // 4) limit
    userData = userData.slice(0, limit);

    if (format === 'html') {
      const markdown = buildQuestDataHTML(quest, userData);
      // Return as text
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(markdown);
    } else {
      // default = JSON
      return res.json(userData);
    }
}

export function handleQuestLeaderboard(req:any, res:any){
    try {
        const questId = req.query.questId as string;
        const taskId = req.query.taskId as string | undefined; 
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const order = (req.query.order as string) || 'desc';
        const version = parseInt(req.query.version as string, 10) || 1;
    
        if (!questId) {
          return res.status(400).json({ error: 'Missing questId param.' });
        }
    
        // 1) Get the cached profiles
        const profiles = getCache(PROFILES_CACHE_KEY); // e.g. an array of user profiles
    
        // 2) Build a list of { ethAddress, name, score } for participants
        const scoreboard: Array<{ ethAddress: string; name: string; score: number }> = [];
    
        for (const profile of profiles) {
          if (!profile.questsProgress) continue;
    
          const questRecord = profile.questsProgress.find((q: any) => q.questId === questId && q.version === version);
          if (!questRecord) continue;
    
          // If a specific taskId is provided
          if (taskId) {
            // Find that task
            const userTask = questRecord.tasks.find((t: any) => t.taskId === taskId);
            if (!userTask) {
              // If user doesn't have that task at all, skip them
              continue;
            }
    
            scoreboard.push({
              ethAddress: profile.ethAddress,
              name: profile.name,
              score: userTask.count || 0
            });
          } else {
            // If no taskId is provided, sum all tasks
            let total = 0;
            for (const t of questRecord.tasks) {
              total += (t.count || 0);
            }
            scoreboard.push({
              ethAddress: profile.ethAddress,
              name: profile.name,
              score: total
            });
          }
        }
    
        // 3) Sort the scoreboard
        scoreboard.sort((a, b) => {
          return (order === 'desc')
            ? b.score - a.score  // highest first
            : a.score - b.score; // lowest first
        });
    
        // 4) Take the top 'limit' results
        const sliced = scoreboard.slice(0, limit);
    
        return res.json(sliced);
    
      } catch (err: any) {
        console.error("Error in /leaderboard route:", err);
        return res.status(500).json({ error: 'Internal server error' });
      }
}

function buildQuestOutlineHTML(outline: QuestDefinition): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quest Outline - ${outline.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Cyberpunk Theme Colors */
      --cyber-bg-dark: #0d1117;
      --cyber-bg-medium: #161b22;
      --cyber-bg-light: #21262d;
      --cyber-text-bright: #f0f6fc;
      --cyber-text-medium: #c9d1d9;
      --cyber-text-dim: #8b949e;
      --cyber-neon-teal: #00ffd5;
      --cyber-neon-teal-glow: rgba(0, 255, 213, 0.7);
      --cyber-accent: #ff00aa;
      --cyber-accent-glow: rgba(255, 0, 170, 0.7);
      --cyber-border: rgba(30, 37, 47, 0.9);
      --cyber-success: #00ff9d;
      --cyber-warning: #ffae00;
      --cyber-error: #ff3864;
      --cyber-info: #38b6ff;
    }
    
    /* Reset and base styles */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Rajdhani', sans-serif;
      background-color: var(--cyber-bg-dark);
      color: var(--cyber-text-medium);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      line-height: 1.2;
      color: var(--cyber-text-bright);
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--cyber-bg-medium);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--cyber-neon-teal);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--cyber-accent);
    }

    /* Global Link styles */
    a {
      color: var(--cyber-neon-teal);
      text-decoration: none;
      transition: all 0.3s ease;
    }

    a:hover {
      color: var(--cyber-text-bright);
      text-shadow: 0 0 8px var(--cyber-neon-teal-glow);
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0;
    }
    
    .quests-card {
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
      overflow: hidden;
      position: relative;
    }
    
    .quests-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--cyber-neon-teal), transparent);
      z-index: 1;
    }
    
    .card-header {
      background-color: var(--cyber-bg-light);
      border-bottom: 1px solid var(--cyber-border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--cyber-text-bright);
    }
    
    .card-body {
      padding: 1.5rem;
      background-color: var(--cyber-bg-medium);
      color: var(--cyber-text-medium);
    }
    
    .glitch-text {
      position: relative;
      color: var(--cyber-text-bright);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 2px;
    }
    
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      background-color: var(--cyber-bg-light);
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
    }
    
    .meta-item {
      padding: 0.5rem;
    }
    
    .meta-item strong {
      display: block;
      font-size: 0.875rem;
      color: var(--cyber-text-dim);
      margin-bottom: 0.25rem;
    }
    
    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1em;
      font-size: 0.9rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .cyber-table th, .cyber-table td {
      border: 1px solid var(--cyber-border);
      padding: 0.75rem;
      text-align: left;
    }
    
    .cyber-table th {
      background: var(--cyber-bg-light);
      font-weight: 600;
      color: var(--cyber-text-bright);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .cyber-table tbody tr {
      background-color: var(--cyber-bg-medium);
      transition: all 0.2s ease;
    }
    
    .cyber-table tbody tr:hover {
      background-color: var(--cyber-bg-light);
    }
    
    .cyber-status-true {
      color: var(--cyber-success);
      font-weight: 600;
    }
    
    .cyber-status-false {
      color: var(--cyber-error);
      font-weight: 600;
    }
    
    .eth-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
      display: inline-block;
    }
    
    .progress-container {
      width: 100%;
      height: 8px;
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyber-neon-teal), var(--cyber-accent));
    }

    .progress-fill:after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 200%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      animation: progress-shimmer 1.5s forwards linear;
    }
    
    @keyframes progress-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    .cyber-heading {
      position: relative;
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
      color: var(--cyber-text-bright);
      font-weight: 700;
    }

    .cyber-heading:after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100px;
      height: 2px;
      background: linear-gradient(90deg, var(--cyber-neon-teal), transparent);
    }
    
    .user-row {
      cursor: pointer;
      position: relative;
    }
    
    .user-row:after {
      content: '+';
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--cyber-neon-teal);
      font-size: 1.2rem;
      transition: transform 0.2s ease;
    }
    
    .user-row.expanded:after {
      content: '-';
      color: var(--cyber-accent);
    }
    
    .user-row.expanded {
      background-color: rgba(0, 255, 213, 0.1) !important;
    }
    
    .details-row {
      display: none;
    }
    
    .details-row.active {
      display: table-row;
    }
    
    .details-container {
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      border: 1px solid var(--cyber-border);
      padding: 1rem;
    }
    
    .step-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .step-item {
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      margin-bottom: 0.75rem;
      overflow: hidden;
    }
    
    .step-header {
      background-color: var(--cyber-bg-medium);
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    
    .step-body {
      padding: 0.75rem 1rem;
      display: none;
      border-top: 1px solid var(--cyber-border);
    }
    
    .step-body.active {
      display: block;
    }
    
    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .task-item {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--cyber-border);
      display: flex;
      align-items: center;
    }
    
    .task-item:last-child {
      border-bottom: none;
    }
    
    .task-status {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 0.5rem;
    }
    
    .status-complete {
      background-color: var(--cyber-success);
      box-shadow: 0 0 5px var(--cyber-success);
    }
    
    .status-incomplete {
      background-color: var(--cyber-bg-light);
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }
      
      .meta-info {
        grid-template-columns: 1fr;
      }
      
      .cyber-table {
        display: block;
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="quests-card">
      <div class="card-header">
        <h1 class="glitch-text">Quest: ${outline.title}</h1>
      </div>
      
      <div class="card-body">
        <div class="meta-info">
          <div class="meta-item">
            <strong>Quest ID</strong>
            ${outline.questId}
          </div>
          <div class="meta-item">
            <strong>Version</strong>
            ${outline.version}
          </div>
          <div class="meta-item">
            <strong>Status</strong>
            ${outline.enabled ? 
              '<span class="cyber-status-true">Enabled</span>' : 
              '<span class="cyber-status-false">Disabled</span>'}
          </div>
          ${outline.startTime ? `
          <div class="meta-item">
            <strong>Start Time</strong>
            ${outline.startTime}
          </div>
          ` : ''}
          ${outline.endTime ? `
          <div class="meta-item">
            <strong>End Time</strong>
            ${outline.endTime}
          </div>
          ` : ''}
        </div>

        <h2 class="cyber-heading">Quest Steps</h2>`;

  // Steps
  outline.steps.forEach((step: any, sIndex: number) => {
    html += `
        <div class="step-card">
          <div class="step-header">
            <h3>Step ${sIndex + 1}: ${step.name}</h3>
            <div><strong>Step ID:</strong> ${step.stepId}</div>
            ${step.prerequisiteStepIds && step.prerequisiteStepIds.length > 0 ? 
              `<div><strong>Prerequisites:</strong> ${step.prerequisiteStepIds.map((id: string) => `<span class="cyber-badge cyber-badge-secondary">${id}</span>`).join(' ')}</div>` : 
              ''}
          </div>
          
          <div class="step-body">
            <h4>Tasks</h4>
            <table class="cyber-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Task ID</th>
                  <th>Required Count</th>
                  <th>Prerequisites</th>
                  <th>Metaverse</th>
                </tr>
              </thead>
              <tbody>`;

    step.tasks.forEach((task: TaskDefinition) => {
      html += `
              <tr>
                <td>${task.description || ''}</td>
                <td><code>${task.taskId}</code></td>
                <td>${task.requiredCount || 0}</td>
                <td>${task.prerequisiteTaskIds && task.prerequisiteTaskIds.length ? 
                  task.prerequisiteTaskIds.map((id: string) => `<span class="cyber-badge cyber-badge-secondary">${id}</span>`).join(' ') : 
                  'None'}
                </td>
                <td>${task.metaverse ? `<span class="cyber-badge cyber-badge-success">${task.metaverse}</span>` : ''}</td>
              </tr>`;
    });

    html += `
              </tbody>
            </table>
          </div>
        </div>`;
  });

  html += `
      </div>
    </div>
  </div>
</body>
</html>`;
  return html;
}

function buildQuestDataHTML(quest: QuestDefinition, userData: any[]): string {
  // Get profiles from cache for detailed view
  const profiles = getCache(PROFILES_CACHE_KEY);
  
  // Build task lookup for filtering
  const allTasks: {stepId: string, taskId: string, description: string}[] = [];
  for (const step of quest.steps) {
    for (const task of step.tasks) {
      allTasks.push({
        stepId: step.stepId,
        taskId: task.taskId,
        description: task.description || task.taskId
      });
    }
  }
  
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quest Data - ${quest.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Cyberpunk Theme Colors */
      --cyber-bg-dark: #0d1117;
      --cyber-bg-medium: #161b22;
      --cyber-bg-light: #21262d;
      --cyber-text-bright: #f0f6fc;
      --cyber-text-medium: #c9d1d9;
      --cyber-text-dim: #8b949e;
      --cyber-neon-teal: #00ffd5;
      --cyber-neon-teal-glow: rgba(0, 255, 213, 0.7);
      --cyber-accent: #ff00aa;
      --cyber-accent-glow: rgba(255, 0, 170, 0.7);
      --cyber-border: rgba(30, 37, 47, 0.9);
      --cyber-success: #00ff9d;
      --cyber-warning: #ffae00;
      --cyber-error: #ff3864;
      --cyber-info: #38b6ff;
    }
    
    /* Reset and base styles */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Rajdhani', sans-serif;
      background-color: var(--cyber-bg-dark);
      color: var(--cyber-text-medium);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      line-height: 1.2;
      color: var(--cyber-text-bright);
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--cyber-bg-medium);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--cyber-neon-teal);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--cyber-accent);
    }

    /* Global Link styles */
    a {
      color: var(--cyber-neon-teal);
      text-decoration: none;
      transition: all 0.3s ease;
    }

    a:hover {
      color: var(--cyber-text-bright);
      text-shadow: 0 0 8px var(--cyber-neon-teal-glow);
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0;
    }
    
    .quests-card {
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
      overflow: hidden;
      position: relative;
    }
    
    .quests-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--cyber-neon-teal), transparent);
      z-index: 1;
    }
    
    .card-header {
      background-color: var(--cyber-bg-light);
      border-bottom: 1px solid var(--cyber-border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--cyber-text-bright);
    }
    
    .card-body {
      padding: 1.5rem;
      background-color: var(--cyber-bg-medium);
      color: var(--cyber-text-medium);
    }
    
    .glitch-text {
      position: relative;
      color: var(--cyber-text-bright);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 2px;
    }
    
    .header-meta {
      font-size: 0.875rem;
      opacity: 0.9;
    }
    
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      background-color: var(--cyber-bg-light);
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
    }
    
    .meta-item {
      padding: 0.5rem;
    }
    
    .meta-item strong {
      display: block;
      font-size: 0.875rem;
      color: var(--cyber-text-dim);
      margin-bottom: 0.25rem;
    }
    
    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1em;
      font-size: 0.9rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .cyber-table th, .cyber-table td {
      border: 1px solid var(--cyber-border);
      padding: 0.75rem;
      text-align: left;
    }
    
    .cyber-table th {
      background: var(--cyber-bg-light);
      font-weight: 600;
      color: var(--cyber-text-bright);
      text-transform: uppercase;
      letter-spacing: 1px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .cyber-table tbody tr {
      background-color: var(--cyber-bg-medium);
      transition: all 0.2s ease;
    }
    
    .cyber-table tbody tr:hover {
      background-color: var(--cyber-bg-light);
    }
    
    .cyber-status-true {
      color: var(--cyber-success);
      font-weight: 600;
    }
    
    .cyber-status-false {
      color: var(--cyber-error);
      font-weight: 600;
    }
    
    .eth-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
      display: inline-block;
    }
    
    .progress-container {
      width: 100%;
      height: 8px;
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyber-neon-teal), var(--cyber-accent));
    }

    .progress-fill:after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 200%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      animation: progress-shimmer 1.5s forwards linear;
    }
    
    @keyframes progress-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    .cyber-heading {
      position: relative;
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
      color: var(--cyber-text-bright);
      font-weight: 700;
    }

    .cyber-heading:after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100px;
      height: 2px;
      background: linear-gradient(90deg, var(--cyber-neon-teal), transparent);
    }
    
    .user-row {
      cursor: pointer;
      position: relative;
    }
    
    .user-row:after {
      content: '+';
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--cyber-neon-teal);
      font-size: 1.2rem;
      transition: transform 0.2s ease;
    }
    
    .user-row.expanded:after {
      content: '-';
      color: var(--cyber-accent);
    }
    
    .user-row.expanded {
      background-color: rgba(0, 255, 213, 0.1) !important;
    }
    
    .details-row {
      display: none;
    }
    
    .details-row.active {
      display: table-row;
    }
    
    .details-container {
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      border: 1px solid var(--cyber-border);
      padding: 1rem;
    }
    
    .step-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .step-item {
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      margin-bottom: 0.75rem;
      overflow: hidden;
    }
    
    .step-header {
      background-color: var(--cyber-bg-medium);
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    
    .step-body {
      padding: 0.75rem 1rem;
      display: none;
      border-top: 1px solid var(--cyber-border);
    }
    
    .step-body.active {
      display: block;
    }
    
    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .task-item {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--cyber-border);
      display: flex;
      align-items: center;
    }
    
    .task-item:last-child {
      border-bottom: none;
    }
    
    .task-status {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 0.5rem;
    }
    
    .status-complete {
      background-color: var(--cyber-success);
      box-shadow: 0 0 5px var(--cyber-success);
    }
    
    .status-incomplete {
      background-color: var(--cyber-bg-light);
    }
    
    /* Filters */
    .filters-panel {
      background-color: var(--cyber-bg-light);
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
      border: 1px solid var(--cyber-border);
    }
    
    .filter-toggle {
      background: none;
      border: none;
      color: var(--cyber-neon-teal);
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 0;
    }
    
    .filter-toggle:hover {
      color: var(--cyber-text-bright);
    }
    
    .filter-toggle span {
      margin-left: 0.5rem;
    }
    
    .filter-content {
      display: none;
      margin-top: 1rem;
    }
    
    .filter-content.active {
      display: block;
    }
    
    .filter-group {
      margin-bottom: 1rem;
    }
    
    .filter-label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--cyber-text-bright);
      font-size: 0.9rem;
    }
    
    .filter-select {
      width: 100%;
      padding: 0.75rem;
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      color: var(--cyber-text-medium);
      border-radius: 4px;
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
    }
    
    .filter-input {
      width: 100%;
      padding: 0.75rem;
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      color: var(--cyber-text-bright);
      border-radius: 4px;
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
    }
    
    .filter-select option {
      background-color: var(--cyber-bg-medium);
      color: var(--cyber-text-medium);
    }
    
    .filter-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    
    .cyber-btn {
      padding: 0.5rem 1rem;
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      color: var(--cyber-text-bright);
      border-radius: 4px;
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .cyber-btn:hover {
      background-color: var(--cyber-neon-teal);
      color: var(--cyber-bg-dark);
    }
    
    .filter-stats {
      margin-bottom: 1rem;
      color: var(--cyber-text-dim);
      font-size: 0.9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .page-info {
      font-size: 0.9rem;
      color: var(--cyber-text-dim);
    }
    
    .page-btn {
      background: none;
      border: none;
      color: var(--cyber-neon-teal);
      cursor: pointer;
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 4px;
      transition: all 0.2s ease;
    }
    
    .page-btn:hover {
      background-color: rgba(0, 255, 213, 0.2);
    }
    
    .page-btn:disabled {
      color: var(--cyber-text-dim);
      cursor: not-allowed;
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }
      
      .meta-info {
        grid-template-columns: 1fr;
      }
      
      .cyber-table {
        display: block;
        overflow-x: auto;
      }
      
      .filter-stats {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }
    }
  </style>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Store original data
      window.originalUserData = ${JSON.stringify(userData)};
      window.allTasks = ${JSON.stringify(allTasks)};
      window.filteredUsers = [...window.originalUserData];
      window.currentPage = 1;
      window.usersPerPage = 25; // Default value
      
      // Initialize filters from URL parameters
      initializeFiltersFromURL();
      
      // Toggle user rows
      document.addEventListener('click', function(e) {
        if (e.target.closest('.user-row')) {
          const row = e.target.closest('.user-row');
          const userId = row.getAttribute('data-user-id');
          const detailsRow = document.querySelector('.details-row[data-user-id="' + userId + '"]');
          
          row.classList.toggle('expanded');
          if (detailsRow) {
            detailsRow.classList.toggle('active');
          }
        }
      });
      
      // Toggle step details
      document.addEventListener('click', function(e) {
        if (e.target.closest('.step-header')) {
          const stepHeader = e.target.closest('.step-header');
          const stepBody = stepHeader.nextElementSibling;
          const stepItem = stepHeader.parentElement;
          
          stepItem.classList.toggle('expanded');
          stepBody.classList.toggle('active');
          
          // Stop propagation to prevent the user row from collapsing
          e.stopPropagation();
        }
      });
      
      // Toggle filters
      const filterToggle = document.getElementById('filter-toggle');
      const filterContent = document.getElementById('filter-content');
      
      if (filterToggle && filterContent) {
        filterToggle.addEventListener('click', function() {
          filterContent.classList.toggle('active');
          const icon = this.querySelector('span');
          if (icon) {
            icon.textContent = filterContent.classList.contains('active') ? '▲' : '▼';
          }
        });
      }
      
      // Populate task dropdown
      const taskSelect = document.getElementById('task-filter');
      
      if (taskSelect) {
        window.allTasks.forEach(task => {
          const option = document.createElement('option');
          option.value = task.taskId;
          option.textContent = task.description;
          taskSelect.appendChild(option);
        });
      }
      
      // Users per page dropdown
      const perPageInput = document.getElementById('users-per-page');
      if (perPageInput) {
        // Set initial value from URL parameter if present
        const urlParams = new URLSearchParams(window.location.search);
        const limitParam = urlParams.get('limit');
        if (limitParam) {
          const limitValue = parseInt(limitParam, 10);
          if (!isNaN(limitValue) && limitValue > 0) {
            perPageInput.value = limitValue;
            window.usersPerPage = limitValue;
          }
        }
        
        // Handle changes to the input
        perPageInput.addEventListener('change', function() {
          const newValue = parseInt(this.value, 10);
          if (!isNaN(newValue) && newValue > 0) {
            window.usersPerPage = newValue;
            window.currentPage = 1; // Reset to first page when changing page size
            updateURLParameter('limit', newValue);
            updateTable();
            updateFilterStats();
          } else {
            // Reset to a valid value if input is invalid
            this.value = window.usersPerPage;
          }
        });
      }
      
      // Pagination buttons
      const prevPageBtn = document.getElementById('prev-page');
      const nextPageBtn = document.getElementById('next-page');
      
      if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function() {
          if (window.currentPage > 1) {
            window.currentPage--;
            updateTable();
          }
        });
      }
      
      if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function() {
          const totalPages = Math.ceil(window.filteredUsers.length / window.usersPerPage);
          if (window.currentPage < totalPages) {
            window.currentPage++;
            updateTable();
          }
        });
      }
      
      // Apply filters button
      const applyFiltersBtn = document.getElementById('apply-filters');
      if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
      }
      
      // Reset filters button
      const resetFiltersBtn = document.getElementById('reset-filters');
      if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', resetFilters);
      }
      
      // Debug function to help identify issues
      function debug(message, data) {
        if (data !== undefined) {
          console.log('[DEBUG]', message, data);
        } else {
          console.log('[DEBUG]', message);
        }
      }
      
      // Helper function to check if a user has completed a specific task
      function hasCompletedTask(userId, taskId) {
        try {
          // More detailed console logging for debugging
          console.log('Checking if user', userId, 'has completed task', taskId);
          
          // Get profiles from store
          const profiles = ${JSON.stringify(profiles)};
          const questId = '${quest.questId}';
          
          // Find the user profile
          const profile = profiles.find(p => p.ethAddress === userId);
          if (!profile || !profile.questsProgress) {
            console.log('No profile or quest progress found for user', userId);
            return false;
          }
          
          // Find quest progress
          const questProgress = profile.questsProgress.find(q => q.questId === questId);
          if (!questProgress || !questProgress.steps) {
            console.log('No quest progress or steps found for user', userId, 'and quest', questId);
            return false;
          }
          
          console.log('Found quest progress for user', userId, 'with', questProgress.steps.length, 'steps');
          
          // Look through all steps and tasks
          for (const step of questProgress.steps) {
            if (!step.tasks || step.tasks.length === 0) continue;
            
            console.log('Checking step', step.stepId, 'with', step.tasks.length, 'tasks');
            
            const taskProgress = step.tasks.find(t => t.taskId === taskId);
            if (!taskProgress) {
              console.log('Task', taskId, 'not found in step', step.stepId);
              continue;
            }
            
            console.log('Found task', taskId, 'in step', step.stepId, 'with completion status:', taskProgress.completed, 'and count:', taskProgress.count);
            
            // Find task definition to get requiredCount
            const allSteps = ${JSON.stringify(quest.steps)};
            const stepDef = allSteps.find(s => s.stepId === step.stepId);
            if (!stepDef) {
              console.log('Could not find step definition for', step.stepId);
              continue;
            }
            
            const taskDef = stepDef.tasks.find(t => t.taskId === taskId);
            if (!taskDef) {
              console.log('Could not find task definition for', taskId, 'in step', step.stepId);
              continue;
            }
            
            // Check if task is completed based on completed flag or count/requiredCount
            const requiredCount = typeof taskDef.requiredCount === 'number' ? taskDef.requiredCount : 1;
            const currentCount = typeof taskProgress.count === 'number' ? taskProgress.count : 0;
            
            const isCompleted = taskProgress.completed || (currentCount >= requiredCount);
            console.log('Task', taskId, 'completion result:', isCompleted, '(required:', requiredCount, 'current:', currentCount, 'completed flag:', taskProgress.completed, ')');
            
            return isCompleted;
          }
          
          console.log('Task', taskId, 'not found in any step for user', userId);
          return false;
        } catch (error) {
          console.error('Error checking task completion:', error);
          return false;
        }
      }
      
      // Helper function to properly check task completion status
      function checkTaskStatus(userId, taskId, checkType) {
        console.log('Checking task status:', userId, taskId, checkType);
        
        // Find the user profile
        const profile = ${JSON.stringify(profiles)}.find(p => p.ethAddress === userId);
        if (!profile || !profile.questsProgress) return false;
        
        // Find this quest's progress
        const questProgress = profile.questsProgress.find(q => q.questId === '${quest.questId}');
        if (!questProgress || !questProgress.steps) return false;
        
        // Check all steps for this task
        for (const step of questProgress.steps) {
          if (!step.tasks) continue;
          
          // Find this specific task
          const taskProgress = step.tasks.find(t => t.taskId === taskId);
          if (!taskProgress) continue;
          
          // Get task definition to find required count
          const stepDef = ${JSON.stringify(quest.steps)}.find(s => s.stepId === step.stepId);
          if (!stepDef) continue;
          
          const taskDef = stepDef.tasks.find(t => t.taskId === taskId);
          if (!taskDef) continue;
          
          // Calculate completion based on count or completed flag
          const requiredCount = typeof taskDef.requiredCount === 'number' ? taskDef.requiredCount : 1;
          const currentCount = typeof taskProgress.count === 'number' ? taskProgress.count : 0;
          
          // A task is completed if either:
          // 1. It has completed: true explicitly set, OR
          // 2. currentCount >= requiredCount
          const hasCompletedFlag = taskProgress.completed === true;
          const hasMetCount = currentCount >= requiredCount;
          const isCompleted = hasCompletedFlag || hasMetCount;
          
          console.log('Task details for user', profile.name || userId, ':', {
            taskId,
            completed: taskProgress.completed, 
            currentCount,
            requiredCount,
            hasCompletedFlag,
            hasMetCount,
            isCompleted
          });
          
          // Return based on what we're checking
          if (checkType === 'has-task') {
            // Just checking if user has the task at all
            return true;
          } else if (checkType === 'completed') {
            // Checking if the task is completed
            return isCompleted;
          } else if (checkType === 'not-completed') {
            // Checking if user has the task but has NOT completed it
            return !isCompleted;
          }
        }
        
        // If we get here, user doesn't have the task or didn't match criteria
        return false;
      }
      
      function applyFilters() {
        try {
          const taskId = document.getElementById('task-filter').value;
          const taskStatus = document.getElementById('task-status').value;
          const statusFilter = document.getElementById('completion-status').value;
          const usersPerPage = parseInt(document.getElementById('users-per-page').value) || 25;
          const sortOrder = document.getElementById('sort-order').value;
          
          // Update URL with the parameters
          updateURLParameter('limit', usersPerPage);
          updateURLParameter('orderBy', sortOrder);
          
          console.log('Applying filters:', { taskId, taskStatus, statusFilter, usersPerPage, sortOrder });
          
          // Reset to original data first
          window.filteredUsers = [...window.originalUserData];
          debug('Starting with all users:', window.filteredUsers.length);
          
          // Apply task filter if selected
          if (taskId !== '') {
            debug('Filtering by task:', taskId);
            
            // Different filter based on task status selection
            if (taskStatus === 'completed') {
              // Find users who have completed the task
              console.log('Finding users who have COMPLETED the task');
              window.filteredUsers = window.filteredUsers.filter(user => 
                checkTaskStatus(user.userId, taskId, 'completed')
              );
            } 
            else if (taskStatus === 'not-completed') {
              // Find users who have the task but haven't completed it
              console.log('Finding users who have NOT completed the task');
              window.filteredUsers = window.filteredUsers.filter(user => 
                checkTaskStatus(user.userId, taskId, 'not-completed')
              );
            }
            
            console.log('Found', window.filteredUsers.length, 'users after task filtering');
          }
          
          // Apply completion status filter
          if (statusFilter !== '') {
            debug('Filtering by completion status:', statusFilter);
            
            window.filteredUsers = window.filteredUsers.filter(user => {
              if (statusFilter === 'completed') {
                return user.completed === true;
              } else if (statusFilter === 'in-progress') {
                return user.completed === false;
              }
              return true;
            });
            
            debug('Users after completion status filtering:', window.filteredUsers.length);
          }
          
          // Update users per page
          window.usersPerPage = usersPerPage;
          
          // Reset to page 1 after filtering
          window.currentPage = 1;
          
          // Update the table
          updateTable();
          
          // Update filter stats
          updateFilterStats();
        } catch (error) {
          console.error('Error applying filters:', error);
          // In case of error, make sure we show all users
          window.filteredUsers = [...window.originalUserData];
          updateTable();
          updateFilterStats();
        }
      }
      
      // Function to update URL parameters without reloading the page
      function updateURLParameter(key, value) {
        // Get current URL and create URL object
        const url = new URL(window.location.href);
        
        // Update or add the parameter
        url.searchParams.set(key, value);
        
        // Update browser history without reloading
        window.history.replaceState({}, '', url.toString());
      }
      
      function resetFilters() {
        try {
          const taskFilter = document.getElementById('task-filter');
          const taskStatus = document.getElementById('task-status');
          const completionStatus = document.getElementById('completion-status');
          
          if (taskFilter) taskFilter.value = '';
          if (taskStatus) taskStatus.value = '';
          if (completionStatus) completionStatus.value = '';
          
          window.filteredUsers = [...window.originalUserData];
          window.currentPage = 1;
          
          updateTable();
          updateFilterStats();
        } catch (error) {
          console.error('Error resetting filters:', error);
        }
      }
      
      function updateFilterStats() {
        try {
          const statsElement = document.getElementById('filter-stats-count');
          if (statsElement) {
            statsElement.textContent = \`Showing \${window.filteredUsers.length} of \${window.originalUserData.length} users\`;
          }
          
          // Update pagination info
          updatePaginationInfo();
        } catch (error) {
          console.error('Error updating filter stats:', error);
        }
      }
      
      function updatePaginationInfo() {
        try {
          const pageInfoElement = document.getElementById('page-info');
          const prevButton = document.getElementById('prev-page');
          const nextButton = document.getElementById('next-page');
          
          if (!pageInfoElement || !prevButton || !nextButton) return;
          
          const totalPages = Math.ceil(window.filteredUsers.length / window.usersPerPage);
          const startIndex = (window.currentPage - 1) * window.usersPerPage + 1;
          const endIndex = Math.min(startIndex + window.usersPerPage - 1, window.filteredUsers.length);
          
          pageInfoElement.textContent = \`Page \${window.currentPage} of \${totalPages || 1} (\${startIndex}-\${endIndex} of \${window.filteredUsers.length})\`;
          
          // Disable/enable pagination buttons
          prevButton.disabled = window.currentPage <= 1;
          nextButton.disabled = window.currentPage >= totalPages;
        } catch (error) {
          console.error('Error updating pagination info:', error);
        }
      }
      
      function updateTable() {
        try {
          const tableBody = document.getElementById('users-table-body');
          if (!tableBody) {
            console.error('Table body element not found');
            return;
          }
          
          tableBody.innerHTML = '';
          
          // Calculate current page slice
          const startIndex = (window.currentPage - 1) * window.usersPerPage;
          const endIndex = startIndex + window.usersPerPage;
          const currentPageUsers = window.filteredUsers.slice(startIndex, endIndex);
          
          if (currentPageUsers.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = \`
              <td colspan="5" style="text-align: center; padding: 2rem;">
                <div>No users match the current filter criteria.</div>
              </td>
            \`;
            tableBody.appendChild(emptyRow);
            updatePaginationInfo();
            return;
          }
          
          currentPageUsers.forEach((user, i) => {
            const progressPercent = user.progress;
            
            // Format elapsed time nicely
            const formatTime = (user) => {
              let ms = 0;
  
              if(user.completed){
                ms = user.elapsedTime * 1000; // Convert seconds to milliseconds
              }else{
                if (user.elapsedTime > 0) {
                  ms = user.elapsedTime * 1000; // Convert seconds to milliseconds
                } else if (user.startTime) {
                  ms = (Math.floor(Date.now()/1000) - user.startTime) * 1000;
                }
              }
              
              const seconds = Math.floor(ms / 1000);
              const minutes = Math.floor(seconds / 60);
              const hours = Math.floor(minutes / 60);
              
              if (hours > 0) {
                return \`\${hours}h \${minutes % 60}m\`;
              } else if (minutes > 0) {
                return \`\${minutes}m \${seconds % 60}s\`;
              } else {
                return \`\${seconds}s\`;
              }
            };
            
            // Add user row
            const userRow = document.createElement('tr');
            userRow.className = 'user-row';
            userRow.setAttribute('data-user-id', user.userId);
            
            userRow.innerHTML = \`
              <td>
                \${user.name || 'Anonymous'}
              </td>
              <td><a target="_blank" href="https://decentraland.org/profile/accounts/\${user.userId}"><span class="eth-address" title="\${user.userId}">\${user.userId}</span></a></td>
              <td>\${user.completed ? 
                '<span class="cyber-status-true">Completed</span>' : 
                '<span class="cyber-status-false">In Progress</span>'}
              </td>
              <td>
                \${user.tasksCompleted}/\${user.totalTasks} Tasks
                <div class="progress-container">
                  <div class="progress-fill" style="width: \${progressPercent}%"></div>
                </div>
              </td>
              <td>\${formatTime(user)}</td>
            \`;
            
            tableBody.appendChild(userRow);
            
            // Find detailed user progress
            const profile = ${JSON.stringify(profiles)}.find((p) => p.ethAddress === user.userId);
            let userQuestProgress = null;
            
            if (profile && profile.questsProgress) {
              userQuestProgress = profile.questsProgress.find((q) => q.questId === '${quest.questId}');
            }
            
            // Add details row
            const detailsRow = document.createElement('tr');
            detailsRow.className = 'details-row';
            detailsRow.setAttribute('data-user-id', user.userId);
            
            let detailsContent = \`
              <td colspan="5">
                <div class="details-container">
                  <h3>Progress Details</h3>\`;
            
            if (userQuestProgress && userQuestProgress.steps && userQuestProgress.steps.length > 0) {
              detailsContent += \`<ul class="step-list">\`;
              
              userQuestProgress.steps.forEach((stepProgress, stepIndex) => {
                const stepDef = ${JSON.stringify(quest.steps)}.find((s) => s.stepId === stepProgress.stepId);
                if (!stepDef) return;
                
                detailsContent += \`
                  <li class="step-item">
                    <div class="step-header">
                      <div>
                        <strong>Step \${stepIndex + 1}: \${stepDef.name || stepProgress.stepId}</strong>
                      </div>
                      <div>
                        \${stepProgress.completed ? 
                          '<span class="cyber-status-true">Complete</span>' : 
                          '<span class="cyber-status-false">In Progress</span>'}
                      </div>
                    </div>
                    <div class="step-body">
                      <ul class="task-list">\`;
                
                if (stepProgress.tasks && stepProgress.tasks.length > 0) {
                  stepProgress.tasks.forEach((taskProgress) => {
                    const taskDef = stepDef.tasks.find((t) => t.taskId === taskProgress.taskId);
                    if (!taskDef) return;
                    
                    const requiredCount = typeof taskDef.requiredCount === 'number' ? taskDef.requiredCount : 1;
                    const currentCount = typeof taskProgress.count === 'number' ? taskProgress.count : 0;
                    const isComplete = taskProgress.completed || (currentCount >= requiredCount);
                    
                    detailsContent += \`
                      <li class="task-item">
                        <span class="task-status \${isComplete ? 'status-complete' : 'status-incomplete'}"></span>
                        <div>
                          <div>\${taskDef.description || taskProgress.taskId}</div>
                          <div style="font-size: 0.8rem; color: var(--cyber-text-dim);">Progress: \${currentCount}/\${requiredCount}</div>
                        </div>
                      </li>\`;
                  });
                } else {
                  detailsContent += \`<li class="task-item">No tasks started</li>\`;
                }
                
                detailsContent += \`
                      </ul>
                    </div>
                  </li>\`;
              });
              
              detailsContent += \`</ul>\`;
            } else {
              detailsContent += \`<p>No detailed progress data available</p>\`;
            }
            
            detailsContent += \`
                </div>
              </td>\`;
              
            detailsRow.innerHTML = detailsContent;
            tableBody.appendChild(detailsRow);
          });
          
          // Update pagination info after updating the table
          updatePaginationInfo();
        } catch (error) {
          console.error('Error updating table:', error);
        }
      }
      
      // Initialize the table and stats
      updateTable();
      updateFilterStats();
      
      // Initialize filters from URL parameters
      function initializeFiltersFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Initialize sort order
        const orderBy = urlParams.get('orderBy');
        if (orderBy) {
          const sortOrderSelect = document.getElementById('sort-order');
          if (sortOrderSelect && (orderBy === 'asc' || orderBy === 'desc')) {
            sortOrderSelect.value = orderBy;
          }
        }
        
        // Initialize limit/users per page
        const limitParam = urlParams.get('limit');
        if (limitParam) {
          const limitValue = parseInt(limitParam, 10);
          const perPageInput = document.getElementById('users-per-page');
          if (!isNaN(limitValue) && limitValue > 0 && perPageInput) {
            perPageInput.value = limitValue;
            window.usersPerPage = limitValue;
          }
        }
      }
      
      // Sort order select
      const sortOrderSelect = document.getElementById('sort-order');
      if (sortOrderSelect) {
        sortOrderSelect.addEventListener('change', function() {
          updateURLParameter('orderBy', this.value);
          // Apply the sort by reloading the page
          window.location.reload();
        });
      }
    });
  </script>
</head>
<body>
  <div class="container">
    <div class="quests-card">
      <div class="card-header">
        <h1 class="glitch-text">Quest: ${quest.title}</h1>
        <div class="header-meta">
          Version: ${quest.version}
        </div>
      </div>
      
      <div class="card-body">
        <div class="meta-info">
          <div class="meta-item">
            <strong>Quest ID</strong>
            ${quest.questId}
          </div>
          <div class="meta-item">
            <strong>Status</strong>
            ${quest.enabled ? 
              '<span class="cyber-status-true">Enabled</span>' : 
              '<span class="cyber-status-false">Disabled</span>'}
          </div>
          <div class="meta-item">
            <strong>Participants</strong>
            ${userData.length}
          </div>
          <div class="meta-item">
            <strong>Completion Rate</strong>
            ${userData.length > 0 ? Math.round((userData.filter((u: any) => u.completed).length / userData.length) * 100) : 0}%
          </div>
        </div>

        <div class="filters-panel">
          <button id="filter-toggle" class="filter-toggle">
            Filters <span>▼</span>
          </button>
          
          <div id="filter-content" class="filter-content">
            <div class="filter-group">
              <label for="task-filter" class="filter-label">Filter by Task</label>
              <select id="task-filter" class="filter-select">
                <option value="">All Tasks</option>
                <!-- Tasks will be populated by JavaScript -->
              </select>
            </div>
            
            <div class="filter-group">
              <label for="task-status" class="filter-label">Task Status</label>
              <select id="task-status" class="filter-select">
                <option value="completed">Has Completed This Task</option>
                <option value="not-completed">Has Not Completed This Task</option>
              </select>
            </div>
            
            <div class="filter-group">
              <label for="completion-status" class="filter-label">Quest Completion</label>
              <select id="completion-status" class="filter-select">
                <option value="">All Users</option>
                <option value="completed">Completed Quest</option>
                <option value="in-progress">Quest In Progress</option>
              </select>
            </div>
            
            <div class="filter-group">
              <label for="sort-order" class="filter-label">Sort Order</label>
              <select id="sort-order" class="filter-select">
                <option value="asc">Ascending</option>
                <option value="desc" selected>Descending</option>
              </select>
            </div>
            
            <div class="filter-group">
              <label for="users-per-page" class="filter-label">Users per Page</label>
              <input type="number" id="users-per-page" class="filter-input" value="25" min="1" max="1000" step="1">
            </div>
            
            <div class="filter-actions">
              <button id="reset-filters" class="cyber-btn">Reset</button>
              <button id="apply-filters" class="cyber-btn">Apply Filters</button>
            </div>
          </div>
        </div>
        
        <div class="filter-stats">
          <div id="filter-stats-count" class="filter-stats-count"></div>
          <div class="pagination-controls">
            <button id="prev-page" class="page-btn">◀</button>
            <span id="page-info" class="page-info"></span>
            <button id="next-page" class="page-btn">▶</button>
          </div>
        </div>

        <h2 class="cyber-heading">Quest Participants</h2>
        
        <table class="cyber-table">
          <thead>
            <tr>
              <th>User</th>
              <th>ETH Address</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Elapsed Time</th>
            </tr>
          </thead>
          <tbody id="users-table-body">
            <!-- Content will be populated by JavaScript -->
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
  return html;
}

export function getRandomString(length:number) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomString = '';
  
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      randomString += characters.charAt(randomIndex);
    }
  
    return randomString;
  }

export function handleSingleUserQuestData(req:any, res:any){
  const questId = req.params.questId;
  const userId = req.query.userId;
  const format = req.query.format; // e.g. 'html'

  let ip = req.headers['x-forwarded-for'] || req.socket.address().address;
  // console.log('handleSingleUserQuestData', questId, userId, ip)
  
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }
  
  // 1) load profile from cache
  const profiles = getCache(PROFILES_CACHE_KEY);
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY);
  const quest = quests.find((q:QuestDefinition) => q.questId === questId);
  
  if (!quest) {
    return res.status(404).json({ error: 'Quest not found' });
  }
  
  // 2) Find the specific user
  const profile = profiles.find((p:any) => p.ethAddress === userId);
  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // 3) Check if the user has this quest progress
  if (!profile.questsProgress) {
    return res.json(null); // No quest progress for this user
  }
  
  const info = profile.questsProgress.find((q: any) => q.questId === questId);
  if (!info) {
    return res.json(null); // User hasn't started this quest
  }
  
  // 4) Compute progress data
  let stepsCompleted = 0;
  let totalSteps = info.steps ? info.steps.length : 0;
  
  if (info.steps) {
    for (const step of info.steps) {
      if (step.completed) stepsCompleted++;
    }
  }
  
  // 5) Return formatted user data
  const userData = {
    userId: profile.ethAddress,
    name: profile.name,
    completed: info.completed || false,
    startTime: info.startTime || 0,
    timeCompleted: info.timeCompleted || 0,
    elapsedTime: info.elapsedTime || 0,
    stepsCompleted,
    totalSteps
  };
  
  // 6) Format response based on format parameter
  if (format === 'html') {
    const html = buildSingleUserQuestDataHTML(quest, userData, info);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } else {
    // default = JSON
    return res.json(userData);
  }
}

function buildSingleUserQuestDataHTML(quest: QuestDefinition, userData: any, questProgress: any): string {
  // Format elapsed time for display
  const formatTime = (user:any) => {
    let ms = 0;
    
    if (user.elapsedTime > 0) {
      ms = user.elapsedTime * 1000; // Convert seconds to milliseconds
    } else if (user.startTime) {
      ms = (Math.floor(Date.now()/1000) - user.startTime) * 1000;
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Calculate progress percentage
  const progressPercent = userData.stepsCompleted / userData.totalSteps * 100;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>User Quest Progress - ${quest.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Cyberpunk Theme Colors */
      --cyber-bg-dark: #0d1117;
      --cyber-bg-medium: #161b22;
      --cyber-bg-light: #21262d;
      --cyber-text-bright: #f0f6fc;
      --cyber-text-medium: #c9d1d9;
      --cyber-text-dim: #8b949e;
      --cyber-neon-teal: #00ffd5;
      --cyber-neon-teal-glow: rgba(0, 255, 213, 0.7);
      --cyber-accent: #ff00aa;
      --cyber-accent-glow: rgba(255, 0, 170, 0.7);
      --cyber-border: rgba(30, 37, 47, 0.9);
      --cyber-success: #00ff9d;
      --cyber-warning: #ffae00;
      --cyber-error: #ff3864;
      --cyber-info: #38b6ff;
    }
    
    /* Reset and base styles */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Rajdhani', sans-serif;
      background-color: var(--cyber-bg-dark);
      color: var(--cyber-text-medium);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      line-height: 1.2;
      color: var(--cyber-text-bright);
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--cyber-bg-medium);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--cyber-neon-teal);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--cyber-accent);
    }

    /* Global Link styles */
    a {
      color: var(--cyber-neon-teal);
      text-decoration: none;
      transition: all 0.3s ease;
    }

    a:hover {
      color: var(--cyber-text-bright);
      text-shadow: 0 0 8px var(--cyber-neon-teal-glow);
    }
    
    .container {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0;
    }
    
    .quests-card {
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
      overflow: hidden;
      position: relative;
    }
    
    .quests-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--cyber-neon-teal), transparent);
      z-index: 1;
    }
    
    .card-header {
      background-color: var(--cyber-bg-light);
      border-bottom: 1px solid var(--cyber-border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--cyber-text-bright);
    }
    
    .card-body {
      padding: 1.5rem;
      background-color: var(--cyber-bg-medium);
      color: var(--cyber-text-medium);
    }
    
    .glitch-text {
      position: relative;
      color: var(--cyber-text-bright);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 2px;
    }
    
    .cyber-heading {
      position: relative;
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
      color: var(--cyber-text-bright);
      font-weight: 700;
    }

    .cyber-heading:after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100px;
      height: 2px;
      background: linear-gradient(90deg, var(--cyber-neon-teal), transparent);
    }
    
    .user-profile {
      display: flex;
      align-items: center;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      border: 1px solid var(--cyber-border);
    }
    
    .avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background-color: var(--cyber-bg-medium);
      overflow: hidden;
      margin-right: 1rem;
      border: 2px solid var(--cyber-neon-teal);
      position: relative;
    }
    
    .avatar:before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at center, var(--cyber-neon-teal-glow), transparent);
      opacity: 0.5;
    }
    
    .user-info {
      flex: 1;
    }
    
    .user-name {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.25rem 0;
      color: var(--cyber-text-bright);
    }
    
    .user-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
    }
    
    .status-tag {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 0.5rem;
    }
    
    .status-completed {
      background-color: var(--cyber-success);
      color: var(--cyber-bg-dark);
      box-shadow: 0 0 8px var(--cyber-success);
    }
    
    .status-in-progress {
      background-color: var(--cyber-warning);
      color: var(--cyber-bg-dark);
      box-shadow: 0 0 8px var(--cyber-warning);
    }
    
    .progress-section {
      margin-top: 1.5rem;
    }
    
    .progress-container {
      height: 10px;
      background-color: var(--cyber-bg-light);
      border-radius: 5px;
      overflow: hidden;
      margin: 0.5rem 0 1rem 0;
      position: relative;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyber-neon-teal), var(--cyber-accent));
      border-radius: 5px;
      position: relative;
    }
    
    .progress-fill:after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 200%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      animation: progress-shimmer 1.5s forwards linear;
    }
    
    @keyframes progress-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-top: 1.5rem;
    }
    
    .stat-card {
      background-color: var(--cyber-bg-light);
      padding: 1rem;
      border-radius: 4px;
      text-align: center;
      border: 1px solid var(--cyber-border);
      position: relative;
      overflow: hidden;
    }
    
    .stat-card:before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: var(--cyber-neon-teal);
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--cyber-text-bright);
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: var(--cyber-text-dim);
      margin-top: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .step-card {
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      margin-bottom: 1rem;
      overflow: hidden;
      background-color: var(--cyber-bg-medium);
    }
    
    .step-header {
      background-color: var(--cyber-bg-light);
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--cyber-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    
    .step-title {
      font-weight: 600;
      margin: 0;
      color: var(--cyber-text-bright);
    }
    
    .step-body {
      padding: 1rem;
      display: none;
    }
    
    .step-body.active {
      display: block;
    }
    
    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .task-item {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--cyber-border);
      display: flex;
      align-items: center;
    }
    
    .task-item:last-child {
      border-bottom: none;
    }
    
    .task-status {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 0.5rem;
    }
    
    .status-complete {
      background-color: var(--cyber-success);
      box-shadow: 0 0 5px var(--cyber-success);
    }
    
    .status-incomplete {
      background-color: var(--cyber-bg-light);
    }
    
    .expand-icon {
      display: inline-block;
      margin-left: 8px;
      transform: rotate(0deg);
      transition: transform 0.2s ease;
      color: var(--cyber-neon-teal);
    }
    
    .expanded .expand-icon {
      transform: rotate(180deg);
      color: var(--cyber-accent);
    }
    
    @media (max-width: 640px) {
      .container {
        margin: 0;
        padding: 1rem;
      }
      
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const stepHeaders = document.querySelectorAll('.step-header');
      
      stepHeaders.forEach(header => {
        header.addEventListener('click', function() {
          const stepCard = this.parentElement;
          const stepBody = this.nextElementSibling;
          
          stepCard.classList.toggle('expanded');
          stepBody.classList.toggle('active');
        });
      });
    });
  </script>
</head>
<body>
  <div class="container">
    <div class="quests-card">
      <div class="card-header">
        <h1 class="glitch-text">User Quest Progress</h1>
      </div>
      
      <div class="card-body">
        <div class="user-profile">
          <div class="avatar">
            <!-- Placeholder for avatar image -->
          </div>
          <div class="user-info">
            <h2 class="user-name">${userData.name || 'Anonymous'}</h2>
            <div class="user-address">${userData.userId}</div>
            ${userData.completed ? 
              '<span class="status-tag status-completed">Completed</span>' : 
              '<span class="status-tag status-in-progress">In Progress</span>'}
          </div>
        </div>
        
        <h2 class="cyber-heading">Quest: ${quest.title}</h2>
        
        <div class="progress-section">
          <div><strong>Overall Progress:</strong> ${userData.stepsCompleted}/${userData.totalSteps} steps completed</div>
          <div class="progress-container">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${formatTime(userData)}</div>
            <div class="stat-label">Elapsed Time</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-value">${userData.completed ? 'Yes' : 'No'}</div>
            <div class="stat-label">Completed</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-value">${Math.round(progressPercent)}%</div>
            <div class="stat-label">Completion</div>
          </div>
        </div>
        
        <h2 class="cyber-heading">Step Progress</h2>`;

  // Add steps from questProgress
  if (questProgress.steps && questProgress.steps.length > 0) {
    questProgress.steps.forEach((step: any, index: number) => {
      const stepDef = quest.steps.find(s => s.stepId === step.stepId);
      if (!stepDef) return;
      
      html += `
        <div class="step-card">
          <div class="step-header">
            <h3 class="step-title">Step ${index + 1}: ${stepDef.name || step.stepId}</h3>
            <div>
              ${step.completed ? 
                '<span class="status-tag status-completed">Completed</span>' : 
                '<span class="status-tag status-in-progress">In Progress</span>'}
              <span class="expand-icon">▼</span>
            </div>
          </div>
          <div class="step-body">
            <ul class="task-list">`;
      
      // Add tasks
      if (step.tasks && step.tasks.length > 0) {
        step.tasks.forEach((task: any) => {
          const taskDef = stepDef.tasks.find(t => t.taskId === task.taskId);
          if (!taskDef) return;
          
          const isComplete = task.completed || (task.count >= taskDef.requiredCount);
          html += `
              <li class="task-item">
                <span class="task-status ${isComplete ? 'status-complete' : 'status-incomplete'}"></span>
                <div>
                  <div>${taskDef.description || task.taskId}</div>
                  <div style="font-size: 0.8rem; color: var(--cyber-text-dim);">Progress: ${task.count}/${taskDef.requiredCount}</div>
                </div>
              </li>`;
        });
      }
      
      html += `
            </ul>
          </div>
        </div>`;
    });
  } else {
    html += `
        <p>No steps have been started yet for this quest.</p>`;
  }

  html += `
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function handleRewardsData(req:any, res:any){
  const format = req.query.format; // e.g. 'html'

  let ip = req.headers['x-forwarded-for'] || req.socket.address().address;
  console.log('handleRewardsData', ip)

  // Load all rewards directly from cache
  const rewards = getCache(REWARDS_CACHE_KEY) || [];
  const quests = getCache(QUEST_TEMPLATES_CACHE_KEY) || [];
  
  if (format === 'html') {
    const html = buildRewardsDataHTML(quests, rewards);
    // Return as text
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } else {
    // default = JSON
    return res.json(rewards);
  }
}

function buildRewardsDataHTML(quests: any[], rewardsData: any[]): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quest Rewards</title>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Cyberpunk Theme Colors */
      --cyber-bg-dark: #0d1117;
      --cyber-bg-medium: #161b22;
      --cyber-bg-light: #21262d;
      --cyber-text-bright: #f0f6fc;
      --cyber-text-medium: #c9d1d9;
      --cyber-text-dim: #8b949e;
      --cyber-neon-teal: #00ffd5;
      --cyber-neon-teal-glow: rgba(0, 255, 213, 0.7);
      --cyber-accent: #ff00aa;
      --cyber-accent-glow: rgba(255, 0, 170, 0.7);
      --cyber-border: rgba(30, 37, 47, 0.9);
      --cyber-success: #00ff9d;
      --cyber-warning: #ffae00;
      --cyber-error: #ff3864;
      --cyber-info: #38b6ff;
    }
    
    /* Reset and base styles */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Rajdhani', sans-serif;
      background-color: var(--cyber-bg-dark);
      color: var(--cyber-text-medium);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow-x: hidden;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      line-height: 1.2;
      color: var(--cyber-text-bright);
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--cyber-bg-medium);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--cyber-neon-teal);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--cyber-accent);
    }

    /* Global Link styles */
    a {
      color: var(--cyber-neon-teal);
      text-decoration: none;
      transition: all 0.3s ease;
    }

    a:hover {
      color: var(--cyber-text-bright);
      text-shadow: 0 0 8px var(--cyber-neon-teal-glow);
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0;
    }
    
    .quests-card {
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
      overflow: hidden;
      position: relative;
    }
    
    .quests-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--cyber-neon-teal), transparent);
      z-index: 1;
    }
    
    .card-header {
      background-color: var(--cyber-bg-light);
      border-bottom: 1px solid var(--cyber-border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--cyber-text-bright);
    }
    
    .card-body {
      padding: 1.5rem;
      background-color: var(--cyber-bg-medium);
      color: var(--cyber-text-medium);
    }
    
    .glitch-text {
      position: relative;
      color: var(--cyber-text-bright);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 2px;
    }
    
    .filters {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
    }
    
    .filter-group {
      flex: 1;
      min-width: 200px;
    }
    
    .filter-label {
      display: block;
      color: var(--cyber-text-dim);
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
    }
    
    .filter-input, .filter-select {
      width: 100%;
      padding: 0.75rem 1rem;
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      background-color: var(--cyber-bg-medium);
      border: 1px solid var(--cyber-border);
      border-radius: 4px;
      color: var(--cyber-text-bright);
      transition: all 0.3s ease;
    }
    
    .filter-input:focus, .filter-select:focus {
      outline: none;
      border-color: var(--cyber-neon-teal);
      box-shadow: 0 0 0 2px var(--cyber-neon-teal-glow);
    }
    
    .filter-select {
      appearance: none;
      padding-right: 2rem;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238b949e'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.5rem center;
      background-size: 1.5rem;
    }
    
    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1em;
      font-size: 0.9rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    .cyber-table th, .cyber-table td {
      border: 1px solid var(--cyber-border);
      padding: 0.75rem;
      text-align: left;
    }
    
    .cyber-table th {
      background: var(--cyber-bg-light);
      font-weight: 600;
      color: var(--cyber-text-bright);
      text-transform: uppercase;
      letter-spacing: 1px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .cyber-table tbody tr {
      background-color: var(--cyber-bg-medium);
      transition: all 0.2s ease;
    }
    
    .cyber-table tbody tr:hover {
      background-color: var(--cyber-bg-light);
    }
    
    .eth-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
      display: inline-block;
    }
    
    .reward-item {
      display: flex;
      align-items: center;
      padding: 0.5rem;
      background-color: var(--cyber-bg-light);
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }
    
    .reward-icon {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      margin-right: 0.75rem;
      background-color: var(--cyber-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.7rem;
      color: var(--cyber-bg-dark);
    }
    
    .reward-info {
      flex: 1;
    }
    
    .reward-name {
      font-weight: 600;
      color: var(--cyber-text-bright);
    }
    
    .reward-type {
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
    }
    
    .timestamp {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-bright);
    }
    
    .no-results {
      padding: 2rem;
      text-align: center;
      color: var(--cyber-text-dim);
      font-size: 1.2rem;
    }
    
    .quest-name {
      color: var(--cyber-info);
      font-weight: 600;
    }
    
    .table-container {
      max-height: 600px;
      overflow-y: auto;
      border-radius: 4px;
      border: 1px solid var(--cyber-border);
    }
    
    .results-count {
      margin-bottom: 1rem;
      color: var(--cyber-text-dim);
      font-size: 0.9rem;
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }
      
      .cyber-table {
        display: block;
        overflow-x: auto;
      }
      
      .filters {
        flex-direction: column;
      }
      
      .filter-group {
        width: 100%;
      }
    }
  </style>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Store the original data
      window.rewardsData = ${JSON.stringify(rewardsData)};
      window.questsData = ${JSON.stringify(quests.map(q => ({ questId: q.questId, title: q.title })))};
      
      // Populate quest dropdown
      const questSelect = document.getElementById('quest-filter');
      const questMap = {};
      
      window.questsData.forEach(quest => {
        questMap[quest.questId] = quest.title;
        const option = document.createElement('option');
        option.value = quest.questId;
        option.textContent = quest.title;
        questSelect.appendChild(option);
      });
      
      // Setup search functionality
      const userInput = document.getElementById('user-filter');
      const questDropdown = document.getElementById('quest-filter');
      
      userInput.addEventListener('input', filterRewards);
      questDropdown.addEventListener('change', filterRewards);
      
      function formatTime(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
      }
      
      function formatElapsedTime(seconds) {
        if (!seconds) return 'N/A';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        if (hours > 0) {
          return \`\${hours}h \${minutes}m \${remainingSeconds}s\`;
        } else if (minutes > 0) {
          return \`\${minutes}m \${remainingSeconds}s\`;
        } else {
          return \`\${remainingSeconds}s\`;
        }
      }
      
      function renderRewardItem(reward) {
        if (!reward) return '<div>No reward info</div>';
        
        return \`
          <div class="reward-item">
            <div class="reward-icon">\${reward.type ? reward.type.charAt(0).toUpperCase() : '?'}</div>
            <div class="reward-info">
              <div class="reward-name">\${reward.name || 'Unnamed Reward'}</div>
              <div class="reward-type">\${reward.type || 'Unknown'} \${reward.amount ? \`× \${reward.amount}\` : ''}</div>
            </div>
          </div>
        \`;
      }
      
      function filterRewards() {
        const userFilter = userInput.value.trim().toLowerCase();
        const questFilter = questDropdown.value;
        
        const tableBody = document.getElementById('rewards-table-body');
        const noResults = document.getElementById('no-results');
        const resultsCount = document.getElementById('results-count');
        
        // Filter the data
        const filteredData = window.rewardsData.filter(data => {
          const matchesUser = !userFilter || 
                            (data.userId && data.userId.toLowerCase().includes(userFilter)) || 
                            (data.name && data.name.toLowerCase().includes(userFilter));
          
          const matchesQuest = !questFilter || data.questId === questFilter;
          
          return matchesUser && matchesQuest;
        });
        
        // Update results count
        resultsCount.textContent = \`Showing \${filteredData.length} of \${window.rewardsData.length} rewards\`;
        
        // Clear the table
        tableBody.innerHTML = '';
        
        // Show or hide the table/no results message
        if (filteredData.length === 0) {
          document.getElementById('rewards-table-container').style.display = 'none';
          noResults.style.display = 'block';
          return;
        }
        
        document.getElementById('rewards-table-container').style.display = 'block';
        noResults.style.display = 'none';
        
        // Render the filtered data
        filteredData.forEach(data => {
          const row = document.createElement('tr');
          
          row.innerHTML = \`
            <td>
              <div>\${data.name || 'Anonymous'}</div>
              <a target="_blank" href="https://decentraland.org/profile/accounts/\${data.userId}">
                <span class="eth-address" title="\${data.userId}">\${data.userId}</span>
              </a>
            </td>
            <td class="quest-name">\${questMap[data.questId] || data.questId}</td>
            <td class="timestamp">\${formatTime(data.timeCompleted)}</td>
            <td>\${formatElapsedTime(data.elapsedTime)}</td>
            <td>
              \${data.rewards && data.rewards.length > 0 
                ? data.rewards.map(reward => renderRewardItem(reward)).join('')
                : '<div>No rewards</div>'
              }
            </td>
          \`;
          
          tableBody.appendChild(row);
        });
      }
      
      // Initial render
      filterRewards();
    });
  </script>
</head>
<body>
  <div class="container">
    <div class="quests-card">
      <div class="card-header">
        <h1 class="glitch-text">Quest Rewards</h1>
      </div>
      
      <div class="card-body">
        <div class="filters">
          <div class="filter-group">
            <label class="filter-label" for="user-filter">User ID or Name</label>
            <input type="text" id="user-filter" class="filter-input" placeholder="Filter by user...">
          </div>
          
          <div class="filter-group">
            <label class="filter-label" for="quest-filter">Quest</label>
            <select id="quest-filter" class="filter-select">
              <option value="">All Quests</option>
            </select>
          </div>
        </div>
        
        <div id="results-count" class="results-count"></div>
        
        <div id="rewards-table-container" class="table-container">
          <table id="rewards-table" class="cyber-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Quest</th>
                <th>Completed On</th>
                <th>Time Spent</th>
                <th>Rewards</th>
              </tr>
            </thead>
            <tbody id="rewards-table-body">
              <!-- Content will be populated by JavaScript -->
            </tbody>
          </table>
        </div>
        
        <div id="no-results" class="no-results" style="display: none;">
          <h2>No rewards data found</h2>
          <p>No rewards match the current filter criteria.</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  return html;
}