'use client';

import { ChevronDown } from 'lucide-react';
import { clampMenuToViewport } from '@/components/Editor/menuViewportClamp';
import { useI18n } from '@/providers/I18nProvider';
import {
    AI_TOOL_GROUP,
    CREATION_PRIMARY_TOOLS,
    FABRICATION_TOOL_GROUP,
    FILL_TOOL_GROUP,
    LIBRARY_TOOLS,
    RETOUCH_TOOL_GROUP,
    SELECTION_TOOL_GROUP,
    WORKSPACE_UTILITY_TOOLS,
    ariaShortcut,
    type ToolbarToolDefinition,
} from '@/components/toolbar/toolRegistry';

/**
 * The header's Tools menu: every tool the left rail can launch, in the rail's
 * own families and order, with its shortcut. It is built from the tool
 * registry rather than written out by hand — the hand-written version this
 * replaced had drifted to nine missing tools and was never mounted.
 */
const SECTIONS: Array<{ labelKey: string; tools: ToolbarToolDefinition[] }> = [
    { labelKey: SELECTION_TOOL_GROUP.labelKey, tools: SELECTION_TOOL_GROUP.tools },
    { labelKey: 'tools.section.creation', tools: CREATION_PRIMARY_TOOLS },
    { labelKey: RETOUCH_TOOL_GROUP.labelKey, tools: RETOUCH_TOOL_GROUP.tools },
    { labelKey: FILL_TOOL_GROUP.labelKey, tools: FILL_TOOL_GROUP.tools },
    { labelKey: 'tools.section.utilities', tools: WORKSPACE_UTILITY_TOOLS },
    { labelKey: 'tools.section.libraries', tools: LIBRARY_TOOLS },
    { labelKey: AI_TOOL_GROUP.labelKey, tools: AI_TOOL_GROUP.tools },
    { labelKey: FABRICATION_TOOL_GROUP.labelKey, tools: FABRICATION_TOOL_GROUP.tools },
];

interface ToolsDropdownMenuProps {
    open: boolean;
    onToggle: () => void;
    onTriggerTool: (tool: string) => void;
}

export default function ToolsDropdownMenu({ open, onToggle, onTriggerTool }: ToolsDropdownMenuProps) {
    const { t } = useI18n();
    return (
        <div className="relative order-6">
            <button
                onClick={onToggle}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-background/80 hover:text-foreground"
                aria-expanded={open}
            >
                <span>{t('menu.tools')}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div
                    ref={clampMenuToViewport}
                    role="menu"
                    data-testid="menu-tools"
                    className="absolute left-0 top-full mt-2 w-[26rem] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-6rem)] overflow-y-auto bg-card border border-border/50 rounded-xl shadow-xl py-1 animate-in fade-in slide-in-from-top-2 z-50"
                >
                    {SECTIONS.map((section, index) => (
                        <div key={section.labelKey} role="group" aria-label={t(section.labelKey)}>
                            {index > 0 && <div className="my-1 border-t border-border/50" />}
                            <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                {t(section.labelKey)}
                            </div>
                            <div className="grid grid-cols-2 gap-0.5 px-1.5">
                                {section.tools.map((tool) => (
                                    <button
                                        key={tool.name}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onToggle();
                                            onTriggerTool(tool.name);
                                        }}
                                        title={t(tool.labelKey)}
                                        aria-label={t(tool.labelKey)}
                                        aria-keyshortcuts={ariaShortcut(tool)}
                                        className="min-w-0 h-8 px-2 text-xs rounded-md hover:bg-secondary/50 flex items-center gap-2 group"
                                    >
                                        <tool.icon size={14} className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                                        <span className="flex-1 min-w-0 truncate text-left">{t(tool.labelKey)}</span>
                                        {tool.shortcut && (
                                            <kbd aria-hidden="true" className="shrink-0 text-[10px] font-sans text-muted-foreground border border-border px-1 rounded">
                                                {tool.shortcut}
                                            </kbd>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="px-3 pt-1.5 pb-1 text-[10px] text-muted-foreground/80">{t('tools.panelsHint')}</div>
                </div>
            )}
        </div>
    );
}
