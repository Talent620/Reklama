/**
 * Renders a `LandingPage` spec into a real, responsive, conversion-oriented
 * page. Server component — no client JS except the tiny tracking snippet.
 */
import type { LandingPage, LandingSection } from "@/lib/engine/types";

export function LandingRenderer({ page }: { page: LandingPage }) {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <TrackingSnippet variant={page.variant} />
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

/**
 * Consent-gated analytics implementing Google Consent Mode v2 semantics.
 *
 * Per EEA requirements (enforced since 2024/2025), advertising tags must not
 * collect/transmit personal data until the user grants consent, and must carry
 * the v2 signals `ad_user_data` and `ad_personalization`. Until consent is
 * given we only buffer a non-personal page_view locally; on "Accept" we set
 * granted defaults and flush. On "Reject" nothing personal is sent.
 * See docs/RESEARCH.md for citations.
 */
function TrackingSnippet({ variant }: { variant: string }) {
  const script = `
    (function(){
      var KEY='reklama_consent', sent={}, consent=localStorage.getItem(KEY);
      // Consent Mode v2 default: everything denied until the user decides.
      var state={ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'};
      function apply(v){ state.ad_user_data=v; state.ad_personalization=v; state.analytics_storage=v; }
      function track(name){
        if(state.analytics_storage!=='granted') return; // gated
        try{ navigator.sendBeacon('/api/track', JSON.stringify({event:name,variant:'${variant}',consent:state,ts:Date.now()})); }catch(e){}
      }
      function start(){
        track('page_view');
        document.addEventListener('click',function(e){var t=e.target.closest('[data-track]'); if(t) track(t.getAttribute('data-track'));});
        document.addEventListener('submit',function(e){var t=e.target.closest('[data-track]'); if(t) track(t.getAttribute('data-track'));});
        window.addEventListener('scroll',function(){var p=(scrollY+innerHeight)/document.body.scrollHeight;
          if(p>0.5&&!sent.s50){sent.s50=1;track('scroll_50');} if(p>0.9&&!sent.s90){sent.s90=1;track('scroll_90');}},{passive:true});
      }
      function banner(){
        var b=document.createElement('div');
        b.style.cssText='position:fixed;left:0;right:0;bottom:0;background:#0f172a;color:#fff;padding:14px 16px;display:flex;gap:12px;align-items:center;justify-content:center;font:14px sans-serif;z-index:9999;flex-wrap:wrap';
        b.innerHTML='<span>We use consent-based analytics (GDPR / Consent Mode v2).</span>';
        function mk(label,val){var x=document.createElement('button');x.textContent=label;x.style.cssText='padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-weight:600;'+(val==='granted'?'background:#6366f1;color:#fff':'background:#334155;color:#fff');x.onclick=function(){localStorage.setItem(KEY,val);apply(val);b.remove();if(val==='granted')start();};return x;}
        b.appendChild(mk('Reject','denied')); b.appendChild(mk('Accept','granted'));
        document.body.appendChild(b);
      }
      if(consent==='granted'){apply('granted');start();}
      else if(consent==='denied'){apply('denied');}
      else { if(document.readyState!=='loading') banner(); else document.addEventListener('DOMContentLoaded',banner); }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
