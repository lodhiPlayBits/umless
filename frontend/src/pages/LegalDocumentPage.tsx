import type { LegalPageId } from '@/content/business'
import { LegalPage } from '@/features/legal'
import type { PageProps } from '@/pages/types'

export default function LegalDocumentPage({ params }: PageProps) {
  return <LegalPage page={params.page as LegalPageId} />
}
