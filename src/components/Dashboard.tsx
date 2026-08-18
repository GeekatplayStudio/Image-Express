import React, { useEffect, useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Plus, Image as ImageIcon, Layout, Search, Instagram, Youtube, Book, Monitor, Heart, Upload, Sparkles, Box } from 'lucide-react';
import { useDialog } from '@/providers/DialogProvider';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/providers/I18nProvider';
import { RichText } from '@/lib/i18n/RichText';
import quotes from '@/data/quotes.json';
import DashboardAmbience from '@/components/DashboardAmbience';
import { UI_THEME_CHANGED_EVENT, type UiThemeQuote } from '@/lib/ui-themes-shared';
import { listUiThemes, loadStoredUiTheme } from '@/lib/ui-themes';
import { APP_VERSION_INFO, formatHubVersionLabel } from '@/lib/appVersion';
import { loadUiPreferences } from '@/lib/ui-preferences';
import {
    createProjectsState,
    startProject,
    deleteProject,
    getProjectsStateSync,
    loadProjectsState,
    projectsInBookshelf,
    saveProjectsState,
    setActiveBookshelf,
    setActiveCanvas,
    setActiveProject,
    PROJECT_CHANGED_EVENT,
    type Project,
    type ProjectsState,
} from '@/lib/multicanvas/projectStore';
import { Boxes, Library, Files } from 'lucide-react';
import StackAccordion, { type StackShelf } from '@/components/dashboard/StackAccordion';
import type { StackItem } from '@/components/dashboard/StackRow';

type IconType = React.ComponentType<{ size?: number; className?: string }>;

type TemplateDescriptor = {
    id: string;
    name: string;
    width: number;
    height: number;
    type: string;
    icon: IconType;
    color: string;
    jsonUrl?: string | null;
};

type DesignSummary = {
    id: string;
    name: string;
    thumbnail?: string;
    image?: string;
    data?: string;
    lastModified: string;
};

interface DashboardProps {
    onNewDesign: (initialTool?: string, size?: { width: number; height: number }) => void;
    onSelectTemplate: (template: TemplateDescriptor) => void;
    onOpenDesign: (design: DesignSummary) => void;
}

const START_ACTIONS = [
    {
        id: 'start-custom',
        labelKey: 'dashboard.customSize',
        icon: Plus,
        color: 'bg-gradient-to-br from-yellow-400 to-orange-500',
        textColor: 'text-yellow-950',
        action: 'new'
    },
    {
        id: 'start-upload',
        labelKey: 'dashboard.uploadMedia',
        icon: Upload,
        color: 'bg-gradient-to-br from-primary/80 to-tool-accent',
         textColor: 'text-blue-50',
        action: 'upload'
    },
    {
        id: 'start-ai-3d',
        labelKey: 'dashboard.create3d',
        icon: Box,
        color: 'bg-gradient-to-br from-emerald-400 to-teal-500',
         textColor: 'text-emerald-50',
        action: '3d'
    },
    {
        id: 'start-ai-img',
        labelKey: 'dashboard.generateImage',
        icon: Sparkles,
        color: 'bg-gradient-to-br from-primary to-tool-accent',
         textColor: 'text-primary-foreground',
        action: 'ai'
    }
];

// `value` is matched against a template's `type`, so it stays an English
// identifier; only the label is translated.
const TEMPLATE_CATEGORIES = [
    { value: 'All', labelKey: 'dashboard.category.all' },
    { value: 'Social Media', labelKey: 'dashboard.category.socialMedia' },
    { value: 'Video', labelKey: 'dashboard.category.video' },
    { value: 'Print', labelKey: 'dashboard.category.print' },
    { value: 'Web', labelKey: 'dashboard.category.web' },
    { value: 'Marketing', labelKey: 'dashboard.category.marketing' },
];

const POPULAR_TEMPLATES: TemplateDescriptor[] = [
  {
    id: 't-insta',
    name: 'Instagram Post',
    width: 1080,
    height: 1080,
    type: 'Social Media',
    icon: Instagram,
    color: 'from-primary to-tool-accent',
    // jsonUrl: null // No JSON, start blank
  },
  {
    id: 't-yt',
    name: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    type: 'Video',
    icon: Youtube,
    color: 'from-red-600 to-red-400',
  },
  {
    id: 't-book',
    name: 'Book Cover',
    width: 1600,
    height: 2560,
    type: 'Print',
    icon: Book,
    color: 'from-primary to-tool-accent',
  },
  {
    id: 't-banner',
    name: 'Website Hero',
    width: 1920,
    height: 600,
    type: 'Web',
    icon: Monitor,
    color: 'from-emerald-500 to-teal-500',
  }
];

