import { getLeaderboard } from "../components/BasePlayerState";
import { getRewardTransactions, getUserRewardTransactions, getQuestRewardTransactions } from "../components/TheForge/RewardSystem";
import { QuestDefinition, StepDefinition, TaskDefinition } from "../components/TheForge/utils/types";
import { getCache } from "../utils/cache";
import { PROFILES_CACHE_KEY } from "../utils/initializer";
import { handleQuestData, handleQuestLeaderboard, handleQuestOutline, handleSingleUserQuestData } from "../utils/questing";
import { getPlazaLocation, getPlazaLocationCurrentReservation, getPlazaReservation, getUserPlazaReservations } from "../utils/reservations";
import { authentication } from "./admin";

export function apiRouter(router:any){
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

  // Reward transactions endpoint
  router.get('/api/rewards/transactions', authentication, (req:any, res:any) => {
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

    if (format === 'html') {
      // Return HTML format
      const html = buildRewardTransactionsHTML(transactions);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } else {
      // Default to JSON
      return res.json(transactions);
    }
  });
}

/**
 * Build HTML view for reward transactions
 * 
 * @param transactions Array of reward transactions
 * @returns HTML string
 */
function buildRewardTransactionsHTML(transactions: any[]): string {
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reward Transactions</title>
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
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
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
    
    .status-success {
      color: var(--success);
      font-weight: 600;
    }
    
    .status-failed {
      color: var(--danger);
      font-weight: 600;
    }
    
    .details-cell {
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .filters {
      margin-bottom: 1.5rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    
    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .filter-group label {
      font-weight: 600;
      font-size: 0.9rem;
    }
    
    .filter-group input, .filter-group select {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.25rem;
    }
    
    button {
      background-color: var(--primary);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-weight: 600;
    }
    
    button:hover {
      background-color: var(--primary-dark);
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
      <h1>Reward Transactions</h1>
    </header>
    
    <div class="filters">
      <div class="filter-group">
        <label for="userId">User ID:</label>
        <input type="text" id="userId" placeholder="Filter by user">
      </div>
      <div class="filter-group">
        <label for="questId">Quest ID:</label>
        <input type="text" id="questId" placeholder="Filter by quest">
      </div>
      <div class="filter-group">
        <label for="status">Status:</label>
        <select id="status">
          <option value="all">All</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <button onclick="applyFilters()">Apply Filters</button>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Time</th>
          <th>User</th>
          <th>Reward</th>
          <th>Quest/Task</th>
          <th>Status</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>`;

  // Add rows for each transaction
  for (const tx of transactions) {
    const statusClass = tx.status === 'success' ? 'status-success' : 'status-failed';
    const questTaskInfo = tx.taskId 
      ? `Quest: ${tx.questId}<br>Task: ${tx.taskId}` 
      : (tx.stepId ? `Quest: ${tx.questId}<br>Step: ${tx.stepId}` : `Quest: ${tx.questId}`);
    
    html += `
        <tr>
          <td>${tx.id}</td>
          <td>${formatTimestamp(tx.timestamp)}</td>
          <td>${tx.userId}</td>
          <td>${tx.rewardName} (${tx.rewardType})</td>
          <td>${questTaskInfo}</td>
          <td class="${statusClass}">${tx.status}</td>
          <td class="details-cell" title="${tx.error || 'No errors'}">${tx.error || 'No errors'}</td>
        </tr>`;
  }

  html += `
      </tbody>
    </table>
  </div>
  
  <script>
    function applyFilters() {
      const userId = document.getElementById('userId').value;
      const questId = document.getElementById('questId').value;
      const status = document.getElementById('status').value;
      
      let url = window.location.pathname + '?format=html';
      
      if (userId) url += '&userId=' + encodeURIComponent(userId);
      if (questId) url += '&questId=' + encodeURIComponent(questId);
      if (status && status !== 'all') url += '&status=' + encodeURIComponent(status);
      
      window.location.href = url;
    }
  </script>
</body>
</html>`;

  return html;
}