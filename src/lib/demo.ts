import type { Finding, SafeDocument } from '../types'

const demoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
  <rect width="1240" height="1754" fill="#fffefd"/>
  <rect x="72" y="72" width="1096" height="12" rx="6" fill="#254c3e"/>
  <text x="78" y="154" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#1b2722" letter-spacing="2">ATELIER RIVAGE</text>
  <text x="78" y="198" font-family="Arial, sans-serif" font-size="18" fill="#637169">NOTE DE FRAIS — MAI 2026</text>
  <rect x="78" y="250" width="1084" height="1" fill="#dce1dc"/>
  <text x="78" y="320" font-family="Arial, sans-serif" font-size="16" fill="#728078">COLLABORATRICE</text>
  <text x="78" y="361" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#1b2722">Léa Martin</text>
  <text x="78" y="401" font-family="Arial, sans-serif" font-size="20" fill="#26332d">18 rue des Fleurs, 75011 Paris</text>
  <text x="78" y="438" font-family="Arial, sans-serif" font-size="20" fill="#26332d">lea.martin@example.fr · 06 12 34 56 78</text>

  <rect x="78" y="510" width="1084" height="68" rx="8" fill="#eef1ed"/>
  <text x="104" y="552" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#4b5b53">DATE</text>
  <text x="355" y="552" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#4b5b53">OBJET</text>
  <text x="930" y="552" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#4b5b53">MONTANT</text>

  <g font-family="Arial, sans-serif" font-size="20" fill="#26332d">
    <text x="104" y="638">06/05/2026</text><text x="355" y="638">Train Paris — Lyon</text><text x="930" y="638">128,00 €</text>
    <text x="104" y="708">06/05/2026</text><text x="355" y="708">Déjeuner client</text><text x="930" y="708">74,50 €</text>
    <text x="104" y="778">07/05/2026</text><text x="355" y="778">Hôtel</text><text x="930" y="778">189,00 €</text>
  </g>
  <g stroke="#e3e7e3">
    <line x1="78" y1="663" x2="1162" y2="663"/><line x1="78" y1="733" x2="1162" y2="733"/><line x1="78" y1="803" x2="1162" y2="803"/>
  </g>

  <rect x="78" y="900" width="1084" height="270" rx="12" fill="#f7f8f6" stroke="#dde2de"/>
  <text x="108" y="956" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#66756d">REMBOURSEMENT</text>
  <text x="108" y="1010" font-family="Arial, sans-serif" font-size="20" fill="#26332d">Titulaire : Léa Martin</text>
  <text x="108" y="1056" font-family="Arial, sans-serif" font-size="20" fill="#26332d">IBAN : FR76 3000 6000 0112 3456 7890 189</text>
  <text x="108" y="1102" font-family="Arial, sans-serif" font-size="20" fill="#26332d">Date de naissance : 14/02/1991</text>

  <rect x="78" y="1260" width="1084" height="1" fill="#dce1dc"/>
  <text x="78" y="1328" font-family="Arial, sans-serif" font-size="16" fill="#728078">COMMENTAIRE</text>
  <text x="78" y="1372" font-family="Arial, sans-serif" font-size="20" fill="#26332d">Merci de transmettre une copie au service comptable externe.</text>
  <text x="78" y="1608" font-family="Arial, sans-serif" font-size="16" fill="#98a39d">Document synthétique — aucune donnée réelle</text>
</svg>`

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createDemo(): { document: SafeDocument; findings: Finding[] } {
  const document: SafeDocument = {
    id: `demo-${Date.now()}`,
    name: 'note-de-frais-demo.pdf',
    kind: 'demo',
    size: 184_000,
    createdAt: Date.now(),
    pages: [
      {
        index: 0,
        imageUrl: svgDataUrl(demoSvg),
        width: 1240,
        height: 1754,
      },
    ],
  }

  const definitions: Array<Omit<Finding, 'pageIndex' | 'source' | 'status'>> = [
    {
      id: 'NOM-1-01',
      type: 'name',
      label: 'Nom complet',
      maskedPreview: 'L•• M•••••',
      confidence: 0.91,
      box: { x: 0.06, y: 0.184, width: 0.19, height: 0.027 },
    },
    {
      id: 'ADR-1-02',
      type: 'address',
      label: 'Adresse postale',
      maskedPreview: '18 r••••••',
      confidence: 0.88,
      box: { x: 0.06, y: 0.211, width: 0.39, height: 0.025 },
    },
    {
      id: 'MAIL-1-03',
      type: 'email',
      label: 'Adresse e-mail',
      maskedPreview: 'l•••@example.fr',
      confidence: 0.99,
      box: { x: 0.06, y: 0.233, width: 0.29, height: 0.025 },
    },
    {
      id: 'TEL-1-04',
      type: 'phone',
      label: 'Numéro de téléphone',
      maskedPreview: '06••••••••',
      confidence: 0.97,
      box: { x: 0.372, y: 0.233, width: 0.17, height: 0.025 },
    },
    {
      id: 'IBAN-1-05',
      type: 'iban',
      label: 'Coordonnées bancaires',
      maskedPreview: 'FR76••••••••',
      confidence: 0.99,
      box: { x: 0.187, y: 0.586, width: 0.49, height: 0.027 },
    },
    {
      id: 'DATE-1-06',
      type: 'date',
      label: 'Date de naissance',
      maskedPreview: '14••••••••',
      confidence: 0.83,
      box: { x: 0.31, y: 0.613, width: 0.15, height: 0.026 },
    },
  ]

  return {
    document,
    findings: definitions.map((definition) => ({
      ...definition,
      pageIndex: 0,
      source: 'demo',
      status: 'pending',
    })),
  }
}
