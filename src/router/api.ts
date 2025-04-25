import { getLeaderboard } from "../components/BasePlayerState";
import { getRewardTransactions, getUserRewardTransactions, getQuestRewardTransactions } from "../components/TheForge/RewardSystem";
import { QuestDefinition, StepDefinition, TaskDefinition } from "../components/TheForge/utils/types";
import { getCache } from "../utils/cache";
import { PROFILES_CACHE_KEY, QUEST_TEMPLATES_CACHE_KEY, REWARDS_CACHE_KEY } from "../utils/initializer";
import { handleMarketplaceFilters } from "../utils/marketplace";
import { handleMarketplaceItemDetails } from "../utils/marketplace";
import { handleMarketplaceRewards } from "../utils/marketplace";
import { handleQuestData, handleQuestLeaderboard, handleQuestOutline, handleRewardsData, handleSingleUserQuestData } from "../utils/questing";
import { getPlazaLocation, getPlazaLocationCurrentReservation, getPlazaReservation, getUserPlazaReservations } from "../utils/reservations";
import { authentication } from "./admin";
import tokenRoutes from "../utils/tokenRoutes";

export function apiRouter(router:any){
    // Mount token routes
    router.use('/api/tokens', tokenRoutes);

    router.get('/api/locations/:location/:action/:id', async (req:any, res:any) => {
      console.log('getting angzaar api router', req.params)
      if(!req.params || !req.params.location || !req.params.action || !req.params.id){
        console.log('invalid parameters')
        res.status(200).send({valid:false, message:"Invalid Parameters"})
        return
      }

      switch(req.params.location){
        case 'plaza':
          let reservation:any
          switch(req.params.action){
            case 'location-reservation':
              console.log('get location reservation', req.params.id)
              reservation = await getPlazaLocationCurrentReservation(parseInt(req.params.id))
              res.status(200).send({valid:true, reservation})
              break;

            case 'reservation':
              console.log('get reservation', req.params.id)
              reservation = await getPlazaReservation(req.params.id)
              res.status(200).send({valid:true, reservation})
              break;

            case 'user-reservation':
              console.log('get user reservations', req.params.id)
              reservation = await getUserPlazaReservations(req.params.id)
              res.status(200).send({valid:reservation? true : false, reservation})
              break;

            case 'locations':
              console.log('get location data', req.params.id)
              let location =  await getPlazaLocation(parseInt(req.params.id))
              res.status(200).send({valid:true, location})
              break;
          }
          break;

        case 'blitz':
          let [action, args, type] = req.params.action.split("-")

          console.log('blitz action', action, args, type)

          switch(action){
            case 'leaderboard':
              let wins:any[] = []
              let goals:any[] = []

              switch(args){
                case 'all':
                  wins = getLeaderboard('wins')
                  goals = getLeaderboard('goals')
                  res.status(200).send({valid:true, wins, goals})
                  break;

                case 'goals':
                  goals = getLeaderboard('goals')
                  res.status(200).send({valid:true, goals})
                  break;
                
                case 'wins':
                  wins = getLeaderboard('wins')
                  res.status(200).send({valid:true, wins})
                  break;
              }
              
              break;
          }
          break;
      }
  });

  router.get('/api/quests/outline/:auth', authentication, (req:any, res:any) => {
    handleQuestOutline(req,res)
  });

  router.get('/api/quests/:questId/users', (req:any, res:any) => {
    handleQuestData(req, res)
  })

  router.get('/api/quests/:questId/user/:userId', (req:any, res:any) => {
    handleSingleUserQuestData(req, res)
  })

  router.get('/api/leaderboard', (req:any, res:any) => {
    handleQuestLeaderboard(req, res)
  });

  // Public rewards endpoint
  router.get('/rewards', (req:any, res:any) => {
    handleRewardsData(req, res)
  });

// Marketplace endpoint to fetch, filter, and sort rewards
router.get('/api/marketplace/rewards', (req:any, res:any) => {
  handleMarketplaceRewards(req, res);
});

// Get single marketplace item details
router.get('/api/marketplace/rewards/:id', (req:any, res:any) => {
  handleMarketplaceItemDetails(req, res);
});

// Get available marketplace categories, filters and metadata
router.get('/api/marketplace/filters', (req:any, res:any) => {
  handleMarketplaceFilters(req, res);
});

  // Reward transactions endpoint
  router.get('/api/rewards/transactions', (req:any, res:any) => {
    const format = req.query.format; // e.g. 'html'
    const userId = req.query.userId;  // optional filter
    const questId = req.query.questId; // optional filter
    const status = req.query.status; // optional filter - 'success' or 'failed'
    const limit = parseInt(req.query.limit as string) || 100;

    let transactions = [];
    
    // Filter transactions based on query parameters
    if (userId) {
      transactions = getUserRewardTransactions(userId);
    } else if (questId) {
      transactions = getQuestRewardTransactions(questId);
    } else {
      transactions = getRewardTransactions();
    }

    // Apply status filter if provided
    if (status && (status === 'success' || status === 'failed')) {
      transactions = transactions.filter(tx => tx.status === status);
    }
    
    // Limit the number of transactions returned
    transactions = transactions.slice(0, limit);

    if (format === 'json') {
      return res.json(transactions);
    } else {
      // Get quest templates for name lookups
      const quests = getCache(QUEST_TEMPLATES_CACHE_KEY) || [];
      
      // Return HTML format
      const html = buildRewardTransactionsHTML(transactions, quests);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    }
  });
}

/**
 * Build HTML view for reward transactions
 * 
 * @param transactions Array of reward transactions
 * @param quests Array of quest templates for name lookups
 * @returns HTML string
 */
