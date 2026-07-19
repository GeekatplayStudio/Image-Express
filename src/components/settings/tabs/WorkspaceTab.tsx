'use client';

import UpdatesSection from '@/components/settings/UpdatesSection';
import type { WorkspacePreferences } from '../hooks/useWorkspacePreferences';
import type { InstallerSettings } from '../hooks/useInstallerSettings';
import { modalSectionClass } from '../settingsTypes';
import PreferencesPanel from './workspace/PreferencesPanel';
import AppearancePanel from './workspace/AppearancePanel';
import InterfaceThemesPanel from './workspace/InterfaceThemesPanel';
import DashboardAmbiencePanel from './workspace/DashboardAmbiencePanel';
import DependenciesPanel from './workspace/DependenciesPanel';
import LoginActivityPanel from './workspace/LoginActivityPanel';

interface WorkspaceTabProps {
    workspace: WorkspacePreferences;
    installer: InstallerSettings;
}

/** Workspace tab: preferences, updates, appearance, dependency maintenance, and the login log. */
export default function WorkspaceTab({ workspace, installer }: WorkspaceTabProps) {
    return (
        <div className="grid gap-6 xl:col-span-12 xl:grid-cols-2">
            <PreferencesPanel />
            <UpdatesSection className={modalSectionClass} />
            <AppearancePanel workspace={workspace} />
            <InterfaceThemesPanel />
            <DashboardAmbiencePanel />
            <DependenciesPanel installer={installer} />
            <LoginActivityPanel workspace={workspace} />
        </div>
    );
}
