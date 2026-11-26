import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../components/ui/Modal.jsx';

const ConfirmCtx = createContext(null);

/**
 * const confirm = useConfirm();
 * const res = await confirm({ title, message, confirmText, danger, input: { label, placeholder, required, match } });
 * → false when cancelled, otherwise { value }
 */
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const [value, setValue] = useState('');
  const resolver = useRef(null);

  const confirm = useCallback((opts) => {
    setValue(opts.input?.defaultValue ?? '');
    setReq(opts);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setReq(null);
  };

  const inputOk = !req?.input || ((!req.input.required || value.trim()) && (!req.input.match || value.trim() === req.input.match));

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && (
        <Modal
          title={req.title || 'Are you sure?'}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${req.danger ? 'danger' : 'primary'}`} disabled={!inputOk} onClick={() => close({ value: value.trim() })} autoFocus={!req.input}>
                {req.confirmText || 'Confirm'}
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {req.danger && <AlertTriangle size={22} color="var(--red)" style={{ flexShrink: 0 }} />}
              <div className="muted" style={{ whiteSpace: 'pre-line' }}>
                {req.message}
              </div>
            </div>
            {req.input && (
              <label className="field">
                <span>{req.input.label}</span>
                <input
                  className="input"
                  autoFocus
                  value={value}
                  placeholder={req.input.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && inputOk && close({ value: value.trim() })}
                />
              </label>
            )}
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
