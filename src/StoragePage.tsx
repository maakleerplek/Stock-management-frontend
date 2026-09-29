import { useCallback, useEffect, useState } from 'react';
import { Archive, CalendarPlus, Check, Home, Loader2, PackageCheck, ScanBarcode, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import { cn } from './lib/utils';
import { storageApi, type StoreResult, type StoredItem, type StorageStatus } from './lib/storageApi';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const input = 'w-full h-10 px-3 border border-lijn bg-white text-sm';
const label = 'text-xs font-semibold text-brand-black/60 block mb-1';
// Same rule as EMAIL_RE in laser/storage.py.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function Confirm({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-brand-black">
      <input type="checkbox" className="mt-1 shrink-0" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export default function StoragePage() {
  const { isVolunteerMode } = useVolunteer();
  const [config, setConfig] = useState<{ spot: string; days: number; graceDays: number } | null>(null);

  useEffect(() => {
    storageApi.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-lijn min-h-full">
        <StorePanel spot={config?.spot} days={config?.days ?? 90} />
        <div className="divide-y divide-lijn">
          <YourItemPanel days={config?.days ?? 90} />
          {isVolunteerMode && <VolunteerPanel />}
        </div>
      </div>
    </div>
  );
}

function StorePanel({ spot, days }: { spot?: string; days: number }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', content: '' });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StoreResult | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      setResult(await storageApi.store(form));
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Could not store the item', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <section className="p-4 sm:p-6 space-y-5">
        <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2 border-b border-lijn pb-3">
          <Archive size={18} /> Your storage code
        </h2>
        <div className="flex items-center gap-5 border border-lijn bg-white p-4">
          <QRCodeSVG value={result.code} size={112} />
          <div>
            <div className="text-4xl font-mono font-bold text-brand-black">{result.code}</div>
            <div className="text-sm text-grafiet mt-1">Kept until {formatDate(result.expires)}</div>
          </div>
        </div>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-brand-black">
          <li>Take a piece of coloured tape.</li>
          <li>
            Write on it: <strong>{form.firstName} {form.lastName}</strong>, <strong>{formatDate(result.created)}</strong> and{' '}
            <strong className="font-mono">{result.code}</strong>.
          </li>
          <li>Stick the tape on your item.</li>
          <li>Put the item on {result.spot}.</li>
        </ol>
        <p className="text-sm text-grafiet">
          To take it home, scan the code at the barcode scanner of the checkout, or fill in the code and your
          e-mail under "Take it home" on this page. We also sent the code to {form.email}.
        </p>
        <button
          className="brutalist-button px-4 h-10 bg-white text-sm font-semibold"
          onClick={() => { setResult(null); setForm({ firstName: '', lastName: '', email: '', content: '' }); setAgreed(false); }}
        >
          Store something else
        </button>
      </section>
    );
  }

  const emailOk = EMAIL_RE.test(form.email.trim());
  const complete = form.firstName.trim() && form.lastName.trim() && emailOk && form.content.trim() && agreed;

  return (
    <section className="p-4 sm:p-6 space-y-5">
      <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2 border-b border-lijn pb-3">
        <Archive size={18} /> Store something in the cellar
      </h2>
      <p className="text-sm text-grafiet">
        You can leave a project or material in the cellar for {days} days.
        {spot && <> It goes on {spot}.</>}
      </p>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (complete) submit(); }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="st-first">First name</label>
            <input id="st-first" className={input} value={form.firstName} onChange={set('firstName')} maxLength={80} autoComplete="given-name" />
          </div>
          <div>
            <label className={label} htmlFor="st-last">Last name</label>
            <input id="st-last" className={input} value={form.lastName} onChange={set('lastName')} maxLength={80} autoComplete="family-name" />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="st-email">E-mail</label>
          <input id="st-email" type="email" className={input} value={form.email} onChange={set('email')} maxLength={200} autoComplete="email" />
          {form.email.trim() && !emailOk && <p className="text-xs text-rose-600 mt-1">Fill in a valid e-mail address.</p>}
        </div>
        <div>
          <label className={label} htmlFor="st-content">What do you store?</label>
          <textarea
            id="st-content"
            className="w-full min-h-24 px-3 py-2 border border-lijn bg-white text-sm"
            value={form.content}
            onChange={set('content')}
            maxLength={1000}
            placeholder="e.g. a wooden box with a half-built robot, 2 plywood sheets"
          />
        </div>
        <div className="border border-lijn bg-white p-3">
          <Confirm checked={agreed} onChange={setAgreed}>
            I tape my name, the date and the code on it. No food or chemicals. I collect or extend it within {days} days.
          </Confirm>
        </div>
        <button
          type="submit"
          disabled={!complete || busy}
          className="brutalist-button px-4 h-10 bg-brand-black text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Store
        </button>
      </form>
    </section>
  );
}

type Done = { kind: 'extended'; code: string; expires: string } | { kind: 'checked_out'; code: string };

