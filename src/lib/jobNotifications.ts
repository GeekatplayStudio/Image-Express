/**
 * Operating-system notifications for finished background jobs.
 *
 * A toast only helps if the window is in front. A generation can take minutes,
 * and the usual thing to do meanwhile is switch to something else — so when
 * the window is hidden or unfocused the result is announced through the system
 * instead. The Web Notification API covers both the browser and the desktop
 * shell (Electron grants it without a prompt), so no IPC is needed.
 */

type NotificationPermissionState = 'default' | 'granted' | 'denied';

interface NotificationCtor {
    new (title: string, options?: { body?: string; tag?: string; silent?: boolean }): {
        onclick: ((event: unknown) => void) | null;
        close: () => void;
    };
    permission: NotificationPermissionState;
    requestPermission: () => Promise<NotificationPermissionState>;
}

interface NotificationEnvironment {
    Notification?: NotificationCtor;
    document?: { hidden?: boolean; hasFocus?: () => boolean };
    focus?: () => void;
}

const environment = (): NotificationEnvironment => (
    typeof window === 'undefined' ? {} : (window as unknown as NotificationEnvironment)
);

export function systemNotificationPermission(env: NotificationEnvironment = environment()): NotificationPermissionState | 'unsupported' {
    return env.Notification ? env.Notification.permission : 'unsupported';
}

/** True when the user cannot currently see an in-app toast. */
export function isWindowUnattended(env: NotificationEnvironment = environment()): boolean {
    const doc = env.document;
    if (!doc) return false;
    if (doc.hidden) return true;
    return typeof doc.hasFocus === 'function' ? !doc.hasFocus() : false;
}

/**
 * Ask for permission. Browsers only honour this from a user gesture, so it is
 * called from the settings checkbox, never from a job finishing.
 */
export async function requestSystemNotificationPermission(
    env: NotificationEnvironment = environment(),
): Promise<NotificationPermissionState | 'unsupported'> {
    if (!env.Notification) return 'unsupported';
    if (env.Notification.permission !== 'default') return env.Notification.permission;
    try {
        return await env.Notification.requestPermission();
    } catch {
        return env.Notification.permission;
    }
}

/**
 * Announce a finished job through the system, if that is the only way the user
 * will see it. Returns whether a notification was shown.
 */
export function notifyJobFinished(
    job: { id: string; title: string; body: string },
    env: NotificationEnvironment = environment(),
): boolean {
    if (!env.Notification || env.Notification.permission !== 'granted') return false;
    if (!isWindowUnattended(env)) return false;
    try {
        // Tagged by job, so a retry that finishes again replaces its own
        // notification instead of stacking a second one.
        const notification = new env.Notification(job.title, { body: job.body, tag: `image-express-job-${job.id}` });
        notification.onclick = () => {
            env.focus?.();
            notification.close();
        };
        return true;
    } catch {
        // Some platforms throw for the constructor even when permission says
        // granted (notably mobile browsers). The toast still fired.
        return false;
    }
}
