'use client';

import { useState, useEffect, useCallback } from 'react';
import LoginModal from '@/components/LoginModal';
import UserProfileModal from '@/components/UserProfileModal';
import Dashboard from '@/components/Dashboard';
import EditorView from '@/components/Editor/EditorView';
import DocumentationModal from '@/components/DocumentationModal';
import SettingsModal from '@/components/SettingsModal';
import AdminAreaModal from '@/components/AdminAreaModal';
import BrandIcon from '@/components/BrandIcon';
import SetupWizardModal from '@/components/SetupWizardModal';
import { User, Settings, Box, Cloud, ShieldCheck } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import { AuthUser } from '@/types';
import {
  dismissSetupWizardForSession,
  markSetupWizardCompleted,
  onSetupWizardOpenRequest,
  shouldAutoOpenSetupWizard
} from '@/lib/setupWizard';


export default function Home() {
  const { toast } = useToast();
  // Auth State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [username, setUsername] = useState('Guest');
  const [displayName, setDisplayName] = useState('Guest');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  
  // View State
  const [currentView, setCurrentView] = useState<'dashboard' | 'editor'>('dashboard');

  // Design Context State
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
  const [currentDesignName, setCurrentDesignName] = useState<string>('Untitled Design');
  
  // Pending Load State (from Dashboard selection)
  const [pendingDesignToLoad, setPendingDesignToLoad] = useState<{ data?: unknown } | null>(null);
  const [pendingTemplateJsonUrl, setPendingTemplateJsonUrl] = useState<string | null>(null);
  const [pendingDesignSize, setPendingDesignSize] = useState<{width: number, height: number} | null>(null);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdminArea, setShowAdminArea] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({ has2D: false, has3D: false });
  const isAdminUser = userRoles.includes('admin') && username.includes('@');
  const setupWizardScope = isDesktopApp ? 'desktop-local' : username;

  // Auth Effects
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      const desktopBridge = window.desktop;
      const desktopDetected = Boolean(desktopBridge?.isDesktop);
      setIsDesktopApp(desktopDetected);

      const storedUser = localStorage.getItem('image-express-user');
      if (desktopDetected) {
        setUsername(storedUser || 'Local Desktop');
        setDisplayName('Local Desktop');
        setUserRoles(['admin']);
        setShowLoginModal(false);
      } else if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser) as Partial<AuthUser>;
          if (!parsed.email) throw new Error('Legacy user session');
          setUsername(parsed.email);
          setDisplayName(parsed.displayName || parsed.email);
          setUserRoles(Array.isArray(parsed.roles) ? parsed.roles : []);
        } catch {
          if (storedUser.trim().toLowerCase() === 'vovka') {
            setUsername('geekatplay@gmail.com');
            setDisplayName('vovka');
            setUserRoles(['admin']);
          } else if (storedUser.includes('@')) {
            setUsername(storedUser);
            setDisplayName(storedUser.split('@')[0] || storedUser);
            setUserRoles([]);
          } else {
            setUsername(`${storedUser}@local`);
            setDisplayName(storedUser);
            setUserRoles([]);
          }
        }
      } else {
        setShowLoginModal(true);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleLogin = (user: AuthUser) => {
    localStorage.setItem('image-express-user', JSON.stringify(user));
    setUsername(user.email);
    setDisplayName(user.displayName || user.email);
    setUserRoles(Array.isArray(user.roles) ? user.roles : []);
    setShowLoginModal(false);

    // Fire and forget logging of the authentication event.
    if (!isDesktopApp) {
      fetch('/api/logs/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.email })
      }).catch(() => {
        // Swallow errors to avoid blocking UX if logging fails.
      });
    }
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('image-express-user');
    setUsername(isDesktopApp ? 'Local Desktop' : 'Guest');
    setDisplayName(isDesktopApp ? 'Local Desktop' : 'Guest');
    setUserRoles(isDesktopApp ? ['admin'] : []);
    setShowProfileModal(false);
    setShowLoginModal(!isDesktopApp);
    setCurrentView('dashboard');
    setCurrentDesignId(null);
    setCurrentDesignName('Untitled Design');
    setPendingDesignToLoad(null);
    setPendingTemplateJsonUrl(null);
  }, [isDesktopApp]);

  // Inactivity Timeout (30 mins) - Server/Web Only
  useEffect(() => {
    // Skip if Desktop App, or Guest (not logged in), or Login Modal is already showing
    if (isDesktopApp || username === 'Guest' || showLoginModal) {
      return;
    }

    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let timeoutId: NodeJS.Timeout;

    const performLogout = () => {
       console.log("User inactive for 30mins, logging out...");
       handleLogout();
       toast({ title: 'Session expired', description: 'Logged out due to inactivity.', variant: 'warning' });
    };

    const resetTimer = () => {
       if (timeoutId) clearTimeout(timeoutId);
       timeoutId = setTimeout(performLogout, TIMEOUT_MS);
    };

    // Events to track
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    
    // Throttled handler
    let lastReset = 0;
    const handleActivity = () => {
        const now = Date.now();
        // Limit resets to once per second
        if (now - lastReset > 1000) {
            resetTimer();
            lastReset = now;
        }
    };

    // Init
    resetTimer();
    if (typeof window !== 'undefined') {
        events.forEach(evt => window.addEventListener(evt, handleActivity));
    }

    return () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (typeof window !== 'undefined') {
            events.forEach(evt => window.removeEventListener(evt, handleActivity));
        }
    };
  }, [isDesktopApp, username, showLoginModal, handleLogout, toast]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const has3D = Boolean(
      localStorage.getItem('meshy_api_key') ||
      localStorage.getItem('tripo_api_key') ||
      localStorage.getItem('hitems_api_key')
    );
    const has2D = Boolean(
      localStorage.getItem('stability_api_key') ||
      localStorage.getItem('openai_api_key') ||
      localStorage.getItem('google_api_key') ||
      localStorage.getItem('banana_api_key')
    );
    
    // Only update if changed to avoid unnecessary re-renders
    if (has2D !== connectionStatus.has2D || has3D !== connectionStatus.has3D) {
       setConnectionStatus({ has2D, has3D });
    }
  }, [showSettings, currentView, connectionStatus.has2D, connectionStatus.has3D]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (showLoginModal) return;
    if (shouldAutoOpenSetupWizard(setupWizardScope)) {
      setShowSetupWizard(true);
    }
  }, [showLoginModal, setupWizardScope, currentView]);

  useEffect(() => {
    const unsubscribe = onSetupWizardOpenRequest(() => {
      setShowSetupWizard(true);
    });
    return unsubscribe;
  }, []);

  const handleCloseSetupWizard = () => {
    dismissSetupWizardForSession(setupWizardScope);
    setShowSetupWizard(false);
  };

  const handleCompleteSetupWizard = () => {
    markSetupWizardCompleted(setupWizardScope);
    setShowSetupWizard(false);
    toast({
      title: 'Setup complete',
      description: 'Core API/storage setup is ready. You can reopen the wizard from Settings.',
      variant: 'success'
    });
  };

  // Render
    if (currentView === 'editor') {
      return (
        <>
          <EditorView 
          initialDesign={pendingDesignToLoad}
          initialTemplateJsonUrl={pendingTemplateJsonUrl}
          initialSize={pendingDesignSize}
          initialActiveTool={pendingTool ?? undefined}
          user={username}
          onBack={() => {
            setCurrentView('dashboard');
            setCurrentDesignId(null);
            setCurrentDesignName('Untitled Design');
            setPendingDesignToLoad(null);
            setPendingTemplateJsonUrl(null);
            setPendingTool(null);
          }}
          onLogout={handleLogout}
          currentDesignId={currentDesignId}
          currentDesignName={currentDesignName}
          onUpdateDesignInfo={(id, name) => {
            setCurrentDesignId(id);
            setCurrentDesignName(name);
          }}
          onOpenDocumentation={() => setShowDocumentation(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenAdminArea={() => setShowAdminArea(true)}
          isAdminUser={isAdminUser}
          settingsOpen={showSettings}
          />
          <DocumentationModal isOpen={showDocumentation} onClose={() => setShowDocumentation(false)} />
          <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} userId={username} userRoles={userRoles} />
          <AdminAreaModal isOpen={showAdminArea} onClose={() => setShowAdminArea(false)} userId={username} userRoles={userRoles} />
          <SetupWizardModal isOpen={showSetupWizard} onClose={handleCloseSetupWizard} onComplete={handleCompleteSetupWizard} />
        </>
      );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Dashboard Specific Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-20 relative shadow-sm">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
               <BrandIcon />
               <span className="font-bold text-lg hidden lg:block bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-pink-500">
                 Image Express
               </span>
           </div>
        </div>
        
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-2">
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border transition-all ${
                  connectionStatus.has3D
                    ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600'
                    : 'bg-secondary/30 border-transparent text-muted-foreground/30 opacity-60'
                }`}
                title={connectionStatus.has3D ? '3D Services Connected' : 'No 3D Services Connected'}
              >
                <Box size={14} strokeWidth={connectionStatus.has3D ? 2 : 1.5} />
                {connectionStatus.has3D && <span className="text-[10px] font-bold">3D</span>}
              </div>
              <div
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full border transition-all ${
                  connectionStatus.has2D
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-600'
                    : 'bg-secondary/30 border-transparent text-muted-foreground/30 opacity-60'
                }`}
                title={connectionStatus.has2D ? 'Generative AI Connected' : 'No Generative AI Connected'}
              >
                <Cloud size={14} strokeWidth={connectionStatus.has2D ? 2 : 1.5} />
                {connectionStatus.has2D && <span className="text-[10px] font-bold">AI</span>}
              </div>
            </div>
             <button 
               onClick={() => setShowDocumentation(true)}
               className="w-9 h-9 rounded-full border border-border/60 flex items-center justify-center text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
               title="How to use Image Express"
             >
               ?
             </button>
             <button 
                onClick={() => setShowSettings(true)}
                className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                title="Settings"
             >
                <Settings size={20} />
             </button>
             {isAdminUser && (
               <button
                  onClick={() => setShowAdminArea(true)}
                  className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                  title="Admin Area"
               >
                  <ShieldCheck size={20} />
               </button>
             )}
             <button 
                onClick={() => setShowProfileModal(true)}
                className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground ml-1"
                title="User Profile"
             >
                <User size={20} />
             </button>
        </div>
      </header>
      
      {!isDesktopApp && (
        <LoginModal 
          isOpen={showLoginModal} 
          onLogin={handleLogin}
          onClose={() => setShowLoginModal(false)}
        />
      )}
      
      <UserProfileModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)}
        username={displayName}
        onLogout={handleLogout}
      />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} userId={username} userRoles={userRoles} />
      <AdminAreaModal isOpen={showAdminArea} onClose={() => setShowAdminArea(false)} userId={username} userRoles={userRoles} />
      <SetupWizardModal isOpen={showSetupWizard} onClose={handleCloseSetupWizard} onComplete={handleCompleteSetupWizard} />

        <div className="flex flex-1 overflow-hidden">
           <Dashboard 
              onNewDesign={(tool, size) => {
                  setCurrentDesignId(null);
                  setCurrentDesignName('Untitled Design');
                  setPendingDesignToLoad(null);
                  setPendingTemplateJsonUrl(null);
                  setPendingDesignSize(size || null);
                  if (tool) setPendingTool(tool);
                  setCurrentView('editor');
              }}
              onSelectTemplate={(t) => {
                  console.log("Loading template", t);
                  setPendingDesignToLoad(null);
                  
                  if (t.jsonUrl) {
                      setPendingTemplateJsonUrl(t.jsonUrl);
                      setPendingDesignSize(null);
                  } else if (t.width && t.height) {
                      setPendingTemplateJsonUrl(null);
                      setPendingDesignSize({ width: t.width, height: t.height });
                  }
                  
                  setCurrentDesignName(t.name || 'Untitled Template');
                  setCurrentView('editor'); 
              }}
              onOpenDesign={(d) => {
                  setPendingDesignToLoad(d);
                  setPendingTemplateJsonUrl(null);
                  setCurrentDesignId(d.id);
                  setCurrentDesignName(d.name);
                  setCurrentView('editor');
              }}
           />
      </div>

      <DocumentationModal isOpen={showDocumentation} onClose={() => setShowDocumentation(false)} />
    </div>
  );
}
