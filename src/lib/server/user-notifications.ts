import path from 'path';
import { promises as fs } from 'fs';

const LOG_DIR = path.join(process.cwd(), 'logs');
const APPROVAL_LOG = path.join(LOG_DIR, 'approval-requests.log');
const PASSWORD_RESET_LOG = path.join(LOG_DIR, 'password-reset.log');

const APPROVER_EMAIL = (process.env.IMAGE_EXPRESS_ADMIN_EMAIL || '').trim() || 'admin@local';

async function ensureLogDir() {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
    } catch {
        // noop
    }
}

async function appendLog(filePath: string, line: string) {
    await ensureLogDir();
    await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

async function sendViaResend(params: { to: string; subject: string; text: string }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) return false;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from,
                to: [params.to],
                subject: params.subject,
                text: params.text
            })
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function notifyRegistrationApprovalRequest(params: { email: string; displayName: string }) {
    const timestamp = new Date().toISOString();
    const { email, displayName } = params;
    const subject = `Approval required: ${email}`;
    const body = `New registration pending approval.\n\nEmail: ${email}\nDisplay name: ${displayName}\nTime: ${timestamp}\nApprover: ${APPROVER_EMAIL}`;
    const sent = await sendViaResend({ to: APPROVER_EMAIL, subject, text: body });
    const source = sent ? 'email+log' : 'log-only';
    await appendLog(APPROVAL_LOG, `[${timestamp}] mode="${source}" approver="${APPROVER_EMAIL}" email="${email}" displayName="${displayName.replace(/"/g, "'")}"`);
}

export async function notifyPasswordResetToken(params: { email: string; token: string; expiresAt: string }) {
    const timestamp = new Date().toISOString();
    const { email, token, expiresAt } = params;
    const subject = `Password reset code for ${email}`;
    const body = `Password reset request.\n\nEmail: ${email}\nToken: ${token}\nExpires at: ${expiresAt}\nRequested at: ${timestamp}`;
    const sent = await sendViaResend({ to: email, subject, text: body });
    const source = sent ? 'email+log' : 'log-only';
    await appendLog(PASSWORD_RESET_LOG, `[${timestamp}] mode="${source}" email="${email}" token="${token}" expiresAt="${expiresAt}"`);
}
