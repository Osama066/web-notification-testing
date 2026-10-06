# Web Push Notification Testing Lab

A complete testing environment for **Web Push Notifications** using Service Workers and the VAPID protocol.

## How it works (The exact flow requested)

```
User opens website (http://localhost:3000)
        ↓
Clicks "Allow Notifications" (Registers Service Worker & saves push subscription)
        ↓
Closes the website tab
        ↓
Opens Instagram / YouTube / any other app (Browser keeps push listening active)
        ↓
Backend triggers a push notification (instantly or after countdown)
        ↓
Windows Action Center / Browser System Toast appears with "Open" action
        ↓
Clicking "Open" re-opens and focuses the website!
```

## Running the project

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open **`http://localhost:3000`** in Chrome, Microsoft Edge, or Brave.

## How to test the "Closed Tab" feature

1. Click **"Allow & Enable Notifications"** and grant browser permission.
2. In the right panel, click **⏱️ Send in 10s (Test Closed Tab)**.
3. Immediately **close the website tab** or open a new tab with YouTube / Instagram.
4. After 10 seconds, the backend will send the push packet.
5. A native Windows notification toast will pop up with an **"👉 Open"** button!
6. Click it, and it will re-open and focus your website.
