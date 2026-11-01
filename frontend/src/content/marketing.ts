import type { IconName } from '@/shared/ui'
import { FREE_TRANSCRIPTIONS, PRICING } from './business'

// Copy for the public site (docs/design/v2/landing.html, pricing.html). Every claim here must be
// true of the product today: check backend behaviour before changing one.

/** The default meta description (index.html has the same text for the first paint). */
export const SITE_DESCRIPTION =
  'Practise interview answers out loud. umless shows every um, uh and long pause in your transcript, with your pace.'

export type FeatureItem = { icon: IconName; title: string; body: string }
export type FaqItem = { question: string; answer: string }

/** The transcript in the hero mock. "um"/"uh"/"mhmm" render as fillers, runs of "·" as pauses. */
export const SAMPLE_TRANSCRIPT =
  'So, um, last year I led the move of our billing service to the cloud. ··· The hard part was, uh, keeping it running while we moved. I split it into ·· three stages, and um we shipped with no downtime.'

export const HERO = {
  badge: 'Pause dots show where you hesitate',
  lead: 'Practise interview answers out loud. umless records you, then shows every um, uh and long pause, with your pace, so you hear what your interviewer hears.',
  note: `${FREE_TRANSCRIPTIONS} free transcriptions, no card needed.`,
  mockQuestion: 'Tell me about a time you led a project.',
  mockSummary: ['1:42 total', '138 wpm', 'um ×2 · uh ×1', '2 pauses · longest 3 s'],
}

export const STEPS: FeatureItem[] = [
  { icon: 'list', title: 'Add your questions', body: 'Type the questions you expect, or start with one of our examples.' },
  { icon: 'mic', title: 'Answer out loud', body: "Press record and answer like it's the real thing. Up to 10 minutes." },
  { icon: 'highlight', title: 'See every um', body: 'Get a transcript with fillers highlighted, pauses marked and your pace.' },
]

export const FEATURES: FeatureItem[] = [
  { icon: 'highlight', title: 'Filler words, flagged', body: 'um, uh and mhmm highlighted in your transcript, with a count for each.' },
  { icon: 'dots', title: 'Pauses you can see', body: 'Every pause of a second or more shows as dots, one per second.' },
  { icon: 'gauge', title: 'Your pace', body: 'Words per minute for the whole answer, so you know if you rush.' },
  { icon: 'chart', title: 'One-glance summary', body: 'Total time, pace, fillers and your longest pause, at the top of every result.' },
  { icon: 'history', title: 'Past takes', body: 'Every transcript is saved to your account, so you can compare answers to the same question.' },
  { icon: 'download', title: 'Take it with you', body: 'Download the audio and a .txt transcript of any answer.' },
]

export const PRACTICE_LOOP: { title: string; items: string[] }[] = [
  { title: 'Before you practise', items: ['Write your own questions', 'Check your microphone', 'Pick the next question in a click'] },
  { title: 'While you record', items: ['Live timer and input meter', 'A warning in the last minute', "A note if we can't hear you"] },
  { title: 'After you answer', items: ['Transcript with highlights', 'Summary, replay and downloads', 'Practise again or go to the next question'] },
]

export const PRIVACY = {
  lead: 'Practising out loud is personal. umless keeps as little as it can.',
  points: [
    "Your recording is never stored on our server: it's sent to our speech-to-text provider only to make the transcript.",
    'The provider is told not to keep it for training.',
    'Transcripts are saved to your account, visible only to you, and you can delete any of them.',
  ],
  table: [
    { what: 'Recording', where: 'Stays in your browser' },
    { what: 'Transcript', where: 'Saved to your account' },
    { what: 'Your questions', where: 'Yours to edit or delete' },
  ],
}

export const WORKS_ANYWHERE: FeatureItem[] = [
  { icon: 'monitor', title: 'Desktop browser', body: 'Chrome and Edge on Windows, macOS and Linux.' },
  { icon: 'phone', title: 'Phone browser', body: 'Practise on the go. Big buttons, one column, thumb-friendly.' },
  { icon: 'globe', title: 'Just a link', body: 'Open umless.in, allow the microphone, and start answering.' },
]

export const FAQ: FaqItem[] = [
  { question: 'Which filler words does umless catch?', answer: 'um, uh and mhmm. "Uh-huh" and "uh-uh" mean yes and no, so they count as ordinary words.' },
  { question: 'What do the dots in my transcript mean?', answer: 'Each dot is one second of silence. A pause of three seconds shows as three dots.' },
  {
    question: 'Is my recording stored?',
    answer: "No. Your audio is sent to our speech-to-text provider only to make the transcript, and it isn't kept for training. The transcript is saved to your account. Download the audio if you want to keep it.",
  },
  { question: 'Which browsers work?', answer: 'We build for current Chrome and Edge on desktop, and Chrome on Android. Firefox and Safari should work but are not fully tested yet.' },
  { question: 'How long can an answer be?', answer: "Up to 10 minutes. You'll see a countdown in the last minute." },
  { question: 'Which languages are supported?', answer: 'English for now.' },
]

export const PRICING_FAQ: FaqItem[] = [
  {
    question: 'How is practice time counted?',
    answer: `Each transcription uses one of your ${FREE_TRANSCRIPTIONS} free transcriptions while you have any left. After that, the length of the recording is taken from your practice time. Recording again without transcribing costs nothing.`,
  },
  { question: 'What if no words are heard?', answer: "Then it isn't charged: a recording with no words doesn't use a free transcription or any time." },
  { question: 'Does practice time expire?', answer: 'No. Time you buy stays on your account until you use it.' },
  { question: 'How can I pay?', answer: 'UPI, cards, net banking and wallets, through Razorpay. We never see your card, UPI or bank details.' },
  { question: 'Can I get a refund?', answer: 'Yes, within 3 days of buying a pack, if you haven\'t used any of its practice time: one click in Settings → Billing. Once you use any of it (even one session of a 5-session pack), it can\'t be refunded. See the Refund & Cancellation Policy.' },
]

/** A comparison cell: text, or true for a tick. */
export type CompareCell = string | true
export type CompareRow = { label: string; free: CompareCell; packs: CompareCell[] }

/** Rows of the pricing comparison: what each option includes. */
export function pricingRows(): CompareRow[] {
  const perMinute = (rupees: number, minutes: number) => `₹${(rupees / minutes).toFixed(2)} / min`
  return [
    { label: 'Price', free: '₹0', packs: PRICING.packs.map((p) => p.price) },
    { label: 'Practice', free: `${FREE_TRANSCRIPTIONS} transcriptions`, packs: PRICING.packs.map((p) => `${p.minutes} minutes`) },
    { label: 'Cost per minute', free: '—', packs: PRICING.packs.map((p) => perMinute(p.rupees, p.minutes)) },
    { label: 'Longest answer', free: '10 min', packs: PRICING.packs.map(() => '10 min') },
    { label: 'Fillers, pauses and pace', free: true, packs: PRICING.packs.map((): CompareCell => true) },
    { label: 'Past takes saved', free: true, packs: PRICING.packs.map((): CompareCell => true) },
    { label: 'Download audio and transcript', free: true, packs: PRICING.packs.map((): CompareCell => true) },
    { label: 'Expires', free: 'Never', packs: PRICING.packs.map(() => 'Never') },
  ]
}
