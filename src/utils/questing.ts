import { ephemeralCodes, QuestDefinition, StepDefinition, TaskDefinition } from "../rooms/QuestRoom";
import { router } from "../router";
import { getCache } from "./cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY } from "./initializer";

export function handleQuestOutline(req:any, res:any){
    const questId = req.query.questId as string;
    const code = req.query.code as string;
    const format = req.query.format; // e.g. 'html'

    if (!questId || !code) {
      return res.status(400).json({ error: 'Missing questId or code' });
    }
  
    // 1) check ephemeralCodes to see if code is valid
    const record = ephemeralCodes[code];
    if (!record) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }
  
    // 2) check if it has expired
    if (Date.now() > record.expires) {
      // If expired, remove it from map
      delete ephemeralCodes[code];
      return res.status(401).json({ error: 'Code has expired' });
    }
  
    // 3) check if record.questId matches the requested questId
    if (record.questId !== questId) {
      return res.status(403).json({ error: 'Code does not match this questId' });
    }
  
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
      questType:quest.questType,
      startTrigger:quest.startTrigger,
      creator:quest.creator,
      title: quest.title,
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
    const limit = parseInt(req.query.limit as string) || 100;
    const completedOnly = (req.query.completed as boolean) || false;
    const format = req.query.format; // e.g. 'html'

    console.log('completedonly', completedOnly)
  
    // 1) load all profiles from cache
    const profiles = getCache(PROFILES_CACHE_KEY);
    const quests = getCache(QUEST_TEMPLATES_CACHE_KEY)
    const quest = quests.find((q:QuestDefinition)=> q.questId === questId)
    if(!quest){
      return res.send([])
    }
  
    // 2) build an array of userQuest data
    let userData: any[] = [];
  
    for (const profile of profiles) {
      if (!profile.questsProgress) continue;
  
      // find if the user has this quest
      const info = profile.questsProgress.find((q: any) => q.questId === questId);
      if (!info) continue;

      if (completedOnly && !info.completed) {
        continue;
      }
  
      // compute elapsedTime
      let elapsedTime = info.elapsedTime
  
      // count how many steps completed
      let stepsCompleted = 0;
      let totalSteps = info.steps.length; // or from quest definition
      for (const step of info.steps) {
        if (step.completed) stepsCompleted++;
      }
  
      userData.push({
        userId: profile.ethAddress,
        name: profile.name,
        completed: info.completed,
        timeStarted: info.timeStarted,
        timeCompleted: info.timeCompleted,
        elapsedTime,
        stepsCompleted,
        totalSteps
      });
    }
  
    // 3) sort by the requested field
    userData.sort((a, b) => {
      if (order === 'asc') return a[sortBy] - b[sortBy];
      else return b[sortBy] - a[sortBy];
    });
  
    // 4) limit
    userData = userData.slice(0, limit);

    if (format === 'html') {
      const markdown = buildQuestDataHTML(quest, userData);
      // Return as text
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(markdown);
    } else {
      // default = JSON
      return res.json(userData);;
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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --secondary: #8b5cf6;
      --light: #f9fafb;
      --dark: #1f2937;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: var(--dark);
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem;
      background-color: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    
    header {
      background-color: var(--primary);
      color: white;
      padding: 1.5rem;
      border-radius: 8px 8px 0 0;
      margin: -1.5rem -1.5rem 1.5rem -1.5rem;
    }
    
    h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
    }
    
    h2 {
      color: var(--primary-dark);
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
      margin-top: 2rem;
    }
    
    h3 {
      color: var(--secondary);
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
      background-color: #f9fafb;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1.5rem;
    }
    
    .meta-item {
      padding: 0.5rem;
    }
    
    .meta-item strong {
      display: block;
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
    }
    
    .step-card {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      margin-bottom: 1.5rem;
      border: 1px solid #e5e7eb;
      overflow: hidden;
    }
    
    .step-header {
      background-color: #f3f4f6;
      padding: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .step-body {
      padding: 1rem;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1em;
      font-size: 0.9rem;
    }
    
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.75rem;
      text-align: left;
    }
    
    th {
      background: #f9fafb;
      font-weight: 600;
    }
    
    tr:nth-child(even) {
      background-color: #f9fafb;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background-color: var(--primary);
      color: white;
    }
    
    .badge-secondary {
      background-color: var(--secondary);
    }
    
    .badge-success {
      background-color: var(--success);
    }
    
    .badge-warning {
      background-color: var(--warning);
    }
    
    .status-enabled {
      color: var(--success);
      font-weight: 600;
    }
    
    .status-disabled {
      color: var(--danger);
      font-weight: 600;
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }
      
      header {
        padding: 1rem;
        margin: -1rem -1rem 1rem -1rem;
      }
      
      h1 {
        font-size: 1.5rem;
      }
      
      .meta-info {
        grid-template-columns: 1fr;
      }
      
      table {
        display: block;
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Quest: ${outline.title}</h1>
    </header>
    
    <div class="meta-info">
      <div class="meta-item">
        <strong>Quest ID</strong>
        ${outline.questId}
      </div>
      <div class="meta-item">
        <strong>Quest Type</strong>
        <span class="badge">${outline.questType}</span>
      </div>
      <div class="meta-item">
        <strong>Version</strong>
        ${outline.version}
      </div>
      <div class="meta-item">
        <strong>Status</strong>
        ${outline.enabled ? 
          '<span class="status-enabled">Enabled</span>' : 
          '<span class="status-disabled">Disabled</span>'}
      </div>
      <div class="meta-item">
        <strong>Allow Replay</strong>
        ${outline.allowReplay ? 'Yes' : 'No'}
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

    <h2>Quest Steps</h2>`;

  // Steps
  outline.steps.forEach((step: any, sIndex: number) => {
    html += `
    <div class="step-card">
      <div class="step-header">
        <h3>Step ${sIndex + 1}: ${step.name}</h3>
        <div><strong>Step ID:</strong> ${step.stepId}</div>
        ${step.prerequisiteStepIds && step.prerequisiteStepIds.length > 0 ? 
          `<div><strong>Prerequisites:</strong> ${step.prerequisiteStepIds.map((id: string) => `<span class="badge badge-secondary">${id}</span>`).join(' ')}</div>` : 
          ''}
      </div>
      
      <div class="step-body">
        <h4>Tasks</h4>
        <table>
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
            task.prerequisiteTaskIds.map((id: string) => `<span class="badge badge-secondary">${id}</span>`).join(' ') : 
            'None'}
          </td>
          <td>${task.metaverse ? `<span class="badge badge-success">${task.metaverse}</span>` : ''}</td>
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
</body>
</html>`;
  return html;
}

function buildQuestDataHTML(questData: QuestDefinition, userData: any): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quest Data - ${questData.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --secondary: #8b5cf6;
      --light: #f9fafb;
      --dark: #1f2937;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: var(--dark);
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem;
      background-color: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    
    header {
      background-color: var(--primary);
      color: white;
      padding: 1.5rem;
      border-radius: 8px 8px 0 0;
      margin: -1.5rem -1.5rem 1.5rem -1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-meta {
      font-size: 0.875rem;
      opacity: 0.9;
    }
    
    h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
    }
    
    h2 {
      color: var(--primary-dark);
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
      margin-top: 2rem;
    }
    
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      background-color: #f9fafb;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1.5rem;
    }
    
    .meta-item {
      padding: 0.5rem;
    }
    
    .meta-item strong {
      display: block;
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.25rem;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1em;
      font-size: 0.9rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    th, td {
      border: 1px solid #e5e7eb;
      padding: 0.75rem;
      text-align: left;
    }
    
    th {
      background: #f9fafb;
      font-weight: 600;
    }
    
    tr:nth-child(even) {
      background-color: #f9fafb;
    }
    
    tr:hover {
      background-color: #f3f4f6;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background-color: var(--primary);
      color: white;
    }
    
    .status-true {
      color: var(--success);
      font-weight: 600;
    }
    
    .status-false {
      color: var(--danger);
      font-weight: 600;
    }
    
    .eth-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
      display: inline-block;
    }
    
    .progress-bar {
      height: 8px;
      background-color: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    
    .progress-fill {
      height: 100%;
      background-color: var(--success);
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }
      
      header {
        padding: 1rem;
        margin: -1rem -1rem 1rem -1rem;
        flex-direction: column;
        align-items: flex-start;
      }
      
      .header-meta {
        margin-top: 0.5rem;
      }
      
      h1 {
        font-size: 1.5rem;
      }
      
      .meta-info {
        grid-template-columns: 1fr;
      }
      
      table {
        display: block;
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Quest: ${questData.title}</h1>
      <div class="header-meta">
        Type: <span class="badge">${questData.questType}</span> &nbsp;|&nbsp; 
        Version: ${questData.version}
      </div>
    </header>
    
    <div class="meta-info">
      <div class="meta-item">
        <strong>Quest ID</strong>
        ${questData.questId}
      </div>
      <div class="meta-item">
        <strong>Status</strong>
        ${questData.enabled ? 
          '<span class="status-true">Enabled</span>' : 
          '<span class="status-false">Disabled</span>'}
      </div>
      <div class="meta-item">
        <strong>Participants</strong>
        ${userData.length}
      </div>
      <div class="meta-item">
        <strong>Completion Rate</strong>
        ${Math.round((userData.filter((u: any) => u.completed).length / userData.length) * 100)}%
      </div>
    </div>

    <h2>Quest Participants</h2>
    
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>ETH Address</th>
          <th>Status</th>
          <th>Progress</th>
          <th>Elapsed Time</th>
        </tr>
      </thead>
      <tbody>`;

  userData.forEach((user: any, i: number) => {
    const progressPercent = user.stepsCompleted / user.totalSteps * 100;
    // Format elapsed time nicely (assuming it's in milliseconds)
    const formatTime = (ms: number) => {
      if (!ms) return 'N/A';
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
    
    html += `
      <tr>
        <td>${user.name || 'Anonymous'}</td>
        <td><span class="eth-address" title="${user.userId}">${user.userId}</span></td>
        <td>${user.completed ? 
          '<span class="status-true">Completed</span>' : 
          '<span class="status-false">In Progress</span>'}
        </td>
        <td>
          ${user.stepsCompleted}/${user.totalSteps} Steps
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </td>
        <td>${formatTime(user.elapsedTime)}</td>
      </tr>`;
  });

  html += `
      </tbody>
    </table>
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