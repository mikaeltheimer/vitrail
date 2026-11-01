import type { NextConfig } from 'next'

// L'accueil est le vitrail. La page de don classique (formulaire mobile) vit sur /don ; les anciens liens
// vers « / » qui la visaient (lien magique ?t=, retour d'annulation ?annule=) y sont renvoyés, paramètres compris.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/', has: [{ type: 'query', key: 't' }], destination: '/don', permanent: false },
      { source: '/', has: [{ type: 'query', key: 'annule' }], destination: '/don', permanent: false },
      { source: '/', destination: '/vitrail', permanent: false },
    ]
  },
}

export default nextConfig
