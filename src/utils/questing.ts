import { ephemeralCodes, QuestDefinition, StepDefinition, TaskDefinition } from "../rooms/QuestRoom";
import { router } from "../router";
import { getCache } from "./cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY } from "./initializer";

export function handleQuestOutline(req:any, res:any){
    const questId = req.query.questId as string;
    const code = req.query.code as string;
    const format = req.query.format; // e.g. 'html'

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
    const limit = parseInt(req.query.limit as string) || 25;
    const completedOnly = req.query.completed === 'true' || req.query.completed === true;
    const format = req.query.format; // e.g. 'html'

    console.log('Query params:', { questId, sortBy, order, limit, completedOnly });
  
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
    console.log('totalTasks', totalTasks)
  
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

    console.log('Before sorting:', userData.map(u => ({ name: u.name, [sortField]: u[sortField] })));
  
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

    console.log('After sorting:', userData.map(u => ({ name: u.name, [sortField]: u[sortField] })));
  
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

function buildQuestDataHTML(questData: QuestDefinition, userData: any[]): string {
  // Get profiles from cache for detailed view
  const profiles = getCache(PROFILES_CACHE_KEY);
  
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
    
    .user-row {
      cursor: pointer;
    }
    
    .user-row td {
      position: relative;
    }
    
    .user-row.expanded {
      background-color: #f0f4ff !important;
    }
    
    .expand-icon {
      display: inline-block;
      margin-left: 0.5rem;
      font-size: 0.75rem;
      transition: transform 0.2s;
    }
    
    .user-row.expanded .expand-icon {
      transform: rotate(180deg);
    }
    
    .progress-details {
      display: none;
    }
    
    .progress-details.active {
      display: table-row;
    }
    
    .progress-details td {
      padding: 1rem;
    }
    
    .detail-container {
      background-color: white;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      padding: 1rem;
    }
    
    .step-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .step-item {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 0.75rem;
      overflow: hidden;
    }
    
    .step-header {
      background-color: #f3f4f6;
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    
    .step-body {
      padding: 0.75rem 1rem;
      display: none;
      border-top: 1px solid #e5e7eb;
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
      border-bottom: 1px solid #e5e7eb;
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
      background-color: var(--success);
    }
    
    .status-incomplete {
      background-color: #e5e7eb;
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
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Toggle user rows
      const userRows = document.querySelectorAll('.user-row');
      
      userRows.forEach(row => {
        row.addEventListener('click', function() {
          const userId = this.getAttribute('data-user-id');
          const detailsRow = document.querySelector('.progress-details[data-user-id="' + userId + '"]');
          
          this.classList.toggle('expanded');
          detailsRow.classList.toggle('active');
        });
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
    });
  </script>
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
        ${userData.length > 0 ? Math.round((userData.filter((u: any) => u.completed).length / userData.length) * 100) : 0}%
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
    // Format elapsed time nicely
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
    
    // Main user row
    html += `
      <tr class="user-row" data-user-id="${user.userId}">
        <td>
          ${user.name || 'Anonymous'}
          <span class="expand-icon">▼</span>
        </td>
        <td><a target="_blank" href="https://decentraland.org/profile/accounts/${user.userId}"><span class="eth-address" title="${user.userId}">${user.userId}</span></a></td>
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
        <td>${formatTime(user)}</td>
      </tr>`;
      
    // Find detailed user progress
    const profile = profiles.find((p:any) => p.ethAddress === user.userId);
    let userQuestProgress = null;
    
    if (profile && profile.questsProgress) {
      userQuestProgress = profile.questsProgress.find((q: any) => q.questId === questData.questId);
    }
    
    // Collapsible detail row
    html += `
      <tr class="progress-details" data-user-id="${user.userId}">
        <td colspan="5">
          <div class="detail-container">
            <h3>Progress Details</h3>`;
    
    if (userQuestProgress && userQuestProgress.steps && userQuestProgress.steps.length > 0) {
      html += `
            <ul class="step-list">`;
      
      userQuestProgress.steps.forEach((stepProgress: any, stepIndex: number) => {
        const stepDef = questData.steps.find((s: any) => s.stepId === stepProgress.stepId);
        if (!stepDef) return;
        
        html += `
              <li class="step-item">
                <div class="step-header">
                  <div>
                    <strong>Step ${stepIndex + 1}: ${stepDef.name || stepProgress.stepId}</strong>
                  </div>
                  <div>
                    ${stepProgress.completed ? 
                      '<span class="status-true">Complete</span>' : 
                      '<span class="status-false">In Progress</span>'}
                  </div>
                </div>
                <div class="step-body">
                  <ul class="task-list">`;
        
        if (stepProgress.tasks && stepProgress.tasks.length > 0) {
          stepProgress.tasks.forEach((taskProgress: any) => {
            const taskDef = stepDef.tasks.find((t: any) => t.taskId === taskProgress.taskId);
            if (!taskDef) return;
            
            const requiredCount = typeof taskDef.requiredCount === 'number' ? taskDef.requiredCount : 1;
            const currentCount = typeof taskProgress.count === 'number' ? taskProgress.count : 0;
            const isComplete = taskProgress.completed || (currentCount >= requiredCount);
            
            html += `
                    <li class="task-item">
                      <span class="task-status ${isComplete ? 'status-complete' : 'status-incomplete'}"></span>
                      <div>
                        <div>${taskDef.description || taskProgress.taskId}</div>
                        <div style="font-size: 0.8rem; color: #6b7280;">Progress: ${currentCount}/${requiredCount}</div>
                      </div>
                    </li>`;
          });
        } else {
          html += `
                    <li class="task-item">No tasks started</li>`;
        }
        
        html += `
                  </ul>
                </div>
              </li>`;
      });
      
      html += `
            </ul>`;
    } else {
      html += `
            <p>No detailed progress data available</p>`;
    }
    
    html += `
          </div>
        </td>
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

export function handleSingleUserQuestData(req:any, res:any){
  const questId = req.params.questId;
  const userId = req.query.userId;
  const format = req.query.format; // e.g. 'html'
  
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
      max-width: 800px;
      margin: 2rem auto;
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
      font-size: 1.8rem;
      font-weight: 700;
    }
    
    h2 {
      color: var(--primary-dark);
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0.5rem;
      margin-top: 2rem;
    }
    
    .user-profile {
      display: flex;
      align-items: center;
      margin-bottom: 1.5rem;
      padding: 1rem;
      background-color: #f9fafb;
      border-radius: 8px;
    }
    
    .avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background-color: #e5e7eb;
      overflow: hidden;
      margin-right: 1rem;
    }
    
    .user-info {
      flex: 1;
    }
    
    .user-name {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.25rem 0;
    }
    
    .user-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: #6b7280;
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
      background-color: var(--success);
      color: white;
    }
    
    .status-in-progress {
      background-color: var(--warning);
      color: white;
    }
    
    .progress-section {
      margin-top: 1.5rem;
    }
    
    .progress-bar {
      height: 10px;
      background-color: #e5e7eb;
      border-radius: 5px;
      overflow: hidden;
      margin: 0.5rem 0 1rem 0;
    }
    
    .progress-fill {
      height: 100%;
      background-color: var(--success);
      border-radius: 5px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1.5rem;
    }
    
    .stat-card {
      background-color: #f9fafb;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-dark);
    }
    
    .stat-label {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }
    
    .step-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    
    .step-header {
      background-color: #f3f4f6;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    
    .step-title {
      font-weight: 600;
      margin: 0;
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
      border-bottom: 1px solid #e5e7eb;
    }
    
    .task-item:last-child {
      border-bottom: none;
    }
    
    .task-status {
      display: inline-block;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      margin-right: 0.5rem;
      vertical-align: middle;
    }
    
    .status-complete {
      background-color: var(--success);
    }
    
    .status-incomplete {
      background-color: #e5e7eb;
    }
    
    .expand-icon {
      display: inline-block;
      margin-left: 8px;
      transform: rotate(0deg);
      transition: transform 0.2s ease;
    }
    
    .expanded .expand-icon {
      transform: rotate(180deg);
    }
    
    @media (max-width: 640px) {
      .container {
        margin: 0;
        padding: 1rem;
        border-radius: 0;
      }
      
      header {
        margin: -1rem -1rem 1rem -1rem;
        padding: 1rem;
        border-radius: 0;
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
    <header>
      <h1>User Quest Progress</h1>
    </header>
    
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
    
    <h2>Quest: ${quest.title}</h2>
    
    <div class="progress-section">
      <div><strong>Overall Progress:</strong> ${userData.stepsCompleted}/${userData.totalSteps} steps completed</div>
      <div class="progress-bar">
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
    
    <h2>Step Progress</h2>`;

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
            ${taskDef.description || task.taskId}
            <span class="task-count">(${task.count}/${taskDef.requiredCount})</span>
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
</body>
</html>`;

  return html;
}