let swRegistration = null;
let currentSubscription = null;
let vapidPublicKey = null;

// DOM Elements
const statusPermission = document.getElementById('statusPermission');
const statusPush = document.getElementById('statusPush');
const statusSubCount = document.getElementById('statusSubCount');

const btnSubscribe = document.getElementById('btnSubscribe');
const btnUnsubscribe = document.getElementById('btnUnsubscribe');

const notificationForm = document.getElementById('notificationForm');
const btnSendDelayed = document.getElementById('btnSendDelayed');
const btnSendImmediate = document.getElementById('btnSendImmediate');
const notificationLog = document.getElementById('notificationLog');

// Helper: Convert VAPID base64 string to Uint8Array
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
  const permission = Notification.permission;
  statusPermission.textContent = permission;

  if (currentSubscription) {
    statusPush.textContent = 'Yes (Subscribed)';
    btnSubscribe.textContent = 'Subscribed';
    btnSubscribe.disabled = true;
    btnUnsubscribe.style.display = 'inline-flex';
  } else {
    statusPush.textContent = 'No';
    btnSubscribe.textContent = 'Allow Notifications';
    btnSubscribe.disabled = false;
    btnUnsubscribe.style.display = 'none';
  }
}

async function fetchServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    vapidPublicKey = data.vapidPublicKey;
    statusSubCount.textContent = `${data.subscribersCount}`;
  } catch (err) {
    console.error('Failed to get server status:', err);
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
    console.error('Service worker registration failed:', err);
  }
}

async function syncSubscription(sub) {
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    const data = await res.json();
    if (data.count !== undefined) {
      statusSubCount.textContent = `${data.count}`;
    }
  } catch (err) {
    console.error('Failed to sync subscription:', err);
  }
}

async function subscribeUser() {
  try {
    btnSubscribe.disabled = true;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showLog('Permission was not granted.', 'error');
      updateUI();
      return;
    }

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
    showLog('Subscribed! You can now test sending notifications.', 'success');
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

    await fetchServerStatus();
    showLog('Unsubscribed.', 'info');
    updateUI();
  } catch (err) {
    showLog(`Unsubscribe error: ${err.message}`, 'error');
  }
}

async function sendNotification(delaySeconds = 0) {
  const title = document.getElementById('inputTitle').value.trim();
  const body = document.getElementById('inputBody').value.trim();
  const url = document.getElementById('inputUrl').value.trim();

  try {
    if (delaySeconds > 0) {
      btnSendDelayed.disabled = true;
      let left = delaySeconds;
      showLog(`⏳ Notification scheduled in ${left}s. Close this tab or switch apps now!`, 'info');

      const timer = setInterval(() => {
        left--;
        if (left > 0) {
          showLog(`⏳ Sending in ${left}s. You can close this tab now.`, 'info');
        } else {
          clearInterval(timer);
          btnSendDelayed.disabled = false;
        }
      }, 1000);
    } else {
      btnSendImmediate.disabled = true;
      showLog('Sending notification...', 'info');
    }

    const res = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, delaySeconds })
    });

    const data = await res.json();

    if (!delaySeconds) {
      btnSendImmediate.disabled = false;
      if (data.success) {
        showLog('Notification sent to browser.', 'success');
      } else {
        showLog(data.reason || 'Failed to send.', 'error');
      }
    }
  } catch (err) {
    showLog(`Error: ${err.message}`, 'error');
    btnSendDelayed.disabled = false;
    btnSendImmediate.disabled = false;
  }
}

btnSubscribe.addEventListener('click', subscribeUser);
btnUnsubscribe.addEventListener('click', unsubscribeUser);

notificationForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendNotification(0);
});

btnSendDelayed.addEventListener('click', () => {
  sendNotification(10);
});

window.addEventListener('DOMContentLoaded', async () => {
  await fetchServerStatus();
  await initServiceWorker();
  updateUI();
});
