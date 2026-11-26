import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Upload, Search, Pencil, Trash2, HelpCircle, Eye, EyeOff, Tag, AlertCircle, CheckCircle2, Layers } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import { PageHeader, Empty } from '../../components/ui/Bits.jsx';
import Modal from '../../components/ui/Modal.jsx';

const DIFFS = ['Easy', 'Medium', 'Hard'];
const DIFF_COLOR = { Easy: 'var(--green)', Medium: 'var(--orange)', Hard: 'var(--red)' };
const parseRounds = (s) => [...new Set(String(s).split(/[,\s]+/).map((x) => Number.parseInt(x, 10)).filter((n) => n > 0 && n < 100))];

function QuestionForm({ q, categories, onClose, onSaved }) {
  const [f, setF] = useState({
    questionText: q?.questionText ?? '',
    category: q?.category?._id ?? categories[0]?.id ?? '',
    hint: q?.hint ?? '',
    correctAnswer: q?.correctAnswer ?? '',
    explanation: q?.explanation ?? '',
    difficulty: q?.difficulty ?? 'Medium',
    isActive: q?.isActive ?? true,
    rounds: (q?.rounds ?? []).join(', '),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { ...f, rounds: parseRounds(f.rounds) };
      if (q) await api(`/questions/${q._id}`, { method: 'PUT', body });
      else await api('/questions', { method: 'POST', body });
      toast.success(q ? 'Question updated' : 'Question added');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={q ? 'Edit question' : 'Add question'}
      size="medium"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className={`btn primary ${busy ? 'loading' : ''}`} disabled={!f.questionText.trim() || !f.correctAnswer.trim() || !f.category || busy} onClick={save}>
            Save question
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Question *</span>
          <textarea className="textarea" value={f.questionText} onChange={set('questionText')} maxLength={1000} autoFocus />
        </label>
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <label className="field">
            <span>Category *</span>
            <select className="select" value={f.category} onChange={set('category')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Difficulty</span>
            <select className="select" value={f.difficulty} onChange={set('difficulty')}>
              {DIFFS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Correct answer * (admin only until revealed)</span>
          <input className="input" value={f.correctAnswer} onChange={set('correctAnswer')} maxLength={500} />
        </label>
        <label className="field">
          <span>Hint (one per question)</span>
          <input className="input" value={f.hint} onChange={set('hint')} maxLength={500} />
        </label>
        <label className="field">
          <span>Explanation (optional, shown with the answer)</span>
          <input className="input" value={f.explanation} onChange={set('explanation')} maxLength={1000} />
        </label>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
          <label className="field">
            <span>Only for rounds (blank = any round)</span>
            <input className="input" value={f.rounds} onChange={set('rounds')} placeholder="e.g. 1, 2" />
          </label>
          <label className="check" style={{ height: 42 }}>
            <input type="checkbox" checked={f.isActive} onChange={set('isActive')} /> Active (can be drawn into battles)
          </label>
        </div>
        {error && <div className="notice danger">{error}</div>}
      </div>
    </Modal>
  );
}

function CategoryModal({ categories, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#CC8B65');
  const confirm = useConfirm();
  const add = async () => {
    try {
      await api('/categories', { method: 'POST', body: { name, color } });
      setName('');
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async (c) => {
    if (!(await confirm({ title: `Delete ${c.name}?`, danger: true, message: 'Only empty categories can be deleted.', confirmText: 'Delete' }))) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <Modal title="Question categories" onClose={onClose}>
      <div className="stack">
        {categories.map((c) => (
          <div key={c.id} className="row">
            <span className="team-dot" style={{ background: c.color }} />
            <span className="grow">{c.name}</span>
            <span className="small muted">{c.count} questions</span>
            <button className="btn ghost icon sm" disabled={c.count > 0} onClick={() => remove(c)} title={c.count ? 'Category has questions' : 'Delete'}>
              <Trash2 />
            </button>
          </div>
        ))}
        <div className="divider" />
        <div className="row">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 42, height: 42, border: 0, background: 'none' }} />
          <input className="input grow" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" disabled={!name.trim()} onClick={add}><Plus /> Add</button>
        </div>
      </div>
    </Modal>
  );
}

function QuestionImport({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const upload = async (f) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', f);
      const d = await api('/questions/import/preview', { method: 'POST', form });
      setRows(d.rows);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const valid = rows?.filter((r) => !r.errors.length) ?? [];
  const confirmImport = async () => {
    setBusy(true);
    try {
      const d = await api('/questions/bulk', { method: 'POST', body: { rows: valid } });
      toast.success(`${d.created} questions imported`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Import questions"
      size="wide"
      onClose={onClose}
      footer={
        rows && (
          <>
            <span className="small muted grow">{valid.length} valid · {rows.length - valid.length} with errors (skipped)</span>
            <button className="btn ghost" onClick={() => setRows(null)}>Choose another file</button>
            <button className={`btn primary ${busy ? 'loading' : ''}`} disabled={!valid.length || busy} onClick={confirmImport}>
              <CheckCircle2 /> Import {valid.length} questions
            </button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="stack">
          <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center', padding: 40, cursor: 'pointer' }} onClick={() => input.current?.click()}>
            {busy ? <div className="spinner" style={{ margin: '0 auto' }} /> : <Upload size={36} color="var(--purple)" />}
            <h4 style={{ marginTop: 12 }}>Choose a CSV or Excel file</h4>
            <p className="muted small" style={{ marginTop: 6 }}>
              Columns: <span className="mono">Question, Category, Hint, Answer, Difficulty, Explanation, Rounds</span> (Question and Answer required)
            </p>
            <input ref={input} type="file" hidden accept=".csv,.xlsx" onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          {error && <div className="notice danger"><AlertCircle /> {error}</div>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Question</th><th>Category</th><th>Answer</th><th>Hint</th><th>Difficulty</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row} className={r.errors.length ? 'error-row' : ''}>
                  <td className="muted">{r.row}</td>
                  <td style={{ maxWidth: 320 }}>{r.questionText}</td>
                  <td>{r.category}</td>
                  <td>{r.correctAnswer}</td>
                  <td className="small muted">{r.hint}</td>
                  <td>{r.difficulty}</td>
                  <td className="small">
                    {r.errors.length ? <span style={{ color: 'var(--red)' }}>{r.errors.join('; ')}</span> : r.warnings.length ? <span style={{ color: 'var(--orange)' }}>{r.warnings.join('; ')}</span> : <span style={{ color: 'var(--green)' }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Questions() {
  const confirm = useConfirm();
  const [questions, setQuestions] = useState(null);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ category: '', difficulty: '', search: '', active: '' });
  const [modal, setModal] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [selected, setSelected] = useState([]);

  const loadCats = () => api('/categories').then((d) => setCategories(d.categories));
  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api(`/questions?${q}`).then((d) => setQuestions(d.questions)).catch((e) => toast.error(e.message));
    api('/questions/stats').then(setStats).catch(() => {});
  }, [filters]);

  useEffect(() => {
    loadCats();
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const toggleActive = async (q) => {
    try {
      await api(`/questions/${q._id}/active`, { method: 'PATCH', body: { isActive: !q.isActive } });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async (q) => {
    if (!(await confirm({ title: 'Delete question?', message: q.questionText, danger: true, confirmText: 'Delete' }))) return;
    try {
      await api(`/questions/${q._id}`, { method: 'DELETE' });
      toast.success('Question deleted');
      load();
      loadCats();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const assignRounds = async () => {
    const res = await confirm({
      title: `Assign ${selected.length} question(s) to rounds`,
      message: 'These questions will only be drawn in the listed rounds. Leave blank to allow any round.',
      confirmText: 'Assign',
      input: { label: 'Round numbers', placeholder: 'e.g. 1, 2' },
    });
    if (!res) return;
    try {
      await api('/questions/assign-rounds', { method: 'POST', body: { ids: selected, rounds: parseRounds(res.value) } });
      toast.success('Rounds assigned');
      setSelected([]);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Questions" subtitle={stats ? `${stats.total} questions · ${stats.active} active · ${stats.availableNow} unused in this competition` : 'Loading…'}>
        <button className="btn" onClick={() => setModal({ type: 'cats' })}><Tag /> Categories</button>
        <button className="btn" onClick={() => setModal({ type: 'import' })}><Upload /> Import CSV / Excel</button>
        <button className="btn primary" disabled={!categories.length} onClick={() => setModal({ type: 'form' })}><Plus /> Add question</button>
      </PageHeader>

      <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
        <button className={`chip ${!filters.category ? 'on' : ''}`} onClick={() => setFilter('category', '')}>All categories</button>
        {categories.map((c) => (
          <button key={c.id} className={`chip ${filters.category === c.id ? 'on' : ''}`} onClick={() => setFilter('category', c.id)}>
            <span className="team-dot" style={{ background: c.color, width: 8, height: 8 }} /> {c.name} <span className="muted tiny">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <div className="search grow" style={{ maxWidth: 340 }}>
          <Search />
          <input className="input" placeholder="Search questions…" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
        </div>
        <select className="select" style={{ width: 160 }} value={filters.difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}>
          <option value="">Any difficulty</option>
          {DIFFS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={filters.active} onChange={(e) => setFilter('active', e.target.value)}>
          <option value="">Active + inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <button className="btn" onClick={() => setShowAnswers((v) => !v)}>
          {showAnswers ? <EyeOff /> : <Eye />} {showAnswers ? 'Hide answers' : 'Show answers'}
        </button>
        {!!selected.length && (
          <button className="btn warn" onClick={assignRounds}><Layers /> Assign {selected.length} to rounds</button>
        )}
      </div>

      {questions && !questions.length && (
        <div className="card"><Empty icon={HelpCircle} title="No questions found">Add questions or import a spreadsheet.</Empty></div>
      )}
      {!!questions?.length && (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={selected.length === questions.length} onChange={(e) => setSelected(e.target.checked ? questions.map((q) => q._id) : [])} />
                </th>
                <th>Question</th>
                <th>Category</th>
                <th>Difficulty</th>
                <th>Rounds</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q._id} style={{ opacity: q.isActive ? 1 : 0.5 }}>
                  <td>
                    <input type="checkbox" checked={selected.includes(q._id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, q._id] : s.filter((x) => x !== q._id)))} />
                  </td>
                  <td style={{ maxWidth: 520 }}>
                    <div style={{ fontWeight: 500 }}>{q.questionText}</div>
                    {showAnswers && (
                      <div className="small" style={{ marginTop: 4 }}>
                        <span style={{ color: 'var(--green)' }}>✓ {q.correctAnswer}</span>
                        {q.hint && <span className="muted"> · Hint: {q.hint}</span>}
                      </div>
                    )}
                  </td>
                  <td><span className="badge" style={{ '--c': q.category?.color, textTransform: 'none', letterSpacing: 0 }}>{q.category?.name}</span></td>
                  <td><span style={{ color: DIFF_COLOR[q.difficulty], fontWeight: 600, fontSize: 13 }}>{q.difficulty}</span></td>
                  <td className="small muted">{q.rounds?.length ? q.rounds.join(', ') : 'Any'}</td>
                  <td>
                    {q.used ? <span className="badge completed">Used</span> : q.isActive ? <span className="badge active">Ready</span> : <span className="badge">Inactive</span>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn ghost icon sm" title={q.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(q)}>{q.isActive ? <EyeOff /> : <Eye />}</button>
                      <button className="btn ghost icon sm" title="Edit" onClick={() => setModal({ type: 'form', q })}><Pencil /></button>
                      <button className="btn ghost icon sm" title="Delete" onClick={() => remove(q)}><Trash2 /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'form' && <QuestionForm q={modal.q} categories={categories} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); loadCats(); }} />}
      {modal?.type === 'cats' && <CategoryModal categories={categories} onClose={() => setModal(null)} onChanged={loadCats} />}
      {modal?.type === 'import' && <QuestionImport onClose={() => setModal(null)} onDone={() => { setModal(null); load(); loadCats(); }} />}
    </div>
  );
}
