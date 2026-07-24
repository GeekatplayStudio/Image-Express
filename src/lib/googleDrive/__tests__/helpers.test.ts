/** @jest-environment node */
import {
  escapeDriveQueryValue,
  inferTypeFromFilenameAndMime,
  mapDriveFileToAsset,
  normalizeOwner,
  toBooleanString,
} from '../helpers';

describe('googleDrive helpers', () => {
  describe('normalizeOwner', () => {
    it('returns the trimmed owner when present', () => {
      expect(normalizeOwner('  Alice  ')).toBe('Alice');
    });
    it('falls back to Guest for empty or missing values', () => {
      expect(normalizeOwner('   ')).toBe('Guest');
      expect(normalizeOwner(undefined)).toBe('Guest');
    });
  });

  describe('toBooleanString', () => {
    it('maps booleans to string literals', () => {
      expect(toBooleanString(true)).toBe('true');
      expect(toBooleanString(false)).toBe('false');
    });
  });

  describe('escapeDriveQueryValue', () => {
    it('escapes single quotes for Drive query safety', () => {
      expect(escapeDriveQueryValue("O'Brien")).toBe("O\\'Brien");
    });
  });

  describe('inferTypeFromFilenameAndMime', () => {
    it('prefers mime type when it is specific', () => {
      expect(inferTypeFromFilenameAndMime('clip.bin', 'video/mp4')).toBe('videos');
      expect(inferTypeFromFilenameAndMime('sound.bin', 'audio/mpeg')).toBe('audio');
      expect(inferTypeFromFilenameAndMime('mesh.bin', 'model/gltf-binary')).toBe('models');
      expect(inferTypeFromFilenameAndMime('pic.bin', 'image/png')).toBe('images');
    });
    it('falls back to the file extension when mime is generic', () => {
      const octet = 'application/octet-stream';
      expect(inferTypeFromFilenameAndMime('movie.MOV', octet)).toBe('videos');
      expect(inferTypeFromFilenameAndMime('track.flac', octet)).toBe('audio');
      expect(inferTypeFromFilenameAndMime('model.glb', octet)).toBe('models');
      expect(inferTypeFromFilenameAndMime('unknown.xyz', octet)).toBe('images');
    });
  });

  describe('mapDriveFileToAsset', () => {
    it('returns null when id or name is missing', () => {
      expect(mapDriveFileToAsset({ name: 'x' })).toBeNull();
      expect(mapDriveFileToAsset({ id: '1' })).toBeNull();
    });

    it('maps app properties onto the asset record', () => {
      const record = mapDriveFileToAsset({
        id: 'file-1',
        name: 'render.png',
        mimeType: 'image/png',
        createdTime: '2026-01-01T00:00:00.000Z',
        modifiedTime: '2026-02-01T00:00:00.000Z',
        appProperties: {
          iexOwner: 'Bob',
          iexAssetCategory: 'generated',
          iexAssetType: 'images',
          iexIsPublic: 'true',
        },
      });
      expect(record).toMatchObject({
        id: 'file-1',
        name: 'render.png',
        type: 'images',
        category: 'generated',
        owner: 'Bob',
        isPublic: true,
        mimeType: 'image/png',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      });
    });

    it('defaults category to uploads and infers type when unspecified', () => {
      const record = mapDriveFileToAsset({
        id: 'file-2',
        name: 'clip.mp4',
        mimeType: 'application/octet-stream',
      });
      expect(record?.category).toBe('uploads');
      expect(record?.type).toBe('videos');
      expect(record?.owner).toBe('Guest');
      expect(record?.isPublic).toBe(false);
    });
  });
});
