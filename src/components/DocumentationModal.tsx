"use client";

import { X, HelpCircle, ExternalLink, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import ModalShell from '@/components/ui/ModalShell';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Manual content model. Every piece of copy is an i18n key (see
 * `docs.*` in src/lib/i18n/locales/en.ts) so the whole manual can be
 * translated the same way as the rest of the app: English is the
 * complete base, other locales fall back per-key.
 */
type DocListItem = { labelKey: string; descKey: string };
type DocBlock =
    | { kind: 'p'; key: string }
    | { kind: 'ul' | 'ol'; items: DocListItem[] }
    | { kind: 'callout'; key: string };
interface DocSection {
    id: string;
    titleKey: string;
    blocks: DocBlock[];
}

const SECTIONS: DocSection[] = [
    {
        id: 'dashboard',
        titleKey: 'docs.section.dashboard',
        blocks: [
            { kind: 'p', key: 'docs.dashboard.p1' },
            {
                kind: 'ol', items: [
                    { labelKey: 'docs.dashboard.item1.label', descKey: 'docs.dashboard.item1.desc' },
                    { labelKey: 'docs.dashboard.item2.label', descKey: 'docs.dashboard.item2.desc' },
                    { labelKey: 'docs.dashboard.item3.label', descKey: 'docs.dashboard.item3.desc' },
                    { labelKey: 'docs.dashboard.item4.label', descKey: 'docs.dashboard.item4.desc' },
                ]
            },
            { kind: 'callout', key: 'docs.dashboard.tip' },
        ],
    },
    {
        id: 'editor-layout',
        titleKey: 'docs.section.editorLayout',
        blocks: [
            { kind: 'p', key: 'docs.editorLayout.p1' },
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.editorLayout.item1.label', descKey: 'docs.editorLayout.item1.desc' },
                    { labelKey: 'docs.editorLayout.item2.label', descKey: 'docs.editorLayout.item2.desc' },
                    { labelKey: 'docs.editorLayout.item3.label', descKey: 'docs.editorLayout.item3.desc' },
                    { labelKey: 'docs.editorLayout.item4.label', descKey: 'docs.editorLayout.item4.desc' },
                    { labelKey: 'docs.editorLayout.item5.label', descKey: 'docs.editorLayout.item5.desc' },
                    { labelKey: 'docs.editorLayout.item6.label', descKey: 'docs.editorLayout.item6.desc' },
                ]
            },
        ],
    },
    {
        id: 'canvas',
        titleKey: 'docs.section.canvas',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.canvas.item1.label', descKey: 'docs.canvas.item1.desc' },
                    { labelKey: 'docs.canvas.item2.label', descKey: 'docs.canvas.item2.desc' },
                    { labelKey: 'docs.canvas.item3.label', descKey: 'docs.canvas.item3.desc' },
                    { labelKey: 'docs.canvas.item4.label', descKey: 'docs.canvas.item4.desc' },
                    { labelKey: 'docs.canvas.item5.label', descKey: 'docs.canvas.item5.desc' },
                    { labelKey: 'docs.canvas.item6.label', descKey: 'docs.canvas.item6.desc' },
                ]
            },
        ],
    },
    {
        id: 'toolbar',
        titleKey: 'docs.section.toolbar',
        blocks: [
            { kind: 'p', key: 'docs.toolbar.p1' },
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.toolbar.item1.label', descKey: 'docs.toolbar.item1.desc' },
                    { labelKey: 'docs.toolbar.item2.label', descKey: 'docs.toolbar.item2.desc' },
                    { labelKey: 'docs.toolbar.item3.label', descKey: 'docs.toolbar.item3.desc' },
                    { labelKey: 'docs.toolbar.item4.label', descKey: 'docs.toolbar.item4.desc' },
                    { labelKey: 'docs.toolbar.item5.label', descKey: 'docs.toolbar.item5.desc' },
                    { labelKey: 'docs.toolbar.item6.label', descKey: 'docs.toolbar.item6.desc' },
                ]
            },
            { kind: 'callout', key: 'docs.toolbar.tip' },
        ],
    },
    {
        id: 'properties',
        titleKey: 'docs.section.properties',
        blocks: [
            { kind: 'p', key: 'docs.properties.p1' },
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.properties.item1.label', descKey: 'docs.properties.item1.desc' },
                    { labelKey: 'docs.properties.item2.label', descKey: 'docs.properties.item2.desc' },
                    { labelKey: 'docs.properties.item3.label', descKey: 'docs.properties.item3.desc' },
                    { labelKey: 'docs.properties.item4.label', descKey: 'docs.properties.item4.desc' },
                    { labelKey: 'docs.properties.item5.label', descKey: 'docs.properties.item5.desc' },
                    { labelKey: 'docs.properties.item6.label', descKey: 'docs.properties.item6.desc' },
                ]
            },
        ],
    },
    {
        id: 'formats',
        titleKey: 'docs.section.formats',
        blocks: [
            { kind: 'p', key: 'docs.formats.p1' },
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.formats.item1.label', descKey: 'docs.formats.item1.desc' },
                    { labelKey: 'docs.formats.item2.label', descKey: 'docs.formats.item2.desc' },
                    { labelKey: 'docs.formats.item3.label', descKey: 'docs.formats.item3.desc' },
                    { labelKey: 'docs.formats.item4.label', descKey: 'docs.formats.item4.desc' },
                    { labelKey: 'docs.formats.item5.label', descKey: 'docs.formats.item5.desc' },
                    { labelKey: 'docs.formats.item6.label', descKey: 'docs.formats.item6.desc' },
                ]
            },
            { kind: 'callout', key: 'docs.formats.tip' },
        ],
    },
    {
        id: 'assets',
        titleKey: 'docs.section.assets',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.assets.item1.label', descKey: 'docs.assets.item1.desc' },
                    { labelKey: 'docs.assets.item2.label', descKey: 'docs.assets.item2.desc' },
                    { labelKey: 'docs.assets.item3.label', descKey: 'docs.assets.item3.desc' },
                    { labelKey: 'docs.assets.item4.label', descKey: 'docs.assets.item4.desc' },
                    { labelKey: 'docs.assets.item5.label', descKey: 'docs.assets.item5.desc' },
                ]
            },
        ],
    },
    {
        id: 'ai-tools',
        titleKey: 'docs.section.aiTools',
        blocks: [
            { kind: 'p', key: 'docs.aiTools.p1' },
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.aiTools.item1.label', descKey: 'docs.aiTools.item1.desc' },
                    { labelKey: 'docs.aiTools.item2.label', descKey: 'docs.aiTools.item2.desc' },
                    { labelKey: 'docs.aiTools.item3.label', descKey: 'docs.aiTools.item3.desc' },
                    { labelKey: 'docs.aiTools.item4.label', descKey: 'docs.aiTools.item4.desc' },
                    { labelKey: 'docs.aiTools.item5.label', descKey: 'docs.aiTools.item5.desc' },
                    { labelKey: 'docs.aiTools.item6.label', descKey: 'docs.aiTools.item6.desc' },
                ]
            },
        ],
    },
    {
        id: 'templates',
        titleKey: 'docs.section.templates',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.templates.item1.label', descKey: 'docs.templates.item1.desc' },
                    { labelKey: 'docs.templates.item2.label', descKey: 'docs.templates.item2.desc' },
                    { labelKey: 'docs.templates.item3.label', descKey: 'docs.templates.item3.desc' },
                ]
            },
        ],
    },
    {
        id: 'saving',
        titleKey: 'docs.section.saving',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.saving.item1.label', descKey: 'docs.saving.item1.desc' },
                    { labelKey: 'docs.saving.item2.label', descKey: 'docs.saving.item2.desc' },
                    { labelKey: 'docs.saving.item3.label', descKey: 'docs.saving.item3.desc' },
                    { labelKey: 'docs.saving.item4.label', descKey: 'docs.saving.item4.desc' },
                    { labelKey: 'docs.saving.item5.label', descKey: 'docs.saving.item5.desc' },
                ]
            },
        ],
    },
    {
        id: 'settings',
        titleKey: 'docs.section.settings',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.settings.item1.label', descKey: 'docs.settings.item1.desc' },
                    { labelKey: 'docs.settings.item2.label', descKey: 'docs.settings.item2.desc' },
                    { labelKey: 'docs.settings.item3.label', descKey: 'docs.settings.item3.desc' },
                    { labelKey: 'docs.settings.item4.label', descKey: 'docs.settings.item4.desc' },
                    { labelKey: 'docs.settings.item5.label', descKey: 'docs.settings.item5.desc' },
                    { labelKey: 'docs.settings.item6.label', descKey: 'docs.settings.item6.desc' },
                ]
            },
        ],
    },
    {
        id: 'troubleshooting',
        titleKey: 'docs.section.troubleshooting',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.troubleshooting.item1.label', descKey: 'docs.troubleshooting.item1.desc' },
                    { labelKey: 'docs.troubleshooting.item2.label', descKey: 'docs.troubleshooting.item2.desc' },
                    { labelKey: 'docs.troubleshooting.item3.label', descKey: 'docs.troubleshooting.item3.desc' },
                    { labelKey: 'docs.troubleshooting.item4.label', descKey: 'docs.troubleshooting.item4.desc' },
                    { labelKey: 'docs.troubleshooting.item5.label', descKey: 'docs.troubleshooting.item5.desc' },
                    { labelKey: 'docs.troubleshooting.item6.label', descKey: 'docs.troubleshooting.item6.desc' },
                ]
            },
        ],
    },
    {
        id: 'shortcuts',
        titleKey: 'docs.section.shortcuts',
        blocks: [
            {
                kind: 'ul', items: [
                    { labelKey: 'docs.shortcuts.item1.label', descKey: 'docs.shortcuts.item1.desc' },
                    { labelKey: 'docs.shortcuts.item2.label', descKey: 'docs.shortcuts.item2.desc' },
                    { labelKey: 'docs.shortcuts.item3.label', descKey: 'docs.shortcuts.item3.desc' },
                    { labelKey: 'docs.shortcuts.item4.label', descKey: 'docs.shortcuts.item4.desc' },
                    { labelKey: 'docs.shortcuts.item5.label', descKey: 'docs.shortcuts.item5.desc' },
                    { labelKey: 'docs.shortcuts.item6.label', descKey: 'docs.shortcuts.item6.desc' },
                    { labelKey: 'docs.shortcuts.item7.label', descKey: 'docs.shortcuts.item7.desc' },
                    { labelKey: 'docs.shortcuts.item8.label', descKey: 'docs.shortcuts.item8.desc' },
                ]
            },
        ],
    },
];

