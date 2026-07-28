import { useState, useRef } from 'react';

type Status = 'idle' | 'sending' | 'success' | 'error';

export default function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const loadTimeRef = useRef<number>(Date.now());

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    const form = e.currentTarget;
    const data = {
      name:    (form.elements.namedItem('name')    as HTMLInputElement).value,
      email:   (form.elements.namedItem('email')   as HTMLInputElement).value,
      phone:   (form.elements.namedItem('phone')   as HTMLInputElement).value,
      message: (form.elements.namedItem('message') as HTMLTextAreaElement).value,
      _hp:     (form.elements.namedItem('_hp')     as HTMLInputElement).value,
      _t:      loadTimeRef.current,
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      setStatus('success');
      form.reset();
      loadTimeRef.current = Date.now();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send. Please try again.');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 6,
    color: '#f1f5f9',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  if (status === 'success') {
    return (
      <div style={{ padding: '28px 24px', background: '#0f2a1a', border: '1px solid #166534', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
        <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>Message sent!</p>
        <p style={{ color: '#86efac', fontSize: 14, margin: 0 }}>We'll be in touch shortly. Check your inbox for a confirmation.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Honeypot — hidden from real users, bots fill it */}
      <input
        type="text"
        name="_hp"
        defaultValue=""
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label htmlFor="cf-name" style={labelStyle}>Name *</label>
          <input
            id="cf-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="cf-phone" style={labelStyle}>Phone</label>
          <input
            id="cf-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+61 4xx xxx xxx"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="cf-email" style={labelStyle}>Email *</label>
        <input
          id="cf-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label htmlFor="cf-message" style={labelStyle}>Message *</label>
        <textarea
          id="cf-message"
          name="message"
          required
          rows={4}
          placeholder="Tell us about your project or question…"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
        />
      </div>

      {status === 'error' && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#fca5a5', fontSize: 13 }}>
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          width: '100%',
          padding: '12px 20px',
          background: status === 'sending' ? '#c2410c' : '#7c3aed',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: 15,
          border: 'none',
          borderRadius: 6,
          cursor: status === 'sending' ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
          letterSpacing: '-0.2px',
        }}
      >
        {status === 'sending' ? 'Sending…' : 'Send Message'}
      </button>

      <p style={{ marginTop: 10, fontSize: 11, color: '#475569', textAlign: 'center' }}>
        We'll reply to your email — your address is never shared.
      </p>
    </form>
  );
}
