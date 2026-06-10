/**
 * Renders a `LandingPage` spec into a real, responsive, conversion-oriented
 * page. Server component — no client JS except the tiny tracking snippet.
 */
import type { LandingPage, LandingSection } from "@/lib/engine/types";

export function LandingRenderer({ page }: { page: LandingPage }) {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <TrackingSnippet events={page.trackedEvents} variant={page.variant} />
      <div className="mx-auto max-w-3xl px-6 py-16">
        {page.sections.map((s, i) => (
          <Section key={i} section={s} first={i === 0} />
        ))}
        <footer className="mt-16 border-t border-slate-200 pt-6 text-xs text-slate-400">
          <p>
            Variant {page.variant} · consent-based analytics · GDPR-compliant. This is an
            auto-generated landing page from the Reklama growth engine.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Section({ section, first }: { section: LandingSection; first: boolean }) {
  switch (section.kind) {
    case "hero":
      return (
        <header className="mb-14 text-center">
          <h1 className="text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">{section.heading}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">{section.body}</p>
          <a href="#form" data-track="cta_click" className="mt-8 inline-block rounded-lg bg-indigo-600 px-7 py-3 text-base font-semibold text-white hover:bg-indigo-700">
            Get started →
          </a>
        </header>
      );
    case "benefits":
      return (
        <section className="mb-14">
          <h2 className="mb-6 text-center text-2xl font-bold">{section.heading}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {section.items?.map((it, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">{it}</div>
            ))}
          </div>
        </section>
      );
    case "social_proof":
      return (
        <section className="mb-14 rounded-2xl bg-slate-900 px-6 py-10 text-center text-white">
          <h2 className="mb-6 text-xl font-semibold">{section.heading}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {section.items?.map((it, i) => (
              <blockquote key={i} className="text-sm text-slate-200">{it}</blockquote>
            ))}
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="mb-14">
          <h2 className="mb-6 text-center text-2xl font-bold">{section.heading}</h2>
          <div className="space-y-3">
            {section.items?.map((it, i) => {
              const [q, ...a] = it.split("—");
              return (
                <details key={i} className="rounded-lg border border-slate-200 p-4">
                  <summary className="cursor-pointer font-medium">{q.trim()}</summary>
                  <p className="mt-2 text-sm text-slate-600">{a.join("—").trim()}</p>
                </details>
              );
            })}
          </div>
        </section>
      );
    case "form":
      return (
        <section id="form" className="mb-14 rounded-2xl border border-slate-200 bg-slate-50 p-8">
          <h2 className="mb-1 text-2xl font-bold">{section.heading}</h2>
          <p className="mb-6 text-sm text-slate-600">{section.body}</p>
          <form data-track="form_submit" className="space-y-3">
            {section.items?.map((field) => (
              <input key={field} name={field} placeholder={fieldLabel(field)} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm" />
            ))}
            <label className="flex items-start gap-2 text-xs text-slate-500">
              <input type="checkbox" required className="mt-0.5" />
              <span>I agree to the privacy policy and consent to being contacted (GDPR).</span>
            </label>
            <button type="submit" className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
              Submit
            </button>
          </form>
        </section>
      );
    case "cta":
      return (
        <section className="mb-6 text-center">
          <h2 className="mb-4 text-2xl font-bold">{section.heading}</h2>
          <a href="#form" data-track="cta_click" className="inline-block rounded-lg bg-indigo-600 px-7 py-3 text-base font-semibold text-white hover:bg-indigo-700">
            Get started →
          </a>
        </section>
      );
    default:
      return first ? null : null;
  }
}

function fieldLabel(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Minimal, consent-gated analytics: posts tracked events to /api/track. */
function TrackingSnippet({ events, variant }: { events: string[]; variant: string }) {
  const script = `
    (function(){
      var sent = {};
      function track(name, meta){
        try { navigator.sendBeacon('/api/track', JSON.stringify({event:name, variant:'${variant}', meta:meta||{}, ts:Date.now()})); } catch(e){}
      }
      track('page_view');
      document.addEventListener('click', function(e){
        var t = e.target.closest('[data-track]');
        if (t) track(t.getAttribute('data-track'));
      });
      document.addEventListener('submit', function(e){
        var t = e.target.closest('[data-track]');
        if (t) track(t.getAttribute('data-track'));
      });
      window.addEventListener('scroll', function(){
        var p = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
        if (p > 0.5 && !sent['s50']) { sent['s50']=1; track('scroll_50'); }
        if (p > 0.9 && !sent['s90']) { sent['s90']=1; track('scroll_90'); }
      }, {passive:true});
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
