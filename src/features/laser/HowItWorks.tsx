

/** Wood for the laser is sold at the checkout: a small reminder with a photo. Visitors only. */
/** Three steps for someone who has never seen the page. */
export function HowItWorks() {
  const step = (n: number, text: string) => (
    <li className="flex items-center gap-1.5">
      <span className="w-5 h-5 shrink-0 bg-brand-black text-white text-xs font-semibold flex items-center justify-center">{n}</span>{text}
    </li>
  );
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
      {step(1, 'Find your cut')}{step(2, 'Tap it')}{step(3, 'Pay at checkout')}
    </ol>
  );
}
