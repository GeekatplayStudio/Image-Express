'use client';

import { useState, useEffect } from 'react';
import LoginModal from '@/components/LoginModal';
import UserProfileModal from '@/components/UserProfileModal';
import Dashboard from '@/components/Dashboard';
import EditorView from '@/components/Editor/EditorView';
import DocumentationModal from '@/components/DocumentationModal';
import { User } from 'lucide-react';

export default function Home() {
  // Auth State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [username, setUsername] = useState('Guest');
  
  // View State
  const [currentView, setCurrentView] = useState<'dashboard' | 'editor'>('dashboard');

  // Design Context State
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
  const [currentDesignName, setCurrentDesignName] = useState<string>('Untitled Design');
  
  // Pending Load State (from Dashboard selection)
  const [pendingDesignToLoad, setPendingDesignToLoad] = useState<any>(null);
  const [pendingTemplateJsonUrl, setPendingTemplateJsonUrl] = useState<string | null>(null);
  const [showDocumentation, setShowDocumentation] = useState(false);

  // Auth Effects
  useEffect(() => {
    // Check session asynchronously to avoid render blocking
    const timer = setTimeout(() => {
      const user = localStorage.getItem('image-express-user');
      if (user) {
        setUsername(user);
      } else {
        setShowLoginModal(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = (user: string) => {
    localStorage.setItem('image-express-user', user);
    setUsername(user);
    setShowLoginModal(false);

    // Fire and forget logging of the authentication event.
    fetch('/api/logs/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user })
    }).catch(() => {
      // Swallow errors to avoid blocking UX if logging fails.
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('image-express-user');
    setUsername('Guest');
    setShowProfileModal(false);
    setShowLoginModal(true);
  };

  // Render
    if (currentView === 'editor') {
      return (
        <>
          <EditorView 
          initialDesign={pendingDesignToLoad}
          initialTemplateJsonUrl={pendingTemplateJsonUrl}
          user={username}
          onBack={() => {
            setCurrentView('dashboard');
            setCurrentDesignId(null);
            setCurrentDesignName('Untitled Design');
            setPendingDesignToLoad(null);
            setPendingTemplateJsonUrl(null);
          }}
          currentDesignId={currentDesignId}
          currentDesignName={currentDesignName}
          onUpdateDesignInfo={(id, name) => {
            setCurrentDesignId(id);
            setCurrentDesignName(name);
          }}
          onOpenDocumentation={() => setShowDocumentation(true)}
          />
          <DocumentationModal isOpen={showDocumentation} onClose={() => setShowDocumentation(false)} />
        </>
      );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Dashboard Specific Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-xl flex items-center px-4 justify-between z-20 relative shadow-sm">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
               <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-lg flex items-center justify-center">
                 <span className="font-bold text-white text-lg">IE</span>
               </div>
               <span className="font-bold text-lg hidden lg:block bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-pink-500">
                 Image Express
               </span>
           </div>
        </div>
        
          <div className="flex items-center gap-3">
             <button 
               onClick={() => setShowDocumentation(true)}
               className="w-9 h-9 rounded-full border border-border/60 flex items-center justify-center text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
               title="How to use Image Express"
             >
               ?
             </button>
             <button 
                onClick={() => setShowProfileModal(true)}
                className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground ml-1"
                title="User Profile"
             >
                <User size={20} />
             </button>
        </div>
      </header>
      
      <LoginModal 
        isOpen={showLoginModal} 
        onLogin={handleLogin} 
      />
      
      <UserProfileModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)}
        username={username}
        onLogout={handleLogout}
      />

        <div className="flex flex-1 overflow-hidden">
           <Dashboard 
              user={username}
              onNewDesign={() => {
                  setCurrentDesignId(null);
                  setCurrentDesignName('Untitled Design');
                  setPendingDesignToLoad(null);
                  setPendingTemplateJsonUrl(null);
                  setCurrentView('editor');
              }}
              onSelectTemplate={(t) => {
                  console.log("Loading template", t);
                  if (t.jsonUrl) {
                      setPendingDesignToLoad(null);
                      setPendingTemplateJsonUrl(t.jsonUrl);
                      setCurrentDesignName(t.name || 'Untitled Template');
                  }
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
