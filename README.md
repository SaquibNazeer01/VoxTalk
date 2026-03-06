# 🎙️ VoxTalk — Real-Time Push-to-Talk Walkie Talkie

A real-time push-to-talk walkie talkie web app. Create a channel, share the code, hold the button, and talk.

Built with **Node.js**, **Socket.IO**, and **WebRTC**.

---

## Quick Start (Run Locally)

### 1. Install [Node.js](https://nodejs.org/) (v18+)

### 2. Open Terminal & Go to project folder
```bash
cd c:\Projects\walkie-talkie
```

### 3. Install dependencies (first time only)
```bash
npm install
```

### 4. Start the server
```bash
npm start
```

### 5. Open browser
```
http://localhost:3000
```

---

## How to Use

1. Enter your **Name** (callsign)
2. Click **Create Channel** → share the 6-character code with others
3. Others enter the code + their name → click **Join Channel**
4. **Hold the PTT button** (or **Spacebar** on desktop) to talk
5. Release to stop transmitting

---

## 🚀 Deploy for Free (So Anyone Can Use It)

> **Important:** This app uses WebSockets (Socket.IO), so it **cannot** be deployed on Vercel or Netlify. Use one of these platforms instead:

### Option 1: Deploy on Render.com (Recommended)

1. Push your code to **GitHub**:
   ```bash
   cd c:\Projects\walkie-talkie
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/voxtalk.git
   git push -u origin main
   ```

2. Go to [render.com](https://render.com) and sign up (free)

3. Click **New → Web Service**

4. Connect your GitHub repo

5. Configure:
   | Setting | Value |
   |---|---|
   | **Name** | voxtalk |
   | **Runtime** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Plan** | Free |

6. Click **Create Web Service**

7. Wait 2-3 minutes → your app will be live at `https://voxtalk.onrender.com`

8. **Share the link** with anyone — they can create/join channels and talk!

### Option 2: Deploy on Railway.app

1. Push your code to GitHub (same as above)
2. Go to [railway.app](https://railway.app) and sign up
3. Click **New Project → Deploy from GitHub Repo**
4. Select your repo → it auto-detects Node.js
5. Railway gives you a public URL → share it!

---

## Project Structure

```
walkie-talkie/
├── server.js        # Node.js + Socket.IO backend
├── package.json     # Dependencies
├── .gitignore       # Git ignore rules
├── README.md
└── public/
    ├── index.html   # Walkie Talkie UI
    ├── style.css    # Skeuomorphic radio styles
    └── app.js       # WebRTC + PTT logic
```

---

## Tech Stack

- **Node.js + Express** — Server
- **Socket.IO** — Real-time signaling
- **WebRTC** — Peer-to-peer audio
- **Vanilla JS / CSS** — Frontend (no frameworks)
