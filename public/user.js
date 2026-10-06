let swRegistration = null;
let currentSubscription = null;
let vapidPublicKey = null;

const statusPermission = document.getElementById('statusPermission');
const statusPush = document.getElementById('statusPush');
const btnSubscribe = document.getElementById('btnSubscribe');
const btnUnsubscribe = document.getElementById('btnUnsubscribe');
const notificationLog = document.getElementById('notificationLog');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function showLog(message, type = 'info') {
  notificationLog.style.display = 'block';
  notificationLog.className = `log-box log-${type}`;
  notificationLog.innerHTML = message;
}

function updateUI() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true || 
                       window.matchMedia('(display-mode: standalone)').matches;
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  if (isIOS && !isStandalone) {
    statusPermission.textContent = 'iOS Restriction';
    statusPush.textContent = 'Add to Home Screen';
    btnSubscribe.textContent = 'Tap Share (📤) → Add to Home Screen';
    btnSubscribe.disabled = true;
    showLog('📲 <strong>iPhone Notice:</strong> Apple disables web notifications inside Safari / Chrome tabs.<br><br>👉 <strong>How to enable on iPhone:</strong><br>1. Open this link in <strong>Safari</strong>.<br>2. Tap the <strong>Share</strong> button (📤).<br>3. Tap <strong>"Add to Home Screen"</strong> (➕).<br>4. Open the app from your iPhone Home Screen!', 'info');
    return;
  }

  const permission = isSupported ? Notification.permission : 'Not Supported';
  statusPermission.textContent = permission;

  if (!isSupported) {
    statusPush.textContent = 'Not Supported';
    btnSubscribe.textContent = 'Notifications Not Supported';
    btnSubscribe.disabled = true;
    showLog('⚠️ Notification API is not available in this browser. Please use Google Chrome or Edge.', 'error');
    return;
  }

  if (currentSubscription) {
    statusPush.textContent = 'Active (Subscribed)';
    btnSubscribe.textContent = 'Subscribed';
    btnSubscribe.disabled = true;
    btnUnsubscribe.style.display = 'inline-flex';
  } else {
    statusPush.textContent = 'Not Subscribed';
    btnSubscribe.textContent = 'Allow Notifications';
    btnSubscribe.disabled = false;
    btnUnsubscribe.style.display = 'none';
  }
}

async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showLog('Push notifications are not supported in this browser.', 'error');
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    currentSubscription = await swRegistration.pushManager.getSubscription();
    if (currentSubscription) {
      await syncSubscription(currentSubscription);
    }
    updateUI();
  } catch (err) {
    console.error('Service worker error:', err);
  }
}

async function syncSubscription(sub) {
  try {
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
  } catch (err) {
    console.error('Failed to sync subscription:', err);
  }
}

async function subscribeUser() {
  try {
    btnSubscribe.disabled = true;

    if (!('Notification' in window)) {
      showLog('Notification API is not available on this mobile browser over HTTP. HTTPS is required.', 'error');
      btnSubscribe.disabled = false;
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showLog('Permission was not granted.', 'error');
      updateUI();
      return;
    }

    if (!swRegistration) {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
    }
    await navigator.serviceWorker.ready;

    if (!vapidPublicKey) {
      const res = await fetch('/api/vapid-public-key');
      const data = await res.json();
      vapidPublicKey = data.publicKey;
    }

    currentSubscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    await syncSubscription(currentSubscription);
    showLog('Notifications enabled! You can now close this tab and send from /admin.', 'success');
    updateUI();
  } catch (err) {
    showLog(`Subscription error: ${err.message}`, 'error');
    btnSubscribe.disabled = false;
  }
}

async function unsubscribeUser() {
  if (!currentSubscription) return;

  try {
    const endpoint = currentSubscription.endpoint;
    await currentSubscription.unsubscribe();
    currentSubscription = null;

    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    });

    showLog('Unsubscribed.', 'info');
    updateUI();
  } catch (err) {
    showLog(`Unsubscribe error: ${err.message}`, 'error');
  }
}

// Message Inbox Management
const messagesList = document.getElementById('messagesList');
const btnClearMessages = document.getElementById('btnClearMessages');

function getStoredMessages() {
  try {
    return JSON.parse(localStorage.getItem('web_push_messages') || '[]');
  } catch (e) {
    return [];
  }
}

function saveMessages(msgs) {
  localStorage.setItem('web_push_messages', JSON.stringify(msgs));
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMessages() {
  if (!messagesList) return;
  const msgs = getStoredMessages();
  if (msgs.length === 0) {
    messagesList.innerHTML = '<p class="empty-state">No notifications clicked yet. Send a notification from /admin, click the popup, and it will appear here!</p>';
    return;
  }

  messagesList.innerHTML = msgs.map(m => {
    const timeStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `
      <div class="message-card">
        <div class="message-card-header">
          <span class="message-card-title">${escapeHtml(m.title)}</span>
          <span class="message-card-time">${timeStr}</span>
        </div>
        <p class="message-card-body">${escapeHtml(m.body)}</p>
        <span class="message-tag">🔔 Push Received</span>
      </div>
    `;
  }).join('');
}

function addReceivedMessage(title, body, timestamp) {
  const msgs = getStoredMessages();
  const exists = msgs.some(m => m.timestamp === timestamp && m.title === title);
  if (!exists) {
    msgs.unshift({ title, body, timestamp: timestamp || Date.now() });
    saveMessages(msgs.slice(0, 30));
    renderMessages();
  }
}

function checkIncomingNotificationParams() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get('notify_title');
  const body = params.get('notify_body');
  const time = parseInt(params.get('notify_time') || Date.now(), 10);

  if (title) {
    addReceivedMessage(title, body || '', time);
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NEW_NOTIFICATION') {
      addReceivedMessage(event.data.title, event.data.body, event.data.timestamp);
    }
  });
}

if (btnClearMessages) {
  btnClearMessages.addEventListener('click', () => {
    saveMessages([]);
    renderMessages();
  });
}

btnSubscribe.addEventListener('click', subscribeUser);
btnUnsubscribe.addEventListener('click', unsubscribeUser);

window.addEventListener('DOMContentLoaded', async () => {
  renderMessages();
  checkIncomingNotificationParams();

  try {
    const res = await fetch('/api/vapid-public-key');
    const data = await res.json();
    vapidPublicKey = data.publicKey;
  } catch (e) {}

  await initServiceWorker();
  updateUI();
});
