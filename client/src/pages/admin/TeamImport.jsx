import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileText, Trash2, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import { api } from '../../lib/api.js';

const blank = () => ({ teamName: '', members: ['', '', '', ''], extra: [], errors: [] });
const toEditable = (r) => ({ teamName: r.teamName, members: [...r.members.slice(0, 4), '', '', '', ''].slice(0, 4), extra: r.members.slice(4), errors: r.errors });

/**
 * Upload → server parses (PDF/CSV/XLSX) → editable preview with validation →
 * nothing is saved until the admin confirms.
 */
export default function ImportModal({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);

  const upload = async (f) => {
    if (!f) return;
    setFile(f);
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', f);
      const d = await api('/teams/import/preview', { method: 'POST', form });
      setRows(d.rows.map(toEditable));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const update = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, errors: [] } : r)));

  // client-side checks for instant feedback; the server validates again on confirm
  const localErrors = (r, i) => {
    const e = [...r.errors];
    if (!r.teamName.trim()) e.push('Team name is required');
    if (r.extra.length) e.push(`${r.extra.length} extra member(s): ${r.extra.join(', ')} — max 4`);
    const key = r.teamName.trim().toLowerCase();
    if (key && rows.findIndex((x) => x.teamName.trim().toLowerCase() === key) !== i) e.push('Duplicate name in this import');
    return [...new Set(e)];
  };

  const confirmImport = async () => {
    setBusy(true);
    setError('');
    try {
      const teams = rows.map((r) => ({ teamName: r.teamName.trim(), members: r.members.map((m) => m.trim()).filter(Boolean) }));
      const d = await api('/teams/bulk', { method: 'POST', body: { teams } });
      toast.success(`${d.created} teams imported`);
      onDone();
    } catch (e) {
      if (e.data?.rows) setRows((rs) => rs.map((r, i) => ({ ...r, errors: e.data.rows[i]?.errors ?? [] })));
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const errorCount = rows ? rows.filter((r, i) => localErrors(r, i).length).length : 0;

  return (
    <Modal
      title="Import teams"
      size="wide"
      onClose={onClose}
      closeOnBackdrop={!rows}
      footer={
        rows && (
          <>
            <span className="small muted grow">
              {rows.length} team(s) · {errorCount ? <span style={{ color: 'var(--red)' }}>{errorCount} need attention</span> : <span style={{ color: 'var(--green)' }}>all valid</span>}
            </span>
            <button className="btn ghost" onClick={() => setRows(null)}>Choose another file</button>
            <button className={`btn primary ${busy ? 'loading' : ''}`} disabled={!rows.length || errorCount > 0 || busy} onClick={confirmImport}>
              <CheckCircle2 /> Confirm import ({rows.length})
            </button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="stack" style={{ gap: 16 }}>
          <div
            className="card"
            style={{ borderStyle: 'dashed', textAlign: 'center', padding: 40, cursor: 'pointer' }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files?.[0]);
            }}
          >
            {busy ? <div className="spinner" style={{ margin: '0 auto' }} /> : <Upload size={36} color="var(--purple)" />}
            <h4 style={{ marginTop: 12 }}>{busy ? `Reading ${file?.name}…` : 'Drop a file here or click to browse'}</h4>
            <p className="muted small" style={{ marginTop: 6 }}>PDF, CSV or Excel (.xlsx) · max 5 MB</p>
            <input ref={input} type="file" hidden accept=".pdf,.csv,.xlsx" onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          {error && <div className="notice danger"><AlertCircle /> {error}</div>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <div className="card tight small">
              <b><FileText size={14} /> CSV / Excel</b>
              <p className="muted" style={{ marginTop: 6 }}>
                Header row like <span className="mono">Team Name, Member 1, Member 2, Member 3, Member 4</span>. One-row-per-member files (<span className="mono">Team, Member</span>) are merged automatically.
              </p>
            </div>
            <div className="card tight small">
              <b><FileText size={14} /> PDF</b>
              <p className="muted" style={{ marginTop: 6 }}>
                Text PDFs with lines like <span className="mono">Team Alpha: Ravi, Priya</span>, blocks like <span className="mono">Team Name: Alpha</span> + <span className="mono">Member 1: Ravi</span>, or tables.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="notice info">
            Review the extracted data from <b>{file?.name}</b>. Edit anything that looks wrong — nothing is saved until you confirm.
          </div>
          {error && <div className="notice danger"><AlertCircle /> {error}</div>}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team name</th>
                  <th>Member 1</th>
                  <th>Member 2</th>
                  <th>Member 3</th>
                  <th>Member 4</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const errs = localErrors(r, i);
                  return [
                    <tr key={`r${i}`} className={errs.length ? 'error-row' : ''}>
                      <td className="muted small">{i + 1}</td>
                      <td style={{ minWidth: 180 }}>
                        <input className={`input sm ${!r.teamName.trim() ? 'invalid' : ''}`} value={r.teamName} onChange={(e) => update(i, { teamName: e.target.value })} />
                      </td>
                      {r.members.map((m, j) => (
                        <td key={j} style={{ minWidth: 130 }}>
                          <input className="input sm" value={m} onChange={(e) => update(i, { members: r.members.map((x, k) => (k === j ? e.target.value : x)) })} />
                        </td>
                      ))}
                      <td>
                        <button className="btn ghost icon sm" title="Remove row" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}>
                          <Trash2 />
                        </button>
                      </td>
                    </tr>,
                    errs.length ? (
                      <tr key={`e${i}`} className="error-row">
                        <td />
                        <td colSpan={6} className="small" style={{ color: '#E9B3A5', paddingTop: 0 }}>
                          <AlertCircle size={13} /> {errs.join(' · ')}
                          {!!r.extra.length && (
                            <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => update(i, { extra: [] })}>
                              Drop extra members
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((rs) => [...rs, blank()])}>
            <Plus /> Add row
          </button>
        </div>
      )}
    </Modal>
  );
}