// Expanded mock data for when user clicks "Show More"
// const MORE_TEMPLATES: TemplateDescriptor[] = [
//     ...POPULAR_TEMPLATES.map(t => ({...t, id: t.id + '_2', name: t.name + ' II'})),
//     ...POPULAR_TEMPLATES.map(t => ({...t, id: t.id + '_3', name: t.name + ' III'})),
// ];

export default function Dashboard({ onNewDesign, onSelectTemplate, onOpenDesign }: DashboardProps) {
    const { t } = useI18n();
    // Federation projects (Projects > Canvases > Layers) created in the editor.
    const [projectsState, setProjectsState] = useState<ProjectsState | null>(null);
    useEffect(() => {
        let cancelled = false;
        // First read comes from the store (IndexedDB, migrating any older
        // localStorage copy); later ones can use the session cache the store
        // keeps in step with every commit.
        void loadProjectsState().then((state) => {
            if (!cancelled) setProjectsState(state);
        });
        const sync = () => setProjectsState(getProjectsStateSync());
        window.addEventListener(PROJECT_CHANGED_EVENT, sync);
        return () => {
            cancelled = true;
            window.removeEventListener(PROJECT_CHANGED_EVENT, sync);
        };
    }, []);

    // Starting a design reclaims an empty album on the active shelf (renamed
    // and resized, so nothing stale leaks through) and only creates a new one
    // when none is free. Creating unconditionally here minted one more empty
    // "Album N" on every visit to the editor — the workspace filled with
    // albums the user never asked for.
    const startNewProject = (tool?: string, size?: { width: number; height: number }) => {
        const lastUsed = loadUiPreferences();
        const width = size?.width ?? lastUsed.lastCanvasWidth;
        const height = size?.height ?? lastUsed.lastCanvasHeight;
        const current = getProjectsStateSync() ?? projectsState;
        const name = t('stack.albumName', { n: (current?.projects.length ?? 0) + 1 });
        const next = current ? startProject(current, name, width, height) : createProjectsState(name, width, height);
        void saveProjectsState(next);
        onNewDesign(tool, size);
    };

    const openProjectFromDashboard = (projectId: string) => {
        const current = getProjectsStateSync() ?? projectsState;
        if (!current) return;
        void saveProjectsState(setActiveProject(current, projectId));
        onNewDesign();
    };

    /** Resume a specific page: bring its album into view, then that page within it. */
    const openCanvasFromDashboard = (projectId: string, canvasId: string) => {
        const current = getProjectsStateSync() ?? projectsState;
        if (!current) return;
        const scoped = setActiveProject(current, projectId);
        void saveProjectsState({
            ...scoped,
            projects: scoped.projects.map((p) => (p.id === projectId ? setActiveCanvas(p, canvasId) : p)),
        });
        onNewDesign();
    };

    const openBookshelfFromDashboard = (bookshelfId: string) => {
        const current = getProjectsStateSync() ?? projectsState;
        if (!current) return;
        void saveProjectsState(setActiveBookshelf(current, bookshelfId));
        onNewDesign();
    };
    const dialog = useDialog();
    const { toast } = useToast();
    const [recentDesigns, setRecentDesigns] = useState<DesignSummary[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    // Must start empty to match the server render. Reading localStorage in the
    // initializer made the FIRST client render sort templates by usage while the
    // server-rendered HTML had them in default order — an element-order
    // mismatch that threw React #418 and made React discard and re-render the
    // whole tree. Usage is loaded after mount instead.
    const [templateUsage, setTemplateUsage] = useState<Record<string, number>>({});
    useEffect(() => {
        const saved = localStorage.getItem('dashboard.templateUsage');
        if (!saved) return;
        try {
            setTemplateUsage(JSON.parse(saved) as Record<string, number>);
        } catch (err) {
            console.error('Failed to parse template usage', err);
        }
    }, []);
    const usageCounterRef = useRef(0);
    const [quoteIndex, setQuoteIndex] = useState(0);

    // Super theme packs can ship their own quote/fact set (dragon facts, alien
    // facts, ...) which takes over the dashboard quote while the theme is active.
    const [themeQuotes, setThemeQuotes] = useState<UiThemeQuote[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        const resolve = async () => {
            const storedId = loadStoredUiTheme().id;
            try {
                const themes = await listUiThemes();
                const active = themes.find((entry) => entry.id === storedId);
                if (!cancelled) setThemeQuotes(active?.quotes?.length ? active.quotes : null);
            } catch {
                if (!cancelled) setThemeQuotes(null);
            }
        };
        void resolve();
        const onThemeChange = () => void resolve();
        window.addEventListener(UI_THEME_CHANGED_EVENT, onThemeChange);
        return () => {
            cancelled = true;
            window.removeEventListener(UI_THEME_CHANGED_EVENT, onThemeChange);
        };
    }, []);

    const activeQuotes: UiThemeQuote[] = themeQuotes ?? quotes;
    const quote = activeQuotes[quoteIndex % activeQuotes.length] || activeQuotes[0];
    const [showCustomSizeModal, setShowCustomSizeModal] = useState(false);
    const [customWidth, setCustomWidth] = useState('1080');
    const [customHeight, setCustomHeight] = useState('1080');
    useEffect(() => {
        const lastUsed = loadUiPreferences();
        setCustomWidth(String(lastUsed.lastCanvasWidth));
        setCustomHeight(String(lastUsed.lastCanvasHeight));
    }, []);
    const parsedCustomWidth = Number.parseInt(customWidth, 10);
    const parsedCustomHeight = Number.parseInt(customHeight, 10);
    const canCreateCustomDesign = Number.isFinite(parsedCustomWidth)
        && parsedCustomWidth > 0
        && Number.isFinite(parsedCustomHeight)
        && parsedCustomHeight > 0;
    const hubVersionLabel = useMemo(() => formatHubVersionLabel(APP_VERSION_INFO), []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let frame = 0;
        const scheduleQuoteUpdate = (nextIndex: number) => {
            frame = window.requestAnimationFrame(() => {
                setQuoteIndex(nextIndex);
            });
        };

        const quoteStorageKey = 'dashboard.quoteIndex';
        const storedQuote = window.sessionStorage.getItem(quoteStorageKey);
        if (storedQuote) {
            const parsed = Number(storedQuote);
            if (Number.isInteger(parsed) && parsed >= 0 && parsed < quotes.length) {
                scheduleQuoteUpdate(parsed);
                return () => window.cancelAnimationFrame(frame);
            }
        }
        const nextQuoteIndex = Math.floor(Math.random() * quotes.length);
        scheduleQuoteUpdate(nextQuoteIndex);
        window.sessionStorage.setItem(quoteStorageKey, String(nextQuoteIndex));
        return () => window.cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        const maxUsage = Object.values(templateUsage).reduce((max, val) => Math.max(max, val), 0);
        usageCounterRef.current = Math.max(usageCounterRef.current, maxUsage);
    }, [templateUsage]);

    const allTemplates = useMemo(() => {
        const base = [...POPULAR_TEMPLATES];
        // Generate more variations to fill the grid
        const more: TemplateDescriptor[] = [];
        const variants = [
            { suffix: 'Minimal', color: 'from-slate-500 to-slate-700' },
            { suffix: 'Bold', color: 'from-rose-500 to-red-600' },
            { suffix: 'Dark', color: 'from-gray-800 to-black' },
            { suffix: 'Light', color: 'from-blue-200 to-cyan-300' },
            { suffix: 'Modern', color: 'from-emerald-400 to-teal-600' }
        ];

        variants.forEach((v) => {
            more.push(...POPULAR_TEMPLATES.map(t => ({
                ...t,
                id: `${t.id}_${v.suffix}`,
                name: `${t.name} ${v.suffix}`,
                color: v.color
            })));
        });
        return [...base, ...more];
    }, []);

    const filteredTemplates = useMemo(() => {
        return allTemplates.filter(t => {
            const matchesCategory = activeCategory === 'All' || t.type === activeCategory;
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.type.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [allTemplates, activeCategory, searchQuery]);

    const activeCategoryLabel = t(
        TEMPLATE_CATEGORIES.find((c) => c.value === activeCategory)?.labelKey ?? 'dashboard.category.all'
    );

    const sortedTemplates = useMemo(() => {
        const list = [...filteredTemplates];
        list.sort((a, b) => (templateUsage[b.id] ?? 0) - (templateUsage[a.id] ?? 0));
        return list;
    }, [filteredTemplates, templateUsage]);

    useEffect(() => {
      // Load designs from server
      const loadDesigns = async () => {
          try {
              const res = await fetch('/api/designs/list');
              const responseOk = typeof res.ok === 'boolean' ? res.ok : true;
              const contentType = typeof res.headers?.get === 'function'
                  ? (res.headers.get('content-type') || '')
                  : 'application/json';

              let data: { success?: boolean; designs?: DesignSummary[]; message?: string } | null = null;

              if (typeof res.text === 'function') {
                  const responseText = await res.text();
                  const trimmedResponseText = responseText.trim();
                  const looksLikeHtml = trimmedResponseText.startsWith('<!DOCTYPE')
                      || trimmedResponseText.startsWith('<html')
                      || trimmedResponseText.startsWith('<');
                  const isNotFoundResponse = typeof res.status === 'number' && res.status === 404;

                  if (looksLikeHtml || isNotFoundResponse) {
                      setRecentDesigns([]);
                      return;
                  }

                  if (!responseOk) {
                      throw new Error(trimmedResponseText || 'Failed to load designs.');
                  }

                  if (!contentType.toLowerCase().includes('application/json')) {
                      throw new Error('Design list endpoint returned a non-JSON response.');
                  }

                  data = trimmedResponseText
                      ? JSON.parse(trimmedResponseText) as { success?: boolean; designs?: DesignSummary[]; message?: string }
                      : null;
              } else {
                  if (!responseOk) {
                      throw new Error('Failed to load designs.');
                  }
                  data = await res.json() as { success?: boolean; designs?: DesignSummary[]; message?: string };
              }

              if (!data) {
                  return;
              }

              if (!data.success) {
                  throw new Error(data.message || 'Failed to load designs.');
              }

              if (data.success) {
                  // Sort by newest first
                  const designs = Array.isArray(data.designs) ? (data.designs as DesignSummary[]) : [];
                  const sorted = designs.sort((a, b) => 
                      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
                  );
                  setRecentDesigns(sorted);
              }
          } catch (e) {
              console.error("Failed to load designs", e);
          }
      };
      loadDesigns();
  }, []);
  
  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const confirmed = await dialog.confirm(t('dashboard.deleteDesignConfirm'), { title: t('dashboard.deleteDesign'), variant: 'destructive' });
      if(confirmed) {
          try {
              const res = await fetch('/api/designs/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id })
              });
              const result = await res.json();
              if (result.success) {
                  const updated = recentDesigns.filter(d => d.id !== id);
                  setRecentDesigns(updated);
              } else {
                  toast({ title: t('dashboard.deleteFailed'), description: t('dashboard.deleteFailedDesc'), variant: 'destructive' });
              }
          } catch (err) {
              console.error("Delete failed", err);
              toast({ title: t('dashboard.deleteFailed'), description: t('dashboard.deleteErrorDesc'), variant: 'destructive' });
          }
      }
  };

  const handleDeleteProject = async (project: Project, e: React.MouseEvent) => {
      e.stopPropagation();
      if (projectsState && projectsState.projects.length <= 1) {
          toast({ title: t('dashboard.cannotDelete'), description: t('dashboard.needOneAlbum'), variant: 'destructive' });
          return;
      }
      const confirmed = await dialog.confirm(t('dashboard.deleteProjectConfirm', { name: project.name }), { title: t('dashboard.deleteProject'), variant: 'destructive' });
      if (!confirmed) return;
      const current = getProjectsStateSync() ?? projectsState;
      if (!current) return;
      const next = deleteProject(current, project.id);
      void saveProjectsState(next);
      setProjectsState(next);
  };

  // Albums embed their creation time in the id (`prj-<timestamp>-<rand>`),
  // so the most recently created/touched ones surface first without needing
  // a separate stored timestamp field.
  const projectTimestamp = (id: string): number => {
      const match = id.match(/^prj-(\d+)-/);
      return match ? Number.parseInt(match[1], 10) : 0;
  };
  const sortedProjects = useMemo(() => {
      if (!projectsState) return [];
      return [...projectsState.projects].sort((a, b) => projectTimestamp(b.id) - projectTimestamp(a.id));
  }, [projectsState]);

  // Canvas ids carry their creation time the same way album ids do, so the
  // page the user touched last floats to the front of the pages row.
  const canvasTimestamp = (id: string): number => {
      const match = id.match(/^cnv-(\d+)-/);
      return match ? Number.parseInt(match[1], 10) : 0;
  };

  const handleTemplateClick = (template: TemplateDescriptor) => {
      usageCounterRef.current += 1;
      const nextValue = usageCounterRef.current;
      setTemplateUsage((prev) => {
          const next = { ...prev, [template.id]: nextValue };
          if (typeof window !== 'undefined') {
              localStorage.setItem('dashboard.templateUsage', JSON.stringify(next));
          }
          return next;
      });
      onSelectTemplate(template);
  };

    const getDesignPreviewUrl = (design: DesignSummary) => design.thumbnail || design.image || '';

  // --- The three stack levels, newest-first, as scrolling card rows --------
  // Pages come from two stores that both mean "a page to the user": the
  // canvases inside albums, and standalone designs saved on the server.
  const pageItems: StackItem[] = [
      ...sortedProjects.flatMap((project) =>
          [...project.canvases]
              .sort((a, b) => canvasTimestamp(b.id) - canvasTimestamp(a.id))
              .map((canvas): StackItem => ({
                  id: `${project.id}:${canvas.id}`,
                  title: canvas.name,
                  subtitle: project.name,
                  thumbnail: canvas.thumbnail,
                  active: project.id === projectsState?.activeProjectId && canvas.id === project.activeCanvasId,
                  accent: 'from-primary to-tool-accent',
                  icon: ImageIcon,
                  onOpen: () => openCanvasFromDashboard(project.id, canvas.id),
                  testId: `dashboard-page-${canvas.id}`,
              }))
      ),
      ...recentDesigns.map((design): StackItem => ({
          id: `design:${design.id}`,
          title: design.name,
          subtitle: new Date(design.lastModified).toLocaleDateString(),
          thumbnail: getDesignPreviewUrl(design) || null,
          accent: 'from-sky-500 to-indigo-500',
          icon: ImageIcon,
          onOpen: () => onOpenDesign(design),
          onDelete: (e) => { void handleDelete(design.id, e); },
          deleteTitle: t('dashboard.deleteDesign'),
          testId: `dashboard-design-${design.id}`,
      })),
  ];

  const albumItems: StackItem[] = sortedProjects.map((project): StackItem => ({
      id: project.id,
      title: project.name,
      subtitle: t('dashboard.canvasCount', { count: project.canvases.length }),
      thumbnail: project.canvases.find((c) => c.thumbnail)?.thumbnail ?? null,
      active: project.id === projectsState?.activeProjectId,
      accent: 'from-amber-400 to-orange-500',
      icon: Boxes,
      onOpen: () => openProjectFromDashboard(project.id),
      onDelete: (e) => { void handleDeleteProject(project, e); },
      deleteTitle: t('dashboard.deleteProject'),
      testId: `dashboard-project-${project.id}`,
  }));

  const bookshelfItems: StackItem[] = (projectsState?.bookshelves ?? []).map((shelf): StackItem => {
      const albums = projectsInBookshelf(projectsState!, shelf.id);
      return {
          id: shelf.id,
          title: shelf.name,
          subtitle: t('dashboard.projectCount', { count: albums.length }),
          thumbnail: albums.flatMap((p) => p.canvases).find((c) => c.thumbnail)?.thumbnail ?? null,
          active: shelf.id === projectsState?.activeBookshelfId,
          accent: 'from-emerald-500 to-teal-600',
          icon: Library,
          onOpen: () => openBookshelfFromDashboard(shelf.id),
          testId: `dashboard-bookshelf-${shelf.id}`,
      };
  });

  const stackShelves: StackShelf[] = [
      {
          id: 'pages',
          title: t('dashboard.savedDesigns'),
          count: t('dashboard.savedCount', { count: pageItems.length }),
          hint: t('stack.pagesHint'),
          icon: Files,
          accent: 'from-primary to-tool-accent',
          items: pageItems,
          emptyLabel: t('dashboard.noDesigns'),
      },
      {
          id: 'albums',
          title: t('dashboard.projects'),
          count: t('dashboard.projectCount', { count: albumItems.length }),
          hint: t('stack.albumsHint'),
          icon: Boxes,
          accent: 'from-amber-400 to-orange-500',
          items: albumItems,
          emptyLabel: t('stack.noAlbums'),
      },
      {
          id: 'bookshelves',
          title: t('stack.bookshelves'),
          count: t('stack.bookshelfCount', { count: bookshelfItems.length }),
          hint: t('stack.bookshelvesHint'),
          icon: Library,
          accent: 'from-emerald-500 to-teal-600',
          items: bookshelfItems,
          emptyLabel: t('stack.noBookshelves'),
      },
  ];

  return (
    <div className="flex-1 bg-background p-8 overflow-y-auto">
      <DashboardAmbience />
      <div className="relative z-10 max-w-7xl mx-auto space-y-12">
        
        {/* Modern Hero & Search */}
        <div className="relative py-12 text-center space-y-6">
            <div className="animation-fade-in space-y-2">
                <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground px-4">
                    {t('dashboard.quoted', { text: quote.text })}
                </h1>
                {quote.author && (
                    <p className="text-lg text-muted-foreground font-medium">
                        — {quote.author}
                    </p>
                )}
            </div>
            
            <div className="max-w-xl mx-auto relative group px-4">
                <div className="absolute inset-y-0 left-0 pl-8 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('dashboard.searchTemplates')}
                    className="w-full h-12 pl-12 pr-36 rounded-full border border-border bg-card shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none"
                />
                <div className="absolute right-2 top-2 bottom-2">
                    <button 
                        onClick={() => setShowCustomSizeModal(true)}
                        className="h-full px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                        {t('dashboard.customSize')}
                    </button>
                </div>
            </div>
        </div>

        {/* Start Creating Section (Adobe Style) */}
        <section>
             <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-xl font-bold text-foreground">{t('dashboard.howToStart')}</h2>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 {START_ACTIONS.map((action) => (
                     <button
                        key={action.id}
                        onClick={() => action.action === 'new' ? setShowCustomSizeModal(true) : startNewProject(action.action)}
                        className={`group relative h-32 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-left p-0 ${action.color}`}
                     >
                        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors" />
                        <div className="absolute top-4 left-4">
                             <div className={`p-2 rounded-full bg-white/20 backdrop-blur-md ${action.textColor}`}>
                                 <action.icon size={24} />
                             </div>
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                            <h3 className={`font-bold text-lg ${action.textColor}`}>{t(action.labelKey)}</h3>
                        </div>
                        {/* Decorative Icon Background */}
                        <div className="absolute -bottom-4 -right-4 opacity-20 transform rotate-12 scale-150 pointer-events-none text-white">
                             <action.icon size={100} />
                        </div>
                     </button>
                 ))}
             </div>
        </section>

        {/* Categories Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {TEMPLATE_CATEGORIES.map(cat => (
                <button
                    key={cat.value}
                    onClick={() => setActiveCategory(cat.value)}
                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                        activeCategory === cat.value
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/50'
                    }`}
                >
                    {t(cat.labelKey)}
                </button>
            ))}
        </div>

        {/* Stack: pages, albums and bookshelves as collapsing rows */}
        <StackAccordion shelves={stackShelves} />


        {/* Popular Templates Row */}
        <section className="space-y-4">
             <div className="flex items-center justify-between px-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Layout size={20} className="text-primary" />
                    {t('dashboard.popularTemplates')}
                </h2>
             </div>
             
             <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-3">
                {sortedTemplates.map((template) => (
                    <div 
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className="group relative aspect-[3/4] bg-card rounded-xl border border-border/50 overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                    >
                        {/* Abstract Background */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${template.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                            <div className={`p-2.5 rounded-full bg-gradient-to-br ${template.color} text-white shadow-md group-hover:scale-110 transition-transform`}>
                                <template.icon size={18} />
                            </div>
                            <div className="w-full">
                                <h3 className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors truncate px-1" title={template.name}>
                                    {template.name}
                                </h3>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{template.width} x {template.height}</p>
                            </div>
                        </div>
                    </div>
                ))}
                
                {filteredTemplates.length === 0 && (
                    <div className="col-span-full py-12 text-center text-muted-foreground">
                        <p>{t('dashboard.noTemplatesFound', { query: searchQuery, category: activeCategoryLabel })}</p>
                    </div>
                )}
             </div>

             {/* Divider / Expander - Removed as we show filtered list now */}
             {/* <div className="relative py-4 flex items-center justify-center">...</div> */}

        </section>

        {/* Footer Info Section */}
        <section className="border-t border-border pt-8 mt-12 mb-8">
            <div className="rounded-3xl border border-border/60 bg-card/40 p-6 shadow-sm backdrop-blur-sm md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                            <div className="relative h-20 w-20 overflow-hidden rounded-2xl ring-4 ring-background shadow-lg md:h-24 md:w-24">
                                <Image
                                    src="https://github.com/GeekatplayStudio.png"
                                    alt="GeekatplayStudio" // i18n-ignore: studio name
                                    fill
                                    sizes="96px"
                                    className="object-cover"
                                />
                            </div>
                            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-4 border-background bg-green-500 text-[10px] font-bold text-white">
                                IE {/* i18n-ignore: product initials badge */}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('dashboard.hubTitle')}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    <RichText
                                        template={t('dashboard.hubByline')}
                                        values={{ author: <span className="font-semibold text-foreground">V Chopine{/* i18n-ignore: person's name */}</span> }}
                                    />
                                </p>
                            </div>
                            <p className="max-w-2xl text-sm text-muted-foreground">
                                {t('dashboard.hubDescription')}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:w-[360px]">
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dashboard.contactUs')}</p>
                            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                                <a href="mailto:hello@geekatplay.com" className="block transition-colors hover:text-foreground">hello@geekatplay.com</a>
                                <a href="https://www.geekatplay.com" target="_blank" rel="noreferrer" className="block transition-colors hover:text-foreground">www.geekatplay.com</a>
                                <a href="https://www.chopinephotography.com" target="_blank" rel="noreferrer" className="block transition-colors hover:text-foreground">www.chopinephotography.com</a>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('dashboard.community')}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <a href="https://github.com/GeekatplayStudio" target="_blank" rel="noreferrer" className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/80">GitHub</a>
                                <a href="https://www.linkedin.com/in/geekatplay/" target="_blank" rel="noreferrer" className="rounded-full bg-[#0077b5]/10 px-3 py-1.5 text-xs font-medium text-[#0077b5] transition-colors hover:bg-[#0077b5]/20">LinkedIn</a>
                                <a href="https://www.youtube.com/@geekatplay" target="_blank" rel="noreferrer" className="rounded-full bg-[#FF0000]/10 px-3 py-1.5 text-xs font-medium text-[#FF0000] transition-colors hover:bg-[#FF0000]/20">YouTube</a>
                                <a href="https://geekatplay.gumroad.com/coffee" target="_blank" rel="noreferrer" className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-tool-accent px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:from-primary/90 hover:to-tool-accent/90 hover:shadow-lg">
                                    <Heart size={14} className="group-hover:animate-bounce" fill="currentColor" />
                                    {t('dashboard.supportMyWork')}
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
                    <p>{t('dashboard.copyright')}</p>
                    <p data-testid="hub-version-label" className="font-mono text-[11px] text-muted-foreground/90">
                        {hubVersionLabel}
                    </p>
                </div>
            </div>
        </section>

      </div>

      {showCustomSizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md p-6 rounded-2xl shadow-2xl border border-border scale-100 animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold mb-4">{t('dashboard.customSize')}</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{t('dashboard.widthPx')}</label>
                        <input 
                            type="number" 
                            min={1}
                            step={1}
                            value={customWidth}
                            onChange={(e) => {
                                const next = e.target.value;
                                if (next === '' || /^\d+$/.test(next)) {
                                    setCustomWidth(next);
                                }
                            }}
                            className="w-full h-10 px-3 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary outline-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{t('dashboard.heightPx')}</label>
                        <input 
                            type="number" 
                            min={1}
                            step={1}
                            value={customHeight}
                            onChange={(e) => {
                                const next = e.target.value;
                                if (next === '' || /^\d+$/.test(next)) {
                                    setCustomHeight(next);
                                }
                            }}
                            className="w-full h-10 px-3 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary outline-none"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setShowCustomSizeModal(false)}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button 
                        onClick={() => {
                            if (!canCreateCustomDesign) return;
                            startNewProject(undefined, { width: parsedCustomWidth, height: parsedCustomHeight });
                            setShowCustomSizeModal(false);
                        }}
                        disabled={!canCreateCustomDesign}
                        className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-colors"
                    >
                        {t('dashboard.createDesign')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
