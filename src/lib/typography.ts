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
    label: string;
    fontFamily: string;
    fontWeight: string;
};

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
    { id: 'clean-modern', label: 'Clean Modern', fontFamily: 'Inter', fontWeight: '500' },
    { id: 'editorial', label: 'Editorial', fontFamily: 'Playfair Display', fontWeight: '700' },
    { id: 'poster', label: 'Poster', fontFamily: 'Oswald', fontWeight: '700' },
    { id: 'friendly', label: 'Friendly', fontFamily: 'Montserrat', fontWeight: '600' },
    { id: 'handwritten', label: 'Handwritten', fontFamily: 'Pacifico', fontWeight: '400' },
];