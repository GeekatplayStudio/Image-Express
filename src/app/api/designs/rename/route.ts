import { NextResponse } from 'next/server';
import { access, rename } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { getDesignsDir } from '@/lib/server/appPaths';

function sanitizeDesignName(name: string) {
    const cleaned = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || 'untitled-design';
}

async function exists(filepath: string) {
    try {
        await access(filepath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    try {
        const { id, name } = await request.json();
        const designId = String(id || '').trim();
        const designName = String(name || '').trim();

        if (!designId || !designName) {
            return NextResponse.json({ success: false, message: 'id and name are required.' }, { status: 400 });
        }
        if (designId.includes('/') || designId.includes('\\') || designId.includes('..')) {
            return NextResponse.json({ success: false, message: 'Invalid design id.' }, { status: 400 });
        }

        const designsDir = getDesignsDir();
        const oldJsonPath = path.join(designsDir, `${designId}.json`);
        const oldPngPath = path.join(designsDir, `${designId}.png`);

        const hasJson = await exists(oldJsonPath);
        if (!hasJson) {
            return NextResponse.json({ success: false, message: 'Design not found.' }, { status: 404 });
        }

        const base = sanitizeDesignName(designName);
        let nextId = `${base}-${Date.now()}`;
        let newJsonPath = path.join(designsDir, `${nextId}.json`);

        while (await exists(newJsonPath)) {
            nextId = `${base}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            newJsonPath = path.join(designsDir, `${nextId}.json`);
        }

        const newPngPath = path.join(designsDir, `${nextId}.png`);
        await rename(oldJsonPath, newJsonPath);
        if (await exists(oldPngPath)) {
            await rename(oldPngPath, newPngPath);
        }

        return NextResponse.json({
            success: true,
            design: {
                id: nextId,
                name: designName,
                data: `/api/assets/serve/designs/${nextId}.json`,
                image: `/api/assets/serve/designs/${nextId}.png`,
                lastModified: Date.now()
            }
        });
    } catch (error) {
        console.error('Rename design error:', error);
        return NextResponse.json({ success: false, message: 'Failed to rename design.' }, { status: 500 });
    }
}
