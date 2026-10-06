const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'icon.png'));
});

// Admin page route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Path for storing keys and subscriptions
const KEYS_FILE = path.join(__dirname, 'vapid-keys.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

// Initialize or load VAPID keys
let vapidKeys;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };
} else if (fs.existsSync(KEYS_FILE)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Failed to parse vapid-keys.json, regenerating...');
  }
}

if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(vapidKeys, null, 2));
  console.log('Generated new VAPID keys saved to vapid-keys.json');
}

webpush.setVapidDetails(
  'mailto:admin@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Load subscriptions helper
function getSubscriptions() {
  if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSubscriptions(subs) {
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
}

// 1. Get Public VAPID Key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// 2. Register / Subscribe endpoint
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  const subscriptions = getSubscriptions();
  const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);

  if (!exists) {
    subscriptions.push({
      ...subscription,
      subscribedAt: new Date().toISOString()
    });
    saveSubscriptions(subscriptions);
    console.log(`[Subscription] New device subscribed! Total active: ${subscriptions.length}`);
  } else {
    console.log(`[Subscription] Device already subscribed.`);
  }

  res.status(201).json({ success: true, count: subscriptions.length });
});

// 3. Unsubscribe endpoint
app.post('/api/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  let subscriptions = getSubscriptions();
  const initialLength = subscriptions.length;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  saveSubscriptions(subscriptions);
  console.log(`[Unsubscribe] Device unsubscribed. Remaining: ${subscriptions.length}`);
  res.json({ success: true, removed: initialLength !== subscriptions.length });
});

// 4. Status endpoint
app.get('/api/status', (req, res) => {
  const subscriptions = getSubscriptions();
  res.json({
    subscribersCount: subscriptions.length,
    vapidPublicKey: vapidKeys.publicKey
  });
});

// 5. Send notification endpoint (supports instant or scheduled delay)
app.post('/api/send-notification', async (req, res) => {
  const { title, body, icon, url, delaySeconds } = req.body;
  const delay = Math.max(0, parseInt(delaySeconds || 0, 10));

  const payload = JSON.stringify({
    title: title || '🔔 New Notification',
    body: body || 'You have a new update waiting for you!',
    icon: icon || '/icon.png',
    url: url || 'http://localhost:3000',
    timestamp: Date.now()
  });

  const triggerPush = async () => {
    let subscriptions = getSubscriptions();
    if (subscriptions.length === 0) {
      console.log('[Push] No active subscriptions to send to.');
      return { success: false, sent: 0, failed: 0, reason: 'No subscribers found' };
    }

    console.log(`[Push] Sending push notification to ${subscriptions.length} devices...`);
    const expiredEndpoints = [];
    let sentCount = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        sentCount++;
      } catch (err) {
        console.error(`[Push Error] Failed for endpoint: ${sub.endpoint.slice(0, 45)}...`, err.statusCode || err.message);
        // Status 404 or 410 means subscription has expired or been revoked
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      subscriptions = subscriptions.filter(sub => !expiredEndpoints.includes(sub.endpoint));
      saveSubscriptions(subscriptions);
      console.log(`[Push Cleanup] Removed ${expiredEndpoints.length} expired subscriptions.`);
    }

    console.log(`[Push Done] Successfully sent to ${sentCount} device(s).`);
    return { success: true, sent: sentCount, expired: expiredEndpoints.length };
  };

  if (delay > 0) {
    console.log(`[Push Scheduled] Will trigger in ${delay} seconds... Close your tab and watch!`);
    setTimeout(triggerPush, delay * 1000);
    return res.json({
      success: true,
      message: `Notification scheduled! Triggering in ${delay} seconds. You can close this tab now!`,
      delaySeconds: delay
    });
  } else {
    const result = await triggerPush();
    return res.json(result);
  }
});

const os = require('os');

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

const localIps = getLocalIpAddresses();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Server running on:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  localIps.forEach(ip => {
    console.log(`   Network (${ip.name}): http://${ip.address}:${PORT}`);
  });
  console.log(`====================================================`);
});
