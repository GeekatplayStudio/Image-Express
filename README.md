# CreativeFlow - AI Design Studio

A professional content creation platform built with Next.js 16, TypeScript, Tailwind CSS, and Fabric.js. Seamlessly integrates 2D design with AI-powered 3D model generation.

## 🚀 Key Features

### Studio & Design
- **Infinite Canvas**: Advanced vector workspace using Fabric.js.
- **Layer Management**: Professional layer locking, visibility, and reordering.
- **Interactive Tools**: Gradient editor, shape tools, and text manipulation.
- **Export Options**: Export designs to PNG, JPG, SVG, PDF, and JSON.

### AI Capabilities
- **AI 3D Generation**: Integration with Meshy/Tripo for text-to-3D and image-to-3D conversion.
- **Background Processing**: Asynchronous job handling for long-running AI tasks.
- **3D Viewer**: Interactive 3D model inspector and editor using Three.js / React Three Fiber.

### Workspace Management
- **Dashboard**: Home screen with templates and recent designs.
- **Authentication**: Secure login system (Demo credentials: `test` / `test`).
- **User Profile**: Profile management and session handling.
- **Templates**: Start quickly with pre-defined layouts.

## 🚀 Deployment

### Quick Start (Local)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open the app**:
   Visit [http://localhost:3000](http://localhost:3000).

### Docker Deployment (Render.com / Vercel / Railway)

This project includes a `Dockerfile` optimized for production.

1. **Build**: 
   ```bash
   docker build -t creative-flow .
   ```
2. **Run**: 
   ```bash
   docker run -p 3000:3000 creative-flow
   ```

**Environment Variables:**
- `MESHY_API_KEY`: API key for 3D generation.
- `OPENAI_API_KEY`: (Optional) For AI text assistant.

## 🏗 Project Structure

- **`src/app`**:
  - `page.tsx`: Main layout handling views (Dashboard vs Editor).
  - `api/`: Backend routes for AI proxies and asset management.
- **`src/components`**:
  - `Dashboard.tsx`: Template selector and home view.
  - `LoginModal.tsx` & `UserProfileModal.tsx`: Authentication UI.
  - `DesignCanvas.tsx`: Core Fabric.js workspace.
  - `ThreeDGenerator.tsx`: AI integration panel.
  - `PropertiesPanel.tsx`: Context-aware editing sidebar.

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Graphics**: Fabric.js (2D), Three.js / React Three Fiber (3D)
- **Icons**: Lucide React
