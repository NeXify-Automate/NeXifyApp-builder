/**
 * NeXifyAI Builder - Designer & Medien-Agent
 * Asset-Generierung, Design-System-Erstellung
 */

import { getModelRouter } from '../lib/modelRouter';
import { parseJSONFromText } from '../lib/jsonParser';

export interface DesignSystem {
  theme: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      '2xl': string;
    };
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  assets: string[];
}

export interface ImagePrompt {
  description: string;
  style: string;
  dimensions: string;
  useCase: string;
}

export class Designer {
  private modelRouter = getModelRouter();

  /**
   * Erstellt ein Design-System basierend auf dem Business-Konzept
   */
  async createDesignSystem(
    businessConcept: {
      summary: string;
      targetAudience: string;
      features: string[];
    }
  ): Promise<DesignSystem> {
    const designPrompt = `Erstelle ein vollständiges Design-System für:

Business-Konzept: ${businessConcept.summary}
Zielgruppe: ${businessConcept.targetAudience}
Features: ${businessConcept.features.join(', ')}

Anforderungen:
- Dark Mode (Background: #020408)
- Venlo/EU Style (Premium, Seriös)
- Glassmorphism-Effekte
- Sky Blue Accent (#0EA5E9)
- Inter Font Family

Erstelle ein vollständiges Design-System mit:
1. Farbpalette (Primary, Secondary, Background, Surface, Text, Accent, Success, Warning, Error)
2. Typography (Font Family, Font Sizes)
3. Spacing System
4. Border Radius
5. Asset-Liste (Logos, Icons, Bilder)

Antworte als JSON:
{
  "theme": "NeXify Dark Premium",
  "colors": {
    "primary": "#0EA5E9",
    "secondary": "#94A3B8",
    "background": "#020408",
    "surface": "#0B0F17",
    "text": "#F8FAFC",
    "accent": "#0EA5E9",
    "success": "#10B981",
    "warning": "#F59E0B",
    "error": "#EF4444"
  },
  "typography": { ... },
  "spacing": { ... },
  "borderRadius": { ... },
  "assets": ["logo.png", "hero-bg.png"]
}`;

    const config = this.modelRouter.selectModel('creative', 'medium');
    if (!config) {
      return this.getDefaultDesignSystem();
    }

    try {
      const response = await this.modelRouter.callModel(
        config,
        designPrompt,
        'Du bist ein Design-System-Experte. Erstelle professionelle, konsistente Design-Systeme. Antworte NUR mit validem JSON.'
      );

      const defaultSystem = this.getDefaultDesignSystem();
      
      try {
        const system = parseJSONFromText<DesignSystem>(
          response.content,
          ['theme', 'colors', 'typography', 'spacing', 'borderRadius', 'assets'],
          defaultSystem
        );
        return this.validateDesignSystem(system);
      } catch (error) {
        console.error('Fehler beim Parsen des Design-Systems:', error);
        return defaultSystem;
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des Design-Systems:', error);
    }

    return this.getDefaultDesignSystem();
  }

  /**
   * Erstellt optimierte Image-Prompts für Asset-Generierung
   */
  async generateImagePrompts(
    designSystem: DesignSystem,
    businessConcept: {
      summary: string;
      features: string[];
    }
  ): Promise<ImagePrompt[]> {
    const promptGeneration = `Erstelle optimierte Image-Prompts für die Asset-Generierung:

Design-System: ${JSON.stringify(designSystem.colors)}
Business: ${businessConcept.summary}
Features: ${businessConcept.features.join(', ')}

Erstelle Prompts für:
1. Logo
2. Hero-Bild
3. Feature-Illustrationen
4. Icon-Set

Jeder Prompt sollte enthalten:
- Detaillierte Beschreibung
- Style (z.B. "Modern, Dark, Premium, Glassmorphism")
- Dimensionen
- Use-Case

Antworte als JSON Array:
[
  {
    "description": "...",
    "style": "...",
    "dimensions": "1920x1080",
    "useCase": "hero-background"
  }
]`;

    const config = this.modelRouter.selectModel('creative', 'medium');
    if (!config) {
      return this.getDefaultImagePrompts();
    }

    try {
      const response = await this.modelRouter.callModel(
        config,
        promptGeneration,
        'Du bist ein Creative Director. Erstelle professionelle Image-Prompts. Antworte NUR mit validem JSON.'
      );

      const defaultPrompts = this.getDefaultImagePrompts();
      
      try {
        // Extrahiere JSON-Array (robuster als Regex)
        let arrayStart = response.content.indexOf('[');
        let arrayEnd = response.content.lastIndexOf(']');
        
        if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
          const arrayString = response.content.substring(arrayStart, arrayEnd + 1);
          const parsed = JSON.parse(arrayString);
          
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Validiere Array-Elemente
            return parsed.filter((item: any) => 
              item && 
              typeof item === 'object' && 
              item.description && 
              item.style && 
              item.dimensions && 
              item.useCase
            );
          }
        }
      } catch (error) {
        console.error('Fehler beim Parsen der Image-Prompts:', error);
      }
      
      return defaultPrompts;
    } catch (error) {
      console.error('Fehler beim Generieren von Image-Prompts:', error);
    }

