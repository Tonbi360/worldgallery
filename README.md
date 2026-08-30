# World Gallery

A member-only human registry and high-trust directory built as a native iOS-style Progressive Web App (PWA).

World Gallery reimagines human presence on the open web — moving away from algorithmic feeds, followers, and engagement metrics toward quiet, deliberate curation and verified direct contact bridges.

---

## 🏛 Features

- **The Human Gate**: Every applicant is reviewed and welcomed deliberately by the Curator (with a hard cap of 10 approvals/day).
- **Contact Bridges**: Direct, private connection requests with automatic privacy masking (`••• ••• 52`, `t•••@w•••.org`) until connections are mutually accepted.
- **Native iOS Polish**:
  - Cupertino-native visual typography, colors, and layout rhythm.
  - Interactive alphabetical alphabet scrubber with physics-based smooth scrolling.
  - Full-featured **Edit Portrait** suite (custom avatar background palette, portrait photo management, contact bridges, availability modes).
  - Haptic feedback across all gestures and actions.
  - iOS-native bottom sheets, pull-down dismissals, and visual viewport keyboard handling.
- **Curator Desk (`/admin`)**:
  - Fast review queue with full applicant portrait preview.
  - Approval counter tracking daily admission quota (10/day).
  - Invite Seal manager with creation, usage tracking, and revoke controls.
  - Registry pulse telemetry (verified humans, active bridges, resting applications).
- **Progressive Web App**:
  - Standalone display mode with zero browser chrome.
  - Custom SVG app icons (`192x192`, `512x512`, maskable + any).
  - Native iOS Safari Add-to-Home-Screen guided modal.

---

## 📦 Project Structure

```
world-gallery/
├── index.html                 # PWA entry point & static splash seal
├── metadata.json              # App capabilities & configuration
├── package.json               # Dependencies & scripts
├── public/
│   ├── favicon.ico
│   ├── manifest.json          # Web App Manifest
│   ├── sw.js                  # Service Worker
│   └── icons/                 # PWA icons (192px, 512px)
├── src/
│   ├── App.tsx                # Client router & page transition manager
│   ├── main.tsx               # Application mount entry
│   ├── index.css              # Global Tailwind CSS imports & custom tokens
│   ├── components/
│   │   ├── AdminDashboard.tsx      # Curator Desk (Queue, Invites, Pulse)
│   │   ├── ApplyWizard.tsx         # 4-Step membership application
│   │   ├── AvatarMenu.tsx          # Member menu & navigation
│   │   ├── BridgeActionRow.tsx     # Contact bridge channel actions
│   │   ├── ConnectSheet.tsx        # Request bridge modal
│   │   ├── EditPortraitScreen.tsx  # Member profile editor
│   │   ├── GalleryDirectory.tsx    # Member directory & alpha scrubber
│   │   ├── InstallModal.tsx        # iOS PWA installation sheet
│   │   ├── LandingPage.tsx         # Public manifesto & entry point
│   │   ├── PhotoViewerModal.tsx    # Fullscreen portrait viewer
│   │   ├── PlaceholderRoom.tsx     # Restricted/rejected status rooms
│   │   ├── ProfileDetail.tsx       # Member portrait & contact bridge view
│   │   ├── ReportSheet.tsx         # Safety report sheet
│   │   ├── RequestsScreen.tsx      # Incoming connection requests
│   │   ├── SentScreen.tsx          # Sent requests & active bridges
│   │   ├── SignInPage.tsx          # Member / Curator sign-in
│   │   ├── StatesSystem.tsx        # Reusable Skeleton & Error views
│   │   └── WaitingRoom.tsx         # Application queue waiting room
│   ├── lib/
│   │   ├── curatorStore.ts         # Curator state & telemetry engine
│   │   ├── deeplinks.ts            # External messaging link launchers
│   │   ├── haptics.ts              # Web Vibration API tactile feedback
│   │   ├── pwa.ts                  # PWA standalone & install hooks
│   │   └── userProfile.ts          # Profile state & privacy masking
│   └── types/
│       ├── activity.ts             # Bridge request types
│       ├── admin.ts                # Curator applicant & telemetry types
│       ├── apply.ts                # Application wizard types & palettes
│       └── gallery.ts              # Member & bridge interfaces
```

---

## 🛠 Local Setup & Development

### 1. Clone the repository
```bash
git clone https://github.com/your-username/world-gallery.git
cd world-gallery
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment configuration
Copy the example environment file:
```bash
cp .env.local.example .env.local
```

Configure your environment variables in `.env.local`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/world_gallery?sslmode=require"
NEXTAUTH_SECRET="your-super-secret-auth-key-32-chars-minimum"
RESEND_API_KEY="re_123456789_your_api_key_here"
ADMIN_EMAIL="curator@worldgallery.org"
ADMIN_PASSCODE="world2026"
```

### 4. Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🚀 Building for Production

```bash
npm run build
```
The compiled static assets will be output to the `dist/` directory.

---

## 📱 PWA Installation

### iOS (Safari)
1. Open the app in Safari.
2. Tap the **Share** button (box with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the upper-right corner.

### Android (Chrome)
1. Open the app in Chrome.
2. Tap the **Install** prompt banner or tap the three dots in the upper right.
3. Select **Install app** / **Add to Home screen**.

---

## 🛡 Curator Access

- **URL**: Navigate to `/admin` or `/curator`.
- **Passcode**: Configured via `ADMIN_PASSCODE` (default: `world2026`).

---

## 🌿 GitHub Initialization Commands

To initialize a new Git repository and push this codebase to GitHub:

```bash
# 1. Initialize git
git init

# 2. Add files
git add .

# 3. Create initial commit
git commit -m "feat: complete Phase 2 Stage 1 cleanup and repo setup"

# 4. Set main branch
git branch -M main

# 5. Link remote repository
git remote add origin https://github.com/your-username/world-gallery.git

# 6. Push to GitHub
git push -u origin main
```
