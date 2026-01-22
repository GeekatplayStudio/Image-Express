'use client';

import { X, User, Mail, Camera, Save } from 'lucide-react';
import { useState } from 'react';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    username: string;
    onLogout: () => void;
}

export default function UserProfileModal({ isOpen, onClose, username, onLogout }: UserProfileModalProps) {
    const [name, setName] = useState(username === 'test' ? 'Test User' : username);
    const [email, setEmail] = useState('user@example.com');
    const [image, setImage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setImage(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 relative">
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
                >
                    <X size={20} />
                </button>

                {/* Header / Cover */}
                <div className="h-32 bg-gradient-to-r from-blue-500 to-indigo-600 relative">
                     <div className="absolute -bottom-12 left-8">
                         <div className="w-24 h-24 rounded-full border-4 border-card bg-secondary flex items-center justify-center relative group overflow-hidden">
                             {image ? (
                                <img src={image} className="w-full h-full object-cover" alt="Profile" />
                             ) : (
                                <User size={40} className="text-muted-foreground" />
                             )}
                             
                             <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                 <Camera size={20} className="text-white" />
                                 <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                             </label>
                         </div>
                     </div>
                </div>

                <div className="pt-16 pb-8 px-8 space-y-6">
                    <div>
                         <h2 className="text-xl font-bold">{name}</h2>
                         <p className="text-sm text-muted-foreground">@{username}</p>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Display Name</label>
                            <div className="flex gap-2">
                                <input 
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="flex-1 bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                                />
                            </div>
                        </div>

                         <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-9 bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3 border-t border-border/50">
                        <button className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                            <Save size={16} /> Save Changes
                        </button>
                        <button 
                            onClick={onLogout}
                            className="px-4 py-2 bg-destructive/10 text-destructive rounded-md text-sm font-medium hover:bg-destructive/20 transition-colors"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
