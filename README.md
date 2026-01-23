# Image Express - Open Source AI Design Studio

Image Express is a professional content creation platform built with Next.js 16, TypeScript, Tailwind CSS, and Fabric.js. It seamlessly integrates 2D design with AI-powered 3D model generation.

**Open Source Project by [GeekatplayStudio](https://github.com/GeekatplayStudio)**

## 🌟 Connect with Us

- **GitHub Repository**: [GeekatplayStudio](https://github.com/GeekatplayStudio)
- **LinkedIn**: [Geekatplay](https://www.linkedin.com/in/geekatplay/)
- **YouTube (English)**: [@geekatplay](https://www.youtube.com/@geekatplay)
- **YouTube (Russian)**: [@geekatplay-ru](https://www.youtube.com/@geekatplay-ru)
- **Website**: [Geekatplay.com](https://www.geekatplay.com)
- **Photography**: [ChopinePhotography.com](https://www.chopinephotography.com)

## 🚀 Key Features

### Studio & Design
- **Infinite Canvas**: Advanced vector workspace using Fabric.js.
- **Layer Management**: Professional layer locking, visibility, and reordering.
- **Interactive Tools**: Gradient editor, shape tools, and text manipulation.
- **Export Options**: Export designs to PNG, JPG, SVG, PDF, and JSON.
- **In-App Manual**: Contextual help modal with persistent chapter navigation and quick close actions.

### AI Capabilities
- **Advanced 3D Generation**: 
  - Integrated **Meshy** and **Tripo** AI for high-quality 3D models.
  - **Textured Models**: Enforced PBR texture generation for realistic results.
  - **Background Processing**: Robust polling system for long-running AI tasks.
- **Image Generation**: (Coming Soon) Text-to-Image support.

### Storage & Management
- **Server-Side Design Storage**: Designs are saved securely on the server (via filesystem in this edition), bypassing browser storage limits.
- **Asset Library**: 
  - Upload, organize, and manage images and 3D models.
  - **Renaming System**: Interactive renaming overlay for assets.
- **Authentication**: Secure login system with server-side key persistence for API access.
- **Audit Logging**: Automatic login activity logging with IP and user agent; viewable from Settings.

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
   Visit [http://localhost:3000](http://localhost:3000) (or port 3001 if 3000 is busy).

### Docker Deployment

This project includes a `Dockerfile` optimized for production.

1. **Build**: 
   ```bash
   docker build -t image-express .
   ```
2. **Run**: 
   ```bash
   docker run -p 3000:3000 image-express
   ```

## 🏗 Project Structure

- **`src/app`**:
  - `page.tsx`: Main layout handling views (Dashboard vs Editor).
  - `api/`: Backend routes for AI proxies, assets, and **design persistence**.
    - `api/designs/`: Endpoints for saving, listing, and deleting designs server-side.
- **`src/components`**:
  - `Dashboard.tsx`: Template selector and home view.
  - `DesignCanvas.tsx`: Core Fabric.js workspace.
  - `ThreeDGenerator.tsx`: AI integration panel.
  - `PropertiesPanel.tsx`: Context-aware editing sidebar.

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Graphics**: Fabric.js (2D), Three.js / React Three Fiber (3D)
- **Icons**: Lucide React