interface DocumentationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DocumentationModal({ isOpen, onClose }: DocumentationModalProps) {
    const { t } = useI18n();

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t('docs.title')}
            icon={<HelpCircle size={14} className="text-primary" />}
            initialWidth={1100}
            initialHeight={860}
            minWidth={520}
            minHeight={400}
            zIndex={70}
            bodyClassName="overflow-hidden flex flex-col"
        >
                <div className="flex min-w-0 flex-1 min-h-0 flex-col">

                    <div className="border-b border-border/60 bg-background/50 px-5 py-3 lg:hidden">
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                            <a href="#introduction" className="shrink-0 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                                {t('docs.section.introduction')}
                            </a>
                            {SECTIONS.map((section) => (
                                <a
                                    key={`mobile-${section.id}`}
                                    href={`#${section.id}`}
                                    className="shrink-0 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                >
                                    {t(section.titleKey)}
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="relative flex flex-1 min-h-0">
                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 pr-5 text-sm leading-relaxed lg:px-6 lg:py-6 lg:pr-72" id="documentation-content">
                            <IntroSection />
                            {SECTIONS.map((section) => (
                                <DocSectionView key={section.id} section={section} />
                            ))}

                            <div className="rounded-xl border border-border/60 bg-secondary/15 p-4 text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground">{t('docs.moreHelp.title')}</p>
                                <p className="mt-2">{t('docs.moreHelp.body')}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Link href="https://github.com/GeekatplayStudio" target="_blank" className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 hover:bg-secondary">
                                        GitHub <ExternalLink size={12} />
                                    </Link>
                                    <Link href="https://www.youtube.com/@geekatplay" target="_blank" className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 hover:bg-secondary">
                                        YouTube <ExternalLink size={12} />
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <aside className="pointer-events-none absolute inset-y-4 right-4 hidden w-60 xl:block">
                            <div className="pointer-events-auto sticky top-0 max-h-full overflow-hidden rounded-2xl border border-border/70 bg-card/92 shadow-xl backdrop-blur-sm">
                                <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <PanelRightOpen size={15} className="text-primary" />
                                        <div>
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('docs.quickJump.title')}</h3>
                                            <p className="text-[11px] text-muted-foreground">{t('docs.quickJump.subtitle')}</p>
                                        </div>
                                    </div>
                                    <button onClick={onClose} className="rounded-full p-1.5 transition-colors hover:bg-secondary" aria-label={t('docs.quickJump.closeAria')}>
                                        <X size={14} />
                                    </button>
                                </div>
                                <nav className="max-h-[60vh] overflow-y-auto px-3 py-3 text-sm text-muted-foreground scrollbar-thin">
                                    <a href="#introduction" className="block rounded-xl px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground">
                                        {t('docs.section.introduction')}
                                    </a>
                                    {SECTIONS.map((section) => (
                                        <a key={section.id} href={`#${section.id}`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground">
                                            {t(section.titleKey)}
                                        </a>
                                    ))}
                                </nav>
                            </div>
                        </aside>
                    </div>
                </div>
        </ModalShell>
    );
}

function IntroSection() {
    const { t } = useI18n();
    return (
        <Section id="introduction" title={t('docs.section.introduction')}>
            <p>{t('docs.intro.p1')}</p>
            <ol className="list-decimal list-inside space-y-2">
                <Item labelKey="docs.intro.item1.label" descKey="docs.intro.item1.desc" />
                <Item labelKey="docs.intro.item2.label" descKey="docs.intro.item2.desc" />
                <Item labelKey="docs.intro.item3.label" descKey="docs.intro.item3.desc" />
                <Item labelKey="docs.intro.item4.label" descKey="docs.intro.item4.desc" />
            </ol>
            <p>{t('docs.intro.p2')}</p>
            <p className="mt-2 text-xs bg-yellow-500/10 border border-yellow-500/20 p-2 rounded text-yellow-600 dark:text-yellow-400">
                <strong>{t('docs.intro.securityNoteLabel')}</strong> {t('docs.intro.securityNoteBody')}
            </p>
        </Section>
    );
}

function DocSectionView({ section }: { section: DocSection }) {
    const { t } = useI18n();
    return (
        <Section id={section.id} title={t(section.titleKey)}>
            {section.blocks.map((block, index) => {
                if (block.kind === 'p') {
                    return <p key={index}>{t(block.key)}</p>;
                }
                if (block.kind === 'callout') {
                    return (
                        <p key={index} className="rounded-md border border-border/60 bg-secondary/40 p-3 text-xs">
                            {t(block.key)}
                        </p>
                    );
                }
                const ListTag = block.kind;
                return (
                    <ListTag key={index} className="list-disc list-inside space-y-2">
                        {block.items.map((item) => (
                            <Item key={item.labelKey} labelKey={item.labelKey} descKey={item.descKey} />
                        ))}
                    </ListTag>
                );
            })}
        </Section>
    );
}

function Item({ labelKey, descKey }: { labelKey: string; descKey: string }) {
    const { t } = useI18n();
    return (
        <li><span className="font-medium">{t(labelKey)}:</span> {t(descKey)}</li>
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
