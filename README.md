# CreativeFlow - AI Design Studio

A professional content creation platform built with Next.js 16, TypeScript, Tailwind CSS, and Fabric.js. Seamlessly integrates 2D design with AI-powered 3D model generation.

## 🚀 Key Features

- **Infinite Canvas**: Advanced workspace manipulation.
- **AI 3D Generation**: Meshy AI integration for text-to-3D and image-to-3D.
- **Asset & Template Library**: Save custom templates and managing 3D/2D assets.
- **Layer Management**: Professional layer locking, visibility, and reordering.

## 🚀 Deployment (Render.com / Docker)

This project includes a `Dockerfile` for easy deployment.

1. **Build**: `docker build -t creative-flow .`
2. **Run**: `docker run -p 3000:3000 creative-flow`

For Render.com:
- Select "Docker" as environment.
- Root directory: `.`
- Build Context: `.`

## 🚀 Getting Started

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

## 🏗 Project Structure

- **`src/app/page.tsx`**: Main entry point combining Sidebar, Canvas, and Properties Panel.
- **`src/components/DesignCanvas.tsx`**: Fabric.js canvas wrapper handling resize and initialization.
- **`src/components/Toolbar.tsx`**: Left sidebar for adding text, shapes, and images.
- **`src/components/PropertiesPanel.tsx`**: Right sidebar for editing selected object properties (Fill, Opacity).
- **`src/types.ts`**: Common TypeScript interfaces.

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **Canvas Engine**: Fabric.js (v6/7)
- **Icons**: Lucide React

## 📝 Features Implemented

- **Infinite Canvas Shell**: Fixed sidebars with a fluid center workspace.
- **Fabric.js Integration**: Interactive canvas with selection support.
- **Basic Tools**: Add Rectangle, Add Text.
- **Context Awareness**: Properties panel updates based on selection.
