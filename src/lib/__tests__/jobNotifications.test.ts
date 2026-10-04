import {
    isWindowUnattended,
    notifyJobFinished,
    requestSystemNotificationPermission,
    systemNotificationPermission,
} from '@/lib/jobNotifications';

type Permission = 'default' | 'granted' | 'denied';

const makeEnv = (options: { permission?: Permission; hidden?: boolean; focused?: boolean; throws?: boolean } = {}) => {
    const shown: Array<{ title: string; body?: string; tag?: string; onclick: (() => void) | null; close: jest.Mock }> = [];
    const requestPermission = jest.fn(async () => 'granted' as Permission);
    class FakeNotification {
        static permission: Permission = options.permission ?? 'granted';
        static requestPermission = requestPermission;
        onclick: (() => void) | null = null;
        close = jest.fn();
        constructor(title: string, init?: { body?: string; tag?: string }) {
            if (options.throws) throw new TypeError('Illegal constructor');
            shown.push(Object.assign(this, { title, body: init?.body, tag: init?.tag }));
        }
    }
    const focus = jest.fn();
    const env = {
        Notification: FakeNotification as never,
        document: { hidden: options.hidden ?? false, hasFocus: () => options.focused ?? true },
        focus,
    };
    return { env, shown, focus, requestPermission };
};

const JOB = { id: 'qjob_1', title: 'Background job completed', body: 'Generate (flux)' };

describe('isWindowUnattended', () => {
    it('is true when the tab is hidden or the window has lost focus', () => {
        expect(isWindowUnattended(makeEnv({ hidden: true }).env)).toBe(true);
        expect(isWindowUnattended(makeEnv({ focused: false }).env)).toBe(true);
        expect(isWindowUnattended(makeEnv().env)).toBe(false);
    });

    it('is false where there is no document at all', () => {
        expect(isWindowUnattended({})).toBe(false);
    });
});

describe('notifyJobFinished', () => {
    it('stays quiet while the user is looking at the app', () => {
        // The toast already told them; a second, system-level alert is noise.
        const { env, shown } = makeEnv();
        expect(notifyJobFinished(JOB, env)).toBe(false);
        expect(shown).toHaveLength(0);
    });

    it('announces through the system when the window is in the background', () => {
        const { env, shown } = makeEnv({ focused: false });
        expect(notifyJobFinished(JOB, env)).toBe(true);
        expect(shown).toHaveLength(1);
        expect(shown[0]).toMatchObject({ title: 'Background job completed', body: 'Generate (flux)' });
    });

    it('tags by job so a retried job replaces its own notification', () => {
        const { env, shown } = makeEnv({ hidden: true });
        notifyJobFinished(JOB, env);
        notifyJobFinished(JOB, env);
        expect(new Set(shown.map((entry) => entry.tag)).size).toBe(1);
        expect(shown[0].tag).toContain('qjob_1');
    });

    it('never notifies without permission, and never asks from here', () => {
        for (const permission of ['default', 'denied'] as const) {
            const { env, shown, requestPermission } = makeEnv({ permission, hidden: true });
            expect(notifyJobFinished(JOB, env)).toBe(false);
            expect(shown).toHaveLength(0);
            expect(requestPermission).not.toHaveBeenCalled();
        }
    });

    it('brings the window forward when the notification is clicked', () => {
        const { env, shown, focus } = makeEnv({ hidden: true });
        notifyJobFinished(JOB, env);
        shown[0].onclick?.();
        expect(focus).toHaveBeenCalledTimes(1);
        expect(shown[0].close).toHaveBeenCalledTimes(1);
    });

    it('survives a platform that refuses to construct a notification', () => {
        const { env } = makeEnv({ hidden: true, throws: true });
        expect(() => notifyJobFinished(JOB, env)).not.toThrow();
        expect(notifyJobFinished(JOB, env)).toBe(false);
    });

    it('does nothing where notifications do not exist', () => {
        expect(notifyJobFinished(JOB, { document: { hidden: true } })).toBe(false);
        expect(systemNotificationPermission({})).toBe('unsupported');
    });
});

describe('requestSystemNotificationPermission', () => {
    it('asks only when the user has not answered yet', async () => {
        const undecided = makeEnv({ permission: 'default' });
        await expect(requestSystemNotificationPermission(undecided.env)).resolves.toBe('granted');
        expect(undecided.requestPermission).toHaveBeenCalledTimes(1);

        const denied = makeEnv({ permission: 'denied' });
        await expect(requestSystemNotificationPermission(denied.env)).resolves.toBe('denied');
        expect(denied.requestPermission).not.toHaveBeenCalled();
    });

    it('reports unsupported instead of throwing', async () => {
        await expect(requestSystemNotificationPermission({})).resolves.toBe('unsupported');
    });
});
