"use client";

import { X, HelpCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import useEscapeKey from '@/hooks/useEscapeKey';

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
    useEscapeKey(onClose, { enabled: isOpen });

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
                            <p>
                                The Dashboard is your mission control. Every project starts here, and every returning project
                                is easy to pick up where you left off.
                            </p>
                            <ol className="list-decimal list-inside space-y-2">
                                <li><span className="font-medium">Choose a starting path:</span> Start from <span className="font-mono">Custom Size</span>, <span className="font-mono">Upload Media</span>, <span className="font-mono">Generate Image</span>, or <span className="font-mono">Create 3D</span>. The editor opens with the right context already prepared.</li>
                                <li><span className="font-medium">Use Templates when speed matters:</span> Search and filter by type, open a template, then customize text, colors, and assets instead of starting from a blank canvas.</li>
                                <li><span className="font-medium">Resume recent work:</span> Recent designs are sorted by last modified time, so active projects are always first. Delete outdated drafts from each card menu.</li>
                                <li><span className="font-medium">Access account and system controls:</span> Open profile, settings, docs, and admin (admins only) from the top-right controls.</li>
                            </ol>
                            <p className="text-xs bg-secondary/40 border border-border/60 p-3 rounded-md">
                                Best practice: use Dashboard cards for quick project starts, then save early in the editor so your
                                design appears in Recent Designs immediately.
                            </p>
                        </Section>

                        <Section id="editor-layout" title="Editor Layout">
                            <p>
                                The editor follows a practical left-to-right workflow: select a tool, work on the canvas,
                                then refine with precision panels.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Header:</span> Project name, menu actions, grid/share/export, and account controls.</li>
                                <li><span className="font-medium">Top tool strip:</span> Changes based on selected tool, exposing quick options like brush size, selection behavior, crop settings, and gradient controls.</li>
                                <li><span className="font-medium">Left tool rail:</span> Selection, drawing, text, retouch, utility, AI launchers, and asset access in one predictable vertical flow.</li>
                                <li><span className="font-medium">Center canvas:</span> Your active artboard with direct manipulation, transform handles, guides, and visual overlays.</li>
                                <li><span className="font-medium">Right panel modes:</span> Layers, Properties, History, Color, Swatches, Brushes, Channels, Adjustments, Navigator, and Info.</li>
                                <li><span className="font-medium">Job footer:</span> Long-running AI and 3D jobs continue in the background and show live progress here.</li>
                            </ul>
                            <p>
                                Recommended loop: place content on canvas, organize layers, style in Properties, check color/channels,
                                then export.
                            </p>
                        </Section>

                        <Section id="canvas" title="Canvas Navigation">
                            <p>
                                Canvas controls are optimized for speed. Most users can stay in flow with keyboard + mouse only.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Pan:</span> Hold <span className="font-mono">Space</span> and drag, or use Hand mode.</li>
                                <li><span className="font-medium">Zoom:</span> Mouse wheel zooms around the pointer for precision edits.</li>
                                <li><span className="font-medium">Recenter:</span> Double-click empty workspace to recenter the artboard toward your click area.</li>
                                <li><span className="font-medium">Artboard behavior:</span> The artboard stays locked at the bottom and is non-selectable, so it cannot be accidentally deleted.</li>
                                <li><span className="font-medium">Selection dimensions:</span> Width/height of active selection appears as live overlay while transforming.</li>
                                <li><span className="font-medium">Safe deletion behavior:</span> Delete/backspace is guarded while typing in text fields to avoid accidental object removal.</li>
                            </ul>
                        </Section>

                        <Section id="toolbar" title="Toolbar Tools">
                            <p>
                                The left toolbar is grouped by editing intent. If you know what outcome you want, choose the matching
                                family below and the top strip will expose detailed controls.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Selection family:</span> Select, Marquee, Lasso, Quick Select, and Wand for object and pixel-level targeting.</li>
                                <li><span className="font-medium">Creation family:</span> Text, Shapes, Pen/Path, Gradient, and brush-based paint tools.</li>
                                <li><span className="font-medium">Retouch family:</span> Healing, Clone Stamp, History Brush, Blur/Sharpen, and Dodge/Burn/Sponge-style effects.</li>
                                <li><span className="font-medium">Utility family:</span> Eyedropper, Crop, Zoom, and Hand for measurement and navigation tasks.</li>
                                <li><span className="font-medium">AI launchers:</span> Image Generation and 3D Generation can be opened directly from editor flow.</li>
                            </ul>
                            <p className="text-xs bg-secondary/40 border border-border/60 p-3 rounded-md">
                                Tip: learn only five shortcuts first (`V`, `T`, `B`, `H`, `Z`) and add the rest gradually as your speed grows.
                            </p>
                        </Section>

                        <Section id="properties" title="Properties & Layers">
                            <p>
                                The right side is where professional finishing happens. Think of it as your control center for
                                precision editing and layer management.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Layers mode:</span> Reorder, group, lock, hide, rename, and delete layers. Use this first when composition feels messy.</li>
                                <li><span className="font-medium">Properties mode:</span> Transform, fill/stroke, text styling, blend/opacity, shadows, and object-specific effects.</li>
                                <li><span className="font-medium">Color and Swatches:</span> Work in RGB/HSB/CMYK/Lab, build reusable swatch sets, and keep color consistency across assets.</li>
                                <li><span className="font-medium">Adjustments:</span> Add non-destructive looks like curves, levels, hue/saturation, exposure, black and white, and color balance.</li>
                                <li><span className="font-medium">Channels:</span> Inspect Composite/R/G/B/Alpha/Luminosity, isolate channel behavior, and apply mask/invert actions.</li>
                                <li><span className="font-medium">History, Navigator, Info:</span> Track edits, preview viewport position, and monitor scene details in real time.</li>
                            </ul>
                        </Section>

                        <Section id="assets" title="Asset Library">
                            <p>
                                Asset Library is multi-source and storage-aware, so teams can work locally, in cloud, or in hybrid mode
                                without changing editing habits.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Tabs:</span> Uploads, Videos, Audio, 3D, and Generated.</li>
                                <li><span className="font-medium">Scope and visibility filters:</span> Move quickly between personal/shared libraries and public/private assets.</li>
                                <li><span className="font-medium">Core management:</span> Upload, rename, delete, toggle visibility, and download assets directly from the panel.</li>
                                <li><span className="font-medium">Storage modes:</span> Local (IndexedDB), Hybrid (local + cloud), or Cloud (Drive-first) behavior comes from Settings.</li>
                                <li><span className="font-medium">3D preview:</span> Hover 3D models to inspect before insertion.</li>
                                <li><span className="font-medium">Insert workflow:</span> Click any asset to place it on canvas with provider-aware loading for local and cloud files.</li>
                            </ul>
                        </Section>

                        <Section id="ai-tools" title="AI Generation Tools">
                            <p>
                                AI tools are built for production workflows, not one-off experiments. You can generate, critique,
                                and iterate while staying inside the same editor session.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Image Generator:</span> Prompt-based generation with Comfy, Ollama, Stability, OpenAI, Google, or Banana (provider availability depends on setup).</li>
                                <li><span className="font-medium">Comfy workflows:</span> Pick task and model presets, verify connection, inspect config, and resolve missing requirements from the UI.</li>
                                <li><span className="font-medium">AI Edit Notes pipeline:</span> Add notes, masks, and annotation overlays to guide precise revision requests.</li>
                                <li><span className="font-medium">AI Critique:</span> Review selected layer or full canvas with an Ollama vision-capable model and apply findings manually.</li>
                                <li><span className="font-medium">3D generation:</span> Create models with Meshy, Tripo, or Hitem3D and insert results into both canvas and library.</li>
                                <li><span className="font-medium">Background jobs:</span> Long tasks keep running with polling; progress is recoverable after refresh.</li>
                            </ul>
                            <ol className="list-decimal list-inside space-y-2">
                                <li><span className="font-medium">For best first results:</span> set provider keys in Settings, run runtime checks, then start with one short prompt and iterate.</li>
                                <li><span className="font-medium">For repeatability:</span> keep prompt wording stable and change one variable at a time (style, subject, lighting, or composition).</li>
                            </ol>
                        </Section>

                        <Section id="templates" title="Templates & Reuse">
                            <p>
                                Templates turn finished work into reusable production assets for teams and repeat campaigns.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Load template:</span> Open saved template JSON with predefined dimensions, object structure, and linked assets.</li>
                                <li><span className="font-medium">Handle missing assets:</span> If source files are unavailable, use replacement flow or continue without specific assets.</li>
                                <li><span className="font-medium">Save as template:</span> Capture current design plus thumbnail for future reuse by you or your team.</li>
                            </ul>
                        </Section>

                        <Section id="saving" title="Saving & Exporting">
                            <p>
                                Save frequently and export with intent. This flow covers both quick delivery assets and campaign-ready
                                frame variants.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Save design:</span> Stores design JSON plus thumbnail in design storage and refreshes your dashboard recents.</li>
                                <li><span className="font-medium">Export formats:</span> PNG, JPG, SVG, PDF, JSON, and HTML bundle.</li>
                                <li><span className="font-medium">Quality modal:</span> PNG/JPG export includes quality slider and estimated output size.</li>
                                <li><span className="font-medium">Media Overlay workflow:</span> Build frame sets, apply safe areas, and export selected or all frames as ZIP.</li>
                                <li><span className="font-medium">Variant bridge:</span> Convert current frame to a fresh variant draft in Fill, Fit, or Safe Area mode.</li>
                                <li><span className="font-medium">Share action:</span> Exports PNG and opens Facebook/Instagram for manual posting flow.</li>
                            </ul>
                            <p className="text-xs bg-secondary/40 border border-border/60 p-3 rounded-md">
                                Reliability tip: save before every AI batch and before final export to avoid losing late-stage edits.
                            </p>
                        </Section>

                        <Section id="settings" title="Settings & API Keys">
                            <p>
                                Settings controls providers, storage behavior, runtime health, and account-level system setup.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Provider keys:</span> Configure Meshy, Tripo, Hitem, Stability, OpenAI, Google, and Banana keys.</li>
                                <li><span className="font-medium">Local AI:</span> Set Ollama URL/model, check runtime health, and install missing models.</li>
                                <li><span className="font-medium">Comfy connection:</span> Local/cloud/auto modes, server URL/cloud URL, API key, install path, and workflow library management.</li>
                                <li><span className="font-medium">Storage mode:</span> Choose Local, Hybrid, or Cloud-only asset storage behavior.</li>
                                <li><span className="font-medium">Google Drive:</span> Connect/disconnect OAuth client for backups and cloud library operations.</li>
                                <li><span className="font-medium">Desktop updates:</span> In desktop app, check and install available updates from settings.</li>
                                <li><span className="font-medium">Setup wizard:</span> Re-open the guided setup flow anytime from settings.</li>
                                <li><span className="font-medium">User state awareness:</span> Web mode uses authenticated sessions and role-aware controls; admin users see Admin area actions.</li>
                            </ul>
                        </Section>

                        <Section id="troubleshooting" title="Troubleshooting & Tips">
                            <p>
                                Use this checklist approach: identify symptom, verify setup, then retry with a minimal case.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Generation fails:</span> Check API keys, credits, provider selection, and runtime URLs in Settings.</li>
                                <li><span className="font-medium">Comfy issues:</span> Use Verify Connection and Inspect Config to find missing nodes/models or path problems.</li>
                                <li><span className="font-medium">Ollama critique/model errors:</span> Use Check Runtime and install a vision-capable model if required.</li>
                                <li><span className="font-medium">Cloud assets unavailable:</span> Reconnect Google Drive and confirm client ID/origin configuration.</li>
                                <li><span className="font-medium">Template missing files:</span> Use replacement flow before load completes.</li>
                                <li><span className="font-medium">Session expired:</span> Web mode logs out after inactivity; save work frequently.</li>
                                <li><span className="font-medium">Unexpected export result:</span> Confirm artboard size, active frame selection, and PNG/JPG quality settings before rerun.</li>
                            </ul>
                        </Section>

                        <Section id="shortcuts" title="Productivity Shortcuts">
                            <p>
                                Learn shortcuts in layers. Start with navigation and history, then add tool aliases to cut edit time.
                            </p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><span className="font-medium">Navigation:</span> Space + Drag pan, Scroll zoom, Double-click empty canvas to recenter.</li>
                                <li><span className="font-medium">Duplicate with drag:</span> Alt/Option + Drag on a selected layer duplicates it in place, then drags the copy.</li>
                                <li><span className="font-medium">Selection and tools:</span> V Select, M Marquee, L Lasso, W Quick Select, Shift+W Wand, A Path Select.</li>
                                <li><span className="font-medium">Creation and utility:</span> T Text, U Shapes, P Pen, B Brush, R Blur, J Healing, S Clone Stamp, O Dodge, G Gradient, I Eyedropper, C Crop, H Hand, Z Zoom.</li>
                                <li><span className="font-medium">History:</span> Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo, Cmd/Ctrl+Y redo alternate, Cmd/Ctrl+D deselect.</li>
                                <li><span className="font-medium">Duplicate command:</span> Cmd/Ctrl+J duplicates the active selection.</li>
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
                Image Express combines layered 2D design, AI-assisted image workflows, and 3D generation in one production workspace.
                This manual is written for real day-to-day use, not just feature discovery.
            </p>
            <ol className="list-decimal list-inside space-y-2">
                <li><span className="font-medium">Start in Dashboard:</span> pick a launch path (custom size, upload, image generation, or 3D).</li>
                <li><span className="font-medium">Build composition in Editor:</span> place assets, use layers, then refine with Properties and Adjustments.</li>
                <li><span className="font-medium">Use AI intentionally:</span> generate, critique, or annotate edits with clear iteration goals.</li>
                <li><span className="font-medium">Finish with confidence:</span> save design, export required formats, then publish via share/manual channel flow.</li>
            </ol>
            <p>
                Recommended first session: create a custom-size design, add one asset, add one text layer, apply one adjustment,
                run one AI generation, and export PNG + PDF. That single loop teaches the full product lifecycle.
            </p>
            <p className="mt-2 text-xs bg-yellow-500/10 border border-yellow-500/20 p-2 rounded text-yellow-600 dark:text-yellow-400">
                <strong>Security note:</strong> In web mode, inactive sessions auto-logout after 30 minutes.
                Save work frequently if you step away.
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