    return this.getDefaultImagePrompts();
  }

  /**
   * Erstellt ein Theme-Config für TailwindCSS
   */
  createTailwindConfig(designSystem: DesignSystem): string {
    return `// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '${designSystem.colors.primary}',
        secondary: '${designSystem.colors.secondary}',
        background: '${designSystem.colors.background}',
        surface: '${designSystem.colors.surface}',
        text: '${designSystem.colors.text}',
        accent: '${designSystem.colors.accent}',
        success: '${designSystem.colors.success}',
        warning: '${designSystem.colors.warning}',
        error: '${designSystem.colors.error}',
      },
      fontFamily: {
        sans: ['${designSystem.typography.fontFamily}', 'sans-serif'],
      },
      fontSize: {
        xs: '${designSystem.typography.fontSize.xs}',
        sm: '${designSystem.typography.fontSize.sm}',
        base: '${designSystem.typography.fontSize.base}',
        lg: '${designSystem.typography.fontSize.lg}',
        xl: '${designSystem.typography.fontSize.xl}',
        '2xl': '${designSystem.typography.fontSize['2xl']}',
      },
      spacing: {
        xs: '${designSystem.spacing.xs}',
        sm: '${designSystem.spacing.sm}',
        md: '${designSystem.spacing.md}',
        lg: '${designSystem.spacing.lg}',
        xl: '${designSystem.spacing.xl}',
      },
      borderRadius: {
        sm: '${designSystem.borderRadius.sm}',
        md: '${designSystem.borderRadius.md}',
        lg: '${designSystem.borderRadius.lg}',
        xl: '${designSystem.borderRadius.xl}',
      },
    },
  },
  plugins: [],
};`;
  }

  /**
   * Validiert und korrigiert ein Design-System
   */
  private validateDesignSystem(system: Partial<DesignSystem>): DesignSystem {
    const defaultSystem = this.getDefaultDesignSystem();

    return {
      theme: system.theme || defaultSystem.theme,
      colors: {
        primary: system.colors?.primary || defaultSystem.colors.primary,
        secondary: system.colors?.secondary || defaultSystem.colors.secondary,
        background: system.colors?.background || defaultSystem.colors.background,
        surface: system.colors?.surface || defaultSystem.colors.surface,
        text: system.colors?.text || defaultSystem.colors.text,
        accent: system.colors?.accent || defaultSystem.colors.accent,
        success: system.colors?.success || defaultSystem.colors.success,
        warning: system.colors?.warning || defaultSystem.colors.warning,
        error: system.colors?.error || defaultSystem.colors.error,
      },
      typography: system.typography || defaultSystem.typography,
      spacing: system.spacing || defaultSystem.spacing,
      borderRadius: system.borderRadius || defaultSystem.borderRadius,
      assets: system.assets || defaultSystem.assets,
    };
  }

  /**
   * Gibt ein Standard-Design-System zurück
   */
  private getDefaultDesignSystem(): DesignSystem {
    return {
      theme: 'NeXify Dark Premium',
      colors: {
        primary: '#0EA5E9',
        secondary: '#94A3B8',
        background: '#020408',
        surface: '#0B0F17',
        text: '#F8FAFC',
        accent: '#0EA5E9',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      typography: {
        fontFamily: 'Inter',
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
        },
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      assets: ['logo.png', 'hero-bg.png', 'feature-illustration.png'],
    };
  }

  /**
   * Generiert echte Images basierend auf Prompts
   */
  async generateImages(
    imagePrompts: ImagePrompt[],
    projectId: string
  ): Promise<Array<{ url: string; useCase: string; fileName: string }>> {
    try {
      const generatedImages = await generateImagesBatch(imagePrompts);
      const savedImages: Array<{ url: string; useCase: string; fileName: string }> = [];

      for (let i = 0; i < generatedImages.length; i++) {
        const image = generatedImages[i];
        const fileName = `image_${image.useCase}_${Date.now()}.${image.url.startsWith('data:image/svg') ? 'svg' : 'png'}`;
        
        const publicUrl = await saveImageToStorage(image, projectId, fileName);
        
        if (publicUrl) {
          savedImages.push({
            url: publicUrl,
            useCase: image.useCase,
            fileName
          });
        }
      }

      return savedImages;
    } catch (error) {
      console.error('Fehler bei Image-Generierung:', error);
      return [];
    }
  }

  /**
   * Gibt Standard-Image-Prompts zurück
   */
  private getDefaultImagePrompts(): ImagePrompt[] {
    return [
      {
        description: 'Modern, minimalist logo with geometric shapes, dark background, sky blue accent',
        style: 'Modern, Dark, Premium, Minimalist',
        dimensions: '512x512',
        useCase: 'logo',
      },
      {
        description: 'Abstract hero background with gradient from dark blue to black, glassmorphism effects, subtle tech patterns',
        style: 'Abstract, Dark, Glassmorphism, Tech',
        dimensions: '1920x1080',
        useCase: 'hero-background',
      },
      {
        description: 'Feature illustration showing modern UI elements, dark theme, premium feel',
        style: 'Illustration, Dark, Modern, Premium',
        dimensions: '800x600',
        useCase: 'feature-illustration',
      },
    ];
  }
}

// Singleton-Instanz
let designerInstance: Designer | null = null;

export function getDesigner(): Designer {
  if (!designerInstance) {
    designerInstance = new Designer();
  }
  return designerInstance;
}

