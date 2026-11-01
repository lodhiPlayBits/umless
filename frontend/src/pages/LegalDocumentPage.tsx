import type { LegalPageId } from '@/content/business'
import { ContactForm } from '@/features/contact'
import { LegalPage } from '@/features/legal'
import type { PageProps } from '@/pages/types'

export default function LegalDocumentPage({ params }: PageProps) {
  const page = params.page as LegalPageId
  return (
    <>
      <LegalPage page={page} />
      {/* Complaints and suggestions: the Contact page also has a form (docs/api/openapi.yaml sendContactMessage). */}
      {page === 'contact' && <ContactForm />}
    </>
  )
}