function buildRewardTransactionsHTML(transactions: any[], quests: QuestDefinition[]): string {
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };
  
  /* 
  // Create a lookup map for quests, steps, and tasks
  const questMap = new Map();
  quests.forEach(quest => {
    const stepMap = new Map();
    
    if (quest.steps && Array.isArray(quest.steps)) {
      quest.steps.forEach((step: StepDefinition) => {
        const taskMap = new Map();
        
        if (step.tasks && Array.isArray(step.tasks)) {
          step.tasks.forEach((task: TaskDefinition) => {
            taskMap.set(task.taskId, {
              description: task.description || task.taskId,
              metaverse: task.metaverse
            });
          });
        }
        
        stepMap.set(step.stepId, {
          name: step.name || step.stepId,
          tasks: taskMap
        });
      });
    }
    
    questMap.set(quest.questId, {
      title: quest.title || quest.questId,
      steps: stepMap
    });
  });
  
  // Helper function to get quest/step/task info
  const getQuestInfo = (transaction: any) => {
    const quest = questMap.get(transaction.questId);
    if (!quest) {
      return `Quest: ${transaction.questId}`;
    }
    
    let result = `Quest: <strong>${quest.title}</strong>`;
    
    if (transaction.stepId) {
      const step = quest.steps.get(transaction.stepId);
      if (step) {
        result += `<br>Step: ${step.name}`;
        
        if (transaction.taskId) {
          const task = step.tasks.get(transaction.taskId);
          if (task) {
            result += `<br>Task: ${task.description}`;
            if (task.metaverse) {
              result += ` <span title="Metaverse" style="color: var(--cyber-info);">(${task.metaverse})</span>`;
            }
          } else {
            result += `<br>Task: ${transaction.taskId}`;
          }
        }
      } else {
        result += `<br>Step: ${transaction.stepId}`;
        if (transaction.taskId) {
          result += `<br>Task: ${transaction.taskId}`;
        }
      }
    }
    
    return result;
  };
  */

  /* 
  // Simple function to show just the quest ID
  const getQuestInfo = (transaction: any) => {
    let result = `Quest: ${transaction.questId}`;
    
    if (transaction.stepId) {
      result += `<br>Step: ${transaction.stepId}`;
      
      if (transaction.taskId) {
        result += `<br>Task: ${transaction.taskId}`;
      }
    }
    
    return result;
  };
  */

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reward Transactions</title>
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
      min-width: 180px;
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
    
    .filter-button {
      padding: 0.75rem 1.5rem;
      background: linear-gradient(90deg, var(--cyber-neon-teal), var(--cyber-accent));
      border: none;
      border-radius: 4px;
      color: var(--cyber-bg-dark);
      font-family: 'Orbitron', sans-serif;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 0 10px var(--cyber-neon-teal-glow);
      min-width: 140px;
    }
    
    .filter-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 15px var(--cyber-neon-teal-glow);
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
    
    .status-success {
      color: var(--cyber-success);
      font-weight: 600;
    }
    
    .status-failed {
      color: var(--cyber-error);
      font-weight: 600;
    }
    
    .details-cell {
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .timestamp {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-bright);
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

    .eth-address {
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--cyber-text-dim);
      word-break: break-all; /* Allow breaking at any character to prevent overflow */
      display: inline-block;
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
</head>
<body>
  <div class="container">
    <div class="quests-card">
      <div class="card-header">
        <h1 class="glitch-text">Reward Transactions</h1>
      </div>
      
      <div class="card-body">
        <div class="filters">
          <div class="filter-group">
            <label class="filter-label" for="userId">User ID</label>
            <input type="text" id="userId" class="filter-input" placeholder="Filter by user...">
          </div>
          
          <!-- Quest filter removed -->
          
          <div class="filter-group">
            <label class="filter-label" for="status">Status</label>
            <select id="status" class="filter-select">
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          
          <button class="filter-button" onclick="applyFilters()">Apply</button>
        </div>
        
        <div class="results-count">Showing ${transactions.length} transactions</div>
        
        <div class="table-container">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Time</th>
                <th>User</th>
                <th>Reward</th>
                <!-- Quest column removed -->
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>`;

  // Add rows for each transaction
  for (const tx of transactions) {
    const statusClass = tx.status === 'success' ? 'status-success' : 'status-failed';
    
    html += `
              <tr>
                <td>${tx.id}</td>
                <td class="timestamp">${formatTimestamp(tx.timestamp)}</td>
                <td><span class="eth-address">${tx.userId}</span></td>
                <td>${tx.rewardName || 'Unknown'} (${tx.rewardType || 'Unknown'})</td>
                <!-- Quest column removed -->
                <td class="${statusClass}">${tx.status}</td>
                <td class="details-cell" title="${tx.error || 'No errors'}">${tx.error || 'No errors'}</td>
              </tr>`;
  }

  html += `
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    function applyFilters() {
      const userId = document.getElementById('userId').value;
      // Quest filter removed
      const status = document.getElementById('status').value;
      
      let url = window.location.pathname;
      
      // Start with empty query parameters
      const params = [];
      
      if (userId) params.push('userId=' + encodeURIComponent(userId));
      // Quest filter removed
      if (status && status !== 'all') params.push('status=' + encodeURIComponent(status));
      
      // Add format=html parameter
      params.push('format=html');
      
      // Construct the URL with query parameters
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      window.location.href = url;
    }
    
    // Set initial values from URL parameters
    document.addEventListener('DOMContentLoaded', function() {
      const urlParams = new URLSearchParams(window.location.search);
      
      if (urlParams.has('userId')) {
        document.getElementById('userId').value = urlParams.get('userId');
      }
      
      // Quest filter removed
      
      if (urlParams.has('status')) {
        document.getElementById('status').value = urlParams.get('status');
      }
    });
  </script>
</body>
</html>`;

  return html;
}