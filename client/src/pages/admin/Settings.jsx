import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Timer, Volume2, Play, Upload, Trash2, Save, KeyRound, Copy, RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { sound } from '../../lib/sound.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLive } from '../../context/LiveContext.jsx';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import { PageHeader } from '../../components/ui/Bits.jsx';

export default function Settings() {
  const { user } = useAuth();
  const { send, state } = useLive();
  const confirm = useConfirm();
  const [s, setS] = useState(null);
  const [meta, setMeta] = useState({ soundEvents: {}, presets: [] });
  const [files, setFiles] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const loadFiles = () => api('/sounds').then((d) => setFiles(d.sounds)).catch(() => {});
  useEffect(() => {
    api('/settings').then((d) => {
      setS(d.settings);
      setMeta({ soundEvents: d.soundEvents, presets: d.presets });
    });
    loadFiles();
  }, []);

  if (!s) return <div className="page-loading"><div className="spinner" /></div>;

  const set = (patch) => {
    setS((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const setSound = (patch) => set({ sound: { ...s.sound, ...patch } });
  const setEvent = (k, patch) => setSound({ events: { ...s.sound.events, [k]: { ...s.sound.events[k], ...patch } } });

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        buzzSeconds: Number(s.buzzSeconds),
        answerSeconds: Number(s.answerSeconds),
        stealSeconds: Number(s.stealSeconds),
        questionsPerBattle: Number(s.questionsPerBattle),
        stealAfterHint: !!s.stealAfterHint,
        sound: s.sound,
      };
      const d = await api('/settings', { method: 'PUT', body });
      setS(d.settings);
      sound.configure(d.settings.sound);
      setDirty(false);
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (f) => {
    if (!f) return;
    const form = new FormData();
    form.append('file', f);
    try {
      await api('/sounds', { method: 'POST', form });
      toast.success('Sound uploaded');
      loadFiles();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const removeFile = async (f) => {
    if (!(await confirm({ title: `Delete ${f.name}?`, message: 'Events using it fall back to their built-in sound.', danger: true, confirmText: 'Delete' }))) return;
    try {
      await api(`/sounds/${encodeURIComponent(f.name)}`, { method: 'DELETE' });
      loadFiles();
      const d = await api('/settings');
      setS(d.settings);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const regenKey = async () => {
    if (!(await confirm({ title: 'Reset buzzer key?', message: 'Podium buzzers using the old link disconnect and need the new link.', confirmText: 'Reset key' }))) return;
    const d = await api('/settings/buzzer-key', { method: 'POST' });
    setS((x) => ({ ...x, buzzerKey: d.buzzerKey }));
    toast.success('New buzzer key generated');
  };
  const reset = async () => {
    const res = await confirm({
      title: 'Archive the current competition?',
      message: 'The competition is archived (its history stays in the database), any unfinished battles are cancelled, and team statuses/scores reset so you can start again. Teams and questions are kept.',
      danger: true,
      confirmText: 'Archive & reset',
      input: { label: 'Type RESET to confirm', match: 'RESET', required: true },
    });
    if (res) send('tournament.reset', { confirm: 'RESET' }, { success: 'Competition archived' }).catch(() => {});
  };

  const buzzUrl = (side) => `${window.location.origin}/buzz/${side}?key=${s.buzzerKey}`;
  const num = (k, min, max) => (
    <input className="input" type="number" min={min} max={max} value={s[k]} onChange={(e) => set({ [k]: e.target.value })} />
  );

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHeader title="Settings & sound" subtitle="Timer and sound changes apply from the next battle / immediately.">
        <button className={`btn primary ${busy ? 'loading' : ''}`} disabled={!dirty || busy} onClick={save}>
          <Save /> Save changes
        </button>
      </PageHeader>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <div className="card">
          <div className="card-title"><h3><Timer size={18} /> Competition rules</h3></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Buzzer window (seconds)</span>{num('buzzSeconds', 3, 60)}</label>
            <label className="field"><span>Answer time after buzz (s)</span>{num('answerSeconds', 3, 60)}</label>
            <label className="field"><span>Opposition steal time (s)</span>{num('stealSeconds', 3, 60)}</label>
            <label className="field"><span>Default questions per battle</span>{num('questionsPerBattle', 1, 30)}</label>
          </div>
          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={s.stealAfterHint} onChange={(e) => set({ stealAfterHint: e.target.checked })} />
            Give the opposition a steal chance after a wrong answer in the hint round too
          </label>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Rules: correct +1 · wrong or no answer → opposition +1 and one steal attempt (+1 if correct) · nobody buzzes → host may reveal one hint and reopen buzzers · nobody buzzes after the hint → skipped, no points.
          </p>
        </div>

        <div className="card">
          <div className="card-title"><h3><KeyRound size={18} /> Podium buzzers</h3></div>
          <p className="small muted">Open these links on a phone or tablet at each podium. Left is always Team A, right is Team B. The server accepts only the first buzz.</p>
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            {['left', 'right'].map((side) => (
              <div key={side} className="row">
                <input className="input sm mono grow" readOnly value={buzzUrl(side)} onFocus={(e) => e.target.select()} />
                <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(buzzUrl(side)); toast.success('Copied'); }}><Copy /></button>
                <a className="btn sm" href={buzzUrl(side)} target="_blank" rel="noreferrer">Open</a>
              </div>
            ))}
          </div>
          <button className="btn sm" style={{ marginTop: 12 }} onClick={regenKey}><RefreshCw /> Reset buzzer key</button>
          <p className="tiny muted" style={{ marginTop: 8 }}>Tip: on the event network, use this computer’s LAN address instead of localhost.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3><Volume2 size={18} /> Sound design</h3>
          <div className="row">
            <button className="btn sm" onClick={() => fileInput.current?.click()}><Upload /> Upload audio</button>
            <input ref={fileInput} type="file" accept="audio/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="row wrap" style={{ gap: 22, marginBottom: 16 }}>
          <label className="check"><input type="checkbox" checked={s.sound.enabled} onChange={(e) => setSound({ enabled: e.target.checked })} /> Sounds enabled</label>
          <label className="check"><input type="checkbox" checked={s.sound.playOnAudience} onChange={(e) => setSound({ playOnAudience: e.target.checked })} /> Play on live screen</label>
          <label className="check"><input type="checkbox" checked={s.sound.playOnHost} onChange={(e) => setSound({ playOnHost: e.target.checked })} /> Play on host laptop</label>
          <label className="row small" style={{ gap: 10 }}>
            Volume
            <input type="range" min={0} max={1} step={0.05} value={s.sound.volume} onChange={(e) => setSound({ volume: Number(e.target.value) })} style={{ width: 160 }} />
            <span className="num muted">{Math.round(s.sound.volume * 100)}%</span>
          </label>
        </div>
        <div className="notice info" style={{ marginBottom: 14 }}>
          Built-in sounds are synthesised in the browser (royalty-free). Only upload audio you own or have a licence for. If the host laptop and projector are in the same room, keep sound on just one of them to avoid echo.
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Event</th><th>Sound</th><th /></tr>
            </thead>
            <tbody>
              {Object.entries(meta.soundEvents).map(([k, ev]) => {
                const cur = s.sound.events[k] ?? { source: 'builtin', preset: ev.preset };
                const value = cur.source === 'custom' ? `custom:${cur.url}` : `builtin:${cur.preset}`;
                return (
                  <tr key={k}>
                    <td style={{ fontWeight: 500 }}>{ev.label}</td>
                    <td>
                      <select
                        className="select sm"
                        style={{ maxWidth: 340 }}
                        value={value}
                        onChange={(e) => {
                          const [src, ...rest] = e.target.value.split(':');
                          const v = rest.join(':');
                          setEvent(k, src === 'custom' ? { source: 'custom', url: v } : { source: 'builtin', preset: v, url: '' });
                        }}
                      >
                        <optgroup label="Built-in">
                          {meta.presets.map((p) => (
                            <option key={p} value={`builtin:${p}`}>{p === ev.preset ? `${p} (default)` : p}</option>
                          ))}
                        </optgroup>
                        {!!files.length && (
                          <optgroup label="Uploaded">
                            {files.map((f) => (
                              <option key={f.url} value={`custom:${f.url}`}>{f.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </td>
                    <td className="right">
                      <button className="btn sm ghost" onClick={() => sound.preview(cur, k, { duration: 3, clicks: 30 })}><Play /> Preview</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!!files.length && (
          <>
            <div className="divider" />
            <div className="small muted" style={{ marginBottom: 8 }}>Uploaded files</div>
            <div className="stack" style={{ gap: 6 }}>
              {files.map((f) => (
                <div key={f.url} className="row small">
                  <button className="btn sm ghost icon" onClick={() => sound.preview({ source: 'custom', url: f.url })}><Play /></button>
                  <span className="grow mono">{f.name}</span>
                  <button className="btn sm ghost icon" onClick={() => removeFile(f)}><Trash2 /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {user?.role === 'admin' && state?.tournament && (
        <div className="card" style={{ borderColor: 'rgba(196, 88, 63,.35)' }}>
          <div className="card-title"><h3 style={{ color: 'var(--red)' }}><AlertTriangle size={18} color="var(--red)" /> Danger zone</h3></div>
          <div className="row wrap between">
            <p className="small muted" style={{ maxWidth: 620 }}>Archive the current competition and reset team statuses for a fresh start (for example after a rehearsal). History is kept; nothing is deleted.</p>
            <button className="btn outline-danger" onClick={reset}><RotateCcw /> Archive & reset competition</button>
          </div>
        </div>
      )}
    </div>
  );
}
