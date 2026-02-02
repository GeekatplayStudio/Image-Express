export type UserProfileSettings = {
    displayName: string;
    username: string;
    email: string;
    info: string;
    image?: string | null;
    imageScale?: number;
    embedInfo?: boolean;
};

const STORAGE_KEY = 'image-express.profile';

export const loadProfileSettings = (): UserProfileSettings | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as UserProfileSettings;
    } catch {
        return null;
    }
};

export const saveProfileSettings = (settings: UserProfileSettings) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};