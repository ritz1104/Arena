import { useEffect, useRef, useState } from 'react';
import { animate, motion } from 'framer-motion';

/** Counts smoothly to the new value and pops when it increases. */
export default function AnimatedNumber({ value = 0, duration = 0.8, className, pop = true }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return undefined;
    if (value > from) setBump((b) => b + 1);
    const ctrl = animate(from, value, { duration, ease: 'easeOut', onUpdate: (v) => setDisplay(Math.round(v)) });
    return () => ctrl.stop();
  }, [value, duration]);

  return (
    <motion.span
      key={pop ? bump : 0}
      className={className}
      initial={pop && bump ? { scale: 1.45, filter: 'brightness(1.8)' } : false}
      animate={{ scale: 1, filter: 'brightness(1)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 14 }}
      style={{ display: 'inline-block' }}
    >
      {display}
    </motion.span>
  );
}
