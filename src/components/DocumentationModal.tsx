"use client";

import { X, HelpCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

const sections = [
    { id: "introduction", title: "Introduction" },
    { id: "dashboard", title: "Dashboard Overview" },
    { id: "editor-layout", title: "Editor Layout" },
    { id: "canvas", title: "Canvas Navigation" },
    { id: "toolbar", title: "Toolbar Tools" },
    { id: "properties", title: "Properties & Layers" },
    { id: "assets", title: "Asset Library" },
    { id: "ai-tools", title: "AI Generation Tools" },
    { id: "templates", title: "Templates & Reuse" },
    { id: "saving", title: "Saving & Exporting" },
    { id: "settings", title: "Settings & API Keys" },
    { id: "troubleshooting", title: "Troubleshooting & Tips" },
    { id: "shortcuts", title: "Productivity Shortcuts" },
];

interface DocumentationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DocumentationModal({ isOpen, onClose }: DocumentationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-4xl h-[85vh] max-h-[85vh] rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-border bg-secondary/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-primary/10 text-primary">
                            <HelpCircle size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">Image Express Manual</h2>
                            <p className="text-xs text-muted-foreground">Guided tour of the dashboard, editor, AI tools, and asset workflow.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors" aria-label="Close documentation">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex h-full">
                    <aside className="w-64 border-r border-border/60 bg-secondary/10 flex-shrink-0">
                        <div className="sticky top-0 max-h-full overflow-y-auto px-5 py-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chapters</h3>
                            <nav className="mt-3 space-y-2 text-sm text-muted-foreground">
                                {sections.map((section) => (
                                    <a key={section.id} href={`#${section.id}`} className="block px-3 py-2 rounded-md hover:bg-secondary hover:text-foreground transition-colors">
                                        {section.title}
                                    </a>
                                ))}
                            </nav>
                            <button
                                onClick={onClose}
                                className="mt-6 w-full px-3 py-2 text-xs font-semibold text-muted-foreground border border-border/60 rounded-md hover:bg-secondary hover:text-foreground transition-colors"
                            >
                                Close Manual
                            </button>
                        </div>
                    </aside>

                    <div className="flex-1 h-full overflow-y-auto px-6 py-6 space-y-10 text-sm leading-relaxed" id="documentation-content">
                        <IntroSection />
                        <Section id="dashboard" title="Dashboard Overview">
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Welcome banner:</span> confirms the current profile and links to community resources.</li>
                                <li><span className="font-medium">Start Creating:</span> opens a blank canvas with the editor ready for a custom project.</li>
                                <li><span className="font-medium">Template cards:</span> load predefined layouts stored under assets/templates for quick starts.</li>
                                <li><span className="font-medium">Recent designs:</span> shows saved canvases from /api/designs/list with delete shortcuts and thumbnail previews.</li>
                            </ul>
                        </Section>

                        <Section id="editor-layout" title="Editor Layout">
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Header bar:</span> houses Save, Settings, Profile, Export, and quick status chips for AI and 3D connectivity.</li>
                                <li><span className="font-medium">Toolbar (left):</span> tool-based workflow including Select, Shapes, Text, Gradient fill, Asset Library, AI Zone, AI 3D, Templates, and Layers.</li>
                                <li><span className="font-medium">Design canvas (center):</span> Fabric.js workspace with a white artboard and checkerboard surroundings.</li>
                                <li><span className="font-medium">Properties panel (right):</span> contextual styling, layer ordering, and canvas configuration.</li>
                                <li><span className="font-medium">Job Status footer:</span> logs AI background jobs with live progress and completion actions.</li>
                            </ul>
                        </Section>

                        <Section id="canvas" title="Canvas Navigation">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Use the mouse scroll wheel to zoom; zoom targets the cursor location.</li>
                                <li>Hold Alt and drag with the left mouse button to pan around the workspace.</li>
                                <li>Double-click empty space to recentre the artboard under the pointer.</li>
                                <li>The floating hint in the top-left reminds of pan and zoom gestures for new users.</li>
                            </ul>
                        </Section>

                        <Section id="toolbar" title="Toolbar Tools">
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Select:</span> switches back to standard object manipulation.</li>
                                <li><span className="font-medium">Shapes:</span> quick-add rectangle, circle, triangle, or star geometry.</li>
                                <li><span className="font-medium">Text:</span> inserts editable Fabric IText objects with live typing support.</li>
                                <li><span className="font-medium">Fill / Gradient:</span> activates gradient painting mode handled in the properties panel.</li>
                                <li><span className="font-medium">Gallery (Assets):</span> opens the Asset Library for uploads, generated images, and 3D models.</li>
                                <li><span className="font-medium">AI Zone:</span> launches the draggable image generator with prompt controls and zone-based placement.</li>
                                <li><span className="font-medium">AI 3D:</span> opens the 3D generator for Meshy or Tripo powered model creation.</li>
                                <li><span className="font-medium">Library:</span> loads or saves templates that capture the current canvas layout.</li>
                                <li><span className="font-medium">Layers:</span> jumps the properties panel to layer management view when collapsed.</li>
                            </ul>
                        </Section>

                        <Section id="properties" title="Properties & Layers">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Edit fill, gradients, opacity, stroke, shadows, skew, curved text, and star parameters depending on selection.</li>
                                <li>Adjust canvas size, background colour, and export-safe artboard settings under Canvas Controls.</li>
                                <li>Layer list supports drag-and-drop reordering, visibility toggles, colour tagging, renaming, and deletion.</li>
                                <li>Double-click a layer grip to assign custom colour tags for quick visual grouping.</li>
                            </ul>
                        </Section>

                        <Section id="assets" title="Asset Library">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Tabs split workspace assets into Uploads, 3D Models, and AI Generated images.</li>
                                <li>Uploads respect the “Save to Workspace Assets” toggle: disable to drop items straight on the canvas without persisting.</li>
                                <li>Supports inline renaming, deletion, refresh, and double-click to edit filenames.</li>
                                <li>Uploads push files into public/assets/... via /api/assets endpoints for consistent server storage.</li>
                            </ul>
                        </Section>

                        <Section id="ai-tools" title="AI Generation Tools">
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Image Generator:</span> define a “magic zone” rectangle, enter prompts, and send to ComfyUI or available API providers (Stability, OpenAI, Google, Banana).</li>
                                <li>Generated images are auto-saved into assets/generated/images and placed on the canvas sized to the zone.</li>
                                <li><span className="font-medium">AI 3D Generator:</span> choose Meshy or Tripo, supply prompts or seed imagery, and monitor background job progress via the footer.</li>
                                <li>Use the 3D Layer Editor to recapture higher-resolution thumbnails or replace existing Fabric placeholders.</li>
                            </ul>
                        </Section>

                        <Section id="templates" title="Templates & Reuse">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Save the current canvas as a reusable template from the Library panel; thumbnails are auto-generated.</li>
                                <li>Template selection clears the canvas and loads JSON definitions from /assets/templates.</li>
                                <li>Missing asset detection prompts for replacements via the Asset Library before finalising the load.</li>
                            </ul>
                        </Section>

                        <Section id="saving" title="Saving & Exporting">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Use the Save button to persist designs through /api/designs/save with canvas JSON plus low-res thumbnail.</li>
                                <li>Exports support PNG, JPG, SVG, PDF, and JSON; downloads are named with timestamps for easy tracking.</li>
                                <li>SVG and JSON exports retain Fabric metadata (e.g., 3D flags, gradients) for future re-import.</li>
                            </ul>
                        </Section>

                        <Section id="settings" title="Settings & API Keys">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Store Meshy, Tripo, Stability, OpenAI, Google, and Banana keys locally with optional account sync.</li>
                                <li>Configure local ComfyUI by storing the endpoint URL; enable CORS in ComfyUI with --enable-cors-header.</li>
                                <li>Connection badges in the editor header reflect whether image or 3D providers are ready.</li>
                            </ul>
                        </Section>

                        <Section id="troubleshooting" title="Troubleshooting & Tips">
                            <ul className="list-disc list-inside space-y-2">
                                <li>If a template reports missing items, follow the replacement wizard or ignore to load placeholders.</li>
                                <li>Stalled AI jobs can be dismissed from the footer; rerun once connectivity or credits are restored.</li>
                                <li>CORS or API errors surface in the browser console—verify keys and endpoints in Settings.</li>
                                <li>Use smaller artboard sizes when exporting large PDFs to manage browser memory usage.</li>
                            </ul>
                        </Section>

                        <Section id="shortcuts" title="Productivity Shortcuts">
                            <ul className="list-disc list-inside space-y-2">
                                <li>Alt + Drag to pan, Scroll to zoom, Double-click empty canvas to recenter.</li>
                                <li>Drag layer grips to reorder, or double-click names to rename elements quickly.</li>
                                <li>Use Shift while resizing Fabric objects to maintain aspect ratio.</li>
                            </ul>
                        </Section>

                        <footer className="text-xs text-muted-foreground/80 border-t border-border/60 pt-6">
                            <p>Need more help? Join the project discussions on <Link href="https://github.com/GeekatplayStudio" target="_blank" className="text-primary inline-flex items-center gap-1 hover:underline">GitHub <ExternalLink size={12} /></Link>.</p>
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    );
}

function IntroSection() {
    return (
        <Section id="introduction" title="Introduction">
            <p>
                Image Express combines a Fabric.js design surface, AI image synthesis, and 3D model tooling to accelerate creative workflows. The app opens on a personal dashboard where you can start a blank project, resume saved designs, or adapt a template. Switching to the editor reveals a left-hand creation toolbar, central canvas, and right-hand inspector for precise adjustments.
            </p>
        </Section>
    );
}

interface SectionProps {
    id: string;
    title: string;
    children: React.ReactNode;
}

function Section({ id, title, children }: SectionProps) {
    return (
        <section id={id} className="scroll-mt-24 space-y-3">
            <h3 className="text-lg font-semibold text-foreground/90">{title}</h3>
            <div className="text-foreground/80 space-y-3">
                {children}
            </div>
        </section>
    );
}
