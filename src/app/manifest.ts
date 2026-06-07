import type { MetadataRoute } from 'next';

// Lets players "Add to Home Screen" and launch the game fullscreen, no browser chrome —
// so it feels like a real app instead of a tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OUROO // ARCADE CORE',
    short_name: 'OUROO',
    description: 'Endless entropy simulation. Harvest crystals, eradicate alien vectors, survive.',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
    ],
  };
}
