import { CONTACT } from '../lib/constants';

/** Caixinha "Suporte via WhatsApp": caixa em cinza com fita, número e o emblema do dragão (recortado da arte enviada). */
export function SupportBox() {
  return (
    <a href={CONTACT.whatsappLink} target="_blank" rel="noopener noreferrer"
      aria-label={`Suporte via WhatsApp: ${CONTACT.whatsappDisplay}`}
      className="group relative block w-full max-w-[250px] pb-7 pr-7 outline-offset-4">
      <div className="relative overflow-visible rounded-xl border-2 border-[#2a2a2a] bg-gradient-to-b from-[#8f9297] to-[#6d7076] shadow-[0_18px_40px_-18px_#000] transition duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_26px_50px_-18px_#B9BEC555]">
        {/* tampa e fita */}
        <div className="h-8 rounded-t-[10px] border-b-2 border-[#2a2a2a] bg-[#7a7d83]" />
        <div className="absolute left-1/2 top-0 h-[34px] w-9 -translate-x-1/2 border-x-2 border-[#2a2a2a] bg-[repeating-linear-gradient(135deg,#f1f2f3_0,#f1f2f3_5px,#c9cbce_5px,#c9cbce_10px)]" />
        <div className="px-4 pb-5 pt-3">
          <div className="font-display text-[17px] font-semibold uppercase leading-tight tracking-wide text-[#161616]">Suporte via<br />WhatsApp</div>
          <div className="mt-3 rounded-md border-2 border-[#2a2a2a] bg-[#a5a8ad] px-2.5 py-1.5 text-[15px] font-semibold tracking-wide text-[#161616]">{CONTACT.whatsappDisplay}</div>
          <div className="mt-2.5 space-y-1.5" aria-hidden>
            <span className="block h-1.5 w-1/3 rounded-full bg-[#2a2a2a]" />
            <span className="block h-1.5 w-3/4 rounded-full bg-[#2a2a2a]" />
          </div>
        </div>
      </div>
      {/* emblema do dragão (círculo recortado da arte original) */}
      <span aria-hidden className="absolute bottom-0 right-0 block h-[82px] w-[82px] rounded-full bg-no-repeat shadow-[0_8px_20px_-6px_#000] ring-2 ring-[#2a2a2a] transition duration-500 group-hover:scale-105"
        style={{ backgroundImage: 'url(/media/suporte.png)', backgroundSize: '168px', backgroundPosition: '-82px -81px' }} />
    </a>
  );
}
