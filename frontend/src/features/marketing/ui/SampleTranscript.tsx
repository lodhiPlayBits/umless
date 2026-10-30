/** A sample transcript: "um"/"uh"/"mhmm" render as fillers and runs of "·" as pause dots, like a real result. */
export default function SampleTranscript({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\b(?:um|uh|mhmm)\b|·+)/)
  return (
    <p className={className}>
      {parts.map((part, i) =>
        /^(um|uh|mhmm)$/.test(part) ? (
          <mark key={i} className="filler">
            {part}
          </mark>
        ) : /^·+$/.test(part) ? (
          <span key={i} className="pause" aria-label={`${part.length} second pause`}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  )
}
