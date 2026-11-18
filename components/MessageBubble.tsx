import type { ChatMessage, CoachingResponse, SafetyResponse } from "@/lib/types";

// Labels are shown in the reply's own language so an Urdu reply has no stray English headings.
const LABELS = {
  en: { steps: "Things you could try" },
  ur: { steps: "آپ یہ کوشش کر سکتے ہیں" },
} as const;

function CoachingCard({ reply }: { reply: CoachingResponse }) {
  return (
    <div
      dir={reply.language === "ur" ? "rtl" : "ltr"}
      lang={reply.language}
      className="max-w-[92%] space-y-3 rounded-2xl rounded-es-sm bg-surface p-4 text-start shadow-sm ring-1 ring-stone-200"
    >
      <p className="font-medium">{reply.acknowledgement}</p>
      <p className="text-stone-600">{reply.understanding}</p>
      <div>
        <p className="mb-1 text-sm font-semibold text-teal-800 dark:text-teal-300">
          {LABELS[reply.language].steps}
        </p>
        <ol className="list-decimal space-y-1 ps-5">
          {reply.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
      <p className="text-stone-700">{reply.encouragement}</p>
      <p className="rounded-lg bg-teal-50 p-3 font-medium text-teal-900">
        {reply.follow_up.question}
      </p>
    </div>
  );
}

/** `pinned` is the copy kept above the input while a conversation is locked. */
export function SafetyCard({ reply, pinned = false }: { reply: SafetyResponse; pinned?: boolean }) {
  const isCrisis = reply.type === "crisis";
  const tone = isCrisis
    ? "bg-red-50 ring-red-300 text-red-950"
    : "bg-amber-50 ring-amber-300 text-amber-950";
  return (
    <div
      // Either way it is announced once: the in-chat card normally, or the pinned panel that
      // replaces it while the conversation is locked.
      role="alert"
      aria-label={pinned ? "Support options" : undefined}
      dir={reply.language === "ur" ? "rtl" : "ltr"}
      lang={reply.language}
      className={`${pinned ? "w-full" : "max-w-[92%]"} space-y-3 rounded-2xl rounded-es-sm p-4 text-start ring-1 ${tone}`}
    >
      <p className="font-semibold">{reply.message}</p>
      <ul className="list-disc space-y-1 ps-5">
        {reply.actions.map((action, i) => (
          <li key={i}>{action}</li>
        ))}
      </ul>
      {reply.follow_up && <p className="font-medium">{reply.follow_up}</p>}
    </div>
  );
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        {/* dir="auto" picks direction from the first strong character, so Urdu,
            English and mixed messages each lay out correctly. */}
        <p
          dir="auto"
          className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-sm bg-teal-700 px-4 py-2 text-start text-white"
        >
          {message.content}
        </p>
      </div>
    );
  }

  const { reply } = message;
  return (
    <div className="flex justify-start">
      {reply.type === "coaching" ? (
        <CoachingCard reply={reply} />
      ) : (
        <SafetyCard reply={reply} />
      )}
    </div>
  );
}