function YourItemPanel({ days }: { days: number }) {
  const { addToast } = useToast();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [haveIt, setHaveIt] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<'checkout' | 'extend' | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const filled = code.trim() !== '' && EMAIL_RE.test(email.trim());

  const run = async (action: 'checkout' | 'extend') => {
    setBusy(action);
    try {
      if (action === 'checkout') {
        const r = await storageApi.checkout(code.trim(), email.trim());
        setDone({ kind: 'checked_out', code: r.code });
      } else {
        const r = await storageApi.extendWithCode(code.trim(), email.trim());
        setDone({ kind: 'extended', ...r });
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'That did not work', 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setDone(null); setCode(''); setEmail(''); setHaveIt(false); setChecked(false);
  };

  return (
    <section className="p-4 sm:p-6 space-y-4">
      <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2 border-b border-lijn pb-3">
        <PackageCheck size={18} /> Take it home or keep it longer
      </h2>

      {done ? (
        <div className="space-y-3">
          <div className="border border-lijn bg-emerald-50 p-4 text-sm text-brand-black space-y-1">
            {done.kind === 'checked_out' ? (
              <div><strong className="font-mono">{done.code}</strong> is no longer in storage. You can take it home.</div>
            ) : (
              <>
                <div><strong className="font-mono">{done.code}</strong> is kept until <strong>{formatDate(done.expires)}</strong>.</div>
              </>
            )}
          </div>
          <button className="brutalist-button px-4 h-10 bg-white text-sm font-semibold" onClick={reset}>Done</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-grafiet flex gap-2">
            <ScanBarcode size={16} className="shrink-0 mt-0.5" />
            <span>
              Taking your item home? Scan the code on the tape at the barcode scanner of the checkout,
              or fill in the code and your e-mail here. Either way the item leaves the stock system.
              Keeping it longer works like a library: extend it here, at HTL, before the date runs out.
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="ex-code">Code on the tape</label>
              <input id="ex-code" className={cn(input, 'font-mono uppercase')} value={code} onChange={e => setCode(e.target.value)} placeholder="K-042" />
            </div>
            <div>
              <label className={label} htmlFor="ex-email">Your e-mail</label>
              <input id="ex-email" type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-lijn bg-white p-3 space-y-3 flex flex-col">
              <div className="text-sm font-semibold flex items-center gap-2"><Home size={14} /> Take it home</div>
              <Confirm checked={haveIt} onChange={setHaveIt}>
                I have the item with me. After this it is no longer stored, and anything left behind may be removed.
              </Confirm>
              <button
                disabled={!filled || !haveIt || busy !== null}
                onClick={() => run('checkout')}
                className="mt-auto brutalist-button px-4 h-10 bg-brand-black text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {busy === 'checkout' ? <Loader2 size={14} className="animate-spin" /> : <Home size={14} />} Take it home
              </button>
            </div>
            <div className="border border-lijn bg-white p-3 space-y-3 flex flex-col">
              <div className="text-sm font-semibold flex items-center gap-2"><CalendarPlus size={14} /> Keep it longer</div>
              <Confirm checked={checked} onChange={setChecked}>
                I am at HTL and my item is still on the shelf. It is kept {days} days from today.
              </Confirm>
              <button
                disabled={!filled || !checked || busy !== null}
                onClick={() => run('extend')}
                className="mt-auto brutalist-button px-4 h-10 bg-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {busy === 'extend' ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />} Extend
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

const STATUS: Record<StorageStatus, { text: string; className: string }> = {
  ok: { text: 'Stored', className: 'text-grafiet' },
  expired: { text: 'Expired, mail pending', className: 'text-amber-600' },
  reminded: { text: 'Reminder sent', className: 'text-amber-600' },
  may_remove: { text: 'May be removed', className: 'text-rose-600' },
};

function VolunteerPanel() {
  const { addToast } = useToast();
  const [items, setItems] = useState<StoredItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    storageApi.list()
      .then(d => setItems(d.items))
      .catch(e => addToast(e instanceof Error ? e.message : 'Could not load storage', 'error'));
  }, [addToast]);

  useEffect(load, [load]);

  const act = async (code: string, action: () => Promise<unknown>, done: string) => {
    setBusy(code);
    try {
      await action();
      addToast(done, 'success');
      load();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="p-4 sm:p-6 space-y-4">
      <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2 border-b border-lijn pb-3">
        <PackageCheck size={18} /> In the cellar
        {items && <span className="text-xs font-normal text-grafiet">({items.length})</span>}
      </h2>
      {items === null && <Loader2 size={16} className="animate-spin text-grafiet" />}
      {items?.length === 0 && <p className="text-sm text-grafiet">Nothing stored.</p>}
      <div className="space-y-2">
        {items?.map(it => (
          <div key={it.code} className="border border-lijn bg-white p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  <span className="font-mono">{it.code}</span> · {it.firstName} {it.lastName}
                </div>
                <div className="text-xs text-grafiet truncate">{it.email}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={cn('text-xs font-semibold', STATUS[it.status].className)}>{STATUS[it.status].text}</div>
                <div className="text-[10px] text-grafiet">
                  {formatDate(it.created)} → {formatDate(it.expires)}
                </div>
              </div>
            </div>
            <div className="text-sm text-brand-black whitespace-pre-wrap">{it.content}</div>
            <div className="flex gap-2">
              <button
                disabled={busy === it.code}
                className="brutalist-button px-3 py-1.5 bg-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                onClick={() => act(it.code, () => storageApi.pickup(it.code, 'picked_up'), `${it.code} picked up`)}
              >
                <PackageCheck size={12} /> Picked up
              </button>
              <button
                disabled={busy === it.code}
                className="brutalist-button px-3 py-1.5 bg-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                onClick={() => act(it.code, () => storageApi.adminExtend(it.code), `${it.code} extended`)}
              >
                <CalendarPlus size={12} /> Extend
              </button>
              {it.status === 'may_remove' && (
                <button
                  disabled={busy === it.code}
                  className="brutalist-button px-3 py-1.5 bg-rose-50 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  onClick={() => act(it.code, () => storageApi.pickup(it.code, 'removed'), `${it.code} removed`)}
                >
                  <Trash2 size={12} /> Removed
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
