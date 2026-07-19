export const TOP_TEXT_FONT_FAMILIES = [
    'Inter',
    'Arial',
    'Times New Roman',
    'Courier New',
    'Georgia',
    'Verdana',
    'Impact',
    'Comic Sans MS',
    'Trebuchet MS',
    'Tahoma',
    'Century Gothic',
    'Montserrat',
    'Playfair Display',
    'Oswald',
    'Pacifico',
];

export const TOP_TEXT_FONT_STYLES = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

export type TypographyPreset = {
    id: string;
    /** i18n key for the preset name. */
    labelKey: string;
    fontFamily: string;
    fontWeight: string;
};

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
    { id: 'clean-modern', labelKey: 'typography.cleanModern', fontFamily: 'Inter', fontWeight: '500' },
    { id: 'editorial', labelKey: 'typography.editorial', fontFamily: 'Playfair Display', fontWeight: '700' },
    { id: 'poster', labelKey: 'typography.poster', fontFamily: 'Oswald', fontWeight: '700' },
    { id: 'friendly', labelKey: 'typography.friendly', fontFamily: 'Montserrat', fontWeight: '600' },
    { id: 'handwritten', labelKey: 'typography.handwritten', fontFamily: 'Pacifico', fontWeight: '400' },
];