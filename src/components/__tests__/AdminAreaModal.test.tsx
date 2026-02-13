import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminAreaModal from '../AdminAreaModal';
import type { AuthUser } from '@/types';

const ADMIN_EMAIL = 'admin@example.com';

const usersFixture: AuthUser[] = [
    {
        id: 'user-1',
        email: 'member@example.com',
        displayName: 'Member',
        status: 'pending',
        roles: ['creator'],
        rights: ['assets:own'],
    },
];

function makeJsonResponse(payload: unknown, ok = true): Response {
    return {
        ok,
        json: async () => payload,
    } as Response;
}

function installFetchMock(options?: { loadOk?: boolean; actionOk?: boolean; loadMessage?: string; actionMessage?: string }) {
    const {
        loadOk = true,
        actionOk = true,
        loadMessage = 'Failed to load users.',
        actionMessage = 'Admin action failed.',
    } = options || {};

    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('/api/user/admin/users?')) {
            return makeJsonResponse(
                loadOk
                    ? { success: true, users: usersFixture }
                    : { success: false, message: loadMessage, users: [] },
                loadOk
            );
        }

        if (url === '/api/user/admin/users' && init?.method === 'POST') {
            return makeJsonResponse(
                actionOk
                    ? { success: true }
                    : { success: false, message: actionMessage },
                actionOk
            );
        }

        return makeJsonResponse({});
    });

    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

function getAdminPostBodies(fetchMock: jest.Mock) {
    return fetchMock.mock.calls
        .filter(([input, init]) => String(input) === '/api/user/admin/users' && init?.method === 'POST')
        .map(([, init]) => {
            const rawBody = typeof init?.body === 'string' ? init.body : '{}';
            return JSON.parse(rawBody) as {
                requesterEmail: string;
                targetEmail: string;
                action: string;
                displayName?: string;
                roles?: string[];
                rights?: string[];
            };
        });
}

describe('AdminAreaModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        installFetchMock();
    });

    it('does not render when closed', () => {
        render(
            <AdminAreaModal
                isOpen={false}
                onClose={jest.fn()}
                userId={ADMIN_EMAIL}
                userRoles={['admin']}
            />
        );

        expect(screen.queryByText('Admin Area')).toBeNull();
    });

    it('shows access warning for non-admin users and skips admin API calls', () => {
        const fetchMock = installFetchMock();

        render(
            <AdminAreaModal
                isOpen={true}
                onClose={jest.fn()}
                userId="creator@example.com"
                userRoles={['creator']}
            />
        );

        expect(screen.getByText('Admin access required')).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('loads users, supports refresh, updates display name, and runs approve/reject actions', async () => {
        const fetchMock = installFetchMock();

        render(
            <AdminAreaModal
                isOpen={true}
                onClose={jest.fn()}
                userId={ADMIN_EMAIL}
                userRoles={['admin']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('member@example.com')).toBeInTheDocument();
        });

        const getAdminUserLoads = () =>
            fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/user/admin/users?')).length;

        const initialLoads = getAdminUserLoads();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await waitFor(() => {
            expect(getAdminUserLoads()).toBeGreaterThan(initialLoads);
        });
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Display name')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Display name'), {
            target: { value: 'Renamed Member' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(getAdminPostBodies(fetchMock)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        requesterEmail: ADMIN_EMAIL,
                        targetEmail: 'member@example.com',
                        action: 'set-display-name',
                        displayName: 'Renamed Member',
                    }),
                ])
            );
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        await waitFor(() => {
            expect(getAdminPostBodies(fetchMock)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ action: 'approve', targetEmail: 'member@example.com' }),
                ])
            );
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
        await waitFor(() => {
            expect(getAdminPostBodies(fetchMock)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ action: 'reject', targetEmail: 'member@example.com' }),
                ])
            );
        });
    });

    it('manages roles and rights and applies a role preset', async () => {
        const fetchMock = installFetchMock();

        render(
            <AdminAreaModal
                isOpen={true}
                onClose={jest.fn()}
                userId={ADMIN_EMAIL}
                userRoles={['admin']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('member@example.com')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Rights & Roles/i }));
        expect(screen.getByText('Role Presets')).toBeInTheDocument();
        expect(screen.getByText('users:approve (0)')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('admin, creator'), {
            target: { value: 'admin, reviewer, , ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Roles' }));
        await waitFor(() => {
            expect(getAdminPostBodies(fetchMock)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: 'set-roles',
                        targetEmail: 'member@example.com',
                        roles: ['admin', 'reviewer'],
                    }),
                ])
            );
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Save Rights' })).toBeEnabled();
        });

        fireEvent.change(screen.getByPlaceholderText('users:manage, assets:own'), {
            target: { value: 'users:manage, assets:own, , ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Rights' }));
        await waitFor(() => {
            expect(getAdminPostBodies(fetchMock)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: 'set-rights',
                        targetEmail: 'member@example.com',
                        rights: ['users:manage', 'assets:own'],
                    }),
                ])
            );
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Admin' })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

        await waitFor(() => {
            expect(getAdminPostBodies(fetchMock)).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: 'set-roles',
                        targetEmail: 'member@example.com',
                        roles: ['admin'],
                    }),
                    expect.objectContaining({
                        action: 'set-rights',
                        targetEmail: 'member@example.com',
                        rights: expect.arrayContaining(['users:approve', 'users:manage', 'roles:manage']),
                    }),
                ])
            );
        });
    });

    it('shows backend errors and closes from header and escape key', async () => {
        installFetchMock({
            loadOk: false,
            loadMessage: 'Could not load admin users.',
        });
        const onClose = jest.fn();

        render(
            <AdminAreaModal
                isOpen={true}
                onClose={onClose}
                userId={ADMIN_EMAIL}
                userRoles={['admin']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Could not load admin users.')).toBeInTheDocument();
        });

        fireEvent.keyDown(window, { key: 'Escape' });
        fireEvent.click(screen.getByRole('button', { name: 'Close admin area' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('shows an admin action error when updates fail', async () => {
        installFetchMock({
            actionOk: false,
            actionMessage: 'Action was blocked by policy.',
        });

        render(
            <AdminAreaModal
                isOpen={true}
                onClose={jest.fn()}
                userId={ADMIN_EMAIL}
                userRoles={['admin']}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('member@example.com')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

        await waitFor(() => {
            expect(screen.getByText('Action was blocked by policy.')).toBeInTheDocument();
        });
    });
});
