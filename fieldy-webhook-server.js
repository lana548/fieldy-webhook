// Fieldy Webhook Receiver Server
// Install: npm install express body-parser
// Run: node fieldy-webhook-server.js

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('public')); // Serve your HTML file

// Store webhook data in memory (use a database in production)
const webhookData = new Map();

// Webhook endpoint for Fieldy
app.post('/webhook/:userId', (req, res) => {
    const { userId } = req.params;
    const payload = req.body;
    
    console.log(`📡 Webhook received for user ${userId}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    // Extract tasks from transcription
    const tasks = extractTasks(payload.transcription);
    
    // Store for this user
    if (!webhookData.has(userId)) {
        webhookData.set(userId, []);
    }
    
    webhookData.get(userId).push({
        timestamp: new Date(),
        payload: payload,
        extractedTasks: tasks
    });
    
    // Keep only last 100 webhooks per user
    const userWebhooks = webhookData.get(userId);
    if (userWebhooks.length > 100) {
        userWebhooks.shift();
    }
    
    console.log(`✅ Extracted ${tasks.length} tasks:`, tasks);
    
    res.status(200).json({
        success: true,
        tasksExtracted: tasks.length,
        tasks: tasks
    });
});

// Get webhook data for a user (for the frontend to poll)
app.get('/api/webhooks/:userId', (req, res) => {
    const { userId } = req.params;
    const userWebhooks = webhookData.get(userId) || [];
    res.json(userWebhooks);
});

// Get latest tasks for a user
app.get('/api/tasks/:userId', (req, res) => {
    const { userId } = req.params;
    const userWebhooks = webhookData.get(userId) || [];
    
    // Get all extracted tasks from recent webhooks
    const allTasks = [];
    userWebhooks.forEach(webhook => {
        webhook.extractedTasks.forEach(task => {
            allTasks.push({
                ...task,
                date: webhook.timestamp,
                transcription: webhook.payload.transcription
            });
        });
    });
    
    res.json(allTasks);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', webhooks: webhookData.size });
});

// Task extraction logic
function extractTasks(transcription) {
    const tasks = [];
    
    // Patterns that indicate a task
    const taskPatterns = [
        /(?:need to|have to|should|must|gonna|going to|will|todo|to do)\s+([^.!?]{5,100})/gi,
        /(?:remind me to|make sure to|don't forget to)\s+([^.!?]{5,100})/gi,
        /(?:I'll|I will)\s+([^.!?]{5,100})/gi,
        /(?:action item|task|homework):\s*([^.!?]{5,100})/gi,
        /(?:let's|we should|we need to)\s+([^.!?]{5,100})/gi
    ];
    
    taskPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(transcription)) !== null) {
            const taskText = match[1].trim();
            
            // Clean up the task text
            const cleanTask = cleanTaskText(taskText);
            
            if (cleanTask && cleanTask.length >= 5) {
                const category = categorizeTask(cleanTask);
                tasks.push({
                    text: cleanTask,
                    category: category,
                    confidence: 0.8
                });
            }
        }
    });
    
    // Remove duplicates
    const uniqueTasks = [];
    const seen = new Set();
    
    tasks.forEach(task => {
        const normalized = task.text.toLowerCase().trim();
        if (!seen.has(normalized)) {
            seen.add(normalized);
            uniqueTasks.push(task);
        }
    });
    
    return uniqueTasks;
}

function cleanTaskText(text) {
    // Remove common filler words at the start
    text = text.replace(/^(like|um|uh|so|well|actually)\s+/i, '');
    
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);
    
    // Remove trailing conjunctions
    text = text.replace(/\s+(and|or|but)$/i, '');
    
    return text.trim();
}

function categorizeTask(taskText) {
    const text = taskText.toLowerCase();
    
    // Keywords for quick tasks (5-15 min)
    const quickKeywords = [
        'call', 'email', 'text', 'message', 'ping', 'send', 
        'reply', 'respond', 'check', 'look up', 'google', 
        'find', 'ask', 'reach out', 'follow up', 'schedule',
        'buy', 'pick up', 'grab', 'order'
    ];
    
    // Keywords for deep work tasks
    const deepKeywords = [
        'write', 'create', 'build', 'design', 'develop', 
        'plan', 'analyze', 'review', 'complete', 'finish',
        'prepare', 'draft', 'organize', 'implement', 'fix',
        'update', 'refactor', 'debug', 'test'
    ];
    
    // Keywords for ideas/research
    const ideaKeywords = [
        'idea', 'explore', 'research', 'learn', 'study',
        'read', 'watch', 'investigate', 'consider', 
        'think about', 'look into', 'check out', 'maybe'
    ];
    
    // Check each category
    for (const keyword of ideaKeywords) {
        if (text.includes(keyword)) return 'idea';
    }
    
    for (const keyword of deepKeywords) {
        if (text.includes(keyword)) return 'deep';
    }
    
    for (const keyword of quickKeywords) {
        if (text.includes(keyword)) return 'quick';
    }
    
    // Default: short tasks are quick, long tasks are deep
    return taskText.length < 30 ? 'quick' : 'deep';
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Fieldy Webhook Server running on port ${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook/{userId}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

// Example test
console.log('\n📝 Example webhook payload:');
console.log(JSON.stringify({
    date: new Date().toISOString(),
    transcription: "I need to call Sarah back and email the team. Also want to research that new AI tool.",
    transcriptions: [
        {
            text: "I need to call Sarah back and email the team.",
            speaker: "A",
            start: 0.04,
            end: 3.2,
            duration: 3.16
        }
    ]
}, null, 2));
