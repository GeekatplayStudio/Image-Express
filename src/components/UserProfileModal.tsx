'use client';

import { X, User, Mail, Camera, Save, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { loadProfileSettings, saveProfileSettings, UserProfileSettings } from '@/lib/profile-utils';
import useEscapeKey from '@/hooks/useEscapeKey';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    username: string;
    onLogout: () => void;
    onProfileUpdate?: (profile: UserProfileSettings) => void;
}

export default function UserProfileModal({ isOpen, onClose, username, onLogout, onProfileUpdate }: UserProfileModalProps) {
    const [name, setName] = useState(username === 'test' ? 'Test User' : username);
    const [handle, setHandle] = useState(username);
    const [email, setEmail] = useState('user@example.com');
    const [info, setInfo] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [imageScale, setImageScale] = useState(1);
    const [embedInfo, setEmbedInfo] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordMessage, setPasswordMessage] = useState('');

    const canChangePassword = username.trim().length > 0 && username !== 'Guest' && username !== 'Local Desktop';

    useEffect(() => {
        const saved = loadProfileSettings();
        if (saved) {
            setName(saved.displayName || name);
            setHandle(saved.username || username);
            setEmail(saved.email || email);
            setInfo(saved.info || '');
            setImage(saved.image || null);
            setImageScale(saved.imageScale || 1);
            setEmbedInfo(!!saved.embedInfo);
        }
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPasswordError('');
        setPasswordMessage('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEscapeKey(onClose, { enabled: isOpen });

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

    const handleSave = () => {
        const profile: UserProfileSettings = {
            displayName: name.trim() || handle.trim() || username,
            username: handle.trim() || username,
            email: email.trim(),
            info: info.trim(),
            image,
            imageScale,
            embedInfo
        };
        saveProfileSettings(profile);
        onProfileUpdate?.(profile);
        onClose();
    };

    const handleChangePassword = async () => {
        setPasswordError('');
        setPasswordMessage('');

        if (!canChangePassword) {
            setPasswordError('Password changes are unavailable for this local session.');
            return;
        }
        if (!currentPassword) {
            setPasswordError('Current password is required.');
            return;
        }
        if (newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }

        setIsChangingPassword(true);
        try {
            const response = await fetch('/api/user/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: username,
                    currentPassword,
                    newPassword,
                }),
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok || !payload.success) {
                setPasswordError(payload.message || 'Password change failed.');
                return;
            }

            setPasswordMessage(payload.message || 'Password changed successfully.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        } catch {
            setPasswordError('Password change failed. Please try again.');
        } finally {
            setIsChangingPassword(false);
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
                <div className="h-32 ui-brand-gradient-surface relative">
                     <div className="absolute -bottom-12 left-8">
                                 <div className="w-24 h-24 rounded-full border-4 border-card bg-secondary flex items-center justify-center relative group overflow-hidden">
                             {image ? (
                                          <Image
                                                src={image}
                                                alt="Profile"
                                                fill
                                                sizes="96px"
                                                className="object-cover"
                                                style={{ transform: `scale(${imageScale})`, transformOrigin: 'center' }}
                                                unoptimized
                                          />
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
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Username</label>
                            <div className="flex gap-2">
                                <input 
                                    value={handle}
                                    onChange={(e) => setHandle(e.target.value)}
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

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Personal Info (Embed)</label>
                            <textarea
                                value={info}
                                onChange={(e) => setInfo(e.target.value)}
                                rows={3}
                                className="w-full bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                                placeholder="Artist name, website, credits, etc."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Profile Image Scale</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0.8"
                                    max="2"
                                    step="0.05"
                                    value={imageScale}
                                    onChange={(e) => setImageScale(parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-[10px] text-muted-foreground w-10 text-right">{imageScale.toFixed(2)}x</span>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={embedInfo}
                                onChange={(e) => setEmbedInfo(e.target.checked)}
                                className="h-4 w-4 rounded border-border"
                            />
                            Embed profile info in every export and saved template
                        </label>
                    </div>

                    <div className="space-y-4 rounded-lg border border-border/60 bg-secondary/20 p-4">
                        <div className="flex items-center gap-2">
                            <KeyRound size={16} className="text-muted-foreground" />
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
                                <p className="text-xs text-muted-foreground">
                                    {canChangePassword
                                        ? `Update the password for the signed-in account: ${username}`
                                        : 'Password changes are unavailable for guest or local desktop sessions.'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Current Password</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                aria-label="Current Password"
                                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                                autoComplete="current-password"
                                disabled={!canChangePassword || isChangingPassword}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                aria-label="New Password"
                                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                                autoComplete="new-password"
                                disabled={!canChangePassword || isChangingPassword}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase">Confirm New Password</label>
                            <input
                                type="password"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                aria-label="Confirm New Password"
                                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
                                autoComplete="new-password"
                                disabled={!canChangePassword || isChangingPassword}
                            />
                        </div>

                        {passwordError ? (
                            <p className="text-xs text-destructive">{passwordError}</p>
                        ) : null}
                        {passwordMessage ? (
                            <p className="text-xs text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={14} /> {passwordMessage}</p>
                        ) : null}

                        <button
                            type="button"
                            onClick={handleChangePassword}
                            disabled={!canChangePassword || isChangingPassword}
                            className="w-full py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isChangingPassword ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                            Update Password
                        </button>
                    </div>

                    <div className="pt-4 flex gap-3 border-t border-border/50">
                        <button
                            onClick={handleSave}
                            className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
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
