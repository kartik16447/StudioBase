export class ThemeService {
  /**
   * Calculates RGB values from the primary color and injects them into the document root
   * alongside the specified font to establish the brand theme.
   */
  static applyBrand(brand: any | null) {
    if (!brand) return;
    
    const color = (brand.primaryColor && typeof brand.primaryColor === 'string' && brand.primaryColor.startsWith('#'))
      ? brand.primaryColor
      : '#5E5CE6';

    document.documentElement.style.setProperty('--color-primary', color);
    
    const hex = color.replace('#', '');
    try {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        document.documentElement.style.setProperty('--color-primary-rgb', `${r} ${g} ${b}`);
      } else {
        document.documentElement.style.setProperty('--color-primary-rgb', '94 92 230');
      }
    } catch (e) {
      document.documentElement.style.setProperty('--color-primary-rgb', '94 92 230');
    }
    
    const font = brand.font || 'Inter';
    document.documentElement.style.setProperty('--font-sans', font + ', Inter, system-ui, sans-serif');
  }
}
