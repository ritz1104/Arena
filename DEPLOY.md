# Deploying to Render

The whole app (React client, REST API and Socket.IO) runs as **one Render Web Service**. The database is **MongoDB Atlas**, because Render doesn't offer managed MongoDB.

## 1. Create the database (MongoDB Atlas, free tier is fine)

1. Sign in at https://cloud.mongodb.com and create a free **M0** cluster. Pick a region near your Render region (Singapore / Mumbai).
2. **Database Access → Add user** with a username and password.
3. **Network Access → Add IP address → `0.0.0.0/0`**. Render's outgoing IPs change, so this is needed. Access is still protected by the user and password.
4. **Connect → Drivers**, then copy the connection string and add a database name before the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/buzz_or_lose?retryWrites=true&w=majority
   ```

## 2. Put the code on GitHub

Render deploys from a Git repository. `server/.env`, `node_modules` and the build output are already excluded by `.gitignore`.

```powershell
git init
```

```powershell
git add .
```

```powershell
git commit -m "Buzz or Lose – The Arena"
```

Create an **empty** repository on GitHub (private is fine), then:

```powershell
git remote add origin https://github.com/<your-account>/<repo>.git
```

```powershell
git branch -M main
```

```powershell
git push -u origin main
```

## 3. Create the service on Render (Blueprint)

1. In the Render dashboard, go to **New → Blueprint** and choose the repository. Render reads `render.yaml`.
2. Fill in the values it asks for:
   - `MONGO_URI`: the Atlas string from step 1.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`: your host login. The account is created automatically on first start.
   - `JWT_SECRET` is generated for you.
3. Click **Apply**. The first build takes a few minutes. When it finishes, the app is live at `https://buzz-or-lose-arena.onrender.com` (or similar).

| URL | Who uses it |
|---|---|
| `/admin` | Host (sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |
| `/arena/live` | Projector / audience screen |
| `/buzz/left?key=…`, `/buzz/right?key=…` | Podium buzzers (links in **Settings → Podium buzzers**) |

### Plan choice

`render.yaml` uses the **Starter** plan with a 5 GB **persistent disk** mounted at `/var/data`.

- **Free plan:** the service **sleeps after 15 minutes without traffic**. The next visitor then waits about a minute while it wakes. The free plan also has **no disk**, so uploaded Grand Final videos and custom sounds disappear on every restart or deploy. For a free deployment, change `plan: starter` to `plan: free`, delete the `disk:` block, and use **video links** (YouTube / Drive) instead of uploads.
- **Starter:** always on, and uploads are kept. Recommended at least for event day.

### Settings the blueprint applies

| Setting | Value |
|---|---|
| Build | `npm run render-build`: installs server and client, then builds the React app |
| Start | `npm start`: starts the Node server, which also serves the built client |
| Health check | `/api/health` |
| Node | 22 (`.node-version`) |

### Created the service manually instead of with a Blueprint?

Under **Settings → Build & Deploy**, set these, then click **Manual Deploy → Clear build cache & deploy**:

| Setting | Value |
|---|---|
| Root Directory | *(leave empty)* |
| Build Command | `npm run render-build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Under **Environment**, add `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET` (any long random text), `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

If the site shows **"Cannot GET /"** or **"The server is running, but the website was not built"**, the Build Command is still `npm install`.

## 4. Load your data

- **Teams and questions:** import them on the live site (**Teams → Import**, **Questions → Import CSV / Excel**). Or seed the sample data from your laptop against Atlas:

  ```powershell
  $env:MONGO_URI = "mongodb+srv://…/buzz_or_lose?…"; npm run seed
  ```

  (`npm run seed -- --reset` wipes teams, questions and competitions first.)
- Local and Render data are separate: your local `buzz_or_lose` database is **not** copied to Atlas. To move it, run `mongodump` locally and `mongorestore --uri "<atlas uri>"`.

## Event-day checklist

- Open `/admin` and `/arena/live` once before the audience arrives, so a free-plan service has woken up.
- Click once on the projector page to enable sound and video playback.
- Copy the podium buzzer links from **Settings** onto the phones or tablets.
- Large video uploads go over the venue internet, so upload them as soon as teams hand them in, or use links.
- Everything is saved in Atlas. If Render restarts mid-battle, screens reconnect and the battle continues where it stopped.
